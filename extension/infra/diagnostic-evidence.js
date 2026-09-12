import { summarizeAuditDays, validAuditDate } from '../core/quota-audit.js';
import { getQuotaCalendarContext } from '../core/quota-state-facts.js';
import { getEffectiveQuotaForDate } from '../core/quota-config.js';
import { logClientEvent, getClientLogLossCounters, noteClientLogLoss } from './client-logs.js';
import { budgetedSessionSet } from './session-storage-budget.js';

const QUEUES = [
  ['usage', 'segment_sync_outbox_v1', 'dirtySegmentIds', 'usage_segments_v1'],
  ['daily', 'stats_sync_outbox_v1', 'dirtyDates'],
  ['hourly', 'hourly_stats_sync_outbox_v1', 'dirtyHourKeys'],
  ['target', 'target_stats_sync_outbox_v1', 'dirtyDates'],
  ['hourlyTarget', 'hourly_target_stats_sync_outbox_v1', 'dirtyHourKeys'],
  ['media', 'media_segment_sync_outbox_v1', 'pendingIds', 'media_segments_v1'],
  ['dailyMedia', 'media_stats_sync_outbox_v1', 'dirtyDates'],
  ['hourlyMedia', 'hourly_media_stats_sync_outbox_v1', 'dirtyHourKeys'],
];
const META = 'diagnostic_health_state_v1';
const DIAGNOSTIC_KEYS = [...QUEUES.flatMap(([, key, , raw]) => raw ? [key, raw] : [key]),
  'usage_stats_history_synced_through_date_v1', 'cloud_usage_upload_backoff_v1', 'cloud_media_upload_backoff_v1',
  'site_classification_requests_v1', 'client_logs_v1'];
const numeric = value => value != null && Number.isFinite(Number(value)) ? Number(value) : null;
const states = state => Object.fromEntries(['onlineLocked', 'studyLocked', 'restLocked', 'undeterminedLocked', 'dailyRestLocked', 'weeklyRestLocked']
  .map(key => [key, typeof state?.[key] === 'boolean' ? state[key] : null]));
const usageFields = usage => Object.fromEntries(['totalSeconds', 'onlineSeconds', 'studySeconds', 'restSeconds', 'undeterminedSeconds', 'compositeSeconds', 'weekRestSeconds']
  .map(key => [key, numeric(usage?.[key])]));
let lastQuotaEvaluation = null;
let healthBusy = false;
let denialBusy = false;

// Capture exactly what the existing evaluator used, without recalculating quota.
export function rememberQuotaEvaluation({ usage, localState, newState, calendar, cloudFact, cloudApplied }) {
  try {
    lastQuotaEvaluation = { evaluatedAt: Date.now(), evaluationDate: calendar.date, evaluationWeekStart: calendar.weekStart,
      localUsage: usageFields(usage), localState: states(localState), finalState: states(newState),
      cloudUsage: usageFields(cloudFact?.usage), cloudDate: cloudFact?.date || null,
      cloudComputedAt: numeric(cloudFact?.computedAt), cloudReceivedAt: numeric(cloudFact?.receivedAt), cloudState: states(cloudFact?.state), cloudApplied: cloudApplied === true };
  } catch (_) { lastQuotaEvaluation = null; }
}

export function buildSyncHealth(data) {
  const queues = QUEUES.map(([kind, key, listKey, rawKey]) => {
    if (!data || (data[key] && !Array.isArray(data[key][listKey])) ||
        (rawKey && data[rawKey] && (typeof data[rawKey] !== 'object' || Object.values(data[rawKey]).some(row => !row || typeof row !== 'object')))) {
      return { kind, pending: null, oldestDate: null, dates: null, orphanIds: null };
    }
    const ids = data[key]?.[listKey] || [];
    const idSet = new Set(ids);
    const unconfirmed = rawKey ? Object.values(data[rawKey] || {}).filter(row => !row.uploadedAt) : [];
    const dates = [...new Set(ids.map(id => rawKey ? data[rawKey]?.[id]?.date : String(id).slice(0, 10)).filter(validAuditDate))].sort();
    return { kind, pending: ids.length, oldestDate: dates[0] || null, dates: dates.slice(0, 7).join(','),
      datesTruncated: dates.length > 7, orphanIds: rawKey ? ids.filter(id => !data[rawKey]?.[id]).length : null,
      unconfirmedRaw: rawKey ? unconfirmed.length : null,
      untrackedRaw: rawKey ? unconfirmed.filter(row => !idSet.has(row.id)).length : null };
  });
  const requests = data?.site_classification_requests_v1;
  const pending = Array.isArray(requests) ? requests.filter(r => r.status === 'pending' && ['pending', 'failed', 'local_only', null, undefined].includes(r.syncStatus)) : [];
  const pendingTimes = pending.map(r => Number(r.createdAt || r.requestedAt)).filter(n => Number.isFinite(n) && n > 0);
  queues.push({ kind: 'classification', pending: !data || (requests && !Array.isArray(requests)) ? null : pending.length,
    oldestDate: pendingTimes.length ? new Date(Math.min(...pendingTimes) + 8 * 3600000).toISOString().slice(0, 10) : null,
    dates: null, orphanIds: null });
  return { readStatus: data ? 'ok' : 'unknown', queues,
    confirmedThrough: validAuditDate(data?.usage_stats_history_synced_through_date_v1) ? data.usage_stats_history_synced_through_date_v1 : null,
    confirmationMeaning: 'historical_date_watermark_not_proof_all_current_ids_uploaded',
    usageRetryAt: numeric(data?.cloud_usage_upload_backoff_v1?.nextRetryAt),
    mediaRetryAt: numeric(data?.cloud_media_upload_backoff_v1?.nextRetryAt),
  };
}

export async function recordSyncHealth({ failed = false } = {}) {
  if (healthBusy) return null;
  healthBusy = true;
  try {
    const data = await chrome.storage.local.get(DIAGNOSTIC_KEYS).catch(() => null);
    const summary = buildSyncHealth(data);
    const sessionLogs = await chrome.storage.session.get('client_logs_session_v1').catch(() => null);
    const logsKnown = data && sessionLogs;
    const logs = logsKnown ? [...(data.client_logs_v1 || []), ...(sessionLogs.client_logs_session_v1 || [])]
      .filter(log => ['pending', 'failed'].includes(log.uploadStatus)) : [];
    summary.queues.push({ kind: 'clientLogs', pending: logsKnown ? logs.length : null,
      exhausted: logsKnown ? logs.filter(log => Number(log.uploadAttempts || 0) >= 5).length : null });
    const state = summary.readStatus === 'unknown' || summary.queues.some(q => q.pending === null) ? 'unknown'
      : failed ? 'failed' : summary.queues.some(q => q.pending > 0 || q.unconfirmedRaw > 0) ? 'backlog' : 'confirmed';
    const previous = (await chrome.storage.session.get(META))[META] || {};
    if (previous.state !== state || Date.now() - (previous.at || 0) >= 15 * 60000) {
      const result = await logClientEvent({ level: 'info', category: 'cloud', eventCode: 'sync_health_summary',
        message: 'Upload health snapshot', details: { ...summary, state, capturedAt: Date.now(), losses: await getClientLogLossCounters() } });
      if (result.ok && result.logId) await budgetedSessionSet({ [META]: { state, at: Date.now() } }, { priority: 'diagnostic', source: 'sync_health' });
    }
    return { state };
  } catch (_) { return { state: 'unknown' }; }
  finally { healthBusy = false; }
}

export async function recordQuotaDenial({ auditId, reason, config, decisionUsage = null }) {
  if (denialBusy) { noteClientLogLoss(); return; }
  denialBusy = true;
  try {
    const at = Date.now(), calendar = getQuotaCalendarContext(at);
    const evaluation = lastQuotaEvaluation;
    const decisionLocks = states(config?.quotaState);
    const quota = getEffectiveQuotaForDate(config, calendar.date).todayEffectiveQuota;
    const daily = await chrome.storage.local.get('daily_usage_stats_v1').catch(() => null);
    const days = daily ? summarizeAuditDays(daily.daily_usage_stats_v1, calendar.weekStart, calendar.date) : null;
    await logClientEvent({ level: 'info', category: 'access', eventCode: 'quota_denial_evidence', message: 'Access denied with quota evidence',
      details: { auditId, reason, decisionAt: at, configVersion: numeric(config?.version),
        date: calendar.date, weekStart: calendar.weekStart,
        dayRestLimitMinutes: quota.restMinutes, weekRestLimitMinutes: quota.weeklyRestMinutes,
        dayCompositeLimitMinutes: quota.compositeMinutes, dayStudyLimitMinutes: quota.studyMinutes, dayOnlineLimitMinutes: quota.onlineMinutes,
        decisionLocks, decisionUsage: usageFields(decisionUsage),
        ...(evaluation || { evaluatedAt: null }),
        bucketReadAt: Date.now(), bucketReadStatus: daily ? 'ok' : 'unknown', days,
      } });
  } catch (_) { /* Diagnostics cannot affect access decisions. */ }
  finally { denialBusy = false; }
}

import { readNativeHostDiagnosticState } from './native-host-client.js';
import { readSharedWebDiagnosticState } from './shared-web-contribution-sync.js';

export const SHARED_SYNC_DIAGNOSTICS_MESSAGE = 'TIMEONCHROME_SHARED_SYNC_DIAGNOSTICS_READ';
const integer = v => Number.isSafeInteger(v) && v >= 0 ? v : null;
const boolean = v => typeof v === 'boolean' ? v : null;
const knownErrors = new Set(['native_host_unavailable', 'native_port_disconnected', 'native_response_timeout',
  'native_invalid_response', 'native_post_failed', 'runtime_service_unavailable', 'heartbeat_build_failed',
  'shared_web_not_prepared', 'shared_web_disabled', 'shared_web_identity_changed', 'shared_web_native_rejected',
  'shared_web_binding_unavailable', 'shared_web_watermark_unavailable', 'shared_web_stale', 'shared_web_upload_unavailable',
  'shared_web_sync_unavailable', 'shared_web_basis_unavailable', 'shared_web_replacement_context_changed',
  'shared_web_binding_expired', 'shared_web_local_version_changed', 'shared_web_local_read_failed',
  'shared_web_invalid_watermark', 'shared_web_invalid_ack', 'shared_web_context_unavailable',
  'shared_web_queue_size_limit', 'shared_web_statistics_invalid', 'shared_web_queue_content_conflict',
  'shared_web_ordinal_exhausted', 'shared_web_native_unavailable', 'shared_web_unsupported',
  'shared_web_connection_changed', 'shared_web_busy', 'shared_web_invalid_request']);
const errorCode = v => v == null ? null : knownErrors.has(v) ? v : 'unknown';
const dateKey = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const stages = ['local_context', 'local_projection', 'native_replace', 'cloud_capabilities',
  'cloud_watermark', 'source_binding', 'cloud_upload', 'cloud_ack', 'local_preparation'];
const capabilities = ['application-usage-read', 'shared-quota-state-read', 'shared-web-contribution-sync-v1',
  'shared-access-policy-identity-read', 'shared-quota-execution-preparation-read-v1', 'shared-browser-activity-v1',
  'shared-reminder-lifecycle-v1', 'shared-reminder-continuity-v1', 'shared-web-local-lease-v1'];
function projectedCoverage(value) {
  const bucketNames = ['study', 'composite', 'rest', 'other', 'unknown'];
  const fields = ['allBucketMs', 'knownBucketMs', 'unknownBucketMs', 'unknownBucketKeyCount'];
  const c = value?.corrections;
  if (!value || fields.some(k => integer(value[k]) === null) || !c
    || ['requestedCount', 'appliedCount', 'rejectedCount'].some(k => integer(c[k]) === null)
    || c.requestedCount !== c.appliedCount + c.rejectedCount || !Array.isArray(c.flows) || c.flows.length > 25
    || value.allBucketMs !== value.knownBucketMs + value.unknownBucketMs
    || c.flows.some(v => !bucketNames.includes(v?.from) || !bucketNames.includes(v?.to)
      || integer(v.count) === null || integer(v.requestedSeconds) === null)) return null;
  const failures = Object.fromEntries(['local_day_missing', 'original_bucket_too_small', 'unknown'].map(k => [k, integer(c.failures?.[k])]));
  if (Object.values(failures).some(v => v === null) || Object.values(failures).reduce((a,b) => a+b, 0) !== c.rejectedCount
    || c.flows.reduce((sum, v) => sum + v.count, 0) !== c.requestedCount) return null;
  return { ...Object.fromEntries(fields.map(k => [k, value[k]])), corrections: {
    requestedCount: c.requestedCount, appliedCount: c.appliedCount, rejectedCount: c.rejectedCount,
    flows: c.flows.map(v => ({ from: v.from, to: v.to, count: v.count, requestedSeconds: v.requestedSeconds })), failures } };
}
function samePolicy(identity, cached) {
  if (!identity || !cached?.policy || identity.schemaVersion !== 1
    || typeof identity.policyHash !== 'string' || !/^[a-f0-9]{64}$/.test(identity.policyHash)
    || typeof cached.policyHash !== 'string' || !/^[a-f0-9]{64}$/.test(cached.policyHash)
    || typeof identity.revision !== 'string' || !/^profile-config:\d{1,16}$/.test(identity.revision)
    || typeof cached.policy.revision !== 'string' || !/^profile-config:\d{1,16}$/.test(cached.policy.revision)
    || integer(identity.effectiveAtMs) === null || integer(cached.policy.effectiveAtMs) === null
    || !['legacy', 'shadow', 'shared'].includes(identity.stage) || !['legacy', 'shadow', 'shared'].includes(cached.policy.stage)) return null;
  return identity.schemaVersion === 1 && identity.policyHash === cached.policyHash
    && identity.revision === cached.policy.revision && identity.stage === cached.policy.stage
    && identity.effectiveAtMs === cached.policy.effectiveAtMs;
}

export function buildSharedSyncDiagnostics(stored = {}, native = {}, live = {}, now = Date.now(), version = null) {
  const q = stored.shared_web_contribution_queue_v1, p = stored.shared_access_policy_lkg_v1;
  const rawHistory = stored.shared_web_sync_diagnostics_v1, host = stored.local_guardian_status_v1;
  const historyCurrent = live.cacheScopeCurrent === true && typeof q?.scopeHash === 'string' && rawHistory?.scopeHash === q.scopeHash
    && samePolicy(rawHistory?.policyIdentity, p) === true;
  const history = historyCurrent ? rawHistory : null;
  const today = new Date(now + 28800000).toISOString().slice(0, 10);
  const midnight = Date.parse(`${today}T00:00:00Z`);
  const monday = new Date(midnight - ((new Date(midnight).getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
  const days = [];
  for (let t = Date.parse(`${monday}T00:00:00Z`); t <= midnight; t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10), item = q?.days?.[date], u = item?.upload;
    const cachedCoverage = history?.coverageByDate?.[date];
    const coverage = cachedCoverage?.revisionOrdinal === u?.revisionOrdinal && cachedCoverage?.contentHash === u?.contentHash ? cachedCoverage : null;
    const values = ['study', 'composite', 'rest'].map(k => integer(u?.bucketsMs?.[k]));
    const total = values.every(v => v !== null) ? values.reduce((a, b) => a + b, 0) : null;
    days.push({ date, present: !!item, revision: integer(u?.revisionOrdinal), complete: boolean(u?.complete),
      storedBucketCoverageBeforeCorrections: { allBucketMs: integer(coverage?.allBucketMs), knownBucketMs: integer(coverage?.knownBucketMs),
        unknownBucketKeyCount: integer(coverage?.unknownBucketKeyCount) },
      bucketCoverageAfterCorrections: projectedCoverage(coverage?.afterCorrections),
      reasonCodes: Array.isArray(u?.reasonCodes) ? [...new Set(u.reasonCodes.slice(0, 32).map(v =>
        ['LOCAL_STATISTICS_MISSING', 'LOCAL_STATISTICS_INCOMPLETE', 'LOCAL_BUCKETS_INCOMPLETE'].includes(v) ? v : 'UNKNOWN_REASON'))] : null,
      activeMs: integer(u?.activeMs), bucketTotalMs: total, otherMs: integer(u?.otherMs),
      cloudConfirmedHistorical: live.cacheScopeCurrent === true ? boolean(item?.cloudConfirmed) : null,
      nativeConfirmedCurrent: boolean(live.currentNativeConfirmedByDate?.[date]),
      nativeAckAtMsCurrent: integer(live.currentNativeAckAtMsByDate?.[date]),
      nativeAcceptedHistorical: boolean(item?.nativeAccepted),
      policyMatchesCurrentCache: samePolicy(u?.policyIdentity, p),
      cloudAckAtMs: history?.cloudAckVersionsByDate?.[date]?.revisionOrdinal === u?.revisionOrdinal
        && history?.cloudAckVersionsByDate?.[date]?.contentHash === u?.contentHash
        ? integer(history?.cloudAckAtMsByDate?.[date]) : null,
      failures: integer(item?.failures), lastErrorCode: errorCode(item?.lastErrorCode), nextRetryAtMs: integer(item?.nextRetryAtMs) });
  }
  return { observedAtMs: now, version: typeof version === 'string' && /^[0-9.]{1,32}$/.test(version) ? version : null,
    connection: { connectedCurrent: boolean(native.connected), protocolVersion: integer(native.protocolVersion),
      capabilities: Array.isArray(native.capabilities) ? capabilities.filter(v => native.capabilities.includes(v)) : null,
      applicationUsageSupported: boolean(native.applicationUsageSupported), lastSuccessAtMsHistorical: integer(host?.lastSuccessAt),
      lastErrorCodeHistorical: errorCode(host?.lastErrorCode),
      responseRejection: native.lastResponseRejection ? {
        atMs: integer(native.lastResponseRejection.atMs),
        serviceErrorCode: ['BROWSER_BRIDGE_MESSAGE_REJECTED', 'RUNTIME_SERVICE_UNAVAILABLE',
          'NATIVE_ENVELOPE_REJECTED', 'NATIVE_MESSAGE_INVALID'].includes(native.lastResponseRejection.serviceErrorCode)
          ? native.lastResponseRejection.serviceErrorCode : null,
        reason: ['service_message_rejected', 'service_unavailable', 'negative_response', 'received_at_invalid',
          'snapshot_stale', 'snapshot_revision_mismatch', 'application_request_mismatch', 'application_payload_missing'].includes(native.lastResponseRejection.reason)
          ? native.lastResponseRejection.reason : 'unknown',
        messageType: ['heartbeat', 'probe', 'dailyUsageSnapshot', 'getApplicationUsage', 'settledUsageSegments',
          'getSharedQuotaState', 'reportReminderResult', 'getSharedReminderState', 'acknowledgeSharedReminderDelivery',
          'resolveSharedReminder', 'reportBrowserActivity', 'acknowledgeBrowserExecution', 'getSharedWebSourceChallenge',
          'bindSharedWebSource', 'replaceSharedWebContribution'].includes(native.lastResponseRejection.messageType) ? native.lastResponseRejection.messageType : 'unknown',
        channel: ['health', 'statistics', 'application', 'ledger', 'sharedQuota'].includes(native.lastResponseRejection.channel) ? native.lastResponseRejection.channel : 'unknown',
      } : null },
    policy: { revision: typeof p?.policy?.revision === 'string' && /^profile-config:\d{1,16}$/.test(p.policy.revision) ? p.policy.revision : null,
      stage: ['legacy', 'shadow', 'shared'].includes(p?.policy?.stage) ? p.policy.stage : null, receivedAtMs: integer(p?.receivedAtMs) },
    bindingState: ['valid', 'disabled', 'disconnected', 'unbound', 'expired_or_changed'].includes(live.bindingState) ? live.bindingState : 'unknown',
    historyCurrent, cacheScopeCurrent: boolean(live.cacheScopeCurrent), running: boolean(live.running), stage: stages.includes(live.stage) ? live.stage : null,
    lastAttemptAtMs: integer(history?.lastAttemptAtMs), lastCompletedAtMs: integer(history?.lastCompletedAtMs),
    lastErrorCode: errorCode(history?.lastErrorCode), failedStage: stages.includes(history?.failedStage) ? history.failedStage : null,
    failedDate: dateKey(history?.failedDate) ? history.failedDate : null,
    nativeFailure: history?.nativeFailure ? { stage: stages.includes(history.nativeFailure.stage) ? history.nativeFailure.stage : null,
      date: dateKey(history.nativeFailure.date) ? history.nativeFailure.date : null,
      errorCode: errorCode(history.nativeFailure.errorCode), atMs: integer(history.nativeFailure.atMs) } : null, days };
}

export function registerSharedSyncDiagnosticsReader({ runtime = chrome.runtime, storage = chrome.storage.local,
  native = readNativeHostDiagnosticState, live = readSharedWebDiagnosticState } = {}) {
  runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== SHARED_SYNC_DIAGNOSTICS_MESSAGE) return false;
    let authorized = false;
    try {
      const actual = new URL(sender?.url), expected = new URL(runtime.getURL('admin/admin.html'));
      authorized = sender?.id === runtime.id && actual.protocol === expected.protocol
        && actual.host === expected.host && actual.pathname === expected.pathname;
    } catch (_) { /* Invalid sender URLs are rejected. */ }
    if (!authorized) {
      respond({ ok: false, errorCode: 'diagnostics_sender_rejected' }); return false;
    }
    void (async () => {
      let failure = 'diagnostics_storage_read_failed';
      try {
      const stored = await storage.get(['shared_web_contribution_queue_v1', 'shared_access_policy_lkg_v1',
      'shared_web_sync_diagnostics_v1', 'local_guardian_status_v1']);
      const q = stored.shared_web_contribution_queue_v1, p = stored.shared_access_policy_lkg_v1;
      failure = 'diagnostics_native_read_failed';
      const nativeState = native();
      failure = 'diagnostics_shared_read_failed';
      const liveState = live(p?.policyHash, q?.days || {}, q?.scopeHash);
      failure = 'diagnostics_projection_failed';
      respond({ ok: true, diagnostics: buildSharedSyncDiagnostics(stored, nativeState, liveState,
        Date.now(), runtime.getManifest().version) });
      } catch (_) { respond({ ok: false, errorCode: failure }); }
    })();
    return true;
  });
}

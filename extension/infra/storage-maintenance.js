// infra/storage-maintenance.js — local V1 ledger storage pressure guard

import {
  pruneSegmentSyncOutbox,
  pruneStatsSyncOutbox,
  pruneHourlyStatsSyncOutbox,
  pruneTargetStatsSyncOutbox,
  pruneHourlyTargetStatsSyncOutbox,
  pruneUsageSegments,
  pruneDailyUsageStats,
  pruneHourlyUsageStats,
} from '../core/usage-segments.js';
import { pruneMediaStorage } from '../runtime/media-session.js';
import { logClientEventBestEffort } from './client-logs.js';

const LOCAL_STORAGE_SOFT_LIMIT_BYTES = 9 * 1024 * 1024;
const USAGE_RETENTION_DAYS = 365;
const MEDIA_RETENTION_DAYS = 30;
const MEDIA_PRESSURE_RETENTION_DAYS = 14;
const DIAGNOSTIC_KEYS = [
  'client_logs_v1',
  '__timingTrace',
  'event_log_v1',
  'timing_checkpoint_health_v1',
  'foreground_page_diagnostics_v1',
  'media_facts_v1',
  'media_frame_facts_v1',
];

function byteSize(value) {
  try {
    return JSON.stringify(value).length;
  } catch (_) {
    return 0;
  }
}

async function bytesInUse() {
  try {
    if (typeof chrome?.storage?.local?.getBytesInUse === 'function') {
      return await chrome.storage.local.getBytesInUse(null);
    }
  } catch (_) {
    return null;
  }
  try {
    const all = await chrome.storage.local.get(null);
    return byteSize(all || {});
  } catch (_) {
    return null;
  }
}

function latestByTimestamp(items, limit) {
  return (Array.isArray(items) ? items : [])
    .sort((a, b) => Number(b?.timestamp || b?.ts || b?.at || 0) - Number(a?.timestamp || a?.ts || a?.at || 0))
    .slice(0, limit);
}

async function cleanupNumberStep(task) {
  try {
    const value = await task();
    return Number(value || 0);
  } catch (_) {
    return 0;
  }
}

async function cleanupObjectStep(task) {
  try {
    return await task();
  } catch (_) {
    return {};
  }
}
async function pruneDiagnostics({ pressure = false } = {}) {
  const data = await chrome.storage.local.get(DIAGNOSTIC_KEYS);
  const next = {};
  const summary = {};

  const clientLogs = Array.isArray(data.client_logs_v1) ? data.client_logs_v1 : [];
  const clientLimit = pressure ? 100 : 500;
  if (clientLogs.length > clientLimit) {
    next.client_logs_v1 = latestByTimestamp(clientLogs, clientLimit);
    summary.clientLogs = clientLogs.length - next.client_logs_v1.length;
  }

  const timingTrace = Array.isArray(data.__timingTrace) ? data.__timingTrace : [];
  const traceLimit = pressure ? 50 : 200;
  if (timingTrace.length > traceLimit) {
    next.__timingTrace = timingTrace.slice(-traceLimit);
    summary.timingTrace = timingTrace.length - next.__timingTrace.length;
  }

  const eventLog = Array.isArray(data.event_log_v1) ? data.event_log_v1 : [];
  const eventLimit = pressure ? 100 : 500;
  if (eventLog.length > eventLimit) {
    next.event_log_v1 = eventLog.slice(-eventLimit);
    summary.eventLog = eventLog.length - next.event_log_v1.length;
  }

  if (pressure) {
    if (data.timing_checkpoint_health_v1) {
      next.timing_checkpoint_health_v1 = null;
      summary.checkpointHealth = 1;
    }
    if (data.foreground_page_diagnostics_v1) {
      next.foreground_page_diagnostics_v1 = null;
      summary.foregroundDiagnostics = 1;
    }
    if (data.media_facts_v1 && Object.keys(data.media_facts_v1 || {}).length > 0) {
      next.media_facts_v1 = {};
      summary.mediaFacts = Object.keys(data.media_facts_v1 || {}).length;
    }
    if (data.media_frame_facts_v1 && Object.keys(data.media_frame_facts_v1 || {}).length > 0) {
      next.media_frame_facts_v1 = {};
      summary.mediaFrameFacts = Object.keys(data.media_frame_facts_v1 || {}).length;
    }
  }

  if (Object.keys(next).length > 0) {
    await chrome.storage.local.set(next);
  }
  return summary;
}

export async function runV1StorageMaintenance(options = {}) {
  const reason = options.reason || 'scheduled';
  const beforeBytes = await bytesInUse();
  const pressure = options.pressure === true || (Number(beforeBytes || 0) >= LOCAL_STORAGE_SOFT_LIMIT_BYTES);

  const usage = {
    segmentOutbox: await cleanupNumberStep(() => pruneSegmentSyncOutbox(USAGE_RETENTION_DAYS)),
    statsOutbox: await cleanupNumberStep(() => pruneStatsSyncOutbox(USAGE_RETENTION_DAYS)),
    hourlyStatsOutbox: await cleanupNumberStep(() => pruneHourlyStatsSyncOutbox(USAGE_RETENTION_DAYS)),
    targetStatsOutbox: await cleanupNumberStep(() => pruneTargetStatsSyncOutbox(USAGE_RETENTION_DAYS)),
    hourlyTargetStatsOutbox: await cleanupNumberStep(() => pruneHourlyTargetStatsSyncOutbox(USAGE_RETENTION_DAYS)),
    usageSegments: await cleanupNumberStep(() => pruneUsageSegments(USAGE_RETENTION_DAYS)),
    dailyStats: await cleanupNumberStep(() => pruneDailyUsageStats(USAGE_RETENTION_DAYS)),
    hourlyStats: await cleanupNumberStep(() => pruneHourlyUsageStats(USAGE_RETENTION_DAYS)),
  };
  const media = await cleanupObjectStep(() => pruneMediaStorage(pressure ? MEDIA_PRESSURE_RETENTION_DAYS : MEDIA_RETENTION_DAYS));
  const diagnostics = await cleanupObjectStep(() => pruneDiagnostics({ pressure }));
  const afterBytes = await bytesInUse();

  const result = { ok: true, reason, pressure, beforeBytes, afterBytes, usage, media, diagnostics };
  const changed = [usage, media, diagnostics]
    .flatMap((group) => Object.values(group || {}))
    .some((value) => Number(value || 0) > 0);
  if (pressure || changed) {
    logClientEventBestEffort({
      level: pressure ? 'warning' : 'info',
      category: 'storage',
      eventCode: pressure ? 'storage_pressure_maintenance' : 'storage_maintenance_completed',
      module: 'infra/storage-maintenance',
      message: pressure ? 'Local storage pressure maintenance completed' : 'Local V1 storage maintenance completed',
      details: result,
    });
  }
  return result;
}

export async function runStoragePressureGuard(reason = 'storage_pressure_guard') {
  return runV1StorageMaintenance({ reason, pressure: true });
}
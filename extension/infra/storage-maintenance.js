// infra/storage-maintenance.js — local V1 ledger storage pressure guard

import {
  compactUsageSyncOutboxes,
  dropOldestPendingUsageSegments,
  pruneUploadedUsageAggregates,
  pruneUploadedUsageSegments,
} from '../core/usage-segments.js';
import { dropOldestPendingMediaSegments, pruneMediaStorage } from '../runtime/media-session.js';
import { logClientEventBestEffort, pruneClientLogsForStoragePressure } from './client-logs.js';
import {
  STORAGE_EMERGENCY_RESERVE_BYTES,
  STORAGE_HARD_LIMIT_BYTES,
  STORAGE_PRESSURE_BYTES,
  STORAGE_TARGET_BYTES,
  withStorageBudgetBypass,
} from './storage-budget.js';

const UPLOADED_RAW_RETENTION_DAYS = 1;
const DAILY_AGGREGATE_RETENTION_DAYS = 7;
const HOURLY_AGGREGATE_RETENTION_DAYS = 1;
const MAINTENANCE_LOG_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const MAINTENANCE_STATE_KEY = 'storage_maintenance_state_v1';
const STORAGE_DIAGNOSTICS_KEY = 'storage_diagnostics_v1';
const STORAGE_LOSS_AUDIT_KEY = 'storage_emergency_loss_v1';
const MAX_LOSS_AUDIT_BYTES = 8 * 1024;
const MAX_LOSS_AUDIT_ENTRIES = 20;
const SESSION_DIAGNOSTIC_LEGACY_KEYS = [
  '__timingTrace',
  'debug_focus_ledger_v1',
  'mode_effect_trace_v1',
];
const PRESSURE_DIAGNOSTIC_KEYS = [
  'timing_checkpoint_health_v1',
  'foreground_page_diagnostics_v1',
];
const LEGACY_KEYS = ['visit_sessions', 'guardian_sessions', 'guardian_changelog'];

function byteSize(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch (_) {
    return 0;
  }
}

async function bytesInUse() {
  try {
    if (typeof chrome?.storage?.local?.getBytesInUse === 'function') {
      return Number(await chrome.storage.local.getBytesInUse(null)) || 0;
    }
  } catch (_) {}
  try {
    const all = await chrome.storage.local.get(null);
    return byteSize(all || {});
  } catch (_) {
    return 0;
  }
}

function valueCount(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return value == null ? 0 : 1;
}

function pendingCount(value) {
  if (!value || typeof value !== 'object') return 0;
  for (const key of ['dirtySegmentIds', 'pendingIds', 'dirtyDates', 'dirtyHourKeys', 'pendingLogIds']) {
    if (Array.isArray(value[key])) return value[key].length;
  }
  return 0;
}

async function writeStorageDiagnostics(reason, maintenance) {
  const all = await chrome.storage.local.get(null).catch(() => ({}));
  const keys = Object.entries(all || {}).map(([key, value]) => ({
    key,
    bytes: byteSize(value),
    count: valueCount(value),
    pending: pendingCount(value),
  })).sort((a, b) => b.bytes - a.bytes).slice(0, 30);
  const diagnostic = {
    at: Date.now(),
    reason,
    totalBytes: await bytesInUse(),
    keyCount: Object.keys(all || {}).length,
    pendingCount: keys.reduce((sum, item) => sum + item.pending, 0),
    maintenance,
    keys,
  };
  await chrome.storage.local.set({ [STORAGE_DIAGNOSTICS_KEY]: diagnostic }).catch(() => {});
  return diagnostic;
}

async function cleanupNumberStep(task) {
  try { return Number(await task() || 0); } catch (_) { return 0; }
}

async function cleanupObjectStep(task) {
  try { return await task(); } catch (_) { return {}; }
}

function eventTime(event) {
  return Number(event?.time || event?.timestamp || event?.ts || event?.at || 0);
}

async function pruneRuntimeDiagnostics({ pressure = false, emergency = false } = {}) {
  const keys = [
    ...SESSION_DIAGNOSTIC_LEGACY_KEYS,
    ...PRESSURE_DIAGNOSTIC_KEYS,
    'event_log_v1',
    'media_facts_v1',
    'media_frame_facts_v1',
    'media_sessions_v2',
  ];
  const data = await chrome.storage.local.get(keys);
  const next = {};
  const summary = {};
  const legacyKeys = SESSION_DIAGNOSTIC_LEGACY_KEYS.filter((key) => data[key] != null);
  if (legacyKeys.length > 0) {
    await chrome.storage.local.remove(legacyKeys);
    summary.sessionDiagnosticLegacyKeys = legacyKeys.length;
  }
  for (const key of PRESSURE_DIAGNOSTIC_KEYS) {
    const value = data[key];
    if (!pressure) continue;
    if (Array.isArray(value) && value.length > 0) {
      next[key] = [];
      summary[key] = value.length;
    } else if (value && typeof value === 'object' && Object.keys(value).length > 0) {
      next[key] = {};
      summary[key] = Object.keys(value).length;
    } else if (value != null) {
      next[key] = null;
      summary[key] = 1;
    }
  }

  const events = Array.isArray(data.event_log_v1) ? data.event_log_v1 : [];
  const now = Date.now();
  let keptEvents = events.filter((event) => eventTime(event) >= now - (pressure ? 6 : 24) * 3600000);
  if (emergency && keptEvents.length > 20) {
    const tail = keptEvents.slice(-20);
    const lastStart = [...keptEvents].reverse().find((event) => event?.type === 'START');
    keptEvents = lastStart && !tail.includes(lastStart) ? [lastStart, ...tail] : tail;
  }
  if (keptEvents.length !== events.length) {
    next.event_log_v1 = keptEvents;
    summary.eventLog = events.length - keptEvents.length;
  }

  if (pressure) {
    const activeTabIds = new Set(Object.values(data.media_sessions_v2 || {})
      .map((session) => Number(session?.tabId))
      .filter(Number.isInteger));
    for (const key of ['media_facts_v1', 'media_frame_facts_v1']) {
      const facts = data[key] && typeof data[key] === 'object' ? data[key] : {};
      const kept = Object.fromEntries(Object.entries(facts).filter(([, fact]) => activeTabIds.has(Number(fact?.tabId))));
      if (Object.keys(kept).length !== Object.keys(facts).length) {
        next[key] = kept;
        summary[key] = Object.keys(facts).length - Object.keys(kept).length;
      }
    }
  }
  if (Object.keys(next).length > 0) await chrome.storage.local.set(next);
  return summary;
}

async function pruneLegacyAndAutomaticRequests({ pressure = false, emergency = false } = {}) {
  if (!pressure) return {};
  const all = await chrome.storage.local.get(null).catch(() => ({}));
  const legacyStatsCutoff = Date.now() - 7 * 86400000;
  const legacyStatsKeys = Object.keys(all).filter((key) => {
    if (!key.startsWith('stats_') && !key.startsWith('undetermined_stats_')) return false;
    if (emergency) return true;
    const match = key.match(/(\d{4}-\d{2}-\d{2})/);
    if (!match) return false;
    const dateMs = new Date(`${match[1]}T00:00:00`).getTime();
    return Number.isFinite(dateMs) && dateMs < legacyStatsCutoff;
  });
  const removeKeys = [...new Set([...LEGACY_KEYS, ...legacyStatsKeys])];
  if (removeKeys.length > 0) await chrome.storage.local.remove(removeKeys);

  const requests = Array.isArray(all.site_classification_requests_v1) ? all.site_classification_requests_v1 : [];
  const cutoff = Date.now() - 3 * 86400000;
  const kept = requests.filter((record) => {
    const isAutomatic = record?.recordSource === 'auto_unclassified_access' && !record?.manualRequestedAt;
    const protectedDecision = record?.status === 'approved' || record?.status === 'rejected';
    if (!isAutomatic || protectedDecision) return true;
    if (emergency) return false;
    const at = Number(record?.updatedAt || record?.lastObservedAt || record?.requestedAt || 0);
    return record?.syncStatus !== 'uploaded' || at >= cutoff;
  });
  if (kept.length !== requests.length) {
    await chrome.storage.local.set({ site_classification_requests_v1: kept });
  }
  return { legacyKeys: removeKeys.length, automaticRequests: requests.length - kept.length };
}

async function appendLossAudit({ type, dropped, oldestAt, newestAt, reason }) {
  if (!dropped) return;
  const data = await chrome.storage.local.get(STORAGE_LOSS_AUDIT_KEY).catch(() => ({}));
  let entries = Array.isArray(data[STORAGE_LOSS_AUDIT_KEY]) ? data[STORAGE_LOSS_AUDIT_KEY] : [];
  entries.push({ at: Date.now(), type, dropped, oldestAt, newestAt, reason });
  if (entries.length > MAX_LOSS_AUDIT_ENTRIES) {
    const overflow = entries.slice(0, entries.length - (MAX_LOSS_AUDIT_ENTRIES - 1));
    const recent = entries.slice(-(MAX_LOSS_AUDIT_ENTRIES - 1));
    const times = overflow.flatMap((entry) => [Number(entry?.oldestAt), Number(entry?.newestAt)]).filter(Number.isFinite);
    entries = [{
      at: Date.now(),
      type: 'cumulative',
      dropped: overflow.reduce((sum, entry) => sum + Math.max(0, Number(entry?.dropped || 0)), 0),
      events: overflow.reduce((sum, entry) => sum + Math.max(1, Number(entry?.events || 1)), 0),
      oldestAt: times.length > 0 ? Math.min(...times) : null,
      newestAt: times.length > 0 ? Math.max(...times) : null,
      reason: 'audit_rollup',
    }, ...recent];
  }
  while (entries.length > 1 && byteSize(entries) > MAX_LOSS_AUDIT_BYTES) entries.splice(1, 1);
  await chrome.storage.local.set({ [STORAGE_LOSS_AUDIT_KEY]: entries });
}

async function maybeLogMaintenance(result) {
  const now = Date.now();
  const data = await chrome.storage.local.get(MAINTENANCE_STATE_KEY).catch(() => ({}));
  const previous = data?.[MAINTENANCE_STATE_KEY] || {};
  const status = result.unresolved ? 'unresolved' : (result.pressure ? 'pressure_resolved' : 'completed');
  const shouldLog = (now - Number(previous.lastLoggedAt || 0)) >= MAINTENANCE_LOG_COOLDOWN_MS
    || previous.lastStatus !== status;
  await chrome.storage.local.set({
    [MAINTENANCE_STATE_KEY]: {
      lastRunAt: now,
      lastLoggedAt: shouldLog ? now : Number(previous.lastLoggedAt || 0),
      lastStatus: status,
      beforeBytes: result.beforeBytes,
      afterBytes: result.afterBytes,
    },
  }).catch(() => {});
  if (!shouldLog || result.emergency) return;
  logClientEventBestEffort({
    level: result.unresolved ? 'error' : (result.pressure ? 'warning' : 'info'),
    category: 'storage',
    eventCode: result.unresolved ? 'storage_pressure_unresolved'
      : (result.pressure ? 'storage_pressure_maintenance' : 'storage_maintenance_completed'),
    module: 'infra/storage-maintenance',
    message: result.unresolved ? 'Local storage remains above pressure target' : 'Local V1 storage maintenance completed',
    details: {
      reason: result.reason,
      beforeBytes: result.beforeBytes,
      afterBytes: result.afterBytes,
      topKeys: (result.storageDiagnostics?.keys || []).slice(0, 10),
    },
  });
}

async function performStorageMaintenance(options = {}) {
  const reason = options.reason || 'scheduled';
  const beforeBytes = await bytesInUse();
  const emergency = options.emergency === true;
  const pressure = emergency || options.pressure === true || beforeBytes >= STORAGE_PRESSURE_BYTES;
  const requiredBytes = Math.max(0, Number(options.requiredBytes || 0));
  const storageOptions = options.storageBypassToken ? { storageBypassToken: options.storageBypassToken } : {};
  const effectiveTarget = emergency
    ? Math.max(0, Math.min(STORAGE_TARGET_BYTES, STORAGE_HARD_LIMIT_BYTES - STORAGE_EMERGENCY_RESERVE_BYTES - requiredBytes))
    : STORAGE_TARGET_BYTES;

  const usage = {
    outboxes: await cleanupObjectStep(() => compactUsageSyncOutboxes(storageOptions)),
    uploadedSegments: await cleanupNumberStep(() => pruneUploadedUsageSegments(UPLOADED_RAW_RETENTION_DAYS, storageOptions)),
    uploadedAggregates: await cleanupObjectStep(() => pruneUploadedUsageAggregates(DAILY_AGGREGATE_RETENTION_DAYS, {
      ...storageOptions,
      hourlyRetentionDays: HOURLY_AGGREGATE_RETENTION_DAYS,
    })),
  };
  const media = await cleanupObjectStep(() => pruneMediaStorage(UPLOADED_RAW_RETENTION_DAYS, {
    aggregateRetentionDays: DAILY_AGGREGATE_RETENTION_DAYS,
    hourlyAggregateRetentionDays: HOURLY_AGGREGATE_RETENTION_DAYS,
    storageOptions,
  }));
  const logs = await cleanupObjectStep(() => pruneClientLogsForStoragePressure({ pressure, emergency: false, storageOptions }));
  const diagnostics = await cleanupObjectStep(() => pruneRuntimeDiagnostics({ pressure, emergency: false }));
  const compatibility = await cleanupObjectStep(() => pruneLegacyAndAutomaticRequests({ pressure, emergency: false }));

  let pressureUsageSegments = 0;
  let pressureUsageAggregates = {};
  let pressureMedia = {};
  if (pressure && await bytesInUse() > effectiveTarget) {
    pressureMedia = await cleanupObjectStep(() => pruneMediaStorage(UPLOADED_RAW_RETENTION_DAYS, {
      aggregateRetentionDays: DAILY_AGGREGATE_RETENTION_DAYS,
      hourlyAggregateRetentionDays: HOURLY_AGGREGATE_RETENTION_DAYS,
      storageOptions,
    }));
    pressureUsageSegments = await cleanupNumberStep(() => pruneUploadedUsageSegments(UPLOADED_RAW_RETENTION_DAYS, storageOptions));
    pressureUsageAggregates = await cleanupObjectStep(() => pruneUploadedUsageAggregates(DAILY_AGGREGATE_RETENTION_DAYS, {
      ...storageOptions,
      hourlyRetentionDays: HOURLY_AGGREGATE_RETENTION_DAYS,
    }));
  }

  let droppedMedia = { dropped: 0 };
  let droppedUsage = { dropped: 0 };
  if (emergency && await bytesInUse() > effectiveTarget) {
    await pruneClientLogsForStoragePressure({ pressure: true, emergency: true, storageOptions });
    await pruneRuntimeDiagnostics({ pressure: true, emergency: true });
    await pruneLegacyAndAutomaticRequests({ pressure: true, emergency: true });
    await pruneMediaStorage(0, { aggregateRetentionDays: 0, hourlyAggregateRetentionDays: 0, storageOptions });
    await pruneUploadedUsageSegments(0, storageOptions);
    await pruneUploadedUsageAggregates(0, storageOptions);

    while (await bytesInUse() > effectiveTarget) {
      const batch = await dropOldestPendingMediaSegments(50, storageOptions);
      if (!batch.dropped) break;
      droppedMedia = {
        dropped: droppedMedia.dropped + batch.dropped,
        oldestAt: droppedMedia.oldestAt == null ? batch.oldestAt : Math.min(droppedMedia.oldestAt, batch.oldestAt),
        newestAt: droppedMedia.newestAt == null ? batch.newestAt : Math.max(droppedMedia.newestAt, batch.newestAt),
      };
    }
    await appendLossAudit({ type: 'media_segments_v1', ...droppedMedia, reason });

    while (await bytesInUse() > effectiveTarget) {
      const batch = await dropOldestPendingUsageSegments(50, storageOptions);
      if (!batch.dropped) break;
      droppedUsage = {
        dropped: droppedUsage.dropped + batch.dropped,
        oldestAt: droppedUsage.oldestAt == null ? batch.oldestAt : Math.min(droppedUsage.oldestAt, batch.oldestAt),
        newestAt: droppedUsage.newestAt == null ? batch.newestAt : Math.max(droppedUsage.newestAt, batch.newestAt),
      };
    }
    await appendLossAudit({ type: 'usage_segments_v1', ...droppedUsage, reason });
  }

  const maintenance = {
    usage, media, logs, diagnostics, compatibility,
    pressureUsageSegments, pressureUsageAggregates, pressureMedia,
    droppedMedia: droppedMedia.dropped,
    droppedUsage: droppedUsage.dropped,
  };
  const storageDiagnostics = await writeStorageDiagnostics(reason, maintenance);
  const afterBytes = await bytesInUse();
  const unresolved = pressure && afterBytes > effectiveTarget;
  const result = {
    ok: !unresolved,
    reason,
    pressure,
    emergency,
    unresolved,
    beforeBytes,
    afterBytes,
    targetBytes: effectiveTarget,
    hardLimitBytes: STORAGE_HARD_LIMIT_BYTES,
    reserveBytes: STORAGE_EMERGENCY_RESERVE_BYTES,
    ...maintenance,
    storageDiagnostics: {
      totalBytes: storageDiagnostics.totalBytes,
      keyCount: storageDiagnostics.keyCount,
      pendingCount: storageDiagnostics.pendingCount,
      keys: storageDiagnostics.keys.slice(0, 10),
    },
  };
  await maybeLogMaintenance(result);
  return result;
}

export async function runV1StorageMaintenance(options = {}) {
  return withStorageBudgetBypass((storageBypassToken) => performStorageMaintenance({
    ...options,
    storageBypassToken,
  }), options.storageBypassToken || null);
}

export async function runStoragePressureGuard(reason = 'storage_pressure_guard') {
  return runV1StorageMaintenance({ reason, pressure: true });
}

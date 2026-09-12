// Unified quota projection. This module only reads existing accounting outputs.

import { budgetedLocalSet } from '../infra/storage-budget.js';
import { getBeijingWeekPeriod } from './profile-account-v2.js';
import { PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY } from './profile-account-shadow-v2.js';

export const QUOTA_READ_MODEL_V2_KEY = 'quota_read_model_v2';

const DAILY_STATS_KEY = 'daily_usage_stats_v1';
const SEGMENTS_KEY = 'usage_segments_v1';
const SEGMENT_OUTBOX_KEY = 'segment_sync_outbox_v1';

function seconds(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function add(target, key, value) {
  if (!key) return;
  target[key] = seconds(target[key]) + seconds(value);
}

function emptyProjection() {
  return {
    onlineSeconds: 0,
    byQuotaBucket: {},
    byDomain: {},
  };
}

function projectionFromDayStats(dayStats) {
  const projection = emptyProjection();
  for (const [domain, row] of Object.entries(dayStats?.domains || {})) {
    const activeSeconds = seconds(row?.activeSeconds);
    projection.onlineSeconds += activeSeconds;
    if (activeSeconds > 0) add(projection.byDomain, domain, activeSeconds);
  }
  let allocatedSeconds = 0;
  for (const target of Object.values(dayStats?.targets || {})) {
    for (const [bucket, value] of Object.entries(target?.activeByQuotaBucket || {})) {
      add(projection.byQuotaBucket, bucket || 'unknown', value);
      allocatedSeconds += seconds(value);
    }
  }
  const compactedActive = seconds(dayStats?.compactedByChannel?.active);
  if (compactedActive > 0 && projection.onlineSeconds < compactedActive) {
    projection.onlineSeconds += compactedActive - projection.onlineSeconds;
  }
  projection.unallocatedSeconds = Math.max(0, projection.onlineSeconds - allocatedSeconds);
  projection.complete = projection.unallocatedSeconds === 0;
  return projection;
}

export function buildLocalQuotaProjectionV2(statsByDate = {}, { date, weekStart, weekEnd } = {}) {
  const today = emptyProjection();
  const days = [];
  let weekRestSeconds = 0;
  let complete = true;
  for (const dateKey of Object.keys(statsByDate || {}).sort()) {
    if (dateKey < weekStart || dateKey > weekEnd) continue;
    const projection = projectionFromDayStats(statsByDate[dateKey]);
    days.push({ date: dateKey, ...projection });
    weekRestSeconds += seconds(projection.byQuotaBucket.rest);
    complete = complete && projection.complete;
    if (dateKey === date) Object.assign(today, projection);
  }
  return { today, weekRestSeconds, days, complete };
}

function projectionFromCloudAccount(account) {
  const source = account?.quotaProjection;
  if (!source || !Array.isArray(source.byQuotaBucket) || !Array.isArray(source.byDomain)) return null;
  const projection = emptyProjection();
  projection.onlineSeconds = seconds(source.activeSeconds);
  for (const row of source.byQuotaBucket) add(projection.byQuotaBucket, row?.quotaBucket, row?.durationSeconds);
  for (const row of source.byDomain) add(projection.byDomain, row?.domain, row?.durationSeconds);
  projection.complete = account?.complete === true;
  return projection;
}

function mergeProjection(target, source) {
  target.onlineSeconds += seconds(source?.onlineSeconds);
  for (const [bucket, value] of Object.entries(source?.byQuotaBucket || {})) add(target.byQuotaBucket, bucket, value);
  for (const [domain, value] of Object.entries(source?.byDomain || {})) add(target.byDomain, domain, value);
}

function normalizedList(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter((item) => typeof item === 'string' && item))].sort();
}

export function buildQuotaReadModelV2({
  date,
  weekStart,
  weekEnd,
  deviceId,
  localProjection,
  cloudSnapshot,
  pending = {},
  now = Date.now(),
} = {}) {
  const local = localProjection || { today: emptyProjection(), weekRestSeconds: 0, days: [], complete: false };
  const cloudPeriodMatches = cloudSnapshot?.period?.weekStart === weekStart && cloudSnapshot?.period?.weekEnd === weekEnd;
  const otherToday = emptyProjection();
  let otherWeekRestSeconds = 0;
  const otherDeviceIds = new Set();
  const projectionMissingDevices = new Set();

  if (cloudPeriodMatches) {
    for (const account of cloudSnapshot.deviceAccounts || []) {
      if (!account?.deviceId || account.deviceId === deviceId) continue;
      const projection = projectionFromCloudAccount(account);
      if (!projection) {
        projectionMissingDevices.add(account.deviceId);
        continue;
      }
      otherDeviceIds.add(account.deviceId);
      if (account.date === date) mergeProjection(otherToday, projection);
      otherWeekRestSeconds += seconds(projection.byQuotaBucket.rest);
    }
  }

  const usage = {
    totalSeconds: seconds(local.today?.onlineSeconds) + seconds(otherToday.onlineSeconds),
    studySeconds: seconds(local.today?.byQuotaBucket?.study) + seconds(otherToday.byQuotaBucket.study),
    compositeSeconds: seconds(local.today?.byQuotaBucket?.composite) + seconds(otherToday.byQuotaBucket.composite),
    restSeconds: seconds(local.today?.byQuotaBucket?.rest) + seconds(otherToday.byQuotaBucket.rest),
    weekRestSeconds: seconds(local.weekRestSeconds) + otherWeekRestSeconds,
    domainSeconds: { ...(local.today?.byDomain || {}) },
  };
  for (const [domain, value] of Object.entries(otherToday.byDomain)) add(usage.domainSeconds, domain, value);
  usage.undeterminedSeconds = usage.compositeSeconds;
  usage.totalMinutes = Math.floor(usage.totalSeconds / 60);
  usage.studyMinutes = Math.floor(usage.studySeconds / 60);
  usage.compositeMinutes = Math.floor(usage.compositeSeconds / 60);
  usage.undeterminedMinutes = usage.compositeMinutes;
  usage.restMinutes = Math.floor(usage.restSeconds / 60);
  usage.weekRestMinutes = Math.floor(usage.weekRestSeconds / 60);

  const cloudCompleteness = cloudPeriodMatches ? (cloudSnapshot.completeness || {}) : {};
  const missingDevices = normalizedList(cloudCompleteness.missingDevices);
  const incompatibleDevices = normalizedList(cloudCompleteness.incompatibleDevices);
  const staleDevices = normalizedList(cloudCompleteness.staleDevices);
  const incompleteDevices = normalizedList([
    ...(cloudCompleteness.incompleteDevices || []),
    ...projectionMissingDevices,
  ]);
  const otherDevicesUnknown = !cloudPeriodMatches || cloudCompleteness.inventoryAvailable === false || missingDevices.length > 0 ||
    incompatibleDevices.length > 0 || incompleteDevices.length > 0;

  return {
    ok: true,
    schemaVersion: 2,
    accountingVersion: 2,
    date,
    weekStart,
    weekEnd,
    computedAt: now,
    source: cloudPeriodMatches ? 'local_plus_cloud_other_devices' : 'local_only',
    usage,
    local: {
      today: local.today,
      weekRestSeconds: seconds(local.weekRestSeconds),
      complete: local.complete === true,
    },
    otherDevices: {
      deviceIds: [...otherDeviceIds].sort(),
      today: otherToday,
      weekRestSeconds: otherWeekRestSeconds,
      snapshotId: cloudPeriodMatches ? cloudSnapshot.snapshotId : null,
      asOf: cloudPeriodMatches ? cloudSnapshot.asOf : null,
    },
    pending: {
      segmentCount: seconds(pending.segmentCount),
      activeSeconds: seconds(pending.activeSeconds),
    },
    completeness: {
      complete: local.complete === true && cloudPeriodMatches && cloudCompleteness.complete === true && !otherDevicesUnknown,
      localComplete: local.complete === true,
      cloudSnapshotAvailable: cloudPeriodMatches,
      deviceInventoryAvailable: cloudCompleteness.inventoryAvailable !== false,
      otherDevicesUnknown,
      expectedDevices: normalizedList(cloudCompleteness.expectedDevices),
      missingDevices,
      incompatibleDevices,
      staleDevices,
      incompleteDevices,
    },
  };
}

function pendingProjection(data, weekStart, weekEnd) {
  const ids = data?.[SEGMENT_OUTBOX_KEY]?.pendingIds || [];
  const segments = data?.[SEGMENTS_KEY] || {};
  let activeSeconds = 0;
  let segmentCount = 0;
  for (const id of ids) {
    const segment = segments[id];
    if (!segment || segment.date < weekStart || segment.date > weekEnd) continue;
    segmentCount++;
    if (segment.channel === 'active') activeSeconds += seconds(segment.durationSeconds);
  }
  return { segmentCount, activeSeconds };
}

export async function readQuotaReadModelV2({ date = null, now = Date.now() } = {}) {
  const dateKey = date || new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const period = getBeijingWeekPeriod(dateKey);
  try {
    const data = await chrome.storage.local.get([
      DAILY_STATS_KEY,
      SEGMENTS_KEY,
      SEGMENT_OUTBOX_KEY,
      PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY,
      QUOTA_READ_MODEL_V2_KEY,
      'cloud_device_id',
    ]);
    const localProjection = buildLocalQuotaProjectionV2(data[DAILY_STATS_KEY] || {}, {
      date: dateKey,
      ...period,
    });
    const model = buildQuotaReadModelV2({
      date: dateKey,
      ...period,
      deviceId: data.cloud_device_id || null,
      localProjection,
      cloudSnapshot: data[PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY]?.current || null,
      pending: pendingProjection(data, period.weekStart, period.weekEnd),
      now,
    });
    await budgetedLocalSet({ [QUOTA_READ_MODEL_V2_KEY]: model }, {
      priority: 'derived',
      source: 'quota_read_model_v2',
    }).catch(() => {});
    return model;
  } catch (error) {
    const fallback = await chrome.storage.local.get(QUOTA_READ_MODEL_V2_KEY).catch(() => ({}));
    const cached = fallback?.[QUOTA_READ_MODEL_V2_KEY];
    if (cached?.date === dateKey && cached?.weekStart === period.weekStart) {
      return {
        ...cached,
        ok: true,
        source: 'trusted_local_cache',
        localCacheUsed: true,
        error: 'local_account_read_failed',
      };
    }
    return {
      ok: false,
      schemaVersion: 2,
      accountingVersion: 2,
      date: dateKey,
      ...period,
      accountingUnavailable: true,
      error: error?.message || 'local_account_read_failed',
      completeness: { complete: false, localComplete: false, cloudSnapshotAvailable: false, otherDevicesUnknown: true },
    };
  }
}

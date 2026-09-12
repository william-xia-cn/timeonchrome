// Deterministic profile-account composition shared by the V2 shadow Worker and client verifier.

import {
  canonicalDeviceAccountJson,
  hashDeviceAccountValue,
  validateDeviceAccountRows,
} from './device-account-v2.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizedCount(value) {
  return Number.isSafeInteger(Number(value)) ? Math.max(0, Number(value)) : 0;
}

function dynamicFieldsRemoved(row) {
  const copy = { ...row };
  delete copy.durationSeconds;
  delete copy.segmentsCount;
  delete copy.firstSeenAt;
  delete copy.lastSeenAt;
  return copy;
}

function rowIdentity(row) {
  return canonicalDeviceAccountJson({
    kind: row.kind,
    periodKey: row.periodKey,
    subject: row.kind.endsWith('_domain') ? row.domain : row.targetKey,
    channel: row.channel,
    mode: row.mode,
    quotaBucket: row.kind.endsWith('_target') ? row.quotaBucket : null,
  });
}

function finiteTimestamp(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export function aggregateDeviceAccountRows(accounts, date) {
  const buckets = new Map();
  for (const account of Array.isArray(accounts) ? accounts : []) {
    const validation = validateDeviceAccountRows(account?.rows || [], date);
    if (!validation.ok) {
      const error = new Error(validation.code);
      error.code = validation.code;
      throw error;
    }
    for (const row of account.rows || []) {
      const key = rowIdentity(row);
      const base = dynamicFieldsRemoved(row);
      const canonicalBase = canonicalDeviceAccountJson(base);
      const previous = buckets.get(key);
      if (!previous) {
        buckets.set(key, {
          base,
          canonicalBase,
          durationSeconds: row.durationSeconds,
          segmentsCount: normalizedCount(row.segmentsCount),
          firstSeenAt: finiteTimestamp(row.firstSeenAt),
          lastSeenAt: finiteTimestamp(row.lastSeenAt),
        });
        continue;
      }
      if (canonicalBase.localeCompare(previous.canonicalBase) < 0) {
        previous.base = base;
        previous.canonicalBase = canonicalBase;
      }
      previous.durationSeconds += row.durationSeconds;
      previous.segmentsCount += normalizedCount(row.segmentsCount);
      const first = finiteTimestamp(row.firstSeenAt);
      const last = finiteTimestamp(row.lastSeenAt);
      if (first !== null) previous.firstSeenAt = previous.firstSeenAt === null ? first : Math.min(previous.firstSeenAt, first);
      if (last !== null) previous.lastSeenAt = previous.lastSeenAt === null ? last : Math.max(previous.lastSeenAt, last);
    }
  }
  const rows = [...buckets.values()].map((entry) => ({
    ...entry.base,
    durationSeconds: entry.durationSeconds,
    segmentsCount: entry.segmentsCount,
    firstSeenAt: entry.firstSeenAt,
    lastSeenAt: entry.lastSeenAt,
  })).sort((left, right) => canonicalDeviceAccountJson(left).localeCompare(canonicalDeviceAccountJson(right)));
  const validation = validateDeviceAccountRows(rows, date);
  if (!validation.ok) {
    const error = new Error(validation.code);
    error.code = validation.code;
    throw error;
  }
  return { rows, totals: validation.totals, totalSeconds: validation.totalSeconds };
}

export function buildDeviceVersionVector(manifests) {
  return (Array.isArray(manifests) ? manifests : []).map((manifest) => ({
    deviceId: manifest.deviceId,
    manifestId: manifest.manifestId,
    revision: manifest.revision,
    statsHash: manifest.statsHash,
    rawFactHash: manifest.rawFactHash,
    rawFactCount: manifest.rawFactCount,
    complete: manifest.complete === true,
    lossCount: normalizedCount(manifest.lossCount),
    generatedAt: manifest.generatedAt,
    committedAt: manifest.committedAt,
  })).sort((left, right) => left.deviceId.localeCompare(right.deviceId));
}

export async function buildProfileDayAccount({ profileId, date, generation, manifests }) {
  const vector = buildDeviceVersionVector(manifests);
  const aggregate = aggregateDeviceAccountRows(manifests, date);
  const complete = vector.every((entry) => entry.complete);
  const asOf = vector.reduce((latest, entry) => Math.max(latest, Number(entry.committedAt || 0)), 0);
  const body = {
    schemaVersion: 2,
    profileId,
    date,
    generation,
    asOf,
    deviceVersionVector: vector,
    rows: aggregate.rows,
    totalSeconds: aggregate.totalSeconds,
    complete,
    incompleteDevices: vector.filter((entry) => !entry.complete).map((entry) => entry.deviceId),
  };
  return { ...body, totalHash: await hashDeviceAccountValue(body) };
}

function dateFromUtcMs(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function getBeijingWeekPeriod(date) {
  const midday = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(midday)) throw new Error('PROFILE_ACCOUNT_INVALID_DATE');
  const weekday = new Date(midday).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const weekStart = dateFromUtcMs(midday + mondayOffset * DAY_MS);
  return { weekStart, weekEnd: dateFromUtcMs(Date.parse(`${weekStart}T00:00:00Z`) + 6 * DAY_MS) };
}

function addSummaryBucket(map, key, seconds) {
  map.set(key, (map.get(key) || 0) + Number(seconds || 0));
}

export function summarizeWeekFromProfileDays(dayAccounts, weekStart) {
  const { weekEnd } = getBeijingWeekPeriod(weekStart);
  const byChannelMode = new Map();
  const byQuotaBucket = new Map();
  const days = [];
  let totalSeconds = 0;
  for (const day of (Array.isArray(dayAccounts) ? dayAccounts : []).sort((a, b) => a.date.localeCompare(b.date))) {
    if (day.date < weekStart || day.date > weekEnd) continue;
    days.push({ date: day.date, generation: day.generation, totalHash: day.totalHash, complete: day.complete === true });
    for (const row of day.rows || []) {
      if (row.kind === 'daily_domain') {
        totalSeconds += row.durationSeconds;
        addSummaryBucket(byChannelMode, `${row.channel}\u0000${row.mode}`, row.durationSeconds);
      } else if (row.kind === 'daily_target') {
        addSummaryBucket(byQuotaBucket, row.quotaBucket, row.durationSeconds);
      }
    }
  }
  return {
    totalSeconds,
    byChannelMode: [...byChannelMode.entries()].map(([key, durationSeconds]) => {
      const [channel, mode] = key.split('\u0000');
      return { channel, mode, durationSeconds };
    }).sort((a, b) => canonicalDeviceAccountJson(a).localeCompare(canonicalDeviceAccountJson(b))),
    byQuotaBucket: [...byQuotaBucket.entries()].map(([quotaBucket, durationSeconds]) => ({ quotaBucket, durationSeconds }))
      .sort((a, b) => a.quotaBucket.localeCompare(b.quotaBucket)),
    days,
  };
}

export async function buildProfileWeekAccount({ profileId, weekStart, generation, dayAccounts }) {
  const period = getBeijingWeekPeriod(weekStart);
  const summary = summarizeWeekFromProfileDays(dayAccounts, period.weekStart);
  const vectorMap = new Map();
  for (const day of dayAccounts || []) {
    for (const entry of day.deviceVersionVector || []) {
      vectorMap.set(`${day.date}\u0000${entry.deviceId}`, { date: day.date, ...entry });
    }
  }
  const deviceVersionVector = [...vectorMap.values()].sort((a, b) =>
    `${a.date}\u0000${a.deviceId}`.localeCompare(`${b.date}\u0000${b.deviceId}`)
  );
  const complete = (dayAccounts || []).every((day) => day.complete === true);
  const asOf = (dayAccounts || []).reduce((latest, day) => Math.max(latest, Number(day.asOf || 0)), 0);
  const body = {
    schemaVersion: 2,
    profileId,
    ...period,
    generation,
    asOf,
    dayVersionVector: summary.days,
    deviceVersionVector,
    profileTotal: {
      totalSeconds: summary.totalSeconds,
      byChannelMode: summary.byChannelMode,
      byQuotaBucket: summary.byQuotaBucket,
    },
    complete,
    incompleteDevices: [...new Set(deviceVersionVector.filter((entry) => !entry.complete).map((entry) => entry.deviceId))].sort(),
  };
  return { ...body, totalHash: await hashDeviceAccountValue(body) };
}

export async function hashProfileAccountPage(page) {
  return hashDeviceAccountValue(page);
}


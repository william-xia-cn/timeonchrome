// Read-only projection of the existing web V2 accounting outputs for BrowserBridge v3.
// This module never writes or settles usage_segments_v1 or daily_usage_stats_v1.

import { buildLocalQuotaProjectionV2 } from '../core/quota-read-model-v2.js';
import { getBeijingWeekPeriod } from '../core/profile-account-v2.js';
import { splitSegmentByLocalHour } from '../core/usage-segments.js';
import { getSyncState, readDeviceCorrectionEvidenceWeek, readDeviceIntervalEvidenceDay } from './cloud-sync.js';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonical(value[key]);
    return result;
  }, {});
}

async function digest(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((item) => item.toString(16).padStart(2, '0')).join('');
}

function seconds(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function bucketKey(row, prefix) {
  return String(row?.[`${prefix}QuotaBucket`] || row?.[`${prefix}Mode`] || 'unknown');
}

function correctionTotals(rows, deviceId) {
  const result = new Map();
  for (const row of rows || []) {
    if (row?.channel !== 'active' || (deviceId && row.deviceId && row.deviceId !== deviceId)) continue;
    const key = `${row.date}\0${bucketKey(row, 'original')}\0${bucketKey(row, 'effective')}`;
    result.set(key, (result.get(key) || 0) + seconds(row.durationSeconds));
  }
  return result;
}

function dayKeys(weekStart, throughDate) {
  const result = [];
  for (let ms = Date.parse(`${weekStart}T00:00:00Z`); ms <= Date.parse(`${throughDate}T00:00:00Z`); ms += 86_400_000) {
    result.push(new Date(ms).toISOString().slice(0, 10));
  }
  return result;
}

export async function buildAuthoritativeDailySnapshots({
  statsByDate = {}, segmentsById = {}, compactCorrections = [], correctionEvidence = null,
  deviceId = null, weekStart, weekEnd, throughDate, now = Date.now(), intervalEvidenceByDate = {},
} = {}) {
  const local = buildLocalQuotaProjectionV2(statsByDate, {
    date: throughDate, weekStart, weekEnd, deviceId, corrections: compactCorrections,
  });
  const projectedDays = new Map(local.days.map((day) => [day.date, day]));
  const intervalsByDate = new Map();
  const reasonsByDate = new Map();
  const addReason = (date, reason) => {
    if (!reasonsByDate.has(date)) reasonsByDate.set(date, new Set());
    reasonsByDate.get(date).add(reason);
  };
  const evidenceValid = correctionEvidence
    && correctionEvidence.weekStart === weekStart && correctionEvidence.weekEnd === weekEnd
    && Array.isArray(correctionEvidence.items) && typeof correctionEvidence.revision === 'string';
  const correctionBySegmentDate = new Map();
  if (evidenceValid) {
    for (const row of correctionEvidence.items) {
      if (row?.channel !== 'active' || typeof row.segmentId !== 'string') continue;
      const key = `${row.segmentId}\0${row.date}`;
      if (correctionBySegmentDate.has(key)) addReason(row.date, 'CORRECTION_EVIDENCE_DUPLICATE');
      correctionBySegmentDate.set(key, row);
    }
    const compactTotals = correctionTotals(compactCorrections, deviceId);
    const evidenceTotals = correctionTotals(correctionEvidence.items, deviceId);
    for (const key of new Set([...compactTotals.keys(), ...evidenceTotals.keys()])) {
      if ((compactTotals.get(key) || 0) !== (evidenceTotals.get(key) || 0)) {
        addReason(key.split('\0')[0], 'CORRECTION_REVISION_MISMATCH');
      }
    }
  }
  const seenCorrections = new Set();
  let activeSourceCount = 0;
  let missingIdCount = 0;
  let invalidTimeCount = 0;
  let inWeekSourceCount = 0;
  for (const segment of Object.values(segmentsById || {})) {
    if (!segment || segment.channel !== 'active' || segment.diagnostic === true) continue;
    activeSourceCount += 1;
    const segmentId = String(segment.id || '');
    if (!segmentId) { missingIdCount += 1; continue; }
    const slices = splitSegmentByLocalHour(segment);
    if (slices.length === 0) invalidTimeCount += 1;
    const byDate = new Map();
    for (const slice of slices) {
      if (slice.date < weekStart || slice.date > weekEnd || slice.date > throughDate) continue;
      if (!byDate.has(slice.date)) byDate.set(slice.date, []);
      byDate.get(slice.date).push(slice);
    }
    if (byDate.size > 0) inWeekSourceCount += 1;
    for (const [date, dateSlices] of byDate) {
      const correction = correctionBySegmentDate.get(`${segmentId}\0${date}`);
      const originalBucket = String(segment.quotaBucketAtTime || segment.quotaBucket || segment.mode || 'unknown');
      const creditedTotal = dateSlices.reduce((sum, slice) => sum + seconds(slice.durationSeconds), 0);
      let bucket = originalBucket;
      if (correction) {
        seenCorrections.add(`${segmentId}\0${date}`);
        if (seconds(correction.durationSeconds) !== creditedTotal
          || bucketKey(correction, 'original') !== originalBucket) {
          addReason(date, 'CORRECTION_INTERVAL_MISMATCH');
        } else {
          bucket = bucketKey(correction, 'effective');
        }
      }
      if (!intervalsByDate.has(date)) intervalsByDate.set(date, []);
      for (const slice of dateSlices) {
        if (seconds(slice.durationSeconds) === 0) continue;
        intervalsByDate.get(date).push({
          startMs: Number(slice.startMs), endMs: Number(slice.endMs),
          creditedSeconds: seconds(slice.durationSeconds), quotaBucket: bucket,
        });
      }
    }
  }
  if (evidenceValid) {
    for (const [key, row] of correctionBySegmentDate) {
      if (!seenCorrections.has(key) && row.date >= weekStart && row.date <= throughDate) {
        addReason(row.date, 'CORRECTION_SEGMENT_MISSING');
      }
    }
  }
  for (const issue of local.correctionIssues || []) {
    const row = (compactCorrections || []).find((item) => item.id === issue.id);
    if (row?.date) addReason(row.date, 'AUTHORITATIVE_CORRECTION_INCOMPLETE');
  }
  const snapshots = [];
  for (const date of dayKeys(weekStart, throughDate)) {
    const day = projectedDays.get(date) || { onlineSeconds: 0, byQuotaBucket: {}, complete: true };
    const activeSeconds = seconds(day.onlineSeconds);
    const quotaBucketSeconds = Object.fromEntries(Object.entries(day.byQuotaBucket || {})
      .map(([bucket, value]) => [bucket, seconds(value)]).filter(([, value]) => value > 0));
    let intervals = (intervalsByDate.get(date) || []).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    const reasons = new Set(reasonsByDate.get(date) || []);
    const recovered = intervalEvidenceByDate[date];
    let recoveredValid = false;
    if (recovered && activeSeconds > 0 && recovered.date === date
      && recovered.weekStart === weekStart && recovered.weekEnd === weekEnd
      && typeof recovered.revision === 'string' && Array.isArray(recovered.items)) {
      const replacement = [];
      let valid = true;
      for (const row of recovered.items) {
        if (!Number.isSafeInteger(row.durationSeconds) || row.durationSeconds <= 0
          || !Number.isSafeInteger(row.startMs) || !Number.isSafeInteger(row.endMs)
          || row.endMs <= row.startMs || typeof row.quotaBucket !== 'string'
          || row.durationSeconds > Math.ceil((row.endMs - row.startMs) / 1000)) { valid = false; break; }
        const slices = splitSegmentByLocalHour({ ...row, channel: 'active' });
        if (slices.length === 0 || slices.some((slice) => slice.date !== date)
          || slices.reduce((sum, slice) => sum + seconds(slice.durationSeconds), 0) !== row.durationSeconds) {
          valid = false; break;
        }
        for (const slice of slices) if (slice.durationSeconds > 0) replacement.push({
          startMs: slice.startMs, endMs: slice.endMs, creditedSeconds: slice.durationSeconds, quotaBucket: row.quotaBucket,
        });
      }
      // Known local evidence cannot be contradicted by fallback, even when totals happen to match.
      const key = (row) => JSON.stringify([row.startMs, row.endMs, row.creditedSeconds, row.quotaBucket]);
      const remaining = new Map();
      for (const row of replacement) remaining.set(key(row), (remaining.get(key(row)) || 0) + 1);
      for (const row of intervals) {
        const count = remaining.get(key(row)) || 0;
        if (!count) valid = false;
        else remaining.set(key(row), count - 1);
      }
      for (const correction of correctionBySegmentDate.values()) {
        if (correction.date !== date) continue;
        if (!recovered.items.some((row) => row.startMs === correction.startMs
          && row.endMs === correction.endMs && row.durationSeconds === correction.durationSeconds
          && row.quotaBucket === bucketKey(correction, 'effective'))) valid = false;
      }
      if (valid) {
        intervals = replacement.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
        recoveredValid = true;
        reasons.delete('CORRECTION_SEGMENT_MISSING');
      } else reasons.add('RECOVERED_INTERVAL_CONFLICT');
    }
    // Read-only diagnostics: never invent intervals from retained aggregate seconds.
    if (activeSeconds > 0 && intervals.length === 0) {
      if (activeSourceCount === 0) reasons.add('SOURCE_ACTIVE_SEGMENTS_ABSENT');
      if (missingIdCount > 0) reasons.add('SOURCE_ACTIVE_ID_MISSING');
      if (invalidTimeCount > 0) reasons.add('SOURCE_ACTIVE_TIME_INVALID');
      if (activeSourceCount > missingIdCount + invalidTimeCount && inWeekSourceCount === 0) {
        reasons.add('SOURCE_ACTIVE_OUTSIDE_WEEK');
      }
    }
    if (!evidenceValid) reasons.add('CORRECTION_EVIDENCE_UNAVAILABLE');
    if (day.complete !== true) reasons.add('AUTHORITATIVE_STATS_INCOMPLETE');
    if (!recoveredValid && seconds(statsByDate[date]?.compactedByChannel?.active) > 0) reasons.add('COMPACTED_INTERVAL_MISSING');
    if (intervals.length > 500) reasons.add('EVIDENCE_INTERVAL_LIMIT');
    for (let index = 1; index < intervals.length; index++) {
      if (intervals[index].startMs < intervals[index - 1].endMs) reasons.add('ACTIVE_INTERVAL_OVERLAP');
    }
    for (const interval of intervals) {
      if (!Number.isSafeInteger(interval.startMs) || !Number.isSafeInteger(interval.endMs)
        || interval.endMs <= interval.startMs
        || interval.creditedSeconds > Math.ceil((interval.endMs - interval.startMs) / 1000)) {
        reasons.add('EVIDENCE_INTERVAL_INVALID');
      }
    }
    const byBucket = {};
    for (const interval of intervals) byBucket[interval.quotaBucket] = (byBucket[interval.quotaBucket] || 0) + interval.creditedSeconds;
    if (Object.values(byBucket).reduce((sum, value) => sum + value, 0) !== activeSeconds
      || new Set([...Object.keys(byBucket), ...Object.keys(quotaBucketSeconds)]).size
        !== Object.keys(quotaBucketSeconds).length
      || Object.entries(quotaBucketSeconds).some(([bucket, value]) => (byBucket[bucket] || 0) !== value)) {
      reasons.add('EVIDENCE_TOTAL_MISMATCH');
    }
    const statisticsRevision = await digest(statsByDate[date] || null);
    const correctionRevision = await digest({
      sourceRevision: evidenceValid ? correctionEvidence.revision : 'unavailable',
      compact: (compactCorrections || []).filter((row) => row.date === date),
      evidence: evidenceValid ? correctionEvidence.items.filter((row) => row.date === date) : [],
      intervalEvidenceRevision: recoveredValid ? recovered.revision : null,
    });
    const draft = {
      date, statisticsRevision, correctionRevision, computedAtMs: now,
      activeSeconds, quotaBucketSeconds, complete: reasons.size === 0,
      incompleteReasonCodes: [...reasons].sort(),
      intervals: reasons.has('ACTIVE_INTERVAL_OVERLAP') || reasons.has('EVIDENCE_INTERVAL_INVALID')
        ? [] : intervals.slice(0, 500),
    };
    snapshots.push({ ...draft, snapshotRevision: await digest({ ...draft, computedAtMs: undefined }) });
  }
  return snapshots;
}

export async function readCurrentWeekBrowserSnapshots(now = Date.now()) {
  const throughDate = new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
  const { weekStart, weekEnd } = getBeijingWeekPeriod(throughDate);
  const stored = await chrome.storage.local.get([
    'daily_usage_stats_v1', 'usage_segments_v1', 'guardian_config', 'usage_compacted_facts_v1',
  ]);
  const sync = getSyncState();
  const deviceId = sync?.deviceId || null;
  let correctionEvidence = null;
  try { correctionEvidence = await readDeviceCorrectionEvidenceWeek(); } catch (_) { /* Incomplete, never guessed. */ }
  const options = {
    statsByDate: stored.daily_usage_stats_v1 || {},
    segmentsById: stored.usage_segments_v1 || {},
    compactCorrections: stored.guardian_config?.usageAccountingCorrectionsV1 || [],
    correctionEvidence, deviceId, weekStart, weekEnd, throughDate, now,
  };
  const snapshots = await buildAuthoritativeDailySnapshots(options);
  const intervalEvidenceByDate = {};
  for (const snapshot of snapshots) {
    if (snapshot.activeSeconds > 0 && snapshot.incompleteReasonCodes.some((reason) =>
      reason === 'EVIDENCE_TOTAL_MISMATCH' || reason === 'COMPACTED_INTERVAL_MISSING'
      || reason === 'CORRECTION_SEGMENT_MISSING')) {
      try { intervalEvidenceByDate[snapshot.date] = await readDeviceIntervalEvidenceDay(snapshot.date); }
      catch (_) { /* Failure is isolated to the shadow; original accounting is untouched. */ }
    }
  }
  return Object.keys(intervalEvidenceByDate).length
    ? buildAuthoritativeDailySnapshots({ ...options, intervalEvidenceByDate }) : snapshots;
}

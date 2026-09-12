// Pure raw-fact reaggregation and comparison for Package F shadow reconciliation.

import { splitSegmentByLocalHour } from './usage-segments.js';
import { hashUsageSegmentContent } from './usage-segment-integrity.js';
import {
  canonicalDeviceAccountJson,
  hashDeviceAccountValue,
  validateDeviceAccountRows,
} from './device-account-v2.js';

function finiteOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function addRow(map, row) {
  if (!Number.isSafeInteger(row.durationSeconds) || row.durationSeconds <= 0) return;
  const identity = canonicalDeviceAccountJson({
    kind: row.kind,
    periodKey: row.periodKey,
    subject: row.kind.endsWith('_domain') ? row.domain : row.targetKey,
    channel: row.channel,
    mode: row.mode,
    quotaBucket: row.kind.endsWith('_target') ? row.quotaBucket : null,
  });
  const previous = map.get(identity);
  if (!previous) {
    map.set(identity, { ...row, segmentsCount: 1 });
    return;
  }
  previous.durationSeconds += row.durationSeconds;
  previous.segmentsCount += 1;
  if (row.firstSeenAt !== null) previous.firstSeenAt = previous.firstSeenAt === null ? row.firstSeenAt : Math.min(previous.firstSeenAt, row.firstSeenAt);
  if (row.lastSeenAt !== null) previous.lastSeenAt = previous.lastSeenAt === null ? row.lastSeenAt : Math.max(previous.lastSeenAt, row.lastSeenAt);
}

function domainRow(kind, periodKey, segment) {
  return {
    kind,
    periodKey,
    domain: segment.domain,
    channel: segment.channel,
    mode: segment.mode,
    durationSeconds: Number(segment.durationSeconds),
    segmentsCount: 1,
    firstSeenAt: finiteOrNull(segment.startMs),
    lastSeenAt: finiteOrNull(segment.endMs),
  };
}

function targetRow(kind, periodKey, segment) {
  const managed = typeof segment.managedTargetId === 'string' && segment.managedTargetId.trim();
  return {
    kind,
    periodKey,
    targetKey: managed ? segment.managedTargetId.trim() : `fallback:domain:${segment.domain || 'unknown'}`,
    managedTargetId: managed ? segment.managedTargetId : null,
    managedTargetType: managed ? (segment.managedTargetType || null) : null,
    managedTargetNamespace: managed ? (segment.managedTargetNamespace || null) : null,
    managedTargetValue: managed ? (segment.managedTargetValue || null) : null,
    managedTargetLabelAtTime: managed ? (segment.managedTargetLabelAtTime || null) : null,
    targetSourceAtTime: managed ? (segment.targetSourceAtTime || null) : null,
    targetRuleId: managed ? (segment.targetRuleId || null) : null,
    targetMatchLevel: managed ? (segment.targetMatchLevel || null) : 'domain_fallback',
    targetClassificationAtTime: managed ? (segment.targetClassificationAtTime || null) : null,
    fallbackDomain: segment.domain || null,
    isFallback: !managed,
    channel: segment.channel,
    mode: segment.mode,
    quotaBucket: segment.quotaBucketAtTime || segment.mode || 'unknown',
    durationSeconds: Number(segment.durationSeconds),
    segmentsCount: 1,
    firstSeenAt: finiteOrNull(segment.startMs),
    lastSeenAt: finiteOrNull(segment.endMs),
  };
}

export async function buildAuditDeviceAccountFromSegments(date, segments) {
  const rowMap = new Map();
  const rawFacts = [];
  for (const segment of Array.isArray(segments) ? segments : []) {
    if (!segment?.id || segment.date !== date) continue;
    rawFacts.push({ id: segment.id, contentHash: await hashUsageSegmentContent(segment) });
    if (Number(segment.durationSeconds || 0) <= 0) continue;
    addRow(rowMap, domainRow('daily_domain', date, segment));
    addRow(rowMap, targetRow('daily_target', date, segment));
    for (const slice of splitSegmentByLocalHour(segment)) {
      if (Number(slice.durationSeconds || 0) <= 0) continue;
      addRow(rowMap, domainRow('hourly_domain', slice.hourKey, slice));
      addRow(rowMap, targetRow('hourly_target', slice.hourKey, slice));
    }
  }
  rawFacts.sort((left, right) => left.id.localeCompare(right.id));
  const rows = [...rowMap.values()].sort((left, right) => canonicalDeviceAccountJson(left).localeCompare(canonicalDeviceAccountJson(right)));
  const validation = validateDeviceAccountRows(rows, date);
  if (!validation.ok) {
    const error = new Error(validation.code);
    error.code = validation.code;
    throw error;
  }
  return {
    date,
    rows,
    rowCount: rows.length,
    rawFactCount: rawFacts.length,
    rawFactHash: await hashDeviceAccountValue(rawFacts),
    statsHash: await hashDeviceAccountValue(rows),
    totals: validation.totals,
    totalSeconds: validation.totalSeconds,
  };
}

function summarizeRows(rows) {
  const summary = new Map();
  for (const row of rows || []) {
    const key = canonicalDeviceAccountJson({
      kind: row.kind,
      periodKey: row.periodKey,
      subject: row.kind.endsWith('_domain') ? row.domain : row.targetKey,
      channel: row.channel,
      mode: row.mode,
      quotaBucket: row.kind.endsWith('_target') ? row.quotaBucket : null,
    });
    summary.set(key, Number(row.durationSeconds || 0));
  }
  return summary;
}

export function compareDeviceAccountAudit(expected, audit) {
  const expectedRows = summarizeRows(expected?.rows || []);
  const auditRows = summarizeRows(audit?.rows || []);
  const keys = [...new Set([...expectedRows.keys(), ...auditRows.keys()])].sort();
  const rowDifferences = [];
  for (const key of keys) {
    const expectedSeconds = expectedRows.get(key) || 0;
    const actualSeconds = auditRows.get(key) || 0;
    if (expectedSeconds !== actualSeconds) {
      rowDifferences.push({ bucket: JSON.parse(key), expectedSeconds, actualSeconds, deltaSeconds: actualSeconds - expectedSeconds });
    }
  }
  const rawFactCountDelta = Number(audit?.rawFactCount || 0) - Number(expected?.rawFactCount || 0);
  const totalSecondsDelta = Number(audit?.totalSeconds || 0) - Number(expected?.totalSeconds || 0);
  const matched = rawFactCountDelta === 0 && expected?.rawFactHash === audit?.rawFactHash &&
    expected?.statsHash === audit?.statsHash && totalSecondsDelta === 0 && rowDifferences.length === 0;
  return {
    matched,
    rawFactCountDelta,
    rawFactHashMatched: expected?.rawFactHash === audit?.rawFactHash,
    statsHashMatched: expected?.statsHash === audit?.statsHash,
    totalSecondsDelta,
    rowDifferenceCount: rowDifferences.length,
    rowDifferences: rowDifferences.slice(0, 50),
  };
}


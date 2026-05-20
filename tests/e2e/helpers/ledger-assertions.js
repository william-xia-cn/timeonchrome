'use strict';

const DEFAULT_FORBIDDEN_FOREGROUND_OPERATIONS = ['tabAudible', 'mediaState', 'windowFocusPolled'];

function endpointReason(description, side, fallback) {
  const endpoint = description?.[side];
  return endpoint?.operation || endpoint?.reason || fallback || null;
}

function normalizeUsageSegments(input = {}) {
  return Object.values(input || {})
    .filter(Boolean)
    .map((segment) => ({
      ...segment,
      durationSeconds: Number(segment.durationSeconds || 0),
      startMs: Number(segment.startMs || 0),
      endMs: Number(segment.endMs || 0),
      openOperation: endpointReason(segment.description, 'start', segment.openOperation),
      closeOperation: endpointReason(segment.description, 'end', segment.closeOperation),
    }))
    .sort((a, b) => (a.startMs - b.startMs) || (a.endMs - b.endMs) || String(a.id || '').localeCompare(String(b.id || '')));
}

function normalizeMediaSegments(input = {}) {
  return Object.values(input || {})
    .filter(Boolean)
    .map((segment) => ({
      ...segment,
      durationSeconds: Number(segment.durationSeconds || 0),
      startMs: Number(segment.startMs || 0),
      endMs: Number(segment.endMs || 0),
      openOperation: endpointReason(segment.description, 'start', segment.openOperation),
      closeOperation: endpointReason(segment.description, 'end', segment.closeOperation),
    }))
    .sort((a, b) => (a.startMs - b.startMs) || (a.endMs - b.endMs) || String(a.id || '').localeCompare(String(b.id || '')));
}

async function readLedgerSnapshot(sw) {
  const snapshot = await sw.evaluate(async () => {
    return chrome.storage.local.get([
      'usage_segments_v1',
      'media_segments_v1',
      'daily_usage_stats_v1',
      'daily_media_stats_v1',
    ]);
  });
  return {
    raw: snapshot || {},
    usage: normalizeUsageSegments(snapshot?.usage_segments_v1 || {}),
    media: normalizeMediaSegments(snapshot?.media_segments_v1 || {}),
    dailyUsage: snapshot?.daily_usage_stats_v1 || {},
    dailyMedia: snapshot?.daily_media_stats_v1 || {},
  };
}

function conciseRow(row = {}) {
  return {
    start: Number.isFinite(row.startMs) ? new Date(row.startMs).toISOString().slice(11, 19) : null,
    end: Number.isFinite(row.endMs) ? new Date(row.endMs).toISOString().slice(11, 19) : null,
    seconds: row.durationSeconds,
    domain: row.domain,
    mode: row.mode,
    reason: row.settlementReason || row.reason,
    open: row.openOperation || null,
    close: row.closeOperation || null,
    sourceState: row.sourceState || null,
    tabId: row.tabId ?? null,
    mediaClass: row.mediaClass || null,
    mediaKind: row.mediaKind || null,
  };
}

function formatTimeline(rows = []) {
  return JSON.stringify((rows || []).map(conciseRow), null, 2);
}

function valueMatches(row, expected, key) {
  if (!Object.prototype.hasOwnProperty.call(expected, key)) return true;
  return row?.[key] === expected[key];
}

function durationMatches(row, expected) {
  if (!Object.prototype.hasOwnProperty.call(expected, 'duration')) {
    return true;
  }
  const duration = expected.duration;
  const actual = Number(row.durationSeconds || 0);
  if (typeof duration === 'number') return actual === duration;
  if (duration && typeof duration === 'object') {
    const min = Number.isFinite(duration.min) ? duration.min : Number.NEGATIVE_INFINITY;
    const max = Number.isFinite(duration.max) ? duration.max : Number.POSITIVE_INFINITY;
    return actual >= min && actual <= max;
  }
  return true;
}

function rowMatches(row, expected, ledgerType) {
  const keys = ledgerType === 'media'
    ? ['domain', 'mode', 'settlementReason', 'openOperation', 'closeOperation', 'mediaClass', 'mediaKind', 'visibility', 'tabId', 'windowId']
    : ['domain', 'mode', 'settlementReason', 'openOperation', 'closeOperation', 'sourceState', 'channel', 'tabId', 'windowId'];
  if (!keys.every((key) => valueMatches(row, expected, key))) return false;
  if (!durationMatches(row, expected)) return false;
  if (row.durationSeconds <= 0 && expected.allowZeroDuration !== true) return false;
  return true;
}

function assertTimeline(rows, expectedRows, options = {}, ledgerType = 'usage') {
  const label = options.label || `${ledgerType} timeline`;
  const filtered = typeof options.filter === 'function' ? rows.filter(options.filter) : [...rows];
  let searchFrom = 0;
  const matches = [];

  for (const expected of expectedRows || []) {
    let foundIndex = -1;
    for (let i = searchFrom; i < filtered.length; i += 1) {
      if (rowMatches(filtered[i], expected, ledgerType)) {
        foundIndex = i;
        break;
      }
    }
    if (foundIndex < 0) {
      throw new Error(`${label}: expected row not found\nexpected=${JSON.stringify(expected, null, 2)}\nactual=${formatTimeline(filtered)}`);
    }
    matches.push(filtered[foundIndex]);
    searchFrom = foundIndex + 1;
  }

  if (options.exact === true && filtered.length !== (expectedRows || []).length) {
    throw new Error(`${label}: expected exactly ${(expectedRows || []).length} rows, got ${filtered.length}\nactual=${formatTimeline(filtered)}`);
  }

  return matches;
}

function assertUsageTimeline(rows, expectedRows, options = {}) {
  return assertTimeline(rows, expectedRows, options, 'usage');
}

function assertMediaTimeline(rows, expectedRows, options = {}) {
  return assertTimeline(rows, expectedRows, options, 'media');
}

function assertNoForbiddenForegroundOperations(rows, forbidden = DEFAULT_FORBIDDEN_FOREGROUND_OPERATIONS) {
  const violations = (rows || []).filter((row) =>
    forbidden.includes(row.openOperation) || forbidden.includes(row.closeOperation)
  );
  if (violations.length > 0) {
    throw new Error(`forbidden foreground operation found: ${forbidden.join(', ')}\nviolations=${formatTimeline(violations)}\nall=${formatTimeline(rows)}`);
  }
}

function normalPositiveRows(rows = []) {
  return rows.filter((row) => Number(row.endMs) > Number(row.startMs) && Number(row.durationSeconds || 0) > 0);
}

function assertNoUnexpectedOverlap(rows, ledgerType = 'usage') {
  if (ledgerType === 'media') {
    const groups = new Map();
    for (const row of normalPositiveRows(rows)) {
      const key = `${row.tabId ?? 'unknown'}::${row.mediaClass || 'unknown'}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    for (const [key, group] of groups) {
      assertNoOverlapInSortedRows(group, `media overlap for ${key}`);
    }
    return;
  }
  assertNoOverlapInSortedRows(normalPositiveRows(rows), 'usage overlap');
}

function assertNoOverlapInSortedRows(rows, label) {
  const sorted = [...rows].sort((a, b) => (a.startMs - b.startMs) || (a.endMs - b.endMs));
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (current.startMs < previous.endMs) {
      throw new Error(`${label}: ${current.id || '(current)'} overlaps ${previous.id || '(previous)'}\nrows=${formatTimeline(sorted)}`);
    }
  }
}

module.exports = {
  assertMediaTimeline,
  assertNoForbiddenForegroundOperations,
  assertNoUnexpectedOverlap,
  assertUsageTimeline,
  formatTimeline,
  normalizeMediaSegments,
  normalizeUsageSegments,
  readLedgerSnapshot,
};

function validMs(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function mergeRanges(ranges) {
  const merged = [];
  for (const [start, end] of ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const previous = merged.at(-1);
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function coveredMs(ranges) {
  return mergeRanges(ranges).reduce((sum, [start, end]) => sum + end - start, 0);
}

export function deriveForcedUseContribution(segment, confirmedIntervals = []) {
  if (!segment?.id || !segment.profileId || !segment.deviceId || !segment.date
    || !validMs(segment.startMs) || !validMs(segment.endMs)
    || segment.endMs <= segment.startMs || !validMs(segment.durationSeconds)) {
    return { ok: false, reason: 'segment_invalid' };
  }
  if (segment.channel !== 'active' || segment.durationSeconds === 0) {
    return { ok: true, contribution: null };
  }
  if (!Array.isArray(confirmedIntervals)) return { ok: false, reason: 'intervals_unavailable' };

  const ranges = [];
  const byRuleRanges = new Map();
  const byCauseRanges = new Map();
  for (const interval of confirmedIntervals) {
    if (!interval || interval.profileId !== segment.profileId || interval.deviceId !== segment.deviceId
      || typeof interval.ruleId !== 'string' || !interval.ruleId
      || !validMs(interval.startMs) || !validMs(interval.endMs) || interval.endMs <= interval.startMs) continue;
    if (interval.managedTargetId
      ? interval.managedTargetId !== segment.managedTargetId
      : interval.domain !== segment.domain) continue;
    const start = Math.max(segment.startMs, interval.startMs);
    const end = Math.min(segment.endMs, interval.endMs);
    if (start >= end) continue;
    ranges.push([start, end]);
    const ruleRanges = byRuleRanges.get(interval.ruleId) || [];
    ruleRanges.push([start, end]);
    byRuleRanges.set(interval.ruleId, ruleRanges);
    for (const cause of interval.causes || []) {
      const causeRanges = byCauseRanges.get(cause) || [];
      causeRanges.push([start, end]);
      byCauseRanges.set(cause, causeRanges);
    }
  }
  const spanMs = segment.endMs - segment.startMs;
  const secondsFor = value => Math.floor(segment.durationSeconds * value / spanMs);
  const byRuleSeconds = Object.fromEntries([...byRuleRanges.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([rule, values]) => [rule, secondsFor(coveredMs(values))]));
  const byCauseSeconds = Object.fromEntries([...byCauseRanges.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cause, values]) => [cause, secondsFor(coveredMs(values))]));
  return { ok: true, contribution: {
    sourceSegmentId: segment.id,
    profileId: segment.profileId,
    deviceId: segment.deviceId,
    date: segment.date,
    seconds: secondsFor(coveredMs(ranges)),
    byRuleSeconds,
    byCauseSeconds,
  } };
}

export function addForcedUseContribution(book, contribution) {
  if (!contribution?.sourceSegmentId || !contribution.date || !contribution.profileId || !contribution.deviceId
    || !validMs(contribution.seconds) || !contribution.byRuleSeconds || !contribution.byCauseSeconds
    || Object.values(contribution.byRuleSeconds).some(value => !validMs(value))
    || Object.values(contribution.byCauseSeconds).some(value => !validMs(value))) {
    return { ok: false, reason: 'contribution_invalid' };
  }
  const current = book?.[contribution.sourceSegmentId];
  if (current) {
    return JSON.stringify(current) === JSON.stringify(contribution)
      ? { ok: true, duplicate: true, book }
      : { ok: false, reason: 'contribution_conflict' };
  }
  return { ok: true, duplicate: false,
    book: { ...(book || {}), [contribution.sourceSegmentId]: contribution } };
}

export function summarizeForcedUseDay(book, { profileId, deviceId, date }) {
  const rows = Object.values(book || {}).filter(row => row?.profileId === profileId
    && row.deviceId === deviceId && row.date === date);
  const byRuleSeconds = {};
  const byCauseSeconds = {};
  for (const row of rows) {
    for (const [ruleId, seconds] of Object.entries(row.byRuleSeconds || {})) {
      byRuleSeconds[ruleId] = (byRuleSeconds[ruleId] || 0) + seconds;
    }
    for (const [cause, seconds] of Object.entries(row.byCauseSeconds || {})) {
      byCauseSeconds[cause] = (byCauseSeconds[cause] || 0) + seconds;
    }
  }
  return { seconds: rows.reduce((sum, row) => sum + row.seconds, 0), byRuleSeconds, byCauseSeconds };
}

// core/suspect-segments.js — local-only historical segment suspicion rules

const ACTIVE_LONG_SECONDS = 3 * 60 * 60;
const ACTIVE_CROSS_DAY_LONG_SECONDS = 30 * 60;
const STALE_CLOSE_LONG_SECONDS = 30 * 60;

function parseTimezoneOffset(tz) {
  if (!tz) return null;
  const offsetMatch = String(tz).match(/^([+-])(\d{2}):(\d{2})$/);
  if (offsetMatch) {
    const hours = parseInt(offsetMatch[2], 10);
    const minutes = parseInt(offsetMatch[3], 10);
    const total = hours * 60 + minutes;
    return offsetMatch[1] === '-' ? -total : total;
  }
  const known = {
    'Asia/Shanghai': 480,
    'Asia/Tokyo': 540,
    'Asia/Seoul': 540,
    'Asia/Singapore': 480,
    'Asia/Kolkata': 330,
    'Europe/London': 0,
    'Europe/Paris': 60,
    'Europe/Berlin': 60,
    'America/New_York': -300,
    'America/Chicago': -360,
    'America/Denver': -420,
    'America/Los_Angeles': -480,
  };
  return known[tz] ?? null;
}

function localDateKey(epochMs, timezone) {
  const offsetMinutes = parseTimezoneOffset(timezone);
  const offsetMs = (typeof offsetMinutes === 'number' ? offsetMinutes : -new Date().getTimezoneOffset()) * 60 * 1000;
  const d = new Date(Number(epochMs || 0) + offsetMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function isActiveLike(segment) {
  return segment?.channel === 'active' || segment?.sourceState === 'ACTIVE';
}

function isStaleRecoveryOrTabClose(segment) {
  const reason = String(segment?.settlementReason || '').toLowerCase();
  return reason.includes('stale') || reason.includes('recovery') || reason.includes('tab_close');
}

function buildEvidence(segment, crossDay) {
  return {
    durationSeconds: Number(segment?.durationSeconds || 0),
    settlementReason: segment?.settlementReason || null,
    sourceState: segment?.sourceState || null,
    channel: segment?.channel || null,
    crossDay: !!crossDay,
  };
}

export function evaluateSuspectSegment(segment) {
  const durationSeconds = Number(segment?.durationSeconds || 0);
  if (!segment || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return { suspect: false, reason: null, evidence: buildEvidence(segment, false) };
  }

  const startDate = Number.isFinite(segment.startMs) ? localDateKey(segment.startMs, segment.timezone) : segment.date;
  const endDate = Number.isFinite(segment.endMs) ? localDateKey(Math.max(segment.startMs || 0, segment.endMs - 1), segment.timezone) : segment.date;
  const crossDay = !!startDate && !!endDate && startDate !== endDate;
  const evidence = buildEvidence(segment, crossDay);

  if (isActiveLike(segment) && durationSeconds > ACTIVE_CROSS_DAY_LONG_SECONDS && crossDay) {
    return { suspect: true, reason: 'active_cross_day_over_30m', evidence };
  }

  if (segment.channel === 'active' && durationSeconds > ACTIVE_LONG_SECONDS) {
    return { suspect: true, reason: 'active_over_3h', evidence };
  }

  if (isStaleRecoveryOrTabClose(segment) && durationSeconds > STALE_CLOSE_LONG_SECONDS) {
    return { suspect: true, reason: 'stale_recovery_tab_close_over_30m', evidence };
  }

  if (segment.sourceState === 'ACTIVE' && durationSeconds > ACTIVE_LONG_SECONDS) {
    return { suspect: true, reason: 'active_source_over_3h', evidence };
  }

  return { suspect: false, reason: null, evidence };
}

export function scanSuspectSegments(segments) {
  const values = Array.isArray(segments)
    ? segments
    : Object.values(segments || {});
  return values.map((segment) => ({
    segment,
    evaluation: evaluateSuspectSegment(segment),
  })).filter((item) => item.evaluation.suspect);
}

// runtime/time-boundary.js — shared stale-gap accounting boundary helpers

export const STALE_GAP_THRESHOLD = 90 * 1000;

export function isFiniteTime(value) {
  return Number.isFinite(value);
}

export function clampTime(value, min, max) {
  const safeMin = isFiniteTime(min) ? min : 0;
  const safeMax = isFiniteTime(max) ? max : safeMin;
  const lower = Math.min(safeMin, safeMax);
  const upper = Math.max(safeMin, safeMax);
  if (!isFiniteTime(value)) return upper;
  return Math.min(Math.max(value, lower), upper);
}

export function isStaleSession(session, now, threshold = STALE_GAP_THRESHOLD) {
  if (!session || !isFiniteTime(now) || !isFiniteTime(session.lastHeartbeat)) return false;
  return now - session.lastHeartbeat > threshold;
}

export function getReliableCloseTime(session, now, options = {}) {
  const startTime = isFiniteTime(session?.startTime) ? session.startTime : now;
  const stale = options.forceStale || isStaleSession(session, now, options.threshold ?? STALE_GAP_THRESHOLD);
  const candidate = stale ? session?.lastHeartbeat : now;
  const closeTime = clampTime(candidate, startTime, now);
  return { closeTime, stale };
}

export function getCappedElapsedMs(session, now) {
  if (!isFiniteTime(session?.startTime) || !isFiniteTime(now)) return 0;
  const { closeTime } = getReliableCloseTime(session, now);
  return Math.max(0, closeTime - session.startTime);
}

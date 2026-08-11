export const EXHAUSTED_AUTO_RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export function isSyncRetryCandidate({
  retryCount = 0,
  lastAttemptAt = 0,
  force = false,
  now = Date.now(),
  maxAttempts = 3,
  cooldownMs = EXHAUSTED_AUTO_RETRY_COOLDOWN_MS,
} = {}) {
  if (force) return true;
  if (Math.max(0, Number(retryCount) || 0) < Math.max(1, Number(maxAttempts) || 1)) return true;
  const last = Math.max(0, Number(lastAttemptAt) || 0);
  if (!last) return true;
  return Math.max(0, Number(now) || 0) - last >= Math.max(0, Number(cooldownMs) || 0);
}

export const ForegroundConfidence = {
  TRUSTED_ACTIVE: 'TRUSTED_ACTIVE',
  INFERRED_FOREGROUND: 'INFERRED_FOREGROUND',
  SUSPECT: 'SUSPECT',
};

export const ACTIVITY_GRACE_MS = 180_000;
export const PASSIVE_FOREGROUND_GRACE_MS = 600_000;
export const MAX_UNCHECKPOINTED_MS = 300_000;
export const CLOSE_TAIL_MAX_MS = 120_000;
export const CHECKPOINT_INTERVAL_MS = 60_000;

export function hasOrdinaryForegroundBase(evidence) {
  const focused = evidence?.isFocused === true || evidence?.state === 'ACTIVE';
  return !!(
    evidence?.domain &&
    evidence?.tabId != null &&
    focused &&
    evidence?.pageVisible === true &&
    !evidence?.isIdle
  );
}

export function resolveForegroundConfidence(evidence, now = Date.now()) {
  if (!hasOrdinaryForegroundBase(evidence)) {
    return { confidence: ForegroundConfidence.SUSPECT, reason: 'missing_foreground_base' };
  }

  const lastActivity = Number(evidence.lastPageActivityAt) || 0;
  if (lastActivity > 0 && now - lastActivity <= ACTIVITY_GRACE_MS) {
    return { confidence: ForegroundConfidence.TRUSTED_ACTIVE, reason: 'recent_page_activity' };
  }

  const foregroundStart = Number(evidence.lastVisibleAt || evidence.startTime || evidence.foregroundStartedAt) || now;
  if (now - foregroundStart <= PASSIVE_FOREGROUND_GRACE_MS) {
    return { confidence: ForegroundConfidence.INFERRED_FOREGROUND, reason: 'passive_foreground_grace' };
  }

  return { confidence: ForegroundConfidence.SUSPECT, reason: 'passive_grace_expired' };
}

export function isForegroundCountable(confidence) {
  return confidence === ForegroundConfidence.TRUSTED_ACTIVE ||
    confidence === ForegroundConfidence.INFERRED_FOREGROUND;
}

export function hasCheckpointGap(session, now = Date.now()) {
  const lastCheckpointAt = Number(session?.lastCheckpointAt || session?.startTime) || 0;
  return lastCheckpointAt > 0 && now - lastCheckpointAt > MAX_UNCHECKPOINTED_MS;
}

export function getBoundedForegroundCloseTime(session, observedAt = Date.now()) {
  const startTime = Number(session?.startTime) || observedAt;
  const candidates = [
    observedAt,
    startTime + MAX_UNCHECKPOINTED_MS,
  ];
  if (Number.isFinite(session?.lastForegroundEvidenceAt)) {
    candidates.push(session.lastForegroundEvidenceAt + CLOSE_TAIL_MAX_MS);
  }
  if (Number.isFinite(session?.lastCheckpointAt)) {
    candidates.push(session.lastCheckpointAt + CLOSE_TAIL_MAX_MS);
  }
  const closeTime = Math.min(...candidates.filter(Number.isFinite));
  return Math.min(Math.max(closeTime, startTime), observedAt);
}

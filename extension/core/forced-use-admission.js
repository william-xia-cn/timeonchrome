import { readForcedUsePolicy, decideForcedUseAccess } from './forced-use-policy.js';
import { buildForcedUseQuotaFacts, selectForcedUseQuotaFacts } from './forced-use-quota-facts.js';
import { acknowledgeForcedUseReminderProgress } from './forced-use-reminder-progress.js';

function signature(policy, facts, quotaBucket, advisoryWindow) {
  const selected = selectForcedUseQuotaFacts(facts, quotaBucket);
  if (!selected.ok) return null;
  return JSON.stringify([
    policy,
    selected.quotas.map(({ id, limitSeconds, overrunSeconds }) => [id, limitSeconds, overrunSeconds]),
    advisoryWindow?.active === true
      ? [advisoryWindow.id, advisoryWindow.key ?? null, advisoryWindow.maxSeconds]
      : null,
  ]);
}

// Presentation only: never used by admission, grants, or quota accounting.
export function nextForcedUseWindow(config, quotaBucket, observedAt) {
  if (!Number.isFinite(observedAt)) return null;
  const local = new Date(observedAt + 28800000);
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const field = { study: 'studyWindows', composite: 'compositeWindows', rest: 'restWindows' }[quotaBucket];
  if (!field || !config?.timeWindows?.daily) return null;
  const minute = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
    : value === '24:00' ? 1440 : null;
  for (let offset = 0; offset <= 7; offset++) {
    const windows = config.timeWindows.daily[days[(local.getUTCDay() + offset) % 7]]?.[field];
    if (!Array.isArray(windows) || !windows.length) {
      if (offset) return { dayOffset: offset, start: '00:00', end: '24:00' };
      return null;
    }
    const next = windows.filter(w => minute(w?.start) !== null && minute(w?.end) !== null
      && minute(w.start) < minute(w.end)
      && (offset > 0 || minute(w.start) > local.getUTCHours() * 60 + local.getUTCMinutes()))
      .sort((a, b) => minute(a.start) - minute(b.start))[0];
    if (next) return { dayOffset: offset, start: next.start, end: next.end };
  }
  return null;
}

export function prepareForcedUseAdmission({ config, usage, dateKey, domain, quotaBucket, classification, observedAt,
  absoluteBlocks = [], advisoryWindow = null, reminderState = null, identityKey, ruleKey,
  forcedUsageSeconds } = {}) {
  const policy = readForcedUsePolicy(config);
  if (!policy.enabled) return { ok: true, action: 'legacy', reason: policy.reason || null };
  const facts = buildForcedUseQuotaFacts(config, usage, policy, { date: dateKey, domain });
  const decision = decideForcedUseAccess({ policy, quotaFacts: facts, quotaBucket,
    absoluteBlocks, advisoryWindow, reminderState, identityKey, dateKey,
    ruleKey, forcedUsageSeconds });
  if (!decision.ok) return decision;
  if (decision.action === 'block') return decision;
  const policySignature = signature(policy, facts, quotaBucket, advisoryWindow);
  if (!policySignature) return { ok: false, action: 'block', reasons: ['quota_bucket_unavailable'] };
  const presentation = {
    kind: decision.kind,
    quotas: facts.quotas.filter(row => decision.reasons?.includes(row.id))
      .map(({ id, usedSeconds, limitSeconds }) => ({ id, usedSeconds, limitSeconds })),
    classification,
    sinceConfirmationSeconds: Number.isSafeInteger(decision.progress?.baselineSeconds)
      ? decision.progress.forcedUsageSeconds - decision.progress.baselineSeconds : null,
    nextWindow: decision.reasons?.includes('timeWindow')
      ? nextForcedUseWindow(config, quotaBucket, observedAt) : null,
  };
  return { ...decision, identityKey, dateKey, ruleKey, quotaBucket, policySignature, presentation };
}

export function confirmForcedUseAdmission(shown, latest, reminderState) {
  if (shown?.action !== 'confirm' || latest?.ok !== true || latest.action !== 'confirm'
    || !shown.progress || !latest.progress
    || shown.identityKey !== latest.identityKey || shown.dateKey !== latest.dateKey
    || shown.ruleKey !== latest.ruleKey || shown.quotaBucket !== latest.quotaBucket
    || shown.policySignature !== latest.policySignature
    || JSON.stringify(shown.reasons) !== JSON.stringify(latest.reasons)) {
    return { ok: false, reason: 'forced_use_confirmation_stale' };
  }
  return acknowledgeForcedUseReminderProgress(reminderState, latest.progress);
}

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

export function prepareForcedUseAdmission({ config, usage, dateKey, domain, quotaBucket,
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
  return { ...decision, identityKey, dateKey, ruleKey, quotaBucket, policySignature };
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

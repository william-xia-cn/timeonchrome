import { getEffectiveQuotaForDate } from './quota-config.js';
import { readForcedUsePolicy, evaluateForcedUsePolicy } from './forced-use-policy.js';
import { buildForcedUseQuotaFacts, selectForcedUseQuotaFacts } from './forced-use-quota-facts.js';
import { nextForcedUseWindow } from './forced-use-admission.js';

export function hasApplicableSharedQuota(config, quotaBucket, domain, date) {
  const quota = getEffectiveQuotaForDate(config, date).todayEffectiveQuota;
  const fields = { study: ['studyMinutes'], composite: ['compositeMinutes'],
    rest: ['restMinutes', 'weeklyRestMinutes'], other: [] }[quotaBucket];
  if (!fields) return true;
  const limited = value => value !== null && value !== undefined && Number.isFinite(Number(value));
  return ['onlineMinutes', ...fields].some(key => limited(quota[key]))
    || limited(config.domainQuotas?.[domain]) && Number(config.domainQuotas[domain]) > 0;
}

export function prepareSharedForcedUseAdmission({ config, usage, dateKey, domain, quotaBucket,
  classification, advisoryWindow = null, identityKey, ruleKey, policyIdentity, observedAt,
  restrictedEntry = false, confirmed = false } = {}) {
  const policy = readForcedUsePolicy(config);
  if (!policy.enabled) return { ok: false, action: 'block', reasons: ['shared_forced_use_policy_unavailable'] };
  const applicable = hasApplicableSharedQuota(config, quotaBucket, domain, dateKey);
  const facts = applicable
    ? buildForcedUseQuotaFacts(config, usage, policy, { date: dateKey, domain, quotaBucket })
    : { ok: true, quotas: [] };
  const selected = selectForcedUseQuotaFacts(facts, quotaBucket);
  if (!selected.ok) return { ok: false, action: 'block', reasons: [selected.reason] };
  const decision = evaluateForcedUsePolicy({ quotas: selected.quotas, advisoryWindow });
  if (decision.action === 'block') return { ok: true, ...decision };
  const reasons = [...new Set([...decision.reasons, ...(restrictedEntry ? ['restrictedEntry'] : [])])];
  return { ok: true, sharedRuntimeV2: true, action: reasons.length && !confirmed ? 'confirm' : 'allow',
    kind: reasons.length ? 'entry' : null, reasons, identityKey, dateKey, ruleKey, quotaBucket, policyIdentity,
    presentation: { kind: 'entry', classification,
      quotas: selected.quotas.filter(row => reasons.includes(row.id))
        .map(({ id, usedSeconds, limitSeconds }) => ({ id, usedSeconds, limitSeconds })),
      nextWindow: reasons.includes('timeWindow') ? nextForcedUseWindow(config, quotaBucket, observedAt) : null },
  };
}

import { getEffectiveQuotaForDate } from './quota-config.js';

const FIELDS = [
  ['dailyStudy', 'studySeconds', 'studyMinutes'],
  ['dailyComposite', 'compositeSeconds', 'compositeMinutes'],
  ['dailyRest', 'restSeconds', 'restMinutes'],
  ['dailyOnline', 'totalSeconds', 'onlineMinutes'],
  ['weeklyRest', 'weekRestSeconds', 'weeklyRestMinutes'],
];

function validSeconds(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validLimit(value) {
  return value === null || Number.isInteger(value) && value >= 0;
}

export function buildForcedUseQuotaFacts(config, usage, policy, { date, domain, quotaBucket } = {}) {
  if (usage?.ok !== true || !policy?.enabled || !policy.quotaOverrunMinutes
    || typeof date !== 'string' || domain !== undefined && (typeof domain !== 'string' || !domain)) {
    return { ok: false, reason: 'quota_facts_unavailable' };
  }
  const effective = getEffectiveQuotaForDate(config, date).todayEffectiveQuota;
  const quotas = [];
  const applicable = quotaBucket === undefined ? null : {
    study: ['dailyStudy', 'dailyOnline', 'domain'], composite: ['dailyComposite', 'dailyOnline', 'domain'],
    rest: ['dailyRest', 'weeklyRest', 'dailyOnline', 'domain'], other: ['dailyOnline', 'domain'],
  }[quotaBucket];
  if (quotaBucket !== undefined && !applicable) return { ok: false, reason: 'quota_bucket_unavailable' };
  for (const [id, usageField, limitField] of FIELDS) {
    if (applicable && !applicable.includes(id)) continue;
    const limit = effective[limitField];
    if (!validLimit(limit)) return { ok: false, reason: 'quota_limit_invalid' };
    if (limit === null) continue;
    const seconds = usage[usageField];
    if (!validSeconds(seconds)) return { ok: false, reason: 'quota_usage_invalid' };
    const overrunMinutes = config?.autonomyConfig?.quotaOverrunConfirmationRequired === false ? 0
      : ['dailyRest', 'weeklyRest'].includes(id) ? policy.quotaOverrunMinutes[id] : null;
    if (!validLimit(overrunMinutes)) return { ok: false, reason: 'quota_policy_invalid' };
    quotas.push({ id, usedSeconds: seconds, limitSeconds: limit * 60,
      overrunSeconds: overrunMinutes === null ? null : overrunMinutes * 60 });
  }
  if (domain === undefined) return { ok: true, quotas };
  const domainLimit = config?.domainQuotas?.[domain];
  if (domainLimit !== undefined && domainLimit !== null) {
    const parsedDomainLimit = Number(domainLimit);
    if (!Number.isInteger(parsedDomainLimit) || parsedDomainLimit < 0) {
      return { ok: false, reason: 'domain_limit_invalid' };
    }
    if (parsedDomainLimit === 0) return { ok: true, quotas };
    if (!usage.domainSeconds || typeof usage.domainSeconds !== 'object') {
      return { ok: false, reason: 'domain_usage_invalid' };
    }
    const seconds = usage.domainSeconds[domain] ?? 0;
    if (!validSeconds(seconds)) return { ok: false, reason: 'domain_usage_invalid' };
    const overrunMinutes = config?.autonomyConfig?.quotaOverrunConfirmationRequired === false ? 0 : null;
    if (!validLimit(overrunMinutes)) return { ok: false, reason: 'quota_policy_invalid' };
    quotas.push({ id: 'domain', usedSeconds: seconds, limitSeconds: parsedDomainLimit * 60,
      overrunSeconds: overrunMinutes === null ? null : overrunMinutes * 60 });
  }
  return { ok: true, quotas };
}

export function selectForcedUseQuotaFacts(facts, quotaBucket) {
  if (!facts?.ok || !Array.isArray(facts.quotas)
    || !['study', 'composite', 'rest', 'other'].includes(quotaBucket)) {
    return { ok: false, reason: 'quota_bucket_unavailable' };
  }
  const applicable = {
    study: ['dailyOnline', 'domain', 'dailyStudy'],
    composite: ['dailyOnline', 'domain', 'dailyComposite'],
    rest: ['dailyOnline', 'domain', 'dailyRest', 'weeklyRest'],
    other: ['dailyOnline', 'domain'],
  }[quotaBucket];
  return { ok: true, quotas: facts.quotas.filter(row => applicable.includes(row.id)) };
}

export function forcedCompositeFinalRemainingSeconds(facts) {
  const selected = selectForcedUseQuotaFacts(facts, 'composite');
  if (!selected.ok) return selected;
  const composite = selected.quotas.find(row => row.id === 'dailyComposite');
  if (!composite || composite.overrunSeconds === null) return { ok: true, seconds: null };
  return { ok: true, seconds: Math.max(0,
    composite.limitSeconds + composite.overrunSeconds - composite.usedSeconds) };
}

export function buildForcedUseHardQuotaState(config, usage, policy, { date } = {}) {
  const general = buildForcedUseQuotaFacts(config, usage, policy, { date });
  if (!general.ok) return general;
  const finalReached = quota => quota.overrunSeconds !== null
    && quota.usedSeconds >= quota.limitSeconds + quota.overrunSeconds;
  const blocked = new Set(general.quotas.filter(finalReached).map(quota => quota.id));
  const domainQuotas = config?.domainQuotas || {};
  if (!usage.domainSeconds || typeof usage.domainSeconds !== 'object') {
    return { ok: false, reason: 'domain_usage_invalid' };
  }
  const lockedDomains = [];
  for (const domain of Object.keys(domainQuotas)) {
    const facts = buildForcedUseQuotaFacts(config, usage, policy, { date, domain });
    if (!facts.ok) return facts;
    if (facts.quotas.some(quota => quota.id === 'domain' && finalReached(quota))) lockedDomains.push(domain);
  }
  const dailyRestLocked = blocked.has('dailyRest');
  const weeklyRestLocked = blocked.has('weeklyRest');
  return { ok: true, lockedDomains: lockedDomains.sort(), state: {
    onlineLocked: blocked.has('dailyOnline'),
    studyLocked: blocked.has('dailyStudy'),
    undeterminedLocked: blocked.has('dailyComposite'),
    dailyRestLocked,
    weeklyRestLocked,
    restLocked: dailyRestLocked || weeklyRestLocked,
  } };
}

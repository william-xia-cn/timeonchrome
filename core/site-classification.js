import { matchDomain, normalizeHostname } from './domain-semantics.js';

export const SITE_CLASSIFICATION_TARGET_TYPES = new Set(['host', 'url']);
export const SITE_CLASSIFICATION_DECISIONS = new Set(['study', 'composite', 'reject']);
export const SITE_CLASSIFICATION_STATUSES = new Set(['pending', 'approved_study', 'approved_composite', 'rejected']);

export function normalizeSiteClassificationTarget(input) {
  const rawInput = String(input || '').trim();
  if (!rawInput) {
    return { ok: false, code: 'EMPTY_TARGET', error: 'empty target' };
  }

  if (/^https?:\/\//i.test(rawInput)) {
    try {
      const parsed = new URL(rawInput);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, code: 'UNSUPPORTED_PROTOCOL', error: 'only http/https URL is supported' };
      }
      if (parsed.username || parsed.password) {
        return { ok: false, code: 'URL_CREDENTIALS_UNSUPPORTED', error: 'URL credentials are not supported' };
      }
      const host = normalizeHostname(parsed.hostname);
      if (!host) {
        return { ok: false, code: 'INVALID_TARGET', error: 'invalid URL host' };
      }
      parsed.hash = '';
      parsed.hostname = host;
      parsed.protocol = parsed.protocol.toLowerCase();
      const normalizedValue = `${parsed.protocol}//${host}${parsed.pathname || '/'}${parsed.search || ''}`;
      return {
        ok: true,
        targetType: 'url',
        rawInput,
        normalizedValue,
        displayValue: normalizedValue,
        host,
      };
    } catch (_) {
      return { ok: false, code: 'INVALID_URL', error: 'invalid URL' };
    }
  }

  if (/[/?#]/.test(rawInput)) {
    return { ok: false, code: 'URL_REQUIRES_PROTOCOL', error: 'URL target must include http:// or https://' };
  }

  const host = normalizeHostname(rawInput);
  if (!host) {
    return { ok: false, code: 'INVALID_HOST', error: 'invalid host' };
  }
  return {
    ok: true,
    targetType: 'host',
    rawInput,
    normalizedValue: host,
    displayValue: host,
    host,
  };
}

export function normalizeSiteClassificationDecision(decision) {
  if (decision === 'approved_study' || decision === 'study') return 'study';
  if (decision === 'approved_composite' || decision === 'composite') return 'composite';
  if (decision === 'rejected' || decision === 'reject') return 'reject';
  return null;
}

export function decisionToStatus(decision) {
  const normalized = normalizeSiteClassificationDecision(decision);
  if (normalized === 'study') return 'approved_study';
  if (normalized === 'composite') return 'approved_composite';
  if (normalized === 'reject') return 'rejected';
  return null;
}

export function normalizeSiteClassificationRule(rule) {
  if (!rule || typeof rule !== 'object') return null;
  const targetType = rule.targetType || rule.type || rule.decisionTargetType || rule.requestedTargetType;
  const value = rule.normalizedValue || rule.targetValue || rule.decisionNormalizedValue || rule.requestedNormalizedValue || rule.value;
  if (!SITE_CLASSIFICATION_TARGET_TYPES.has(targetType) || typeof value !== 'string' || !value.trim()) return null;
  const target = normalizeSiteClassificationTarget(targetType === 'url' ? value : value.trim());
  if (!target.ok || target.targetType !== targetType) return null;
  const decision = normalizeSiteClassificationDecision(rule.decision || rule.classification || rule.status);
  if (!decision) return null;
  return {
    ...rule,
    targetType,
    normalizedValue: target.normalizedValue,
    targetValue: target.normalizedValue,
    decision,
    status: decisionToStatus(decision),
  };
}

export function normalizeSiteClassificationRequest(record) {
  if (!record || typeof record !== 'object') return null;
  const requestedTargetType = record.requestedTargetType || record.targetType || record.type;
  const requestedValue = record.requestedNormalizedValue || record.normalizedValue || record.targetValue || record.value;
  if (!SITE_CLASSIFICATION_TARGET_TYPES.has(requestedTargetType) || typeof requestedValue !== 'string') return null;
  const requested = normalizeSiteClassificationTarget(requestedTargetType === 'url' ? requestedValue : requestedValue.trim());
  if (!requested.ok || requested.targetType !== requestedTargetType) return null;
  const status = SITE_CLASSIFICATION_STATUSES.has(record.status) ? record.status : 'pending';
  const out = {
    ...record,
    requestedTargetType,
    requestedNormalizedValue: requested.normalizedValue,
    requestedRawInput: record.requestedRawInput || record.rawInput || requested.rawInput,
    displayValue: record.displayValue || requested.displayValue,
    status,
  };
  if (record.decisionTargetType && record.decisionNormalizedValue) {
    const decision = normalizeSiteClassificationTarget(
      record.decisionTargetType === 'url' ? record.decisionNormalizedValue : record.decisionNormalizedValue.trim()
    );
    if (decision.ok && decision.targetType === record.decisionTargetType) {
      out.decisionTargetType = record.decisionTargetType;
      out.decisionNormalizedValue = decision.normalizedValue;
    }
  }
  return out;
}

export function siteTargetMatchesUrl(target, urlOrDomain) {
  if (!target || !urlOrDomain) return false;
  const targetType = target.targetType || target.type || target.decisionTargetType || target.requestedTargetType;
  const normalizedValue = target.normalizedValue || target.targetValue || target.decisionNormalizedValue || target.requestedNormalizedValue || target.value;
  if (!targetType || !normalizedValue) return false;

  if (targetType === 'host') {
    let domain = null;
    const raw = String(urlOrDomain || '').trim();
    if (/^https?:\/\//i.test(raw)) {
      try {
        domain = normalizeHostname(new URL(raw).hostname);
      } catch (_) {
        domain = null;
      }
    }
    if (!domain) domain = normalizeHostname(raw);
    return !!domain && matchDomain(domain, normalizedValue);
  }

  if (targetType === 'url') {
    const current = normalizeSiteClassificationTarget(urlOrDomain);
    return current.ok && current.targetType === 'url' && current.normalizedValue === normalizedValue;
  }
  return false;
}

export function siteRequestMatchesUrl(record, urlOrDomain) {
  const normalized = normalizeSiteClassificationRequest(record);
  if (!normalized) return false;
  return siteTargetMatchesUrl({
    targetType: normalized.requestedTargetType,
    normalizedValue: normalized.requestedNormalizedValue,
  }, urlOrDomain);
}

export function siteDecisionMatchesUrl(recordOrRule, urlOrDomain) {
  if (!recordOrRule || !urlOrDomain) return false;
  const targetType = recordOrRule.decisionTargetType || recordOrRule.targetType || recordOrRule.type;
  const normalizedValue = recordOrRule.decisionNormalizedValue || recordOrRule.normalizedValue || recordOrRule.targetValue || recordOrRule.value;
  return siteTargetMatchesUrl({ targetType, normalizedValue }, urlOrDomain);
}

export function siteTargetScopesOverlap(requestTarget, classifiedTarget) {
  const request = requestTarget?.ok
    ? requestTarget
    : normalizeSiteClassificationTarget(requestTarget?.targetType === 'url'
      ? requestTarget?.normalizedValue || requestTarget?.targetValue || requestTarget?.value
      : requestTarget?.normalizedValue || requestTarget?.targetValue || requestTarget?.value || '');
  const classified = classifiedTarget?.ok
    ? classifiedTarget
    : normalizeSiteClassificationTarget(classifiedTarget?.targetType === 'url'
      ? classifiedTarget?.normalizedValue || classifiedTarget?.targetValue || classifiedTarget?.value
      : classifiedTarget?.normalizedValue || classifiedTarget?.targetValue || classifiedTarget?.value || '');
  if (!request.ok || !classified.ok) return false;

  if (request.targetType === 'url') {
    if (classified.targetType === 'url') {
      return request.normalizedValue === classified.normalizedValue;
    }
    return matchDomain(request.host, classified.normalizedValue);
  }

  if (classified.targetType === 'url') {
    return matchDomain(classified.host, request.normalizedValue);
  }

  return matchDomain(request.normalizedValue, classified.normalizedValue) ||
    matchDomain(classified.normalizedValue, request.normalizedValue);
}

export function getSiteClassificationForUrl(config = {}, requests = [], urlOrDomain = '') {
  const rules = Array.isArray(config.siteClassificationRulesV1) ? config.siteClassificationRulesV1 : [];
  for (const rawRule of rules) {
    const rule = normalizeSiteClassificationRule(rawRule);
    if (!rule || !siteDecisionMatchesUrl(rule, urlOrDomain)) continue;
    if (rule.decision === 'study') return { classification: 'study', rule };
    if (rule.decision === 'composite') return { classification: 'composite', rule };
    if (rule.decision === 'reject') return { classification: 'rejected', rule };
  }

  const normalizedRequests = (Array.isArray(requests) ? requests : [])
    .map(normalizeSiteClassificationRequest)
    .filter(Boolean);
  const rejected = normalizedRequests.find((record) =>
    record.status === 'rejected' &&
    siteDecisionMatchesUrl(record.decisionTargetType ? record : {
      decisionTargetType: record.requestedTargetType,
      decisionNormalizedValue: record.requestedNormalizedValue,
    }, urlOrDomain)
  );
  if (rejected) return { classification: 'rejected', request: rejected };

  const pending = normalizedRequests.find((record) =>
    record.status === 'pending' && siteRequestMatchesUrl(record, urlOrDomain)
  );
  if (pending) return { classification: 'pending_composite', request: pending };
  return { classification: null };
}

export function getRootHostCandidate(host) {
  const normalized = normalizeHostname(host);
  if (!normalized) return null;
  const parts = normalized.split('.');
  if (parts.length <= 2) return normalized;
  return parts.slice(-2).join('.');
}

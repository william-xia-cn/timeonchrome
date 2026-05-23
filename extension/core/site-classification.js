import { matchDomain, normalizeHostname } from './domain-semantics.js';

export const SITE_CLASSIFICATION_TARGET_TYPES = new Set(['host', 'url']);
export const SITE_CLASSIFICATION_DECISIONS = new Set(['study', 'composite', 'reject']);
export const SITE_CLASSIFICATION_STATUSES = new Set(['pending', 'approved_study', 'approved_composite', 'rejected']);
export const SITE_ACCESS_CLASSIFICATION_GROUPS = [
  { keys: ['unsafeList', 'blacklist', 'defaultBlockedSites', 'customBlockedSites', 'defaultUnsafeSites', 'customUnsafeSites'], classification: 'blocked' },
  { keys: ['restrictedEntertainmentList', 'defaultRestrictedEntertainmentSites', 'customRestrictedEntertainmentList'], classification: 'restricted' },
  { keys: ['studyList', 'defaultStudySites', 'customStudyList'], classification: 'study' },
  { keys: ['compositeList', 'defaultCompositeSites', 'customCompositeList'], classification: 'composite' },
  { keys: ['restList', 'entertainmentList', 'defaultRestSites', 'customRestList'], classification: 'rest' },
];

const CLASSIFICATION_TIE_PRIORITY = {
  blocked: 100,
  rejected: 95,
  restricted: 90,
  study: 80,
  composite: 70,
  pending_composite: 65,
  rest: 60,
};

const SITE_CLASSIFICATION_YOUTUBE_HOSTS = new Set(['youtube.com', 'youtu.be']);

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
      const canonicalYouTube = canonicalizeYouTubeUrl(parsed, host);
      if (canonicalYouTube) {
        return {
          ok: true,
          targetType: 'url',
          rawInput,
          normalizedValue: canonicalYouTube.normalizedValue,
          displayValue: canonicalYouTube.normalizedValue,
          host: canonicalYouTube.host,
        };
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

function stripWwwAlias(host) {
  const normalized = normalizeHostname(host);
  if (!normalized) return null;
  return normalized.startsWith('www.') ? normalized.slice(4) : normalized;
}

function isSiteClassificationYouTubeHost(host) {
  const normalized = normalizeHostname(host);
  if (!normalized) return false;
  if (normalized === 'youtube.com' || normalized.endsWith('.youtube.com')) return true;
  return SITE_CLASSIFICATION_YOUTUBE_HOSTS.has(stripWwwAlias(normalized) || normalized);
}

function normalizeYouTubeId(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.replace(/[^a-zA-Z0-9_-]/g, '') || null;
}

function canonicalizeYouTubeUrl(parsed, host) {
  if (!parsed || !isSiteClassificationYouTubeHost(host)) return null;
  const path = parsed.pathname || '/';
  const playlistId = normalizeYouTubeId(parsed.searchParams.get('list'));
  if (playlistId) {
    return {
      host: 'www.youtube.com',
      normalizedValue: `https://www.youtube.com/playlist?list=${playlistId}`,
    };
  }
  let videoId = null;
  if ((stripWwwAlias(host) || host) === 'youtu.be') {
    videoId = normalizeYouTubeId(path.split('/').filter(Boolean)[0]);
  } else if (path === '/watch') {
    videoId = normalizeYouTubeId(parsed.searchParams.get('v'));
  } else if (path.startsWith('/shorts/')) {
    videoId = normalizeYouTubeId(path.split('/').filter(Boolean)[1]);
  }
  if (!videoId) return null;
  return {
    host: 'www.youtube.com',
    normalizedValue: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

function normalizeHostPattern(pattern) {
  const raw = String(pattern || '').trim().toLowerCase().replace(/\.+$/g, '');
  if (!raw) return null;
  const wildcard = raw.startsWith('*.');
  const host = normalizeHostname(wildcard ? raw.slice(2) : raw);
  if (!host) return null;
  return {
    raw,
    wildcard,
    host,
    matchValue: wildcard ? `*.${host}` : host,
    exactKey: `${wildcard ? 'host-wildcard' : 'host'}:${stripWwwAlias(host) || host}`,
  };
}

function normalizeUrlOrDomainInput(urlOrDomain) {
  const raw = String(urlOrDomain || '').trim();
  if (!raw) return { host: null, normalizedUrl: null };
  if (/^https?:\/\//i.test(raw)) {
    const target = normalizeSiteClassificationTarget(raw);
    return {
      host: target.ok ? target.host : null,
      normalizedUrl: target.ok && target.targetType === 'url' ? target.normalizedValue : null,
    };
  }
  return { host: normalizeHostname(raw), normalizedUrl: null };
}

function hostSpecificity(pattern, host) {
  const normalized = normalizeHostPattern(pattern);
  const currentHost = normalizeHostname(host);
  if (!normalized || !currentHost || !matchDomain(currentHost, normalized.matchValue)) return null;
  const depth = normalized.host.split('.').filter(Boolean).length;
  const exact = matchDomain(currentHost, normalized.host) && matchDomain(normalized.host, currentHost);
  return depth * 10 + (exact ? 9 : normalized.wildcard ? 5 : 0);
}

function decisionToClassification(decision) {
  const normalized = normalizeSiteClassificationDecision(decision);
  if (normalized === 'study') return 'study';
  if (normalized === 'composite') return 'composite';
  if (normalized === 'reject') return 'rejected';
  return null;
}

function targetSpecificity(target, normalizedInput) {
  if (!target || !normalizedInput?.host) return null;
  const targetType = target.targetType || target.type || target.decisionTargetType || target.requestedTargetType;
  const normalizedValue = target.normalizedValue || target.targetValue || target.decisionNormalizedValue || target.requestedNormalizedValue || target.value;
  if (targetType === 'url') {
    const current = normalizedInput.normalizedUrl;
    if (!current) return null;
    const normalizedTarget = normalizeSiteClassificationTarget(normalizedValue);
    const effectiveValue = normalizedTarget.ok && normalizedTarget.targetType === 'url' ? normalizedTarget.normalizedValue : normalizedValue;
    return current === effectiveValue ? 100000 + effectiveValue.length : null;
  }
  if (targetType === 'host') {
    return hostSpecificity(normalizedValue, normalizedInput.host);
  }
  return null;
}

function pushCandidate(candidates, candidate) {
  if (!candidate?.classification || !Number.isFinite(candidate.specificity)) return;
  candidates.push(candidate);
}

function pickBestCandidate(candidates) {
  if (!candidates.length) return { classification: null };
  const sorted = [...candidates].sort((a, b) => {
    if (b.specificity !== a.specificity) return b.specificity - a.specificity;
    return (CLASSIFICATION_TIE_PRIORITY[b.classification] || 0) - (CLASSIFICATION_TIE_PRIORITY[a.classification] || 0);
  });
  const best = sorted[0];
  const tied = sorted.filter((item) => item.specificity === best.specificity);
  const classes = [...new Set(tied.map((item) => item.classification))];
  return {
    classification: best.classification,
    source: best.source || null,
    pattern: best.pattern || null,
    rule: best.rule || null,
    request: best.request || null,
    specificity: best.specificity,
    conflict: classes.length > 1 ? {
      reason: 'same_specificity_cross_classification',
      candidates: tied.map(({ classification, source, pattern, rule, request, specificity }) => ({
        classification,
        source: source || null,
        pattern: pattern || null,
        ruleId: rule?.id || null,
        requestId: request?.id || null,
        specificity,
      })),
    } : null,
  };
}

function getConfigListValues(config = {}, keys = []) {
  const values = [];
  for (const key of keys) {
    const list = config?.[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === 'string' && item.trim()) values.push({ key, value: item.trim() });
    }
  }
  return values;
}

export function resolveSiteAccessClassification(config = {}, requests = [], urlOrDomain = '') {
  const input = normalizeUrlOrDomainInput(urlOrDomain);
  if (!input.host) return { classification: null };
  const candidates = [];

  const rules = Array.isArray(config.siteClassificationRulesV1) ? config.siteClassificationRulesV1 : [];
  for (const rawRule of rules) {
    const rule = normalizeSiteClassificationRule(rawRule);
    if (!rule) continue;
    const specificity = targetSpecificity(rule, input);
    const classification = decisionToClassification(rule.decision);
    pushCandidate(candidates, {
      classification,
      specificity,
      source: 'siteClassificationRulesV1',
      rule,
    });
  }

  for (const group of SITE_ACCESS_CLASSIFICATION_GROUPS) {
    for (const item of getConfigListValues(config, group.keys)) {
      const specificity = hostSpecificity(item.value, input.host);
      pushCandidate(candidates, {
        classification: group.classification,
        specificity,
        source: item.key,
        pattern: item.value,
      });
    }
  }

  const normalizedRequests = (Array.isArray(requests) ? requests : [])
    .map(normalizeSiteClassificationRequest)
    .filter(Boolean);
  for (const record of normalizedRequests) {
    if (record.status === 'rejected') {
      const target = {
        targetType: record.decisionTargetType || record.requestedTargetType,
        normalizedValue: record.decisionNormalizedValue || record.requestedNormalizedValue,
      };
      pushCandidate(candidates, {
        classification: 'rejected',
        specificity: targetSpecificity(target, input),
        source: 'site_classification_request',
        request: record,
      });
    } else if (record.status === 'pending') {
      const target = {
        targetType: record.requestedTargetType,
        normalizedValue: record.requestedNormalizedValue,
      };
      pushCandidate(candidates, {
        classification: 'pending_composite',
        specificity: targetSpecificity(target, input),
        source: 'site_classification_request',
        request: record,
      });
    }
  }

  return pickBestCandidate(candidates);
}

export function getSiteAccessExactConflicts(config = {}) {
  const seen = new Map();
  const conflicts = [];
  const add = (entry) => {
    if (!entry?.key || !entry.classification) return;
    const existing = seen.get(entry.key) || [];
    const otherClass = existing.find((item) => item.classification !== entry.classification);
    if (otherClass) {
      conflicts.push({
        key: entry.key,
        classification: entry.classification,
        source: entry.source || null,
        value: entry.value || null,
        existing: existing.map((item) => ({
          classification: item.classification,
          source: item.source || null,
          value: item.value || null,
        })),
      });
    }
    existing.push(entry);
    seen.set(entry.key, existing);
  };

  const rules = Array.isArray(config.siteClassificationRulesV1) ? config.siteClassificationRulesV1 : [];
  for (const rawRule of rules) {
    const rule = normalizeSiteClassificationRule(rawRule);
    if (!rule) continue;
    const classification = decisionToClassification(rule.decision);
    if (!classification) continue;
    const key = rule.targetType === 'url'
      ? `url:${rule.normalizedValue}`
      : normalizeHostPattern(rule.normalizedValue)?.exactKey;
    add({ key, classification, source: 'siteClassificationRulesV1', value: rule.normalizedValue });
  }

  for (const group of SITE_ACCESS_CLASSIFICATION_GROUPS) {
    for (const item of getConfigListValues(config, group.keys)) {
      const key = normalizeHostPattern(item.value)?.exactKey;
      add({ key, classification: group.classification, source: item.key, value: item.value });
    }
  }

  return conflicts;
}

export function validateSiteAccessConfig(config = {}) {
  const conflicts = getSiteAccessExactConflicts(config);
  return {
    ok: conflicts.length === 0,
    conflicts,
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
    displayValue: requested.displayValue,
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
    const input = normalizeUrlOrDomainInput(urlOrDomain);
    return Number.isFinite(targetSpecificity({ targetType: 'url', normalizedValue }, input));
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

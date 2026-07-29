import { matchDomain, normalizeHostname } from './domain-semantics.js';

export const SITE_CLASSIFICATION_TARGET_TYPES = new Set(['host', 'url']);
export const SITE_CLASSIFICATION_DECISIONS = new Set(['study', 'composite', 'return', 'reject']);
export const SITE_CLASSIFICATION_STATUSES = new Set(['pending', 'returned', 'approved_study', 'approved_composite', 'rejected']);
export const SITE_CLASSIFICATION_RECORD_SOURCES = new Set(['auto_unclassified_access', 'manual_learning_request', 'legacy']);
export const SITE_CLASSIFICATION_REQUESTED_CLASSIFICATIONS = new Set(['study']);
export const SITE_ACCESS_CLASSIFICATION_GROUPS = [
  { keys: ['unsafeList'], classification: 'blocked' },
  { keys: ['restrictedEntertainmentList'], classification: 'restricted' },
  { keys: ['studyList'], classification: 'study' },
  { keys: ['compositeList'], classification: 'composite' },
  { keys: ['restList', 'entertainmentList'], classification: 'rest' },
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
const YOUTUBE_SPECIAL_OBJECT_KINDS = new Set(['video', 'playlist', 'channel']);

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
          specialSite: canonicalYouTube.specialSite || null,
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
  if (decision === 'returned' || decision === 'return') return 'return';
  if (decision === 'rejected' || decision === 'reject') return 'reject';
  return null;
}

export function decisionToStatus(decision) {
  const normalized = normalizeSiteClassificationDecision(decision);
  if (normalized === 'study') return 'approved_study';
  if (normalized === 'composite') return 'approved_composite';
  if (normalized === 'return') return 'returned';
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
  if (!decision || decision === 'return') return null;
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
  const alias = stripWwwAlias(normalized) || normalized;
  return alias === 'youtube.com' || alias === 'youtu.be';
}

function normalizeYouTubeId(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.replace(/[^a-zA-Z0-9_-]/g, '') || null;
}

function youtubeSpecialSite(kind, id = null) {
  return { platform: 'youtube', kind, id };
}

function canonicalizeYouTubeChannelPath(path) {
  const parts = String(path || '').split('/').filter(Boolean);
  if (!parts.length) return null;
  const first = parts[0] || '';
  if (first.startsWith('@')) {
    const handle = first.slice(1).replace(/[^a-zA-Z0-9_.-]/g, '');
    return handle ? { id: `@${handle.toLowerCase()}`, path: `/@${handle.toLowerCase()}` } : null;
  }
  if (['channel', 'c', 'user'].includes(first)) {
    const raw = parts[1] || '';
    const id = raw.replace(/[^a-zA-Z0-9_.-]/g, '');
    return id ? { id: `${first}/${id.toLowerCase()}`, path: `/${first}/${id.toLowerCase()}` } : null;
  }
  return null;
}

function canonicalizeYouTubeUrl(parsed, host) {
  if (!parsed || !isSiteClassificationYouTubeHost(host)) return null;
  const path = parsed.pathname || '/';
  const playlistId = normalizeYouTubeId(parsed.searchParams.get('list'));
  if (playlistId) {
    return {
      host: 'www.youtube.com',
      normalizedValue: `https://www.youtube.com/playlist?list=${playlistId}`,
      specialSite: youtubeSpecialSite('playlist', playlistId),
    };
  }
  const channel = canonicalizeYouTubeChannelPath(path);
  if (channel) {
    return {
      host: 'www.youtube.com',
      normalizedValue: `https://www.youtube.com${channel.path}`,
      specialSite: youtubeSpecialSite('channel', channel.id),
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
    specialSite: youtubeSpecialSite('video', videoId),
  };
}

export function getSiteClassificationSpecialTargets(input) {
  const values = Array.isArray(input) ? input : [input];
  return values
    .map((value) => value?.ok ? value : normalizeSiteClassificationTarget(value?.normalizedValue || value?.targetValue || value?.value || value || ''))
    .filter((target) => target?.ok && target.targetType === 'url' && target.specialSite?.platform === 'youtube' && YOUTUBE_SPECIAL_OBJECT_KINDS.has(target.specialSite.kind))
    .map((target) => ({
      targetType: 'url',
      normalizedValue: target.normalizedValue,
      host: target.host,
      specialSite: target.specialSite,
    }));
}

export function isAllowedSpecialSiteActionTarget(target) {
  return target?.ok === true && target.targetType === 'url' && target.specialSite?.platform === 'youtube' && YOUTUBE_SPECIAL_OBJECT_KINDS.has(target.specialSite.kind);
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
  const rawInput = urlOrDomain && typeof urlOrDomain === 'object'
    ? (urlOrDomain.url || urlOrDomain.input || urlOrDomain.domain || '')
    : urlOrDomain;
  const raw = String(rawInput || '').trim();
  const extraSpecialTargets = getSiteClassificationSpecialTargets(
    urlOrDomain && typeof urlOrDomain === 'object' ? (urlOrDomain.specialSiteTargets || urlOrDomain.specialTargets || []) : []
  );
  if (!raw) return { host: null, normalizedUrl: null, specialSiteTargets: extraSpecialTargets };
  if (/^https?:\/\//i.test(raw)) {
    const target = normalizeSiteClassificationTarget(raw);
    const ownSpecialTargets = getSiteClassificationSpecialTargets(target.ok ? target : []);
    return {
      host: target.ok ? target.host : null,
      normalizedUrl: target.ok && target.targetType === 'url' ? target.normalizedValue : null,
      specialSiteTargets: [...ownSpecialTargets, ...extraSpecialTargets],
    };
  }
  return { host: normalizeHostname(raw), normalizedUrl: null, specialSiteTargets: extraSpecialTargets };
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
  if (normalized === 'return') return null;
  if (normalized === 'reject') return 'rejected';
  return null;
}

function targetSpecificity(target, normalizedInput) {
  if (!target || !normalizedInput?.host) return null;
  const targetType = target.targetType || target.type || target.decisionTargetType || target.requestedTargetType;
  const normalizedValue = target.normalizedValue || target.targetValue || target.decisionNormalizedValue || target.requestedNormalizedValue || target.value;
  if (targetType === 'url') {
    const current = normalizedInput.normalizedUrl;
    const normalizedTarget = normalizeSiteClassificationTarget(normalizedValue);
    const effectiveValue = normalizedTarget.ok && normalizedTarget.targetType === 'url' ? normalizedTarget.normalizedValue : normalizedValue;
    if (current === effectiveValue) return 100000 + effectiveValue.length;
    const specialTargets = Array.isArray(normalizedInput.specialSiteTargets) ? normalizedInput.specialSiteTargets : [];
    const inherited = specialTargets.some((item) => item?.targetType === 'url' && item.normalizedValue === effectiveValue);
    if (inherited && normalizedTarget.ok && normalizedTarget.specialSite?.kind === 'channel') {
      return 95000 + effectiveValue.length;
    }
    return null;
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


function normalizeActionClassification(value) {
  const decisionClass = decisionToClassification(value);
  if (decisionClass === 'study' || decisionClass === 'composite') return decisionClass;
  if (decisionClass === 'rejected' || value === 'restricted' || value === 'reject') return 'restricted';
  if (value === 'blocked') return 'blocked';
  return null;
}

function actionClassificationLabel(value) {
  if (value === 'study') return '学习网站';
  if (value === 'composite') return '复合网站';
  if (value === 'restricted' || value === 'rejected') return '受限娱乐网站';
  if (value === 'blocked') return '黑名单网站';
  return '目标分类';
}

function collectConfiguredSiteTargets(config = {}) {
  const targets = [];
  const rules = Array.isArray(config.siteClassificationRulesV1) ? config.siteClassificationRulesV1 : [];
  for (const rawRule of rules) {
    const rule = normalizeSiteClassificationRule(rawRule);
    if (!rule) continue;
    const classification = normalizeActionClassification(rule.decision);
    if (!classification) continue;
    targets.push({
      targetType: rule.targetType,
      normalizedValue: rule.normalizedValue,
      host: rule.targetType === 'url' ? normalizeSiteClassificationTarget(rule.normalizedValue).host : rule.normalizedValue,
      classification,
      source: 'siteClassificationRulesV1',
      value: rule.normalizedValue,
    });
  }
  for (const group of SITE_ACCESS_CLASSIFICATION_GROUPS) {
    const classification = group.classification === 'rejected' ? 'restricted' : group.classification;
    for (const item of getConfigListValues(config, group.keys)) {
      const host = normalizeHostPattern(item.value)?.host;
      if (!host) continue;
      targets.push({
        targetType: 'host',
        normalizedValue: host,
        host,
        classification,
        source: item.key,
        value: item.value,
      });
    }
  }
  return targets;
}

function sameActionTarget(a, b) {
  if (!a || !b || a.targetType !== b.targetType) return false;
  if (a.targetType === 'url') return a.normalizedValue === b.normalizedValue;
  return matchDomain(a.normalizedValue, b.normalizedValue) && matchDomain(b.normalizedValue, a.normalizedValue);
}

function protectedAncestorForAction(target, actionClassification, configuredTargets) {
  if (!target?.ok || !actionClassification) return null;
  const canBypassRestricted = actionClassification !== 'study' && actionClassification !== 'composite';
  const canBypassBlocked = actionClassification === 'blocked';
  for (const item of configuredTargets) {
    if (item.classification !== 'restricted' && item.classification !== 'blocked') continue;
    if (sameActionTarget(target, item)) continue;
    const itemHost = item.host || item.normalizedValue;
    const targetHost = target.host;
    if (!itemHost || !targetHost || !matchDomain(targetHost, itemHost)) continue;
    if (item.classification === 'blocked' && !canBypassBlocked) return item;
    if (item.classification === 'restricted' && !canBypassRestricted && !isAllowedSpecialSiteActionTarget(target)) return item;
  }
  return null;
}

export function validateSiteClassificationAction(config = {}, targetOrInput, action) {
  const target = targetOrInput?.ok ? targetOrInput : normalizeSiteClassificationTarget(targetOrInput);
  if (!target.ok) return { ok: false, code: target.code || 'INVALID_TARGET', error: target.error || 'invalid target' };
  const actionClassification = normalizeActionClassification(action);
  if (!actionClassification) return { ok: false, code: 'INVALID_CLASSIFICATION_ACTION', error: 'invalid classification action' };

  const configuredTargets = collectConfiguredSiteTargets(config);
  const exact = configuredTargets.find((item) => sameActionTarget(target, item));
  if (exact) {
    return {
      ok: false,
      code: exact.classification === 'restricted' || exact.classification === 'blocked' ? 'REQUEST_REJECTED' : 'ALREADY_CLASSIFIED',
      error: 'target already classified',
      classifiedAs: exact.classification,
      source: exact.source || null,
      pattern: exact.value || exact.normalizedValue,
      protectedBy: exact,
    };
  }

  const protectedAncestor = protectedAncestorForAction(target, actionClassification, configuredTargets);
  if (protectedAncestor) {
    return {
      ok: false,
      code: 'CLASSIFICATION_SCOPE_BLOCKED',
      error: `${target.displayValue || target.normalizedValue} 位于${actionClassificationLabel(protectedAncestor.classification)}范围内，不能归为${actionClassificationLabel(actionClassification)}。`,
      classifiedAs: protectedAncestor.classification,
      source: protectedAncestor.source || null,
      pattern: protectedAncestor.value || protectedAncestor.normalizedValue,
      protectedBy: protectedAncestor,
    };
  }

  return { ok: true, target, actionClassification };
}
export function validateSiteAccessConfig(config = {}) {
  const conflicts = getSiteAccessExactConflicts(config);
  return {
    ok: conflicts.length === 0,
    conflicts,
  };
}

function normalizeOptionalTimestamp(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function normalizeNonNegativeInteger(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

export function normalizeSiteClassificationRequest(record) {
  if (!record || typeof record !== 'object') return null;
  const requestedTargetType = record.requestedTargetType || record.targetType || record.type;
  const requestedValue = record.requestedNormalizedValue || record.normalizedValue || record.targetValue || record.value;
  if (!SITE_CLASSIFICATION_TARGET_TYPES.has(requestedTargetType) || typeof requestedValue !== 'string') return null;
  const requested = normalizeSiteClassificationTarget(requestedTargetType === 'url' ? requestedValue : requestedValue.trim());
  if (!requested.ok || requested.targetType !== requestedTargetType) return null;
  const status = SITE_CLASSIFICATION_STATUSES.has(record.status) ? record.status : 'pending';
  const explicitRecordSource = SITE_CLASSIFICATION_RECORD_SOURCES.has(record.recordSource)
    ? record.recordSource
    : 'legacy';
  const explicitRequestedClassification = SITE_CLASSIFICATION_REQUESTED_CLASSIFICATIONS.has(record.requestedClassification)
    ? record.requestedClassification
    : null;
  const isManualLearningRequest = explicitRecordSource === 'manual_learning_request' || explicitRequestedClassification === 'study';
  const recordSource = isManualLearningRequest ? 'manual_learning_request' : explicitRecordSource;
  const requestedClassification = isManualLearningRequest ? 'study' : null;
  const out = {
    ...record,
    requestedTargetType,
    requestedNormalizedValue: requested.normalizedValue,
    requestedRawInput: record.requestedRawInput || record.rawInput || requested.rawInput,
    displayValue: requested.displayValue,
    status,
    recordSource,
    requestedClassification,
    manualRequestedAt: normalizeOptionalTimestamp(record.manualRequestedAt),
    firstObservedAt: normalizeOptionalTimestamp(record.firstObservedAt),
    lastObservedAt: normalizeOptionalTimestamp(record.lastObservedAt),
    observationCount: normalizeNonNegativeInteger(record.observationCount),
    sourceFirstObservedAt: normalizeOptionalTimestamp(record.sourceFirstObservedAt),
    sourceLastObservedAt: normalizeOptionalTimestamp(record.sourceLastObservedAt),
    sourceObservationCount: normalizeNonNegativeInteger(record.sourceObservationCount),
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

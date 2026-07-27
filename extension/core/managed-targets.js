import { domainForUrl, matchDomain, normalizeHostname } from './domain-semantics.js';
import {
  normalizeSiteClassificationRequest,
  normalizeSiteClassificationRule,
  normalizeSiteClassificationTarget,
  getSiteClassificationSpecialTargets,
  SITE_ACCESS_CLASSIFICATION_GROUPS,
} from './site-classification.js';

export const MANAGED_TARGET_TYPES = new Set([
  'domain',
  'subdomain',
  'platform_entry',
  'url',
  'video',
  'playlist',
  'channel',
]);

const HOST_TARGET_TYPES = new Set(['domain', 'subdomain']);
const PLATFORM_TARGET_TYPES = new Set(['platform_entry', 'video', 'playlist', 'channel']);

const MATCH_LEVEL_WEIGHT = {
  playlist: 600000,
  channel: 550000,
  video: 500000,
  url: 490000,
  platform_entry: 400000,
  subdomain: 300000,
  domain: 200000,
};

const MANAGED_CLASSIFICATION_TIE_PRIORITY = {
  blocked: 100,
  rejected: 95,
  restricted: 90,
  study: 80,
  composite: 70,
  pending_composite: 65,
  rest: 60,
};

const YOUTUBE_HOSTS = new Set(['youtube.com', 'youtu.be']);

function stableHash(input) {
  let hash = 0x811c9dc5;
  const text = String(input || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function deriveManagedTargetId(namespace, targetType, normalizedValue) {
  const ns = String(namespace || 'generic').trim().toLowerCase() || 'generic';
  const type = String(targetType || '').trim().toLowerCase();
  const value = String(normalizedValue || '').trim();
  return `mt_${stableHash(`${ns}\u0000${type}\u0000${value}`)}`;
}

function rootHostCandidate(host) {
  const normalized = normalizeHostname(host);
  if (!normalized) return null;
  const parts = normalized.split('.');
  if (parts.length <= 2) return normalized;
  return parts.slice(-2).join('.');
}

function hostTargetType(host, explicitType = null) {
  if (explicitType === 'domain' || explicitType === 'subdomain') return explicitType;
  const normalized = normalizeHostname(host);
  if (!normalized) return 'domain';
  return rootHostCandidate(normalized) === normalized ? 'domain' : 'subdomain';
}

function stripWwwAlias(host) {
  const normalized = normalizeHostname(host);
  if (!normalized) return null;
  return normalized.startsWith('www.') ? normalized.slice(4) : normalized;
}

function normalizeManagedUrl(value) {
  const target = normalizeSiteClassificationTarget(value);
  if (!target.ok || target.targetType !== 'url') return null;
  return target;
}

function normalizePlatformValue(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function inferNamespace(targetType, normalizedValue, rawNamespace = null) {
  const explicit = String(rawNamespace || '').trim().toLowerCase();
  if (explicit) return explicit;
  if (PLATFORM_TARGET_TYPES.has(targetType)) return 'youtube';
  if (targetType === 'url') {
    try {
      const host = normalizeHostname(new URL(normalizedValue).hostname);
      if (isYouTubeHost(host)) return 'youtube';
    } catch (_) {
      // Fall through.
    }
  }
  return 'generic';
}

function normalizeClassification(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'approved_study') return 'study';
  if (normalized === 'approved_composite') return 'composite';
  if (normalized === 'reject') return 'rejected';
  if (['study', 'composite', 'rest', 'restricted', 'blocked', 'rejected', 'pending_composite'].includes(normalized)) {
    return normalized;
  }
  return null;
}

function normalizeManagedTargetRecord(record, defaults = {}) {
  if (!record || typeof record !== 'object') return null;
  const rawType = String(record.targetType || record.type || defaults.targetType || '').trim().toLowerCase();
  if (!MANAGED_TARGET_TYPES.has(rawType)) return null;
  const rawValue = record.normalizedValue || record.targetValue || record.value || record.url || record.host;
  if (typeof rawValue !== 'string' || !rawValue.trim()) return null;

  let normalizedValue = null;
  let host = null;
  let targetType = rawType;
  if (HOST_TARGET_TYPES.has(rawType)) {
    host = normalizeHostname(rawValue);
    if (!host) return null;
    targetType = hostTargetType(host, rawType);
    normalizedValue = host;
  } else if (rawType === 'url') {
    const normalized = normalizeManagedUrl(rawValue);
    if (!normalized) return null;
    normalizedValue = normalized.normalizedValue;
    host = normalized.host;
  } else {
    normalizedValue = normalizePlatformValue(rawValue);
    if (!normalizedValue) return null;
  }

  const namespace = inferNamespace(targetType, normalizedValue, record.namespace || defaults.namespace);
  const classification = normalizeClassification(record.classification || record.decision || record.status || defaults.classification);
  if (!classification) return null;
  const targetId = record.targetId || deriveManagedTargetId(namespace, targetType, normalizedValue);
  return {
    ...record,
    targetId,
    targetType,
    namespace,
    normalizedValue,
    host,
    targetLabel: record.targetLabel || record.label || record.name || normalizedValue,
    targetSource: record.targetSource || record.source || defaults.targetSource || 'parent',
    classification,
    ruleId: record.targetRuleId || record.ruleId || record.id || defaults.ruleId || null,
    sourceCollection: defaults.sourceCollection || record.sourceCollection || null,
  };
}

function legacyDecisionToClassification(decision) {
  const normalized = String(decision || '').trim().toLowerCase();
  if (normalized === 'study' || normalized === 'approved_study') return 'study';
  if (normalized === 'composite' || normalized === 'approved_composite') return 'composite';
  if (normalized === 'reject' || normalized === 'rejected') return 'rejected';
  return null;
}

function legacyHostManagedType(host) {
  return hostTargetType(host);
}

function legacyRuleToManagedTarget(rule) {
  const normalized = normalizeSiteClassificationRule(rule);
  if (!normalized) return null;
  const classification = legacyDecisionToClassification(normalized.decision);
  if (!classification) return null;
  if (normalized.targetType === 'url') {
    return normalizeManagedTargetRecord({
      targetType: 'url',
      normalizedValue: normalized.normalizedValue,
      classification,
      targetLabel: normalized.displayValue || normalized.normalizedValue,
      targetSource: 'parent',
      ruleId: normalized.id || normalized.ruleId || null,
    }, { sourceCollection: 'siteClassificationRulesV1' });
  }
  const targetType = legacyHostManagedType(normalized.normalizedValue);
  return normalizeManagedTargetRecord({
    targetType,
    normalizedValue: normalized.normalizedValue,
    classification,
    targetLabel: normalized.normalizedValue,
    targetSource: 'parent',
    ruleId: normalized.id || normalized.ruleId || null,
  }, { sourceCollection: 'siteClassificationRulesV1' });
}

function listPatternToManagedTarget(item, classification, sourceCollection) {
  const value = String(item?.value || item || '').trim();
  if (!value) return null;
  const wildcard = value.startsWith('*.') ? value.slice(2) : value;
  const host = normalizeHostname(wildcard);
  if (!host) return null;
  return normalizeManagedTargetRecord({
    targetType: legacyHostManagedType(host),
    normalizedValue: host,
    classification,
    targetLabel: value,
    targetSource: sourceCollection?.startsWith('default') ? 'system' : 'parent',
  }, { sourceCollection });
}

function requestToManagedTarget(record) {
  const normalized = normalizeSiteClassificationRequest(record);
  if (!normalized) return null;
  if (normalized.status === 'rejected') {
    const targetType = normalized.decisionTargetType || normalized.requestedTargetType;
    const value = normalized.decisionNormalizedValue || normalized.requestedNormalizedValue;
    const managedType = targetType === 'url' ? 'url' : legacyHostManagedType(value);
    return normalizeManagedTargetRecord({
      targetType: managedType,
      normalizedValue: value,
      classification: 'rejected',
      targetLabel: normalized.displayValue || value,
      targetSource: 'pending',
      ruleId: normalized.id || null,
    }, { sourceCollection: 'site_classification_request' });
  }
  if (normalized.status === 'pending') {
    const managedType = normalized.requestedTargetType === 'url'
      ? 'url'
      : legacyHostManagedType(normalized.requestedNormalizedValue);
    return normalizeManagedTargetRecord({
      targetType: managedType,
      normalizedValue: normalized.requestedNormalizedValue,
      classification: 'pending_composite',
      targetLabel: normalized.displayValue || normalized.requestedNormalizedValue,
      targetSource: 'pending',
      ruleId: normalized.id || null,
    }, { sourceCollection: 'site_classification_request' });
  }
  return null;
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

export function collectManagedTargets(config = {}, requests = []) {
  const targets = [];

  const explicitTargets = Array.isArray(config.managedTargetsV1) ? config.managedTargetsV1 : [];
  for (const record of explicitTargets) {
    const target = normalizeManagedTargetRecord(record, { sourceCollection: 'managedTargetsV1' });
    if (target) targets.push(target);
  }

  const rules = Array.isArray(config.siteClassificationRulesV1) ? config.siteClassificationRulesV1 : [];
  for (const rule of rules) {
    const target = legacyRuleToManagedTarget(rule);
    if (target) targets.push(target);
  }

  for (const group of SITE_ACCESS_CLASSIFICATION_GROUPS) {
    for (const item of getConfigListValues(config, group.keys)) {
      const target = listPatternToManagedTarget(item, group.classification, item.key);
      if (target) targets.push(target);
    }
  }

  for (const request of Array.isArray(requests) ? requests : []) {
    const target = requestToManagedTarget(request);
    if (target) targets.push(target);
  }

  return targets;
}

function isYouTubeHost(host) {
  const normalized = normalizeHostname(host);
  if (!normalized) return false;
  if (normalized === 'youtube.com' || normalized.endsWith('.youtube.com')) return true;
  return YOUTUBE_HOSTS.has(stripWwwAlias(normalized) || normalized);
}

function normalizeYouTubeVideoId(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.replace(/[^a-zA-Z0-9_-]/g, '') || null;
}

function normalizeYouTubePlaylistId(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.replace(/[^a-zA-Z0-9_-]/g, '') || null;
}

function parseYouTubeContext(parsedUrl, host) {
  if (!parsedUrl || !isYouTubeHost(host)) return null;
  const path = parsedUrl.pathname || '/';
  const params = parsedUrl.searchParams;
  const playlistId = normalizeYouTubePlaylistId(params.get('list'));
  let videoId = null;
  if ((stripWwwAlias(host) || host) === 'youtu.be') {
    videoId = normalizeYouTubeVideoId(path.split('/').filter(Boolean)[0]);
  } else if (path === '/watch') {
    videoId = normalizeYouTubeVideoId(params.get('v'));
  } else if (path.startsWith('/shorts/')) {
    videoId = normalizeYouTubeVideoId(path.split('/').filter(Boolean)[1]);
  }

  let platformEntry = null;
  if (path === '/' || path === '') platformEntry = 'home';
  else if (path === '/results') platformEntry = 'search';
  else if (path === '/shorts' || path.startsWith('/shorts/')) platformEntry = 'shorts';
  else if (path.startsWith('/channel/') || path.startsWith('/c/') || path.startsWith('/user/') || path.startsWith('/@')) platformEntry = 'channel';
  else if (path.startsWith('/feed/subscriptions')) platformEntry = 'subscriptions';
  else if (path === '/playlist') platformEntry = 'playlist';
  else if (path === '/watch') platformEntry = playlistId ? 'playlist_watch' : 'watch';

  return {
    namespace: 'youtube',
    platform: 'youtube',
    playlistId,
    videoId,
    platformEntry,
  };
}

export function parseManagedTargetContext(urlOrDomain = '') {
  const specialSiteTargets = Array.isArray(urlOrDomain?.specialSiteTargets) ? urlOrDomain.specialSiteTargets : [];
  const rawInput = urlOrDomain && typeof urlOrDomain === 'object'
    ? (urlOrDomain.url || urlOrDomain.input || urlOrDomain.domain || '')
    : urlOrDomain;
  const raw = String(rawInput || '').trim();
  if (!raw) {
    return { raw, domain: null, normalizedUrl: null, platform: null, specialSiteTargets };
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const domain = normalizeHostname(parsed.hostname);
      const normalized = normalizeManagedUrl(raw);
      return {
        raw,
        domain,
        normalizedUrl: normalized?.normalizedValue || null,
        platform: parseYouTubeContext(parsed, domain),
        specialSiteTargets,
      };
    } catch (_) {
      return { raw, domain: domainForUrl(raw) || null, normalizedUrl: null, platform: null, specialSiteTargets };
    }
  }

  return {
    raw,
    domain: normalizeHostname(raw),
    normalizedUrl: null,
    platform: null,
    specialSiteTargets,
  };
}

function hostSpecificity(target, context) {
  if (!target?.normalizedValue || !context?.domain || !matchDomain(context.domain, target.normalizedValue)) return null;
  const depth = target.normalizedValue.split('.').filter(Boolean).length;
  const exact = normalizeHostname(context.domain) === normalizeHostname(target.normalizedValue);
  return MATCH_LEVEL_WEIGHT[target.targetType] + depth * 10 + (exact ? 9 : 0);
}

function targetSpecificity(target, context) {
  if (!target || !context?.domain) return null;
  if (target.targetType === 'playlist') {
    const playlistId = context.platform?.namespace === target.namespace ? context.platform.playlistId : null;
    return playlistId && playlistId === target.normalizedValue ? MATCH_LEVEL_WEIGHT.playlist + target.normalizedValue.length : null;
  }
  if (target.targetType === 'channel') {
    const specialTargets = Array.isArray(context.specialSiteTargets) ? context.specialSiteTargets : [];
    const inherited = specialTargets.some((item) => item?.specialSite?.kind === 'channel' && item.normalizedValue === target.normalizedValue);
    if (inherited) return MATCH_LEVEL_WEIGHT.channel + target.normalizedValue.length;
    return null;
  }
  if (target.targetType === 'video') {
    const platform = context.platform?.namespace === target.namespace ? context.platform : null;
    if (!platform?.videoId || platform.playlistId) return null;
    return platform.videoId === target.normalizedValue ? MATCH_LEVEL_WEIGHT.video + target.normalizedValue.length : null;
  }
  if (target.targetType === 'url') {
    if (!context.normalizedUrl) return null;
    return context.normalizedUrl === target.normalizedValue
      ? MATCH_LEVEL_WEIGHT.url + target.normalizedValue.length
      : null;
  }
  if (target.targetType === 'platform_entry') {
    const entry = context.platform?.namespace === target.namespace ? context.platform.platformEntry : null;
    return entry && entry === target.normalizedValue ? MATCH_LEVEL_WEIGHT.platform_entry + target.normalizedValue.length : null;
  }
  if (HOST_TARGET_TYPES.has(target.targetType)) return hostSpecificity(target, context);
  return null;
}

function pickBestTarget(candidates) {
  if (!candidates.length) return null;
  const sorted = [...candidates].sort((a, b) => {
    if (b.specificity !== a.specificity) return b.specificity - a.specificity;
    return (MANAGED_CLASSIFICATION_TIE_PRIORITY[b.target.classification] || 0) - (MANAGED_CLASSIFICATION_TIE_PRIORITY[a.target.classification] || 0);
  });
  return sorted[0];
}

export function validateManagedTargetsConfig(config = {}) {
  const conflicts = [];
  const seen = new Map();
  const targets = collectManagedTargets(config, []);
  for (const target of targets) {
    const key = `${target.namespace}:${target.targetType}:${target.targetType === 'domain' ? stripWwwAlias(target.normalizedValue) || target.normalizedValue : target.normalizedValue}`;
    const existing = seen.get(key) || [];
    const conflict = existing.find((item) => item.classification !== target.classification);
    if (conflict) {
      conflicts.push({
        key,
        classification: target.classification,
        targetId: target.targetId,
        existing: existing.map((item) => ({
          classification: item.classification,
          targetId: item.targetId,
          sourceCollection: item.sourceCollection || null,
        })),
      });
    }
    existing.push(target);
    seen.set(key, existing);
  }
  return { ok: conflicts.length === 0, conflicts };
}

function targetToAttribution(target, context, matchLevel) {
  return {
    domain: context.domain || null,
    fallback: false,
    managedTargetId: target.targetId,
    managedTargetType: target.targetType,
    managedTargetNamespace: target.namespace,
    managedTargetValue: target.normalizedValue,
    managedTargetLabelAtTime: target.targetLabel || target.normalizedValue,
    targetSourceAtTime: target.targetSource || null,
    targetRuleId: target.ruleId || null,
    targetMatchLevel: matchLevel || target.targetType,
    targetClassificationAtTime: target.classification || null,
  };
}

export function fallbackDomainAttribution(urlOrDomain = '') {
  const context = parseManagedTargetContext(urlOrDomain);
  return {
    domain: context.domain || domainForUrl(urlOrDomain) || normalizeHostname(urlOrDomain) || null,
    fallback: true,
    managedTargetId: null,
    managedTargetType: null,
    managedTargetNamespace: null,
    managedTargetValue: null,
    managedTargetLabelAtTime: null,
    targetSourceAtTime: null,
    targetRuleId: null,
    targetMatchLevel: context.domain ? 'domain_fallback' : 'unknown_fallback',
    targetClassificationAtTime: null,
  };
}

export function resolveManagedTargetAttribution(config = {}, requests = [], urlOrDomain = '') {
  const context = parseManagedTargetContext(urlOrDomain);
  if (!context.domain) return fallbackDomainAttribution(urlOrDomain);
  const targets = collectManagedTargets(config, requests);
  const candidates = [];
  for (const target of targets) {
    const specificity = targetSpecificity(target, context);
    if (!Number.isFinite(specificity)) continue;
    candidates.push({ target, specificity });
  }
  const best = pickBestTarget(candidates);
  if (!best) return fallbackDomainAttribution(context.domain);
  return targetToAttribution(best.target, context, best.target.targetType);
}

export function quotaBucketForMode(mode) {
  const normalized = String(mode || '').trim().toLowerCase();
  if (['study', 'composite', 'rest', 'locked'].includes(normalized)) return normalized;
  return 'unknown';
}

export function managedTargetSnapshotFields(attribution = {}, mode = null) {
  return {
    managedTargetId: attribution.managedTargetId || null,
    managedTargetType: attribution.managedTargetType || null,
    managedTargetNamespace: attribution.managedTargetNamespace || null,
    managedTargetValue: attribution.managedTargetValue || null,
    managedTargetLabelAtTime: attribution.managedTargetLabelAtTime || null,
    targetSourceAtTime: attribution.targetSourceAtTime || null,
    targetRuleId: attribution.targetRuleId || null,
    targetMatchLevel: attribution.targetMatchLevel || null,
    targetClassificationAtTime: attribution.targetClassificationAtTime || null,
    quotaBucketAtTime: attribution.quotaBucketAtTime || quotaBucketForMode(mode),
  };
}

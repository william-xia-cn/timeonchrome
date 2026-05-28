// core/incognito-persistence.js — sanitize incognito content at persistence exits.

export const INCOGNITO_PLACEHOLDER_DOMAIN = 'anonymous.private';
export const INCOGNITO_PLACEHOLDER_TEXT = '匿名浏览';

const CONTENT_DERIVED_KEYS = new Set([
  'domain',
  'fallbackDomain',
  'url',
  'href',
  'uri',
  'title',
  'sourceUrl',
  'tabUrl',
  'targetUrl',
  'mediaSourceDomain',
  'mediaSourceUrl',
  'mediaSource',
  'resource',
  'summary',
  'youtubeResource',
  'videoId',
  'playlistId',
  'managedTargetValue',
  'managedTargetLabelAtTime',
]);

function hasIncognitoFlag(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.incognito === true) return true;
  if (value.privacyScope === 'incognito') return true;
  if (value.details && typeof value.details === 'object') return hasIncognitoFlag(value.details);
  return false;
}

export function isIncognitoPersistenceContext(record = null, context = null) {
  return hasIncognitoFlag(context) || hasIncognitoFlag(record);
}

function firstValue(...values) {
  for (const value of values) {
    if (value != null && value !== '') return value;
  }
  return null;
}

function shouldSanitizeIncognitoRecord(record = {}, context = {}) {
  if (!isIncognitoPersistenceContext(record, context)) return false;
  const classification = firstValue(
    record?.targetClassificationAtTime,
    context?.targetClassificationAtTime,
    record?.classification,
    context?.classification,
  );
  const matchLevel = firstValue(record?.targetMatchLevel, context?.targetMatchLevel);
  const managedTargetId = firstValue(record?.managedTargetId, context?.managedTargetId);
  if (classification === 'pending_composite') return true;
  if (matchLevel === 'domain_fallback' || matchLevel === 'unknown_fallback') return true;
  if (!classification && !managedTargetId) return true;
  return false;
}

export function makeIncognitoObjectId(record = {}, context = {}) {
  const source = context || {};
  const fallback = record || {};
  const date = String(source.date || fallback.date || '').replace(/[^0-9]/g, '') ||
    new Date(Number(source.startMs || fallback.startMs || Date.now())).toISOString().slice(0, 10).replace(/-/g, '');
  const tab = Number.isInteger(source.tabId) ? source.tabId : (Number.isInteger(fallback.tabId) ? fallback.tabId : 'tab');
  const win = Number.isInteger(source.windowId) ? source.windowId : (Number.isInteger(fallback.windowId) ? fallback.windowId : 'window');
  return `__incognito_${date}_${tab}_${win}`;
}

function isContentDerivedKey(key = '') {
  const normalized = String(key || '');
  if (CONTENT_DERIVED_KEYS.has(normalized)) return true;
  return /(^|_)(url|href|uri|title|playlistId|videoId|youtubeResource|mediaSourceUrl|mediaSourceDomain)$/i.test(normalized);
}

function replacementForKey(key, record, context) {
  if (key === 'domain' || key === 'fallbackDomain' || key === 'mediaSourceDomain') {
    return INCOGNITO_PLACEHOLDER_DOMAIN;
  }
  if (key === 'managedTargetValue') return makeIncognitoObjectId(record, context);
  if (key === 'managedTargetLabelAtTime') return INCOGNITO_PLACEHOLDER_TEXT;
  return INCOGNITO_PLACEHOLDER_TEXT;
}

function sanitizeValue(value, key, root, context, depth = 0) {
  if (value == null) return value;
  if (isContentDerivedKey(key)) return replacementForKey(key, root, context);
  if (typeof value === 'string' && /https?:\/\/|[a-z0-9.-]+\.[a-z]{2,}/i.test(value)) {
    return INCOGNITO_PLACEHOLDER_TEXT;
  }
  if (depth > 8) return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, key, root, context, depth + 1));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      out[childKey] = sanitizeValue(childValue, childKey, root, context, depth + 1);
    }
    return out;
  }
  return value;
}

export function sanitizeIncognitoForPersistence(record, context = {}) {
  if (Array.isArray(record)) {
    return record.map((item) => sanitizeIncognitoForPersistence(item, context));
  }
  if (!record || typeof record !== 'object') return record;
  if (!shouldSanitizeIncognitoRecord(record, context)) {
    let changed = false;
    const out = {};
    for (const [key, value] of Object.entries(record)) {
      const next = sanitizeIncognitoForPersistence(value, context);
      out[key] = next;
      if (next !== value) changed = true;
    }
    return changed ? out : record;
  }
  const sanitized = sanitizeValue(record, '', record, context);
  sanitized.incognito = true;
  if (sanitized.domain && typeof sanitized.domain === 'string') sanitized.domain = INCOGNITO_PLACEHOLDER_DOMAIN;
  if (sanitized.fallbackDomain && typeof sanitized.fallbackDomain === 'string') sanitized.fallbackDomain = INCOGNITO_PLACEHOLDER_DOMAIN;
  if (sanitized.managedTargetValue) sanitized.managedTargetValue = makeIncognitoObjectId(record, context);
  if (sanitized.managedTargetLabelAtTime) sanitized.managedTargetLabelAtTime = INCOGNITO_PLACEHOLDER_TEXT;
  return sanitized;
}

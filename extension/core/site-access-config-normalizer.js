// core/site-access-config-normalizer.js -- Runtime site-access config semantics migration.
import { normalizeHostname } from './domain-semantics.js';

export const SITE_ACCESS_RUNTIME_SCHEMA_VERSION = 1;
export const SITE_ACCESS_SEMANTIC_VERSION = '2026-07-29.site-access-runtime-v1';
export const SITE_ACCESS_MIGRATIONS = ['M001_default_user_composite_runtime', 'M002_youtube_special_root_restricted', 'M003_stale_composite_cleanup'];

const STALE_COMPOSITE_DOMAINS_TO_REMOVE = new Set([
  'bilibili.com',
  'www.bilibili.com',
  '163.com',
  'www.163.com',
]);

const SPECIAL_RESTRICTED_ROOT_DOMAINS = new Set(['youtube.com', 'www.youtube.com']);
const SPECIAL_RESTRICTED_ROOT_CANONICAL_DOMAINS = ['youtube.com'];

const SITE_ACCESS_SOURCE_KEYS = {
  studyDefaults: ['defaultStudySites', 'defaultStudyList', 'systemConfiguredStudySites', 'systemConfiguredStudyList'],
  studyCustom: ['customStudyList', 'customStudySites'],
  compositeDefaults: ['defaultCompositeSites', 'defaultCompositeList', 'systemConfiguredCompositeSites', 'systemConfiguredCompositeList'],
  userCompositeDefaults: ['defaultUserCompositeSites', 'defaultUserCompositeList', 'recommendedCompositeSites', 'systemConfiguredUserCompositeSites', 'systemConfiguredUserCompositeList'],
  compositeCustom: ['customCompositeList', 'customCompositeSites'],
  restrictedDefaults: ['defaultRestrictedEntertainmentSites', 'defaultRestrictedEntertainmentList', 'systemConfiguredRestrictedEntertainmentSites', 'systemConfiguredRestrictedEntertainmentList'],
  restrictedCustom: ['customRestrictedEntertainmentList', 'customRestrictedEntertainmentSites'],
  blockedDefaults: ['defaultBlockedSites', 'defaultBlockedList', 'defaultUnsafeSites', 'defaultUnsafeList', 'systemConfiguredBlockedSites', 'systemConfiguredBlockedList', 'systemConfiguredUnsafeSites', 'systemConfiguredUnsafeList'],
  blockedCustom: ['customBlockedSites', 'customBlockedList', 'customUnsafeSites', 'customUnsafeList'],
};

function normalizeHostValue(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) || /[/?#]/.test(raw)) return null;
  return normalizeHostname(raw);
}

function hostList(value) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(value) ? value : []) {
    const host = normalizeHostValue(item);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    out.push(host);
  }
  return out;
}

function firstArray(source, keys) {
  for (const key of keys) {
    if (Array.isArray(source?.[key])) return source[key];
  }
  return null;
}

function mergeHosts(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    for (const host of hostList(list)) {
      if (seen.has(host)) continue;
      seen.add(host);
      out.push(host);
    }
  }
  return out;
}

function removeHosts(list, blockedHosts) {
  const blocked = blockedHosts instanceof Set ? blockedHosts : new Set(hostList(blockedHosts));
  return hostList(list).filter((host) => !blocked.has(host));
}

function removeStaleCompositeHosts(list) {
  return removeHosts(list, STALE_COMPOSITE_DOMAINS_TO_REMOVE);
}

function subtractHosts(list, defaults) {
  const defaultSet = new Set(hostList(defaults));
  return hostList(list).filter((host) => !defaultSet.has(host));
}

function sourceList(config, keys, options = {}) {
  const direct = firstArray(config, keys);
  if (direct) return hostList(direct);
  if (options.fallbackConfig) {
    const fallbackDirect = firstArray(options.fallbackConfig, keys);
    if (fallbackDirect) return hostList(fallbackDirect);
  }
  if (options.fallbackEffectiveKey && Array.isArray(options.fallbackConfig?.[options.fallbackEffectiveKey])) {
    return hostList(options.fallbackConfig[options.fallbackEffectiveKey]);
  }
  if (options.effectiveKey && !options.customKeys?.some((key) => Array.isArray(config?.[key])) && Array.isArray(config?.[options.effectiveKey])) {
    return hostList(config[options.effectiveKey]);
  }
  return [];
}

function customList(config, keys, effectiveKey, defaults) {
  const direct = firstArray(config, keys);
  if (direct) return hostList(direct);
  if (!Array.isArray(config?.[effectiveKey])) return [];
  return subtractHosts(config[effectiveKey], defaults);
}

function normalizeRules(rules) {
  return Array.isArray(rules) ? rules : [];
}

function listsEqual(a, b) {
  return JSON.stringify(a || []) === JSON.stringify(b || []);
}

function sameRuntimeConfig(before, after) {
  const keys = [
    'defaultStudySites', 'defaultCompositeSites', 'defaultUserCompositeSites', 'defaultRestrictedEntertainmentSites', 'defaultBlockedSites',
    'customStudyList', 'customCompositeList', 'customRestrictedEntertainmentList', 'customBlockedSites',
    'studyList', 'compositeList', 'restrictedEntertainmentList', 'unsafeList',
    'siteAccessRuntimeSchemaVersion', 'siteAccessSemanticVersion', 'siteAccessMigrationsApplied',
  ];
  return keys.every((key) => {
    if (Array.isArray(after[key]) || Array.isArray(before?.[key])) return listsEqual(before?.[key], after[key]);
    return before?.[key] === after[key];
  });
}

export function normalizeRuntimeSiteAccessConfig(config = {}, options = {}) {
  const source = config && typeof config === 'object' ? config : {};
  const fallbackConfig = options.fallbackConfig || null;

  let defaultStudySites = sourceList(source, SITE_ACCESS_SOURCE_KEYS.studyDefaults, {
    fallbackConfig,
    fallbackEffectiveKey: 'studyList',
  });
  const fallbackStudyDefaults = mergeHosts(
    firstArray(fallbackConfig, SITE_ACCESS_SOURCE_KEYS.studyDefaults) || [],
    fallbackConfig?.studyList || [],
  );
  defaultStudySites = mergeHosts(fallbackStudyDefaults, defaultStudySites);
  let defaultCompositeSites = sourceList(source, SITE_ACCESS_SOURCE_KEYS.compositeDefaults, { fallbackConfig });
  let defaultUserCompositeSites = sourceList(source, SITE_ACCESS_SOURCE_KEYS.userCompositeDefaults, { fallbackConfig });
  let defaultRestrictedEntertainmentSites = sourceList(source, SITE_ACCESS_SOURCE_KEYS.restrictedDefaults, { fallbackConfig });
  let defaultBlockedSites = sourceList(source, SITE_ACCESS_SOURCE_KEYS.blockedDefaults, { fallbackConfig });

  const compositeDefaultsForCustom = mergeHosts(defaultCompositeSites, defaultUserCompositeSites);
  let customStudyList = customList(source, SITE_ACCESS_SOURCE_KEYS.studyCustom, 'studyList', defaultStudySites);
  let customCompositeList = customList(source, SITE_ACCESS_SOURCE_KEYS.compositeCustom, 'compositeList', compositeDefaultsForCustom);
  let customRestrictedEntertainmentList = customList(source, SITE_ACCESS_SOURCE_KEYS.restrictedCustom, 'restrictedEntertainmentList', defaultRestrictedEntertainmentSites);
  let customBlockedSites = customList(source, SITE_ACCESS_SOURCE_KEYS.blockedCustom, 'unsafeList', defaultBlockedSites);

  defaultCompositeSites = removeStaleCompositeHosts(defaultCompositeSites);
  defaultUserCompositeSites = removeStaleCompositeHosts(defaultUserCompositeSites);
  customCompositeList = removeStaleCompositeHosts(customCompositeList);

  defaultStudySites = removeHosts(defaultStudySites, SPECIAL_RESTRICTED_ROOT_DOMAINS);
  customStudyList = removeHosts(customStudyList, SPECIAL_RESTRICTED_ROOT_DOMAINS);
  defaultCompositeSites = removeHosts(defaultCompositeSites, SPECIAL_RESTRICTED_ROOT_DOMAINS);
  defaultUserCompositeSites = removeHosts(defaultUserCompositeSites, SPECIAL_RESTRICTED_ROOT_DOMAINS);
  customCompositeList = removeHosts(customCompositeList, SPECIAL_RESTRICTED_ROOT_DOMAINS);
  defaultBlockedSites = removeHosts(defaultBlockedSites, SPECIAL_RESTRICTED_ROOT_DOMAINS);
  customBlockedSites = removeHosts(customBlockedSites, SPECIAL_RESTRICTED_ROOT_DOMAINS);
  defaultRestrictedEntertainmentSites = mergeHosts(removeHosts(defaultRestrictedEntertainmentSites, SPECIAL_RESTRICTED_ROOT_DOMAINS), SPECIAL_RESTRICTED_ROOT_CANONICAL_DOMAINS);

  const studyList = mergeHosts(defaultStudySites, customStudyList);
  const compositeList = mergeHosts(defaultCompositeSites, defaultUserCompositeSites, customCompositeList);
  const restrictedEntertainmentList = mergeHosts(defaultRestrictedEntertainmentSites, customRestrictedEntertainmentList);
  const unsafeList = mergeHosts(defaultBlockedSites, customBlockedSites);

  const normalized = {
    ...source,
    defaultStudySites,
    defaultCompositeSites,
    defaultUserCompositeSites,
    defaultRestrictedEntertainmentSites,
    defaultBlockedSites,
    customStudyList,
    customCompositeList,
    customRestrictedEntertainmentList,
    customBlockedSites,
    studyList,
    compositeList,
    restrictedEntertainmentList,
    unsafeList,
    siteClassificationRulesV1: normalizeRules(source.siteClassificationRulesV1),
    siteAccessRuntimeSchemaVersion: SITE_ACCESS_RUNTIME_SCHEMA_VERSION,
    siteAccessSemanticVersion: SITE_ACCESS_SEMANTIC_VERSION,
    siteAccessMigrationsApplied: SITE_ACCESS_MIGRATIONS,
  };

  return {
    config: normalized,
    changed: !sameRuntimeConfig(source, normalized),
    migrationsApplied: SITE_ACCESS_MIGRATIONS,
  };
}

import fallbackDefaults from '../../config/site-access-defaults.json';
import { Env } from '../db/middleware';

export const SYSTEM_ACCESS_CONFIG_ID = 'global';
export const SYSTEM_ACCESS_SCHEMA_VERSION = 1;
export const SYSTEM_ACCESS_TAXONOMY_VERSION = 'qustodio-web-filters-v1';

export const QUSTODIO_CONTENT_CATEGORIES = [
  '教育性', '政府', '企业', '健康', '人工智能', '技术', '职业',
  '网页邮件', '文件共享', '搜索门户', '新闻', '宗教', '综合门户',
  '娱乐', '体育', '游戏', '旅游', '购物', '论坛', '社交网络', '聊天', '视频/直播', '娱乐门户',
  '博彩', '代理/漏洞', '暴力', '武器', '脏话', '成人内容', '色情内容', '酒精', '毒品', '烟草',
];

export const SYSTEM_ACCESS_CLASSIFICATIONS = [
  'study', 'composite', 'restricted', 'blocked', 'observe', 'keep',
];

type SiteCatalogItem = {
  domain: string;
  name?: string;
  contentCategory?: string;
  classification?: string;
  confidence?: string;
  notes?: string;
};

const SPECIAL_RESTRICTED_ROOT_DOMAINS = ['youtube.com'];
const STALE_COMPOSITE_DOMAINS_TO_REMOVE = ['bilibili.com', 'www.bilibili.com', '163.com', 'www.163.com'];

export type SystemAccessConfig = {
  configType: 'system-access-config';
  schemaVersion: number;
  taxonomyVersion: string;
  defaultStudySites: string[];
  defaultCompositeSites: string[];
  defaultUserCompositeSites: string[];
  defaultRestrictedEntertainmentSites: string[];
  defaultBlockedSites: string[];
  siteCatalog: SiteCatalogItem[];
};

function normalizeHost(value: unknown): string | null {
  const raw = String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/g, '').replace(/\.+$/g, '');
  if (!raw || raw.includes('/') || raw.includes(' ') || raw.includes('@')) return null;
  try {
    const host = new URL(`http://${raw}`).hostname.toLowerCase().replace(/\.+$/g, '');
    if (!host || !host.includes('.') || !/^[a-z0-9.-]+$/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

function stringList(value: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(value) ? value : []) {
    const host = normalizeHost(item);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    out.push(host);
  }
  return out;
}

function specialRootVariants(): Set<string> {
  const variants = new Set<string>();
  for (const root of SPECIAL_RESTRICTED_ROOT_DOMAINS) {
    const host = normalizeHost(root);
    if (!host) continue;
    variants.add(host);
    variants.add(`www.${host}`);
  }
  return variants;
}

function withoutHosts(list: string[], blockedHosts: Set<string>): string[] {
  return (list || []).filter((item) => {
    const host = normalizeHost(item);
    return !!host && !blockedHosts.has(host);
  });
}

function withEnsuredHosts(list: string[], hosts: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of [...(list || []), ...hosts]) {
    const host = normalizeHost(item);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    out.push(host);
  }
  return out;
}

function applySystemAccessConfigInvariants(config: SystemAccessConfig): SystemAccessConfig {
  const specialRoots = specialRootVariants();
  return {
    ...config,
    defaultStudySites: withoutHosts(config.defaultStudySites, specialRoots),
    defaultCompositeSites: withoutHosts(config.defaultCompositeSites, specialRoots),
    defaultUserCompositeSites: withoutHosts(config.defaultUserCompositeSites, specialRoots),
    defaultBlockedSites: withoutHosts(config.defaultBlockedSites, specialRoots),
    defaultRestrictedEntertainmentSites: withEnsuredHosts(
      withoutHosts(config.defaultRestrictedEntertainmentSites, specialRoots),
      SPECIAL_RESTRICTED_ROOT_DOMAINS,
    ),
  };
}

function normalizeCatalog(value: unknown): SiteCatalogItem[] {
  const out: SiteCatalogItem[] = [];
  const categories = new Set(QUSTODIO_CONTENT_CATEGORIES);
  const classifications = new Set(SYSTEM_ACCESS_CLASSIFICATIONS);
  for (const item of Array.isArray(value) ? value : []) {
    const domain = normalizeHost((item as any)?.domain);
    if (!domain) continue;
    const rawCategory = String((item as any)?.contentCategory || '').trim();
    const rawClassification = String((item as any)?.classification || '').trim();
    out.push({
      domain,
      name: String((item as any)?.name || '').trim().slice(0, 120) || undefined,
      contentCategory: categories.has(rawCategory) ? rawCategory : undefined,
      classification: classifications.has(rawClassification) ? rawClassification : undefined,
      confidence: String((item as any)?.confidence || '').trim().slice(0, 24) || undefined,
      notes: String((item as any)?.notes || '').trim().slice(0, 400) || undefined,
    });
  }
  return out;
}

const DEFAULT_CONTENT_CATEGORY_BY_CLASSIFICATION: Record<string, string> = {
  study: '教育性',
  composite: '综合门户',
  restricted: '娱乐',
  blocked: '社交网络',
};

function catalogByDomain(items: SiteCatalogItem[] = []): Map<string, SiteCatalogItem> {
  const map = new Map<string, SiteCatalogItem>();
  for (const item of items) {
    const domain = normalizeHost(item.domain);
    if (domain && !map.has(domain)) map.set(domain, { ...item, domain });
  }
  return map;
}

function listHostsWithClassification(config: SystemAccessConfig): Array<{ domain: string; classification: string }> {
  const out: Array<{ domain: string; classification: string }> = [];
  const push = (list: string[], classification: string) => {
    for (const domain of list || []) out.push({ domain, classification });
  };
  push(config.defaultStudySites, 'study');
  push(config.defaultCompositeSites, 'composite');
  push(config.defaultUserCompositeSites, 'composite');
  push(config.defaultRestrictedEntertainmentSites, 'restricted');
  push(config.defaultBlockedSites, 'blocked');
  return out;
}

function ensureCatalogCoverage(config: SystemAccessConfig): SystemAccessConfig {
  const sourceCatalog = catalogByDomain(config.siteCatalog);
  const fallbackCatalog = catalogByDomain(normalizeCatalog((fallbackDefaults as any).siteCatalog));
  const covered = new Set<string>();
  const siteCatalog: SiteCatalogItem[] = [];
  for (const { domain, classification } of listHostsWithClassification(config)) {
    const host = normalizeHost(domain);
    if (!host || covered.has(host)) continue;
    const source = sourceCatalog.get(host);
    const fallback = fallbackCatalog.get(host);
    const item = SPECIAL_RESTRICTED_ROOT_DOMAINS.includes(host)
      ? (fallback || source || { domain: host })
      : (source || fallback || { domain: host });
    covered.add(host);
    siteCatalog.push({
      domain: host,
      name: item.name || fallback?.name || host,
      contentCategory: item.contentCategory || fallback?.contentCategory || DEFAULT_CONTENT_CATEGORY_BY_CLASSIFICATION[classification] || '综合门户',
      classification,
      confidence: item.confidence || fallback?.confidence || 'medium',
      notes: item.notes || fallback?.notes || 'Auto-filled system site catalog metadata.',
    });
  }
  for (const item of config.siteCatalog || []) {
    const host = normalizeHost(item.domain);
    if (!host || covered.has(host)) continue;
    covered.add(host);
    siteCatalog.push({ ...item, domain: host });
  }
  return { ...config, siteCatalog };
}

export function normalizeSystemAccessConfig(input: any): SystemAccessConfig {
  const source = input && typeof input === 'object' ? input : {};
  return ensureCatalogCoverage(applySystemAccessConfigInvariants({
    configType: 'system-access-config',
    schemaVersion: SYSTEM_ACCESS_SCHEMA_VERSION,
    taxonomyVersion: String(source.taxonomyVersion || SYSTEM_ACCESS_TAXONOMY_VERSION),
    defaultStudySites: stringList(source.defaultStudySites),
    defaultCompositeSites: stringList(source.defaultCompositeSites),
    defaultUserCompositeSites: stringList(source.defaultUserCompositeSites),
    defaultRestrictedEntertainmentSites: stringList(source.defaultRestrictedEntertainmentSites),
    defaultBlockedSites: stringList(source.defaultBlockedSites),
    siteCatalog: normalizeCatalog(source.siteCatalog),
  }));
}

export function fallbackSystemAccessConfig(): SystemAccessConfig {
  return normalizeSystemAccessConfig({
    ...(fallbackDefaults as any),
    configType: 'system-access-config',
    schemaVersion: SYSTEM_ACCESS_SCHEMA_VERSION,
    taxonomyVersion: SYSTEM_ACCESS_TAXONOMY_VERSION,
  });
}

export async function getSystemAccessConfigRecord(env: Env): Promise<{
  config: SystemAccessConfig;
  source: 'd1' | 'fallback';
  version: number;
  updatedAt: number | null;
  updatedByAccountId: string | null;
  note: string | null;
}> {
  try {
    const row = await env.DB.prepare(
      `SELECT config_json, version, updated_at, updated_by_account_id, note
       FROM system_access_config_v1 WHERE id = ?`
    ).bind(SYSTEM_ACCESS_CONFIG_ID).first<{
      config_json: string;
      version: number;
      updated_at: number | null;
      updated_by_account_id: string | null;
      note: string | null;
    }>();
    if (row?.config_json) {
      return {
        config: normalizeSystemAccessConfig(JSON.parse(row.config_json)),
        source: 'd1',
        version: Number(row.version || 1),
        updatedAt: row.updated_at || null,
        updatedByAccountId: row.updated_by_account_id || null,
        note: row.note || null,
      };
    }
  } catch {
    // Fallback keeps device config readable before migration is applied.
  }
  return { config: fallbackSystemAccessConfig(), source: 'fallback', version: 1, updatedAt: null, updatedByAccountId: null, note: null };
}

export async function getSystemAccessConfig(env: Env): Promise<SystemAccessConfig> {
  return (await getSystemAccessConfigRecord(env)).config;
}

export function systemAccessDefaultsResponse(config: SystemAccessConfig) {
  return {
    version: config.schemaVersion,
    schemaVersion: config.schemaVersion,
    configType: config.configType,
    taxonomyVersion: config.taxonomyVersion,
    defaultStudySites: config.defaultStudySites,
    defaultCompositeSites: config.defaultCompositeSites,
    defaultUserCompositeSites: config.defaultUserCompositeSites || [],
    defaultRestrictedEntertainmentSites: config.defaultRestrictedEntertainmentSites,
    defaultBlockedSites: config.defaultBlockedSites,
    siteCatalog: config.siteCatalog || [],
  };
}

export function mergeWithDefaults(customList: string[] = [], defaultList: string[] = []): string[] {
  const defaultSet = new Set(defaultList.map(d => String(d).toLowerCase()));
  const custom = (customList || []).filter(d => !defaultSet.has(String(d).toLowerCase()));
  return [...defaultList, ...custom];
}

function withoutDefaultHosts(list: string[] = [], defaults: string[] = []): string[] {
  const defaultSet = new Set((defaults || []).map((item) => normalizeHost(item)).filter(Boolean));
  return stringList(list).filter((host) => !defaultSet.has(host));
}

function runtimeCustomList(config: any, customKey: string, effectiveKey: string, defaults: string[] = [], classification: string): string[] {
  const raw = Array.isArray(config?.[customKey]) ? config[customKey] : withoutDefaultHosts(config?.[effectiveKey], defaults);
  let list = stringList(raw);
  const specialRoots = specialRootVariants();
  if (classification !== 'restricted') list = withoutHosts(list, specialRoots);
  if (classification === 'composite') list = withoutHosts(list, new Set(STALE_COMPOSITE_DOMAINS_TO_REMOVE));
  return list;
}

export function applySystemAccessDefaultsToProfileConfig(config: any, defaults: SystemAccessConfig): any {
  const next = config && typeof config === 'object' ? { ...config } : {};
  const normalizedDefaults = normalizeSystemAccessConfig(defaults);
  const compositeSystemDefaults = mergeWithDefaults(normalizedDefaults.defaultUserCompositeSites || [], normalizedDefaults.defaultCompositeSites);
  const customStudyList = runtimeCustomList(next, 'customStudyList', 'studyList', normalizedDefaults.defaultStudySites, 'study');
  const customCompositeList = runtimeCustomList(next, 'customCompositeList', 'compositeList', compositeSystemDefaults, 'composite');
  const customRestrictedEntertainmentList = runtimeCustomList(next, 'customRestrictedEntertainmentList', 'restrictedEntertainmentList', normalizedDefaults.defaultRestrictedEntertainmentSites, 'restricted');
  const customBlockedSites = runtimeCustomList(next, 'customBlockedSites', 'unsafeList', normalizedDefaults.defaultBlockedSites, 'blocked');

  next.defaultStudySites = normalizedDefaults.defaultStudySites;
  next.defaultCompositeSites = normalizedDefaults.defaultCompositeSites;
  next.defaultUserCompositeSites = normalizedDefaults.defaultUserCompositeSites || [];
  next.defaultRestrictedEntertainmentSites = normalizedDefaults.defaultRestrictedEntertainmentSites;
  next.defaultBlockedSites = normalizedDefaults.defaultBlockedSites;
  next.customStudyList = customStudyList;
  next.customCompositeList = customCompositeList;
  next.customRestrictedEntertainmentList = customRestrictedEntertainmentList;
  next.customBlockedSites = customBlockedSites;
  next.studyList = mergeWithDefaults(customStudyList, normalizedDefaults.defaultStudySites);
  next.compositeList = mergeWithDefaults(customCompositeList, compositeSystemDefaults);
  next.restrictedEntertainmentList = mergeWithDefaults(customRestrictedEntertainmentList, normalizedDefaults.defaultRestrictedEntertainmentSites);
  next.unsafeList = mergeWithDefaults(customBlockedSites, normalizedDefaults.defaultBlockedSites);
  next.siteAccessRuntimeSchemaVersion = 1;
  next.siteAccessSemanticVersion = '2026-07-29.site-access-runtime-v1';
  return next;
}

export function validateSystemAccessConfig(input: any): { ok: boolean; config: SystemAccessConfig; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!input || typeof input !== 'object') errors.push('系统访问配置必须是 JSON object');
  if (input?.configType !== 'system-access-config') errors.push('configType 必须是 system-access-config');
  if (Number(input?.schemaVersion) !== SYSTEM_ACCESS_SCHEMA_VERSION) errors.push(`schemaVersion 必须是 ${SYSTEM_ACCESS_SCHEMA_VERSION}`);
  if (input?.taxonomyVersion !== SYSTEM_ACCESS_TAXONOMY_VERSION) errors.push(`taxonomyVersion 必须是 ${SYSTEM_ACCESS_TAXONOMY_VERSION}`);

  const rawLists = ['defaultStudySites', 'defaultCompositeSites', 'defaultUserCompositeSites', 'defaultRestrictedEntertainmentSites', 'defaultBlockedSites'];
  for (const key of rawLists) {
    if (!Array.isArray(input?.[key])) errors.push(`${key} 必须是数组`);
    for (const item of Array.isArray(input?.[key]) ? input[key] : []) {
      if (!normalizeHost(item)) errors.push(`${key} 包含非法域名: ${String(item)}`);
    }
  }
  const config = normalizeSystemAccessConfig(input || {});
  const categoryByHost = new Map<string, string>();
  const listDefs = [
    ['defaultStudySites', config.defaultStudySites],
    ['defaultCompositeSites', config.defaultCompositeSites],
    ['defaultUserCompositeSites', config.defaultUserCompositeSites],
    ['defaultRestrictedEntertainmentSites', config.defaultRestrictedEntertainmentSites],
    ['defaultBlockedSites', config.defaultBlockedSites],
  ] as const;
  for (const [name, list] of listDefs) {
    for (const host of list) {
      const existing = categoryByHost.get(host);
      if (existing && existing !== name) errors.push(`${host} 同时存在于 ${existing} 和 ${name}`);
      categoryByHost.set(host, name);
    }
  }

  const validCategories = new Set(QUSTODIO_CONTENT_CATEGORIES);
  const validClassifications = new Set(SYSTEM_ACCESS_CLASSIFICATIONS);
  for (const item of Array.isArray(input?.siteCatalog) ? input.siteCatalog : []) {
    if (!normalizeHost(item?.domain)) errors.push(`siteCatalog 包含非法域名: ${String(item?.domain || '')}`);
    if (item?.contentCategory && !validCategories.has(String(item.contentCategory))) errors.push(`siteCatalog ${item.domain || ''} contentCategory 非法`);
    if (item?.classification && !validClassifications.has(String(item.classification))) errors.push(`siteCatalog ${item.domain || ''} classification 非法`);
  }
  if (!config.defaultStudySites.length) warnings.push('defaultStudySites 为空');
  return { ok: errors.length === 0, config, errors, warnings };
}

export function summarizeSystemAccessConfig(config: SystemAccessConfig) {
  const byContentCategory: Record<string, number> = {};
  const byClassification: Record<string, number> = {};
  for (const item of config.siteCatalog || []) {
    if (item.contentCategory) byContentCategory[item.contentCategory] = (byContentCategory[item.contentCategory] || 0) + 1;
    if (item.classification) byClassification[item.classification] = (byClassification[item.classification] || 0) + 1;
  }
  return {
    defaultStudySites: config.defaultStudySites.length,
    defaultCompositeSites: config.defaultCompositeSites.length,
    defaultUserCompositeSites: config.defaultUserCompositeSites.length,
    defaultRestrictedEntertainmentSites: config.defaultRestrictedEntertainmentSites.length,
    defaultBlockedSites: config.defaultBlockedSites.length,
    siteCatalog: config.siteCatalog.length,
    byContentCategory,
    byClassification,
  };
}

export function diffSystemAccessConfig(current: SystemAccessConfig, incoming: SystemAccessConfig) {
  const diffFor = (a: string[], b: string[]) => {
    const currentSet = new Set(a);
    const incomingSet = new Set(b);
    return {
      added: b.filter(x => !currentSet.has(x)),
      removed: a.filter(x => !incomingSet.has(x)),
      unchanged: b.filter(x => currentSet.has(x)).length,
    };
  };
  return {
    defaultStudySites: diffFor(current.defaultStudySites, incoming.defaultStudySites),
    defaultCompositeSites: diffFor(current.defaultCompositeSites, incoming.defaultCompositeSites),
    defaultUserCompositeSites: diffFor(current.defaultUserCompositeSites, incoming.defaultUserCompositeSites),
    defaultRestrictedEntertainmentSites: diffFor(current.defaultRestrictedEntertainmentSites, incoming.defaultRestrictedEntertainmentSites),
    defaultBlockedSites: diffFor(current.defaultBlockedSites, incoming.defaultBlockedSites),
  };
}

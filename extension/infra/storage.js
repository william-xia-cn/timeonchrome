// infra/storage.js — 配置/会话存储
import { domainForUrl, matchDomain as matchDomainV12, normalizeHostname } from '../core/domain-semantics.js';
import {
  getSiteClassificationForUrl,
  resolveSiteAccessClassification,
  normalizeSiteClassificationRequest,
  normalizeSiteClassificationTarget,
  siteDecisionMatchesUrl,
  validateSiteClassificationAction,
} from '../core/site-classification.js';
import { getPopupModeStatsView, getQuotaUsageView, getTodayUsageView, getUsageRangeView } from '../stats/managed-statistics.js';

const STORAGE_VERSION = '1.3';
export const CONFIG_KEY = 'guardian_config';
const HASH_KEY = 'guardian_hash';
export const STATS_KEY_PREFIX = 'stats_';
const UNDETERMINED_STATS_KEY_PREFIX = 'undetermined_stats_';
export const SESSION_KEY = 'guardian_session';
const SESSIONS_KEY = 'guardian_sessions';
export const VISIT_SESSIONS_KEY = 'visit_sessions';
const TEMP_COMPOSITE_DOMAINS_KEY = 'temporary_composite_domains';
export const SITE_CLASSIFICATION_REQUESTS_KEY = 'site_classification_requests_v1';
const CHANGELOG_KEY = 'guardian_changelog';
const MAX_CHANGELOG_ENTRIES = 100;
const MAX_SESSION_DAYS = 14;
const MIN_SESSION_DURATION = 10;

export const DEFAULT_CONFIG = {
  version: STORAGE_VERSION,
  adminPasswordHash: '',
  isInitialized: false,
  mode: 'study',
  studyList: [
    'drive.google.com', 'docs.google.com', 'sheets.google.com', 'slides.google.com', 'meet.google.com', 'calendar.google.com', 'classroom.google.com', 'keep.google.com', 'colab.research.google.com',
    'office.com', 'onenote.com', 'outlook.live.com', 'planner.microsoft.com', 'to-do.office.com', 'teams.microsoft.com',
    'openai.com', 'claude.ai', 'gemini.google.com', 'poe.com', 'perplexity.ai', 'notebooklm.google.com', 'elicit.org', 'consensus.app', 'scite.ai', 'wolframalpha.com', 'gamma.app',
    'quizlet.com', 'noredink.com', 'membean.com', 'achieve3000.com', 'quillbot.com', 'grammarly.com', 'overleaf.com', 'zotero.org', 'mendeley.com', 'owl.purdue.edu', 'citationmachine.net',
    'ibo.org', 'managebac.com', 'kognity.com', 'revisionvillage.com', 'savemyexams.com', 'ibdocuments.com', 'ibsurvival.com', 'lanterna.com', 'thinking.net', 'bioninja.com.au', 'theoryofknowledge.net',
    'khanacademy.org', 'ocw.mit.edu', 'coursera.org', 'edx.org', 'brilliant.org', 'udemy.com', 'futurelearn.com', 'britannica.com',
    'desmos.com', 'geogebra.org', 'symbolab.com', 'mathway.com', 'physicsclassroom.com', 'phet.colorado.edu', 'falstad.com', 'myphysicslab.com', 'logic.ly',
    'github.com', 'stackoverflow.com', 'leetcode.com', 'hackerrank.com', 'codingbat.com', 'replit.com', 'codepen.io', 'tinkercad.com', 'arduino.cc', 'raspberrypi.com', 'instructables.com',
    'arxiv.org', 'scholar.google.com', 'jstor.org', 'researchgate.net', 'semanticscholar.org', 'pubmed.ncbi.nlm.nih.gov', 'gutenberg.org', 'plato.stanford.edu',
    'canva.com', 'figma.com', 'photopea.com', 'pixlr.com',
    'notion.so', 'obsidian.md', 'ankiweb.net', 'trello.com', 'slack.com', 'reclaim.ai',
    'collegeboard.org'
  ],
  // System-configured composite sites (music.youtube.com remains composite) + user-default initial sites
  // youtube.com root is restricted; concrete YouTube objects use siteClassificationRulesV1
  compositeList: [
    // System-configured (9)
    'google.com', 'google.com.hk', 'bing.com', 'microsoft.com', 'apple.com', 'adobe.com',
    'music.youtube.com', 'spotify.com', 'music.163.com',
    // User-default initial — seeded into customCompositeList, removable by user
    'wikipedia.org', 'wikimedia.org', 'stackexchange.com', 'reddit.com'
  ],
  restrictedEntertainmentList: ['youtube.com'],
  unsafeList: ['douyin.com', 'tiktok.com'],
  dailyOnlineQuota: 0,
  dailyStudyQuota: 0,
  dailyRestQuota: 120,
  dailyUndeterminedQuota: 60,
  weeklyRestQuota: null,
  timeQuota: {
    daily: {
      monday:    { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
      tuesday:   { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
      wednesday: { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
      thursday:  { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
      friday:    { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
      saturday:  { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
      sunday:    { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
    },
  },
  timeWindows: {
    daily: {
      monday:    { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
      tuesday:   { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
      wednesday: { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
      thursday:  { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
      friday:    { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
      saturday:  { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
      sunday:    { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
    },
  },
  quotaBorrow: null,
  domainQuotas: {},
  classificationRules: [],
  siteClassificationRulesV1: [],
  quotaState: { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false },
  schedule: {
    enabled: false,
    days: {
      0: { enabled: true, start: '08:00', end: '21:00' },
      1: { enabled: true, start: '15:00', end: '21:00' },
      2: { enabled: true, start: '15:00', end: '21:00' },
      3: { enabled: true, start: '15:00', end: '21:00' },
      4: { enabled: true, start: '15:00', end: '21:00' },
      5: { enabled: true, start: '15:00', end: '21:00' },
      6: { enabled: true, start: '08:00', end: '21:00' }
    }
  },
  interceptAction: 'block',
  lockOnQuotaExceeded: true,
  enabled: true,
  blockMessage: '这个网站当前不在可访问范围内',
  lockedDomains: [],
  restConfig: { reminderInterval: 15, maxRestDuration: 60 },
  clientLoggingPolicyV1: {
    localEnabled: true,
    localMinLevel: 'warning',
    uploadEnabled: false,
    uploadMinLevel: 'error',
    categories: [],
    uploadCategories: [],
    targetDeviceIds: [],
    sampleRate: 1,
    retentionDays: 7,
    expiresAt: null,
  },
  updatedAt: null
};

const DEFAULT_SESSION = {
  currentMode: 'study',
  lastActiveDate: null,
  studySession: { totalSeconds: 0 },
  restSession: { totalSeconds: 0 }
};

// ── Utility functions ───────────────────────────────────────────────────────────

export function getDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function extractDomain(url) {
  return domainForUrl(url);
}

export function isSpecialUrl(url) {
  if (!url) return true;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://') || url.startsWith('about:')) {
    return true;
  }

  // Chrome new-tab provider page can be delivered as normal HTTPS navigation.
  // Treat only this narrow path as internal to avoid intercept/reminder noise.
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && parsed.hostname === 'www.google.com' && parsed.pathname.startsWith('/_/chrome/newtab')) {
      return true;
    }
  } catch {
    // Non-URL input should fall through to regular handling.
  }

  return false;
}

export function matchDomain(domain, pattern) {
  return matchDomainV12(domain, pattern);
}

function sortObjectKeys(obj) {
  return Object.keys(obj).sort().reduce((acc, key) => { acc[key] = obj[key]; return acc; }, {});
}

const STALE_COMPOSITE_DOMAINS_TO_REMOVE = new Set([
  'bilibili.com',
  'www.bilibili.com',
  '163.com',
  'www.163.com',
]);

export function sanitizeStaleCompositeDomains(config) {
  if (!config || typeof config !== 'object') return { config, changed: false };

  let changed = false;
  const next = { ...config };
  const listFields = ['compositeList', 'customCompositeList'];

  for (const field of listFields) {
    const list = next[field];
    if (!Array.isArray(list)) continue;
    const filtered = list.filter((item) => {
      if (typeof item !== 'string') return true;
      const normalized = normalizeHostname(item);
      return !normalized || !STALE_COMPOSITE_DOMAINS_TO_REMOVE.has(normalized);
    });
    if (filtered.length !== list.length) {
      next[field] = filtered;
      changed = true;
    }
  }

  return { config: next, changed };
}

async function computeHash(data) {
  const sorted = sortObjectKeys(data);
  const str = JSON.stringify(sorted);
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(str));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Config operations ───────────────────────────────────────────────────────────

export async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([CONFIG_KEY, HASH_KEY], async (result) => {
      if (!result[CONFIG_KEY]) {
        resolve({ ...DEFAULT_CONFIG });
        return;
      }
      const config = result[CONFIG_KEY];
      const storedHash = result[HASH_KEY];
      const computedHashVal = await computeHash(config);
      if (storedHash !== computedHashVal) {
        let safeConfig = {
          ...DEFAULT_CONFIG,
          ...config,
          adminPasswordHash: config.adminPasswordHash || '',
          isInitialized: config.isInitialized || false
        };
        const sanitized = sanitizeStaleCompositeDomains(safeConfig);
        safeConfig = sanitized.config;
        // 立即 resolve，saveConfig 异步执行（避免 callback-based storage API 导致死锁）
        if (sanitized.changed) {
          saveConfig(safeConfig).catch(() => {});
        }
        resolve(safeConfig);
        return;
      }
      const sanitized = sanitizeStaleCompositeDomains(config);
      // saveConfig 异步执行，不阻塞 getConfig
      if (sanitized.changed) {
        saveConfig(sanitized.config).catch(() => {});
      }
      resolve(sanitized.config);
    });
  });
}

export async function saveConfig(config) {
  config.updatedAt = Date.now();
  const hash = await computeHash(config);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CONFIG_KEY]: config, [HASH_KEY]: hash }, resolve);
  });
}

// ── Session operations ──────────────────────────────────────────────────────────

export async function getSession() {
  return new Promise((resolve) => {
    chrome.storage.local.get(SESSION_KEY, (result) => {
      const session = result[SESSION_KEY] || { ...DEFAULT_SESSION };
      resolve(session);
    });
  });
}

export async function saveSession(session) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SESSION_KEY]: session }, resolve);
  });
}

function getSessionStorageArea() {
  return chrome.storage.session || null;
}

function normalizeTemporaryCompositeDomain(domain) {
  if (!domain || typeof domain !== 'string') return null;
  const normalized = domain.trim().toLowerCase();
  return normalized || null;
}

function normalizeTemporaryCompositeRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const tabId = Number(record.tabId);
  const domain = normalizeTemporaryCompositeDomain(record.domain);
  if (!Number.isInteger(tabId) || tabId < 0 || !domain) return null;
  const createdAt = Number(record.createdAt) || Date.now();
  return { tabId, domain, createdAt };
}

export async function getTemporaryCompositePermissionRecords() {
  const area = getSessionStorageArea();
  if (!area) return [];
  return new Promise((resolve) => {
    area.get(TEMP_COMPOSITE_DOMAINS_KEY, (result) => {
      const list = result[TEMP_COMPOSITE_DOMAINS_KEY];
      if (!Array.isArray(list)) {
        resolve([]);
        return;
      }
      const migrated = list
        .map((item) => {
          if (typeof item === 'string') return null;
          return normalizeTemporaryCompositeRecord(item);
        })
        .filter(Boolean);
      resolve(migrated);
    });
  });
}

async function setTemporaryCompositePermissionRecords(records) {
  const area = getSessionStorageArea();
  if (!area) return;
  return new Promise((resolve) => {
    area.set({ [TEMP_COMPOSITE_DOMAINS_KEY]: records }, resolve);
  });
}

export async function getTemporaryCompositeDomains() {
  const records = await getTemporaryCompositePermissionRecords();
  return [...new Set(records.map((r) => r.domain))];
}

export async function hasTemporaryCompositePermission(tabId, domain) {
  const normalizedDomain = normalizeTemporaryCompositeDomain(domain);
  if (!Number.isInteger(tabId) || tabId < 0 || !normalizedDomain) return false;
  const records = await getTemporaryCompositePermissionRecords();
  return records.some((record) => record.tabId === tabId && record.domain === normalizedDomain);
}

export async function addTemporaryCompositeDomain(tabId, domain) {
  const area = getSessionStorageArea();
  if (!area) return { added: false };
  const normalizedDomain = normalizeTemporaryCompositeDomain(domain);
  if (!Number.isInteger(tabId) || tabId < 0 || !normalizedDomain) return { added: false };
  const records = await getTemporaryCompositePermissionRecords();
  if (records.some((record) => record.tabId === tabId && record.domain === normalizedDomain)) {
    return { added: false, alreadyPresent: true };
  }
  await setTemporaryCompositePermissionRecords([
    ...records,
    { tabId, domain: normalizedDomain, createdAt: Date.now() },
  ]);
  return { added: true };
}

export async function clearTemporaryCompositeDomainByTab(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  const records = await getTemporaryCompositePermissionRecords();
  const next = records.filter((record) => record.tabId !== tabId);
  if (next.length === records.length) return;
  await setTemporaryCompositePermissionRecords(next);
}

export async function clearTemporaryCompositeDomainByTabDomainMismatch(tabId, currentDomain) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  const normalizedDomain = normalizeTemporaryCompositeDomain(currentDomain);
  const records = await getTemporaryCompositePermissionRecords();
  const next = records.filter((record) => {
    if (record.tabId !== tabId) return true;
    if (!normalizedDomain) return false;
    return record.domain === normalizedDomain;
  });
  if (next.length === records.length) return;
  await setTemporaryCompositePermissionRecords(next);
}

export async function clearTemporaryCompositeDomains() {
  const area = getSessionStorageArea();
  if (!area) return;
  return new Promise((resolve) => {
    area.remove(TEMP_COMPOSITE_DOMAINS_KEY, resolve);
  });
}

// ── Site classification requests ───────────────────────────────────────────────

function makeLocalId(prefix = 'scr') {
  try {
    if (crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  } catch (_) {}
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function requestKey(targetType, normalizedValue) {
  return `${targetType}:${normalizedValue}`;
}

function requestDecisionTarget(record) {
  if (!record) return null;
  return {
    targetType: record.decisionTargetType || record.requestedTargetType,
    normalizedValue: record.decisionNormalizedValue || record.requestedNormalizedValue,
  };
}

function getConfiguredClassificationForTarget(config = {}, target) {
  if (!target?.ok) return null;
  const lookupValue = target.targetType === 'url' ? target.normalizedValue : target.host;
  const resolved = resolveSiteAccessClassification(config, [], lookupValue);
  return resolved.classification ? resolved : null;
}

async function setSiteClassificationRequestRecords(records) {
  const normalized = (Array.isArray(records) ? records : [])
    .map(normalizeSiteClassificationRequest)
    .filter(Boolean)
    .sort((a, b) => Number(b.requestedAt || b.createdAt || 0) - Number(a.requestedAt || a.createdAt || 0));
  await chrome.storage.local.set({ [SITE_CLASSIFICATION_REQUESTS_KEY]: normalized });
  return normalized;
}

export async function getSiteClassificationRequestRecords({ status = null, includeAll = false } = {}) {
  const data = await chrome.storage.local.get(SITE_CLASSIFICATION_REQUESTS_KEY).catch(() => ({}));
  const records = (Array.isArray(data?.[SITE_CLASSIFICATION_REQUESTS_KEY]) ? data[SITE_CLASSIFICATION_REQUESTS_KEY] : [])
    .map(normalizeSiteClassificationRequest)
    .filter(Boolean);
  const filtered = includeAll || !status
    ? records
    : records.filter((record) => record.status === status);
  return filtered.sort((a, b) => Number(b.requestedAt || b.createdAt || 0) - Number(a.requestedAt || a.createdAt || 0));
}

const COUNTABLE_SITE_OBSERVATION_SOURCES = new Set([
  'webNavigationCommitted',
  'webNavigationHistoryStateUpdated',
]);

function siteObservationNavigationKey(context = {}, now = Date.now()) {
  if (!COUNTABLE_SITE_OBSERVATION_SOURCES.has(context.observedEventSource)) return null;
  const tabId = Number.isInteger(context.sourceTabId) ? context.sourceTabId : 'no-tab';
  const url = String(context.url || context.domain || '').trim();
  return `${context.observedEventSource}:${tabId}:${url}:${Math.floor(now / 1000)}`;
}

function pendingSyncStatus(hasCloudToken) {
  return hasCloudToken ? 'pending' : 'local_only';
}

function applyUnclassifiedObservation(record, context, now, hasCloudToken) {
  const navigationKey = siteObservationNavigationKey(context, now);
  const firstObservation = !Number(record.firstObservedAt);
  const shouldIncrement = firstObservation || (
    navigationKey && navigationKey !== record.lastCountedNavigationKey
  );
  const previousSourceObservationCount = Math.max(0, Number(record.sourceObservationCount || 0));
  const sourceObservationCount = previousSourceObservationCount + (shouldIncrement ? 1 : 0);
  const previousAggregateCount = Math.max(
    Math.max(0, Number(record.observationCount || 0)),
    previousSourceObservationCount,
  );
  const firstObservedAt = Number(record.firstObservedAt || now);
  const sourceFirstObservedAt = Number(record.sourceFirstObservedAt || now);
  return {
    ...record,
    recordSource: record.recordSource === 'legacy' ? 'auto_unclassified_access' : record.recordSource,
    firstObservedAt,
    lastObservedAt: now,
    observationCount: previousAggregateCount + (shouldIncrement ? 1 : 0),
    observationSourceId: record.observationSourceId || makeLocalId('obs'),
    sourceFirstObservedAt,
    sourceLastObservedAt: now,
    sourceObservationCount,
    lastCountedNavigationKey: shouldIncrement && navigationKey
      ? navigationKey
      : record.lastCountedNavigationKey || null,
    sourceTabId: Number.isInteger(context.sourceTabId) ? context.sourceTabId : record.sourceTabId ?? null,
    sourceUrl: context.url || record.sourceUrl || null,
    sourceDomain: context.domain || record.sourceDomain || null,
    updatedAt: now,
    syncStatus: pendingSyncStatus(hasCloudToken),
    lastSyncError: null,
  };
}

async function upsertPendingSiteClassificationRecord(input, context = {}, options = {}) {
  const target = normalizeSiteClassificationTarget(input);
  if (!target.ok) {
    return { ok: false, code: target.code || 'INVALID_TARGET', error: target.error || 'invalid target' };
  }

  const [records, config, cloud] = await Promise.all([
    getSiteClassificationRequestRecords({ includeAll: true }),
    getConfig(),
    chrome.storage.local.get(['cloud_device_id', 'cloud_profile_id', 'cloud_device_token']).catch(() => ({})),
  ]);
  const lookupValue = target.targetType === 'url' ? target.normalizedValue : target.host;
  const classification = getSiteClassificationForUrl(config, records, lookupValue);
  if (classification.classification === 'rejected') {
    return { ok: false, code: 'REQUEST_REJECTED', error: 'request rejected', request: classification.request || null, rule: classification.rule || null };
  }
  const actionValidation = validateSiteClassificationAction(config, target, options.requestedClassification === 'study' ? 'study' : 'composite');
  if (!actionValidation.ok) {
    return {
      ok: false,
      code: actionValidation.code || 'ALREADY_CLASSIFIED',
      error: actionValidation.error || 'target already classified',
      classifiedAs: actionValidation.classifiedAs || null,
      source: actionValidation.source || null,
      pattern: actionValidation.pattern || null,
      protectedBy: actionValidation.protectedBy || null,
    };
  }

  const key = requestKey(target.targetType, target.normalizedValue);
  const existing = records.find((record) =>
    record.status !== 'returned' &&
    requestKey(record.requestedTargetType, record.requestedNormalizedValue) === key
  );
  if (existing?.status === 'rejected') {
    return { ok: false, code: 'REQUEST_REJECTED', error: 'request rejected', request: existing };
  }

  const observedAt = Number(context.observedAt);
  const now = Number.isFinite(observedAt) && observedAt > 0 ? observedAt : Date.now();
  const hasCloudToken = !!cloud.cloud_device_token;
  const requestedClassification = options.requestedClassification === 'study' ? 'study' : null;

  if (existing) {
    if (requestedClassification === 'study') {
      if (existing.requestedClassification === 'study') {
        return { ok: true, alreadyPresent: true, request: existing, localOnly: !hasCloudToken };
      }
      const promoted = {
        ...existing,
        recordSource: 'manual_learning_request',
        requestedClassification: 'study',
        manualRequestedAt: now,
        updatedAt: now,
        syncStatus: pendingSyncStatus(hasCloudToken),
        lastSyncError: null,
      };
      await setSiteClassificationRequestRecords(records.map((record) => record.id === existing.id ? promoted : record));
      return { ok: true, promoted: true, request: promoted, localOnly: !hasCloudToken };
    }

    const observed = applyUnclassifiedObservation(existing, context, now, hasCloudToken);
    await setSiteClassificationRequestRecords(records.map((record) => record.id === existing.id ? observed : record));
    return { ok: true, alreadyPresent: true, observed: true, request: observed, localOnly: !hasCloudToken };
  }

  const record = {
    id: makeLocalId(),
    requestedTargetType: target.targetType,
    requestedRawInput: target.rawInput,
    requestedNormalizedValue: target.normalizedValue,
    requestedHost: target.host || null,
    displayValue: target.displayValue,
    status: 'pending',
    recordSource: requestedClassification === 'study' ? 'manual_learning_request' : 'auto_unclassified_access',
    requestedClassification,
    manualRequestedAt: requestedClassification === 'study' ? now : null,
    firstObservedAt: null,
    lastObservedAt: null,
    observationCount: 0,
    requestedAt: now,
    createdAt: now,
    updatedAt: now,
    sourceTabId: Number.isInteger(context.sourceTabId) ? context.sourceTabId : null,
    sourceUrl: context.url || null,
    sourceDomain: context.domain || null,
    profileId: cloud.cloud_profile_id || null,
    deviceId: cloud.cloud_device_id || null,
    syncStatus: pendingSyncStatus(hasCloudToken),
    lastSyncError: null,
  };
  const nextRecord = requestedClassification === 'study'
    ? record
    : applyUnclassifiedObservation(record, context, now, hasCloudToken);
  await setSiteClassificationRequestRecords([...records, nextRecord]);
  return { ok: true, added: true, request: nextRecord, localOnly: !hasCloudToken };
}

export async function recordUnclassifiedSiteAccess(input, context = {}) {
  return upsertPendingSiteClassificationRecord(input, context, {
    recordSource: 'auto_unclassified_access',
    requestedClassification: null,
  });
}

export async function submitSiteClassificationRequest(input, context = {}) {
  return upsertPendingSiteClassificationRecord(input, context, {
    recordSource: 'manual_learning_request',
    requestedClassification: 'study',
  });
}

export async function getPendingSiteClassificationRequestUploads() {
  const cloud = await chrome.storage.local.get(['cloud_device_token']).catch(() => ({}));
  const hasCloudToken = !!cloud.cloud_device_token;
  const records = await getSiteClassificationRequestRecords({ includeAll: true });
  const pending = records.filter((record) =>
    record.status === 'pending' &&
    (
      record.syncStatus === 'pending' ||
      record.syncStatus === 'failed' ||
      record.syncStatus == null ||
      (hasCloudToken && record.syncStatus === 'local_only')
    )
  );
  return {
    pendingCount: pending.length,
    requests: pending,
    retryCounts: Object.fromEntries(pending.map((record) => [record.id, Number(record.retryCount || 0)])),
    lastErrors: Object.fromEntries(pending.filter((record) => record.lastSyncError).map((record) => [record.id, record.lastSyncError])),
  };
}

export async function buildSiteClassificationRequestsUploadPayload(ids = []) {
  const idSet = new Set(ids);
  const records = await getSiteClassificationRequestRecords({ includeAll: true });
  const selected = records.filter((record) => idSet.size === 0 || idSet.has(record.id));
  return {
    schemaVersion: 2,
    requests: selected.map((record) => ({
      id: record.id,
      requestedTargetType: record.requestedTargetType,
      requestedRawInput: record.requestedRawInput,
      requestedNormalizedValue: record.requestedNormalizedValue,
      requestedHost: record.requestedHost || null,
      displayValue: record.displayValue || record.requestedNormalizedValue,
      requestedAt: record.requestedAt || record.createdAt || Date.now(),
      sourceUrl: record.sourceUrl || null,
      sourceDomain: record.sourceDomain || null,
      recordSource: record.recordSource || 'legacy',
      requestedClassification: record.requestedClassification || null,
      manualRequestedAt: record.manualRequestedAt || null,
      observationSourceId: record.observationSourceId || null,
      sourceObservationCount: Number(record.sourceObservationCount || 0),
      sourceFirstObservedAt: record.sourceFirstObservedAt || null,
      sourceLastObservedAt: record.sourceLastObservedAt || null,
    })),
  };
}

export async function markSiteClassificationRequestsUploaded(ids = [], cloudRequests = []) {
  const idSet = new Set(ids);
  const cloudById = new Map((Array.isArray(cloudRequests) ? cloudRequests : []).map((record) => [record.clientRequestId || record.id, record]));
  const records = await getSiteClassificationRequestRecords({ includeAll: true });
  const next = records.map((record) => {
    if (!idSet.has(record.id)) return record;
    const cloud = cloudById.get(record.id) || {};
    return {
      ...record,
      cloudId: cloud.id || record.cloudId || null,
      profileId: cloud.profileId || record.profileId || null,
      deviceId: cloud.deviceId || record.deviceId || null,
      recordSource: cloud.recordSource || record.recordSource || 'legacy',
      requestedClassification: cloud.requestedClassification || record.requestedClassification || null,
      manualRequestedAt: cloud.manualRequestedAt || record.manualRequestedAt || null,
      firstObservedAt: cloud.firstObservedAt || record.firstObservedAt || null,
      lastObservedAt: cloud.lastObservedAt || record.lastObservedAt || null,
      observationCount: Math.max(Number(cloud.observationCount || 0), Number(record.observationCount || 0)),
      syncStatus: 'uploaded',
      uploadedAt: Date.now(),
      lastSyncError: null,
      retryCount: 0,
    };
  });
  await setSiteClassificationRequestRecords(next);
}

export async function markSiteClassificationRequestUploadFailed(ids = [], error = 'upload_failed') {
  const idSet = new Set(ids);
  const records = await getSiteClassificationRequestRecords({ includeAll: true });
  const next = records.map((record) => idSet.has(record.id)
    ? { ...record, syncStatus: 'failed', lastSyncError: String(error || 'upload_failed'), retryCount: Number(record.retryCount || 0) + 1 }
    : record
  );
  await setSiteClassificationRequestRecords(next);
}

export async function mergeCloudSiteClassificationRequests(cloudRecords = []) {
  const local = await getSiteClassificationRequestRecords({ includeAll: true });
  const byKey = new Map();
  const recordIdentity = (record = {}) => {
    if (record.cloudId) return `cloud:${record.cloudId}`;
    if (record.id) return `local:${record.id}`;
    return `target:${requestKey(record.requestedTargetType, record.requestedNormalizedValue)}`;
  };
  for (const record of local) {
    byKey.set(recordIdentity(record), record);
  }
  for (const raw of Array.isArray(cloudRecords) ? cloudRecords : []) {
    const normalized = normalizeSiteClassificationRequest({
      id: raw.clientRequestId || raw.id,
      cloudId: raw.id,
      requestedTargetType: raw.requestedTargetType,
      requestedRawInput: raw.requestedRawInput,
      requestedNormalizedValue: raw.requestedNormalizedValue,
      displayValue: raw.displayValue,
      status: raw.status,
      requestedAt: raw.requestedAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      decidedAt: raw.decidedAt,
      decision: raw.decision,
      decisionTargetType: raw.decisionTargetType,
      decisionNormalizedValue: raw.decisionNormalizedValue,
      profileId: raw.profileId,
      deviceId: raw.deviceId,
      recordSource: raw.recordSource,
      requestedClassification: raw.requestedClassification,
      manualRequestedAt: raw.manualRequestedAt,
      firstObservedAt: raw.firstObservedAt,
      lastObservedAt: raw.lastObservedAt,
      observationCount: raw.observationCount,
      syncStatus: 'uploaded',
    });
    if (!normalized) continue;
    const key = byKey.has(recordIdentity(normalized))
      ? recordIdentity(normalized)
      : normalized.id && byKey.has(`local:${normalized.id}`)
      ? `local:${normalized.id}`
      : recordIdentity(normalized);
    const existing = byKey.get(key) || {};
    byKey.set(key, {
      ...existing,
      ...normalized,
      id: existing.id || normalized.id,
      cloudId: normalized.cloudId || existing.cloudId || null,
      recordSource: normalized.recordSource === 'legacy'
        ? existing.recordSource || 'legacy'
        : normalized.recordSource,
      requestedClassification: normalized.requestedClassification || existing.requestedClassification || null,
      manualRequestedAt: normalized.manualRequestedAt || existing.manualRequestedAt || null,
      firstObservedAt: normalized.firstObservedAt || existing.firstObservedAt || null,
      lastObservedAt: Math.max(Number(normalized.lastObservedAt || 0), Number(existing.lastObservedAt || 0)) || null,
      observationCount: Math.max(Number(normalized.observationCount || 0), Number(existing.observationCount || 0)),
      observationSourceId: existing.observationSourceId || null,
      sourceFirstObservedAt: existing.sourceFirstObservedAt || null,
      sourceLastObservedAt: existing.sourceLastObservedAt || null,
      sourceObservationCount: Number(existing.sourceObservationCount || 0),
      lastCountedNavigationKey: existing.lastCountedNavigationKey || null,
      syncStatus: 'uploaded',
      lastSyncError: null,
    });
  }
  return await setSiteClassificationRequestRecords([...byKey.values()]);
}

export async function hasPendingSiteClassificationPermission(urlOrDomain) {
  const [records, config] = await Promise.all([
    getSiteClassificationRequestRecords({ includeAll: true }),
    getConfig(),
  ]);
  const classification = getSiteClassificationForUrl(config, records, urlOrDomain);
  return classification.classification === 'pending_composite';
}

export async function getSiteClassificationDecision(urlOrDomain) {
  const [records, config] = await Promise.all([
    getSiteClassificationRequestRecords({ includeAll: true }),
    getConfig(),
  ]);
  return getSiteClassificationForUrl(config, records, urlOrDomain);
}

export function requestDecisionTargetMatches(record, urlOrDomain) {
  return siteDecisionMatchesUrl(requestDecisionTarget(record), urlOrDomain);
}

// ── Managed statistics compatibility API ───────────────────────────────────────

export async function getPopupSettledModeStats(date = getDateKey()) {
  const view = await getPopupModeStatsView(date);
  return view.summary;
}

export async function getTodayStats() {
  const view = await getTodayUsageView({ date: getDateKey() });
  return view.stats;
}

export async function getTodayUndeterminedStats() {
  const config = await getConfig();
  const view = await getQuotaUsageView(getDateKey(), { config });
  const result = {};
  for (const [domain, classification] of Object.entries(view.domainClassifications || {})) {
    if (classification === 'composite' || classification === 'pending_composite') {
      result[domain] = view.domainSeconds?.[domain] || 0;
    }
  }
  return result;
}

export async function getStatsRange(days = 7) {
  const view = await getUsageRangeView(days);
  return view.statsByDate;
}

// ── Legacy domain time tracking (deprecated, kept for backward compat) ──────────

export async function addDomainTime(domain, seconds) {
  const today = getDateKey();
  const key = STATS_KEY_PREFIX + today;
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      const stats = result[key] || {};
      stats[domain] = (stats[domain] || 0) + seconds;
      chrome.storage.local.set({ [key]: stats }, resolve);
    });
  });
}

export async function addUndeterminedTime(domain, seconds) {
  const today = getDateKey();
  const key = UNDETERMINED_STATS_KEY_PREFIX + today;
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      const stats = result[key] || {};
      stats[domain] = (stats[domain] || 0) + seconds;
      chrome.storage.local.set({ [key]: stats }, resolve);
    });
  });
}

// ── Visit sessions ──────────────────────────────────────────────────────────────

export async function getVisitSessions(days = MAX_SESSION_DAYS) {
  return new Promise((resolve) => {
    chrome.storage.local.get(VISIT_SESSIONS_KEY, (result) => {
      const sessions = result[VISIT_SESSIONS_KEY] || [];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      resolve(sessions.filter(s => new Date(s.date) >= cutoff));
    });
  });
}

export async function addVisitSession(session) {
  return new Promise((resolve) => {
    chrome.storage.local.get(VISIT_SESSIONS_KEY, (result) => {
      const sessions = result[VISIT_SESSIONS_KEY] || [];
      sessions.push(session);
      chrome.storage.local.set({ [VISIT_SESSIONS_KEY]: sessions }, resolve);
    });
  });
}

// ── Changelog ───────────────────────────────────────────────────────────────────

export async function getChangelog(limit = 20) {
  return new Promise((resolve) => {
    chrome.storage.local.get(CHANGELOG_KEY, (result) => {
      const entries = result[CHANGELOG_KEY] || [];
      resolve(entries.slice(0, limit));
    });
  });
}

// ── Cleanup ─────────────────────────────────────────────────────────────────────

export async function cleanOldStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (result) => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const keysToDelete = Object.keys(result).filter(key => {
        if (!key.startsWith(STATS_KEY_PREFIX) && !key.startsWith(UNDETERMINED_STATS_KEY_PREFIX)) return false;
        const dateStr = key.replace(STATS_KEY_PREFIX, '').replace(UNDETERMINED_STATS_KEY_PREFIX, '');
        return new Date(dateStr) < cutoff;
      });
      if (keysToDelete.length > 0) {
        chrome.storage.local.remove(keysToDelete, resolve);
      } else {
        resolve();
      }
    });
  });
}

export async function cleanOldSessions() {
  return new Promise((resolve) => {
    chrome.storage.local.get(SESSIONS_KEY, (result) => {
      const sessions = result[SESSIONS_KEY] || {};
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const filtered = {};
      for (const [date, data] of Object.entries(sessions)) {
        if (new Date(date) >= cutoff) {
          filtered[date] = data;
        }
      }
      chrome.storage.local.set({ [SESSIONS_KEY]: filtered }, resolve);
    });
  });
}

export const LAST_RESET_DATE_KEY = 'last_reset_date';

export async function resetDailyLockedDomains(force = false) {
  const today = getDateKey();

  if (!force) {
    const storage = await new Promise(resolve =>
      chrome.storage.local.get([LAST_RESET_DATE_KEY], resolve)
    );
    if (storage[LAST_RESET_DATE_KEY] === today) return;
  }

  await new Promise(resolve =>
    chrome.storage.local.set({ [LAST_RESET_DATE_KEY]: today }, resolve)
  );

  const config = await getConfig();
  let changed = false;
  if (config.lockedDomains && config.lockedDomains.length > 0) {
    config.lockedDomains = [];
    changed = true;
  }
  const qs = config.quotaState || {};
  if (qs.onlineLocked || qs.studyLocked || qs.restLocked || qs.undeterminedLocked) {
    config.quotaState = { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false };
    changed = true;
  }

  const borrow = config.quotaBorrow;
  if (borrow && !borrow.repaid) {
    const repayD = new Date(borrow.borrowedFrom + 'T00:00:00');
    repayD.setDate(repayD.getDate() + 1);
    if (today > formatDate(repayD)) {
      config.quotaBorrow = { ...borrow, repaid: true };
      changed = true;
    }
  }

  if (changed) await saveConfig(config);
  console.log('[daily] Quota state reset for new day:', today);
}

export { MIN_SESSION_DURATION, UNDETERMINED_STATS_KEY_PREFIX, SESSIONS_KEY, CHANGELOG_KEY, MAX_CHANGELOG_ENTRIES };

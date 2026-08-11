// infra/client-logs.js — local client logging foundation
import { INCOGNITO_PLACEHOLDER_DOMAIN, sanitizeIncognitoForPersistence } from '../core/incognito-persistence.js';
import { budgetedLocalSet } from './storage-budget.js';

const INCOGNITO_DOMAIN = typeof INCOGNITO_PLACEHOLDER_DOMAIN === 'string'
  ? INCOGNITO_PLACEHOLDER_DOMAIN
  : 'anonymous.private';
const sanitizePersistence = typeof sanitizeIncognitoForPersistence === 'function'
  ? sanitizeIncognitoForPersistence
  : (value) => value;
const clientStorageSet = (items, options = {}) => typeof budgetedLocalSet === 'function'
  ? budgetedLocalSet(items, { priority: 'diagnostic', source: 'client_logs', ...options })
  : chrome.storage.local.set(items);

export const CLIENT_LOGS_KEY = 'client_logs_v1';
export const CLIENT_SESSION_LOGS_KEY = 'client_logs_session_v1';
export const CLIENT_LOG_CONFIG_KEY = 'client_log_config_v1';

const CONFIG_KEY = 'guardian_config';
const CLOUD_PROFILE_ID_KEY = 'cloud_profile_id';
const CLOUD_DEVICE_ID_KEY = 'cloud_device_id';
const CLOUD_DEVICE_TOKEN_KEY = 'cloud_device_token';

const LEVEL_WEIGHT = { info: 10, warning: 20, error: 30 };
const VALID_LEVELS = new Set(Object.keys(LEVEL_WEIGHT));
const VALID_CATEGORIES = new Set([
  'runtime', 'timing', 'foreground', 'media', 'cloud', 'storage',
  'access', 'popup', 'admin', 'content', 'release',
  'checkpoint', 'ledger_gap', 'mode_transition',
]);

const DEFAULT_POLICY = {
  localEnabled: true,
  localMinLevel: 'warning',
  uploadEnabled: false,
  uploadMinLevel: 'error',
  categories: [],
  uploadCategories: [],
  targetDeviceIds: [],
  sampleRate: 1,
  retentionDays: 3,
  maxEntries: 1000,
  maxBytes: 512 * 1024,
  expiresAt: null,
};

const MAX_DETAILS_DEPTH = 3;
const MAX_DETAILS_KEYS = 50;
const MAX_ARRAY_LENGTH = 20;
const MAX_STRING_LENGTH = 300;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_PER_WINDOW = 20;
const rateBuckets = new Map();
let selfLogGuard = false;

function nowMs() {
  return Date.now();
}

function runtimeManifestVersion() {
  try {
    return chrome?.runtime?.getManifest?.()?.version || null;
  } catch (_) {
    return null;
  }
}

async function storageGet(keys) {
  try {
    return await chrome.storage.local.get(keys);
  } catch (_) {
    return {};
  }
}

async function storageSet(value) {
  try {
    const result = await clientStorageSet(value);
    return result?.ok !== false;
  } catch (_) {
    return false;
  }
}

function sessionStorageArea() {
  return chrome.storage.session || chrome.storage.local;
}

async function sessionStorageGet(keys) {
  try {
    return await sessionStorageArea().get(keys);
  } catch (_) {
    return {};
  }
}

async function sessionStorageSet(value) {
  try {
    if (chrome.storage.session?.set) {
      await chrome.storage.session.set(value);
      return true;
    }
    return await storageSet(value);
  } catch (_) {
    return false;
  }
}

function normalizeLevel(level) {
  return VALID_LEVELS.has(level) ? level : 'warning';
}

function normalizeCategory(category) {
  return VALID_CATEGORIES.has(category) ? category : 'runtime';
}

function normalizeDomain(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/\.+$/g, '') || null;
  } catch (_) {
    const host = raw
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .replace(/^www\./i, '')
      .toLowerCase()
      .replace(/\.+$/g, '');
    if (!/^[a-z0-9.-]+$/.test(host) || !host.includes('.')) return null;
    return host;
  }
}

function maskEmail(value) {
  return String(value).replace(
    /([a-zA-Z0-9._%+-])([a-zA-Z0-9._%+-]*)(@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    (_m, first, _rest, domain) => `${first}***${domain.toLowerCase()}`
  );
}

function redactString(value, key = '') {
  let text = String(value || '');
  if (text.length > MAX_STRING_LENGTH) text = `${text.slice(0, MAX_STRING_LENGTH)}…`;
  if (/^https?:\/\//i.test(text)) {
    const domain = normalizeDomain(text);
    return domain ? `domain:${domain}` : '[redacted-url]';
  }
  if (/@/.test(text)) text = maskEmail(text);
  text = text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]');
  text = text.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]');
  if (/path|profile|file|directory/i.test(key) && /[\\/]/.test(text)) return '[redacted-path]';
  return text;
}

function isSensitiveKey(key) {
  return /token|password|passwd|pwd|cookie|jwt|authorization|credential|secret|api[_-]?key|device[_-]?token|account[_-]?token/i.test(key);
}

function isIdentityKey(key) {
  return /email|child.?name|profile.?name|kid.?name|name$/i.test(key);
}

function sanitizeDetails(value, depth = 0, key = '') {
  if (value == null) return value;
  if (isSensitiveKey(key)) return '[redacted]';
  if (isIdentityKey(key)) return '[redacted]';
  if (/^url$|href|uri/i.test(key)) {
    const domain = normalizeDomain(String(value || ''));
    return domain ? { domain } : '[redacted-url]';
  }
  if (typeof value === 'string') return redactString(value, key);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) {
    return {
      name: redactString(value.name || 'Error'),
      message: redactString(value.message || ''),
    };
  }
  if (depth >= MAX_DETAILS_DEPTH) return '[truncated]';
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeDetails(item, depth + 1, key));
  }
  if (typeof value === 'object') {
    const out = {};
    let count = 0;
    for (const [childKey, childValue] of Object.entries(value)) {
      if (count >= MAX_DETAILS_KEYS) {
        out.__truncated__ = true;
        break;
      }
      out[childKey] = sanitizeDetails(childValue, depth + 1, childKey);
      count++;
    }
    return out;
  }
  return redactString(String(value), key);
}

function normalizePolicy(policy = {}) {
  const merged = { ...DEFAULT_POLICY, ...(policy || {}) };
  const localMinLevel = normalizeLevel(merged.localMinLevel);
  const uploadMinLevel = normalizeLevel(merged.uploadMinLevel);
  const retentionDays = Math.max(1, Math.min(3, Number(merged.retentionDays || DEFAULT_POLICY.retentionDays)));
  const maxEntries = Math.max(1, Math.min(1000, Number(merged.maxEntries || DEFAULT_POLICY.maxEntries)));
  const maxBytes = Math.max(64 * 1024, Math.min(512 * 1024, Number(merged.maxBytes || DEFAULT_POLICY.maxBytes)));
  const expiresAt = Number(merged.expiresAt || 0) > 0 ? Number(merged.expiresAt) : null;
  const categories = Array.isArray(merged.categories) ? merged.categories.filter((c) => VALID_CATEGORIES.has(c)) : [];
  const uploadCategories = Array.isArray(merged.uploadCategories) ? merged.uploadCategories.filter((c) => VALID_CATEGORIES.has(c)) : [];
  const targetDeviceIds = Array.isArray(merged.targetDeviceIds)
    ? merged.targetDeviceIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const sampleRate = Math.max(0, Math.min(1, Number(merged.sampleRate ?? 1)));
  return {
    localEnabled: merged.localEnabled !== false,
    localMinLevel,
    uploadEnabled: merged.uploadEnabled === true,
    uploadMinLevel,
    categories,
    uploadCategories,
    targetDeviceIds,
    sampleRate,
    retentionDays,
    maxEntries,
    maxBytes,
    expiresAt,
  };
}

function isExpired(policy, now = nowMs()) {
  return Number(policy?.expiresAt || 0) > 0 && Number(policy.expiresAt) <= now;
}

async function getIdentityAndPolicies() {
  const storage = await storageGet([
    CLOUD_PROFILE_ID_KEY,
    CLOUD_DEVICE_ID_KEY,
    CLOUD_DEVICE_TOKEN_KEY,
    CLIENT_LOG_CONFIG_KEY,
    CONFIG_KEY,
  ]);
  const profileId = storage[CLOUD_PROFILE_ID_KEY] || null;
  const deviceId = storage[CLOUD_DEVICE_ID_KEY] || null;
  const token = storage[CLOUD_DEVICE_TOKEN_KEY] || null;
  const bindingState = profileId && deviceId && token
    ? 'bound'
    : (profileId || deviceId || token ? 'partial' : 'unbound');
  const remoteRaw = storage[CONFIG_KEY]?.clientLoggingPolicyV1 || null;
  const remotePolicy = remoteRaw && !isExpired(remoteRaw) ? remoteRaw : {};
  const localPolicy = storage[CLIENT_LOG_CONFIG_KEY] || {};
  const policy = normalizePolicy({ ...localPolicy, ...remotePolicy });
  return { profileId, deviceId, bindingState, policy };
}

function levelEnabled(level, minLevel) {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[minLevel];
}

function categoryEnabled(category, categories = []) {
  return !Array.isArray(categories) || categories.length === 0 || categories.includes(category);
}

function targetDeviceEnabled(deviceId, targetDeviceIds = []) {
  return !Array.isArray(targetDeviceIds) || targetDeviceIds.length === 0 || (deviceId && targetDeviceIds.includes(deviceId));
}

function shouldRecordLocal({ level, category, policy }) {
  if (!policy.localEnabled) return false;
  if (!levelEnabled(level, policy.localMinLevel)) return false;
  if (!categoryEnabled(category, policy.categories)) return false;
  if (level === 'info' && policy.localMinLevel === 'info' && !policy.expiresAt) return false;
  return true;
}

export function shouldUploadClientLog(log, policy = DEFAULT_POLICY, now = nowMs()) {
  const effective = normalizePolicy(policy);
  if (!effective.uploadEnabled) return false;
  if (isExpired(effective, now)) return false;
  if (!levelEnabled(log.level, effective.uploadMinLevel)) return false;
  if (!categoryEnabled(log.category, effective.uploadCategories)) return false;
  if (!targetDeviceEnabled(log.deviceId, effective.targetDeviceIds)) return false;
  if (log.level === 'info' && !effective.expiresAt) return false;
  if (effective.sampleRate <= 0) return false;
  if (effective.sampleRate < 1) {
    const seed = String(log.id || log.eventCode || '');
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    const bucket = Math.abs(hash % 10000) / 10000;
    if (bucket > effective.sampleRate) return false;
  }
  return true;
}

function rateLimited(level, category, eventCode) {
  const key = `${level}:${category}:${eventCode || 'unknown'}`;
  const now = nowMs();
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startAt > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { startAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX_PER_WINDOW;
}

function approxBytes(value) {
  try {
    return JSON.stringify(value).length;
  } catch (_) {
    return 0;
  }
}

function logRetentionRank(log, now = nowMs()) {
  const timestamp = Number(log?.timestamp || 0);
  const recent = timestamp >= now - 86400000 ? 1 : 0;
  return (LEVEL_WEIGHT[normalizeLevel(log?.level)] || 0) * 10 + recent;
}

function pruneLogs(logs, policy, now = nowMs()) {
  const cutoff = now - Math.min(3, Number(policy.retentionDays || 3)) * 86400000;
  let next = (Array.isArray(logs) ? logs : [])
    .filter((log) => Number(log.timestamp || 0) >= cutoff)
    .filter((log) => log.uploadStatus !== 'uploaded')
    .sort((a, b) => {
      const rankDiff = logRetentionRank(b, now) - logRetentionRank(a, now);
      return rankDiff || Number(b.timestamp || 0) - Number(a.timestamp || 0);
    })
    .slice(0, policy.maxEntries);
  while (next.length > 0 && approxBytes(next) > policy.maxBytes) {
    next.pop();
  }
  return next.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
}

function persistentLogs(logs, policy, now = nowMs()) {
  return pruneLogs(logs, policy, now).filter((log) => normalizeLevel(log?.level) !== 'info');
}

function sessionLogs(logs, policy, now = nowMs()) {
  return pruneLogs(logs, {
    ...policy,
    retentionDays: 1,
    maxEntries: Math.min(500, Number(policy?.maxEntries || 500)),
    maxBytes: Math.min(256 * 1024, Number(policy?.maxBytes || 256 * 1024)),
  }, now).filter((log) => normalizeLevel(log?.level) === 'info');
}

async function readClientLogStores() {
  const [local, session] = await Promise.all([
    storageGet(CLIENT_LOGS_KEY),
    sessionStorageGet(CLIENT_SESSION_LOGS_KEY),
  ]);
  return {
    local: Array.isArray(local[CLIENT_LOGS_KEY]) ? local[CLIENT_LOGS_KEY] : [],
    session: Array.isArray(session[CLIENT_SESSION_LOGS_KEY]) ? session[CLIENT_SESSION_LOGS_KEY] : [],
  };
}

export async function pruneClientLogsForStoragePressure({ pressure = false, emergency = false, now = nowMs(), storageOptions = {} } = {}) {
  const storage = await storageGet(CLIENT_LOGS_KEY);
  const current = Array.isArray(storage[CLIENT_LOGS_KEY]) ? storage[CLIENT_LOGS_KEY] : [];
  const maxBytes = emergency ? 0 : (pressure ? 128 * 1024 : DEFAULT_POLICY.maxBytes);
  const maxEntries = emergency ? 0 : (pressure ? 500 : DEFAULT_POLICY.maxEntries);
  const next = emergency ? [] : persistentLogs(current, {
    ...DEFAULT_POLICY,
    retentionDays: 3,
    maxEntries,
    maxBytes,
  }, now);
  if (next.length !== current.length || approxBytes(next) !== approxBytes(current)) {
    await clientStorageSet({ [CLIENT_LOGS_KEY]: next }, storageOptions);
  }
  return { removed: Math.max(0, current.length - next.length), remaining: next.length, bytes: approxBytes(next) };
}

function makeLogId(timestamp) {
  const random = Math.random().toString(36).slice(2, 10);
  return `cl_${timestamp}_${random}`;
}

async function appendClientLog(log, policy) {
  if (normalizeLevel(log?.level) === 'info') {
    const storage = await sessionStorageGet(CLIENT_SESSION_LOGS_KEY);
    const current = Array.isArray(storage[CLIENT_SESSION_LOGS_KEY]) ? storage[CLIENT_SESSION_LOGS_KEY] : [];
    return await sessionStorageSet({ [CLIENT_SESSION_LOGS_KEY]: sessionLogs([log, ...current], policy) });
  }
  const storage = await storageGet(CLIENT_LOGS_KEY);
  const current = Array.isArray(storage[CLIENT_LOGS_KEY]) ? storage[CLIENT_LOGS_KEY] : [];
  return await storageSet({ [CLIENT_LOGS_KEY]: persistentLogs([log, ...current], policy) });
}

export async function logClientEvent(event = {}) {
  try {
    const level = normalizeLevel(event.level);
    const category = normalizeCategory(event.category);
    const eventCode = redactString(event.eventCode || 'client_event').replace(/[^a-z0-9_.:-]/gi, '_').slice(0, 96);
    if (rateLimited(level, category, eventCode)) return { ok: true, skipped: 'rate_limited' };

    const { profileId, deviceId, bindingState, policy } = await getIdentityAndPolicies();
    if (!shouldRecordLocal({ level, category, policy })) return { ok: true, skipped: 'policy' };

    const timestamp = nowMs();
    const incognito = event.incognito === true || event.details?.incognito === true;
    const sanitizedDetails = sanitizePersistence(sanitizeDetails(event.details || null), { incognito });
    const log = {
      id: makeLogId(timestamp),
      timestamp,
      level,
      category,
      eventCode,
      message: redactString(event.message || eventCode),
      profileId,
      deviceId,
      bindingState,
      extensionVersion: runtimeManifestVersion(),
      domain: incognito ? INCOGNITO_DOMAIN : (normalizeDomain(event.domain || '') || null),
      module: redactString(event.module || category).slice(0, 80),
      details: sanitizedDetails,
      uploadStatus: 'local_only',
      uploadAttempts: 0,
      lastUploadError: null,
      uploadedAt: null,
    };
    if (shouldUploadClientLog(log, policy)) {
      log.uploadStatus = 'pending';
    }
    const ok = await appendClientLog(log, policy);
    return { ok, logId: log.id };
  } catch (_) {
    return { ok: false };
  }
}

export async function logClientEventBestEffort(event = {}) {
  if (selfLogGuard) return;
  selfLogGuard = true;
  try {
    await logClientEvent(event);
  } catch (_) {
    // Logging must never affect the caller.
  } finally {
    selfLogGuard = false;
  }
}

export async function logFallbackEventBestEffort(event = {}) {
  const level = event.level === 'error' ? 'error' : 'warning';
  const reason = event.reason || event.details?.reason || event.eventCode || 'fallback';
  await logClientEventBestEffort({
    ...event,
    level,
    eventCode: event.eventCode || 'runtime_fallback',
    message: event.message || `Runtime fallback: ${reason}`,
    details: {
      ...(event.details || {}),
      fallback: true,
      reason,
    },
  });
}

function filterLogs(logs, filter = {}) {
  const level = filter.level && filter.level !== 'all' ? normalizeLevel(filter.level) : null;
  const category = filter.category && filter.category !== 'all' ? normalizeCategory(filter.category) : null;
  const auditId = filter.auditId ? String(filter.auditId).trim() : null;
  const profileId = filter.profileId ? String(filter.profileId) : null;
  const deviceId = filter.deviceId ? String(filter.deviceId) : null;
  const from = Number(filter.from || 0);
  const to = Number(filter.to || 0);
  const limit = Math.max(1, Math.min(1000, Number(filter.limit || 200)));
  return (Array.isArray(logs) ? logs : [])
    .filter((log) => !level || log.level === level)
    .filter((log) => !category || log.category === category)
    .filter((log) => !auditId || String(log.details?.auditId || '').includes(auditId))
    .filter((log) => !profileId || log.profileId === profileId)
    .filter((log) => !deviceId || log.deviceId === deviceId)
    .filter((log) => !from || Number(log.timestamp || 0) >= from)
    .filter((log) => !to || Number(log.timestamp || 0) <= to)
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
    .slice(0, limit);
}

export async function getClientLogs(filter = {}) {
  const [{ policy }, stores] = await Promise.all([
    getIdentityAndPolicies(),
    readClientLogStores(),
  ]);
  const local = persistentLogs(stores.local, policy);
  const session = sessionLogs(stores.session, policy);
  await Promise.all([
    local.length !== stores.local.length ? storageSet({ [CLIENT_LOGS_KEY]: local }) : Promise.resolve(true),
    session.length !== stores.session.length
      ? sessionStorageSet({ [CLIENT_SESSION_LOGS_KEY]: session })
      : Promise.resolve(true),
  ]);
  const combined = [...local, ...session];
  return { ok: true, logs: filterLogs(combined, filter), total: combined.length };
}

export async function clearClientLogs(filter = null) {
  if (!filter || Object.keys(filter || {}).length === 0) {
    await Promise.all([
      storageSet({ [CLIENT_LOGS_KEY]: [] }),
      sessionStorageSet({ [CLIENT_SESSION_LOGS_KEY]: [] }),
    ]);
    return { ok: true, cleared: 'all' };
  }
  const stores = await readClientLogStores();
  const current = [...stores.local, ...stores.session];
  const removeIds = new Set(filterLogs(current, { ...filter, limit: current.length }).map((log) => log.id));
  const nextLocal = stores.local.filter((log) => !removeIds.has(log.id));
  const nextSession = stores.session.filter((log) => !removeIds.has(log.id));
  await Promise.all([
    storageSet({ [CLIENT_LOGS_KEY]: nextLocal }),
    sessionStorageSet({ [CLIENT_SESSION_LOGS_KEY]: nextSession }),
  ]);
  return { ok: true, cleared: current.length - nextLocal.length - nextSession.length };
}

export async function getClientLogConfig() {
  const { profileId, deviceId, bindingState, policy } = await getIdentityAndPolicies();
  return { ok: true, config: policy, identity: { profileId, deviceId, bindingState } };
}

export async function updateClientLogConfig(patch = {}) {
  const existing = await storageGet(CLIENT_LOG_CONFIG_KEY);
  const next = normalizePolicy({ ...(existing[CLIENT_LOG_CONFIG_KEY] || {}), ...(patch || {}) });
  await storageSet({ [CLIENT_LOG_CONFIG_KEY]: next });
  return { ok: true, config: next };
}

export async function getClientLogStatus() {
  const [{ profileId, deviceId, bindingState, policy }, stores] = await Promise.all([
    getIdentityAndPolicies(),
    readClientLogStores(),
  ]);
  const logs = [...persistentLogs(stores.local, policy), ...sessionLogs(stores.session, policy)];
  const countsByLevel = {};
  const countsByCategory = {};
  let oldestAt = null;
  let newestAt = null;
  let pendingUploadCount = 0;
  for (const log of logs) {
    countsByLevel[log.level] = (countsByLevel[log.level] || 0) + 1;
    countsByCategory[log.category] = (countsByCategory[log.category] || 0) + 1;
    if (!oldestAt || log.timestamp < oldestAt) oldestAt = log.timestamp;
    if (!newestAt || log.timestamp > newestAt) newestAt = log.timestamp;
    if (shouldUploadClientLog(log, policy) && log.uploadStatus !== 'uploaded') pendingUploadCount++;
  }
  return {
    ok: true,
    total: logs.length,
    pendingUploadCount,
    oldestAt,
    newestAt,
    countsByLevel,
    countsByCategory,
    config: policy,
    identity: { profileId, deviceId, bindingState },
  };
}

export async function getPendingClientLogsForUpload({ limit = 200 } = {}) {
  const [{ policy }, stores] = await Promise.all([
    getIdentityAndPolicies(),
    readClientLogStores(),
  ]);
  const logs = [...persistentLogs(stores.local, policy), ...sessionLogs(stores.session, policy)];
  const pending = logs
    .filter((log) => shouldUploadClientLog(log, policy))
    .filter((log) => log.uploadStatus !== 'uploaded')
    .filter((log) => Number(log.uploadAttempts || 0) < 5)
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
    .slice(0, Math.max(1, Math.min(500, Number(limit || 200))));
  return { logs: pending, pendingCount: pending.length, policy };
}

export async function markClientLogsUploaded(ids = []) {
  const idSet = new Set(ids);
  if (idSet.size === 0) return { ok: true, updated: 0 };
  const stores = await readClientLogStores();
  const nextLocal = stores.local.filter((log) => !idSet.has(log.id));
  const nextSession = stores.session.filter((log) => !idSet.has(log.id));
  await Promise.all([
    storageSet({ [CLIENT_LOGS_KEY]: nextLocal }),
    sessionStorageSet({ [CLIENT_SESSION_LOGS_KEY]: nextSession }),
  ]);
  return {
    ok: true,
    updated: stores.local.length + stores.session.length - nextLocal.length - nextSession.length,
  };
}

function normalizeClientLogUploadError(error) {
  const raw = String(error?.message || error || 'upload_failed').trim();
  const lower = raw.toLowerCase();
  const status = lower.match(/(?:http|status)[^0-9]*([0-9]{3})/);
  if (status) return 'http_' + status[1];
  if (/service unavailable/.test(lower)) return 'http_503';
  if (/abort/.test(lower)) return 'request_aborted';
  if (/time(?:d)?[ _-]*out|timeout/.test(lower)) return 'request_timeout';
  if (/failed to fetch|fetch failed|network/.test(lower)) return 'fetch_failed';
  return /^[a-z0-9_:-]{1,64}$/.test(lower) ? lower.replace(/[:-]+/g, '_') : 'upload_failed';
}

export async function markClientLogUploadFailed(ids = [], error = 'upload_failed') {
  const idSet = new Set(ids);
  if (idSet.size === 0) return { ok: true, updated: 0 };
  const stores = await readClientLogStores();
  const safeError = normalizeClientLogUploadError(error);
  let updated = 0;
  for (const logs of [stores.local, stores.session]) {
    for (const log of logs) {
      if (idSet.has(log.id)) {
        log.uploadStatus = 'failed';
        log.uploadAttempts = Number(log.uploadAttempts || 0) + 1;
        log.lastUploadError = safeError;
        updated++;
      }
    }
  }
  await Promise.all([
    storageSet({ [CLIENT_LOGS_KEY]: stores.local }),
    sessionStorageSet({ [CLIENT_SESSION_LOGS_KEY]: stores.session }),
  ]);
  return { ok: true, updated };
}

export function sanitizeClientLogForUpload(log) {
  const incognito = log?.incognito === true || log?.details?.incognito === true || log?.domain === INCOGNITO_DOMAIN;
  return sanitizePersistence({
    id: log.id,
    timestamp: Number(log.timestamp || 0),
    level: normalizeLevel(log.level),
    category: normalizeCategory(log.category),
    eventCode: String(log.eventCode || 'client_event').slice(0, 96),
    message: redactString(log.message || ''),
    bindingState: log.bindingState || 'unknown',
    extensionVersion: log.extensionVersion || null,
    domain: incognito ? INCOGNITO_DOMAIN : (normalizeDomain(log.domain || '') || null),
    module: redactString(log.module || '').slice(0, 80),
    details: sanitizeDetails(log.details || null),
    incognito,
  }, { incognito });
}

import { validateSharedAccessPolicyV1 } from '../core/shared-access-policy.js';
import { runStorageMutation } from './storage-budget.js';
import { readSharedAccessPolicyCloudScope, readCloudSharedAccessPolicy } from './cloud-sync.js';
import { hasSharedAccessPolicyCapability, observeSharedAccessPolicyCapability } from './native-host-client.js';

export const SHARED_ACCESS_POLICY_LKG_KEY = 'shared_access_policy_lkg_v1';
const IDENTITY_KEYS = ['cloud_device_id', 'cloud_profile_id', 'cloud_device_token'];
const FORBIDDEN_CACHE = new Set(['shared_access_unauthorized', 'shared_access_unbound', 'shared_access_unsupported', 'shared_access_identity_mismatch']);
const MAX_CACHE_BYTES = 32 * 1024;
const clone = value => value == null ? null : JSON.parse(JSON.stringify(value));
const fail = errorCode => ({ ok: false, errorCode, policy: null, executionEnabled: false });
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('');

async function readCurrentContext() {
  const scope = await readSharedAccessPolicyCloudScope();
  if (!scope.ok) return null;
  const data = await chrome.storage.local.get(IDENTITY_KEYS);
  return { apiBase: scope.apiBase, deviceId: data.cloud_device_id, childId: data.cloud_profile_id,
    deviceToken: data.cloud_device_token };
}

async function capturedContext(readContext) {
  const value = await readContext();
  if (!value || !['apiBase', 'deviceId', 'childId', 'deviceToken'].every(key =>
    typeof value[key] === 'string' && value[key].length > 0)) throw Error('shared_access_identity_unavailable');
  // One-way credential generation tag. Never persist or return the token itself.
  return { ...value, scopeHash: await hash(JSON.stringify(['shared-policy-v1', value.apiBase,
    value.deviceId, value.childId, value.deviceToken])) };
}

// Internal captured identity for read-only consumers. Never sent to UI or logs.
export async function readSharedAccessPolicyContext() { return capturedContext(readCurrentContext); }

async function validRecord(value, scopeHash) {
  if (!value || Object.keys(value).length !== 6 || value.schemaVersion !== 1 || value.scopeHash !== scopeHash
    || !Number.isSafeInteger(value.receivedAtMs) || value.receivedAtMs < 0
    || !/^[0-9a-f]{64}$/.test(value.policyHash) || new TextEncoder().encode(JSON.stringify(value)).length > MAX_CACHE_BYTES) return null;
  const checked = validateSharedAccessPolicyV1(value.policy);
  if (!checked.ok || checked.version !== value.version || await hash(checked.canonical) !== value.policyHash) return null;
  return { ...value, policy: checked.policy };
}

export function createSharedAccessPolicyReader({ enabled = false, readContext = readCurrentContext,
  request = readCloudSharedAccessPolicy, supported = hasSharedAccessPolicyCapability,
  readCache = async () => (await chrome.storage.local.get(SHARED_ACCESS_POLICY_LKG_KEY))[SHARED_ACCESS_POLICY_LKG_KEY],
  mutate = runStorageMutation, now = Date.now, requestTimeoutMs = 15000 } = {}) {
  let generation = 0;
  let controller = null;
  let current = null;
  let blockedScope = null;
  const available = () => enabled === true && supported() === true;
  function invalidate() { generation++; controller?.abort(); controller = null; current = null; }
  async function matches(epoch, scope) {
    if (!available() || epoch !== generation) return false;
    const context = await capturedContext(readContext);
    return available() && epoch === generation && context.scopeHash === scope;
  }
  const present = (record, status, errorCode = null) => ({ ok: true, status, errorCode,
    policy: clone(record.policy), version: record.version, executionEnabled: false });
  async function fallback(epoch, scope, errorCode) {
    if (!await matches(epoch, scope)) return fail('shared_access_identity_changed');
    if (blockedScope === scope) return fail('shared_access_authorization_unavailable');
    const cached = await validRecord(await readCache(), scope);
    if (!await matches(epoch, scope)) return fail('shared_access_identity_changed');
    current = cached;
    return cached ? present(cached, 'lkg', errorCode) : fail(errorCode);
  }
  async function read() {
    if (!available()) return fail(enabled ? 'shared_access_unsupported' : 'shared_access_disabled');
    const epoch = generation;
    try { const context = await capturedContext(readContext); return await fallback(epoch, context.scopeHash, 'shared_access_no_lkg'); }
    catch (_) { if (epoch === generation) current = null; return fail('shared_access_local_read_failed'); }
  }
  async function refresh() {
    if (!available()) return fail(enabled ? 'shared_access_unsupported' : 'shared_access_disabled');
    invalidate();
    const epoch = generation;
    const attemptController = new AbortController();
    controller = attemptController;
    const signal = attemptController.signal;
    let timer;
    try {
      const context = await capturedContext(readContext);
      if (!await matches(epoch, context.scopeHash)) return fail('shared_access_identity_changed');
      let response = await Promise.race([Promise.resolve().then(() => request({
        deviceToken: context.deviceToken, apiBase: context.apiBase, signal })), new Promise(resolve => {
        timer = setTimeout(() => { attemptController.abort(); resolve(fail('shared_access_unavailable')); },
          Math.min(15000, Math.max(1, requestTimeoutMs)));
      })]).catch(() => fail('shared_access_unavailable'));
      clearTimeout(timer);
      if (!await matches(epoch, context.scopeHash)) return fail('shared_access_identity_changed');
      if (response?.ok && response.profileId !== context.childId) response = fail('shared_access_identity_mismatch');
      if (!response?.ok) {
        const errorCode = FORBIDDEN_CACHE.has(response?.errorCode) ? response.errorCode
          : response?.errorCode === 'shared_access_invalid_policy' ? response.errorCode : 'shared_access_unavailable';
        if (FORBIDDEN_CACHE.has(errorCode)) {
          blockedScope = context.scopeHash;
          await mutate(async storage => {
            if (!await matches(epoch, context.scopeHash)) return;
            const record = (await storage.get(SHARED_ACCESS_POLICY_LKG_KEY))[SHARED_ACCESS_POLICY_LKG_KEY];
            if (record?.scopeHash === context.scopeHash && await matches(epoch, context.scopeHash)) {
              await storage.remove(SHARED_ACCESS_POLICY_LKG_KEY);
            }
          }, { priority: 'derived', source: 'shared_policy_authorization' });
          return fail(errorCode);
        }
        return await fallback(epoch, context.scopeHash, errorCode);
      }
      const checked = validateSharedAccessPolicyV1(response.policy);
      if (!checked.ok) return await fallback(epoch, context.scopeHash, checked.errorCode);
      const record = { schemaVersion: 1, scopeHash: context.scopeHash, version: checked.version,
        policyHash: await hash(checked.canonical), policy: checked.policy, receivedAtMs: now() };
      if (!Number.isSafeInteger(record.receivedAtMs) || record.receivedAtMs < 0
        || new TextEncoder().encode(JSON.stringify(record)).length > MAX_CACHE_BYTES) return fail('shared_access_invalid_policy');
      const committed = await mutate(async storage => {
        if (!await matches(epoch, context.scopeHash)) return fail('shared_access_identity_changed');
        const previous = await validRecord((await storage.get(SHARED_ACCESS_POLICY_LKG_KEY))[SHARED_ACCESS_POLICY_LKG_KEY], context.scopeHash);
        if (previous?.version > record.version) return fail('shared_access_stale_policy');
        if (previous?.version === record.version && previous.policyHash !== record.policyHash) return fail('shared_access_policy_conflict');
        if (previous && record.policy.effectiveAtMs < previous.policy.effectiveAtMs) return fail('shared_access_stale_policy');
        if (!await matches(epoch, context.scopeHash)) return fail('shared_access_identity_changed');
        await storage.set({ [SHARED_ACCESS_POLICY_LKG_KEY]: record });
        return { ok: true };
      }, { priority: 'derived', source: 'shared_policy_lkg' });
      if (!await matches(epoch, context.scopeHash)) return fail('shared_access_identity_changed');
      if (!committed?.ok) return await fallback(epoch, context.scopeHash, committed?.errorCode || 'shared_access_cache_write_failed');
      blockedScope = null;
      current = record;
      return present(record, 'fresh');
    } catch (_) {
      if (epoch !== generation) return fail('shared_access_identity_changed');
      try {
        const context = await capturedContext(readContext);
        return await fallback(epoch, context.scopeHash, 'shared_access_cache_write_failed');
      } catch (_) { if (epoch === generation) current = null; return fail('shared_access_local_read_failed'); }
    } finally {
      clearTimeout(timer);
      if (epoch === generation) controller = null;
    }
  }
  return { read, refresh, invalidate,
    configure(value) { invalidate(); enabled = value === true; return enabled ? refresh() : Promise.resolve(fail('shared_access_disabled')); },
    inspect: () => ({ enabled, hasPolicy: available() && !!current, executionEnabled: false }),
  };
}

let reader = null;
export function configureSharedAccessPolicyReader({ enabled = false } = {}) {
  return reader?.configure(enabled) || Promise.resolve(fail('shared_access_disabled'));
}
export function readSharedAccessPolicyLkg() { return reader?.read() || Promise.resolve(fail('shared_access_disabled')); }
export function initSharedAccessPolicyReader() {
  if (reader) return;
  reader = createSharedAccessPolicyReader();
  const refresh = () => { void reader.refresh().catch(() => {}); };
  chrome.runtime.onStartup.addListener(refresh);
  chrome.runtime.onInstalled.addListener(refresh);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !IDENTITY_KEYS.some(key => Object.hasOwn(changes, key))) return;
    reader.invalidate(); refresh();
  });
  let wasAvailable = false;
  observeSharedAccessPolicyCapability(available => {
    if (!available) reader.invalidate();
    else if (!wasAvailable) refresh();
    wasAvailable = available;
  });
  refresh();
}

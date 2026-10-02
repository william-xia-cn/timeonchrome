import { assembleSharedQuotaExecutionPages, projectLocalSharedQuotaExecution } from '../core/shared-contracts/1.28.0/shared-quota-execution.js';
import { validateSharedAccessPolicyV1, canonicalSharedPolicy } from '../core/shared-access-policy.js';
import { readSharedAccessPolicyContext, readSharedAccessPolicyLkg, SHARED_ACCESS_POLICY_LKG_KEY } from './shared-access-policy-reader.js';
import { readCloudSharedQuotaExecutionPage } from './cloud-sync.js';
import { hasSharedAccessPolicyCapability, observeSharedAccessPolicyCapability } from './native-host-client.js';
import { runStorageMutation } from './storage-budget.js';

export const SHARED_QUOTA_EXECUTION_LKG_KEY = 'shared_quota_execution_lkg_v1';
const MAX_BYTES = 512 * 1024;
const AUTH_ERRORS = new Set(['shared_access_unauthorized', 'shared_access_unbound', 'shared_access_unsupported', 'shared_access_identity_mismatch']);
const clone = value => JSON.parse(JSON.stringify(value));
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
const fail = errorCode => ({ ok: false, errorCode, executionEnabled: false });
const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');
const dateNow = now => new Date(now() + 8 * 3600000).toISOString().slice(0, 10);
function validDate(date) {
  const time = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date;
}
const scopeKey = scope => JSON.stringify([scope.source, scope.sourceKey, scope.date]);

export function createSharedQuotaExecutionReader({ enabled = false, readContext = readSharedAccessPolicyContext,
  readPolicy = readSharedAccessPolicyLkg, request = readCloudSharedQuotaExecutionPage,
  supported = hasSharedAccessPolicyCapability, mutate = runStorageMutation,
  readCache = async () => (await chrome.storage.local.get(SHARED_QUOTA_EXECUTION_LKG_KEY))[SHARED_QUOTA_EXECUTION_LKG_KEY],
  now = Date.now, roundTimeoutMs = 60000 } = {}) {
  let generation = 0, active = null, controller = null, queuedDate = null, blockedScope = null;
  const available = () => enabled === true && supported() === true;
  function invalidate() { generation++; controller?.abort(); queuedDate = null; }
  async function capture() {
    const identity = await readContext();
    if (!identity || !['apiBase', 'deviceId', 'childId', 'deviceToken'].every(key => typeof identity[key] === 'string' && identity[key])) {
      throw Error('shared_execution_identity_unavailable');
    }
    const response = await readPolicy();
    const checked = response?.ok && validateSharedAccessPolicyV1(response.policy);
    if (!checked?.ok) throw Error('shared_execution_policy_unavailable');
    return { ...identity, policy: checked.policy, policyHash: await digest(checked.canonical),
      scopeHash: await digest(JSON.stringify(['shared-policy-v1', identity.apiBase, identity.deviceId, identity.childId, identity.deviceToken])) };
  }
  async function matches(epoch, context) {
    if (!available() || epoch !== generation) return false;
    const latest = await capture();
    return available() && epoch === generation && latest.scopeHash === context.scopeHash && latest.policyHash === context.policyHash;
  }
  function project(context, assembled, date) {
    if (!assembled || Object.keys(assembled).length !== 2 || !assembled.basis || !Array.isArray(assembled.authorizedScopes)
      || assembled.basis.toDate !== date || !/^[a-f0-9]{64}$/.test(assembled.basis.revision)) throw Error('shared_execution_invalid_cache');
    const result = projectLocalSharedQuotaExecution(context.policy, assembled.basis, [], assembled.authorizedScopes);
    const existing = new Set(assembled.basis.days.flatMap(day => day.sources.map(source => scopeKey(source.contribution))));
    if (assembled.authorizedScopes.some(scope => !existing.has(scopeKey(scope)))) throw Error('shared_execution_invalid_cache');
    return result;
  }
  async function validRecord(value, context, date) {
    if (!value || Object.keys(value).length !== 7 || value.schemaVersion !== 1 || value.scopeHash !== context.scopeHash
      || value.policyHash !== context.policyHash || value.date !== date || !Number.isSafeInteger(value.receivedAtMs)
      || value.receivedAtMs < 0 || bytes(value) > MAX_BYTES || value.basisHash !== await digest(canonicalSharedPolicy(value.assembled))) return null;
    try { project(context, value.assembled, date); return value; } catch (_) { return null; }
  }
  function present(record, context, status, errorCode = null) {
    const projection = project(context, record.assembled, record.date);
    return { ok: true, status, errorCode, ...clone(record.assembled), complete: projection.complete,
      reasonCodes: projection.reasonCodes, executionEnabled: false };
  }
  async function fallback(epoch, context, date, errorCode) {
    if (!await matches(epoch, context)) return fail('shared_execution_identity_changed');
    if (blockedScope === context.scopeHash) return fail('shared_execution_authorization_unavailable');
    const record = await validRecord(await readCache(), context, date);
    if (!await matches(epoch, context) || epoch !== generation) return fail('shared_execution_identity_changed');
    return record ? present(record, context, 'lkg', errorCode) : fail(errorCode);
  }
  async function read(date = dateNow(now)) {
    if (!available()) return fail(enabled ? 'shared_access_unsupported' : 'shared_execution_disabled');
    if (!validDate(date)) return fail('shared_execution_invalid_cursor');
    const epoch = generation;
    try { return await fallback(epoch, await capture(), date, 'shared_execution_no_lkg'); }
    catch (_) { return fail('shared_execution_local_read_failed'); }
  }
  async function readPage(input, signal) {
    if (signal.aborted) return fail('shared_execution_cancelled');
    let abort;
    try {
      return await Promise.race([Promise.resolve().then(() => request(input)), new Promise(resolve => {
        abort = () => resolve(fail('shared_execution_cancelled'));
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      })]);
    } finally { signal.removeEventListener('abort', abort); }
  }
  async function collect(context, date, epoch, signal) {
    for (let round = 0; round < 2; round++) {
      const pages = []; let offset = 0, revision, size = 0, restart = false;
      for (let index = 0; index < 28; index++) {
        if (!await matches(epoch, context)) return fail('shared_execution_identity_changed');
        const response = await readPage({ deviceToken: context.deviceToken, apiBase: context.apiBase, date, offset,
          ...(revision === undefined ? {} : { revision }), signal }, signal);
        if (!await matches(epoch, context)) return fail('shared_execution_identity_changed');
        if (response?.errorCode === 'shared_access_snapshot_changed' && round === 0) { restart = true; break; }
        if (!response?.ok) return response || fail('shared_execution_unavailable');
        const value = response.page;
        if (!value || typeof value !== 'object' || typeof value.profileId !== 'string' || !value.profileId) {
          return fail('shared_execution_invalid_pages');
        }
        if (value?.profileId !== context.childId) return fail('shared_access_identity_mismatch');
        const cursor = value.page;
        if (value.policyRevision !== context.policy.revision || value.toDate !== date || !/^[a-f0-9]{64}$/.test(value.basisRevision)
          || (revision !== undefined && revision !== value.basisRevision) || !cursor || cursor.offset !== offset || cursor.limit !== 50
          || !Number.isSafeInteger(cursor.total) || cursor.total < offset || cursor.total > 1400 || !Array.isArray(cursor.items)
          || cursor.items.length !== Math.min(50, cursor.total - offset)
          || cursor.nextOffset !== (offset + cursor.items.length < cursor.total ? offset + cursor.items.length : null)) {
          return fail('shared_execution_invalid_pages');
        }
        size += bytes(value);
        if (size > MAX_BYTES) return fail('shared_execution_size_limit');
        pages.push(value); revision = value.basisRevision;
        if (cursor.nextOffset === null) {
          try { return { ok: true, assembled: assembleSharedQuotaExecutionPages(context.policy, context.childId, pages) }; }
          catch (_) { return fail('shared_execution_invalid_pages'); }
        }
        offset = cursor.nextOffset;
      }
      if (!restart) return fail('shared_execution_incomplete_pages');
    }
    return fail('shared_access_snapshot_changed');
  }
  async function perform(date, epoch, signal) {
    let context;
    try {
      context = await capture();
      if (!await matches(epoch, context)) return fail('shared_execution_identity_changed');
      const result = await collect(context, date, epoch, signal);
      if (!result.ok) {
        if (AUTH_ERRORS.has(result.errorCode)) {
          if (!await matches(epoch, context)) return fail('shared_execution_identity_changed');
          blockedScope = context.scopeHash;
          await mutate(async storage => {
            const record = (await storage.get(SHARED_QUOTA_EXECUTION_LKG_KEY))[SHARED_QUOTA_EXECUTION_LKG_KEY];
            if (record?.scopeHash === context.scopeHash && await matches(epoch, context)) await storage.remove(SHARED_QUOTA_EXECUTION_LKG_KEY);
          }, { priority: 'derived', source: 'shared_execution_authorization' });
          return fail(result.errorCode);
        }
        return await fallback(epoch, context, date, result.errorCode);
      }
      if (signal.aborted) return await fallback(epoch, context, date, 'shared_execution_cancelled');
      const record = { schemaVersion: 1, scopeHash: context.scopeHash, policyHash: context.policyHash,
        date, receivedAtMs: now(), assembled: result.assembled, basisHash: await digest(canonicalSharedPolicy(result.assembled)) };
      if (!Number.isSafeInteger(record.receivedAtMs) || record.receivedAtMs < 0 || bytes(record) > MAX_BYTES) return fail('shared_execution_size_limit');
      const committed = await mutate(async storage => {
        if (!await matches(epoch, context) || signal.aborted) return false;
        await storage.set({ [SHARED_QUOTA_EXECUTION_LKG_KEY]: record }); return true;
      }, { priority: 'derived', source: 'shared_execution_lkg' });
      if (!committed || !await matches(epoch, context)) return fail('shared_execution_identity_changed');
      blockedScope = null;
      return present(record, context, 'fresh');
    } catch (_) {
      if (!context) return fail('shared_execution_policy_unavailable');
      try { return await fallback(epoch, context, date, 'shared_execution_unavailable'); }
      catch (_) { return fail('shared_execution_local_read_failed'); }
    }
  }
  function refresh(date = dateNow(now)) {
    if (!available()) return Promise.resolve(fail(enabled ? 'shared_access_unsupported' : 'shared_execution_disabled'));
    if (!validDate(date)) return Promise.resolve(fail('shared_execution_invalid_cursor'));
    if (active) { queuedDate = date; return Promise.resolve(fail('shared_execution_busy')); }
    const epoch = ++generation, attempt = new AbortController(); controller = attempt;
    const timer = setTimeout(() => attempt.abort(), Math.min(60000, Math.max(1, roundTimeoutMs)));
    active = perform(date, epoch, attempt.signal).finally(() => {
      clearTimeout(timer); if (controller === attempt) controller = null;
      active = null; const next = queuedDate; queuedDate = null;
      if (next && available()) void refresh(next).catch(() => {});
    });
    return active;
  }
  return { read, refresh, invalidate,
    configure(value) { invalidate(); enabled = value === true; return enabled ? refresh() : Promise.resolve(fail('shared_execution_disabled')); } };
}

let reader;
export function configureSharedQuotaExecutionReader({ enabled = false } = {}) {
  return reader?.configure(enabled) || Promise.resolve(fail('shared_execution_disabled'));
}
export function readSharedQuotaExecutionLkg(date) { return reader?.read(date) || Promise.resolve(fail('shared_execution_disabled')); }
export function initSharedQuotaExecutionReader() {
  if (reader) return;
  reader = createSharedQuotaExecutionReader();
  const refresh = () => { void reader.refresh().catch(() => {}); };
  chrome.runtime.onStartup.addListener(refresh); chrome.runtime.onInstalled.addListener(refresh);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && ['cloud_device_id', 'cloud_profile_id', 'cloud_device_token', SHARED_ACCESS_POLICY_LKG_KEY].some(key => Object.hasOwn(changes, key))) {
      reader.invalidate(); refresh();
    }
  });
  let previous = false;
  observeSharedAccessPolicyCapability(available => {
    if (!available) reader.invalidate(); else if (!previous) refresh(); previous = available;
  });
  refresh();
}

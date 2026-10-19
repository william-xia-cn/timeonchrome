import { validateSharedWebReusableProofV2 } from '../core/shared-contracts/1.58.0/shared-web-sync.js';
import { SHARED_WEB_IDENTITY_ERRORS } from '../core/shared-web-native.js';
import { canonicalSharedWebSync } from '../core/shared-contracts/1.58.0/shared-web-sync.js';
import { readSharedAccessPolicyContext } from './shared-access-policy-reader.js';
import { requestCloudSharedWebSourceBindingV2 } from './cloud-sync.js';
import { requestApplicationIdentityBindingNative, readApplicationIdentityBindingConnection,
  setApplicationIdentityBindingEnsurer, setApplicationIdentityBindingReader, observeSharedAccessPolicyCapability } from './native-host-client.js';
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalSharedWebSync(value))))].map(byte => byte.toString(16).padStart(2, '0')).join('');

const clone = value => JSON.parse(JSON.stringify(value));
const scopeKeys = ['applicationSourceKey', 'childScopeHash', 'assignmentVersion'];
const fail = errorCode => ({ ok: false, errorCode });

// Proofs stay in this process; they never enter ledger, diagnostics or persisted queues.
export function createReusableSharedWebBinding({ native, exchange, now = Date.now } = {}) {
  let cache = null;
  return { invalidate() { cache = null; }, readProof(context) {
    if (!cache || cache.scopeHash !== context?.scopeHash || cache.proof.claims.issuedAtMs > now()
      || cache.proof.claims.expiresAtMs <= now()) return null;
    return clone(cache.proof);
  }, async bind(context, connection, current, expectedSourceKey = null) {
    try {
      const scoped = await native('getSharedWebSourceScope', {});
      if (!await current(connection)) return fail('shared_web_identity_changed');
      if (!scoped?.ok) return fail(SHARED_WEB_IDENTITY_ERRORS.has(scoped?.errorCode)
        ? scoped.errorCode : 'shared_web_scope_unavailable');
      const scopeProof = clone(scoped.value);
      validateSharedWebReusableProofV2(scopeProof, 'timeonchrome:shared-web-machine-scope:v2');
      const scope = scopeProof.claims;
      if (scope.issuedAtMs > now() || scope.expiresAtMs <= now()) return fail('WEB_SOURCE_PROOF_EXPIRED');
      const matches = cache && cache.scopeHash === context.scopeHash
        && scopeKeys.every(key => cache.proof.claims[key] === scope[key])
        && (!expectedSourceKey || cache.proof.claims.webSourceKey === expectedSourceKey);
      if (!matches) cache = null;
      let proof = cache?.proof;
      if (!proof || proof.claims.issuedAtMs > now() || proof.claims.expiresAtMs <= now()) {
        const issued = await exchange(context, scopeProof);
        if (!await current(connection)) return fail('shared_web_identity_changed');
        if (!issued?.ok) return fail(SHARED_WEB_IDENTITY_ERRORS.has(issued?.errorCode)
          ? issued.errorCode : 'shared_web_proof_unavailable');
        proof = clone(issued.value);
        validateSharedWebReusableProofV2(proof, 'timeonchrome:shared-web-source:v2');
      }
      if (!scopeKeys.every(key => proof.claims[key] === scope[key])
        || expectedSourceKey && proof.claims.webSourceKey !== expectedSourceKey) {
        cache = null;
        return fail('WEB_SOURCE_SCOPE_MISMATCH');
      }
      if (proof.claims.issuedAtMs > now() || proof.claims.expiresAtMs <= now()) return fail('WEB_SOURCE_PROOF_EXPIRED');
      const bound = await native('bindSharedWebSourceV2', { proof: clone(proof) });
      if (!await current(connection)) return fail('shared_web_identity_changed');
      if (!bound?.ok) {
        cache = null;
        return fail(SHARED_WEB_IDENTITY_ERRORS.has(bound?.errorCode) ? bound.errorCode : 'shared_web_identity_unverified');
      }
      const identity = bound.value;
      if (!identity || Object.keys(identity).length !== 3 || identity.status !== 'verified'
        || identity.webSourceKey !== proof.claims.webSourceKey || identity.expiresAtMs !== proof.claims.expiresAtMs
        || identity.expiresAtMs <= now()) return fail('shared_web_identity_unverified');
      cache = { scopeHash: context.scopeHash, proof: clone(proof) };
      return { ok: true, binding: { protocolVersion: 2, webSourceKey: identity.webSourceKey,
        applicationSourceKey: scope.applicationSourceKey, bindingEpochHash: proof.claims.bindingEpochHash,
        expiresAtMs: identity.expiresAtMs, scopeHash: context.scopeHash }, claims: clone(proof.claims) };
    } catch (_) { return fail('shared_web_invalid_reusable_proof'); }
  } };
}

// Current identity lifecycle has no contribution queue or execution switch dependency.
export function createApplicationIdentityBinding({ readContext = readSharedAccessPolicyContext,
  exchangeV2 = requestCloudSharedWebSourceBindingV2, identityNative = requestApplicationIdentityBindingNative,
  readIdentityConnection = readApplicationIdentityBindingConnection, now = Date.now, onIdentityReady = () => {} } = {}) {
  let epoch = 0, confirmedIdentityBinding = null, identityBindingPromise = null, identityBindingEpoch = 0;
  const reusableBinding = createReusableSharedWebBinding({ native: identityNative, exchange: exchangeV2, now });
  async function captureIdentity() {
    const context = await readContext();
    if (!context || !['apiBase', 'deviceId', 'childId', 'deviceToken'].every(k => typeof context[k] === 'string' && context[k])) {
      throw Error('application_identity_usage_binding_unavailable');
    }
    return { ...context, scopeHash: await hash(['shared-web-v1', context.apiBase,
      context.deviceId, context.childId, context.deviceToken]) };
  }
  async function readApplicationIdentityBinding() {
    const cached = confirmedIdentityBinding;
    if (!cached) return fail('application_identity_usage_binding_unavailable');
    try {
      const context = await captureIdentity(), current = readIdentityConnection();
      if (cached !== confirmedIdentityBinding || context.scopeHash !== cached.scopeHash
        || !current?.connection || current.connection !== cached.connection
        || current.connectionGeneration !== cached.connectionGeneration
        || current.reusableSourceSupported !== true
        || cached.expiresAtMs <= now()) return fail('application_identity_usage_binding_unavailable');
      return { ok: true, bindingContextId: cached.bindingContextId, expiresAtMs: cached.expiresAtMs };
    } catch (_) { return fail('application_identity_usage_binding_unavailable'); }
  }
  async function ensureApplicationIdentityBinding(retryInvalidatedGeneration = true) {
    const ready = await readApplicationIdentityBinding();
    if (ready.ok) return ready;
    if (identityBindingPromise) {
      const pending = identityBindingPromise, pendingEpoch = identityBindingEpoch;
      const result = await pending;
      if (pendingEpoch !== epoch && retryInvalidatedGeneration) {
        // Serialize the current generation after the retired operation, with one bounded retry.
        if (identityBindingPromise === pending) identityBindingPromise = null;
        return ensureApplicationIdentityBinding(false);
      }
      return result;
    }
    const operation = (async () => {
      const generation = epoch;
      let context;
      try { context = await captureIdentity(); }
      catch (_) { return fail('application_identity_usage_binding_unavailable'); }
      const initialConnection = readIdentityConnection();
      const connection = initialConnection?.connection;
      if (!connection || initialConnection.reusableSourceSupported !== true
        || !Number.isSafeInteger(initialConnection.connectionGeneration)) {
        return fail('application_identity_usage_binding_unavailable');
      }
      const currentIdentity = async expected => {
        if (generation !== epoch) return false;
        let next;
        try { next = await captureIdentity(); } catch (_) { return false; }
        const currentConnection = readIdentityConnection();
        return generation === epoch && next.scopeHash === context.scopeHash
          && currentConnection?.connection === expected
          && currentConnection.connectionGeneration === initialConnection.connectionGeneration
          && currentConnection.reusableSourceSupported === true;
      };
      const bound = await reusableBinding.bind(context, connection, currentIdentity);
      if (!bound.ok || !await currentIdentity(connection)) {
        reusableBinding.invalidate();
        return fail(bound.errorCode || 'application_identity_usage_binding_unavailable');
      }
      const bindingContextId = await hash({ schemaVersion: 1, scopeHash: context.scopeHash,
        connectionGeneration: initialConnection.connectionGeneration,
        applicationSourceKey: bound.claims.applicationSourceKey,
        childScopeHash: bound.claims.childScopeHash, assignmentVersion: bound.claims.assignmentVersion,
        webSourceKey: bound.claims.webSourceKey, bindingEpochHash: bound.claims.bindingEpochHash,
        expiresAtMs: bound.binding.expiresAtMs });
      if (!await currentIdentity(connection)) return fail('application_identity_usage_binding_unavailable');
      confirmedIdentityBinding = { scopeHash: context.scopeHash, connection,
        connectionGeneration: initialConnection.connectionGeneration,
        bindingContextId, expiresAtMs: bound.binding.expiresAtMs };
      try { Promise.resolve(onIdentityReady()).catch(() => {}); } catch (_) { /* Readiness notification is best-effort. */ }
      return { ok: true, bindingContextId, expiresAtMs: bound.binding.expiresAtMs };
    })();
    identityBindingEpoch = epoch;
    identityBindingPromise = operation;
    try { return await operation; }
    finally { if (identityBindingPromise === operation) identityBindingPromise = null; }
  }
  async function readApplicationIdentityConfirmation(expectedContext) {
    const unknown = { confirmed: null };
    const cached = confirmedIdentityBinding;
    if (!cached || !expectedContext) return unknown;
    try {
      const context = await captureIdentity(), current = readIdentityConnection();
      if (!['apiBase', 'deviceId', 'childId', 'deviceToken'].every(key => context[key] === expectedContext[key])
        || cached !== confirmedIdentityBinding || context.scopeHash !== cached.scopeHash
        || !current?.connection || current.connection !== cached.connection
        || current.connectionGeneration !== cached.connectionGeneration
        || current.reusableSourceSupported !== true || cached.expiresAtMs <= now()) return unknown;
      return { confirmed: true, connectionGeneration: cached.connectionGeneration, expiresAtMs: cached.expiresAtMs };
    } catch (_) { return unknown; }
  }
  async function readApplicationSourceProof(expectedContext) {
    const binding = confirmedIdentityBinding;
    if ((await readApplicationIdentityConfirmation(expectedContext)).confirmed !== true) return null;
    const context = await captureIdentity().catch(() => null);
    if (!context || binding !== confirmedIdentityBinding) return null;
    const proof = reusableBinding.readProof(context);
    return (await readApplicationIdentityConfirmation(expectedContext)).confirmed === true
      && binding === confirmedIdentityBinding ? proof : null;
  }

  return { ensureApplicationIdentityBinding, readApplicationIdentityBinding, readApplicationIdentityConfirmation, readApplicationSourceProof,
    invalidate() { epoch++; confirmedIdentityBinding = null; reusableBinding.invalidate(); } };
}
let sync;
export function ensureApplicationIdentityBinding() { return sync?.ensureApplicationIdentityBinding() || Promise.resolve(fail('application_identity_usage_binding_unavailable')); }
export function readCurrentApplicationIdentityConfirmation(expected) { return sync?.readApplicationIdentityConfirmation(expected) || Promise.resolve({ confirmed: null }); }
export function readApplicationStatisticsSourceProof(expected) { return sync?.readApplicationSourceProof(expected) || Promise.resolve(null); }
export function initApplicationIdentityBinding({ identityAllowed = () => false, onIdentityReady = () => {} } = {}) {
  if (sync) return;
  sync = createApplicationIdentityBinding({ onIdentityReady });
  setApplicationIdentityBindingEnsurer(() => sync.ensureApplicationIdentityBinding());
  setApplicationIdentityBindingReader(() => sync.readApplicationIdentityBinding());
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'TIMEONCHROME_APPLICATION_IDENTITY_BINDING_ENSURE') return false;
    try {
      const expected = new URL(chrome.runtime.getURL('admin/admin.html'));
      const actual = new URL(sender?.url || '');
      if (sender?.id !== chrome.runtime.id || actual.origin !== expected.origin || actual.pathname !== expected.pathname) {
        sendResponse({ ok: false, errorCode: 'application_identity_usage_binding_sender_rejected' });
        return false;
      }
    } catch (_) {
      sendResponse({ ok: false, errorCode: 'application_identity_usage_binding_sender_rejected' });
      return false;
    }
    sync.ensureApplicationIdentityBinding().then(sendResponse,
      () => sendResponse({ ok: false, errorCode: 'application_identity_usage_binding_unavailable' }));
    return true;
  });
  const refreshIdentity = () => {
    void Promise.resolve().then(identityAllowed).then(allowed => allowed
      ? sync.ensureApplicationIdentityBinding() : null).catch(() => {});
  };
  const refresh = refreshIdentity;
  chrome.runtime.onStartup.addListener(refresh); chrome.runtime.onInstalled.addListener(refresh);
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'timeonchromeLocalGuardianHeartbeat') refresh(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (['cloud_device_token', 'cloud_device_id', 'cloud_profile_id'].some(k => Object.hasOwn(changes, k))) sync.invalidate();
    if (['cloud_device_token', 'cloud_device_id', 'cloud_profile_id'].some(k => Object.hasOwn(changes, k))) refresh();
  });
  let previous = false;
  observeSharedAccessPolicyCapability(available => {
    if (available !== previous) { sync.invalidate(); if (available) refresh(); }
    previous = available;
    refreshIdentity();
  });
  refresh();
}

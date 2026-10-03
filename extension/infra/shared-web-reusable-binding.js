import { validateSharedWebReusableProofV2 } from '../core/shared-contracts/1.31.0/shared-web-sync.js';
import { SHARED_WEB_IDENTITY_ERRORS } from '../core/shared-web-native.js';

const clone = value => JSON.parse(JSON.stringify(value));
const scopeKeys = ['applicationSourceKey', 'childScopeHash', 'assignmentVersion'];
const fail = errorCode => ({ ok: false, errorCode });

// Proofs stay in this process; they never enter ledger, diagnostics or persisted queues.
export function createReusableSharedWebBinding({ native, exchange, now = Date.now } = {}) {
  let cache = null;
  return { invalidate() { cache = null; }, async bind(context, connection, current, expectedSourceKey = null) {
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

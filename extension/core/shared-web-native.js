import { validateSharedWebReusableProofV2 } from './shared-contracts/1.58.0/shared-web-sync.js';

export const SHARED_WEB_IDENTITY_ERRORS = new Set(['INVALID_WEB_SOURCE_SCOPE', 'INVALID_WEB_SOURCE_PROOF',
  'INVALID_WEB_SOURCE_BINDING', 'INVALID_WEB_SOURCE_KEY', 'WEB_SOURCE_SCOPE_MISMATCH',
  'WEB_SOURCE_PROOF_EXPIRED', 'WEB_SOURCE_PROOF_SIGNATURE_INVALID', 'WEB_SOURCE_ASSIGNMENT_CHANGED',
  'WEB_SOURCE_BINDING_CONFLICT', 'WEB_SOURCE_BINDING_UNAVAILABLE', 'SHARED_ACCESS_ASSIGNMENT_UNAVAILABLE',
  'SHARED_ACCESS_BINDING_CHANGED', 'SHARED_ACCESS_POLICY_CHANGED', 'SHARED_WEB_SYNC_UNAVAILABLE',
  'WEB_SOURCE_CONTEXT_CHANGED', 'WEB_SOURCE_PROOF_REQUIRED']);

const exact = (v, keys) => v && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export async function captureSharedWebNativeRequest(method, value) {
  if (method === 'getSharedWebSourceScope') {
    if (!exact(value, [])) throw Error('shared_web_invalid_request');
  } else if (method === 'bindSharedWebSourceV2') {
    if (!exact(value, ['proof'])) throw Error('shared_web_invalid_request');
    validateSharedWebReusableProofV2(value.proof, 'timeonchrome:shared-web-source:v2');
  } else throw Error('shared_web_unsupported');
  return JSON.parse(JSON.stringify(value));
}
export function captureSharedWebNativeReceipt(method, ack, request, now) {
  if (method === 'getSharedWebSourceScope') {
    const proof = ack.sharedWebSourceScope;
    validateSharedWebReusableProofV2(proof, 'timeonchrome:shared-web-machine-scope:v2');
    if (proof.claims.issuedAtMs > now || proof.claims.expiresAtMs <= now) throw Error('WEB_SOURCE_PROOF_EXPIRED');
    return JSON.parse(JSON.stringify(proof));
  }
  if (method === 'bindSharedWebSourceV2') {
    const r = ack.sharedWebIdentity, c = request.proof.claims;
    if (!exact(r, ['status', 'webSourceKey', 'expiresAtMs']) || r.status !== 'verified'
      || r.webSourceKey !== c.webSourceKey || r.expiresAtMs !== c.expiresAtMs || r.expiresAtMs <= now)
      throw Error('shared_web_invalid_receipt');
    return { ...r };
  }
  throw Error('shared_web_unsupported');
}

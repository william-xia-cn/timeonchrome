/** 当前可复用来源证明；不传递贡献账，也不授权执行。 */
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: unknown, fields: readonly string[]): v is Record<string, unknown> => record(v)
  && Object.keys(v).length === fields.length && fields.every(k => Object.hasOwn(v, k));
const ms = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export const canonicalSharedWebSync = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(canonicalSharedWebSync).join(',')}]` : record(value)
    ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalSharedWebSync(value[k])}`).join(',')}}`
    : JSON.stringify(value);
export interface SharedWebSourceVerificationKeyV1 {
  schemaVersion: 1;
  keyId: string;
  publicJwk: { kty: 'EC'; crv: 'P-256'; x: string; y: string };
}

/** Reusable scope is cloud-signed, never a Host-provided authority or execution permit. */
export interface SharedWebMachineScopeClaimsV2 {
  schemaVersion: 2;
  audience: 'timeonchrome:shared-web-machine-scope:v2';
  applicationSourceKey: string;
  childScopeHash: string;
  assignmentVersion: number;
  issuedAtMs: number;
  expiresAtMs: number;
}
export interface SharedWebSourceBindingClaimsV2 extends Omit<SharedWebMachineScopeClaimsV2, 'audience'> {
  audience: 'timeonchrome:shared-web-source:v2';
  webSourceKey: string;
  bindingEpochHash: string;
}
export interface SharedWebReusableProofV2<C = SharedWebSourceBindingClaimsV2> {
  schemaVersion: 2;
  keyId: string;
  claims: C;
  signature: string;
}
export type SharedWebMachineScopeProofV2 = SharedWebReusableProofV2<SharedWebMachineScopeClaimsV2>;
export type SharedWebSourceBindingProofV2 = SharedWebReusableProofV2<SharedWebSourceBindingClaimsV2>;
export const SHARED_WEB_REUSABLE_CAPABILITY = 'shared-web-source-reusable-v2' as const;

export function validateSharedWebReusableClaimsV2(value: unknown,
  audience: SharedWebMachineScopeClaimsV2['audience'] | SharedWebSourceBindingClaimsV2['audience']
): asserts value is SharedWebMachineScopeClaimsV2 | SharedWebSourceBindingClaimsV2 {
  const web = audience === 'timeonchrome:shared-web-source:v2';
  if (!exact(value, ['schemaVersion','audience','applicationSourceKey','childScopeHash','assignmentVersion',
    'issuedAtMs','expiresAtMs', ...(web ? ['webSourceKey','bindingEpochHash'] : [])])
    || value.schemaVersion !== 2 || value.audience !== audience || !hash(value.applicationSourceKey)
    || !hash(value.childScopeHash) || !ms(value.assignmentVersion) || value.assignmentVersion < 1
    || !ms(value.issuedAtMs) || !ms(value.expiresAtMs) || value.expiresAtMs <= value.issuedAtMs
    || value.expiresAtMs - value.issuedAtMs > 300_000
    || web && (!hash(value.bindingEpochHash) || typeof value.webSourceKey !== 'string'
      || !/^web:[a-f0-9]{64}$/.test(value.webSourceKey))) throw Error('INVALID_WEB_SOURCE_BINDING');
}
export function validateSharedWebReusableProofV2(value: unknown,
  audience: SharedWebMachineScopeClaimsV2['audience'] | SharedWebSourceBindingClaimsV2['audience']
): asserts value is SharedWebReusableProofV2<SharedWebMachineScopeClaimsV2 | SharedWebSourceBindingClaimsV2> {
  if (!exact(value,['schemaVersion','keyId','claims','signature']) || value.schemaVersion !== 2
    || !hash(value.keyId) || typeof value.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(value.signature))
    throw Error('INVALID_WEB_SOURCE_PROOF');
  validateSharedWebReusableClaimsV2(value.claims, audience);
}
function reusableBytes(keyId: string, claims: SharedWebMachineScopeClaimsV2 | SharedWebSourceBindingClaimsV2): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(canonicalSharedWebSync({schemaVersion:2,keyId,claims}));
}
export async function signSharedWebReusableProofV2<C extends SharedWebMachineScopeClaimsV2 | SharedWebSourceBindingClaimsV2>(
  claims: C, keyId: string, privateKey: CryptoKey): Promise<SharedWebReusableProofV2<C>> {
  validateSharedWebReusableClaimsV2(claims, claims.audience);
  if (!hash(keyId)) throw Error('INVALID_WEB_SOURCE_KEY');
  const captured: C = JSON.parse(canonicalSharedWebSync(claims));
  const bytes = reusableBytes(keyId, captured);
  const signature = new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,bytes));
  if (signature.length !== 64) throw Error('INVALID_WEB_SOURCE_SIGNATURE');
  return {schemaVersion:2,keyId,claims:captured,signature:btoa(String.fromCharCode(...signature))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
}
export async function verifySharedWebReusableProofV2(value: unknown, trustedKeyId: string, trustedPublicKey: CryptoKey,
  expected: Pick<SharedWebMachineScopeClaimsV2,'applicationSourceKey'|'childScopeHash'|'assignmentVersion'>,
  audience: SharedWebMachineScopeClaimsV2['audience'] | SharedWebSourceBindingClaimsV2['audience'], nowMs: number
): Promise<SharedWebMachineScopeClaimsV2 | SharedWebSourceBindingClaimsV2> {
  validateSharedWebReusableProofV2(value, audience);
  const proof = JSON.parse(canonicalSharedWebSync(value)) as SharedWebReusableProofV2<SharedWebMachineScopeClaimsV2 | SharedWebSourceBindingClaimsV2>;
  const scope = {...expected};
  if (!exact(scope,['applicationSourceKey','childScopeHash','assignmentVersion']) || !hash(scope.applicationSourceKey)
    || !hash(scope.childScopeHash) || !ms(scope.assignmentVersion) || scope.assignmentVersion < 1 || !ms(nowMs))
    throw Error('INVALID_WEB_SOURCE_SCOPE');
  if (proof.keyId !== trustedKeyId) throw Error('INVALID_WEB_SOURCE_KEY');
  if (proof.claims.issuedAtMs > nowMs || proof.claims.expiresAtMs <= nowMs) throw Error('WEB_SOURCE_PROOF_EXPIRED');
  if (proof.claims.applicationSourceKey !== scope.applicationSourceKey || proof.claims.childScopeHash !== scope.childScopeHash
    || proof.claims.assignmentVersion !== scope.assignmentVersion) throw Error('WEB_SOURCE_SCOPE_MISMATCH');
  const bytes = reusableBytes(proof.keyId, proof.claims);
  const signature = Uint8Array.from(atob(proof.signature.replace(/-/g,'+').replace(/_/g,'/')+'=='),c=>c.charCodeAt(0));
  if (btoa(String.fromCharCode(...signature)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'') !== proof.signature
    || !await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},trustedPublicKey,signature,bytes))
    throw Error('WEB_SOURCE_PROOF_SIGNATURE_INVALID');
  return proof.claims;
}

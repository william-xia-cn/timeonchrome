import { validateSharedAccessPolicyIdentityV1, type SharedAccessPolicyIdentityV1,
  type SharedQuotaContributionV1 } from './shared-access.js';
import type { SharedQuotaExecutionSourceV1 } from './shared-quota-execution.js';
import type { LocalSharedQuotaExecutionProjectionV1 } from './shared-quota-execution.js';

/** Explicit local read-model; does not overwrite the cloud SharedQuotaState or enable enforcement. */
export interface SharedQuotaExecutionPreparationV1 {
  schemaVersion: 1;
  basisRevision: string | null;
  policyIdentity: SharedAccessPolicyIdentityV1 | null;
  projection: LocalSharedQuotaExecutionProjectionV1 | null;
  transportStatus: 'online' | 'offline' | 'unavailable';
  replacementVersions: readonly { source:'web'|'application';sourceKey:string;date:string;
    revisionOrdinal:number;contentRevision:string }[];
  reasonCodes: readonly string[];
  executionEnabled: false;
}

/** Read-model identity only; a digest never grants source authority or an execution permit. */
export async function sharedQuotaExecutionIdentityV1(value: SharedQuotaExecutionPreparationV1): Promise<string> {
  if (!exact(value, ['schemaVersion','basisRevision','policyIdentity','projection','transportStatus',
    'replacementVersions','reasonCodes','executionEnabled']) || value.schemaVersion !== 1
    || value.executionEnabled !== false || !['online','offline'].includes(value.transportStatus)
    || !Array.isArray(value.reasonCodes) || value.reasonCodes.length !== 0
    || typeof value.basisRevision !== 'string' || !/^[a-f0-9]{64}$/.test(value.basisRevision)
    || !Array.isArray(value.replacementVersions) || value.replacementVersions.length > 1400)
    throw new Error('EXECUTION_IDENTITY_UNAVAILABLE');
  validateSharedAccessPolicyIdentityV1(value.policyIdentity);
  const projection = value.projection;
  if (!exact(projection, ['basisRevision','policyRevision','complete','reasonCodes','days','week'])
    || projection.basisRevision !== value.basisRevision || projection.policyRevision !== value.policyIdentity.revision
    || projection.complete !== true || !Array.isArray(projection.reasonCodes) || projection.reasonCodes.length !== 0
    || !Array.isArray(projection.days) || projection.days.length < 1 || projection.days.length > 7
    || !exact(projection.week, ['fromDate','toDate','restUsedMs','restRemainingMs']))
    throw new Error('EXECUTION_IDENTITY_UNAVAILABLE');
  validateSharedWebDate(projection.week.fromDate); validateSharedWebDate(projection.week.toDate);
  const from = Date.parse(projection.week.fromDate + 'T00:00:00Z');
  if (new Date(from).getUTCDay() !== 1
    || Date.parse(projection.week.toDate + 'T00:00:00Z') !== from + (projection.days.length - 1) * 86400000)
    throw new Error('EXECUTION_IDENTITY_INVALID_PERIOD');
  let rest = 0;
  for (let index = 0; index < projection.days.length; index++) {
    const day = projection.days[index];
    if (!exact(day, ['date','complete','reasonCodes','usedMs','remainingMs','borrowedRestMs'])
      || day.date !== new Date(from + index * 86400000).toISOString().slice(0,10)
      || day.complete !== true || !Array.isArray(day.reasonCodes) || day.reasonCodes.length !== 0
      || !exact(day.usedMs, ['study','composite','rest']) || !Object.values(day.usedMs).every(ms)
      || !exact(day.remainingMs, ['study','composite','rest'])
      || !Object.values(day.remainingMs).every(amount => amount === null || ms(amount))
      || !ms(day.borrowedRestMs) || day.borrowedRestMs > Number(day.usedMs.rest))
      throw new Error('EXECUTION_IDENTITY_INVALID_PROJECTION');
    rest += Number(day.usedMs.rest);
  }
  if (!ms(rest) || projection.week.restUsedMs !== rest
    || !(projection.week.restRemainingMs === null || ms(projection.week.restRemainingMs)))
    throw new Error('EXECUTION_IDENTITY_INVALID_PROJECTION');
  const scopes = new Set<string>();
  for (const item of value.replacementVersions) {
    if (!exact(item, ['source','sourceKey','date','revisionOrdinal','contentRevision'])
      || !['web','application'].includes(String(item.source))
      || !opaque(item.sourceKey) || !opaque(item.contentRevision) || !ms(item.revisionOrdinal) || item.revisionOrdinal < 1)
      throw new Error('EXECUTION_IDENTITY_INVALID_REPLACEMENT');
    validateSharedWebDate(item.date);
    if (item.date < projection.week.fromDate || item.date > projection.week.toDate)
      throw new Error('EXECUTION_IDENTITY_INVALID_PERIOD');
    const scope = `${item.date}\0${item.source}\0${item.sourceKey}`;
    if (scopes.has(scope)) throw new Error('EXECUTION_IDENTITY_DUPLICATE_SCOPE');
    scopes.add(scope);
  }
  const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  const replacements = [...value.replacementVersions].sort((a,b) => compare(a.date,b.date)
    || compare(a.source,b.source) || compare(a.sourceKey,b.sourceKey));
  // Capture the complete input before the first await: subsequent caller mutation is irrelevant.
  const bytes = new TextEncoder().encode(canonicalSharedWebSync({schemaVersion:1,
    policyIdentity:value.policyIdentity,basisRevision:value.basisRevision,projection,replacementVersions:replacements}));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
}

/** Separate derived queue. This ordinal is NOT a web ledger/manifest revision. */
export interface SharedWebContributionUploadV1 {
  schemaVersion: 1;
  date: string;
  revisionOrdinal: number;
  statisticsRevision: string;
  correctionRevision: string;
  policyIdentity: SharedAccessPolicyIdentityV1;
  computedAtMs: number;
  settledAtMs: number | null;
  activeMs: number;
  bucketsMs: { study: number; composite: number; rest: number };
  otherMs: number;
  complete: boolean;
  reasonCodes: readonly string[];
  contentHash: string;
}
export interface SharedWebContributionWatermarkV1 {
  schemaVersion: 1;
  sourceKey: string;
  date: string;
  revisionOrdinal: number;
  contentHash: string | null;
  publicationRevision: string | null;
}
export interface SharedWebContributionAckV1 extends SharedWebContributionWatermarkV1 {
  status: 'accepted' | 'duplicate' | 'stale';
  submittedRevisionOrdinal: number;
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: unknown, fields: readonly string[]): v is Record<string, unknown> => record(v)
  && Object.keys(v).length === fields.length && fields.every(k => Object.hasOwn(v, k));
const ms = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const opaque = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(v);
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export function validateSharedWebDate(date: unknown): asserts date is string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(Date.parse(date + 'T00:00:00Z'))
    || new Date(date + 'T00:00:00Z').toISOString().slice(0,10) !== date) throw Error('INVALID_WEB_CONTRIBUTION_DATE');
}
const fields = ['schemaVersion','date','revisionOrdinal','statisticsRevision','correctionRevision','policyIdentity',
  'computedAtMs','settledAtMs','activeMs','bucketsMs','otherMs','complete','reasonCodes','contentHash'];
export function validateSharedWebContributionUploadV1(value: unknown): asserts value is SharedWebContributionUploadV1 {
  if (!exact(value, fields) || value.schemaVersion !== 1 || !ms(value.revisionOrdinal) || value.revisionOrdinal < 1
    || !opaque(value.statisticsRevision) || !opaque(value.correctionRevision) || !hash(value.contentHash)
    || !ms(value.computedAtMs) || !(value.settledAtMs === null || ms(value.settledAtMs) && value.settledAtMs <= value.computedAtMs)
    || !ms(value.activeMs) || value.activeMs > 86_400_000 || value.activeMs % 1000 !== 0
    || !exact(value.bucketsMs, ['study','composite','rest'])
    || !Object.values(value.bucketsMs).every(v => ms(v) && v % 1000 === 0)
    || !ms(value.otherMs) || value.otherMs % 1000 !== 0 || typeof value.complete !== 'boolean'
    || !Array.isArray(value.reasonCodes) || value.reasonCodes.length > 32
    || value.reasonCodes.some(v => typeof v !== 'string' || !/^[A-Z0-9_]{1,64}$/.test(v))
    || new Set(value.reasonCodes).size !== value.reasonCodes.length
    || value.complete && value.reasonCodes.length !== 0 || !value.complete && value.reasonCodes.length === 0)
    throw Error('INVALID_WEB_CONTRIBUTION');
  validateSharedWebDate(value.date);
  validateSharedAccessPolicyIdentityV1(value.policyIdentity);
  const accounted = Object.values(value.bucketsMs).reduce<number>((sum, v) => sum + Number(v), 0) + value.otherMs;
  if (!Number.isSafeInteger(accounted) || accounted > value.activeMs || value.complete && accounted !== value.activeMs)
    throw Error('WEB_CONTRIBUTION_TOTAL_MISMATCH');
}
export const canonicalSharedWebSync = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(canonicalSharedWebSync).join(',')}]` : record(value)
    ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalSharedWebSync(value[k])}`).join(',')}}`
    : JSON.stringify(value);
/** Capture canonical bytes before awaiting; caller mutation cannot change the hash input. */
export async function sharedWebContributionHashV1(value: Omit<SharedWebContributionUploadV1, 'contentHash'>): Promise<string> {
  const candidate = { ...value, contentHash: '0'.repeat(64) };
  validateSharedWebContributionUploadV1(candidate);
  const { contentHash: _ignored, ...body } = candidate;
  const bytes = new TextEncoder().encode(canonicalSharedWebSync(body));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2,'0')).join('');
}
export async function verifySharedWebContributionV1(value: unknown): Promise<SharedWebContributionUploadV1> {
  validateSharedWebContributionUploadV1(value);
  const captured: SharedWebContributionUploadV1 = JSON.parse(canonicalSharedWebSync(value));
  const { contentHash, ...body } = captured;
  if (await sharedWebContributionHashV1(body) !== contentHash) throw Error('WEB_CONTRIBUTION_HASH_MISMATCH');
  return captured;
}
/** Call only with server-derived or cloud-proof-verified sourceKey. No client authentication here. */
export function sharedWebExecutionSourceV1(upload: SharedWebContributionUploadV1, sourceKey: string): SharedQuotaExecutionSourceV1 {
  validateSharedWebContributionUploadV1(upload);
  if (!/^web:[a-f0-9]{64}$/.test(sourceKey)) throw Error('INVALID_WEB_SOURCE_KEY');
  const contribution: SharedQuotaContributionV1 = { schemaVersion: 1, source: 'web', sourceKey,
    date: upload.date, revision: upload.contentHash, statisticsRevision: upload.statisticsRevision,
    correctionRevision: upload.correctionRevision, policyRevision: upload.policyIdentity.revision,
    settledAtMs: upload.settledAtMs, complete: upload.complete, reasonCodes: [...upload.reasonCodes],
    bucketsMs: { ...upload.bucketsMs } };
  return { publicationRevision: `${upload.revisionOrdinal}:${upload.contentHash}`,
    revisionOrdinal: upload.revisionOrdinal, contribution };
}

/** Source proof is not an execution permit and contains no device/machine token or raw identity. */
export interface SharedWebSourceBindingClaimsV1 {
  schemaVersion: 1;
  audience: 'timeonchrome:shared-web-source:v1';
  challengeId: string;
  connectionHash: string;
  applicationSourceKey: string;
  childScopeHash: string;
  assignmentVersion: number;
  webSourceKey: string;
  issuedAtMs: number;
  expiresAtMs: number;
}
export function validateSharedWebSourceBindingClaimsV1(value: unknown): asserts value is SharedWebSourceBindingClaimsV1 {
  if (!exact(value, ['schemaVersion','audience','challengeId','connectionHash','applicationSourceKey','childScopeHash',
    'assignmentVersion','webSourceKey','issuedAtMs','expiresAtMs']) || value.schemaVersion !== 1
    || value.audience !== 'timeonchrome:shared-web-source:v1' || !hash(value.challengeId)
    || !hash(value.connectionHash) || !hash(value.applicationSourceKey) || !hash(value.childScopeHash)
    || !ms(value.assignmentVersion) || value.assignmentVersion < 1
    || typeof value.webSourceKey !== 'string' || !/^web:[a-f0-9]{64}$/.test(value.webSourceKey)
    || !ms(value.issuedAtMs) || !ms(value.expiresAtMs) || value.expiresAtMs <= value.issuedAtMs
    || value.expiresAtMs - value.issuedAtMs > 300_000) throw Error('INVALID_WEB_SOURCE_BINDING');
}

export interface SharedWebSourceBindingProofV1 {
  schemaVersion: 1;
  keyId: string;
  claims: SharedWebSourceBindingClaimsV1;
  /** IEEE P1363 ES256 r||s, base64url without padding, exactly 64 bytes. */
  signature: string;
}

/** Internal Service state only. Construct after fresh proof verification, never from Host payload/storage. */
export interface SharedWebLocalLeaseV1 {
  schemaVersion: 1;
  scopeRevision: string;
  policyIdentity: SharedAccessPolicyIdentityV1;
  claims: SharedWebSourceBindingClaimsV1;
  verifiedAtMs: number;
}
/** Authorizes only local replacement in the already verified scope, never cloud requests or execution. */
export function sharedWebLocalLeaseCurrentV1(lease: SharedWebLocalLeaseV1, current: {
  scopeRevision: string; policyIdentity: SharedAccessPolicyIdentityV1;
  connectionLive: boolean; capabilityNegotiated: boolean; nowMs: number;
}): boolean {
  try {
    if (!exact(lease,['schemaVersion','scopeRevision','policyIdentity','claims','verifiedAtMs'])
      || lease.schemaVersion !== 1 || !hash(lease.scopeRevision)
      || !exact(current,['scopeRevision','policyIdentity','connectionLive','capabilityNegotiated','nowMs'])
      || current.connectionLive !== true || current.capabilityNegotiated !== true
      || current.scopeRevision !== lease.scopeRevision || !ms(current.nowMs) || !ms(lease.verifiedAtMs)) return false;
    validateSharedAccessPolicyIdentityV1(lease.policyIdentity);
    validateSharedAccessPolicyIdentityV1(current.policyIdentity);
    validateSharedWebSourceBindingClaimsV1(lease.claims);
    return lease.verifiedAtMs >= lease.claims.issuedAtMs && lease.verifiedAtMs < lease.claims.expiresAtMs
      && current.nowMs >= lease.verifiedAtMs
      && canonicalSharedWebSync(current.policyIdentity) === canonicalSharedWebSync(lease.policyIdentity);
  } catch { return false; }
}
export interface SharedWebSourceChallengeV1 {
  schemaVersion: 1;
  challengeId: string;
  connectionHash: string;
  expiresAtMs: number;
}
export interface SharedWebSourceVerificationKeyV1 {
  schemaVersion: 1;
  keyId: string;
  publicJwk: { kty: 'EC'; crv: 'P-256'; x: string; y: string };
}
/** HTTPS MachineBearer response only. BrowserBridge forwards the four-field challenge, not caller authority. */
export interface SharedWebMachineSourceChallengeV1 extends SharedWebSourceChallengeV1 {
  applicationSourceKey: string;
  childScopeHash: string;
}
export function validateSharedWebSourceBindingProofV1(value: unknown): asserts value is SharedWebSourceBindingProofV1 {
  if (!exact(value,['schemaVersion','keyId','claims','signature']) || value.schemaVersion !== 1
    || !hash(value.keyId) || typeof value.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(value.signature))
    throw Error('INVALID_WEB_SOURCE_PROOF');
  validateSharedWebSourceBindingClaimsV1(value.claims);
}
function proofBytes(keyId: string, claims: SharedWebSourceBindingClaimsV1): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(canonicalSharedWebSync({schemaVersion:1,keyId,claims}));
}
/** Signing key is dedicated to this protocol. Never accept a key supplied in a Host payload. */
export async function signSharedWebSourceBindingV1(claims: SharedWebSourceBindingClaimsV1,
  keyId: string, privateKey: CryptoKey): Promise<SharedWebSourceBindingProofV1> {
  validateSharedWebSourceBindingClaimsV1(claims);
  if (!hash(keyId)) throw Error('INVALID_WEB_SOURCE_PROOF');
  const captured: SharedWebSourceBindingClaimsV1 = JSON.parse(canonicalSharedWebSync(claims));
  const signature = new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,proofBytes(keyId,captured)));
  if (signature.length !== 64) throw Error('INVALID_WEB_SOURCE_SIGNATURE');
  return {schemaVersion:1,keyId,claims:captured,signature:btoa(String.fromCharCode(...signature)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
}
export async function verifySharedWebSourceBindingV1(value: unknown, trustedKeyId: string, trustedPublicKey: CryptoKey,
  expected: Pick<SharedWebSourceBindingClaimsV1,'challengeId'|'connectionHash'|'applicationSourceKey'|'childScopeHash'|'assignmentVersion'>,
  nowMs: number): Promise<SharedWebSourceBindingClaimsV1> {
  validateSharedWebSourceBindingProofV1(value);
  const proof: SharedWebSourceBindingProofV1 = JSON.parse(canonicalSharedWebSync(value));
  const scope = {...expected};
  if (!exact(scope,['challengeId','connectionHash','applicationSourceKey','childScopeHash','assignmentVersion'])
    || ![scope.challengeId,scope.connectionHash,scope.applicationSourceKey,scope.childScopeHash].every(hash)
    || !ms(scope.assignmentVersion) || scope.assignmentVersion < 1
    || !ms(nowMs) || proof.keyId !== trustedKeyId || proof.claims.issuedAtMs > nowMs || proof.claims.expiresAtMs <= nowMs
    || Object.keys(scope).some(k => proof.claims[k as keyof SharedWebSourceBindingClaimsV1] !== scope[k as keyof typeof scope]))
    throw Error('WEB_SOURCE_PROOF_CONTEXT_CHANGED');
  const signature = Uint8Array.from(atob(proof.signature.replace(/-/g,'+').replace(/_/g,'/')+'=='),c=>c.charCodeAt(0));
  if (!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},trustedPublicKey,signature,proofBytes(proof.keyId,proof.claims)))
    throw Error('WEB_SOURCE_PROOF_SIGNATURE_INVALID');
  return proof.claims;
}

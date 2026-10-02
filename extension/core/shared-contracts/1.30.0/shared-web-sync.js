import { validateSharedAccessPolicyIdentityV1 } from './shared-access.js';
const record = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v, fields) => record(v)
    && Object.keys(v).length === fields.length && fields.every(k => Object.hasOwn(v, k));
const ms = (v) => Number.isSafeInteger(v) && Number(v) >= 0;
const opaque = (v) => typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(v);
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export function validateSharedWebDate(date) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
        || !Number.isFinite(Date.parse(date + 'T00:00:00Z'))
        || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date)
        throw Error('INVALID_WEB_CONTRIBUTION_DATE');
}
const fields = ['schemaVersion', 'date', 'revisionOrdinal', 'statisticsRevision', 'correctionRevision', 'policyIdentity',
    'computedAtMs', 'settledAtMs', 'activeMs', 'bucketsMs', 'otherMs', 'complete', 'reasonCodes', 'contentHash'];
export function validateSharedWebContributionUploadV1(value) {
    if (!exact(value, fields) || value.schemaVersion !== 1 || !ms(value.revisionOrdinal) || value.revisionOrdinal < 1
        || !opaque(value.statisticsRevision) || !opaque(value.correctionRevision) || !hash(value.contentHash)
        || !ms(value.computedAtMs) || !(value.settledAtMs === null || ms(value.settledAtMs) && value.settledAtMs <= value.computedAtMs)
        || !ms(value.activeMs) || value.activeMs > 86_400_000 || value.activeMs % 1000 !== 0
        || !exact(value.bucketsMs, ['study', 'composite', 'rest'])
        || !Object.values(value.bucketsMs).every(v => ms(v) && v % 1000 === 0)
        || !ms(value.otherMs) || value.otherMs % 1000 !== 0 || typeof value.complete !== 'boolean'
        || !Array.isArray(value.reasonCodes) || value.reasonCodes.length > 32
        || value.reasonCodes.some(v => typeof v !== 'string' || !/^[A-Z0-9_]{1,64}$/.test(v))
        || new Set(value.reasonCodes).size !== value.reasonCodes.length
        || value.complete && value.reasonCodes.length !== 0 || !value.complete && value.reasonCodes.length === 0)
        throw Error('INVALID_WEB_CONTRIBUTION');
    validateSharedWebDate(value.date);
    validateSharedAccessPolicyIdentityV1(value.policyIdentity);
    const accounted = Object.values(value.bucketsMs).reduce((sum, v) => sum + Number(v), 0) + value.otherMs;
    if (!Number.isSafeInteger(accounted) || accounted > value.activeMs || value.complete && accounted !== value.activeMs)
        throw Error('WEB_CONTRIBUTION_TOTAL_MISMATCH');
}
export const canonicalSharedWebSync = (value) => Array.isArray(value)
    ? `[${value.map(canonicalSharedWebSync).join(',')}]` : record(value)
    ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalSharedWebSync(value[k])}`).join(',')}}`
    : JSON.stringify(value);
/** Capture canonical bytes before awaiting; caller mutation cannot change the hash input. */
export async function sharedWebContributionHashV1(value) {
    const candidate = { ...value, contentHash: '0'.repeat(64) };
    validateSharedWebContributionUploadV1(candidate);
    const { contentHash: _ignored, ...body } = candidate;
    const bytes = new TextEncoder().encode(canonicalSharedWebSync(body));
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function verifySharedWebContributionV1(value) {
    validateSharedWebContributionUploadV1(value);
    const captured = JSON.parse(canonicalSharedWebSync(value));
    const { contentHash, ...body } = captured;
    if (await sharedWebContributionHashV1(body) !== contentHash)
        throw Error('WEB_CONTRIBUTION_HASH_MISMATCH');
    return captured;
}
/** Call only with server-derived or cloud-proof-verified sourceKey. No client authentication here. */
export function sharedWebExecutionSourceV1(upload, sourceKey) {
    validateSharedWebContributionUploadV1(upload);
    if (!/^web:[a-f0-9]{64}$/.test(sourceKey))
        throw Error('INVALID_WEB_SOURCE_KEY');
    const contribution = { schemaVersion: 1, source: 'web', sourceKey,
        date: upload.date, revision: upload.contentHash, statisticsRevision: upload.statisticsRevision,
        correctionRevision: upload.correctionRevision, policyRevision: upload.policyIdentity.revision,
        settledAtMs: upload.settledAtMs, complete: upload.complete, reasonCodes: [...upload.reasonCodes],
        bucketsMs: { ...upload.bucketsMs } };
    return { publicationRevision: `${upload.revisionOrdinal}:${upload.contentHash}`,
        revisionOrdinal: upload.revisionOrdinal, contribution };
}
export function validateSharedWebSourceBindingClaimsV1(value) {
    if (!exact(value, ['schemaVersion', 'audience', 'challengeId', 'connectionHash', 'applicationSourceKey', 'childScopeHash',
        'assignmentVersion', 'webSourceKey', 'issuedAtMs', 'expiresAtMs']) || value.schemaVersion !== 1
        || value.audience !== 'timeonchrome:shared-web-source:v1' || !hash(value.challengeId)
        || !hash(value.connectionHash) || !hash(value.applicationSourceKey) || !hash(value.childScopeHash)
        || !ms(value.assignmentVersion) || value.assignmentVersion < 1
        || typeof value.webSourceKey !== 'string' || !/^web:[a-f0-9]{64}$/.test(value.webSourceKey)
        || !ms(value.issuedAtMs) || !ms(value.expiresAtMs) || value.expiresAtMs <= value.issuedAtMs
        || value.expiresAtMs - value.issuedAtMs > 300_000)
        throw Error('INVALID_WEB_SOURCE_BINDING');
}
export function validateSharedWebSourceBindingProofV1(value) {
    if (!exact(value, ['schemaVersion', 'keyId', 'claims', 'signature']) || value.schemaVersion !== 1
        || !hash(value.keyId) || typeof value.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(value.signature))
        throw Error('INVALID_WEB_SOURCE_PROOF');
    validateSharedWebSourceBindingClaimsV1(value.claims);
}
function proofBytes(keyId, claims) {
    return new TextEncoder().encode(canonicalSharedWebSync({ schemaVersion: 1, keyId, claims }));
}
/** Signing key is dedicated to this protocol. Never accept a key supplied in a Host payload. */
export async function signSharedWebSourceBindingV1(claims, keyId, privateKey) {
    validateSharedWebSourceBindingClaimsV1(claims);
    if (!hash(keyId))
        throw Error('INVALID_WEB_SOURCE_PROOF');
    const captured = JSON.parse(canonicalSharedWebSync(claims));
    const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, proofBytes(keyId, captured)));
    if (signature.length !== 64)
        throw Error('INVALID_WEB_SOURCE_SIGNATURE');
    return { schemaVersion: 1, keyId, claims: captured, signature: btoa(String.fromCharCode(...signature)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') };
}
export async function verifySharedWebSourceBindingV1(value, trustedKeyId, trustedPublicKey, expected, nowMs) {
    validateSharedWebSourceBindingProofV1(value);
    const proof = JSON.parse(canonicalSharedWebSync(value));
    const scope = { ...expected };
    if (!exact(scope, ['challengeId', 'connectionHash', 'applicationSourceKey', 'childScopeHash', 'assignmentVersion'])
        || ![scope.challengeId, scope.connectionHash, scope.applicationSourceKey, scope.childScopeHash].every(hash)
        || !ms(scope.assignmentVersion) || scope.assignmentVersion < 1
        || !ms(nowMs) || proof.keyId !== trustedKeyId || proof.claims.issuedAtMs > nowMs || proof.claims.expiresAtMs <= nowMs
        || Object.keys(scope).some(k => proof.claims[k] !== scope[k]))
        throw Error('WEB_SOURCE_PROOF_CONTEXT_CHANGED');
    const signature = Uint8Array.from(atob(proof.signature.replace(/-/g, '+').replace(/_/g, '/') + '=='), c => c.charCodeAt(0));
    if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, trustedPublicKey, signature, proofBytes(proof.keyId, proof.claims)))
        throw Error('WEB_SOURCE_PROOF_SIGNATURE_INVALID');
    return proof.claims;
}

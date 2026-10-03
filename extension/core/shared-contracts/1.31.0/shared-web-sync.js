import { validateSharedAccessPolicyIdentityV1 } from './shared-access.js';
/** Read-model identity only; a digest never grants source authority or an execution permit. */
export async function sharedQuotaExecutionIdentityV1(value) {
    if (!exact(value, ['schemaVersion', 'basisRevision', 'policyIdentity', 'projection', 'transportStatus',
        'replacementVersions', 'reasonCodes', 'executionEnabled']) || value.schemaVersion !== 1
        || value.executionEnabled !== false || !['online', 'offline'].includes(value.transportStatus)
        || !Array.isArray(value.reasonCodes) || value.reasonCodes.length !== 0
        || typeof value.basisRevision !== 'string' || !/^[a-f0-9]{64}$/.test(value.basisRevision)
        || !Array.isArray(value.replacementVersions) || value.replacementVersions.length > 1400)
        throw new Error('EXECUTION_IDENTITY_UNAVAILABLE');
    validateSharedAccessPolicyIdentityV1(value.policyIdentity);
    const projection = value.projection;
    if (!exact(projection, ['basisRevision', 'policyRevision', 'complete', 'reasonCodes', 'days', 'week'])
        || projection.basisRevision !== value.basisRevision || projection.policyRevision !== value.policyIdentity.revision
        || projection.complete !== true || !Array.isArray(projection.reasonCodes) || projection.reasonCodes.length !== 0
        || !Array.isArray(projection.days) || projection.days.length < 1 || projection.days.length > 7
        || !exact(projection.week, ['fromDate', 'toDate', 'restUsedMs', 'restRemainingMs']))
        throw new Error('EXECUTION_IDENTITY_UNAVAILABLE');
    validateSharedWebDate(projection.week.fromDate);
    validateSharedWebDate(projection.week.toDate);
    const from = Date.parse(projection.week.fromDate + 'T00:00:00Z');
    if (new Date(from).getUTCDay() !== 1
        || Date.parse(projection.week.toDate + 'T00:00:00Z') !== from + (projection.days.length - 1) * 86400000)
        throw new Error('EXECUTION_IDENTITY_INVALID_PERIOD');
    let rest = 0;
    for (let index = 0; index < projection.days.length; index++) {
        const day = projection.days[index];
        if (!exact(day, ['date', 'complete', 'reasonCodes', 'usedMs', 'remainingMs', 'borrowedRestMs'])
            || day.date !== new Date(from + index * 86400000).toISOString().slice(0, 10)
            || day.complete !== true || !Array.isArray(day.reasonCodes) || day.reasonCodes.length !== 0
            || !exact(day.usedMs, ['study', 'composite', 'rest']) || !Object.values(day.usedMs).every(ms)
            || !exact(day.remainingMs, ['study', 'composite', 'rest'])
            || !Object.values(day.remainingMs).every(amount => amount === null || ms(amount))
            || !ms(day.borrowedRestMs) || day.borrowedRestMs > Number(day.usedMs.rest))
            throw new Error('EXECUTION_IDENTITY_INVALID_PROJECTION');
        rest += Number(day.usedMs.rest);
    }
    if (!ms(rest) || projection.week.restUsedMs !== rest
        || !(projection.week.restRemainingMs === null || ms(projection.week.restRemainingMs)))
        throw new Error('EXECUTION_IDENTITY_INVALID_PROJECTION');
    const scopes = new Set();
    for (const item of value.replacementVersions) {
        if (!exact(item, ['source', 'sourceKey', 'date', 'revisionOrdinal', 'contentRevision'])
            || !['web', 'application'].includes(String(item.source))
            || !opaque(item.sourceKey) || !opaque(item.contentRevision) || !ms(item.revisionOrdinal) || item.revisionOrdinal < 1)
            throw new Error('EXECUTION_IDENTITY_INVALID_REPLACEMENT');
        validateSharedWebDate(item.date);
        if (item.date < projection.week.fromDate || item.date > projection.week.toDate)
            throw new Error('EXECUTION_IDENTITY_INVALID_PERIOD');
        const scope = `${item.date}\0${item.source}\0${item.sourceKey}`;
        if (scopes.has(scope))
            throw new Error('EXECUTION_IDENTITY_DUPLICATE_SCOPE');
        scopes.add(scope);
    }
    const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
    const replacements = [...value.replacementVersions].sort((a, b) => compare(a.date, b.date)
        || compare(a.source, b.source) || compare(a.sourceKey, b.sourceKey));
    // Capture the complete input before the first await: subsequent caller mutation is irrelevant.
    const bytes = new TextEncoder().encode(canonicalSharedWebSync({ schemaVersion: 1,
        policyIdentity: value.policyIdentity, basisRevision: value.basisRevision, projection, replacementVersions: replacements }));
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}
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
/** Authorizes only local replacement in the already verified scope, never cloud requests or execution. */
export function sharedWebLocalLeaseCurrentV1(lease, current) {
    try {
        if (!exact(lease, ['schemaVersion', 'scopeRevision', 'policyIdentity', 'claims', 'verifiedAtMs'])
            || lease.schemaVersion !== 1 || !hash(lease.scopeRevision)
            || !exact(current, ['scopeRevision', 'policyIdentity', 'connectionLive', 'capabilityNegotiated', 'nowMs'])
            || current.connectionLive !== true || current.capabilityNegotiated !== true
            || current.scopeRevision !== lease.scopeRevision || !ms(current.nowMs) || !ms(lease.verifiedAtMs))
            return false;
        validateSharedAccessPolicyIdentityV1(lease.policyIdentity);
        validateSharedAccessPolicyIdentityV1(current.policyIdentity);
        validateSharedWebSourceBindingClaimsV1(lease.claims);
        return lease.verifiedAtMs >= lease.claims.issuedAtMs && lease.verifiedAtMs < lease.claims.expiresAtMs
            && current.nowMs >= lease.verifiedAtMs
            && canonicalSharedWebSync(current.policyIdentity) === canonicalSharedWebSync(lease.policyIdentity);
    }
    catch {
        return false;
    }
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
export const SHARED_WEB_REUSABLE_CAPABILITY = 'shared-web-source-reusable-v2';
export function validateSharedWebReusableClaimsV2(value, audience) {
    const web = audience === 'timeonchrome:shared-web-source:v2';
    if (!exact(value, ['schemaVersion', 'audience', 'applicationSourceKey', 'childScopeHash', 'assignmentVersion',
        'issuedAtMs', 'expiresAtMs', ...(web ? ['webSourceKey', 'bindingEpochHash'] : [])])
        || value.schemaVersion !== 2 || value.audience !== audience || !hash(value.applicationSourceKey)
        || !hash(value.childScopeHash) || !ms(value.assignmentVersion) || value.assignmentVersion < 1
        || !ms(value.issuedAtMs) || !ms(value.expiresAtMs) || value.expiresAtMs <= value.issuedAtMs
        || value.expiresAtMs - value.issuedAtMs > 300_000
        || web && (!hash(value.bindingEpochHash) || typeof value.webSourceKey !== 'string'
            || !/^web:[a-f0-9]{64}$/.test(value.webSourceKey)))
        throw Error('INVALID_WEB_SOURCE_BINDING');
}
export function validateSharedWebReusableProofV2(value, audience) {
    if (!exact(value, ['schemaVersion', 'keyId', 'claims', 'signature']) || value.schemaVersion !== 2
        || !hash(value.keyId) || typeof value.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(value.signature))
        throw Error('INVALID_WEB_SOURCE_PROOF');
    validateSharedWebReusableClaimsV2(value.claims, audience);
}
function reusableBytes(keyId, claims) {
    return new TextEncoder().encode(canonicalSharedWebSync({ schemaVersion: 2, keyId, claims }));
}
export async function signSharedWebReusableProofV2(claims, keyId, privateKey) {
    validateSharedWebReusableClaimsV2(claims, claims.audience);
    if (!hash(keyId))
        throw Error('INVALID_WEB_SOURCE_KEY');
    const captured = JSON.parse(canonicalSharedWebSync(claims));
    const bytes = reusableBytes(keyId, captured);
    const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, bytes));
    if (signature.length !== 64)
        throw Error('INVALID_WEB_SOURCE_SIGNATURE');
    return { schemaVersion: 2, keyId, claims: captured, signature: btoa(String.fromCharCode(...signature))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') };
}
export async function verifySharedWebReusableProofV2(value, trustedKeyId, trustedPublicKey, expected, audience, nowMs) {
    validateSharedWebReusableProofV2(value, audience);
    const proof = JSON.parse(canonicalSharedWebSync(value));
    const scope = { ...expected };
    if (!exact(scope, ['applicationSourceKey', 'childScopeHash', 'assignmentVersion']) || !hash(scope.applicationSourceKey)
        || !hash(scope.childScopeHash) || !ms(scope.assignmentVersion) || scope.assignmentVersion < 1 || !ms(nowMs))
        throw Error('INVALID_WEB_SOURCE_SCOPE');
    if (proof.keyId !== trustedKeyId)
        throw Error('INVALID_WEB_SOURCE_KEY');
    if (proof.claims.issuedAtMs > nowMs || proof.claims.expiresAtMs <= nowMs)
        throw Error('WEB_SOURCE_PROOF_EXPIRED');
    if (proof.claims.applicationSourceKey !== scope.applicationSourceKey || proof.claims.childScopeHash !== scope.childScopeHash
        || proof.claims.assignmentVersion !== scope.assignmentVersion)
        throw Error('WEB_SOURCE_SCOPE_MISMATCH');
    const bytes = reusableBytes(proof.keyId, proof.claims);
    const signature = Uint8Array.from(atob(proof.signature.replace(/-/g, '+').replace(/_/g, '/') + '=='), c => c.charCodeAt(0));
    if (btoa(String.fromCharCode(...signature)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== proof.signature
        || !await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, trustedPublicKey, signature, bytes))
        throw Error('WEB_SOURCE_PROOF_SIGNATURE_INVALID');
    return proof.claims;
}

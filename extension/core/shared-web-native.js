import { validateSharedWebSourceBindingProofV1, verifySharedWebContributionV1 } from './shared-contracts/1.30.0/shared-web-sync.js';
import { validateSharedAccessPolicyIdentityV1 } from './shared-quota-state.js';

const exact = (v, keys) => v && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const ms = v => Number.isSafeInteger(v) && v >= 0;
const reasons = v => Array.isArray(v) && v.length <= 32 && new Set(v).size === v.length && v.every(k => typeof k === 'string' && /^[A-Z0-9_]{1,64}$/.test(k));
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
export function captureSharedQuotaPreparation(value, expected) {
  if (!exact(value, ['schemaVersion', 'basisRevision', 'policyIdentity', 'projection', 'transportStatus', 'replacementVersions', 'reasonCodes', 'executionEnabled'])
    || value.schemaVersion !== 1 || value.executionEnabled !== false || !['online', 'offline', 'unavailable'].includes(value.transportStatus)
    || !(value.basisRevision === null || hash(value.basisRevision)) || !reasons(value.reasonCodes)
    || !Array.isArray(value.replacementVersions) || value.replacementVersions.length > 1400) throw Error('shared_web_invalid_preparation');
  if (value.policyIdentity !== null && (!validateSharedAccessPolicyIdentityV1(value.policyIdentity).ok || value.policyIdentity.revision !== expected.policyRevision)) throw Error('shared_web_invalid_preparation');
  const seen = new Set();
  for (const r of value.replacementVersions) {
    const key = JSON.stringify([r.source, r.sourceKey, r.date]);
    if (!exact(r, ['source', 'sourceKey', 'date', 'revisionOrdinal', 'contentRevision']) || !['web', 'application'].includes(r.source)
      || typeof r.sourceKey !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(r.sourceKey) || !date(r.date)
      || r.date < expected.weekStart || r.date > expected.date || !ms(r.revisionOrdinal) || r.revisionOrdinal < 1
      || typeof r.contentRevision !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(r.contentRevision) || seen.has(key)) throw Error('shared_web_invalid_preparation');
    seen.add(key);
  }
  const p = value.projection;
  if (p !== null) {
    if (!exact(p, ['basisRevision', 'policyRevision', 'complete', 'reasonCodes', 'days', 'week']) || p.basisRevision !== value.basisRevision
      || p.policyRevision !== expected.policyRevision || typeof p.complete !== 'boolean' || !reasons(p.reasonCodes)
      || p.complete && (p.reasonCodes.length || value.reasonCodes.length) || !Array.isArray(p.days)
      || !exact(p.week, ['fromDate', 'toDate', 'restUsedMs', 'restRemainingMs']) || p.week.fromDate !== expected.weekStart
      || p.week.toDate !== expected.date || !ms(p.week.restUsedMs) || !(p.week.restRemainingMs === null || ms(p.week.restRemainingMs))) throw Error('shared_web_invalid_preparation');
    const count = (Date.parse(expected.date) - Date.parse(expected.weekStart)) / 86400000 + 1;
    if (p.days.length !== count || count < 1 || count > 7 || value.policyIdentity === null) throw Error('shared_web_invalid_preparation');
    let rest = 0;
    for (let i = 0; i < count; i++) {
      const d = p.days[i], wanted = new Date(Date.parse(expected.weekStart) + i * 86400000).toISOString().slice(0, 10);
      if (!exact(d, ['date', 'complete', 'reasonCodes', 'usedMs', 'remainingMs', 'borrowedRestMs']) || d.date !== wanted
        || typeof d.complete !== 'boolean' || !reasons(d.reasonCodes) || d.complete && d.reasonCodes.length
        || !exact(d.usedMs, ['study', 'composite', 'rest']) || !Object.values(d.usedMs).every(ms)
        || !exact(d.remainingMs, ['study', 'composite', 'rest']) || !Object.values(d.remainingMs).every(v => v === null || ms(v))
        || !ms(d.borrowedRestMs)) throw Error('shared_web_invalid_preparation');
      rest += d.usedMs.rest;
    }
    if (!ms(rest) || rest !== p.week.restUsedMs || p.complete && p.days.some(d => !d.complete)) throw Error('shared_web_invalid_preparation');
  } else if (value.basisRevision !== null || value.replacementVersions.length) throw Error('shared_web_invalid_preparation');
  return JSON.parse(JSON.stringify(value));
}
export async function captureSharedWebNativeRequest(method, value) {
  if (method === 'getSharedWebSourceChallenge') {
    if (!exact(value, [])) throw Error('shared_web_invalid_request');
  } else if (method === 'bindSharedWebSource') {
    if (!exact(value, ['proof'])) throw Error('shared_web_invalid_request');
    validateSharedWebSourceBindingProofV1(value.proof);
  } else if (method === 'replaceSharedWebContribution') {
    if (!exact(value, ['challengeId', 'upload']) || !hash(value.challengeId)) throw Error('shared_web_invalid_request');
    return { challengeId: value.challengeId, upload: await verifySharedWebContributionV1(value.upload) };
  } else throw Error('shared_web_unsupported');
  return JSON.parse(JSON.stringify(value));
}
export function captureSharedWebNativeReceipt(method, ack, request, now) {
  if (method === 'getSharedWebSourceChallenge') {
    const r = ack.sharedWebSourceChallenge;
    if (!exact(r, ['schemaVersion', 'challengeId', 'connectionHash', 'expiresAtMs']) || r.schemaVersion !== 1
      || !hash(r.challengeId) || !hash(r.connectionHash) || !ms(r.expiresAtMs) || r.expiresAtMs <= now) throw Error('shared_web_invalid_receipt');
    return { ...r };
  }
  if (method === 'bindSharedWebSource') {
    const r = ack.sharedWebSourceBound, c = request.proof.claims;
    if (!exact(r, ['challengeId', 'webSourceKey', 'expiresAtMs']) || r.challengeId !== c.challengeId
      || r.webSourceKey !== c.webSourceKey || r.expiresAtMs !== c.expiresAtMs || r.expiresAtMs <= now) throw Error('shared_web_invalid_receipt');
    return { ...r };
  }
  const r = ack.sharedWebContributionAccepted, u = request.upload;
  if (!exact(r, ['date', 'revisionOrdinal', 'contentHash', 'duplicate']) || r.date !== u.date
    || r.revisionOrdinal !== u.revisionOrdinal || r.contentHash !== u.contentHash || typeof r.duplicate !== 'boolean') throw Error('shared_web_invalid_receipt');
  return { ...r };
}

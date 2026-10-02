import { matchesSharedAccessPolicyIdentityV1, type UnifiedChildAccessPolicyV1 } from '@timeonchrome/app-runtime-contracts/shared-access';
import { verifySharedWebContributionV1, sharedWebExecutionSourceV1, validateSharedWebDate,
  type SharedWebContributionWatermarkV1, type SharedWebContributionAckV1,
  type SharedWebContributionUploadV1 } from '@timeonchrome/app-runtime-contracts/shared-web-sync';
import type { Env } from '../db/middleware';
// Exact existing Guardian web-source derivation, independent of the read-model module to avoid a runtime cycle.
const sharedWebSourceKey = async (accountId:string,deviceId:string) => 'web:' +
  [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${accountId}\n${deviceId}`)))]
    .map(b=>b.toString(16).padStart(2,'0')).join('');

/** Captured DeviceBearer identity. Never constructed from upload fields. */
export interface SharedWebAuthenticatedScope { accountId: string; childId: string; deviceId: string; deviceToken: string }
type Head = { revision_ordinal: number; content_hash: string };
const currentScope = `EXISTS(SELECT 1 FROM devices d JOIN profiles p ON p.id=d.profile_id
  WHERE d.id=? AND d.profile_id=? AND p.account_id=? AND d.device_token=? AND COALESCE(d.status,'bound')='bound')`;
const scopeArgs = (s: SharedWebAuthenticatedScope) => [s.deviceId, s.childId, s.accountId, s.deviceToken];
const keys = (s: SharedWebAuthenticatedScope, date: string) => [s.accountId, s.childId, s.deviceId, date];

export async function readSharedWebWatermark(env: Env, scope: SharedWebAuthenticatedScope, date: string): Promise<SharedWebContributionWatermarkV1> {
  validateSharedWebDate(date);
  const active = await env.DB.prepare(`SELECT 1 AS active WHERE ${currentScope}`).bind(...scopeArgs(scope)).first();
  if (!active) throw Error('SHARED_ACCESS_BINDING_CHANGED');
  const head = await env.DB.prepare(`SELECT revision_ordinal,content_hash FROM shared_web_contribution_heads_v1
    WHERE account_id=? AND profile_id=? AND device_id=? AND date=?`).bind(...keys(scope,date)).first<Head>();
  return { schemaVersion: 1, sourceKey: await sharedWebSourceKey(scope.accountId,scope.deviceId), date,
    revisionOrdinal: head?.revision_ordinal ?? 0, contentHash: head?.content_hash ?? null,
    publicationRevision: head ? `${head.revision_ordinal}:${head.content_hash}` : null };
}

export async function publishSharedWebContribution(env: Env, scope: SharedWebAuthenticatedScope, input: unknown,
  policy: UnifiedChildAccessPolicyV1, now = Date.now()): Promise<SharedWebContributionAckV1> {
  const upload = await verifySharedWebContributionV1(input);
  if (upload.computedAtMs > now || upload.date > new Date(now + 28_800_000).toISOString().slice(0,10))
    throw Error('WEB_CONTRIBUTION_FROM_FUTURE');
  if (!await matchesSharedAccessPolicyIdentityV1(policy,upload.policyIdentity)) throw Error('SHARED_ACCESS_POLICY_CHANGED');
  const before = await readSharedWebWatermark(env,scope,upload.date);
  // A lost ACK may be retried after a newer revision. Exact receipt content is still checked.
  const previous = await env.DB.prepare(`SELECT content_hash FROM shared_web_contribution_receipts_v1
    WHERE account_id=? AND profile_id=? AND device_id=? AND date=? AND revision_ordinal=?`)
    .bind(...keys(scope,upload.date),upload.revisionOrdinal).first<{content_hash:string}>();
  if (previous && previous.content_hash !== upload.contentHash) throw Error('WEB_CONTRIBUTION_REVISION_CONFLICT');
  if (upload.revisionOrdinal < before.revisionOrdinal) return { ...before, status: 'stale', submittedRevisionOrdinal: upload.revisionOrdinal };
  if (upload.revisionOrdinal === before.revisionOrdinal) {
    if (upload.contentHash !== before.contentHash) throw Error('WEB_CONTRIBUTION_REVISION_CONFLICT');
    return { ...before, status: 'duplicate', submittedRevisionOrdinal: upload.revisionOrdinal };
  }
  // D1 batch is atomic. Both writes verify the captured binding inside SQL, not only before awaiting.
  // Concurrent same-ordinal different-content inserts cannot mutate a receipt or advance the head.
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO shared_web_contribution_receipts_v1
      (account_id,profile_id,device_id,date,revision_ordinal,content_hash,payload_json,received_at)
      SELECT ?,?,?,?,?,?,?,? WHERE ${currentScope}
      ON CONFLICT(account_id,profile_id,device_id,date,revision_ordinal) DO NOTHING`)
      .bind(...keys(scope,upload.date),upload.revisionOrdinal,upload.contentHash,JSON.stringify(upload),now,...scopeArgs(scope)),
    env.DB.prepare(`INSERT INTO shared_web_contribution_heads_v1
      (account_id,profile_id,device_id,date,revision_ordinal,content_hash,updated_at)
      SELECT account_id,profile_id,device_id,date,revision_ordinal,content_hash,? FROM shared_web_contribution_receipts_v1
      WHERE account_id=? AND profile_id=? AND device_id=? AND date=? AND revision_ordinal=? AND content_hash=? AND ${currentScope}
      ON CONFLICT(account_id,profile_id,device_id,date) DO UPDATE SET revision_ordinal=excluded.revision_ordinal,
        content_hash=excluded.content_hash,updated_at=excluded.updated_at
      WHERE excluded.revision_ordinal>shared_web_contribution_heads_v1.revision_ordinal`)
      .bind(now,...keys(scope,upload.date),upload.revisionOrdinal,upload.contentHash,...scopeArgs(scope)),
  ]);
  const receipt = await env.DB.prepare(`SELECT content_hash FROM shared_web_contribution_receipts_v1
    WHERE account_id=? AND profile_id=? AND device_id=? AND date=? AND revision_ordinal=?`)
    .bind(...keys(scope,upload.date),upload.revisionOrdinal).first<{content_hash:string}>();
  if (receipt && receipt.content_hash !== upload.contentHash) throw Error('WEB_CONTRIBUTION_REVISION_CONFLICT');
  const current = await readSharedWebWatermark(env,scope,upload.date);
  if (!receipt || current.revisionOrdinal < upload.revisionOrdinal) throw Error('SHARED_ACCESS_BINDING_CHANGED');
  return { ...current, status: current.revisionOrdinal === upload.revisionOrdinal ? 'accepted' : 'stale',
    submittedRevisionOrdinal: upload.revisionOrdinal };
}

/** Persisted derived snapshots only; no Segment or original manifest reads. */
export async function readPublishedSharedWebContribution(env: Env, accountId: string, childId: string, deviceId: string,
  date: string, policy: UnifiedChildAccessPolicyV1) {
  const row = await env.DB.prepare(`SELECT r.payload_json FROM shared_web_contribution_heads_v1 h
    JOIN shared_web_contribution_receipts_v1 r ON r.account_id=h.account_id AND r.profile_id=h.profile_id
      AND r.device_id=h.device_id AND r.date=h.date AND r.revision_ordinal=h.revision_ordinal AND r.content_hash=h.content_hash
    WHERE h.account_id=? AND h.profile_id=? AND h.device_id=? AND h.date=?`).bind(accountId,childId,deviceId,date).first<{payload_json:string}>();
  if (!row) return null;
  const upload: SharedWebContributionUploadV1 = await verifySharedWebContributionV1(JSON.parse(row.payload_json));
  const source = sharedWebExecutionSourceV1(upload,await sharedWebSourceKey(accountId,deviceId));
  if (!await matchesSharedAccessPolicyIdentityV1(policy,upload.policyIdentity)) {
    source.contribution = { ...source.contribution, policyRevision: policy.revision, complete: false,
      reasonCodes: [...new Set([...source.contribution.reasonCodes,'SHARED_ACCESS_POLICY_CHANGED'])].sort() };
  }
  return source;
}

export async function readSharedWebJson(request: Pick<Request,'body'>, limit = 16_384): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw Error('INVALID_WEB_CONTRIBUTION');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > limit) { await reader.cancel(); throw Error('WEB_CONTRIBUTION_BODY_TOO_LARGE'); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
    catch { throw Error('INVALID_WEB_CONTRIBUTION'); }
  } finally { reader.releaseLock(); }
}

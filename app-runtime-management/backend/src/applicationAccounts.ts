import { canonicalUsageAccountJson, hashUsageAccountValue, parseUsageAccountRows,
  verifyUsageAccountManifest, validateUsageAccountDimensions, UsageAccountError,
  USAGE_ACCOUNT_CHUNK_ROWS, USAGE_ACCOUNT_MAX_ROWS, type UsageAccountManifest, type UsageAccountReceipt } from '@timeonchrome/app-runtime-contracts/usage-account';
import type { MachineSelfResponse } from './contracts';
import { HttpError, jsonResponse, methodNotAllowed, readJsonBody } from './http';
import { isRecord } from './validation';

const prefix = '/v2/machines/application-accounts/manifests';
const categories = new Set(['study','composite','restrictedEntertainment','unclassified','blocked','historicalUnknown']);
interface StoredManifest {
  id: string; machine_id: string; local_user_id: string; assignment_version: number;
  account_id: string; child_id: string; date: string; revision: number;
  manifest_hash: string; manifest_json: string; state: 'pending' | 'received';
  published?: number;
  publication_error_code?: string|null;
}
function fail(status: number, code: string): never { throw new HttpError(status, code, code); }
function body(value: unknown, fields: string[]): Record<string, unknown> {
  if (!isRecord(value)
    || Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key)))
    fail(400, 'APPLICATION_ACCOUNT_INVALID_FIELDS');
  return value;
}
function receipt(stored: StoredManifest): UsageAccountReceipt {
  return { manifestId: stored.id, revision: stored.revision, manifestHash: stored.manifest_hash,
    received: stored.state === 'received', published: stored.published === 1,
    publishStatus: stored.published === 1 ? 'published' : stored.state === 'received' ? 'received_not_published' : 'pending' };
}
async function load(db: D1Database, machine: MachineSelfResponse, id: string): Promise<StoredManifest> {
  if (!/^aa1_[a-f0-9]{64}$/.test(id)) fail(404, 'APPLICATION_ACCOUNT_NOT_FOUND');
  const stored = await db.prepare(`SELECT m.*,CASE WHEN p.manifest_id=m.id THEN 1 ELSE 0 END AS published,
      c.error_code AS publication_error_code FROM runtime_application_account_manifests_v1 m
      LEFT JOIN runtime_application_account_publications_v1 p ON p.machine_id=m.machine_id AND p.local_user_id=m.local_user_id
        AND p.assignment_version=m.assignment_version AND p.date=m.date
      LEFT JOIN runtime_application_account_publication_checks_v1 c ON c.manifest_id=m.id
    WHERE m.id=?1 AND m.machine_id=?2 AND m.account_id=?3`)
    .bind(id, machine.machineId, machine.accountId).first<StoredManifest>();
  if (!stored) fail(404, 'APPLICATION_ACCOUNT_NOT_FOUND');
  return stored;
}
async function checkPolicies(db: D1Database, machine: MachineSelfResponse, child: string, manifest: UsageAccountManifest) {
  const versions = manifest.policyVersions.filter(v => v !== 0);
  // 查询有界；不加载历史策略 payload，也不把存在性当成分类正确性的证明。
  for (let start = 0; start < versions.length; start += 50) {
    const group = versions.slice(start, start + 50);
    const result = await db.prepare(`SELECT version FROM runtime_child_app_policy_versions_v1
      WHERE account_id=?1 AND child_id=?2 AND version IN (${group.map((_, i) => `?${i + 3}`).join(',')})`)
      .bind(machine.accountId, child, ...group).all<{ version: number }>();
    if (result.results.length !== group.length) fail(409, 'APPLICATION_ACCOUNT_UNKNOWN_POLICY_VERSION');
  }
}
export async function beginApplicationAccount(db: D1Database, machine: MachineSelfResponse, value: unknown, now: number) {
  const v = body(value, ['localUserId','assignmentVersion','manifest']);
  if (typeof v.localUserId !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(v.localUserId)
    || typeof v.assignmentVersion !== 'number' || !Number.isSafeInteger(v.assignmentVersion) || v.assignmentVersion < 1)
    fail(400, 'APPLICATION_ACCOUNT_INVALID_SCOPE');
  const manifest = await verifyUsageAccountManifest(v.manifest);
  if (manifest.sourceKind !== 'application' || manifest.generatedAtMs > now + 300000)
    fail(400, 'APPLICATION_ACCOUNT_INVALID_SOURCE');
  const assignment = await db.prepare(`SELECT child_id FROM runtime_user_assignments_v2
    WHERE machine_id=?1 AND local_user_id=?2 AND assignment_version=?3 AND protected=1 AND child_id IS NOT NULL`)
    .bind(machine.machineId, v.localUserId, v.assignmentVersion).first<{ child_id: string }>();
  if (!assignment) fail(403, 'APPLICATION_ACCOUNT_ASSIGNMENT_UNAVAILABLE');
  await checkPolicies(db, machine, assignment.child_id, manifest);
  const id = 'aa1_' + await hashUsageAccountValue([machine.machineId, v.localUserId, v.assignmentVersion, manifest.date, manifest.revision]);
  const scope = [machine.machineId, v.localUserId, v.assignmentVersion, manifest.date];
  // 条件 INSERT 保证并发新水位不能被旧的开始请求绕过；同版本只允许相同 hash。
  await db.prepare(`INSERT INTO runtime_application_account_manifests_v1
    (id,machine_id,local_user_id,assignment_version,account_id,child_id,date,revision,manifest_hash,manifest_json,created_at_ms)
    SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11 WHERE NOT EXISTS
      (SELECT 1 FROM runtime_application_account_receipts_v1 WHERE machine_id=?2 AND local_user_id=?3
       AND assignment_version=?4 AND date=?7 AND revision>?8)
    ON CONFLICT(machine_id,local_user_id,assignment_version,date,revision) DO NOTHING`)
    .bind(id, ...scope.slice(0, 3), machine.accountId, assignment.child_id, manifest.date, manifest.revision,
      manifest.manifestHash, canonicalUsageAccountJson(manifest), now).run();
  const stored = await db.prepare('SELECT * FROM runtime_application_account_manifests_v1 WHERE id=?1').bind(id).first<StoredManifest>();
  if (!stored) fail(409, 'APPLICATION_ACCOUNT_STALE_REVISION');
  if (stored.manifest_hash !== manifest.manifestHash) fail(409, 'APPLICATION_ACCOUNT_REVISION_CONFLICT');
  return receipt(await load(db,machine,id));
}
export async function putApplicationAccountChunk(db: D1Database, machine: MachineSelfResponse, id: string, index: number, value: unknown) {
  const stored = await load(db, machine, id), manifest = await verifyUsageAccountManifest(JSON.parse(stored.manifest_json));
  const v = body(value, ['rows','chunkHash']);
  if (!Number.isSafeInteger(index) || index < 0 || index >= manifest.chunkCount) fail(400, 'APPLICATION_ACCOUNT_INVALID_CHUNK_INDEX');
  const rows = parseUsageAccountRows(v.rows, USAGE_ACCOUNT_CHUNK_ROWS);
  const expectedCount = Math.min(USAGE_ACCOUNT_CHUNK_ROWS, manifest.rowCount - index * USAGE_ACCOUNT_CHUNK_ROWS);
  if (rows.length !== expectedCount) fail(400, 'APPLICATION_ACCOUNT_CHUNK_COUNT_MISMATCH');
  if (rows.some(r => r.kind === 'category' && !categories.has(r.category!))) fail(400, 'APPLICATION_ACCOUNT_INVALID_CATEGORY');
  const hash = await hashUsageAccountValue(rows);
  if (v.chunkHash !== hash) fail(400, 'APPLICATION_ACCOUNT_CHUNK_HASH_MISMATCH');
  await db.prepare(`INSERT INTO runtime_application_account_chunks_v1(manifest_id,chunk_index,chunk_hash,rows_json)
    SELECT ?1,?2,?3,?4 WHERE EXISTS (SELECT 1 FROM runtime_application_account_manifests_v1 WHERE id=?1 AND state='pending')
    ON CONFLICT(manifest_id,chunk_index) DO NOTHING`)
    .bind(id, index, hash, canonicalUsageAccountJson(rows)).run();
  const existing = await db.prepare(`SELECT chunk_hash FROM runtime_application_account_chunks_v1 WHERE manifest_id=?1 AND chunk_index=?2`)
    .bind(id, index).first<{ chunk_hash: string }>();
  if (!existing || existing.chunk_hash !== hash) fail(409, 'APPLICATION_ACCOUNT_CHUNK_CONFLICT');
  return { manifestId: id, chunkIndex: index, chunkHash: hash, received: true, published: false };
}
export async function commitApplicationAccount(db: D1Database, machine: MachineSelfResponse, id: string, now: number) {
  const stored = await load(db, machine, id);
  if (stored.state === 'received') return receipt(stored);
  const manifest = await verifyUsageAccountManifest(JSON.parse(stored.manifest_json));
  const chunks = await db.prepare(`SELECT chunk_index,rows_json FROM runtime_application_account_chunks_v1
    WHERE manifest_id=?1 ORDER BY chunk_index LIMIT 100`).bind(id).all<{ chunk_index: number; rows_json: string }>();
  if (chunks.results.length !== manifest.chunkCount || chunks.results.some((c, i) => c.chunk_index !== i))
    fail(409, 'APPLICATION_ACCOUNT_CHUNKS_MISSING');
  const rows = parseUsageAccountRows(chunks.results.flatMap(c => JSON.parse(c.rows_json)));
  if (rows.length !== manifest.rowCount || await hashUsageAccountValue(rows) !== manifest.rowsHash)
    fail(409, 'APPLICATION_ACCOUNT_ROWS_HASH_MISMATCH');
  validateUsageAccountDimensions(rows);
  await checkPolicies(db, machine, stored.child_id, manifest);
  // D1 batch 原子提交接收状态和水位；不存在发布头，不能用于配额或页面。
  await db.batch([
    db.prepare(`UPDATE runtime_application_account_manifests_v1 SET state='received',received_at_ms=?2
      WHERE id=?1 AND state='pending' AND NOT EXISTS
        (SELECT 1 FROM runtime_application_account_receipts_v1 r WHERE r.machine_id=?3 AND r.local_user_id=?4
         AND r.assignment_version=?5 AND r.date=?6 AND r.revision>?7)`)
      .bind(id, now, stored.machine_id, stored.local_user_id, stored.assignment_version, stored.date, stored.revision),
    db.prepare(`INSERT INTO runtime_application_account_receipts_v1
      (machine_id,local_user_id,assignment_version,date,revision,manifest_id,received_at_ms)
      SELECT machine_id,local_user_id,assignment_version,date,revision,id,received_at_ms
      FROM runtime_application_account_manifests_v1 WHERE id=?1 AND state='received'
      ON CONFLICT(machine_id,local_user_id,assignment_version,date) DO UPDATE
      SET revision=excluded.revision,manifest_id=excluded.manifest_id,received_at_ms=excluded.received_at_ms
      WHERE excluded.revision>runtime_application_account_receipts_v1.revision`).bind(id),
  ]);
  const final = await load(db, machine, id);
  if (final.state !== 'received') fail(409, 'APPLICATION_ACCOUNT_STALE_REVISION');
  return receipt(final);
}
export async function readApplicationAccountStatus(db: D1Database, machine: MachineSelfResponse, id: string) {
  const stored = await load(db, machine, id);
  const chunks = await db.prepare(`SELECT chunk_index FROM runtime_application_account_chunks_v1
    WHERE manifest_id=?1 ORDER BY chunk_index LIMIT 100`).bind(id).all<{ chunk_index: number }>();
  return { ...receipt(stored), receivedChunkIndexes: chunks.results.map(c => c.chunk_index),
    publicationErrorCode: stored.publication_error_code??null };
}
export async function routeApplicationAccounts(request: Request, db: D1Database, machine: MachineSelfResponse, now: number) {
  const path = new URL(request.url).pathname;
  try {
    if(path==='/v2/machines/application-accounts/capabilities') {
      if(request.method!=='GET')return methodNotAllowed('GET');
      const tables=['runtime_application_account_manifests_v1','runtime_application_account_chunks_v1',
        'runtime_application_account_receipts_v1','runtime_application_account_publications_v1',
        'runtime_application_account_publication_checks_v1','runtime_application_statistics_days_v1','runtime_application_statistics_queue_v1'];
      const result=await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${tables.map((_,i)=>`?${i+1}`).join(',')})`)
        .bind(...tables).all();
      return jsonResponse({protocol:'usage-account-v1',schemaVersion:1,enabled:result.results.length===tables.length,
        chunkRows:USAGE_ACCOUNT_CHUNK_ROWS,maxRows:USAGE_ACCOUNT_MAX_ROWS,acceptedAlgorithms:['windows-application-v1']});
    }
    if (path === prefix) return request.method === 'POST'
      ? jsonResponse(await beginApplicationAccount(db, machine, await readJsonBody(request, 16384), now)) : methodNotAllowed('POST');
    const match = path.match(/^\/v2\/machines\/application-accounts\/manifests\/(aa1_[a-f0-9]{64})\/(status|commit|chunks\/(\d{1,3}))$/);
    if (!match) fail(404, 'APPLICATION_ACCOUNT_NOT_FOUND');
    const id = match[1], action = match[2];
    if (action === 'status') return request.method === 'GET' ? jsonResponse(await readApplicationAccountStatus(db, machine, id)) : methodNotAllowed('GET');
    if (action === 'commit') return request.method === 'POST' ? jsonResponse(await commitApplicationAccount(db, machine, id, now)) : methodNotAllowed('POST');
    return request.method === 'PUT' ? jsonResponse(await putApplicationAccountChunk(db, machine, id, Number(match[3]), await readJsonBody(request, 131072))) : methodNotAllowed('PUT');
  } catch (error) {
    if (error instanceof UsageAccountError) throw new HttpError(400, error.code, error.code);
    throw error;
  }
}

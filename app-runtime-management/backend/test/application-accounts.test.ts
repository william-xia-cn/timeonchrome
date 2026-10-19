import { env, exports } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { createUsageAccount, hashUsageAccountValue, canonicalUsageAccountJson, usageAccountDayStart, type UsageAccountRow } from '@timeonchrome/app-runtime-contracts/usage-account';
import { sha256Hex, randomToken } from '../src/crypto';
import { beginApplicationAccount, putApplicationAccountChunk, commitApplicationAccount, readApplicationAccountStatus,routeApplicationAccounts } from '../src/applicationAccounts';
import { routeV2 } from '../src/v2Routes';
import { readRecentProgramInstanceUsage } from '../src/programInstanceStatistics';
import { applicationSharedQuotaSourceKey } from '../src/applicationSharedQuota';
import type { MachineSelfResponse } from '../src/contracts';
import { signSharedWebReusableProofV2 } from '@timeonchrome/app-runtime-contracts/shared-web-sync';
import { projectSharedAccessPolicyV2 } from '@timeonchrome/app-runtime-contracts/shared-access';

const start = usageAccountDayStart('2026-09-27');
const now = start + 86400000;
const localUserId = 'u'.repeat(64);
const row = (kind: UsageAccountRow['kind'], hour: number | null, duration: number,
  category: string | null = null): UsageAccountRow => ({ kind, hour, duration, category, subjectKey: null, displayName: null });
async function account(revision = 1, duration = 1501, extra = false, algorithmVersion = 'app-union-v1') {
  const rows = [row('total', null, duration), ...Array.from({ length: 24 }, (_, h) => row('total', h, h === 3 ? duration : 0)),
    row('category', null, duration, 'study'), row('category', 3, duration, 'study'),
    row('category', null, duration, 'composite'), row('category', 3, duration, 'composite')];
  if (extra) rows.push(...Array.from({ length: 60 }, (_, n) => [{ kind: 'subject' as const, hour: null,
    duration: 0, category: null, subjectKey: `p-${n}`, displayName: `Product ${n}` }, { kind: 'subject' as const,
    hour: 0, duration: 0, category: null, subjectKey: `p-${n}`, displayName: `Product ${n}` }]).flat());
  return createUsageAccount({ schemaVersion: 1, sourceKind: 'application', durationUnit: 'milliseconds', timezone: 'Asia/Shanghai',
    date: '2026-09-27', revision, generatedAtMs: now, settledThroughMs: now, algorithmVersion,
    policyVersions: [0], associationVersion: null, correctionVersion: 0, rawFactCount: 1, rawFactHash: 'a'.repeat(64), complete: true, reasonCodes: [] }, rows);
}
async function fixture() {
  const id = crypto.randomUUID(), accountId = crypto.randomUUID(), childId = crypto.randomUUID(), token = randomToken('');
  const machine: MachineSelfResponse = { machineId: id, accountId, platform: 'windows', displayName: null, defaultChildId: childId,
    desiredPolicyVersion: 1, appliedPolicyVersion: 0, policyState: 'pending', revoked: false };
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machines_v2
    (id,account_id,platform,token_hash,last_seen_at_ms,created_at_ms,updated_at_ms) VALUES (?1,?2,'windows',?3,?4,?4,?4)`)
    .bind(id, accountId, await sha256Hex(token), start).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
    (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
    VALUES (?1,?2,1,?3,1,'default',?4,?4)`).bind(id, localUserId, childId, start).run();
  return { machine, childId, token };
}
const input = (a: Awaited<ReturnType<typeof account>>) => ({ localUserId, assignmentVersion: 1, manifest: a.manifest });
async function upload(f: Awaited<ReturnType<typeof fixture>>, a?: Awaited<ReturnType<typeof account>>) {
  const snapshot = a ?? await account();
  const result = await beginApplicationAccount(env.RUNTIME_DB, f.machine, input(snapshot), now);
  for (const c of snapshot.chunks) await putApplicationAccountChunk(env.RUNTIME_DB, f.machine, result.manifestId, c.chunkIndex, { rows: c.rows, chunkHash: c.chunkHash });
  return result;
}
async function api(f: Awaited<ReturnType<typeof fixture>>, suffix = '', method = 'POST', body?: unknown) {
  return exports.default.fetch(new Request('http://runtime.test/v2/machines/application-accounts/manifests' + suffix, {
    method, headers: { authorization: `Bearer ${f.token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  }));
}
it('authenticated machine commit returns the newly readable statistics without raw uploads or scheduled publication',async()=>{
  const f=await fixture(),snapshot=await account(1,1501,false,'windows-application-v1');
  const pending=await upload(f,snapshot);
  const response=await api(f,`/${pending.manifestId}/commit`);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({manifestId:pending.manifestId,revision:1,
    received:true,published:true,publishStatus:'published',publicationErrorCode:null});
  expect(await (await api(f,`/${pending.manifestId}/status`,'GET')).json()).toMatchObject({published:true});
  const other=await fixture();
  expect((await api(other,`/${pending.manifestId}/commit`)).status).toBe(404);
});
it('目录实例观察明确不可用，不读取旧schema3或冒充未使用',async()=>{
  const noRead={prepare(){throw Error('retired instance statistics must not be queried');}} as unknown as D1Database;
  expect(await readRecentProgramInstanceUsage(noRead,'account','child',now)).toMatchObject({
    state:'unavailable',reasonCode:'APPLICATION_DIRECTORY_USAGE_UNAVAILABLE',subjects:[]});
  await expect(readRecentProgramInstanceUsage(noRead,'account','child',1)).rejects.toMatchObject({code:'INVALID_RANGE'});
});
it('旧schema3和两个投影入口退出，当前公共上传URL与鉴权保留',async()=>{
 const f=await fixture();
 expect((await api(f,'','POST',{localUserId,assignmentVersion:1,manifest:{schemaVersion:3}})).status).toBe(400);
 for(const action of ['product-projection','native-projection'])
  expect((await api(f,'/aa1_'+'a'.repeat(64)+'/'+action,'PUT',{})).status).toBe(404);
 expect((await api(f,'','POST',{localUserId,assignmentVersion:1,manifest:(await account()).manifest})).status).toBe(200);
});
it('已认证旧共享入口明确404，不再查询旧贡献状态',async()=>{
 const f=await fixture();
 for(const path of ['capabilities','state','execution-basis','application-contributions']){
  const response=await exports.default.fetch(new Request('http://runtime.test/v2/machines/shared-quota/'+path,{headers:{authorization:'Bearer '+f.token}}));
  expect(response.status).toBe(404);
 }
 expect((await exports.default.fetch(new Request('http://runtime.test/v2/machines/shared-web-source/challenge',{method:'POST',headers:{authorization:'Bearer '+f.token}}))).status).toBe(404);
});
it('reads only the current protected assignment shared policy from the bound Guardian source', async () => {
  const f=await fixture();
  const policy=projectSharedAccessPolicyV2({},7,0);
  let guardianCalls=0;
  const guardian={fetch:async(request:Request)=>{guardianCalls++;
    expect(new URL(request.url).pathname).toBe('/readSharedAccessPolicy');
    expect(await request.json()).toEqual({accountId:f.machine.accountId,childId:f.childId,schemaVersion:2});
    return Response.json({policy});}} as unknown as typeof env.GUARDIAN_COMPUTER_USAGE;
  const read=async(version:number)=>routeV2(new Request(`http://runtime.test/v2/machines/shared-access-policy?schemaVersion=2&localUserId=${localUserId}&assignmentVersion=${version}`,
    {headers:{authorization:`Bearer ${f.token}`}}),{...env,GUARDIAN_COMPUTER_USAGE:guardian},now);
  const current=await read(1);
  expect(current?.status).toBe(200);expect(await current?.json()).toEqual({policy});
  await expect(read(2)).rejects.toMatchObject({status:403,code:'SHARED_ACCESS_ASSIGNMENT_UNAVAILABLE'});
  expect(guardianCalls).toBe(1);
  const malformed={fetch:async()=>new Response('invalid JSON',{status:200})} as unknown as typeof env.GUARDIAN_COMPUTER_USAGE;
  await expect(routeV2(new Request(`http://runtime.test/v2/machines/shared-access-policy?schemaVersion=2&localUserId=${localUserId}&assignmentVersion=1`,
    {headers:{authorization:`Bearer ${f.token}`}}),{...env,GUARDIAN_COMPUTER_USAGE:malformed},now))
    .rejects.toMatchObject({status:503,code:'SHARED_ACCESS_POLICY_UNAVAILABLE'});
});

it('shared web source scope derives v2 reusable identity from machine auth and rechecks current assignment without writes',async()=>{
  const f=await fixture(),own=await applicationSharedQuotaSourceKey(f.machine.machineId,localUserId,1);
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
  let calls=0,rebind=false,wrongScope=false;
  const guardian={fetch:async(request:Request)=>{
    calls++;expect(new URL(request.url).pathname).toBe('/createSharedWebMachineScope');
    expect(await request.json()).toEqual({accountId:f.machine.accountId,childId:f.childId,machineId:f.machine.machineId,
      localUserId,assignmentVersion:1,applicationSourceKey:own});
    if(rebind)await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
      (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
      VALUES (?1,?2,2,?3,1,'override',?4,?4)`).bind(f.machine.machineId,localUserId,f.childId,now).run();
    const issuedAtMs=Date.now();
    return Response.json(await signSharedWebReusableProofV2({schemaVersion:2,audience:'timeonchrome:shared-web-machine-scope:v2',
      applicationSourceKey:wrongScope?'f'.repeat(64):own,assignmentVersion:1,
      childScopeHash:await sha256Hex(`shared-web-child\n${f.machine.accountId}\n${f.childId}`),issuedAtMs,expiresAtMs:issuedAtMs+300000},
      'a'.repeat(64),keys.privateKey));
  }} as typeof env.GUARDIAN_COMPUTER_USAGE;
  const read=(patch:Record<string,unknown>={},token=f.token,query='')=>routeV2(new Request('http://runtime.test/v2/machines/shared-web-source/scope'+query,{
    method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify({localUserId,assignmentVersion:1,...patch})}),{...env,GUARDIAN_COMPUTER_USAGE:guardian},now);
  await expect(read({},randomToken(''))).rejects.toMatchObject({status:401});
  for(const patch of [{childId:'caller'},{machineId:'caller'},{connectionHash:'d'.repeat(64)},{challengeId:'c'.repeat(64)}])
    await expect(read(patch)).rejects.toMatchObject({status:400,code:'INVALID_WEB_SOURCE_SCOPE'});
  await expect(read({},f.token,'?childId=caller')).rejects.toMatchObject({status:400});
  expect(calls).toBe(0);
  const response=await read();expect(response?.status).toBe(200);expect(response?.headers.get('cache-control')).toBe('no-store');
  const body=await response?.json() as {schemaVersion:number;claims:Record<string,unknown>};
  expect(body.schemaVersion).toBe(2);expect(Object.keys(body)).toHaveLength(4);
  expect(body.claims.applicationSourceKey).toBe(own);expect(body.claims.audience).toBe('timeonchrome:shared-web-machine-scope:v2');
  expect(body.claims).not.toHaveProperty('connectionHash');expect(body.claims).not.toHaveProperty('webSourceKey');
  expect(JSON.stringify(body)).not.toContain(f.machine.machineId);expect(JSON.stringify(body)).not.toContain(localUserId);
  const activity=await env.RUNTIME_DB.prepare('SELECT last_seen_at_ms FROM runtime_machines_v2 WHERE id=?1')
    .bind(f.machine.machineId).first<{last_seen_at_ms:number}>();expect(activity?.last_seen_at_ms).toBe(start);
  wrongScope=true;await expect(read()).rejects.toMatchObject({status:503,code:'WEB_SOURCE_BINDING_UNAVAILABLE'});wrongScope=false;
  rebind=true;await expect(read()).rejects.toMatchObject({status:409,code:'SHARED_ACCESS_BINDING_CHANGED'});
  await expect(read()).rejects.toMatchObject({status:403,code:'SHARED_ACCESS_ASSIGNMENT_UNAVAILABLE'});
});


it('immutable staged manifest, chunks and receipt are idempotent but never published', async () => {
  const f = await fixture(), a = await account(), pending = await upload(f, a);
  expect(pending).toMatchObject({ received: false, published: false, publishStatus: 'pending' });
  const complete = await commitApplicationAccount(env.RUNTIME_DB, f.machine, pending.manifestId, now);
  expect(complete).toMatchObject({ received: true, published: false, publishStatus: 'received_not_published' });
  expect(await commitApplicationAccount(env.RUNTIME_DB, f.machine, pending.manifestId, now + 1000)).toEqual(complete);
  expect(await beginApplicationAccount(env.RUNTIME_DB, f.machine, input(a), now)).toEqual(complete);
  expect(await putApplicationAccountChunk(env.RUNTIME_DB, f.machine, pending.manifestId, 0, { rows: a.chunks[0].rows, chunkHash: a.chunks[0].chunkHash }))
    .toMatchObject({ received: true, published: false });
  expect(await readApplicationAccountStatus(env.RUNTIME_DB, f.machine, pending.manifestId)).toMatchObject({ receivedChunkIndexes: [0] });
});


it('partial delivery can resume; cannot commit missing chunks', async () => {
  const f = await fixture(), a = await account(1, 1501, true);
  const r = await beginApplicationAccount(env.RUNTIME_DB, f.machine, input(a), now);
  await putApplicationAccountChunk(env.RUNTIME_DB, f.machine, r.manifestId, 1, { rows: a.chunks[1].rows, chunkHash: a.chunks[1].chunkHash });
  await expect(commitApplicationAccount(env.RUNTIME_DB, f.machine, r.manifestId, now)).rejects.toMatchObject({ code: 'APPLICATION_ACCOUNT_CHUNKS_MISSING' });
  expect(await readApplicationAccountStatus(env.RUNTIME_DB, f.machine, r.manifestId)).toMatchObject({ received: false, receivedChunkIndexes: [1] });
  await upload(f, a);
  expect(await commitApplicationAccount(env.RUNTIME_DB, f.machine, r.manifestId, now)).toMatchObject({ received: true });
});
it('assignment and machine credential determine Child; forged ownership rejected', async () => {
  const f = await fixture(), other = await fixture(), a = await account();
  const r = await upload(f, a);
  await expect(readApplicationAccountStatus(env.RUNTIME_DB, other.machine, r.manifestId)).rejects.toMatchObject({ status: 404 });
  await expect(beginApplicationAccount(env.RUNTIME_DB, f.machine, { ...input(a), childId: other.childId }, now)).rejects.toMatchObject({ status: 400 });
  await expect(beginApplicationAccount(env.RUNTIME_DB, f.machine, { ...input(a), assignmentVersion: 2 }, now)).rejects.toMatchObject({ status: 403 });
  const saved = await env.RUNTIME_DB.prepare('SELECT child_id,account_id FROM runtime_application_account_manifests_v1 WHERE id=?1').bind(r.manifestId).first();
  expect(saved).toEqual({ child_id: f.childId, account_id: f.machine.accountId });
});
it('unprotected assignment cannot submit statistics', async () => {
  const f = await fixture();
  await env.RUNTIME_DB.prepare(`UPDATE runtime_user_assignments_v2 SET protected=0,child_id=NULL,assignment_source='unprotected' WHERE machine_id=?1`).bind(f.machine.machineId).run();
  await expect(beginApplicationAccount(env.RUNTIME_DB, f.machine, input(await account()), now)).rejects.toMatchObject({ status: 403 });
});
it('same revision cannot be changed; delayed old revision cannot replace new receipt', async () => {
  const f = await fixture(), a = await account(), old = await upload(f, a);
  await expect(beginApplicationAccount(env.RUNTIME_DB, f.machine, input(await account(1, 1502)), now)).rejects.toMatchObject({ code: 'APPLICATION_ACCOUNT_REVISION_CONFLICT' });
  const newer = await upload(f, await account(2));
  await commitApplicationAccount(env.RUNTIME_DB, f.machine, newer.manifestId, now);
  await expect(commitApplicationAccount(env.RUNTIME_DB, f.machine, old.manifestId, now)).rejects.toMatchObject({ code: 'APPLICATION_ACCOUNT_STALE_REVISION' });
  const head = await env.RUNTIME_DB.prepare('SELECT revision FROM runtime_application_account_receipts_v1 WHERE machine_id=?1').bind(f.machine.machineId).first();
  expect(head).toEqual({ revision: 2 });
});
it('concurrent commit and replay preserve a single immutable received snapshot', async () => {
  const f = await fixture(), r = await upload(f);
  const results = await Promise.all([commitApplicationAccount(env.RUNTIME_DB, f.machine, r.manifestId, now), commitApplicationAccount(env.RUNTIME_DB, f.machine, r.manifestId, now)]);
  expect(results[0]).toEqual(results[1]);
  expect(await env.RUNTIME_DB.prepare('SELECT count(*) AS n FROM runtime_application_account_receipts_v1 WHERE machine_id=?1').bind(f.machine.machineId).first())
    .toEqual({ n: 1 });
});
it('receipt transaction interruption rolls back manifest state and watermark together', async () => {
  const f = await fixture(), r = await upload(f);
  await env.RUNTIME_DB.prepare(`CREATE TRIGGER test_account_receipt_failure BEFORE INSERT ON runtime_application_account_receipts_v1
    BEGIN SELECT RAISE(ABORT, 'TEST_ACCOUNT_ATOMIC_FAILURE'); END`).run();
  try {
    await expect(commitApplicationAccount(env.RUNTIME_DB, f.machine, r.manifestId, now)).rejects.toThrow('TEST_ACCOUNT_ATOMIC_FAILURE');
    expect(await readApplicationAccountStatus(env.RUNTIME_DB, f.machine, r.manifestId)).toMatchObject({ received: false });
    expect(await env.RUNTIME_DB.prepare('SELECT count(*) AS n FROM runtime_application_account_receipts_v1 WHERE machine_id=?1').bind(f.machine.machineId).first()).toEqual({ n: 0 });
  } finally { await env.RUNTIME_DB.prepare('DROP TRIGGER test_account_receipt_failure').run(); }
  expect(await commitApplicationAccount(env.RUNTIME_DB, f.machine, r.manifestId, now)).toMatchObject({ received: true });
});
it('route rejects tampered hashes, private fields and wrong source; policy history is not a receiving condition', async () => {
  const f = await fixture(), a = await account();
  const altered = { ...a.manifest, revision: 2 };
  expect((await api(f, '', 'POST', { ...input(a), manifest: altered })).status).toBe(400);
  expect((await api(f, '', 'POST', { ...input(a), token: 'private' })).status).toBe(400);
  const changed = { ...a.manifest, sourceKind: 'web', durationUnit: 'seconds' };
  const { manifestHash: ignored, ...header } = changed;
  expect((await api(f, '', 'POST', { ...input(a), manifest: { ...header, manifestHash: await hashUsageAccountValue(header) } })).status).toBe(400);
  const { manifestHash: ignoredPolicy, ...policyHeader } = { ...a.manifest, policyVersions: [7] };
  const response = await api(f, '', 'POST', { ...input(a), manifest: { ...policyHeader, manifestHash: await hashUsageAccountValue(policyHeader) } });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ received: false, published: false });
});
it('chunk hash/count/index and immutable replay conflicts are rejected', async () => {
  const f = await fixture(), a = await account(), r = await upload(f, a);
  const chunk = a.chunks[0];
  await expect(putApplicationAccountChunk(env.RUNTIME_DB, f.machine, r.manifestId, 1, { rows: chunk.rows, chunkHash: chunk.chunkHash })).rejects.toMatchObject({ status: 400 });
  await expect(putApplicationAccountChunk(env.RUNTIME_DB, f.machine, r.manifestId, 0, { rows: [], chunkHash: chunk.chunkHash })).rejects.toMatchObject({ status: 400 });
  await expect(putApplicationAccountChunk(env.RUNTIME_DB, f.machine, r.manifestId, 0, { rows: chunk.rows, chunkHash: 'b'.repeat(64) })).rejects.toMatchObject({ status: 400 });
  const other = (await account(1, 1502)).chunks[0];
  await expect(putApplicationAccountChunk(env.RUNTIME_DB, f.machine, r.manifestId, 0, { rows: other.rows, chunkHash: other.chunkHash })).rejects.toMatchObject({ status: 409 });
});
it('HTTP API supports lost ACK recovery and does not alter machine heartbeat or old protocol', async () => {
  const f = await fixture(), a = await account();
  const initial = await api(f, '', 'POST', input(a));
  expect(initial.status).toBe(200);
  const r = await initial.json() as { manifestId: string };
  const c = a.chunks[0];
  expect((await api(f, `/${r.manifestId}/chunks/0`, 'PUT', { rows: c.rows, chunkHash: c.chunkHash })).status).toBe(200);
  expect((await api(f, `/${r.manifestId}/commit`)).status).toBe(200);
  const status = await api(f, `/${r.manifestId}/status`, 'GET');
  expect(status.headers.get('cache-control')).toBe('no-store');
  expect(await status.json()).toMatchObject({ received: true, published: false });
  const machine = await env.RUNTIME_DB.prepare('SELECT last_seen_at_ms FROM runtime_machines_v2 WHERE id=?1').bind(f.machine.machineId).first();
  expect(machine).toEqual({ last_seen_at_ms: start });
  const legacy = await exports.default.fetch(new Request('http://runtime.test/v2/machines/self', { headers: { authorization: `Bearer ${f.token}` } }));
  expect(legacy.status).toBe(200);
});
it('no credential is fail closed; receipt/status never expose child or local identity', async () => {
  const response = await exports.default.fetch(new Request('http://runtime.test/v2/machines/application-accounts/manifests'));
  expect(response.status).toBe(401);
  const f = await fixture(), r = await upload(f);
  const text = JSON.stringify(await readApplicationAccountStatus(env.RUNTIME_DB, f.machine, r.manifestId));
  expect(text).not.toContain(f.childId); expect(text).not.toContain(localUserId); expect(text).not.toContain(f.token);
});
it('staging does not change original facts, original hourly statistics or classification policy', async () => {
  const f = await fixture();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_usage_segments_v2
    (id,machine_id,local_user_id,assignment_version,child_id,runtime_session_id,platform,runtime_identity,
    start_at_ms,end_at_ms,duration_ms,end_reason,content_hash,uploaded_at_ms)
    VALUES ('fact',?1,?2,1,?3,'session','windows','opaque-program',?4,?5,1501,'switch','fact-hash',?5)`)
    .bind(f.machine.machineId, localUserId, f.childId, start, start + 1501).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_app_hourly_stats_v2
    (child_id,machine_id,local_user_id,hour_start_ms,runtime_identity,duration_ms,updated_at_ms)
    VALUES (?1,?2,?3,?4,'opaque-program',1501,?4)`).bind(f.childId, f.machine.machineId, localUserId, start).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_child_app_policy_versions_v1
    (account_id,child_id,version,payload_json,payload_hash,effective_at_ms,created_at_ms)
    VALUES (?1,?2,1,'{}','policy-fixture',?3,?3)`).bind(f.machine.accountId, f.childId, start).run();
  const originals = async () => Promise.all([
    env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?1').bind(f.machine.machineId).all(),
    env.RUNTIME_DB.prepare('SELECT * FROM runtime_app_hourly_stats_v2 WHERE machine_id=?1').bind(f.machine.machineId).all(),
    env.RUNTIME_DB.prepare('SELECT * FROM runtime_user_assignments_v2 WHERE machine_id=?1').bind(f.machine.machineId).all(),
    env.RUNTIME_DB.prepare('SELECT * FROM runtime_child_app_policy_versions_v1 WHERE account_id=?1 AND child_id=?2').bind(f.machine.accountId, f.childId).all(),
  ]).then(results => results.map(r => r.results));
  const before = await originals(), r = await upload(f);
  await commitApplicationAccount(env.RUNTIME_DB, f.machine, r.manifestId, now);
  expect(await originals()).toEqual(before);
});
it('valid hashes cannot hide inconsistent dimensions at commit', async () => {
  const f = await fixture(), a = await account();
  const rows = a.rows.map(r => r.kind === 'total' && r.hour === null ? { ...r, duration: r.duration + 1 } : r);
  const { manifestHash: ignored, ...header } = { ...a.manifest, rowsHash: await hashUsageAccountValue(rows) };
  const r = await beginApplicationAccount(env.RUNTIME_DB, f.machine,
    { ...input(a), manifest: { ...header, manifestHash: await hashUsageAccountValue(header) } }, now);
  await putApplicationAccountChunk(env.RUNTIME_DB, f.machine, r.manifestId, 0, { rows, chunkHash: await hashUsageAccountValue(rows) });
  await expect(commitApplicationAccount(env.RUNTIME_DB, f.machine, r.manifestId, now)).rejects.toThrow('USAGE_ACCOUNT_DIMENSION_MISMATCH');
  expect(await readApplicationAccountStatus(env.RUNTIME_DB, f.machine, r.manifestId)).toMatchObject({ received: false, published: false });
});
it('incomplete snapshot with real zero values is received but not treated as published zero', async () => {
  const f = await fixture(), a = await account(1, 0);
  const { manifestHash: ignored, ...header } = { ...a.manifest, complete: false, reasonCodes: ['SOURCE_GAP'] };
  const incomplete = { ...a, manifest: { ...header, manifestHash: await hashUsageAccountValue(header) } };
  const r = await upload(f, incomplete);
  expect(await commitApplicationAccount(env.RUNTIME_DB, f.machine, r.manifestId, now)).toMatchObject({ received: true, published: false });
});
it('bounded HTTP bodies fail before staging changes', async () => {
  const f = await fixture(), a = await account();
  expect((await api(f, '', 'POST', { ...input(a), padding: 'x'.repeat(16384) })).status).toBe(413);
  const r = await beginApplicationAccount(env.RUNTIME_DB, f.machine, input(a), now);
  expect((await api(f, `/${r.manifestId}/chunks/0`, 'PUT', { rows: [], chunkHash: 'x'.repeat(131072) })).status).toBe(413);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB, f.machine, r.manifestId)).toMatchObject({ received: false, receivedChunkIndexes: [] });
});
it.each(['windows','macos'] as const)('capabilities require %s machine authentication and only ready schema permits upload',async(platform)=>{
  const url='http://runtime.test/v2/machines/application-accounts/capabilities';
  expect((await exports.default.fetch(new Request(url))).status).toBe(401);
  const f=await fixture();
  await env.RUNTIME_DB.prepare('UPDATE runtime_machines_v2 SET platform=?1 WHERE id=?2').bind(platform,f.machine.machineId).run();
  const response=await exports.default.fetch(new Request(url,{headers:{authorization:`Bearer ${f.token}`}}));
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({protocol:'usage-account-v1',schemaVersion:1,enabled:true,
    chunkRows:100,maxRows:10000,acceptedAlgorithms:['windows-application-v1','macos-application-v1','windows-application-seconds-v2','macos-application-seconds-v2','windows-application-v3-only-seconds-v1','macos-application-v3-only-seconds-v1','application-fixed-identity-seconds-v1'],capabilities:['application-usage-projection-v1','application-statistics-seconds-v2','application-statistics-child-scope-v1','application-fixed-identity-statistics-v1','native-application-management-v1']});
  const unavailable={prepare(){return {async first(){return null;},bind(){return {async all(){return {results:[]};}};}};}} as unknown as D1Database;
  const disabled=await routeApplicationAccounts(new Request(url),unavailable,f.machine,now);
  expect(await disabled.json()).toMatchObject({enabled:false,
    capabilities:['application-usage-projection-v1','application-statistics-seconds-v2','application-statistics-child-scope-v1']});
  await expect(routeApplicationAccounts(new Request(`http://runtime.test/v2/machines/application-accounts/manifests/aa1_${'a'.repeat(64)}/product-projection`,
    {method:'PUT',body:'{}'}),unavailable,f.machine,now)).rejects.toMatchObject({status:404,code:'APPLICATION_ACCOUNT_NOT_FOUND'});
  expect(await env.RUNTIME_DB.prepare('SELECT last_seen_at_ms FROM runtime_machines_v2 WHERE id=?1').bind(f.machine.machineId).first())
    .toEqual({last_seen_at_ms:start});
});

it('missing product storage or old retirement triggers do not advertise new upload capabilities',async()=>{
  const f=await fixture(),url='http://runtime.test/v2/machines/application-accounts/capabilities';
  const structures=await env.RUNTIME_DB.prepare('SELECT name,type,sql FROM sqlite_master').all<{name:string;type:string;sql:string|null}>();
  for(const missing of ['runtime_application_product_projections_v1','runtime_product_projection_immutable_v1',
    'runtime_retired_application_manifest_insert','runtime_retired_application_publication_insert']) {
    // 只替换只读schema查询结果，不改实际隔离数据库，更不执行生产迁移。
    const schemaOnly={prepare(sql:string){
      if(!sql.startsWith('SELECT name,type,sql FROM sqlite_master'))return env.RUNTIME_DB.prepare(sql);
      return {bind(...names:string[]){return {async all(){return {results:structures.results.filter(row=>names.includes(row.name)&&row.name!==missing)};}};}};
    }} as unknown as D1Database;
    const result=await (await routeApplicationAccounts(new Request(url),schemaOnly,f.machine,now)).json() as {enabled:boolean;capabilities:string[];acceptedAlgorithms:string[]};
    expect(result.enabled).toBe(true);
    expect(result.capabilities).not.toContain('application-product-projection-upload-v1');
    expect(result.capabilities).not.toContain('application-instance-statistics-v1');
    expect(result.acceptedAlgorithms).not.toContain('application-instance-seconds-v1');
  }
});

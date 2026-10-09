import { env, exports } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { createUsageAccount, hashUsageAccountValue, canonicalUsageAccountJson, usageAccountDayStart, type UsageAccountRow } from '@timeonchrome/app-runtime-contracts/usage-account';
import { sha256Hex, randomToken } from '../src/crypto';
import { beginApplicationAccount, putApplicationAccountChunk, commitApplicationAccount, readApplicationAccountStatus,routeApplicationAccounts } from '../src/applicationAccounts';
import { routeV2 } from '../src/v2Routes';
import { readProgramInstanceStatistics } from '../src/programInstanceStatistics';
import { readApplicationProductProjections } from '../src/applicationProductProjections';
import { checkApplicationSharedQuotaSource, receiveApplicationSharedQuota,
  reconcileApplicationSharedQuotaEvidence, readVerifiedChromeMarginals,
  readCoveredChromeDeduction, applicationSharedQuotaUploadReady,
  readApplicationSharedQuotaContributions, applicationSharedQuotaSourceKey } from '../src/applicationSharedQuota';
import type { MachineSelfResponse } from '../src/contracts';
import { signSharedWebReusableProofV2 } from '@timeonchrome/app-runtime-contracts/shared-web-sync';
import { createApplicationInstanceAccount, verifyApplicationInstanceAccountManifest,
  verifyApplicationProductProjectionReceipt } from '@timeonchrome/app-runtime-contracts/usage-account';

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
it('instance schema3 uses authenticated existing upload and publishes unknown subjects without catalog or raw uploads',async()=>{
  const f=await fixture();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_ledger_retirements_v1 VALUES(?1,?2,?3,'[]')`)
    .bind(f.machine.accountId,now,'a'.repeat(64)).run();
  const make=(revision:number,duration:number,overlap=false)=>createApplicationInstanceAccount({schemaVersion:3,sourceKind:'application',durationUnit:'seconds',
    timezone:'Asia/Shanghai',date:'2026-09-27',childId:f.childId,revision,generatedAtMs:now,settledThroughMs:now,
    algorithmVersion:'application-instance-seconds-v1',rawFactCount:1,rawFactHash:'a'.repeat(64),observationResolutionHash:'b'.repeat(64),
    complete:true,reasonCodes:[]},[
      {kind:'total',hour:null,subjectKey:null,duration},...Array.from({length:24},(_,hour)=>({kind:'total' as const,hour,subjectKey:null,duration:hour===3?duration:0})),
      {kind:'subject',hour:null,subjectKey:'observation:'+'c'.repeat(64),duration},{kind:'subject',hour:3,subjectKey:'observation:'+'c'.repeat(64),duration},
      ...(overlap?[{kind:'subject' as const,hour:null,subjectKey:'instance:'+'d'.repeat(64),duration},
        {kind:'subject' as const,hour:3,subjectKey:'instance:'+'d'.repeat(64),duration}]:[])]);
  const snapshot=await make(1,60);
  const uploadInstance=async(value:Awaited<ReturnType<typeof make>>,producer=f)=>{
    const begun=await api(producer,'','POST',{localUserId,assignmentVersion:1,manifest:value.manifest});
    expect(begun.status).toBe(200);
    const receipt=await begun.json() as {manifestId:string};
    for(const chunk of value.chunks) expect((await api(producer,`/${receipt.manifestId}/chunks/${chunk.chunkIndex}`,'PUT',
      {rows:chunk.rows,chunkHash:chunk.chunkHash})).status).toBe(200);
    const committed=await api(producer,`/${receipt.manifestId}/commit`);
    expect(committed.status).toBe(200);
    expect(await committed.json()).toMatchObject({received:true,published:true,publicationErrorCode:null});
    return receipt.manifestId;
  };
  const first=await uploadInstance(snapshot);
  const project=async(revision:number,classification='unclassified')=>{
    const body={schemaVersion:1,baseManifestHash:snapshot.manifest.manifestHash,revision,catalogVersion:0,
      generatedAtMs:now,complete:true,reasonCodes:[],rows:snapshot.rows.filter(row=>row.kind==='subject')
        .map(row=>({...row,category:null,classifications:[classification]})),
      applicationUsage:{nonSpecialTotal:60,nonSpecialCategories:{[classification]:60},specialTotal:0,complete:true,reasonCodes:[]}};
    // 线上wire使用共同canonical顺序，不依赖对象构造顺序。
    body.rows.sort((a,b)=>canonicalUsageAccountJson(a)<canonicalUsageAccountJson(b)?-1:1);
    return {...body,projectionHash:await hashUsageAccountValue(body)};
  };
  const projection=await project(1),projectionPath=`/${first}/product-projection`;
  const acknowledged=await (await api(f,projectionPath,'PUT',projection)).json();
  expect(verifyApplicationProductProjectionReceipt(acknowledged,first,projection))
    .toEqual({manifestId:first,received:true,revision:1,projectionHash:projection.projectionHash});
  expect(await (await api(f,projectionPath,'PUT',projection)).json()).toMatchObject({received:true,revision:1});
  expect((await api(f,projectionPath,'PUT',await project(1,'other'))).status).toBe(409);
  expect((await api(f,projectionPath,'PUT',await project(3,'other'))).status).toBe(200);
  expect((await api(f,projectionPath,'PUT',await project(2))).status).toBe(409);
  expect((await api(await fixture(),projectionPath,'PUT',projection)).status).toBe(404);
  expect(await env.RUNTIME_DB.prepare('SELECT MAX(revision) AS n FROM runtime_application_product_projections_v1 WHERE manifest_id=?').bind(first).first('n')).toBe(3);
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_application_product_projections_v1 WHERE manifest_id=?').bind(first).first('n')).toBe(2);
  const read=(to=start+86400000,filters={})=>readProgramInstanceStatistics(env.RUNTIME_DB,f.machine.accountId,f.childId,start,to,filters);
  expect(await read()).toMatchObject({complete:true,totalDuration:60,subjects:[{subjectKey:'observation:'+'c'.repeat(64),duration:60}],
    days:[{references:[{manifestId:first,revision:1}]}]});
  const projected=await readApplicationProductProjections(env.RUNTIME_DB,f.machine.accountId,f.childId,await read());
  expect(projected).toMatchObject({complete:true,sources:[{state:'available',base:{manifestId:first},
    projection:{revision:3,applicationUsage:{nonSpecialTotal:60,nonSpecialCategories:{other:60}}}}]});
  expect(await readApplicationProductProjections(env.RUNTIME_DB,'other-family',f.childId,await read()))
    .toMatchObject({complete:false,sources:[{state:'missing',projection:null}]});
  expect((await (await api(f,`/${first}/commit`)).json())).toMatchObject({published:true,revision:1});
  const latest=await uploadInstance(await make(2,30));
  const head=await env.RUNTIME_DB.prepare(`SELECT m.manifest_json FROM runtime_application_account_publications_v1 p
    JOIN runtime_application_account_manifests_v1 m ON m.id=p.manifest_id WHERE p.machine_id=?`)
    .bind(f.machine.machineId).first<{manifest_json:string}>();
  expect((await verifyApplicationInstanceAccountManifest(JSON.parse(head!.manifest_json))).revision).toBe(2);
  expect(await read()).toMatchObject({complete:true,totalDuration:30,days:[{references:[{manifestId:latest,revision:2}]}]});
  expect(await read(start+2*86400000)).toMatchObject({complete:false,totalDuration:null,availableTotalDuration:30,
    days:[{totalDuration:30},{totalDuration:null,reasonCodes:['APPLICATION_INSTANCE_STATISTICS_NOT_AVAILABLE']}]});
  expect(await read(start+86400000,{machineId:'missing'})).toMatchObject({complete:false,totalDuration:null,availableTotalDuration:null,subjects:[]});
  const token='instance-reader-'+crypto.randomUUID();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_browser_sessions_v1
    (token_hash,account_id,children_json,created_at_ms,expires_at_ms,last_used_at_ms) VALUES(?1,?2,?3,?4,?5,?4)`)
    .bind(await sha256Hex(token),f.machine.accountId,JSON.stringify([{id:f.childId,name:'测试孩子'}]),now,now+60000).run();
  const request=(child:string=f.childId)=>new Request(`http://runtime.test/v2/module/program-instance-usage?childId=${child}&fromMs=${start}&toMs=${start+86400000}`,
    {headers:{authorization:`RuntimeSession ${token}`}});
  const response=await routeV2(request(),env,now);
  expect(response?.status).toBe(200);
  const payload=await response!.json();
  expect(payload).toMatchObject({childId:f.childId,durationUnit:'seconds',totalDuration:30});
  expect(payload).not.toHaveProperty('products');expect(payload).not.toHaveProperty('categories');
  expect(payload).not.toHaveProperty('productStatistics');
  const withProducts=()=>routeV2(new Request(request().url+'&includeProducts=true',{headers:request().headers}),env,now);
  // 新基础清单不能借用旧清单产品时长；基础30秒不因产品缺失而消失。
  expect(await (await withProducts())!.json()).toMatchObject({...payload as object,
    productStatistics:{complete:false,sources:[{state:'missing',base:{manifestId:latest},projection:null}]}});
  const nextBase=await make(2,30), nextProjection=await project(4);
  const {projectionHash:oldProjectionHash,...nextBody}=nextProjection;
  nextBody.baseManifestHash=nextBase.manifest.manifestHash;
  nextBody.rows=nextBody.rows.map(row=>({...row,duration:30}));
  nextBody.applicationUsage.nonSpecialTotal=30;nextBody.applicationUsage.nonSpecialCategories={unclassified:30};
  expect((await api(f,`/${latest}/product-projection`,'PUT',
    {...nextBody,projectionHash:await hashUsageAccountValue(nextBody)})).status).toBe(200);
  expect(await (await withProducts())!.json()).toMatchObject({...payload as object,
    productStatistics:{complete:true,sources:[{state:'available',projection:{revision:4,applicationUsage:{nonSpecialTotal:30}}}]}});
  const withIdentity=()=>routeV2(new Request(request().url+'&includeIdentity=true',{headers:request().headers}),env,now);
  const withDisplay=()=>routeV2(new Request(request().url+'&view=display',{headers:request().headers}),env,now);
  expect(await (await withDisplay())!.json()).toMatchObject({model:'program-instance-v1',durationUnit:'seconds',
    totalDuration:30,instances:[{subjectKey:'observation:'+'c'.repeat(64),duration:30}],
    applications:[{duration:30,identified:false}],productStatus:{complete:true},
    applicationUsage:{nonSpecialTotal:30,nonSpecialCategories:{unclassified:30},specialTotal:0,complete:true}});
  const stableBase=await read();
  const stableDisplay=await (await withDisplay())!.json() as {revision:string};
  const unknownReason='APPLICATION_CLASSIFICATION_EVIDENCE_UNAVAILABLE';
  const unknownBody={...nextBody,revision:5,complete:false,reasonCodes:[unknownReason],
    rows:nextBody.rows.map(row=>({...row,classifications:['historicalUnknown']})),
    applicationUsage:{nonSpecialTotal:30,nonSpecialCategories:{historicalUnknown:30},specialTotal:0,
      complete:false,reasonCodes:[unknownReason]}};
  const unknownHash=await hashUsageAccountValue(unknownBody);
  expect(await (await api(f,`/${latest}/product-projection`,'PUT',
    {...unknownBody,projectionHash:unknownHash})).json()).toEqual({manifestId:latest,revision:5,projectionHash:unknownHash,received:true});
  const unknownDisplay=await (await withDisplay())!.json() as {revision:string};
  expect(unknownDisplay).toMatchObject({complete:true,totalDuration:30,instances:[{duration:30}],
    applications:[{duration:30,classifications:['historicalUnknown']}],applicationUsage:null,
    productStatus:{complete:false,reasonCodes:[unknownReason]}});
  expect(unknownDisplay.revision).not.toBe(stableDisplay.revision);
  expect(await read()).toEqual(stableBase);
  const correctedBody={...nextBody,revision:6};
  expect((await api(f,`/${latest}/product-projection`,'PUT',
    {...correctedBody,projectionHash:await hashUsageAccountValue(correctedBody)})).status).toBe(200);
  const correctedDisplay=await (await withDisplay())!.json() as {revision:string};
  expect(correctedDisplay).toMatchObject({totalDuration:30,applicationUsage:{nonSpecialTotal:30},productStatus:{complete:true,reasonCodes:[]}});
  expect(correctedDisplay.revision).not.toBe(unknownDisplay.revision);
  expect(await read()).toEqual(stableBase);
  expect(await (await withIdentity())!.json()).toMatchObject({...payload as object,
    identityProjection:{state:'available',products:[],items:[{subjectKey:'observation:'+'c'.repeat(64),status:'unresolved',productId:null}]}});
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_knowledge_versions_v1 VALUES(?1,1,?2,?3,?4)`)
    .bind(f.machine.accountId,JSON.stringify({schemaVersion:4,version:1}),'invalid-test-catalog',now).run();
  expect(await (await withIdentity())!.json()).toMatchObject({...payload as object,
    identityProjection:{state:'unavailable',reasonCodes:['PROGRAM_IDENTITY_READ_UNAVAILABLE']}});
  expect(await (await withProducts())!.json()).toMatchObject({...payload as object,
    productStatistics:{complete:false,sources:[{state:'stale',reasonCodes:['APPLICATION_PRODUCT_CATALOG_CHANGED'],
      projection:{revision:6}}]}});
  expect(await (await withDisplay())!.json()).toMatchObject({totalDuration:30,
    instances:[{duration:30}],applications:[],productStatus:{complete:false},applicationUsage:null});
  // 损坏的最新派生载荷单独报错，不回退旧版、更不能拖垮基础读取。
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_product_projections_v1 VALUES(?1,7,?2,'{}',?3)`)
    .bind(latest,'f'.repeat(64),now).run();
  expect(await (await withProducts())!.json()).toMatchObject({...payload as object,
    productStatistics:{complete:false,sources:[{state:'unavailable',projection:null,
      reasonCodes:['APPLICATION_PRODUCT_PROJECTION_INVALID']}]}});
  expect(await (await routeV2(new Request(request().url+'&includeIdentity=true&includeProducts=true',
    {headers:request().headers}),env,now))!.json()).toMatchObject({...payload as object,
    identityProjection:{state:'unavailable'},productStatistics:{complete:false,sources:[{state:'unavailable'}]}});
  await expect(routeV2(new Request(request().url+'&includeProducts=yes',{headers:request().headers}),env,now))
    .rejects.toMatchObject({code:'INVALID_PRODUCT_VIEW'});
  await expect(routeV2(request('another-child'),env,now)).rejects.toMatchObject({code:'CHILD_NOT_FOUND'});
  const second=await fixture();
  await env.RUNTIME_DB.prepare('UPDATE runtime_machines_v2 SET account_id=? WHERE id=?').bind(f.machine.accountId,second.machine.machineId).run();
  await env.RUNTIME_DB.prepare('UPDATE runtime_user_assignments_v2 SET child_id=? WHERE machine_id=?').bind(f.childId,second.machine.machineId).run();
  await uploadInstance(await make(1,20),second);
  expect(await read()).toMatchObject({totalDuration:50,days:[{references:expect.arrayContaining([{manifestId:latest,revision:2,hash:expect.any(String),settledThroughMs:now}])}]});
  expect(await read(start+86400000,{machineId:f.machine.machineId})).toMatchObject({totalDuration:30});
  await uploadInstance(await make(3,10,true));
  const overlapping=await read(start+86400000,{machineId:f.machine.machineId});
  expect(overlapping.totalDuration).toBe(10);
  expect(overlapping.subjects.reduce((sum,row)=>sum+row.duration,0)).toBe(20);
  expect((await read(start+86400000,{machineId:f.machine.machineId})).revision).toBe(overlapping.revision);
  expect(await readProgramInstanceStatistics(env.RUNTIME_DB,'different-family',f.childId,start,start+86400000))
    .toMatchObject({totalDuration:null,availableTotalDuration:null,subjects:[]});
  await expect(read(start+8*86400000)).rejects.toMatchObject({code:'INVALID_RANGE'});
  expect((await api(f,`/${latest}/status`,'GET')).status).toBe(200);
  const other=await fixture();expect((await api(other,`/${latest}/status`,'GET')).status).toBe(404);
  const bad={...snapshot.manifest,childId:'other-child'};
  const {manifestHash:_,...badBody}=bad;bad.manifestHash=await hashUsageAccountValue(badBody);
  expect((await api(f,'','POST',{localUserId,assignmentVersion:1,manifest:bad})).status).toBe(403);
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_usage_segments_v2 WHERE machine_id=?')
    .bind(f.machine.machineId).first('n')).toBe(0);
});
it('advertises shared contribution upload only to an authenticated machine with both storage tables', async () => {
  const f=await fixture();
  const url='http://runtime.test/v2/machines/shared-quota/capabilities';
  const unauthenticated=await exports.default.fetch(new Request(url));
  expect(unauthenticated.status).toBe(401);
  const response=await exports.default.fetch(new Request(url,{headers:{authorization:`Bearer ${f.token}`}}));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({protocol:'application-shared-quota-v1',schemaVersion:1,enabled:true,
    capabilities:['source-statistics-read-v1']});
  const oldSchema={prepare(){return {bind(){return {all:async()=>({results:[]})};}};}} as unknown as D1Database;
  expect(await applicationSharedQuotaUploadReady(oldSchema)).toBe(false);
});
it('reads only the current protected assignment shared policy from the bound Guardian source', async () => {
  const f=await fixture();
  const policy={schemaVersion:1,revision:'profile-config:7',stage:'legacy',effectiveAtMs:0,
    dailyMinutes:{study:null,composite:null,restrictedEntertainment:null},timeWindows:{},autonomy:{}};
  let guardianCalls=0;
  const guardian={fetch:async(request:Request)=>{guardianCalls++;
    expect(new URL(request.url).pathname).toBe('/readSharedAccessPolicy');
    expect(await request.json()).toEqual({accountId:f.machine.accountId,childId:f.childId});
    return Response.json({policy});}} as unknown as typeof env.GUARDIAN_COMPUTER_USAGE;
  const read=async(version:number)=>routeV2(new Request(`http://runtime.test/v2/machines/shared-access-policy?localUserId=${localUserId}&assignmentVersion=${version}`,
    {headers:{authorization:`Bearer ${f.token}`}}),{...env,GUARDIAN_COMPUTER_USAGE:guardian},now);
  const current=await read(1);
  expect(current?.status).toBe(200);expect(await current?.json()).toEqual({policy});
  await expect(read(2)).rejects.toMatchObject({status:403,code:'SHARED_ACCESS_ASSIGNMENT_UNAVAILABLE'});
  expect(guardianCalls).toBe(1);
  const malformed={fetch:async()=>new Response('invalid JSON',{status:200})} as unknown as typeof env.GUARDIAN_COMPUTER_USAGE;
  await expect(routeV2(new Request(`http://runtime.test/v2/machines/shared-access-policy?localUserId=${localUserId}&assignmentVersion=1`,
    {headers:{authorization:`Bearer ${f.token}`}}),{...env,GUARDIAN_COMPUTER_USAGE:malformed},now))
    .rejects.toMatchObject({status:503,code:'SHARED_ACCESS_POLICY_UNAVAILABLE'});
});
it('shared web source challenge authenticates machine context without caller Child or activity writes', async()=>{
  const f=await fixture(), own=await applicationSharedQuotaSourceKey(f.machine.machineId,localUserId,1);
  let calls=0, rebind=false;
  const guardian={fetch:async(request:Request)=>{
    calls++;expect(new URL(request.url).pathname).toBe('/createSharedWebSourceChallenge');
    expect(await request.json()).toEqual({accountId:f.machine.accountId,childId:f.childId,machineId:f.machine.machineId,
      localUserId,assignmentVersion:1,connectionHash:'d'.repeat(64),applicationSourceKey:own});
    if(rebind)await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
      (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
      VALUES (?1,?2,2,?3,1,'override',?4,?4)`).bind(f.machine.machineId,localUserId,f.childId,now).run();
    return Response.json({schemaVersion:1,challengeId:'c'.repeat(64),connectionHash:'d'.repeat(64),expiresAtMs:Date.now()+90000});
  }} as typeof env.GUARDIAN_COMPUTER_USAGE;
  const read=(patch:Record<string,unknown>={},token=f.token)=>routeV2(new Request('http://runtime.test/v2/machines/shared-web-source/challenge',{
    method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify({localUserId,assignmentVersion:1,connectionHash:'d'.repeat(64),...patch})}),{...env,GUARDIAN_COMPUTER_USAGE:guardian},now);
  await expect(read({},randomToken(''))).rejects.toMatchObject({status:401});
  await expect(read({childId:'caller-child'})).rejects.toMatchObject({status:400,code:'INVALID_WEB_SOURCE_CHALLENGE'});
  expect(calls).toBe(0);
  const response=await read();expect(response?.status).toBe(200);
  const body=await response?.json() as Record<string,unknown>;
  expect(Object.keys(body)).toHaveLength(6);expect(body.applicationSourceKey).toBe(own);
  expect(body.childScopeHash).toBe(await sha256Hex(`shared-web-child\n${f.machine.accountId}\n${f.childId}`));
  expect(body.connectionHash).toBe('d'.repeat(64));
  const activity=await env.RUNTIME_DB.prepare('SELECT last_seen_at_ms FROM runtime_machines_v2 WHERE id=?1')
    .bind(f.machine.machineId).first<{last_seen_at_ms:number}>();expect(activity?.last_seen_at_ms).toBe(start);
  rebind=true;await expect(read()).rejects.toMatchObject({status:409,code:'SHARED_ACCESS_BINDING_CHANGED'});
  await expect(read()).rejects.toMatchObject({status:403,code:'SHARED_ACCESS_ASSIGNMENT_UNAVAILABLE'});
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
it('execution basis authenticates machine scope and rejects untrusted page or concurrent assignment changes', async () => {
  const f=await fixture(), ownSourceKey=await applicationSharedQuotaSourceKey(f.machine.machineId,localUserId,1);
  expect(ownSourceKey).toBe(await sha256Hex(`application\n${f.machine.machineId}\n${localUserId}\n1`));
  let calls=0, mode='valid', cancelled=false;
  const page=()=>({schemaVersion:1,profileId:String(f.childId),basisRevision:'a'.repeat(64),policyRevision:'profile-config:7',
    fromDate:'2026-09-21',toDate:'2026-09-27',days:Array.from({length:7},(_,index)=>({date:`2026-09-${21+index}`,
      reasonCodes:['APPLICATION_COVERAGE_MISSING'],sourceCount:index===6?1:0})),
    authorizedScopes:[{source:'application',sourceKey:ownSourceKey,date:'2026-09-27'}],
    page:{offset:0,limit:50,total:1,nextOffset:null,items:[{publicationRevision:'1:2026-09-27',revisionOrdinal:1,
      contribution:{schemaVersion:1,source:'application',sourceKey:ownSourceKey,date:'2026-09-27',revision:'app-1',
        statisticsRevision:'stats-1',correctionRevision:'correction-0',productAssociationVersion:'association-1',
        policyRevision:'profile-config:7',settledAtMs:now,complete:true,reasonCodes:[],bucketsMs:{study:1501,composite:0,rest:0},
        applicationClassesMs:{study:1501,composite:0,restrictedEntertainment:0,unclassified:0,other:0},chromeExcludedMs:0}}]}});
  const guardian={fetch:async(request:Request)=>{
    calls++;expect(new URL(request.url).pathname).toBe('/readSharedQuotaExecutionBasis');
    expect(await request.json()).toEqual({accountId:f.machine.accountId,childId:f.childId,date:'2026-09-27',
      ownSourceKey,offset:0,limit:50,expectedRevision:null});
    if(mode==='version')return Response.json({privateDetail:'not forwarded'},{status:409});
    if(mode==='failure')throw Error('private database detail');
    if(mode==='oversize')return new Response(new ReadableStream({
      start(controller){controller.enqueue(new Uint8Array(262145));},cancel(){cancelled=true;}}));
    if(mode==='json')return new Response('not JSON');
    if(mode==='rebind')await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
      (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
      VALUES (?1,?2,2,?3,1,'override',?4,?4)`).bind(f.machine.machineId,localUserId,f.childId,now).run();
    const result=page();
    if(mode==='child')result.profileId='other-child';
    if(mode==='scope')return Response.json({...result,authorizedScopes:[{source:'web',sourceKey:ownSourceKey,date:'2026-09-27'}]});
    if(mode==='foreign-scope')return Response.json({...result,authorizedScopes:[{source:'application',sourceKey:'b'.repeat(64),date:'2026-09-27'}]});
    return Response.json(result);
  }} as typeof env.GUARDIAN_COMPUTER_USAGE;
  const read=(suffix='',token=f.token,method='GET')=>routeV2(new Request(
    `http://runtime.test/v2/machines/shared-quota/execution-basis?localUserId=${localUserId}&assignmentVersion=1&date=2026-09-27${suffix}`,
    {method,headers:{authorization:`Bearer ${token}`}}),{...env,GUARDIAN_COMPUTER_USAGE:guardian},now);
  const response=await read();expect(response?.status).toBe(200);expect(await response?.json()).toEqual(page());
  expect(response?.headers.get('cache-control')).toBe('no-store');
  const activity=await env.RUNTIME_DB.prepare('SELECT last_seen_at_ms FROM runtime_machines_v2 WHERE id=?1').bind(f.machine.machineId).first<{last_seen_at_ms:number}>();
  expect(activity?.last_seen_at_ms).toBe(start);
  for(const suffix of ['&childId=other','&sourceKey=other','&date=2026-09-26','&offset=1','&limit=101','&revision=bad'])
    await expect(read(suffix)).rejects.toMatchObject({status:400,code:'INVALID_REQUEST'});
  await expect(read('',randomToken(''))).rejects.toMatchObject({status:401});
  expect((await read('',f.token,'POST'))?.status).toBe(405);expect(calls).toBe(1);
  for(const invalid of ['child','scope','foreign-scope','oversize','json','failure']){
    mode=invalid;await expect(read()).rejects.toMatchObject({status:503,code:'SHARED_EXECUTION_BASIS_UNAVAILABLE'});
  }
  expect(cancelled).toBe(true);
  mode='version';await expect(read()).rejects.toMatchObject({status:409,code:'EXECUTION_BASIS_VERSION_CHANGED'});
  mode='rebind';await expect(read()).rejects.toMatchObject({status:409,code:'SHARED_ACCESS_BINDING_CHANGED'});
  const before=calls;await expect(read()).rejects.toMatchObject({status:403,code:'SHARED_ACCESS_ASSIGNMENT_UNAVAILABLE'});expect(calls).toBe(before);
});
it('execution basis rejects a revoked machine after the internal read', async()=>{
  const f=await fixture();
  const guardian={fetch:async()=>{
    await env.RUNTIME_DB.prepare('UPDATE runtime_machines_v2 SET revoked_at_ms=?1 WHERE id=?2').bind(now,f.machine.machineId).run();
    return Response.json({schemaVersion:1,profileId:f.childId,basisRevision:'a'.repeat(64),policyRevision:'profile-config:7',
      fromDate:'2026-09-21',toDate:'2026-09-27',days:[],authorizedScopes:[],page:{offset:0,limit:50,total:0,nextOffset:null,items:[]}});
  },connect:env.GUARDIAN_COMPUTER_USAGE.connect} satisfies typeof env.GUARDIAN_COMPUTER_USAGE;
  await expect(routeV2(new Request(`http://runtime.test/v2/machines/shared-quota/execution-basis?localUserId=${localUserId}&assignmentVersion=1&date=2026-09-27`,
    {headers:{authorization:`Bearer ${f.token}`}}),{...env,GUARDIAN_COMPUTER_USAGE:guardian},now)).rejects.toMatchObject({status:401});
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
it('checks shared contribution against the published immutable account before any policy publication', async () => {
  const f=await fixture(),old=await account();
  const {manifestHash:ignored,rowCount:oldRows,chunkCount:oldChunks,rowsHash:oldRowsHash,...header}=old.manifest;
  const snapshot=await createUsageAccount({...header,associationVersion:'association-v1'},
    old.chunks.flatMap(chunk=>chunk.rows));
  const pending=await upload(f,snapshot);
  await commitApplicationAccount(env.RUNTIME_DB,f.machine,pending.manifestId,now);
  const contribution={schemaVersion:1,source:'application',date:snapshot.manifest.date,
    revision:'contribution-v1',statisticsRevision:snapshot.manifest.manifestHash,
    correctionRevision:'0',productAssociationVersion:'association-v1',policyRevision:'profile-config:1',
    settledAtMs:now,complete:true,reasonCodes:[],bucketsMs:{study:1000,composite:0,rest:0},
    applicationClassesMs:{study:1000,composite:0,restrictedEntertainment:0,unclassified:0,other:0},
    chromeExcludedMs:0,chromeIncludedInApplicationMs:0};
  const send=(revisionOrdinal:number,change:Record<string,unknown>={})=>receiveApplicationSharedQuota(env.RUNTIME_DB,
    f.machine,{schemaVersion:1,localUserId,assignmentVersion:1,revisionOrdinal,
      contribution:{...contribution,...change}},now);
  expect(await send(1)).toMatchObject({received:true,published:false});
  expect((await checkApplicationSharedQuotaSource(env.RUNTIME_DB,f.machine.machineId,localUserId,1,
    snapshot.manifest.date)).reasonCode).toBe('APPLICATION_ACCOUNT_NOT_PUBLISHED');
  expect(await reconcileApplicationSharedQuotaEvidence(env.RUNTIME_DB,now,f.machine.machineId))
    .toEqual({processed:1,verified:0});
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_account_publications_v1
    (machine_id,local_user_id,assignment_version,account_id,child_id,date,revision,manifest_id,source_revision,published_at_ms)
    SELECT machine_id,local_user_id,assignment_version,account_id,child_id,date,revision,id,'source-v1',?2
    FROM runtime_application_account_manifests_v1 WHERE id=?1`).bind(pending.manifestId,now).run();
  expect(await checkApplicationSharedQuotaSource(env.RUNTIME_DB,f.machine.machineId,localUserId,1,
    snapshot.manifest.date)).toMatchObject({sourceVerified:true,policyVerified:false,
      reasonCode:'SHARED_POLICY_NOT_VERIFIED'});
  expect(await reconcileApplicationSharedQuotaEvidence(env.RUNTIME_DB,now+301_000,f.machine.machineId))
    .toEqual({processed:1,verified:1});
  const shared=await readApplicationSharedQuotaContributions(env.RUNTIME_DB,f.machine.accountId,f.childId,snapshot.manifest.date);
  expect(shared).toMatchObject({complete:true,expectedScopeCount:1,verifiedScopeCount:1,reasonCodes:[]});
  expect(shared.contributions).toHaveLength(1);
  expect(shared.contributions[0].contribution).toMatchObject({source:'application',sourceKey:expect.any(String),
    policyRevision:'profile-config:1',complete:true});
  expect(JSON.stringify(shared)).not.toContain(localUserId);
  expect(JSON.stringify(shared)).not.toContain(f.machine.machineId);
  expect(await env.RUNTIME_DB.prepare(`SELECT source_verified,chrome_included_ms,statistics_manifest_hash
    FROM runtime_application_shared_quota_verified_v1 WHERE machine_id=?1`).bind(f.machine.machineId).first())
    .toEqual({source_verified:1,chrome_included_ms:0,statistics_manifest_hash:snapshot.manifest.manifestHash});
  expect(await readVerifiedChromeMarginals(env.RUNTIME_DB,f.machine.accountId,f.childId,
    snapshot.manifest.date,snapshot.manifest.date)).toHaveLength(1);
  expect(await readCoveredChromeDeduction(env.RUNTIME_DB,f.machine.accountId,f.childId,f.machine.machineId,
    snapshot.manifest.date,snapshot.manifest.date,1501)).toBe(0);
  await send(2,{statisticsRevision:'wrong-statistics'});
  expect(await readApplicationSharedQuotaContributions(env.RUNTIME_DB,f.machine.accountId,f.childId,snapshot.manifest.date))
    .toMatchObject({complete:false,expectedScopeCount:1,verifiedScopeCount:0});
  expect(await readVerifiedChromeMarginals(env.RUNTIME_DB,f.machine.accountId,f.childId,
    snapshot.manifest.date,snapshot.manifest.date)).toEqual([]);
  expect(await readCoveredChromeDeduction(env.RUNTIME_DB,f.machine.accountId,f.childId,f.machine.machineId,
    snapshot.manifest.date,snapshot.manifest.date,1501)).toBeNull();
  expect((await checkApplicationSharedQuotaSource(env.RUNTIME_DB,f.machine.machineId,localUserId,1,
    snapshot.manifest.date)).reasonCode).toBe('SHARED_QUOTA_SOURCE_VERSION_MISMATCH');
  expect(await reconcileApplicationSharedQuotaEvidence(env.RUNTIME_DB,now+302_000,f.machine.machineId))
    .toEqual({processed:1,verified:0});
  await send(3,{applicationClassesMs:{...contribution.applicationClassesMs,study:1502}});
  expect((await checkApplicationSharedQuotaSource(env.RUNTIME_DB,f.machine.machineId,localUserId,1,
    snapshot.manifest.date)).reasonCode).toBe('SHARED_QUOTA_CONTRIBUTION_OUT_OF_RANGE');
});
it('keeps Chrome display deduction unknown when its optional evidence table is unavailable', async () => {
  const unavailable={prepare(){throw new Error('no such table: runtime_application_shared_quota_verified_v1');}} as unknown as D1Database;
  expect(await readCoveredChromeDeduction(unavailable,'account','child','machine','2026-09-27','2026-09-27',1501))
    .toBeNull();
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
    chunkRows:100,maxRows:10000,acceptedAlgorithms:['windows-application-v1','macos-application-v1','windows-application-seconds-v2','macos-application-seconds-v2','windows-application-v3-only-seconds-v1','macos-application-v3-only-seconds-v1','application-instance-seconds-v1'],capabilities:['application-usage-projection-v1','application-statistics-seconds-v2','application-statistics-child-scope-v1','application-instance-statistics-v1','application-product-projection-upload-v1']});
  const unavailable={prepare(){return {async first(){return null;},bind(){return {async all(){return {results:[]};}};}};}} as unknown as D1Database;
  const disabled=await routeApplicationAccounts(new Request(url),unavailable,f.machine,now);
  expect(await disabled.json()).toMatchObject({enabled:false,
    capabilities:['application-usage-projection-v1','application-statistics-seconds-v2','application-statistics-child-scope-v1']});
  await expect(routeApplicationAccounts(new Request(`http://runtime.test/v2/machines/application-accounts/manifests/aa1_${'a'.repeat(64)}/product-projection`,
    {method:'PUT',body:'{}'}),unavailable,f.machine,now)).rejects.toMatchObject({status:503,code:'APPLICATION_PRODUCT_STORAGE_UNAVAILABLE'});
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
    expect(result.capabilities.includes('application-instance-statistics-v1')).toBe(!missing.startsWith('runtime_retired_'));
    expect(result.acceptedAlgorithms.includes('application-instance-seconds-v1')).toBe(!missing.startsWith('runtime_retired_'));
  }
});

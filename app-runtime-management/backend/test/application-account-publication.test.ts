import {env} from 'cloudflare:workers';
import {expect,it} from 'vitest';
import {createUsageAccount,hashUsageAccountValue,type UsageAccountRow} from '@timeonchrome/app-runtime-contracts/usage-account';
import {beginApplicationAccount,putApplicationAccountChunk,commitApplicationAccount,readApplicationAccountStatus} from '../src/applicationAccounts';
import {publishApplicationAccounts} from '../src/applicationAccountPublication';
import {getAppPolicy,queryAppUsage,refreshHistoricalProductIdentityProjection} from '../src/appPolicy';
import {sha256Hex} from '../src/crypto';
import type {MachineSelfResponse} from '../src/contracts';
import {readPersistentApplicationUsage,rebuildApplicationStatistics,type StatisticsValue} from '../src/applicationStatistics';
const DAY=86400000,start=Date.parse('2026-09-27T00:00:00+08:00'),now=start+DAY;
const user='a'.repeat(64),projection='b'.repeat(64);
async function fixture(platform:MachineSelfResponse['platform']='windows'){
  const machineId=crypto.randomUUID(),accountId=crypto.randomUUID(),child=crypto.randomUUID();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machines_v2(id,account_id,platform,token_hash,last_seen_at_ms,created_at_ms,updated_at_ms)
    VALUES(?1,?2,?3,?1,0,0,0)`).bind(machineId,accountId,platform).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
    (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
    VALUES(?1,?2,1,?3,1,'default',?4,?4)`).bind(machineId,user,child,start).run();
  const policy=await getAppPolicy(env.RUNTIME_DB,accountId,child);
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_child_app_policy_versions_v1
    (account_id,child_id,version,payload_json,payload_hash,effective_at_ms,created_at_ms) VALUES(?1,?2,1,?3,'fixture',0,0)`)
    .bind(accountId,child,JSON.stringify({...policy,classifications:[{platform,runtimeIdentity:'leaf',displayName:null,classification:'study'}],productIdentityProjection:{version:projection,knowledgeVersion:1,
      items:[{platform,runtimeIdentity:'leaf',associationKey:`product:${platform}:test`,productId:'test',canonicalName:'测试产品',status:'confirmed',reasonCode:'APPROVED_PRODUCT'}]}})).run();
  const machine:MachineSelfResponse={machineId,accountId,platform,displayName:null,defaultChildId:child,desiredPolicyVersion:1,
    appliedPolicyVersion:1,policyState:'applied',revoked:false};
  return {machine,child};
}
async function fact(f:Awaited<ReturnType<typeof fixture>>,id='one',session='session',category='study'){
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_usage_segments_v2
    (id,machine_id,local_user_id,assignment_version,child_id,runtime_session_id,platform,runtime_identity,display_name,
     start_at_ms,end_at_ms,duration_ms,end_reason,content_hash,uploaded_at_ms,accounting_schema_version,channel,clock_epoch_id,
     start_wall_time_ms,end_wall_time_ms,start_monotonic_time_ms,end_monotonic_time_ms,monotonic_duration_ms,estimated,
     app_policy_version,application_classification)
    VALUES(?1,?2,?3,1,?4,?5,?9,'leaf','测试产品',1000,2501,1501,'fixture',?1,?6,2,'active','epoch',?7,?7+1501,1000,2501,1501,0,1,?8)`)
    .bind(id,f.machine.machineId,user,f.child,session,start+1501,start,category,f.machine.platform).run();
}
async function drainFixtureStatistics(f:Awaited<ReturnType<typeof fixture>>) {
  // Parallel test files share the fixture DB: drain only this account/child's
  // scopes instead of spending its six batches on unrelated fixture queues.
  const scopes=await env.RUNTIME_DB.prepare('SELECT DISTINCT scope_key FROM runtime_application_statistics_queue_v1 WHERE account_id=?1 AND child_id=?2')
    .bind(f.machine.accountId,f.child).all<{scope_key:string}>();
  for(const scope of scopes.results)for(let i=0;i<6;i++)await rebuildApplicationStatistics(env.RUNTIME_DB,now,scope.scope_key);
}
async function upload(f:Awaited<ReturnType<typeof fixture>>,revision=1,options:{empty?:boolean;classification?:string;duration?:number;
  associationVersion?:string|null;correctionVersion?:number;complete?:boolean;count?:number;algorithm?:string;
  associationKey?:string;reasonCodes?:string[];cutoff?:number;date?:string;hour?:number;policyVersions?:number[]}={}){
  const duration=options.empty?0:options.duration??1501;
  const row=(kind:UsageAccountRow['kind'],hour:number|null,category:string|null=null,subjectKey:string|null=null,displayName:string|null=null,d=duration):UsageAccountRow=>
    ({kind,hour,category,subjectKey,displayName,duration:d});
  const hour=options.hour??0,key=options.associationKey??`product:${f.machine.platform}:test`;
  const rows=[row('total',null),...Array.from({length:24},(_,h)=>row('total',h,null,null,null,h===hour?duration:0))];
  if(!options.empty){rows.push(row('category',null,options.classification??'study'),row('category',hour,options.classification??'study'),
    row('subject',null,null,await sha256Hex(key),'测试产品'),row('subject',hour,null,await sha256Hex(key),'测试产品'));}
  const date=options.date??'2026-09-27',cutoff=options.cutoff??Date.parse(date+'T00:00:00+08:00')+DAY;
  const receivedAt=Math.max(now,cutoff);
  const account=await createUsageAccount({schemaVersion:1,sourceKind:'application',durationUnit:'milliseconds',timezone:'Asia/Shanghai',
    date,revision,generatedAtMs:cutoff,settledThroughMs:cutoff,algorithmVersion:options.algorithm??`${f.machine.platform}-application-v1`,policyVersions:options.policyVersions??(options.empty?[]:[1]),
    associationVersion:options.associationVersion===undefined?projection:options.associationVersion,correctionVersion:options.correctionVersion??0,
    rawFactCount:options.count??(options.empty?0:1),rawFactHash:'c'.repeat(64),complete:options.complete??true,reasonCodes:options.reasonCodes??(options.complete===false?['POLICY_HISTORY_MISSING']:[])},rows);
  const r=await beginApplicationAccount(env.RUNTIME_DB,f.machine,{localUserId:user,assignmentVersion:1,manifest:account.manifest},receivedAt);
  for(const c of account.chunks)await putApplicationAccountChunk(env.RUNTIME_DB,f.machine,r.manifestId,c.chunkIndex,{rows:c.rows,chunkHash:c.chunkHash});
  await commitApplicationAccount(env.RUNTIME_DB,f.machine,r.manifestId,receivedAt);
  return r;
}
it.each(['incomplete','stale association'] as const)('cron prioritizes a complete current snapshot over older %s backlog without increasing its budget',async(kind)=>{
  const older=[];
  for(let i=0;i<2;i++){
    const f=await fixture();
    const r=await upload(f,1,{empty:true,...(kind==='incomplete'?{complete:false}:{associationVersion:'d'.repeat(64)})});
    await env.RUNTIME_DB.prepare('UPDATE runtime_application_account_manifests_v1 SET received_at_ms=?2 WHERE id=?1')
      .bind(r.manifestId,now-30000+i).run();
    older.push({f,r});
  }
  const f=await fixture();await fact(f,crypto.randomUUID());const fresh=await upload(f);
  const before=await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?1').bind(f.machine.machineId).all();
  const result=await publishApplicationAccounts(env.RUNTIME_DB,now);
  expect(result.processed).toBeLessThanOrEqual(2);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,fresh.manifestId)).toMatchObject({published:true});
  for(const {f:oldFixture,r} of older){
    // Check the rejected backlog explicitly after proving the fresh cron publication.
    // This also leaves every synthetic backlog item in cooldown in the shared test DB.
    await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
    expect(await readApplicationAccountStatus(env.RUNTIME_DB,oldFixture.machine,r.manifestId)).toMatchObject({published:false,
      publicationErrorCode:kind==='incomplete'?'APPLICATION_ACCOUNT_INCOMPLETE':'APPLICATION_ACCOUNT_ASSOCIATIONS_PENDING'});
  }
  expect((await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?1').bind(f.machine.machineId).all()).results).toEqual(before.results);
});
it.each(['windows','macos'] as const)('missing policy version retains real 51.125 seconds with latest current-week classification: %s',async(platform)=>{
  const f=await fixture(platform);await fact(f,crypto.randomUUID());
  await env.RUNTIME_DB.prepare(`UPDATE runtime_usage_segments_v2 SET app_policy_version=NULL,application_classification=NULL,
    duration_ms=51125,end_at_ms=start_at_ms+51125,end_wall_time_ms=start_wall_time_ms+51125,
    end_monotonic_time_ms=start_monotonic_time_ms+51125,monotonic_duration_ms=51125 WHERE machine_id=?1`)
    .bind(f.machine.machineId).run();
  const before=(await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?1').bind(f.machine.machineId).all()).results;
  const old=await upload(f,1,{duration:51125,complete:false,policyVersions:[]});
  await publishApplicationAccounts(env.RUNTIME_DB,start+60000,old.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,old.manifestId))
    .toMatchObject({published:false,publicationErrorCode:'APPLICATION_ACCOUNT_INCOMPLETE'});
  for(const [i,classification] of ['study','composite','unclassified'].entries()){
    await env.RUNTIME_DB.prepare(`UPDATE runtime_child_app_policy_versions_v1 SET payload_json=json_set(payload_json,'$.classifications',json(?3))
      WHERE account_id=?1 AND child_id=?2`).bind(f.machine.accountId,f.child,JSON.stringify(classification==='unclassified'?[]:
        [{platform,runtimeIdentity:'leaf',displayName:null,classification}])).run();
    const current=await upload(f,i+2,{duration:51125,classification,policyVersions:i===0?[]:[98765]});
    await publishApplicationAccounts(env.RUNTIME_DB,start+60000+i,current.manifestId);
    expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,current.manifestId)).toMatchObject({published:true});
  }
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,old.manifestId)).toMatchObject({published:false});
  expect((await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?1').bind(f.machine.machineId).all()).results).toEqual(before);
});
it('historical missing classification remains unknown with valid milliseconds; current policy is not applied retroactively',async()=>{
  const f=await fixture();await fact(f,crypto.randomUUID());
  await env.RUNTIME_DB.prepare('UPDATE runtime_usage_segments_v2 SET app_policy_version=NULL,application_classification=NULL WHERE machine_id=?1')
    .bind(f.machine.machineId).run();
  const r=await upload(f,1,{classification:'historicalUnknown',policyVersions:[]});
  await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
});
it('receipt does not publish; exact approved source/management verification publishes separate watermark',async()=>{
  const f=await fixture();await fact(f);const r=await upload(f);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({received:true,published:false});
  expect(await publishApplicationAccounts(env.RUNTIME_DB,now)).toMatchObject({published:1});
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({received:true,published:true,publishStatus:'published',publicationErrorCode:null});
  expect(await publishApplicationAccounts(env.RUNTIME_DB,now+1)).toMatchObject({processed:0});
});
async function setIdentity(f:Awaited<ReturnType<typeof fixture>>,status:'unresolved'|'conflict',associationKey='windows\nleaf',productId:string|null=null){
  const policy=await getAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.child);
  await env.RUNTIME_DB.prepare(`UPDATE runtime_child_app_policy_versions_v1 SET payload_json=?3
    WHERE account_id=?1 AND child_id=?2 AND version=1`)
    .bind(f.machine.accountId,f.child,JSON.stringify({...policy,productIdentityProjection:{version:projection,knowledgeVersion:1,
      items:[{platform:'windows',runtimeIdentity:'leaf',associationKey,productId,canonicalName:'测试产品',status,
        reasonCode:status==='conflict'?'IDENTITY_CONFLICT':'IDENTITY_UNRESOLVED'}]}})).run();
}
it('complete standalone usage publishes without pretending product identity is confirmed or changing source facts',async()=>{
  const f=await fixture();await fact(f);await setIdentity(f,'unresolved');
  const before=await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?1').bind(f.machine.machineId).all();
  const r=await upload(f,1,{associationKey:'windows\nleaf'});await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({received:true,published:true});
  const read=()=>readPersistentApplicationUsage(env.RUNTIME_DB,f.machine.accountId,f.child,start,now,{},undefined,now);
  await read().catch(()=>{});
  const scope=await hashUsageAccountValue([f.machine.accountId,f.child,{machineId:null,localUserId:null,platform:null},0,DAY]);
  for(let i=0;i<6;i++)await rebuildApplicationStatistics(env.RUNTIME_DB,now,scope);
  expect((await env.RUNTIME_DB.prepare('SELECT date,error_code FROM runtime_application_statistics_queue_v1 WHERE account_id=?1 AND error_code IS NOT NULL').bind(f.machine.accountId).all()).results).toEqual([]);
  const result=await read();expect(result.value.totalDurationMs).toBe(1501);expect(result.statistics.producer).toBe('native');
  expect(result.statistics.productApplications).toEqual([{key:await sha256Hex('windows\nleaf'),displayName:'测试产品',durationMs:1501}]);
  expect(result.statistics.productClassifications).toEqual({[await sha256Hex('windows\nleaf')]:['study']});
  expect((await getAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.child)).productIdentityProjection?.items[0])
    .toMatchObject({status:'unresolved',productId:null,associationKey:'windows\nleaf'});
  expect((await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?1').bind(f.machine.machineId).all()).results)
    .toEqual(before.results);
});
it.each([
  ['unresolved','windows\nother',null],['unresolved','windows\nleaf','unapproved-product'],['conflict','windows\nleaf',null],
] as const)('does not authorize ambiguous or cross-identity association: %s %s %s',async(status,associationKey,productId)=>{
  const f=await fixture();await fact(f);await setIdentity(f,status,associationKey,productId);
  const r=await upload(f,1,{associationKey});await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId))
    .toMatchObject({published:false,publicationErrorCode:'APPLICATION_ACCOUNT_ASSOCIATIONS_PENDING'});
});
it('an old incomplete identity receipt stays unpublished and requires a new complete revision',async()=>{
  const f=await fixture();await fact(f);await setIdentity(f,'unresolved');
  const old=await upload(f,1,{associationKey:'windows\nleaf',complete:false,reasonCodes:['PRODUCT_IDENTITY_UNRESOLVED']});
  await publishApplicationAccounts(env.RUNTIME_DB,now,old.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,old.manifestId))
    .toMatchObject({received:true,published:false,publicationErrorCode:'APPLICATION_ACCOUNT_ASSOCIATIONS_PENDING'});
  const fresh=await upload(f,2,{associationKey:'windows\nleaf'});await publishApplicationAccounts(env.RUNTIME_DB,now+1,fresh.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,fresh.manifestId)).toMatchObject({published:true});
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,old.manifestId)).toMatchObject({published:false});
});
it('raw facts arriving later permit retry without resending or changing a received snapshot',async()=>{
  const f=await fixture(),r=await upload(f);await publishApplicationAccounts(env.RUNTIME_DB,now);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({received:true,published:false,publicationErrorCode:'APPLICATION_ACCOUNT_FACTS_PENDING'});
  // Other negative cases leave retryable receipts in the shared fixture DB.
  // Target this receipt so the two-item cron limit does not make its retry nondeterministic.
  await fact(f);await publishApplicationAccounts(env.RUNTIME_DB,now+300001,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
});
it('new usage after a frozen cutoff does not prevent publication of the exact earlier snapshot',async()=>{
  const f=await fixture();await fact(f);
  const r=await upload(f,1,{cutoff:start+10000});
  await fact(f,'after-cutoff');
  await env.RUNTIME_DB.prepare(`UPDATE runtime_usage_segments_v2
    SET start_wall_time_ms=?2,end_wall_time_ms=?2+1501,
      start_monotonic_time_ms=21000,end_monotonic_time_ms=22501
    WHERE machine_id=?1 AND id='after-cutoff'`).bind(f.machine.machineId,start+20000).run();
  const before=(await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?1')
    .bind(f.machine.machineId).all()).results;
  await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId))
    .toMatchObject({published:true,publicationErrorCode:null});
  expect((await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?1')
    .bind(f.machine.machineId).all()).results).toEqual(before);
  const read=()=>readPersistentApplicationUsage(env.RUNTIME_DB,f.machine.accountId,f.child,start,now,{},undefined,now);
  await read().catch(()=>{});await drainFixtureStatistics(f);
  const latest=await read();expect(latest.value.totalDurationMs).toBe(1501);
  expect(latest.statistics.producer).toBe('native');
  expect(latest.statistics.stale).toBe(true);
  expect(latest.statistics.settledThroughByDate).toEqual([{date:'2026-09-27',settledThroughMs:start+10000}]);
  expect(latest.value.categories.find(c=>c.classification==='study')?.durationMs).toBe(1501);
  // Use the exact verified prefix, never claim that it covers the later fact.
  expect((await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?1')
    .bind(f.machine.machineId).all()).results).toEqual(before);
});
it('late facts within the cutoff still prevent publication even when their usage overlaps existing facts',async()=>{
  const f=await fixture();await fact(f);const r=await upload(f,1,{cutoff:start+10000});
  await fact(f,'late-within-cutoff','other-session');
  await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId))
    .toMatchObject({published:false,publicationErrorCode:'APPLICATION_ACCOUNT_FACTS_PENDING'});
});
it('a segment crossing the cutoff is not partially settled or clipped to satisfy a snapshot',async()=>{
  const f=await fixture();await fact(f);const r=await upload(f,1,{cutoff:start+1000,duration:1000});
  await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId))
    .toMatchObject({published:false,publicationErrorCode:'APPLICATION_ACCOUNT_FACTS_PENDING'});
});
it('an exact mapped cutoff includes the settled fact despite later wall-clock sampling',async()=>{
  const f=await fixture();await fact(f);
  await env.RUNTIME_DB.prepare('UPDATE runtime_usage_segments_v2 SET end_wall_time_ms=end_wall_time_ms+13 WHERE machine_id=?1')
    .bind(f.machine.machineId).run();
  const r=await upload(f,1,{cutoff:start+1501});await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
});
it('an exact empty frozen snapshot does not claim later nonzero usage was zero',async()=>{
  const f=await fixture();const r=await upload(f,1,{cutoff:start,empty:true});await fact(f);
  await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
  const read=()=>readPersistentApplicationUsage(env.RUNTIME_DB,f.machine.accountId,f.child,start,now,{},undefined,now);
  await read().catch(()=>{});await drainFixtureStatistics(f);
  expect((await read()).value.totalDurationMs).toBe(1501);
});
it('valid hash does not authorize forged classification or duration',async()=>{
  const f=await fixture();await fact(f);const forged=await upload(f,1,{classification:'blocked'});await publishApplicationAccounts(env.RUNTIME_DB,now);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,forged.manifestId)).toMatchObject({published:false,publicationErrorCode:'APPLICATION_ACCOUNT_STATISTICS_MISMATCH'});
  const wrong=await upload(f,2,{duration:1502});await publishApplicationAccounts(env.RUNTIME_DB,now+1);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,wrong.manifestId)).toMatchObject({published:false,publicationErrorCode:'APPLICATION_ACCOUNT_STATISTICS_MISMATCH'});
});
it('incomplete zero is never published while verified empty initialized assignment may publish zero',async()=>{
  const f=await fixture(),r=await upload(f,1,{empty:true,complete:false});await publishApplicationAccounts(env.RUNTIME_DB,now);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:false,publicationErrorCode:'APPLICATION_ACCOUNT_INCOMPLETE'});
  const zero=await upload(f,2,{empty:true});await publishApplicationAccounts(env.RUNTIME_DB,now+1);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,zero.manifestId)).toMatchObject({published:true});
});
it('stale association or correction version cannot publish and a previous good publication survives',async()=>{
  const f=await fixture();await fact(f);const good=await upload(f);await publishApplicationAccounts(env.RUNTIME_DB,now);
  const stale=await upload(f,2,{associationVersion:'d'.repeat(64)});await publishApplicationAccounts(env.RUNTIME_DB,now+1);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,stale.manifestId)).toMatchObject({published:false,publicationErrorCode:'APPLICATION_ACCOUNT_ASSOCIATIONS_PENDING'});
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,good.manifestId)).toMatchObject({published:true});
  const correction=await upload(f,3,{correctionVersion:2});await publishApplicationAccounts(env.RUNTIME_DB,now+2);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,correction.manifestId)).toMatchObject({published:false,publicationErrorCode:'APPLICATION_ACCOUNT_CORRECTIONS_PENDING'});
});
it('Service user-level union is authoritative across sessions; legacy quota remains unchanged',async()=>{
  // A finite quota proves remaining milliseconds still use the old quota usage.
  const f=await fixture();await fact(f);await fact(f,'parallel','other-session');const r=await upload(f,1,{count:2});await publishApplicationAccounts(env.RUNTIME_DB,now);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
  await env.RUNTIME_DB.prepare(`UPDATE runtime_child_app_policy_versions_v1 SET payload_json=
    json_set(payload_json,'$.quotas.dailyCategoryMinutes.study',1) WHERE account_id=?1 AND child_id=?2`)
    .bind(f.machine.accountId,f.child).run();
  const original=await queryAppUsage(env.RUNTIME_DB,f.machine.accountId,f.child,start,now,{}) as StatisticsValue;
  expect(original.totalDurationMs).toBe(3002);
  const read=()=>readPersistentApplicationUsage(env.RUNTIME_DB,f.machine.accountId,f.child,start,now,{},undefined,now);
  await read().catch(()=>{});await drainFixtureStatistics(f);
  const result=await read();expect(result.value.totalDurationMs).toBe(1501);expect(result.statistics.producer).toBe('native');
  expect(result.value.categories[0]?.quota).toEqual(original.categories[0]?.quota);
  expect(result.value.categories[0]?.quota.remainingMs).toBe(60000-3002);
  expect(result.value.weeklyRestrictedEntertainment).toEqual(original.weeklyRestrictedEntertainment);
});
it('millisecond wall sampling difference does not reject exact monotonic statistics or accept rounded values',async()=>{
  const f=await fixture();await fact(f);
  await env.RUNTIME_DB.prepare('UPDATE runtime_usage_segments_v2 SET end_wall_time_ms=end_wall_time_ms+13 WHERE machine_id=?1')
    .bind(f.machine.machineId).run();
  const good=await upload(f);await publishApplicationAccounts(env.RUNTIME_DB,now,good.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,good.manifestId)).toMatchObject({published:true});
  const wrong=await upload(f,2,{duration:1514});await publishApplicationAccounts(env.RUNTIME_DB,now,wrong.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,wrong.manifestId))
    .toMatchObject({published:false,publicationErrorCode:'APPLICATION_ACCOUNT_STATISTICS_MISMATCH'});
});
it('uses a stable previous-day anchor and includes a neighboring fact mapped across midnight',async()=>{
  const f=await fixture();await fact(f,'anchor');
  await env.RUNTIME_DB.prepare(`UPDATE runtime_usage_segments_v2 SET start_wall_time_ms=?2,end_wall_time_ms=?2+100,
    start_monotonic_time_ms=0,end_monotonic_time_ms=100,monotonic_duration_ms=100 WHERE machine_id=?1`)
    .bind(f.machine.machineId,start-1000).run();
  await fact(f,'neighbor');
  await env.RUNTIME_DB.prepare(`UPDATE runtime_usage_segments_v2 SET start_wall_time_ms=?2,end_wall_time_ms=?2+1501,
    start_monotonic_time_ms=1000,end_monotonic_time_ms=2501 WHERE machine_id=?1 AND id='neighbor'`)
    .bind(f.machine.machineId,start+13).run();
  // The previous-day anchor belongs to this snapshot's expanded source window but
  // contributes no usage today; normalized neighbor is exactly [midnight,+1501].
  const r=await upload(f,1,{count:2});await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
});
it('rejects clock jumps instead of using the clock margin as a statistics tolerance',async()=>{
  const f=await fixture();await fact(f);
  await env.RUNTIME_DB.prepare('UPDATE runtime_usage_segments_v2 SET end_wall_time_ms=end_wall_time_ms+2001 WHERE machine_id=?1')
    .bind(f.machine.machineId).run();
  const r=await upload(f);await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId))
    .toMatchObject({published:false,publicationErrorCode:'APPLICATION_ACCOUNT_CLOCK_ANCHOR_MISSING'});
});
it('historical wixstdba receives standalone projection through immutable policy refresh, without configuration changes',async()=>{
  const f=await fixture();await fact(f);
  await env.RUNTIME_DB.prepare(`UPDATE runtime_usage_segments_v2 SET runtime_identity='wixstdba-fixture',display_name='wixstdba'
    WHERE machine_id=?1`).bind(f.machine.machineId).run();
  const before=await getAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.child);
  const raw=await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?1').bind(f.machine.machineId).all();
  expect(await refreshHistoricalProductIdentityProjection(env.RUNTIME_DB,f.machine.accountId,f.child,now)).toBe(true);
  const after=await getAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.child);
  expect(after.version).toBe(before.version+1);
  expect(after.productIdentityProjection?.items.find(item=>item.runtimeIdentity==='wixstdba-fixture'))
    .toMatchObject({associationKey:'windows\nwixstdba-fixture',productId:null,status:'unresolved',canonicalName:'wixstdba'});
  for(const field of ['classifications','quotas','weekReclassification','resolvedApplications'] as const)expect(after[field]).toEqual(before[field]);
  expect((await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?1').bind(f.machine.machineId).all()).results).toEqual(raw.results);
  expect(await refreshHistoricalProductIdentityProjection(env.RUNTIME_DB,f.machine.accountId,f.child,now+1)).toBe(false);
  const foreign=await fixture();
  expect(await refreshHistoricalProductIdentityProjection(env.RUNTIME_DB,foreign.machine.accountId,foreign.child,now)).toBe(false);
});
it('publication transaction failure keeps receipt and previous head intact',async()=>{
  const f=await fixture();await fact(f);const r=await upload(f);
  await env.RUNTIME_DB.prepare(`CREATE TRIGGER test_publication_failure BEFORE INSERT ON runtime_application_account_publication_checks_v1
    WHEN NEW.error_code IS NULL BEGIN SELECT RAISE(ABORT,'TEST_PUBLICATION_FAILURE');END`).run();
  try{await publishApplicationAccounts(env.RUNTIME_DB,now);expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId))
    .toMatchObject({received:true,published:false,publicationErrorCode:'APPLICATION_ACCOUNT_PUBLICATION_FAILED'});}
  finally{await env.RUNTIME_DB.prepare('DROP TRIGGER test_publication_failure').run();}
  await publishApplicationAccounts(env.RUNTIME_DB,now+300001,r.manifestId);expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
});
it('Native publication replaces one producer for a Child day and is never added to legacy totals',async()=>{
  const f=await fixture();await fact(f);const r=await upload(f);await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  const read=()=>readPersistentApplicationUsage(env.RUNTIME_DB,f.machine.accountId,f.child,start,now,{},undefined,now);
  await read().catch(()=>{});await drainFixtureStatistics(f);
  const value=await read();expect(value.value.totalDurationMs).toBe(1501);expect(value.statistics.producer).toBe('native');
  expect(value.statistics.productApplications).toEqual([{key:await sha256Hex('product:windows:test'),displayName:'测试产品',durationMs:1501}]);
  await fact(f,'late','other-session');await read();await drainFixtureStatistics(f);
  const late=await read();expect(late.value.totalDurationMs).toBe(1501);expect(late.statistics.producer).toBe('native');
  expect(late.statistics.stale).toBe(true);
  expect(late.statistics.productApplications).toEqual(value.statistics.productApplications);
  // A newly discovered fact inside the frozen range fails exact revalidation.
  // Keep the previously verified cache as updating, never promote the new range.
  expect((await env.RUNTIME_DB.prepare(`SELECT DISTINCT error_code FROM runtime_application_statistics_queue_v1
    WHERE account_id=?1 AND child_id=?2`).bind(f.machine.accountId,f.child).all()).results)
    .toEqual([{error_code:'APPLICATION_ACCOUNT_FACTS_PENDING'}]);
});
it('a live page rebuild prioritizes its requested Native day over incidental weekly history',async()=>{
  const f=await fixture();await fact(f,crypto.randomUUID());const r=await upload(f);
  await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  const work:Promise<unknown>[]=[];
  await readPersistentApplicationUsage(env.RUNTIME_DB,f.machine.accountId,f.child,start,now,{},job=>work.push(job),now).catch(()=>{});
  await Promise.all(work);
  const days=await env.RUNTIME_DB.prepare(`SELECT date,producer,value_json FROM runtime_application_statistics_days_v1
    WHERE account_id=?1 AND child_id=?2`).bind(f.machine.accountId,f.child).all<{date:string;producer:string;value_json:string}>();
  expect(days.results).toHaveLength(2); // Same bounded work budget, not a full-week rebuild.
  const current=days.results.find(d=>d.date==='2026-09-27');
  expect(current?.producer).toBe('native');
  expect(JSON.parse(current!.value_json).totalDurationMs).toBe(1501);
  expect((await env.RUNTIME_DB.prepare(`SELECT COUNT(*) AS n FROM runtime_application_statistics_queue_v1
    WHERE account_id=?1 AND child_id=?2 AND date<'2026-09-27'`).bind(f.machine.accountId,f.child).first<{n:number}>())?.n)
    .toBeGreaterThan(0);
});
it('child aggregation adds devices; identical wall times on two machines are not globally unioned',async()=>{
  const f=await fixture();await fact(f);const one=await upload(f);await publishApplicationAccounts(env.RUNTIME_DB,now,one.manifestId);
  const second=crypto.randomUUID();await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machines_v2(id,account_id,platform,token_hash,last_seen_at_ms,created_at_ms,updated_at_ms)
    VALUES(?1,?2,'windows',?1,0,0,0)`).bind(second,f.machine.accountId).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
    (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
    VALUES(?1,?2,1,?3,1,'default',?4,?4)`).bind(second,user,f.child,start).run();
  const other={...f,machine:{...f.machine,machineId:second}};await fact(other);const two=await upload(other);await publishApplicationAccounts(env.RUNTIME_DB,now,two.manifestId);
  const read=()=>readPersistentApplicationUsage(env.RUNTIME_DB,f.machine.accountId,f.child,start,now,{},undefined,now);
  await read().catch(()=>{});await drainFixtureStatistics(f);
  const result=await read();expect(result.value.totalDurationMs).toBe(3002);expect(result.statistics.producer).toBe('native');
  expect(result.statistics.productApplications?.[0]?.durationMs).toBe(3002);
});
it('publication transaction queues Child day and existing filtered scopes without another page request',async()=>{
  const f=await fixture();await fact(f);
  const filters={machineId:f.machine.machineId};
  await readPersistentApplicationUsage(env.RUNTIME_DB,f.machine.accountId,f.child,start,now,filters,undefined,now).catch(()=>{});
  await drainFixtureStatistics(f);
  const r=await upload(f);await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  const dirty=await env.RUNTIME_DB.prepare(`SELECT source_revision,filters_json FROM runtime_application_statistics_queue_v1
    WHERE account_id=?1 AND child_id=?2 AND date='2026-09-27' ORDER BY filters_json`).bind(f.machine.accountId,f.child).all();
  expect(dirty.results).toHaveLength(2);
  expect(dirty.results.every(d=>d.source_revision==='publication:'+r.manifestId)).toBe(true);
  await drainFixtureStatistics(f);
  const persisted=await env.RUNTIME_DB.prepare(`SELECT producer FROM runtime_application_statistics_days_v1
    WHERE account_id=?1 AND child_id=?2 AND date='2026-09-27'`).bind(f.machine.accountId,f.child).all();
  expect(persisted.results).toHaveLength(2);expect(persisted.results.every(d=>d.producer==='native')).toBe(true);
});
it('dirty queue interruption rolls back publication while preserving received snapshot for retry',async()=>{
  const f=await fixture();await fact(f);const r=await upload(f);
  await env.RUNTIME_DB.prepare(`CREATE TRIGGER test_dirty_failure BEFORE INSERT ON runtime_application_statistics_queue_v1
    BEGIN SELECT RAISE(ABORT,'TEST_DIRTY_FAILURE');END`).run();
  try{await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
    expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({received:true,published:false});
    expect(await env.RUNTIME_DB.prepare('SELECT count(*) AS n FROM runtime_application_account_publications_v1 WHERE manifest_id=?1')
      .bind(r.manifestId).first()).toEqual({n:0});
  }finally{await env.RUNTIME_DB.prepare('DROP TRIGGER test_dirty_failure').run();}
  await publishApplicationAccounts(env.RUNTIME_DB,now+300001,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
});
it('Mac nonzero milliseconds publish and persist through the ordinary statistics reader without changing facts',async()=>{
  const f=await fixture('macos');await fact(f,crypto.randomUUID());
  const before=await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?1').bind(f.machine.machineId).all();
  const r=await upload(f);await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
  const read=()=>readPersistentApplicationUsage(env.RUNTIME_DB,f.machine.accountId,f.child,start,now,{},undefined,now);
  await read().catch(()=>{});await drainFixtureStatistics(f);
  const result=await read();expect(result.value.totalDurationMs).toBe(1501);expect(result.statistics.producer).toBe('native');
  expect(result.statistics.productApplications).toEqual([{key:await sha256Hex('product:macos:test'),displayName:'测试产品',durationMs:1501}]);
  expect(result.statistics.settledThroughByDate).toEqual([{date:'2026-09-27',settledThroughMs:now}]);
  expect((await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?1').bind(f.machine.machineId).all()).results).toEqual(before.results);
});
it('Mac overlapping settled intervals use the common exact millisecond union rather than summed segments',async()=>{
  const f=await fixture('macos');await fact(f,crypto.randomUUID());const second=crypto.randomUUID();await fact(f,second);
  await env.RUNTIME_DB.prepare(`UPDATE runtime_usage_segments_v2 SET start_wall_time_ms=?2,end_wall_time_ms=?2+1501,
    start_monotonic_time_ms=1500,end_monotonic_time_ms=3001 WHERE id=?1`).bind(second,start+500).run();
  const r=await upload(f,1,{duration:2001,count:2});await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
});
it('Mac cross-day intervals retain exact 500/1001 millisecond daily and hourly clipping',async()=>{
  const f=await fixture('macos'),id=crypto.randomUUID();await fact(f,id);
  await env.RUNTIME_DB.prepare('UPDATE runtime_usage_segments_v2 SET start_wall_time_ms=?2,end_wall_time_ms=?2+1501 WHERE id=?1')
    .bind(id,start+DAY-500).run();
  const first=await upload(f,1,{duration:500,hour:23});
  const next=await upload(f,1,{duration:1001,date:'2026-09-28'});
  await publishApplicationAccounts(env.RUNTIME_DB,now+DAY,first.manifestId);
  await publishApplicationAccounts(env.RUNTIME_DB,now+DAY,next.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,first.manifestId)).toMatchObject({published:true});
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,next.manifestId)).toMatchObject({published:true});
});
it.each([true,false])('Mac zero snapshot preserves its producer completeness: %s',async(complete)=>{
  const f=await fixture('macos'),r=await upload(f,1,{empty:true,complete});
  await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:complete,
    publicationErrorCode:complete?null:'APPLICATION_ACCOUNT_INCOMPLETE'});
});
it.each([
  ['macos','windows-application-v1'],['windows','macos-application-v1'],['macos','unknown-application-v1'],
] as const)('rejects machine/algorithm mismatch %s / %s',async(platform,algorithm)=>{
  const f=await fixture(platform);await fact(f,crypto.randomUUID());const r=await upload(f,1,{algorithm});
  await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId))
    .toMatchObject({published:false,publicationErrorCode:'APPLICATION_ACCOUNT_ALGORITHM_UNSUPPORTED'});
});
it.each([
  [{duration:1500},'APPLICATION_ACCOUNT_STATISTICS_MISMATCH'],
  [{associationVersion:'d'.repeat(64)},'APPLICATION_ACCOUNT_ASSOCIATIONS_PENDING'],
  [{correctionVersion:1},'APPLICATION_ACCOUNT_CORRECTIONS_PENDING'],
] as const)('Mac keeps exact statistic and management rejection: %s',async(options,error)=>{
  const f=await fixture('macos');await fact(f,crypto.randomUUID());const r=await upload(f,1,options);
  await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:false,publicationErrorCode:error});
});
it('Mac received snapshots retry exact facts without resending and never use another machine facts',async()=>{
  const f=await fixture('macos'),other=await fixture('macos');await fact(other,crypto.randomUUID());const r=await upload(f);
  await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId))
    .toMatchObject({published:false,publicationErrorCode:'APPLICATION_ACCOUNT_FACTS_PENDING'});
  await fact(f,crypto.randomUUID());await publishApplicationAccounts(env.RUNTIME_DB,now+300001,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
});

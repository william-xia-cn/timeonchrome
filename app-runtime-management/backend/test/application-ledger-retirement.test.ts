import {env} from 'cloudflare:workers';
import {expect,it} from 'vitest';
import {createUsageAccountV2,usageAccountDayStart,type UsageAccountRowV2} from '@timeonchrome/app-runtime-contracts/usage-account';
import type {MachineSelfResponse} from '../src/contracts';
import {beginApplicationAccount,putApplicationAccountChunk,commitApplicationAccount,readApplicationAccountStatus} from '../src/applicationAccounts';
import {publishApplicationAccounts} from '../src/applicationAccountPublication';
import {readNativeApplicationStatisticsRangeSeconds} from '../src/applicationStatisticsNative';
import {readPersistentApplicationUsage} from '../src/applicationStatistics';
import {requireApplicationLegacyEnabled,retireApplicationLedger,readApplicationLedgerRetirement,
  inspectApplicationLedgerRetirement,readApplicationLedgerBackupPage} from '../src/applicationLedgerRetirement';

const date='2026-10-07',start=usageAccountDayStart(date),now=start+3600000,user='r'.repeat(64);
const retire=async(accountId:string)=>retireApplicationLedger(env.RUNTIME_DB,accountId,'b'.repeat(64),now,
  await inspectApplicationLedgerRetirement(env.RUNTIME_DB,accountId));
async function fixture(platform:'windows'|'macos'='windows'){
  const machineId=crypto.randomUUID(),accountId=crypto.randomUUID(),child=crypto.randomUUID();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machines_v2(id,account_id,platform,token_hash,last_seen_at_ms,created_at_ms,updated_at_ms)
    VALUES(?1,?2,?3,?1,0,0,0)`).bind(machineId,accountId,platform).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
    (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
    VALUES(?1,?2,1,?3,1,'default',0,0)`).bind(machineId,user,child).run();
  const machine:MachineSelfResponse={machineId,accountId,platform,displayName:null,defaultChildId:child,
    desiredPolicyVersion:1,appliedPolicyVersion:1,policyState:'applied',revoked:false};
  return {machine,child};
}
async function snapshot(f:Awaited<ReturnType<typeof fixture>>,revision:number,newOnly=false,child:string=f.child){
  const rows:UsageAccountRowV2[]=[{kind:'total',hour:null,category:null,subjectKey:null,displayName:null,duration:51},
    ...Array.from({length:24},(_,hour)=>({kind:'total' as const,hour,category:null,subjectKey:null,displayName:null,duration:hour===0?51:0})),
    {kind:'category',hour:null,category:'unclassified',subjectKey:null,displayName:null,duration:51},
    {kind:'category',hour:0,category:'unclassified',subjectKey:null,displayName:null,duration:51}];
  return createUsageAccountV2({schemaVersion:2,sourceKind:'application',durationUnit:'seconds',timezone:'Asia/Shanghai',
    childId:child,date,revision,generatedAtMs:now,settledThroughMs:now,algorithmVersion:newOnly
      ?`${f.machine.platform}-application-v3-only-seconds-v1`:`${f.machine.platform}-application-seconds-v2`,
    policyVersions:[],associationVersion:null,correctionVersion:0,rawFactCount:1,rawFactHash:'c'.repeat(64),complete:true,reasonCodes:[]},rows);
}
async function upload(f:Awaited<ReturnType<typeof fixture>>,revision:number,newOnly=false,commit=true){
  const value=await snapshot(f,revision,newOnly);
  const r=await beginApplicationAccount(env.RUNTIME_DB,f.machine,{localUserId:user,assignmentVersion:1,manifest:value.manifest},now);
  for(const chunk of value.chunks)await putApplicationAccountChunk(env.RUNTIME_DB,f.machine,r.manifestId,chunk.chunkIndex,{rows:chunk.rows,chunkHash:chunk.chunkHash});
  if(commit){await commitApplicationAccount(env.RUNTIME_DB,f.machine,r.manifestId,now);await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);}
  return r;
}
it.each(['windows','macos'] as const)('%s退出只清本家庭旧统计，保留新清单/ACK及其他家庭，重复执行不删新账',async(platform)=>{
  const f=await fixture(platform),other=await fixture(),old=await upload(f,4),pending=await upload(f,9,false,false),fresh=await upload(f,10,true);
  await upload(other,3);
  const before=await env.RUNTIME_DB.prepare('SELECT * FROM runtime_application_account_manifests_v1 WHERE id=?1').bind(fresh.manifestId).first();
  const identities=await env.RUNTIME_DB.prepare('SELECT * FROM runtime_user_assignments_v2 WHERE machine_id=?1').bind(f.machine.machineId).all();
  await retire(f.machine.accountId);
  expect(await env.RUNTIME_DB.prepare('SELECT * FROM runtime_application_account_manifests_v1 WHERE id=?1').bind(fresh.manifestId).first()).toEqual(before);
  expect(await env.RUNTIME_DB.prepare('SELECT * FROM runtime_user_assignments_v2 WHERE machine_id=?1').bind(f.machine.machineId).all()).toMatchObject({results:identities.results});
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,fresh.manifestId)).toMatchObject({received:true,published:true});
  for(const id of [old.manifestId,pending.manifestId])expect(await env.RUNTIME_DB.prepare('SELECT id FROM runtime_application_account_manifests_v1 WHERE id=?1').bind(id).first()).toBeNull();
  expect(await readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,start,start+86400000)).toMatchObject({complete:true,totalDuration:51});
  expect(await readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,other.machine.accountId,other.child,start,start+86400000)).toMatchObject({complete:true,totalDuration:51});
  expect(await readApplicationLedgerRetirement(env.RUNTIME_DB,other.machine.accountId)).toBeNull();
  await expect(retire(f.machine.accountId)).rejects.toMatchObject({code:'APPLICATION_RETIREMENT_ALREADY_APPLIED'});
});
it('拒旧格式/旧版本重放/旧统计回退；新更高版本重放幂等，无新记录不伪装零',async()=>{
  const f=await fixture();await upload(f,12);await retire(f.machine.accountId);
  await expect(upload(f,13)).rejects.toMatchObject({code:'APPLICATION_LEGACY_LEDGER_RETIRED'});
  await expect(upload(f,12,true)).rejects.toMatchObject({code:'APPLICATION_ACCOUNT_STALE_REVISION'});
  await expect(requireApplicationLegacyEnabled(env.RUNTIME_DB,f.machine.accountId)).rejects.toMatchObject({code:'APPLICATION_LEGACY_LEDGER_RETIRED'});
  await expect(readPersistentApplicationUsage(env.RUNTIME_DB,f.machine.accountId,f.child,start,start+86400000,{})).rejects.toMatchObject({code:'APPLICATION_V3_RECORDS_NOT_AVAILABLE'});
  expect(await readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,start,start+86400000)).toMatchObject({complete:false,totalDuration:null,availableTotalDuration:null,days:[{reasonCodes:['APPLICATION_V3_RECORDS_NOT_AVAILABLE']}]});
  const fresh=await upload(f,13,true);expect((await upload(f,13,true)).manifestId).toBe(fresh.manifestId);
  expect(await readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,start,start+86400000)).toMatchObject({totalDuration:51});
});
it('新模型仍拒错误孩子及分块哈希',async()=>{
  const f=await fixture();await retire(f.machine.accountId);
  const wrong=await snapshot(f,1,true,'different-child');
  await expect(beginApplicationAccount(env.RUNTIME_DB,f.machine,{localUserId:user,assignmentVersion:1,manifest:wrong.manifest},now)).rejects.toMatchObject({code:'APPLICATION_ACCOUNT_CHILD_SCOPE_MISMATCH'});
  const value=await snapshot(f,1,true),r=await beginApplicationAccount(env.RUNTIME_DB,f.machine,{localUserId:user,assignmentVersion:1,manifest:value.manifest},now);
  await expect(putApplicationAccountChunk(env.RUNTIME_DB,f.machine,r.manifestId,0,{rows:value.chunks[0].rows,chunkHash:'0'.repeat(64)})).rejects.toMatchObject({code:'APPLICATION_ACCOUNT_CHUNK_HASH_MISMATCH'});
});

it('数据库防回流阻止绕过路由的旧写入，其他家庭原始段仍可写入',async()=>{
  const f=await fixture(),other=await fixture();
  const insert=(target:typeof f,id:string)=>env.RUNTIME_DB.prepare(`INSERT INTO runtime_usage_segments_v2
    (id,machine_id,local_user_id,assignment_version,child_id,runtime_session_id,platform,runtime_identity,
      start_at_ms,end_at_ms,duration_ms,end_reason,content_hash,uploaded_at_ms)
    VALUES(?1,?2,?3,1,?4,'fixture','windows','fixture',1000,2000,1000,'fixture',?1,0)`)
    .bind(id,target.machine.machineId,user,target.child).run();
  await insert(f,'old-fact');await insert(other,'other-fact');
  await retire(f.machine.accountId);
  expect(await env.RUNTIME_DB.prepare('SELECT id FROM runtime_usage_segments_v2 WHERE machine_id=?1').bind(f.machine.machineId).first()).toBeNull();
  await expect(insert(f,'replay')).rejects.toThrow('APPLICATION_LEGACY_LEDGER_RETIRED');
  await insert(other,'other-new');
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_usage_segments_v2 WHERE machine_id=?1').bind(other.machine.machineId).first()).toEqual({n:2});
});

it('受限备份页覆盖旧清单级联内容，不包含新清单、其他家庭或认证表',async()=>{
  const f=await fixture(),other=await fixture(),old=await upload(f,2),fresh=await upload(f,3,true);
  await upload(other,4);
  const inspection=await inspectApplicationLedgerRetirement(env.RUNTIME_DB,f.machine.accountId);
  expect(inspection.machines).toEqual([{id:f.machine.machineId,platform:'windows'}]);
  const page=await readApplicationLedgerBackupPage(env.RUNTIME_DB,f.machine.accountId,'runtime_application_account_manifests_v1');
  expect(page.rows.map(row=>row.id)).toEqual([old.manifestId]);expect(page.nextRowId).toBeNull();
  const chunks=await readApplicationLedgerBackupPage(env.RUNTIME_DB,f.machine.accountId,'runtime_application_account_chunks_v1');
  expect(chunks.rows.every(row=>row.manifest_id===old.manifestId)).toBe(true);expect(chunks.rows.length).toBeGreaterThan(0);
  expect(JSON.stringify(inspection)).not.toContain('token_hash');
  await expect(readApplicationLedgerBackupPage(env.RUNTIME_DB,f.machine.accountId,'runtime_machines_v2')).rejects.toMatchObject({code:'APPLICATION_RETIREMENT_INVALID_SCOPE'});
  expect(page.rows.some(row=>row.id===fresh.manifestId)).toBe(false);
});

it('清理后的数据库水位拒绝绕过路由的并发低版本请求',async()=>{
  const f=await fixture(),old=await upload(f,12);
  const row=await env.RUNTIME_DB.prepare('SELECT * FROM runtime_application_account_manifests_v1 WHERE id=?1').bind(old.manifestId).first<Record<string,unknown>>();
  const fresh=await snapshot(f,12,true);
  await retire(f.machine.accountId);
  await expect(env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_account_manifests_v1
    (id,machine_id,local_user_id,assignment_version,account_id,child_id,date,revision,manifest_hash,manifest_json,state,created_at_ms)
    VALUES(?1,?2,?3,1,?4,?5,?6,12,?7,?8,'pending',?9)`)
    .bind(old.manifestId,f.machine.machineId,user,f.machine.accountId,f.child,date,row!.manifest_hash,JSON.stringify(fresh.manifest),now).run()).rejects.toThrow('APPLICATION_ACCOUNT_STALE_REVISION');
});

it('备份之后新增旧数据，退出事务必须回滚而不是删除未备份记录',async()=>{
  const f=await fixture();await upload(f,1);
  const inventory=await inspectApplicationLedgerRetirement(env.RUNTIME_DB,f.machine.accountId);
  await upload(f,2);
  await expect(retireApplicationLedger(env.RUNTIME_DB,f.machine.accountId,'b'.repeat(64),now,inventory)).rejects.toThrow('CHECK constraint failed');
  expect(await readApplicationLedgerRetirement(env.RUNTIME_DB,f.machine.accountId)).toBeNull();
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_application_account_manifests_v1 WHERE account_id=?1').bind(f.machine.accountId).first()).toEqual({n:2});
});

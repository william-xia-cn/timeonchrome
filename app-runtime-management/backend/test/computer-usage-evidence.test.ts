import { describe, expect, it } from 'vitest';
import { env, exports } from 'cloudflare:workers';
import { routeV2 } from '../src/v2Routes';
import { sha256Hex } from '../src/crypto';
import { readComputerApplicationEvidence as readEvidence } from '../src/computerUsageEvidence';
import { isConfirmedSpecialApplication } from '../src/specialApplications';
import { putApplicationKnowledge, effectiveApplicationKnowledge } from '../src/applicationKnowledge';
import { buildProductIdentityProjection } from '../src/applicationIdentityProjection';
import { CHROME_DISPLAY_RULES } from '../src/specialApplications';
import { RuntimeComputerUsageService } from '../src/computerUsageService';
import type { AppEvidence } from '@timeonchrome/app-runtime-contracts/classification';
import {createUsageAccountV2,APPLICATION_FIXED_IDENTITY_SECONDS_ALGORITHM,type UsageAccountRowV2} from '@timeonchrome/app-runtime-contracts/usage-account';
const day=Date.parse('2026-10-01T00:00:00+08:00');
async function seed(account:string,machine:string,child:string){
await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machines_v2(id,account_id,platform,token_hash,display_name,default_child_id,last_seen_at_ms,created_at_ms,updated_at_ms)
VALUES (?1,?2,'windows',?1,'测试电脑',?3,0,0,0)`).bind(machine,account,child).run();
}
describe('computer application evidence real D1 read adapter',()=>{
it('current persistent seconds cleanup preserves published totals and browser deduction without old tables',async()=>{
  const account='rpc-account',child='rpc-child',machine=crypto.randomUUID(),localUser='c'.repeat(64),date='2026-10-01';
  await seed(account,machine,child);
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
    (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
    VALUES(?1,?2,1,?3,1,'default',?4,?4)`).bind(machine,localUser,child,day).run();
  const total=(hour:number|null,duration:number):UsageAccountRowV2=>({kind:'total',hour,duration,category:null,subjectKey:null,displayName:null});
  const rows=[total(null,900),...Array.from({length:24},(_,hour)=>total(hour,hour===0?900:0))];
  const snapshot=await createUsageAccountV2({schemaVersion:2,sourceKind:'application',durationUnit:'seconds',childId:child,
    timezone:'Asia/Shanghai',date,revision:1,generatedAtMs:day+1000000,settledThroughMs:day+900000,
    algorithmVersion:APPLICATION_FIXED_IDENTITY_SECONDS_ALGORITHM,policyVersions:[],associationVersion:null,correctionVersion:0,
    rawFactCount:1,rawFactHash:'a'.repeat(64),complete:true,reasonCodes:[],applicationUsage:{nonSpecialTotal:600,
      nonSpecialCategories:{study:600},specialTotal:300,complete:true,reasonCodes:[]}},rows);
  const id=crypto.randomUUID();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_account_manifests_v1
    (id,machine_id,local_user_id,assignment_version,account_id,child_id,date,revision,manifest_hash,manifest_json,state,created_at_ms,received_at_ms)
    VALUES(?1,?2,?3,1,?4,?5,?6,1,?7,?8,'received',?9,?9)`)
    .bind(id,machine,localUser,account,child,date,snapshot.manifest.manifestHash,JSON.stringify(snapshot.manifest),day+1000000).run();
  for(const chunk of snapshot.chunks)await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_account_chunks_v1
    (manifest_id,chunk_index,chunk_hash,rows_json) VALUES(?1,?2,?3,?4)`)
    .bind(id,chunk.chunkIndex,chunk.chunkHash,JSON.stringify(chunk.rows)).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_account_publications_v1
    (machine_id,local_user_id,assignment_version,account_id,child_id,date,revision,manifest_id,source_revision,published_at_ms)
    VALUES(?1,?2,1,?3,?4,?5,1,?6,?7,?8)`)
    .bind(machine,localUser,account,child,date,id,snapshot.manifest.manifestHash,day+1000000).run();
  const forbidden=/runtime_usage_segments|runtime_application_statistics_(days|queue)|runtime_application_shared_quota/;
  const database=new Proxy(env.RUNTIME_DB,{get(target,property){
    if(property==='prepare')return(sql:string)=>{if(forbidden.test(sql))throw Error('OLD_READER_FORBIDDEN');return target.prepare(sql);};
    const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
  }});
  const sources=await readEvidence(database,account,child,date,date);
  expect(sources).toHaveLength(1);expect(sources[0]).toMatchObject({totalMs:900000,
    chromeIncludedInApplicationMs:300000,statisticsComplete:true,intervals:[]});
  const rpc=new RuntimeComputerUsageService({} as ExecutionContext,{...env,RUNTIME_DB:database});
  const current=await rpc.getApplicationUsage(account,child,date,date,true);
  expect(current).toMatchObject({durationUnit:'seconds',totalDuration:900,complete:true,
    applicationUsage:{nonSpecialTotal:600,specialTotal:300}});
  // Remaining millisecond field compatibility is a projection of these same seconds, not an old read.
  expect(await rpc.getApplicationUsage(account,child,date,date)).toMatchObject({totalDurationMs:900000});
  expect(await rpc.applicationEvidenceRevision(account,child,date,date)).toMatch(/^[a-f0-9]{64}$/);
  expect(await readEvidence(database,'foreign-account',child,date,date)).toEqual([]);
  const token=crypto.randomUUID().replace(/-/g,'')+'x'.repeat(11),now=Date.now();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_browser_sessions_v1
    (token_hash,account_id,children_json,created_at_ms,expires_at_ms,last_used_at_ms)
    VALUES(?1,?2,?3,?4,?5,?4)`).bind(await sha256Hex(token),account,JSON.stringify([{id:child,name:'合成孩子'}]),now,now+60000).run();
  const request=(unit?:string,selectedChild=child)=>new Request('https://runtime.test/v2/module/app-usage?'+new URLSearchParams({
    childId:selectedChild,fromMs:String(day),toMs:String(day+86400000),...(unit?{durationUnit:unit}:{})}),
    {headers:{authorization:`RuntimeSession ${token}`}});
  const scopedEnv={...env,RUNTIME_DB:database};
  expect(await(await routeV2(request('seconds'),scopedEnv,now))!.json()).toMatchObject({durationUnit:'seconds',totalDuration:900});
  expect(await(await routeV2(request(),scopedEnv,now))!.json()).toMatchObject({durationUnit:'milliseconds',totalDurationMs:900000});
  expect(await(await routeV2(request('milliseconds'),scopedEnv,now))!.json()).toMatchObject({totalDurationMs:900000});
  await expect(routeV2(request('seconds','foreign-child'),scopedEnv,now)).rejects.toMatchObject({code:'CHILD_NOT_FOUND'});
  await expect(routeV2(request('minutes'),scopedEnv,now)).rejects.toMatchObject({code:'INVALID_DURATION_UNIT'});
});
it('current persistent seconds cleanup keeps empty zero and exact date guards instead of a raw fallback',async()=>{
  const rpc=new RuntimeComputerUsageService({} as ExecutionContext,env);
  expect(await rpc.getApplicationUsage('empty-account','empty-child','2026-10-01','2026-10-01',true))
    .toMatchObject({durationUnit:'seconds',totalDuration:0,complete:true});
  expect(await readEvidence(env.RUNTIME_DB,'empty-account','empty-child','2026-10-01','2026-10-01')).toEqual([]);
  const token=crypto.randomUUID().replace(/-/g,'')+'x'.repeat(11),now=Date.now();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_browser_sessions_v1
    (token_hash,account_id,children_json,created_at_ms,expires_at_ms,last_used_at_ms)
    VALUES(?1,'empty-account',?2,?3,?4,?3)`)
    .bind(await sha256Hex(token),JSON.stringify([{id:'empty-child',name:'合成孩子'}]),now,now+60000).run();
  const emptyRequest=new Request(`https://runtime.test/v2/module/app-usage?childId=empty-child&fromMs=${day}&toMs=${day+86400000}`,
    {headers:{authorization:`RuntimeSession ${token}`}});
  expect(await(await routeV2(emptyRequest,env,now))!.json()).toMatchObject({totalDurationMs:0,complete:true});
  for(const [from,to] of [['2026-02-30','2026-03-02'],['invalid','2026-10-01'],['2026-10-02','2026-10-01'],['2026-10-01','2026-10-08']]){
    await expect(rpc.applicationEvidenceRevision('empty-account','empty-child',from!,to!)).rejects.toMatchObject({code:'INVALID_RANGE'});
  }
});
it('existing Runtime browser route forwards seconds without recomputing or crossing Child scope',async()=>{
  const token='s'.repeat(43),now=Date.now(),revision='computer-v2:'+ 'a'.repeat(64);
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_browser_sessions_v1
    (token_hash,account_id,children_json,created_at_ms,expires_at_ms,last_used_at_ms)
    VALUES (?1,'seconds-proxy-account',?2,?3,?4,?3)`).bind(await sha256Hex(token),JSON.stringify([{id:'seconds-proxy-child',name:'测试孩子'}]),now,now+60000).run();
  let reads=0;
  const snapshot={schemaVersion:2,durationUnit:'seconds',revision,fromDate:'2026-10-01',toDate:'2026-10-01',totals:{computer:13,web:3,application:15,specialIncluded:5}};
  const scopedEnv={...env,GUARDIAN_COMPUTER_USAGE:{...env.GUARDIAN_COMPUTER_USAGE,getComputerUsageStatisticsSeconds:async(account:string,child:string,from:string,to:string)=>{
    expect([account,child,from,to]).toEqual(['seconds-proxy-account','seconds-proxy-child','2026-10-01','2026-10-01']);reads++;return snapshot;
  }}};
  const request=(extra:Record<string,string>={})=>new Request('https://runtime.test/v2/module/computer-usage?'+new URLSearchParams({childId:'seconds-proxy-child',from:'2026-10-01',to:'2026-10-01',durationUnit:'seconds',...extra}),{headers:{authorization:`RuntimeSession ${token}`}});
  const response=await routeV2(request(),scopedEnv,now);
  expect(response?.status).toBe(200);expect(await response?.json()).toEqual(snapshot);
  await expect(routeV2(request({childId:'foreign-child'}),scopedEnv,now)).rejects.toMatchObject({status:404,code:'CHILD_NOT_FOUND'});
  expect(reads).toBe(1);
  await expect(routeV2(request({durationUnit:'minutes'}),scopedEnv,now)).rejects.toMatchObject({status:400,code:'INVALID_DURATION_UNIT'});
  await expect(routeV2(request({revision:'computer-v2:'+ 'b'.repeat(64)}),scopedEnv,now)).rejects.toMatchObject({status:409,code:'COMPUTER_USAGE_VERSION_CHANGED'});
  await expect(routeV2(request({detail:'products',revision}),scopedEnv,now)).rejects.toMatchObject({status:503,code:'COMPUTER_USAGE_DETAIL_NOT_READY'});
});
it('current Guardian scope supports a child without devices and fails closed without ownership evidence',async()=>{
const rpc=exports.RuntimeComputerUsageService;
expect(await rpc.readApplicationEvidence('empty-account','empty-child','2026-10-01','2026-10-01')).toEqual([]);
await env.RUNTIME_DB.prepare("INSERT INTO runtime_children_v1(child_id,account_id,child_name,created_at_ms,updated_at_ms) VALUES ('stale-child','foreign-account','旧记录',0,0)").run();
for(const operation of ['getApplicationUsage','getApplicationIdentityUsage','readApplicationEvidence','applicationEvidenceRevision']) {
const request=(accountId:string,childId:string)=>new Request(`https://capability/${operation}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId,childId,fromDate:'2026-10-01',toDate:'2026-10-01'})});
expect((await rpc.fetch(request('foreign-account','stale-child'))).status).toBe(404);
const failed=await rpc.fetch(request('scope-unavailable','rpc-boundary-child'));expect(failed.status).toBe(503);expect(await failed.json()).toEqual({code:'APPLICATION_SCOPE_UNAVAILABLE'});
}
});
it('uses only the approved product association, never a name or separate display matcher',async()=>{
const reviewed:AppEvidence={platform:'windows',runtimeIdentity:'different-version',displayName:'Unrelated label',values:CHROME_DISPLAY_RULES.windows,verifiedFields:['fileSeriesKey','signerKey']};
const knowledge=effectiveApplicationKnowledge({schemaVersion:2,version:1,products:[],rules:[],bindings:[]});
for(const [item,expected] of [
  [reviewed,true],
  [{...reviewed,values:{...reviewed.values,signerKey:'different'}},false],
  [{...reviewed,verifiedFields:['fileSeriesKey']},false],
  [{...reviewed,platform:'macos',values:{packageId:'com.google.Chrome'},verifiedFields:['packageId']},false],
] as Array<[AppEvidence,boolean]>) {
  const projection=await buildProductIdentityProjection([item],knowledge);
  expect(isConfirmedSpecialApplication(projection.items[0],knowledge)).toBe(expected);
}
expect(isConfirmedSpecialApplication(undefined,knowledge)).toBe(false);
});
});

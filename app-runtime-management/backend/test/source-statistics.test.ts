import {env,exports} from 'cloudflare:workers';
import {expect,it} from 'vitest';
import {createUsageAccount,createUsageAccountV2,type UsageAccountRowV2} from '@timeonchrome/app-runtime-contracts/usage-account';
import {readApplicationSourceStatistics,readApplicationQuotaBuckets,readApplicationQuotaBucketsWithState,readApplicationQuotaBucketsSources} from '../src/sourceStatistics';
import {readNativeApplicationStatisticsSeconds} from '../src/applicationStatisticsNative';
import {applicationSharedQuotaSourceKey} from '../src/applicationSharedQuota';
import {sha256Hex} from '../src/crypto';
import {routeV2} from '../src/v2Routes';
import {RuntimeComputerUsageService} from '../src/computerUsageService';
import fixedNativeGenerated from './application-fixed-native-generated.json';
import fixedZeroNativeGenerated from './application-fixed-zero-native-generated.json';

const date='2026-10-07',start=Date.parse(date+'T00:00:00+08:00'),now=start+3600000;
const user='a'.repeat(64),peer='b'.repeat(64);
async function fixture(scope?:{account:string;child:string}){
  const machine=crypto.randomUUID(),account=scope?.account??crypto.randomUUID(),child=scope?.child??crypto.randomUUID(),token=crypto.randomUUID();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machines_v2(id,account_id,platform,token_hash,last_seen_at_ms,created_at_ms,updated_at_ms)
    VALUES(?1,?2,'windows',?3,?4,?4,?4)`).bind(machine,account,await sha256Hex(token),now).run();
  for(const local of [user,peer])await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
    (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
    VALUES(?1,?2,1,?3,1,'default',?4,?4)`).bind(machine,local,child,start).run();
  return {machine,account,child,token};
}
// 真实冻结清单/分块/发布表的隔离fixture；本轮不重验已经通过的上传生产链。
async function seedPublished(f:Awaited<ReturnType<typeof fixture>>,local:string,total=600,revision=1,special=false,
  options:{usage?:'missing'|'partial'|'legacy';assignmentVersion?:number}={}){
  const row=(hour:number|null,duration:number):UsageAccountRowV2=>({kind:'total',hour,duration,category:null,subjectKey:null,displayName:null});
  const base={sourceKind:'application' as const,timezone:'Asia/Shanghai' as const,date,revision,generatedAtMs:now,settledThroughMs:now,
    algorithmVersion:'windows-application-v3-only-seconds-v1',policyVersions:[],associationVersion:null,correctionVersion:0,
    rawFactCount:1,rawFactHash:'a'.repeat(64),complete:true,reasonCodes:[]};
  const rows=[row(null,total),...Array.from({length:24},(_,h)=>row(h,h===0?total:0))];
  const snapshot=options.usage==='legacy'?await createUsageAccount({...base,schemaVersion:1,durationUnit:'milliseconds'},rows):
    await createUsageAccountV2({...base,schemaVersion:2,durationUnit:'seconds',childId:f.child,
      ...(options.usage==='missing'?{}:{applicationUsage:{nonSpecialTotal:special?0:total,nonSpecialCategories:special?{}:{study:total},
        specialTotal:special?total:0,complete:options.usage!=='partial',reasonCodes:options.usage==='partial'?['NATIVE_LEGACY_SELECTION_UNAVAILABLE']:[]}})},rows);
  const id=crypto.randomUUID();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_account_manifests_v1
    (id,machine_id,local_user_id,assignment_version,account_id,child_id,date,revision,manifest_hash,manifest_json,state,created_at_ms,received_at_ms)
    VALUES(?1,?2,?3,?11,?4,?5,?6,?7,?8,?9,'received',?10,?10)`)
    .bind(id,f.machine,local,f.account,f.child,date,revision,snapshot.manifest.manifestHash,JSON.stringify(snapshot.manifest),now,options.assignmentVersion??1).run();
  for(const c of snapshot.chunks)await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_account_chunks_v1
    (manifest_id,chunk_index,chunk_hash,rows_json) VALUES(?1,?2,?3,?4)`).bind(id,c.chunkIndex,c.chunkHash,JSON.stringify(c.rows)).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_account_publications_v1
    (machine_id,local_user_id,assignment_version,account_id,child_id,date,revision,manifest_id,source_revision,published_at_ms)
    VALUES(?1,?2,?10,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(machine_id,local_user_id,assignment_version,date)
    DO UPDATE SET revision=excluded.revision,manifest_id=excluded.manifest_id,source_revision=excluded.source_revision`)
    .bind(f.machine,local,f.account,f.child,date,revision,id,snapshot.manifest.manifestHash,now,options.assignmentVersion??1).run();
  return id;
}
const query={source:'application' as const,scope:'all' as const,fromDate:date,toDate:date};
const bucketsQuery={schemaVersion:2 as const,...query};
it('quota-only partial reading retains confirmed buckets when another source lacks classification or uses legacy units',async()=>{
  for(const missing of ['missing','legacy'] as const){
    const f=await fixture();await seedPublished(f,user,600);await seedPublished(f,peer,200,1,false,{usage:missing});
    const ordinaryBefore=await readNativeApplicationStatisticsSeconds(env.RUNTIME_DB,f.account,f.child,date);
    expect(ordinaryBefore!.applicationUsage).toBeNull();
    const buckets=await readApplicationQuotaBuckets(env.RUNTIME_DB,f.account,f.child,bucketsQuery,undefined,now);
    expect(buckets.days[0]).toMatchObject({bucketsSeconds:{study:600,composite:0,rest:0},complete:false});
    expect(buckets.days[0]!.reasonCodes).toContain('APPLICATION_QUOTA_USAGE_INCOMPLETE');
    if(missing==='legacy')expect(buckets.days[0]!.reasonCodes).toContain('LEGACY_STATISTICS_UNIT');
    expect(await readNativeApplicationStatisticsSeconds(env.RUNTIME_DB,f.account,f.child,date)).toEqual(ordinaryBefore);
    expect(await readApplicationQuotaBuckets(env.RUNTIME_DB,f.account,f.child,bucketsQuery,undefined,now)).toEqual(buckets);
    await seedPublished(f,user,100,2);
    expect((await readApplicationQuotaBuckets(env.RUNTIME_DB,f.account,f.child,bucketsQuery,undefined,now)).days[0])
      .toMatchObject({bucketsSeconds:{study:100,composite:0,rest:0},complete:false});
  }
});
it('source details read exact self and preserve same-machine users and assignment versions independently',async()=>{
  const f=await fixture(),own={machineId:f.machine,localUserId:user,assignmentVersion:1};
  await seedPublished(f,user,600,1,false,{usage:'partial'});await seedPublished(f,peer,200);
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
    (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
    VALUES(?1,?2,2,?3,1,'default',?4,?4)`).bind(f.machine,user,f.child,start+1000).run();
  await seedPublished(f,user,40,1,false,{assignmentVersion:2});
  const details=await readApplicationQuotaBucketsSources(env.RUNTIME_DB,f.account,f.child,bucketsQuery,own,now);
  expect(details.local!.days[0]).toMatchObject({bucketsSeconds:{study:600,composite:0,rest:0},complete:false});
  expect(details.local!.days[0]!.reasonCodes).toContain('NATIVE_LEGACY_SELECTION_UNAVAILABLE');
  expect(details.otherState).toBe('available');
  expect(details.other!.days[0]).toMatchObject({bucketsSeconds:{study:240,composite:0,rest:0},complete:true});
  const all=await readApplicationQuotaBuckets(env.RUNTIME_DB,f.account,f.child,bucketsQuery,undefined,now);
  expect(all.days[0]!.bucketsSeconds.study).toBe(840);
  expect(await readApplicationQuotaBucketsSources(env.RUNTIME_DB,f.account,f.child,bucketsQuery,own,now)).toEqual(details);
  await seedPublished(f,user,10,2,false,{usage:'partial'});
  const replaced=await readApplicationQuotaBucketsSources(env.RUNTIME_DB,f.account,f.child,bucketsQuery,own,now);
  expect(replaced.local!.days[0]!.bucketsSeconds.study).toBe(10);
  expect(replaced.other).toEqual(details.other);
  const foreign=await readApplicationQuotaBucketsSources(env.RUNTIME_DB,'foreign-account',f.child,bucketsQuery,own,now);
  expect(foreign.local!.days[0]).toMatchObject({complete:false,bucketsSeconds:{study:0,composite:0,rest:0}});
  expect(foreign.otherState).toBe('none');expect(foreign.other).toBeNull();
});
it('source details distinguish unknown and none without manufacturing a complete local result',async()=>{
  const f=await fixture(),own={machineId:f.machine,localUserId:user,assignmentVersion:1};
  await seedPublished(f,user,20);
  const unknown=await readApplicationQuotaBucketsSources(env.RUNTIME_DB,f.account,f.child,bucketsQuery,own,now);
  expect(unknown.otherState).toBe('unknown');expect(unknown.other).toBeNull();
  expect(unknown.local!.days[0]).toMatchObject({complete:true,bucketsSeconds:{study:20,composite:0,rest:0}});
  await env.RUNTIME_DB.prepare('DELETE FROM runtime_user_assignments_v2 WHERE machine_id=?1 AND local_user_id=?2')
    .bind(f.machine,peer).run();
  const none=await readApplicationQuotaBucketsSources(env.RUNTIME_DB,f.account,f.child,bucketsQuery,own,now);
  expect(none.otherState).toBe('none');expect(none.other).toBeNull();expect(none.local).toEqual(unknown.local);
  const absent=await readApplicationQuotaBucketsSources(env.RUNTIME_DB,f.account,f.child,bucketsQuery,
    {...own,assignmentVersion:3},now);
  expect(absent.local!.days[0]).toMatchObject({complete:false,bucketsSeconds:{study:0,composite:0,rest:0}});
  expect(absent.other!.days[0]!.bucketsSeconds.study).toBe(20);
});
it('quota partial mode still rejects corrupt row hashes and cross-child manifests',async()=>{
  const f=await fixture();await seedPublished(f,user,600);
  const corruptId=await seedPublished(f,peer,200,1,false,{usage:'missing'});
  await env.RUNTIME_DB.prepare(`UPDATE runtime_application_account_chunks_v1
    SET rows_json=replace(rows_json,'200','201') WHERE manifest_id=?1`).bind(corruptId).run();
  await expect(readApplicationQuotaBuckets(env.RUNTIME_DB,f.account,f.child,bucketsQuery,undefined,now))
    .rejects.toMatchObject({code:'APPLICATION_STATISTICS_HASH_MISMATCH'});
  const wrong=await fixture();const id=await seedPublished(wrong,user);
  const foreign=await fixture();const foreignId=await seedPublished(foreign,user);
  const manifest=(await env.RUNTIME_DB.prepare('SELECT manifest_json,manifest_hash FROM runtime_application_account_manifests_v1 WHERE id=?1')
    .bind(foreignId).first<{manifest_json:string;manifest_hash:string}>())!;
  await env.RUNTIME_DB.prepare('UPDATE runtime_application_account_manifests_v1 SET manifest_json=?2,manifest_hash=?3 WHERE id=?1')
    .bind(id,manifest.manifest_json,manifest.manifest_hash).run();
  await expect(readApplicationQuotaBuckets(env.RUNTIME_DB,wrong.account,wrong.child,bucketsQuery,undefined,now))
    .rejects.toMatchObject({code:'APPLICATION_ACCOUNT_CHILD_SCOPE_MISMATCH'});
});
it('other availability distinguishes no source, unreported source, zero and historical assignment without changing local statistics',async()=>{
  const f=await fixture();
  const q={...bucketsQuery,scope:'other' as const},own={machineId:f.machine,localUserId:user,assignmentVersion:1};
  // 已有另一个用户的分配但尚未上报，不能说无其他设备。
  expect((await readApplicationQuotaBucketsWithState(env.RUNTIME_DB,f.account,f.child,q,own,now)).sourceState).toBe('unknown');
  await seedPublished(f,peer,0);
  const zero=await readApplicationQuotaBucketsWithState(env.RUNTIME_DB,f.account,f.child,q,own,now);
  expect(zero.sourceState).toBe('available');expect(zero.snapshot.days[0]).toMatchObject({complete:true,bucketsSeconds:{study:0,composite:0,rest:0}});
  await seedPublished(f,peer,200,2);
  const positive=await readApplicationQuotaBucketsWithState(env.RUNTIME_DB,f.account,f.child,q,own,now);
  expect(positive.sourceState).toBe('available');expect(positive.snapshot.days[0]!.bucketsSeconds.study).toBe(200);
  const empty=await fixture();
  await env.RUNTIME_DB.prepare('DELETE FROM runtime_user_assignments_v2 WHERE machine_id=?1 AND local_user_id=?2').bind(empty.machine,peer).run();
  const request=()=>new Request(`https://runtime.test/v2/machines/source-statistics?localUserId=${user}&assignmentVersion=1`,{
    method:'POST',headers:{authorization:`Bearer ${empty.token}`,'content-type':'application/json'},body:JSON.stringify(q)});
  const response=await routeV2(request(),env,now);
  expect(response?.headers.get('X-Application-Quota-Source-State')).toBe('none');
  const body=await response!.json() as {days:Array<{complete:boolean;bucketsSeconds:unknown}>};
  expect(body.days[0]).toMatchObject({complete:true,bucketsSeconds:{study:0,composite:0,rest:0}});
  // 其他家庭即使同Child ID、或本家庭其他孩子的设备，均不能污染此来源范围。
  await fixture({account:crypto.randomUUID(),child:empty.child});
  await fixture({account:empty.account,child:crypto.randomUUID()});
  expect((await routeV2(request(),env,now))?.headers.get('X-Application-Quota-Source-State')).toBe('none');
  // 历史分配后来改绑也仍是该期间的潜在来源；不按最新分配或停用过滤。
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
    (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
    VALUES(?1,?2,1,?3,1,'default',?4,?4), (?1,?2,2,NULL,0,'unprotected',?5,?5)`)
    .bind(empty.machine,peer,empty.child,start-86400000,start+1800000).run();
  expect((await readApplicationQuotaBucketsWithState(env.RUNTIME_DB,empty.account,empty.child,q,
    {machineId:empty.machine,localUserId:user,assignmentVersion:1},now)).sourceState).toBe('unknown');
  await env.RUNTIME_DB.prepare('UPDATE runtime_user_assignments_v2 SET effective_at_ms=?3 WHERE machine_id=?1 AND local_user_id=?2 AND assignment_version=2')
    .bind(empty.machine,peer,start).run();
  expect((await readApplicationQuotaBucketsWithState(env.RUNTIME_DB,empty.account,empty.child,q,
    {machineId:empty.machine,localUserId:user,assignmentVersion:1},now)).sourceState).toBe('none');
});
it('quota buckets reuse ordinary published statistics, replace decreases and exclude exactly authenticated local source',async()=>{
  const f=await fixture();await seedPublished(f,user);await seedPublished(f,peer,200);
  const ordinary=await readNativeApplicationStatisticsSeconds(env.RUNTIME_DB,f.account,f.child,date);
  const first=await readApplicationQuotaBuckets(env.RUNTIME_DB,f.account,f.child,bucketsQuery,undefined,now);
  expect(first.days[0].bucketsSeconds.study).toBe(ordinary!.applicationUsage!.nonSpecialCategories.study);
  expect(first.days[0].bucketsSeconds.study).toBe(800);
  expect(await readApplicationQuotaBuckets(env.RUNTIME_DB,f.account,f.child,bucketsQuery,undefined,now)).toEqual(first);
  const other=await readApplicationQuotaBuckets(env.RUNTIME_DB,f.account,f.child,{...bucketsQuery,scope:'other'},
    {machineId:f.machine,localUserId:user,assignmentVersion:1},now);
  expect(other.days[0].bucketsSeconds.study).toBe(200);
  await seedPublished(f,user,10,2);
  expect((await readApplicationQuotaBuckets(env.RUNTIME_DB,f.account,f.child,bucketsQuery,undefined,now)).days[0].bucketsSeconds.study).toBe(210);
  const foreign=await readApplicationQuotaBuckets(env.RUNTIME_DB,'foreign-account',f.child,bucketsQuery,undefined,now);
  expect(foreign.days[0]).toMatchObject({complete:false,bucketsSeconds:{study:0,composite:0,rest:0}});
  expect(foreign.days[0].reasonCodes).toContain('APPLICATION_STATISTICS_NOT_AVAILABLE');
  expect(Object.keys(first).sort()).toEqual(['schemaVersion','durationUnit','source','childId','fromDate','toDate','readAtMs','days'].sort());
});
it('quota bucket machine route derives exclusion without cloud self copy or caller source keys',async()=>{
  const f=await fixture();await seedPublished(f,peer);
  const request=(patch={})=>new Request(`https://runtime.test/v2/machines/source-statistics?localUserId=${user}&assignmentVersion=1`,{
    method:'POST',headers:{authorization:`Bearer ${f.token}`,'content-type':'application/json'},body:JSON.stringify({...bucketsQuery,scope:'other',...patch})});
  expect(await (await routeV2(request(),env,now))?.json()).toMatchObject({schemaVersion:2,childId:f.child,
    days:[{bucketsSeconds:{study:600,composite:0,rest:0},complete:true}]});
  await expect(routeV2(request({ownSourceKeys:['caller']}),env,now)).rejects.toMatchObject({status:400});
  await expect(routeV2(request({childId:'foreign'}),env,now)).rejects.toMatchObject({status:400});
});
it('quota bucket web fallback and Service Binding keep authenticated child boundaries',async()=>{
  const f=await fixture({account:'rpc-boundary-account',child:'rpc-boundary-child'});
  await seedPublished(f,user);
  const call=(accountId=f.account)=>new Request('https://runtime-capability/getApplicationSourceStatistics',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId,childId:f.child,query:bucketsQuery})});
  expect(await(await exports.RuntimeComputerUsageService.fetch(call())).json()).toMatchObject({schemaVersion:2,source:'application',
    days:[{bucketsSeconds:{study:600,composite:0,rest:0}}]});
  expect((await exports.RuntimeComputerUsageService.fetch(call('foreign-account'))).status).toBe(404);
  let rebind=false;
  const guardian={fetch:async(request:Request)=>{
    expect(await request.json()).toEqual({accountId:f.account,childId:f.child,query:{...bucketsQuery,source:'web'}});
    if(rebind)await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
      (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
      VALUES(?1,?2,2,'other-child',1,'override',?3,?3)`).bind(f.machine,user,now).run();
    return Response.json({schemaVersion:2,durationUnit:'seconds',source:'web',childId:f.child,fromDate:date,toDate:date,readAtMs:now,
      days:[{date,bucketsSeconds:{study:600,composite:0,rest:0},settledThroughMs:null,complete:true,reasonCodes:[]}]});
  }} as typeof env.GUARDIAN_COMPUTER_USAGE;
  const request=()=>new Request(`https://runtime.test/v2/machines/source-statistics?localUserId=${user}&assignmentVersion=1`,{
    method:'POST',headers:{authorization:`Bearer ${f.token}`,'content-type':'application/json'},body:JSON.stringify({...bucketsQuery,source:'web'})});
  expect(await(await routeV2(request(),{...env,GUARDIAN_COMPUTER_USAGE:guardian},now))?.json()).toMatchObject({schemaVersion:2,source:'web'});
  rebind=true;
  await expect(routeV2(request(),{...env,GUARDIAN_COMPUTER_USAGE:guardian},now)).rejects.toMatchObject({status:409});
});
it('actual Service Binding keeps legacy aggregate and opt-in source details isolated to current trusted scope',async()=>{
  const f=await fixture({account:'rpc-account',child:'rpc-child'});
  await seedPublished(f,user,600);await seedPublished(f,peer,200);
  const call=(patch:Record<string,unknown>={})=>new Request('https://runtime-capability/getApplicationSourceStatistics',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:f.account,childId:f.child,query:bucketsQuery,...patch})});
  const aggregate={schemaVersion:2,days:[{bucketsSeconds:{study:800,composite:0,rest:0}}]};
  const legacy=await(await exports.RuntimeComputerUsageService.fetch(call())).json();
  expect(legacy).toMatchObject(aggregate);
  expect(legacy).not.toHaveProperty('snapshot');
  const noSelector=await(await exports.RuntimeComputerUsageService.fetch(call({includeSources:true}))).json();
  expect(noSelector).toMatchObject({snapshot:aggregate,applicationSources:null});
  const applicationScope={applicationSourceKey:await applicationSharedQuotaSourceKey(f.machine,user,1),assignmentVersion:1};
  const trusted=await(await exports.RuntimeComputerUsageService.fetch(call({includeSources:true,applicationScope}))).json();
  expect(trusted).toMatchObject({snapshot:aggregate,applicationSources:{
    local:{days:[{bucketsSeconds:{study:600,composite:0,rest:0}}]},
    other:{days:[{bucketsSeconds:{study:200,composite:0,rest:0}}]},otherState:'available'}});
  const foreignFamily=await fixture({account:crypto.randomUUID(),child:f.child});
  const foreignChild=await fixture({account:f.account,child:crypto.randomUUID()});
  for(const foreign of [foreignFamily,foreignChild]){
    const response=await exports.RuntimeComputerUsageService.fetch(call({includeSources:true,applicationScope:{
      applicationSourceKey:await applicationSharedQuotaSourceKey(foreign.machine,user,1),assignmentVersion:1}}));
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({snapshot:aggregate,applicationSources:null});
  }
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
    (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
    VALUES(?1,?2,2,?3,1,'override',?4,?4)`).bind(f.machine,user,f.child,now).run();
  expect(await(await exports.RuntimeComputerUsageService.fetch(call({includeSources:true,applicationScope}))).json())
    .toMatchObject({snapshot:aggregate,applicationSources:null});
});
it('actual RPC handler discards attribution after a mid-read rebind while preserving its valid aggregate',async()=>{
  const f=await fixture({account:'empty-account',child:'empty-child'});
  await seedPublished(f,user,600);await seedPublished(f,peer,200);
  let scopeReads=0;
  const database=new Proxy(env.RUNTIME_DB,{get(target,property){
    if(property==='prepare')return(sql:string)=>{
      const statement=target.prepare(sql);
      if(!sql.includes('ORDER BY a.machine_id,a.local_user_id LIMIT 201'))return statement;
      return new Proxy(statement,{get(prepared,key){
        if(key==='bind')return(...values:unknown[])=>{
          const bound=prepared.bind(...values);
          return new Proxy(bound,{get(binding,operation){
            if(operation==='all')return async<T>()=>{
              scopeReads++;
              if(scopeReads===2)await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
                (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
                VALUES(?1,?2,2,'rebound-child',1,'override',?3,?3)`).bind(f.machine,user,now).run();
              return binding.all<T>();
            };
            const value=Reflect.get(binding,operation);return typeof value==='function'?value.bind(binding):value;
          }});
        };
        const value=Reflect.get(prepared,key);return typeof value==='function'?value.bind(prepared):value;
      }});
    };
    const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
  }});
  const rpc=new RuntimeComputerUsageService({} as ExecutionContext,{...env,RUNTIME_DB:database});
  const response=await rpc.fetch(new Request('https://runtime-capability/getApplicationSourceStatistics',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:f.account,childId:f.child,query:bucketsQuery,
      includeSources:true,applicationScope:{applicationSourceKey:await applicationSharedQuotaSourceKey(f.machine,user,1),assignmentVersion:1}})}));
  expect(scopeReads).toBe(2);expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({snapshot:{days:[{bucketsSeconds:{study:800,composite:0,rest:0}}]},applicationSources:null});
});
it('actual RPC handler drops a sidecar read across publication replacement but accepts the stable lower revision',async()=>{
  const f=await fixture({account:'persistent-account',child:'persistent-child'});
  await seedPublished(f,user,600);await seedPublished(f,peer,200);
  let publicationReads=0;
  const database=new Proxy(env.RUNTIME_DB,{get(target,property){
    if(property==='prepare')return(sql:string)=>{
      const statement=target.prepare(sql);
      if(!sql.includes('snapshot.manifest_json,snapshot.manifest_hash FROM runtime_application_account_publications_v1 p'))return statement;
      return new Proxy(statement,{get(prepared,key){
        if(key==='bind')return(...values:unknown[])=>{
          const bound=prepared.bind(...values);
          return new Proxy(bound,{get(binding,operation){
            if(operation==='all')return async<T>()=>{
              publicationReads++;
              if(publicationReads===2)await seedPublished(f,user,100,2);
              return binding.all<T>();
            };
            const value=Reflect.get(binding,operation);return typeof value==='function'?value.bind(binding):value;
          }});
        };
        const value=Reflect.get(prepared,key);return typeof value==='function'?value.bind(prepared):value;
      }});
    };
    const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
  }});
  const rpc=new RuntimeComputerUsageService({} as ExecutionContext,{...env,RUNTIME_DB:database});
  const scope={applicationSourceKey:await applicationSharedQuotaSourceKey(f.machine,user,1),assignmentVersion:1};
  const call=()=>new Request('https://runtime-capability/getApplicationSourceStatistics',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:f.account,childId:f.child,
      query:bucketsQuery,includeSources:true,applicationScope:scope})});
  const raced=await rpc.fetch(call());
  expect(raced.status).toBe(200);expect(publicationReads).toBe(3);
  expect(await raced.json()).toMatchObject({snapshot:{days:[{bucketsSeconds:{study:800,composite:0,rest:0}}]},applicationSources:null});
  const stable=await rpc.fetch(call());
  expect(stable.status).toBe(200);
  expect(await stable.json()).toMatchObject({snapshot:{days:[{bucketsSeconds:{study:300,composite:0,rest:0}}]},applicationSources:{
    local:{days:[{bucketsSeconds:{study:100,composite:0,rest:0}}]},
    other:{days:[{bucketsSeconds:{study:200,composite:0,rest:0}}]},otherState:'available'}});
});
async function seedCapturedFixedPublication(f:Awaited<ReturnType<typeof fixture>>,capture:typeof fixedNativeGenerated|typeof fixedZeroNativeGenerated){
  const {manifest,chunks}=capture,id=crypto.randomUUID(),receivedAt=manifest.generatedAtMs+1000;
  expect(manifest.childId).toBe(f.child);
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_account_manifests_v1
    (id,machine_id,local_user_id,assignment_version,account_id,child_id,date,revision,manifest_hash,manifest_json,state,created_at_ms,received_at_ms)
    VALUES(?1,?2,?3,1,?4,?5,?6,?7,?8,?9,'received',?10,?10)`)
    .bind(id,f.machine,user,f.account,f.child,manifest.date,manifest.revision,manifest.manifestHash,JSON.stringify(manifest),receivedAt).run();
  for(const chunk of chunks)await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_account_chunks_v1
    (manifest_id,chunk_index,chunk_hash,rows_json) VALUES(?1,?2,?3,?4)`)
    .bind(id,chunk.chunkIndex,chunk.chunkHash,JSON.stringify(chunk.rows)).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_account_publications_v1
    (machine_id,local_user_id,assignment_version,account_id,child_id,date,revision,manifest_id,source_revision,published_at_ms)
    VALUES(?1,?2,1,?3,?4,?5,?6,?7,?8,?9)`)
    .bind(f.machine,user,f.account,f.child,manifest.date,manifest.revision,id,manifest.manifestHash,receivedAt).run();
  return receivedAt;
}
it('shared domain reader consumes captured fixed-identity statistics without raw facts and preserves partial known seconds',async()=>{
  const f=await fixture({account:crypto.randomUUID(),child:fixedNativeGenerated.manifest.childId});
  const receivedAt=await seedCapturedFixedPublication(f,fixedNativeGenerated);
  const excludedPeer=await applicationSharedQuotaSourceKey(f.machine,peer,1);
  const capturedQuery={source:'application' as const,scope:'other' as const,
    fromDate:fixedNativeGenerated.manifest.date,toDate:fixedNativeGenerated.manifest.date,ownSourceKeys:[excludedPeer]};
  const result=await readApplicationSourceStatistics(env.RUNTIME_DB,f.account,f.child,capturedQuery,receivedAt);
  expect(result.days[0]).toMatchObject({totalSeconds:fixedNativeGenerated.local.knownTotalSeconds,
    nonSpecialTotalSeconds:null,categoriesSeconds:{},complete:false,
    settledThroughMs:fixedNativeGenerated.manifest.settledThroughMs});
  expect(result.days[0].reasonCodes).toEqual(expect.arrayContaining([
    'LOCAL_IDENTITYLESS_RECORD_EXCLUDED','APPLICATION_STATISTICS_INCOMPLETE','APPLICATION_USAGE_CLASSIFICATION_UNAVAILABLE']));
  expect(result.includedSourceKeys).toEqual([await applicationSharedQuotaSourceKey(f.machine,user,1)]);
  expect(result.excludedSourceKeys).toEqual([excludedPeer]);
  expect((await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_usage_segments_v2 WHERE child_id=?1').bind(f.child).first<{n:number}>())?.n).toBe(0);
});
it('captured fixed-identity zero is a complete zero, not an unavailable source',async()=>{
  const f=await fixture({account:crypto.randomUUID(),child:fixedZeroNativeGenerated.manifest.childId});
  const receivedAt=await seedCapturedFixedPublication(f,fixedZeroNativeGenerated);
  const result=await readApplicationSourceStatistics(env.RUNTIME_DB,f.account,f.child,{source:'application',scope:'other',
    fromDate:fixedZeroNativeGenerated.manifest.date,toDate:fixedZeroNativeGenerated.manifest.date,
    ownSourceKeys:[await applicationSharedQuotaSourceKey(f.machine,peer,1)]},receivedAt);
  expect(result.days[0]).toMatchObject({totalSeconds:0,nonSpecialTotalSeconds:0,categoriesSeconds:{},complete:true,reasonCodes:[]});
  expect(result.includedSourceKeys).toEqual([await applicationSharedQuotaSourceKey(f.machine,user,1)]);
});
it('other excludes exactly local source without needing its cloud copy and retains same-machine other user',async()=>{
  const f=await fixture();await seedPublished(f,peer);
  const own=await applicationSharedQuotaSourceKey(f.machine,user,1);
  const read=await readApplicationSourceStatistics(env.RUNTIME_DB,f.account,f.child,{...query,scope:'other',ownSourceKeys:[own]},now);
  expect(read.days[0]).toMatchObject({totalSeconds:600,nonSpecialTotalSeconds:600,categoriesSeconds:{study:600},complete:true});
  expect(read.excludedSourceKeys).toEqual([own]);expect(read.includedSourceKeys).toEqual([await applicationSharedQuotaSourceKey(f.machine,peer,1)]);
  expect((await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_usage_segments_v2 WHERE child_id=?1').bind(f.child).first<{n:number}>())?.n).toBe(0);
});
it('published domain statistics replace on revision decrease, never add duplicates or mix special categories',async()=>{
  const f=await fixture();await seedPublished(f,user);await seedPublished(f,peer,600,1,true);
  const read=()=>readApplicationSourceStatistics(env.RUNTIME_DB,f.account,f.child,query,now);
  const first=await read();expect(first.days[0]).toMatchObject({totalSeconds:1200,nonSpecialTotalSeconds:600,categoriesSeconds:{study:600},complete:true});
  expect((await read()).revision).toBe(first.revision);
  await seedPublished(f,user,100,2);const changed=await read();
  expect(changed.days[0]).toMatchObject({totalSeconds:700,nonSpecialTotalSeconds:100,categoriesSeconds:{study:100}});
  expect(changed.revision).not.toBe(first.revision);
});
it('missing source preserves known amount and foreign family cannot read its publications',async()=>{
  const f=await fixture();await seedPublished(f,user);
  expect((await readApplicationSourceStatistics(env.RUNTIME_DB,f.account,f.child,query,now)).days[0])
    .toMatchObject({totalSeconds:600,complete:false,reasonCodes:['APPLICATION_SOURCE_NOT_PUBLISHED']});
  const foreign=await fixture();expect((await readApplicationSourceStatistics(env.RUNTIME_DB,foreign.account,f.child,query,now)).includedSourceKeys).toEqual([]);
});
it('machine endpoint authenticates and derives Child and precise own exclusion',async()=>{
  const f=await fixture();await seedPublished(f,peer);const own=await applicationSharedQuotaSourceKey(f.machine,user,1);
  const body={...query,scope:'other',ownSourceKeys:[own]};
  const request=(token:string=f.token,patch={},version=1)=>new Request(`https://runtime.test/v2/machines/source-statistics?localUserId=${user}&assignmentVersion=${version}`,
    {method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({...body,...patch})});
  expect(await (await routeV2(request(),env,now))?.json()).toMatchObject({childId:f.child,days:[{totalSeconds:600,complete:true}]});
  await expect(routeV2(request('invalid'),env,now)).rejects.toMatchObject({status:401});
  await expect(routeV2(request(f.token,{childId:'caller'}),env,now)).rejects.toMatchObject({status:400});
  await expect(routeV2(request(f.token,{ownSourceKeys:['foreign']}),env,now)).rejects.toMatchObject({status:403});
  await expect(routeV2(request(f.token,{},2),env,now)).rejects.toMatchObject({status:403});
});
it('machine web fallback is domain-only and concurrent rebind invalidates the response',async()=>{
  const f=await fixture();let rebind=false;
  const guardian={fetch:async(request:Request)=>{
    expect(new URL(request.url).pathname).toBe('/readSourceStatistics');
    expect(await request.json()).toEqual({accountId:f.account,childId:f.child,query:{...query,source:'web'}});
    if(rebind)await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
      (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
      VALUES(?1,?2,2,'other-child',1,'override',?3,?3)`).bind(f.machine,user,now).run();
    return Response.json({schemaVersion:1,durationUnit:'seconds',source:'web',childId:f.child,fromDate:date,toDate:date,
      revision:'web-rev',readAtMs:now,includedSourceKeys:['web-fixture'],excludedSourceKeys:[],
      days:[{date,totalSeconds:600,categoriesSeconds:{study:600},settledThroughMs:now,complete:true,reasonCodes:[]}]});
  }} as typeof env.GUARDIAN_COMPUTER_USAGE;
  const request=()=>new Request(`https://runtime.test/v2/machines/source-statistics?localUserId=${user}&assignmentVersion=1`,
    {method:'POST',headers:{authorization:`Bearer ${f.token}`,'content-type':'application/json'},body:JSON.stringify({...query,source:'web'})});
  expect(await (await routeV2(request(),{...env,GUARDIAN_COMPUTER_USAGE:guardian},now))?.json()).toMatchObject({source:'web',days:[{totalSeconds:600}]});
  rebind=true;await expect(routeV2(request(),{...env,GUARDIAN_COMPUTER_USAGE:guardian},now)).rejects.toMatchObject({status:409,code:'SOURCE_STATISTICS_CONTEXT_CHANGED'});
});
it('machine negotiates the current policy explicitly without upgrading legacy callers',async()=>{
  const f=await fixture();
  let reads=0, malformed=false, rebind=false;
  const guardian={fetch:async(request:Request)=>{
    reads++;
    expect(new URL(request.url).pathname).toBe('/readSharedAccessPolicy');
    expect(await request.json()).toEqual({accountId:f.account,childId:f.child,schemaVersion:2});
    const policy=projectSharedAccessPolicyV2({},34,now);
    if(rebind)await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
      (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
      VALUES(?1,?2,2,'other-child',1,'override',?3,?3)`).bind(f.machine,user,now).run();
    return Response.json({policy:malformed?{...policy,extra:true}:policy});
  }} as typeof env.GUARDIAN_COMPUTER_USAGE;
  const request=(schema='2',version=1)=>new Request(`https://runtime.test/v2/machines/shared-access-policy?localUserId=${user}&assignmentVersion=${version}&schemaVersion=${schema}`,
    {headers:{authorization:`Bearer ${f.token}`}});
  const options={...env,GUARDIAN_COMPUTER_USAGE:guardian};
  expect(await (await routeV2(request(),options,now))?.json()).toMatchObject({policy:{schemaVersion:2,stage:'legacy',forcedUsePolicyV1:null}});
  await expect(routeV2(request('3'),options,now)).rejects.toMatchObject({status:400});
  await expect(routeV2(request('2',2),options,now)).rejects.toMatchObject({status:403});
  expect(reads).toBe(1);
  malformed=true;
  await expect(routeV2(request(),options,now)).rejects.toMatchObject({status:503,code:'SHARED_ACCESS_POLICY_UNAVAILABLE'});
  malformed=false;rebind=true;
  await expect(routeV2(request(),options,now)).rejects.toMatchObject({status:409,code:'SHARED_ACCESS_BINDING_CHANGED'});
});
it('Runtime Service Binding verifies Guardian ownership and returns only persisted application domain',async()=>{
  const f=await fixture({account:'seconds-source-account',child:'seconds-source-child'});
  await seedPublished(f,user);await seedPublished(f,peer);
  const request=(accountId=f.account)=>new Request('https://runtime-capability/getApplicationSourceStatistics',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId,childId:f.child,query})});
  const response=await exports.RuntimeComputerUsageService.fetch(request());
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({source:'application',durationUnit:'seconds',childId:f.child,
    days:[{totalSeconds:1200,nonSpecialTotalSeconds:1200,complete:true}]});
  expect((await exports.RuntimeComputerUsageService.fetch(request('foreign-account'))).status).toBe(404);
  expect((await exports.RuntimeComputerUsageService.fetch(new Request('https://runtime-capability/getApplicationSourceStatistics'))).status).toBe(405);
});
import {projectSharedAccessPolicyV2} from '../../contracts/shared-access';

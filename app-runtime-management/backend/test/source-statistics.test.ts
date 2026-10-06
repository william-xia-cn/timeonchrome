import {env} from 'cloudflare:workers';
import {expect,it} from 'vitest';
import {createUsageAccountV2,type UsageAccountRowV2} from '@timeonchrome/app-runtime-contracts/usage-account';
import {readApplicationSourceStatistics} from '../src/sourceStatistics';
import {applicationSharedQuotaSourceKey} from '../src/applicationSharedQuota';
import {sha256Hex} from '../src/crypto';
import {routeV2} from '../src/v2Routes';

const date='2026-10-07',start=Date.parse(date+'T00:00:00+08:00'),now=start+3600000;
const user='a'.repeat(64),peer='b'.repeat(64);
async function fixture(){
  const machine=crypto.randomUUID(),account=crypto.randomUUID(),child=crypto.randomUUID(),token=crypto.randomUUID();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machines_v2(id,account_id,platform,token_hash,last_seen_at_ms,created_at_ms,updated_at_ms)
    VALUES(?1,?2,'windows',?3,?4,?4,?4)`).bind(machine,account,await sha256Hex(token),now).run();
  for(const local of [user,peer])await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
    (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
    VALUES(?1,?2,1,?3,1,'default',?4,?4)`).bind(machine,local,child,start).run();
  return {machine,account,child,token};
}
// 真实冻结清单/分块/发布表的隔离fixture；本轮不重验已经通过的上传生产链。
async function seedPublished(f:Awaited<ReturnType<typeof fixture>>,local:string,total=600,revision=1,special=false){
  const row=(hour:number|null,duration:number):UsageAccountRowV2=>({kind:'total',hour,duration,category:null,subjectKey:null,displayName:null});
  const snapshot=await createUsageAccountV2({schemaVersion:2,sourceKind:'application',durationUnit:'seconds',childId:f.child,
    timezone:'Asia/Shanghai',date,revision,generatedAtMs:now,settledThroughMs:now,algorithmVersion:'windows-application-v3-only-seconds-v1',
    policyVersions:[],associationVersion:null,correctionVersion:0,rawFactCount:1,rawFactHash:'a'.repeat(64),complete:true,reasonCodes:[],
    applicationUsage:{nonSpecialTotal:special?0:total,nonSpecialCategories:special?{}:{study:total},specialTotal:special?total:0,complete:true,reasonCodes:[]}},
    [row(null,total),...Array.from({length:24},(_,h)=>row(h,h===0?total:0))]);
  const id=crypto.randomUUID();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_account_manifests_v1
    (id,machine_id,local_user_id,assignment_version,account_id,child_id,date,revision,manifest_hash,manifest_json,state,created_at_ms,received_at_ms)
    VALUES(?1,?2,?3,1,?4,?5,?6,?7,?8,?9,'received',?10,?10)`)
    .bind(id,f.machine,local,f.account,f.child,date,revision,snapshot.manifest.manifestHash,JSON.stringify(snapshot.manifest),now).run();
  for(const c of snapshot.chunks)await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_account_chunks_v1
    (manifest_id,chunk_index,chunk_hash,rows_json) VALUES(?1,?2,?3,?4)`).bind(id,c.chunkIndex,c.chunkHash,JSON.stringify(c.rows)).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_account_publications_v1
    (machine_id,local_user_id,assignment_version,account_id,child_id,date,revision,manifest_id,source_revision,published_at_ms)
    VALUES(?1,?2,1,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(machine_id,local_user_id,assignment_version,date)
    DO UPDATE SET revision=excluded.revision,manifest_id=excluded.manifest_id,source_revision=excluded.source_revision`)
    .bind(f.machine,local,f.account,f.child,date,revision,id,snapshot.manifest.manifestHash,now).run();
  return id;
}
const query={source:'application' as const,scope:'all' as const,fromDate:date,toDate:date};
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

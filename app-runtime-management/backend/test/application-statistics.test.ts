import { env } from 'cloudflare:workers';
import { expect,it,vi } from 'vitest';
import * as authority from '../src/appPolicy';
import { readPersistentApplicationUsage, rebuildApplicationStatistics,applicationStatisticsSource } from '../src/applicationStatistics';
const DAY=86400000,day=Date.parse('2026-09-27T00:00:00+08:00');
async function fixture(){
  const id=crypto.randomUUID(),child='child-'+id;
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machines_v2(id,account_id,platform,token_hash,last_seen_at_ms,created_at_ms,updated_at_ms)
    VALUES(?1,?1,'windows',?1,0,0,0)`).bind(id).run();
  return {id,child};
}
async function segment(f:Awaited<ReturnType<typeof fixture>>,id:string,start=day,end=start+1501,category='restrictedEntertainment',session='session',estimated=0){
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_usage_segments_v2
    (id,machine_id,local_user_id,assignment_version,child_id,runtime_session_id,platform,runtime_identity,display_name,
     start_at_ms,end_at_ms,duration_ms,end_reason,content_hash,uploaded_at_ms,accounting_schema_version,channel,clock_epoch_id,
     start_wall_time_ms,end_wall_time_ms,estimated,application_classification)
    VALUES(?1,?2,'user',1,?3,?4,'windows','leaf','测试应用',?5,?6,?6-?5,'fixture',?1,?6,2,'active','epoch',?5,?6,?7,?8)`)
    .bind(id,f.id,f.child,session,start,end,estimated,category).run();
}
const read=(f:Awaited<ReturnType<typeof fixture>>,from=day,to=day+DAY,filters:Parameters<typeof authority.queryAppUsage>[5]={})=>
  readPersistentApplicationUsage(env.RUNTIME_DB,f.id,f.child,from,to,filters,undefined,day+DAY);
async function build(f:Awaited<ReturnType<typeof fixture>>,from=day,to=day+DAY,filters:Parameters<typeof authority.queryAppUsage>[5]={}){
  await read(f,from,to,filters).catch(()=>{});
  for(let i=0;i<20;i++){
    const result=await rebuildApplicationStatistics(env.RUNTIME_DB,day+DAY);
    if(!result.processed)break;
  }
}
it('first read queues missing days without invoking raw aggregation; later reads only persisted values',async()=>{
  const f=await fixture();await segment(f,'one');
  const spy=vi.spyOn(authority,'queryAppUsage');
  try{await expect(read(f)).rejects.toMatchObject({code:'APPLICATION_STATISTICS_PENDING'});expect(spy).not.toHaveBeenCalled();}
  finally{spy.mockRestore();}
  await build(f);const original=await authority.queryAppUsage(env.RUNTIME_DB,f.id,f.child,day,day+DAY,{});
  const readSpy=vi.spyOn(authority,'queryAppUsage');
  try{const result=await read(f);expect(result.value).toEqual(original);expect(result.cacheStatus).toBe('persistent');expect(result.statistics.stale).toBe(false);
    await read(f);expect(readSpy).not.toHaveBeenCalled();}finally{readSpy.mockRestore();}
});
it('day/week, overlapping classifications and distinct sessions exactly retain original totals and quota',async()=>{
  const f=await fixture();await segment(f,'restricted');await segment(f,'study',day,day+1501,'study');
  await segment(f,'parallel',day,day+1501,'study','another-session');await segment(f,'yesterday',day-DAY,day-DAY+1501);
  await build(f,day-6*DAY,day+DAY);const result=await read(f,day-6*DAY,day+DAY);
  expect(result.value).toEqual(await authority.queryAppUsage(env.RUNTIME_DB,f.id,f.child,day-6*DAY,day+DAY,{}));
  expect(result.value.totalDurationMs).toBe(4503);
  expect(result.value.categories.reduce((s,c)=>s+c.durationMs,0)).toBeGreaterThan(result.value.totalDurationMs);
});
it('cross-midnight estimated/outside fact counts are deduplicated instead of added twice',async()=>{
  const f=await fixture();await segment(f,'cross',day-1000,day+1501,'study','session',1);
  const policy=await authority.getAppPolicy(env.RUNTIME_DB,f.id,f.child);
  const windows=Object.fromEntries(Object.keys(policy.timeWindows).map(d=>[d,{study:[],composite:[],restrictedEntertainment:[],unclassified:[]}])) ;
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_child_app_policy_versions_v1
    (account_id,child_id,version,payload_json,payload_hash,effective_at_ms,created_at_ms) VALUES(?1,?2,1,?3,'fixture',0,0)`)
    .bind(f.id,f.child,JSON.stringify({...policy,timeWindows:windows})).run();
  await env.RUNTIME_DB.prepare('UPDATE runtime_usage_segments_v2 SET app_policy_version=1 WHERE machine_id=?1').bind(f.id).run();
  await build(f,day-DAY,day+DAY);const result=await read(f,day-DAY,day+DAY);
  expect(result.value).toEqual(await authority.queryAppUsage(env.RUNTIME_DB,f.id,f.child,day-DAY,day+DAY,{}));
  expect(result.value.estimatedSegmentCount).toBe(1);expect(result.value.outsideTimeWindows.segmentCount).toBe(1);
});
it('partial-day callers retain the original timestamp API and quota-week scope',async()=>{
  const f=await fixture();await segment(f,'partial',day,day+2000);await build(f,day+500,day+1000);
  expect((await read(f,day+500,day+1000)).value).toEqual(await authority.queryAppUsage(env.RUNTIME_DB,f.id,f.child,day+500,day+1000,{}));
});
it('late upload retains marked stale values then replaces the affected day after rebuild',async()=>{
  const f=await fixture();await segment(f,'first');await build(f);const before=await read(f);
  await segment(f,'late',day+3000,day+4501);const stale=await read(f);
  expect(stale.value).toEqual(before.value);expect(stale.statistics.stale).toBe(true);
  await build(f);expect((await read(f)).value.totalDurationMs).toBe(3002);
  expect((await read(f)).value).toEqual(await authority.queryAppUsage(env.RUNTIME_DB,f.id,f.child,day,day+DAY,{}));
});
it('approved correction invalidates materialization; no mixed management versions or raw modifications',async()=>{
  const f=await fixture();await segment(f,'original');await build(f);
  const facts=JSON.stringify((await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?1').bind(f.id).all()).results);
  const policy=await authority.getAppPolicy(env.RUNTIME_DB,f.id,f.child);
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_child_app_policy_versions_v1
    (account_id,child_id,version,payload_json,payload_hash,effective_at_ms,created_at_ms) VALUES(?1,?2,1,?3,'fixture',0,0)`)
    .bind(f.id,f.child,JSON.stringify({...policy,weekReclassification:{fromMs:day-6*DAY,toMs:day+DAY,applications:[{platform:'windows',runtimeIdentity:'leaf',classification:'composite'}]}})).run();
  await expect(read(f)).rejects.toMatchObject({code:'APPLICATION_STATISTICS_MANAGEMENT_PENDING'});
  await build(f);expect((await read(f)).value).toEqual(await authority.queryAppUsage(env.RUNTIME_DB,f.id,f.child,day,day+DAY,{}));
  expect((await read(f)).value.categories[0]?.classification).toBe('composite');
  expect(JSON.stringify((await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?1').bind(f.id).all()).results)).toBe(facts);
});
it('family/Child/filters use separate scopes and absent facts can produce verified zero',async()=>{
  const f=await fixture(),other=await fixture();await segment(f,'scoped');await build(f);await build(other);
  expect((await read(other)).value.totalDurationMs).toBe(0);expect((await read(f)).value.totalDurationMs).toBe(1501);
  await build(f,day,day+DAY,{platform:'macos'});expect((await read(f,day,day+DAY,{platform:'macos'})).value.totalDurationMs).toBe(0);
  await build(f,day,day+DAY,{machineId:'foreign'});expect((await read(f,day,day+DAY,{machineId:'foreign'})).value.totalDurationMs).toBe(0);
});
it('restart reads published D1 results and interrupted publish keeps queued work for retry',async()=>{
  const f=await fixture();await segment(f,'rollback');await read(f).catch(()=>{});
  await env.RUNTIME_DB.prepare(`CREATE TRIGGER test_stats_failure BEFORE INSERT ON runtime_application_statistics_days_v1
    BEGIN SELECT RAISE(ABORT,'TEST_STATS_FAILURE');END`).run();
  try{await rebuildApplicationStatistics(env.RUNTIME_DB,day+DAY);
    expect(await env.RUNTIME_DB.prepare('SELECT count(*) AS n FROM runtime_application_statistics_days_v1 WHERE account_id=?1').bind(f.id).first()).toEqual({n:0});
    expect(Number((await env.RUNTIME_DB.prepare('SELECT count(*) AS n FROM runtime_application_statistics_queue_v1 WHERE account_id=?1').bind(f.id).first<{n:number}>())?.n)).toBeGreaterThan(0);
  }finally{await env.RUNTIME_DB.prepare('DROP TRIGGER test_stats_failure').run();}
  await env.RUNTIME_DB.prepare('UPDATE runtime_application_statistics_queue_v1 SET retry_at_ms=0 WHERE account_id=?1').bind(f.id).run();
  await build(f);const result=await read(f);expect(result.value.totalDurationMs).toBe(1501);
  expect(result.statistics.revision).toMatch(/^[a-f0-9]{64}$/);
});
it('watermarks count only facts for requested date and filter, preserving application milliseconds',async()=>{
  const f=await fixture();await segment(f,'precision');await segment(f,'other-day',day-DAY);
  expect((await applicationStatisticsSource(env.RUNTIME_DB,f.id,f.child,day,day+DAY,{})).rawRows).toBe(1);
  expect((await applicationStatisticsSource(env.RUNTIME_DB,f.id,f.child,day,day+DAY,{platform:'macos'})).rawRows).toBe(0);
});
it('ordinary watermark query uses the bounded date expression index',async()=>{
  const f=await fixture();await segment(f,'indexed');
  const plan=await env.RUNTIME_DB.prepare(`EXPLAIN QUERY PLAN SELECT COUNT(*),MAX(s.uploaded_at_ms)
    FROM runtime_usage_segments_v2 s JOIN runtime_machines_v2 m ON m.id=s.machine_id
    WHERE m.account_id=?1 AND s.child_id=?2 AND s.diagnostic=0
      AND COALESCE(s.start_wall_time_ms,s.start_at_ms)<?4 AND COALESCE(s.end_wall_time_ms,s.end_at_ms)>?3`)
    .bind(f.id,f.child,day,day+DAY).all();
  expect(plan.results.map(r=>r.detail).join('\n')).toContain('runtime_application_statistics_source_time_idx');
});
it('5000 settled facts are materialized once; repeated reads do not rerun aggregation and preserve quota',async()=>{
  const f=await fixture();
  for(let offset=0;offset<5000;offset+=100)await env.RUNTIME_DB.batch(Array.from({length:100},(_,i)=>{
    const id=`perf-${offset+i}`,start=day+(offset+i)*1000;
    return env.RUNTIME_DB.prepare(`INSERT INTO runtime_usage_segments_v2
      (id,machine_id,local_user_id,assignment_version,child_id,runtime_session_id,platform,runtime_identity,display_name,
        start_at_ms,end_at_ms,duration_ms,end_reason,content_hash,uploaded_at_ms,accounting_schema_version,channel,
        clock_epoch_id,start_wall_time_ms,end_wall_time_ms,estimated,application_classification)
      VALUES(?1,?2,'user',1,?3,'session','windows','leaf','测试应用',?4,?4+1000,1000,'fixture',?1,?4+1000,
        2,'active','epoch',?4,?4+1000,0,'restrictedEntertainment')`).bind(id,f.id,f.child,start);
  }));
  const cold=performance.now();await build(f);const materializeMs=performance.now()-cold;
  const original=await authority.queryAppUsage(env.RUNTIME_DB,f.id,f.child,day,day+DAY,{});
  const spy=vi.spyOn(authority,'queryAppUsage'),warm=performance.now();
  try{for(let i=0;i<3;i++)expect((await read(f)).value).toEqual(original);
    expect(spy).not.toHaveBeenCalled();expect((await read(f)).value.totalDurationMs).toBe(5_000_000);
  }finally{spy.mockRestore();}
  console.log(JSON.stringify({fixture:'application-statistics-5000',materializeMs:Math.round(materializeMs),
    fourPersistedReadsMs:Math.round(performance.now()-warm),facts:5000}));
},20000);
it('request background work is scoped to its Child, not consumed by an older unrelated queue',async()=>{
  const old=await fixture(),current=await fixture();await segment(old,'old-queued');await segment(current,'current-queued');
  await readPersistentApplicationUsage(env.RUNTIME_DB,old.id,old.child,day,day+DAY,{},undefined,day).catch(()=>{});
  const jobs:Promise<unknown>[]=[];
  await readPersistentApplicationUsage(env.RUNTIME_DB,current.id,current.child,day,day+DAY,{},job=>jobs.push(job),day+DAY).catch(()=>{});
  await Promise.all(jobs);
  expect(await env.RUNTIME_DB.prepare('SELECT count(*) AS n FROM runtime_application_statistics_days_v1 WHERE account_id=?1')
    .bind(old.id).first()).toEqual({n:0});
  expect(await env.RUNTIME_DB.prepare('SELECT count(*) AS n FROM runtime_application_statistics_days_v1 WHERE account_id=?1')
    .bind(current.id).first()).toEqual({n:2});
});

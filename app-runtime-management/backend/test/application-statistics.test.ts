import { env } from 'cloudflare:workers';
import { expect,it } from 'vitest';
import * as authority from '../src/appPolicy';
import { applicationStatisticsSource } from '../src/applicationStatistics';
import { hashUsageAccountValue } from '@timeonchrome/app-runtime-contracts/usage-account';
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
it('watermarks count only facts for requested date and filter, preserving application milliseconds',async()=>{
  const f=await fixture();await segment(f,'precision');await segment(f,'other-day',day-DAY);
  expect((await applicationStatisticsSource(env.RUNTIME_DB,f.id,f.child,day,day+DAY,{})).rawRows).toBe(1);
  expect((await applicationStatisticsSource(env.RUNTIME_DB,f.id,f.child,day,day+DAY,{platform:'macos'})).rawRows).toBe(0);
});
it('rule revision invalidates old derived statistics without changing the five source heads or publication hash',async()=>{
  const f=await fixture();await segment(f,'same-watermark');
  const outputs:D1Result[][]=[];
  const db={prepare:env.RUNTIME_DB.prepare.bind(env.RUNTIME_DB),batch:async(statements:D1PreparedStatement[])=>{
    const result=await env.RUNTIME_DB.batch(statements);outputs.push(result);return result;
  }} as D1Database;
  const source=await applicationStatisticsSource(db,f.id,f.child,day,day+DAY,{machineId:f.id,localUserId:'user',platform:'windows'});
  expect(outputs).toHaveLength(1);expect(outputs[0]).toHaveLength(6);
  expect(source).toEqual({revision:await hashUsageAccountValue({model:'application-statistics-day-v3-current-week-classification',
    heads:outputs[0]!.slice(0,5).map(r=>r.results)}),rawRows:1,
    publicationRevision:await hashUsageAccountValue(outputs[0]![5]!.results)});
  expect(source.revision).not.toBe(await hashUsageAccountValue({model:'application-statistics-day-v2',heads:outputs[0]!.slice(0,5).map(r=>r.results)}));
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
it('stable anchor watermark materializes one lookup per lane and joins the full source primary key',async()=>{
  const f=await fixture();await segment(f,'anchored');
  await env.RUNTIME_DB.prepare(`UPDATE runtime_usage_segments_v2 SET start_monotonic_time_ms=1000,
    end_monotonic_time_ms=2501,monotonic_duration_ms=1501 WHERE machine_id=?1`).bind(f.id).run();
  let sql='';
  const db={prepare:(query:string)=>{if(query.startsWith('WITH lanes'))sql=query;return env.RUNTIME_DB.prepare(query);},
    batch:env.RUNTIME_DB.batch.bind(env.RUNTIME_DB)} as D1Database;
  const before=await applicationStatisticsSource(db,f.id,f.child,day,day+DAY,{});
  const plan=await env.RUNTIME_DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .bind(f.id,f.child,day,day+DAY,null,null,null).all<{detail:string}>();
  const details=plan.results.map(r=>r.detail).join('\n');
  expect(details).toContain('MATERIALIZE anchors');
  expect(details).toContain('MATERIALIZE eligible');
  expect(details).toMatch(/SEARCH anchor USING AUTOMATIC COVERING INDEX[^\n]*runtime_session_id=\? AND clock_epoch_id=\?/);
  expect(details).toMatch(/SEARCH a USING INDEX[^\n]*machine_id=\? AND local_user_id=\? AND id=\?/);
  await segment(f,'future-unrelated',day+2*DAY,day+2*DAY+1501,'study','future-session');
  expect((await applicationStatisticsSource(db,f.id,f.child,day,day+DAY,{})).revision).toBe(before.revision);
  await segment(f,'older-anchor',day-DAY,day-DAY+1501);
  await env.RUNTIME_DB.prepare(`UPDATE runtime_usage_segments_v2 SET start_monotonic_time_ms=0,
    end_monotonic_time_ms=1501,monotonic_duration_ms=1501 WHERE machine_id=?1 AND id='older-anchor'`).bind(f.id).run();
  expect((await applicationStatisticsSource(db,f.id,f.child,day,day+DAY,{})).revision).not.toBe(before.revision);
});
it('materialized anchors retain earlier Child history, monotonic/id ties and empty lanes exactly',async()=>{
  const f=await fixture();
  await segment(f,'today',day,day+1501,'study','session');
  await segment(f,'tie-z',day-DAY,day-DAY+1501,'study','session');
  await segment(f,'tie-a',day-DAY+3000,day-DAY+4501,'study','session');
  await segment(f,'invalid-earlier',day-DAY+6000,day-DAY+7501,'study','session');
  await segment(f,'orphan',day+3000,day+4501,'study','orphan');
  await env.RUNTIME_DB.prepare(`UPDATE runtime_usage_segments_v2 SET monotonic_duration_ms=1501,
    start_monotonic_time_ms=CASE WHEN id='today' THEN 1000 WHEN id='invalid-earlier' THEN 0 ELSE 10 END,
    end_monotonic_time_ms=CASE WHEN id='today' THEN 2501 WHEN id='invalid-earlier' THEN 1502
      WHEN id='orphan' THEN 1512 ELSE 1511 END,
    child_id=CASE WHEN id IN ('tie-a','tie-z','invalid-earlier') THEN 'previous-child' ELSE child_id END
    WHERE machine_id=?1`).bind(f.id).run();
  let anchorRows:unknown[]=[];
  const db={prepare:env.RUNTIME_DB.prepare.bind(env.RUNTIME_DB),batch:async(ss:D1PreparedStatement[])=>{
    const result=await env.RUNTIME_DB.batch(ss);anchorRows=result[4]!.results;return result;
  }} as D1Database;
  await applicationStatisticsSource(db,f.id,f.child,day,day+DAY,{});
  expect(anchorRows).toEqual([
    {id:null,start_wall_time_ms:null,start_monotonic_time_ms:null,uploaded_at_ms:null},
    {id:'tie-a',start_wall_time_ms:day-DAY+3000,start_monotonic_time_ms:10,uploaded_at_ms:day-DAY+4501},
  ]);
});

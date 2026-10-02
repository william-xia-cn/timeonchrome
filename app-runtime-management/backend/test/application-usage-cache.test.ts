import { describe,expect,it,vi } from 'vitest';
import { env } from 'cloudflare:workers';
import { getAppPolicy,queryAppUsage } from '../src/appPolicy';
import { readCachedApplicationUsage } from '../src/applicationUsageCache';
const day=Date.parse('2026-10-01T00:00:00+08:00');
async function seed(id:string){
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machines_v2(id,account_id,platform,token_hash,display_name,default_child_id,last_seen_at_ms,created_at_ms,updated_at_ms)
    VALUES (?1,?1,'windows',?1,'测试电脑','child',0,0,0)`).bind(id).run();
}
async function usage(machine:string,id:string,start=day){
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_usage_segments_v2(id,machine_id,local_user_id,assignment_version,child_id,runtime_session_id,platform,runtime_identity,display_name,start_at_ms,end_at_ms,duration_ms,end_reason,content_hash,uploaded_at_ms,accounting_schema_version,channel,clock_epoch_id,start_wall_time_ms,end_wall_time_ms,estimated,application_classification)
    VALUES (?1,?2,'user',1,'child','session','windows','leaf','应用',?3,?3+1501,1501,'fixture',?1,?3+1501,2,'active','epoch',?3,?3+1501,0,'restrictedEntertainment')`).bind(id,machine,start).run();
}
function memoryCache(){
  const rows=new Map<string,Response>();
  return {match:vi.fn(async(key:Request)=>rows.get(key.url)?.clone()),put:vi.fn(async(key:Request,response:Response)=>{rows.set(key.url,response.clone());})} as unknown as Cache;
}
const read=(account:string,cache:Cache,reader:typeof queryAppUsage=queryAppUsage,filters:Parameters<typeof queryAppUsage>[5]={})=>readCachedApplicationUsage(env.RUNTIME_DB,account,'child',day,day+86400000,filters,cache,reader);
describe('original application authority cache',()=>{
it('real Cache API reuses exact original totals, detail and quota without changing source records',async()=>{
  await seed('cache-real');await usage('cache-real','real');
  const cache=await caches.open('application-authority-test');
  const original=await queryAppUsage(env.RUNTIME_DB,'cache-real','child',day,day+86400000,{});
  const raw=JSON.stringify((await env.RUNTIME_DB.prepare("SELECT * FROM runtime_usage_segments_v2 WHERE machine_id='cache-real'").all()).results);
  const reader=vi.fn(queryAppUsage);
  expect((await read('cache-real',cache,reader)).cacheStatus).toBe('miss');
  const hit=await read('cache-real',cache,reader);expect(hit.cacheStatus).toBe('hit');expect(hit.value).toEqual(original);expect(reader).toHaveBeenCalledTimes(1);
  expect(JSON.stringify((await env.RUNTIME_DB.prepare("SELECT * FROM runtime_usage_segments_v2 WHERE machine_id='cache-real'").all()).results)).toBe(raw);
});
it('late uploads within requested day and other quota-week days invalidate immediately',async()=>{
  await seed('cache-late');const cache=memoryCache();const reader=vi.fn(queryAppUsage);
  await read('cache-late',cache,reader);await usage('cache-late','late-day');
  expect((await read('cache-late',cache,reader)).cacheStatus).toBe('miss');
  await usage('cache-late','late-week',day-86400000);
  const result=await read('cache-late',cache,reader);expect(result.cacheStatus).toBe('miss');
  expect(result.value).toEqual(await queryAppUsage(env.RUNTIME_DB,'cache-late','child',day,day+86400000,{}));
  expect(reader).toHaveBeenCalledTimes(3);
});
it('policy/correction version and family/filter scope do not share cached results',async()=>{
  await seed('cache-scope');await seed('cache-other');await usage('cache-scope','scope-row');
  const cache=memoryCache(),reader=vi.fn(queryAppUsage);
  await read('cache-scope',cache,reader);
  const policy=await getAppPolicy(env.RUNTIME_DB,'cache-scope','child');
  const payload={...policy,quotas:{...policy.quotas,weeklyRestrictedEntertainmentMinutes:30},weekReclassification:{fromMs:day-3*86400000,toMs:day+4*86400000,applications:[{platform:'windows',runtimeIdentity:'leaf',classification:'study'}]}};
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_child_app_policy_versions_v1(account_id,child_id,version,payload_json,payload_hash,effective_at_ms,created_at_ms) VALUES ('cache-scope','child',1,?1,'fixture',0,0)`).bind(JSON.stringify(payload)).run();
  const changed=await read('cache-scope',cache,reader);expect(changed.cacheStatus).toBe('miss');expect(changed.value).toEqual(await queryAppUsage(env.RUNTIME_DB,'cache-scope','child',day,day+86400000,{}));
  expect((await read('cache-other',cache,reader)).cacheStatus).toBe('miss');
  expect((await read('cache-scope',cache,reader,{platform:'macos'})).cacheStatus).toBe('miss');
  expect((await read('cache-scope',cache,reader,{machineId:'missing'})).cacheStatus).toBe('miss');
  expect((await read('cache-scope',cache,reader,{localUserId:'missing'})).cacheStatus).toBe('miss');
});
it('never caches failed reads or calculations whose source changed mid-read',async()=>{
  await seed('cache-race');const cache=memoryCache();
  await expect(read('cache-race',cache,async()=>{throw new Error('fixture failure');})).rejects.toThrow('fixture failure');
  expect(cache.put).not.toHaveBeenCalled();
  await read('cache-race',cache,async(...args)=>{const value=await queryAppUsage(...args);await usage('cache-race','race-row');return value;});
  expect(cache.put).not.toHaveBeenCalled();expect((await read('cache-race',cache)).cacheStatus).toBe('miss');
});
it('legacy and auxiliary media arrivals invalidate while day/child scopes stay isolated',async()=>{
  await seed('cache-legacy-media');const cache=memoryCache();await read('cache-legacy-media',cache);
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_devices(id,subject_id,platform,token_hash,display_name,created_at_ms,last_seen_at_ms,account_id,child_id)
    VALUES ('cache-legacy-device','subject','windows','hash','历史电脑',0,0,'cache-legacy-media','child')`).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_usage_segments(id,device_id,runtime_session_id,platform,runtime_identity,display_name,start_at_ms,end_at_ms,duration_ms,end_reason,content_hash,uploaded_at_ms)
    VALUES ('cache-old','cache-legacy-device','session','windows','leaf','旧应用',?1,?1+1501,1501,'fixture','hash',?1+1501)`).bind(day).run();
  expect((await read('cache-legacy-media',cache)).cacheStatus).toBe('miss');
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_media_segments_v2(id,machine_id,local_user_id,assignment_version,child_id,runtime_session_id,platform,runtime_identity,display_name,media_kind,presentation,clock_epoch_id,start_wall_time_ms,end_wall_time_ms,start_monotonic_time_ms,end_monotonic_time_ms,monotonic_duration_ms,end_reason,estimated,last_evidence_wall_time_ms,last_evidence_monotonic_time_ms,content_hash,uploaded_at_ms)
    VALUES ('cache-media','cache-legacy-media','user',1,'child','session','windows','leaf','应用','audio','background','epoch',?1,?1+1501,0,1501,1501,'fixture',0,?1,0,'hash',?1+1501)`).bind(day).run();
  const result=await read('cache-legacy-media',cache);expect(result.cacheStatus).toBe('miss');expect(result.value).toEqual(await queryAppUsage(env.RUNTIME_DB,'cache-legacy-media','child',day,day+86400000,{}));
  expect((await readCachedApplicationUsage(env.RUNTIME_DB,'cache-legacy-media','other-child',day,day+86400000,{},cache)).cacheStatus).toBe('miss');
  expect((await readCachedApplicationUsage(env.RUNTIME_DB,'cache-legacy-media','child',day+86400000,day+2*86400000,{},cache)).cacheStatus).toBe('miss');
});
it('cache/metadata failure falls back to original authority and oversized values are not stored',async()=>{
  await seed('cache-fallback');
  const cache={match:async()=>{throw new Error('cache missing');},put:async()=>{throw new Error('cache unavailable');}} as unknown as Cache;
  expect((await read('cache-fallback',cache)).value).toEqual(await queryAppUsage(env.RUNTIME_DB,'cache-fallback','child',day,day+86400000,{}));
  const noMetadata={prepare:env.RUNTIME_DB.prepare.bind(env.RUNTIME_DB),batch:async()=>{throw new Error('metadata failure');}} as unknown as D1Database;
  expect((await readCachedApplicationUsage(noMetadata,'cache-fallback','child',day,day+86400000,{},cache)).cacheStatus).toBe('bypass');
  const bounded=memoryCache();await read('cache-fallback',bounded,async()=>({oversized:'x'.repeat(2_000_001)}));expect(bounded.put).not.toHaveBeenCalled();
});
});

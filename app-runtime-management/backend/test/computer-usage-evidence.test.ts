import { describe, expect, it } from 'vitest';
import { env, exports } from 'cloudflare:workers';
import { readComputerApplicationEvidence } from '../src/computerUsageEvidence';
import { queryAppUsage } from '../src/appPolicy';
import { isConfirmedChrome } from '../src/specialApplications';
import { CHROME_DISPLAY_RULES } from '../src/specialApplications';
import { RuntimeComputerUsageService } from '../src/computerUsageService';
import type { AppEvidence } from '@timeonchrome/app-runtime-contracts/classification';
const day=Date.parse('2026-10-01T00:00:00+08:00');
async function seed(account:string,machine:string,child:string){
await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machines_v2(id,account_id,platform,token_hash,display_name,default_child_id,last_seen_at_ms,created_at_ms,updated_at_ms)
VALUES (?1,?2,'windows',?1,'测试电脑',?3,0,0,0)`).bind(machine,account,child).run();
}
async function usage(machine:string,child:string,id:string,start:number,end:number,classification:string|null='study',estimated=0){
await env.RUNTIME_DB.prepare(`INSERT INTO runtime_usage_segments_v2(id,machine_id,local_user_id,assignment_version,child_id,runtime_session_id,platform,runtime_identity,display_name,start_at_ms,end_at_ms,duration_ms,end_reason,content_hash,uploaded_at_ms,accounting_schema_version,channel,clock_epoch_id,start_wall_time_ms,end_wall_time_ms,estimated,application_classification)
VALUES (?1,?2,'opaque-user',1,?3,'session','windows','leaf','已确认应用',?4,?5,?5-?4,'fixture',?1,?5,2,'active','epoch',?4,?5,?6,?7)`).bind(id,machine,child,start,end,estimated,classification).run();
}
describe('computer application evidence real D1 read adapter',()=>{
it('actual Worker RPC returns revision, evidence and unchanged stripped authority without hanging',async()=>{
await seed('rpc-boundary-account','rpc-boundary-machine','rpc-boundary-child');
await usage('rpc-boundary-machine','rpc-boundary-child','rpc-boundary-row',day,day+1501);
await env.RUNTIME_DB.prepare("INSERT INTO runtime_children_v1(child_id,account_id,child_name,created_at_ms,updated_at_ms) VALUES ('rpc-boundary-child','rpc-boundary-account','测试孩子',0,0)").run();
const rpc=exports.RuntimeComputerUsageService;
const args=['rpc-boundary-account','rpc-boundary-child','2026-10-01','2026-10-01'] as const;
expect(await rpc.applicationEvidenceRevision(...args)).toMatch(/^[a-f0-9]{64}$/);
const sources=await rpc.readApplicationEvidence(...args);expect(sources[0]?.totalMs).toBe(1501);
const internal=await rpc.fetch(new Request('https://capability/readApplicationEvidence',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:args[0],childId:args[1],fromDate:args[2],toDate:args[3]})}));
expect(internal.status).toBe(200);expect((await internal.json() as Array<{totalMs:number}>)[0]?.totalMs).toBe(1501);
expect((await rpc.fetch(new Request('https://capability/deleteEverything',{method:'POST'}))).status).toBe(405);
const authority=await queryAppUsage(env.RUNTIME_DB,args[0],args[1],day,day+86400000,{}) as {totalDurationMs:number};
const independent=await rpc.getApplicationUsage(...args);expect(independent.totalDurationMs).toBe(authority.totalDurationMs);
expect(JSON.stringify(independent)).not.toMatch(/runtimeIdentity|localUserId|machineId|token|opaque-user/);
const denied=await rpc.fetch(new Request('https://capability/getApplicationUsage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:'foreign-account',childId:args[1],fromDate:args[2],toDate:args[3]})}));expect(denied.status).toBe(404);
});
it('reads owned legacy zero as best-effort without borrowing another family legacy data',async()=>{
await env.RUNTIME_DB.prepare(`INSERT INTO runtime_devices(id,subject_id,platform,token_hash,display_name,created_at_ms,last_seen_at_ms,account_id,child_id)
VALUES ('legacy-fixture','legacy-subject','windows','legacy-token-hash','旧版电脑',0,0,'legacy-account','legacy-child')`).run();
const sources=await readComputerApplicationEvidence(env.RUNTIME_DB,'legacy-account','legacy-child','2026-10-01','2026-10-01');
expect(sources).toHaveLength(1);expect(sources[0]?.complete).toBe(false);expect(sources[0]?.statisticsComplete).toBe(true);expect(sources[0]?.historyQuality).toBe('bestEffort');expect(sources[0]?.totalMs).toBe(0);expect(sources[0]?.computerKey).toBeNull();expect(sources[0]?.reasons).toEqual(['LEGACY_APPLICATION_BEST_EFFORT']);
expect(await readComputerApplicationEvidence(env.RUNTIME_DB,'foreign-family','legacy-child','2026-10-01','2026-10-01')).toEqual([]);
});
it('legacy lane union and current-week correction match original authority while records and quota remain unchanged',async()=>{
await env.RUNTIME_DB.prepare(`INSERT INTO runtime_devices(id,subject_id,platform,token_hash,display_name,created_at_ms,last_seen_at_ms,account_id,child_id)
VALUES ('old-stat-device','subject','windows','old-stat-hash','历史电脑',0,0,'old-stat-account','old-stat-child')`).run();
for(const [id,session,left,right] of [['old-a','a',500,2000],['old-b','a',1000,2500],['old-c','b',1000,2500]] as const)
await env.RUNTIME_DB.prepare(`INSERT INTO runtime_usage_segments(id,device_id,runtime_session_id,platform,runtime_identity,display_name,start_at_ms,end_at_ms,duration_ms,end_reason,content_hash,uploaded_at_ms)
VALUES (?1,'old-stat-device',?2,'windows','old-leaf','历史产品',?3,?4,?4-?3,'fixture',?1,?4)`).bind(id,session,day+left,day+right).run();
const payload={classifications:[],quotas:{dailyCategoryMinutes:{study:null,composite:30,restrictedEntertainment:null,unclassified:null},weeklyRestrictedEntertainmentMinutes:null,perApplicationDailyMinutes:[]},
weekReclassification:{fromMs:Date.parse('2026-09-28T00:00:00+08:00'),toMs:Date.parse('2026-10-05T00:00:00+08:00'),applications:[{platform:'windows',runtimeIdentity:'old-leaf',classification:'composite'}]}};
await env.RUNTIME_DB.prepare(`INSERT INTO runtime_child_app_policy_versions_v1(account_id,child_id,version,payload_json,payload_hash,effective_at_ms,created_at_ms) VALUES ('old-stat-account','old-stat-child',1,?1,'fixture',0,0)`).bind(JSON.stringify(payload)).run();
const raw=JSON.stringify((await env.RUNTIME_DB.prepare("SELECT * FROM runtime_usage_segments WHERE device_id='old-stat-device'").all()).results);
const original=await queryAppUsage(env.RUNTIME_DB,'old-stat-account','old-stat-child',day,day+86400000,{}) as {totalDurationMs:number;categories:Array<{classification:string;durationMs:number}>};
const sources=await readComputerApplicationEvidence(env.RUNTIME_DB,'old-stat-account','old-stat-child','2026-10-01','2026-10-01');
expect(original.totalDurationMs).toBe(3500);expect(sources[0]?.totalMs).toBe(original.totalDurationMs);
expect(sources[0]?.categoriesMs).toEqual(Object.fromEntries(original.categories.map(item=>[item.classification,item.durationMs])));
expect(sources[0]?.intervals).toHaveLength(3);expect(sources[0]?.intervals.every(item=>item.classification==='composite')).toBe(true);
expect(sources[0]?.statisticsComplete).toBe(true);expect(sources[0]?.complete).toBe(false);
expect(await queryAppUsage(env.RUNTIME_DB,'old-stat-account','old-stat-child',day,day+86400000,{})).toEqual(original);
expect(JSON.stringify((await env.RUNTIME_DB.prepare("SELECT * FROM runtime_usage_segments WHERE device_id='old-stat-device'").all()).results)).toBe(raw);
});
it('legacy discovery failure preserves valid v2 statistics',async()=>{
await seed('isolated-account','isolated-machine','isolated-child');await usage('isolated-machine','isolated-child','isolated-row',day,day+1501);
const database={prepare(sql:string){
  if(sql.includes('FROM runtime_devices d LEFT JOIN'))return {bind(){return {all(){throw new Error('fixture legacy unavailable');}};}};
  return env.RUNTIME_DB.prepare(sql);
}} as unknown as D1Database;
const sources=await readComputerApplicationEvidence(database,'isolated-account','isolated-child','2026-10-01','2026-10-01');
expect(sources.find(item=>item.key.startsWith('app:'))?.totalMs).toBe(1501);
expect(sources.find(item=>item.key.startsWith('legacy-app:'))?.reasons).toContain('LEGACY_APPLICATION_SOURCE_UNAVAILABLE');
});
it('RPC revision failure isolation preserves valid current sources when legacy discovery fails',async()=>{
await seed('rpc-account','rpc-machine','rpc-child');await usage('rpc-machine','rpc-child','rpc-row',day,day+1501);
await env.RUNTIME_DB.prepare("INSERT INTO runtime_children_v1(child_id,account_id,child_name,created_at_ms,updated_at_ms) VALUES ('rpc-child','rpc-account','测试孩子',0,0)").run();
const database={prepare(sql:string){
  if(sql.includes('FROM runtime_devices d LEFT JOIN'))return {bind(){return {all(){throw new Error('fixture legacy unavailable');}};}};
  return env.RUNTIME_DB.prepare(sql);
}} as unknown as D1Database;
const rpc=new RuntimeComputerUsageService({} as ExecutionContext,{...env,RUNTIME_DB:database});
const first=await rpc.applicationEvidenceRevision('rpc-account','rpc-child','2026-10-01','2026-10-01');
expect(first).toMatch(/^[a-f0-9]{64}$/);expect(await rpc.applicationEvidenceRevision('rpc-account','rpc-child','2026-10-01','2026-10-01')).toBe(first);
const sources=await rpc.readApplicationEvidence('rpc-account','rpc-child','2026-10-01','2026-10-01');expect(sources.find(item=>item.key.startsWith('app:'))?.totalMs).toBe(1501);
expect(sources.find(item=>item.key.startsWith('legacy-app:'))?.totalMs).toBeNull();
});
it('corroborates the exact old Chrome leaf using retained owned strong evidence, never a legacy display name',async()=>{
await seed('legacy-chrome-account','legacy-chrome-machine','legacy-chrome-child');
await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2(machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
VALUES ('legacy-chrome-machine','user',1,'legacy-chrome-child',1,'default',0,0)`).run();
await env.RUNTIME_DB.prepare(`INSERT INTO runtime_devices(id,subject_id,platform,token_hash,display_name,created_at_ms,last_seen_at_ms,account_id,child_id)
VALUES ('legacy-chrome-device','subject','windows','legacy-chrome-hash','旧版电脑',0,0,'legacy-chrome-account','legacy-chrome-child')`).run();
for(const identity of ['strong-leaf','name-only'])await env.RUNTIME_DB.prepare(`INSERT INTO runtime_usage_segments(id,device_id,runtime_session_id,platform,runtime_identity,display_name,start_at_ms,end_at_ms,duration_ms,end_reason,content_hash,uploaded_at_ms)
VALUES (?1,'legacy-chrome-device','session','windows',?1,'Chrome',?2,?2+1501,1501,'fixture',?1,?2+1501)`).bind(identity,day).run();
await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_inventory_v1 VALUES ('legacy-chrome-machine','user','windows','strong-leaf','名称不同',?1,'installed',0,1)`)
.bind(JSON.stringify({platform:'windows',runtimeIdentity:'strong-leaf',displayName:'名称不同',values:CHROME_DISPLAY_RULES.windows,verifiedFields:['fileSeriesKey','signerKey']})).run();
const before=await queryAppUsage(env.RUNTIME_DB,'legacy-chrome-account','legacy-chrome-child',day,day+86400000,{});
const sources=await readComputerApplicationEvidence(env.RUNTIME_DB,'legacy-chrome-account','legacy-chrome-child','2026-10-01','2026-10-01');
const history=sources.find(source=>source.historyQuality==='bestEffort');expect(history?.intervals.filter(row=>row.special)).toHaveLength(1);expect(history?.totalMs).toBe(1501);
expect(await queryAppUsage(env.RUNTIME_DB,'legacy-chrome-account','legacy-chrome-child',day,day+86400000,{})).toEqual(before);
});
it('groups reviewed Chrome versions only in additive display, preserving original identity statistics',async()=>{
await seed('chrome-account','chrome-machine','chrome-child');
await usage('chrome-machine','chrome-child','chrome-v1',day,day+1000);await usage('chrome-machine','chrome-child','chrome-v2',day+1000,day+2501);
await env.RUNTIME_DB.prepare("UPDATE runtime_usage_segments_v2 SET runtime_identity='second-leaf',display_name='旧产品标签' WHERE id='chrome-v2'").run();
for(const identity of ['leaf','second-leaf'])await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_inventory_v1 VALUES ('chrome-machine','opaque-user','windows',?1,'不同版本名称',?2,'installed',0,1)`)
.bind(identity,JSON.stringify({platform:'windows',runtimeIdentity:identity,displayName:'不同版本名称',values:CHROME_DISPLAY_RULES.windows,verifiedFields:['fileSeriesKey','signerKey']})).run();
const before=await queryAppUsage(env.RUNTIME_DB,'chrome-account','chrome-child',day,day+86400000,{machineId:'chrome-machine'});
const sources=await readComputerApplicationEvidence(env.RUNTIME_DB,'chrome-account','chrome-child','2026-10-01','2026-10-01');
expect(sources[0]?.intervals.every(item=>item.special&&item.label==='Chrome')).toBe(true);
expect(new Set(sources[0]?.intervals.map(item=>item.subjectKey)).size).toBe(1);
expect(await queryAppUsage(env.RUNTIME_DB,'chrome-account','chrome-child',day,day+86400000,{machineId:'chrome-machine'})).toEqual(before);
});
it('uses unchanged authority, interval union and existing corrections; preserves raw records and milliseconds',async()=>{
const account='computer-account',machine='computer-machine',child='computer-child';
await seed(account,machine,child);await usage(machine,child,'first',day+500,day+2000);await usage(machine,child,'second',day+1000,day+2500);
await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_inventory_v1 VALUES (?1,'opaque-user','windows','leaf','Chrome',?2,'installed',0,1)`)
.bind(machine,JSON.stringify({platform:'windows',runtimeIdentity:'leaf',displayName:'Chrome',values:{productName:'Chrome'},verifiedFields:[]})).run();
const before=JSON.stringify((await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?').bind(machine).all()).results);
const original=await queryAppUsage(env.RUNTIME_DB,account,child,day,day+86400000,{machineId:machine}) as {totalDurationMs:number;categories:unknown[]};
const sources=await readComputerApplicationEvidence(env.RUNTIME_DB,account,child,'2026-10-01','2026-10-01');
expect(original.totalDurationMs).toBe(2000);expect(sources[0]?.totalMs).toBe(2000);expect(sources[0]?.categoriesMs).toEqual({study:2000});
expect(sources[0]?.intervals.map(item=>[item.startMs,item.endMs])).toEqual([[day+500,day+2000],[day+1000,day+2500]]);
expect(sources[0]?.intervals.every(item=>!item.special)).toBe(true);
expect(await queryAppUsage(env.RUNTIME_DB,account,child,day,day+86400000,{machineId:machine})).toEqual(original);
expect(JSON.stringify((await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?').bind(machine).all()).results)).toBe(before);
expect(await readComputerApplicationEvidence(env.RUNTIME_DB,'foreign',child,'2026-10-01','2026-10-01')).toEqual([]);
});
it('reads approved current-week reclassification without changing raw records, quota or authority',async()=>{
await seed('correction-account','correction-machine','correction-child');await usage('correction-machine','correction-child','corrected-row',day+50,day+1551,'study');
const payload={classifications:[],quotas:{dailyCategoryMinutes:{study:null,composite:30,restrictedEntertainment:null,unclassified:null},weeklyRestrictedEntertainmentMinutes:null,perApplicationDailyMinutes:[]},
weekReclassification:{fromMs:Date.parse('2026-09-28T00:00:00+08:00'),toMs:Date.parse('2026-10-05T00:00:00+08:00'),applications:[{platform:'windows',runtimeIdentity:'leaf',classification:'composite'}]}};
await env.RUNTIME_DB.prepare(`INSERT INTO runtime_child_app_policy_versions_v1(account_id,child_id,version,payload_json,payload_hash,effective_at_ms,created_at_ms) VALUES ('correction-account','correction-child',1,?1,'fixture',0,0)`).bind(JSON.stringify(payload)).run();
const raw=JSON.stringify((await env.RUNTIME_DB.prepare("SELECT * FROM runtime_usage_segments_v2 WHERE machine_id='correction-machine'").all()).results);
const original=await queryAppUsage(env.RUNTIME_DB,'correction-account','correction-child',day,day+86400000,{machineId:'correction-machine'});
const sources=await readComputerApplicationEvidence(env.RUNTIME_DB,'correction-account','correction-child','2026-10-01','2026-10-01');
expect(sources[0]?.totalMs).toBe(1501);expect(sources[0]?.categoriesMs).toEqual({composite:1501});expect(sources[0]?.intervals[0]?.classification).toBe('composite');
expect(await queryAppUsage(env.RUNTIME_DB,'correction-account','correction-child',day,day+86400000,{machineId:'correction-machine'})).toEqual(original);
expect(JSON.stringify((await env.RUNTIME_DB.prepare("SELECT * FROM runtime_usage_segments_v2 WHERE machine_id='correction-machine'").all()).results)).toBe(raw);
});
it('keeps unknown historical classification in evidence and marks estimated clock evidence incomplete',async()=>{
await seed('clock-account','clock-machine','clock-child');await usage('clock-machine','clock-child','clock-row',day+50,day+1551,null,1);
const sources=await readComputerApplicationEvidence(env.RUNTIME_DB,'clock-account','clock-child','2026-10-01','2026-10-01');
expect(sources[0]?.totalMs).toBe(1501);expect(sources[0]?.categoriesMs).toEqual({unclassified:1501});
expect(sources[0]?.intervals[0]?.classification).toBe('historicalUnknown');expect(sources[0]?.complete).toBe(false);expect(sources[0]?.reasons).toContain('APPLICATION_CLOCK_EVIDENCE_INCOMPLETE');
});
it('enforces one bounded query budget and does not call the unbounded authority after evidence overflow',async()=>{
await seed('budget-account','budget-machine','budget-child');
await env.RUNTIME_DB.prepare(`WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<10001)
INSERT INTO runtime_usage_segments_v2(id,machine_id,local_user_id,assignment_version,child_id,runtime_session_id,platform,runtime_identity,start_at_ms,end_at_ms,duration_ms,end_reason,content_hash,uploaded_at_ms,accounting_schema_version,channel,clock_epoch_id,start_wall_time_ms,end_wall_time_ms)
SELECT 'budget-'||i,'budget-machine','user',1,'budget-child','session','windows','leaf',?1,?1+1,1,'fixture','fixture',?1+1,2,'active','epoch',?1,?1+1 FROM n`).bind(day).run();
const sources=await readComputerApplicationEvidence(env.RUNTIME_DB,'budget-account','budget-child','2026-10-01','2026-10-01');
expect(sources[0]?.totalMs).toBeNull();expect(sources[0]?.reasons).toContain('APPLICATION_EVIDENCE_LIMIT');expect(sources[0]?.intervals).toHaveLength(10000);
});
it('requires approved Chrome leaf plus matching verified strong selectors, never a name or reserved ID alone',()=>{
const reviewed:AppEvidence={platform:'windows',runtimeIdentity:'different-version',displayName:'Unrelated label',values:CHROME_DISPLAY_RULES.windows,verifiedFields:['fileSeriesKey','signerKey']};
expect(isConfirmedChrome(reviewed)).toBe(true);
expect(isConfirmedChrome({...reviewed,values:{...reviewed.values,signerKey:'different'}})).toBe(false);
expect(isConfirmedChrome({...reviewed,verifiedFields:['fileSeriesKey']})).toBe(false);
const evidence:AppEvidence={platform:'windows',runtimeIdentity:'leaf',displayName:'Chrome',values:{fileSeriesKey:'reviewed-chrome-series'},verifiedFields:['fileSeriesKey']};
const projection={platform:'windows' as const,runtimeIdentity:'leaf',associationKey:'product:chrome',productId:'builtin.browser.chrome',canonicalName:'Chrome',status:'confirmed' as const,reasonCode:'APPROVED_PRODUCT' as const};
const knowledge={schemaVersion:2 as const,version:1,products:[{id:'builtin.browser.chrome',name:'Chrome',type:'other' as const,selectors:[{platform:'windows' as const,match:{operator:'all' as const,conditions:[{field:'fileSeriesKey' as const,value:'reviewed-chrome-series'}]}}]}],rules:[],bindings:[]};
expect(isConfirmedChrome(evidence,projection,knowledge)).toBe(true);
expect(isConfirmedChrome({...evidence,verifiedFields:[]},projection,knowledge)).toBe(false);
expect(isConfirmedChrome({...evidence,values:{fileSeriesKey:'different'}},projection,knowledge)).toBe(false);
expect(isConfirmedChrome(undefined,projection,knowledge)).toBe(false);
expect(isConfirmedChrome({...evidence,platform:'macos',values:{packageId:'com.google.Chrome'},verifiedFields:['packageId']})).toBe(false);
expect(isConfirmedChrome({...evidence,platform:'macos',values:{packageId:'com.google.Chrome'},verifiedFields:[]})).toBe(false);
});
});

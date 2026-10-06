import {env,exports} from 'cloudflare:workers';
import {expect,it} from 'vitest';
import {createUsageAccount,createUsageAccountV2,hashUsageAccountValue,type UsageAccountRow,type ApplicationUsageProjection,
  type ApplicationUsageSeconds,type UsageAccountRowV2} from '@timeonchrome/app-runtime-contracts/usage-account';
// @ts-expect-error Browser UMD intentionally has no TypeScript declaration; exercise the production adapter.
import AppRuntimeTime from '../../console/app-runtime-time.js';
import {readApplicationSharedQuotaContributions,readCoveredChromeDeduction} from '../src/applicationSharedQuota';
import {beginApplicationAccount,putApplicationAccountChunk,commitApplicationAccount,readApplicationAccountStatus,routeApplicationAccounts} from '../src/applicationAccounts';
import {publishApplicationAccounts,verifyApplicationAccountPublication} from '../src/applicationAccountPublication';
import {getAppPolicy,queryAppUsage,refreshHistoricalProductIdentityProjection} from '../src/appPolicy';
import {sha256Hex} from '../src/crypto';
import {CHROME_SPECIAL_PRODUCT} from '../src/specialApplications';
import {effectiveApplicationKnowledge} from '../src/applicationKnowledge';
import {productIdentityProjectionVersion} from '../src/applicationIdentityProjection';
import type {ProductIdentityProjection} from '@timeonchrome/app-runtime-contracts/classification';
import type {MachineSelfResponse} from '../src/contracts';
import {readPersistentApplicationUsage,rebuildApplicationStatistics,type StatisticsValue} from '../src/applicationStatistics';
import {readNativeApplicationStatisticsSeconds,readNativeApplicationStatisticsRangeSeconds} from '../src/applicationStatisticsNative';
import {routeV2} from '../src/v2Routes';
// 从隔离Native原账→物化测试导出，不复制C#生成算法或真实家庭数据。
import nativeGenerated from './application-seconds-native-generated.json';
// 原始请求由真实v3 Session/SQLite→孩子统计→现有发送器捕获，不能在此重造统计或哈希。
import childNativeGenerated from './application-child-native-generated.json';
import childWallDriftGenerated from './application-child-wall-drift-native-generated.json';
// 同一正式Service实例从事实入口到上传round捕获，非独立Session／Uploader拼接。
import childServiceGenerated from './application-child-service-native-generated.json';
import childServiceCloudResponses from './application-child-service-cloud-responses.json';
// 正式Native兼容物化及Uploader捕获的全合成请求；不在云端夹具重造行或哈希。
import childMixedGenerated from './application-child-mixed-native-generated.json';
const DAY=86400000,start=Date.parse('2026-09-27T00:00:00+08:00'),now=start+DAY;
const user='a'.repeat(64);
async function fixture(platform:MachineSelfResponse['platform']='windows',scope?:{accountId:string;child:string;machineId?:string;localUserId?:string}){
  const machineId=scope?.machineId??crypto.randomUUID(),accountId=scope?.accountId??crypto.randomUUID(),child=scope?.child??crypto.randomUUID();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machines_v2(id,account_id,platform,token_hash,last_seen_at_ms,created_at_ms,updated_at_ms)
    VALUES(?1,?2,?3,?1,0,0,0)`).bind(machineId,accountId,platform).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
    (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
    VALUES(?1,?2,1,?3,1,'default',?4,?4)`).bind(machineId,scope?.localUserId??user,child,start).run();
  const policy=await getAppPolicy(env.RUNTIME_DB,accountId,child);
  const knowledge=effectiveApplicationKnowledge({schemaVersion:2,version:1,products:[],rules:[],bindings:[]});
  const content:Omit<ProductIdentityProjection,'version'>={knowledgeVersion:1,
    items:[{platform,runtimeIdentity:'leaf',associationKey:`product:${platform}:test`,productId:'test',canonicalName:'测试产品',status:'confirmed',reasonCode:'APPROVED_PRODUCT',isChromeContainer:false}]};
  const projection=await productIdentityProjectionVersion(content,knowledge);
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_child_app_policy_versions_v1
    (account_id,child_id,version,payload_json,payload_hash,effective_at_ms,created_at_ms) VALUES(?1,?2,1,?3,'fixture',0,0)`)
    .bind(accountId,child,JSON.stringify({...policy,applicationKnowledge:knowledge,classifications:[{platform,runtimeIdentity:'leaf',displayName:null,classification:'study'}],productIdentityProjection:{version:projection,...content}})).run();
  const machine:MachineSelfResponse={machineId,accountId,platform,displayName:null,defaultChildId:child,desiredPolicyVersion:1,
    appliedPolicyVersion:1,policyState:'applied',revoked:false};
  return {machine,child,projection};
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
  associationKey?:string;reasonCodes?:string[];cutoff?:number;date?:string;hour?:number;policyVersions?:number[];applicationUsage?:ApplicationUsageProjection;extraSubjectKey?:string;deferCommit?:boolean;
  seconds?:boolean;secondsProjection?:ApplicationUsageSeconds;detailHour?:number;childId?:string}={}){
  const duration=options.empty?0:options.duration??1501;
  const row=(kind:UsageAccountRow['kind'],hour:number|null,category:string|null=null,subjectKey:string|null=null,displayName:string|null=null,d=duration):UsageAccountRow=>
    ({kind,hour,category,subjectKey,displayName,duration:d});
  const hour=options.hour??0,key=options.associationKey??`product:${f.machine.platform}:test`;
  const rows=[row('total',null),...Array.from({length:24},(_,h)=>row('total',h,null,null,null,h===hour?duration:0))];
  const detailHour=options.detailHour??hour;
  if(!options.empty){rows.push(row('category',null,options.classification??'study'),row('category',detailHour,options.classification??'study'),
    row('subject',null,null,await sha256Hex(key),'测试产品'),row('subject',detailHour,null,await sha256Hex(key),'测试产品'));}
  if(options.extraSubjectKey)rows.push(row('subject',null,null,await sha256Hex(options.extraSubjectKey),'测试产品'),
    row('subject',hour,null,await sha256Hex(options.extraSubjectKey),'测试产品'));
  const date=options.date??'2026-09-27',cutoff=options.cutoff??Date.parse(date+'T00:00:00+08:00')+DAY;
  const receivedAt=Math.max(now,cutoff);
  const header={schemaVersion:1 as const,sourceKind:'application' as const,durationUnit:'milliseconds' as const,timezone:'Asia/Shanghai' as const,
    date,revision,generatedAtMs:cutoff,settledThroughMs:cutoff,algorithmVersion:options.algorithm??(options.seconds?`${f.machine.platform}-application-seconds-v2`:`${f.machine.platform}-application-v1`),policyVersions:options.policyVersions??(options.empty?[]:[1]),
    associationVersion:options.associationVersion===undefined?f.projection:options.associationVersion,correctionVersion:options.correctionVersion??0,
    rawFactCount:options.count??(options.empty?0:1),rawFactHash:'c'.repeat(64),complete:options.complete??true,reasonCodes:options.reasonCodes??(options.complete===false?['POLICY_HISTORY_MISSING']:[]),
    ...(options.applicationUsage?{applicationUsage:options.applicationUsage}:{})};
  const {applicationUsage:_legacyUsage,...secondsHeader}=header;
  const account=options.seconds?await createUsageAccountV2({...secondsHeader,schemaVersion:2,durationUnit:'seconds',
    ...(options.childId?{childId:options.childId}:{}),
    ...(options.secondsProjection?{applicationUsage:options.secondsProjection}:{})},rows.map(row=>row.kind==='subject'
      ?{...row,classifications:[options.classification??'study']}:row)):await createUsageAccount(header,rows);
  const r=await beginApplicationAccount(env.RUNTIME_DB,f.machine,{localUserId:user,assignmentVersion:1,manifest:account.manifest},receivedAt);
  for(const c of account.chunks)await putApplicationAccountChunk(env.RUNTIME_DB,f.machine,r.manifestId,c.chunkIndex,{rows:c.rows,chunkHash:c.chunkHash});
  if(!options.deferCommit)await commitApplicationAccount(env.RUNTIME_DB,f.machine,r.manifestId,receivedAt);
  return r;
}
async function commitRequest(f:Awaited<ReturnType<typeof fixture>>,id:string){
  return routeApplicationAccounts(new Request(`http://runtime.test/v2/machines/application-accounts/manifests/${id}/commit`,
    {method:'POST'}),env.RUNTIME_DB,f.machine,now);
}
it('mixed-ledger child seconds publish known usage without advertising a complete day, and replace rather than add',async()=>{
  const f=await fixture(),reasons=['APPLICATION_MIXED_LEDGER_COMPATIBILITY_MISSING'];
  const first=await upload(f,409,{seconds:true,childId:f.child,duration:1457,complete:false,reasonCodes:reasons,deferCommit:true});
  const commit=()=>commitRequest(f,first.manifestId);
  expect(await (await commit()).json()).toMatchObject({received:true,published:true,publicationErrorCode:null});
  expect(await (await commit()).json()).toMatchObject({published:true});
  const day=await readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,start,start+DAY);
  expect(day).toMatchObject({durationUnit:'seconds',complete:false,totalDuration:null,availableTotalDuration:1457,
    days:[{complete:false,totalDuration:1457,reasonCodes:reasons}]});
  expect(day.categories.find(row=>row.category==='study')?.duration).toBe(1457);
  expect(day.products[0]?.duration).toBe(1457);
  const view=AppRuntimeTime.applicationSecondsView(day,'day');
  expect(view).toMatchObject({complete:false,totalDurationSeconds:null,availableTotalDurationSeconds:1457});
  const smaller=await upload(f,410,{seconds:true,childId:f.child,duration:1400,complete:false,reasonCodes:reasons,deferCommit:true});
  expect(await (await commitRequest(f,smaller.manifestId)).json()).toMatchObject({published:true});
  expect((await readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,start,start+DAY)).availableTotalDuration).toBe(1400);
  expect(await (await commit()).json()).toMatchObject({published:false});
  expect((await readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,start,start+DAY)).availableTotalDuration).toBe(1400);
  const complete=await upload(f,411,{seconds:true,childId:f.child,duration:1500,deferCommit:true});
  await commitRequest(f,complete.manifestId);
  expect(await readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,start,start+DAY))
    .toMatchObject({complete:true,totalDuration:1500,availableTotalDuration:1500,days:[{complete:true,reasonCodes:[]}]});
  expect((await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_usage_segments_v2 WHERE machine_id=?1')
    .bind(f.machine.machineId).first<{n:number}>())?.n).toBe(0);
  const foreign=await fixture();
  expect(await readNativeApplicationStatisticsSeconds(env.RUNTIME_DB,foreign.machine.accountId,f.child,'2026-09-27')).toBeNull();
});
it.each([
  {seconds:true,withChild:false,reasons:['APPLICATION_MIXED_LEDGER_COMPATIBILITY_MISSING']},
  {seconds:false,withChild:false,reasons:['APPLICATION_MIXED_LEDGER_COMPATIBILITY_MISSING']},
  {seconds:true,withChild:true,reasons:['APPLICATION_RAW_OVERLAP_UNRESOLVED']},
  {seconds:true,withChild:true,reasons:['APPLICATION_MIXED_LEDGER_COMPATIBILITY_MISSING','APPLICATION_RAW_CLOCK_SCOPE_UNRESOLVED']},
])('mixed-ledger exception rejects unsupported or fact-incomplete scope $seconds/$withChild/$reasons',async({seconds,withChild,reasons})=>{
  const f=await fixture(),first=await upload(f,1,{seconds:true,deferCommit:true});
  await commitRequest(f,first.manifestId);
  const invalid=await upload(f,2,{seconds,childId:withChild?f.child:undefined,complete:false,reasonCodes:reasons,deferCommit:true});
  expect(await (await commitRequest(f,invalid.manifestId)).json()).toMatchObject({received:true,published:false,
    publicationErrorCode:'APPLICATION_ACCOUNT_INCOMPLETE'});
  expect((await readNativeApplicationStatisticsSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,'2026-09-27'))
    ?.rows.find(row=>row.kind==='total'&&row.hour===null)?.duration).toBe(1501);
});
it('real Native mixed-ledger producer uploads 15 new segments / 1457 known seconds through the authenticated page route unchanged',async()=>{
  const original=JSON.stringify(childMixedGenerated),begin=childMixedGenerated.requests[0].body;
  expect(childMixedGenerated.synthetic).toBe(true);
  expect(childMixedGenerated.manifest.rawFactCount).toBe(16); // 15条新账＋1条未知旧事实；未知旧事实不贡献时长。
  expect(begin.manifest).toEqual(childMixedGenerated.manifest);
  const f=await fixture('windows',{accountId:'mixed-native-account',child:childMixedGenerated.manifest.childId,
    localUserId:begin.localUserId}),token=crypto.randomUUID(),readAt=childMixedGenerated.manifest.generatedAtMs;
  await env.RUNTIME_DB.prepare('UPDATE runtime_machines_v2 SET token_hash=?1 WHERE id=?2')
    .bind(await sha256Hex(token),f.machine.machineId).run();
  const call=async(path:string,method:string,body?:unknown)=>{
    const response=await routeV2(new Request('https://runtime.test'+path,{method,
      headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)})}),env,readAt);
    expect(response?.status).toBe(200);return response!.json() as Promise<Record<string,unknown>>;
  };
  const receipt=await call(childMixedGenerated.requests[0].path,'POST',begin);
  const prefix='/v2/machines/application-accounts/manifests/'+receipt.manifestId;
  const chunk=childMixedGenerated.requests[1];
  await call(prefix+'/chunks/0','PUT',chunk.body);
  expect(await call(prefix+'/commit','POST')).toMatchObject({received:true,published:true,revision:1,
    manifestHash:childMixedGenerated.manifest.manifestHash});
  await call(prefix+'/commit','POST');
  const browserToken='test-mixed-browser-'+crypto.randomUUID().replaceAll('-','');
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_browser_sessions_v1
    (token_hash,account_id,children_json,created_at_ms,expires_at_ms,last_used_at_ms) VALUES(?1,?2,?3,?4,?5,?4)`)
    .bind(await sha256Hex(browserToken),f.machine.accountId,JSON.stringify([{id:f.child,name:'测试孩子'}]),readAt,readAt+60000).run();
  const from=Date.parse(childMixedGenerated.manifest.date+'T00:00:00+08:00');
  const response=await routeV2(new Request(`https://runtime.test/v2/module/app-usage?childId=${f.child}&fromMs=${from}&toMs=${from+DAY}&durationUnit=seconds`,
    {headers:{authorization:`RuntimeSession ${browserToken}`}}),env,readAt);
  expect(response?.status).toBe(200);
  const page=await response!.json();
  expect(page).toMatchObject({complete:false,totalDuration:null,availableTotalDuration:1457,
    days:[{reasonCodes:['APPLICATION_MIXED_LEDGER_COMPATIBILITY_MISSING']}]});
  expect(AppRuntimeTime.applicationSecondsView(page,'day')).toMatchObject({complete:false,
    totalDurationSeconds:null,availableTotalDurationSeconds:1457});
  expect(JSON.stringify(childMixedGenerated)).toBe(original);
});
it.each(['windows','macos'] as const)('v2 %s producer seconds and product classification rows publish without facts',async(platform)=>{
  const f=await fixture(platform),r=await upload(f,1,{seconds:true,duration:51,deferCommit:true,policyVersions:[],
    secondsProjection:{nonSpecialTotal:51,nonSpecialCategories:{study:51},specialTotal:0,complete:true,reasonCodes:[]}});
  expect(await (await commitRequest(f,r.manifestId)).json()).toMatchObject({published:true,publicationErrorCode:null});
  const stored=await env.RUNTIME_DB.prepare('SELECT manifest_json FROM runtime_application_account_manifests_v1 WHERE id=?1')
    .bind(r.manifestId).first<{manifest_json:string}>();
  expect(JSON.parse(stored!.manifest_json)).toMatchObject({schemaVersion:2,durationUnit:'seconds',settledThroughMs:now,
    applicationUsage:{nonSpecialTotal:51,nonSpecialCategories:{study:51},specialTotal:0}});
  const chunks=await env.RUNTIME_DB.prepare('SELECT rows_json FROM runtime_application_account_chunks_v1 WHERE manifest_id=?1 ORDER BY chunk_index')
    .bind(r.manifestId).all<{rows_json:string}>();
  const rows=chunks.results.flatMap(chunk=>JSON.parse(chunk.rows_json));
  expect(rows.find(row=>row.kind==='total'&&row.hour===null)?.duration).toBe(51);
  expect(rows.find(row=>row.kind==='subject'&&row.hour===null)).toMatchObject({duration:51,classifications:['study']});
  const read=await readNativeApplicationStatisticsSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,'2026-09-27');
  expect(read).toMatchObject({durationUnit:'seconds',complete:true,legacySourceCount:0});
  expect(read?.rows.find(row=>row.kind==='total'&&row.hour===null)?.duration).toBe(51);
  expect(read?.rows.find(row=>row.kind==='subject'&&row.hour===null)?.classifications).toEqual(['study']);
  const foreign=await fixture(platform);
  expect(await readNativeApplicationStatisticsSeconds(env.RUNTIME_DB,foreign.machine.accountId,f.child,'2026-09-27')).toBeNull();
  expect(await readNativeApplicationStatisticsSeconds(env.RUNTIME_DB,f.machine.accountId,foreign.child,'2026-09-27')).toBeNull();
  expect(await readNativeApplicationStatisticsSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,'2026-09-26')).toBeNull();
  expect(await readNativeApplicationStatisticsSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,'2026-09-27',{machineId:foreign.machine.machineId})).toBeNull();
  expect((await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_usage_segments_v2 WHERE machine_id=?1')
    .bind(f.machine.machineId).first<{n:number}>())?.n).toBe(0);
});
it.each(['generated','boundary'] as const)('actual C# %s output crosses authenticated upload, persistent read and page adapter',async(kind)=>{
  const value=nativeGenerated[kind],f=await fixture('windows'),token=crypto.randomUUID();
  const receivedAt=value.manifest.generatedAtMs+1;
  await env.RUNTIME_DB.prepare('UPDATE runtime_machines_v2 SET token_hash=?1 WHERE id=?2')
    .bind(await sha256Hex(token),f.machine.machineId).run();
  const call=async(path:string,method:string,body?:unknown)=>{
    const response=await routeV2(new Request('https://runtime.test/v2/machines/application-accounts/'+path,{method,
      headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,receivedAt);
    expect(response?.status).toBe(200);return response!.json() as Promise<Record<string,unknown>>;
  };
  const before=JSON.stringify(value);
  const receipt=await call('manifests','POST',{localUserId:user,assignmentVersion:1,manifest:value.manifest});
  for(const chunk of value.chunks)await call(`manifests/${receipt.manifestId}/chunks/${chunk.chunkIndex}`,'PUT',
    {rows:chunk.rows,chunkHash:chunk.chunkHash});
  expect(await call(`manifests/${receipt.manifestId}/commit`,'POST')).toMatchObject({published:true,
    manifestHash:value.manifest.manifestHash,revision:value.manifest.revision});
  const fromMs=Date.parse(value.manifest.date+'T00:00:00+08:00');
  const source=await readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,fromMs,fromMs+DAY);
  const expected=kind==='generated'?52:1;
  expect(source).toMatchObject({complete:true,totalDuration:expected,applicationUsage:value.manifest.applicationUsage});
  const view=AppRuntimeTime.applicationSecondsView(source,'day');
  expect(view).toMatchObject({durationUnit:'seconds',complete:true,totalDurationSeconds:expected,
    settledThroughMs:value.manifest.settledThroughMs});
  if(kind==='boundary'){
    expect(source.days[0].hours.find(row=>row.kind==='total'&&row.hour===0)?.duration).toBe(0);
    expect(source.days[0].hours.find(row=>row.kind==='category'&&row.category==='study'&&row.hour===0)?.duration).toBe(1);
  }
  expect(JSON.stringify(value)).toBe(before);
  expect((await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_usage_segments_v2 WHERE machine_id=?1')
    .bind(f.machine.machineId).first<{n:number}>())?.n).toBe(0);
});
it.each(['windows','macos'] as const)('v2 %s independent hourly allocation publishes without changing daily statistics',async(platform)=>{
  const f=await fixture(platform),receipt=await upload(f,1,{seconds:true,duration:1,hour:1,detailHour:0,deferCommit:true,
    secondsProjection:{nonSpecialTotal:1,nonSpecialCategories:{study:1},specialTotal:0,complete:true,reasonCodes:[]}});
  expect(await (await commitRequest(f,receipt.manifestId)).json()).toMatchObject({published:true,publicationErrorCode:null});
  const read=await readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,start,now);
  expect(read).toMatchObject({complete:true,totalDuration:1,applicationUsage:{nonSpecialTotal:1,specialTotal:0}});
  expect(read.days[0].hours.find(row=>row.kind==='total'&&row.hour===0)?.duration).toBe(0);
  expect(read.days[0].hours.find(row=>row.kind==='category'&&row.hour===0)?.duration).toBe(1);
  expect(read.categories[0].duration).toBe(1);expect(read.products[0].duration).toBe(1);
});
it.each(['windows','macos'] as const)('authenticated %s seconds transport publishes, reads and replaces without raw-ledger prerequisites',async(platform)=>{
  const f=await fixture(platform,{accountId:`seconds-transport-${platform}`,child:`seconds-transport-child-${platform}`}),token=crypto.randomUUID();
  await env.RUNTIME_DB.prepare('UPDATE runtime_machines_v2 SET token_hash=?1 WHERE id=?2')
    .bind(await sha256Hex(token),f.machine.machineId).run();
  const call=async(path:string,method:string,body?:unknown)=>{
    const response=await routeV2(new Request('https://runtime.test/v2/machines/application-accounts/'+path,{method,
      headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,now);
    expect(response?.status).toBe(200);return response!.json() as Promise<Record<string,unknown>>;
  };
  const send=async(revision:number,duration:number)=>{
    const subjectKey=await sha256Hex(`product:${platform}:test`);
    const rows:UsageAccountRowV2[]=[{kind:'total',hour:null,category:null,subjectKey:null,displayName:null,duration},
      ...Array.from({length:24},(_,hour)=>({kind:'total' as const,hour,category:null,subjectKey:null,displayName:null,duration:hour===0?duration:0})),
      {kind:'category',hour:null,category:'study',subjectKey:null,displayName:null,duration},
      {kind:'category',hour:0,category:'study',subjectKey:null,displayName:null,duration},
      {kind:'subject',hour:null,category:null,subjectKey,displayName:'测试产品',duration,classifications:['study']},
      {kind:'subject',hour:0,category:null,subjectKey,displayName:'测试产品',duration,classifications:['study']}];
    const account=await createUsageAccountV2({schemaVersion:2,sourceKind:'application',durationUnit:'seconds',timezone:'Asia/Shanghai',
      date:'2026-09-27',revision,generatedAtMs:now,settledThroughMs:now,algorithmVersion:`${platform}-application-seconds-v2`,
      policyVersions:[],associationVersion:f.projection,correctionVersion:0,rawFactCount:1,rawFactHash:'c'.repeat(64),complete:true,reasonCodes:[],
      applicationUsage:{nonSpecialTotal:duration,nonSpecialCategories:{study:duration},specialTotal:0,complete:true,reasonCodes:[]}},rows);
    const receipt=await call('manifests','POST',{localUserId:user,assignmentVersion:1,manifest:account.manifest});
    for(const chunk of account.chunks)await call(`manifests/${receipt.manifestId}/chunks/${chunk.chunkIndex}`,'PUT',{rows:chunk.rows,chunkHash:chunk.chunkHash});
    expect(await call(`manifests/${receipt.manifestId}/commit`,'POST')).toMatchObject({received:true,published:true,revision});
    return receipt;
  };
  const first=await send(1,51),rpc=exports.RuntimeComputerUsageService;
  expect(await rpc.getApplicationUsage(f.machine.accountId,f.child,'2026-09-27','2026-09-27',true)).toMatchObject({durationUnit:'seconds',totalDuration:51});
  const assertPageRead=async(expected:number)=>{
    const source=await readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,start,now);
    const before=JSON.stringify(source),view=AppRuntimeTime.applicationSecondsView(source,'day');
    expect(view).toMatchObject({durationUnit:'seconds',complete:true,totalDurationSeconds:expected,
      availableTotalDurationSeconds:expected,settledThroughMs:now,missingDates:[]});
    expect(view.categories).toEqual([{classification:'study',durationSeconds:expected}]);
    expect(view.applications[0]).toMatchObject({displayName:'测试产品',durationSeconds:expected,classifications:['study']});
    expect(view.buckets).toHaveLength(24);expect(view.buckets[0].durationSeconds).toBe(expected);
    expect(Object.hasOwn(view,'totalDurationMs')).toBe(false);expect(JSON.stringify(source)).toBe(before);
    expect(AppRuntimeTime.formatSeconds(view.totalDurationSeconds)).toBe(`${expected}秒`);
  };
  await assertPageRead(51);
  const newer=await send(2,20);
  await call(`manifests/${newer.manifestId}/commit`,'POST');
  await call(`manifests/${first.manifestId}/commit`,'POST');
  expect(await rpc.getApplicationUsage(f.machine.accountId,f.child,'2026-09-27','2026-09-27',true)).toMatchObject({durationUnit:'seconds',totalDuration:20});
  await assertPageRead(20);
  expect((await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_usage_segments_v2 WHERE machine_id=?1').bind(f.machine.machineId).first<{n:number}>())?.n).toBe(0);
  await expect(routeV2(new Request('https://runtime.test/v2/machines/application-accounts/manifests/'+newer.manifestId+'/status'),env,now))
    .rejects.toMatchObject({status:401,code:'UNAUTHORIZED'});
  const denied=await rpc.fetch(new Request('https://runtime-capability/getApplicationUsage',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({accountId:'foreign-account',childId:f.child,fromDate:'2026-09-27',toDate:'2026-09-27',secondsOnly:true})}));
  expect(denied.status).toBe(404);expect(await denied.json()).toEqual({code:'CHILD_NOT_FOUND'});
});
it.each([
  {generated:childNativeGenerated,total:190,durations:[180,10],category:'unclassified',usageComplete:false,productDurations:[190]},
  {generated:childWallDriftGenerated,total:360,durations:[180,180],category:'study',usageComplete:true,productDurations:[180,180]},
  {generated:childServiceGenerated,total:180,durations:[180],category:'study',usageComplete:true,productDurations:[180]},
])('real v3 SQLite producer requests publish $total frozen child seconds and reach the cloud page adapter unchanged',async({generated,total,durations,category,usageComplete,productDurations})=>{
  const {begin,chunks,rawSegments}=generated;
  expect(generated).toMatchObject({synthetic:true,contractsVersion:'1.37.0'});
  expect(rawSegments).toHaveLength(durations.length);
  expect(rawSegments.every(segment=>segment.schemaVersion===3&&segment.childId===begin.manifest.childId
    &&segment.source.localUserId===begin.localUserId&&segment.source.assignmentVersion===begin.assignmentVersion)).toBe(true);
  expect(rawSegments.map(segment=>segment.durationSeconds)).toEqual(durations);
  const lastSegment=rawSegments[rawSegments.length-1];
  const inputBefore=JSON.stringify(generated),source=rawSegments[0].source,token=crypto.randomUUID();
  // 三份真实捕获使用同一合成来源；只清理该固定测试家庭，保持原请求和哈希不变。
  await env.RUNTIME_DB.prepare('DELETE FROM runtime_machines_v2 WHERE id=?1 AND account_id=?2')
    .bind(source.machineId,'child-native-transport-windows').run();
  await env.RUNTIME_DB.prepare('DELETE FROM runtime_child_app_policy_versions_v1 WHERE account_id=?1 AND child_id=?2')
    .bind('child-native-transport-windows',begin.manifest.childId).run();
  const f=await fixture('windows',{accountId:'child-native-transport-windows',child:begin.manifest.childId,
    machineId:source.machineId,localUserId:begin.localUserId});
  await env.RUNTIME_DB.prepare('UPDATE runtime_machines_v2 SET token_hash=?1 WHERE id=?2')
    .bind(await sha256Hex(token),f.machine.machineId).run();
  // 最新分配已经是B，但真实生产器捕获的A清单和原段仍保持原孩子。
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
    (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
    VALUES(?1,?2,2,'synthetic-child-b',1,'override',?3,?3)`)
    .bind(f.machine.machineId,begin.localUserId,lastSegment.endWallTimeMs).run();
  const call=async(path:string,method:string,body?:unknown)=>{
    const response=await routeV2(new Request('https://runtime.test/v2/machines/application-accounts/'+path,{method,
      headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)})}),env,begin.manifest.generatedAtMs);
    expect(response?.status).toBe(200);return response!.json() as Promise<Record<string,unknown>>;
  };
  const capability=await call('capabilities','GET');
  expect(capability.capabilities).toContain('application-statistics-child-scope-v1');
  const receipt=await call('manifests','POST',begin);
  expect(receipt).toMatchObject({received:false,published:false,revision:begin.manifest.revision,
    manifestHash:begin.manifest.manifestHash,publishStatus:'pending'});
  const pendingStatus=await call(`manifests/${receipt.manifestId}/status`,'GET');
  expect(pendingStatus).toEqual({...receipt,receivedChunkIndexes:[],publicationErrorCode:null});
  const chunkReceipts=[];
  for(const chunk of chunks){
    const response=await call(`manifests/${receipt.manifestId}/chunks/${chunk.chunkIndex}`,'PUT',chunk.body);
    expect(response).toEqual({manifestId:receipt.manifestId,chunkIndex:chunk.chunkIndex,
      chunkHash:chunk.body.chunkHash,received:true,published:false});
    chunkReceipts.push(response);
  }
  const commit=await call(`manifests/${receipt.manifestId}/commit`,'POST');
  expect(commit).toMatchObject({received:true,published:true,
    manifestHash:begin.manifest.manifestHash,revision:begin.manifest.revision});
  const publishedStatus=await call(`manifests/${receipt.manifestId}/status`,'GET');
  expect(publishedStatus).toEqual({...commit,receivedChunkIndexes:chunks.map(chunk=>chunk.chunkIndex)});
  if(total===180)expect({synthetic:true,
    contractsVersion:generated.contractsVersion,requestManifestHash:begin.manifest.manifestHash,
    capability,begin:receipt,pendingStatus,chunks:chunkReceipts,commit,publishedStatus}).toEqual(childServiceCloudResponses);
  // 重放原请求不累加；没有原段云端接收、旧策略历史或云端重算前提。
  expect(await call('manifests','POST',begin)).toMatchObject({manifestId:receipt.manifestId,received:true});
  await call(`manifests/${receipt.manifestId}/commit`,'POST');
  const date=begin.manifest.date,from=Date.parse(date+'T00:00:00+08:00');
  const cloud=await readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,from,from+DAY);
  expect(cloud).toMatchObject({complete:true,durationUnit:'seconds',totalDuration:total,availableTotalDuration:total,
    applicationUsage:{complete:usageComplete,nonSpecialTotal:total}});
  expect(cloud.categories.map(row=>({category:row.category,duration:row.duration}))).toEqual([{category,duration:total}]);
  expect(cloud.products.map(row=>row.duration).sort((a,b)=>a-b)).toEqual(productDurations);
  expect(cloud.products.every(row=>row.classifications?.length===1&&row.classifications[0]===category)).toBe(true);
  expect(await exports.RuntimeComputerUsageService.getApplicationUsage(f.machine.accountId,f.child,date,date,true))
    .toMatchObject({durationUnit:'seconds',totalDuration:total});
  // 正式页面使用的鉴权HTTP入口也必须读取同一冻结孩子统计，而非只测试内部函数。
  const browserToken='test-browser-session-'+crypto.randomUUID().replaceAll('-','');
  const readAt=begin.manifest.generatedAtMs;
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_browser_sessions_v1
    (token_hash,account_id,children_json,created_at_ms,expires_at_ms,last_used_at_ms) VALUES(?1,?2,?3,?4,?5,?4)`)
    .bind(await sha256Hex(browserToken),f.machine.accountId,JSON.stringify([{id:f.child,name:'测试孩子'}]),readAt,readAt+60000).run();
  const pageRequest=(childId=f.child)=>new Request(`https://runtime.test/v2/module/app-usage?childId=${childId}&fromMs=${from}&toMs=${from+DAY}&durationUnit=seconds`,
    {headers:{authorization:`RuntimeSession ${browserToken}`}});
  const pageResponse=await routeV2(pageRequest(),env,readAt);
  expect(pageResponse?.status).toBe(200);
  const pageSource=await pageResponse!.json();
  expect(pageSource).toEqual(cloud);
  await expect(routeV2(pageRequest('synthetic-child-b'),env,readAt)).rejects.toMatchObject({code:'CHILD_NOT_FOUND'});
  const view=AppRuntimeTime.applicationSecondsView(pageSource,'day');
  expect(view).toMatchObject({durationUnit:'seconds',complete:true,totalDurationSeconds:total,
    availableTotalDurationSeconds:total,settledThroughMs:lastSegment.endWallTimeMs,missingDates:[]});
  expect(view.categories).toEqual([{classification:category,durationSeconds:total}]);
  expect(view.applications.map((row:{durationSeconds:number})=>row.durationSeconds).sort((a:number,b:number)=>a-b)).toEqual(productDurations);
  expect(view.applications.every((row:{classifications:string[]})=>row.classifications.length===1&&row.classifications[0]===category)).toBe(true);
  const stored=await env.RUNTIME_DB.prepare('SELECT manifest_json FROM runtime_application_account_manifests_v1 WHERE id=?1')
    .bind(receipt.manifestId).first<{manifest_json:string}>();
  expect(JSON.parse(stored!.manifest_json)).toEqual(begin.manifest);
  expect(await readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,f.machine.accountId,'synthetic-child-b',from,from+DAY))
    .toMatchObject({totalDuration:null,availableTotalDuration:null});
  expect((await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_usage_segments_v2 WHERE machine_id=?1')
    .bind(f.machine.machineId).first<{n:number}>())?.n).toBe(0);
  expect(JSON.stringify(generated)).toBe(inputBefore);
});
it('child-scoped HTTP snapshots retain historical assignments, isolate users, and replace rather than accumulate',async()=>{
  const a=await fixture(),b=await fixture('windows',{accountId:a.machine.accountId,child:crypto.randomUUID()});
  const otherUser='b'.repeat(64),token=crypto.randomUUID();
  await env.RUNTIME_DB.prepare('UPDATE runtime_machines_v2 SET token_hash=?1 WHERE id=?2')
    .bind(await sha256Hex(token),a.machine.machineId).run();
  // A→B保留原A历史行；旧A统计补发不依赖当前B。
  await env.RUNTIME_DB.batch([
    env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
      (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
      VALUES(?1,?2,2,?3,1,'override',?4,?4)`).bind(a.machine.machineId,user,b.child,start+DAY/2),
    env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2
      (machine_id,local_user_id,assignment_version,child_id,protected,assignment_source,effective_at_ms,created_at_ms)
      VALUES(?1,?2,1,?3,1,'override',?4,?4)`).bind(a.machine.machineId,otherUser,b.child,start),
  ]);
  const call=async(path:string,method:string,body?:unknown)=>{
    const response=await routeV2(new Request('https://runtime.test/v2/machines/application-accounts/'+path,{method,
      headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,now);
    expect(response?.status).toBe(200);return response!.json() as Promise<Record<string,unknown>>;
  };
  const make=(childId:string,revision:number,duration:number)=>createUsageAccountV2({schemaVersion:2,sourceKind:'application',
    durationUnit:'seconds',timezone:'Asia/Shanghai',childId,date:'2026-09-27',revision,generatedAtMs:now,settledThroughMs:now,
    algorithmVersion:'windows-application-seconds-v2',policyVersions:[],associationVersion:null,correctionVersion:0,
    rawFactCount:1,rawFactHash:'c'.repeat(64),complete:true,reasonCodes:[]},[
      {kind:'total',hour:null,category:null,subjectKey:null,displayName:null,duration},
      ...Array.from({length:24},(_,hour)=>({kind:'total' as const,hour,category:null,subjectKey:null,displayName:null,duration:hour===0?duration:0})),
    ]);
  const send=async(localUserId:string,assignmentVersion:number,childId:string,revision:number,duration:number)=>{
    const account=await make(childId,revision,duration);
    const receipt=await call('manifests','POST',{localUserId,assignmentVersion,manifest:account.manifest});
    for(const chunk of account.chunks)await call(`manifests/${receipt.manifestId}/chunks/${chunk.chunkIndex}`,'PUT',
      {rows:chunk.rows,chunkHash:chunk.chunkHash});
    expect(await call(`manifests/${receipt.manifestId}/commit`,'POST')).toMatchObject({published:true,revision});
    return receipt;
  };
  expect((await call('capabilities','GET')).capabilities).toContain('application-statistics-child-scope-v1');
  const old=await send(user,1,a.child,1,51);await send(user,2,b.child,1,20);await send(otherUser,1,b.child,1,7);
  const read=(child:string)=>readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,a.machine.accountId,child,start,now);
  expect(await read(a.child)).toMatchObject({complete:true,totalDuration:51});
  expect(await read(b.child)).toMatchObject({complete:true,totalDuration:27});
  await send(user,1,a.child,2,40);await call(`manifests/${old.manifestId}/commit`,'POST');
  expect(await read(a.child)).toMatchObject({totalDuration:40});
  expect(await read(b.child)).toMatchObject({totalDuration:27});
  const forged=await make(b.child,3,40);
  await expect(call('manifests','POST',{localUserId:user,assignmentVersion:1,manifest:forged.manifest}))
    .rejects.toMatchObject({status:403,code:'APPLICATION_ACCOUNT_CHILD_SCOPE_MISMATCH'});
  await expect(call('manifests','POST',{localUserId:otherUser,assignmentVersion:1,manifest:(await make(a.child,2,7)).manifest}))
    .rejects.toMatchObject({status:403,code:'APPLICATION_ACCOUNT_CHILD_SCOPE_MISMATCH'});
  const tampered={...forged.manifest,childId:a.child};
  await expect(call('manifests','POST',{localUserId:user,assignmentVersion:1,manifest:tampered}))
    .rejects.toMatchObject({status:400,code:'USAGE_ACCOUNT_MANIFEST_HASH_MISMATCH'});
  expect(await read(a.child)).toMatchObject({totalDuration:40});
});
it('hash-valid frozen child conflicts cannot publish or replace the previous readable head',async()=>{
  const f=await fixture(),first=await upload(f,1,{seconds:true,duration:51,deferCommit:true});
  expect(await (await commitRequest(f,first.manifestId)).json()).toMatchObject({published:true});
  const next=await upload(f,2,{seconds:true,duration:40,deferCommit:true});
  const stored=await env.RUNTIME_DB.prepare('SELECT manifest_json FROM runtime_application_account_manifests_v1 WHERE id=?1')
    .bind(next.manifestId).first<{manifest_json:string}>();
  const {manifestHash:_old,...header}=JSON.parse(stored!.manifest_json);
  // 可变数据库／接收后损坏亦须核对冻结孩子，不能只依赖 begin 校验。
  const altered={...header,childId:crypto.randomUUID()};
  const manifestHash=await hashUsageAccountValue(altered);
  await env.RUNTIME_DB.prepare('UPDATE runtime_application_account_manifests_v1 SET manifest_json=?2,manifest_hash=?3 WHERE id=?1')
    .bind(next.manifestId,JSON.stringify({...altered,manifestHash}),manifestHash).run();
  expect(await (await commitRequest(f,next.manifestId)).json()).toMatchObject({received:true,published:false,
    publicationErrorCode:'APPLICATION_ACCOUNT_CHILD_SCOPE_MISMATCH'});
  expect(await readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,start,now))
    .toMatchObject({complete:true,totalDuration:51});
});
it('persistent seconds reads reject hash-valid child conflicts in an already published snapshot',async()=>{
  const f=await fixture(),receipt=await upload(f,1,{seconds:true,duration:51,deferCommit:true});
  expect(await (await commitRequest(f,receipt.manifestId)).json()).toMatchObject({published:true});
  const stored=await env.RUNTIME_DB.prepare('SELECT manifest_json FROM runtime_application_account_manifests_v1 WHERE id=?1')
    .bind(receipt.manifestId).first<{manifest_json:string}>();
  const {manifestHash:_old,...header}=JSON.parse(stored!.manifest_json);
  const altered={...header,childId:crypto.randomUUID()},manifestHash=await hashUsageAccountValue(altered);
  await env.RUNTIME_DB.prepare('UPDATE runtime_application_account_manifests_v1 SET manifest_json=?2,manifest_hash=?3 WHERE id=?1')
    .bind(receipt.manifestId,JSON.stringify({...altered,manifestHash}),manifestHash).run();
  await expect(readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,start,now))
    .rejects.toMatchObject({status:503,code:'APPLICATION_ACCOUNT_CHILD_SCOPE_MISMATCH'});
});
it('v2 seconds reject legacy algorithms and invalid projections without replacing the valid head',async()=>{
  const f=await fixture(),first=await upload(f,1,{seconds:true,duration:51,deferCommit:true});
  expect(await (await commitRequest(f,first.manifestId)).json()).toMatchObject({published:true});
  const wrongAlgorithm=await upload(f,2,{seconds:true,duration:51,algorithm:'windows-application-v1',deferCommit:true});
  expect(await (await commitRequest(f,wrongAlgorithm.manifestId)).json()).toMatchObject({published:false,
    publicationErrorCode:'APPLICATION_ACCOUNT_ALGORITHM_UNSUPPORTED'});
  const wrongProjection=await upload(f,3,{seconds:true,duration:51,deferCommit:true,
    secondsProjection:{nonSpecialTotal:52,nonSpecialCategories:{study:51},specialTotal:0,complete:true,reasonCodes:[]}});
  expect(await (await commitRequest(f,wrongProjection.manifestId)).json()).toMatchObject({published:false,
    publicationErrorCode:'APPLICATION_ACCOUNT_INVALID_USAGE_PROJECTION'});
  expect((await env.RUNTIME_DB.prepare('SELECT revision FROM runtime_application_account_publications_v1 WHERE machine_id=?1')
    .bind(f.machine.machineId).first<{revision:number}>())?.revision).toBe(1);
});
it('seconds range preserves available days without presenting missing days as zero',async()=>{
  const f=await fixture(),one=await upload(f,1,{seconds:true,duration:51,deferCommit:true});
  await commitRequest(f,one.manifestId);
  const daily=await readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,start,start+DAY);
  expect(daily).toMatchObject({durationUnit:'seconds',complete:true,totalDuration:51,availableTotalDuration:51});
  expect(daily.products[0]).toMatchObject({duration:51,classifications:['study']});
  const partial=await readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,start-DAY,start+DAY);
  expect(partial).toMatchObject({complete:false,totalDuration:null,availableTotalDuration:51});
  expect(partial.days[0]).toMatchObject({totalDuration:null,reasonCodes:['APPLICATION_STATISTICS_NOT_AVAILABLE']});
  expect(partial.days[1].totalDuration).toBe(51);
  expect(await readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,start-DAY,start+DAY)).toEqual(partial);
  await expect(readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,start,start+8*DAY)).rejects.toMatchObject({code:'INVALID_RANGE'});
  await expect(readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,f.machine.accountId,f.child,start+1,start+DAY)).rejects.toMatchObject({code:'INVALID_RANGE'});
});
it('seconds reads preserve producer special contributions across sources without deriving quota or guessing missing projections',async()=>{
  const first=await fixture(),second=await fixture();
  await env.RUNTIME_DB.prepare('UPDATE runtime_machines_v2 SET account_id=?1 WHERE id=?2')
    .bind(first.machine.accountId,second.machine.machineId).run();
  await env.RUNTIME_DB.prepare('UPDATE runtime_user_assignments_v2 SET child_id=?1 WHERE machine_id=?2')
    .bind(first.child,second.machine.machineId).run();
  second.machine.accountId=first.machine.accountId;second.child=first.child;second.projection=first.projection;
  const one=await upload(first,1,{seconds:true,duration:51,deferCommit:true,
    secondsProjection:{nonSpecialTotal:31,nonSpecialCategories:{study:31},specialTotal:20,complete:true,reasonCodes:[]}});
  const two=await upload(second,1,{seconds:true,duration:20,deferCommit:true,
    secondsProjection:{nonSpecialTotal:20,nonSpecialCategories:{study:20},specialTotal:0,complete:true,reasonCodes:[]}});
  await commitRequest(first,one.manifestId);await commitRequest(second,two.manifestId);
  const read=await readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,first.machine.accountId,first.child,start,start+DAY);
  expect(read.totalDuration).toBe(71);
  expect(read.applicationUsage).toEqual({nonSpecialTotal:51,nonSpecialCategories:{study:51},specialTotal:20,complete:true,reasonCodes:[]});
  const partial=await readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,first.machine.accountId,first.child,start-DAY,start+DAY);
  expect(partial.applicationUsage).toBeNull();expect(partial.availableTotalDuration).toBe(71);
  const noProjection=await upload(second,2,{seconds:true,duration:20,deferCommit:true});
  await commitRequest(second,noProjection.manifestId);
  const missing=await readNativeApplicationStatisticsRangeSeconds(env.RUNTIME_DB,first.machine.accountId,first.child,start,start+DAY);
  expect(missing.totalDuration).toBe(71);expect(missing.applicationUsage).toBeNull();
});
it('authenticated app-usage seconds route exposes producer statistics and retains child isolation',async()=>{
  const f=await fixture(),one=await upload(f,1,{seconds:true,duration:51,deferCommit:true});
  await commitRequest(f,one.manifestId);
  const token='test-browser-session-'+crypto.randomUUID().replaceAll('-','');
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_browser_sessions_v1
    (token_hash,account_id,children_json,created_at_ms,expires_at_ms,last_used_at_ms) VALUES(?1,?2,?3,?4,?5,?4)`)
    .bind(await sha256Hex(token),f.machine.accountId,JSON.stringify([{id:f.child,name:'测试孩子'}]),now,now+60000).run();
  const request=(child:string=f.child,unit='seconds')=>new Request(`http://runtime.test/v2/module/app-usage?childId=${child}&fromMs=${start}&toMs=${start+DAY}&durationUnit=${unit}`,
    {headers:{authorization:`RuntimeSession ${token}`}});
  const result=await routeV2(request(),env,now);
  expect(result?.status).toBe(200);
  expect(await result!.json()).toMatchObject({durationUnit:'seconds',complete:true,totalDuration:51});
  await expect(routeV2(request('another-child'),env,now)).rejects.toMatchObject({code:'CHILD_NOT_FOUND'});
  await expect(routeV2(request(f.child,'minutes'),env,now)).rejects.toMatchObject({code:'INVALID_DURATION_UNIT'});
});
it('Guardian application source RPC reads the same published seconds without raw reconstruction',async()=>{
  const f=await fixture('windows',{accountId:'seconds-source-account',child:'seconds-source-child'}),one=await upload(f,1,{seconds:true,duration:51,deferCommit:true});
  await commitRequest(f,one.manifestId);
  const rpc=exports.RuntimeComputerUsageService;
  const source=await rpc.getApplicationUsage(f.machine.accountId,f.child,'2026-09-27','2026-09-27',true);
  expect(source).toMatchObject({source:'application',durationUnit:'seconds',complete:true,totalDuration:51,
    applications:[{duration:51,classifications:['study']}],statistics:{producer:'native',stale:false}});
  expect(source).not.toHaveProperty('totalDurationMs');
  // An old caller must not change wire shape when a new seconds head arrives.
  const old=await rpc.getApplicationUsage(f.machine.accountId,f.child,'2026-09-27','2026-09-27');
  expect(old).toMatchObject({durationUnit:'milliseconds',complete:true,totalDurationMs:51000,
    availableTotalDurationMs:51000,categories:[{classification:'study',durationMs:51000}],
    applications:[{durationMs:51000,classifications:['study']}],statistics:{producer:'native'}});
  expect(old).not.toHaveProperty('totalDuration');
  const oldRequest=await rpc.fetch(new Request('https://runtime-capability/getApplicationUsage',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:f.machine.accountId,
      childId:f.child,fromDate:'2026-09-27',toDate:'2026-09-27'})}));
  expect(await oldRequest.json()).toEqual(old);
  const partial=await rpc.getApplicationUsage(f.machine.accountId,f.child,'2026-09-26','2026-09-27');
  expect(partial).toMatchObject({durationUnit:'milliseconds',complete:false,totalDurationMs:null,
    availableTotalDurationMs:51000,categories:[{durationMs:51000}]});
  const next=await upload(f,2,{seconds:true,duration:20,deferCommit:true});await commitRequest(f,next.manifestId);
  expect(await rpc.getApplicationUsage(f.machine.accountId,f.child,'2026-09-27','2026-09-27'))
    .toMatchObject({durationUnit:'milliseconds',totalDurationMs:20000});
  expect(await rpc.getApplicationUsage(f.machine.accountId,f.child,'2026-09-27','2026-09-27',true))
    .toMatchObject({durationUnit:'seconds',totalDuration:20});
  const forbidden=await exports.RuntimeComputerUsageService.fetch(new Request('https://runtime-capability/getApplicationUsage',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:'another-account',childId:f.child,fromDate:'2026-09-27',toDate:'2026-09-27'})}));
  expect(forbidden.status).toBe(404);expect(await forbidden.json()).toEqual({code:'CHILD_NOT_FOUND'});
  expect((await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_usage_segments_v2 WHERE machine_id=?1')
    .bind(f.machine.machineId).first<{n:number}>())?.n).toBe(0);
});
it('seconds-only source mode preserves unknown and never falls back to a legacy zero',async()=>{
  const rpc=exports.RuntimeComputerUsageService;
  const request=(secondsOnly:unknown)=>new Request('https://runtime-capability/getApplicationUsage',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:'empty-account',childId:'empty-child',
      fromDate:'2026-09-27',toDate:'2026-09-27',secondsOnly})});
  const response=await rpc.fetch(request(true));expect(response.status).toBe(200);
  const value=await response.json();
  expect(value).toMatchObject({durationUnit:'seconds',complete:false,totalDuration:null,availableTotalDuration:null,applicationUsage:null});
  expect(value).not.toHaveProperty('totalDurationMs');expect(value).not.toHaveProperty('compatibility');
  expect((await rpc.fetch(request('true'))).status).toBe(400);
});
it('seconds source read uses version replacement including lower usage and never invokes raw-ledger queries',async()=>{
  const f=await fixture(),one=await upload(f,1,{seconds:true,duration:51,deferCommit:true});
  await commitRequest(f,one.manifestId);
  const wrapped=new Proxy(env.RUNTIME_DB,{get(target,property){
    if(property==='prepare')return (sql:string)=>{
      if(/runtime_usage_segments|runtime_media_segments|runtime_child_app_policy/.test(sql))throw Error('RAW_RECONSTRUCTION_FORBIDDEN');
      return target.prepare(sql);
    };
    const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
  }});
  const initial=await readNativeApplicationStatisticsSeconds(wrapped,f.machine.accountId,f.child,'2026-09-27');
  const newer=await upload(f,2,{seconds:true,duration:20,deferCommit:true});
  await commitRequest(f,newer.manifestId);
  const latest=await readNativeApplicationStatisticsSeconds(wrapped,f.machine.accountId,f.child,'2026-09-27');
  expect(latest?.rows.find(row=>row.kind==='total'&&row.hour===null)?.duration).toBe(20);
  expect(latest?.revision).not.toBe(initial?.revision);
  expect(await readNativeApplicationStatisticsSeconds(wrapped,f.machine.accountId,f.child,'2026-09-27')).toEqual(latest);
});
it('computer cache revision follows published seconds replacement, not uncommitted or foreign snapshots',async()=>{
  const f=await fixture('windows',{accountId:'seconds-cache-account',child:'seconds-cache-child'});
  const args=[f.machine.accountId,f.child,'2026-09-27','2026-09-27'] as const;
  const rpc=exports.RuntimeComputerUsageService;
  const initial=await rpc.applicationEvidenceRevision(...args);
  const first=await upload(f,1,{seconds:true,duration:51,deferCommit:true});
  expect(await rpc.applicationEvidenceRevision(...args)).toBe(initial);
  await commitRequest(f,first.manifestId);
  const published=await rpc.applicationEvidenceRevision(...args);
  expect(published).not.toBe(initial);
  expect(await rpc.applicationEvidenceRevision(...args)).toBe(published);
  const corrected=await upload(f,2,{seconds:true,duration:20,deferCommit:true});
  expect(await rpc.applicationEvidenceRevision(...args)).toBe(published);
  await commitRequest(f,corrected.manifestId);
  const latest=await rpc.applicationEvidenceRevision(...args);
  expect(latest).not.toBe(published);
  const foreign=await fixture(),unrelated=await upload(foreign,1,{seconds:true,duration:90,deferCommit:true});
  await commitRequest(foreign,unrelated.manifestId);
  expect(await rpc.applicationEvidenceRevision(...args)).toBe(latest);
  const otherDate=await upload(f,3,{seconds:true,duration:30,date:'2026-09-26',deferCommit:true});
  await commitRequest(f,otherDate.manifestId);
  expect(await rpc.applicationEvidenceRevision(...args)).toBe(latest);
  expect((await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_usage_segments_v2 WHERE machine_id=?1')
    .bind(f.machine.machineId).first<{n:number}>())?.n).toBe(0);
});
it('commit request publishes nonzero producer statistics immediately without raw facts or a cron',async()=>{
  const f=await fixture(),r=await upload(f,1,{deferCommit:true});
  expect((await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_usage_segments_v2 WHERE machine_id=?1')
    .bind(f.machine.machineId).first<{n:number}>())?.n).toBe(0);
  const response=await commitRequest(f,r.manifestId);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({received:true,published:true,publishStatus:'published',publicationErrorCode:null});
  const head=await env.RUNTIME_DB.prepare('SELECT revision FROM runtime_application_account_publications_v1 WHERE machine_id=?1')
    .bind(f.machine.machineId).first<{revision:number}>();
  expect(head?.revision).toBe(1);
  expect(await (await commitRequest(f,r.manifestId)).json()).toMatchObject({published:true});
  expect((await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_application_account_publications_v1 WHERE machine_id=?1')
    .bind(f.machine.machineId).first<{n:number}>())?.n).toBe(1);
});
it('explicit commit retry recovers a failed publication immediately and preserves the last valid head for incomplete snapshots',async()=>{
  const f=await fixture(),r=await upload(f,1,{deferCommit:true});
  // Received receipt survives a failed publication transaction. Explicit retry
  // must not inherit the scheduled repair task's five-minute cooldown.
  await commitApplicationAccount(env.RUNTIME_DB,f.machine,r.manifestId,now);
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_account_publication_checks_v1
    (manifest_id,checked_at_ms,error_code,source_revision) VALUES(?1,?2,'APPLICATION_ACCOUNT_PUBLICATION_FAILED','unverified')`)
    .bind(r.manifestId,now).run();
  expect(await (await commitRequest(f,r.manifestId)).json()).toMatchObject({published:true,publicationErrorCode:null});
  const newer=await upload(f,2,{complete:false,deferCommit:true});
  expect(await (await commitRequest(f,newer.manifestId)).json()).toMatchObject({received:true,published:false,
    publishStatus:'received_not_published',publicationErrorCode:'APPLICATION_ACCOUNT_INCOMPLETE'});
  expect((await env.RUNTIME_DB.prepare('SELECT revision FROM runtime_application_account_publications_v1 WHERE machine_id=?1')
    .bind(f.machine.machineId).first<{revision:number}>())?.revision).toBe(1);
});
async function diagnose(f:Awaited<ReturnType<typeof fixture>>,id:string){
  const candidate=await env.RUNTIME_DB.prepare('SELECT * FROM runtime_application_account_manifests_v1 WHERE id=?1')
    .bind(id).first<{id:string;machine_id:string;local_user_id:string;assignment_version:number;
      account_id:string;child_id:string;date:string;revision:number;manifest_json:string}>();
  if(!candidate)throw Error('fixture manifest missing');
  return verifyApplicationAccountPublication(env.RUNTIME_DB,candidate,JSON.parse(candidate.manifest_json),now);
}
it('published statistics supply actual application usage without a second contribution receipt',async()=>{
  const f=await fixture();await fact(f,crypto.randomUUID());
  const original=(await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?1').bind(f.machine.machineId).all()).results;
  const r=await upload(f,8,{applicationUsage:{nonSpecialTotalMs:1501,nonSpecialCategoryMs:{study:1501},specialTotalMs:0,complete:true,reasonCodes:[]}});
  await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
  const shared=await readApplicationSharedQuotaContributions(env.RUNTIME_DB,f.machine.accountId,f.child,'2026-09-27');
  expect(shared).toMatchObject({complete:true,verifiedScopeCount:1});
  expect(shared.contributions[0]).toMatchObject({statisticsBacked:true,contribution:{applicationClassesMs:{study:1501},chromeIncludedInApplicationMs:0}});
  expect(shared.contributions[0].revision).toMatch(/^application-statistics:8:[a-f0-9]{64}$/);
  expect((await readApplicationSharedQuotaContributions(env.RUNTIME_DB,crypto.randomUUID(),f.child,'2026-09-27')).contributions).toEqual([]);
  expect((await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?1').bind(f.machine.machineId).all()).results).toEqual(original);
});
it('raw projection disagreement is diagnosed independently and does not block a structurally valid snapshot',async()=>{
  const f=await fixture();await fact(f,crypto.randomUUID());
  const r=await upload(f,1,{applicationUsage:{nonSpecialTotalMs:1500,nonSpecialCategoryMs:{study:1500},specialTotalMs:1,complete:true,reasonCodes:[]}});
  await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
  await expect(diagnose(f,r.manifestId)).rejects.toMatchObject({code:'APPLICATION_ACCOUNT_USAGE_PROJECTION_MISMATCH'});
});
it.each([false,true])('special product exclusion preserves the total and uses interval unions, ordinary overlap=%s',async(overlap)=>{
  const f=await fixture();await fact(f,crypto.randomUUID());
  const policy=await getAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.child);
  policy.applicationKnowledge!.products.push({id:'test',name:'测试产品',type:'other',catalogGroup:'specialApplication',selectors:[]});
  if(overlap) {
    const id=crypto.randomUUID();await fact(f,id,'ordinary-session');
    await env.RUNTIME_DB.prepare("UPDATE runtime_usage_segments_v2 SET runtime_identity='ordinary' WHERE id=?1").bind(id).run();
    policy.productIdentityProjection!.items.push({platform:'windows',runtimeIdentity:'ordinary',associationKey:'windows\nordinary',
      productId:null,canonicalName:'测试产品',status:'unresolved',reasonCode:'IDENTITY_UNRESOLVED'});
  }
  const {version:_,...content}=policy.productIdentityProjection!;
  f.projection=await productIdentityProjectionVersion(content,policy.applicationKnowledge!);
  policy.productIdentityProjection!.version=f.projection;
  await env.RUNTIME_DB.prepare('UPDATE runtime_child_app_policy_versions_v1 SET payload_json=?3 WHERE account_id=?1 AND child_id=?2 AND version=1')
    .bind(f.machine.accountId,f.child,JSON.stringify(policy)).run();
  const r=await upload(f,1,{count:overlap?2:1,...(overlap?{extraSubjectKey:'windows\nordinary'}:{}),
    applicationUsage:{nonSpecialTotalMs:overlap?1501:0,nonSpecialCategoryMs:overlap?{study:1501}:{},specialTotalMs:1501,complete:true,reasonCodes:[]}});
  await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
  const shared=await readApplicationSharedQuotaContributions(env.RUNTIME_DB,f.machine.accountId,f.child,'2026-09-27');
  expect(shared.contributions[0].contribution).toMatchObject({applicationClassesMs:{study:overlap?1501:0},chromeIncludedInApplicationMs:overlap?0:1501});
  expect(await readCoveredChromeDeduction(env.RUNTIME_DB,f.machine.accountId,f.child,f.machine.machineId,'2026-09-27','2026-09-27',1501)).toBe(overlap?0:1501);
  const chunk=await env.RUNTIME_DB.prepare('SELECT rows_json FROM runtime_application_account_chunks_v1 WHERE manifest_id=?1').bind(r.manifestId).first<{rows_json:string}>();
  expect(JSON.parse(chunk!.rows_json)).toContainEqual(expect.objectContaining({kind:'total',hour:null,duration:1501}));
  expect(JSON.parse(chunk!.rows_json)).toContainEqual(expect.objectContaining({kind:'category',hour:null,category:'study',duration:1501}));
});
it.each(['incomplete'] as const)('cron prioritizes a complete current snapshot over older %s backlog without increasing its budget',async(kind)=>{
  const older=[];
  for(let i=0;i<2;i++){
    const f=await fixture();
    const r=await upload(f,1,{empty:true,complete:false});
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
      publicationErrorCode:'APPLICATION_ACCOUNT_INCOMPLETE'});
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
  const content:Omit<ProductIdentityProjection,'version'>={knowledgeVersion:1,
    items:[{platform:'windows',runtimeIdentity:'leaf',associationKey,productId,canonicalName:'测试产品',status,
      reasonCode:status==='conflict'?'IDENTITY_CONFLICT':'IDENTITY_UNRESOLVED'}]};
  f.projection=await productIdentityProjectionVersion(content,policy.applicationKnowledge!);
  await env.RUNTIME_DB.prepare(`UPDATE runtime_child_app_policy_versions_v1 SET payload_json=?3
    WHERE account_id=?1 AND child_id=?2 AND version=1`)
    .bind(f.machine.accountId,f.child,JSON.stringify({...policy,productIdentityProjection:{version:f.projection,...content}})).run();
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
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
  await expect(diagnose(f,r.manifestId)).rejects.toMatchObject({code:'APPLICATION_ACCOUNT_ASSOCIATIONS_PENDING'});
});
it('an old incomplete identity receipt stays unpublished and requires a new complete revision',async()=>{
  const f=await fixture();await fact(f);await setIdentity(f,'unresolved');
  const old=await upload(f,1,{associationKey:'windows\nleaf',complete:false,reasonCodes:['PRODUCT_IDENTITY_UNRESOLVED']});
  await publishApplicationAccounts(env.RUNTIME_DB,now,old.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,old.manifestId))
    .toMatchObject({received:true,published:false,publicationErrorCode:'APPLICATION_ACCOUNT_INCOMPLETE'});
  const fresh=await upload(f,2,{associationKey:'windows\nleaf'});await publishApplicationAccounts(env.RUNTIME_DB,now+1,fresh.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,fresh.manifestId)).toMatchObject({published:true});
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,old.manifestId)).toMatchObject({published:false});
});
it('complete snapshot publishes before raw facts arrive; raw reconciliation remains diagnostic',async()=>{
  const f=await fixture(),r=await upload(f);await publishApplicationAccounts(env.RUNTIME_DB,now);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({received:true,published:true});
  await expect(diagnose(f,r.manifestId)).rejects.toMatchObject({code:'APPLICATION_ACCOUNT_FACTS_PENDING'});
  // Other negative cases leave retryable receipts in the shared fixture DB.
  // Target this receipt so the two-item cron limit does not make its retry nondeterministic.
  await fact(f);await publishApplicationAccounts(env.RUNTIME_DB,now+300001,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
});
it('replacement may lower usage after correction and duplicate publication does not add it again',async()=>{
  const f=await fixture();const first=await upload(f,1,{duration:2000});
  await publishApplicationAccounts(env.RUNTIME_DB,now,first.manifestId);
  const corrected=await upload(f,2,{duration:1000});
  expect(await publishApplicationAccounts(env.RUNTIME_DB,now+1,corrected.manifestId)).toMatchObject({published:1});
  expect(await publishApplicationAccounts(env.RUNTIME_DB,now+2,corrected.manifestId)).toMatchObject({processed:0,published:0});
  const head=await env.RUNTIME_DB.prepare(`SELECT p.revision,m.manifest_hash FROM runtime_application_account_publications_v1 p
    JOIN runtime_application_account_manifests_v1 m ON m.id=p.manifest_id WHERE p.machine_id=?1`).bind(f.machine.machineId).first();
  expect(head).toEqual({revision:2,manifest_hash:corrected.manifestHash});
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,first.manifestId)).toMatchObject({published:false});
});
it('chunk corruption after receiving cannot be published even without any raw records',async()=>{
  const f=await fixture(),r=await upload(f);
  await env.RUNTIME_DB.prepare(`UPDATE runtime_application_account_chunks_v1 SET chunk_hash=?2 WHERE manifest_id=?1`)
    .bind(r.manifestId,'f'.repeat(64)).run();
  await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId))
    .toMatchObject({published:false,publicationErrorCode:'APPLICATION_ACCOUNT_CHUNK_HASH_MISMATCH'});
});
it('manifest corruption retains a stable transport error rather than a raw reconciliation error',async()=>{
  const f=await fixture(),r=await upload(f);
  await env.RUNTIME_DB.prepare(`UPDATE runtime_application_account_manifests_v1
    SET manifest_json=json_set(manifest_json,'$.rawFactHash',?2) WHERE id=?1`).bind(r.manifestId,'d'.repeat(64)).run();
  await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId))
    .toMatchObject({published:false,publicationErrorCode:'USAGE_ACCOUNT_MANIFEST_HASH_MISMATCH'});
});
it('revoking the machine between validation and the publication transaction cannot publish or queue a readable head',async()=>{
  const f=await fixture(),r=await upload(f);
  const db={prepare:env.RUNTIME_DB.prepare.bind(env.RUNTIME_DB),async batch(statements:D1PreparedStatement[]){
    await env.RUNTIME_DB.prepare('UPDATE runtime_machines_v2 SET revoked_at_ms=?2 WHERE id=?1').bind(f.machine.machineId,now).run();
    return env.RUNTIME_DB.batch(statements);
  }} as D1Database;
  await publishApplicationAccounts(db,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId))
    .toMatchObject({published:false,publicationErrorCode:'APPLICATION_ACCOUNT_ASSIGNMENT_UNAVAILABLE'});
  expect((await env.RUNTIME_DB.prepare('SELECT * FROM runtime_application_statistics_queue_v1 WHERE account_id=?1')
    .bind(f.machine.accountId).all()).results).toEqual([]);
});
it('special/non-special projections cannot exceed the authoritative uploaded total',async()=>{
  const f=await fixture(),r=await upload(f,1,{applicationUsage:{nonSpecialTotalMs:2000,nonSpecialCategoryMs:{},
    specialTotalMs:0,complete:true,reasonCodes:[]}});
  await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId))
    .toMatchObject({published:false,publicationErrorCode:'APPLICATION_ACCOUNT_INVALID_USAGE_PROJECTION'});
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
it('late facts within the cutoff do not block the producer snapshot and remain diagnosable',async()=>{
  const f=await fixture();await fact(f);const r=await upload(f,1,{cutoff:start+10000});
  await fact(f,'late-within-cutoff','other-session');
  await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
  await expect(diagnose(f,r.manifestId)).rejects.toMatchObject({code:'APPLICATION_ACCOUNT_FACTS_PENDING'});
});
it('cloud does not clip source facts to satisfy a snapshot; independent audit reports cutoff mismatch',async()=>{
  const f=await fixture();await fact(f);const r=await upload(f,1,{cutoff:start+1000,duration:1000});
  await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
  await expect(diagnose(f,r.manifestId)).rejects.toMatchObject({code:'APPLICATION_ACCOUNT_FACTS_PENDING'});
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
it('raw classification and duration disagreements do not become publication gates',async()=>{
  const f=await fixture();await fact(f);const forged=await upload(f,1,{classification:'blocked'});await publishApplicationAccounts(env.RUNTIME_DB,now);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,forged.manifestId)).toMatchObject({published:true});
  await expect(diagnose(f,forged.manifestId)).rejects.toMatchObject({code:'APPLICATION_ACCOUNT_STATISTICS_MISMATCH'});
  const wrong=await upload(f,2,{duration:1502});await publishApplicationAccounts(env.RUNTIME_DB,now+1);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,wrong.manifestId)).toMatchObject({published:true});
  await expect(diagnose(f,wrong.manifestId)).rejects.toMatchObject({code:'APPLICATION_ACCOUNT_STATISTICS_MISMATCH'});
});
it('incomplete zero is never published while verified empty initialized assignment may publish zero',async()=>{
  const f=await fixture(),r=await upload(f,1,{empty:true,complete:false});await publishApplicationAccounts(env.RUNTIME_DB,now);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:false,publicationErrorCode:'APPLICATION_ACCOUNT_INCOMPLETE'});
  const zero=await upload(f,2,{empty:true});await publishApplicationAccounts(env.RUNTIME_DB,now+1);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,zero.manifestId)).toMatchObject({published:true});
});
it('source classification revisions publish without requiring the cloud to reproduce them first',async()=>{
  const f=await fixture();await fact(f);const good=await upload(f);await publishApplicationAccounts(env.RUNTIME_DB,now);
  const stale=await upload(f,2,{associationVersion:'d'.repeat(64)});await publishApplicationAccounts(env.RUNTIME_DB,now+1);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,stale.manifestId)).toMatchObject({published:true});
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,good.manifestId)).toMatchObject({published:false});
  await expect(diagnose(f,stale.manifestId)).rejects.toMatchObject({code:'APPLICATION_ACCOUNT_ASSOCIATIONS_PENDING'});
  const correction=await upload(f,3,{correctionVersion:2});await publishApplicationAccounts(env.RUNTIME_DB,now+2);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,correction.manifestId)).toMatchObject({published:true});
  await expect(diagnose(f,correction.manifestId)).rejects.toMatchObject({code:'APPLICATION_ACCOUNT_CORRECTIONS_PENDING'});
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
it('millisecond differences remain raw diagnostics, not a second cloud statistics authority',async()=>{
  const f=await fixture();await fact(f);
  await env.RUNTIME_DB.prepare('UPDATE runtime_usage_segments_v2 SET end_wall_time_ms=end_wall_time_ms+13 WHERE machine_id=?1')
    .bind(f.machine.machineId).run();
  const good=await upload(f);await publishApplicationAccounts(env.RUNTIME_DB,now,good.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,good.manifestId)).toMatchObject({published:true});
  const wrong=await upload(f,2,{duration:1514});await publishApplicationAccounts(env.RUNTIME_DB,now,wrong.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,wrong.manifestId)).toMatchObject({published:true});
  await expect(diagnose(f,wrong.manifestId)).rejects.toMatchObject({code:'APPLICATION_ACCOUNT_STATISTICS_MISMATCH'});
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
it('raw clock anomalies remain independently diagnosable without recomputing published statistics',async()=>{
  const f=await fixture();await fact(f);
  await env.RUNTIME_DB.prepare('UPDATE runtime_usage_segments_v2 SET end_wall_time_ms=end_wall_time_ms+2001 WHERE machine_id=?1')
    .bind(f.machine.machineId).run();
  const r=await upload(f);await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
  await expect(diagnose(f,r.manifestId)).rejects.toMatchObject({code:'APPLICATION_ACCOUNT_CLOCK_ANCHOR_MISSING'});
});
it('refreshes stored confirmed non-Chrome role once without inventory upload or configuration changes',async()=>{
  const f=await fixture();await fact(f);
  const stored=await getAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.child);
  const {isChromeContainer:_,...leaf}=stored.productIdentityProjection!.items[0]!;
  stored.productIdentityProjection!.items=[leaf,
    {...leaf,runtimeIdentity:'unknown',productId:null,status:'unresolved',reasonCode:'IDENTITY_UNRESOLVED'},
    {...leaf,runtimeIdentity:'conflict',status:'conflict',reasonCode:'IDENTITY_CONFLICT'},
    {...leaf,runtimeIdentity:'alias',productId:null,status:'associated',reasonCode:'VERIFIED_LEAF_ALIAS'},
    {...leaf,runtimeIdentity:'weak-chrome',productId:CHROME_SPECIAL_PRODUCT}];
  await env.RUNTIME_DB.prepare(`UPDATE runtime_child_app_policy_versions_v1 SET payload_json=?3
    WHERE account_id=?1 AND child_id=?2 AND version=1`).bind(f.machine.accountId,f.child,JSON.stringify(stored)).run();
  const before=await getAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.child);
  const raw=await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?1').bind(f.machine.machineId).all();
  expect(await refreshHistoricalProductIdentityProjection(env.RUNTIME_DB,f.machine.accountId,f.child,now)).toBe(true);
  const after=await getAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.child);
  expect(after.version).toBe(before.version+1);
  expect(after.productIdentityProjection?.items[0]).toEqual({...before.productIdentityProjection!.items[0],isChromeContainer:false});
  expect(after.productIdentityProjection?.items.slice(1,4)).toEqual(before.productIdentityProjection?.items.slice(1,4));
  expect(after.productIdentityProjection?.items[4]).toEqual({...before.productIdentityProjection!.items[4],isChromeContainer:true});
  expect(after.productIdentityProjection?.version).not.toBe(before.productIdentityProjection?.version);
  for(const field of ['classifications','quotas','timeWindows','weekReclassification','resolvedApplications'] as const)
    expect(after[field]).toEqual(before[field]);
  expect((await env.RUNTIME_DB.prepare('SELECT * FROM runtime_usage_segments_v2 WHERE machine_id=?1').bind(f.machine.machineId).all()).results).toEqual(raw.results);
  expect(await refreshHistoricalProductIdentityProjection(env.RUNTIME_DB,f.machine.accountId,f.child,now+1)).toBe(false);
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
  expect((await getAppPolicy(env.RUNTIME_DB,foreign.machine.accountId,foreign.child)).productIdentityProjection?.items
    .some(item=>item.runtimeIdentity==='wixstdba-fixture')).toBe(false);
  expect(await refreshHistoricalProductIdentityProjection(env.RUNTIME_DB,foreign.machine.accountId,foreign.child,now+1)).toBe(false);
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
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
  await expect(diagnose(f,r.manifestId)).rejects.toMatchObject({code:error});
});
it('Mac snapshot publication does not wait for raw facts from its own or another machine',async()=>{
  const f=await fixture('macos'),other=await fixture('macos');await fact(other,crypto.randomUUID());const r=await upload(f);
  await publishApplicationAccounts(env.RUNTIME_DB,now,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
  await expect(diagnose(f,r.manifestId)).rejects.toMatchObject({code:'APPLICATION_ACCOUNT_FACTS_PENDING'});
  await fact(f,crypto.randomUUID());await publishApplicationAccounts(env.RUNTIME_DB,now+300001,r.manifestId);
  expect(await readApplicationAccountStatus(env.RUNTIME_DB,f.machine,r.manifestId)).toMatchObject({published:true});
});

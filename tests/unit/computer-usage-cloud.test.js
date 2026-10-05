const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),{webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
function loader(overrides={}){
const cache=new Map();
return function load(file){if(cache.has(file))return cache.get(file).exports;
const module={exports:{}};cache.set(file,module);
const source=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(source,{module,exports:module.exports,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,URL,URLSearchParams,Date,Map,Set,Error,Request,Response,console,require:name=>{
if(name==='cloudflare:workers')return {WorkerEntrypoint:class{constructor(_,env){this.env=env;}}};
if(name in overrides)return overrides[name];
if(name==='@timeonchrome/app-runtime-contracts/computer-usage')return load('app-runtime-management/contracts/computer-usage.ts');
if(name==='@timeonchrome/app-runtime-contracts/shared-access')return load('app-runtime-management/contracts/shared-access.ts');
if(name==='@timeonchrome/app-runtime-contracts/shared-web-sync')return load('app-runtime-management/contracts/shared-web-sync.ts');
if(name==='./shared-access.js')return load('app-runtime-management/contracts/shared-access.ts');
const next=path.posix.normalize(path.posix.join(path.posix.dirname(file),name));
return load(next.endsWith('.js')||next.endsWith('.ts')?next:next+'.ts');
}});
return module.exports;};}
const date='2026-10-01',start=Date.parse(date+'T00:00:00+08:00');
const schema=loader({'../infra/storage-budget.js':{runStorageMutation(){throw Error('read-only test');}}})('extension/core/device-account-v2.js');
const authorityRows=['daily_domain','hourly_domain','daily_target','hourly_target'].map(kind=>({kind,periodKey:kind.startsWith('hourly')?date+'T00':date,channel:'active',mode:'study',durationSeconds:3,segmentsCount:1,firstSeenAt:start+1000,lastSeenAt:start+4000,...(kind.endsWith('_domain')?{domain:'learning.example'}:{targetKey:'domain:learning.example',quotaBucket:'study',targetClassificationAtTime:'study'})})).sort((a,b)=>schema.canonicalDeviceAccountJson(a).localeCompare(schema.canonicalDeviceAccountJson(b)));
assert.equal(schema.validateDeviceAccountRows(authorityRows,date).ok,true,'fixture must match the real authoritative schema');
assert.equal(schema.validateDeviceAccountRows([{kind:'daily_total'}],date).code,'DEVICE_ACCOUNT_INVALID_KIND');
const app={key:'app:opaque',computerKey:'opaque-computer',computerName:'电脑',revision:'a1',associationVersion:'association1',correctionRevision:'ac1',settledAtMs:start+4000,complete:true,reasons:[],totalMs:2000,categoriesMs:{composite:2000},intervals:[{startMs:start+1500,endMs:start+3500,classification:'composite',subjectKey:'opaque-product',label:'办公应用',special:false}]};
const fullPolicy=JSON.parse(JSON.stringify(loader()('app-runtime-management/contracts/shared-access.ts').projectLegacySharedAccessPolicy(
 {timeQuota:{daily:{friday:{studyMinutes:60,compositeMinutes:30,restMinutes:60}}}},7,0)));
function fixture({owned=true,appFailure=false,webFailure=false,sharedStateFailure=false,policyChanges=false,policyContentChanges=false,failedDate,legacy=false,appError='private runtime failure',publicStats=[]}={}){
let reads=0,heads=1,appReads=0;const store=new Map();
let policyReads=0;
const account={profileId:'child',deviceId:'browser',date,revision:1,statsHash:'hash',generatedAt:start+4000,committedAt:start+5000,complete:true,lossCount:0,rows:authorityRows};
const db={
  prepare(sql){return {bind(...params){return {
    async first(){if(sql.includes('FROM profiles'))return owned?{id:'child'}:null;if(sql.includes('SELECT manifest_id'))return legacy?null:{manifest_id:'m'+heads+'|'+params[2]};return {count:1,lastChange:heads};},
    async all(){if(sql.includes('SELECT device_id,date'))return {results:[{device_id:'browser',date,manifest_id:'m'+heads}]};if(sql.includes('FROM devices'))return {results:[{id:'browser',device_name:'浏览器设备'}]};if(sql.includes('FROM target_stats_v1'))return {results:[{date,channel:'active',mode:'study',target_classification_at_time:'study',duration_seconds:5134,last_seen_at:start+5134000}]};if(sql.includes('FROM usage_segments_v1')){reads++;return {results:[{id:'private-segment',start_ms:start+1000,end_ms:start+4000,duration_seconds:3,domain:'learning.example',target_classification_at_time:'study'}]};}return {results:[]};}
  };}};},withSession(){return db;}
};
const load=loader({'./profileAccountsV2':{readManifestAccountV2:async(_db,manifest)=>{if(webFailure||manifest.split('|')[1]===failedDate)throw Error('private DB detail');return {...account,date:manifest.split('|')[1]||date,revision:heads};}},
'./compositePageCorrections':{readCompositeCorrections:async()=>({revision:'c1',items:[]}),projectCompositeDailyRows:()=>account.rows.filter(row=>row.kind==='daily_target')},
'./usageAccountingCorrections':{listUsageAccountingCorrections:async()=>[],applyCorrectionsToV1StatsRows:rows=>rows},
'../db/middleware':{generateToken:async()=> 'test-internal',verifyAccountToken:async request=>request.headers.get('authorization')==='Bearer fixture'?'family':null,json:(body,status=200)=>Response.json(body,{status})},'../routes/stats':{statsRouter:{handle:async request=>Response.json({stats:new URL(request.url).pathname.includes('hourly')?publicStats.map(row=>({...row,hour:0})):publicStats})}},
'../routes/profiles':{readSharedAccessPolicyForChild:async(_db,accountId,childId)=>{
  if(accountId!=='current-account'||childId!=='current-child')return null;
  const value=structuredClone(fullPolicy);policyReads++;
  if(policyReads>1&&policyChanges)value.revision='profile-config:8';
  if(policyReads>1&&policyContentChanges)value.dailyMinutes.friday.study=61;
  return value;
}},
'./sharedAccessState':{readSharedQuotaExecutionBasis:async(_env,accountId,childId,selectedDate,policy)=>{
  assert.equal(accountId,'current-account');assert.equal(childId,'current-child');
  if(sharedStateFailure)throw Error('private database failure');
  return {revision:'a'.repeat(64),policyRevision:policy.revision,toDate:selectedDate};
},pageSharedQuotaExecutionBasis:(basis,key,offset,limit,revision,source)=>{
  assert.equal(source,'application');
  if(revision!==null&&revision!==basis.revision)throw Error('EXECUTION_BASIS_VERSION_CHANGED');
  if(offset>1)throw Error('INVALID_EXECUTION_CURSOR');
  return {schemaVersion:1,basisRevision:basis.revision,policyRevision:basis.policyRevision,fromDate:'2026-09-28',toDate:basis.toDate,
    days:[],authorizedScopes:[{source,sourceKey:key,date:basis.toDate}],page:{offset,limit,total:1,nextOffset:null,items:[]}};
},readSharedAccessDayState:async(_env,accountId,childId,selectedDate,policy)=>{
  assert.equal(accountId,'current-account');assert.equal(childId,'current-child');
  if(sharedStateFailure)throw Error('private state failure');
  return {schemaVersion:1,policyRevision:policy.revision,revision:'state-r1',computedAtMs:1234,settledAtMs:null,
    complete:false,reasonCodes:['APPLICATION_COVERAGE_MISSING'],sources:[{source:'web',sourceKey:'opaque-source',date:selectedDate,revision:'web-r1'}],
    day:{date:selectedDate,usedMs:{study:1000,composite:2000,rest:0},remainingMs:{study:5000,composite:4000,rest:3000},borrowedRestMs:0},
    week:{fromDate:'2026-09-28',toDate:selectedDate,complete:false,reasonCodes:['APPLICATION_COVERAGE_MISSING'],restUsedMs:0,restRemainingMs:3000}};
}}});
return {load,env:{DB:db,CONFIG_CACHE:{get:async key=>store.has(key)?JSON.parse(store.get(key)):null,put:async(key,value)=>store.set(key,value)},RUNTIME_COMPUTER_USAGE:{applicationEvidenceRevision:async()=>{if(appFailure)throw Error(appError);return 'a1';},readApplicationEvidence:async()=>{appReads++;if(appFailure)throw Error(appError);return [app];}}},store,reads:()=>reads,appReads:()=>appReads,change(){heads++;}};
}
(async()=>{
let f=fixture(),service=f.load('workers/src/services/computerUsage.ts');
const secondsFixture=fixture(),secondsService=secondsFixture.load('workers/src/services/computerUsage.ts');
let secondsCalls=0;
secondsFixture.env.RUNTIME_COMPUTER_USAGE.getApplicationUsage=async(accountId,childId,from,to,secondsOnly)=>{
  secondsCalls++;
  assert.equal(accountId,'family');assert.equal(childId,'child');assert.equal(from,date);assert.equal(to,date);
  assert.equal(secondsOnly,true,'new display never requests raw-ledger legacy fallback');
  return {source:'application',durationUnit:'seconds',fromDate:from,toDate:to,complete:true,totalDuration:15,availableTotalDuration:15,
    categories:[{classification:'study',duration:10},{classification:'other',duration:10}],
    applicationUsage:{nonSpecialTotal:10,nonSpecialCategories:{study:10},specialTotal:10,complete:true,reasonCodes:[]},statistics:{revision:'native-seconds-r1'}};
};
const sourceSeconds=await secondsService.readComputerWebStatisticsSeconds(secondsFixture.env,'family','child',date,date);
assert.equal(sourceSeconds.totalDuration,3,'web source uses authoritative seconds once');
assert.equal(secondsFixture.reads(),0,'summary does not load web raw intervals');
const combinedSeconds=await secondsService.readComputerUsageStatisticsSummarySeconds(secondsFixture.env,'family','child',date,date);
assert.equal(combinedSeconds.totals.computer,13);assert.equal(combinedSeconds.totals.specialIncluded,5);
assert.deepEqual(JSON.parse(JSON.stringify(combinedSeconds.categories)),{study:13});
assert.equal(combinedSeconds.sourceVersions.application,'native-seconds-r1');
assert.equal(secondsFixture.reads(),0);assert.equal(secondsFixture.appReads(),0,'new summary does not call old application evidence');
assert.equal(secondsCalls,1);
assert.deepEqual(JSON.parse(JSON.stringify(await secondsService.readComputerUsageStatisticsSummarySeconds(secondsFixture.env,'family','child',date,date))),JSON.parse(JSON.stringify(combinedSeconds)));
const route=secondsFixture.load('workers/src/routes/computerUsage.ts').handleComputerUsage;
const requestSeconds=(extra={},authorized=true)=>new Request('https://fixture/computer-usage?'+new URLSearchParams({from:date,to:date,durationUnit:'seconds',...extra}),{headers:authorized?{authorization:'Bearer fixture'}:{}});
const publicSecondsResponse=await route(requestSeconds(),secondsFixture.env,'child');
assert.equal(publicSecondsResponse.status,200);
const publicSeconds=await publicSecondsResponse.json();
assert.equal(publicSeconds.totals.computer,13);assert.equal(publicSeconds.durationUnit,'seconds');
assert.match(publicSeconds.revision,/^computer-v2:[a-f0-9]{64}$/);
assert.equal((await route(requestSeconds({revision:publicSeconds.revision}),secondsFixture.env,'child')).status,200);
assert.equal((await route(requestSeconds({},false),secondsFixture.env,'child')).status,401);
assert.equal((await route(requestSeconds({durationUnit:'minutes'}),secondsFixture.env,'child')).status,400);
assert.equal((await route(requestSeconds({to:'2026-10-08'}),secondsFixture.env,'child')).status,400);
assert.equal((await route(requestSeconds({revision:'computer-v2:'+ '0'.repeat(64)}),secondsFixture.env,'child')).status,409);
const detailNotReady=await route(requestSeconds({detail:'products',revision:publicSeconds.revision}),secondsFixture.env,'child');
assert.equal(detailNotReady.status,503);assert.equal((await detailNotReady.json()).code,'COMPUTER_USAGE_DETAIL_NOT_READY');
assert.equal((await route(requestSeconds({source:'web'}),secondsFixture.env,'child')).status,400);
assert.equal(secondsFixture.reads(),0,'public seconds endpoint never reloads raw web intervals');
const bindingSeconds=await new secondsService.ComputerUsageService({},secondsFixture.env).getComputerUsageStatisticsSeconds('family','child',date,date);
assert.equal(bindingSeconds.revision,publicSeconds.revision,'existing binding and browser route share the same authority');
secondsFixture.env.RUNTIME_COMPUTER_USAGE.getApplicationUsage=async()=>{throw Error('APPLICATION_SOURCE_UNAVAILABLE');};
const appMissing=await secondsService.readComputerUsageStatisticsSummarySeconds(secondsFixture.env,'family','child',date,date);
assert.equal(appMissing.totals.web,3);assert.equal(appMissing.totals.application,null);assert.equal(appMissing.totals.computer,null);
assert(appMissing.reasonCodes.includes('APPLICATION_SOURCE_UNAVAILABLE'));
secondsFixture.env.RUNTIME_COMPUTER_USAGE.getApplicationUsage=async()=>{throw Error('APPLICATION_DATABASE_MEMORY_LIMIT');};
assert((await secondsService.readComputerUsageStatisticsSummarySeconds(secondsFixture.env,'family','child',date,date)).reasonCodes.includes('APPLICATION_DATABASE_MEMORY_LIMIT'));
const webMissingFixture=fixture({webFailure:true}),webMissingService=webMissingFixture.load('workers/src/services/computerUsage.ts');
webMissingFixture.env.RUNTIME_COMPUTER_USAGE.getApplicationUsage=async()=>({durationUnit:'seconds',fromDate:date,toDate:date,complete:true,totalDuration:5,availableTotalDuration:5,
  categories:[{classification:'unclassified',duration:5}],applicationUsage:{nonSpecialTotal:5,nonSpecialCategories:{unclassified:5},specialTotal:0,complete:true,reasonCodes:[]},statistics:{revision:'r2'}});
const webMissing=await webMissingService.readComputerUsageStatisticsSummarySeconds(webMissingFixture.env,'family','child',date,date);
assert.equal(webMissing.totals.web,null);assert.equal(webMissing.totals.application,5);assert.equal(webMissing.totals.computer,null);
const legacySecondsFixture=fixture({legacy:true}),legacySecondsService=legacySecondsFixture.load('workers/src/services/computerUsage.ts');
assert.equal((await legacySecondsService.readComputerWebStatisticsSeconds(legacySecondsFixture.env,'family','child',date,date)).totalDuration,5134);
assert.equal(legacySecondsFixture.reads(),0,'legacy statistics also avoid raw intervals');
const deniedSecondsFixture=fixture({owned:false}),deniedSecondsService=deniedSecondsFixture.load('workers/src/services/computerUsage.ts');
await assert.rejects(()=>deniedSecondsService.readComputerUsageStatisticsSummarySeconds(deniedSecondsFixture.env,'foreign','child',date,date),/CHILD_NOT_FOUND/);
assert.equal(deniedSecondsFixture.reads(),0);assert.equal(deniedSecondsFixture.appReads(),0);
const scoped=new service.ComputerUsageService({}, {DB:{prepare(sql){assert.equal(sql,'SELECT id FROM profiles WHERE id=? AND account_id=?');return {bind(child,account){return {first:async()=>child==='current-child'&&account==='current-account'?{id:child}:null};}};}}});
const scopeRequest=(accountId,childId)=>new Request('https://private-capability/verifyChildAccess',{method:'POST',body:JSON.stringify({accountId,childId})});
assert.deepEqual(await (await scoped.fetch(scopeRequest('current-account','current-child'))).json(),{owned:true});
assert.deepEqual(await (await scoped.fetch(scopeRequest('foreign-account','current-child'))).json(),{owned:false});
const policyRequest=(accountId,childId)=>new Request('https://private-capability/readSharedAccessPolicy',
  {method:'POST',body:JSON.stringify({accountId,childId})});
assert.deepEqual(await (await scoped.fetch(policyRequest('current-account','current-child'))).json(),
  {policy:fullPolicy});
assert.equal((await scoped.fetch(policyRequest('foreign-account','current-child'))).status,404);
assert.equal((await scoped.fetch(new Request('https://private-capability/getUsage',{method:'POST'}))).status,405);
assert.equal((await scoped.fetch(scopeRequest('x'.repeat(3000),'current-child'))).status,400);
const quotaStateRequest=(accountId,childId,date='2026-10-02',extra={})=>new Request('https://private-capability/readSharedQuotaState',
  {method:'POST',body:JSON.stringify({accountId,childId,date,...extra})});
const quotaStateResponse=await scoped.fetch(quotaStateRequest('current-account','current-child'));
assert.equal(quotaStateResponse.status,200);
const quotaStateBody=await quotaStateResponse.json();
assert.deepEqual(quotaStateBody.state,{schemaVersion:1,policyRevision:'profile-config:7',revision:'state-r1',computedAtMs:1234,
  settledAtMs:null,complete:false,reasonCodes:['APPLICATION_COVERAGE_MISSING'],
  sources:[{source:'web',sourceKey:'opaque-source',date:'2026-10-02',revision:'web-r1'}],
  day:{date:'2026-10-02',usedMs:{study:1000,composite:2000,rest:0},remainingMs:{study:5000,composite:4000,rest:3000},borrowedRestMs:0},
  week:{fromDate:'2026-09-28',toDate:'2026-10-02',complete:false,reasonCodes:['APPLICATION_COVERAGE_MISSING'],restUsedMs:0,restRemainingMs:3000},offline:false});
assert.equal('stage' in quotaStateBody.state,false,'wire state contains only the published contract fields');
assert.equal((await scoped.fetch(quotaStateRequest('current-account','current-child','2026-02-30'))).status,400);
assert.equal((await scoped.fetch(quotaStateRequest('foreign-account','current-child'))).status,404);
assert.equal((await scoped.fetch(quotaStateRequest('current-account','current-child','2026-10-02',{childId:'foreign-child'}))).status,404);
const basisRequest=(extra={})=>new Request('https://private-capability/readSharedQuotaExecutionBasis',
 {method:'POST',body:JSON.stringify({accountId:'current-account',childId:'current-child',date:'2026-10-02',
 ownSourceKey:'b'.repeat(64),offset:0,limit:50,expectedRevision:null,...extra})});
const basisResponse=await scoped.fetch(basisRequest());
assert.equal(basisResponse.status,200);assert.equal(basisResponse.headers.get('cache-control'),'no-store');
assert.equal((await basisResponse.json()).authorizedScopes[0].source,'application');
for(const extra of [{source:'web'},{token:'private'},{date:'2026-02-30'},{offset:1},{limit:101},{ownSourceKey:'display-name'}])
 assert.equal((await scoped.fetch(basisRequest(extra))).status,400);
assert.equal((await scoped.fetch(basisRequest({accountId:'foreign-account'}))).status,404);
assert.equal((await scoped.fetch(basisRequest({expectedRevision:'c'.repeat(64)}))).status,409);
const changingFixture=fixture({policyChanges:true});
const changingService=new (changingFixture.load('workers/src/services/computerUsage.ts').ComputerUsageService)({},f.env);
assert.equal((await changingService.fetch(basisRequest())).status,409,'a policy change during basis loading cannot publish a mixed page');
const contentFixture=fixture({policyContentChanges:true});
const contentService=new (contentFixture.load('workers/src/services/computerUsage.ts').ComputerUsageService)({},f.env);
assert.equal((await contentService.fetch(basisRequest())).status,409,'a full policy content change with the same ordinal invalidates an in-flight page');
const stateFailureFixture=fixture({sharedStateFailure:true});const stateFailureService=new (stateFailureFixture.load('workers/src/services/computerUsage.ts').ComputerUsageService)({}, {DB:{
  prepare(){return {bind(){return {first:async()=>({id:'current-child'})};}};}}});
const stateFailure=await stateFailureService.fetch(quotaStateRequest('current-account','current-child'));
assert.equal(stateFailure.status,503);assert.deepEqual(await stateFailure.json(),{code:'SHARED_QUOTA_STATE_UNAVAILABLE'});
const basisFailure=await stateFailureService.fetch(basisRequest());
assert.equal(basisFailure.status,503);assert.deepEqual(await basisFailure.json(),{code:'SHARED_EXECUTION_BASIS_UNAVAILABLE'});
const failedScope=new service.ComputerUsageService({}, {DB:{prepare(){throw Error('private DB failure');}}});
assert.deepEqual(await (await failedScope.fetch(scopeRequest('current-account','current-child'))).json(),{code:'APPLICATION_SCOPE_UNAVAILABLE'});
let result=await service.readComputerUsage(f.env,'account','child',date,date);
assert.equal(result.totals.webMs,3000);assert.equal(result.totals.applicationMs,2000);assert.equal(result.totals.computerMs,5000);
assert.ok(!result.reasons.includes('DEVICE_MAPPING_INCOMPLETE'));assert.equal(result.timeline.some(row=>row.key.includes('private-segment')),false);
assert.equal(result.devices.length,1);assert.equal(result.devices[0].key,'child','projection is Child-level, not split by physical computer');
assert.equal(result.sourceStatus.web,'complete','missing computer mapping does not invalidate authoritative web statistics');assert.equal(result.sourceStatus.application,'complete');
const firstReads=f.reads();await service.readComputerUsage(f.env,'account','child',date,date);assert.equal(f.reads(),firstReads,'same source versions reuse interval cache');
const cachedSummary=await service.readComputerUsage(f.env,'account','child',date,date,undefined,true);
assert.deepEqual(JSON.parse(JSON.stringify(cachedSummary.totals)),JSON.parse(JSON.stringify(result.totals)));
assert.equal(cachedSummary.revision,result.revision);assert.equal(cachedSummary.timeline.length,0);assert.equal(cachedSummary.products.length,0);
assert.equal(f.reads(),firstReads);assert.equal(f.appReads(),1,'summary/details cache hits never reload application evidence');
const summaryKeys=[...f.store.keys()].filter(key=>key.endsWith(':summary'));assert.equal(summaryKeys.length,1);
assert.ok(summaryKeys[0].startsWith('computer-projection-v5:'),'the Child projection invalidates cached physical-computer generations');
assert.equal(JSON.parse(f.store.get(summaryKeys[0])).timeline.length,0,'summary KV generation is small and separate from details');
f.change();const updated=await service.readComputerUsage(f.env,'account','child',date,date);assert.notEqual(updated.revision,result.revision);assert.ok(f.reads()>firstReads);
const selected=await service.readComputerUsage(f.env,'account','child',date,date,'opaque-computer');assert.equal(selected.totals.applicationMs,2000);assert.equal(selected.devices.length,1);
const week=await service.readComputerUsage(f.env,'account','child',date,'2026-10-02');const webGroup=week.devices.find(device=>device.key==='child');assert.ok(webGroup,'week view exposes a single Child aggregate');
const weekSelected=await service.readComputerUsage(f.env,'account','child',date,'2026-10-02',webGroup.key);assert.equal(weekSelected.sourceVersions.length,week.sourceVersions.length,'legacy computer query is ignored, not used as an aggregation boundary');assert.equal(weekSelected.totals.webMs,week.totals.webMs);assert.equal(weekSelected.devices.length,1);
f=fixture({appFailure:true});result=await f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'account','child',date,date);assert.equal(result.totals.webMs,3000);assert.equal(result.totals.applicationMs,null);assert.ok(result.reasons.includes('APPLICATION_SOURCE_UNAVAILABLE'));
assert.equal(f.store.size,0,'source failures are not retained as successful generations');
f=fixture({webFailure:true});result=await f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'account','child',date,date);assert.equal(result.totals.applicationMs,2000);assert.equal(result.totals.webMs,null);
assert.equal(f.store.size,0);
// Both sources must start before either is allowed to finish. Avoid timing-based assertions.
f=fixture();let releaseApplication;const blocked=new Promise(resolve=>releaseApplication=resolve);
let originalApplication=f.env.RUNTIME_COMPUTER_USAGE.readApplicationEvidence,appStarted=false,parallelStarted=false;
f.env.RUNTIME_COMPUTER_USAGE.readApplicationEvidence=async()=>{appStarted=true;await blocked;return originalApplication();};
const originalPrepare=f.env.DB.prepare;
f.env.DB.prepare=sql=>{const statement=originalPrepare(sql);if(sql.includes('FROM devices'))return {bind(...args){const bound=statement.bind(...args);return {...bound,async all(){await Promise.resolve();parallelStarted=appStarted;releaseApplication();return bound.all();}};}};return statement;};
let timeout;try{await Promise.race([f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'account','child',date,date),new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('parallel sources did not settle')),5000))]);}finally{clearTimeout(timeout);}
assert.equal(parallelStarted,true,'application read starts while web is still loading');
f=fixture();f.env.CONFIG_CACHE.get=async()=>{throw Error('cache unavailable');};f.env.CONFIG_CACHE.put=async()=>{throw Error('cache unavailable');};
result=await f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'account','child',date,date,undefined,true);
assert.equal(result.totals.webMs,3000);assert.equal(result.totals.applicationMs,2000);assert.equal(result.timeline.length,0,'cache failure preserves exact summary');
f=fixture({failedDate:date});result=await f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'account','child',date,'2026-10-02');assert.equal(result.totals.webMs,3000);assert.equal(result.sourceStatus.web,'partial');assert.equal(result.sourceVersions.filter(source=>source.kind==='web').length,2);assert.equal(result.totals.applicationMs,2000);
f=fixture({owned:false});await assert.rejects(()=>f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'foreign','child',date,date),/CHILD_NOT_FOUND/);assert.equal(f.reads(),0);
f=fixture({legacy:true});result=await f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'account','child',date,date);assert.equal(result.totals.webMs,5134000);assert.equal(result.sourceCategoriesMs.web.study,5134000);assert.equal(result.historyStatus,'bestEffort');
f=fixture({appFailure:true,appError:'D1_ERROR: out of memory: SQLITE_NOMEM'});result=await f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'account','child',date,date);assert.equal(result.totals.webMs,3000);assert.ok(result.reasons.includes('APPLICATION_DATABASE_MEMORY_LIMIT'));
const publicStats=[{date,channel:'active',mode:'study',target_key:'domain:learning.example',target_classification_at_time:'study',duration_seconds:5134,managed_target_label_at_time:'',fallback_domain:'learning.example'}];
f=fixture({publicStats});service=f.load('workers/src/services/computerUsage.ts');
const independent=await service.readIndependentUsage(f.env,'account','child',date,date,'web');assert.equal(independent.totalDurationMs,5134000);assert.equal(independent.categories[0].durationMs,5134000);assert.equal(independent.applications[0].displayName,'learning.example');assert.equal(independent.buckets[0].startAtMs,start);
const independentWeek=await service.readIndependentUsage(f.env,'account','child',date,'2026-10-02','web');assert.equal(independentWeek.totalDurationMs,independent.totalDurationMs,'hourly rows are not added to daily authority');
await assert.rejects(()=>service.readIndependentUsage(f.env,'account','child',date,date,'other'),/INVALID_SOURCE/);
f=fixture();f.env.RUNTIME_COMPUTER_USAGE.fetch=async request=>{const scope=await request.json();assert.equal(scope.childId,'child');return Response.json(new URL(request.url).pathname.includes('Revision')?'cap-r1':[app]);};
result=await f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'account','child',date,date);assert.equal(result.totals.applicationMs,2000,'bounded capability HTTP transport preserves app authority');
for(const [a,b] of [['2026-02-30','2026-02-30'],['2026-10-01','2026-10-08'],['2026-10-02','2026-10-01']])assert.throws(()=>service.validateComputerUsageRange(a,b),/INVALID_RANGE/);
console.log('PASS cloud computer usage: original authority, Child aggregation, failure isolation, versioned cache, legacy-filter compatibility, privacy, range');
})().catch(error=>{console.error(error);process.exitCode=1;});

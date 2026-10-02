const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),{webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
function loader(overrides={}){const cache=new Map();return function load(file){if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);
const source=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(source,{module,exports:module.exports,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,URL,Request,Response,Date,Map,Set,Promise,Number,Object,JSON,Error,console,require:name=>{
if(name in overrides)return overrides[name];if(name==='@timeonchrome/app-runtime-contracts/shared-access')return load('app-runtime-management/contracts/shared-access.ts');
const next=path.posix.normalize(path.posix.join(path.posix.dirname(file),name));return load(next.endsWith('.js')||next.endsWith('.ts')?next:next+'.ts');}});return module.exports;};}
const date='2026-10-02',start=Date.parse(`${date}T00:00:00+08:00`),allDay=[{start:'00:00',end:'24:00'}];
const weekdays=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const policy={schemaVersion:1,revision:'profile-config:8',effectiveAtMs:start,stage:'legacy',
 dailyMinutes:Object.fromEntries(weekdays.map(day=>[day,{study:60,composite:30,rest:60}])),weeklyRestMinutes:240,
 timeWindows:Object.fromEntries(weekdays.map(day=>[day,{study:allDay,composite:allDay,rest:allDay}])),
 autonomy:{restrictedEntryConfirmationRequired:true,dailyFirstReminderMinutes:5,weeklyFirstReminderMinutes:10,
 repeatReminderMinutes:5,softReminderTimeoutAction:'continue',visibleResponseDeadlineSeconds:60}};
const application={schemaVersion:1,source:'application',sourceKey:'app:opaque',date,revision:'4:hash-app',statisticsRevision:'hash-app',
 correctionRevision:'corr-app',productAssociationVersion:'assoc-3',policyRevision:policy.revision,settledAtMs:start+1000,complete:true,reasonCodes:[],
 bucketsMs:{study:0,composite:0,rest:0},applicationClassesMs:{study:600000,composite:0,restrictedEntertainment:60000,unclassified:0,other:3600000},chromeExcludedMs:0};
function fixture({legacy=false,appCoverage=true,expectedAppScopes=1,noDevice=false,webUnavailable=false}={}){
 const manifestDates=new Map();
 const account={profileId:'child',deviceId:'browser',date,revision:2,statsHash:'web-hash',generatedAt:start+5000,complete:true,lossCount:0,
  rows:[{kind:'daily_target',channel:'active',quotaBucket:'study',durationSeconds:600,targetKey:'x'},
    {kind:'daily_target',channel:'active',quotaBucket:'other',durationSeconds:900,targetKey:'y'}]};
 const db={prepare(sql){if(webUnavailable)throw new Error('D1 unavailable');return{bind(...params){return{
  async first(){if(sql.includes('SELECT manifest_id')){const queryDate=String(params[2]??date),manifestId=`manifest-${queryDate}`;
    manifestDates.set(manifestId,queryDate);return legacy?null:{manifest_id:manifestId};}return null;},
  async all(){if(sql.includes('FROM devices'))return{results:noDevice?[]:[{id:'browser',device_name:'browser'}]};
    if(sql.includes('FROM target_stats_v1'))return{results:[{channel:'active',mode:'study',quota_bucket:'study',duration_seconds:600,updated_at:start+1}]};
    if(sql.includes('FROM stats_v1'))return{results:[]};return{results:[]};}
 };}};},withSession(){return db;}};
 const mocks={'./profileAccountsV2':{readManifestAccountV2:async(_env,manifestId)=>{const queryDate=manifestDates.get(manifestId)??date;
   return{...account,date:queryDate,revision:`2:${queryDate}`,statsHash:`web-hash-${queryDate}`};}},
  './compositePageCorrections':{readCompositeCorrections:async()=>({items:[],revision:'corr-web'}),projectCompositeDailyRows:(_account,rows)=>account.rows.filter(row=>row.kind==='daily_target')},
  './usageAccountingCorrections':{listUsageAccountingCorrections:async()=>[],applyCorrectionsToV1StatsRows:rows=>rows}};
 const load=loader(mocks),service=load('workers/src/services/sharedAccessState.ts');
 const env={DB:db,RUNTIME_COMPUTER_USAGE:{fetch:async request=>{const body=await request.json();
  const current={...application,date:body.fromDate,revision:`4:${body.fromDate}`,statisticsRevision:`hash-app-${body.fromDate}`};
  return Response.json({complete:appCoverage,expectedScopeCount:expectedAppScopes,verifiedScopeCount:appCoverage?1:0,
    reasonCodes:appCoverage?[]:['APPLICATION_ACCOUNT_NOT_PUBLISHED'],contributions:appCoverage?[{sourceKey:application.sourceKey,revision:current.revision,contribution:current}]:[]});}}};
 return{service,env};
}
(async()=>{
 const {service,env}=fixture();
 const result=await service.readSharedAccessDayState(env,'account','child',date,policy);
 assert.equal(result.complete,true,'complete app and web source coverage can produce a complete shadow projection');
 assert.equal(result.day.usedMs.study,1200000,'web and application study contributions are combined');
 assert.equal(result.web.bucketsMs.study,600000);
 assert.equal(result.web.bucketsMs.composite,0,'other time does not consume a shared quota bucket');
 assert.equal(result.application.classesMs.study,600000);
 assert.equal(result.week.fromDate,'2026-09-28','weekly aggregation starts Monday in Beijing time');
 assert.equal(result.week.toDate,'2026-10-04','weekly aggregation ends Sunday in Beijing time');
 assert.equal(result.week.complete,true,'all seven persisted daily source projections can produce a complete week');
 assert.equal(result.week.restUsedMs,7*60000,'weekly state sums the seven daily Rest projections');
 assert.equal(result.week.restRemainingMs,240*60000-7*60000,'weekly entertainment quota uses the unified policy');
 assert.equal(result.usableForEnforcement,false,'shadow state is not an enforcement input');
 const stageChanged=await service.readSharedAccessDayState(env,'account','child',date,{...policy,stage:'shadow'});
 assert.notEqual(result.revision,stageChanged.revision,'policy rollout stage changes produce a new state revision');
 assert.equal(JSON.stringify(result).includes('local_user_id'),false,'raw Runtime account identifiers never reach the Child reader');

 const incomplete=fixture({appCoverage:false}),partial=await incomplete.service.readSharedAccessDayState(incomplete.env,'account','child',date,policy);
 assert.notEqual(result.revision,partial.revision,'weekly/day source quality is included in the state revision');
 assert.equal(partial.complete,false,'missing app receipt coverage cannot be called complete');
 assert.equal(partial.week.complete,false,'a missing source day keeps the whole weekly state incomplete');
 assert.ok(partial.reasonCodes.includes('APPLICATION_ACCOUNT_NOT_PUBLISHED'));
 assert.equal(partial.web.bucketsMs.study,600000,'available web source remains visible when app source is unavailable');
 const expandedCoverage=fixture({appCoverage:false,expectedAppScopes:2});
 const expanded=await expandedCoverage.service.readSharedAccessDayState(expandedCoverage.env,'account','child',date,policy);
 assert.notEqual(partial.revision,expanded.revision,'coverage changes produce a new snapshot revision even when the failure code is unchanged');

 const webFailed=fixture({webUnavailable:true}),appSurvives=await webFailed.service.readSharedAccessDayState(webFailed.env,'account','child',date,policy);
 assert.equal(appSurvives.complete,false,'web source failure cannot make the merged state complete');
 assert.ok(appSurvives.reasonCodes.includes('WEB_SOURCE_UNAVAILABLE'));
 assert.equal(appSurvives.application.classesMs.study,600000,'web D1 failure does not hide a valid Runtime source');

 const old=fixture({legacy:true}),bestEffort=await old.service.readSharedAccessDayState(old.env,'account','child',date,policy);
 assert.equal(bestEffort.complete,false,'legacy aggregates are best-effort only');
 assert.ok(bestEffort.reasonCodes.includes('HISTORICAL_SOURCE_BEST_EFFORT'));
 assert.equal(bestEffort.web.bucketsMs.study,600000,'legacy value remains visible as a separate diagnostic');

 const buckets=service.quotaBucketsFromRows([
  {channel:'active',quotaBucket:'study',durationSeconds:3},{channel:'active',quotaBucket:'other',durationSeconds:7},
  {channel:'media',quotaBucket:'rest',durationSeconds:11}], 'quotaBucket','durationSeconds');
 assert.equal(buckets.study,3);assert.equal(buckets.composite,0);assert.equal(buckets.rest,0);
 const missing=fixture({noDevice:true}),noWeb=await missing.service.readSharedAccessDayState(missing.env,'account','child',date,policy);
 assert.equal(noWeb.complete,false,'no known browser source is never treated as zero coverage');
 assert.ok(noWeb.reasonCodes.includes('WEB_COVERAGE_MISSING'));
 console.log('PASS child shared-access state: quota buckets, partial sources, legacy quality, source coverage, privacy');
})().catch(error=>{console.error(error);process.exitCode=1;});

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),{webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
function loader(overrides={}){const cache=new Map();return function load(file){if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);
const source=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(source,{module,exports:module.exports,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,URL,Request,Response,Date,Map,Set,Promise,Number,Object,JSON,Error,console,require:name=>{
if(name in overrides)return overrides[name];if(name==='@timeonchrome/app-runtime-contracts/shared-access')return load('app-runtime-management/contracts/shared-access.ts');
if(name==='@timeonchrome/app-runtime-contracts/shared-web-sync')return load('app-runtime-management/contracts/shared-web-sync.ts');
if(name==='@timeonchrome/app-runtime-contracts/shared-quota-execution')return load('app-runtime-management/contracts/shared-quota-execution.ts');
if(name==='./shared-access.js')return load('app-runtime-management/contracts/shared-access.ts');
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
function fixture({legacy=false,appCoverage=true,expectedAppScopes=1,noDevice=false,webUnavailable=false,unboundWithHistory=false,
 derived=false,derivedMissing=false}={}){
 const manifestScopes=new Map();
 const account={profileId:'child',deviceId:'browser',date,revision:2,statsHash:'web-hash',generatedAt:start+5000,complete:true,lossCount:0,
  rows:[{kind:'daily_target',channel:'active',quotaBucket:'study',durationSeconds:600,targetKey:'x'},
    {kind:'daily_target',channel:'active',quotaBucket:'other',durationSeconds:900,targetKey:'y'}]};
 const db={prepare(sql){if(webUnavailable)throw new Error('D1 unavailable');return{bind(...params){return{
  async first(){if(sql.includes('SELECT manifest_id')){const queryDate=String(params[2]??date),deviceId=String(params[1]??'browser'),manifestId=`manifest-${deviceId}-${queryDate}`;
    manifestScopes.set(manifestId,{date:queryDate,deviceId});return legacy?null:{manifest_id:manifestId};}return null;},
  async all(){if(sql.includes('FROM devices')){
      const retainsUnboundHistory=sql.includes('device_account_heads_v2')&&sql.includes('target_stats_v1')&&sql.includes('stats_v1');
      return{results:noDevice?[]:unboundWithHistory&&retainsUnboundHistory?
        [{id:'browser',device_name:'browser'},{id:'previously-unbound',device_name:'previously-unbound'}]:[{id:'browser',device_name:'browser'}]};}
    if(sql.includes('FROM target_stats_v1'))return{results:[{channel:'active',mode:'study',quota_bucket:'study',duration_seconds:600,updated_at:start+1}]};
    if(sql.includes('FROM stats_v1'))return{results:[]};return{results:[]};}
 };}};},withSession(){return db;}};
 const mocks={'./profileAccountsV2':{readManifestAccountV2:async(_env,manifestId)=>{const scope=manifestScopes.get(manifestId)??{date,deviceId:'browser'};
   return{...account,deviceId:scope.deviceId,date:scope.date,revision:2,statsHash:`web-hash-${scope.date}-${scope.deviceId}`};}},
  './compositePageCorrections':{readCompositeCorrections:async()=>({items:[],revision:'corr-web'}),projectCompositeDailyRows:(_account,rows)=>account.rows.filter(row=>row.kind==='daily_target')},
  './usageAccountingCorrections':{listUsageAccountingCorrections:async()=>[],applyCorrectionsToV1StatsRows:rows=>rows}};
 if(derived)mocks['./sharedWebContributions']={readPublishedSharedWebContribution:async(_env,owner,child,device,day,currentPolicy)=>{
   if(derivedMissing)return null;
   assert.equal(owner,'account');assert.equal(child,'child');
   const sync=await import('../../app-runtime-management/contracts/dist/shared-web-sync.js');
   const contract=await import('../../app-runtime-management/contracts/dist/shared-access.js');
   const body={schemaVersion:1,date:day,revisionOrdinal:7,statisticsRevision:'current-authoritative-hash',correctionRevision:'corr-web',
     policyIdentity:await contract.createSharedAccessPolicyIdentityV1(currentPolicy),computedAtMs:start+1000,settledAtMs:start,
     activeMs:900000,bucketsMs:{study:600000,composite:0,rest:0},otherMs:300000,complete:true,reasonCodes:[]};
   const digest=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(owner+'\n'+device))).toString('hex');
   return sync.sharedWebExecutionSourceV1({...body,contentHash:await sync.sharedWebContributionHashV1(body)},'web:'+digest);
 }};
 const load=loader(mocks),service=load('workers/src/services/sharedAccessState.ts');
 const env={DB:db,RUNTIME_COMPUTER_USAGE:{fetch:async request=>{const body=await request.json();
  const current={...application,date:body.fromDate,revision:`raw-app-${body.fromDate}`,statisticsRevision:`hash-app-${body.fromDate}`};
  return Response.json({complete:appCoverage,expectedScopeCount:expectedAppScopes,verifiedScopeCount:appCoverage?1:0,
    reasonCodes:appCoverage?[]:['APPLICATION_ACCOUNT_NOT_PUBLISHED'],contributions:appCoverage?[{sourceKey:application.sourceKey,revision:`4:${body.fromDate}`,contribution:current}]:[]});}}};
 if(derived)env.SHARED_WEB_CONTRIBUTIONS_ENABLED='true';
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
 assert.equal(result.week.toDate,date,'weekly state is through the selected Beijing date, not future days');
 assert.equal(result.week.complete,true,'all persisted days through the selected date can produce a complete week-to-date state');
 assert.equal(result.week.restUsedMs,5*60000,'weekly state sums Monday through Friday daily Rest projections');
 assert.equal(result.week.restRemainingMs,240*60000-5*60000,'weekly entertainment quota uses the unified policy');
 assert.equal(result.usableForEnforcement,false,'shadow state is not an enforcement input');
 const basis=await service.readSharedQuotaExecutionBasis(env,'account','child',date,policy);
 assert.equal(basis.fromDate,'2026-09-28');assert.equal(basis.days.length,5);
 const appBasis=basis.days.at(-1).sources.find(entry=>entry.contribution.source==='application');
 assert.equal(appBasis.revisionOrdinal,4);
 assert.equal(appBasis.publicationRevision,`4:${date}`);
 assert.equal(appBasis.contribution.revision,`raw-app-${date}`,'raw contribution revision is not overwritten by publication revision');
 assert.equal(basis.days[0].sources.find(entry=>entry.contribution.source==='web').revisionOrdinal,2);
 assert.equal((await service.readSharedQuotaExecutionBasis(env,'account','child',date,policy)).revision,basis.revision);
 const ownWeb=basis.days[0].sources.find(entry=>entry.contribution.source==='web').contribution.sourceKey;
 const page1=service.pageSharedQuotaExecutionBasis(basis,ownWeb,0,3,null);
 assert.equal(page1.page.total,10);assert.equal(page1.page.nextOffset,3);assert.equal(page1.page.items.length,3);
 assert.equal(page1.days.length,5);assert.equal(page1.authorizedScopes.length,5);
 assert.ok(page1.authorizedScopes.every(scope=>scope.source==='web'&&scope.sourceKey===ownWeb));
 assert.equal(service.pageSharedQuotaExecutionBasis(basis,'not-own',0,100,null).authorizedScopes.length,0);
 const ownApp=appBasis.contribution.sourceKey;
 const appPage=service.pageSharedQuotaExecutionBasis(basis,ownApp,0,100,null,'application');
 assert.equal(appPage.authorizedScopes.length,5);
 assert.ok(appPage.authorizedScopes.every(scope=>scope.source==='application'&&scope.sourceKey===ownApp));
 assert.equal(service.pageSharedQuotaExecutionBasis(basis,ownApp,0,100,null).authorizedScopes.length,0,
   'an application source key never grants a web replacement scope');
 assert.equal(service.pageSharedQuotaExecutionBasis(basis,ownWeb,0,100,null,'application').authorizedScopes.length,0);
 const wirePages=[{profileId:'child',...page1}];
 const collected=[...page1.page.items];let cursor=page1.page.nextOffset;
 while(cursor!==null){const next=service.pageSharedQuotaExecutionBasis(basis,ownWeb,cursor,3,basis.revision);
   wirePages.push({profileId:'child',...next});collected.push(...next.page.items);cursor=next.page.nextOffset;}
 assert.equal(collected.length,10);assert.equal(JSON.stringify(collected),JSON.stringify(basis.days.flatMap(day=>day.sources)));
 const {assembleSharedQuotaExecutionPages}=await import('../../app-runtime-management/contracts/dist/shared-quota-execution.js');
 const assembled=assembleSharedQuotaExecutionPages(policy,'child',JSON.parse(JSON.stringify(wirePages)));
 assert.equal(JSON.stringify(assembled.basis),JSON.stringify(basis),'real producer pages reconstruct the exact shared-contract basis');
 assert.equal(JSON.stringify(assembled.authorizedScopes),JSON.stringify(page1.authorizedScopes));
 assert.throws(()=>service.pageSharedQuotaExecutionBasis(basis,ownWeb,1,3,null),/INVALID_EXECUTION_CURSOR/);
 assert.throws(()=>service.pageSharedQuotaExecutionBasis(basis,ownWeb,1,3,'changed'),/EXECUTION_BASIS_VERSION_CHANGED/);
 assert.throws(()=>service.pageSharedQuotaExecutionBasis(basis,ownWeb,11,3,basis.revision),/INVALID_EXECUTION_CURSOR/);
 assert.throws(()=>service.pageSharedQuotaExecutionBasis(basis,ownWeb,0,101,null),/INVALID_EXECUTION_CURSOR/);
 assert.notEqual((await service.readSharedQuotaExecutionBasis(env,'another-account','child',date,policy)).revision,basis.revision);
 assert.equal(JSON.stringify(basis).includes('device_name'),false);
 assert.ok(basis.days.every(day=>day.sources.every(entry=>entry.contribution.sourceKey!=='browser')),
   'source keys are opaque, never raw device identifiers');
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
 const historicalBasis=await old.service.readSharedQuotaExecutionBasis(old.env,'account','child',date,policy);
 assert.ok(historicalBasis.days[0].reasonCodes.includes('SOURCE_EXECUTION_VERSION_UNAVAILABLE'));
 assert.equal(historicalBasis.days[0].sources.some(entry=>entry.contribution.source==='web'),false,'no invented ordinal for legacy sources');
 const partialBasis=await incomplete.service.readSharedQuotaExecutionBasis(incomplete.env,'account','child',date,policy);
 assert.ok(partialBasis.days[0].reasonCodes.includes('SOURCE_COVERAGE_INCOMPLETE'));
 assert.equal(partialBasis.days[0].sources.length,1,'valid web source remains when application source is missing');

 const buckets=service.quotaBucketsFromRows([
  {channel:'active',quotaBucket:'study',durationSeconds:3},{channel:'active',quotaBucket:'other',durationSeconds:7},
  {channel:'media',quotaBucket:'rest',durationSeconds:11}], 'quotaBucket','durationSeconds');
 assert.equal(buckets.study,3);assert.equal(buckets.composite,0);assert.equal(buckets.rest,0);
 const missing=fixture({noDevice:true}),noWeb=await missing.service.readSharedAccessDayState(missing.env,'account','child',date,policy);
 assert.equal(noWeb.complete,false,'no known browser source is never treated as zero coverage');
 assert.ok(noWeb.reasonCodes.includes('WEB_COVERAGE_MISSING'));
 const unbound=fixture({unboundWithHistory:true}),retained=await unbound.service.readSharedAccessDayState(unbound.env,'account','child',date,policy);
 assert.equal(retained.web.expectedScopeCount,2,'a same-day unbound device remains in Child quota coverage');
 assert.equal(retained.web.bucketsMs.study,1200000,'already-settled use remains counted after mid-day unbinding');
 assert.equal(retained.complete,true,'complete same-day receipts from bound and unbound devices remain complete');
 const current=fixture({derived:true}),currentState=await current.service.readSharedAccessDayState(current.env,'account','child',date,policy);
 assert.equal(currentState.day.usedMs.study,1200000,'authoritative web ten minutes + non-Chrome application ten minutes = twenty minutes');
 const currentBasis=await current.service.readSharedQuotaExecutionBasis(current.env,'account','child',date,policy);
 assert.equal(currentBasis.days[0].sources.find(source=>source.contribution.source==='web').revisionOrdinal,7,
   'derived queue ordinal is preserved, never replaced by the original V2 manifest ordinal 2');
 assert.equal(currentBasis.days[0].sources.find(source=>source.contribution.source==='web').contribution.statisticsRevision,
   'current-authoritative-hash');
 const absent=fixture({derived:true,derivedMissing:true}),absentBasis=await absent.service.readSharedQuotaExecutionBasis(absent.env,'account','child',date,policy);
 assert.ok(absentBasis.days[0].reasonCodes.includes('WEB_DERIVED_CONTRIBUTION_MISSING'));
 assert.ok(absentBasis.days[0].sources.every(source=>source.contribution.source!=='web'),
   'missing derived receipt cannot fall back to unrelated V2 manifest ordinal');
 const multiple=fixture({derived:true,unboundWithHistory:true}),multipleState=await multiple.service.readSharedAccessDayState(multiple.env,'account','child',date,policy);
 assert.equal(multipleState.web.expectedScopeCount,2);
 assert.equal(multipleState.day.usedMs.study,1800000,'other device contributions are not lost when local contribution is replaced');
 console.log('PASS child shared-access state: quota buckets, partial sources, legacy quality, source coverage, privacy');
})().catch(error=>{console.error(error);process.exitCode=1;});

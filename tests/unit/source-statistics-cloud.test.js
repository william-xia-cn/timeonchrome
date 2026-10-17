'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'../..');
function load(file,deps={}){
 const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};new Function('require','module','exports',code)(name=>deps[name]??{},module,module.exports);return module.exports;
}
(async()=>{
 const contract=await import('../../app-runtime-management/contracts/dist/source-statistics.js');
 const compact=load('workers/src/services/profileAccountSnapshotsV2.ts',{
  '../../../extension/core/device-account-v2.js':require('../../extension/core/device-account-v2.js')});
 const corrections=load('workers/src/services/usageAccountingCorrections.ts');
 const date='2026-10-07',now=Date.parse(date+'T12:00:00+08:00');
 const key=async(account,device)=>'web:'+Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(account+'\n'+device))).toString('hex');
 let missing=false,total=600,changes=[];const reads=[];
 const db={prepare(sql){return{bind(...args){reads.push({sql,args});return{
  async all(){assert.match(sql,/FROM devices/);assert.equal(args[0],'child');return{results:[{id:'self'},{id:'peer'}]};},
  async first(){assert.match(sql,/device_account_heads_v2/);assert.equal(args[0],'child');return missing?null:{manifest_id:args[1]};}
 };}};}};
 const reader=load('workers/src/services/sourceStatistics.ts',{
  '@timeonchrome/app-runtime-contracts/source-statistics':contract,
  './profileAccountSnapshotsV2':compact,
  './sharedAccessState':{sharedWebSourceKey:key},
  './usageAccountingCorrections':{...corrections,listUsageAccountingCorrections:async()=>changes},
  './profileAccountsV2':{readManifestAccountV2:async(_env,id)=>({profileId:'child',deviceId:id,date,revision:total,statsHash:'hash-'+total,
   generatedAt:now,complete:true,lossCount:0,rows:[
    {kind:'daily_domain',channel:'active',mode:'study',domain:'study.example',durationSeconds:total},
    {kind:'daily_target',channel:'active',mode:'study',quotaBucket:'study',durationSeconds:total},
    {kind:'hourly_domain',channel:'active',mode:'study',durationSeconds:total},
    {kind:'daily_domain',channel:'media',mode:'rest',domain:'media.example',durationSeconds:900},
    {kind:'daily_target',channel:'media',quotaBucket:'rest',durationSeconds:900}
   ]})}
 });
 const query={source:'web',scope:'other',fromDate:date,toDate:date};
 const before=JSON.stringify(changes);
 const result=await reader.readWebSourceStatistics({DB:db},'account','child',query,'self',now);
 assert.equal(result.days[0].totalSeconds,600,'daily/hour/target projections must not be added; media is auxiliary');
 assert.deepEqual(result.days[0].categoriesSeconds,{study:600});assert.equal(result.days[0].complete,true);
 assert.deepEqual(result.excludedSourceKeys,[await key('account','self')]);assert.deepEqual(result.includedSourceKeys,[await key('account','peer')]);
 assert.equal(reads.filter(r=>r.sql.includes('device_account_heads_v2')).length,1,'self not loaded and cloud self copy not required');
 assert.equal(JSON.stringify(changes),before);
 const all=await reader.readWebSourceStatistics({DB:db},'account','child',{...query,scope:'all'},undefined,now);
 assert.equal(all.days[0].totalSeconds,1200,'devices accumulated, never globally unioned');
 total=100;const lower=await reader.readWebSourceStatistics({DB:db},'account','child',query,'self',now);
 assert.equal(lower.days[0].totalSeconds,100);assert.notEqual(lower.revision,result.revision);
 assert.equal((await reader.readWebSourceStatistics({DB:db},'account','child',query,'self',now)).revision,lower.revision);
 changes=[{id:'correction',segmentId:'fact',deviceId:'peer',date,channel:'active',durationSeconds:30,
  originalMode:'study',originalQuotaBucket:'study',effectiveMode:'rest',effectiveQuotaBucket:'rest'}];
 const corrected=await reader.readWebSourceStatistics({DB:db},'account','child',query,'self',now);
 assert.equal(corrected.days[0].totalSeconds,100);assert.deepEqual(corrected.days[0].categoriesSeconds,{study:70,rest:30});
 missing=true;const unavailable=await reader.readWebSourceStatistics({DB:db},'account','child',query,'self',now);
 assert.equal(unavailable.days[0].totalSeconds,null);assert.equal(unavailable.days[0].complete,false);
 await assert.rejects(()=>reader.readWebSourceStatistics({DB:db},'account','child',{...query,ownSourceKeys:['invented']},'self',now));
 await assert.rejects(()=>reader.readSourceStatisticsResponse(new Response('x'.repeat(65537))));
 // 实际device入口，身份/范围由既有鉴权解析，重绑期间响应拒绝。
 let identity={profileId:'child',deviceId:'self'},rebind=false,peerReads=0,verifiedScope=null,proofReads=0;
 const router=load('workers/src/routes/device.ts',{
  '../db/middleware':{json:(body,status=200)=>Response.json(body,{status})},
  '@timeonchrome/app-runtime-contracts/source-statistics':contract,
  '../services/sharedWebSourceBinding':{readApplicationSourceForDevice:async(_env,scope,proof)=>{
   proofReads++;assert.deepEqual(scope,{accountId:'account',childId:'child',deviceId:'self',deviceToken:'fixture'});
   return proof?.trusted===true?verifiedScope:null;}},
  '../services/sourceStatistics':{...reader,readWebSourceStatistics:async()=>{peerReads++;if(rebind)identity={profileId:'changed',deviceId:'self'};return all;}},
  './deviceIdentity':{verifyDeviceTokenFromRequest:async request=>request.headers.get('authorization')==='Bearer fixture'?identity:null,
   deviceUnboundResponse:()=>Response.json({code:'DEVICE_UNBOUND'},{status:403})}
 }).deviceRouter;
 const env={DB:{prepare(sql){assert.equal(sql,'SELECT account_id FROM profiles WHERE id=?');return{bind(child){assert.equal(child,'child');return{first:async()=>({account_id:'account'})};}};}}};
 const request=(body={...query,scope:'all'},token='fixture')=>new Request('https://guardian.test/device/source-statistics',{
  method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await router.handle(request(),env)).status,200);
 assert.equal((await router.handle(request(query,'bad'),env)).status,401);
 assert.equal((await router.handle(request({...query,childId:'caller'}),env)).status,400);
 assert.equal((await router.handle(request({...query,ownSourceKeys:['invented']}),env)).status,400);
 assert.equal((await router.handle(request({...query,source:'application'}),env)).status,400);
 assert.equal(peerReads,1,'invalid requests do not read domain statistics');
 rebind=true;assert.equal((await router.handle(request(),env)).status,409);
 identity={profileId:'child',deviceId:'self'};rebind=false;
 const app={...all,source:'application',days:all.days.map(day=>({...day,nonSpecialTotalSeconds:day.totalSeconds}))};
 const appEnv={...env,RUNTIME_COMPUTER_USAGE:{fetch:async request=>{
  assert.equal(new URL(request.url).pathname,'/getApplicationSourceStatistics');
  assert.deepEqual(await request.json(),{accountId:'account',childId:'child',query:{...query,source:'application',scope:'all'}});
  return Response.json(app);
 }}};
 assert.deepEqual(await (await router.handle(request({...query,source:'application',scope:'all'}),appEnv)).json(),app);
 assert.equal((await router.handle(request({...query,source:'application',scope:'all'}),{...env,RUNTIME_COMPUTER_USAGE:{fetch:async()=>new Response(null,{status:503})}})).status,503);
 // 新桶路径复用原账户快照和原配额读取器；不读取新来源head，不另建统计。
 const quotaModel=await import('../../extension/core/quota-read-model-v2.js');
 const calendar=await import('../../extension/core/profile-account-v2.js');
 const period=calendar.getBeijingWeekPeriod(date);
 const accounts=[['self',600],['peer',400]].map(([deviceId,n])=>({deviceId,date,complete:true,
   quotaProjection:{activeSeconds:n,byQuotaBucket:[{quotaBucket:'study',durationSeconds:n}],byDomain:[]}}));
 const frozen=JSON.stringify(accounts);let snapshotReads=0,pageReads=0,inventoryAvailable=true;
 const reused=load('workers/src/services/sourceStatistics.ts',{
  '@timeonchrome/app-runtime-contracts/source-statistics':contract,
  '../../../extension/core/quota-read-model-v2.js':quotaModel,
  '../../../extension/core/profile-account-v2.js':calendar,
  './profileAccountSnapshotsV2':{
   createOrReuseProfileAccountSnapshotV2:async(_env,child,week)=>{
    assert.equal(child,'child');assert.equal(week,period.weekStart);snapshotReads++;return{id:'existing-snapshot',page_count:2};},
   readProfileAccountSnapshotPageV2:async(_env,child,id,page)=>{
    assert.equal(child,'child');assert.equal(id,'existing-snapshot');pageReads++;
    return{snapshotId:id,period,asOf:now,completeness:{complete:inventoryAvailable,inventoryAvailable},deviceAccounts:[accounts[page]]};}
  }
 });
 const noSql={DB:{prepare(){throw Error('quota adapter must delegate existing snapshot instead of duplicating SQL');}}};
 const bucketQuery={schemaVersion:2,...query,scope:'all'};
 const bucketRead=await reused.readWebQuotaBuckets(noSql,'child',bucketQuery,undefined,now);
 assert.deepEqual(bucketRead.days[0].bucketsSeconds,{study:1000,composite:0,rest:0});
 assert.equal(bucketRead.days[0].complete,true);assert.equal(snapshotReads,1);assert.equal(pageReads,2);
 const bucketOther=await reused.readWebQuotaBuckets(noSql,'child',{...bucketQuery,scope:'other'},'self',now);
 assert.equal(bucketOther.days[0].bucketsSeconds.study,400);
 inventoryAvailable=false;
 const retained=await reused.readWebQuotaBuckets(noSql,'child',bucketQuery,undefined,now);
 assert.equal(retained.days[0].bucketsSeconds.study,1000,'missing inventory does not erase already published accounts');
 assert.equal(retained.days[0].complete,false,'coverage remains diagnostic rather than invented');
 assert.equal(JSON.stringify(accounts),frozen,'source snapshot is not modified');
 assert.equal(Object.hasOwn(bucketRead,'includedSourceKeys'),false);assert.equal(Object.hasOwn(bucketRead,'revision'),false);
 const bucketApp={...bucketRead,source:'application'};
 const wireFixture={synthetic:true,query:{...bucketQuery,source:'application'},expected:{source:'application',childId:'child',fromDate:date,toDate:date},cases:[]};
 const capture=async(name,response)=>{
  const body=await response.json();wireFixture.cases.push({name,status:response.status,body});return body;
 };
 const bucketAppEnv={...env,RUNTIME_COMPUTER_USAGE:{fetch:async request=>{
  const input=await request.json();assert.equal(input.query.schemaVersion,2);assert.equal(input.accountId,'account');
  return Response.json(bucketApp);
 }}};
 assert.deepEqual(await capture('old-direct',await router.handle(request({...bucketQuery,source:'application'}),bucketAppEnv)),bucketApp);
 assert.equal(proofReads,0,'old clients do not request any source proof');
 let calls=[];
 const sources={local:{...bucketApp,days:bucketApp.days.map(d=>({...d,bucketsSeconds:{study:600,composite:0,rest:0}}))},
  other:{...bucketApp,days:bucketApp.days.map(d=>({...d,bucketsSeconds:{study:400,composite:0,rest:0}}))},otherState:'available'};
 let responseSources=sources,changeAfterRead=false;
 const withSourcesEnv={...env,RUNTIME_COMPUTER_USAGE:{fetch:async req=>{
  calls.push(await req.json());if(changeAfterRead)identity={profileId:'changed',deviceId:'self'};
  return Response.json({snapshot:bucketApp,applicationSources:calls.at(-1).applicationScope?responseSources:null});
 }}};
 const optQuery={...bucketQuery,source:'application',includeSources:true};
 for(const sourceProof of [undefined,{invalid:true},{expired:true}]){
  const body=await capture(sourceProof?.expired?'expired-proof':sourceProof?'invalid-proof':'missing-proof',
   await router.handle(request({...optQuery,...(sourceProof?{sourceProof}:{})}),withSourcesEnv));
  assert.deepEqual(body,{snapshot:bucketApp,applicationSources:null},'missing/bad optional proof preserves aggregate');
  assert.equal(Object.hasOwn(calls.at(-1),'applicationScope'),false);
 }
 verifiedScope={applicationSourceKey:'a'.repeat(64),assignmentVersion:7};
 assert.deepEqual(await capture('trusted-sources',await router.handle(request({...optQuery,sourceProof:{trusted:true}}),withSourcesEnv)),
  {snapshot:bucketApp,applicationSources:sources});
 assert.deepEqual(calls.at(-1),{accountId:'account',childId:'child',query:{...bucketQuery,source:'application'},includeSources:true,
  applicationScope:verifiedScope},'only verified selector is passed internally');
 responseSources={...sources,local:{...sources.local,childId:'foreign'}};
 assert.deepEqual(await capture('foreign-sidecar',await router.handle(request({...optQuery,sourceProof:{trusted:true}}),withSourcesEnv)),
  {snapshot:bucketApp,applicationSources:null},'foreign optional attribution cannot poison valid all snapshot');
 const callsBefore=calls.length;
 assert.equal((await router.handle(request({...optQuery,applicationSourceKey:'caller'}),withSourcesEnv)).status,400);
 assert.equal((await router.handle(request({...bucketQuery,includeSources:true}),withSourcesEnv)).status,400);
 assert.equal(calls.length,callsBefore,'caller cannot inject source identity or enable split for web');
 changeAfterRead=true;
 const rebound=await router.handle(request({...optQuery,sourceProof:{trusted:true}}),withSourcesEnv);
 assert.equal(rebound.status,409);await capture('rebound',rebound);
 if(process.env.EMIT_CLOUD_QUOTA_WIRE==='1'){
  const output=path.join(root,'.tmp','quota-cloud-wire-1.57.json');
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(wireFixture,null,2)+'\n');
  console.log('synthetic HTTP wire fixture:',output);
 }
 console.log('source-statistics cloud PASS: actual V2 projection/correction, domain/own exclusion, decrease, unknown, bounded response, auth/rebind; original accounting untouched');
})().catch(error=>{console.error(error);process.exitCode=1;});

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
 let identity={profileId:'child',deviceId:'self'},rebind=false,peerReads=0;
 const router=load('workers/src/routes/device.ts',{
  '../db/middleware':{json:(body,status=200)=>Response.json(body,{status})},
  '@timeonchrome/app-runtime-contracts/source-statistics':contract,
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
 const frozen=JSON.stringify(accounts);let snapshotReads=0,pageReads=0;
 const reused=load('workers/src/services/sourceStatistics.ts',{
  '@timeonchrome/app-runtime-contracts/source-statistics':contract,
  '../../../extension/core/quota-read-model-v2.js':quotaModel,
  '../../../extension/core/profile-account-v2.js':calendar,
  './profileAccountSnapshotsV2':{
   createOrReuseProfileAccountSnapshotV2:async(_env,child,week)=>{
    assert.equal(child,'child');assert.equal(week,period.weekStart);snapshotReads++;return{id:'existing-snapshot',page_count:2};},
   readProfileAccountSnapshotPageV2:async(_env,child,id,page)=>{
    assert.equal(child,'child');assert.equal(id,'existing-snapshot');pageReads++;
    return{snapshotId:id,period,asOf:now,completeness:{complete:true,inventoryAvailable:true},deviceAccounts:[accounts[page]]};}
  }
 });
 const noSql={DB:{prepare(){throw Error('quota adapter must delegate existing snapshot instead of duplicating SQL');}}};
 const bucketQuery={schemaVersion:2,...query,scope:'all'};
 const bucketRead=await reused.readWebQuotaBuckets(noSql,'child',bucketQuery,undefined,now);
 assert.deepEqual(bucketRead.days[0].bucketsSeconds,{study:1000,composite:0,rest:0});
 assert.equal(bucketRead.days[0].complete,true);assert.equal(snapshotReads,1);assert.equal(pageReads,2);
 const bucketOther=await reused.readWebQuotaBuckets(noSql,'child',{...bucketQuery,scope:'other'},'self',now);
 assert.equal(bucketOther.days[0].bucketsSeconds.study,400);
 assert.equal(JSON.stringify(accounts),frozen,'source snapshot is not modified');
 assert.equal(Object.hasOwn(bucketRead,'includedSourceKeys'),false);assert.equal(Object.hasOwn(bucketRead,'revision'),false);
 const bucketApp={...bucketRead,source:'application'};
 const bucketAppEnv={...env,RUNTIME_COMPUTER_USAGE:{fetch:async request=>{
  const input=await request.json();assert.equal(input.query.schemaVersion,2);assert.equal(input.accountId,'account');
  return Response.json(bucketApp);
 }}};
 assert.deepEqual(await(await router.handle(request({...bucketQuery,source:'application'}),bucketAppEnv)).json(),bucketApp);
 console.log('source-statistics cloud PASS: actual V2 projection/correction, domain/own exclusion, decrease, unknown, bounded response, auth/rebind; original accounting untouched');
})().catch(error=>{console.error(error);process.exitCode=1;});

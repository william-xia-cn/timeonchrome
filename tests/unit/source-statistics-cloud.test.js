'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'../..');
function load(file,deps={}){
 const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};new Function('require','module','exports',code)(name=>deps[name]??{},module,module.exports);return module.exports;
}
(async()=>{
 // 所有当前公开应用入口显式固定身份，不能靠改变底层reader默认值掩盖遗漏。
 let currentEntryCount=0;
 for(const file of ['applicationProductProjections.ts','computerUsageEvidence.ts','computerUsageService.ts','sourceStatistics.ts','v2Routes.ts']){
  const source=ts.createSourceFile(file,fs.readFileSync(path.join(root,'app-runtime-management/backend/src',file),'utf8'),ts.ScriptTarget.Latest,true);
  const visit=node=>{if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&/^readNativeApplicationStatistics(Range)?Seconds$/.test(node.expression.text)){
   currentEntryCount++;const options=node.arguments.at(-1);
   assert(ts.isObjectLiteralExpression(options)&&options.properties.some(p=>ts.isPropertyAssignment(p)&&p.name.getText(source)==='fixedIdentityOnly'&&p.initializer.kind===ts.SyntaxKind.TrueKeyword),file+' must explicitly select current fixed identity statistics');
  }ts.forEachChild(node,visit);};visit(source);
 }
 assert.equal(currentEntryCount,6,'all six production entry boundaries are audited');
 const contract=await import('../../app-runtime-management/contracts/dist/source-statistics.js');
 const date='2026-10-07',now=Date.parse(date+'T12:00:00+08:00');
 const query={schemaVersion:2,source:'web',scope:'other',fromDate:date,toDate:date};
 const all={schemaVersion:2,durationUnit:'seconds',source:'web',childId:'child',fromDate:date,toDate:date,readAtMs:now,
  days:[{date,bucketsSeconds:{study:600,composite:0,rest:0},settledThroughMs:null,complete:true,reasonCodes:[]}]};
 const reader=load('workers/src/services/sourceStatistics.ts',{'@timeonchrome/app-runtime-contracts/source-statistics':contract});
 assert.equal(Object.hasOwn(reader,'readWebSourceStatistics'),false,'retired schema1 reader has no remaining caller/export');
 await assert.rejects(()=>reader.readSourceStatisticsResponse(new Response('x'.repeat(65537))));
 // 实际device入口，身份/范围由既有鉴权解析，重绑期间响应拒绝。
 let identity={profileId:'child',deviceId:'self'},rebind=false,peerReads=0,verifiedScope=null,proofReads=0;
 const router=load('workers/src/routes/device.ts',{
  '../db/middleware':{json:(body,status=200)=>Response.json(body,{status})},
  '@timeonchrome/app-runtime-contracts/source-statistics':contract,
  '../services/sharedWebSourceBinding':{readApplicationSourceForDevice:async(_env,scope,proof)=>{
   proofReads++;assert.deepEqual(scope,{accountId:'account',childId:'child',deviceId:'self',deviceToken:'fixture'});
   return proof?.trusted===true?verifiedScope:null;}},
  '../services/sourceStatistics':{...reader,readWebQuotaBuckets:async()=>{peerReads++;if(rebind)identity={profileId:'changed',deviceId:'self'};return all;}},
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
 const {schemaVersion,...retiredQuery}=query;
 assert.equal((await router.handle(request({...retiredQuery,scope:'all'}),env)).status,400,'schema1 is rejected, not routed to a compatibility reader');
 assert.equal(peerReads,1,'invalid requests do not read domain statistics');
 rebind=true;assert.equal((await router.handle(request(),env)).status,409);
 identity={profileId:'child',deviceId:'self'};rebind=false;
 const app={...all,source:'application'};
 const appEnv={...env,RUNTIME_COMPUTER_USAGE:{fetch:async request=>{
  assert.equal(new URL(request.url).pathname,'/getApplicationSourceStatistics');
  assert.deepEqual(await request.json(),{accountId:'account',childId:'child',query:{...query,source:'application',scope:'all'}});
  return Response.json(app);
 }}};
 assert.deepEqual(await (await router.handle(request({...query,source:'application',scope:'all'}),appEnv)).json(),app);
 assert.equal((await router.handle(request({...query,source:'application',scope:'all'}),{...env,RUNTIME_COMPUTER_USAGE:{fetch:async()=>new Response(null,{status:503})}})).status,503);
 // 实际Guardian Service Binding入口也只接受schema2；归属与有界响应校验仍执行。
 let bindingReads=0;
 const {ComputerUsageService}=load('workers/src/services/computerUsage.ts',{
  'cloudflare:workers':{WorkerEntrypoint:class{constructor(_ctx,env){this.env=env;}}},
  '@timeonchrome/app-runtime-contracts/source-statistics':contract,
  './sourceStatistics':{...reader,readWebQuotaBuckets:async(_env,child,q)=>{bindingReads++;assert.equal(child,'child');assert.equal(q.schemaVersion,2);return all;}}
 });
 const bindingEnv={DB:{prepare(sql){assert.equal(sql,'SELECT id FROM profiles WHERE id=? AND account_id=?');
  return{bind(child,account){return{first:async()=>child==='child'&&account==='account'?{id:'child'}:null};}};}},
  RUNTIME_COMPUTER_USAGE:appEnv.RUNTIME_COMPUTER_USAGE};
 const binding=new ComputerUsageService({},bindingEnv);
 const bindingRequest=(q,accountId='account')=>new Request('https://guardian-capability/readSourceStatistics',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId,childId:'child',query:q})});
 assert.deepEqual(await(await binding.fetch(bindingRequest({...query,scope:'all'}))).json(),all);
 assert.equal((await binding.fetch(bindingRequest({...retiredQuery,scope:'all'}))).status,400);
 assert.equal((await binding.fetch(bindingRequest({...query,scope:'all'},'foreign-account'))).status,404);
 assert.equal((await binding.fetch(bindingRequest(query))).status,400,'internal caller cannot exclude an unverified source');
 assert.equal(bindingReads,1,'invalid/foreign/retired requests do not execute web quota reads');
 assert.deepEqual(await(await binding.fetch(bindingRequest({...query,source:'application',scope:'all'}))).json(),app);
 // 新桶路径复用原账户快照和原配额读取器；不读取新来源head，不另建统计。
 const quotaModel=await import('../../extension/core/quota-read-model-v2.js');
 const calendar=await import('../../extension/core/profile-account-v2.js');
 const period=calendar.getBeijingWeekPeriod(date);
 const accounts=[['self',600],['peer',400]].map(([deviceId,n])=>({deviceId,date,complete:true,
   quotaProjection:{activeSeconds:n,byQuotaBucket:[{quotaBucket:'study',durationSeconds:n}],byDomain:[]}}));
 const frozen=JSON.stringify(accounts);let snapshotReads=0,pageReads=0,inventoryAvailable=true,webFailure=false;
 const reused=load('workers/src/services/sourceStatistics.ts',{
  '@timeonchrome/app-runtime-contracts/source-statistics':contract,
  '../../../extension/core/quota-read-model-v2.js':quotaModel,
  '../../../extension/core/profile-account-v2.js':calendar,
  './profileAccountSnapshotsV2':{
   createOrReuseProfileAccountSnapshotV2:async(_env,child,week)=>{
    if(webFailure)throw Error('private snapshot failure');
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
 accounts[1].quotaProjection.activeSeconds=100;accounts[1].quotaProjection.byQuotaBucket[0].durationSeconds=100;
 const lower=await reused.readWebQuotaBuckets(noSql,'child',bucketQuery,undefined,now);
 assert.equal(lower.days[0].bucketsSeconds.study,700,'published decreases replace the previous value, not add to it');
 assert.deepEqual(await reused.readWebQuotaBuckets(noSql,'child',bucketQuery,undefined,now),lower,'repeated reads do not accumulate');
 accounts[1].quotaProjection.activeSeconds=400;accounts[1].quotaProjection.byQuotaBucket[0].durationSeconds=400;
 inventoryAvailable=false;
 const retained=await reused.readWebQuotaBuckets(noSql,'child',bucketQuery,undefined,now);
 assert.equal(retained.days[0].bucketsSeconds.study,1000,'missing inventory does not erase already published accounts');
 assert.equal(retained.days[0].complete,false,'coverage remains diagnostic rather than invented');
 assert.equal(JSON.stringify(accounts),frozen,'source snapshot is not modified');
 assert.equal(Object.hasOwn(bucketRead,'includedSourceKeys'),false);assert.equal(Object.hasOwn(bucketRead,'revision'),false);
 // 家长现有URL的实际聚合适配：使用现有网页读取器、Runtime桶及唯一现行核算，不读旧贡献。
 const access=await import('../../app-runtime-management/contracts/dist/shared-access.js');
 const policy=access.projectSharedAccessPolicyV2({},52,now);
 policy.dailyMinutes.wednesday={study:60,composite:0,rest:30};policy.weeklyRestMinutes=120;
 inventoryAvailable=true;
 const dates=contract.sourceStatisticsDates(period.weekStart,date);
 const application={schemaVersion:2,durationUnit:'seconds',source:'application',childId:'child',
  fromDate:period.weekStart,toDate:date,readAtMs:now,days:dates.map(d=>({date:d,
   bucketsSeconds:{study:d===date?600:0,composite:0,rest:d===date?100:d===dates[0]?50:0},
   settledThroughMs:now,complete:true,reasonCodes:[]}))};
 let runtimeFailure=false,wrongChild=false,runtimeReads=0;
 const summaryEnv={...noSql,RUNTIME_COMPUTER_USAGE:{fetch:async request=>{
  runtimeReads++;assert.equal(new URL(request.url).pathname,'/getApplicationSourceStatistics');
  assert.deepEqual(await request.json(),{accountId:'account',childId:'child',query:{schemaVersion:2,source:'application',scope:'all',fromDate:period.weekStart,toDate:date}});
  if(runtimeFailure)return Response.json({code:'APPLICATION_SERVICE_UNAVAILABLE'},{status:503});
  return Response.json(wrongChild?{...application,childId:'foreign'}:application);
 }}};
 const management=()=>reused.readQuotaManagementState(summaryEnv,'account','child',date,policy,now);
 const current=await management();
 assert.deepEqual(current.day.usedSeconds,{study:1600,composite:0,rest:100});
 assert.equal(current.day.remainingSeconds.study,2000);assert.equal(current.week.restUsedSeconds,150);
 assert.equal(current.week.restRemainingSeconds,7050);assert.equal(current.complete,true);
 assert.deepEqual(await management(),current,'summary reads replace results without accumulating');
 assert.equal(current.week.fromDate,period.weekStart);assert.equal(current.week.toDate,date);
 accounts[1].quotaProjection.activeSeconds=0;accounts[1].quotaProjection.byQuotaBucket[0].durationSeconds=0;
 assert.equal((await management()).day.usedSeconds.study,1200,'网页600秒＋应用600秒，重复读取不累计');
 accounts[1].quotaProjection.activeSeconds=400;accounts[1].quotaProjection.byQuotaBucket[0].durationSeconds=400;
 accounts[0].quotaProjection.byQuotaBucket.push({quotaBucket:'other',durationSeconds:900});
 assert.deepEqual((await management()).day.usedSeconds,current.day.usedSeconds,'其他时间不扣三类配额');
 accounts[0].quotaProjection.byQuotaBucket.pop();
 policy.dailyMinutes.wednesday.study=61;
 assert.equal((await management()).day.remainingSeconds.study,2060,'同版本配置内容变化直接采用，不复用旧余额');
 policy.dailyMinutes.wednesday.study=60;
 const priorStage=policy.stage;policy.stage=priorStage==='shadow'?'legacy':'shadow';
 assert.equal((await management()).stage,policy.stage,'采用当前阶段，不保留旧混合清单状态');
 policy.stage=priorStage;
 // 网页rest桶已经包括原侧借用；复合超出额度不允许在管理摘要再次转入rest。
 accounts[0].quotaProjection={activeSeconds:600,byQuotaBucket:[{quotaBucket:'composite',durationSeconds:100},{quotaBucket:'rest',durationSeconds:500}],byDomain:[]};
 const borrowed=await management();
 assert.deepEqual(borrowed.day.usedSeconds,{study:1000,composite:100,rest:600});
 assert.equal(borrowed.week.restUsedSeconds,650,'weekly rest only sums already-final buckets, never borrows again');
 application.days.at(-1).bucketsSeconds.study=100;
 assert.equal((await management()).day.usedSeconds.study,500,'a lower current application result is accepted');
 const applicationBefore=JSON.stringify(application),webBefore=JSON.stringify(accounts);
 runtimeFailure=true;
 const missingApp=await management();
 assert.deepEqual(missingApp.day.usedSeconds,{study:400,composite:100,rest:500});
 assert.equal(missingApp.application.available,false);assert.equal(missingApp.web.available,true);
 assert.equal(missingApp.complete,false);assert(missingApp.reasonCodes.includes('APPLICATION_SOURCE_UNAVAILABLE'));
 runtimeFailure=false;wrongChild=true;
 const foreign=await management();
 assert.equal(foreign.application.available,false,'foreign child snapshot never enters the calculator');
 assert.equal(foreign.day.usedSeconds.rest,500,'valid web result remains usable after application rejection');
 wrongChild=false;webFailure=true;
 const missingWeb=await management();
 assert.deepEqual(missingWeb.day.usedSeconds,{study:100,composite:0,rest:100});
 assert.equal(missingWeb.web.available,false);assert.equal(missingWeb.complete,false);
 assert(!JSON.stringify(missingWeb).includes('private snapshot failure'));
 runtimeFailure=true;
 const neither=await management();assert.deepEqual(neither.day.usedSeconds,{study:0,composite:0,rest:0});
 assert.equal(neither.complete,false);assert.equal(neither.web.available,false);assert.equal(neither.application.available,false);
 const readsBefore=runtimeReads;
 await assert.rejects(()=>reused.readQuotaManagementState(summaryEnv,'account','child','2026-02-30',policy,now),/INVALID_DATE/);
 assert.equal(runtimeReads,readsBefore,'invalid date is rejected before any runtime request');
 assert.equal(JSON.stringify(application),applicationBefore);assert.equal(JSON.stringify(accounts),webBefore,'summary does not alter either source');
 webFailure=false;runtimeFailure=false;
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
 console.log('source-statistics cloud PASS: schema2-only device and Service Binding, retired schema1 rejection, existing bucket snapshot reuse, own exclusion, partial retention, optional proof and rebind; accounting unchanged');
})().catch(error=>{console.error(error);process.exitCode=1;});

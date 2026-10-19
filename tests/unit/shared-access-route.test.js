'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'../..');
function load(file,deps){
 const module={exports:{}},code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(id=>deps[id]||{},module,module.exports);return module.exports;
}
(async()=>{
 const access=await import('../../app-runtime-management/contracts/dist/shared-access.js');
 const quota=load('extension/core/quota-config.js',{}),downtime=load('pages/downtime-config.js',{});
 let version=7,configReads=0,bucketReads=0,change=false,failure=false;
 const config={timeQuota:{daily:{friday:{studyMinutes:20,restMinutes:40,compositeMinutes:30}}}};
 const env={JWT_SECRET:'unused',DB:{prepare(sql){return{bind(child,account){return{async first(){
  if(child!=='child-a'||account!=='account-a')return null;
  if(sql.includes('SELECT id FROM profiles'))return{id:child};
  if(sql.includes('SELECT config, version, updated_at')){configReads++;return{config:JSON.stringify(config),version,updated_at:123};}
  throw Error('unexpected query');
 }}}}}}};
 const {profilesRouter}=load('workers/src/routes/profiles.ts',{
  '../db/middleware':{json:(data,status=200)=>Response.json(data,{status}),verifyAccountToken:async req=>
   req.headers.get('Authorization')==='Bearer parent'?'account-a':null},
  '../../../extension/core/quota-config.js':quota,'../../../pages/downtime-config.js':downtime,
  '@timeonchrome/app-runtime-contracts/shared-access':access,
  '../services/sourceStatistics':{readQuotaManagementState:async(_env,account,child,date,policy)=>{
   assert.equal(account,'account-a');assert.equal(child,'child-a');assert.equal(policy.schemaVersion,2);
   bucketReads++;if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('INVALID_DATE');
   if(failure)throw Error('private credentials must not leak');if(change)version++;
   return{schemaVersion:2,durationUnit:'seconds',date,policyRevision:policy.revision,stage:policy.stage,
    complete:false,day:{usedSeconds:{study:600,composite:0,rest:0}},reasonCodes:['APPLICATION_SOURCE_UNAVAILABLE']};
  }},
 });
 const req=(child='child-a',date='2026-10-02',auth=true)=>new Request(
  'https://fixture/profiles/'+child+'/shared-access-state/v1?date='+date,
  {headers:auth?{Authorization:'Bearer parent'}:{}});
 assert.equal((await profilesRouter.handle(req('child-a',undefined,false),env)).status,401);
 assert.equal((await profilesRouter.handle(req('other'),env)).status,404);
 assert.equal(configReads,0);assert.equal(bucketReads,0,'unauthorized scopes never reach current bucket readers');
 const result=await profilesRouter.handle(req(),env);
 assert.equal(result.status,200);assert.equal(result.headers.get('Cache-Control'),'no-store');
 assert.deepEqual(await result.json(),{profileId:'child-a',schemaVersion:2,durationUnit:'seconds',
  date:'2026-10-02',policyRevision:'profile-config:7',stage:'legacy',complete:false,
  day:{usedSeconds:{study:600,composite:0,rest:0}},reasonCodes:['APPLICATION_SOURCE_UNAVAILABLE']});
 assert.equal(configReads,2,'current policy is checked before and after source reads');
 change=true;assert.equal((await profilesRouter.handle(req(),env)).status,409);change=false;
 assert.equal((await profilesRouter.handle(req('child-a','invalid'),env)).status,400);
 failure=true;const failed=await profilesRouter.handle(req(),env);
 assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{code:'SHARED_ACCESS_STATE_UNAVAILABLE'});
 console.log('shared access route PASS: existing authenticated URL delegates current buckets/V2 policy; ownership, phase, changes and private failure isolated');
})().catch(error=>{console.error(error);process.exitCode=1;});

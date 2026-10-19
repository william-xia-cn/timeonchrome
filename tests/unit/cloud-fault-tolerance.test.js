'use strict';
// 隔离执行真实入口；不请求生产、不使用真实身份或账本。
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'../..');
const source=file=>fs.readFileSync(path.join(root,file),'utf8');
const view=require('../../pages/computer-usage-view.js');
const {requestJson}=require('../../app-runtime-management/console/app-runtime-network.js');
function compile(text,extra={}){
  const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {module,exports:module.exports,TextDecoder,Uint8Array,Response,console,Date,...extra});
  return module.exports;
}
const sample={schemaVersion:2,durationUnit:'seconds',revision:'computer-v2:fixture',fromDate:'2026-10-17',toDate:'2026-10-17',
  complete:false,sourceStatus:{web:'complete',application:'partial'},sourceVersions:{web:'w1',application:'a1'},
  totals:{computer:1200,web:600,application:700,specialIncluded:null},categories:{study:1200},
  sourceCategories:{web:{study:600},application:{study:600}},reasonCodes:['APPLICATION_STATISTICS_CHUNKS_MISSING']};
function host(){return {innerHTML:'',classList:{add(){}},addEventListener(){}};}
test('same-scope refresh retains known subtotal; scope switch and auth failure never retain old view',async()=>{
  let scope='child-a|day',failure=null;
  const target=host(),reader=view.create(target,async()=>{if(failure)throw failure;return sample;},null,()=>scope);
  await reader.load();assert.match(target.innerHTML,/电脑已知小计/);assert.match(target.innerHTML,/20分/);
  failure=Object.assign(new Error('upstream failure'),{status:503,code:'APPLICATION_STATISTICS_CHUNKS_MISSING'});
  await reader.load({refresh:true});assert.match(target.innerHTML,/保留本范围上次有效统计/);assert.match(target.innerHTML,/20分/);
  scope='child-b|day';await reader.load();assert.doesNotMatch(target.innerHTML,/20分|保留本范围/);
  failure=null;await reader.load();failure={status:401};await reader.load({refresh:true});
  assert.doesNotMatch(target.innerHTML,/20分|保留本范围/);
});
test('independent application partial reading displays known amount and clears it on authorization failure',async()=>{
  let failure=null;
  const target=host(),reader=view.createIndependent(target,async()=>{if(failure)throw failure;
    return {source:'application',durationUnit:'seconds',complete:false,totalDuration:null,availableTotalDuration:600,
      fromDate:'2026-10-17',toDate:'2026-10-17',categories:[],applications:[],buckets:[]};});
  await reader.load();assert.match(target.innerHTML,/应用使用已知小计/);assert.match(target.innerHTML,/10分/);
  failure={status:503};await reader.load(true);assert.match(target.innerHTML,/上次有效统计/);
  failure={status:403};await reader.load(true);assert.doesNotMatch(target.innerHTML,/10分|上次有效统计/);
});
test('one failed machine user list leaves all machines and valid users; security errors still reject',async()=>{
  const code=source('app-runtime-management/console/app-runtime.js').match(/async function loadMachineState\(\) \{[\s\S]*?\n  \}/)[0];
  const state={};let denied=false;
  const runtime=async url=>{if(url==='/v2/module/machines')return {machines:[{id:'good'},{id:'bad'}]};
    if(url.includes('/bad/'))throw Object.assign(new Error('unavailable'),{status:denied?401:503,code:denied?'AUTH_RECOVERY_FAILED':'MACHINE_USERS_UNAVAILABLE'});
    return {users:[{localUserId:'test-user'}]};};
  const load=new Function('state','runtime',code+';return loadMachineState;')(state,runtime);
  await load();assert.equal(state.machines.length,2);assert.equal(state.users.get('good').length,1);
  assert.equal(state.machineUserErrors.get('bad'),'MACHINE_USERS_UNAVAILABLE');
  denied=true;await assert.rejects(load(),{status:401});
});
test('actual saved config survives supplemental annotation failure; core write failure remains an error',async()=>{
  const warnings=[];
  const {mutateProfileConfig}=compile(source('workers/src/services/profileConfigMutation.ts'),{console:{warn:code=>warnings.push(code)}});
  let config='{}',version=1,writes=0,failCore=false;
  const env={DB:{prepare(sql){return {bind(...args){return {
    first:async()=>({config,version,updated_at:0}),
    run:async()=>{if(sql.includes('UPDATE profiles SET')){if(failCore)throw Error('core failure');config=args[0];version=args[1];writes++;return {meta:{changes:1}};}
      throw Error('annotation unavailable');}
  };}};}}};
  const options={profileId:'test-child',sourceAction:'test'};
  const result=await mutateProfileConfig(env,options,value=>{value.mode='study';});
  assert.equal(result.version,2);assert.equal(result.changed,true);assert.deepEqual(warnings,['PROFILE_CONFIG_HISTORY_ANNOTATION_FAILED']);
  assert.equal((await mutateProfileConfig(env,options,value=>{value.mode='study';})).changed,false);assert.equal(writes,1);
  failCore=true;await assert.rejects(mutateProfileConfig(env,options,value=>{value.mode='rest';}),/core failure/);
});
test('Runtime network retains stable code/status, not unsafe codes; no extra retry on 503',async()=>{
  for(const code of ['APPLICATION_STATISTICS_CHUNKS_MISSING','<unsafe>']){
    let calls=0;
    await assert.rejects(requestJson({url:'https://fixture.invalid/read',getToken:async()=> 'isolated',
      fetchImpl:async()=>{calls++;return {ok:false,status:503,json:async()=>({error:{code,message:'读取失败'}})};}}),
      error=>error.status===503&&error.code===(code==='<unsafe>'?null:code)&&error.message==='读取失败');
    assert.equal(calls,1);
  }
});
test('Guardian forwarding keeps safe error codes and bounded responses, never forwards internal authentication',async()=>{
  const code=source('workers/src/services/sourceStatistics.ts').split('export async function readSourceStatisticsResponse')[1];
  const {readSourceStatisticsResponse:read}=compile('export async function readSourceStatisticsResponse'+code);
  await assert.rejects(read(Response.json({error:{code:'APPLICATION_STATISTICS_CHUNKS_MISSING'}},{status:503})),
    error=>error.code==='APPLICATION_STATISTICS_CHUNKS_MISSING'&&error.status===503);
  await assert.rejects(read(Response.json({code:'PRIVATE_TOKEN_DETAIL'},{status:401})),
    error=>error.code==='SOURCE_STATISTICS_UNAVAILABLE'&&error.status===503);
  await assert.rejects(read(new Response('x'.repeat(65537))),/SOURCE_STATISTICS_RESPONSE_LIMIT/);
});
test('main console retains nested API errors',async()=>{
  const code=source('pages/index.html').split("async function api(path, method='GET', body=null, conditionalHeaders=null) {")[1].split('\nfunction applyProfileConfigResponse')[0];
  const api=new Function('fetch','Headers','accountToken','API_BASE','refreshAccountTokenForPage',
    "return async function api(path, method='GET', body=null, conditionalHeaders=null) {"+code)(
      async()=>Response.json({error:{code:'APPLICATION_STATISTICS_CHUNKS_MISSING',message:'读取失败'}},{status:503}),Headers,null,'https://fixture.invalid',async()=>false);
  await assert.rejects(api('/test'),error=>error.status===503&&error.code==='APPLICATION_STATISTICS_CHUNKS_MISSING'&&error.message==='读取失败');
});

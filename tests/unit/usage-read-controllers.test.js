'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),vm=require('node:vm');
const View=require('../../pages/computer-usage-view');
const Time=require('../../app-runtime-management/console/app-runtime-time');
const samples=require('../fixtures/usage-view-samples');
const root=require('node:path').resolve(__dirname,'../..');
const main=fs.readFileSync(root+'/pages/index.html','utf8');
const runtime=fs.readFileSync(root+'/app-runtime-management/console/app-runtime.js','utf8');
const date='2026-10-21',start=Date.parse(date+'T00:00:00+08:00');
function pending(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject};}
function bundle(childId='child-a',from=date,to=date,total=10423){
  const app=structuredClone(samples.application);
  Object.assign(app,{childId,fromDate:from,toDate:to,totalDuration:total,availableTotalDuration:total,revision:'application-'+total});
  app.statistics={settledThroughByDate:[{date:from,settledThroughMs:start+total*1000}]};
  app.days=[{date:from,complete:true,settledThroughMs:start+total*1000}];
  return {...structuredClone(samples.computer),fromDate:from,toDate:to,applicationSnapshot:app,
    sourceVersions:{application:app.revision},totals:{application:total},complete:true};
}
function mainFixture(){
  const requests=[],context={ComputerUsageView:View,URLSearchParams,Date,Error,currentProfileId:'child-a',
    selectedRange:{from:date,to:date},cloudUsageRange(){return context.selectedRange;},
    api(url){const p=pending();requests.push({url,...p});return p.promise;}};
  vm.createContext(context);
  vm.runInContext(main.slice(main.indexOf('const cloudUsageSession='),main.indexOf('const cloudComputerReader=')),context);
  return{context,requests,read:options=>context.readCloudUsageBatch(options)};
}
function runtimeFixture(){
  const requests=[],paints=[],filters={'#machine-filter':'','#user-filter':'','#platform-filter':''};
  const context={ComputerUsageView:View,URLSearchParams,Date,Error,
    state:{usageKind:'application',childId:'child-a'},selectedRange:{from:start,to:start+86400000},
    range(){return context.selectedRange;},embedded:true,assertLive(){},
    config:{request(url){const p=pending();requests.push({url,...p});return p.promise;}},
    usageRequestVersion:0,mock:false,computerReader:{invalidate(){},async load(){}},independentReader:{invalidate(){},async load(){}},
    $:selector=>({value:filters[selector]||''}),renderUsage:()=>paints.push(context.state.usage),
    AppRuntimeTime:Time,AppRuntimeNetwork:{friendlyError:error=>error},showError(){throw Error('stale auth must not redirect');}};
  vm.createContext(context);
  vm.runInContext(runtime.slice(runtime.indexOf('  const applicationReadCache='),runtime.indexOf('  const computerReader='))+
    runtime.slice(runtime.indexOf('  async function runtime('),runtime.indexOf('\n',runtime.indexOf('  async function runtime(')))+
    runtime.slice(runtime.indexOf('  async function loadUsage('),runtime.indexOf('  function renderAll()')),context);
  return{context,requests,filters,paints,read:options=>context.readUsageBatch(options),load:options=>context.loadUsage(options)};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for(const [name,fixture]of [['main',mainFixture],['Runtime',runtimeFixture]]){
  test(name+': actual controller shares totals/cutoff, refreshes once and rejects changed scope',async()=>{
    const f=fixture(),a=f.read({application:true}),b=f.read();await tick();assert.equal(f.requests.length,1);
    f.requests[0].resolve(bundle());const [app,computer]=await Promise.all([a,b]);
    assert.equal(app.value.totalDuration,computer.value.totals.application);
    assert.equal(JSON.stringify(app.value.statistics),JSON.stringify(computer.value.applicationSnapshot.statistics));
    const refresh=f.read({refresh:true});await tick();f.requests[1].resolve(bundle('child-a',date,date,10913));await refresh;
    assert.equal((await f.read({application:true})).value.totalDuration,10913);assert.equal(f.requests.length,2);
    const old=f.read({refresh:true});await tick();
    if(name==='main')f.context.currentProfileId='child-b';else f.context.state.childId='child-b';
    f.requests[2].resolve(bundle());await assert.rejects(old,error=>name==='main'?error.message==='SELECTION_CHANGED':error.code==='COMPONENT_CONTEXT_CHANGED');
    const next=f.read();await tick();assert.match(f.requests[3].url,/child-b/);f.requests[3].resolve(bundle('child-b'));await next;
    assert(f.requests.every(r=>r.url.includes('durationUnit=seconds')));
  });
}
test('Runtime loadUsage keeps filters independent, rejects late scope results, retains same-range failure and corrections',async()=>{
  const f=runtimeFixture(),initial=f.load();await tick();f.requests[0].resolve(bundle());await initial;
  assert.equal(f.context.state.usage.totalDurationSeconds,10423);
  f.filters['#machine-filter']='machine-one';const filtered=f.load();await tick();
  assert.equal(f.context.state.usage,null);assert.match(f.requests[1].url,/program-instance-usage.*machineId=machine-one/);
  f.requests[1].resolve(bundle('child-a',date,date,123).applicationSnapshot);await filtered;
  assert.equal(f.context.state.usage.totalDurationSeconds,123);
  f.filters['#machine-filter']='';await f.load();assert.equal(f.context.state.usage.totalDurationSeconds,10423);assert.equal(f.requests.length,2);
  const failure=f.load({refresh:true});await tick();f.requests[2].reject(Error('offline'));await failure;
  assert.equal(f.context.state.usage.totalDurationSeconds,10423);assert.match(f.context.state.usageError,/offline/);
  const late=f.load({refresh:true});await tick();f.context.state.childId='child-b';const newChild=f.load();await tick();
  f.requests[4].resolve(bundle('child-b',date,date,88));await newChild;
  f.requests[3].resolve(bundle('child-a',date,date,999));await late;
  assert.equal(f.context.state.usage.totalDurationSeconds,88);assert(!f.paints.some(p=>p?.totalDurationSeconds===999));
  f.context.selectedRange={from:start-86400000,to:start};const previous=f.load();await tick();assert.equal(f.context.state.usage,null);
  f.requests[5].resolve(bundle('child-b','2026-10-20','2026-10-20',0));await previous;
  assert.equal(f.context.state.usage.totalDurationSeconds,0);
  const abandoned=f.load({refresh:true});await tick();f.context.state.usageKind='web';await f.load();
  f.requests[6].reject(Object.assign(Error('expired'),{code:'AUTH_RECOVERY_FAILED'}));await abandoned;
  assert.equal(f.context.state.usageError,null);
});

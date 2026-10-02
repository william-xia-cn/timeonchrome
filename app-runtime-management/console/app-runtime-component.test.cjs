const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Policy=require('./app-runtime-policy');
const Devices=require('./app-runtime-devices');
const source=fs.readFileSync(__dirname+'/app-runtime.js','utf8');
const css=fs.readFileSync(__dirname+'/app-runtime.css','utf8');
assert.match(css,/#ledger-list \.table-row>strong,#media-list \.table-row>strong\{display:block;grid-column:1\/-1;overflow-wrap:anywhere\}/);
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function fixture(){
  const elements=new Map(),listeners=[],queries=[];
  const element=selector=>{if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',value:'',hidden:false,dataset:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},addEventListener(type,handler){listeners.push([selector,type,handler]);},removeEventListener(type,handler){const index=listeners.findIndex(item=>item[0]===selector&&item[1]===type&&item[2]===handler);if(index>=0)listeners.splice(index,1);}});return elements.get(selector);};
  const document={currentScript:{dataset:{runtimeComponent:'true'}},querySelector(){throw Error('Global DOM query forbidden');},querySelectorAll(){throw Error('Global DOM query forbidden');}};
  const root={ownerDocument:document,querySelector(selector){queries.push(selector);return element(selector);},querySelectorAll(){return[];},addEventListener(type,handler){listeners.push(['root',type,handler]);},removeEventListener(type,handler){const index=listeners.findIndex(item=>item[0]==='root'&&item[1]===type&&item[2]===handler);if(index>=0)listeners.splice(index,1);}};
  let knowledgeDisposed=0;
  const context={document,window:{},location:{search:'',protocol:'https:',hostname:'fixture.test'},URL,URLSearchParams,Date,Map,Set,Blob,
    setTimeout,clearTimeout,setInterval,clearInterval,
    AppRuntimeSession:{createRecovery(){throw Error('Embedded code must not create a second session');}},
    AppRuntimePolicy:Policy,AppRuntimeDevices:Devices,AppRuntimeTime:{beijingRange:()=>({from:0,to:86400000,label:'fixture'})},
    AppRuntimeNetwork:{friendlyError:error=>error,catalogClassificationRecords:async()=>({pending:[],processed:[],technical:[]})},
    ComputerUsageView:{createReadCache:()=>({clear(){}}),create:()=>({invalidate(){}}),createIndependent:()=>({invalidate(){}})},
    AppRuntimeKnowledge:{mount(options){assert.equal(options.root,root);return{dispose(){knowledgeDisposed++;}};}}};
  vm.runInNewContext(source,context,{filename:'app-runtime.js'});
  return{mount:context.AppRuntimeManagement.mount,root,element,elements,listeners,queries,get knowledgeDisposed(){return knowledgeDisposed;}};
}
(async()=>{
  const good=fixture(),calls=[];
  const controller=good.mount({root:good.root,view:'devices',children:[{id:'child-a',name:'测试孩子'}],childId:'child-a',request:async path=>{calls.push(path);return path==='/v2/module/machines'?{machines:[{id:'machine-fixture',displayName:'测试电脑',platform:'windows',policyState:'applied',status:'online'}]}:{users:[]};}});
  await controller.ready;
  assert.deepEqual(calls,['/v2/module/machines','/v2/module/machines/machine-fixture/users']);
  assert.match(good.element('#machines').innerHTML,/测试电脑/);assert.match(good.element('#child-select').innerHTML,/测试孩子/);
  assert.equal(good.element('#load-empty-state').hidden,true);
  assert(!good.listeners.some(item=>item[0]==='#runtime-logout'),'main console owns logout');
  controller.dispose();controller.dispose();assert.equal(good.listeners.length,0);assert.equal(good.knowledgeDisposed,1);
  await assert.rejects(async()=>controller.refresh(),{code:'COMPONENT_CONTEXT_CHANGED'});

  const stale=fixture(),pending=deferred();let current=true;
  const old=stale.mount({root:stale.root,view:'devices',children:[{id:'child-a',name:'A'}],childId:'child-a',isCurrent:()=>current,request:()=>pending.promise});
  await new Promise(resolve=>setImmediate(resolve));current=false;pending.resolve({machines:[{id:'old',displayName:'旧电脑'}]});await old.ready;
  assert.equal(stale.element('#machines').innerHTML,'');assert.equal(stale.element('#load-empty-message').textContent,'');old.dispose();

  const failed=fixture(),bad=failed.mount({root:failed.root,view:'devices',children:[{id:'child-a',name:'A'}],childId:'child-a',request:async()=>{throw Error('设备接口暂不可用');}});
  await bad.ready;assert.equal(failed.element('#load-empty-state').hidden,false);assert.match(failed.element('#load-empty-message').textContent,/设备接口暂不可用/);bad.dispose();
  const apps=fixture(),requests=[];
  const appsController=apps.mount({root:apps.root,view:'apps',children:[{id:'a',name:'A'}],childId:'a',request:()=>{const next=deferred();requests.push(next);return next.promise;}});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(requests.length,3);appsController.dispose();
  requests[2].reject(Error('old shared policy failed'));
  await new Promise(resolve=>setImmediate(resolve));
  requests[0].reject(Error('old policy failed'));requests[1].reject(Error('old catalog failed'));await appsController.ready;
  assert.equal(apps.element('#load-empty-message').textContent,'');
  const invalid=fixture();assert.throws(()=>invalid.mount({root:invalid.root,view:'usage',request:async()=>{}}),/INVALID_RUNTIME_MANAGEMENT_VIEW/);
  const system=fixture(),systemCalls=[];
  const systemController=system.mount({root:system.root,view:'system',children:[{id:'a',name:'A'}],childId:'a',request:async path=>{
    systemCalls.push(path);
    if(path==='/v2/module/machines')return{machines:[{id:'machine-a',platform:'windows',status:'online'}]};
    if(path.includes('/users'))return{users:[]};
    if(path.includes('app-catalog'))throw Error('catalog unavailable');
    if(path.includes('logging-policy'))throw Error('logging unavailable');
    if(path.includes('runtime-logs'))return{items:[],nextCursor:null};
    if(path.includes('segment-diagnostics'))return{items:[{startAtMs:1,durationMs:60000,displayName:'测试应用',applicationClassification:'study',mediaKind:'video',presentation:'foreground'}],hasMore:false};
    throw Error('Unexpected system dependency '+path);
  }});
  await systemController.ready;
  assert.equal(system.element('#load-empty-state').hidden,true);
  assert.match(system.element('#technical-record-list').textContent,/暂不可用/);
  assert.match(system.element('#remote-log-detail').textContent,/暂不可用/);
  assert.equal(system.element('#enable-remote-logging').disabled,true);
  assert.match(system.element('#runtime-log-list').innerHTML,/暂无系统日志/);
  assert(!systemCalls.some(path=>/app-policy|app-usage|shared-access/.test(path)));
  assert(systemCalls.some(path=>path.includes('runtime-logs?childId=a')));
  const click=system.listeners.find(item=>item[0]==='root'&&item[1]==='click')[2];
  for(const kind of ['usage','media']){
    const button={id:'',classList:{contains:()=>false},dataset:{loadLedger:kind}};
    await click({target:{closest:selector=>selector==='button'?button:null}});
    assert(systemCalls.some(path=>path.includes(`segment-diagnostics?kind=${kind}&childId=a`)));
    assert.match(system.element(kind==='usage'?'#ledger-list':'#media-list').innerHTML,/测试应用/);
  }
  assert(!systemCalls.some(path=>/\/usage-segments|\/media-segments/.test(path)));
  systemController.dispose();assert.equal(system.listeners.length,0);
  const lateSystem=fixture(),lateLogging=deferred();
  const lateController=lateSystem.mount({root:lateSystem.root,view:'system',children:[{id:'a',name:'A'}],childId:'a',request:async path=>{
    if(path==='/v2/module/machines')return{machines:[{id:'m'}]};
    if(path.includes('/users'))return{users:[]};
    if(path.includes('app-catalog'))return{items:[],technicalItems:[]};
    if(path.includes('logging-policy')||path.includes('runtime-logs'))return lateLogging.promise;
    throw Error('Unexpected late dependency '+path);
  }});
  await new Promise(resolve=>setImmediate(resolve));
  const oldLogDetail=lateSystem.element('#remote-log-detail').textContent;lateController.dispose();
  lateLogging.reject(Error('old system request failed'));await lateController.ready;
  assert.equal(lateSystem.element('#remote-log-detail').textContent,oldLogDetail);
  assert.equal(lateSystem.element('#load-empty-message').textContent,'');
  assert.equal(lateSystem.listeners.length,0);
  assert.throws(()=>invalid.mount({root:invalid.root,view:'devices',children:[{id:'a'}],childId:'b',request:async()=>{}}),/INVALID_RUNTIME_CHILD_CONTEXT/);
  console.log('PASS: embedded canonical controller, injected transport/Child, no second login, isolated errors, late disposal and listener release');
})().catch(error=>{console.error(error);process.exitCode=1;});

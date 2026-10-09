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
  const element=selector=>{if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',value:'',hidden:false,dataset:{},classList:{add(){},remove(){},toggle(){}},querySelector(nested){return element(selector+' '+nested);},setAttribute(){},addEventListener(type,handler){listeners.push([selector,type,handler]);},removeEventListener(type,handler){const index=listeners.findIndex(item=>item[0]===selector&&item[1]===type&&item[2]===handler);if(index>=0)listeners.splice(index,1);}});return elements.get(selector);};
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
  // 执行实际读取函数，不复制其请求代际判断；只替换网络和绘制边界。
  const usageFunction=source.slice(source.indexOf('  async function loadUsage('),source.indexOf('  function renderAll()'));
  assert(usageFunction.includes('program-instance-usage'));
  const usageState={usageKind:'application',childId:'child-a'},usageRequests=[],paints=[];
  let usageRange={from:1,to:2};
  const usageContext={state:usageState,usageRequestVersion:0,mock:false,URLSearchParams,
    computerReader:{invalidate(){},async load(){}},independentReader:{invalidate(){},async load(){}},
    range:()=>usageRange,$:()=>({value:''}),renderUsage:()=>paints.push(usageState.usage),
    applicationReadCache:{async read(key,read){return{value:await read()};}},
    runtime:path=>{const pending=deferred();usageRequests.push({path,...pending});return pending.promise;},
    AppRuntimeTime:{applicationIdentityView:value=>value},AppRuntimeNetwork:{friendlyError:error=>error},
    showError(){throw Error('A stale authentication error must not reopen login');}};
  vm.createContext(usageContext);vm.runInContext(usageFunction,usageContext);
  const firstUsage=usageContext.loadUsage();
  usageState.childId='child-b';usageRange={from:3,to:10};
  const secondUsage=usageContext.loadUsage();
  assert.match(usageRequests[0].path,/childId=child-a&fromMs=1&toMs=2&view=display/);
  assert.match(usageRequests[1].path,/childId=child-b&fromMs=3&toMs=10&view=display/);
  const latest={totalDuration:60,childId:'child-b'};
  usageRequests[1].resolve(latest);await secondUsage;
  usageRequests[0].resolve({totalDuration:999,childId:'child-a'});await firstUsage;
  assert.equal(usageState.usage,latest,'old child/day response cannot replace the new selection');
  assert(!paints.some(value=>value?.totalDuration===999));
  const abandonedUsage=usageContext.loadUsage();
  usageState.usageKind='web';await usageContext.loadUsage();
  usageRequests[2].reject(Object.assign(Error('expired old request'),{code:'AUTH_RECOVERY_FAILED'}));
  await abandonedUsage;
  assert.equal(usageState.usageError,null,'old application errors cannot cover the web tab');
  usageState.usageKind='application';
  const failedRefresh=usageContext.loadUsage({refresh:true});
  assert.equal(usageState.usage,latest,'same-scope refresh keeps valid statistics while loading');
  usageRequests[3].reject(Error('temporary offline'));await failedRefresh;
  assert.equal(usageState.usage,latest,'same-scope failure must retain valid statistics');
  assert.match(usageState.usageError,/temporary offline/);
  usageRange={from:20,to:21};
  const differentDay=usageContext.loadUsage();
  assert.equal(usageState.usage,null,'another date must not retain previous statistics');
  usageRequests[4].reject(Error('unavailable new day'));await differentDay;
  assert.equal(usageState.usage,null);

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
  const isolated=fixture();let catalogFails=true;
  const isolatedController=isolated.mount({root:isolated.root,view:'apps',children:[{id:'a',name:'A'}],childId:'a',request:async path=>{
    if(path.includes('app-policy'))return Policy.defaultPolicy();
    if(path.includes('app-catalog')){if(catalogFails)throw Object.assign(new Error('private detail'),{code:'APPLICATION_KNOWLEDGE_READER_NOT_ADAPTED'});return{items:[],technicalItems:[],inventoryCoverage:[]};}
    if(path.includes('shared-access'))return{policy:null};
    throw Error('Unexpected request '+path);
  }});
  await isolatedController.ready;
  assert.equal(isolated.element('#load-empty-state').hidden,true,'old directory failure must not hide instance entry');
  assert.equal(isolated.element('#open-products').disabled,true);
  assert.equal(isolated.element('#open-rules').disabled,true);
  assert.notEqual(isolated.element('#open-instances').disabled,true);
  assert.match(isolated.element('#managed-app-list').innerHTML,/APPLICATION_KNOWLEDGE_READER_NOT_ADAPTED/);
  assert.equal(isolated.element('#ordinary-app-count').textContent,'未知');
  catalogFails=false;await isolatedController.refresh();
  assert.equal(isolated.element('#open-products').disabled,false);
  assert.doesNotMatch(isolated.element('#managed-app-list').innerHTML,/READER_NOT_ADAPTED/);
  isolated.element('#managed-app-list').innerHTML='<button>stale classify</button>';
  catalogFails=true;await isolatedController.refresh();
  assert.doesNotMatch(isolated.element('#managed-app-list').innerHTML,/stale classify/);
  assert.equal(isolated.element('#load-empty-state').hidden,true);
  isolatedController.dispose();
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
  async function importFixture() {
    const view=fixture(),writes=[];let version=3,writeGate=null;
    const controller=view.mount({root:view.root,view:'apps',children:[{id:'a',name:'A'}],childId:'a',request:async(path,options={})=>{
      if(path.includes('app-policy')) {
        if(options.method==='PUT') { writes.push(options); if(writeGate)await writeGate.promise;version++; }
        return {...Policy.defaultPolicy(),version};
      }
      if(path.includes('app-catalog'))return{items:[],technicalItems:[],inventoryCoverage:[]};
      if(path.includes('shared-access'))throw Error('Independent application import must not require shared policy');
      throw Error('Unexpected import dependency '+path);
    }});
    await controller.ready;
    assert.equal(view.element('#load-empty-state').hidden,true,view.element('#load-empty-message').textContent);
    const change=view.listeners.find(item=>item[0]==='root'&&item[1]==='change')[2];
    const click=view.listeners.find(item=>item[0]==='root'&&item[1]==='click')[2];
    return {view,writes,controller,bump(){version++;},block(){writeGate=deferred();return writeGate;},
      review:file=>change({target:{id:'import-config',files:[file],dataset:{}}}),
      confirm:()=>click({target:{closest:selector=>selector==='button'?{id:'confirm-import',dataset:{},classList:{contains:()=>false}}:null}})};
  }
  const file=()=>({text:async()=>JSON.stringify(Policy.exportPayload(Policy.defaultPolicy()))});
  const configuration=fixture(),configurationCalls=[];
  const configurationController=configuration.mount({root:configuration.root,view:'configuration',children:[{id:'a',name:'A'}],childId:'a',request:async path=>{
    configurationCalls.push(path);
    if(path.includes('/app-policy?childId=a'))return {...Policy.defaultPolicy(),version:3};
    throw Error('Configuration view must not query '+path);
  }});
  await configurationController.ready;
  assert.equal(configuration.element('#load-empty-state').hidden,true,configuration.element('#load-empty-message').textContent);
  assert.equal(configurationCalls.length,1);
  assert.equal(configuration.element('[data-view-panel="access"] .tabbar').hidden,true);
  configurationController.dispose();assert.equal(configuration.listeners.length,0);
  const revision=await importFixture();
  await revision.review(file());assert.equal(revision.view.element('#import-diff').hidden,false);
  revision.bump();await revision.controller.refresh();await revision.confirm();
  assert.equal(revision.writes.length,0);assert.match(revision.view.element('#status-message').textContent,/重新预览/);revision.controller.dispose();
  const lateFile=await importFixture(),fileGate=deferred();
  const reading=lateFile.review({text:()=>fileGate.promise});lateFile.controller.dispose();
  fileGate.resolve(JSON.stringify(Policy.exportPayload(Policy.defaultPolicy())));await reading;
  assert.equal(lateFile.view.element('#import-diff').hidden,true);assert.equal(lateFile.view.element('#import-diff').innerHTML,'');assert.equal(lateFile.writes.length,0);
  const competing=await importFixture(),oldFile=deferred();
  const oldReading=competing.review({text:()=>oldFile.promise});
  await competing.review(file());const preview=competing.view.element('#import-diff').innerHTML;
  oldFile.resolve('{"schemaVersion":3,"classifications":[],"quotas":{"perApplicationDailyMinutes":[]}}');await oldReading;
  assert.equal(competing.view.element('#import-diff').innerHTML,preview);competing.controller.dispose();
  const submit=await importFixture();await submit.review(file());
  submit.view.element('#import-classifications').checked=true;submit.view.element('#import-quotas').checked=true;
  // DOM 中的 payload 不是已批准的草稿；修改它不能替换提交内容。
  submit.view.element('#import-diff').dataset.payload='invalid untrusted payload';
  const write=submit.block(),saving=submit.confirm();await new Promise(resolve=>setImmediate(resolve));
  await submit.confirm();assert.equal(submit.writes.length,1);assert.equal(submit.writes[0].headers['If-Match'],'"app-policy-v3"');
  assert.match(submit.view.element('#status-message').textContent,/勿重复提交/);
  write.resolve();await saving;assert.equal(submit.view.element('#import-diff').hidden,true);submit.controller.dispose();
  console.log('PASS: embedded canonical controller, injected transport/Child, no second login, isolated errors, late disposal and listener release');
})().catch(error=>{console.error(error);process.exitCode=1;});

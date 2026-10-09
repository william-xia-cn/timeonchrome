const assert=require('node:assert/strict');
const K=require('./app-runtime-knowledge');
assert.match(K.installationSummaryHTML(undefined),/尚无安装引用信息/);
assert.match(K.installationSummaryHTML({state:'available',entryCount:0,references:[]}),/不代表未安装/);
assert.match(K.installationSummaryHTML({state:'unavailable',reasonCode:'<bad>'}),/&lt;bad&gt;/);
assert.match(K.installationSummaryHTML({state:'available',entryCount:1,references:[]}),/暂不可读/);
const installationHTML=K.installationSummaryHTML({state:'available',entryCount:8,references:Array.from({length:5},(_,i)=>({variantKey:`<entry-${i}>`,lastScanReceivedAtMs:0}))});
assert.match(installationHTML,/最近 5 条/);
assert.match(installationHTML,/北京时间/);
assert.match(installationHTML,/&lt;entry-0&gt;/);
assert.doesNotMatch(installationHTML,/<entry-/);
assert.match(K.installationSummaryHTML({state:'available',entryCount:1,references:[{variantKey:'entry',lastScanReceivedAtMs:Number.MAX_SAFE_INTEGER}]}),/暂不可读/);
const verifiedInstance={evidence:{platform:'windows',verified:{binaryHash:'a'.repeat(64),windowsAumid:'Package!App',windowsFileSeriesKey:'b'.repeat(64)}}};
const ownershipOptions=K.ownershipEvidenceOptions([verifiedInstance,verifiedInstance,
  {evidence:{platform:'macos',verified:{macosSignerKey:'c'.repeat(64),macosSigningIdentifier:'com.example.app'}}},
  {evidence:{platform:'macos',verified:{macosSignerKey:'d'.repeat(64)}}},
  {evidence:{platform:'windows',displayName:'Chrome',values:{binaryHash:'e'.repeat(64)}}}]);
assert.deepEqual(ownershipOptions.map(option=>option.match.kind),['binaryHash','windowsAumid','windowsFileSeries','macosSignature']);
const ownershipCatalog={schemaVersion:4,version:7,products:[{id:'product-a',name:'测试应用',type:'other'}],ownershipRules:[],rules:[],bindings:[{childId:'child-b',products:[{productId:'product-a',classification:'study'}],ruleIds:[]}]};
const draft=K.addOwnershipDraft(ownershipCatalog,ownershipOptions[0],{productId:'product-a',ruleId:'rule-a'});
const renamed=K.editOwnershipProduct(draft,{productId:'product-a',name:'改名产品',childId:'child-a',classification:'other'});
assert.equal(renamed.products[0].id,'product-a');assert.equal(renamed.products[0].name,'改名产品');
assert.deepEqual(renamed.ownershipRules,draft.ownershipRules);
assert.deepEqual(renamed.bindings.find(item=>item.childId==='child-b'),ownershipCatalog.bindings[0]);
assert.equal(renamed.bindings.find(item=>item.childId==='child-a').products[0].classification,'other');
assert.equal(draft.products[0].name,'测试应用');
const following=K.editOwnershipProduct(renamed,{productId:'product-a',name:'改名产品',childId:'child-a',classification:''});
assert.deepEqual(following.bindings.find(item=>item.childId==='child-a').products,[]);
assert.deepEqual(following.bindings.find(item=>item.childId==='child-b'),ownershipCatalog.bindings[0]);
assert.throws(()=>K.editOwnershipProduct(draft,{productId:'product-a',name:' ',childId:'child-a',classification:'study'}),/名称/);
assert.throws(()=>K.editOwnershipProduct(draft,{productId:'product-a',name:'名称',childId:'child-a',classification:'invented'}),/分类无效/);
assert.deepEqual(draft.bindings,ownershipCatalog.bindings);assert.equal(ownershipCatalog.ownershipRules.length,0);
assert.deepEqual(Object.keys(draft.ownershipRules[0]).sort(),['enabled','id','match','platform','productId','revision']);
assert.throws(()=>K.addOwnershipDraft(draft,ownershipOptions[0],{productId:'product-a',ruleId:'duplicate'}),/重复/);
assert.throws(()=>K.addOwnershipDraft(draft,null,{productId:'product-a'}),/已核验/);
assert.throws(()=>K.addOwnershipDraft(draft,ownershipOptions[0],{productId:'missing'}),/已变化/);
const newDraft=K.addOwnershipDraft(ownershipCatalog,ownershipOptions[3],{name:'新应用',newProductId:'new-app',ruleId:'mac-rule'});
assert.equal(newDraft.products.at(-1).type,'unknown');assert.equal(newDraft.ownershipRules[0].platform,'macos');
const evidence={platform:'windows',runtimeIdentity:'fixture',displayName:'Fixture game',values:{binaryHash:'a'.repeat(64),signerKey:'b'.repeat(64),productName:'Fixture game'},verifiedFields:['binaryHash','signerKey']};
const confirmed=K.confirmProduct(K.empty(),{evidence,scope:'file',name:'Fixture game',type:'game',classification:'restrictedEntertainment',childIds:['child-a'],id:'fixture-game'});
assert.deepEqual(confirmed.bindings.map(item=>item.childId),['child-a']);
assert.equal(confirmed.products[0].selectors[0].match.conditions[0].field,'binaryHash');
assert.throws(()=>K.selectorFor({...evidence,verifiedFields:[]},'series'),/可靠身份/);
assert.deepEqual(K.selectorFor(evidence,'series').match.conditions.map(item=>item.field),['signerKey','productName']);
assert.equal(K.selectorFor({...evidence,values:{...evidence.values,fileSeriesKey:'c'.repeat(64)},verifiedFields:[...evidence.verifiedFields,'fileSeriesKey']},'series').match.conditions[0].field,'fileSeriesKey');
assert.equal(K.selectorFor({...evidence,values:{...evidence.values,distributionKey:'steam:714010'},verifiedFields:[...evidence.verifiedFields,'distributionKey']},'series').match.conditions[0].field,'distributionKey');
const variant=K.confirmProduct(confirmed,{evidence:{...evidence,values:{...evidence.values,binaryHash:'c'.repeat(64)}},scope:'file',productId:'fixture-game',classification:'restrictedEntertainment',childIds:['child-a']});
assert.equal(variant.products[0].selectors.length,2);
const blocked=K.confirmProduct(confirmed,{evidence,scope:'file',productId:'fixture-game',classification:'blocked',childIds:['child-a']});
const enhanced=K.enableEnhancedBlocking(blocked,'fixture-game','child-a',[{evidence}]);
assert.equal(enhanced.schemaVersion,3);assert.equal(enhanced.bindings[0].products[0].enhancedBlocking,true);
assert.equal(enhanced.products[0].suspectedMatchers[0].productName,'Fixture game');
assert.equal(K.confirmProduct(enhanced,{evidence,scope:'file',productId:'fixture-game',classification:'blocked',childIds:['child-a']}).bindings[0].products[0].enhancedBlocking,true);
assert.equal(K.confirmProduct(enhanced,{evidence,scope:'file',productId:'fixture-game',classification:'study',childIds:['child-a']}).bindings[0].products[0].enhancedBlocking,undefined);
assert.throws(()=>K.enableEnhancedBlocking(blocked,'fixture-game','child-a',[{evidence:{...evidence,verifiedFields:['binaryHash']}}]),/恰好一组/);
assert.equal(K.unlinkVariant(variant,'fixture-game',1,['child-a']).products[0].selectors.length,1);
assert.throws(()=>K.unlinkVariant(confirmed,'fixture-game',0,[]),/其他孩子/);
assert.equal(K.unlinkVariant(confirmed,'fixture-game',0,['child-a']).products.length,0);
assert.equal(K.unlinkVariant(confirmed,'fixture-game',0,['child-a']).bindings[0].products.length,0);
const split=K.splitVariant(variant,'fixture-game',1,{id:'split-game',name:'Different game',childId:'child-a',classification:'blocked'});
assert.equal(split.products.length,2);assert.equal(split.products[0].selectors.length,1);
assert.throws(()=>K.mergeProducts(split,'split-game','fixture-game','child-a'),/分类冲突/);
split.bindings[0].products[1].classification='restrictedEntertainment';
assert.equal(K.mergeProducts(split,'split-game','fixture-game','child-a').products.length,1);
split.bindings.push({childId:'child-b',products:[{productId:'split-game',classification:'study'}],ruleIds:[]});
assert.throws(()=>K.mergeProducts(split,'split-game','fixture-game','child-a'),/其他孩子/);
const incoming={schemaVersion:1,version:0,products:[{id:'name-only',name:'Unknown game',type:'game',selectors:[]}],rules:[],bindings:[{childId:'child-a',products:[{productId:'name-only',classification:'blocked'}],ruleIds:[]}]};
const preview=K.diffImport(confirmed,incoming);
assert.deepEqual(preview.warnings,['Unknown game']);assert.equal(preview.incoming.rules[0].mode,'suggestion');
assert.throws(()=>K.selectedImport(confirmed,preview.incoming,[]),/逐项/);
const selected=K.selectedImport(confirmed,preview.incoming,preview.changes.map(item=>item.key));
assert.deepEqual(selected.bindings[0].products,confirmed.bindings[0].products);
assert.equal(selected.rules.length,1);assert.equal(confirmed.rules.length,0);
assert.deepEqual(K.scopeImport({...incoming,bindings:[{childId:'injected-child',products:[],ruleIds:[]}]},['child-a']).bindings.map(item=>item.childId),['child-a']);
const shared={...K.empty(),rules:[{id:'old-rule',enabled:true,name:'Old'}],bindings:[{childId:'child-a',products:[],ruleIds:['old-rule']},{childId:'child-b',products:[],ruleIds:['old-rule']}]};
const revised=K.reviseRule(shared,{id:'new-rule',enabled:true,name:'Revised'},['child-a'],'old-rule');
assert.deepEqual(revised.bindings[0].ruleIds,['new-rule']);assert.deepEqual(revised.bindings[1].ruleIds,['old-rule']);
assert.deepEqual(K.toggleApproval(shared,'old-rule','child-a','unused').bindings[1].ruleIds,['old-rule']);
assert.deepEqual(K.toggleApproval(shared,'old-rule','child-a','unused').bindings[0].ruleIds,[]);
const legacy={...K.empty(),rules:[{id:'builtin.type.game.restricted-suggestion',mode:'suggestion'}],bindings:[{childId:'child-a',products:[],ruleIds:['builtin.type.game.restricted-suggestion']}]};
const recommended=K.withDefaultRecommendations(legacy);
assert.equal(recommended.schemaVersion,2);assert.equal(recommended.rules.length,0);assert.deepEqual(recommended.bindings[0].ruleIds,[]);
assert.throws(()=>K.selectedImport(shared,{products:[],rules:[{id:'old-rule',enabled:true,name:'Changed'}],bindings:[{childId:'child-a',products:[],ruleIds:['old-rule']}]},['rules:old-rule']),/未选孩子/);
const oldMatch={match:{conditions:[{field:'packageId',value:'not-currently-installed'},{field:'binaryHash',value:'a'.repeat(64)},{field:'productName',value:'Old name'},{field:'declaredType',value:'game'}]}};
assert.deepEqual(K.editedConditions(oldMatch,[{field:'binaryHash',value:'a'.repeat(64)}],[],'New name'),[{field:'packageId',value:'not-currently-installed'},{field:'declaredType',value:'game'},{field:'productName',value:'New name'}]);
assert.deepEqual(K.editedConditions(null,[],[{field:'binaryHash',value:'x'},{field:'binaryHash',value:'x'}],''),[{field:'binaryHash',value:'x'}]);
const hitHTML=K.previewHitsHTML([{childIndex:0,displayName:'<video>',platform:'windows',result:{classification:'study',status:'conflict',productId:'private-product',ruleIds:['private-rule']}}],[{id:'private-child',name:'测试孩子'}]);
assert.match(hitHTML,/规则冲突，保留原有效分类/);assert.match(hitHTML,/&lt;video&gt;/);assert.match(hitHTML,/测试孩子/);assert(!hitHTML.includes('private-'));
console.log('PASS: knowledge UI scope, variants, merge guards and selected import');

// The canonical component can be mounted inside the main console without
// listening to its sibling pages or applying responses to another Child.
async function componentLifecycleTests(){
  const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
  function fixture(initialChild='child-a'){
    const listeners=new Map(),queries=[],filtered=[{textContent:'Excel',hidden:false},{textContent:'Other',hidden:false}];
    let closed=0,created=0;
    const root={ownerDocument:{createElement(){created++;throw new Error('Unexpected render');}},
      querySelector(selector){queries.push(selector);throw new Error(`Unexpected render: ${selector}`);},
      querySelectorAll(selector){queries.push(selector);return selector==='dialog[open]'?[{close(){closed++;}}]:selector.includes('.knowledge-child:checked')?[{value:'0'}]:filtered;},
      addEventListener(type,handler){listeners.set(type,handler);},
      removeEventListener(type,handler){assert.equal(listeners.get(type),handler);listeners.delete(type);}};
    let context={childId:initialChild,contextRevision:1,children:[{id:'child-a',name:'A'},{id:'child-b',name:'B'}]};
    const calls=[],errors=[],saved=[];
    const requests=[];
    const component=K.mount({root,getContext:()=>context,mock:false,
      request:(...args)=>{calls.push(args);const pending=deferred();requests.push(pending);return pending.promise;},
      onSaved:async value=>{saved.push(value);context={...context,contextRevision:context.contextRevision+1};},onError:error=>errors.push(error)});
    return{root,listeners,queries,filtered,calls,errors,saved,requests,component,
      setContext(value){context={...context,...value};},get closed(){return closed;},get created(){return created;}};
  }
  const late=fixture();assert.deepEqual([...late.listeners.keys()],['click','change','input']);
  late.listeners.get('input')({target:{id:'product-search',value:'excel'}});
  assert.deepEqual(late.filtered.map(item=>item.hidden),[false,true]);
  const opening=late.component.open('product');assert.equal(late.calls.length,2);
  late.setContext({childId:'child-b'});
  late.requests[0].resolve(K.empty());late.requests[1].resolve({observations:[]});
  await assert.rejects(opening,{code:'COMPONENT_CONTEXT_CHANGED'});
  assert.equal(late.created,0);assert.equal(late.queries.length,1);
  await assert.rejects(late.component.classify('excel','study'),{code:'COMPONENT_CONTEXT_CHANGED'});
  assert.equal(late.calls.length,2,'old component must not write under the new Child');
  late.component.dispose();late.component.dispose();assert.equal(late.listeners.size,0);assert.equal(late.closed,1);

  const login=fixture(null);login.setContext({childId:'child-a'});
  const firstOpen=login.component.open('product');assert.equal(login.calls.length,2,'login before first use must not invalidate an unused component');
  login.component.dispose();login.requests[0].resolve(K.empty());login.requests[1].resolve({observations:[]});
  await assert.rejects(firstOpen,{code:'COMPONENT_CONTEXT_CHANGED'});

  const removed=fixture(),read=removed.component.open('rule');removed.component.dispose();
  removed.requests[0].resolve(K.empty());removed.requests[1].resolve({observations:[]});
  await assert.rejects(read,{code:'COMPONENT_CONTEXT_CHANGED'});assert.equal(removed.created,0);
  await assert.rejects(removed.component.publish(K.empty()),{code:'COMPONENT_CONTEXT_CHANGED'});
  assert.equal(removed.calls.length,2);

  const failed=fixture(),errorRead=failed.component.open('product');failed.setContext({contextRevision:2});
  failed.requests[0].reject(new Error('old request failed'));failed.requests[1].resolve({observations:[]});
  await assert.rejects(errorRead,{code:'COMPONENT_CONTEXT_CHANGED'});assert.equal(failed.errors.length,0);
  failed.component.dispose();

  const write=fixture(),saving=write.component.publish({...K.empty(),bindings:[{childId:'child-a',products:[],ruleIds:[]}]});
  assert.equal(write.calls.length,1);assert.equal(JSON.parse(write.calls[0][1].body).knowledge.bindings[0].childId,'child-a');
  write.requests[0].resolve({...K.empty(),version:1});
  await assert.rejects(saving,{code:'COMPONENT_CONTEXT_CHANGED'});
  assert.equal(write.saved.length,1,'a delivered write is not claimed to have been cancelled');
  assert.equal(write.created,0,'onSaved navigation must prevent rendering an obsolete component');
  write.component.dispose();

  const file=fixture(),reading=deferred();
  const importing=file.listeners.get('change')({target:{id:'import-rules',files:[{text:()=>reading.promise}]}});
  file.setContext({childId:'child-b'});reading.resolve(JSON.stringify(K.empty()));await importing;
  assert.equal(file.calls.length,0,'late file parsing must not start an import preview for another Child');
  assert.equal(file.errors.length,0);assert.equal(file.created,0);file.component.dispose();

  const legacy=fixture();globalThis.document=legacy.root;
  const standalone=K.mount({request:async()=>K.empty(),getContext:()=>({childId:'legacy'}),onSaved:async()=>{},onError:()=>{}});
  assert.equal(legacy.listeners.size,3);standalone.dispose();delete globalThis.document;
  console.log('PASS: scoped component, Child/revision isolation, disposal, late reads/writes and standalone compatibility');
}
componentLifecycleTests().catch(error=>{console.error(error);process.exitCode=1;});

async function instanceReadTests(){
  const listeners={},panel={innerHTML:''},dialog={open:false,showModal(){this.open=true;},close(){this.open=false;}};
  let childId='child-a';const pending=[],calls=[];
  const root={ownerDocument:{},querySelector:s=>s==='#instance-panel'?panel:dialog,querySelectorAll:()=>[],addEventListener:(t,f)=>listeners[t]=f,removeEventListener:()=>{}};
  const component=K.mount({root,getContext:()=>({childId}),request:url=>{calls.push(url);return new Promise((resolve,reject)=>pending.push({resolve,reject}));},onSaved:async()=>{},onError:()=>assert.fail('instance error must remain local')});
  const page=(version=1)=>({childId:'child-a',catalogVersion:version,items:[{instanceId:'a'.repeat(64),machineId:'test-machine',platform:'windows',status:'confirmed',product:{name:'<unsafe>'},evidenceRevision:1,evidence:{binaryHash:'b'.repeat(64)}}],nextAfterInstanceId:'a'.repeat(64)});
  const click=id=>listeners.click({target:{closest:()=>({id,dataset:{}})}});
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  const opening=component.open('instance');assert.equal(calls.length,1);assert.match(calls[0],/program-instances\?childId=child-a$/);
  const withInstallation=page();withInstallation.items[0].installation={state:'available',entryCount:1,references:[{variantKey:'scan-entry-confirmed',lastScanReceivedAtMs:0}]};
  pending.shift().resolve(withInstallation);await opening;assert.match(panel.innerHTML,/&lt;unsafe&gt;/);assert.doesNotMatch(panel.innerHTML,/<unsafe>/);
  assert.match(panel.innerHTML,/已关联扫描条目：1/);assert.match(panel.innerHTML,/scan-entry-confirmed/);
  click('instances-refresh');const partial=page();partial.items[0].installation={state:'unavailable',reasonCode:'PROGRAM_INSTALLATION_READ_UNAVAILABLE'};
  pending.shift().resolve(partial);await settle();assert.match(panel.innerHTML,/安装引用暂不可读/);assert.match(panel.innerHTML,/&lt;unsafe&gt;/);assert.match(panel.innerHTML,/test-machine/);
  click('instances-next');assert.match(calls.at(-1),/afterInstanceId=/);pending.shift().resolve(page(2));await settle();assert.match(panel.innerHTML,/目录已更新/);
  click('instances-refresh');pending.shift().reject(Object.assign(new Error('private detail'),{code:'TEST_UNAVAILABLE'}));await settle();assert.match(panel.innerHTML,/TEST_UNAVAILABLE/);assert.doesNotMatch(panel.innerHTML,/private detail/);
  click('instances-refresh');const older=pending.shift();click('instances-refresh');pending.shift().resolve(page());await settle();const current=panel.innerHTML;older.resolve(page(99));await settle();assert.equal(panel.innerHTML,current);
  click('instances-refresh');dialog.close();const closed=panel.innerHTML;pending.shift().resolve(page());await settle();assert.equal(panel.innerHTML,closed);
  const switching=component.open('instance');childId='child-b';const waiting=panel.innerHTML;pending.shift().resolve(page());await switching;assert.equal(panel.innerHTML,waiting);
  component.dispose();assert.ok(calls.every(url=>url.startsWith('/v2/module/program-instances?')));
  console.log('PASS: instance read-only entry, escaping, pagination version, local error, refresh race, close and Child isolation');
}
instanceReadTests().catch(error=>{console.error(error);process.exitCode=1;});

async function ownershipPreviewTests(){
  const listeners={},elements={};let childId='child-a';const pending=[],calls=[];
  const dialog={open:false,showModal(){this.open=true;},close(){this.open=false;}};
  const element=id=>elements[id]??(elements[id]={innerHTML:'',value:''});
  const root={ownerDocument:{},querySelector:s=>s==='#instance-dialog'?dialog:element(s),querySelectorAll:()=>[],
    addEventListener:(type,handler)=>listeners[type]=handler,removeEventListener:()=>{}};
  const component=K.mount({root,getContext:()=>({childId}),request:(url,options)=>{calls.push({url,options});return new Promise((resolve,reject)=>pending.push({resolve,reject}));},onSaved:()=>assert.fail('preview must not save'),onError:()=>assert.fail('error must remain local')});
  const click=(id,dataset={})=>listeners.click({target:{closest:()=>({id,dataset})}});
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  const opening=component.open('instance');pending.shift().resolve({childId,catalogVersion:7,items:[{...verifiedInstance,instanceId:'a'.repeat(64),machineId:'m',platform:'windows',status:'unresolved',evidenceRevision:1}],nextAfterInstanceId:null});await opening;
  click('ownership-open');assert.equal(calls.at(-1).url,'/v2/module/program-instance-catalog');
  pending.shift().resolve({state:'available',version:7,catalog:ownershipCatalog});await settle();
  assert.match(element('#ownership-panel').innerHTML,/未保存、未生效/);
  element('#ownership-evidence').value='0';element('#ownership-product').value='0';click('ownership-add');await settle();
  click('ownership-preview');const preview=calls.at(-1);
  assert.match(preview.url,/preview\?childId=child-a$/);assert.equal(preview.options.method,'POST');
  assert.equal(preview.options.headers['If-Match'],'"application-knowledge-v7"');
  const sent=JSON.parse(preview.options.body).catalog;assert.deepEqual(sent.bindings,ownershipCatalog.bindings);assert.equal(sent.ownershipRules.length,1);
  pending.shift().resolve({preview:true,childId,catalogVersion:7,items:[{instanceId:'a'.repeat(64),before:{status:'unresolved',productId:null},after:{status:'confirmed',productId:'product-a'}}],nextAfterInstanceId:'a'.repeat(64)});await settle();
  assert.match(element('#ownership-panel').innerHTML,/未识别 → 已确认 · 测试应用/);
  click('ownership-preview-next');assert.match(calls.at(-1).url,/afterInstanceId=/);const stale=pending.shift();
  click('',{ownershipToggle:'0'});await settle();const changed=element('#ownership-panel').innerHTML;
  stale.resolve({preview:true,childId,catalogVersion:7,items:[],nextAfterInstanceId:null});await settle();assert.equal(element('#ownership-panel').innerHTML,changed);
  click('ownership-preview');assert.equal(JSON.parse(calls.at(-1).options.body).catalog.ownershipRules[0].enabled,false);
  pending.shift().reject(Object.assign(new Error('private'),{code:'APPLICATION_KNOWLEDGE_CONFLICT'}));await settle();
  assert.match(element('#ownership-panel').innerHTML,/APPLICATION_KNOWLEDGE_CONFLICT/);assert.doesNotMatch(element('#ownership-panel').innerHTML,/private/);
  click('ownership-open');pending.shift().resolve({state:'legacy',version:8,catalog:null});await settle();assert.match(element('#ownership-panel').innerHTML,/不能自动/);
  click('ownership-open');childId='child-b';const before=element('#ownership-panel').innerHTML;
  pending.shift().resolve({state:'available',version:7,catalog:ownershipCatalog});await settle();assert.equal(element('#ownership-panel').innerHTML,before);
  assert.ok(calls.every(call=>!call.options||call.options.method==='POST'&&call.url.includes('/preview?')));
  component.dispose();console.log('PASS: ownership drafts preserve bindings, server-only preview, paging, stale edits, errors and Child isolation');
}
ownershipPreviewTests().catch(error=>{console.error(error);process.exitCode=1;});

async function ownershipSaveTests(){
  const listeners={},elements={},pending=[],calls=[],catalogSaves=[];let childId='child-a';
  const dialog={open:false,showModal(){this.open=true;},close(){this.open=false;}};
  const element=id=>elements[id]??(elements[id]={innerHTML:'',value:'',querySelectorAll:()=>[]});
  const root={ownerDocument:{},querySelector:s=>s==='#instance-dialog'?dialog:element(s),querySelectorAll:()=>[],
    addEventListener:(type,handler)=>listeners[type]=handler,removeEventListener:()=>{}};
  const component=K.mount({root,getContext:()=>({childId}),request:(url,options)=>{calls.push({url,options});return new Promise((resolve,reject)=>pending.push({resolve,reject}));},
    onCatalogSaved:(catalog,child)=>catalogSaves.push({catalog,child}),onSaved:()=>assert.fail('new catalog must not refresh legacy consumers'),onError:()=>assert.fail('save errors remain in draft')});
  const click=(id,dataset={})=>listeners.click({target:{closest:()=>({id,dataset})}});
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  const opening=component.open('instance');pending.shift().resolve({childId,catalogVersion:7,items:[{...verifiedInstance,instanceId:'a'.repeat(64),machineId:'m',platform:'windows',status:'unresolved',evidenceRevision:1}],nextAfterInstanceId:null});await opening;
  click('ownership-open');pending.shift().resolve({state:'available',version:7,catalog:ownershipCatalog});await settle();
  click('ownership-save');const saving=calls.at(-1),count=calls.length;
  assert.equal(saving.options.method,'PUT');assert.equal(saving.options.headers['If-Match'],'"application-knowledge-v7"');
  assert.deepEqual(JSON.parse(saving.options.body),ownershipCatalog);
  click('ownership-save');click('ownership-open');click('ownership-add');assert.equal(calls.length,count);
  pending.shift().resolve({state:'available',version:8,catalog:{...ownershipCatalog,version:8},mappingState:'pending'});await settle();
  assert.match(element('#ownership-panel').innerHTML,/目录版本 8 已保存/);
  assert.equal(catalogSaves.length,1);assert.equal(catalogSaves[0].child,'child-a');assert.equal(catalogSaves[0].catalog.version,8);
  assert.match(element('#ownership-panel').innerHTML,/终端执行尚未确认/);
  assert.doesNotMatch(element('#ownership-panel').innerHTML,/未保存、未生效/);
  click('ownership-save');assert.equal(calls.length,count);
  element('#ownership-product-name-0').value='新版产品名';element('#ownership-product-class-0').value='other';
  element('#ownership-product-type-0').value='game';
  element('#ownership-product-group-0').value='specialApplication';
  click('',{ownershipProduct:'0'});await settle();assert.match(element('#ownership-panel').innerHTML,/新版产品名/);
  element('#ownership-evidence').value='0';element('#ownership-product').value='0';click('ownership-add');await settle();
  click('ownership-save');const draft=JSON.parse(calls.at(-1).options.body);assert.equal(draft.ownershipRules.length,1);
  assert.equal(draft.products[0].name,'新版产品名');
  assert.equal(draft.products[0].type,'game');
  assert.equal(draft.products[0].catalogGroup,'specialApplication');
  assert.equal(draft.bindings.find(item=>item.childId==='child-a').products[0].classification,'other');
  assert.deepEqual(draft.bindings.find(item=>item.childId==='child-b'),ownershipCatalog.bindings[0]);
  pending.shift().reject(Object.assign(Error('private server content'),{code:'APPLICATION_KNOWLEDGE_CONFLICT'}));await settle();
  assert.match(element('#ownership-panel').innerHTML,/草稿已保留/);assert.doesNotMatch(element('#ownership-panel').innerHTML,/private server/);
  click('ownership-save');assert.deepEqual(JSON.parse(calls.at(-1).options.body),draft);
  childId='child-b';const prior=element('#ownership-panel').innerHTML;
  pending.shift().resolve({state:'available',version:9,catalog:{...draft,version:9},mappingState:'pending'});await settle();
  assert.equal(element('#ownership-panel').innerHTML,prior);
  assert.equal(catalogSaves.length,1,'late child response cannot notify current catalogue');
  component.dispose();console.log('PASS: catalog PUT, conditional version, duplicate guard, pending vs execution, retained conflict draft and late child response');
}
ownershipSaveTests().catch(error=>{console.error(error);process.exitCode=1;});

async function ownershipImportLifecycleTests(){
  const listeners={},elements={};let childId='child-a';
  const dialog={open:false,showModal(){this.open=true;},close(){this.open=false;}};
  const element=id=>elements[id]??(elements[id]={innerHTML:'',textContent:'',value:''});
  const calls=[];
  const root={ownerDocument:{},querySelector:s=>s==='#instance-dialog'?dialog:element(s),querySelectorAll:()=>[],
    addEventListener:(type,handler)=>listeners[type]=handler,removeEventListener:()=>{}};
  const component=K.mount({root,getContext:()=>({childId}),request:async url=>{calls.push(url);return {state:'available',version:7,catalog:ownershipCatalog};},onSaved:()=>assert.fail('file reading must not save'),onError:()=>assert.fail('file errors remain local')});
  await component.open('identity');
  const incoming={...ownershipCatalog,products:[...ownershipCatalog.products,{id:'import-late',name:'迟到导入',type:'other'}]};
  const read=text=>listeners.change({target:{id:'ownership-import-file',files:[{size:100,text}]}});
  let resolveOld;
  const old=read(()=>new Promise(resolve=>resolveOld=resolve));
  await read(async()=>JSON.stringify({...incoming,products:[...ownershipCatalog.products,{id:'import-current',name:'当前导入',type:'other'}]}));
  const current=element('#ownership-panel').innerHTML;assert.match(current,/当前导入/);
  resolveOld(JSON.stringify(incoming));await old;assert.equal(element('#ownership-panel').innerHTML,current);
  let resolveClosed;const closing=read(()=>new Promise(resolve=>resolveClosed=resolve));dialog.close();
  resolveClosed(JSON.stringify(incoming));await closing;assert.equal(element('#ownership-panel').innerHTML,current);
  dialog.showModal();let resolveChild;const switching=read(()=>new Promise(resolve=>resolveChild=resolve));childId='child-b';
  resolveChild(JSON.stringify(incoming));await switching;assert.equal(element('#ownership-panel').innerHTML,current);
  assert.equal(calls.length,1,'file parsing must neither save nor start a request under another Child');
  component.dispose();console.log('PASS: schema4 import latest file wins, close and Child isolation without transport writes');
}
ownershipImportLifecycleTests().catch(error=>{console.error(error);process.exitCode=1;});

{
  const rule={id:'r',name:'原规则',kind:'family',platform:'windows',match:{operator:'all',conditions:[{field:'binaryHash',value:'a'.repeat(64)}]},exclude:[{operator:'any',conditions:[{field:'packageId',value:'legacy-evidence'}]}],classification:'study',mode:'automatic',type:'other',enabled:true,source:'parent-confirmed',reason:'既有依据'};
  const original={...ownershipCatalog,rules:[rule],bindings:[{childId:'child-a',products:[],ruleIds:['r']},{childId:'child-b',products:[],ruleIds:['r']}]};
  const before=JSON.stringify(original);
  const revised=K.reviseCatalogClassification(original,{ruleId:'r',childId:'child-a',classification:'other',newId:'r2'});
  assert.equal(JSON.stringify(original),before);
  assert.deepEqual(revised.rules[1],{...rule,id:'r2',classification:'other'});
  assert.deepEqual(revised.bindings[0].ruleIds,['r2']);assert.deepEqual(revised.bindings[1],original.bindings[1]);
  assert.deepEqual(revised.ownershipRules,original.ownershipRules);
  const stopped=K.toggleApproval(revised,'r2','child-a','unused');
  assert.deepEqual(stopped.bindings[0].ruleIds,[]);assert.deepEqual(stopped.bindings[1],original.bindings[1]);
  const resumed=K.toggleApproval(stopped,'r2','child-a','unused');assert.deepEqual(resumed.bindings[0].ruleIds,['r2']);
  assert.throws(()=>K.reviseCatalogClassification(original,{ruleId:'r',childId:'child-a',classification:'invalid',newId:'r2'}));
  assert.throws(()=>K.reviseCatalogClassification(original,{ruleId:'r',childId:'child-a',classification:'other',newId:'r'}));
  console.log('PASS: classification revision preserves evidence, source rules, ownership mapping and other Child approvals');
}

async function newCatalogRuleContractTests(){
  const {parseApplicationKnowledgeV4}=await import('@timeonchrome/app-runtime-contracts/classification-validation');
  const {resolveProgramInstanceClassification}=await import('@timeonchrome/app-runtime-contracts/classification');
  const input={id:'new-rule',name:'产品分类',kind:'product',productId:'product-a',type:'other',platform:'',mode:'automatic',classification:'other',reason:'家长明确配置',childId:'child-a'};
  const added=K.addCatalogClassification(ownershipCatalog,input),parsed=parseApplicationKnowledgeV4(added);
  const special=parseApplicationKnowledgeV4(K.editOwnershipProduct(parsed,
    {productId:'product-a',name:'非名称识别的产品',childId:'child-a',classification:'',catalogGroup:'specialApplication'}));
  assert.equal(special.products[0].catalogGroup,'specialApplication');
  assert.deepEqual(special.bindings,parsed.bindings);assert.deepEqual(special.ownershipRules,parsed.ownershipRules);
  const renamedSpecial=K.editOwnershipProduct(special,
    {productId:'product-a',name:'另一个名称',childId:'child-a',classification:''});
  assert.equal(renamedSpecial.products[0].catalogGroup,'specialApplication');
  const ordinary=parseApplicationKnowledgeV4(K.editOwnershipProduct(special,
    {productId:'product-a',name:'Chrome',childId:'child-a',classification:'other',catalogGroup:''}));
  assert.equal(Object.hasOwn(ordinary.products[0],'catalogGroup'),false,'name and other classification cannot create special role');
  assert.equal(ordinary.bindings.find(b=>b.childId==='child-a').products[0].classification,'other');
  assert.throws(()=>K.editOwnershipProduct(parsed,
    {productId:'product-a',name:'产品',childId:'child-a',classification:'',catalogGroup:'isChrome'}),/统计目录无效/);
  assert.deepEqual(parsed,added);assert.deepEqual(parsed.bindings[0],ownershipCatalog.bindings[0]);assert.deepEqual(parsed.ownershipRules,[]);
  assert.equal(ownershipCatalog.rules.length,0);
  const context=catalog=>({schemaVersion:2,childId:'child-a',assignmentVersion:1,catalogVersion:catalog.version,
    products:catalog.products,rules:catalog.rules,binding:catalog.bindings.find(b=>b.childId==='child-a'),
    items:[{instanceId:'a'.repeat(64),status:'confirmed',productId:'product-a'}]});
  const resolve=catalog=>resolveProgramInstanceClassification(context(catalog),'child-a','a'.repeat(64),verifiedInstance.evidence);
  assert.equal(resolve(parsed).classification,'other');
  const type=K.addCatalogClassification(ownershipCatalog,{...input,kind:'type',productId:undefined,type:'other',classification:'study'});
  assert.equal(resolve(parseApplicationKnowledgeV4(type)).classification,'study');
  const updatedType=parseApplicationKnowledgeV4(K.editOwnershipProduct(type,
    {childId:'child-a',productId:'product-a',name:'测试应用',type:'game',classification:''}));
  assert.equal(resolve(updatedType).status,'unclassified','old type rule must no longer match');
  assert.deepEqual(updatedType.bindings,type.bindings);
  assert.deepEqual(updatedType.ownershipRules,type.ownershipRules);
  assert.equal(type.products[0].type,'other','editing must not mutate the source catalogue');
  const unknownType=parseApplicationKnowledgeV4(K.editOwnershipProduct(updatedType,
    {childId:'child-a',productId:'product-a',name:'测试应用',type:'unknown',classification:'other'}));
  assert.equal(resolve(unknownType).classification,'other','explicit Child classification is independent of unknown type');
  assert.throws(()=>K.editOwnershipProduct(type,
    {childId:'child-a',productId:'product-a',name:'测试应用',type:'invented',classification:''}),/客观产品类型无效/);
  const suggestion=K.addCatalogClassification(ownershipCatalog,{...input,mode:'suggestion'});
  assert.equal(resolve(parseApplicationKnowledgeV4(suggestion)).status,'unclassified');
  const differentPlatform=K.addCatalogClassification(ownershipCatalog,{...input,platform:'macos'});
  assert.equal(resolve(parseApplicationKnowledgeV4(differentPlatform)).status,'unclassified');
  const explicit=K.editOwnershipProduct(parsed,{childId:'child-a',productId:'product-a',name:'改名不改身份',classification:'composite'});
  assert.equal(resolve(parseApplicationKnowledgeV4(explicit)).classification,'composite');
  // 两孩子共享同一分类规则模板；修订只替换当前孩子引用，实际消费不串用。
  const childBFollowing=K.editOwnershipProduct(parsed,
    {childId:'child-b',productId:'product-a',name:'测试应用',classification:''});
  const shared=K.toggleApproval(childBFollowing,input.id,'child-b','unused');
  const forChild=(catalog,child)=>resolveProgramInstanceClassification({...context(catalog),childId:child,
    binding:catalog.bindings.find(b=>b.childId===child)},child,'a'.repeat(64),verifiedInstance.evidence);
  const revised=parseApplicationKnowledgeV4(K.reviseCatalogClassification(shared,
    {ruleId:input.id,childId:'child-a',classification:'study',newId:'revised-rule'}));
  assert.equal(forChild(revised,'child-a').classification,'study');
  assert.equal(forChild(revised,'child-b').classification,'other');
  const suggested=parseApplicationKnowledgeV4(K.reviseCatalogClassification(shared,
    {ruleId:input.id,childId:'child-a',classification:'study',mode:'suggestion',platform:'macos',newId:'suggested-rule'}));
  assert.equal(forChild(suggested,'child-a').status,'unclassified');
  assert.equal(forChild(suggested,'child-b').classification,'other');
  assert.equal(suggested.rules.at(-1).platform,'macos');
  const bothPlatforms=parseApplicationKnowledgeV4(K.reviseCatalogClassification(suggested,
    {ruleId:'suggested-rule',childId:'child-a',classification:'study',mode:'automatic',platform:'',newId:'both-rule'}));
  assert.equal(forChild(bothPlatforms,'child-a').classification,'study');
  assert.equal(Object.hasOwn(bothPlatforms.rules.at(-1),'platform'),false);
  assert.deepEqual(bothPlatforms.rules[0],shared.rules[0]);
  assert.deepEqual(bothPlatforms.bindings.find(b=>b.childId==='child-b'),shared.bindings.find(b=>b.childId==='child-b'));
  assert.throws(()=>K.reviseCatalogClassification(shared,
    {ruleId:input.id,childId:'child-a',classification:'study',mode:'invented',newId:'invalid-rule'}),/规则模式无效/);
  assert.throws(()=>K.reviseCatalogClassification(shared,
    {ruleId:input.id,childId:'child-a',classification:'study',platform:'linux',newId:'invalid-rule'}),/规则平台无效/);
  const weakRule={...parsed.rules[0],kind:'family',mode:'suggestion',match:{operator:'all',conditions:[{field:'productName',value:'Chrome'}]}};
  delete weakRule.productId;
  const weak=parseApplicationKnowledgeV4({...parsed,rules:[weakRule]});
  const unsafe=K.reviseCatalogClassification(weak,
    {ruleId:input.id,childId:'child-a',classification:'blocked',mode:'automatic',newId:'unsafe-rule'});
  assert.throws(()=>parseApplicationKnowledgeV4(unsafe),/WEAK_AUTOMATIC_RULE/,'mode editing must not bypass server contract safety');
  const expressions=K.parseClassificationExpressions(JSON.stringify({operator:'all',conditions:[{field:'binaryHash',value:'b'.repeat(64)}]}),'[]');
  const changedConditions=parseApplicationKnowledgeV4(K.reviseCatalogClassification(shared,
    {ruleId:input.id,childId:'child-a',classification:'study',expressions,newId:'changed-conditions'}));
  assert.equal(forChild(changedConditions,'child-a').status,'unclassified');
  assert.equal(forChild(changedConditions,'child-b').classification,'other');
  assert.deepEqual(changedConditions.rules[0],shared.rules[0]);
  expressions.match.conditions[0].value='c'.repeat(64);
  assert.equal(changedConditions.rules.at(-1).match.conditions[0].value,'b'.repeat(64));
  const excluded=K.parseClassificationExpressions(JSON.stringify(shared.rules[0].match),
    JSON.stringify([{operator:'all',conditions:[{field:'binaryHash',value:'a'.repeat(64)}]}]));
  const excludedCatalogue=parseApplicationKnowledgeV4(K.reviseCatalogClassification(shared,
    {ruleId:input.id,childId:'child-a',classification:'blocked',expressions:excluded,newId:'excluded-rule'}));
  assert.equal(forChild(excludedCatalogue,'child-a').status,'unclassified');
  assert.throws(()=>K.parseClassificationExpressions('{','[]'),/JSON 格式错误/);
  assert.throws(()=>K.parseClassificationExpressions('[]','[]'),/表达式数组/);
  assert.throws(()=>K.parseClassificationExpressions(JSON.stringify(shared.rules[0].match),'{}'),/表达式数组/);
  assert.throws(()=>K.parseClassificationExpressions(' '.repeat(16385),'[]'),/文本过长/);
  const invalidField=K.parseClassificationExpressions('{"operator":"all","conditions":[{"field":"windowsFileSeriesKey","value":"not-an-alias"}]}','[]');
  assert.throws(()=>parseApplicationKnowledgeV4(K.reviseCatalogClassification(shared,
    {ruleId:input.id,childId:'child-a',classification:'study',expressions:invalidField,newId:'invalid-field'})),/INVALID_MATCH_CONDITION/);
  const stopped=parseApplicationKnowledgeV4(K.toggleApproval(revised,'revised-rule','child-a','unused'));
  assert.equal(forChild(stopped,'child-a').status,'unclassified');
  assert.equal(forChild(stopped,'child-b').classification,'other');
  const covered=K.editOwnershipProduct(revised,{childId:'child-a',productId:'product-a',name:'产品',classification:'blocked'});
  assert.equal(forChild(parseApplicationKnowledgeV4(covered),'child-a').classification,'blocked');
  const inherited=parseApplicationKnowledgeV4(K.editOwnershipProduct(covered,
    {childId:'child-a',productId:'product-a',name:'产品',classification:''}));
  assert.equal(forChild(inherited,'child-a').classification,'study');
  assert.equal(forChild(inherited,'child-b').classification,'other');
  assert.deepEqual(inherited.ownershipRules,shared.ownershipRules);
  assert.deepEqual(context(inherited).items,context(shared).items);
  assert.throws(()=>K.addCatalogClassification(ownershipCatalog,{...input,productId:'测试应用'}),/集中目录/);
  assert.throws(()=>K.addCatalogClassification(ownershipCatalog,{...input,kind:'type',type:'unknown'}),/客观产品类型/);
  assert.throws(()=>K.addCatalogClassification(ownershipCatalog,{...input,reason:''}),/解释/);
  for(const kind of ['family','developer']){
    const conditions=K.parseClassificationExpressions(JSON.stringify({operator:'all',conditions:[{field:'binaryHash',value:'a'.repeat(64)}]}),'[]');
    const advanced=K.addCatalogClassification(ownershipCatalog,{...input,kind,expressions:conditions});
    const validated=parseApplicationKnowledgeV4(advanced);
    assert.equal(resolve(validated).classification,'other');
    assert.equal(Object.hasOwn(validated.rules.at(-1),'productId'),false,'advanced rules must not inherit hidden product selection');
    assert.equal(validated.rules.at(-1).type,'unknown','advanced rules must not inherit hidden type selection');
    assert.deepEqual(validated.bindings.find(b=>b.childId==='child-b'),ownershipCatalog.bindings.find(b=>b.childId==='child-b'));
    assert.deepEqual(validated.ownershipRules,ownershipCatalog.ownershipRules);
    conditions.match.conditions[0].value='c'.repeat(64);
    assert.equal(advanced.rules.at(-1).match.conditions[0].value,'a'.repeat(64));
    const missing=K.addCatalogClassification(ownershipCatalog,{...input,kind,expressions:{
      match:{operator:'all',conditions:[{field:'fileSeriesKey',value:'verified-old-series'}]},exclude:[]}});
    assert.equal(resolve(parseApplicationKnowledgeV4(missing)).status,'unknown','unsupported evidence must not become a fake match or mismatch');
    const weakNew=K.addCatalogClassification(ownershipCatalog,{...input,kind,expressions:{
      match:{operator:'all',conditions:[{field:'productName',value:'Chrome'}]},exclude:[]}});
    assert.throws(()=>parseApplicationKnowledgeV4(weakNew),/WEAK_AUTOMATIC_RULE/);
    assert.throws(()=>K.addCatalogClassification(ownershipCatalog,{...input,kind}),/明确的匹配条件/);
  }
  const imported=structuredClone(shared);
  imported.version=999;
  imported.bindings=[{childId:'foreign-child',products:[{productId:'product-a',classification:'blocked'}],ruleIds:[]}];
  imported.products.push({id:'import-product',name:'导入产品',type:'other'});
  imported.ownershipRules.push({id:'import-owner',revision:1,enabled:true,platform:'windows',productId:'import-product',match:{kind:'binaryHash',sha256:'c'.repeat(64)}});
  imported.rules.push({...shared.rules[0],id:'import-class',name:'导入分类'});
  const importPreview=K.catalogImportDiff(shared,imported);
  assert.equal(importPreview.changes.length,3);
  const merged=parseApplicationKnowledgeV4(K.applyCatalogImport(shared,imported,importPreview.changes.map(item=>item.key),'child-a'));
  assert.equal(merged.version,shared.version);
  assert.deepEqual(merged.bindings.find(b=>b.childId==='child-b'),shared.bindings.find(b=>b.childId==='child-b'));
  assert.deepEqual(merged.bindings.find(b=>b.childId==='child-a').products,shared.bindings.find(b=>b.childId==='child-a').products);
  assert(!merged.bindings.some(b=>b.childId==='foreign-child'));
  assert(merged.bindings.find(b=>b.childId==='child-a').ruleIds.includes('import-class'));
  assert(!shared.products.some(p=>p.id==='import-product'));
  assert.throws(()=>K.applyCatalogImport(shared,imported,[],'child-a'),/逐项选择/);
  const onlyProduct=K.applyCatalogImport(shared,imported,['products:import-product'],'child-a');
  assert.deepEqual(onlyProduct.rules,shared.rules);
  assert.deepEqual(onlyProduct.ownershipRules,shared.ownershipRules);
  assert.deepEqual(onlyProduct.bindings,shared.bindings);
  imported.rules[0].classification='blocked';
  assert.throws(()=>K.applyCatalogImport(shared,imported,[`rules:${shared.rules[0].id}`],'child-a'),/其他孩子/);
  assert.throws(()=>K.catalogImportDiff(shared,{...imported,mappings:[]}),/实例映射/);
  assert.throws(()=>K.catalogImportDiff(shared,{...imported,schemaVersion:3}),/schema4/);
  assert.throws(()=>K.catalogImportDiff(shared,{...imported,products:[imported.products[0],imported.products[0]]}),/重复/);
  const missingProduct=K.applyCatalogImport(shared,imported,['ownershipRules:import-owner'],'child-a');
  assert.throws(()=>parseApplicationKnowledgeV4(missingProduct),'dangling ownership target must fail the real validator');
  console.log('PASS: actual v4 parser/classifier, import selection, foreign binding isolation, shared rule protection and reference validation');
}
newCatalogRuleContractTests().catch(error=>{console.error(error);process.exitCode=1;});

const assert=require('node:assert/strict');
const K=require('./app-runtime-knowledge');
const verifiedInstance={evidence:{platform:'windows',verified:{binaryHash:'a'.repeat(64),windowsAumid:'Package!App',windowsFileSeriesKey:'b'.repeat(64)}}};
const ownershipOptions=K.ownershipEvidenceOptions([verifiedInstance,verifiedInstance,
  {evidence:{platform:'macos',verified:{macosSignerKey:'c'.repeat(64),macosSigningIdentifier:'com.example.app'}}},
  {evidence:{platform:'macos',verified:{macosSignerKey:'d'.repeat(64)}}},
  {evidence:{platform:'windows',displayName:'Chrome',values:{binaryHash:'e'.repeat(64)}}}]);
assert.deepEqual(ownershipOptions.map(option=>option.match.kind),['binaryHash','windowsAumid','windowsFileSeries','macosSignature']);
const ownershipCatalog={schemaVersion:4,version:7,products:[{id:'product-a',name:'测试应用',type:'other'}],ownershipRules:[],rules:[],bindings:[{childId:'child-b',products:[{productId:'product-a',classification:'study'}],ruleIds:[]}]};
const draft=K.addOwnershipDraft(ownershipCatalog,ownershipOptions[0],{productId:'product-a',ruleId:'rule-a'});
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
  pending.shift().resolve(page());await opening;assert.match(panel.innerHTML,/&lt;unsafe&gt;/);assert.doesNotMatch(panel.innerHTML,/<unsafe>/);
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

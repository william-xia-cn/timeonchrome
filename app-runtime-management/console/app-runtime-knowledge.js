(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppRuntimeKnowledge = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const labels = {study:'学习',composite:'复合',restrictedEntertainment:'受限娱乐',other:'其他',unclassified:'未归类',blocked:'黑名单'};
  const types = {game:'游戏',gameLauncher:'游戏平台／启动器',gameUtility:'游戏工具',onlineVideo:'在线视频',mediaPlayer:'影音播放器',other:'其他',unknown:'未知'};
  const resolutionLabels={explicit:'孩子明确分类',automatic:'自动规则',suggestion:'仅建议，不改变有效分类',conflict:'规则冲突，保留原有效分类',unclassified:'未归类'};
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function previewHitsHTML(hits,children){
    if(!hits.length)return '<p>暂无当前命中；预配置规则仍可在以后发现可靠身份时匹配。</p>';
    return `<div class="knowledge-hit-list">${hits.slice(0,100).map(hit=>`<article class="knowledge-item"><div><strong>${escapeHtml(hit.displayName)}</strong><small>${hit.platform==='macos'?'macOS':'Windows'} · ${escapeHtml(children[hit.childIndex]?.name||'目标孩子')}</small><p>${labels[hit.result.classification]} · ${resolutionLabels[hit.result.status]}</p></div></article>`).join('')}</div>${hits.length>100?'<p>仅列出前 100 条命中观察。</p>':''}`;
  }
  const clone = value => JSON.parse(JSON.stringify(value));
  function ownershipEvidenceOptions(items) {
    const options=[],seen=new Set();
    for(const item of items){
      const evidence=item.evidence,verified=evidence?.verified||{};
      if(!['windows','macos'].includes(evidence?.platform))continue;
      const add=(label,match)=>{const key=JSON.stringify([evidence.platform,match]);if(seen.has(key))return;seen.add(key);options.push({platform:evidence.platform,label,match});};
      if(/^[a-f0-9]{64}$/.test(verified.binaryHash||''))add('确定文件内容',{kind:'binaryHash',sha256:verified.binaryHash});
      if(evidence.platform==='windows'){
        if(verified.windowsAumid)add('Windows 完整 AUMID',{kind:'windowsAumid',aumid:verified.windowsAumid});
        if(verified.windowsFileSeriesKey)add('Windows 已核验文件系列',{kind:'windowsFileSeries',fileSeriesKey:verified.windowsFileSeriesKey});
      }else if(verified.macosSignerKey&&verified.macosSigningIdentifier)add('macOS 已核验签名组合',{
        kind:'macosSignature',signerKey:verified.macosSignerKey,signingIdentifier:verified.macosSigningIdentifier});
    }
    return options;
  }
  function addOwnershipDraft(catalog,option,{productId,name,ruleId,newProductId}){
    if(catalog?.schemaVersion!==4||!option)throw new Error('请选择已核验的归属依据');
    const next=clone(catalog);let product=next.products.find(item=>item.id===productId);
    if(productId&&!product)throw new Error('目标产品已变化，请重新选择');
    if(!product){
      if(!name?.trim()||name.trim().length>256)throw new Error('请填写有效的产品名称');
      product={id:newProductId,name:name.trim(),type:'unknown'};next.products.push(product);
    }
    if(next.ownershipRules.some(rule=>rule.enabled&&rule.productId===product.id&&rule.platform===option.platform&&same(rule.match,option.match)))
      throw new Error('此产品已有相同规则，无需重复添加');
    next.ownershipRules.push({id:ruleId,revision:1,enabled:true,platform:option.platform,productId:product.id,match:clone(option.match)});
    return next;
  }
  const empty = () => ({schemaVersion:2,version:0,products:[],rules:[],bindings:[]});
  const legacyGameSuggestionRuleId='builtin.type.game.restricted-suggestion';
  function withDefaultRecommendations(value){const next=clone(value);next.schemaVersion=Math.max(2,next.schemaVersion);next.rules=next.rules.filter(rule=>rule.id!==legacyGameSuggestionRuleId);for(const binding of next.bindings)binding.ruleIds=binding.ruleIds.filter(id=>id!==legacyGameSuggestionRuleId);return next;}
  const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
  function matched(product,evidence){return product.selectors.some(selector=>selector.platform===evidence.platform&&selector.match.conditions.length&&(selector.match.operator==='all'?selector.match.conditions.every:selector.match.conditions.some).call(selector.match.conditions,condition=>(condition.field==='runtimeIdentity'?evidence.runtimeIdentity:evidence.values[condition.field])===condition.value&&(!['runtimeIdentity','binaryHash','packageId','distributionKey','signerKey','fileSeriesKey'].includes(condition.field)||evidence.verifiedFields.includes(condition.field))));}
  function selectorFor(evidence,scope) {
    const verified = new Set(evidence.verifiedFields), values=evidence.values;
    let conditions;
    if (verified.has('distributionKey')) conditions=[{field:'distributionKey',value:values.distributionKey}];
    else if (scope==='file' && verified.has('binaryHash')) conditions=[{field:'binaryHash',value:values.binaryHash}];
    else if (verified.has('packageId')) conditions=[{field:'packageId',value:values.packageId}];
    else if (scope==='series' && verified.has('fileSeriesKey')) conditions=[{field:'fileSeriesKey',value:values.fileSeriesKey}];
    else if (scope==='series' && verified.has('signerKey') && values.productName) conditions=[{field:'signerKey',value:values.signerKey},{field:'productName',value:values.productName}];
    else throw new Error('此范围缺少可靠身份依据；不能仅凭名称、路径或安装来源确认产品');
    return {platform:evidence.platform,match:{operator:'all',conditions}};
  }
  function setProductClassification(next,childId,productId,classification){
    let binding=next.bindings.find(item=>item.childId===childId);
    if(!binding){binding={childId,products:[],ruleIds:[]};next.bindings.push(binding);}
    const previous=binding.products.find(item=>item.productId===productId);
    binding.products=binding.products.filter(item=>item.productId!==productId);
    binding.products.push({productId,classification,...(classification==='blocked'&&previous?.enhancedBlocking?{enhancedBlocking:true}:{})});
  }
  function confirmProduct(current,{evidence,scope,productId,name,type,classification,childIds,id}) {
    const next=clone(current), selector=selectorFor(evidence,scope);
    let product=next.products.find(item=>item.id===productId);
    if (!product) {if (!name.trim()) throw new Error('请输入产品名称'); product={id,name:name.trim(),type,selectors:[]};next.products.push(product);}
    if (!product.selectors.some(item=>same(item,selector))) product.selectors.push(selector);
    for (const childId of childIds) setProductClassification(next,childId,product.id,classification);
    return next;
  }
  function enableEnhancedBlocking(current,productId,childId,observations){
    const next=clone(current),product=next.products.find(item=>item.id===productId);
    const choice=next.bindings.find(item=>item.childId===childId)?.products.find(item=>item.productId===productId);
    if(!product||choice?.classification!=='blocked')throw new Error('请先确认产品并将当前孩子的产品归为黑名单');
    const candidates=observations.map(item=>item.evidence).filter(evidence=>evidence.platform==='windows'
      && matched(product,evidence)&&evidence.verifiedFields.includes('signerKey')
      && /^[a-f0-9]{64}$/i.test(evidence.values.signerKey||'')&&evidence.values.productName);
    const pairs=[...new Map(candidates.map(evidence=>[`${evidence.values.signerKey}\n${evidence.values.productName}`,
      {platform:'windows',signerKey:evidence.values.signerKey,productName:evidence.values.productName}])).values()];
    if(pairs.length!==1)throw new Error('需要恰好一组已确认签名与 PE 产品线索；多个或缺失时先审核变种，不能自动强化');
    if(next.products.some(item=>item.id!==productId&&(item.suspectedMatchers||[]).some(hint=>hint.signerKey===pairs[0].signerKey&&hint.productName===pairs[0].productName)))
      throw new Error('该审核线索也属于其他产品，不能强化封锁');
    next.schemaVersion=3;product.suspectedMatchers=[pairs[0]];choice.enhancedBlocking=true;
    return next;
  }
  function mergeProducts(current,sourceId,targetId,childId) {
    if (sourceId===targetId) throw new Error('请选择两个不同的产品');
    const next=clone(current), source=next.products.find(item=>item.id===sourceId), target=next.products.find(item=>item.id===targetId);
    if (!source || !target) throw new Error('产品已变化，请重新加载');
    // Never silently rewrite another Child's explicit choice.
    if (next.bindings.some(binding=>binding.childId!==childId && binding.products.some(item=>item.productId===sourceId))) throw new Error('来源产品被其他孩子明确配置，请先分别确认这些孩子，不能自动修改全家');
    const binding=next.bindings.find(item=>item.childId===childId);
    const left=binding?.products.find(item=>item.productId===sourceId),right=binding?.products.find(item=>item.productId===targetId);
    if (left && right && left.classification!==right.classification) throw new Error('两个产品的孩子明确分类冲突，请先确认同一分类');
    for (const selector of source.selectors) if (!target.selectors.some(item=>same(item,selector))) target.selectors.push(selector);
    if (binding) {binding.products=binding.products.filter(item=>item.productId!==sourceId);if(left&&!right) binding.products.push({...left,productId:targetId});}
    for (const rule of next.rules) if(rule.productId===sourceId) rule.productId=targetId;
    next.products=next.products.filter(item=>item.id!==sourceId); return next;
  }
  function splitVariant(current,productId,selectorIndex,{id,name,childId,classification}) {
    const next=clone(current), product=next.products.find(item=>item.id===productId);
    if (!product || !product.selectors[selectorIndex] || !name.trim()) throw new Error('请选择有效变种并填写新产品名');
    if (product.selectors.length===1) throw new Error('产品只剩一个身份范围，请改用解除关联／重新确认，不创建空产品');
    const selector=product.selectors.splice(selectorIndex,1)[0];
    next.products.push({id,name:name.trim(),type:product.type,selectors:[selector]});
    let binding=next.bindings.find(item=>item.childId===childId);
    if (!binding) {binding={childId,products:[],ruleIds:[]};next.bindings.push(binding);}
    binding.products.push({productId:id,classification});return next;
  }
  function diffImport(current,incoming) {
    const prepared=clone(incoming), warnings=[];
    for (const product of [...prepared.products]) if (!product.selectors.length) {
      warnings.push(product.name);prepared.products=prepared.products.filter(item=>item.id!==product.id);
      const ruleId=`candidate-${product.id}`;
      prepared.rules.push({id:ruleId,name:product.name,kind:'type',match:{operator:'all',conditions:[{field:'productName',value:product.name}]},exclude:[],mode:'suggestion',classification:'unclassified',type:product.type,enabled:true,source:'import-candidate',reason:'仅名称，需要确认可信身份'});
      for(const binding of prepared.bindings){if(!binding.ruleIds.includes(ruleId))binding.ruleIds.push(ruleId);binding.products=binding.products.filter(item=>item.productId!==product.id);}
    }
    const changes=[];
    for(const kind of ['products','rules'])for(const item of prepared[kind]){const old=current[kind].find(entry=>entry.id===item.id);if(!same(old,item))changes.push({key:`${kind}:${item.id}`,kind,name:item.name,change:old?'modify':'add'});}
    return {incoming:prepared,changes,warnings};
  }
  function selectedImport(current,incoming,selected) {
    if(!selected.length)throw new Error('请逐项选择要批准的变更');
    for(const rule of incoming.rules)if(selected.includes(`rules:${rule.id}`)){const old=current.rules.find(item=>item.id===rule.id);if(old&&!same(old,rule)&&current.bindings.some(binding=>!incoming.bindings.some(target=>target.childId===binding.childId)&&binding.ruleIds.includes(rule.id)))throw new Error('此规则被未选孩子批准，请使用新规则 ID 或明确选择涉及孩子；不能覆盖其他孩子');}
    const next=clone(current);
    for(const kind of ['products','rules'])for(const item of incoming[kind])if(selected.includes(`${kind}:${item.id}`)){next[kind]=next[kind].filter(entry=>entry.id!==item.id);next[kind].push(item);}
    for(const binding of incoming.bindings){let target=next.bindings.find(item=>item.childId===binding.childId);if(!target){target={childId:binding.childId,products:[],ruleIds:[]};next.bindings.push(target);}for(const ruleId of binding.ruleIds)if(selected.includes(`rules:${ruleId}`)&&!target.ruleIds.includes(ruleId))target.ruleIds.push(ruleId);}
    return next;
  }
  function scopeImport(incoming,childIds){if(!childIds.length)throw new Error('请明确选择导入目标孩子');return {...clone(incoming),bindings:childIds.map(childId=>({childId,products:[],ruleIds:(incoming.rules||[]).map(rule=>rule.id)}))};}
  function reviseRule(current,rule,childIds,oldId){
    const next=clone(current);next.rules.push(rule);
    for(const childId of childIds){let binding=next.bindings.find(item=>item.childId===childId);if(!binding){binding={childId,products:[],ruleIds:[]};next.bindings.push(binding);}binding.ruleIds=binding.ruleIds.filter(id=>id!==oldId);if(!binding.ruleIds.includes(rule.id))binding.ruleIds.push(rule.id);}
    return next;
  }
  function toggleApproval(current,ruleId,childId,newId){
    const next=clone(current),rule=next.rules.find(item=>item.id===ruleId);if(!rule)throw new Error('规则已变化，请重新加载');
    let binding=next.bindings.find(item=>item.childId===childId);if(!binding){binding={childId,products:[],ruleIds:[]};next.bindings.push(binding);}
    if(rule.enabled&&binding.ruleIds.includes(ruleId))binding.ruleIds=binding.ruleIds.filter(id=>id!==ruleId);
    else if(rule.enabled)binding.ruleIds.push(ruleId);
    else {const enabled={...rule,id:newId,enabled:true};next.rules.push(enabled);binding.ruleIds=binding.ruleIds.filter(id=>id!==ruleId);binding.ruleIds.push(newId);}
    return next;
  }
  function editedConditions(old,anchors,selected,productName){
    const represented=condition=>anchors.some(anchor=>anchor.field===condition.field&&anchor.value===condition.value);
    const firstName=old?.match.conditions.find(condition=>condition.field==='productName');
    const retained=(old?.match.conditions||[]).filter(condition=>!represented(condition)&&condition!==firstName);
    const conditions=[...retained,...selected];
    if(productName.trim())conditions.push({field:'productName',value:productName.trim()});
    return conditions.filter((condition,index)=>conditions.findIndex(item=>same(item,condition))===index);
  }
  function unlinkVariant(current,productId,selectorIndex,childIds=[]){
    const next=clone(current),product=next.products.find(item=>item.id===productId);
    if(!product||!product.selectors[selectorIndex])throw new Error('关联已变化，请重新加载');
    if(product.selectors.length>1){product.selectors.splice(selectorIndex,1);return next;}
    if(next.rules.some(rule=>rule.productId===productId))throw new Error('此产品仍被规则引用，请先调整相关规则；不创建悬空引用');
    if(next.bindings.some(binding=>!childIds.includes(binding.childId)&&binding.products.some(item=>item.productId===productId)))throw new Error('最后的身份范围被其他孩子明确分类引用，请选择涉及孩子后逐项确认；不能隐式删除孩子配置');
    for(const binding of next.bindings)if(childIds.includes(binding.childId))binding.products=binding.products.filter(item=>item.productId!==productId);
    next.products=next.products.filter(item=>item.id!==productId);return next;
  }
  function mount({request:send,getContext,onSaved:notifySaved,onError:reportError,mock,root=globalThis.document}) {
    const document=root.ownerDocument||root;
    const $=selector=>root.querySelector(selector), all=selector=>[...root.querySelectorAll(selector)];
    let disposed=false;
    const contextKey=()=>JSON.stringify([getContext().childId,getContext().contextRevision??null]);
    let mountedContext;
    const active=()=>!disposed&&(mountedContext===undefined||contextKey()===mountedContext);
    const lease=()=>{if(!active())throw stale();if(mountedContext===undefined)mountedContext=contextKey();return mountedContext;};
    const stale=()=>Object.assign(new Error('组件上下文已变化，请重新读取'),{code:'COMPONENT_CONTEXT_CHANGED'});
    const assertCurrent=key=>{if(disposed||key!==contextKey())throw stale();};
    const request=async(...args)=>{const key=lease();let value;try{value=await send(...args);}catch(error){assertCurrent(key);throw error;}assertCurrent(key);return value;};
    const onSaved=async value=>{const key=lease();await notifySaved(value);assertCurrent(key);};
    const onError=error=>{if(active()&&error.code!=='COMPONENT_CONTEXT_CHANGED')reportError(error);};
    const handleError=error=>{if(active()&&error.code!=='COMPONENT_CONTEXT_CHANGED'){notice(error.message);onError(error);}};
    const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    let knowledge=empty(),observations=[],etag='"application-knowledge-v0"',priorVersion=null,preview=null,importPayload=null,editingRule=null,busy=false;
    const classOptions=(selected='unclassified')=>Object.entries(labels).map(([key,label])=>`<option value="${key}"${key===selected?' selected':''}>${label}</option>`).join('');
    const typeOptions=()=>Object.entries(types).map(([key,label])=>`<option value="${key}">${label}</option>`).join('');
    const productOptions=()=>knowledge.products.map((item,index)=>`<option value="${index}">${esc(item.name)}</option>`).join('');
    const children=()=>getContext().children.map((child,index)=>`<label><input type="checkbox" class="knowledge-child" value="${index}"${child.id===getContext().childId?' checked':''}> ${esc(child.name)}</label>`).join('');
    const targetChildren=()=>all('#product-panel .knowledge-child:checked').map(input=>getContext().children[Number(input.value)].id);
    const ruleChildren=()=>all('#rule-panel .knowledge-child:checked').map(input=>getContext().children[Number(input.value)].id);
    async function load() {
      const key=lease();
      if(mock){if(!observations.length){observations=getContext().mockInventory;knowledge=withDefaultRecommendations(getContext().mockKnowledge);}return;}
      const [data,inventory]=await Promise.all([request('/v2/module/application-knowledge'),request('/v2/module/application-inventory')]);
      assertCurrent(key);
      knowledge=withDefaultRecommendations(data);observations=inventory.observations;etag=`"application-knowledge-v${knowledge.version}"`;
    }
    async function publish(next,action='confirm',options={}) {
      const key=lease();if(busy)return;busy=true;const previous=knowledge.version;
      try{knowledge=mock?{...next,version:previous+1}:await request('/v2/module/application-knowledge/operations',{method:'POST',headers:{'If-Match':etag},body:JSON.stringify({action,knowledge:next,...options})});
        assertCurrent(key);priorVersion=previous;etag=`"application-knowledge-v${knowledge.version}"`;await onSaved(knowledge);assertCurrent(key);renderProducts();renderRules();notice('分类已保存；设备实际应用新策略后向前生效');
      }finally{busy=false;}
    }
    async function confirmChanges(next,message,action='confirm',options={}){
      const key=lease();
      const result=mock?{hits:observations.filter(item=>!same(knowledge.products.filter(product=>matched(product,item.evidence)).map(product=>product.id),next.products.filter(product=>matched(product,item.evidence)).map(product=>product.id)))}:await request('/v2/module/application-knowledge/operations',{method:'POST',headers:{'If-Match':etag},body:JSON.stringify({action,knowledge:next,preview:true,...options})});
      assertCurrent(key);
      if(result.migrationConflicts?.length)throw new Error(`旧技术身份分类存在 ${result.migrationConflicts.length} 项冲突；请先逐项确认，不能自动提升为产品配置`);
      const sample=result.hits.slice(0,8).map(item=>`${item.displayName||item.evidence.displayName} · ${(item.platform||item.evidence.platform)==='macos'?'macOS':'Windows'}${item.after?` · ${getContext().children[item.childIndex]?.name||'目标孩子'} · ${labels[item.before.classification]} → ${labels[item.after.classification]} · ${resolutionLabels[item.after.status]}`:''}`).join('\n');
      return confirm(`${message}\n当前改变的命中观察：${result.hits.length}${sample?'\n'+sample:''}\n历史账本不改写；保存后需等待设备实际应用。`);
    }
    function notice(message){if(!active())return;for(const selector of ['#product-notice','#rule-notice']){const box=$(selector);if(box){box.textContent=message;box.hidden=false;}}}
    function bindingClass(productId){return knowledge.bindings.find(item=>item.childId===getContext().childId)?.products.find(item=>item.productId===productId)?.classification??'unclassified';}
    function renderProducts(){
$('#product-panel').innerHTML=`<p id="product-notice" class="notice" hidden></p><div class="knowledge-filter"><input id="product-search" type="search" placeholder="搜索产品或已发现应用" aria-label="搜索产品或已发现应用"><button id="knowledge-reload">重新加载</button>${priorVersion!==null?'<button id="knowledge-undo">撤销上次关联</button>':''}</div><h3>已确认产品</h3><div id="confirmed-products">${knowledge.products.map((product,index)=>`<article class="knowledge-item"><div><strong>${esc(product.name)}</strong><small>${types[product.type]} · ${product.selectors.length} 个可信范围 · ${[...new Set(product.selectors.map(item=>item.platform==='macos'?'macOS':'Windows'))].join(' / ')}</small></div><label>当前孩子分类<select data-product-class="${index}">${classOptions(bindingClass(product.id))}</select></label><details><summary>变种及覆盖范围</summary>${product.selectors.map((selector,scopeIndex)=>`<div class="variant-row"><span>${selector.platform==='macos'?'macOS':'Windows'} · ${selector.match.conditions.map(item=>({binaryHash:'当前文件／版本',packageId:'平台包身份',signerKey:'已核实签名者',productName:'稳定产品名称',runtimeIdentity:'已确认技术身份'}[item.field]||'辅助线索')).join(' + ')}</span><button data-split-product="${index}" data-split-selector="${scopeIndex}">拆为独立产品</button><button data-unlink-product="${index}" data-unlink-selector="${scopeIndex}">解除错误关联</button></div>`).join('')}</details></article>`).join('')||'<p class="empty">尚无确定性产品；从下面的发现清单确认，或导入带可靠身份条件的规则包。</p>'}</div><section class="knowledge-editor"><h3>确认产品／加入已确认变种</h3><p>同文件可移动、改名；跨版本和套壳必须有可靠依据，启动器不自动代表其游戏。</p><label>已发现应用<select id="confirm-observation">${observations.map((item,index)=>`<option value="${index}">${esc(item.evidence.displayName)} · ${item.evidence.platform==='macos'?'macOS':'Windows'}</option>`).join('')}</select></label><label>产品<select id="confirm-existing"><option value="">新产品</option>${productOptions()}</select></label><label>新产品名称<input id="confirm-name" maxlength="256"></label><label>主要类型<select id="confirm-type">${typeOptions()}</select></label><label>覆盖范围<select id="confirm-scope"><option value="file">当前文件／版本</option><option value="series">有可靠身份依据的产品系列</option></select></label><label>孩子分类<select id="confirm-class">${classOptions()}</select></label><fieldset><legend>明确应用到（其他孩子不修改）</legend>${children()}</fieldset><button id="confirm-product" class="primary"${observations.length?'':' disabled'}>预览并确认产品</button></section><section class="knowledge-editor"><h3>合并产品</h3><p>只在明确关联依据下操作；分类冲突或其他孩子的明确配置必须先处理。</p><label>来源产品<select id="merge-source">${productOptions()}</select></label><label>目标产品<select id="merge-target">${productOptions()}</select></label><button id="merge-products"${knowledge.products.length>1?'':' disabled'}>预览并合并</button></section><h3>完整已发现清单</h3><p>安装盘点不生成时长。扫描失败不等于卸载；便携程序由使用观察补充。</p><div id="discovered-applications">${observations.map(item=>{const related=knowledge.products.filter(product=>matched(product,item.evidence));return `<article class="knowledge-item"><div><strong>${esc(item.evidence.displayName)}</strong><small>${item.evidence.platform==='macos'?'macOS':'Windows'} · ${item.status==='installed'?'已安装':item.status==='runtimeObserved'?'运行时发现':'当前未发现'} · ${related.length===1?`已确认 ${esc(related[0].name)}`:related.length>1?'关联冲突，需要确认':'未关联产品／变种候选'}</small></div></article>`;}).join('')||'<p class="empty">暂无安装观察；旧设备可能缺少应用发现能力。</p>'}</div>`;
      all('#confirmed-products .knowledge-item').forEach((element,index)=>{
        const product=knowledge.products[index],choice=knowledge.bindings.find(item=>item.childId===getContext().childId)?.products.find(item=>item.productId===product.id);
        if(choice?.classification!=='blocked')return;
        const row=document.createElement('div');row.className='variant-row';
        row.innerHTML=`<small>产品级封锁：已确认身份由支持该能力的设备执行。疑似变体：${choice.enhancedBlocking?'已明确开启':'关闭'}；两项审核线索仍有误判风险。</small><button data-enhanced-product="${index}">${choice.enhancedBlocking?'关闭强化封锁':'审核并开启强化封锁'}</button>`;
        element.append(row);
      });
      const migrateLabel=document.createElement('label');
      migrateLabel.innerHTML='<input id="confirm-migrate-explicit" type="checkbox"> 将已确认属于该产品的旧技术身份分类迁为产品配置（冲突会阻止保存）；仅新策略移去冗余精确黑名单，历史不改';
      $('#confirm-product').before(migrateLabel);
    }
    function renderRules(){
      const anchors=observations.flatMap((item,observationIndex)=>item.evidence.verifiedFields.filter(field=>['binaryHash','packageId','distributionKey','signerKey'].includes(field)).map(field=>({observationIndex,field,value:item.evidence.values[field]})));
      $('#rule-panel').innerHTML=`<p id="rule-notice" class="notice" hidden></p><p class="notice">系统默认：系统应用归为复合；已确认的游戏、游戏平台和游戏工具归为受限娱乐。单个应用明确分类和更高优先级规则可以覆盖。</p><div class="knowledge-filter"><input id="rule-search" type="search" placeholder="搜索规则名称或来源" aria-label="搜索规则名称或来源"><label class="button">导入规则包<input id="import-rules" type="file" accept="application/json" hidden></label></div><div id="classification-rules">${knowledge.rules.map((rule,index)=>{const hitCount=rule.kind==='type'?knowledge.products.filter(product=>product.type===rule.type).length:observations.filter(item=>rule.match.conditions.length&&rule.match.conditions.every(condition=>(condition.field==='runtimeIdentity'?item.evidence.runtimeIdentity:item.evidence.values[condition.field])===condition.value)).length;return `<article class="knowledge-item"><div><strong>${esc(rule.name)}</strong><small>${rule.enabled?'已启用':'已关闭'} · ${rule.mode==='automatic'?'自动':'仅建议'} · ${rule.kind==='type'?`产品类型：${types[rule.type]}`:'身份规则'} → ${labels[rule.classification]} · 当前命中 ${hitCount} 个产品 · ${esc(rule.source)}</small><p>${esc(rule.reason)}</p></div><button data-edit-rule="${index}">编辑</button><button data-toggle-rule="${index}">${rule.enabled?'关闭':'启用'}</button></article>`;}).join('')||'<p class="empty">暂无家庭自定义分类规则；系统默认分类仍然生效。</p>'}</div><section class="knowledge-editor"><h3>${editingRule===null?'新增规则':'编辑规则'}</h3><label>规则名称<input id="rule-name" maxlength="256"></label><label>匹配层级<select id="rule-kind"><option value="product">精确产品</option><option value="family">限定产品系列</option><option value="developer">已核实开发者</option><option value="type">产品类型</option></select></label><label>确定性产品<select id="rule-product"><option value="">不限定产品</option>${productOptions()}</select></label><label>条件组合<select id="rule-operator"><option value="all">全部满足</option><option value="any">任一满足</option></select></label><fieldset><legend>可靠身份条件（类型规则无需选择）</legend>${anchors.map((anchor,index)=>`<label><input type="checkbox" class="rule-anchor" value="${index}"> ${esc(observations[anchor.observationIndex].evidence.displayName)} · ${{binaryHash:'文件／版本',packageId:'平台包身份',distributionKey:'发行平台产品',signerKey:'已核实签名者'}[anchor.field]}</label>`).join('')||'暂无可靠身份；类型规则使用云端已确认产品类型'}</fieldset><label>辅助产品名称（可留空）<input id="rule-product-name" maxlength="256"></label><label>排除产品<select id="rule-exclude"><option value="">不排除</option>${productOptions()}</select></label><label>规则模式<select id="rule-mode"><option value="suggestion">仅建议</option><option value="automatic">自动</option></select></label><label>结果<select id="rule-class">${classOptions()}</select></label><label>客观产品类型<select id="rule-type">${typeOptions()}</select></label><label>来源<input id="rule-source" value="parent-confirmed" maxlength="256"></label><label>解释／关联依据<input id="rule-reason" maxlength="256"></label><fieldset><legend>批准应用到孩子</legend>${children()}</fieldset><button id="save-rule" class="primary">预览并保存规则</button>${editingRule!==null?'<button id="cancel-rule-edit">取消编辑</button>':''}</section><div id="rule-import-review"></div>`;
      $('#rule-panel').anchors=anchors;
      const platformLabel=document.createElement('label');platformLabel.innerHTML='适用平台<select id="rule-platform"><option value="">两个平台</option><option value="windows">Windows</option><option value="macos">macOS</option></select>';$('#rule-kind').closest('label').after(platformLabel);
      $('#rule-platform').value=editingRule===null?'':knowledge.rules[editingRule].platform||'';
      if(editingRule!==null){const keep=document.createElement('option');keep.value='keep';keep.textContent=`保留既有排除（${knowledge.rules[editingRule].exclude.length} 项）`;$('#rule-exclude').prepend(keep);$('#rule-exclude').value='keep';const retained=document.createElement('p');retained.textContent='未在当前发现清单中显示的原有匹配条件会保留；保存不会因缺少安装观察扩大规则。';$('#rule-operator').closest('label').after(retained);}
      const enabledLabel=document.createElement('label');enabledLabel.innerHTML='<input id="rule-enabled" type="checkbox" checked> 启用规则';$('#save-rule').before(enabledLabel);
      all('#classification-rules .knowledge-item').forEach((element,index)=>{const rule=knowledge.rules[index],approved=knowledge.bindings.find(item=>item.childId===getContext().childId)?.ruleIds.includes(rule.id)&&rule.enabled;const hint=document.createElement('p');hint.textContent=approved?'当前孩子已批准':'家庭规则模板，当前孩子未批准';element.firstElementChild.append(hint);element.querySelector('[data-toggle-rule]').textContent=approved?'停用当前孩子':'批准当前孩子';});
      if(editingRule!==null){const rule=knowledge.rules[editingRule];for(const [field,id]of [['name','rule-name'],['kind','rule-kind'],['mode','rule-mode'],['classification','rule-class'],['type','rule-type'],['source','rule-source'],['reason','rule-reason']])$(`#${id}`).value=rule[field];$('#rule-operator').value=rule.match.operator;$('#rule-product-name').value=rule.match.conditions.find(item=>item.field==='productName')?.value||'';$('#rule-product').value=rule.productId?String(knowledge.products.findIndex(item=>item.id===rule.productId)):'';all('.rule-anchor').forEach(input=>{const anchor=anchors[Number(input.value)];input.checked=rule.match.conditions.some(item=>item.field===anchor.field&&item.value===anchor.value);});all('#rule-panel .knowledge-child').forEach(input=>{input.checked=knowledge.bindings.find(item=>item.childId===getContext().children[Number(input.value)].id)?.ruleIds.includes(rule.id)||false;});}
      if(editingRule!==null)$('#rule-enabled').checked=knowledge.rules[editingRule].enabled;
    }
    let instanceGeneration=0,instancePage=null,ownershipGeneration=0,ownershipDraft=null,ownershipVersion=null,ownershipPreview=null;
    const ownershipStatus={confirmed:'已确认',pending:'待更新',unresolved:'未识别',conflict:'归属冲突'};
    function invalidateOwnership(){ownershipGeneration++;ownershipPreview=null;}
    function renderOwnership(message=''){
      const panel=$('#ownership-panel');if(!panel)return;
      if(!ownershipDraft){panel.innerHTML=`<p role="status">${esc(message)}</p>`;return;}
      const options=ownershipEvidenceOptions(instancePage?.items||[]);
      panel.innerHTML=`<section class="knowledge-editor"><h3>产品归属规则草稿</h3><p>未保存、未生效。规则可跨孩子复用；只在云端预览，不直接修改实例归属。</p><p role="status">${esc(message||`基于目录版本 ${ownershipVersion}`)}</p>
        <label>已核验依据<select id="ownership-evidence"><option value="">请选择依据</option>${options.map((option,index)=>`<option value="${index}">${esc(option.platform+' · '+option.label+' · '+Object.values(option.match).slice(1).join(' / '))}</option>`).join('')}</select></label>
        <label>目标应用身份<select id="ownership-product"><option value="">新建产品草稿</option>${ownershipDraft.products.map((product,index)=>`<option value="${index}">${esc(product.name)}</option>`).join('')}</select></label>
        <label>新产品名称（选择已有产品时忽略）<input id="ownership-name" maxlength="256"></label><button id="ownership-add"${options.length?'':' disabled'}>加入规则草稿</button>
        <p>修改规则、刷新实例或关闭对话框会清除旧预览；草稿仅保留在当前对话框。</p></section>
        <div>${ownershipDraft.ownershipRules.map((rule,index)=>`<article class="knowledge-item"><div><strong>${esc(ownershipDraft.products.find(product=>product.id===rule.productId)?.name||rule.productId)}</strong><small>${esc(rule.platform)} · ${rule.enabled?'草稿启用':'草稿停用'}</small><pre class="instance-evidence">${esc(JSON.stringify(rule.match,null,2))}</pre></div><button data-ownership-toggle="${index}">${rule.enabled?'停用草稿':'恢复草稿'}</button><button data-ownership-remove="${index}">移除草稿规则</button></article>`).join('')||'<p>暂无归属规则。</p>'}</div>
        <div class="knowledge-filter"><button id="ownership-preview">云端预览当前孩子</button><button id="ownership-preview-next"${ownershipPreview?.nextAfterInstanceId?'':' disabled'}>预览下一页</button></div>
        <div aria-live="polite">${ownershipPreview?`<p>仅预览本页 ${ownershipPreview.items.length} 个实例，尚未生效。</p>${ownershipPreview.items.map(item=>{
          const describe=value=>`${ownershipStatus[value.status]||'未知'}${value.productId?' · '+(ownershipDraft.products.find(product=>product.id===value.productId)?.name||value.productId):''}`;
          return `<article class="knowledge-item"><div><small>${esc(item.instanceId.slice(0,12))}</small><p>${esc(describe(item.before))} → ${esc(describe(item.after))}</p></div></article>`;
        }).join('')}`:''}</div>`;
    }
    async function openOwnership(){
      const key=lease(),generation=++ownershipGeneration;ownershipDraft=null;ownershipPreview=null;
      renderOwnership('正在读取集中规则目录…');
      try{
        const data=await request('/v2/module/program-instance-catalog');assertCurrent(key);
        if(generation!==ownershipGeneration||!$('#instance-dialog').open)return;
        if(data.state==='legacy'){renderOwnership('现有目录尚待集中切换，不能自动把旧身份规则当成新版规则。实例仍可正常浏览。');return;}
        if(!Number.isSafeInteger(data.version)||data.version<0||!['available','empty'].includes(data.state)
          ||(data.state==='available'&&(data.catalog?.schemaVersion!==4||data.catalog.version!==data.version)))throw new Error('INVALID_CATALOG');
        ownershipVersion=data.version;ownershipDraft=data.state==='empty'?{schemaVersion:4,version:0,products:[],ownershipRules:[],rules:[],bindings:[]}:clone(data.catalog);
        renderOwnership();
      }catch(error){if(active()&&generation===ownershipGeneration&&error.code!=='COMPONENT_CONTEXT_CHANGED')renderOwnership(`目录读取失败：${error.code||'PROGRAM_INSTANCE_CATALOG_UNAVAILABLE'}`);}
    }
    async function previewOwnership(next=false){
      if(!ownershipDraft)return;
      const key=lease(),cursor=next?ownershipPreview?.nextAfterInstanceId:null;if(next&&!cursor)return;
      const generation=++ownershipGeneration;ownershipPreview=null;renderOwnership('正在运行云端只读预览…');
      try{
        const page=await request(`/v2/module/program-instance-catalog/preview?childId=${encodeURIComponent(getContext().childId)}${cursor?`&afterInstanceId=${encodeURIComponent(cursor)}`:''}`,
          {method:'POST',headers:{'If-Match':`"application-knowledge-v${ownershipVersion}"`},body:JSON.stringify({catalog:ownershipDraft})});
        assertCurrent(key);if(generation!==ownershipGeneration||!$('#instance-dialog').open)return;
        if(page.preview!==true||page.childId!==getContext().childId||page.catalogVersion!==ownershipVersion||!Array.isArray(page.items))throw new Error('INVALID_PREVIEW');
        ownershipPreview=page;renderOwnership();
      }catch(error){if(active()&&generation===ownershipGeneration&&error.code!=='COMPONENT_CONTEXT_CHANGED')renderOwnership(`预览失败：${error.code||'PROGRAM_INSTANCE_PREVIEW_UNAVAILABLE'}；草稿尚未生效。`);}
    }
    function renderInstances(message='') {
      const items=instancePage?.items||[];
      $('#instance-panel').innerHTML=`<p>未识别不影响原始落账和基础统计。纠错应修正规则或采集依据，不直接修改实例归属。</p><p role="status">${esc(message||`目录版本：${instancePage?.catalogVersion??'尚无新版目录'}`)}</p><div class="knowledge-filter"><button id="instances-refresh">刷新／重试</button><button id="instances-next"${instancePage?.nextAfterInstanceId?'':' disabled'}>下一页</button><button id="ownership-open"${items.length?'':' disabled'}>规则草稿与预览</button></div>${items.map(item=>`<article class="knowledge-item"><div><strong>${esc(item.status==='confirmed'?item.product?.name:'未识别程序实例')}</strong><small>${item.platform==='macos'?'macOS':'Windows'} · ${{confirmed:'已确认',pending:'待更新',unresolved:'未识别',conflict:'归属冲突'}[item.status]||'未知状态'} · ${esc(item.instanceId.slice(0,12))}</small><details><summary>实例与核验依据</summary><p class="instance-evidence">实例：${esc(item.instanceId)}<br>电脑：${esc(item.machineId)}<br>证据修订：${esc(item.evidenceRevision)}</p><pre class="instance-evidence">${esc(JSON.stringify(item.evidence,null,2))}</pre></details></div></article>`).join('')||'<p class="empty">尚无可显示的已登记实例；不代表使用时长为零。</p>'}<div id="ownership-panel"></div>`;
    }
    async function readInstances(next=false) {
      const key=lease(),generation=++instanceGeneration,cursor=next?instancePage?.nextAfterInstanceId:null;
      if(next&&!cursor)return;
      invalidateOwnership();ownershipDraft=null;
      const version=instancePage?.catalogVersion;
      if(!next)instancePage=null;
      renderInstances('正在读取程序实例…');
      try {
        const page=await request(`/v2/module/program-instances?childId=${encodeURIComponent(getContext().childId)}${cursor?`&afterInstanceId=${encodeURIComponent(cursor)}`:''}`);
        assertCurrent(key);if(generation!==instanceGeneration||!$('#instance-dialog').open)return;
        if(page.childId!==getContext().childId||!Array.isArray(page.items))throw new Error('程序实例响应范围不一致');
        if(next&&page.catalogVersion!==version){instancePage=null;renderInstances('目录已更新，请刷新后重新浏览');return;}
        instancePage=page;renderInstances();
      } catch(error) {
        if(!active()||generation!==instanceGeneration||error.code==='COMPONENT_CONTEXT_CHANGED'||!$('#instance-dialog').open)return;
        renderInstances(`程序实例读取失败：${error.code||'PROGRAM_INSTANCES_UNAVAILABLE'}。请重试。`);
      }
    }
    async function open(kind){const key=lease();if(kind==='instance'){$('#instance-dialog').showModal();await readInstances();return;}await load();assertCurrent(key);if(kind==='product')renderProducts();else renderRules();$(`#${kind}-dialog`).showModal();}
    async function perform(button){
      if(button.id==='open-products')await open('product');if(button.id==='open-rules')await open('rule');
      if(button.id==='open-instances')await open('instance');
      if(button.id==='instances-refresh')await readInstances();
      if(button.id==='instances-next')await readInstances(true);
      if(button.id==='ownership-open')await openOwnership();
      if(button.id==='ownership-preview')await previewOwnership();
      if(button.id==='ownership-preview-next')await previewOwnership(true);
      if(button.id==='ownership-add'){
        try{
          const option=ownershipEvidenceOptions(instancePage?.items||[])[$('#ownership-evidence').value];
          const product=ownershipDraft?.products[$('#ownership-product').value];
          const next=addOwnershipDraft(ownershipDraft,option,{productId:product?.id,name:$('#ownership-name').value,
            ruleId:`ownership-${crypto.randomUUID()}`,newProductId:`product-${crypto.randomUUID()}`});
          invalidateOwnership();ownershipDraft=next;renderOwnership('已更新内存草稿，请重新预览；未保存。');
        }catch(error){renderOwnership(error.message);}
      }
      if(button.dataset.ownershipToggle!==undefined||button.dataset.ownershipRemove!==undefined){
        const index=Number(button.dataset.ownershipToggle??button.dataset.ownershipRemove),rule=ownershipDraft?.ownershipRules[index];
        if(!rule)return;invalidateOwnership();
        if(button.dataset.ownershipRemove!==undefined)ownershipDraft.ownershipRules.splice(index,1);
        else{rule.enabled=!rule.enabled;rule.revision++;}
        renderOwnership('已更新内存草稿，请重新预览；未保存。');
      }
      if(button.dataset.knowledgeClose==='instance-dialog'){instanceGeneration++;invalidateOwnership();ownershipDraft=null;}
      if(button.dataset.knowledgeClose)$(`#${button.dataset.knowledgeClose}`).close();
      if(button.id==='knowledge-reload'){await load();renderProducts();renderRules();}
      if(button.id==='confirm-product'){
        const item=observations[Number($('#confirm-observation').value)],childIds=targetChildren();if(!childIds.length)throw new Error('请明确选择孩子');
        const existing=knowledge.products[Number($('#confirm-existing').value)];
        const next=confirmProduct(knowledge,{evidence:item.evidence,scope:$('#confirm-scope').value,productId:$('#confirm-existing').value===''?null:existing.id,name:$('#confirm-name').value,type:$('#confirm-type').value,classification:$('#confirm-class').value,childIds,id:`product-${crypto.randomUUID()}`});
        const options=$('#confirm-migrate-explicit').checked?{migrateExplicitClassifications:true,migrateChildIds:childIds}:{};
        if(await confirmChanges(next,`确认 ${item.evidence.displayName}，覆盖${$('#confirm-scope').value==='file'?'当前文件／版本':'可信产品系列'}，分类为${labels[$('#confirm-class').value]}？仅修改：${getContext().children.filter(child=>childIds.includes(child.id)).map(child=>child.name).join('、')}。`,'confirm',options))await publish(next,'confirm',options);
      }
      if(button.id==='merge-products'){const source=knowledge.products[Number($('#merge-source').value)],target=knowledge.products[Number($('#merge-target').value)];const next=mergeProducts(knowledge,source.id,target.id,getContext().childId);if(await confirmChanges(next,`将 ${source.name} 的可信范围并入 ${target.name}？旧历史不重写，可撤销。`,'merge'))await publish(next,'merge');}
      if(button.dataset.splitProduct!==undefined){const product=knowledge.products[Number(button.dataset.splitProduct)],name=prompt('新产品名称（只拆所选可信范围；分类仅配置当前孩子）');if(name){const next=splitVariant(knowledge,product.id,Number(button.dataset.splitSelector),{id:`product-${crypto.randomUUID()}`,name,childId:getContext().childId,classification:bindingClass(product.id)});if(await confirmChanges(next,`拆分所选可信范围为 ${name}？`,'split'))await publish(next,'split');}}
      if(button.id==='knowledge-undo'&&confirm('恢复上次操作前的家庭产品／规则版本？后续账本不改写。')){if(mock){throw new Error('Mock 撤销由受控测试验证；真实页面使用服务器不可变版本');}knowledge=await request('/v2/module/application-knowledge/operations',{method:'POST',headers:{'If-Match':etag},body:JSON.stringify({action:'undo',restoreVersion:priorVersion})});etag=`"application-knowledge-v${knowledge.version}"`;priorVersion=null;await onSaved(knowledge);renderProducts();renderRules();}
      if(button.dataset.toggleRule!==undefined){const rule=knowledge.rules[Number(button.dataset.toggleRule)];if(confirm('只改变当前孩子对此规则的批准，不修改其他孩子。继续？'))await publish(toggleApproval(knowledge,rule.id,getContext().childId,`rule-${crypto.randomUUID()}`));}
      if(button.dataset.editRule!==undefined){editingRule=Number(button.dataset.editRule);renderRules();$('#rule-name').focus();}
      if(button.dataset.unlinkProduct!==undefined){const product=knowledge.products[Number(button.dataset.unlinkProduct)],selected=targetChildren(),next=unlinkVariant(knowledge,product.id,Number(button.dataset.unlinkSelector),selected);if(await confirmChanges(next,`解除 ${product.name} 的所选家庭身份关联？最后范围涉及的明确分类仅删除已勾选孩子：${getContext().children.filter(child=>selected.includes(child.id)).map(child=>child.name).join('、')}。`))await publish(next);}
      if(button.dataset.enhancedProduct!==undefined){
        const product=knowledge.products[Number(button.dataset.enhancedProduct)],childId=getContext().childId;
        const current=knowledge.bindings.find(item=>item.childId===childId)?.products.find(item=>item.productId===product.id);
        if(current?.enhancedBlocking){const next=clone(knowledge);delete next.bindings.find(item=>item.childId===childId).products.find(item=>item.productId===product.id).enhancedBlocking;if(confirm(`关闭 ${product.name} 的疑似变体强化封锁？已确认身份仍保持产品级封锁。`))await publish(next);}
        else{const next=enableEnhancedBlocking(knowledge,product.id,childId,observations);if(await confirmChanges(next,`为 ${product.name} 开启疑似变体强化封锁？须同时匹配已验证签名与精确 PE 产品信息，仍可能误判；只对当前孩子生效。`))await publish(next);}
      }
      if(button.id==='cancel-rule-edit'){editingRule=null;renderRules();}
      if(button.id==='save-rule'){
        const old=editingRule===null?null:knowledge.rules[editingRule],anchors=$('#rule-panel').anchors;
        let conditions=editedConditions(old,anchors,all('.rule-anchor:checked').map(input=>{const anchor=anchors[Number(input.value)];return{field:anchor.field,value:anchor.value};}),$('#rule-product-name').value);
        const product=$('#rule-product').value===''?null:knowledge.products[Number($('#rule-product').value)];
        const typeRule=$('#rule-kind').value==='type';
        if(!conditions.length&&!product&&!typeRule)throw new Error('请选择身份条件或填写建议名称');
        if(typeRule&&$('#rule-type').value==='unknown')throw new Error('类型规则必须选择明确的客观产品类型');
        if(typeRule){conditions=[];}
        if($('#rule-mode').value==='automatic'&&!product&&(conditions.every(item=>item.field==='productName')||($('#rule-operator').value==='any'&&conditions.some(item=>item.field==='productName'))))throw new Error('弱证据不能单独自动归类，任一满足的每个分支都必须有可靠身份');
        const exclude=$('#rule-exclude').value==='keep'?old.exclude:$('#rule-exclude').value===''?[]:knowledge.products[Number($('#rule-exclude').value)].selectors.map(item=>item.match);
        const rule={id:`rule-${crypto.randomUUID()}`,name:$('#rule-name').value.trim(),kind:$('#rule-kind').value,...(product?{productId:product.id}:{}),match:{operator:$('#rule-operator').value,conditions},exclude,mode:$('#rule-mode').value,classification:$('#rule-class').value,type:$('#rule-type').value,enabled:$('#rule-enabled').checked,source:$('#rule-source').value.trim(),reason:$('#rule-reason').value.trim()};
        if($('#rule-platform').value)rule.platform=$('#rule-platform').value;
        if(!rule.name||!rule.source||!rule.reason)throw new Error('请填写规则名称、来源和可解释依据');
        const selected=ruleChildren();if(!selected.length)throw new Error('请明确选择目标孩子');
        const next=reviseRule(knowledge,rule,selected,old?.id);
        if(await confirmChanges(next,`保存 ${rule.mode==='automatic'?'自动':'建议'}规则“${rule.name}”，应用到：${getContext().children.filter(child=>selected.includes(child.id)).map(child=>child.name).join('、')}？其他孩子保留旧规则，明确产品分类不会被覆盖。`)){editingRule=null;await publish(next);}
      }
      if(button.id==='approve-rule-import'){
        const selected=all('#rule-import-review input:checked').map(input=>preview.changes[Number(input.value)].key);
        if(!selected.length)throw new Error('请逐项选择要批准的变更');
        if(mock)await publish(selectedImport(knowledge,preview.incoming,selected),'import');
        else{knowledge=await request('/v2/module/application-knowledge/import-approve',{method:'POST',headers:{'If-Match':etag},body:JSON.stringify({knowledge:importPayload,previewHash:preview.previewHash,selected})});etag=`"application-knowledge-v${knowledge.version}"`;await onSaved(knowledge);renderProducts();renderRules();notice('所选变更已批准；孩子明确分类未被覆盖');}
      }
    }
    const click=event=>{if(!active())return;const button=event.target.closest('button');if(button)perform(button).catch(handleError);};
    const change=event=>{if(!active())return;const input=event.target;
      // A file can finish reading after the host changes Child, before a
      // transport request exists; give file reads the same context lease.
      const files=input.files;
      if(input.id==='import-rules'&&files?.[0]){
        const key=lease(),file=files[0];
        const scopedFile={text:async()=>{const text=await file.text();assertCurrent(key);return text;}};
        return importRules(scopedFile).catch(handleError);
      }
      if(input.dataset.productClass!==undefined){const next=clone(knowledge),product=knowledge.products[Number(input.dataset.productClass)];setProductClassification(next,getContext().childId,product.id,input.value);publish(next).catch(onError);}
    };
    async function importRules(file){const selected=ruleChildren();importPayload=scopeImport(JSON.parse(await file.text()),selected);preview=mock?diffImport(knowledge,importPayload):await request('/v2/module/application-knowledge/import-preview',{method:'POST',body:JSON.stringify({knowledge:importPayload})});$('#rule-import-review').innerHTML=`<section class="knowledge-editor"><h3>导入差异（逐项批准）</h3><p>目标：${esc(getContext().children.filter(child=>selected.includes(child.id)).map(child=>child.name).join('、'))}；孩子明确配置不覆盖。${preview.warnings.length?`仅名称候选 ${preview.warnings.length} 项，不自动归类。`:''}</p>${preview.changes.map((item,index)=>`<label><input type="checkbox" value="${index}"> ${esc(item.name)} · ${item.change==='modify'?'修改':'新增'} · ${item.kind==='products'?'产品':'规则'}</label>`).join('')||'<p>没有新增或修改</p>'}<p>当前命中观察：${preview.hits?.length??0}（需实际应用策略后生效）</p>${previewHitsHTML(preview.hits||[],getContext().children)}<button id="approve-rule-import" class="primary"${preview.changes.length?'':' disabled'}>批准所选变更</button></section>`;$('#rule-import-review').scrollIntoView({block:'start'});}
    const input=event=>{if(!active())return;if(event.target.id==='product-search'){const query=event.target.value.toLowerCase();all('#confirmed-products .knowledge-item,#discovered-applications .knowledge-item').forEach(item=>{item.hidden=!item.textContent.toLowerCase().includes(query);});}if(event.target.id==='rule-search'){const query=event.target.value.toLowerCase();all('#classification-rules .knowledge-item').forEach(item=>{item.hidden=!item.textContent.toLowerCase().includes(query);});}};
    const listeners={click,change,input};
    for(const [type,handler]of Object.entries(listeners))root.addEventListener(type,handler);
    async function classify(productId,classification){const key=lease();await load();assertCurrent(key);const next=clone(knowledge);setProductClassification(next,getContext().childId,productId,classification);await publish(next);}
    function dispose(){if(disposed)return;disposed=true;for(const [type,handler]of Object.entries(listeners))root.removeEventListener(type,handler);for(const dialog of all('dialog[open]'))dialog.close();}
    return {open,publish,classify,dispose};
  }
  return {empty,withDefaultRecommendations,selectorFor,confirmProduct,enableEnhancedBlocking,mergeProducts,splitVariant,unlinkVariant,diffImport,selectedImport,scopeImport,reviseRule,toggleApproval,editedConditions,previewHitsHTML,ownershipEvidenceOptions,addOwnershipDraft,mount};
});

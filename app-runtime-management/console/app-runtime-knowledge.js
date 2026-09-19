(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppRuntimeKnowledge = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const labels = {study:'学习',composite:'复合',restrictedEntertainment:'受限娱乐',unclassified:'未归类',blocked:'黑名单'};
  const types = {game:'游戏',gameLauncher:'游戏平台／启动器',gameUtility:'游戏工具',onlineVideo:'在线视频',mediaPlayer:'影音播放器',other:'其他',unknown:'未知'};
  const resolutionLabels={explicit:'孩子明确分类',automatic:'自动规则',suggestion:'仅建议，不改变有效分类',conflict:'规则冲突，保留原有效分类',unclassified:'未归类'};
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function previewHitsHTML(hits,children){
    if(!hits.length)return '<p>暂无当前命中；预配置规则仍可在以后发现可靠身份时匹配。</p>';
    return `<div class="knowledge-hit-list">${hits.slice(0,100).map(hit=>`<article class="knowledge-item"><div><strong>${escapeHtml(hit.displayName)}</strong><small>${hit.platform==='macos'?'macOS':'Windows'} · ${escapeHtml(children[hit.childIndex]?.name||'目标孩子')}</small><p>${labels[hit.result.classification]} · ${resolutionLabels[hit.result.status]}</p></div></article>`).join('')}</div>${hits.length>100?'<p>仅列出前 100 条命中观察。</p>':''}`;
  }
  const clone = value => JSON.parse(JSON.stringify(value));
  const empty = () => ({schemaVersion:2,version:0,products:[],rules:[],bindings:[]});
  const defaultGameRule={id:'builtin.type.game.restricted-suggestion',name:'游戏建议归为受限娱乐',kind:'type',match:{operator:'all',conditions:[]},exclude:[],mode:'suggestion',classification:'restrictedEntertainment',type:'game',enabled:true,source:'Runtime 产品建议',reason:'只匹配云端已确认的游戏类型；批准后才自动应用到当前孩子'};
  function withDefaultRecommendations(value){const next=clone(value);next.schemaVersion=2;if(!next.rules.some(rule=>rule.id===defaultGameRule.id))next.rules.push(clone(defaultGameRule));return next;}
  const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
  function selectorFor(evidence,scope) {
    const verified = new Set(evidence.verifiedFields), values=evidence.values;
    let conditions;
    if (verified.has('distributionKey')) conditions=[{field:'distributionKey',value:values.distributionKey}];
    else if (scope==='file' && verified.has('binaryHash')) conditions=[{field:'binaryHash',value:values.binaryHash}];
    else if (verified.has('packageId')) conditions=[{field:'packageId',value:values.packageId}];
    else if (scope==='series' && verified.has('signerKey') && values.productName) conditions=[{field:'signerKey',value:values.signerKey},{field:'productName',value:values.productName}];
    else throw new Error('此范围缺少可靠身份依据；不能仅凭名称、路径或安装来源确认产品');
    return {platform:evidence.platform,match:{operator:'all',conditions}};
  }
  function confirmProduct(current,{evidence,scope,productId,name,type,classification,childIds,id}) {
    const next=clone(current), selector=selectorFor(evidence,scope);
    let product=next.products.find(item=>item.id===productId);
    if (!product) {if (!name.trim()) throw new Error('请输入产品名称'); product={id,name:name.trim(),type,selectors:[]};next.products.push(product);}
    if (!product.selectors.some(item=>same(item,selector))) product.selectors.push(selector);
    for (const childId of childIds) {
      let binding=next.bindings.find(item=>item.childId===childId);
      if (!binding) {binding={childId,products:[],ruleIds:[]};next.bindings.push(binding);}
      binding.products=binding.products.filter(item=>item.productId!==product.id);
      binding.products.push({productId:product.id,classification});
    }
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
    else if(rule.enabled){if(rule.id===defaultGameRule.id&&rule.mode==='suggestion')rule.mode='automatic';binding.ruleIds.push(ruleId);}
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
  function mount({request,getContext,onSaved,onError,mock}) {
    const $=selector=>document.querySelector(selector), all=selector=>[...document.querySelectorAll(selector)];
    const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    let knowledge=empty(),observations=[],etag='"application-knowledge-v0"',priorVersion=null,preview=null,importPayload=null,editingRule=null,busy=false;
    const classOptions=(selected='unclassified')=>Object.entries(labels).map(([key,label])=>`<option value="${key}"${key===selected?' selected':''}>${label}</option>`).join('');
    const typeOptions=()=>Object.entries(types).map(([key,label])=>`<option value="${key}">${label}</option>`).join('');
    const productOptions=()=>knowledge.products.map((item,index)=>`<option value="${index}">${esc(item.name)}</option>`).join('');
    const children=()=>getContext().children.map((child,index)=>`<label><input type="checkbox" class="knowledge-child" value="${index}"${child.id===getContext().childId?' checked':''}> ${esc(child.name)}</label>`).join('');
    const targetChildren=()=>all('#product-panel .knowledge-child:checked').map(input=>getContext().children[Number(input.value)].id);
    const ruleChildren=()=>all('#rule-panel .knowledge-child:checked').map(input=>getContext().children[Number(input.value)].id);
    async function load() {
      if(mock){if(!observations.length){observations=getContext().mockInventory;knowledge=withDefaultRecommendations(getContext().mockKnowledge);}return;}
      const [data,inventory]=await Promise.all([request('/v2/module/application-knowledge'),request('/v2/module/application-inventory')]);
      knowledge=withDefaultRecommendations(data);observations=inventory.observations;etag=`"application-knowledge-v${knowledge.version}"`;
    }
    async function publish(next,action='confirm') {
      if(busy)return;busy=true;const previous=knowledge.version;
      try{knowledge=mock?{...next,version:previous+1}:await request('/v2/module/application-knowledge/operations',{method:'POST',headers:{'If-Match':etag},body:JSON.stringify({action,knowledge:next})});
        priorVersion=previous;etag=`"application-knowledge-v${knowledge.version}"`;await onSaved(knowledge);renderProducts();renderRules();notice('分类已保存；设备实际应用新策略后向前生效');
      }finally{busy=false;}
    }
    async function confirmChanges(next,message,action='confirm'){
      const result=mock?{hits:observations.filter(item=>!same(knowledge.products.filter(product=>matched(product,item.evidence)).map(product=>product.id),next.products.filter(product=>matched(product,item.evidence)).map(product=>product.id)))}:await request('/v2/module/application-knowledge/operations',{method:'POST',headers:{'If-Match':etag},body:JSON.stringify({action,knowledge:next,preview:true})});
      const sample=result.hits.slice(0,8).map(item=>`${item.displayName||item.evidence.displayName} · ${(item.platform||item.evidence.platform)==='macos'?'macOS':'Windows'}${item.after?` · ${getContext().children[item.childIndex]?.name||'目标孩子'} · ${labels[item.before.classification]} → ${labels[item.after.classification]} · ${resolutionLabels[item.after.status]}`:''}`).join('\n');
      return confirm(`${message}\n当前改变的命中观察：${result.hits.length}${sample?'\n'+sample:''}\n历史账本不改写；保存后需等待设备实际应用。`);
    }
    function notice(message){for(const selector of ['#product-notice','#rule-notice']){const box=$(selector);if(box){box.textContent=message;box.hidden=false;}}}
    function bindingClass(productId){return knowledge.bindings.find(item=>item.childId===getContext().childId)?.products.find(item=>item.productId===productId)?.classification??'unclassified';}
    function matched(product,evidence){return product.selectors.some(selector=>selector.platform===evidence.platform&&selector.match.conditions.length&&(selector.match.operator==='all'?selector.match.conditions.every:selector.match.conditions.some).call(selector.match.conditions,condition=>(condition.field==='runtimeIdentity'?evidence.runtimeIdentity:evidence.values[condition.field])===condition.value&&(!['runtimeIdentity','binaryHash','packageId','distributionKey','signerKey'].includes(condition.field)||evidence.verifiedFields.includes(condition.field))));}
    function renderProducts(){
$('#product-panel').innerHTML=`<p id="product-notice" class="notice" hidden></p><div class="knowledge-filter"><input id="product-search" type="search" placeholder="搜索产品或已发现应用" aria-label="搜索产品或已发现应用"><button id="knowledge-reload">重新加载</button>${priorVersion!==null?'<button id="knowledge-undo">撤销上次关联</button>':''}</div><h3>已确认产品</h3><div id="confirmed-products">${knowledge.products.map((product,index)=>`<article class="knowledge-item"><div><strong>${esc(product.name)}</strong><small>${types[product.type]} · ${product.selectors.length} 个可信范围 · ${[...new Set(product.selectors.map(item=>item.platform==='macos'?'macOS':'Windows'))].join(' / ')}</small></div><label>当前孩子分类<select data-product-class="${index}">${classOptions(bindingClass(product.id))}</select></label><details><summary>变种及覆盖范围</summary>${product.selectors.map((selector,scopeIndex)=>`<div class="variant-row"><span>${selector.platform==='macos'?'macOS':'Windows'} · ${selector.match.conditions.map(item=>({binaryHash:'当前文件／版本',packageId:'平台包身份',signerKey:'已核实签名者',productName:'稳定产品名称',runtimeIdentity:'已确认技术身份'}[item.field]||'辅助线索')).join(' + ')}</span><button data-split-product="${index}" data-split-selector="${scopeIndex}">拆为独立产品</button><button data-unlink-product="${index}" data-unlink-selector="${scopeIndex}">解除错误关联</button></div>`).join('')}</details></article>`).join('')||'<p class="empty">尚无确定性产品；从下面的发现清单确认，或导入带可靠身份条件的规则包。</p>'}</div><section class="knowledge-editor"><h3>确认产品／加入已确认变种</h3><p>同文件可移动、改名；跨版本和套壳必须有可靠依据，启动器不自动代表其游戏。</p><label>已发现应用<select id="confirm-observation">${observations.map((item,index)=>`<option value="${index}">${esc(item.evidence.displayName)} · ${item.evidence.platform==='macos'?'macOS':'Windows'}</option>`).join('')}</select></label><label>产品<select id="confirm-existing"><option value="">新产品</option>${productOptions()}</select></label><label>新产品名称<input id="confirm-name" maxlength="256"></label><label>主要类型<select id="confirm-type">${typeOptions()}</select></label><label>覆盖范围<select id="confirm-scope"><option value="file">当前文件／版本</option><option value="series">有可靠身份依据的产品系列</option></select></label><label>孩子分类<select id="confirm-class">${classOptions()}</select></label><fieldset><legend>明确应用到（其他孩子不修改）</legend>${children()}</fieldset><button id="confirm-product" class="primary"${observations.length?'':' disabled'}>预览并确认产品</button></section><section class="knowledge-editor"><h3>合并产品</h3><p>只在明确关联依据下操作；分类冲突或其他孩子的明确配置必须先处理。</p><label>来源产品<select id="merge-source">${productOptions()}</select></label><label>目标产品<select id="merge-target">${productOptions()}</select></label><button id="merge-products"${knowledge.products.length>1?'':' disabled'}>预览并合并</button></section><h3>完整已发现清单</h3><p>安装盘点不生成时长。扫描失败不等于卸载；便携程序由使用观察补充。</p><div id="discovered-applications">${observations.map(item=>{const related=knowledge.products.filter(product=>matched(product,item.evidence));return `<article class="knowledge-item"><div><strong>${esc(item.evidence.displayName)}</strong><small>${item.evidence.platform==='macos'?'macOS':'Windows'} · ${item.status==='installed'?'已安装':item.status==='runtimeObserved'?'运行时发现':'当前未发现'} · ${related.length===1?`已确认 ${esc(related[0].name)}`:related.length>1?'关联冲突，需要确认':'未关联产品／变种候选'}</small></div></article>`;}).join('')||'<p class="empty">暂无安装观察；旧设备可能缺少应用发现能力。</p>'}</div>`;
    }
    function renderRules(){
      const anchors=observations.flatMap((item,observationIndex)=>item.evidence.verifiedFields.filter(field=>['binaryHash','packageId','distributionKey','signerKey'].includes(field)).map(field=>({observationIndex,field,value:item.evidence.values[field]})));
      $('#rule-panel').innerHTML=`<p id="rule-notice" class="notice" hidden></p><div class="knowledge-filter"><input id="rule-search" type="search" placeholder="搜索规则名称或来源" aria-label="搜索规则名称或来源"><label class="button">导入规则包<input id="import-rules" type="file" accept="application/json" hidden></label></div><div id="classification-rules">${knowledge.rules.map((rule,index)=>{const hitCount=rule.kind==='type'?knowledge.products.filter(product=>product.type===rule.type).length:observations.filter(item=>rule.match.conditions.length&&rule.match.conditions.every(condition=>(condition.field==='runtimeIdentity'?item.evidence.runtimeIdentity:item.evidence.values[condition.field])===condition.value)).length;return `<article class="knowledge-item"><div><strong>${esc(rule.name)}</strong><small>${rule.enabled?'已启用':'已关闭'} · ${rule.mode==='automatic'?'自动':'仅建议'} · ${rule.kind==='type'?`产品类型：${types[rule.type]}`:'身份规则'} → ${labels[rule.classification]} · 当前命中 ${hitCount} 个产品 · ${esc(rule.source)}</small><p>${esc(rule.reason)}</p></div><button data-edit-rule="${index}">编辑</button><button data-toggle-rule="${index}">${rule.enabled?'关闭':'启用'}</button></article>`;}).join('')||'<p class="empty">暂无分类规则；不会因游戏／视频类型自动改变分类。</p>'}</div><section class="knowledge-editor"><h3>${editingRule===null?'新增规则':'编辑规则'}</h3><label>规则名称<input id="rule-name" maxlength="256"></label><label>匹配层级<select id="rule-kind"><option value="product">精确产品</option><option value="family">限定产品系列</option><option value="developer">已核实开发者</option><option value="type">产品类型</option></select></label><label>确定性产品<select id="rule-product"><option value="">不限定产品</option>${productOptions()}</select></label><label>条件组合<select id="rule-operator"><option value="all">全部满足</option><option value="any">任一满足</option></select></label><fieldset><legend>可靠身份条件（类型规则无需选择）</legend>${anchors.map((anchor,index)=>`<label><input type="checkbox" class="rule-anchor" value="${index}"> ${esc(observations[anchor.observationIndex].evidence.displayName)} · ${{binaryHash:'文件／版本',packageId:'平台包身份',distributionKey:'发行平台产品',signerKey:'已核实签名者'}[anchor.field]}</label>`).join('')||'暂无可靠身份；类型规则使用云端已确认产品类型'}</fieldset><label>辅助产品名称（可留空）<input id="rule-product-name" maxlength="256"></label><label>排除产品<select id="rule-exclude"><option value="">不排除</option>${productOptions()}</select></label><label>规则模式<select id="rule-mode"><option value="suggestion">仅建议</option><option value="automatic">自动</option></select></label><label>结果<select id="rule-class">${classOptions()}</select></label><label>客观产品类型<select id="rule-type">${typeOptions()}</select></label><label>来源<input id="rule-source" value="parent-confirmed" maxlength="256"></label><label>解释／关联依据<input id="rule-reason" maxlength="256"></label><fieldset><legend>批准应用到孩子</legend>${children()}</fieldset><button id="save-rule" class="primary">预览并保存规则</button>${editingRule!==null?'<button id="cancel-rule-edit">取消编辑</button>':''}</section><div id="rule-import-review"></div>`;
      $('#rule-panel').anchors=anchors;
      const platformLabel=document.createElement('label');platformLabel.innerHTML='适用平台<select id="rule-platform"><option value="">两个平台</option><option value="windows">Windows</option><option value="macos">macOS</option></select>';$('#rule-kind').closest('label').after(platformLabel);
      $('#rule-platform').value=editingRule===null?'':knowledge.rules[editingRule].platform||'';
      if(editingRule!==null){const keep=document.createElement('option');keep.value='keep';keep.textContent=`保留既有排除（${knowledge.rules[editingRule].exclude.length} 项）`;$('#rule-exclude').prepend(keep);$('#rule-exclude').value='keep';const retained=document.createElement('p');retained.textContent='未在当前发现清单中显示的原有匹配条件会保留；保存不会因缺少安装观察扩大规则。';$('#rule-operator').closest('label').after(retained);}
      const enabledLabel=document.createElement('label');enabledLabel.innerHTML='<input id="rule-enabled" type="checkbox" checked> 启用规则';$('#save-rule').before(enabledLabel);
      all('#classification-rules .knowledge-item').forEach((element,index)=>{const rule=knowledge.rules[index],approved=knowledge.bindings.find(item=>item.childId===getContext().childId)?.ruleIds.includes(rule.id)&&rule.enabled;const hint=document.createElement('p');hint.textContent=approved?'当前孩子已批准':'家庭规则模板，当前孩子未批准';element.firstElementChild.append(hint);element.querySelector('[data-toggle-rule]').textContent=approved?'停用当前孩子':'批准当前孩子';});
      if(editingRule!==null){const rule=knowledge.rules[editingRule];for(const [field,id]of [['name','rule-name'],['kind','rule-kind'],['mode','rule-mode'],['classification','rule-class'],['type','rule-type'],['source','rule-source'],['reason','rule-reason']])$(`#${id}`).value=rule[field];$('#rule-operator').value=rule.match.operator;$('#rule-product-name').value=rule.match.conditions.find(item=>item.field==='productName')?.value||'';$('#rule-product').value=rule.productId?String(knowledge.products.findIndex(item=>item.id===rule.productId)):'';all('.rule-anchor').forEach(input=>{const anchor=anchors[Number(input.value)];input.checked=rule.match.conditions.some(item=>item.field===anchor.field&&item.value===anchor.value);});all('#rule-panel .knowledge-child').forEach(input=>{input.checked=knowledge.bindings.find(item=>item.childId===getContext().children[Number(input.value)].id)?.ruleIds.includes(rule.id)||false;});}
      if(editingRule!==null)$('#rule-enabled').checked=knowledge.rules[editingRule].enabled;
    }
    async function open(kind){await load();if(kind==='product')renderProducts();else renderRules();$(`#${kind}-dialog`).showModal();}
    async function perform(button){
      if(button.id==='open-products')await open('product');if(button.id==='open-rules')await open('rule');
      if(button.dataset.knowledgeClose)$(`#${button.dataset.knowledgeClose}`).close();
      if(button.id==='knowledge-reload'){await load();renderProducts();renderRules();}
      if(button.id==='confirm-product'){
        const item=observations[Number($('#confirm-observation').value)],childIds=targetChildren();if(!childIds.length)throw new Error('请明确选择孩子');
        const existing=knowledge.products[Number($('#confirm-existing').value)];
        const next=confirmProduct(knowledge,{evidence:item.evidence,scope:$('#confirm-scope').value,productId:$('#confirm-existing').value===''?null:existing.id,name:$('#confirm-name').value,type:$('#confirm-type').value,classification:$('#confirm-class').value,childIds,id:`product-${crypto.randomUUID()}`});
        if(await confirmChanges(next,`确认 ${item.evidence.displayName}，覆盖${$('#confirm-scope').value==='file'?'当前文件／版本':'可信产品系列'}，分类为${labels[$('#confirm-class').value]}？仅修改：${getContext().children.filter(child=>childIds.includes(child.id)).map(child=>child.name).join('、')}。`))await publish(next);
      }
      if(button.id==='merge-products'){const source=knowledge.products[Number($('#merge-source').value)],target=knowledge.products[Number($('#merge-target').value)];const next=mergeProducts(knowledge,source.id,target.id,getContext().childId);if(await confirmChanges(next,`将 ${source.name} 的可信范围并入 ${target.name}？旧历史不重写，可撤销。`,'merge'))await publish(next,'merge');}
      if(button.dataset.splitProduct!==undefined){const product=knowledge.products[Number(button.dataset.splitProduct)],name=prompt('新产品名称（只拆所选可信范围；分类仅配置当前孩子）');if(name){const next=splitVariant(knowledge,product.id,Number(button.dataset.splitSelector),{id:`product-${crypto.randomUUID()}`,name,childId:getContext().childId,classification:bindingClass(product.id)});if(await confirmChanges(next,`拆分所选可信范围为 ${name}？`,'split'))await publish(next,'split');}}
      if(button.id==='knowledge-undo'&&confirm('恢复上次操作前的家庭产品／规则版本？后续账本不改写。')){if(mock){throw new Error('Mock 撤销由受控测试验证；真实页面使用服务器不可变版本');}knowledge=await request('/v2/module/application-knowledge/operations',{method:'POST',headers:{'If-Match':etag},body:JSON.stringify({action:'undo',restoreVersion:priorVersion})});etag=`"application-knowledge-v${knowledge.version}"`;priorVersion=null;await onSaved(knowledge);renderProducts();renderRules();}
      if(button.dataset.toggleRule!==undefined){const rule=knowledge.rules[Number(button.dataset.toggleRule)];if(confirm('只改变当前孩子对此规则的批准，不修改其他孩子。继续？'))await publish(toggleApproval(knowledge,rule.id,getContext().childId,`rule-${crypto.randomUUID()}`));}
      if(button.dataset.editRule!==undefined){editingRule=Number(button.dataset.editRule);renderRules();$('#rule-name').focus();}
      if(button.dataset.unlinkProduct!==undefined){const product=knowledge.products[Number(button.dataset.unlinkProduct)],selected=targetChildren(),next=unlinkVariant(knowledge,product.id,Number(button.dataset.unlinkSelector),selected);if(await confirmChanges(next,`解除 ${product.name} 的所选家庭身份关联？最后范围涉及的明确分类仅删除已勾选孩子：${getContext().children.filter(child=>selected.includes(child.id)).map(child=>child.name).join('、')}。`))await publish(next);}
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
    document.addEventListener('click',event=>{const button=event.target.closest('button');if(button)perform(button).catch(error=>{notice(error.message);onError(error);});});
    document.addEventListener('change',event=>{const input=event.target;
      if(input.dataset.productClass!==undefined){const next=clone(knowledge),product=knowledge.products[Number(input.dataset.productClass)];let binding=next.bindings.find(item=>item.childId===getContext().childId);if(!binding){binding={childId:getContext().childId,products:[],ruleIds:[]};next.bindings.push(binding);}binding.products=binding.products.filter(item=>item.productId!==product.id);binding.products.push({productId:product.id,classification:input.value});publish(next).catch(onError);}
if(input.id==='import-rules'&&input.files[0]){(async()=>{const selected=ruleChildren();importPayload=scopeImport(JSON.parse(await input.files[0].text()),selected);preview=mock?diffImport(knowledge,importPayload):await request('/v2/module/application-knowledge/import-preview',{method:'POST',body:JSON.stringify({knowledge:importPayload})});$('#rule-import-review').innerHTML=`<section class="knowledge-editor"><h3>导入差异（逐项批准）</h3><p>目标：${esc(getContext().children.filter(child=>selected.includes(child.id)).map(child=>child.name).join('、'))}；孩子明确配置不覆盖。${preview.warnings.length?`仅名称候选 ${preview.warnings.length} 项，不自动归类。`:''}</p>${preview.changes.map((item,index)=>`<label><input type="checkbox" value="${index}"> ${esc(item.name)} · ${item.change==='modify'?'修改':'新增'} · ${item.kind==='products'?'产品':'规则'}</label>`).join('')||'<p>没有新增或修改</p>'}<p>当前命中观察：${preview.hits?.length??0}（需实际应用策略后生效）</p>${previewHitsHTML(preview.hits||[],getContext().children)}<button id="approve-rule-import" class="primary"${preview.changes.length?'':' disabled'}>批准所选变更</button></section>`;$('#rule-import-review').scrollIntoView({block:'start'});})().catch(error=>{notice(error.message);onError(error);});}
    });
    document.addEventListener('input',event=>{if(event.target.id==='product-search'){const query=event.target.value.toLowerCase();all('#confirmed-products .knowledge-item,#discovered-applications .knowledge-item').forEach(item=>{item.hidden=!item.textContent.toLowerCase().includes(query);});}if(event.target.id==='rule-search'){const query=event.target.value.toLowerCase();all('#classification-rules .knowledge-item').forEach(item=>{item.hidden=!item.textContent.toLowerCase().includes(query);});}});
    async function classify(productId,classification){await load();const next=clone(knowledge);let binding=next.bindings.find(item=>item.childId===getContext().childId);if(!binding){binding={childId:getContext().childId,products:[],ruleIds:[]};next.bindings.push(binding);}binding.products=binding.products.filter(item=>item.productId!==productId);binding.products.push({productId,classification});await publish(next);}
    return {open,publish,classify};
  }
  return {empty,withDefaultRecommendations,selectorFor,confirmProduct,mergeProducts,splitVariant,unlinkVariant,diffImport,selectedImport,scopeImport,reviseRule,toggleApproval,editedConditions,previewHitsHTML,mount};
});

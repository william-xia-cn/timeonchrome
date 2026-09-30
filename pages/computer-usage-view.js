/* Cloud-only display. This module never merges or re-settles source statistics. */
(function(root){
'use strict';
const labels={study:'学习',composite:'复合',restrictedEntertainment:'受限娱乐',unclassified:'未归类',blocked:'黑名单',unknown:'历史分类未知',historicalUnknown:'历史分类未知'};
const reasons={DEVICE_MAPPING_INCOMPLETE:'网页设备与电脑之间缺少可信关联',WEB_ACCOUNT_UNAVAILABLE:'网页权威统计尚不可用',WEB_SOURCE_UNAVAILABLE:'网页来源读取失败',APPLICATION_SOURCE_UNAVAILABLE:'应用来源读取失败',APPLICATION_SERVICE_UNAVAILABLE:'应用服务未连接',APPLICATION_EVIDENCE_UNAVAILABLE:'应用区间证据不可用',SOURCE_VERSION_CHANGED:'来源正在更新，请重试',WEB_EVIDENCE_LIMIT:'网页证据超出本次查询上限',APPLICATION_EVIDENCE_LIMIT:'应用证据超出本次查询上限',WEB_CREDIT_EVIDENCE_MISMATCH:'网页区间证据与原统计不一致',APPLICATION_TOTAL_EVIDENCE_MISMATCH:'应用区间证据与原统计不一致',APPLICATION_SOURCE_OVERLAP:'应用来源存在不可唯一合并的重叠',PARTIAL_WEB_CREDIT_OVERLAP_AMBIGUOUS:'网页部分计秒的重叠无法唯一确定'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
Object.assign(reasons,{OVERLAP_AMBIGUOUS:'重叠的有效计秒无法唯一确定',WEB_TOTAL_EVIDENCE_MISMATCH:'网页区间证据与原总量不一致',WEB_CATEGORY_EVIDENCE_MISMATCH:'网页分类证据与原分类统计不一致',APPLICATION_CATEGORY_EVIDENCE_MISMATCH:'应用分类证据与原分类统计不一致',APPLICATION_CLOCK_EVIDENCE_INCOMPLETE:'应用时钟证据不完整',LEGACY_APPLICATION_BEST_EFFORT:'旧版应用历史按原口径尽力读取，不证明精确重叠',LEGACY_APPLICATION_SOURCE_UNAVAILABLE:'旧版应用历史读取失败，其余可读来源仍保留'});
function duration(ms){if(ms===null||ms===undefined)return '不可用';const n=Math.max(0,ms);return (Math.floor(n/3600000)?Math.floor(n/3600000)+'小时 ':'')+Math.floor(n%3600000/60000)+'分 '+Math.floor(n%60000/1000)+'秒'+(n%1000?' '+n%1000+'毫秒':'');}
Object.assign(reasons,{HISTORICAL_SOURCE_BEST_EFFORT:'旧版历史尚无精确合并证据',APPLICATION_SOURCE_INCOMPLETE:'应用来源不足以确认精确合并',APPLICATION_SOURCE_MISSING:'该来源缺少对应应用证据',WEB_SOURCE_MISSING:'该来源缺少对应网页证据',WEB_ACCOUNT_INCOMPLETE:'网页权威统计不完整'});
const time=ms=>ms===null?'未报告':new Date(ms).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});
function summary(snapshot){
const metric=(name,value)=>'<article class="computer-metric"><small>'+name+'</small><strong>'+duration(value)+'</strong></article>';
const statusLabels={complete:'统计完整',partial:'部分来源可读（当前显示已知小计，不是完整合计）',unavailable:'统计不可用'};
const sourceStatus=snapshot.sourceStatus||{web:'unavailable',application:'unavailable'};
const sourceCategories=kind=>'<div><b>'+esc(kind==='web'?'网页原分类':'应用原分类')+'</b><p>'+Object.entries(snapshot.sourceCategoriesMs?.[kind]||{}).map(([category,ms])=>esc(labels[category]||category)+' '+duration(ms)).join(' · ')+'</p></div>';
return '<style>.computer-view{display:grid;gap:16px}.computer-view button,.computer-view select{max-width:100%}.computer-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.computer-metric{padding:16px;border:1px solid #dce7e3;border-radius:12px;background:#fff}.computer-metric strong{display:block;font-size:22px;margin-top:8px}.computer-view section{padding:18px;background:#fff;border:1px solid #dce7e3;border-radius:12px}.computer-view p{margin:8px 0;color:#697d78;line-height:1.6}.computer-view ul{padding:0;list-style:none}.computer-view li{padding:10px 0;border-bottom:1px solid #e7eeeb;overflow-wrap:anywhere}.computer-view small{color:#697d78}.computer-category-list{display:flex;gap:20px;flex-wrap:wrap}.computer-status{background:#fff5df!important}.computer-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.computer-timeline{max-height:500px;overflow:auto}.computer-view details{padding:10px 0}.computer-view [hidden]{display:none!important}</style>'+
'<style>.computer-view button,.computer-view select{min-height:44px;padding:9px 14px;border:1px solid #c9ddd6;border-radius:10px;background:#fff;color:inherit;font:inherit;line-height:1.4}.computer-view button{cursor:pointer}.computer-view button:hover{background:#edf7f3}.computer-view button:disabled{opacity:.55;cursor:default}.computer-view button:focus-visible,.computer-view select:focus-visible{outline:2px solid #168d72;outline-offset:2px}.computer-view summary{cursor:pointer;min-height:44px;display:list-item;padding:10px 0}</style>'+
'<div class="computer-toolbar"><b>电脑使用 · '+esc(snapshot.fromDate)+' — '+esc(snapshot.toDate)+'</b><button data-computer-retry>刷新</button></div><p>云端统一展示，不改变现行配额。全部电脑按设备累计；网页、应用原用量独立保留。</p>'+
'<div class="computer-metrics">'+metric('电脑总用量（设备累计）',snapshot.totals.computerMs)+metric('网页原用量',snapshot.totals.webMs)+metric('应用原用量',snapshot.totals.applicationMs)+metric('确认的重叠扣除',snapshot.totals.overlapMs)+'</div>'+
'<section><h3>统计与重叠状态</h3><p>网页：'+esc(statusLabels[sourceStatus.web])+' · 应用：'+esc(statusLabels[sourceStatus.application])+'</p><p>'+esc(snapshot.historyStatus==='bestEffort'?'包含旧版历史：按原口径尽力读取，不能证明精确重叠':'当前来源无旧版历史标记')+' · '+esc(snapshot.overlapStatus==='confirmed'?'重叠已确认':'重叠未确认，不扣除未知重叠')+'</p></section>'+
(!snapshot.complete?'<section class="computer-status"><b>精确合并暂不可用，独立统计和明细仍可查看</b><ul>'+[...new Set(snapshot.reasons)].map(code=>'<li>'+esc(reasons[code]||code)+'</li>').join('')+'</ul></section>':'')+
'<section><h3>'+esc(snapshot.categoryBasis==='sourceCumulative'?'分类归集（来源累计、尚未去重）':'分类汇总（重叠已去重）')+'</h3><p>排除已确认 Chrome 容器，分类允许重叠，不能相加为电脑总量。</p><div class="computer-category-list">'+Object.entries(snapshot.categoriesMs).map(([key,ms])=>'<p><b>'+esc(labels[key]||key)+'</b><br>'+duration(ms)+'</p>').join('')+'</div><h4>独立权威分类（原口径）</h4>'+sourceCategories('web')+sourceCategories('application')+'</section>'+
'<section><h3>各电脑合并状态</h3><ul>'+snapshot.devices.map(device=>'<li><strong>'+esc(device.name)+'</strong> · '+duration(device.totalMs)+(device.complete?'':' · 证据未齐')+'<br><small>网页 '+duration(device.webMs)+' · 应用 '+duration(device.applicationMs)+' · Chrome 内容未识别 '+duration(device.chromeUnexplainedMs)+'</small></li>').join('')+'</ul></section>'+
'<section><h3>产品与 Chrome 内容</h3><p>Chrome 容器计入电脑用量；有可信电脑关联时展示该电脑网页，否则明确展示“该孩子的网页内容”，不证明容器归属、不扣重叠。</p><button data-computer-detail="products">查看产品</button><div data-computer-products></div></section>'+
'<section><h3>来源时间线</h3><p>网页与应用分行；区间宽度不代表网页有效计秒。以下不是两份相加的用量。</p><button data-computer-detail="timeline">查看时间线</button><div data-computer-timeline class="computer-timeline"></div></section>'+
'<section><h3>来源与截止时间</h3><ul>'+snapshot.sourceVersions.map(source=>'<li>'+esc(source.kind==='web'?'网页':'应用')+' · 已结算至 '+esc(time(source.settledAtMs))+'</li>').join('')+'</ul></section>';
}
function detailRows(kind,rows){
const originalClassification=row=>row.special?'原应用历史归类，仅用于原口径；不贡献统一分类：':'';
const historyLabel=row=>row.historyQuality==='bestEffort'?' · 旧版历史（尽力读取）':'';
const chromeDetails=row=>{
  const content=row.chromeContent||{},child=content.scope==='child';
  return '<details><summary>'+esc(child?'该孩子的网页内容':'该电脑的 Chrome 网页内容')+'</summary>'
    +(child?'<p>该孩子的网页原用量 '+duration(content.webMs)+'。尚未确认与此 Chrome 同电脑，不代表容器内访问，不扣除重叠。</p>'
      :'<p>网页解释 '+duration(content.explainedMs)+' · 内容未识别 '+duration(content.unexplainedMs)+'</p>')
    +'<p>'+Object.entries(content.categoriesMs||{}).map(([category,ms])=>esc(labels[category]||category)+' '+duration(ms)).join(' · ')+'</p>'
    +(!content.complete?'<p>网页统计有缺失，显示可读来源及已知小计，不是完整合计。</p>':'')
    +'<button data-computer-chrome="'+esc(row.key)+'">加载内容时间线</button><div data-computer-chrome-target="'+esc(row.key)+'"></div></details>';
};
return '<ul>'+rows.map(row=>kind==='products'
?'<li><strong>'+esc(row.name)+'</strong> · '+(row.special?'特殊应用（内容决定分类）':esc(row.source==='web'?'网页':'应用'))+' · '+duration(row.durationMs)+historyLabel(row)+'<br><small>'+originalClassification(row)+esc(row.classification.map(c=>labels[c]||c).join(' / '))+'</small>'+(row.special?chromeDetails(row):'')+'</li>'
:'<li><b>'+esc(row.source==='web'?'网页':'应用')+'</b> · '+esc(row.label)+historyLabel(row)+(row.special?' · Chrome 容器':'')+(row.containerRelation==='outsideContainer'?' · 容器外网页（独立来源）':row.containerRelation==='childContent'?' · 该孩子的网页内容（同电脑归属未确认）':'')+'<br>'+esc(time(row.startMs))+' — '+esc(time(row.endMs))+'<br><small>权威有效用量 '+duration(row.creditedMs)+' · '+originalClassification(row)+esc(labels[row.classification]||row.classification)+' · 重叠 '+duration(row.overlapMs)+'</small></li>').join('')+'</ul>';
}
function create(host,read,onRange,getScope){
let generation=0,snapshot=null,computer='',devices=[],scope;
async function load(){
const currentScope=getScope?.();if(currentScope!==scope){scope=currentScope;computer='';devices=[];snapshot=null;}
const token=++generation;host.innerHTML='<p>正在读取云端电脑使用…</p>';
try{const result=await read({computer,detail:'summary'});if(token!==generation)return;snapshot=result;if(!computer)devices=result.devices;host.classList.add('computer-view');host.innerHTML=summary(result);const toolbar=host.querySelector('.computer-toolbar');toolbar.insertAdjacentHTML('beforeend','<label>电脑 <select data-computer-select><option value="">全部电脑（设备累计）</option>'+devices.map(device=>'<option value="'+esc(device.key)+'"'+(device.key===computer?' selected':'')+'>'+esc(device.name)+'</option>').join('')+'</select></label>');if(onRange)toolbar.insertAdjacentHTML('beforeend','<button data-computer-period="previous">上一周期</button><button data-computer-period="today">今天</button><button data-computer-period="next">下一周期</button>');}
catch(error){if(token===generation)host.innerHTML='<section><h3>电脑使用暂不可用</h3><p>独立网页、媒体与应用统计不受影响。请重试。</p><button data-computer-retry>重试</button></section>';}
}
async function details(kind,offset=0,product){
if(!snapshot)return;const token=generation,version=snapshot.revision;
const target=product?[...host.querySelectorAll('[data-computer-chrome-target]')].find(element=>element.dataset.computerChromeTarget===product):host.querySelector('[data-computer-'+kind+']');if(!target)return;
const button=host.querySelector('[data-computer-detail="'+kind+'"]');if(button)button.disabled=true;
try{const result=await read({computer,detail:kind,revision:version,offset,...(product?{product}:{})});if(token!==generation||snapshot.revision!==version)return;
if(result.revision!==version)throw new Error('COMPUTER_USAGE_VERSION_CHANGED');
if(!offset)target.innerHTML='';target.insertAdjacentHTML('beforeend',detailRows(kind,result[kind]));
target.querySelector('[data-computer-more]')?.remove();
if(result.nextCursor!==null)target.insertAdjacentHTML('beforeend','<button data-computer-more="'+kind+'" data-offset="'+esc(result.nextCursor)+'"'+(product?' data-product="'+esc(product)+'"':'')+'>加载更多</button>');
}catch(error){if(token===generation)target.innerHTML='<p>明细已更新或暂不可用，请刷新汇总后重试。</p>';}
finally{if(token===generation&&button)button.disabled=false;}
}
host.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.hasAttribute('data-computer-retry'))void load();if(button.dataset.computerDetail)void details(button.dataset.computerDetail);if(button.dataset.computerChrome)void details('timeline',0,button.dataset.computerChrome);if(button.dataset.computerMore)void details(button.dataset.computerMore,Number(button.dataset.offset),button.dataset.product);if(button.dataset.computerPeriod&&onRange)onRange(button.dataset.computerPeriod);});
host.addEventListener('change',event=>{if(event.target.hasAttribute('data-computer-select')){computer=event.target.value;void load();}});
return {load,invalidate(){generation++;snapshot=null;},setComputer(key){computer=key;return load();}};
}
const api={create,summary,detailRows,duration};if(typeof module==='object')module.exports=api;else root.ComputerUsageView=api;
})(typeof globalThis==='object'?globalThis:this);

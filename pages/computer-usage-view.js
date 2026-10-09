/* Cloud-only display. This module never merges or re-settles source statistics. */
(function(root){
'use strict';
const labels={study:'学习',composite:'复合',restrictedEntertainment:'受限娱乐',unclassified:'未归类',blocked:'黑名单',unknown:'历史分类未知',historicalUnknown:'历史分类未知',rest:'娱乐',other:'其他',video:'视频',audio:'音频'};
const reasons={WEB_ACCOUNT_UNAVAILABLE:'网页权威统计尚不可用',WEB_SOURCE_UNAVAILABLE:'网页来源读取失败',APPLICATION_SOURCE_UNAVAILABLE:'应用来源读取失败',APPLICATION_SERVICE_UNAVAILABLE:'应用服务未连接',APPLICATION_EVIDENCE_UNAVAILABLE:'应用区间证据不可用',SOURCE_VERSION_CHANGED:'来源正在更新，请重试',WEB_EVIDENCE_LIMIT:'网页证据超出本次查询上限',APPLICATION_EVIDENCE_LIMIT:'应用证据超出本次查询上限',WEB_CREDIT_EVIDENCE_MISMATCH:'网页区间证据与原统计不一致',APPLICATION_TOTAL_EVIDENCE_MISMATCH:'应用区间证据与原统计不一致',APPLICATION_SOURCE_OVERLAP:'应用来源存在不可唯一合并的重叠',PARTIAL_WEB_CREDIT_OVERLAP_AMBIGUOUS:'网页部分计秒的重叠无法唯一确定'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
Object.assign(reasons,{OVERLAP_AMBIGUOUS:'重叠的有效计秒无法唯一确定',WEB_TOTAL_EVIDENCE_MISMATCH:'网页区间证据与原总量不一致',WEB_CATEGORY_EVIDENCE_MISMATCH:'网页分类证据与原分类统计不一致',APPLICATION_CATEGORY_EVIDENCE_MISMATCH:'应用分类证据与原分类统计不一致',APPLICATION_CLOCK_EVIDENCE_INCOMPLETE:'应用时钟证据不完整',LEGACY_APPLICATION_BEST_EFFORT:'旧版应用历史按原口径尽力读取，不证明精确重叠',LEGACY_APPLICATION_SOURCE_UNAVAILABLE:'旧版应用历史读取失败，其余可读来源仍保留'});
function duration(ms){if(ms===null||ms===undefined)return '不可用';const n=Math.max(0,ms);return (Math.floor(n/3600000)?Math.floor(n/3600000)+'小时 ':'')+Math.floor(n%3600000/60000)+'分 '+Math.floor(n%60000/1000)+'秒'+(n%1000?' '+n%1000+'毫秒':'');}
function durationSeconds(value){if(value===null||value===undefined)return '不可用';if(!Number.isSafeInteger(value)||value<0)throw new Error('INVALID_STATISTICS_SECONDS');const h=Math.floor(value/3600),m=Math.floor(value%3600/60);return (h?h+'小时 ':'')+m+'分 '+value%60+'秒';}
Object.assign(reasons,{HISTORICAL_SOURCE_BEST_EFFORT:'旧版历史尚无精确合并证据',APPLICATION_SOURCE_INCOMPLETE:'应用来源不足以确认精确合并',APPLICATION_SOURCE_MISSING:'该来源缺少对应应用证据',WEB_SOURCE_MISSING:'该来源缺少对应网页证据',WEB_ACCOUNT_INCOMPLETE:'网页权威统计不完整'});
Object.assign(reasons,{APPLICATION_DATABASE_MEMORY_LIMIT:'应用查询超出数据库内存限制',APPLICATION_CHILD_UNAVAILABLE:'应用来源中尚无该孩子',APPLICATION_SCHEMA_UNAVAILABLE:'应用数据库结构暂不可用',APPLICATION_RPC_UNAVAILABLE:'应用读取接口暂不可用'});
const time=ms=>ms===null?'未报告':new Date(ms).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});
function summary(snapshot){
const seconds=snapshot.schemaVersion===2;
if(seconds&&snapshot.durationUnit!=='seconds')throw new Error('INVALID_STATISTICS_SECONDS');
const format=seconds?durationSeconds:duration,totals=snapshot.totals;
const computer=seconds?totals.computer:totals.computerMs,web=seconds?totals.web:totals.webMs,application=seconds?totals.application:totals.applicationMs,special=seconds?totals.specialIncluded:totals.chromeIncludedMs;
const categories=seconds?snapshot.categories:snapshot.categoriesMs,codes=seconds?snapshot.reasonCodes:snapshot.reasons;
const container=seconds?'特殊应用':'Chrome';
const versions=seconds?Object.entries(snapshot.sourceVersions).map(([kind,revision])=>'<li>'+esc(kind==='web'?'网页':'应用')+' · 来源版本 '+esc(revision??'未报告')+'</li>').join(''):snapshot.sourceVersions.map(source=>'<li>'+esc(source.kind==='web'?'网页':'应用')+' · 已结算至 '+esc(time(source.settledAtMs))+'</li>').join('');
const metric=(name,value)=>'<article class="computer-metric"><small>'+name+'</small><strong>'+format(value)+'</strong></article>';
const statusLabels={complete:'统计完整',partial:'部分来源可读（当前显示已知小计，不是完整合计）',unavailable:'统计不可用'};
const sourceStatus=snapshot.sourceStatus||{web:'unavailable',application:'unavailable'};
const sourceCategories=kind=>'<div><b>'+esc(kind==='web'?'网页原分类':'应用原分类')+'</b><p>'+Object.entries((seconds?snapshot.sourceCategories:snapshot.sourceCategoriesMs)?.[kind]||{}).map(([category,value])=>esc(labels[category]||category)+' '+format(value)).join(' · ')+'</p></div>';
return '<style>.computer-view{display:grid;gap:16px}.computer-view button,.computer-view select{max-width:100%}.computer-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.computer-metric{padding:16px;border:1px solid #dce7e3;border-radius:12px;background:#fff}.computer-metric strong{display:block;font-size:22px;margin-top:8px}.computer-view section{padding:18px;background:#fff;border:1px solid #dce7e3;border-radius:12px}.computer-view p{margin:8px 0;color:#697d78;line-height:1.6}.computer-view ul{padding:0;list-style:none}.computer-view li{padding:10px 0;border-bottom:1px solid #e7eeeb;overflow-wrap:anywhere}.computer-view small{color:#697d78}.computer-category-list{display:flex;gap:20px;flex-wrap:wrap}.computer-status{background:#fff5df!important}.computer-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.computer-timeline{max-height:500px;overflow:auto}.computer-view details{padding:10px 0}.computer-view [hidden]{display:none!important}</style>'+
'<style>.computer-view button,.computer-view select{min-height:44px;padding:9px 14px;border:1px solid #c9ddd6;border-radius:10px;background:#fff;color:inherit;font:inherit;line-height:1.4}.computer-view button{cursor:pointer}.computer-view button:hover{background:#edf7f3}.computer-view button:disabled{opacity:.55;cursor:default}.computer-view button:focus-visible,.computer-view select:focus-visible{outline:2px solid #168d72;outline-offset:2px}.computer-view summary{cursor:pointer;min-height:44px;display:list-item;padding:10px 0}</style>'+
'<div class="computer-toolbar"><b>电脑使用 · '+esc(snapshot.fromDate)+' — '+esc(snapshot.toDate)+'</b><button data-computer-retry>刷新</button></div><p>云端按孩子汇总网页与应用使用；多台设备分别累计，不做跨设备重叠扣除。</p>'+
'<div class="computer-metrics">'+metric('电脑总用量（来源累计）',computer)+metric('网页主用量',web)+metric('应用主用量',application)+metric(container+' 容器扣除',special)+'</div>'+
'<p>电脑使用＝网页＋应用－应用总量中 '+container+' 的贡献。其他应用与网页同时使用仍分别累计。'+(computer===null?'来源未齐，当前仅显示可用部分。':'')+'</p>'+
'<section><h3>分类归集（来源累计）</h3><p>排除已确认 '+container+' 容器，分类允许重叠，不能相加为电脑总量。</p><div class="computer-category-list">'+Object.entries(categories).map(([key,value])=>'<p><b>'+esc(labels[key]||key)+'</b><br>'+format(value)+'</p>').join('')+'</div><h4>独立权威分类（原口径）</h4>'+sourceCategories('web')+sourceCategories('application')+'</section>'+
'<section><h3>产品与 Chrome 内容</h3><p>Chrome 容器仅从电脑汇总扣除一次；网页内容来自网页统计。</p><button data-computer-detail="products">查看产品</button><div data-computer-products></div></section>'+
'<section><h3>来源时间线</h3><p>网页与应用分行；区间宽度不代表网页有效计秒。以下不是两份相加的用量。</p><button data-computer-detail="timeline">查看时间线</button><div data-computer-timeline class="computer-timeline"></div></section>'+
'<details><summary>来源状态与诊断详情</summary><p>网页：'+esc(statusLabels[sourceStatus.web])+' · 应用：'+esc(statusLabels[sourceStatus.application])+'</p><p>'+esc(seconds?'权威来源整数秒统计':snapshot.historyStatus==='bestEffort'?'历史数据，尽力还原':'当前来源')+'</p><ul>'+[...new Set(codes)].map(code=>'<li>'+esc(reasons[code]||code)+' <small>'+esc(code)+'</small></li>').join('')+'</ul><ul>'+versions+'</ul></details>';
}
function detailRows(kind,rows){
const originalClassification=row=>row.special?'原应用历史归类，仅用于原口径；不贡献统一分类：':'';
const historyLabel=row=>row.historyQuality==='bestEffort'?' · 旧版历史（尽力读取）':'';
const chromeDetails=row=>{
  const content=row.chromeContent||{},child=content.scope==='child';
  return '<details><summary>'+esc(child?'该孩子的网页内容':'该孩子的网页内容')+'</summary>'
    +(child?'<p>该孩子的网页原用量 '+duration(content.webMs)+'。这表示同一孩子的网页明细，不代表全部发生在该 Chrome 容器内；网页内容不作为第二份用量加入总量。</p>'
      :'<p>网页解释 '+duration(content.explainedMs)+' · 内容未识别 '+duration(content.unexplainedMs)+'</p>')
    +'<p>'+Object.entries(content.categoriesMs||{}).map(([category,ms])=>esc(labels[category]||category)+' '+duration(ms)).join(' · ')+'</p>'
    +(!content.complete?'<p>网页统计有缺失，显示可读来源及已知小计，不是完整合计。</p>':'')
    +'<button data-computer-chrome="'+esc(row.key)+'">加载内容时间线</button><div data-computer-chrome-target="'+esc(row.key)+'"></div></details>';
};
return '<ul>'+rows.map(row=>kind==='products'
?'<li><strong>'+esc(row.name)+'</strong> · '+(row.special?'特殊应用（内容决定分类）':esc(row.source==='web'?'网页':'应用'))+' · '+duration(row.durationMs)+historyLabel(row)+'<br><small>'+originalClassification(row)+esc(row.classification.map(c=>labels[c]||c).join(' / '))+'</small>'+(row.special?chromeDetails(row):'')+'</li>'
:'<li><b>'+esc(row.source==='web'?'网页':'应用')+'</b> · '+esc(row.label)+historyLabel(row)+(row.special?' · Chrome 容器':'')+(row.containerRelation==='outsideContainer'?' · 容器外网页（独立来源）':row.containerRelation==='childContent'?' · 该孩子的网页内容（不表示发生于此 Chrome）':'')+'<br>'+esc(time(row.startMs))+' — '+esc(time(row.endMs))+'<br><small>权威有效用量 '+duration(row.creditedMs)+' · '+originalClassification(row)+esc(labels[row.classification]||row.classification)+(row.source==='web'?' · 网页与其他应用分别累计':'')+'</small></li>').join('')+'</ul>';
}
function create(host,read,onRange,getScope){
let generation=0,snapshot=null,scope;
const cache=createReadCache({shouldCache:value=>!(value.schemaVersion===2?value.reasonCodes:value.reasons)?.some(code=>/UNAVAILABLE|PENDING|STALE|SOURCE_VERSION_CHANGED|MEMORY_LIMIT/.test(code))});
const readView=(query,refresh=false)=>cache.read(JSON.stringify([getScope?.()??null,query]),()=>read(query),{refresh});
async function load({refresh=false}={}){
const currentScope=getScope?.();if(currentScope!==scope){scope=currentScope;snapshot=null;}
const token=++generation;host.innerHTML='<p>正在读取云端电脑使用…</p>';
try{const {value:result}=await readView({detail:'summary',durationUnit:'seconds'},refresh);if(token!==generation)return;snapshot=result;host.classList.add('computer-view');host.innerHTML=summary(result);if(onRange)host.querySelector('.computer-toolbar').insertAdjacentHTML('beforeend','<button data-computer-period="previous">上一周期</button><button data-computer-period="today">今天</button><button data-computer-period="next">下一周期</button>');}
catch(error){if(token===generation)host.innerHTML='<section><h3>电脑使用暂不可用</h3><p>独立网页、媒体与应用统计不受影响。请重试。</p><button data-computer-retry>重试</button></section>';}
}
async function details(kind,offset=0,product){
if(!snapshot)return;const token=generation,version=snapshot.revision;
const target=product?[...host.querySelectorAll('[data-computer-chrome-target]')].find(element=>element.dataset.computerChromeTarget===product):host.querySelector('[data-computer-'+kind+']');if(!target)return;
const button=host.querySelector('[data-computer-detail="'+kind+'"]');if(button)button.disabled=true;
try{const {value:result}=await readView({detail:kind,revision:version,offset,...(snapshot.schemaVersion===2?{durationUnit:'seconds'}:{}),...(product?{product}:{})});if(token!==generation||snapshot.revision!==version)return;
if(result.revision!==version)throw new Error('COMPUTER_USAGE_VERSION_CHANGED');
if(!offset)target.innerHTML='';target.insertAdjacentHTML('beforeend',detailRows(kind,result[kind]));
target.querySelector('[data-computer-more]')?.remove();
if(result.nextCursor!==null)target.insertAdjacentHTML('beforeend','<button data-computer-more="'+kind+'" data-offset="'+esc(result.nextCursor)+'"'+(product?' data-product="'+esc(product)+'"':'')+'>加载更多</button>');
}catch(error){if(token===generation)target.innerHTML='<p>明细已更新或暂不可用，请刷新汇总后重试。</p><small>'+esc(error?.code||'COMPUTER_USAGE_DETAIL_UNAVAILABLE')+'</small>';}
finally{if(token===generation&&button)button.disabled=false;}
}
host.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.hasAttribute('data-computer-retry')){cache.clear();void load({refresh:true});}if(button.dataset.computerDetail)void details(button.dataset.computerDetail);if(button.dataset.computerChrome)void details('timeline',0,button.dataset.computerChrome);if(button.dataset.computerMore)void details(button.dataset.computerMore,Number(button.dataset.offset),button.dataset.product);if(button.dataset.computerPeriod&&onRange)onRange(button.dataset.computerPeriod);});
return {load,invalidate(){generation++;snapshot=null;host.innerHTML='';}};
}

// Memory only, scoped by the complete authorized URL. No credentials or ledger
// copies; failures are never cached. Epochs prevent cleared/older reads returning.
function createReadCache({ttlMs=30000,maxEntries=16,now=Date.now,shouldCache=()=>true}={}){
const entries=new Map(),pending=new Map();let epoch=0;
return{clear(){epoch++;entries.clear();pending.clear();},async read(key,loader,{refresh=false}={}){
if(refresh){entries.delete(key);pending.delete(key);}
const entry=entries.get(key);
if(entry&&now()-entry.readAtMs<ttlMs){entries.delete(key);entries.set(key,entry);return {...entry,cached:true};}
if(pending.has(key))return pending.get(key);
const started=epoch;
const request=Promise.resolve().then(loader).then(value=>{
const result={value,readAtMs:now(),cached:false};
if(started===epoch&&pending.get(key)===request&&shouldCache(value)){entries.set(key,result);while(entries.size>maxEntries)entries.delete(entries.keys().next().value);}
return result;
}).catch(error=>{if(error?.status===401||error?.status===403){epoch++;entries.clear();pending.clear();}throw error;})
.finally(()=>{if(pending.get(key)===request)pending.delete(key);});
pending.set(key,request);return request;
}};
}
function independentSummary(snapshot){
const seconds=snapshot.durationUnit==='seconds';
const format=seconds?value=>{if(value===null||value===undefined)return '不可用';if(!Number.isSafeInteger(value)||value<0)throw new Error('INVALID_STATISTICS_SECONDS');const h=Math.floor(value/3600),m=Math.floor(value%3600/60),s=value%60;return (h?h+'小时 ':'')+m+'分 '+s+'秒';}:duration;
const valueOf=item=>seconds?item.duration:item.durationMs;
const title={application:'应用使用',web:'网页使用',media:'网页媒体使用'}[snapshot.source];
const stats=snapshot.source==='application'?snapshot.statistics:null;
const identity=snapshot.source==='application'&&snapshot.model==='program-instance-v1';
const hasBaseUsage=(seconds?[snapshot.totalDuration,snapshot.availableTotalDuration]:[snapshot.totalDurationMs,snapshot.availableTotalDurationMs]).some(value=>Number.isFinite(value)&&value>=0);
const productNotice=identity&&snapshot.productStatus?.complete===false?'<p>产品／分类投影尚未完整；'+(hasBaseUsage?'基础用量仍有效。':'基础用量尚不可用。')+'未识别不等于未归类。</p>':'';
const instanceDetails=identity?'<section><details><summary>基础程序实例（'+(snapshot.instances||[]).length+'）</summary><p>实例明细可能重叠，不相加生成总量。</p><ul>'+(snapshot.instances||[]).map(item=>'<li><code>'+esc(item.subjectKey)+'</code> · '+format(valueOf(item))+'</li>').join('')+'</ul></details></section>':'';
const sourceLabel={native:'Service 已发布持久化统计','legacy-server':'旧云端兼容统计（非最新 Service 统计）',mixed:'混合来源（部分为旧云端兼容统计）'};
let sourceInfo=snapshot.source==='application'?'<p>统计来源：'+esc(sourceLabel[stats?.producer]||'旧接口未报告来源，不能确认最新 Service 统计')+' · '+esc(stats?.stale?'更新中，保留已有有效读数':'已读取')+'</p><p>统计更新时间：'+esc(Number.isSafeInteger(stats?.computedAtMs)?time(stats.computedAtMs):'未报告')+' · 结算截止：'+esc(stats?.settledThroughByDate?.length?stats.settledThroughByDate.map(item=>item.date+' '+(Number.isSafeInteger(item.settledThroughMs)?time(item.settledThroughMs):'未能确认')).join('；'):'未能确认')+'</p>':'';
if(identity&&!hasBaseUsage){
const codes=[...new Set((snapshot.days||[]).flatMap(day=>day.reasonCodes||[]))];
sourceInfo='<p>统计来源：新版程序实例统计，当前范围尚无可用读数；不代表零用量。</p>'+(codes.length?'<details><summary>来源状态与诊断详情</summary><p>'+codes.map(esc).join('；')+'</p></details>':'');
}
if(snapshot.source==='application'&&snapshot.days?.some(day=>day.reasonCodes?.includes('APPLICATION_V3_RECORDS_NOT_AVAILABLE'))){
if(snapshot.availableTotalDuration==null&&snapshot.availableTotalDurationMs==null)sourceInfo='<p>统计来源：新版应用统计，当前范围尚无已发布记录。</p>';
sourceInfo+='<p>无新版应用记录：'+esc(snapshot.days.filter(day=>day.reasonCodes?.includes('APPLICATION_V3_RECORDS_NOT_AVAILABLE')).map(day=>day.date).join('、'))+'。旧应用账已退出，空白不代表零用量。</p>';
}
return '<style>.computer-view{display:grid;gap:16px}.computer-view[hidden]{display:none!important}.computer-toolbar,.computer-category-list{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.computer-view section,.computer-metric{padding:18px;background:#fff;border:1px solid #dce7e3;border-radius:12px}.computer-metric strong{display:block;font-size:24px;margin-top:8px}.computer-view button{min-height:44px;padding:9px 14px;border:1px solid #c9ddd6;border-radius:10px;background:#fff;font:inherit;cursor:pointer}.computer-view ul{padding:0;list-style:none}.computer-view li{padding:10px 0;border-bottom:1px solid #e7eeeb;overflow-wrap:anywhere}.computer-view p,.computer-view small{color:#697d78;line-height:1.6}</style><div class="computer-toolbar"><b>'+esc(title)+' · '+esc(snapshot.fromDate)+' — '+esc(snapshot.toDate)+'</b><button data-independent-retry>刷新</button></div>'+
(snapshot.readDisplay?'<p>'+esc(snapshot.readDisplay)+'</p>':'')+sourceInfo+(snapshot.compatibility==='legacy'?'<p>旧版兼容统计，尚未采用新版 Service 秒统计。</p>':'')+(seconds&&snapshot.complete===false&&snapshot.availableTotalDuration!=null?'<p>部分统计可用：'+format(snapshot.availableTotalDuration)+'；不完整日期：'+esc(stats?.missingDates?.join('、')||'尚未确认')+'。空白不代表零用量。</p>':'')+'<div class="computer-metrics"><article class="computer-metric"><small>'+esc(title)+'时间</small><strong>'+format(seconds?snapshot.totalDuration:snapshot.totalDurationMs)+'</strong></article></div>'+
productNotice+instanceDetails+'<section><h3>分类明细</h3><p>独立来源原口径；明细可能重叠，不相加生成总量。</p><div class="computer-category-list">'+snapshot.categories.map(item=>'<p><b>'+esc(labels[item.classification]||item.classification)+'</b><br>'+format(valueOf(item))+'</p>').join('')+'</div></section>'+
'<section><h3>时间分布</h3><ul>'+snapshot.buckets.map(item=>'<li>'+esc(item.label||time(item.startAtMs))+' · '+format(valueOf(item))+'</li>').join('')+'</ul></section>'+
'<section><h3>'+esc(snapshot.source==='application'?'应用明细':'网站明细')+'</h3><ul>'+snapshot.applications.map(item=>'<li><strong>'+esc(item.displayName)+'</strong> · '+esc(item.classifications?.length?item.classifications.map(category=>labels[category]||category).join('／'):labels[item.classification]||item.classification)+' · '+format(valueOf(item))+'</li>').join('')+'</ul></section>';
}
function createIndependent(host,read,onRange){
let generation=0,lastMarkup='';
host.classList.add('computer-view');
async function load(refresh=false){
const token=++generation;host.innerHTML='<p>正在读取独立使用统计…</p>';
try{const result=await read({refresh});if(token===generation){host.innerHTML=independentSummary(result);if(onRange)host.querySelector('.computer-toolbar').insertAdjacentHTML('beforeend','<button data-independent-period="previous">上一周期</button><button data-independent-period="today">今天</button><button data-independent-period="next">下一周期</button>');lastMarkup=result.source==='application'?host.innerHTML:'';}}
catch(error){if(token===generation)host.innerHTML=lastMarkup?lastMarkup+'<section><p>更新失败，以下为上次有效统计，不代表当前已同步；截止见来源信息。</p><small>'+esc(error?.code||'SOURCE_UNAVAILABLE')+'</small><button data-independent-retry>重试</button></section>':'<section><h3>使用统计暂不可用</h3><p>其他统计和设备管理不受影响。</p><small>'+esc(error?.code||'SOURCE_UNAVAILABLE')+'</small><button data-independent-retry>重试</button></section>';}
}
host.addEventListener('click',event=>{if(event.target.closest('[data-independent-retry]'))void load(true);const direction=event.target.closest('[data-independent-period]')?.dataset.independentPeriod;if(direction&&onRange)onRange(direction);});
return{load,invalidate(){generation++;lastMarkup='';host.innerHTML='';}};
}
const api={create,createIndependent,createReadCache,summary,independentSummary,detailRows,duration};if(typeof module==='object')module.exports=api;else root.ComputerUsageView=api;
})(typeof globalThis==='object'?globalThis:this);

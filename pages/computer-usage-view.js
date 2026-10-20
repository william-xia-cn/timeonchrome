/* Cloud-only display. This module never merges or re-settles source statistics. */
(function(root){
'use strict';
const webBuckets=typeof module==='object'?require('../app-runtime-management/console/web-usage-buckets.js'):root.WebUsageBuckets;
const labels={study:'学习',composite:'复合',restrictedEntertainment:'受限娱乐',unclassified:'未归类',blocked:'黑名单',unknown:'历史分类未知',historicalUnknown:'历史分类未知',rest:'娱乐',other:'其他',video:'视频',audio:'音频'};
const reasons={WEB_ACCOUNT_UNAVAILABLE:'网页权威统计尚不可用',WEB_SOURCE_UNAVAILABLE:'网页来源读取失败',APPLICATION_SOURCE_UNAVAILABLE:'应用来源读取失败',APPLICATION_SERVICE_UNAVAILABLE:'应用服务未连接',APPLICATION_EVIDENCE_UNAVAILABLE:'应用区间证据不可用',SOURCE_VERSION_CHANGED:'来源正在更新，请重试',WEB_EVIDENCE_LIMIT:'网页证据超出本次查询上限',APPLICATION_EVIDENCE_LIMIT:'应用证据超出本次查询上限',WEB_CREDIT_EVIDENCE_MISMATCH:'网页区间证据与原统计不一致',APPLICATION_TOTAL_EVIDENCE_MISMATCH:'应用区间证据与原统计不一致',APPLICATION_SOURCE_OVERLAP:'应用来源存在不可唯一合并的重叠',PARTIAL_WEB_CREDIT_OVERLAP_AMBIGUOUS:'网页部分计秒的重叠无法唯一确定'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
Object.assign(reasons,{OVERLAP_AMBIGUOUS:'重叠的有效计秒无法唯一确定',WEB_TOTAL_EVIDENCE_MISMATCH:'网页区间证据与原总量不一致',WEB_CATEGORY_EVIDENCE_MISMATCH:'网页分类证据与原分类统计不一致',APPLICATION_CATEGORY_EVIDENCE_MISMATCH:'应用分类证据与原分类统计不一致',APPLICATION_CLOCK_EVIDENCE_INCOMPLETE:'应用时钟证据不完整',LEGACY_APPLICATION_BEST_EFFORT:'旧版应用历史按原口径尽力读取，不证明精确重叠',LEGACY_APPLICATION_SOURCE_UNAVAILABLE:'旧版应用历史读取失败，其余可读来源仍保留'});
function duration(ms){if(ms===null||ms===undefined)return '不可用';const n=Math.max(0,ms);return (Math.floor(n/3600000)?Math.floor(n/3600000)+'小时 ':'')+Math.floor(n%3600000/60000)+'分 '+Math.floor(n%60000/1000)+'秒'+(n%1000?' '+n%1000+'毫秒':'');}
function durationSeconds(value){if(value===null||value===undefined)return '不可用';if(!Number.isSafeInteger(value)||value<0)throw new Error('INVALID_STATISTICS_SECONDS');const h=Math.floor(value/3600),m=Math.floor(value%3600/60);return (h?h+'小时 ':'')+m+'分 '+value%60+'秒';}
Object.assign(reasons,{HISTORICAL_SOURCE_BEST_EFFORT:'旧版历史尚无精确合并证据',APPLICATION_SOURCE_INCOMPLETE:'应用来源不足以确认精确合并',APPLICATION_SOURCE_MISSING:'该来源缺少对应应用证据',WEB_SOURCE_MISSING:'该来源缺少对应网页证据',WEB_ACCOUNT_INCOMPLETE:'网页权威统计不完整'});
Object.assign(reasons,{APPLICATION_DATABASE_MEMORY_LIMIT:'应用查询超出数据库内存限制',APPLICATION_CHILD_UNAVAILABLE:'应用来源中尚无该孩子',APPLICATION_SCHEMA_UNAVAILABLE:'应用数据库结构暂不可用',APPLICATION_RPC_UNAVAILABLE:'应用读取接口暂不可用'});
const time=ms=>ms===null?'未报告':new Date(ms).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});
// Display adapters only. Never derive buckets from total/all-app classifications.
const bucketColors={study:'#1d6ff2',composite:'#f59e0b',rest:'#37b7b7',other:'#b6b8bb'};
const validSeconds=value=>Number.isSafeInteger(value)&&value>=0;
function applicationBuckets(snapshot){
  const usage=snapshot.applicationUsage,c=usage?.nonSpecialCategories;
  if(snapshot.durationUnit!=='seconds'||!c||Array.isArray(c)||typeof c!=='object'
    ||!Object.values(c).every(validSeconds)||!validSeconds(usage.nonSpecialTotal))
    return {values:null,complete:false};
  const values={study:c.study??0,composite:(c.composite??0)+(c.unclassified??0),
    rest:c.restrictedEntertainment??0,other:c.other??0};
  if(!Object.values(values).every(validSeconds))return {values:null,complete:false};
  return {values,complete:snapshot.complete===true&&usage.complete===true
    &&Object.keys(c).every(key=>['study','composite','unclassified','restrictedEntertainment','other'].includes(key))};
}
function bucketSummary(result,note='',inline=false){
  const tag=inline?'div':'section';
  return '<'+tag+' class="usage-bucket-summary"><h3>时间桶用量</h3><div class="usage-four-buckets">'+
    Object.keys(webBuckets.labels).map(key=>'<div data-display-bucket="'+key+'"><b><i style="background:'+bucketColors[key]+'"></i>'+
      webBuckets.labels[key]+'</b><p>'+(result.values?durationSeconds(result.values[key]):'暂不可用')+'</p></div>').join('')+
    '</div>'+(!result.values?'<p>桶用量暂不可用；当前读取结果没有可确认的时间桶数据。</p>':
      !result.complete?'<p>桶用量不完整；仅显示已知部分，原统计总量保持不变。</p>':'')+
    (note?'<p>'+esc(note)+'</p>':'')+'</'+tag+'>';
}
function usageStyle(){
  return `<style>
  .computer-view{display:grid;gap:20px;min-width:0;color:#203b35}
  .computer-view section{min-width:0;background:#fff;border:1px solid #dce7e3;border-radius:14px;padding:22px}
  .computer-view h3{font-size:18px;margin:0 0 16px}.computer-view p{line-height:1.6;color:#697d78}
  .usage-four-buckets{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px}
  .usage-four-buckets b{display:flex;align-items:center;gap:8px}.usage-four-buckets i{width:13px;height:13px;display:inline-block;border-radius:4px}
  .usage-four-buckets p{margin:8px 0 0 21px}.usage-chart-scroll{overflow-x:auto}
  .usage-time-bars{display:flex;gap:8px;height:208px;align-items:stretch;min-width:620px;padding-top:12px}
  .usage-time-column{flex:1;min-width:16px;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-end;text-align:center}
  .usage-bar-track{height:170px;display:flex;align-items:flex-end;border-bottom:1px solid #dce7e3}
  .usage-bar-fill{width:100%;background:#64748b;border-radius:4px 4px 0 0}
  .usage-total-legend{display:flex;align-items:center;gap:8px}
  .usage-total-legend i{width:13px;height:13px;background:#64748b;border-radius:4px}
  .usage-overview strong{display:block;font-size:36px;margin:8px 0}
  .usage-source-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
  .usage-source-list dt{color:#697d78}.usage-source-list dd{margin:8px 0;font-size:20px;font-weight:600}
  .usage-detail-actions{display:flex;gap:12px;flex-wrap:wrap}
  @media(max-width:600px){.usage-source-list{grid-template-columns:1fr}.usage-overview strong{font-size:30px}}
  .usage-bar-track.is-missing{background:repeating-linear-gradient(135deg,#f0f3f2,#f0f3f2 4px,#fff 4px,#fff 8px)}
  .usage-time-column small{display:block;margin-top:8px;font-size:12px;white-space:nowrap}
  .usage-app-toolbar{display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap}
  .usage-app-toolbar input{font:inherit;padding:10px 12px;border:1px solid #c9ddd6;border-radius:10px;max-width:100%;box-sizing:border-box}
  .usage-app-list{display:grid}.usage-app-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;padding:16px 0;border-bottom:1px solid #e7eeeb}
  .usage-app-row strong,.usage-app-row small{overflow-wrap:anywhere}.usage-app-row small{display:block;color:#697d78;margin-top:5px}
  .computer-view button{font:inherit;min-height:42px;padding:8px 14px;border:1px solid #c9ddd6;border-radius:9px;background:white;cursor:pointer}
  .computer-view button:focus-visible,.computer-view input:focus-visible{outline:2px solid #168d72;outline-offset:2px}
  .computer-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  .computer-view .computer-metric strong{font-size:30px;display:block;margin-top:10px}
  .computer-view .computer-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px}
  .computer-view .computer-metric{padding:20px;background:white;border:1px solid #dce7e3;border-radius:14px}
  .computer-view [hidden]{display:none!important}
  .computer-view section.usage-analysis-card{background:var(--card,#fff);border:1px solid var(--border,#dce7e3);border-radius:10px;padding:18px 20px}
  .computer-view .usage-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:16px}
  .computer-view .usage-total-label{font-size:13px;margin-bottom:6px}
  .computer-view .usage-total-value{font-size:28px;font-weight:800;letter-spacing:0}
  .computer-view .usage-date-nav{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px;font-size:15px;font-weight:650}
  .computer-view .usage-date-nav button{border-radius:8px;min-height:0;padding:7px 11px;font-size:13px;font-weight:650}
  .computer-view .usage-analysis-card .usage-bucket-summary h3{font-size:13px;font-weight:400;color:var(--muted,#697d78)}
  .computer-view .usage-source-table{width:100%;border-collapse:collapse;text-align:left;font-size:14px}
  .computer-view .usage-source-table th,.computer-view .usage-source-table td{padding:12px;border-bottom:1px solid var(--border,#dce7e3)}
  .computer-view .usage-source-table th{background:var(--bg,#f6f9f8);color:var(--muted,#697d78)}
  .computer-view .usage-source-table td:last-child{text-align:right;white-space:nowrap}
  .computer-view .usage-application-table{table-layout:fixed}
  .computer-view .usage-application-table th:first-child{width:54%}
  .computer-view .usage-application-table td{vertical-align:top;overflow-wrap:anywhere}
  .computer-view .usage-application-table details{font-size:12px;color:var(--muted,#697d78);margin-top:4px}
  .computer-view .usage-application-table summary{cursor:pointer}
  .computer-view .usage-application-table code{white-space:normal;overflow-wrap:anywhere}
  .computer-view .usage-distribution h3{font-size:13px;font-weight:400;color:var(--muted,#697d78)}
  .computer-view .usage-list-toolbar{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:12px}
  .computer-view .usage-list-toolbar h3{margin:0}
  .computer-view .usage-secondary-details{border-top:1px solid var(--border,#dce7e3);margin-top:16px}
  @media(max-width:600px){.computer-view section.usage-analysis-card{padding:14px}.computer-view .usage-card-head{display:grid;gap:14px}.computer-view .usage-date-nav{justify-content:flex-start}.computer-view .usage-date-nav>span{width:100%}.computer-view .usage-total-value{font-size:26px}}
  @media(max-width:600px){.computer-view section{padding:16px}.computer-view .computer-metrics{grid-template-columns:1fr}.computer-view .computer-metric strong{font-size:26px}.usage-four-buckets{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.usage-app-toolbar input{width:100%}.usage-app-row{grid-template-columns:minmax(0,1fr);gap:6px}}
  </style>`;
}
function timeDistribution(snapshot,inline=false){
  const tag=inline?'div':'section';
  const hourly=snapshot.fromDate===snapshot.toDate,rows=snapshot.buckets||[];
  const max=Math.max(1,...rows.map(row=>validSeconds(row.duration)?row.duration:0));
  return '<'+tag+' class="usage-distribution"><h3>'+(hourly?'每小时使用':'每日使用')+'</h3><p class="usage-total-legend"><i aria-hidden="true"></i>总用量（不分桶）</p><p>北京时间 · 当前时间分布仅提供总量，不按四桶着色；不表示连续使用的起止位置。</p>'+
    (rows.length?'<div class="usage-chart-scroll"><div class="usage-time-bars">'+rows.map(row=>{
      const known=validSeconds(row.duration),date=new Date(row.startAtMs);
      const caption=Number.isFinite(date.getTime())?date.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',...(hourly?{hour:'2-digit',hourCycle:'h23'}:{month:'2-digit',day:'2-digit'})}):'时间未提供';
      const description=caption+' · '+(known?durationSeconds(row.duration):'统计缺失');
      return '<div class="usage-time-column" title="'+esc(description)+'" aria-label="'+esc(description)+'"><div class="usage-bar-track'+(known?'':' is-missing')+'">'+
        (known?'<div class="usage-bar-fill" style="height:'+row.duration/max*100+'%"></div>':'')+'</div><small>'+esc(caption)+'</small></div>';
    }).join('')+'</div></div>':'<p>当前范围暂无可用时间分布。</p>')+
    (rows.some(row=>!validSeconds(row.duration))?'<p>斜纹表示统计缺失，不代表零用量。</p>':'')+'</'+tag+'>';
}
function applicationRows(snapshot,search=''){
  return (snapshot.applications||[]).map((item,index)=>({item,index}))
    .filter(({item})=>String(item.displayName||'').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort((a,b)=>(validSeconds(b.item.duration)?b.item.duration:-1)-(validSeconds(a.item.duration)?a.item.duration:-1)
      ||String(a.item.subjectKey||'').localeCompare(String(b.item.subjectKey||'')));
}
function applicationList(snapshot,search=''){
  const rows=applicationRows(snapshot,search);
  return rows.length?'<table class="usage-source-table usage-application-table"><thead><tr><th>管理对象</th><th>分类</th><th>当前范围用量</th></tr></thead><tbody>'+rows.map(({item})=>'<tr data-application-key="'+esc(item.subjectKey)+'"><td><strong>'+
    esc(item.displayName||'未命名应用')+'</strong><details><summary>对象详情</summary>管理对象：<code>'+esc(item.subjectKey||'标识未提供')+'</code></details></td><td>'+esc((item.classifications||[]).map(key=>labels[key]||'分类信息缺失').join('／')||'分类信息缺失')+
    '</td><td>'+durationSeconds(item.duration)+'</td></tr>').join('')+'</tbody></table>':
    '<p>'+(search?'没有匹配的应用':snapshot.complete?'暂无使用记录':'尚无可用应用明细')+'</p>';
}
function applicationSummary(snapshot){
  const total=snapshot.totalDuration??snapshot.availableTotalDuration;
  const partial=snapshot.complete!==true,usage=snapshot.applicationUsage;
  const hasTotal=validSeconds(total),days=snapshot.days||[];
  const noRecords=days.filter(day=>(day.reasonCodes||[]).includes('APPLICATION_V3_RECORDS_NOT_AVAILABLE')).map(day=>day.date);
  return usageStyle()+'<section class="usage-analysis-card"><div class="usage-card-head"><div><div class="usage-total-label">应用使用'+(partial?'已知小计':'时间')+'</div><div class="usage-total-value"><strong>'+durationSeconds(total)+'</strong></div></div><div class="usage-date-nav computer-toolbar"><span>'+esc(snapshot.fromDate)+(snapshot.fromDate===snapshot.toDate?'':' — '+esc(snapshot.toDate))+'</span></div></div>'+
    (snapshot.readDisplay?'<p>'+esc(snapshot.readDisplay)+'</p>':'')+
    (partial?'<p>统计不完整；保留已有有效读数，缺失不代表零用量。</p>':'')+
    (snapshot.productStatus?.complete===false?'<p>应用明细尚不完整；'+(hasTotal?'基础用量仍有效。':'基础用量尚不可用。')+'</p>':'')+
    (snapshot.statistics?.stale&&hasTotal?'<p>更新中，保留已有有效读数。</p>':'')+
    (noRecords.length?'<p>无新版应用记录：'+esc(noRecords.join('、'))+'；尚无已发布记录，空白不代表零用量。</p>':partial&&hasTotal?'<p>部分统计可用。</p>':'')+
    timeDistribution(snapshot,true)+
    bucketSummary(applicationBuckets(snapshot),'四桶显示非特殊应用用量；不以四桶之和替代应用总量。',true)+
    '<p>特殊应用用量：'+durationSeconds(usage?.specialTotal)+'；单独说明，不新增时间桶，不重复加入总量。</p>'+
    '</section><section class="usage-analysis-card"><div class="usage-app-toolbar"><h3>应用明细</h3><label>搜索应用 <input type="search" data-application-search placeholder="搜索应用名称"></label><button data-independent-retry>刷新</button></div><p>按当前范围用量降序；同名的不同管理对象分别显示。</p><div class="usage-app-list" data-application-list>'+applicationList(snapshot)+'</div>'+
    '<details class="usage-secondary-details"><summary>应用分类明细（不是时间桶）</summary><p>保留原分类统计，可能重叠，不相加生成总量。</p>'+
    (snapshot.categories||[]).map(row=>'<p>'+esc(labels[row.classification]||'分类信息缺失')+' · '+durationSeconds(row.duration)+'</p>').join('')+'</details>'+
    ((snapshot.instances||[]).length?'<details><summary>基础程序实例（'+snapshot.instances.length+'）</summary>'+(snapshot.instances||[]).map(row=>'<p>'+esc(row.subjectKey)+' · '+durationSeconds(row.duration)+'</p>').join('')+'</details>':'')+
    '<details><summary>来源状态与诊断详情</summary><p>Service 已发布整数秒统计</p>'+
    (snapshot.statistics?.settledThroughByDate||[]).map(day=>'<p>'+esc(day.date)+' · 结算截止 '+esc(Number.isSafeInteger(day.settledThroughMs)?time(day.settledThroughMs):'未提供')+'</p>').join('')+
    days.map(day=>'<p>'+esc(day.date)+' · '+esc((day.reasonCodes||[]).join(' · '))+'</p>').join('')+
    '<p>'+esc([...(snapshot.productStatus?.reasonCodes||[]),...(usage?.reasonCodes||[])].join(' · ')||'无额外诊断')+'</p></details></section>';
}
function summary(snapshot){
const seconds=snapshot.schemaVersion===2;
if(seconds&&snapshot.durationUnit!=='seconds')throw new Error('INVALID_STATISTICS_SECONDS');
const format=seconds?durationSeconds:duration,totals=snapshot.totals;
const computer=seconds?totals.computer:totals.computerMs,web=seconds?totals.web:totals.webMs,application=seconds?totals.application:totals.applicationMs,special=seconds?totals.specialIncluded:totals.chromeIncludedMs;
const categories=seconds?snapshot.categories:snapshot.categoriesMs,codes=seconds?snapshot.reasonCodes:snapshot.reasons;
const container=seconds?'特殊应用':'Chrome';
const versions=seconds?Object.entries(snapshot.sourceVersions).map(([kind,revision])=>'<li>'+esc(kind==='web'?'网页':'应用')+' · 来源版本 '+esc(revision??'未报告')+'</li>').join(''):snapshot.sourceVersions.map(source=>'<li>'+esc(source.kind==='web'?'网页':'应用')+' · 已结算至 '+esc(time(source.settledAtMs))+'</li>').join('');
const statusLabels={complete:'统计完整',partial:'部分来源可读（当前显示已知小计，不是完整合计）',unavailable:'统计不可用'};
const sourceStatus=snapshot.sourceStatus||{web:'unavailable',application:'unavailable'};
const sourceCategories=kind=>'<div><b>'+esc(kind==='web'?'网页原分类':'应用原分类')+'</b><p>'+Object.entries((seconds?snapshot.sourceCategories:snapshot.sourceCategoriesMs)?.[kind]||{}).map(([category,value])=>esc(labels[category]||category)+' '+format(value)).join(' · ')+'</p></div>';
return '<style>.computer-view{display:grid;gap:16px}.computer-view button,.computer-view select{max-width:100%}.computer-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.computer-metric{padding:16px;border:1px solid #dce7e3;border-radius:12px;background:#fff}.computer-metric strong{display:block;font-size:22px;margin-top:8px}.computer-view section{padding:18px;background:#fff;border:1px solid #dce7e3;border-radius:12px}.computer-view p{margin:8px 0;color:#697d78;line-height:1.6}.computer-view ul{padding:0;list-style:none}.computer-view li{padding:10px 0;border-bottom:1px solid #e7eeeb;overflow-wrap:anywhere}.computer-view small{color:#697d78}.computer-category-list{display:flex;gap:20px;flex-wrap:wrap}.computer-status{background:#fff5df!important}.computer-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.computer-timeline{max-height:500px;overflow:auto}.computer-view details{padding:10px 0}.computer-view [hidden]{display:none!important}</style>'+
'<style>.computer-view button,.computer-view select{min-height:44px;padding:9px 14px;border:1px solid #c9ddd6;border-radius:10px;background:#fff;color:inherit;font:inherit;line-height:1.4}.computer-view button{cursor:pointer}.computer-view button:hover{background:#edf7f3}.computer-view button:disabled{opacity:.55;cursor:default}.computer-view button:focus-visible,.computer-view select:focus-visible{outline:2px solid #168d72;outline-offset:2px}.computer-view summary{cursor:pointer;min-height:44px;display:list-item;padding:10px 0}</style>'+
usageStyle()+'<section class="usage-analysis-card"><div class="usage-card-head"><div><div class="usage-total-label">'+(seconds&&!snapshot.complete?'电脑已知小计（来源累计）':'电脑使用时间')+'</div><div class="usage-total-value">'+format(computer)+'</div></div><div class="usage-date-nav computer-toolbar"><span>'+esc(snapshot.fromDate)+(snapshot.fromDate===snapshot.toDate?'':' — '+esc(snapshot.toDate))+'</span></div></div>'+
(!snapshot.complete?'<p>来源未齐，当前仅显示可用部分，不是完整合计。</p>':'')+
bucketSummary({values:null,complete:false},'当前电脑汇总未提供可靠的四桶和小时分布；不按分类推算，总量保持原值。',true)+'</section>'+
'<section class="usage-analysis-card"><div class="usage-list-toolbar"><h3>来源明细</h3><button data-computer-retry>刷新</button></div><table class="usage-source-table"><thead><tr><th>来源</th><th>使用时间</th></tr></thead><tbody><tr><td>网页主用量</td><td>'+format(web)+'</td></tr><tr><td>应用主用量</td><td>'+format(application)+'</td></tr><tr><td>'+container+' 容器扣除</td><td>'+format(special)+'</td></tr></tbody></table>'+
'<p>电脑使用＝网页＋应用－应用总量中 '+container+' 的贡献。其他应用与网页同时使用仍分别累计。</p>'+
'<div class="usage-detail-actions"><button data-computer-detail="products">查看产品</button><button data-computer-detail="timeline">查看时间线</button></div><div data-computer-products></div><div data-computer-timeline class="computer-timeline"></div>'+
'<details class="usage-secondary-details"><summary>分类归集（不是时间桶）</summary><p>排除已确认 '+container+' 容器，分类允许重叠，不能相加为电脑总量。</p><div class="computer-category-list">'+Object.entries(categories).map(([key,value])=>'<p><b>'+esc(labels[key]||key)+'</b><br>'+format(value)+'</p>').join('')+'</div><h4>独立权威分类（原口径）</h4>'+sourceCategories('web')+sourceCategories('application')+'</details>'+
'<details class="usage-secondary-details"><summary>来源状态与诊断详情</summary><p>云端按孩子汇总网页与应用使用；多台设备分别累计，不做跨设备重叠扣除。</p><p>产品与 Chrome 内容：容器只扣除一次；时间线区间宽度不代表网页有效计秒，不用于推算小时分布。</p><p>网页：'+esc(statusLabels[sourceStatus.web])+' · 应用：'+esc(statusLabels[sourceStatus.application])+'</p><p>'+esc(seconds?'权威来源整数秒统计':snapshot.historyStatus==='bestEffort'?'历史数据，尽力还原':'当前来源')+'</p><ul>'+[...new Set(codes)].map(code=>'<li>'+esc(reasons[code]||code)+' <small>'+esc(code)+'</small></li>').join('')+'</ul><ul>'+versions+'</ul></details></section>';
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
let generation=0,snapshot=null,scope,lastMarkup='';
const cache=createReadCache({shouldCache:value=>!(value.schemaVersion===2?value.reasonCodes:value.reasons)?.some(code=>/UNAVAILABLE|PENDING|STALE|SOURCE_VERSION_CHANGED|MEMORY_LIMIT/.test(code))});
const readView=(query,refresh=false)=>cache.read(JSON.stringify([getScope?.()??null,query]),()=>read(query),{refresh});
async function load({refresh=false}={}){
const currentScope=getScope?.();if(currentScope!==scope){scope=currentScope;snapshot=null;lastMarkup='';}
const token=++generation;host.innerHTML='<p>正在读取云端电脑使用…</p>';
try{const {value:result}=await readView({detail:'summary',durationUnit:'seconds'},refresh);if(token!==generation)return;const markup=summary(result);snapshot=result;host.classList.add('computer-view');host.innerHTML=markup;if(onRange)host.querySelector('.computer-toolbar').insertAdjacentHTML('beforeend','<button data-computer-period="previous" aria-label="上一日或上一周">‹</button><button data-computer-period="today">'+(result.fromDate===result.toDate?'今天':'本周')+'</button><button data-computer-period="next" aria-label="下一日或下一周">›</button>');lastMarkup=host.innerHTML;}
catch(error){if(token!==generation)return;if(error?.status===401||error?.status===403){cache.clear();snapshot=null;lastMarkup='';}host.innerHTML=lastMarkup?lastMarkup+'<section><p>更新失败，保留本范围上次有效统计；不是当前同步结果。</p><small>'+esc(error?.code||'COMPUTER_USAGE_UNAVAILABLE')+'</small><button data-computer-retry>重试</button></section>':'<section><h3>电脑使用暂不可用</h3><p>独立网页、媒体与应用统计不受影响。请重试。</p><button data-computer-retry>重试</button></section>';}
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
return {load,invalidate(){generation++;snapshot=null;lastMarkup='';host.innerHTML='';}};
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
if(snapshot.source==='application'&&snapshot.durationUnit==='seconds')return applicationSummary(snapshot);
const web=snapshot.source==='web';
const quotaRows=snapshot.quotaRows;
const bucketMarkup=web?'<section><h3>时间桶用量</h3><div class="computer-category-list">'+Object.entries(webBuckets.sum(Array.isArray(quotaRows)?quotaRows:[])).map(([key,value])=>'<p><b>'+webBuckets.labels[key]+'</b><br>'+(!Array.isArray(quotaRows)?'不可用':durationSeconds(value))+'</p>').join('')+'</div>'+(!Array.isArray(quotaRows)||quotaRows.some(row=>!webBuckets.category(row))?'<p>时间桶明细不完整；未明确桶的用量保留在原统计总量中，不猜测归属。</p>':'')+'</section>':null;
const seconds=snapshot.durationUnit==='seconds';
const format=seconds?value=>{if(value===null||value===undefined)return '不可用';if(!Number.isSafeInteger(value)||value<0)throw new Error('INVALID_STATISTICS_SECONDS');const h=Math.floor(value/3600),m=Math.floor(value%3600/60),s=value%60;return (h?h+'小时 ':'')+m+'分 '+s+'秒';}:duration;
const valueOf=item=>seconds?item.duration:item.durationMs;
const title={application:'应用使用',web:'网页使用',media:'网页媒体使用'}[snapshot.source];
const stats=snapshot.source==='application'?snapshot.statistics:null;
const identity=snapshot.source==='application'&&snapshot.model==='program-instance-v1';
const hasBaseUsage=(seconds?[snapshot.totalDuration,snapshot.availableTotalDuration]:[snapshot.totalDurationMs,snapshot.availableTotalDurationMs]).some(value=>Number.isFinite(value)&&value>=0);
const partialTotal=seconds&&snapshot.totalDuration==null&&snapshot.availableTotalDuration!=null;
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
(snapshot.readDisplay?'<p>'+esc(snapshot.readDisplay)+'</p>':'')+sourceInfo+(snapshot.compatibility==='legacy'?'<p>旧版兼容统计，尚未采用新版 Service 秒统计。</p>':'')+(seconds&&snapshot.complete===false&&snapshot.availableTotalDuration!=null?'<p>部分统计可用：'+format(snapshot.availableTotalDuration)+'；不完整日期：'+esc(stats?.missingDates?.join('、')||'尚未确认')+'。空白不代表零用量。</p>':'')+'<div class="computer-metrics"><article class="computer-metric"><small>'+esc(title)+(partialTotal?'已知小计':'时间')+'</small><strong>'+format(seconds?(snapshot.totalDuration??snapshot.availableTotalDuration):snapshot.totalDurationMs)+'</strong></article></div>'+
productNotice+instanceDetails+(bucketMarkup||'<section><h3>分类明细</h3><p>独立来源原口径；明细可能重叠，不相加生成总量。</p><div class="computer-category-list">'+snapshot.categories.map(item=>'<p><b>'+esc(labels[item.classification]||item.classification)+'</b><br>'+format(valueOf(item))+'</p>').join('')+'</div></section>')+
'<section><h3>时间分布</h3><ul>'+snapshot.buckets.map(item=>'<li>'+esc(item.label||time(item.startAtMs))+' · '+format(valueOf(item))+'</li>').join('')+'</ul></section>'+
'<section><h3>'+esc(snapshot.source==='application'?'应用明细':'网站明细')+'</h3><ul>'+snapshot.applications.map(item=>'<li><strong>'+esc(item.displayName)+'</strong> · '+esc(item.classifications?.length?item.classifications.map(category=>labels[category]||category).join('／'):labels[item.classification]||item.classification)+' · '+format(valueOf(item))+'</li>').join('')+'</ul></section>';
}
function createIndependent(host,read,onRange,getScope){
let generation=0,lastMarkup='',scope,snapshot=null;
host.classList.add('computer-view');
async function load(refresh=false){
const currentScope=getScope?.();if(currentScope!==scope){scope=currentScope;lastMarkup='';snapshot=null;}
const token=++generation;host.innerHTML='<p>正在读取独立使用统计…</p>';
try{const result=await read({refresh});if(token===generation&&currentScope===getScope?.()){snapshot=result;host.innerHTML=independentSummary(result);if(onRange)host.querySelector('.computer-toolbar').insertAdjacentHTML('beforeend','<button data-independent-period="previous" aria-label="上一周期">‹</button><button data-independent-period="today">今天</button><button data-independent-period="next" aria-label="下一周期">›</button>');lastMarkup=result.source==='application'?host.innerHTML:'';}}
catch(error){if(token===generation&&currentScope===getScope?.()){if(error?.status===401||error?.status===403){lastMarkup='';snapshot=null;}host.innerHTML=lastMarkup?lastMarkup+'<section><p>更新失败，以下为上次有效统计，不代表当前已同步；截止见来源信息。</p><small>'+esc(error?.code||'SOURCE_UNAVAILABLE')+'</small><button data-independent-retry>重试</button></section>':'<section><h3>使用统计暂不可用</h3><p>其他统计和设备管理不受影响。</p><small>'+esc(error?.code||'SOURCE_UNAVAILABLE')+'</small><button data-independent-retry>重试</button></section>';}}
}
host.addEventListener('click',event=>{if(event.target.closest('[data-independent-retry]'))void load(true);const direction=event.target.closest('[data-independent-period]')?.dataset.independentPeriod;if(direction&&onRange)onRange(direction);});
host.addEventListener('input',event=>{if(event.target.matches('[data-application-search]')&&snapshot&&scope===getScope?.())host.querySelector('[data-application-list]').innerHTML=applicationList(snapshot,event.target.value);});
return{load,invalidate(){generation++;lastMarkup='';snapshot=null;host.innerHTML='';}};
}
const api={create,createIndependent,createReadCache,summary,independentSummary,detailRows,duration,applicationBuckets,bucketSummary,timeDistribution,applicationRows,usageStyle};if(typeof module==='object')module.exports=api;else root.ComputerUsageView=api;
})(typeof globalThis==='object'?globalThis:this);

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const view=require('./computer-usage-view.js');
const raw=fs.readFileSync(path.join(__dirname,'computer-usage-view.js'),'utf8');
assert.ok(!raw.includes('data-computer-select'),'child summary must not contain a source/computer selector');
const controller=fs.readFileSync(path.join(__dirname,'app-runtime.js'),'utf8');
assert.ok(controller.includes('特殊应用 · 原应用配置：'));
assert.ok(controller.includes("current==='special'?'特殊应用':'普通应用'"));
const directory=controller.match(/function directoryMembers\(category\) \{([\s\S]*?)\n  \}/)[0];
const state={catalog:{items:[{platform:'windows',runtimeIdentity:null,presentationKind:'contentBased',runtimeImplementations:[{platform:'windows',runtimeIdentity:'chrome1'},{platform:'windows',runtimeIdentity:'chrome2'}]}]},records:{pending:[{platform:'windows',runtimeIdentity:'chrome1'},{platform:'windows',runtimeIdentity:'chrome2'},{platform:'windows',runtimeIdentity:'excel'}]}};
const keyOf=item=>item.platform+'|'+item.runtimeIdentity;
const members=new Function('state','AppRuntimePolicy','$',directory+';return directoryMembers;')(state,{keyOf},()=>({value:'usage'}));
assert.equal(members('special').length,1);assert.deepEqual(members('unclassified').map(item=>item.runtimeIdentity),['excel']);
assert.equal(raw,fs.readFileSync(path.join(__dirname,'../../pages/computer-usage-view.js'),'utf8'),'both cloud pages use identical readonly renderer');
const mainPage=fs.readFileSync(path.join(__dirname,'../../pages/index.html'),'utf8');
const applicationRead=mainPage.slice(mainPage.indexOf('const cloudApplicationReader='),mainPage.indexOf('const cloudApplicationReader=')+1200);
assert.ok(applicationRead.includes("source:'application',durationUnit:'seconds'"),'main application view explicitly selects seconds');
for(const file of ['app-runtime.yml','app-runtime-main-console.yml']){
  const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows',file),'utf8');
  assert.ok(workflow.includes('node app-runtime-management/console/computer-usage-view.test.cjs'),'renderer regression must run in '+file);
}
const snapshot={schemaVersion:1,revision:'r1',fromDate:'2026-10-01',toDate:'2026-10-01',complete:false,reasons:['APPLICATION_SOURCE_UNAVAILABLE'],totals:{computerMs:null,webMs:1501,applicationMs:null,overlapMs:null},categoriesMs:{study:null},devices:[{key:'child',name:'该孩子的全部设备',complete:false,totalMs:null,webMs:1501,applicationMs:null,chromeUnexplainedMs:null}],sourceVersions:[{kind:'web',settledAtMs:null}]};
const html=view.summary(snapshot);assert.ok(html.includes('网页与应用'));assert.ok(!html.includes('网页设备与电脑之间缺少可信关联'));assert.ok(html.includes('1秒 501毫秒'));assert.ok(html.includes('不可用'));assert.ok(!html.includes('usage-stack-chart'));
assert.equal(view.duration(null),'不可用');assert.equal(view.duration(0),'0分 0秒');assert.equal(view.duration(1501),'0分 1秒 501毫秒');
const products=view.detailRows('products',[{key:'opaque-product',name:'<script>x</script>',source:'application',special:true,durationMs:1501,classification:['study'],chromeContent:{complete:false,explainedMs:null,unexplainedMs:null,categoriesMs:{study:null}}}]);
assert.ok(products.includes('&lt;script&gt;'));assert.ok(!products.includes('<script>'));assert.ok(products.includes('data-computer-chrome="opaque-product"'));assert.ok(products.includes('网页统计有缺失'));
assert.ok(products.includes('原应用历史归类，仅用于原口径；不贡献统一分类'));
const childContent=view.detailRows('products',[{key:'child-chrome',name:'Chrome',source:'application',special:true,durationMs:1501,classification:['composite'],chromeContent:{scope:'child',webMs:3000,complete:true,explainedMs:null,unexplainedMs:null,categoriesMs:{study:3000}}}]);
assert.ok(childContent.includes('该孩子的网页内容'));assert.ok(childContent.includes('不代表全部发生在该 Chrome 容器内'));assert.ok(!childContent.includes('网页解释'));
const statusHtml=view.summary({...snapshot,sourceStatus:{web:'complete',application:'partial'},historyStatus:'bestEffort',overlapStatus:'unconfirmed',categoryBasis:'sourceCumulative',categoriesMs:{study:1501},sourceCategoriesMs:{web:{study:1501},application:{composite:3001}}});
assert.ok(statusHtml.includes('电脑使用＝网页＋应用－应用总量中 Chrome 的贡献'));
assert.ok(statusHtml.includes('不是完整合计'));assert.ok(statusHtml.includes('独立权威分类'));assert.ok(statusHtml.includes('历史数据，尽力还原'));
assert.ok(statusHtml.includes('<details><summary>来源状态与诊断详情</summary>'));
for(const [file,attribute] of [['index.html','data-usage-kind'],['../../pages/index.html','data-cloud-usage-ledger']]){
const page=fs.readFileSync(path.join(__dirname,file),'utf8');
const tabs=[...page.matchAll(new RegExp(attribute+'="([^"]+)"[^>]*>([^<]+)<','g'))].map(match=>[match[1],match[2]]);
assert.deepEqual(tabs,[['computer','电脑使用'],['application','应用使用'],['web','网页使用'],['media','网页媒体使用']]);
assert.ok(page.includes('.computer-view[hidden]'),'hidden root beats display:grid');
}
const independent=view.independentSummary({source:'web',fromDate:'2026-10-01',toDate:'2026-10-01',totalDurationMs:5134000,categories:[{classification:'study',durationMs:5134000}],buckets:[],applications:[]});
assert.ok(independent.includes('1小时 25分 34秒'));assert.ok(!independent.includes('电脑总用量'));
const appSnapshot={source:'application',fromDate:'2026-10-04',toDate:'2026-10-04',totalDurationMs:51125,categories:[{classification:'unclassified',durationMs:51125}],buckets:[],applications:[],statistics:{producer:'native',stale:true,computedAtMs:1791100800000,settledThroughByDate:[{date:'2026-10-04',settledThroughMs:1791100700000}]}};
assert.ok(view.independentSummary(appSnapshot).includes('Service 已发布持久化统计'));
assert.ok(view.independentSummary(appSnapshot).includes('结算截止'));
assert.ok(view.independentSummary(appSnapshot).includes('更新中，保留已有有效读数'));
assert.ok(view.independentSummary({...appSnapshot,statistics:{producer:'legacy-server'}}).includes('非最新 Service 统计'));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const pending=deferred(),events={},host={innerHTML:'',classList:{add(){}},addEventListener(name,fn){events[name]=fn;},querySelector(){return null;}};
const reader=view.create(host,()=>pending.promise);const work=reader.load();reader.invalidate();pending.resolve(snapshot);
work.then(async()=>{
let unavailable=false;
const independentHost={...host,innerHTML:''},independentReader=view.createIndependent(independentHost,async()=>{if(unavailable)throw Object.assign(Error('pending'),{code:'APPLICATION_STATISTICS_PENDING'});return appSnapshot;});
await independentReader.load();unavailable=true;await independentReader.load(true);
assert.ok(independentHost.innerHTML.includes('51秒 125毫秒'),'failure preserves previous valid value, never fake zero');
assert.ok(independentHost.innerHTML.includes('上次有效统计'));
independentReader.invalidate();await independentReader.load();
assert.ok(!independentHost.innerHTML.includes('51秒 125毫秒'),'selection invalidation must not retain another scope');
assert.equal(host.innerHTML,'','invalidated selection clears old data and late response cannot paint');
let clock=0,calls=0;const cache=view.createReadCache({now:()=>clock,maxEntries:2,ttlMs:30}),loader=async()=>({total:++calls});
const first=await cache.read('child-a|day',loader);assert.equal(first.cached,false);
assert.equal((await cache.read('child-a|day',loader)).cached,true);assert.equal(calls,1);
await cache.read('child-b|day',loader);assert.equal(calls,2);
await cache.read('child-a|day',loader,{refresh:true});assert.equal(calls,3);
clock=31;await cache.read('child-a|day',loader);assert.equal(calls,4);
const delayed=deferred();const one=cache.read('pending',()=>delayed.promise),two=cache.read('pending',loader);
delayed.resolve({total:5});assert.deepEqual(await one,await two);assert.equal(calls,4);
const forgotten=deferred();const previous=cache.read('forgotten',()=>forgotten.promise);cache.clear();forgotten.resolve({total:1});await previous;
assert.equal((await cache.read('forgotten',loader)).cached,false);
await assert.rejects(cache.read('error',async()=>{throw Error('offline');}));assert.equal((await cache.read('error',loader)).cached,false);
await cache.read('one',loader);await cache.read('two',loader);assert.equal((await cache.read('forgotten',loader)).cached,false);
const queries=[],cleanHost={...host,innerHTML:''};await view.create(cleanHost,async(query)=>{queries.push(query);return snapshot;}).load();
assert.deepEqual(queries,[{detail:'summary',durationUnit:'seconds'}]);assert.ok(!cleanHost.innerHTML.includes('<select'));
let currentScope='child-a|day',viewCalls=0;
const successfulSnapshot={...snapshot,reasons:[]};
const cachedReader=view.create(cleanHost,async()=>{viewCalls++;return successfulSnapshot;},null,()=>currentScope);
await cachedReader.load();cachedReader.invalidate();await cachedReader.load();assert.equal(viewCalls,1,'switching back uses the same generated summary');
await cachedReader.load({refresh:true});assert.equal(viewCalls,2,'manual refresh bypasses memory cache');
currentScope='child-b|day';await cachedReader.load();assert.equal(viewCalls,3,'child changes never reuse another child snapshot');
currentScope='child-a|week';await cachedReader.load();assert.equal(viewCalls,4,'dates belong to the memory cache key');
assert.ok(controller.includes('computerReader.load({refresh})'),'outer refresh passes through to summary reader');
let failedCalls=0;const failedReader=view.create(cleanHost,async()=>{failedCalls++;return {...snapshot,reasons:['APPLICATION_SOURCE_UNAVAILABLE']};});
await failedReader.load();await failedReader.load();assert.equal(failedCalls,2,'partial source failures do not become successful memory cache entries');
const productMarkup=view.independentSummary({source:'application',fromDate:'2026-10-04',toDate:'2026-10-04',
  totalDurationMs:51125,categories:[],buckets:[],applications:[{displayName:'同一产品',classification:'historicalUnknown',
    classifications:['study','composite'],durationMs:51125}],statistics:{producer:'native'}});
assert.ok(productMarkup.includes('学习／复合'));
assert.ok(productMarkup.includes('51秒 125毫秒')||productMarkup.includes('51秒')||productMarkup.includes('51秒'));
const secondsMarkup=view.independentSummary({source:'application',fromDate:'2026-10-05',toDate:'2026-10-06',durationUnit:'seconds',complete:false,
  totalDuration:null,availableTotalDuration:51,categories:[{classification:'study',duration:51}],buckets:[{startAtMs:1,duration:51},{startAtMs:2,duration:null}],
  applications:[{displayName:'测试产品',classifications:['study','other'],duration:51}],statistics:{producer:'native',missingDates:['2026-10-06']}});
assert.ok(secondsMarkup.includes('0分 51秒'));assert.ok(secondsMarkup.includes('部分统计可用'));assert.ok(secondsMarkup.includes('2026-10-06'));
assert.ok(secondsMarkup.includes('学习／其他'));assert.ok(secondsMarkup.includes('不可用'));assert.ok(!secondsMarkup.includes('毫秒'));
assert.throws(()=>view.independentSummary({source:'application',durationUnit:'seconds',totalDuration:1.5,categories:[],applications:[],buckets:[]}),/INVALID_STATISTICS_SECONDS/);
const computerSeconds={schemaVersion:2,durationUnit:'seconds',revision:'computer-v2:test',fromDate:'2026-10-05',toDate:'2026-10-05',complete:true,
  sourceStatus:{web:'complete',application:'complete'},sourceVersions:{web:'web-revision',application:'app-revision'},
  totals:{computer:13,web:3,application:15,specialIncluded:5},categories:{study:13,other:2},
  sourceCategories:{web:{study:3},application:{study:10,other:5}},reasonCodes:[]};
const computerSecondsHtml=view.summary(computerSeconds);
assert.ok(computerSecondsHtml.includes('0分 13秒'));assert.ok(computerSecondsHtml.includes('0分 15秒'));
assert.ok(computerSecondsHtml.includes('特殊应用 容器扣除'));assert.ok(computerSecondsHtml.includes('0分 5秒'));
assert.ok(computerSecondsHtml.includes('权威来源整数秒统计'));assert.ok(!computerSecondsHtml.includes('毫秒'));
assert.ok(computerSecondsHtml.includes('查看产品'));assert.ok(computerSecondsHtml.includes('查看时间线'));
assert.ok(!computerSecondsHtml.includes('<select'));
const partialSecondsHtml=view.summary({...computerSeconds,complete:false,sourceStatus:{web:'complete',application:'unavailable'},
  totals:{computer:null,web:3,application:null,specialIncluded:null},reasonCodes:['APPLICATION_STATISTICS_UNAVAILABLE']});
assert.ok(partialSecondsHtml.includes('0分 3秒'));assert.ok(partialSecondsHtml.includes('当前仅显示可用部分'));
assert.ok(partialSecondsHtml.includes('APPLICATION_STATISTICS_UNAVAILABLE'));
assert.throws(()=>view.summary({...computerSeconds,totals:{...computerSeconds.totals,computer:13.1}}),/INVALID_STATISTICS_SECONDS/);
assert.throws(()=>view.summary({...computerSeconds,durationUnit:'milliseconds'}),/INVALID_STATISTICS_SECONDS/);
const secondQueries=[],secondsHost={...host,innerHTML:''};
await view.create(secondsHost,async query=>{secondQueries.push(query);return computerSeconds;}).load();
assert.deepEqual(secondQueries,[{detail:'summary',durationUnit:'seconds'}]);assert.ok(secondsHost.innerHTML.includes('0分 13秒'));
let secondsFailureCalls=0;
const secondsFailureReader=view.create(secondsHost,async()=>{secondsFailureCalls++;return {...computerSeconds,reasonCodes:['APPLICATION_STATISTICS_UNAVAILABLE']};});
await secondsFailureReader.load();await secondsFailureReader.load();
assert.equal(secondsFailureCalls,2,'seconds source failures are not cached as a current success');
console.log('PASS renderer/cache: child summary, precision, source isolation, TTL, refresh, single-flight, eviction, failure, stale response');
}).catch(error=>{console.error(error);process.exitCode=1;});

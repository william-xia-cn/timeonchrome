'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs');
const view=require('../../pages/computer-usage-view');
const samples=require('../fixtures/usage-view-samples');
const clone=value=>JSON.parse(JSON.stringify(value));
function host(){
  const events={},list={innerHTML:''};
  return {innerHTML:'',classList:{add(){}},events,list,
    addEventListener(name,handler){events[name]=handler;},
    querySelector(){return list;}};
}
test('four buckets use non-special input only; other retained, unclassified not a fifth bucket',()=>{
  const sample=clone(samples.application),before=JSON.stringify(sample);
  assert.deepEqual(view.applicationBuckets(sample),{values:{study:1200,composite:900,rest:900,other:600},complete:true});
  const html=view.independentSummary(sample);
  assert.equal((html.match(/data-display-bucket=/g)||[]).length,4);
  assert.match(html,/应用使用时间/);assert.match(html,/1小时 30分 0秒/);
  assert.match(html,/特殊应用用量：30分 0秒/);
  assert.equal(JSON.stringify(sample),before,'no source mutation, total or quota recomputation');
  sample.applicationUsage.nonSpecialCategories.unknown=55;
  assert.equal(view.applicationBuckets(sample).complete,false);
  delete sample.applicationUsage;assert.equal(view.applicationBuckets(sample).values,null);
  assert.match(view.independentSummary(sample),/桶用量暂不可用/);
});
test('zero and unavailable differ; invalid and overflowing seconds never become zero',()=>{
  const sample=clone(samples.application);
  sample.applicationUsage.nonSpecialCategories={};
  assert.deepEqual(view.applicationBuckets(sample).values,{study:0,composite:0,rest:0,other:0});
  sample.applicationUsage.nonSpecialCategories={study:null};
  assert.equal(view.applicationBuckets(sample).values,null);
  sample.applicationUsage.nonSpecialCategories={composite:Number.MAX_SAFE_INTEGER,unclassified:1};
  assert.equal(view.applicationBuckets(sample).values,null);
});
test('hour bars preserve positions, known zeros and missing hours; week uses daily values',()=>{
  const sample=clone(samples.application);sample.buckets[3].duration=null;
  const html=view.timeDistribution(sample);
  assert.equal((html.match(/class="usage-time-column"/g)||[]).length,24);
  assert.equal((html.match(/usage-bar-track is-missing/g)||[]).length,1);
  assert.match(html,/03.*统计缺失/);assert.match(html,/00.*0分 0秒/);
  assert.match(view.timeDistribution({...sample,toDate:'2026-10-27',buckets:[sample.buckets[0]]}),/每日使用/);
});
test('same-name objects retained, duration descending, stable keys and search without mutation',()=>{
  const sample=clone(samples.application),before=JSON.stringify(sample);
  assert.deepEqual(view.applicationRows(sample).map(row=>row.item.subjectKey),
    ['fixture:browser','fixture:machine-a:editor','fixture:machine-b:editor','fixture:long']);
  assert.equal(view.applicationRows(sample,'编辑器').length,2);
  assert.equal(view.applicationRows(sample,'不存在').length,0);
  assert.equal(JSON.stringify(sample),before);
});
test('computer retains totals and source detail, never treats categories as four buckets or fabricates hours',()=>{
  const sample=clone(samples.computer),before=JSON.stringify(sample),html=view.summary(sample);
  assert.match(html,/1小时 10分 0秒/);assert.match(html,/分类归集（不是时间桶）/);
  assert.match(html,/桶用量暂不可用/);assert.doesNotMatch(html,/usage-time-column" title=/);
  assert.match(html,/data-computer-detail="products"/);assert.match(html,/data-computer-detail="timeline"/);
  assert.equal(JSON.stringify(sample),before);
});
test('application retains same-scope success on failure, clears on range and authorization changes',async()=>{
  let scope='child|day|device-a',failure=false;
  const target=host(),reader=view.createIndependent(target,async()=>{if(failure)throw {status:503};return samples.application;},null,()=>scope);
  await reader.load();failure=true;await reader.load(true);assert.match(target.innerHTML,/上次有效统计/);
  scope='child|day|device-b';await reader.load();assert.doesNotMatch(target.innerHTML,/编辑器|上次有效统计/);
});
test('late application responses, including failure, cannot replace a new scope; input filters current snapshot',async()=>{
  let scope='a',resolve,reject;
  const target=host();
  let read=()=>new Promise((yes,no)=>{resolve=yes;reject=no;});
  const reader=view.createIndependent(target,()=>read(),null,()=>scope);
  const old=reader.load();scope='b';read=async()=>({...samples.application,applications:[]});
  await reader.load();resolve(samples.application);await old;assert.doesNotMatch(target.innerHTML,/管理对象：fixture/);
  read=()=>new Promise((yes,no)=>{reject=no;});const failing=reader.load();
  scope='c';read=async()=>samples.application;await reader.load();reject({status:401});await failing;
  assert.match(target.innerHTML,/编辑器/);
  target.events.input({target:{matches:()=>true,value:'编辑器'}});
  assert.match(target.list.innerHTML,/machine-a:editor/);assert.doesNotMatch(target.list.innerHTML,/fixture:browser/);
  reader.invalidate();assert.equal(target.innerHTML,'');
});
test('both distributed views are the same implementation except the local require path',()=>{
  const main=fs.readFileSync('pages/computer-usage-view.js','utf8');
  const runtime=fs.readFileSync('app-runtime-management/console/computer-usage-view.js','utf8');
  assert.equal(runtime,main.replace("require('../app-runtime-management/console/web-usage-buckets.js')","require('./web-usage-buckets.js')"));
});
test('page refresh preserves the active reader, while inactive readers are invalidated',()=>{
  const main=fs.readFileSync('pages/index.html','utf8');
  assert.match(main,/if\(!computer\)cloudComputerReader\.invalidate\(\)/);
  assert.match(main,/if\(!application\)cloudApplicationReader\.invalidate\(\)/);
  const runtime=fs.readFileSync('app-runtime-management/console/app-runtime.js','utf8');
  assert.match(runtime,/if\(state\.usageKind!=='computer'\)computerReader\.invalidate\(\)/);
  assert.match(runtime,/data-usage-app="\$\{index\}".*?\$\{rank\+1\}/);
});

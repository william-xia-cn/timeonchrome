const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('pages/composite-review.js', 'utf8');
class Element {
  constructor(tag='div') { this.tag=tag; this.childNodes=[]; this.events={}; this.textContent=''; }
  append(...nodes) { this.childNodes.push(...nodes); }
  replaceChildren(...nodes) { this.childNodes=nodes; }
  setAttribute() {}
  addEventListener(name,fn) { this.events[name]=fn; }
}
const flatten = node => [node.textContent,...node.childNodes.map(flatten)].join(' ');
const deferred = () => { let resolve,reject; const promise=new Promise((r,j)=>{resolve=r;reject=j;}); return {promise,resolve,reject}; };
const flush = () => new Promise(resolve=>setImmediate(resolve));
function harness() {
  const nodes=new Map(), requests=[], toasts=[];
  const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  const context={document:{head:new Element('head'),createElement:tag=>new Element(tag),getElementById:get},
    currentProfileId:'a',remoteConfigVersion:1,remoteConfig:{},fmtSecs:n=>`${n}s`,confirm:()=>true,
    toast:(...args)=>toasts.push(args),api:(...args)=>{const d=deferred();requests.push({args,...d});return d.promise;},
    saveProfileConfig:async()=>{},applyProfileConfigResponse:()=>{throw Error('unexpected stale config');}};
  context.window=context;vm.createContext(context);vm.runInContext(source,context);
  return {context,get,requests,toasts};
}
const list=(reviews=[])=>({enabled:false,usage:[],reviews});
(async()=>{
  // A late response from a previous child cannot populate the current view.
  const a=harness(), old=a.context.loadCompositeReviews();
  a.context.currentProfileId='b';a.context.resetCompositeReviews();
  a.requests[0].resolve(list([{id:'private-a',site:'old.example',date:'2026-09-28',total_seconds:30}]));await old;
  assert.equal(a.get('composite-review-list').childNodes.length,0);
  assert.equal(a.get('composite-review-save').disabled,true);
  // Same-child refresh also invalidates earlier requests.
  const b=harness(), first=b.context.loadCompositeReviews(), second=b.context.loadCompositeReviews();
  b.requests[1].resolve(list());await second;b.requests[0].resolve(list([{site:'stale'}]));await first;
  assert.ok(!flatten(b.get('composite-review-list')).includes('stale'));
  // Detail is authoritative after corrections, and raw device identifiers are never rendered.
  const c=harness(), load=c.context.loadCompositeReviews();
  c.requests[0].resolve(list([{id:'r',date:'2026-09-28',site:'example.org',total_seconds:2000}]));await load;
  const row=c.get('composite-review-list').childNodes[0];row.open=true;row.events.toggle();
  c.requests[1].resolve({review:{id:'r',total_seconds:1900},rawSeconds:1900,unassignedSeconds:0,publishedRawDeltaSeconds:0,
    complete:true,pages:[],devices:[{deviceId:'PRIVATE-DEVICE',cutoff:1,evidenceStatus:'ready',rawSeconds:1900}]});await flush();
  const detail=flatten(row.childNodes[1]);assert.ok(detail.includes('1900s'));assert.ok(!detail.includes('2000s'));assert.ok(!detail.includes('PRIVATE-DEVICE'));
  // Config readback after switching children must not update global configuration.
  const d=harness(), initial=d.context.loadCompositeReviews();d.requests[0].resolve(list());await initial;
  const save=d.get('composite-review-save').onclick();await flush();
  assert.ok(d.requests[1].args[0].endsWith('/a/config'));
  d.context.currentProfileId='b';d.context.resetCompositeReviews();d.requests[1].resolve({data:{},version:2});await save;
  assert.equal(d.toasts.length,0);
  // Unavailable is not an empty success; refresh recovers without a configuration write.
  const e=harness(), failed=e.context.loadCompositeReviews();e.requests[0].reject(Error('offline'));await failed;
  assert.equal(e.get('composite-review-save').disabled,true);
  assert.match(e.get('composite-review-status').textContent,/暂不可用/);
  const recovered=e.context.loadCompositeReviews();e.requests[1].resolve(list());await recovered;
  assert.equal(e.get('composite-review-save').disabled,false);
  // Enabling requires consent; cancellation performs no write.
  e.context.confirm=()=>false;e.get('composite-review-enabled').checked=true;
  let writes=0;e.context.saveProfileConfig=async()=>{writes++;};
  await e.get('composite-review-save').onclick();assert.equal(writes,0);
  // Save failure preserves retry, while successful save refreshes authoritative configuration.
  e.context.confirm=()=>true;e.context.saveProfileConfig=async()=>{throw Error('conflict');};
  await e.get('composite-review-save').onclick();assert.equal(e.get('composite-review-save').disabled,false);
  e.context.saveProfileConfig=async data=>{writes++;assert.equal(data.compositeReviewConfig.enabled,true);};
  let applied=0;e.context.applyProfileConfigResponse=()=>{applied++;};
  const success=e.get('composite-review-save').onclick();await flush();
  e.requests[2].resolve({data:{compositeReviewConfig:{enabled:true}},version:2});await flush();
  e.requests[3].resolve({...list(),enabled:true});await success;
  assert.equal(applied,1);assert.equal(writes,1);assert.equal(e.get('composite-review-enabled').checked,true);
  assert.equal(e.get('composite-review-save').disabled,false);
  console.log('Composite parent console: 7 focused scenarios PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});

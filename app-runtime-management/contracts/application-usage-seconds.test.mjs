import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APPLICATION_USAGE_SECONDS_READ_CAPABILITY, validateApplicationUsageSecondsQuery as query,
  validateApplicationUsageSecondsSnapshot as snapshot } from './dist/application-usage-seconds.js';
import { validateApplicationUsageSecondsSnapshot as exportedSnapshot } from './dist/native-host.js';

const vectors=JSON.parse(readFileSync(new URL('./application-usage-seconds.vectors.json',import.meta.url),'utf8'));
const schema=JSON.parse(readFileSync(new URL('./application-usage-seconds-v2.schema.json',import.meta.url),'utf8'));
const base=vectors.samples[0].snapshot, first=vectors.samples[0].query;
const copy=()=>structuredClone(base);
let checks=0;
const test=(name,run)=>{run();checks++;console.log('PASS '+name);};
const reject=mutate=>{const p=copy();mutate(p);assert.throws(()=>snapshot(p,first),/APPLICATION_USAGE_SECONDS_INVALID_SNAPSHOT/);};
test('固定导出、schema及共同向量',()=>{
  assert.equal(vectors.capability,APPLICATION_USAGE_SECONDS_READ_CAPABILITY);
  assert.equal(exportedSnapshot,snapshot);
  assert.equal(schema.$defs.query.additionalProperties,false);
  assert.equal(schema.$defs.snapshot.properties.applications.maxItems,100);
  for(const key of ['query','snapshot','day','hour','application'])assert(schema.$defs[key]);
  for(const v of vectors.samples){assert.equal(query(v.query),v.query);assert.equal(snapshot(v.snapshot,v.query),v.snapshot);}
});
test('拒绝自报身份、错误日期范围、offset和无版本续页',()=>{
  for(const q of [...vectors.invalidQueries,null,[],{}, {...first,offset:0.5}])assert.throws(()=>query(q),/APPLICATION_USAGE_SECONDS_INVALID_QUERY/);
  query({...first,offset:100,expectedRevision:base.revision});
  query({...first,toDate:'2026-10-12'});
});
test('完整真实0秒与未知严格区分',()=>{
  const zero=copy();zero.totalSeconds=zero.knownTotalSeconds=0;zero.knownCategoriesSeconds={};zero.applications=[];
  zero.days[0].totalSeconds=0;zero.days[0].categoriesSeconds={};
  zero.days[0].hours.forEach(h=>{h.totalSeconds=0;h.categoriesSeconds={};});snapshot(zero,first);
  const unknown=structuredClone(zero);Object.assign(unknown,{complete:false,totalSeconds:null,computedAtMs:null,lastSettledAtMs:null,reasonCodes:['APPLICATION_SECONDS_VERSION_MISSING']});
  Object.assign(unknown.days[0],{status:'unknown',complete:false,totalSeconds:null,generatedAtMs:null,settledThroughMs:null,hours:[],reasonCodes:unknown.reasonCodes});
  snapshot(unknown,first);
});
test('历史缺口保留新已知量，不冒充全天完整',()=>{
  const p=copy();Object.assign(p,{complete:false,totalSeconds:null,reasonCodes:['APPLICATION_LEDGER_V2_V3_MIXED_UNVERIFIED']});
  Object.assign(p.days[0],{status:'incomplete',complete:false,reasonCodes:p.reasonCodes});p.applications.forEach(a=>a.totalSeconds=null);
  snapshot(p,first);assert.equal(p.knownTotalSeconds,6);
});
test('pending_update保留既有完整冻结统计',()=>{const p=copy();p.days[0].status='pending_update';snapshot(p,first);});
test('同一冻结版本分页、100上限、旧页及错页拒绝',()=>{
  const p=copy();p.applications=Array.from({length:100},(_,i)=>({...base.applications[0],key:'product:'+i}));p.nextOffset=100;
  snapshot(p,first);
  const next=structuredClone(p);next.nextOffset=200;snapshot(next,{...first,offset:100,expectedRevision:p.revision});
  assert.throws(()=>snapshot(next,{...first,offset:100,expectedRevision:'another-version'}));
  reject(p=>p.nextOffset=100);
  reject(p=>p.applications=Array.from({length:101},(_,i)=>({...base.applications[0],key:'product:'+i})));
  reject(p=>p.applications[1].key=p.applications[0].key);
});
test('跨日／周按各日权威量归集，截止为冻结父版本',()=>{
  const p=copy();p.toDate='2026-10-07';p.days.push({...structuredClone(p.days[0]),date:p.toDate,generatedAtMs:p.computedAtMs+86400000,settledThroughMs:p.lastSettledAtMs+86400000});
  p.computedAtMs+=86400000;p.lastSettledAtMs+=86400000;p.totalSeconds=p.knownTotalSeconds=12;
  p.knownCategoriesSeconds={study:8,other:8};p.applications.forEach(a=>{a.dailySeconds[p.toDate]=4;a.totalSeconds=a.knownTotalSeconds=8;});
  snapshot(p,{...first,toDate:p.toDate});reject(p=>p.computedAtMs++);reject(p=>p.lastSettledAtMs++);
});
test('用量为整数秒，时刻仍是毫秒，旧Ms不冒充',()=>{
  reject(p=>p.durationUnit='milliseconds');reject(p=>p.knownTotalSeconds=6.1);
  reject(p=>p.totalMs=6000);reject(p=>p.days[0].totalSeconds=6.1);
  reject(p=>p.days[0].settledThroughMs=p.computedAtMs+1);
});
test('自身日小时守恒，不相加重叠分类／产品',()=>{
  snapshot(base,first);assert.equal(base.applications.reduce((n,a)=>n+a.totalSeconds,0),8);
  reject(p=>p.days[0].hours[1].totalSeconds++);
  reject(p=>p.days[0].hours[0].categoriesSeconds.study++);
  reject(p=>p.days[0].hours[0].hour=1);
  reject(p=>p.knownTotalSeconds++);reject(p=>p.applications[0].knownTotalSeconds++);
  reject(p=>p.knownCategoriesSeconds.study++);
});
test('隐私字段、非法类别、控制字符及假完整拒绝',()=>{
  reject(p=>p.days[0].childId='not-authority');reject(p=>p.applications[0].path='not-allowed');
  reject(p=>p.applications[0].name='bad\u0000name');reject(p=>p.applications[0].classifications=['unknown-category']);
  reject(p=>p.days[0].status='unknown');reject(p=>p.complete=false);
});
console.log(`Application usage seconds: ${checks} groups PASS`);

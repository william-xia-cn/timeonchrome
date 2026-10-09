import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APPLICATION_USAGE_SECONDS_READ_CAPABILITY, validateApplicationUsageSecondsQuery as query,
  validateApplicationUsageSecondsSnapshot as snapshot } from './dist/application-usage-seconds.js';
import { validateApplicationUsageSecondsSnapshot as exportedSnapshot } from './dist/native-host.js';
import {validateApplicationIdentityUsageQuery as identityQuery,validateApplicationIdentityUsageSnapshot as identitySnapshot} from './dist/application-usage-seconds.js';

const iq={fromDate:'2026-10-09',toDate:'2026-10-09',offset:0};
const iday={date:iq.fromDate,status:'available',baseRevision:1,manifestHash:'a'.repeat(64),generatedAtMs:1791504000000,
  settledThroughMs:1791504000000,complete:true,reasonCodes:[],totalSeconds:600,
  hours:Array.from({length:24},(_,hour)=>({hour,totalSeconds:hour===0?600:0}))};
const identityBase={schemaVersion:3,durationUnit:'seconds',timezone:'Asia/Shanghai',fromDate:iq.fromDate,toDate:iq.toDate,
  view:'base',revision:'identity-read-1',base:{complete:true,reasonCodes:[],computedAtMs:iday.generatedAtMs,lastSettledAtMs:iday.settledThroughMs,
    totalSeconds:600,knownTotalSeconds:600,days:[iday]},product:null,
  subjects:['b','c'].map(c=>({key:'instance:'+c.repeat(64),totalSeconds:400,knownTotalSeconds:400,dailySeconds:{[iq.fromDate]:400}})),nextOffset:null};
assert.deepEqual(identitySnapshot(identityBase,iq),identityBase,'主体可重叠，不累加主体冒充总量');
assert.throws(()=>identityQuery({...iq,childId:'client-chosen'}));
assert.throws(()=>identityQuery({...iq,view:'unknown'}));
assert.throws(()=>identityQuery({...iq,offset:100}));
assert.throws(()=>identitySnapshot(identityBase,{...iq,expectedRevision:'different'}));
assert.throws(()=>identitySnapshot({...identityBase,subjects:identityBase.subjects.map(s=>({...s,name:'fake'}))},iq));
const missingProduct={...identityBase,view:'product',subjects:[],product:{days:[{date:iq.fromDate,status:'missing',baseManifestHash:iday.manifestHash,
  projectionHash:null,revision:null,catalogVersion:null,complete:false,reasonCodes:['PRODUCT_PROJECTION_MISSING'],categoriesSeconds:{},hours:[],applicationUsage:null}]}};
assert.deepEqual(identitySnapshot(missingProduct,{...iq,view:'product'}).base,identityBase.base,'产品缺失不影响基础600秒');
const availableProduct=structuredClone(missingProduct);
Object.assign(availableProduct.product.days[0],{status:'available',projectionHash:'d'.repeat(64),revision:2,catalogVersion:7,complete:true,reasonCodes:[],
  categoriesSeconds:{study:600},hours:Array.from({length:24},(_,hour)=>({hour,categoriesSeconds:hour===0?{study:600}:{}})),applicationUsage:{nonSpecialTotal:600,nonSpecialCategories:{study:600},specialTotal:0,complete:true,reasonCodes:[]}});
availableProduct.subjects=[{key:'product:example',name:'示例应用',totalSeconds:600,knownTotalSeconds:600,dailySeconds:{[iq.fromDate]:600}}];
assert.equal(identitySnapshot(availableProduct,{...iq,view:'product'}).subjects[0].name,'示例应用');
const mismatch=structuredClone(availableProduct);mismatch.product.days[0].baseManifestHash='e'.repeat(64);
assert.throws(()=>identitySnapshot(mismatch,{...iq,view:'product'}));
const staleProduct=structuredClone(availableProduct);staleProduct.product.days[0].status='stale';staleProduct.subjects[0].totalSeconds=null;
assert.equal(identitySnapshot(staleProduct,{...iq,view:'product'}).base.complete,true);
const changed=structuredClone(identityBase);changed.base.days[0].hours[0].totalSeconds=599;
assert.throws(()=>identitySnapshot(changed,iq));
console.log('PASS: identity base/product separation, missing/stale projection, no fabricated name, scope, dimensions and revision');

const vectors=JSON.parse(readFileSync(new URL('./application-usage-seconds.vectors.json',import.meta.url),'utf8'));
const schema=JSON.parse(readFileSync(new URL('./application-usage-seconds-v2.schema.json',import.meta.url),'utf8'));
for(const sample of vectors.identitySamples){identityQuery(sample.query);identitySnapshot(sample.snapshot,sample.query);}
assert.deepEqual(vectors.identitySamples.map(v=>v.snapshot),[identityBase,missingProduct,availableProduct]);
assert.equal(schema.$defs.identitySnapshot.properties.subjects.maxItems,100);
assert.equal(schema.$defs.identityQuery.additionalProperties,false);
const wrongProductHour=structuredClone(availableProduct);wrongProductHour.product.days[0].hours[0].categoriesSeconds.study=599;
assert.throws(()=>identitySnapshot(wrongProductHour,{...iq,view:'product'}));
const independentHour=structuredClone(availableProduct);independentHour.product.days[0].hours[0].categoriesSeconds.study=599;
independentHour.product.days[0].hours[1].categoriesSeconds.study=1;
assert.equal(identitySnapshot(independentHour,{...iq,view:'product'}).base.totalSeconds,600,'小时分类与基础总量可有秒分配错位');
const identityPage=structuredClone(identityBase);
identityPage.subjects=Array.from({length:100},(_,i)=>({key:'instance:'+i.toString(16).padStart(64,'0'),totalSeconds:1,knownTotalSeconds:1,dailySeconds:{[iq.fromDate]:1}}));
identityPage.nextOffset=100;
assert.equal(identitySnapshot(identityPage,iq).nextOffset,100);
const identityLast={...identityPage,subjects:identityPage.subjects.slice(0,1),nextOffset:null};
assert.equal(identitySnapshot(identityLast,{...iq,offset:100,expectedRevision:identityPage.revision}).subjects.length,1);
assert.throws(()=>identitySnapshot({...identityPage,nextOffset:200},iq));
assert.throws(()=>identitySnapshot({...identityPage,subjects:identityPage.subjects.slice(0,99)},iq));
assert.throws(()=>identitySnapshot({...identityPage,subjects:[...identityPage.subjects,identityPage.subjects[0]]},iq));
assert.throws(()=>identitySnapshot({...identityLast,subjects:[identityLast.subjects[0],identityLast.subjects[0]]},iq));
const twoDays=structuredClone(identityBase),nextDate='2026-10-10';
twoDays.toDate=nextDate;
twoDays.base.days.push({date:nextDate,status:'unknown',baseRevision:null,manifestHash:null,generatedAtMs:null,settledThroughMs:null,complete:false,reasonCodes:['STATISTICS_NOT_AVAILABLE'],totalSeconds:null,hours:[]});
twoDays.base.complete=false;twoDays.base.totalSeconds=null;
twoDays.base.reasonCodes=['STATISTICS_NOT_AVAILABLE'];
twoDays.subjects.forEach(s=>{s.totalSeconds=null;s.dailySeconds[nextDate]=null;});
assert.equal(identitySnapshot(twoDays,{...iq,toDate:nextDate}).base.knownTotalSeconds,600,'未知日保留已知日的有效数值');
const fakeZero=structuredClone(twoDays);fakeZero.subjects[0].dailySeconds[nextDate]=0;
assert.throws(()=>identitySnapshot(fakeZero,{...iq,toDate:nextDate}));
assert.throws(()=>identitySnapshot({...identityBase,base:{...identityBase.base,childId:'client-chosen'}},iq));
console.log('PASS: identity pagination, duplicate rejection, cross-day unknown preservation and exact fields');
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

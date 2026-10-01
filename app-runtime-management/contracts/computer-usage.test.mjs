import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeComputerUsage, withComputerUsageRevision, computerUsagePage, computerUsageReadPage, exactComputerUsageOverlap } from './dist/computer-usage.js';
const day = '2026-09-27', start = Date.parse(`${day}T00:00:00+08:00`);
const base = { computerKey:'opaque-computer-a', computerName:'Fixture computer', revision:'v1', correctionRevision:'c1',
  settledAtMs:start + 1000000, complete:true, reasons:[] };
const vectors = JSON.parse(readFileSync(new URL('./computer-usage.vectors.json', import.meta.url),'utf8'));
const schema = JSON.parse(readFileSync(new URL('./computer-usage-v1.schema.json', import.meta.url),'utf8'));
for(const key of ['sourceStatus','historyStatus','overlapStatus','categoryBasis','sourceCategoriesMs'])
  assert(schema.$defs.response.required.includes(key),`${key} status belongs to the public schema`);
assert(schema.$defs.timelineItem.properties.containerRelation.enum.includes('childContent'));
function fixture(v) {
  const web = { ...base, key:'opaque-browser-a', totalMs:v.webMs, categoriesMs:{[v.webClass]:v.webMs},
    intervals:[{startMs:start,endMs:start+v.webWidth,creditedMs:v.webMs,classification:v.webClass,subjectKey:'site-a',label:'Fixture site'}] };
  const apps = { ...base, key:'opaque-app-source-a', associationVersion:'association-v1', totalMs:v.appMs,categoriesMs:{[v.appClass]:v.appMs},
    intervals:[{startMs:start+v.appOffset,endMs:start+v.appOffset+v.appMs,classification:v.appClass,subjectKey:'product-a',label:'Fixture application',special:v.special}] };
  return {fromDate:day,toDate:day,web:[web],applications:[apps]};
}
let assertions=0;
for(const v of vectors.cases) {
  const input=fixture(v), before=JSON.stringify(input), result=mergeComputerUsage(input), device=result.devices[0];
  assert.equal(result.complete,v.expected.complete,v.name);
  assert.equal(result.totals.computerMs,v.expected.computerMs,v.name);
  assert.equal(device.overlapMs,v.expected.overlapMs,v.name);
  assert.equal(device.chromeUnexplainedMs,v.expected.chromeUnexplainedMs,v.name);
  if(v.special){const chrome=result.products.find(row=>row.special);assert.equal(chrome.chromeContent.unexplainedMs,v.expected.chromeUnexplainedMs);}
  assert.deepEqual(result.categoriesMs,v.expected.categoriesMs,v.name);
  assert.equal(JSON.stringify(input),before,'sources/quotas/ledger input unchanged'); assertions+=6;
}
const input=fixture(vectors.cases[0]);
const dual=structuredClone(input);
dual.web.push({...structuredClone(input.web[0]),key:'opaque-browser-b',computerKey:'opaque-computer-b'});
dual.applications.push({...structuredClone(input.applications[0]),key:'opaque-app-source-b',computerKey:'opaque-computer-b'});
assert.equal(mergeComputerUsage(dual).totals.computerMs,1200000,'cross-computer concurrency is accumulated, not unioned');
const unmapped=structuredClone(input);unmapped.web[0].computerKey=null;
const missing=mergeComputerUsage(unmapped);
assert.equal(missing.totals.computerMs,600000);assert.equal(missing.totals.webMs,600000);assert.equal(missing.totals.applicationMs,600000);
assert(missing.reasons.includes('DEVICE_MAPPING_INCOMPLETE'));
assert.deepEqual(missing.sourceStatus,{web:'complete',application:'complete'});
assert.equal(missing.overlapStatus,'unconfirmed');assert.equal(missing.categoryBasis,'sourceCumulative');
assert.deepEqual(missing.categoriesMs,{study:600000},'unconfirmed overlap must not erase valid classification or add Chrome container');
assert.deepEqual(missing.sourceCategoriesMs.application,{composite:600000},'original Chrome classification remains readable');
const empty=mergeComputerUsage({fromDate:day,toDate:day,web:[],applications:[]});assert.equal(empty.complete,false);assert.equal(empty.totals.computerMs,null);
const zero=structuredClone(input);for(const source of [...zero.web,...zero.applications]){source.totalMs=0;source.intervals=[];source.categoriesMs={};}
assert.equal(mergeComputerUsage(zero).totals.computerMs,0,'proven complete zero is not unavailable');
const nullSource=structuredClone(zero);nullSource.web[0].totalMs=null;nullSource.web[0].complete=false;
assert.equal(mergeComputerUsage(nullSource).totals.webMs,null,'source failure is never fake zero');
const partial=structuredClone(input);partial.web[0].complete=false;assert.equal(mergeComputerUsage(partial).totals.computerMs,null);
const noClock=structuredClone(input);noClock.applications[0].complete=false;noClock.applications[0].statisticsComplete=true;
noClock.applications[0].reasons=['APPLICATION_CLOCK_EVIDENCE_INCOMPLETE'];
assert.equal(mergeComputerUsage(noClock).sourceStatus.application,'complete','statistics completeness is not overlap proof');
const mismatch=structuredClone(input);mismatch.web[0].totalMs+=1000;assert(mergeComputerUsage(mismatch).reasons.includes('WEB_TOTAL_EVIDENCE_MISMATCH'));
const classMismatch=structuredClone(input);classMismatch.web[0].categoriesMs.study=0;assert(mergeComputerUsage(classMismatch).reasons.includes('WEB_CATEGORY_EVIDENCE_MISMATCH'));
const historical=structuredClone(input);historical.applications[0].intervals[0].classification='historicalUnknown';historical.applications[0].categoriesMs={historicalUnknown:600000};historical.applications[0].intervals[0].special=false;
assert.equal(mergeComputerUsage(historical).categoriesMs.historicalUnknown,600000,'no current-policy reclassification');
const duplicate=structuredClone(input);duplicate.web.push(structuredClone(duplicate.web[0]));assert.equal(mergeComputerUsage(duplicate).totals.computerMs,600000);
duplicate.web[1].revision='other';assert.equal(mergeComputerUsage(duplicate).totals.computerMs,null);
const repeatedApp=structuredClone(input);repeatedApp.applications.push({...structuredClone(input.applications[0]),key:'other-session'});
assert(mergeComputerUsage(repeatedApp).reasons.includes('APPLICATION_SOURCE_OVERLAP'),'existing session statistics not flattened to manufacture completeness');
const before=JSON.stringify(input);
Object.freeze(input.web[0].intervals[0]);Object.freeze(input.web[0]);Object.freeze(input.applications[0]);
const revision=await withComputerUsageRevision(mergeComputerUsage(input));
assert.equal(JSON.stringify(input),before);
assert.equal((await withComputerUsageRevision(mergeComputerUsage(input))).revision,revision.revision);
const corrected=structuredClone(input);corrected.web[0].correctionRevision='c2';assert.notEqual((await withComputerUsageRevision(mergeComputerUsage(corrected))).revision,revision.revision);
const associated=structuredClone(input);associated.applications[0].associationVersion='association-v2';assert.notEqual((await withComputerUsageRevision(mergeComputerUsage(associated))).revision,revision.revision);
const later=structuredClone(input);later.applications[0].intervals[0].endMs+=1;later.applications[0].totalMs+=1;later.applications[0].categoriesMs.composite+=1;
assert.notEqual((await withComputerUsageRevision(mergeComputerUsage(later))).revision,revision.revision,'late evidence invalidates cache even unchanged announced revision');
const page=computerUsagePage(revision,revision.revision,0,1);assert.equal(page.timeline.length,1);assert.equal(page.nextCursor,'1');
assert.equal(page.products.length,0,'timeline pages never carry all products');
const summary=computerUsageReadPage(revision);assert.equal(summary.timeline.length,0);assert.equal(summary.products.length,0);
assert.throws(()=>computerUsageReadPage(revision,'products'),/REVISION_REQUIRED/);
const productPage=computerUsageReadPage(revision,'products',revision.revision,0,1);assert.equal(productPage.products.length,1);assert.equal(productPage.timeline.length,0);assert.equal(productPage.nextCursor,'1');
const chromeKey=revision.products.find(row=>row.special).key;
const chromeTimeline=computerUsageReadPage(revision,'timeline',revision.revision,0,100,chromeKey);
assert(chromeTimeline.timeline.some(row=>row.containerRelation==='container'));
assert(chromeTimeline.timeline.some(row=>row.containerRelation==='content'));
assert.throws(()=>computerUsageReadPage(revision,'timeline',revision.revision,0,100,'unapproved'),/INVALID_PRODUCT/);
assert.throws(()=>computerUsageReadPage(revision,'summary',revision.revision,0,100,chromeKey),/INVALID_PRODUCT_DETAIL/);
const missingRevision=await withComputerUsageRevision(missing);
const unlinkedChrome=missingRevision.products.find(row=>row.special);
assert.equal(unlinkedChrome.chromeContent.scope,'child');assert.equal(unlinkedChrome.chromeContent.complete,true);
assert.equal(unlinkedChrome.chromeContent.webMs,600000);assert.equal(unlinkedChrome.chromeContent.explainedMs,null);
assert.equal(unlinkedChrome.chromeContent.unexplainedMs,null);
const childWeb=computerUsageReadPage(missingRevision,'timeline',missingRevision.revision,0,100,unlinkedChrome.key).timeline.filter(row=>row.source==='web');
assert.equal(childWeb.length,1);assert(childWeb.every(row=>row.containerRelation==='childContent'&&row.overlapMs===null),'child content is not claimed to be inside this Chrome');
const legacy=structuredClone(unmapped);
legacy.applications.push({...structuredClone(input.applications[0]),key:'old-app',computerKey:null,totalMs:1500,
  categoriesMs:{study:1500},complete:false,statisticsComplete:true,historyQuality:'bestEffort',
  intervals:[{...input.applications[0].intervals[0],subjectKey:'old-product',label:'Old product',endMs:start+1500,classification:'study',special:false}]});
const restored=mergeComputerUsage(legacy);
assert.equal(restored.historyStatus,'bestEffort');assert.equal(restored.totals.applicationMs,601500);
assert.equal(restored.categoriesMs.study,601500);assert.equal(restored.totals.computerMs,601500);
assert.equal(restored.sourceStatus.application,'complete');assert(restored.products.some(row=>row.historyQuality==='bestEffort'));
legacy.applications[1].totalMs=null;legacy.applications[1].statisticsComplete=false;
const partialHistory=mergeComputerUsage(legacy);
assert.equal(partialHistory.totals.applicationMs,600000,'failed historical source does not erase known current subtotal');
assert.equal(partialHistory.sourceStatus.application,'partial');assert(partialHistory.timeline.length>0);
const ordinaryUnmapped=fixture(vectors.cases[3]);ordinaryUnmapped.web[0].computerKey=null;
assert.equal(mergeComputerUsage(ordinaryUnmapped).categoriesMs.study,1200000,'source cumulative categories do not perform Child-wide time union');
const weekSource=structuredClone(unmapped);weekSource.fromDate='2026-09-26';
weekSource.web[0].sourceGroupKey='same-browser-source';
weekSource.web.push({...structuredClone(weekSource.web[0]),key:'same-browser-previous-day',
  intervals:weekSource.web[0].intervals.map(row=>({...row,startMs:row.startMs-86400000,endMs:row.endMs-86400000}))});
const groupedWeek=mergeComputerUsage(weekSource);
assert.equal(groupedWeek.devices.filter(row=>row.key==='unmapped:web:same-browser-source').length,1,'one weekly source selector, not seven invented computers');
assert.equal(groupedWeek.totals.webMs,1200000);assert.equal(groupedWeek.sourceStatus.web,'complete');
assert.equal(groupedWeek.products.find(row=>row.special).chromeContent.webMs,1200000);
const historicalVersion=await withComputerUsageRevision(restored);
const changedHistory=structuredClone(legacy);changedHistory.applications[1].revision='old-next';
assert.notEqual((await withComputerUsageRevision(mergeComputerUsage(changedHistory))).revision,historicalVersion.revision);
assert.throws(()=>computerUsageReadPage(revision,'products','stale'),/VERSION_CHANGED/);
assert.throws(()=>computerUsagePage(revision,'stale',0,1),/VERSION_CHANGED/);
assert.throws(()=>computerUsagePage(revision,undefined,0,101),/PAGINATION/);
assert.throws(()=>computerUsagePage(revision,undefined,1,1),/REVISION_REQUIRED/);
const unsafeCredit=structuredClone(input);unsafeCredit.web[0].intervals[0].creditedMs=1001;
assert.equal(mergeComputerUsage(unsafeCredit).timeline.filter(row=>row.source==='web').length,0,'invalid credit is not published as a usable product/timeline duration');
const prototypeClass=structuredClone(input);prototypeClass.applications[0].intervals[0].classification='__proto__';prototypeClass.applications[0].categoriesMs=JSON.parse('{"__proto__":600000}');prototypeClass.applications[0].intervals[0].special=false;
assert.equal(mergeComputerUsage(prototypeClass).categoriesMs.__proto__,600000,'dictionary classification cannot mutate an object prototype');
assert.throws(()=>mergeComputerUsage({...input,fromDate:'2026-02-30'}),/INVALID_DATE/);
assert.throws(()=>mergeComputerUsage({...input,fromDate:'2026-09-01'}),/INVALID_RANGE/);
const across=structuredClone(input);across.fromDate='2026-09-26';across.web[0].intervals[0].startMs=start-1000;across.web[0].intervals[0].endMs=start+1000;across.web[0].totalMs=2000;across.web[0].categoriesMs.study=2000;across.web[0].intervals[0].creditedMs=2000;
assert.equal(mergeComputerUsage(across).totals.computerMs,2000,'Chrome container excluded without altering cross-day web credit');
assert.equal(exactComputerUsageOverlap({startMs:0,endMs:1500,creditedMs:1000},[[0,1500]]),1000);
assert.equal(exactComputerUsageOverlap({startMs:0,endMs:1500,creditedMs:1000},[[1500,3000]]),0);
assert.equal(exactComputerUsageOverlap({startMs:0,endMs:1500,creditedMs:1000},[[500,1500]]),null);
assert.equal(exactComputerUsageOverlap({startMs:0,endMs:1000,creditedMs:1001},[[0,1000]]),null);
const bounded=structuredClone(input);
bounded.web[0].intervals=Array.from({length:10000},(_,index)=>({...input.web[0].intervals[0],startMs:start+index*2000,endMs:start+index*2000+1000,creditedMs:1000}));
bounded.applications[0].intervals=Array.from({length:10000},(_,index)=>({...input.applications[0].intervals[0],startMs:start+index*2000,endMs:start+index*2000+1500}));
bounded.web[0].totalMs=10000000;bounded.web[0].categoriesMs={study:10000000};
bounded.applications[0].totalMs=15000000;bounded.applications[0].categoriesMs={composite:15000000};
assert.equal(mergeComputerUsage(bounded).totals.computerMs,10000000,'bounded Chrome container excluded from cumulative sources');
bounded.web[0].intervals.push(structuredClone(bounded.web[0].intervals[0]));
assert.throws(()=>mergeComputerUsage(bounded),/EVIDENCE_LIMIT/);
console.log(`computer usage golden vectors: PASS (${vectors.cases.length} vectors, ${assertions} vector assertions + targeted invariants)`);

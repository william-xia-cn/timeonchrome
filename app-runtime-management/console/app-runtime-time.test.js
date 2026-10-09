const assert = require('node:assert/strict');
const test = require('node:test');
const { beijingHourLabel, beijingRange } = require('./app-runtime-time.js');

test('身份展示只格式化基础与产品投影，未识别和重叠不改变总量',()=>{
  const {applicationIdentityView}=require('./app-runtime-time.js');
  const snapshot={model:'program-instance-v1',durationUnit:'seconds',complete:true,totalDuration:60,availableTotalDuration:60,
    instances:[{subjectKey:'instance:a',duration:60},{subjectKey:'instance:b',duration:60}],
    applications:[],categories:[],productStatus:{complete:false,reasonCodes:['APPLICATION_PRODUCT_PROJECTION_NOT_AVAILABLE']},
    buckets:[{startAtMs:0,duration:60},{startAtMs:3600000,duration:null}],
    days:[{date:'2026-10-09',complete:true,settledThroughMs:123}],revision:'fixture'};
  const original=JSON.stringify(snapshot),view=applicationIdentityView(snapshot);
  assert.equal(view.totalDurationSeconds,60);assert.equal(view.instances.length,2);
  assert.equal(view.productStatus.complete,false);assert.deepEqual(view.categories,[]);
  assert.equal(view.buckets[1].durationSeconds,null);assert.equal(JSON.stringify(snapshot),original);
  assert.throws(()=>applicationIdentityView({...snapshot,durationUnit:'milliseconds'}));
  assert.throws(()=>applicationIdentityView({...snapshot,totalDuration:0.5}));
  const identified=applicationIdentityView({...snapshot,productStatus:{complete:true},
    applications:[{subjectKey:'product:word',displayName:'Word',duration:60,classifications:['study']}],
    categories:[{classification:'study',duration:60}]});
  assert.equal(identified.applications[0].displayName,'Word');assert.equal(identified.categories[0].durationSeconds,60);
});

test('application statistics notice has a real DOM target before requesting usage',()=>{
  const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
  assert.equal((html.match(/id="outside-window-summary"/g)||[]).length,1);
  assert.match(html,/<p id="outside-window-summary"><\/p>/);
  const script=require('node:fs').readFileSync(require('node:path').join(__dirname,'app-runtime.js'),'utf8');
  const secondsRenderer=script.slice(script.indexOf('function renderSecondsUsage'),script.indexOf('function observedApps'));
  assert.match(secondsRenderer,/class="bar-part"/);
});

test('day range starts at Beijing midnight without double-applying UTC+8', () => {
  const range = beijingRange('day', 0, Date.parse('2026-09-01T12:00:00Z'));
  assert.equal(new Date(range.from).toISOString(), '2026-08-31T16:00:00.000Z');
  assert.equal(new Date(range.to).toISOString(), '2026-09-01T16:00:00.000Z');
});

test('previous day uses the adjacent Beijing calendar day', () => {
  const range = beijingRange('day', -1, Date.parse('2026-09-01T12:00:00Z'));
  assert.equal(new Date(range.from).toISOString(), '2026-08-30T16:00:00.000Z');
  assert.equal(range.to - range.from, 24 * 60 * 60 * 1000);
});

test('week range starts Monday at Beijing midnight', () => {
  const range = beijingRange('week', 0, Date.parse('2026-09-01T12:00:00Z'));
  assert.equal(new Date(range.from).toISOString(), '2026-08-30T16:00:00.000Z');
  assert.equal(new Date(range.to).toISOString(), '2026-09-06T16:00:00.000Z');
});

test('Beijing midnight selects the new day exactly at the boundary', () => {
  const before = beijingRange('day', 0, Date.parse('2026-08-31T15:59:59.999Z'));
  const after = beijingRange('day', 0, Date.parse('2026-08-31T16:00:00.000Z'));
  assert.equal(new Date(before.from).toISOString(), '2026-08-30T16:00:00.000Z');
  assert.equal(new Date(after.from).toISOString(), '2026-08-31T16:00:00.000Z');
});

test('invalid periods and fractional offsets fail closed', () => {
  assert.throws(() => beijingRange('month'), RangeError);
  assert.throws(() => beijingRange('day', 0.5), TypeError);
});

test('hour labels come from each bucket timestamp in Beijing time', () => {
  assert.equal(beijingHourLabel(Date.parse('2026-09-01T09:00:00Z')), '17时');
  assert.equal(beijingHourLabel(Date.parse('2026-09-01T16:00:00Z')), '0时');
});

test('seconds view preserves source units, missing days and overlapping product classifications',()=>{
  const {formatSeconds,applicationSecondsView}=require('./app-runtime-time.js');
  const snapshot={durationUnit:'seconds',complete:false,totalDuration:null,availableTotalDuration:51,revision:'test',
    categories:[{category:'study',duration:51}],products:[{subjectKey:'product',displayName:'测试产品',duration:51,classifications:['study','other']}],
    days:[{date:'2026-10-05',complete:true,totalDuration:51,settledThroughMs:123,hours:[{kind:'total',hour:0,duration:51}]},
      {date:'2026-10-06',complete:false,totalDuration:null,settledThroughMs:null,hours:[]}]};
  const original=JSON.stringify(snapshot),view=applicationSecondsView(snapshot,'week');
  assert.equal(view.totalDurationSeconds,null);assert.equal(view.availableTotalDurationSeconds,51);
  assert.deepEqual(view.missingDates,['2026-10-06']);assert.equal(view.buckets[1].durationSeconds,null);
  assert.deepEqual(view.applications[0].classifications,['study','other']);
  assert.equal(Object.hasOwn(view,'totalDurationMs'),false);assert.equal(JSON.stringify(snapshot),original);
  assert.equal(formatSeconds(51),'51秒');assert.equal(formatSeconds(3661),'1小时1分1秒');assert.equal(formatSeconds(null),'—');
  assert.throws(()=>formatSeconds(1.5));assert.throws(()=>applicationSecondsView({...snapshot,durationUnit:'milliseconds'},'week'));
  assert.throws(()=>applicationSecondsView({...snapshot,totalDuration:51},'week'));
});

test('无新版记录保持未知秒数，明确标记日期而不是旧账回退或零',()=>{
  const {applicationSecondsView}=require('./app-runtime-time.js');
  const view=applicationSecondsView({durationUnit:'seconds',complete:false,totalDuration:null,availableTotalDuration:null,
    revision:'retired-test',categories:[],products:[],days:[{date:'2026-10-07',complete:false,totalDuration:null,
      settledThroughMs:null,hours:[],reasonCodes:['APPLICATION_V3_RECORDS_NOT_AVAILABLE']}]},'day');
  assert.equal(view.totalDurationSeconds,null);assert.equal(view.availableTotalDurationSeconds,null);
  assert.deepEqual(view.noNewRecordDates,['2026-10-07']);assert.ok(view.buckets.every(row=>row.durationSeconds===null));
});

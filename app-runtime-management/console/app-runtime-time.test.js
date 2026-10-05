const assert = require('node:assert/strict');
const test = require('node:test');
const { beijingHourLabel, beijingRange } = require('./app-runtime-time.js');

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

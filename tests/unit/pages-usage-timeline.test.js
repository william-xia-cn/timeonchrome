const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../pages/index.html'), 'utf8');
const start = source.indexOf('function cloudUsageTimelineCategory(');
const end = source.indexOf('function renderCloudUsageLegend(', start);
assert.ok(start >= 0 && end > start, '时段图函数应存在');
const code = source.slice(start, end);

function functions(api) {
  return vm.runInNewContext(`${code}\n({ cloudUsageTimelineCategory, buildCloudUsageTimelineGeometry, fetchCloudUsageTimelineSegments })`, {
    api,
    URLSearchParams,
    console: { warn() {} },
  });
}

const day = '2026-10-20';
const dayStart = Date.parse(`${day}T00:00:00+08:00`);
const row = (id, startMinute, endMinute, classification = 'study', deviceId = 'a', overrides = {}) => ({
  id, date: day, deviceId, channel: 'active', targetClassificationAtTime: classification,
  startMs: dayStart + startMinute * 60000, endMs: dayStart + endMinute * 60000,
  durationSeconds: 51, ...overrides,
});

async function main() {
  const { cloudUsageTimelineCategory, buildCloudUsageTimelineGeometry } = functions(async () => ({}));
  assert.equal(cloudUsageTimelineCategory('pending_composite'), 'pending');
  assert.equal(cloudUsageTimelineCategory('composite'), 'composite');
  assert.equal(cloudUsageTimelineCategory('restricted'), 'rest');

  const result = buildCloudUsageTimelineGeometry([
    row('across-hour', 59, 61),
    row('overlap', 59.5, 60.5, 'pending_composite', 'b'),
    row('cross-day', -1, 1, 'rest'),
    row('near-end', 1439, 1441, 'other'),
    row('media', 30, 40, 'study', 'a', { channel: 'backgroundMedia' }),
    row('zero', 30, 40, 'study', 'a', { durationSeconds: 0 }),
    row('wrong-day', 30, 40, 'study', 'a', { date: '2026-10-19' }),
  ], day);
  assert.equal(result.devices.join(','), 'a,b');
  assert.equal(result.marks.length, 6);
  assert.equal(result.marks.find(mark => mark.hour === 0 && mark.category === 'study').startMinute, 59);
  assert.equal(result.marks.find(mark => mark.hour === 1 && mark.category === 'study').endMinute, 1);
  assert.equal(result.marks.find(mark => mark.category === 'pending').lane, 1);
  assert.equal(result.marks.find(mark => mark.category === 'rest').startMinute, 0);
  assert.equal(result.marks.find(mark => mark.category === 'other').endMinute, 60);
  assert.equal(result.marks.find(mark => mark.category === 'study').durationSeconds, 51);
  assert.equal(buildCloudUsageTimelineGeometry([row('a', 59, 61), row('b', 59, 61, 'study', 'b')], day, 'a').devices.join(','), 'a');

  const urls = [];
  const pages = [
    { segments: [row('one', 1, 2)], hasMore: true, nextCursor: 'cursor-1' },
    { segments: [row('one', 1, 2), row('two', 3, 4)], hasMore: false },
  ];
  const { fetchCloudUsageTimelineSegments } = functions(async url => {
    urls.push(url);
    return pages.shift();
  });
  const fetched = await fetchCloudUsageTimelineSegments('child-1', day, 'a');
  assert.equal(fetched.complete, true);
  assert.equal(fetched.segments.length, 2);
  assert.match(urls[0], /from=2026-10-20&to=2026-10-20&limit=500&deviceId=a/);
  assert.match(urls[1], /cursor=cursor-1/);

  let count = 0;
  const partialFns = functions(async () => {
    if (++count === 1) return { segments: [row('first', 1, 2)], hasMore: true, nextCursor: 'next' };
    throw new Error('network unavailable');
  });
  const partial = await partialFns.fetchCloudUsageTimelineSegments('child-1', day);
  assert.equal(partial.complete, false);
  assert.equal(partial.segments.length, 1);
  const missing = await functions(async () => { throw new Error('network unavailable'); })
    .fetchCloudUsageTimelineSegments('child-1', day);
  assert.equal(missing.complete, false);
  assert.equal(missing.segments.length, 0);

  assert.match(source, /grid-template-columns: repeat\(24, minmax\(0, 1fr\)\)/);
  assert.match(source, /8\.333333%/);
  assert.match(source, /view\.kind === 'web' && view\.range\.mode === 'day'/);
  assert.match(source, /renderCloudUsageStackChart\('cloud-usage-week-chart'/);
  console.log('pages-usage-timeline: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const load = file => import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(root, file), 'utf8')).toString('base64'));
const scope = { profileId: 'fixture-child', deviceId: 'fixture-device', bindingToken: 'synthetic-binding' };
const date = '2026-10-21';
const row = (bucket = 'study', seconds = 780) => ({ date, device_id: scope.deviceId, channel: 'active', hour: 9,
  quota_bucket: bucket, duration_seconds: seconds, target_classification_at_time: 'pending_composite' });
const view = () => ({ kind: 'web', range: { mode: 'day', from: date, to: date, label: date },
  totalSeconds: 780, categoryTotals: { study: 780, composite: 0, rest: 0, other: 0 },
  chartSeries: [], hourlyRead: { available: false, complete: false, pending: false }, targetRows: [] });
const ok = stats => ({ ok: true, json: async () => ({ stats }) });
let passed = 0;
async function check(name, test) { await test(); passed++; console.log('PASS ' + name); }

(async () => {
  const { createWebHourlyHistoryReader, cloudWebHourSeries } = await load('extension/stats/web-hourly-history.js');
  const setup = request => createWebHourlyHistoryReader({ readContext: async () => scope, request, today: () => '2026-10-22' });
  await check('历史整份采用四桶，不按分类猜桶，不改原总量', async () => {
    const original = view(), before = JSON.stringify(original);
    const read = setup(async url => {
      assert.match(url, /hourly-target-stats\/v1\?/);
      const query = new URL('https://fixture.invalid' + url).searchParams;
      assert.equal(query.get('from'), date); assert.equal(query.get('to'), date);
      assert.equal(query.get('deviceId'), scope.deviceId); assert.equal(query.get('channel'), 'active');
      return ok(['study', 'composite', 'rest', 'other'].map(bucket => row(bucket, 195)));
    });
    const a = await read(original), b = await read(original);
    assert.deepEqual(a.chartSeries[9].categories, { study: 195, composite: 195, rest: 195, other: 195 });
    assert.deepEqual(a.chartSeries, b.chartSeries); assert.equal(a.totalSeconds, 780);
    assert.deepEqual(a.categoryTotals, original.categoryTotals); assert.equal(JSON.stringify(original), before);
  });
  await check('今天、周视图、应用与媒体不读云端', async () => {
    let calls = 0; const read = setup(async () => { calls++; throw Error(); });
    const current = view(); current.range.from = '2026-10-22';
    await read(current); await read({ ...view(), kind: 'application' }); await read({ ...view(), kind: 'media' });
    await read({ ...view(), range: { mode: 'week', from: date } }); assert.equal(calls, 0);
  });
  await check('未上传本地整体保留且标部分，不叠加云端', async () => {
    const local = { ...view(), chartSeries: [{ categories: { study: 800 } }], hourlyRead: { available: true, pending: true } };
    const out = await setup(async () => ok([row()]))(local);
    assert.deepEqual(out.chartSeries, local.chartSeries); assert.match(out.hourlyNotice, /未上传.*不完整/);
  });
  for (const [name, request] of [
    ['401', async () => ({ ok: false, status: 401 })], ['网络失败', async () => { throw Error('offline'); }],
    ['缺失响应', async () => ok(undefined)], ['日有值小时空', async () => ok([])],
  ]) await check(name + '保留日总量，不显示零用量', async () => {
    const out = await setup(request)(view()); assert.equal(out.totalSeconds, 780);
    assert.equal(out.hourlyEmptyMessage, '所选日期小时数据暂不可用');
  });
  await check('同范围成功缓存仅作旧读数，其他日期不借用', async () => {
    let fail = false; const read = setup(async () => { if (fail) throw Error(); return ok([row()]); });
    await read(view()); fail = true; const cached = await read(view()); assert.match(cached.hourlyNotice, /旧读数/);
    const another = view(); another.range.from = '2026-10-20';
    assert.deepEqual((await read(another)).chartSeries, []);
  });
  await check('确实零用量与缺失区分', async () => {
    const out = await setup(async () => ok([]))({ ...view(), totalSeconds: 0 });
    assert.equal(out.hourlyEmptyMessage, '所选日期没有使用记录'); assert.equal(out.chartSeries.length, 24);
  });
  await check('无绑定不发请求', async () => {
    const read = createWebHourlyHistoryReader({ readContext: async () => ({}), request: () => { throw Error('must not request'); }, today: () => '2026-10-22' });
    assert.match((await read(view())).hourlyNotice, /暂不可用/);
  });
  await check('孩子/设备/绑定变化拒绝旧响应且缓存不串', async () => {
    for (const field of ['profileId', 'deviceId', 'bindingToken']) {
      let current = scope, resolve;
      const read = createWebHourlyHistoryReader({ readContext: async () => current,
        request: () => new Promise(r => { resolve = r; }), today: () => '2026-10-22' });
      const pending = read(view()); await new Promise(r => setImmediate(r));
      current = { ...scope, [field]: 'changed' }; resolve(ok([row()])); assert.equal(await pending, null);
    }
  });
  await check('切换今天/周时迟到历史响应不覆盖', async () => {
    for (const range of [{ mode: 'day', from: '2026-10-22' }, { mode: 'week', from: date }]) {
      let resolve; const read = setup(() => new Promise(r => { resolve = r; }));
      const pending = read(view()); await new Promise(r => setImmediate(r));
      await read({ ...view(), range }); resolve(ok([row()])); assert.equal(await pending, null);
    }
  });
  await check('错误日期/设备/通道/桶拒绝而非猜配', async () => {
    for (const change of [{ date: '2026-10-20' }, { device_id: 'other' }, { channel: 'pip' }, { quota_bucket: 'pending_composite' }, { hour: 24 }, { duration_seconds: -1 }]) {
      assert.throws(() => cloudWebHourSeries([{ ...row(), ...change }], date, scope.deviceId));
    }
  });
  await check('更正下降整份替换，失败缓存同样下降', async () => {
    let seconds = 780;
    const read = setup(async () => { if (seconds === null) throw Error(); return ok([row('study', seconds)]); });
    await read(view()); seconds = 600;
    assert.equal((await read(view())).chartSeries[9].categories.study, 600);
    seconds = null; assert.equal((await read(view())).chartSeries[9].categories.study, 600);
  });
  await check('末次身份检查等待期间切换也拒绝旧结果', async () => {
    let checks = 0, release;
    const read = createWebHourlyHistoryReader({ readContext: () => ++checks === 2
      ? new Promise(r => { release = r; }) : Promise.resolve(scope), request: async () => ok([row()]), today: () => '2026-10-22' });
    const old = read(view()); await new Promise(r => setImmediate(r));
    await read({ ...view(), range: { mode: 'week' } }); release(scope);
    assert.equal(await old, null);
  });
  await check('真实本地读取器：日总量保留、小时明确桶着色，dirty保留', async () => {
    const data = { daily_usage_stats_v1: { [date]: { targets: { a: { activeSeconds: 780, activeByQuotaBucket: { study: 780 } } } } },
      hourly_usage_stats_v1: { [`${date}T09`]: { uploadedAt: 1, targets: { a: { activeSeconds: 780,
        targetClassificationAtTime: 'study', activeByQuotaBucket: { rest: 780 } } } } },
      hourly_stats_sync_outbox_v1: { dirtyHourKeys: [`${date}T09`] } };
    global.chrome = { storage: { local: { get: async () => structuredClone(data) } } };
    const model = await load('extension/stats/admin-read-model.js');
    const before = JSON.stringify(data), local = await model.getAdminUsageAnalysisView({ date });
    assert.equal(local.totalSeconds, 780); assert.equal(local.chartSeries[9].categories.rest, 780);
    assert.equal(local.hourlyRead.pending, true); assert.equal(JSON.stringify(data), before);
    delete data.hourly_usage_stats_v1;
    const pruned = await model.getAdminUsageAnalysisView({ date });
    assert.equal(pruned.totalSeconds, 780); assert.equal(pruned.hourlyRead.available, false);
    const restored = await setup(async () => ok([row()]))(pruned);
    assert.equal(restored.chartSeries[9].categories.study, 780); assert.equal(restored.totalSeconds, 780);
  });
  console.log(`Web hourly history: ${passed}/${passed} passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });

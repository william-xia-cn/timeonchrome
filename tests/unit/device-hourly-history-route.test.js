'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
function load(file, deps = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports,
    require: name => deps[name] || {}, URL, Date, console, crypto });
  return module.exports;
}
const identity = load('workers/src/routes/deviceIdentity.ts', { '../db/middleware': { json } });
const corrections = load('workers/src/services/usageAccountingCorrections.ts');
let parentCalls = 0;
const router = load('workers/src/routes/stats.ts', {
  '../db/middleware': { json, verifyAccountToken: async request => {
    parentCalls++; return request.headers.get('Authorization') === 'Bearer parent' ? 'account' : null;
  } },
  './deviceIdentity': identity, '../services/usageAccountingCorrections': corrections,
}).statsRouter;
const date = '2026-10-21';
const rows = [{ date, device_id: 'device', hour: 9, hour_key: `${date}T09`, channel: 'active',
  mode: 'study', quota_bucket: 'study', target_key: 'fallback:domain:test.example', duration_seconds: 780 },
  { date, device_id: 'device', hour: 9, channel: 'backgroundMedia', duration_seconds: 90 }];
const correctionRows = [{ id: 'correction', segment_id: 'segment', profile_id: 'child', device_id: 'device', date,
  domain: 'test.example', start_ms: Date.parse(`${date}T09:00:00+08:00`),
  end_ms: Date.parse(`${date}T09:01:00+08:00`), duration_seconds: 60, channel: 'active',
  original_mode: 'study', original_quota_bucket: 'study', effective_mode: 'rest',
  effective_quota_bucket: 'rest', effective_target_classification: 'restricted' }];
let fail = false, empty = false;
const sqlCalls = [];
const env = { DB: { prepare(sql) {
  assert.match(sql.trim(), /^SELECT\b/i, 'read endpoint may only SELECT');
  let args;
  return { bind(...values) { args = values; sqlCalls.push({ sql, args }); return this; },
    async first() {
      if (sql.includes('device_token =')) {
        if (args[0] === 'invalid') return null;
        return { id: args[0] === 'no-id' ? null : 'device', profile_id: 'child',
          status: args[0] === 'unbound' ? 'unbound' : 'bound' };
      }
      return { id: 'child' };
    },
    async all() {
      assert.deepEqual(args, ['child', date, date, 'device']);
      if (sql.includes('FROM hourly_target_stats_v1')) {
        if (fail) throw Error('isolated read failed');
        return { results: empty ? [] : structuredClone(rows) };
      }
      assert.match(sql, /FROM usage_segment_corrections_v1/);
      return { results: structuredClone(correctionRows) };
    },
  };
} } };
const base = 'https://fixture.invalid/device/hourly-target-stats/v1';
const read = (query = `date=${date}`, token = 'device-token') => router.handle(new Request(`${base}?${query}`,
  { headers: token ? { Authorization: `Bearer ${token}` } : {} }), env);
(async () => {
  for (const token of [null, 'invalid']) assert.equal((await read(undefined, token)).status, 401);
  for (const token of ['unbound', 'no-id']) assert.equal((await read(undefined, token)).status, 403);
  for (const query of ['', 'date=2026-02-30', `date=${date}&date=${date}`, `date=${date}&deviceId=other`,
    `date=${date}&profileId=other`, `date=${date}&channel=backgroundMedia`, 'from=2026-10-21&to=2026-10-22']) {
    assert.equal((await read(query)).status, 400);
  }
  const before = JSON.stringify({ rows, correctionRows });
  const response = await read();
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const body = await response.json();
  assert.deepEqual([body.profileId, body.deviceId, body.date], ['child', 'device', date]);
  assert.equal(body.stats.length, 2);
  assert.equal(body.stats.find(row => row.quota_bucket === 'study').duration_seconds, 720);
  assert.equal(body.stats.find(row => row.quota_bucket === 'rest').duration_seconds, 60);
  assert.deepEqual(await (await read()).json(), body, 'repeat does not accumulate');
  assert.equal(parentCalls, 0);
  const adapterSource = fs.readFileSync(path.join(root, 'extension/stats/web-hourly-history.js'), 'utf8');
  const { createWebHourlyHistoryReader } = await import('data:text/javascript;base64,' + Buffer.from(adapterSource).toString('base64'));
  const scope = { profileId: 'child', deviceId: 'device', bindingToken: 'device-token' };
  const consume = createWebHourlyHistoryReader({ readContext: async () => scope, today: () => '2026-10-22',
    request: (url, token) => router.handle(new Request('https://fixture.invalid' + url,
      { headers: { Authorization: `Bearer ${token}` } }), env) });
  const view = { kind: 'web', range: { mode: 'day', from: date }, totalSeconds: 780,
    categoryTotals: { study: 780 }, hourlyRead: { available: false }, chartSeries: [] };
  const originalView = JSON.stringify(view);
  const consumed = await consume(view);
  assert.deepEqual(consumed.chartSeries[9].categories, { study: 720, composite: 0, rest: 60, other: 0 });
  assert.equal(consumed.totalSeconds, 780);
  assert.equal(JSON.stringify(view), originalView);
  assert.equal(parentCalls, 0);
  const parent = await router.handle(new Request(`https://fixture.invalid/profiles/child/hourly-target-stats/v1?from=${date}&to=${date}&deviceId=device&channel=active`,
    { headers: { Authorization: 'Bearer parent' } }), env);
  assert.deepEqual(await parent.json(), { stats: body.stats, correctionsApplied: 1 }, 'parent shape and readings unchanged');
  fail = true; await assert.rejects(read(), /isolated read failed/); fail = false;
  assert.deepEqual(await (await read()).json(), body);
  empty = true; assert.deepEqual((await (await read()).json()).stats, []);
  assert.equal(JSON.stringify({ rows, correctionRows }), before);
  assert(sqlCalls.every(call => !/UPDATE|INSERT|DELETE/.test(call.sql)));
  const entry = fs.readFileSync(path.join(root, 'workers/src/index.ts'), 'utf8');
  assert.match(entry, /'\/device\/hourly-target-stats\/v1'/);
  assert.match(entry, /DEVICE_STATS_ROUTES.has\(path\)/);
  console.log('PASS device hourly: real identity + correction readers, scoped SELECT-only, auth, dates, parent parity, retry, no mutation');
})().catch(error => { console.error(error); process.exitCode = 1; });

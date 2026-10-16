'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..');
const load = source => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
async function contract() {
  const file = process.env.TIMEONCHROME_SOURCE_STATISTICS_CONTRACT_PATH;
  if (!file) return load(read('extension/core/shared-contracts/1.55.0/source-statistics.js'));
  const source = fs.readFileSync(file, 'utf8');
  return load(file.endsWith('.ts') ? require('typescript').transpileModule(source, {
    compilerOptions: { module: require('typescript').ModuleKind.ESNext, target: require('typescript').ScriptTarget.ES2022 },
  }).outputText : source);
}
async function run() {
  globalThis.__quotaBucketsContract = await contract();
  assert.equal(typeof globalThis.__quotaBucketsContract.validateQuotaBucketsSnapshot, 'function', 'requires the approved V2 contract');
  const mod = await load('const sourceStatisticsContract=globalThis.__quotaBucketsContract;\n'
    + read('extension/infra/source-statistics-shadow.js').replace(/^import .*;\r?\n/gm, ''));
  const cloudFunction = read('extension/infra/cloud-sync.js').match(/export async function readCloudSourceStatistics[\s\S]*?(?=export async function readCloudSharedWebWatermark)/)[0];
  const cloudRequests = [];
  globalThis.__quotaCloudRequests = cloudRequests;
  const cloudClient = await load('const sourceStatisticsContract=globalThis.__quotaBucketsContract;'
    + 'const validateSourceStatisticsQuery=sourceStatisticsContract.validateSourceStatisticsQuery;'
    + 'const readCapturedSharedDeviceJson=async(_options,route,body)=>{globalThis.__quotaCloudRequests.push({route,body});return {ok:true,value:null};};\n'
    + cloudFunction);
  const query = { schemaVersion: 2, source: 'application', fromDate: '2026-10-12', toDate: '2026-10-12', scope: 'all' };
  assert.equal((await cloudClient.readCloudSourceStatistics({}, query)).ok, true);
  assert.deepEqual(cloudRequests[0], { route: '/device/source-statistics', body: query });
  assert.equal((await cloudClient.readCloudSourceStatistics({}, { ...query, childId: 'forbidden' })).ok, false);
  const { schemaVersion, ...oldQuery } = query;
  assert.equal((await cloudClient.readCloudSourceStatistics({}, oldQuery)).ok, true, 'legacy query remains supported');
  const child = 'synthetic-child', day = '2026-10-12';
  let time = Date.parse(day + 'T10:00:00+08:00'), scope = 'synthetic-scope', currentChild = child;
  const snapshot = (rest, complete = true) => ({ schemaVersion: 2, durationUnit: 'seconds', source: 'application',
    childId: currentChild, fromDate: day, toDate: day, readAtMs: time, days: [{ date: day,
      bucketsSeconds: { study: 0, composite: 0, rest }, settledThroughMs: null, complete,
      reasonCodes: complete ? [] : ['SOURCE_PARTIAL'] }] });
  let webRest = 600, webReadable = true, bridge = snapshot(600), cloud = snapshot(900);
  let bridgeError = null, cloudError = null, preparationError = null, cloudReads = 0, exchanges = 0, preparations = 0;
  let reboundDuringExchange = false;
  const stored = {}, order = [];
  const context = async () => ({ apiBase: 'https://example.invalid', deviceToken: 'synthetic-secret',
    childId: currentChild, scopeHash: scope });
  const readModel = async ({ date }) => {
    order.push('web');
    return webReadable ? { ok: true, date, usage: { studySeconds: 5, compositeSeconds: 7, restSeconds: webRest },
      local: { today: { onlineSeconds: 1, byQuotaBucket: { rest: 1 } } }, completeness: { complete: true } } : { ok: false };
  };
  const dependencies = { isEnabled: () => true, now: () => time, readContext: context, readModel,
    storage: { get: async key => ({ [key]: stored[key] }) },
    write: async values => { Object.assign(stored, structuredClone(values)); return { ok: true }; },
    nativeContext: async options => {
      if (options?.prepare) { preparations++; order.push('prepare'); }
      return preparationError ? { ok: false, errorCode: preparationError }
        : { ok: true, childId: currentChild, contextId: 'native-context', connectionGeneration: 7 };
    },
    nativeExchange: async request => {
      exchanges++; order.push('bridge');
      if (request.webUsage) {
        assert.equal(request.webUsage.schemaVersion, 2);
        assert.equal(request.webUsage.days[0].bucketsSeconds.rest, webRest);
      } else assert.equal(webReadable, false);
      assert.equal(Object.hasOwn(request, 'webStatistics'), false);
      Object.assign(request.attempt, { sent: true, responseReceived: true, accepted: !bridgeError && !!bridge });
      if (reboundDuringExchange) { currentChild = 'different-child'; scope = 'different-scope'; }
      return bridgeError ? { ok: false, errorCode: bridgeError }
        : { ok: true, snapshot: structuredClone(bridge), connectionGeneration: 7 };
    },
    cloudRead: async (_credentials, query) => {
      cloudReads++; order.push('cloud');
      assert.deepEqual(query, { schemaVersion: 2, source: 'application', fromDate: day, toDate: day, scope: 'all' });
      if (cloudError === 'throw') throw Error('private-response');
      return cloudError ? { ok: false, errorCode: cloudError } : { ok: true, snapshot: structuredClone(cloud) };
    } };
  const reader = mod.createSourceStatisticsShadow(dependencies);
  const own = await mod.buildWebQuotaBucketsSnapshot({ childId: child, fromDate: day, toDate: day,
    quotaModels: [await readModel({ date: day })], readAtMs: time });
  assert.equal(own.days[0].bucketsSeconds.rest, 600, 'use the complete usage, never local.today');
  for (const key of ['revision', 'includedSourceKeys', 'excludedSourceKeys']) assert.equal(Object.hasOwn(own, key), false);
  order.length = 0;
  const first = await reader.refresh({ force: true });
  assert.equal(first.ok, true);
  assert.deepEqual(order, ['web', 'prepare', 'bridge']);
  assert.equal(cloudReads, 0, 'a valid bridge response excludes cloud fallback');
  const readFirst = await reader.readSources(day);
  assert.equal(readFirst.sourceStatistics.web.days[0].bucketsSeconds.rest, 600);
  assert.equal(readFirst.sourceStatistics.application.days[0].bucketsSeconds.rest, 600);
  assert.deepEqual(readFirst.missingSources, []);
  assert.equal(exchanges, 1, 'cache reads never open the bridge');
  assert.equal(preparations, 1, 'cache reads never prepare Native');
  await reader.refresh({ force: true });
  assert.equal((await reader.readSources(day)).sourceStatistics.application.days[0].bucketsSeconds.rest, 600,
    'duplicate reads replace, never accumulate');
  bridge = snapshot(100);
  await reader.refresh({ force: true });
  assert.equal((await reader.readSources(day)).sourceStatistics.application.days[0].bucketsSeconds.rest, 100,
    'a newer lower value replaces the old value');
  bridgeError = 'SOURCE_STATISTICS_CONTEXT_CHANGED';
  const fallback = await reader.refresh({ force: true });
  assert.equal(fallback.report.source.application.origin, 'cloud');
  assert.equal(fallback.report.nativeAttempt.errorCode, bridgeError);
  assert.equal((await reader.readSources(day)).sourceStatistics.application.days[0].bucketsSeconds.rest, 900);
  cloudError = 'shared_access_unavailable';
  const cached = await reader.refresh({ force: true });
  assert.equal(cached.report.source.application.origin, 'last_known_good');
  assert.equal(cached.report.nativeAttempt.errorCode, bridgeError);
  assert.equal((await reader.readSources(day)).sourceStatistics.application.days[0].bucketsSeconds.rest, 900);
  bridgeError = null; bridge = snapshot(50, false);
  await reader.refresh({ force: true });
  assert.equal((await reader.readSources(day)).sourceStatistics.application.days[0].bucketsSeconds.rest, 50,
    'a partial fresh snapshot is not mixed with old days');
  assert.equal((await reader.readSources(day)).sourceStatistics.application.days[0].complete, false);
  bridge = snapshot(80); bridge.readAtMs = time + 2000;
  assert.equal((await reader.refresh({ force: true })).report.source.application.origin, 'native',
    'small clock skew does not reject an otherwise valid source');
  bridge.readAtMs = time + 300001; cloud = snapshot(90); cloudError = null;
  assert.equal((await reader.refresh({ force: true })).report.source.application.origin, 'cloud',
    'a future timestamp beyond tolerance is rejected');
  scope = 'fresh-empty-scope'; bridge = null; cloudError = 'throw';
  const missing = await reader.refresh({ force: true });
  assert.equal(missing.report.source.web.missing, false);
  assert.equal(missing.report.source.application.missing, true);
  assert.equal(missing.report.nativeAttempt.errorCode, 'source_statistics_application_unavailable');
  assert.equal((await reader.readSources(day)).sourceStatistics.application, null);
  assert.equal((await reader.readSources(day)).sourceStatistics.web.days[0].bucketsSeconds.rest, 600);
  assert.deepEqual((await reader.readSources(day)).missingSources, ['application']);
  preparationError = 'native_port_disconnected';
  const beforeExchanges = exchanges;
  const unavailable = await reader.refresh({ force: true });
  assert.equal(exchanges, beforeExchanges);
  assert.equal(unavailable.report.nativeAttempt.sent, false);
  assert.equal(unavailable.report.nativeAttempt.errorCode, preparationError);
  preparationError = null; bridge = snapshot(600); cloudError = null;
  webReadable = false;
  const appOnly = await reader.refresh({ force: true });
  assert.equal(appOnly.report.source.web.missing, true, 'the existing web reader owns its cache; no second bridge cache');
  assert.equal(appOnly.report.source.application.missing, false);
  scope = 'no-web-cache';
  const noWebCache = await reader.refresh({ force: true });
  assert.equal(noWebCache.report.source.web.missing, true);
  assert.equal(noWebCache.report.source.application.missing, false);
  webReadable = true; reboundDuringExchange = true;
  const keysBefore = structuredClone(stored);
  assert.equal((await reader.refresh({ force: true })).errorCode, 'source_statistics_context_changed');
  assert.deepEqual(stored, keysBefore, 'identity changes cannot publish the preceding child results');
  reboundDuringExchange = false;
  assert.equal((await reader.readSources(day)).sourceStatistics.application, null, 'different-child cache is rejected');
  time = Date.parse('2026-10-19T10:00:00+08:00');
  const newWeek = await reader.readSources('2026-10-19');
  assert.equal(newWeek.sourceStatistics.application, null, 'previous-week cache cannot be reused');
  assert.equal((await reader.readSources(day)).errorCode, 'source_statistics_period_changed');
  reader.configure(false);
  assert.equal((await reader.refresh({ force: true })).skipped, true);
  assert.equal((await reader.readSources('2026-10-19')).errorCode, 'source_statistics_disabled');
}
run().then(() => console.log('source-statistics-shadow: V2 usage / bridge / cloud / cache / identity PASS'))
  .catch(error => { console.error(error); process.exitCode = 1; });

'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..');
const load = source => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
async function contract() {
  const file = process.env.TIMEONCHROME_SOURCE_STATISTICS_CONTRACT_PATH;
  if (!file) return load(read('extension/core/shared-contracts/1.58.0/source-statistics.js'));
  const source = fs.readFileSync(file, 'utf8');
  return load(file.endsWith('.ts') ? require('typescript').transpileModule(source, {
    compilerOptions: { module: require('typescript').ModuleKind.ESNext, target: require('typescript').ScriptTarget.ES2022 },
  }).outputText : source);
}
async function run() {
  globalThis.__quotaBucketsContract = await contract();
  globalThis.__profileShadow = await load(read('extension/core/profile-account-shadow-v2.js').replace(/^import .*;\r?\n/gm, ''));
  assert.equal(typeof globalThis.__quotaBucketsContract.validateQuotaBucketsSnapshot, 'function', 'requires the approved V2 contract');
  const mod = await load('const sourceStatisticsContract=globalThis.__quotaBucketsContract;\n'
    + 'const {PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY,isProfileAccountShadowScopeCurrent}=globalThis.__profileShadow;\n'
    + read('extension/infra/source-statistics-shadow.js').replace(/^import .*;\r?\n/gm, ''));
  const ts = require('typescript');
  const tree = ts.createSourceFile('cloud-sync.js', read('extension/infra/cloud-sync.js'), ts.ScriptTarget.Latest, true);
  const cloudFunction = tree.statements.find(node => ts.isFunctionDeclaration(node)
    && node.name?.text === 'readCloudSourceStatistics').getText(tree);
  const cloudRequests = [];
  globalThis.__quotaCloudRequests = cloudRequests;
  const cloudClient = await load('const sourceStatisticsContract=globalThis.__quotaBucketsContract;'
    + 'const readCapturedSharedDeviceJson=async(_options,route,body)=>{globalThis.__quotaCloudRequests.push({route,body});return {ok:true,value:globalThis.__quotaCloudValue??null};};\n'
    + cloudFunction);
  const query = { schemaVersion: 2, source: 'application', fromDate: '2026-10-12', toDate: '2026-10-12', scope: 'all' };
  assert.equal((await cloudClient.readCloudSourceStatistics({}, query)).ok, true);
  assert.deepEqual(cloudRequests[0], { route: '/device/source-statistics', body: query });
  assert.equal((await cloudClient.readCloudSourceStatistics({}, { ...query, childId: 'forbidden' })).ok, false);
  const { schemaVersion, ...oldQuery } = query;
  assert.equal((await cloudClient.readCloudSourceStatistics({}, oldQuery)).ok, false,
    'current bucket request requires an explicit schemaVersion2');
  assert.equal((await cloudClient.readCloudSourceStatistics({}, { ...query, schemaVersion: 1 })).ok, false,
    'explicit old source schema never downgrades the bucket reader');
  const transportSnapshot = { schemaVersion: 2, durationUnit: 'seconds', source: 'application', childId: 'synthetic-child',
    fromDate: query.fromDate, toDate: query.toDate, readAtMs: 1, days: [{ date: query.fromDate,
      bucketsSeconds: { study: 0, composite: 0, rest: 900 }, settledThroughMs: null, complete: true, reasonCodes: [] }] };
  const transportOptions = { childId: 'synthetic-child' };
  globalThis.__quotaCloudValue = { snapshot: transportSnapshot, applicationSources: { synthetic: 'invalid-sidecar' } };
  assert.deepEqual(await cloudClient.readCloudSourceStatistics(transportOptions, { ...query, includeSources: true }), {
    ok: true, snapshot: transportSnapshot, applicationSources: null,
  }, 'fixed helper rejects bad sidecar independently of the valid combined result');
  globalThis.__quotaCloudValue = transportSnapshot;
  assert.equal((await cloudClient.readCloudSourceStatistics(transportOptions, { ...query, includeSources: true })).snapshot.days[0].bucketsSeconds.rest, 900,
    'direct old response remains compatible with opt-in new caller');
  globalThis.__quotaCloudValue = { ...transportSnapshot, childId: 'different-child' };
  assert.equal((await cloudClient.readCloudSourceStatistics(transportOptions, { ...query, includeSources: true })).ok, false);
  globalThis.__quotaCloudValue = { ...transportSnapshot, toDate: '2026-10-13' };
  assert.equal((await cloudClient.readCloudSourceStatistics(transportOptions, { ...query, includeSources: true })).ok, false);
  assert.equal((await cloudClient.readCloudSourceStatistics({}, { ...query, includeSources: true, source: 'web' })).ok, false);
  assert.equal((await cloudClient.readCloudSourceStatistics({}, { ...query, sourceProof: {} })).ok, false);
  globalThis.__quotaCloudValue = null;
  const child = 'synthetic-child', day = '2026-10-12';
  let time = Date.parse(day + 'T10:00:00+08:00'), scope = 'synthetic-scope', currentChild = child;
  const splitModel = { ok: true, date: day, weekStart: day, weekEnd: '2026-10-18',
    local: { complete: false, today: { complete: true, byQuotaBucket: { study: 7, composite: 11, rest: 13 } } },
    otherDevices: { deviceIds: ['synthetic-other'], snapshotId: 'synthetic-snapshot', asOf: time,
      today: { byQuotaBucket: { study: 0, composite: 17, rest: 0 } } },
    completeness: { complete: false, otherDevicesUnknown: true } };
  const scopeContext = { apiBase: 'https://example.invalid', deviceId: 'synthetic-device', childId: child };
  const inventoryCache = { scope: { ...scopeContext }, current: { schemaVersion: 2, snapshotId: 'synthetic-snapshot',
    snapshotHash: 'a'.repeat(64), totalHash: 'b'.repeat(64), verifiedAt: time, expiresAt: time + 1800000,
    period: { weekStart: day, weekEnd: '2026-10-18' },
    deviceAccounts: [{ deviceId: 'synthetic-other', date: day, complete: true, quotaProjection: {} }],
    completeness: { inventoryAvailable: true, expectedDevices: ['synthetic-device', 'synthetic-other'],
      missingDevices: [], incompatibleDevices: [], staleDevices: [], incompleteDevices: [] } } };
  const split = (model, cache = inventoryCache) => mod.buildWebSourceBreakdown({ fromDate: day, toDate: day,
    quotaModels: [model], context: scopeContext, profileAccountCache: cache, readAtMs: time });
  const explainedWeb = split(splitModel);
  assert.equal(explainedWeb.local.days[0].complete, true, 'today uses its own completeness, not the whole week or combined flag');
  assert.equal(explainedWeb.otherState, 'available');
  assert.deepEqual(explainedWeb.other.days[0].bucketsSeconds, { study: 0, composite: 17, rest: 0 });
  assert.equal(explainedWeb.local.days[0].settledThroughMs, null);
  assert.equal(explainedWeb.other.days[0].settledThroughMs, null, 'asOf/readAt are never settlement cutoffs');
  const empty = structuredClone(splitModel);
  empty.local.today = { complete: true, byQuotaBucket: {} };
  empty.otherDevices.today.byQuotaBucket = { study: 0, composite: 0, rest: 0 };
  assert.deepEqual(split(empty).local.days[0].bucketsSeconds, { study: 0, composite: 0, rest: 0 });
  assert.deepEqual(split(empty).other.days[0].bucketsSeconds, { study: 0, composite: 0, rest: 0 });
  delete empty.local.today.complete;
  assert.equal(split(empty).local.days[0].complete, null);
  assert.deepEqual(split(empty).local.days[0].bucketsSeconds, { study: null, composite: null, rest: null });
  empty.otherDevices.deviceIds = [];
  empty.completeness = { deviceInventoryAvailable: true, expectedDevices: [], otherDevicesUnknown: false };
  const legacy = structuredClone(inventoryCache); delete legacy.scope;
  assert.equal(split(empty, legacy).otherState, 'unknown', 'empty unscoped inventory does not prove current-child absence');
  assert.equal(split(empty, legacy).other.days[0].bucketsSeconds, null);
  const none = structuredClone(inventoryCache);
  none.current.deviceAccounts = [];
  none.current.completeness.expectedDevices = ['synthetic-device'];
  none.current.completeness.incompleteDevices = ['synthetic-device'];
  const localPartial = structuredClone(empty); localPartial.local.today.complete = false;
  assert.equal(split(localPartial, none).otherState, 'none', 'local partial does not contaminate authoritative no-other inventory');
  assert.equal(split({ ...localPartial, otherDevices: { ...localPartial.otherDevices, snapshotId: 'older-snapshot' } }, none).otherState,
    'unknown', 'older daily model plus newly empty inventory cannot prove absence');
  assert.equal(split(localPartial, none).local.days[0].complete, false);
  for (const bad of ['missing_inventory', 'wrong_child', 'expired', 'wrong_period', 'missing_expected', 'unreported', 'missing_projection']) {
    const cache = structuredClone(none);
    if (bad === 'missing_inventory') delete cache.current.completeness.inventoryAvailable;
    if (bad === 'wrong_child') cache.scope.childId = 'another-child';
    if (bad === 'expired') cache.current.expiresAt = time;
    if (bad === 'wrong_period') cache.current.period.weekStart = '2026-10-05';
    if (bad === 'missing_expected') delete cache.current.completeness.expectedDevices;
    if (bad === 'unreported' || bad === 'missing_projection') cache.current.completeness.expectedDevices.push('not-uploaded');
    if (bad === 'missing_projection') cache.current.deviceAccounts.push({ deviceId: 'not-uploaded', date: day });
    const expectedState = ['wrong_child', 'wrong_period'].includes(bad) ? 'unknown'
      : bad === 'expired' ? 'none' : 'available';
    assert.equal(split(empty, cache).otherState, expectedState, bad);
    assert.equal(split(empty, cache).local.days[0].complete, null, 'other failure cannot alter local state');
  }
  const retained = structuredClone(inventoryCache);
  retained.current.expiresAt = time - 1;
  retained.current.completeness.missingDevices = ['not-uploaded'];
  delete retained.current.completeness.inventoryAvailable;
  const retainedSplit = split(splitModel, retained);
  assert.deepEqual(retainedSplit.other.days[0].bucketsSeconds, { study: 0, composite: 17, rest: 0 },
    'expired transfer and missing inventory cannot erase previously confirmed contributions');
  assert.equal(retainedSplit.local.days[0].complete, true);
  empty.local.today = { complete: false, byQuotaBucket: { rest: 19 } };
  assert.deepEqual(split(empty).local.days[0].bucketsSeconds, { study: null, composite: null, rest: 19 });
  assert.equal(split({ ...splitModel, date: '2026-10-13' }).local.days[0].bucketsSeconds, null);
  const snapshot = (rest, complete = true) => ({ schemaVersion: 2, durationUnit: 'seconds', source: 'application',
    childId: currentChild, fromDate: day, toDate: day, readAtMs: time, days: [{ date: day,
      bucketsSeconds: { study: 0, composite: 0, rest }, settledThroughMs: null, complete,
      reasonCodes: complete ? [] : ['SOURCE_PARTIAL'] }] });
  let webRest = 600, webReadable = true, bridge = snapshot(600), cloud = snapshot(900);
  let bridgeSources = null, cloudSources = null, sourceProof = null;
  let bridgeError = null, cloudError = null, preparationError = null, cloudReads = 0, exchanges = 0, preparations = 0;
  let reboundDuringExchange = false;
  const stored = {}, order = [];
  const context = async () => ({ apiBase: 'https://example.invalid', deviceId: 'synthetic-device', deviceToken: 'synthetic-secret',
    childId: currentChild, scopeHash: scope });
  const readModel = async ({ date }) => {
    order.push('web');
    return webReadable ? { ok: true, date, usage: { studySeconds: 5, compositeSeconds: 7, restSeconds: webRest },
      weekStart: date, weekEnd: '2026-10-18',
      local: { complete: false, today: { complete: true, onlineSeconds: 1, byQuotaBucket: { rest: 1 } } },
      otherDevices: { deviceIds: [], snapshotId: null, today: { byQuotaBucket: {} } }, completeness: { complete: true } } : { ok: false };
  };
  const dependencies = { isEnabled: () => true, now: () => time, readContext: context, readModel,
    readSourceProof: async () => sourceProof,
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
        : { ok: true, snapshot: structuredClone(bridge), applicationSources: structuredClone(bridgeSources), connectionGeneration: 7 };
    },
    cloudRead: async (_credentials, query) => {
      cloudReads++; order.push('cloud');
      assert.deepEqual(query, { schemaVersion: 2, source: 'application', fromDate: day, toDate: day, scope: 'all',
        includeSources: true, ...(sourceProof ? { sourceProof } : {}) });
      if (cloudError === 'throw') throw Error('private-response');
      return cloudError ? { ok: false, errorCode: cloudError } : { ok: true, snapshot: structuredClone(cloud), applicationSources: structuredClone(cloudSources) };
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
  assert.equal(stored.source_statistics_shadow_cache_v1.webSources.local.days[0].bucketsSeconds.rest, 1);
  assert.equal(stored.source_statistics_shadow_cache_v1.webSources.local.days[0].complete, true);
  assert.equal(stored.source_statistics_shadow_cache_v1.webSources.otherState, 'unknown');
  const readFirst = await reader.readSources(day);
  assert.equal(readFirst.sourceStatistics.web.days[0].bucketsSeconds.rest, 600);
  assert.equal(readFirst.sourceStatistics.application.days[0].bucketsSeconds.rest, 600);
  assert.deepEqual(readFirst.missingSources, []);
  assert.equal(exchanges, 1, 'cache reads never open the bridge');
  assert.equal(preparations, 1, 'cache reads never prepare Native');
  bridgeSources = { local: snapshot(163), other: null, otherState: 'unknown' };
  bridge = snapshot(600, false);
  await reader.refresh({ force: true });
  assert.equal(stored.source_statistics_shadow_cache_v1.applicationSources.local.days[0].complete, true);
  assert.equal(stored.source_statistics_shadow_cache_v1.application.days[0].complete, false);
  assert.equal((await reader.readSources(day)).sourceStatistics.application.days[0].bucketsSeconds.rest, 600,
    'execution still consumes the original combined snapshot');
  bridgeError = 'source_statistics_native_unavailable'; cloudError = 'throw';
  await reader.refresh({ force: true });
  assert.equal(stored.source_statistics_shadow_cache_v1.applicationSources.local.days[0].bucketsSeconds.rest, 163,
    'same-scope last-known-good explanation remains attached to its snapshot');
  bridgeError = null; cloudError = null;
  bridgeSources = { local: { ...snapshot(163), childId: 'different-child' }, other: null, otherState: 'none' };
  await reader.refresh({ force: true });
  assert.equal(stored.source_statistics_shadow_cache_v1.applicationSources, null, 'wrong-child sources are not cached');
  bridgeSources = { local: snapshot(163), other: null, otherState: 'none' };
  await reader.refresh({ force: true });
  bridgeError = 'source_statistics_native_unavailable';
  await reader.refresh({ force: true });
  assert.equal(stored.source_statistics_shadow_cache_v1.applicationSources, null, 'cloud all never inherits Native local explanation');
  sourceProof = { signature: 'synthetic-proof-not-persisted' };
  cloudSources = { local: snapshot(200), other: snapshot(700), otherState: 'available' };
  await reader.refresh({ force: true });
  assert.equal(stored.source_statistics_shadow_cache_v1.applicationSources.other.days[0].bucketsSeconds.rest, 700);
  assert.equal((await reader.readSources(day)).sourceStatistics.application.days[0].bucketsSeconds.rest, 900,
    'cloud combined is selected once, never added to Native or its own sidecar');
  assert.equal(JSON.stringify(stored).includes('synthetic-proof-not-persisted'), false, 'proof never enters source caches or reports');
  cloudError = 'shared_access_unavailable';
  await reader.refresh({ force: true });
  assert.equal(stored.source_statistics_shadow_cache_v1.applicationSources.other.days[0].bucketsSeconds.rest, 700,
    'cloud sources stay paired with same-scope last confirmed combined cache');
  cloudError = null;
  cloudSources = { local: { ...snapshot(200), childId: 'different-child' }, other: snapshot(700), otherState: 'available' };
  await reader.refresh({ force: true });
  assert.equal(stored.source_statistics_shadow_cache_v1.applicationSources, null, 'invalid sidecar is discarded independently');
  assert.equal((await reader.readSources(day)).sourceStatistics.application.days[0].bucketsSeconds.rest, 900);
  cloudSources = null; sourceProof = null;
  bridgeError = null; bridgeSources = null; bridge = snapshot(600);
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

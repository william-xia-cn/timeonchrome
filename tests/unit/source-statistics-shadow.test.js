'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const dataModule = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

async function loadModules() {
  const contractSource = read('extension/core/shared-contracts/1.39.1/source-statistics.js');
  const contract = await dataModule(contractSource);
  const effectiveQuota = (config, date) => {
    const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
      new Date(Date.parse(`${date}T00:00:00+08:00`) + 28_800_000).getUTCDay()];
    const daily = Object.fromEntries(Object.entries(config.timeQuota.daily));
    return { daily, todayEffectiveQuota: { weeklyRestMinutes: config.timeQuota.weekly.restMinutes } };
  };
  globalThis.__sourceStatisticsShadowDeps = { ...contract, getEffectiveQuotaForDate: effectiveQuota };
  globalThis.chrome = { storage: { local: { get: async () => ({}) } } };
  const source = read('extension/infra/source-statistics-shadow.js')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export const /gm, 'const ')
    .replace(/^export (async )?function /gm, '$1function ');
  const bindings = `const {combineOwnAndOtherStatistics,projectSharedQuotaSeconds,sourceStatisticsDates,validateSourceStatisticsSnapshot,getEffectiveQuotaForDate}=globalThis.__sourceStatisticsShadowDeps;\n`;
  const exports = '\nexport { SOURCE_STATISTICS_SHADOW_KEY, SOURCE_STATISTICS_SHADOW_CACHE_KEY, buildLocalWebSourceSnapshot, createSourceStatisticsShadow, sourceStatisticsWeekRange };';
  return dataModule(`${bindings}${source}${exports}`);
}

const CHILD = 'child-1';
const RANGE = { fromDate: '2026-10-05', toDate: '2026-10-07', dates: ['2026-10-05', '2026-10-06', '2026-10-07'] };
const nowInitial = Date.parse('2026-10-07T10:00:00+08:00');
const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const config = { timeQuota: { weekly: { restMinutes: 600 }, daily: Object.fromEntries(weekdays.map(day => [day,
  { studyMinutes: null, compositeMinutes: 120, restMinutes: 600, onlineMinutes: null }])) } };

function snapshot(source, days, { includedSourceKeys = [], excludedSourceKeys = [] } = {}) {
  return { schemaVersion: 1, durationUnit: 'seconds', source, childId: CHILD,
    fromDate: RANGE.fromDate, toDate: RANGE.toDate, revision: `${source}-revision-1`, readAtMs: nowInitial,
    includedSourceKeys, excludedSourceKeys, days };
}
function day(date, totalSeconds, categoriesSeconds, { complete = true, reasonCodes = [], nonSpecialTotalSeconds } = {}) {
  return { date, totalSeconds, categoriesSeconds, settledThroughMs: nowInitial - 1000, complete, reasonCodes,
    ...(nonSpecialTotalSeconds === undefined ? {} : { nonSpecialTotalSeconds }) };
}
function webOtherSnapshot({ monday = 100, tuesday = 200, wednesday = 300 } = {}) {
  return snapshot('web', [
    day('2026-10-05', monday, { rest: monday, study: 0, composite: 0 }, { complete: monday !== null, reasonCodes: monday === null ? ['cloud_gap'] : [] }),
    day('2026-10-06', tuesday, { rest: tuesday, study: 0, composite: 0 }),
    day('2026-10-07', wednesday, { rest: wednesday, study: 0, composite: 0 }),
  ], { includedSourceKeys: ['web-cloud-device'], excludedSourceKeys: ['web-own-source'] });
}
function applicationSnapshot(values = [1, 2, 3]) {
  return snapshot('application', RANGE.dates.map((date, index) => day(date, values[index],
    { study: 0, composite: 0, unclassified: 0, restrictedEntertainment: values[index] },
    { nonSpecialTotalSeconds: values[index] })), { includedSourceKeys: ['app-own', 'app-other'] });
}
function localModel(date, seconds) {
  return { ok: true, date, usage: { totalSeconds: 900_000, studySeconds: 800_000, compositeSeconds: 50_000, restSeconds: 50_000 },
    local: { today: { onlineSeconds: seconds, byQuotaBucket: { rest: seconds, study: 0, composite: 0 }, complete: true } },
    completeness: { complete: false, localComplete: false, otherDevicesUnknown: true } };
}

async function run() {
  const mod = await loadModules();
  assert.deepEqual(mod.sourceStatisticsWeekRange(nowInitial), { fromDate: '2026-10-05', toDate: '2026-10-07', dates: RANGE.dates });
  assert.equal(mod.sourceStatisticsWeekRange(Date.parse('2026-10-04T23:59:00+08:00')).fromDate, '2026-09-28');

  const storage = {};
  const writes = [];
  let currentTime = nowInitial;
  let localSeconds = [10, 20, 30];
  let online = true;
  let nativeAvailable = true;
  let appCloudReads = 0;
  const cloudCalls = [];
  const nativeCalls = [];
  const cloudRead = async (_credentials, query) => {
    cloudCalls.push(query);
    if (query.source === 'web') return online ? { ok: true, snapshot: webOtherSnapshot() } : { ok: false, errorCode: 'network_offline' };
    appCloudReads++;
    return online ? { ok: true, snapshot: applicationSnapshot() } : { ok: false, errorCode: 'network_offline' };
  };
  const nativeContext = async () => ({ ok: true, contextId: 'native-context', childId: CHILD,
    connectionGeneration: 7, capabilityAvailable: nativeAvailable });
  const nativeExchange = async request => {
    nativeCalls.push(request);
    return nativeAvailable ? { ok: true, source: 'native', snapshot: applicationSnapshot(),
      contextId: 'native-context', connectionGeneration: 7 } : { ok: false, errorCode: 'native_unavailable' };
  };
  const shadow = mod.createSourceStatisticsShadow({
    readContext: async () => ({ apiBase: 'https://example.invalid', childId: CHILD, deviceToken: 'never-persist',
      scopeHash: 'same-account-scope' }),
    nativeContext, nativeExchange, cloudRead,
    readModel: async ({ date }) => localModel(date, localSeconds[RANGE.dates.indexOf(date)]),
    readConfiguration: async () => config,
    storage: { get: async key => ({ [key]: storage[key] }) },
    write: async (items, options) => { writes.push(options); Object.assign(storage, items); },
    now: () => currentTime,
  });

  const first = await shadow.refresh({ force: true });
  assert.equal(first.ok, true);
  assert.equal(first.report.status, 'available');
  assert.equal(first.report.daily[0].usedSeconds.rest, 111);
  assert.equal(first.report.daily[1].usedSeconds.rest, 222);
  assert.equal(first.report.daily[2].usedSeconds.rest, 333);
  assert.equal(first.report.weeklyRestSeconds, 666);
  assert.equal(first.report.weeklyRestLimitSeconds, 36_000);
  assert.equal(nativeCalls.length, 1);
  assert.equal(nativeCalls[0].webStatistics.days[0].totalSeconds, 110,
    'web total must be current own ledger + actual cloud-other snapshot, not merged V2 usage');
  assert.deepEqual(nativeCalls[0].webStatistics.includedSourceKeys, ['web-cloud-device', 'web-own-source']);
  assert.equal(appCloudReads, 0, 'successful Native application snapshot is selected alone');
  assert.equal(storage[mod.SOURCE_STATISTICS_SHADOW_KEY].source.web.days[0].localReadAtMs, nowInitial);
  assert.equal(writes.every(item => item.priority === 'derived'), true);
  assert.equal(JSON.stringify(storage).includes('never-persist'), false);

  currentTime += 5 * 60_000;
  localSeconds = [50, 60, 70];
  online = false;
  nativeAvailable = false;
  const offline = await shadow.refresh();
  assert.equal(offline.ok, true);
  assert.equal(offline.report.weeklyComplete, true,
    'using an exact-scope last-known-good cloud/app snapshot must preserve its original complete status');
  assert.equal(offline.report.daily[0].usedSeconds.rest, 151,
    'offline projection must refresh this device local ledger while reusing only cloud-other LKG');
  assert.equal(offline.report.daily[1].usedSeconds.rest, 262);
  assert.equal(offline.report.daily[2].usedSeconds.rest, 373);
  assert.equal(offline.report.source.web.stale, true);
  assert.equal(offline.report.source.web.days[0].cloudOrigin, 'last_known_good');
  assert.equal(offline.report.source.web.days[0].cloudReadAtMs, nowInitial);
  assert.equal(offline.report.source.application.complete, true);
  assert.equal(offline.report.source.application.stale, true);
  assert.equal(offline.report.source.application.days[0].readAtMs, nowInitial);
  assert.equal(offline.report.weeklyRestSeconds, 786);
  assert.equal(appCloudReads, 1, 'cloud application fallback attempted once after Native became unavailable');

  const incompleteLocal = await mod.buildLocalWebSourceSnapshot({ childId: CHILD, ...RANGE,
    quotaModels: [localModel(RANGE.dates[0], 10), { ok: true, date: RANGE.dates[1], local: { today: { onlineSeconds: 7,
      byQuotaBucket: { rest: 7 }, complete: false } } }, localModel(RANGE.dates[2], 30)],
    ownSourceKeys: ['web-own-source'], readAtMs: currentTime });
  assert.equal(incompleteLocal.days[0].complete, true,
    'one local day incompleteness must not contaminate another day');
  assert.equal(incompleteLocal.days[1].complete, false);
  assert.equal(incompleteLocal.days[2].complete, true);
}

run().then(() => console.log('source-statistics-shadow.test.js: all assertions passed'))
  .catch(error => { console.error(error); process.exitCode = 1; });

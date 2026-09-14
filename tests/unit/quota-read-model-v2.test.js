// Run with: node tests/unit/quota-read-model-v2.test.js
'use strict';

const fs = require('fs');
const path = require('path');

function loadModule() {
  let code = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'quota-read-model-v2.js'), 'utf8');
  code = code.replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  return new Function('budgetedLocalSet', 'getBeijingWeekPeriod', 'PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY', 'chrome', `${code}\nreturn { buildLocalQuotaProjectionV2, buildQuotaReadModelV2, readQuotaReadModelV2 };`)(
    async () => {},
    () => ({ weekStart: '2026-09-07', weekEnd: '2026-09-13' }),
    'profile_account_v2_shadow_cache_v1',
    { storage: { local: { get: async () => ({}) } } }
  );
}

let passed = 0;
function check(label, condition) {
  if (!condition) throw new Error(label);
  passed++;
}

const quota = loadModule();

const local = quota.buildLocalQuotaProjectionV2({
  '2026-09-11': {
    domains: {
      'study.example': { activeSeconds: 120, pipSeconds: 900 },
      'rest.example': { activeSeconds: 180, backgroundMediaSeconds: 800 },
    },
    targets: {
      study: { activeByQuotaBucket: { study: 120 } },
      rest: { activeByQuotaBucket: { rest: 180 } },
    },
  },
  '2026-09-12': {
    domains: { 'today.example': { activeSeconds: 300, pipSeconds: 700 } },
    targets: { today: { activeByQuotaBucket: { composite: 120, rest: 180 } } },
  },
}, { date: '2026-09-12', weekStart: '2026-09-07', weekEnd: '2026-09-13' });

check('local daily online uses active webpage only', local.today.onlineSeconds === 300);
check('local daily buckets use actual quota bucket', local.today.byQuotaBucket.composite === 120 && local.today.byQuotaBucket.rest === 180);
check('weekly Rest sums active quota buckets', local.weekRestSeconds === 360);
check('PiP and background media do not enter quota', local.today.onlineSeconds !== 1000 && local.weekRestSeconds !== 1860);

const correctedLocal = quota.buildLocalQuotaProjectionV2({
  '2026-09-12': {
    domains: { 'cg.163.com': { activeSeconds: 180 } },
    targets: { cg: { activeByQuotaBucket: { study: 180 } } },
  },
}, {
  date: '2026-09-12', weekStart: '2026-09-07', weekEnd: '2026-09-13', deviceId: 'self',
  corrections: [{ id: 'c1', deviceId: 'self', date: '2026-09-12', domain: 'cg.163.com', channel: 'active',
    originalMode: 'study', originalQuotaBucket: 'study', effectiveMode: 'rest', effectiveQuotaBucket: 'rest', durationSeconds: 180 }],
});
check('historical correction moves quota attribution without changing webpage total', correctedLocal.today.onlineSeconds === 180 &&
  correctedLocal.today.byQuotaBucket.study === 0 && correctedLocal.today.byQuotaBucket.rest === 180 && correctedLocal.weekRestSeconds === 180);

const cloudSnapshot = {
  period: { weekStart: '2026-09-07', weekEnd: '2026-09-13' },
  snapshotId: 'snap-1',
  asOf: 1000,
  completeness: { complete: true, expectedDevices: ['self', 'other'], missingDevices: [], incompatibleDevices: [], staleDevices: [], incompleteDevices: [] },
  deviceAccounts: [
    { deviceId: 'self', date: '2026-09-12', complete: true, quotaProjection: { activeSeconds: 999, byQuotaBucket: [{ quotaBucket: 'rest', durationSeconds: 999 }], byDomain: [{ domain: 'self.cloud', durationSeconds: 999 }] } },
    { deviceId: 'other', date: '2026-09-12', complete: true, quotaProjection: { activeSeconds: 60, byQuotaBucket: [{ quotaBucket: 'rest', durationSeconds: 60 }], byDomain: [{ domain: 'shared.example', durationSeconds: 60 }] } },
    { deviceId: 'other', date: '2026-09-11', complete: true, quotaProjection: { activeSeconds: 240, byQuotaBucket: [{ quotaBucket: 'rest', durationSeconds: 240 }], byDomain: [{ domain: 'old.example', durationSeconds: 240 }] } },
  ],
};

const model = quota.buildQuotaReadModelV2({
  date: '2026-09-12', weekStart: '2026-09-07', weekEnd: '2026-09-13',
  deviceId: 'self', localProjection: local, cloudSnapshot,
  pending: { segmentCount: 3, activeSeconds: 45 }, now: 2000,
});

check('cloud copy of this device is excluded', model.usage.totalSeconds === 360 && !model.usage.domainSeconds['self.cloud']);
check('other device daily account is added once', model.usage.restSeconds === 240 && model.usage.domainSeconds['shared.example'] === 60);
check('other device weekly Rest is retained', model.usage.weekRestSeconds === 660);
check('pending local facts are diagnostic and already included locally', model.usage.totalSeconds === 360 && model.pending.activeSeconds === 45);
check('complete snapshot remains complete', model.completeness.complete === true && model.completeness.otherDevicesUnknown === false);

const beforeUpload = quota.buildQuotaReadModelV2({
  date: '2026-09-12', weekStart: '2026-09-07', weekEnd: '2026-09-13', deviceId: 'self', localProjection: local,
  cloudSnapshot: { ...cloudSnapshot, deviceAccounts: cloudSnapshot.deviceAccounts.filter(row => row.deviceId !== 'self') },
});
check('uploading this device does not change merged usage', beforeUpload.usage.totalSeconds === model.usage.totalSeconds && beforeUpload.usage.weekRestSeconds === model.usage.weekRestSeconds);

const missing = quota.buildQuotaReadModelV2({
  date: '2026-09-12', weekStart: '2026-09-07', weekEnd: '2026-09-13', deviceId: 'self', localProjection: local,
  cloudSnapshot: { ...cloudSnapshot, completeness: { ...cloudSnapshot.completeness, complete: false, missingDevices: ['other'] }, deviceAccounts: [] },
});
check('missing other device is explicit without inventing usage', missing.completeness.otherDevicesUnknown === true && missing.usage.totalSeconds === 300);

console.log(`[Quota Read Model V2] ${passed}/${passed} passed`);

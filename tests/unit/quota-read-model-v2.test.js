// Run with: node tests/unit/quota-read-model-v2.test.js
'use strict';

const fs = require('fs');
const path = require('path');

function loadModule({ get = async () => ({}), write = async () => {}, cloudScope = async () => ({ ok: true, apiBase: 'https://example.invalid' }) } = {}) {
  let code = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'quota-read-model-v2.js'), 'utf8');
  code = code.replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  const scopeCode = fs.readFileSync(path.join(__dirname, '../../extension/core/profile-account-shadow-v2.js'), 'utf8')
    .split('export function isProfileAccountShadowScopeCurrent')[1].split('\nfunction sumBuckets')[0];
  const scopeCurrent = new Function(`return function isProfileAccountShadowScopeCurrent${scopeCode}`)();
  return new Function('budgetedLocalSet', 'getBeijingWeekPeriod', 'PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY', 'chrome',
    'isProfileAccountShadowScopeCurrent', 'readSharedAccessPolicyCloudScope', `${code}\nreturn { buildLocalQuotaProjectionV2, buildQuotaReadModelV2, readQuotaReadModelV2 };`)(
    write,
    () => ({ weekStart: '2026-09-07', weekEnd: '2026-09-13' }),
    'profile_account_v2_shadow_cache_v1',
    { storage: { local: { get } } }, scopeCurrent, cloudScope
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
  completeness: { complete: true, inventoryAvailable: true, expectedDevices: ['self', 'other'], missingDevices: [], incompatibleDevices: [], staleDevices: [], incompleteDevices: [] },
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
check('missing other devices do not make local result unreadable', missing.completeness.complete === true
  && missing.completeness.cloudCoverageComplete === false);
const missingInventory = quota.buildQuotaReadModelV2({
  date: '2026-09-12', weekStart: '2026-09-07', weekEnd: '2026-09-13', deviceId: 'self', localProjection: local,
  cloudSnapshot: { ...cloudSnapshot, completeness: {} },
});
check('missing inventory remains diagnostic, confirmed usage is retained', missingInventory.usage.restSeconds === 240
  && missingInventory.completeness.deviceInventoryAvailable === false && missingInventory.completeness.complete === true);

(async () => {
  const now = Date.parse('2026-09-12T10:00:00+08:00');
  const scope = { apiBase: 'https://example.invalid', deviceId: 'self', childId: 'synthetic-child' };
  const key = 'profile_account_v2_shadow_cache_v1';
  const original = { cloud_device_id: 'self', cloud_profile_id: scope.childId, cloud_device_token: 'synthetic-token',
    usage_segments_v1: { synthetic: { date: '2026-09-12', channel: 'active', durationSeconds: 10 } },
    segment_sync_outbox_v1: { pendingIds: ['synthetic'] },
    stats_sync_outbox_v1: { dirtyDates: ['2026-09-12'] },
    daily_usage_stats_v1: { '2026-09-12': { domains: { 'local.example': { activeSeconds: 10 } },
      targets: { local: { activeByQuotaBucket: { rest: 10 } } } } },
    [key]: { scope, current: { ...cloudSnapshot, schemaVersion: 2, snapshotHash: 'a'.repeat(64),
      totalHash: 'b'.repeat(64), verifiedAt: now, expiresAt: now + 1000 } } };
  for (const fault of ['none', 'expired_transport', 'wrong_child', 'wrong_device', 'wrong_api', 'unscoped', 'other_week']) {
    const data = structuredClone(original);
    if (fault === 'wrong_child') data[key].scope.childId = 'another-child';
    if (fault === 'wrong_device') data[key].scope.deviceId = 'another-device';
    if (fault === 'wrong_api') data[key].scope.apiBase = 'https://another.invalid';
    if (fault === 'unscoped') delete data[key].scope;
    if (fault === 'other_week') data[key].current.period.weekStart = '2026-08-31';
    if (fault === 'expired_transport') data[key].current.expiresAt = now - 1;
    const api = loadModule({ get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, data[k]])),
      write: async items => Object.assign(data, structuredClone(items)) });
    const preservedKeys = ['daily_usage_stats_v1', 'usage_segments_v1', 'segment_sync_outbox_v1', 'stats_sync_outbox_v1', key];
    const beforeAccounting = JSON.stringify(preservedKeys.map(k => data[k]));
    const result = await api.readQuotaReadModelV2({ date: '2026-09-12', now });
    check(`${fault}: only current identity and period contribute`, result.usage.restSeconds === (['none', 'expired_transport'].includes(fault) ? 70 : 10));
    check(`${fault}: stored model never includes credentials`, !JSON.stringify(data.quota_read_model_v2).includes('synthetic-token'));
    check(`${fault}: reading never changes accounting, pending or confirmed cloud snapshot`, JSON.stringify(preservedKeys.map(k => data[k])) === beforeAccounting);
  }
  for (const fault of ['none', 'wrong_child', 'wrong_device', 'wrong_api', 'other_week', 'unscoped']) {
    const cached = { ...model, scope: { ...scope } };
    if (fault === 'wrong_child') cached.scope.childId = 'other-child';
    if (fault === 'wrong_device') cached.scope.deviceId = 'other-device';
    if (fault === 'wrong_api') cached.scope.apiBase = 'https://another.invalid';
    if (fault === 'other_week') cached.weekStart = '2026-08-31';
    if (fault === 'unscoped') delete cached.scope;
    const data = { ...original, quota_read_model_v2: cached };
    const api = loadModule({ get: async keys => {
      if (Array.isArray(keys) && keys.includes('daily_usage_stats_v1')) throw Error('synthetic_read_failure');
      return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, data[k]]));
    } });
    const result = await api.readQuotaReadModelV2({ date: '2026-09-12', now });
    check(`${fault}: fallback rejects another identity or period`, result.ok === (fault === 'none'));
  }
  for (const fault of ['changed_during_read', 'changed_during_cache_write']) {
    const data = structuredClone(original);
    const api = loadModule({ get: async keys => {
      const result = Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, structuredClone(data[k])]));
      if (fault === 'changed_during_read' && Array.isArray(keys) && keys.includes('daily_usage_stats_v1')) {
        data.cloud_profile_id = 'different-child';
      }
      return result;
    }, write: async items => {
      Object.assign(data, structuredClone(items));
      if (fault === 'changed_during_cache_write') data.cloud_profile_id = 'different-child';
    } });
    const result = await api.readQuotaReadModelV2({ date: '2026-09-12', now });
    check(`${fault}: asynchronous identity change cannot return old usage`, result.ok === false);
  }
  console.log(`[Quota Read Model V2] ${passed}/${passed} passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });

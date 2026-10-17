// Run with: node tests/unit/profile-account-v2-sync.test.js
'use strict';

const fs = require('fs');
const path = require('path');

function extractFunctionSource(code, name) {
  const start = code.indexOf(`async function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  const braceStart = code.indexOf('{', code.indexOf(')', start));
  let depth = 0;
  for (let index = braceStart; index < code.length; index++) {
    if (code[index] === '{') depth++;
    if (code[index] === '}' && --depth === 0) return code.slice(start, index + 1);
  }
  throw new Error(`${name} parse failed`);
}

function loadFunction(name, injected) {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'cloud-sync.js'), 'utf8');
  const fn = extractFunctionSource(source, name);
  return new Function('__injected', `const { ${Object.keys(injected).join(', ')} } = __injected;\n${fn}\nreturn ${name};`)(injected);
}

let passed = 0;
function check(label, condition, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
  passed++;
}

(async () => {
  const requests = [];
  const stored = [];
  const binding = { cloud_device_id: 'synthetic-device', cloud_profile_id: 'synthetic-child', cloud_device_token: 'present' };
  const baseScope = { syncState: { deviceToken: 'present', deviceId: 'synthetic-device', profileId: 'synthetic-child', monitoringEnabled: 1 },
    getCloudApiBase: () => 'https://example.invalid', chrome: { storage: { local: { get: async () => ({ ...binding }) } } } };
  const syncSnapshot = loadFunction('syncProfileAccountV2ShadowSnapshot', {
    ...baseScope,
    getDateKey: () => '2026-09-16',
    getBeijingWeekPeriod: () => ({ weekStart: '2026-09-14' }),
    cloudRequest: async (method, route) => {
      requests.push({ method, route });
      if (route.includes('page=0')) return { found: true, snapshotId: 'snapshot-1', pageCount: 2 };
      return { found: true, snapshotId: 'snapshot-1', pageCount: 2 };
    },
    validateProfileAccountSnapshotPages: async (pages) => {
      check('all immutable snapshot pages reach verifier together', pages.length === 2);
      return { snapshotId: 'snapshot-1', asOf: 123, completeness: { complete: true } };
    },
    storeProfileAccountShadowSnapshot: async (snapshot) => stored.push(snapshot),
    normalizeUploadErrorCode: (error) => String(error?.message || error),
    logCloudFailureIncidentBestEffort: () => {},
  });
  const result = await syncSnapshot({ enabled: true });
  check('first request creates snapshot and later pages bind snapshot id', requests[1].route.includes('snapshotId=snapshot-1'));
  check('verified snapshot replaces cache once', result.stored === true && stored.length === 1);

  let replaced = false;
  const invalidSnapshot = loadFunction('syncProfileAccountV2ShadowSnapshot', {
    ...baseScope,
    getDateKey: () => '2026-09-16',
    getBeijingWeekPeriod: () => ({ weekStart: '2026-09-14' }),
    cloudRequest: async () => ({ found: true, snapshotId: 'snapshot-bad', pageCount: 1 }),
    validateProfileAccountSnapshotPages: async () => { throw new Error('PROFILE_ACCOUNT_SNAPSHOT_HASH_MISMATCH'); },
    storeProfileAccountShadowSnapshot: async () => { replaced = true; },
    normalizeUploadErrorCode: (error) => String(error?.message || error),
    logCloudFailureIncidentBestEffort: () => {},
  });
  const invalid = await invalidSnapshot({ enabled: true });
  check('invalid snapshot never replaces last verified cache', invalid.stored === false && !replaced);
  check('snapshot verification failure remains shadow diagnostic', invalid.error === 'PROFILE_ACCOUNT_SNAPSHOT_HASH_MISMATCH');

  for (const fault of ['backoff', 'upload_failed', 'upload_throw', 'success']) {
    const calls = [];
    const makeResult = () => ({ failed: 0, errors: [], skipped: false });
    const sync = loadFunction('syncUsageStatsByDateWatermarkV1', {
      syncUsageUploadsByDateWatermarkV1: async () => {
        calls.push('upload');
        if (fault === 'upload_throw') throw Error('upload_unavailable');
        return { ...makeResult(), skipped: fault === 'backoff',
          failed: fault === 'upload_failed' ? 1 : 0,
          errors: fault === 'upload_failed' ? ['upload_failed'] : [] };
      },
      syncProfileAccountV2ShadowSnapshot: async () => { calls.push('download'); return { stored: true, error: null }; },
      makeUsageDateSyncResult: makeResult, normalizeUploadErrorCode: error => error.message,
    });
    const outcome = await sync({ enabled: true });
    check(`${fault}: confirmed accounts still downloaded once`, calls.join(',') === 'upload,download');
    check(`${fault}: successful download is recorded`, outcome.profileAccountV2Shadow.stored && !outcome.skipped);
    check(`${fault}: upload error is not acknowledged or hidden`, outcome.failed === (fault.startsWith('upload_') ? 1 : 0));
  }
  const uploadCode = extractFunctionSource(fs.readFileSync(path.join(__dirname,
    '../../extension/infra/cloud-sync.js'), 'utf8'), 'syncUsageUploadsByDateWatermarkV1');
  check('upload scheduler no longer owns snapshot download', !uploadCode.includes('syncProfileAccountV2ShadowSnapshot'));
  const actualBackoffUploads = loadFunction('syncUsageUploadsByDateWatermarkV1', {
    getUsageUploadBackoff: async () => ({ nextRetryAt: Date.now() + 60000, lastError: 'synthetic_retry' }),
    makeUsageDateSyncResult: () => ({ failed: 0, errors: [], skipped: false }),
  });
  let downloadCount = 0;
  const actualBackoffSync = loadFunction('syncUsageStatsByDateWatermarkV1', {
    syncUsageUploadsByDateWatermarkV1: actualBackoffUploads,
    syncProfileAccountV2ShadowSnapshot: async () => { downloadCount++; return { stored: true, error: null }; },
  });
  const actualBackoffResult = await actualBackoffSync({ enabled: true });
  check('real upload backoff branch cannot suppress download', actualBackoffResult.reason === 'retry_backoff'
    && actualBackoffResult.profileAccountV2Shadow.stored && downloadCount === 1);
  const failedDownloadSync = loadFunction('syncUsageStatsByDateWatermarkV1', {
    syncUsageUploadsByDateWatermarkV1: async () => ({ failed: 1, errors: ['original_upload_error'], skipped: true }),
    syncProfileAccountV2ShadowSnapshot: async () => ({ stored: false, error: 'synthetic_download_error' }),
  });
  const failedDownload = await failedDownloadSync({ enabled: true });
  check('independent download failure preserves upload error', failedDownload.failed === 2
    && failedDownload.errors.join(',') === 'original_upload_error,profileAccountV2Shadow:synthetic_download_error');
  check('failed download cannot be reported as an entirely skipped sync', failedDownload.skipped === false);

  const shadowCode = fs.readFileSync(path.join(__dirname, '../../extension/core/profile-account-shadow-v2.js'), 'utf8');
  const storeCode = extractFunctionSource(shadowCode, 'storeProfileAccountShadowSnapshot');
  const loadModule = code => import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  globalThis.__scopeProfile = await loadModule(shadowCode.replace(/^import .*;\r?\n/gm, ''));
  globalThis.__scopeContract = await loadModule(fs.readFileSync(path.join(__dirname,
    '../../extension/core/shared-contracts/1.56.0/source-statistics.js'), 'utf8'));
  const sourceProjection = await loadModule('const sourceStatisticsContract=globalThis.__scopeContract;'
    + 'const {PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY,isProfileAccountShadowScopeCurrent}=globalThis.__scopeProfile;\n'
    + fs.readFileSync(path.join(__dirname, '../../extension/infra/source-statistics-shadow.js'), 'utf8').replace(/^import .*;\r?\n/gm, ''));
  for (const fault of ['none', 'page_failure', 'child_changed', 'token_changed', 'initial_mismatch', 'transaction_changed']) {
    const state = { ...baseScope.syncState }, localBinding = { ...binding };
    const old = { schemaVersion: 1, current: { snapshotId: 'old-no-scope' } };
    const cacheKey = 'profile_account_v2_shadow_cache';
    const data = { [cacheKey]: structuredClone(old), ...localBinding };
    let calls = 0, writes = 0;
    if (fault === 'initial_mismatch') data.cloud_profile_id = 'another-child';
    const storage = { get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, data[key]])),
      set: async items => { writes++; Object.assign(data, structuredClone(items)); } };
    const actualStore = new Function('runStorageMutation', 'PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY',
      `${storeCode};return storeProfileAccountShadowSnapshot;`)(async task => {
      if (fault === 'transaction_changed') data.cloud_device_token = 'changed-before-write';
      return task(storage);
    }, cacheKey);
    const verifiedAt = Date.parse('2026-09-16T10:00:00+08:00');
    const snapshot = { schemaVersion: 2, snapshotId: 'verified-new', snapshotHash: 'a'.repeat(64), totalHash: 'b'.repeat(64),
      verifiedAt, expiresAt: verifiedAt + 10000, period: { weekStart: '2026-09-14', weekEnd: '2026-09-20' }, asOf: 123,
      deviceAccounts: [], completeness: { complete: false, inventoryAvailable: true, expectedDevices: ['synthetic-device'],
        missingDevices: [], incompatibleDevices: [], staleDevices: [], incompleteDevices: ['synthetic-device'] } };
    const frozenSnapshot = JSON.stringify(snapshot);
    const actualSync = loadFunction('syncProfileAccountV2ShadowSnapshot', {
      syncState: state, getCloudApiBase: baseScope.getCloudApiBase, chrome: { storage: { local: storage } },
      getDateKey: () => '2026-09-16', getBeijingWeekPeriod: () => ({ weekStart: '2026-09-14' }),
      cloudRequest: async () => {
        calls++;
        if (calls === 2 && fault === 'page_failure') throw Error('page_fetch_failed');
        if (calls === 1 && fault === 'child_changed') { state.profileId = 'another-child'; data.cloud_profile_id = 'another-child'; }
        if (calls === 1 && fault === 'token_changed') { state.deviceToken = 'another-token'; data.cloud_device_token = 'another-token'; }
        return { found: true, snapshotId: 'verified-new', pageCount: 2 };
      },
      validateProfileAccountSnapshotPages: async pages => { check(`${fault}: original pages reach verifier`, pages.length === 2); return snapshot; },
      storeProfileAccountShadowSnapshot: actualStore,
      normalizeUploadErrorCode: error => error.message, logCloudFailureIncidentBestEffort: () => {},
    });
    const scopedResult = await actualSync({ enabled: true });
    check(`${fault}: original snapshot content/hash stays unchanged`, JSON.stringify(snapshot) === frozenSnapshot);
    if (fault === 'none') {
      check('new real fetch stores only non-credential scope', JSON.stringify(data[cacheKey].scope) === JSON.stringify({
        apiBase: 'https://example.invalid', deviceId: 'synthetic-device', childId: 'synthetic-child' }));
      check('new fetch snapshot body stays identical', JSON.stringify(data[cacheKey].current) === frozenSnapshot);
      check('new fetch stored once', scopedResult.stored && writes === 1 && calls === 2);
      check('scope never persists token', !JSON.stringify(data[cacheKey].scope).includes('present'));
      const breakdown = sourceProjection.buildWebSourceBreakdown({ fromDate: '2026-09-14', toDate: '2026-09-16',
        quotaModels: ['2026-09-14', '2026-09-15', '2026-09-16'].map(date => ({ ok: true, date, weekStart: '2026-09-14', weekEnd: '2026-09-20',
          otherDevices: { snapshotId: 'verified-new' },
          local: { today: { complete: false, byQuotaBucket: { rest: 13 } } } })), readAtMs: verifiedAt,
        context: { apiBase: 'https://example.invalid', deviceId: 'synthetic-device', childId: 'synthetic-child' },
        profileAccountCache: data[cacheKey] });
      check('real sync and transaction-created scope reaches no-other display state', breakdown.otherState === 'none');
      check('local partial and original snapshot partial cannot change other absence', breakdown.local.days[0].complete === false);
    } else {
      check(`${fault}: no new write or retroactive scope`, !scopedResult.stored && writes === 0 && JSON.stringify(data[cacheKey]) === JSON.stringify(old));
    }
  }

  const reconciled = [];
  const retryReconciliation = loadFunction('retryPendingDeviceAccountReconciliationsV2Shadow', {
    syncState: { deviceToken: 'present', monitoringEnabled: 1 },
    getPendingDeviceAccountV2Reconciliations: async () => [
      { date: '2026-09-15', revision: 2, manifestHash: 'a'.repeat(64) },
      { date: '2026-09-16', revision: 3, manifestHash: 'b'.repeat(64) },
      { date: '2026-09-17', revision: 4, manifestHash: 'c'.repeat(64) },
    ],
    cloudRequest: async (_method, _route, body) => body.date === '2026-09-15'
      ? { status: 'matched', checkedAt: 100 }
      : { status: 'pending_raw', checkedAt: 200 },
    markDeviceAccountV2Reconciliation: async (...args) => reconciled.push(args),
  });
  const retry = await retryReconciliation({ enabled: true });
  check('reconciliation retry is bounded to two dates', retry.attempted === 2 && reconciled.length === 2);
  check('matched and pending audit states remain distinct', retry.matched === 1 && retry.pending === 1);

  console.log(`[Profile Account V2 Sync] ${passed}/${passed} passed`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

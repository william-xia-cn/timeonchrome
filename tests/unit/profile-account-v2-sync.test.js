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
  const syncSnapshot = loadFunction('syncProfileAccountV2ShadowSnapshot', {
    syncState: { deviceToken: 'present', monitoringEnabled: 1 },
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
    syncState: { deviceToken: 'present', monitoringEnabled: 1 },
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

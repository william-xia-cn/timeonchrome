'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
function extract(source, name) {
  source = source.replace(/\r\n/g, '\n');
  const match = source.match(new RegExp('(?:export )?(?:async )?function ' + name + '\\('));
  assert(match, name);
  const end = source.indexOf('\n}', match.index);
  assert(end > match.index, name + ' close');
  return source.slice(match.index, end + 2).replace(/^export /, '');
}
const accident = '3dc973119dc6ad3c6d3ce08f264880abdc521860';
async function investigate(source, label) {
  const timers = new Map(); let timerId = 0, bodyEntered = false, finished = false;
  const deps = { syncState: { deviceToken: 'synthetic-token' }, CLOUD_CONFIG: { REQUEST_TIMEOUT_MS: 15000 },
    markCloudConnectionAttempt: async () => {}, createCloudRequestId: () => 'synthetic-request',
    getCloudClientVersion: () => null, getCloudApiBase: () => 'https://synthetic.invalid',
    AbortController, setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    fetch: async () => ({ ok: true, headers: { get: () => 'application/json' },
      json: () => { bodyEntered = true; return new Promise(() => {}); } }) };
  const request = new Function('d', 'const {' + Object.keys(deps).join(',') + '}=d;\n'
    + extract(source, 'cloudRequest') + '\nreturn cloudRequest;')(deps);
  void request('POST', '/synthetic/diagnostic').then(() => { finished = true; }, () => { finished = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bodyEntered, true);
  assert.equal(timers.size, 0, label + ': request timer is already removed while body remains pending');
  assert.equal(finished, false);

  let cleared = 0;
  const parts = ['makeUploadPartResult', 'makeUsageDateSyncResult', 'mergeUsageDatePartResults']
    .map(name => extract(source, name)).join('\n');
  const scheduling = { getUsageUploadBackoff: async () => ({}),
    uploadUsageSegmentsV1: async () => ({ uploaded: 0, failed: 0, pendingCount: 0, errors: [], dryRun: false }),
    retryPendingDeviceAccountsV2Shadow: async () => ({ failed: 1, errors: ['synthetic_v2_failed'] }),
    uploadCurrentWeekDeviceAccountsV2: async () => ({ failed: 1, errors: ['synthetic_v2_failed'] }),
    retryPendingDeviceAccountReconciliationsV2Shadow: async () => ({ failed: 0, errors: [] }),
    syncProfileAccountV2ShadowSnapshot: async () => ({ ok: true }),
    isRetryableUsageErrorCode: () => false, clearUsageUploadBackoff: async () => { cleared++; } };
  const sync = new Function('d', 'const {' + Object.keys(scheduling).join(',') + '}=d;\n' + parts
    + '\nconst uploadTodayUsageStatsSnapshotV1=async()=>makeUsageDateSyncResult();'
    + '\nconst uploadHistoricalUsageStatsByWatermarkV1=async()=>makeUsageDateSyncResult();\n'
    + extract(source, 'syncUsageStatsByDateWatermarkV1') + '\nreturn syncUsageStatsByDateWatermarkV1;')(scheduling);
  const result = await sync({ enabled: true });
  assert.equal(result.deviceAccountV2Pending.failed, 1);
  assert.equal(result.deviceAccountV2CurrentWeek.failed, 1);
  assert.equal(result.failed, 0, label + ': nested V2 errors do not reach the aggregate result');
  assert.equal(result.errors.length, 0);
  assert.equal(cleared, 1, label + ': the V1 success path can clear its own backoff despite nested V2 failure');
  console.log(label + ': response-body timer gap and V2 aggregate error omission REPRODUCED (not a production root-cause claim)');
}
(async () => {
  const baseline = execFileSync('git', ['show', accident + ':extension/infra/cloud-sync.js'],
    { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  await investigate(baseline, 'incident 1.7.49');
  console.log('Current A/B behavior is verified by cloud-upload-fault-recovery.test.js; historical reproduction remains unchanged');
  const store = fs.readFileSync(path.join(root, 'extension/infra/forced-use-contribution-store.js'), 'utf8');
  let attempts = 0, available = false;
  const recover = new Function('recoverForcedUseIntervalsFromGrants', 'let startupRecovery=null;\n'
    + extract(store, 'beginForcedUseContributionRecovery') + '\nreturn beginForcedUseContributionRecovery;')(
    async () => { attempts++; return { ok: available }; });
  const first = recover(); assert.equal((await first).ok, false);
  available = true;
  const second = recover(); assert.equal(first, second);
  assert.equal((await second).ok, false); assert.equal(attempts, 1);
  console.log('auxiliary startup failure reuse REPRODUCED; auxiliary recovery remains unchanged by A/B');
})().catch(error => { console.error(error); process.exitCode = 1; });

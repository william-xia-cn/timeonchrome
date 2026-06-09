// cloud-connection-resilience.test.js
// Run with: node tests/unit/cloud-connection-resilience.test.js

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function expectTrue(desc, cond) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
}

function extractFunctionSource(code, functionName) {
  const marker = functionName.startsWith('async ')
    ? `async function ${functionName.slice(6)}(`
    : `function ${functionName}(`;
  const start = code.indexOf(marker);
  if (start < 0) throw new Error(`function ${functionName} not found`);
  const braceStart = code.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return code.slice(start, i + 1);
    }
  }
  throw new Error(`function ${functionName} parse failed`);
}

function run() {
  const cloudSync = read('extension/infra/cloud-sync.js');
  const syncNowStart = cloudSync.indexOf('export async function syncNow(');
  const syncNowEnd = cloudSync.indexOf('// ── V1 Stats Foundation sync orchestration', syncNowStart);
  const syncNow = cloudSync.slice(syncNowStart, syncNowEnd);
  const sendHeartbeat = extractFunctionSource(cloudSync, 'async sendHeartbeat');
  const cloudRequest = extractFunctionSource(cloudSync, 'async cloudRequest');

  expectTrue('cloud sync should persist local connection state', cloudSync.includes("CONNECTION_STATE: 'cloud_connection_state_v1'") && cloudSync.includes('updateCloudConnectionState'));
  expectTrue('cloud request should send client version header', cloudRequest.includes('X-TimeOnChrome-Version') && cloudRequest.includes('getCloudClientVersion'));
  expectTrue('cloud request should send request id header', cloudRequest.includes('X-TimeOnChrome-Request-Id') && cloudRequest.includes('createCloudRequestId'));
  expectTrue('cloud request should send device id header when available', cloudRequest.includes('X-TimeOnChrome-Device-Id'));
  expectTrue('cloud request should record attempts/success/failure', cloudRequest.includes('markCloudConnectionAttempt(path)') && cloudRequest.includes('markCloudConnectionSuccess(path') && cloudRequest.includes('markCloudConnectionFailure(path'));
  expectTrue('syncNow hydrates storage token before skip decision', syncNow.indexOf('await hydrateCloudSyncStateFromStorage();') >= 0 && syncNow.indexOf('await hydrateCloudSyncStateFromStorage();') < syncNow.indexOf('if (!syncState.deviceToken)'));
  expectTrue('sendHeartbeat hydrates storage token before skip decision', sendHeartbeat.indexOf('await hydrateCloudSyncStateFromStorage();') >= 0 && sendHeartbeat.indexOf('await hydrateCloudSyncStateFromStorage();') < sendHeartbeat.indexOf('if (!syncState.deviceToken)'));
  expectTrue('syncNow and heartbeat should use stable request ids per run', syncNow.includes("createCloudRequestId('sync')") && sendHeartbeat.includes("createCloudRequestId('heartbeat')"));
  expectTrue('sendHeartbeat supports a follow-up sync after recovered binding', sendHeartbeat.includes('afterRecoveredSync') && sendHeartbeat.includes('recoveryResult?.recovered') && sendHeartbeat.includes('await afterRecoveredSync()'));
  expectTrue('sendHeartbeat runs recovered follow-up sync before heartbeat request', sendHeartbeat.indexOf('await afterRecoveredSync()') >= 0 && sendHeartbeat.indexOf('await afterRecoveredSync()') < sendHeartbeat.indexOf("cloudRequest('POST', '/device/heartbeat'"));
  expectTrue('sendHeartbeat follow-up sync failure does not clear device token or block heartbeat', sendHeartbeat.includes('device_recovery_followup_sync_failed') && sendHeartbeat.indexOf('device_recovery_followup_sync_failed') < sendHeartbeat.indexOf("cloudRequest('POST', '/device/heartbeat'") && !sendHeartbeat.includes('clearCloudBindingState'));
  expectTrue('only explicit DEVICE_UNBOUND clears device binding', cloudSync.includes('isDeviceUnboundPayload') && cloudSync.includes('clearCloudBindingState') && !cloudSync.includes('resp.status === 401') && !cloudSync.includes('Device token expired'));
  expectTrue('status API exposes local connection state', extractFunctionSource(cloudSync, 'async getStatsFoundationV1SyncStatus').includes('connectionState'));

  console.log(`\n[Cloud Connection Resilience] ${passed}/${passed + failed} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed) process.exit(1);
}

run();

// device-unbound-contract.test.js
// Run with: node tests/unit/device-unbound-contract.test.js

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

function run() {
  const migration = read('workers/migrations/016_device_unbound_status.sql');
  const index = read('workers/src/index.ts');
  const profiles = read('workers/src/routes/profiles.ts');
  const device = read('workers/src/routes/device.ts');
  const stats = read('workers/src/routes/stats.ts');
  const cloudSync = read('extension/infra/cloud-sync.js');
  const admin = read('extension/admin/admin.js');
  const legacyUploadSources = [
    read('workers/src/routes/changelog.ts'),
    read('workers/src/routes/sessions.ts'),
    read('workers/src/routes/events.ts'),
    read('workers/src/routes/compositeSessions.ts'),
  ].join('\n');

  expectTrue('migration adds explicit device status', migration.includes('ADD COLUMN status') && migration.includes("DEFAULT 'bound'") && migration.includes('ADD COLUMN unbound_at'));
  expectTrue('base schema includes device status', index.includes("status TEXT DEFAULT 'bound'") && index.includes('unbound_at INTEGER'));
  expectTrue('device unbind should be soft update not physical delete', profiles.includes("UPDATE devices SET status = 'unbound', unbound_at = ? WHERE id = ?") && !profiles.includes('DELETE FROM devices WHERE id = ?'));
  expectTrue('device list hides soft-unbound devices by default', profiles.includes("COALESCE(status, 'bound') = 'bound'"));

  expectTrue('device bind returns explicit DEVICE_UNBOUND for unbound token', device.includes("existing.status === 'unbound'") && device.includes("code: 'DEVICE_UNBOUND'"));
  expectTrue('device bind missing token is not treated as unbound', device.includes("code: 'DEVICE_TOKEN_NOT_FOUND'") && device.includes('Device token not found'));
  expectTrue('device routes return explicit unbound response', device.includes('function deviceUnboundResponse') && device.includes('bound: false') && device.includes("reason: 'unbound'"));
  expectTrue('stats upload rejects unbound token explicitly', stats.includes('function deviceUnboundResponse') && (stats.match(/device\.unbound/g) || []).length >= 8);
  expectTrue('legacy device upload routes reject unbound token explicitly', (legacyUploadSources.match(/DEVICE_UNBOUND/g) || []).length >= 4 && (legacyUploadSources.match(/device\.unbound/g) || []).length >= 4);

  expectTrue('cloud sync detects only explicit DEVICE_UNBOUND payload', cloudSync.includes('function isDeviceUnboundPayload') && cloudSync.includes("payload?.code === 'DEVICE_UNBOUND'"));
  expectTrue('cloud sync clears device id/token/profile only on explicit unbound', cloudSync.includes('async function clearCloudBindingState') && cloudSync.includes('[CLOUD_CONFIG.KEYS.DEVICE_ID]: null') && cloudSync.includes('[CLOUD_CONFIG.KEYS.DEVICE_TOKEN]: null'));
  expectTrue('cloud sync no longer clears binding on generic 401', !cloudSync.includes('resp.status === 401') && !cloudSync.includes('Device token expired'));
  expectTrue('admin force sync treats hadFailure as failure', admin.includes('syncResult?.hadFailure') && admin.includes('设备已被解绑，请重新绑定'));

  console.log(`\n[Device Unbound Contract] ${passed}/${passed + failed} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed) process.exit(1);
}

run();

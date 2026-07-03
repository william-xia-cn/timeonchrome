// managed-internal-channel.test.js
// Run with: node tests/unit/managed-internal-channel.test.js

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
  const migration = read('workers/migrations/019_managed_device_mappings_v1.sql');
  const device = read('workers/src/routes/device.ts');
  const profiles = read('workers/src/routes/profiles.ts');
  const cloudSync = read('extension/infra/cloud-sync.js');
  const audit = read('workers/src/routes/deviceAccessAudit.ts');
  const activationGate = read('extension/core/activation-gate.js');
  const tool = read('tools/self-hosted-crx-dry-run.js');

  expectTrue('migration creates managed mappings table', migration.includes('CREATE TABLE IF NOT EXISTS managed_device_mappings_v1'));
  expectTrue('migration stores tenant and device policy ids', migration.includes('tenant_id') && migration.includes('device_policy_id'));
  expectTrue('migration maps to profile/device only and not tokens', migration.includes('profile_id') && migration.includes('device_id') && !migration.includes('device_token') && !migration.includes('account_token'));
  expectTrue('migration enforces unique tenant/devicePolicy pair', migration.includes('UNIQUE(tenant_id, device_policy_id)'));

  expectTrue('worker exposes managed recovery endpoint', device.includes("path === '/device/managed-recover/bootstrap'"));
  expectTrue('managed recovery validates tenant/devicePolicy ids', device.includes('normalizeManagedPolicyId(body.tenantId') && device.includes('MANAGED_POLICY_MALFORMED'));
  expectTrue('managed recovery recovers only existing bound mapped devices', device.includes('managed_device_mappings_v1 m') && device.includes("COALESCE(status, 'bound') = 'bound'"));
  expectTrue('managed recovery returns recovered binding with managed source', device.includes("recoverySource: 'managed_policy'"));
  expectTrue('managed recovery records history', device.includes('recordManagedRecoveredDeviceRequest') && device.includes('Managed policy recovered mapped device candidate'));

  expectTrue('profiles exposes managed mapping endpoint', profiles.includes('/managed-device-mappings/v1') && profiles.includes('managedDeviceMappings'));
  expectTrue('profiles mapping PUT requires owned bound device', profiles.includes('MANAGED_MAPPING_DEVICE_NOT_FOUND') && profiles.includes('Device not found or unbound'));
  expectTrue('profiles mapping PUT upserts by tenant/devicePolicy', profiles.includes('WHERE tenant_id = ? AND device_policy_id = ?') && profiles.includes('created: true') && profiles.includes('updated: true'));

  const managedFlowStart = cloudSync.indexOf("if (activation.activation?.activationMode === 'managed_policy')");
  const identityAfterManaged = cloudSync.indexOf('const identity = await getChromeProfileIdentity', managedFlowStart);
  expectTrue('extension tries managed recovery before chrome identity recovery', managedFlowStart >= 0 && identityAfterManaged > managedFlowStart);
  expectTrue('extension calls managed recovery endpoint', cloudSync.includes('/device/managed-recover/bootstrap'));
  expectTrue('extension falls back to identity only when policy allows it', cloudSync.includes('allowIdentityRecovery === false') && cloudSync.includes('identity_recovery_disabled_by_policy'));
  expectTrue('managed policy cloudEndpoint is used for cloud requests', cloudSync.includes('getCloudApiBase') && cloudSync.includes('managedPolicy?.cloudEndpoint'));
  expectTrue('device access audit classifies managed recovery as recovery', audit.includes("endpoint.includes('/device/managed-recover')"));

  expectTrue('activation gate still limits managed policy to activation anchors', activationGate.includes('MANAGED_POLICY_KEYS') && !activationGate.includes('studyList') && !activationGate.includes('timeQuota'));

  expectTrue('CRX helper supports pack mode and external key env', tool.includes('TIMEONCHROME_CRX_KEY_PATH') && tool.includes('chromeIdFromPem') && tool.includes('--pack'));
  expectTrue('CRX helper does not include key path in JSON output', tool.includes('keyProvided: !!keyPath') && !tool.includes('keyPath: keyPath'));
  expectTrue('CRX helper prepares independent update host layout', tool.includes('hostOutputDir') && tool.includes("'timeonchrome', 'crx'"));
  expectTrue('CRX helper validates banned package entries', tool.includes('BANNED_PACKAGE_ENTRIES') && tool.includes("'workers'") && tool.includes("'pages'"));

  console.log(`\n[Managed Internal Channel] ${passed}/${passed + failed} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed) process.exit(1);
}

run();

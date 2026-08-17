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
  const device = read('workers/src/routes/device.ts');
  const profiles = read('workers/src/routes/profiles.ts');
  const cloudSync = read('extension/infra/cloud-sync.js');
  const audit = read('workers/src/routes/deviceAccessAudit.ts');
  const activationGate = read('extension/core/activation-gate.js');
  const pages = read('pages/index.html');
  const pierceDoc = read('docs/deployment/PIERCE_MACOS_SELF_HOSTED_POLICY_KEEPER.md');
  const tool = read('tools/self-hosted-crx-dry-run.js');

  expectTrue('activation gate supports managedDeviceToken as primary managed policy credential',
    activationGate.includes("'managedDeviceToken'") &&
    activationGate.includes("'managedDeviceLabel'") &&
    activationGate.includes("'managedProfileEmail'") &&
    activationGate.includes('managedDeviceToken') &&
    !activationGate.includes('studyList') &&
    !activationGate.includes('timeQuota'));

  expectTrue('legacy tenant/devicePolicy anchors remain only as fallback fields',
    activationGate.includes('Legacy recovery anchors') &&
    activationGate.includes("'tenantId'") &&
    activationGate.includes("'devicePolicyId'"));

  expectTrue('extension adopts managedDeviceToken before legacy managed recovery',
    cloudSync.includes('tryManagedDeviceTokenBootstrap') &&
    cloudSync.includes('managed_device_token_adopted') &&
    cloudSync.indexOf('tryManagedDeviceTokenBootstrap') < cloudSync.indexOf("'/device/managed-recover/bootstrap'"));

  expectTrue('managedDeviceToken hydrate uses device config to resolve profile and device id',
    cloudSync.includes("cloudRequest('GET', '/device/config'") &&
    cloudSync.includes('Managed device token config response missing profile_id or device_id'));

  expectTrue('legacy managed recovery endpoint is still present but not the new main path',
    device.includes("path === '/device/managed-recover/bootstrap'") &&
    cloudSync.includes('legacy_managed_policy_recovery'));

  expectTrue('profiles can cloud-create devices and return a device token',
    profiles.includes("request.method === 'POST' && devicesMatch") &&
    profiles.includes('cloud_created') &&
    profiles.includes('device_token: deviceToken'));

  expectTrue('profiles can export and reset device tokens for owned bound devices',
    profiles.includes('/token\\/(export|reset)') &&
    profiles.includes("action === 'reset'") &&
    profiles.includes('DEVICE_UNBOUND') &&
    profiles.includes('device_token: deviceToken'));

  expectTrue('Pages exposes create/export/reset token actions and policy snippet generation',
    pages.includes('创建受管终端') &&
    pages.includes('导出 Token') &&
    pages.includes('重置 Token') &&
    pages.includes('managedDeviceToken 是该终端的云端访问凭据') &&
    pages.includes('buildManagedPolicySnippet'));

  expectTrue('Pierce macOS docs use managedDeviceToken instead of tenant/devicePolicy main line',
    pierceDoc.includes('managedDeviceToken') &&
    pierceDoc.includes('Paste managedDeviceToken') &&
    !pierceDoc.includes('<key>tenantId</key>') &&
    !pierceDoc.includes('<key>devicePolicyId</key>'));

  expectTrue('device access audit still classifies legacy managed recovery as recovery',
    audit.includes("endpoint.includes('/device/managed-recover')"));

  expectTrue('CRX helper supports pack mode and external key env', tool.includes('TIMEONCHROME_CRX_KEY_PATH') && tool.includes('chromeIdFromPem') && tool.includes('--pack'));
  expectTrue('CRX helper does not include key path in JSON output', tool.includes('keyProvided: !!keyPath') && !tool.includes('keyPath: keyPath'));
  expectTrue('CRX helper prepares independent update host layout', tool.includes('hostOutputDir') && tool.includes("'timeonchrome', 'crx'"));
  expectTrue('CRX helper validates banned package entries', tool.includes('BANNED_PACKAGE_ENTRIES') && tool.includes("'workers'") && tool.includes("'pages'"));
  expectTrue('managed CRX staging excludes obsolete privacy pages only for managed deployment',
    tool.includes('MANAGED_PACKAGE_EXCLUDED_ENTRIES') &&
    tool.includes('managedDeployment && MANAGED_PACKAGE_EXCLUDED_ENTRIES.has(entry.name)'));
  expectTrue('managed CRX staging preserves privacy activation core dependency',
    tool.includes("path.join(stagingDir, 'core', 'privacy-consent.js')") &&
    tool.includes('activation dependency'));

  console.log(`\n[Managed Internal Channel] ${passed}/${passed + failed} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed) process.exit(1);
}

run();

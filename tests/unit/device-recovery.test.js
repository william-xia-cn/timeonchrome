// device-recovery.test.js
// Run with: node tests/unit/device-recovery.test.js

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
  const manifest = JSON.parse(read('extension/manifest.json'));
  const cloudSync = read('extension/infra/cloud-sync.js');
  const bind = read('extension/bind.js');
  const admin = read('extension/admin/admin.js');
  const device = read('workers/src/routes/device.ts');
  const profiles = read('workers/src/routes/profiles.ts');
  const audit = read('workers/src/routes/deviceAccessAudit.ts');
  const migration = read('workers/migrations/018_device_identity_recovery.sql');
  const pages = read('pages/index.html');
  const privacy = read('extension/privacy.html');

  const permissions = manifest.permissions || [];
  expectTrue('manifest requests identity permissions for profile user info', permissions.includes('identity') && permissions.includes('identity.email'));
  expectTrue('manifest must not define OAuth client/scopes', !Object.prototype.hasOwnProperty.call(manifest, 'oauth2'));
  expectTrue('extension must not call getAuthToken', ![cloudSync, bind, admin].join('\n').includes('getAuthToken'));
  expectTrue('extension reads profile user info only', cloudSync.includes("getProfileUserInfo({ accountStatus: 'ANY' })") && bind.includes("getProfileUserInfo({ accountStatus: 'ANY' })") && admin.includes("getProfileUserInfo({ accountStatus: 'ANY' })"));

  expectTrue('migration adds hashed identity fields to devices', migration.includes('ADD COLUMN chrome_identity_hash') && migration.includes('ADD COLUMN identity_linked_at') && migration.includes('ADD COLUMN last_recovered_at') && migration.includes('ADD COLUMN recovery_status'));
  expectTrue('migration creates recovery request table', migration.includes('CREATE TABLE IF NOT EXISTS device_recovery_requests_v1') && migration.includes('poll_token_hash') && migration.includes('candidate_device_id'));
  expectTrue('migration stores no raw Chrome identity id/email', !migration.includes('chrome_identity_id') && !migration.includes('chrome_identity_email') && !migration.includes('raw_identity'));

  expectTrue('worker hashes chrome identity before storage', device.includes('function chromeIdentityHash') && device.includes('chrome-identity:') && device.includes('hmacHex'));
  expectTrue('worker exposes identity link endpoint', device.includes("path === '/device/identity-link'") && device.includes('IDENTITY_UNAVAILABLE') && device.includes('updateDeviceIdentityMetadata'));
  expectTrue('worker exposes recovery bootstrap/status endpoints', device.includes("path === '/device/recover/bootstrap'") && device.includes("path === '/device/recover/status'"));
  expectTrue('worker allows macOS and Windows recovery platforms', device.includes('function isSupportedRecoveryPlatform') && device.includes("platform === 'macos' || platform === 'windows'"));
  expectTrue('worker still rejects unsupported recovery platforms', device.includes('!isSupportedRecoveryPlatform(platform)') && device.includes('UNSUPPORTED_PLATFORM'));
  expectTrue('worker recovery candidates are platform-scoped', device.includes('AND d.platform = ?') && device.includes('chromeIdentityHash(env, chromeIdentityId)'));
  expectTrue('worker does not block unique candidates only because they are recently active', !device.includes('recentlyActive') && !device.includes('Candidate device is recently active'));
  expectTrue('worker marks matching pending recovery requests recovered after auto recovery', device.includes('markPendingRecoveryRequestsRecovered') && device.includes("status = 'recovered'") && device.includes("status = 'pending'") && device.includes('candidate_device_id = ?'));
  expectTrue('worker returns recovery states', device.includes("status: 'RECOVERED'") && device.includes('PENDING_CLOUD_CONFIRMATION') && device.includes('NO_CANDIDATE'));
  expectTrue('worker keeps unbound devices unrecoverable', device.includes("COALESCE(d.status, 'bound') = 'bound'") && device.includes('deviceUnboundResponse'));
  expectTrue('worker stores only poll token hash for pending requests', device.includes('pollTokenHash') && device.includes('poll_token_hash') && !device.includes('recoveryPollToken,'));
  expectTrue('worker records auto recovery as recovery history', device.includes('recordRecoveredDeviceRequest') && device.includes("status, result_device_id") && device.includes('Auto recovered unique device candidate'));
  expectTrue('worker retains recovery history with cleanup', device.includes('cleanupDeviceRecoveryRequests') && device.includes("status != 'pending'") && device.includes('LIMIT 100'));

  expectTrue('profiles route lists recovery requests', profiles.includes('/device-recovery-requests/v1') && profiles.includes('device_recovery_requests_v1 r') && profiles.includes('recoveryRequests'));
  expectTrue('profiles route supports approve/create_new/ignore', profiles.includes("action === 'approve'") && profiles.includes("action === 'create_new'") && profiles.includes("action === 'ignore'"));
  expectTrue('profiles route returns candidate and result device names', profiles.includes('candidate_device_name') && profiles.includes('result_device_name'));
  expectTrue('device audit classifies recovery endpoints', audit.includes("return 'identity_link'") && audit.includes("return 'device_recovery'"));

  expectTrue('cloud sync persists recovery binding on RECOVERED', cloudSync.includes('persistRecoveredBinding') && cloudSync.includes('/device/recover/bootstrap') && cloudSync.includes('/device/recover/status'));
  expectTrue('cloud sync saves pending recovery state', cloudSync.includes('cloud_device_recovery_request_id') && cloudSync.includes('cloud_device_recovery_poll_token') && cloudSync.includes('pending_cloud_confirmation'));
  expectTrue('cloud sync polls pending recovery instead of bootstrapping a duplicate request', cloudSync.includes('hasPendingRecoveryRequest') && cloudSync.indexOf('if (hasPendingRecoveryRequest)') < cloudSync.indexOf("cloudAnonymousRequest('POST', '/device/recover/bootstrap'"));
  expectTrue('cloud sync keeps pending recovery on poll failure', cloudSync.includes("pending: true, reason: 'recovery_poll_failed'") && cloudSync.includes('status: \'pending_cloud_confirmation\''));
  expectTrue('cloud sync clears terminal pending recovery requests with retry backoff', cloudSync.includes('isTerminalDeviceRecoveryStatus') && cloudSync.includes('clearPendingDeviceRecoveryState') && cloudSync.includes('RECOVERY_REQUEST_NOT_FOUND') && cloudSync.includes('lastAttemptAt: Date.now()'));
  expectTrue('cloud sync links identity after binding', cloudSync.includes('/device/identity-link') && cloudSync.includes('cloud_chrome_identity_status_v1'));
  expectTrue('cloud sync does not block existing token sync on identity unavailable', cloudSync.includes('if (!syncState.deviceToken) return') && cloudSync.includes('chrome_identity_unavailable'));
  expectTrue('cloud sync logs recovery lifecycle events', cloudSync.includes('device_recovery_attempt_started') && cloudSync.includes('device_recovery_bootstrap_result') && cloudSync.includes('device_recovery_poll_result') && cloudSync.includes('device_recovery_failed'));

  expectTrue('bind/admin include identity metadata in device bind', bind.includes('chromeIdentityId') && bind.includes('platform: getClientPlatform()') && admin.includes('chromeIdentityId') && admin.includes('platform: getClientPlatform()'));
  expectTrue('local admin displays Chrome identity and recovery status', admin.includes('Chrome 身份与绑定恢复') && admin.includes('cloud_chrome_identity_status_v1') && admin.includes('cloud_device_recovery_state_v1') && admin.includes('Device Token') && admin.includes('最近轮询') && admin.includes('恢复请求'));
  expectTrue('local admin recovery copy includes macOS and Windows', admin.includes('macOS / Windows') && !admin.includes('当前 Windows 终端暂不支持自动恢复'));
  expectTrue('cloud Pages display recovery requests and history', pages.includes('device-recovery-requests') && pages.includes('renderDeviceRecoveryRequests') && pages.includes('恢复到此设备') && pages.includes('作为新设备') && pages.includes('待处理恢复请求') && pages.includes('最近恢复历史'));
  expectTrue('privacy policy explains identity.email and no OAuth token use', privacy.includes('identity / identity.email') && privacy.includes('does not call <code>chrome.identity.getAuthToken()</code>') && privacy.includes('non-reversible hash') && privacy.includes('macOS or Windows'));

  console.log(`\n[Device Recovery] ${passed}/${passed + failed} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed) process.exit(1);
}

run();

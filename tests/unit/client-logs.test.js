// client-logs.test.js
// Run with: node tests/unit/client-logs.test.js

'use strict';

const fs = require('fs');
const path = require('path');

class MockStorage {
  constructor() { this.data = {}; }
  reset() { this.data = {}; }
  async get(keys) {
    if (keys === null) return { ...this.data };
    if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, this.data[key]]));
    if (typeof keys === 'string') return { [keys]: this.data[keys] };
    if (keys && typeof keys === 'object') {
      return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, this.data[key] ?? fallback]));
    }
    return {};
  }
  async set(obj) { Object.assign(this.data, obj); }
  async remove(keys) { (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete this.data[key]); }
}

const mockLocal = new MockStorage();
global.chrome = {
  storage: { local: mockLocal },
  runtime: { getManifest: () => ({ version: '1.7.2-test' }) },
};

function loadProdModule(relPath, exportNames) {
  const abs = path.join(__dirname, '..', '..', 'extension', relPath);
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');
  const factory = new Function(`${code}\nreturn { ${exportNames.join(', ')} };`);
  return factory();
}

const logs = loadProdModule('infra/client-logs.js', [
  'CLIENT_LOGS_KEY',
  'logClientEvent',
  'getClientLogs',
  'getClientLogStatus',
  'updateClientLogConfig',
  'clearClientLogs',
  'getPendingClientLogsForUpload',
  'shouldUploadClientLog',
]);

let passed = 0;
let failed = 0;
function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}${detail ? `: ${detail}` : ''}`);
  }
}

async function testDefaultLocalPolicy() {
  mockLocal.reset();
  await logs.logClientEvent({ level: 'info', category: 'runtime', eventCode: 'info_skip', message: 'skip' });
  await logs.logClientEvent({ level: 'warning', category: 'runtime', eventCode: 'warn_keep', message: 'keep' });
  const result = await logs.getClientLogs({ limit: 20 });
  check('default policy skips info', !result.logs.some((log) => log.eventCode === 'info_skip'));
  check('default policy records warning', result.logs.some((log) => log.eventCode === 'warn_keep'));
  check('unbound log keeps null profile/device', result.logs[0].profileId === null && result.logs[0].deviceId === null && result.logs[0].bindingState === 'unbound');
}

async function testBoundIdentityAndRedaction() {
  mockLocal.reset();
  await mockLocal.set({
    cloud_profile_id: 'profile-1',
    cloud_device_id: 'device-1',
    cloud_device_token: 'secret-device-token',
  });
  await logs.logClientEvent({
    level: 'error',
    category: 'cloud',
    eventCode: 'redaction_case',
    message: 'failed for user@example.com with Bearer abc.def.ghi',
    domain: 'https://www.baidu.com/search?q=private',
    details: {
      token: 'secret',
      password: 'pw',
      email: 'child@example.com',
      url: 'https://example.com/path?q=secret',
      nested: { cookie: 'abc', message: 'hello user@example.com' },
    },
  });
  const result = await logs.getClientLogs({ limit: 1 });
  const log = result.logs[0];
  check('bound log stores profile/device', log.profileId === 'profile-1' && log.deviceId === 'device-1' && log.bindingState === 'bound');
  check('domain strips url path/query', log.domain === 'baidu.com');
  const raw = JSON.stringify(log);
  check('details redact token/password/cookie', !raw.includes('secret-device-token') && !raw.includes('secret') && !raw.includes('pw') && !raw.includes('abc'));
  check('details do not keep full url path/query', !raw.includes('/path') && !raw.includes('q=secret'));
  check('email is masked or redacted', !raw.includes('child@example.com') && !raw.includes('user@example.com'));
}

async function testUploadPolicyAndTtl() {
  mockLocal.reset();
  await mockLocal.set({
    cloud_profile_id: 'profile-2',
    cloud_device_id: 'device-2',
    cloud_device_token: 'token-2',
    guardian_config: {
      clientLoggingPolicyV1: {
        localEnabled: true,
        localMinLevel: 'info',
        uploadEnabled: true,
        uploadMinLevel: 'info',
        uploadCategories: ['cloud'],
        targetDeviceIds: ['device-2'],
        sampleRate: 1,
        expiresAt: Date.now() + 3600000,
      },
    },
  });
  await logs.logClientEvent({ level: 'info', category: 'cloud', eventCode: 'info_upload', message: 'upload me' });
  await logs.logClientEvent({ level: 'info', category: 'media', eventCode: 'info_skip_category', message: 'skip me' });
  const pending = await logs.getPendingClientLogsForUpload();
  check('remote policy uploads matching info with ttl', pending.logs.some((log) => log.eventCode === 'info_upload'));
  check('upload category filter excludes other categories', !pending.logs.some((log) => log.eventCode === 'info_skip_category'));

  mockLocal.reset();
  await mockLocal.set({
    cloud_profile_id: 'profile-3',
    cloud_device_id: 'device-3',
    cloud_device_token: 'token-3',
    guardian_config: {
      clientLoggingPolicyV1: {
        localEnabled: true,
        localMinLevel: 'info',
        uploadEnabled: true,
        uploadMinLevel: 'info',
        expiresAt: null,
      },
    },
  });
  await logs.logClientEvent({ level: 'info', category: 'cloud', eventCode: 'info_no_ttl', message: 'no ttl' });
  const noTtl = await logs.getClientLogs({ limit: 10 });
  check('info without ttl is not recorded by remote info policy', !noTtl.logs.some((log) => log.eventCode === 'info_no_ttl'));
}

async function testRetentionMaxEntries() {
  mockLocal.reset();
  await logs.updateClientLogConfig({ maxEntries: 2, localMinLevel: 'warning' });
  await logs.logClientEvent({ level: 'warning', category: 'runtime', eventCode: 'retention_1', message: '1' });
  await logs.logClientEvent({ level: 'warning', category: 'runtime', eventCode: 'retention_2', message: '2' });
  await logs.logClientEvent({ level: 'warning', category: 'runtime', eventCode: 'retention_3', message: '3' });
  const status = await logs.getClientLogStatus();
  check('maxEntries retention prunes oldest logs', status.total === 2, `total=${status.total}`);
  const result = await logs.getClientLogs({ limit: 10 });
  check('oldest pruned entry absent', !result.logs.some((log) => log.eventCode === 'retention_1'));
}

function testStaticWiring() {
  const adminHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'admin', 'admin.html'), 'utf8');
  const adminJs = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'admin', 'admin.js'), 'utf8');
  const pages = fs.readFileSync(path.join(__dirname, '..', '..', 'pages', 'index.html'), 'utf8');
  const worker = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'clientLogs.ts'), 'utf8');
  check('local admin exposes system logs page', adminHtml.includes('data-page="client-logs"') && adminJs.includes('GET_CLIENT_LOGS'));
  check('pages exposes cloud system logs page', pages.includes('/client-logs/v1') && pages.includes('clientLoggingPolicyV1'));
  check('worker supports client log upload and query', worker.includes("path === '/device/client-logs/v1'") && worker.includes('/client-logs/v1'));
}

(async () => {
  await testDefaultLocalPolicy();
  await testBoundIdentityAndRedaction();
  await testUploadPolicyAndTtl();
  await testRetentionMaxEntries();
  testStaticWiring();
  console.log(`\nclient-logs: ${passed}/${passed + failed} passed`);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

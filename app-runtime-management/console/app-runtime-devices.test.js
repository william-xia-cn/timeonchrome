const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const devices = require('./app-runtime-devices');
const source = fs.readFileSync(`${__dirname}/app-runtime.js`, 'utf8');
function harness(platform, runtime) {
  const elements = new Map();
  const $ = (id) => {
    if (!elements.has(id)) elements.set(id, { value: '', hidden: false, textContent: '', open: true, removeAttribute(key) { delete this[key]; } });
    return elements.get(id);
  };
  $('#pair-platform').value = platform;
  $('#pair-default-child').value = '0';
  const ctx = vm.createContext({ $, AppRuntimeDevices: devices, state: {}, clearInterval() {}, mock: false, runtime,
    RUNTIME_API: 'https://example.test', childFromIndex: () => ({ id: 'fixture-child' }),
    showCode: (_kind, code) => { $('#pair-code').textContent = code; }, Date });
  vm.runInContext(source.slice(source.indexOf('  let pairingGeneration'), source.indexOf('  function showCode')), ctx);
  return { $, run: () => vm.runInContext('createPairing()', ctx), reset: () => vm.runInContext('resetPairing()', ctx) };
}
async function main() {
  assert.equal(devices.osLabel({ platform: 'macos', windowsVersion: 'macOS 15' }), 'macOS 15');
  assert.equal(devices.osLabel({ osVersion: 'macOS 16', windowsVersion: 'legacy' }), 'macOS 16');
  assert.equal(devices.syncAt({ lastSyncAtMs: 12, lastUploadAtMs: 9 }), 12);
  assert.equal(devices.syncAt({ lastUploadAtMs: 9 }), 9);
  assert.equal(devices.accountStatus({ sessionActive: false }), '会话未活动');
  assert.match(devices.productBlockStatus({ platform: 'windows', policyState: 'applied' }), /未覆盖/);
  assert.match(devices.productBlockStatus({ platform: 'windows', productBlockingCapability: 'reported', policyState: 'pending' }), /尚未生效/);
  assert.match(devices.productBlockStatus({ platform: 'windows', productBlockingCapability: 'reported', policyState: 'applied' }), /实机验收/);
  assert.equal(devices.accountStatus({}), '会话状态未报告');
  assert.equal(devices.releasePath('macos'), null);
  assert.throws(() => devices.pairingName('linux'));
  const calls = [];
  const mac = harness('macos', async (path, options) => { calls.push([path, JSON.parse(options.body)]); return { code: 'fixture', expiresAtMs: 1 }; });
  await mac.run();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ['/v2/module/pairing-codes', { defaultChildId: 'fixture-child', displayName: 'Mac 电脑' }]);
  assert.equal(mac.$('#pair-result').hidden, false);
  assert.equal(mac.$('#download-installer').hidden, true);
  assert.equal(mac.$('#download-installer').href, undefined);
  const win = harness('windows', async (path) => { if (path.includes('releases')) throw new Error('offline'); return { code: 'valid', expiresAtMs: 1 }; });
  await win.run();
  assert.equal(win.$('#pair-code').textContent, 'valid');
  assert.equal(win.$('#pair-result').hidden, false);
  assert.match(win.$('#pair-install-hint').textContent, /配对码仍有效/);
  assert.equal(win.$('#create-pairing').disabled, false);
  const release = harness('windows', async (path) => path.includes('releases') ? { version: '2.6.8' } : { code: 'ok' });
  await release.run();
  assert.equal(release.$('#download-installer').href, 'https://example.test/v1/releases/windows/x64/2.6.8/installer');
  let resolve;
  const stale = harness('macos', () => new Promise((done) => { resolve = done; }));
  const pending = stale.run();
  stale.$('#pair-platform').value = 'windows'; stale.reset();
  resolve({ code: 'stale' }); await pending;
  assert.equal(stale.$('#pair-result').hidden, true);
  assert.equal(stale.$('#pair-code').textContent, '----');
  const failure = harness('macos', async () => { throw new Error('pair failed'); });
  await assert.rejects(failure.run(), /pair failed/);
  assert.equal(failure.$('#create-pairing').disabled, false);
  assert.equal(failure.$('#pair-result').hidden, true);
  console.log('PASS: device labels, account state, Mac/Windows pairing, release failure, stale response, pairing failure');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

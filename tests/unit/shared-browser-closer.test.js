'use strict';
const assert = require('node:assert/strict'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const event = () => { const listeners = new Set(); return { addListener: f => listeners.add(f),
  removeListener: f => listeners.delete(f), emit: (...args) => { for (const f of listeners) f(...args); }, listeners }; };
async function run() {
  const { createSharedBrowserCloser, readSharedBrowserCloseCapability } = await import(pathToFileURL(path.resolve(__dirname, '../../extension/product/shared-browser-closer.js')).href);
  const capabilityOptions = { runtime: { getManifest: () => ({ permissions: ['debugger'] }) },
    permissions: { contains: async () => true }, readMarker: async () => ({ sharedBrowserCloseDevelopment: true }),
    isDevelopment: async () => true };
  assert.equal((await readSharedBrowserCloseCapability(capabilityOptions)).available, true);
  for (const change of [{ readMarker: async () => ({}) }, { isDevelopment: async () => false },
    { runtime: { getManifest: () => ({ permissions: [] }) } }, { permissions: { contains: async () => false } }]) {
    assert.equal((await readSharedBrowserCloseCapability({ ...capabilityOptions, ...change })).available, false);
  }
  const target = { id: 1, windowId: 2, url: 'https://fixture.test' };
  function fixture() {
    const onRemoved = event(), onEvent = event(), calls = [];
    const tabs = { onRemoved, get: async () => ({ ...target }) };
    const debuggerApi = { onEvent, attach: async () => {}, detach: async () => { calls.push('detach'); },
      getTargets: async () => [{ tabId: 1, type: 'page', url: target.url, id: 'target-1' }],
      sendCommand: async (_target, method) => { calls.push(method); } };
    return { tabs, debuggerApi, calls, onRemoved, onEvent,
      close: effect => createSharedBrowserCloser({ tabs, debuggerApi, timeoutMs: 30,
        readCapability: async () => ({ available: true }) }).close(target, effect, async () => true) };
  }
  const successOnly = fixture();
  assert.equal((await successOnly.close('request-normal-close')).outcome, 'failed', 'CDP success alone never ACKs completed');
  assert(!successOnly.calls.includes('Target.closeTarget'));
  const canceled = fixture();
  canceled.debuggerApi.sendCommand = async (_target, method) => {
    canceled.calls.push(method);
    if (method === 'Page.close') {
      canceled.onEvent.emit({ tabId: 1 }, 'Page.javascriptDialogOpening', { type: 'beforeunload' });
      canceled.onEvent.emit({ tabId: 1 }, 'Page.javascriptDialogClosed', { result: false });
    }
  };
  assert.equal((await canceled.close('request-normal-close')).outcome, 'canceled');
  assert(!canceled.calls.includes('Target.closeTarget'));
  const alert = fixture();
  alert.debuggerApi.sendCommand = async (_target, method) => {
    if (method === 'Page.close') {
      alert.onEvent.emit({ tabId: 1 }, 'Page.javascriptDialogOpening', { type: 'alert' });
      alert.onEvent.emit({ tabId: 1 }, 'Page.javascriptDialogClosed', { result: false });
    }
  };
  assert.equal((await alert.close('request-normal-close')).outcome, 'failed', 'unrelated dialogs do not claim cancellation');
  const wrong = fixture(); wrong.debuggerApi.getTargets = async () => [{ tabId: 99, type: 'page', url: target.url, id: 'other' }];
  assert.equal((await wrong.close('force-close')).outcome, 'stale');
  assert(!wrong.calls.includes('Target.closeTarget'));
  const late = fixture(); let release;
  late.debuggerApi.attach = () => new Promise(resolve => { release = resolve; });
  assert.equal((await late.close('force-close')).outcome, 'failed');
  release(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(late.calls, ['detach'], 'late attach is detached without sending close');
  for (const f of [successOnly, canceled, alert, wrong, late]) {
    assert.equal(f.onRemoved.listeners.size, 0); assert.equal(f.onEvent.listeners.size, 0);
  }
  console.log('Shared closer: bounded attach, exact target, real outcome and normal cancellation isolation PASS');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

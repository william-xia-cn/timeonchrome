// Run with: node tests/unit/health-probe.test.js

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'extension', 'health-probe.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'extension', 'health-probe.js'), 'utf8');

async function run() {
  assert.match(html, /<script src="health-probe\.js"><\/script>/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|WebSocket|storage\./);

  const sent = [];
  const removed = [];
  const timers = [];
  const context = {
    Promise,
    chrome: {
      runtime: {
        sendMessage: async (message) => {
          sent.push(message);
          return { ok: true };
        },
      },
      tabs: {
        getCurrent: async () => ({ id: 42 }),
        remove: async (tabId) => { removed.push(tabId); },
      },
    },
    window: { close() {} },
    setTimeout(fn, delay) {
      timers.push({ fn, delay });
      return timers.length;
    },
    clearTimeout() {},
  };
  vm.runInNewContext(source, context, { filename: 'health-probe.js' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.strictEqual(JSON.stringify(sent), JSON.stringify([{ type: 'TIMEONCHROME_LOCAL_HEALTH_PROBE' }]));
  assert.deepStrictEqual(removed, [42]);
  assert.strictEqual(timers.some((entry) => entry.delay === 5_000), true);
  console.log('[Health Probe] 7/7 passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

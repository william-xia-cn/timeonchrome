// mode-boundary-intents.test.js
// Run with: node tests/unit/mode-boundary-intents.test.js

'use strict';

const fs = require('fs');
const path = require('path');

class MockStorage {
  constructor() { this.data = {}; }
  async get(keys) {
    if (typeof keys === 'string') return { [keys]: this.data[keys] };
    const out = {};
    for (const key of keys || []) out[key] = this.data[key];
    return out;
  }
  async set(obj) { Object.assign(this.data, obj); }
  reset() { this.data = {}; }
}

const local = new MockStorage();
global.chrome = { storage: { local } };

function loadModule() {
  const abs = path.join(__dirname, '..', '..', 'core', 'mode-boundary-intents.js');
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  return new Function(`${code}\nreturn { MODE_BOUNDARY_INTENTS_KEY, enqueueModeBoundaryIntent, getModeBoundaryIntents, drainModeBoundaryIntents, __resetModeBoundaryQueueForTest };`)();
}

function check(name, condition, details = '') {
  if (!condition) throw new Error(`${name}${details ? `: ${details}` : ''}`);
}

async function run() {
  const api = loadModule();

  local.reset();
  api.__resetModeBoundaryQueueForTest();
  const enqueue = await api.enqueueModeBoundaryIntent({
    id: 'intent-a',
    boundaryAtMs: 1000,
    fromMode: 'rest',
    toMode: 'study',
    reason: 'rest_to_study',
    source: 'auto_mode_transition',
  });
  check('enqueue stores intent', enqueue.queued === true);
  check('stored intent count is one', Object.keys(await api.getModeBoundaryIntents()).length === 1);

  const same = await api.enqueueModeBoundaryIntent({
    boundaryAtMs: 2000,
    fromMode: 'study',
    toMode: 'study',
  });
  check('same-mode intent is skipped', same.skipped === 'same_mode');

  const processed = [];
  const drain = await api.drainModeBoundaryIntents(async (intent) => {
    processed.push(intent.id);
    return { ok: true };
  });
  check('drain processes queued intent', drain.processed === 1 && processed[0] === 'intent-a', JSON.stringify(drain));
  check('successful drain removes intent', Object.keys(await api.getModeBoundaryIntents()).length === 0);

  await api.enqueueModeBoundaryIntent({ id: 'intent-b', boundaryAtMs: 3000, fromMode: 'rest', toMode: 'composite' });
  const failed = await api.drainModeBoundaryIntents(async () => {
    throw new Error('processor failed');
  });
  check('failed drain reports failure', failed.ok === false && failed.failures.length === 1, JSON.stringify(failed));
  check('failed drain keeps intent', Object.keys(await api.getModeBoundaryIntents()).length === 1);

  local.reset();
  api.__resetModeBoundaryQueueForTest();
  await api.enqueueModeBoundaryIntent({ id: 'intent-c', boundaryAtMs: 4000, fromMode: 'study', toMode: 'rest' });
  const okFalse = await api.drainModeBoundaryIntents(async () => ({ ok: false, reason: 'media_failed' }));
  check('ok false drain reports failure', okFalse.ok === false && okFalse.failures[0]?.error === 'media_failed', JSON.stringify(okFalse));
  check('ok false drain keeps intent', Object.keys(await api.getModeBoundaryIntents()).length === 1);

  console.log('[Mode Boundary Intents] 9/9 passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

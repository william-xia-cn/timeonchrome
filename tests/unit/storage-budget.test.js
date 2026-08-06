// storage-budget.test.js
// Run with: node tests/unit/storage-budget.test.js

'use strict';

const fs = require('fs');
const path = require('path');

class MockStorage {
  constructor() { this.data = {}; }
  reset() { this.data = {}; }
  async get(keys) {
    if (keys == null) return { ...this.data };
    if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, this.data[key]]));
    if (typeof keys === 'string') return { [keys]: this.data[keys] };
    return {};
  }
  async set(items) { Object.assign(this.data, items); }
  async getBytesInUse(keys = null) {
    const selected = keys == null
      ? this.data
      : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, this.data[key]]));
    return new TextEncoder().encode(JSON.stringify(selected)).length;
  }
}

const local = new MockStorage();
global.chrome = { storage: { local } };

function loadModule() {
  const file = path.join(__dirname, '..', '..', 'extension', 'infra', 'storage-budget.js');
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  return new Function(`${code}\nreturn { budgetedLocalSet, runStorageMutation, withStorageBudgetBypass, registerStoragePressureHandler, getStorageBudgetStatus, STORAGE_PRESSURE_BYTES, STORAGE_TARGET_BYTES, STORAGE_HARD_LIMIT_BYTES, STORAGE_EMERGENCY_RESERVE_BYTES };`)();
}

const budget = loadModule();
function check(label, condition, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
}

async function run() {
  local.reset();
  let maintenanceCalls = 0;
  budget.registerStoragePressureHandler(async (options) => {
    maintenanceCalls++;
    await budget.withStorageBudgetBypass(
      (storageBypassToken) => budget.budgetedLocalSet(
        { filler: 'x'.repeat(5 * 1024 * 1024) },
        { priority: 'critical', source: 'unit_maintenance', storageBypassToken }
      ),
      options.storageBypassToken
    );
  });
  await local.set({ filler: 'x'.repeat(Math.floor(6.95 * 1024 * 1024)) });
  await budget.budgetedLocalSet({ ledger: 'y'.repeat(256 * 1024) }, { priority: 'ledger', source: 'unit_pressure' });
  check('projected 7MB write triggers maintenance', maintenanceCalls === 1, String(maintenanceCalls));
  check('pressure write remains below hard limit', (await local.getBytesInUse()) < budget.STORAGE_HARD_LIMIT_BYTES);

  local.reset();
  budget.registerStoragePressureHandler(async () => {});
  await local.set({ filler: 'x'.repeat(Math.floor(7.9 * 1024 * 1024)) });
  let rejected = false;
  try {
    await budget.budgetedLocalSet({ ledger: 'z'.repeat(256 * 1024) }, { priority: 'ledger', source: 'unit_hard_limit' });
  } catch (error) {
    rejected = error.code === 'storage_hard_limit';
  }
  check('hard-limit write is rejected before persistence', rejected);
  check('rejected write is absent', local.data.ledger == null);
  check('rejected write never crosses 8MB', (await local.getBytesInUse()) < budget.STORAGE_HARD_LIMIT_BYTES);

  local.reset();
  budget.registerStoragePressureHandler(async () => {
    await local.set({ filler: 'x'.repeat(5 * 1024 * 1024) });
  });
  await local.set({ filler: 'x'.repeat(Math.floor(6.8 * 1024 * 1024)) });
  await Promise.all([
    budget.budgetedLocalSet({ a: 'a'.repeat(400 * 1024) }, { priority: 'ledger', source: 'concurrent_a' }),
    budget.budgetedLocalSet({ b: 'b'.repeat(400 * 1024) }, { priority: 'ledger', source: 'concurrent_b' }),
  ]);
  check('serialized concurrent writes both persist', Boolean(local.data.a && local.data.b));
  check('serialized concurrent writes stay below hard limit', (await local.getBytesInUse()) < budget.STORAGE_HARD_LIMIT_BYTES);

  local.reset();
  budget.registerStoragePressureHandler(async () => {});
  await local.set({ filler: 'x'.repeat(Math.floor(7.1 * 1024 * 1024)) });
  const diagnostic = await budget.budgetedLocalSet({ trace: 'debug' }, { priority: 'diagnostic', source: 'diagnostic_drop' });
  check('diagnostic growth is skipped during pressure', diagnostic.skipped === 'storage_pressure');
  check('skipped diagnostic is absent', local.data.trace == null);

  local.reset();
  const order = [];
  let releaseBlocker;
  const blockerGate = new Promise((resolve) => { releaseBlocker = resolve; });
  const blocker = budget.runStorageMutation(async () => {
    order.push('blocker');
    await blockerGate;
  }, { priority: 'derived' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const diagnosticTask = budget.runStorageMutation(async () => { order.push('diagnostic'); }, { priority: 'diagnostic' });
  const foregroundTask = budget.runStorageMutation(async () => { order.push('foreground'); }, { priority: 'foreground' });
  releaseBlocker();
  await Promise.all([blocker, diagnosticTask, foregroundTask]);
  check('foreground mutation overtakes queued diagnostic work', order.join(',') === 'blocker,foreground,diagnostic', order.join(','));

  console.log('[Storage Budget] 11/11 passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
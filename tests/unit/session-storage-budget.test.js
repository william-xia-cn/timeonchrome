// session-storage-budget.test.js
// Run with: node tests/unit/session-storage-budget.test.js

'use strict';

const fs = require('fs');
const path = require('path');

class MockSessionStorage {
  constructor() {
    this.data = {};
    this.removals = [];
    this.failNextSet = false;
  }

  async get(keys) {
    if (keys == null) return { ...this.data };
    const list = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(list.map((key) => [key, this.data[key]]));
  }

  async set(items) {
    if (this.failNextSet) {
      this.failNextSet = false;
      throw new Error('QUOTA_BYTES quota exceeded');
    }
    Object.assign(this.data, items);
  }

  async remove(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      this.removals.push(key);
      delete this.data[key];
    }
  }

  async getBytesInUse(keys = null) {
    const selected = keys == null
      ? this.data
      : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, this.data[key]]));
    return new TextEncoder().encode(JSON.stringify(selected)).length;
  }
}

const session = new MockSessionStorage();
global.chrome = { storage: { session } };

function loadBudget() {
  const file = path.join(__dirname, '..', '..', 'extension', 'infra', 'session-storage-budget.js');
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  return new Function(`${code}\nreturn { budgetedSessionSet, runSessionStorageMaintenance, getSessionStorageBudgetStatus, SESSION_STORAGE_PRESSURE_BYTES, SESSION_STORAGE_TARGET_BYTES, SESSION_STORAGE_HARD_LIMIT_BYTES };`)();
}

function check(label, condition, details = '') {
  if (!condition) throw new Error(`${label}${details ? `: ${details}` : ''}`);
}

async function run() {
  const budget = loadBudget();

  session.data = {
    session_v1: { state: 'ACTIVE', domain: 'study.example' },
    __timingTrace: 't'.repeat(3 * 1024 * 1024),
    debug_focus_ledger_v1: 'f'.repeat(1500 * 1024),
  };
  session.removals = [];
  const pressureResult = await budget.budgetedSessionSet(
    { mode_effect_trace_v1: ['new'] },
    { priority: 'diagnostic', source: 'unit_pressure' }
  );
  check('pressure write succeeds after cleanup', pressureResult.ok === true, JSON.stringify(pressureResult));
  check('timing trace is evicted first', session.removals[0] === '__timingTrace', session.removals.join(','));
  check('protected current session survives pressure cleanup', session.data.session_v1?.state === 'ACTIVE');
  check('maintenance reaches the target band', (await session.getBytesInUse(null)) <= budget.SESSION_STORAGE_TARGET_BYTES);

  session.data = { session_v1: { payload: 's'.repeat(Math.floor(5.95 * 1024 * 1024)) } };
  session.removals = [];
  const dropped = await budget.budgetedSessionSet(
    { client_logs_session_v1: 'i'.repeat(128 * 1024) },
    { priority: 'diagnostic', source: 'unit_hard_limit' }
  );
  check('diagnostic is dropped before crossing hard limit', dropped.ok === false && dropped.skipped === 'session_diagnostic_dropped', JSON.stringify(dropped));
  check('dropped diagnostic is not persisted', session.data.client_logs_session_v1 == null);
  check('hard-limit cleanup never deletes current session', session.data.session_v1 != null);

  session.data = {
    session_v1: { state: 'ACTIVE', domain: 'old.example' },
    __timingTrace: 't'.repeat(5 * 1024 * 1024),
  };
  session.removals = [];
  session.failNextSet = true;
  const businessResult = await budget.budgetedSessionSet(
    { session_v1: { state: 'ACTIVE', domain: 'new.example' } },
    { priority: 'business', source: 'unit_business_retry' }
  );
  check('business session retries after quota failure', businessResult.ok === true, JSON.stringify(businessResult));
  check('business retry preserves the newest current session', session.data.session_v1?.domain === 'new.example');
  check('business retry clears disposable diagnostics', !('__timingTrace' in session.data));

  const status = await budget.getSessionStorageBudgetStatus();
  check('status exposes independent session thresholds', status.pressureBytes === 4 * 1024 * 1024 && status.hardLimitBytes === 6 * 1024 * 1024, JSON.stringify(status));
  console.log('[Session Storage Budget] 12/12 passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

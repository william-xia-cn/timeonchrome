// storage-budget-wiring.test.js
// Run with: node tests/unit/storage-budget-wiring.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..', 'extension');
const guarded = [
  'core/usage-segments.js',
  'runtime/media-session.js',
  'infra/client-logs.js',
  'core/event-log.js',
  'core/timing-trace.js',
  'debug/focus-ledger.js',
  'product/mode-effects.js',
  'runtime/session.js',
  'infra/cloud-sync.js',
  'infra/storage.js',
];

let passed = 0;
for (const relative of guarded) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  if (!source.includes('storage-budget.js') || !source.includes('budgetedLocalSet')) {
    throw new Error(`${relative} does not use the storage budget gate`);
  }
  passed++;
}
const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
if (!background.includes('registerStoragePressureHandler((options) => runV1StorageMaintenance(options))')) {
  throw new Error('background does not register the storage pressure handler');
}
passed++;
const maintenance = fs.readFileSync(path.join(root, 'infra', 'storage-maintenance.js'), 'utf8');
if (!maintenance.includes('withStorageBudgetBypass') || !maintenance.includes('storage_emergency_loss_v1')) {
  throw new Error('maintenance bypass or loss audit is missing');
}
passed++;
for (const relative of ['core/timing-trace.js', 'debug/focus-ledger.js', 'product/mode-effects.js']) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  if (!source.includes('session-storage-budget.js') || !source.includes('budgetedSessionSet')) {
    throw new Error(`${relative} does not use the session storage budget for transient diagnostics`);
  }
  passed++;
}
const clientLogs = fs.readFileSync(path.join(root, 'infra', 'client-logs.js'), 'utf8');
if (!clientLogs.includes("CLIENT_SESSION_LOGS_KEY = 'client_logs_session_v1'") || !clientLogs.includes('sessionStorageSet') || !clientLogs.includes('budgetedSessionSet')) {
  throw new Error('client info logs are not routed to session storage');
}
passed++;
const usage = fs.readFileSync(path.join(root, 'core', 'usage-segments.js'), 'utf8');
if (!usage.includes('usage_settlement_journal_v1') || !usage.includes('runUsageStorageMutation') || !usage.includes('reconcileUsageLedger')) {
  throw new Error('usage settlement journal or complete RMW coordinator is missing');
}
passed++;
const session = fs.readFileSync(path.join(root, 'runtime', 'session.js'), 'utf8');
if (!session.includes("reason: 'settlement_not_durable'") || !session.includes("durability: journalId ? 'journal' : 'rejected'")) {
  throw new Error('session durability gate is missing');
}
passed++;
if (!session.includes('budgetedSessionSet') || !session.includes('session_mirror_degraded') || session.includes('await chrome.storage.session.set({ [SESSION_KEY]: session })')) {
  throw new Error('durable session is not isolated from the volatile mirror');
}
passed++;
const budget = fs.readFileSync(path.join(root, 'infra', 'storage-budget.js'), 'utf8');
if (!budget.includes('storageBypassToken') || !budget.includes('PRIORITY_RANK') || !budget.includes('runStorageMutation')) {
  throw new Error('storage priority queue or scoped maintenance token is missing');
}
passed++;
const sessionBudget = fs.readFileSync(path.join(root, 'infra', 'session-storage-budget.js'), 'utf8');
if (!sessionBudget.includes('SESSION_STORAGE_HARD_LIMIT_BYTES') || !sessionBudget.includes('SESSION_STORAGE_DISPOSABLE_KEYS') || !sessionBudget.includes("SESSION_STORAGE_PROTECTED_KEYS = ['session_v1']")) {
  throw new Error('session storage hard limit or protected current session is missing');
}
passed++;
console.log(`[Storage Budget Wiring] ${passed}/${passed} passed`);

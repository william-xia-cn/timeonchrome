'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const calls = [];
const diagnostics = [];
const dependencies = {
  '../infra/access-diagnostics.js': { recordAccessDiagnostic: (...args) => diagnostics.push(args) },
  '../infra/storage.js': { getConfig: async () => ({ mode: 'study' }),
    getSession: async () => ({ currentMode: 'study' }), clearTemporaryCompositeDomains: async () => {} },
  '../infra/diagnostic-evidence.js': { recordQuotaDenial: () => {} },
  './mode-service.js': { commitModeChange: async () => ({}), normalizeMode: value => value || 'study' },
  './interceptor.js': { applyModeTransitionSideEffects: async () => {}, clearTabModeNotice: async () => {},
    redirectToReminder: async (...args) => { calls.push(args); }, sendNoticeForDecision: async () => ({}) },
  '../infra/storage-budget.js': { budgetedLocalSet: async () => {} },
  '../infra/session-storage-budget.js': { budgetedSessionSet: async () => {} },
  './rest-usage-reminder.js': { requestScheduleUsageConfirmation: async () => ({ ok: true }) },
  './schedule-confirmation.js': { hasScheduleConfirmation: async () => false,
    registerScheduleConfirmationWaiter: async () => false,
    releaseScheduleConfirmationWaiters: async () => {},
    resumeScheduleConfirmationWaiter: async () => false },
};
const moduleExports = {};
const source = fs.readFileSync(path.resolve(__dirname, '../../extension/product/mode-effects.js'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS,
} }).outputText, { exports: moduleExports, require: name => dependencies[name], chrome: {}, URL, Date, console });

(async () => {
  const admission = { ok: true, action: 'confirm', reasons: ['dailyComposite'] };
  const event = { url: 'https://wiki.example/page', tabId: 8 };
  const confirmed = await moduleExports.executeModeDecision({ access: 'forced_confirmation',
    domain: 'wiki.example', forcedAdmission: admission }, { tabId: 8, event,
    requestForcedUsePrompt: async input => {
      assert.equal(input.host, 'wiki.example');
      assert.equal(input.admission, admission);
      return { ok: true };
    } });
  assert.equal(confirmed.blocked, true);
  assert.equal(confirmed.confirmationPending, true);
  assert.equal(diagnostics.at(-1)[0], 'decision');
  assert.equal(diagnostics.at(-1)[1].confirmationPending, true);
  assert.match(diagnostics.at(-1)[1].auditId, /^access-/);
  assert.equal(calls.length, 0);
  const missing = await moduleExports.executeModeDecision({ access: 'forced_confirmation',
    domain: 'wiki.example', forcedAdmission: admission }, { tabId: 8, event });
  assert.equal(missing.blocked, true);
  assert.equal(calls.at(-1)[2], 'forced_use_confirmation_blocked');
  const allowed = await moduleExports.executeModeDecision({ access: 'allow', domain: 'wiki.example',
    forcedAdmission: { ...admission, action: 'allow' } }, { tabId: 8, event,
    ensureForcedUseGrant: async (_, host) => { assert.equal(host, 'wiki.example'); return { ok: true }; } });
  assert.equal(allowed.blocked, false);
  let retiredHost = null;
  const normal = await moduleExports.executeModeDecision({ access: 'allow', domain: 'wiki.example',
    forcedAdmission: { ok: true, action: 'allow', reasons: [] } }, { tabId: 8, event,
    retireForcedUseGrants: async host => { retiredHost = host; return { ok: true, retired: 1 }; } });
  assert.equal(normal.blocked, false);
  assert.equal(retiredHost, 'wiki.example');
  const unclosed = await moduleExports.executeModeDecision({ access: 'allow', domain: 'wiki.example',
    forcedAdmission: { ok: true, action: 'allow', reasons: [] } }, { tabId: 8, event,
    retireForcedUseGrants: async () => ({ ok: false }) });
  assert.equal(unclosed.blocked, true);
  assert.equal(calls.at(-1)[2], 'accounting_unavailable');
  const denied = await moduleExports.executeModeDecision({ access: 'allow', domain: 'wiki.example',
    forcedAdmission: { ...admission, action: 'allow' } }, { tabId: 8, event,
    ensureForcedUseGrant: async () => ({ ok: false }) });
  assert.equal(denied.blocked, true);
  assert.equal(calls.at(-1)[2], 'accounting_unavailable');
  console.log('forced-use-mode-effects: passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

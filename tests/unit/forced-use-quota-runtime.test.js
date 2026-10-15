'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, dependencies = {}) {
  const exports = {};
  const source = fs.readFileSync(path.resolve(__dirname, '../../extension', relative), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS,
  } }).outputText, { exports, require: name => dependencies[name], chrome: global.chrome,
    Date, console });
  return exports;
}

global.chrome = { storage: { local: { remove: async () => {} } } };
const quotaConfig = load('core/quota-config.js');
const policy = load('core/forced-use-policy.js');
const facts = load('core/forced-use-quota-facts.js', { './quota-config.js': quotaConfig });
const cfg = { enabled: true, timeQuota: { accountingVersion: 2,
  daily: { thursday: { studyMinutes: 60, compositeMinutes: 90,
    restMinutes: 120, onlineMinutes: null } }, weekly: { restMinutes: 840 } },
  domainQuotas: { 'example.com': 30 }, forcedUsePolicyV1: {
    schemaVersion: 1, enabled: true, reminderIntervalMinutes: 30,
    advisoryWindowDailyMaxMinutes: null,
    quotaOverrunMinutes: { dailyStudy: 30, dailyComposite: 30,
      dailyRest: 30, dailyOnline: null, weeklyRest: 60, domain: 15 },
  } };
const usage = { studySeconds: 3600, compositeSeconds: 5400, restSeconds: 7200,
  totalSeconds: 16200, weekRestSeconds: 50400,
  domainSeconds: { 'example.com': 1800 } };
let shared = false;
const runtime = load('product/quota.js', {
  '../infra/storage.js': { getConfig: async () => cfg, saveConfig: async () => {} },
  '../stats/managed-statistics.js': { getQuotaUsageView: async () => usage },
  '../core/quota-config.js': quotaConfig,
  '../core/quota-read-model-v2.js': { readQuotaReadModelV2: async () => ({ ok: true,
    date: '2026-10-15', source: 'fixture', usage }) },
  '../core/forced-use-policy.js': policy,
  '../core/forced-use-quota-facts.js': facts,
  '../infra/client-logs.js': { logFallbackEventBestEffort: () => {} },
  '../infra/diagnostic-evidence.js': { rememberQuotaEvaluation: () => {} },
  './shared-access-runtime.js': { isSharedAccessRuntimeEnabled: () => shared,
    readSharedAccessRuntime: async () => ({}), projectSharedRuntimeQuota: () => ({
      ok: true, config: cfg, usage: { ...usage, ok: true,
        undeterminedMinutes: Math.floor(usage.compositeSeconds / 60),
        restMinutes: Math.floor(usage.restSeconds / 60),
        studyMinutes: Math.floor(usage.studySeconds / 60),
        totalMinutes: Math.floor(usage.totalSeconds / 60),
        weekRestMinutes: Math.floor(usage.weekRestSeconds / 60) } }) },
  '../core/quota-state-facts.js': { CLOUD_QUOTA_STATE_FACT_KEY: 'legacy',
    combineQuotaStates: () => ({}), getQuotaCalendarContext: () => ({
      date: '2026-10-15', weekStart: '2026-10-12' }),
    isCloudQuotaStateFactCurrent: () => false },
});

(async () => {
  const standard = await runtime.evaluateQuotaState();
  assert.equal(standard.newState.studyLocked, false);
  assert.equal(standard.newState.undeterminedLocked, false);
  assert.equal(standard.newState.restLocked, false);
  assert.equal(standard.lockedDomains.length, 0);
  usage.compositeSeconds = 7200;
  usage.domainSeconds['example.com'] = 2700;
  const final = await runtime.evaluateQuotaState();
  assert.equal(final.newState.undeterminedLocked, false);
  assert.equal(final.lockedDomains.length, 0);
  cfg.autonomyConfig = { quotaOverrunConfirmationRequired: false };
  const immediate = await runtime.evaluateQuotaState();
  assert.equal(immediate.newState.undeterminedLocked, true);
  assert.equal(immediate.lockedDomains[0], 'example.com');
  cfg.autonomyConfig.quotaOverrunConfirmationRequired = true;
  shared = true;
  usage.compositeSeconds = 5400;
  const oldShared = await runtime.evaluateQuotaState();
  assert.equal(oldShared.sharedRuntime, true);
  assert.equal(oldShared.newState.undeterminedLocked, true);
  console.log('forced-use-quota-runtime: passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.resolve(__dirname, '../../extension/core/forced-use-policy.js');
const moduleExports = {};
const load = (relative, dependencies = {}) => {
  const exports = {};
  const source = fs.readFileSync(path.resolve(__dirname, '../../extension/core', relative), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, require: name => dependencies[name] });
  return exports;
};
const quotaConfig = load('quota-config.js');
const quotaFacts = load('forced-use-quota-facts.js', { './quota-config.js': quotaConfig });
const reminderProgress = load('forced-use-reminder-progress.js');
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: moduleExports, require: name => ({
  './forced-use-quota-facts.js': quotaFacts,
  './forced-use-reminder-progress.js': reminderProgress,
})[name] });
const evaluateForcedUsePolicy = input => JSON.parse(JSON.stringify(moduleExports.evaluateForcedUsePolicy(input)));
const readForcedUsePolicy = input => JSON.parse(JSON.stringify(moduleExports.readForcedUsePolicy(input)));
const decide = input => JSON.parse(JSON.stringify(moduleExports.decideForcedUseAccess(input)));

const validPolicy = { schemaVersion: 1, enabled: true, reminderIntervalMinutes: 30,
  quotaOverrunMinutes: { dailyStudy: 0, dailyComposite: 60, dailyRest: 120,
    dailyOnline: null, weeklyRest: null, domain: 0 }, advisoryWindowDailyMaxMinutes: null };
assert.deepEqual(readForcedUsePolicy({}), { enabled: false, reason: 'legacy_profile' });
assert.deepEqual(readForcedUsePolicy({ forcedUsePolicyV1: validPolicy }), validPolicy);
for (const malformed of [
  { ...validPolicy, enabled: 'true' },
  { ...validPolicy, reminderIntervalMinutes: 0 },
  { ...validPolicy, quotaOverrunMinutes: { ...validPolicy.quotaOverrunMinutes, weeklyRest: -1 } },
  { ...validPolicy, quotaOverrunMinutes: { ...validPolicy.quotaOverrunMinutes, domain: 10081 } },
  { ...validPolicy, advisoryWindowDailyMaxMinutes: 0 },
  { ...validPolicy, unexpected: true },
]) assert.deepEqual(readForcedUsePolicy({ forcedUsePolicyV1: malformed }),
  { enabled: false, reason: 'invalid_policy' });

const daily = { id: 'daily_rest', usedSeconds: 4 * 3600, limitSeconds: 4 * 3600, overrunSeconds: 2 * 3600 };
const weekly = { id: 'weekly_rest', usedSeconds: 14 * 3600, limitSeconds: 14 * 3600, overrunSeconds: null };
assert.deepEqual(evaluateForcedUsePolicy({ quotas: [daily, weekly], entryConfirmationRequired: true }), {
  action: 'confirm', kind: 'entry', reasons: ['daily_rest', 'weekly_rest'],
});
assert.deepEqual(evaluateForcedUsePolicy({ quotas: [daily, weekly], forcedUsageSeconds: 1800,
  lastReminderUsageSeconds: 0 }), { action: 'confirm', kind: 'repeat', reasons: ['daily_rest', 'weekly_rest'] });
assert.deepEqual(evaluateForcedUsePolicy({ quotas: [daily, weekly], forcedUsageSeconds: 1000,
  lastReminderUsageSeconds: 0 }), { action: 'allow', reasons: ['daily_rest', 'weekly_rest'] });
assert.deepEqual(evaluateForcedUsePolicy({ quotas: [{ ...daily, usedSeconds: 6 * 3600 }],
  forcedUsageSeconds: 100, lastReminderUsageSeconds: 0 }), { action: 'block', reasons: ['daily_rest'] });
assert.deepEqual(evaluateForcedUsePolicy({ quotas: [{ id: 'study', usedSeconds: 3600, limitSeconds: 3600 }] }),
  { action: 'block', reasons: ['study'] });
assert.deepEqual(evaluateForcedUsePolicy({ quotas: [{ ...daily, overrunSeconds: null, usedSeconds: 9 * 3600 }],
  forcedUsageSeconds: 1800, lastReminderUsageSeconds: 0 }), {
  action: 'confirm', kind: 'repeat', reasons: ['daily_rest'],
});
assert.deepEqual(evaluateForcedUsePolicy({ quotas: [daily], absoluteBlocks: ['downtime'],
  forcedUsageSeconds: 1800, lastReminderUsageSeconds: 0 }), { action: 'block', reasons: ['downtime'] });
assert.deepEqual(evaluateForcedUsePolicy({ advisoryWindow: { id: 'schedule', active: true,
  usedSeconds: 1200, maxSeconds: 3600 }, quotas: [daily], forcedUsageSeconds: 1800,
  lastReminderUsageSeconds: 0 }), {
  action: 'confirm', kind: 'repeat', reasons: ['daily_rest', 'schedule'],
});
assert.deepEqual(evaluateForcedUsePolicy({ advisoryWindow: { id: 'schedule', active: true,
  usedSeconds: 3600, maxSeconds: 3600 }, quotas: [daily], forcedUsageSeconds: 0,
  lastReminderUsageSeconds: null }), { action: 'block', reasons: ['schedule'] });
const admission = { policy: validPolicy, quotaFacts: { ok: true, quotas: [
  { id: 'dailyComposite', usedSeconds: 5400, limitSeconds: 5400, overrunSeconds: 3600 },
  { id: 'dailyRest', usedSeconds: 7200, limitSeconds: 7200, overrunSeconds: 7200 },
  { id: 'weeklyRest', usedSeconds: 840 * 60, limitSeconds: 840 * 60, overrunSeconds: null },
] }, quotaBucket: 'composite', advisoryWindow: { id: 'advisoryWindow', active: true,
  usedSeconds: 1200, maxSeconds: null }, identityKey: 'profile|device',
  dateKey: '2026-10-15', ruleKey: 'wiki', forcedUsageSeconds: 600 };
const firstDecision = decide(admission);
assert.equal(firstDecision.action, 'confirm');
assert.equal(firstDecision.kind, 'entry');
assert.deepEqual(firstDecision.reasons, ['dailyComposite', 'advisoryWindow']);
const accepted = reminderProgress.acknowledgeForcedUseReminderProgress(null, firstDecision.progress);
assert.equal(accepted.ok, true);
assert.equal(decide({ ...admission, reminderState: accepted.state, forcedUsageSeconds: 2399 }).action, 'allow');
assert.equal(decide({ ...admission, reminderState: accepted.state, forcedUsageSeconds: 2400 }).kind, 'repeat');
assert.equal(decide({ ...admission, reminderState: accepted.state, ruleKey: 'another-site',
  forcedUsageSeconds: 700 }).action, 'confirm');
assert.deepEqual(decide({ ...admission, quotaFacts: { ok: true, quotas: [
  { id: 'dailyComposite', usedSeconds: 9000, limitSeconds: 5400, overrunSeconds: 3600 },
] }, reminderState: accepted.state }).reasons, ['dailyComposite']);
assert.equal(decide({ ...admission, quotaFacts: { ok: true, quotas: [
  { id: 'dailyComposite', usedSeconds: 9000, limitSeconds: 5400, overrunSeconds: 3600 },
] }, reminderState: accepted.state }).action, 'block');
assert.equal(decide({ ...admission, absoluteBlocks: ['downtime'] }).action, 'block');
assert.deepEqual(decide({ ...admission, absoluteBlocks: ['downtime', 'downtime'],
  quotaFacts: { ok: false } }).reasons, ['downtime']);
assert.equal(decide({ ...admission, quotaFacts: { ok: false }, reminderState: accepted.state }).action, 'block');
assert.deepEqual(decide({ ...admission, advisoryWindow: { id: 'advisoryWindow', active: true,
  usedSeconds: NaN, maxSeconds: null } }).reasons, ['forced_use_evidence_unavailable']);
assert.deepEqual(decide({ ...admission, quotaFacts: { ok: true, quotas: [
  { id: 'dailyComposite', usedSeconds: NaN, limitSeconds: 5400, overrunSeconds: 3600 },
] } }).reasons, ['forced_use_evidence_unavailable']);
assert.equal(decide({ ...admission, policy: { ...validPolicy, reminderIntervalMinutes: 0 } }).action, 'block');
const compositeConfig = { timeQuota: { daily: { thursday: { studyMinutes: 60,
  compositeMinutes: 90, restMinutes: 120, onlineMinutes: null } },
  weekly: { restMinutes: 840 } }, domainQuotas: {} };
const compositeUsage = { ok: true, studySeconds: 0, compositeSeconds: 5400,
  restSeconds: 7200, totalSeconds: 12600, weekRestSeconds: 840 * 60, domainSeconds: {} };
const compositeFacts = quotaFacts.buildForcedUseQuotaFacts(compositeConfig, compositeUsage,
  validPolicy, { date: '2026-10-15', domain: 'wiki.example' });
const compositeEntry = decide({ ...admission, quotaFacts: compositeFacts, advisoryWindow: null });
assert.equal(compositeEntry.action, 'confirm');
assert.deepEqual(compositeEntry.reasons, ['dailyComposite']);
const compositeFinal = decide({ ...admission, quotaFacts: quotaFacts.buildForcedUseQuotaFacts(
  compositeConfig, { ...compositeUsage, compositeSeconds: 9000 }, validPolicy,
  { date: '2026-10-15', domain: 'wiki.example' }), advisoryWindow: null });
assert.equal(compositeFinal.action, 'block');
assert.deepEqual(compositeFinal.reasons, ['dailyComposite']);
console.log('forced-use-policy: passed');

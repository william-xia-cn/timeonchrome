'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, dependencies = {}) {
  const exports = {};
  const source = fs.readFileSync(path.resolve(__dirname, '../../extension/core', relative), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, require: name => {
    if (!Object.hasOwn(dependencies, name)) throw new Error(`Missing dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}

const quotaConfig = load('quota-config.js');
const quotaFacts = load('forced-use-quota-facts.js', { './quota-config.js': quotaConfig });
const progress = load('forced-use-reminder-progress.js');
const policy = load('forced-use-policy.js', {
  './forced-use-quota-facts.js': quotaFacts,
  './forced-use-reminder-progress.js': progress,
});
const admission = load('forced-use-admission.js', {
  './forced-use-policy.js': policy,
  './forced-use-quota-facts.js': quotaFacts,
  './forced-use-reminder-progress.js': progress,
});
const plain = value => JSON.parse(JSON.stringify(value));
const forcedUsePolicyV1 = { schemaVersion: 1, enabled: true, reminderIntervalMinutes: 30,
  quotaOverrunMinutes: { dailyStudy: 0, dailyComposite: 60, dailyRest: 0,
    dailyOnline: null, weeklyRest: null, domain: 0 }, advisoryWindowDailyMaxMinutes: null };
const config = { forcedUsePolicyV1, timeQuota: { daily: { thursday: { studyMinutes: 60,
  compositeMinutes: 90, restMinutes: 120, onlineMinutes: null } },
  weekly: { restMinutes: 840 } }, domainQuotas: {} };
const usage = { ok: true, studySeconds: 0, compositeSeconds: 5399,
  restSeconds: 7200, totalSeconds: 12599, weekRestSeconds: 840 * 60, domainSeconds: {} };
const input = { config, usage, dateKey: '2026-10-15', domain: 'wiki.example',
  quotaBucket: 'composite', identityKey: 'profile|device', ruleKey: 'wiki', forcedUsageSeconds: null };

assert.equal(admission.prepareForcedUseAdmission({ ...input, config: { ...config, forcedUsePolicyV1: undefined } }).action, 'legacy');
assert.equal(admission.prepareForcedUseAdmission(input).action, 'allow');
const due = plain(admission.prepareForcedUseAdmission({ ...input,
  usage: { ...usage, compositeSeconds: 5400 }, forcedUsageSeconds: 0 }));
assert.equal(due.action, 'confirm');
assert.equal(due.kind, 'entry');
assert.deepEqual(due.reasons, ['dailyComposite']);
const accepted = plain(admission.confirmForcedUseAdmission(due, due, null));
assert.equal(accepted.ok, true);
assert.equal(admission.prepareForcedUseAdmission({ ...input, usage: { ...usage, compositeSeconds: 5500 },
  forcedUsageSeconds: 100, reminderState: accepted.state }).action, 'allow');
const repeat = plain(admission.prepareForcedUseAdmission({ ...input, usage: { ...usage, compositeSeconds: 7200 },
  forcedUsageSeconds: 1800, reminderState: accepted.state }));
assert.equal(repeat.kind, 'repeat');
assert.equal(admission.prepareForcedUseAdmission({ ...input, usage: { ...usage, compositeSeconds: 9000 },
  forcedUsageSeconds: 3600, reminderState: accepted.state }).action, 'block');
assert.equal(admission.prepareForcedUseAdmission({ ...input, usage: { ok: false },
  absoluteBlocks: ['downtime'] }).reasons[0], 'downtime');
assert.equal(admission.prepareForcedUseAdmission({ ...input, usage: { ok: false } }).action, 'block');
const latest = plain(admission.prepareForcedUseAdmission({ ...input, usage: { ...usage, compositeSeconds: 5500 },
  forcedUsageSeconds: 100 }));
assert.equal(admission.confirmForcedUseAdmission(due, { ...latest, identityKey: 'other|device' }, null).ok, false);
assert.equal(admission.confirmForcedUseAdmission(due, { ...latest, dateKey: '2026-10-16' }, null).ok, false);
assert.equal(admission.confirmForcedUseAdmission(due, { ...latest, ruleKey: 'another-site' }, null).ok, false);
assert.equal(admission.confirmForcedUseAdmission(due, { ...latest, reasons: ['dailyComposite', 'advisoryWindow'] }, null).ok, false);
assert.equal(admission.confirmForcedUseAdmission(due, { ...latest,
  policySignature: 'changed-config' }, null).ok, false);
assert.equal(admission.confirmForcedUseAdmission(due, { ...latest, action: 'block' }, null).ok, false);
assert.equal(admission.confirmForcedUseAdmission(due, latest, null).ok, true);
console.log('forced-use-admission: passed');

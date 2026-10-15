'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const moduleExports = {};
const file = path.resolve(__dirname, '../../extension/core/forced-use-reminder-progress.js');
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: moduleExports });
const evaluate = input => JSON.parse(JSON.stringify(moduleExports.evaluateForcedUseReminderProgress(input)));
const acknowledge = (state, decision) => JSON.parse(JSON.stringify(
  moduleExports.acknowledgeForcedUseReminderProgress(state, decision)));
const base = { identityKey: 'profile|device', dateKey: '2026-10-15', ruleKey: 'site-rule-a',
  reasons: ['dailyRest', 'advisoryWindow', 'dailyRest'], forcedUsageSeconds: 600, intervalMinutes: 30 };

const first = evaluate(base);
assert.equal(first.action, 'entry');
assert.deepEqual(first.reasons, ['advisoryWindow', 'dailyRest']);
const acknowledged = acknowledge(null, first);
assert.equal(acknowledged.ok, true);
let state = acknowledged.state;
assert.equal(state.lastAcknowledgedUsageSeconds, 600);
assert.equal(evaluate({ ...base, state, forcedUsageSeconds: 2399 }).action, 'none');
const repeat = evaluate({ ...base, state, forcedUsageSeconds: 2400 });
assert.equal(repeat.action, 'repeat');
state = acknowledge(state, repeat).state;
assert.equal(state.lastAcknowledgedUsageSeconds, 2400);

const newRule = evaluate({ ...base, state, ruleKey: 'site-rule-b', forcedUsageSeconds: 2500 });
assert.equal(newRule.action, 'entry');
state = acknowledge(state, newRule).state;
assert.equal(state.lastAcknowledgedUsageSeconds, 2500);
const newReason = evaluate({ ...base, state, reasons: ['dailyRest', 'weeklyRest'], forcedUsageSeconds: 2550 });
assert.equal(newReason.action, 'entry');
assert.deepEqual(newReason.newReasons, ['weeklyRest']);
assert.equal(acknowledge(state, newReason).state.lastAcknowledgedUsageSeconds, 2550);
assert.equal(acknowledge(state, repeat).reason, 'reminder_ack_stale');
assert.equal(acknowledge(state, { ...first, identityKey: 'other-profile|device' }).reason, 'reminder_ack_stale');
assert.equal(acknowledge(state, { ...first, dateKey: '2026-10-16' }).reason, 'reminder_ack_stale');
assert.equal(evaluate({ ...base, state, forcedUsageSeconds: 2499 }).reason, 'reminder_usage_regressed');
assert.equal(evaluate({ ...base, state, forcedUsageSeconds: NaN }).ok, false);
assert.equal(evaluate({ ...base, state, intervalMinutes: 0 }).ok, false);
assert.equal(evaluate({ ...base, state: { ...state, grants: [] } }).ok, false);
assert.equal(evaluate({ ...base, state, dateKey: '2026-10-16', forcedUsageSeconds: 0 }).action, 'entry');
assert.equal(evaluate({ ...base, state, identityKey: 'other-profile|device', forcedUsageSeconds: 0 }).action, 'entry');
console.log('forced-use-reminder-progress: passed');

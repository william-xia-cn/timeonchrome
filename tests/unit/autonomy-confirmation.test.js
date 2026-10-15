'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function load(file) {
  const exports = {};
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, Date, URL, require: name => load(path.resolve(path.dirname(file), name)) });
  return exports;
}
const helper = load(path.join(root, 'extension/core/autonomy-confirmation.js'));
process.env.TZ = 'Asia/Shanghai';
const at = Date.parse('2026-10-15T02:00:00+08:00');
const window = [{ start: '07:00', end: '22:00' }];
const config = { autonomyConfig: { timeWindowAdvisoryEnabled: true }, timeWindows: { daily: Object.fromEntries(
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => [day, {
    studyWindows: window, compositeWindows: window, restWindows: window }])) } };
for (const [classification, mode] of [['study', 'study'], ['composite', 'composite'], ['pending_composite', 'composite'],
  ['unclassified', 'composite'], ['restricted', 'rest'], ['rejected', 'rest']]) {
  const context = helper.scheduleConfirmationContext(config, classification, 7, 'https://example.test/a', at);
  assert.equal(context.mode, mode);
  assert.equal(context.end, Date.parse('2026-10-15T07:00:00+08:00'));
  assert.equal(context.key, helper.scheduleConfirmationContext(config, classification, 7, 'https://example.test/b', at + 60000).key);
  assert.equal(context.key, helper.scheduleConfirmationContext(config, classification, 7, 'https://example.test/b', Date.parse('2026-10-14T23:59:00+08:00')).key);
  assert.notEqual(context.key, helper.scheduleConfirmationContext(config, classification, 7, 'https://other.test/', at).key);
}
const list = { source: 'customRestrictedSites', pattern: 'example.test' };
const listed = helper.scheduleConfirmationContext(config, 'restricted', 7, 'https://a.example.test/', at, list);
assert.equal(listed.key, helper.scheduleConfirmationContext(config, 'restricted', 8, 'https://b.example.test/', at, list).key);
assert.notEqual(listed.key, helper.scheduleConfirmationContext(config, 'restricted', 8, 'https://b.example.test/', at,
  { source: 'customRestrictedSites', pattern: 'b.example.test' }).key);
const rule = { source: 'siteClassificationRulesV1', rule: { id: 'one', targetType: 'host', normalizedValue: 'example.test', decision: 'restricted' } };
const ruled = helper.scheduleConfirmationContext(config, 'restricted', 7, 'https://a.example.test/', at, rule);
assert.equal(ruled.key, helper.scheduleConfirmationContext(config, 'restricted', 8, 'https://b.example.test/', at, rule).key);
assert.notEqual(ruled.key, helper.scheduleConfirmationContext(config, 'restricted', 8, 'https://b.example.test/', at,
  { ...rule, rule: { ...rule.rule, id: 'two' } }).key);
assert.notEqual(ruled.key, helper.scheduleConfirmationContext(config, 'restricted', 8, 'https://b.example.test/', at,
  { ...rule, rule: { ...rule.rule, decision: 'rejected' } }).key);
const request = { source: 'site_classification_request', request: { id: 'pending-1', status: 'pending', requestedTargetType: 'host', requestedNormalizedValue: 'example.test' } };
assert.equal(helper.scheduleConfirmationContext(config, 'pending_composite', 7, 'https://a.example.test/', at, request).key,
  helper.scheduleConfirmationContext(config, 'pending_composite', 8, 'https://b.example.test/', at, request).key);
assert.equal(helper.scheduleConfirmationContext(config, 'pending_composite', 7, 'https://a.example.test/', at, request).key,
  helper.scheduleConfirmationContext(config, 'pending_composite', 8, 'https://b.example.test/', at,
    { ...request, source: 'unclassified_site_access_record' }).key);
assert.notEqual(listed.key, helper.scheduleConfirmationContext(config, 'restricted', 8, 'https://b.example.test/', at + 24 * 3600000, list).key);
assert.notEqual(listed.key, helper.scheduleConfirmationContext({ ...config, schedule: { revision: 2 } }, 'restricted', 8,
  'https://b.example.test/', at, list).key);
assert.equal(helper.scheduleConfirmationContext({}, 'restricted', 7, 'https://example.test', at), null);
assert.equal(helper.scheduleConfirmationContext(config, 'other', 7, 'https://example.test', at), null);
assert.equal(helper.scheduleConfirmationContext(config, 'restricted', 7, 'https://example.test', at + 6 * 3600000), null);
assert.equal(helper.isAutonomyConfirmationText('强行使用'), true);
for (const value of ['', '强行', ' 强行使用', '强行使用 ', '适合使用', null]) assert.equal(helper.isAutonomyConfirmationText(value), false);
assert.equal(helper.scheduleReminderIntervalMinutes({}), 30);
assert.equal(helper.scheduleReminderIntervalMinutes({ autonomyConfig: { scheduleReminderIntervalMinutes: 1 } }), 1);
assert.equal(helper.scheduleReminderIntervalMinutes({ autonomyConfig: { scheduleReminderIntervalMinutes: 1440 } }), 1440);
for (const value of [0, 1441, 1.5, '30']) assert.equal(helper.scheduleReminderIntervalMinutes({ autonomyConfig: { scheduleReminderIntervalMinutes: value } }), 30);
const grant = { at: 1000, host: 'example.test', managedTargetId: 'target-1' };
const segments = [
  { channel: 'active', startMs: 0, endMs: 2000, durationSeconds: 2, managedTargetId: 'target-1' },
  { channel: 'active', startMs: 2000, endMs: 4000, durationSeconds: 2, managedTargetId: 'target-1' },
  { channel: 'backgroundMedia', startMs: 2000, endMs: 4000, durationSeconds: 200, managedTargetId: 'target-1' },
  { channel: 'active', startMs: 2000, endMs: 4000, durationSeconds: 200, managedTargetId: 'other-target' },
];
assert.equal(helper.confirmedScheduleUsageSeconds(segments, grant, 4000), 3);
assert.equal(helper.confirmedScheduleUsageSeconds(segments, { ...grant, managedTargetId: null }, 4000), 0);
assert.equal(helper.confirmedScheduleUsageSeconds(segments, { ...grant, scope: '["profile-1","device-1"]' }, 4000), 0);
assert.equal(helper.softReminderRepeatMinutes(0), 60);
assert.equal(helper.softReminderRepeatMinutes(1), 30);
assert.equal(helper.softReminderRepeatMinutes(20), 30);
console.log('Autonomy confirmation: types/gaps/rules/cross-tab/config/midnight/object/disabled/text/60-30 cadence PASS');

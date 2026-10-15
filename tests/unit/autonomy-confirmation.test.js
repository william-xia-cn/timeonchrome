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
assert.equal(helper.scheduleConfirmationContext({}, 'restricted', 7, 'https://example.test', at), null);
assert.equal(helper.scheduleConfirmationContext(config, 'other', 7, 'https://example.test', at), null);
assert.equal(helper.scheduleConfirmationContext(config, 'restricted', 7, 'https://example.test', at + 6 * 3600000), null);
assert.equal(helper.isAutonomyConfirmationText('适合使用'), true);
for (const value of ['', '适合', ' 适合使用', '适合使用 ', null]) assert.equal(helper.isAutonomyConfirmationText(value), false);
assert.equal(helper.softReminderRepeatMinutes(0), 60);
assert.equal(helper.softReminderRepeatMinutes(1), 30);
assert.equal(helper.softReminderRepeatMinutes(20), 30);
console.log('Autonomy confirmation: types/gaps/midnight/object/disabled/text/60-30 cadence PASS');

'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const text = fs.readFileSync('extension/admin/admin.js', 'utf8');
const source = ts.createSourceFile('admin.js', text, ts.ScriptTarget.Latest, true);
const names = ['getAdminRestReminderView', 'getAdminAutonomyView', 'renderAutonomySection'];
const selected = source.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text));
assert.equal(selected.length, 3);
const nodes = {};
const context = vm.createContext({ config: {}, formatQuotaText: value => `${value}min`,
  document: { getElementById: id => nodes[id] ||= {} } });
vm.runInContext(selected.map(n => n.getText(source)).join('\n'), context);
for (const value of [undefined, 840, 1, 10080]) {
  context.config = { restConfig: { weeklyFirstReminderMinutes: value } };
  const view = context.getAdminRestReminderView();
  assert.equal(view.weeklyEnabled, true);
  assert.equal(view.weeklyMinutes, value ?? 840);
}
for (const value of [0, 10081, 1.5, '840']) {
  context.config = { restConfig: { weeklyFirstReminderMinutes: value } };
  assert.equal(context.getAdminRestReminderView().weeklyMinutes, 840);
}
context.config = { restConfig: { firstReminderMinutes: null, weeklyFirstReminderMinutes: 840 } };
context.renderAutonomySection();
const output = Object.values(nodes).map(n => n.innerHTML || '').join('');
assert.ok(output.includes('840min') && output.includes('本周休息软配额'));
assert.ok(!/<(?:input|button|select)\b/.test(output));
context.config = { restConfig: { weeklyFirstReminderMinutes: null } };
assert.equal(context.getAdminRestReminderView().weeklyEnabled, false);
assert.ok(fs.readFileSync('extension/infra/storage.js', 'utf8').includes('weeklyFirstReminderMinutes: 840'));
const background = fs.readFileSync('extension/background.js', 'utf8');
assert.ok(background.includes("source: 'soft_reminder_continue_check'"));
console.log('Rest weekly terminal defaults, bounds, Admin read-only and hard-routing wiring: PASS');

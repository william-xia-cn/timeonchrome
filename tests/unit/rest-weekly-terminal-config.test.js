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
  readForcedUsePolicy: cfg => cfg.forcedUsePolicyV1 || ({ enabled: false }),
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
assert(output.includes('强制模式'));
context.config.autonomyConfig = { timeWindowAdvisoryEnabled: true, softReminderTimeoutAction: 'continue', scheduleReminderIntervalMinutes: 45 };
context.renderAutonomySection();
assert(Object.values(nodes).some(node => node.innerHTML?.includes('建议模式：文字确认')));
assert(Object.values(nodes).some(node => node.innerHTML?.includes('45分钟网页用量')));
assert(Object.values(nodes).some(node => node.innerHTML?.includes('60秒未确认强制阻断')));
assert.ok(output.includes('840min') && output.includes('本周休息独立提醒线'));
assert.ok(output.includes('<details><summary>旧配置记录'));
assert.ok(!output.includes('<details open'));
assert.ok(!/<(?:input|button|select)\b/.test(output));
context.config = { timeQuota: { accountingVersion: 1 }, forcedUsePolicyV1: { enabled: true, reminderIntervalMinutes: 30 } };
context.renderAutonomySection();
assert.ok(nodes['rules-autonomy-summary-display'].innerHTML.includes('需要V2配额计算'));
context.config.timeQuota.accountingVersion = 2;
context.renderAutonomySection();
assert.ok(nodes['rules-autonomy-summary-display'].innerHTML.includes('新增30分钟网页用量'));
assert.ok(!nodes['rules-rest-reminder-display'].innerHTML.includes('<details>'));
assert.ok(nodes['rules-rest-reminder-display'].innerHTML.includes('提醒次数不触发最终阻断'));
assert.ok(nodes['rules-quota-guardrail'].textContent.includes('最终阻断点'));
context.config = { restConfig: { weeklyFirstReminderMinutes: null } };
assert.equal(context.getAdminRestReminderView().weeklyEnabled, false);
assert.ok(fs.readFileSync('extension/infra/storage.js', 'utf8').includes('weeklyFirstReminderMinutes: 840'));
const background = fs.readFileSync('extension/background.js', 'utf8');
assert.ok(background.includes("source: 'soft_reminder_continue_check'"));
console.log('Rest weekly terminal defaults, bounds, Admin read-only and hard-routing wiring: PASS');

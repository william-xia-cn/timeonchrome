'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const text = fs.readFileSync(path.join(__dirname, '../../workers/src/routes/profiles.ts'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '../../pages/index.html'), 'utf8');
const source = ts.createSourceFile('profiles.ts', text, ts.ScriptTarget.Latest, true);
const node = source.statements.find(item => ts.isFunctionDeclaration(item)
  && item.name?.text === 'validateForcedUsePolicy');
assert.ok(node, 'Worker validator exists');
const context = vm.createContext({ Object, Number });
vm.runInContext(ts.transpileModule(node.getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const validate = policy => context.validateForcedUsePolicy(
  policy === undefined ? {} : { forcedUsePolicyV1: policy });
const valid = {
  schemaVersion: 1, enabled: true, reminderIntervalMinutes: 30,
  quotaOverrunMinutes: { dailyStudy: 0, dailyComposite: 30, dailyRest: 120,
    dailyOnline: null, weeklyRest: null, domain: 0 },
  advisoryWindowDailyMaxMinutes: null,
};
assert.equal(validate(undefined), null, 'old profile remains valid');
assert.equal(validate(valid), null);
assert.equal(validate({ ...valid, enabled: false }), null);
assert.equal(validate({ ...valid, quotaOverrunMinutes: { ...valid.quotaOverrunMinutes,
  dailyRest: null }, advisoryWindowDailyMaxMinutes: 1440 }), null);
for (const policy of [
  { ...valid, reminderIntervalMinutes: 0 },
  { ...valid, reminderIntervalMinutes: 1441 },
  { ...valid, reminderIntervalMinutes: 1.5 },
  { ...valid, quotaOverrunMinutes: { ...valid.quotaOverrunMinutes, dailyRest: -1 } },
  { ...valid, quotaOverrunMinutes: { ...valid.quotaOverrunMinutes, dailyRest: '0' } },
  { ...valid, quotaOverrunMinutes: { dailyRest: 0 } },
  { ...valid, advisoryWindowDailyMaxMinutes: 0 },
  { ...valid, advisoryWindowDailyMaxMinutes: 1441 },
  { ...valid, enabled: 'true' },
  { ...valid, extra: 1 },
  { ...valid, quotaOverrunMinutes: { ...valid.quotaOverrunMinutes, extra: 1 } },
]) assert.ok(validate(policy), 'invalid policy is rejected');
assert.match(text, /'forcedUsePolicyV1', 'downtimeConfig'/);
assert.match(text, /validateForcedUsePolicy\(incomingConfig\)/);
assert.match(page, /支持此配置的非共享终端同步后生效。共享提醒仍待单独验收/);
assert.doesNotMatch(page, /须待终端与共享提醒契约验收后才会执行/);
const executionNode = source.statements.find(item => ts.isFunctionDeclaration(item)
  && item.name?.text === 'validateForcedUseExecutionConfig');
vm.runInContext(ts.transpileModule(executionNode.getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const checkExecution = (config, incoming) => context.validateForcedUseExecutionConfig(config, incoming);
for (const accountingVersion of [undefined, 1]) {
  assert.ok(checkExecution({ forcedUsePolicyV1: valid, timeQuota: { accountingVersion } }, { forcedUsePolicyV1: valid }));
}
assert.equal(checkExecution({ forcedUsePolicyV1: valid, timeQuota: { accountingVersion: 2 } }, { forcedUsePolicyV1: valid }), null);
assert.ok(checkExecution({ forcedUsePolicyV1: valid, timeQuota: { accountingVersion: 1 } }, { timeQuota: { accountingVersion: 1 } }));
assert.equal(checkExecution({ forcedUsePolicyV1: { ...valid, enabled: false } }, { forcedUsePolicyV1: { ...valid, enabled: false } }), null);
assert.equal(checkExecution({ forcedUsePolicyV1: valid, timeQuota: { accountingVersion: 1 } }, { studyList: ['study.example'] }), null,
  'unrelated edits do not block old malformed combinations');
assert.match(text, /validateForcedUseExecutionConfig\(mergedConfig, incomingConfig\)/);
assert.match(text, /FORCED_USE_REQUIRES_V2_ACCOUNTING/);

const pageSource = ts.createSourceFile('page.js', page.split('<script>')[1].split('</script>')[0], ts.ScriptTarget.Latest, true);
const names = ['validateImportedForcedUsePolicy', 'hasUnifiedForcedUseConfig', 'buildUnifiedForcedUsePatch', 'confirmUnifiedForcedUseSave'];
const functions = pageSource.statements.filter(item => ts.isFunctionDeclaration(item) && names.includes(item.name?.text));
assert.equal(functions.length, names.length);
const pageContext = vm.createContext({
  FORCED_USE_LIMIT_FIELDS: Object.keys(valid.quotaOverrunMinutes).map(key => [key, key]),
  window: { confirm: () => false },
});
vm.runInContext(functions.map(item => item.getText(pageSource)).join('\n'), pageContext);
const existing = { timeQuota: { accountingVersion: 1, daily: { monday: { restMinutes: 240 } }, weekly: { restMinutes: 840 } },
  restConfig: { firstReminderMinutes: 120, weeklyFirstReminderMinutes: 840 }, domainQuotas: { 'site.example': 60 } };
const before = JSON.stringify(existing);
const patch = JSON.parse(JSON.stringify(pageContext.buildUnifiedForcedUsePatch(existing, valid)));
assert.equal(patch.timeQuota.accountingVersion, 2);
assert.deepEqual(patch.timeQuota.daily, existing.timeQuota.daily);
assert.deepEqual(patch.timeQuota.weekly, existing.timeQuota.weekly);
assert.deepEqual(patch.forcedUsePolicyV1, valid);
assert.equal(patch.restConfig, undefined, 'old reminder thresholds are not rewritten');
assert.equal(patch.domainQuotas, undefined, 'site limits are not rewritten');
assert.equal(JSON.stringify(existing), before, 'preparing a transition does not mutate saved configuration');
assert.equal(pageContext.confirmUnifiedForcedUseSave(existing), false);
pageContext.window.confirm = () => true;
assert.equal(pageContext.confirmUnifiedForcedUseSave(existing), true);
pageContext.window.confirm = () => { throw Error('already migrated must not prompt again'); };
assert.equal(pageContext.confirmUnifiedForcedUseSave(patch), true);
assert.doesNotMatch(page, /id="(?:a-rest-reminder-enabled|a-rest-first-reminder|a-rest-weekly-enabled|a-schedule-reminder-interval|a-forced-use-enabled)"/);
console.log('forced-use-cloud-config: passed');

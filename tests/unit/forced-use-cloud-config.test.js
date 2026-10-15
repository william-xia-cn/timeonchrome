'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const text = fs.readFileSync(path.join(__dirname, '../../workers/src/routes/profiles.ts'), 'utf8');
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
console.log('forced-use-cloud-config: passed');

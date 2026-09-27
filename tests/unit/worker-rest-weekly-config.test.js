'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

// 只执行生产服务端校验；不依赖未合入的扩展或页面实现。
const text = fs.readFileSync(path.join(__dirname, '../../workers/src/routes/profiles.ts'), 'utf8');
const source = ts.createSourceFile('profiles.ts', text, ts.ScriptTarget.Latest, true);
const fn = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'validateRestConfig');
assert.ok(fn);
const context = vm.createContext({});
vm.runInContext(ts.transpileModule(fn.getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const validate = context.validateRestConfig;
let cases = 0;
for (const value of [null, 1, 840, 10080]) {
  const config = { restConfig: { weeklyFirstReminderMinutes: value } };
  const before = JSON.stringify(config);
  assert.equal(validate(config), null);
  assert.equal(JSON.stringify(config), before);
  cases++;
}
for (const value of [0, -1, 10081, 1.5, '840', true, {}, [], undefined, NaN, Infinity]) {
  assert.equal(validate({ restConfig: { weeklyFirstReminderMinutes: value } }),
    'restConfig.weeklyFirstReminderMinutes 必须是 null 或 1-10080 的整数分钟');
  cases++;
}
for (const config of [{}, { restConfig: {} }, { restConfig: { firstReminderMinutes: null } },
  { restConfig: { firstReminderMinutes: 120, repeatReminderMinutes: 60 } }]) {
  const before = JSON.stringify(config);
  assert.equal(validate(config), null);
  assert.equal(JSON.stringify(config), before);
  assert.equal(Object.hasOwn(config.restConfig || {}, 'weeklyFirstReminderMinutes'), false);
  cases++;
}
for (const config of [{ restConfig: null }, { restConfig: [] },
  { restConfig: { firstReminderMinutes: 0, weeklyFirstReminderMinutes: 840 } },
  { restConfig: { repeatReminderMinutes: null, weeklyFirstReminderMinutes: 840 } }]) {
  assert.ok(validate(config));
  cases++;
}
console.log(`Worker weekly Rest validation: ${cases}/${cases} passed`);

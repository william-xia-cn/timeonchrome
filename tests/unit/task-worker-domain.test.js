'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../../workers/src/modules/task/domain.ts');
const source = fs.readFileSync(filename, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const taskModule = { exports: {} };
new Function('exports', 'require', 'module', output)(taskModule.exports, require, taskModule);
const domain = taskModule.exports;
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/task-resource-canonical-v1.json'), 'utf8'));
for (const item of fixtures.cases) {
  const before = JSON.stringify(item.input);
  const actual = domain.normalizeTaskResourceSpec(item.input);
  assert.equal(actual.ok, true, item.name);
  assert.deepEqual(actual.spec, item.expected, item.name);
  assert.equal(JSON.stringify(item.input), before);
}
assert.equal(domain.normalizeTaskResourceSpec({}).ok, false);
const invalid = domain.normalizeTaskResourceSpec({
  hosts: ['not a host'], urlRules: [{ url: 'bad url', match: 'exact' }],
  specialTargets: ['https://youtube.com/results?search_query=test'],
});
assert.equal(invalid.ok, false);
for (const field of ['hosts', 'urlRules', 'specialTargets']) {
  assert.ok(invalid.errors.some(error => error.field === field && error.index === 0 && error.value));
}
assert.equal(domain.normalizeTaskResourceSpec({ urlRules: [{ url: 'https://example.com', match: 'regex' }] }).ok, false);
assert.equal(domain.validateTaskRequiredSeconds(60).ok, true);
assert.equal(domain.validateTaskRequiredSeconds(86400).ok, true);
for (const value of [0, 59, 86401, 60.5, NaN]) assert.equal(domain.validateTaskRequiredSeconds(value).ok, false);
const task = { lifecycleStatus: 'open', completedSeconds: 0, plannedStartAt: 200 };
assert.equal(domain.canEditTaskCoreFields(task, 100), true);
assert.equal(domain.canEditTaskCoreFields(task, 200), false);
assert.equal(domain.canEditTaskCoreFields({ ...task, completedSeconds: 1 }, 100), false);
assert.equal(domain.canEditTaskCoreFields({ ...task, lifecycleStatus: 'completed' }, 100), false);
// 领域规则仍保持纯函数；入口接入/拔除由 task-worker-entry 实际运行时测试覆盖。
assert.equal(/fetch\(|\.prepare\(|env\./.test(source), false);
console.log('Task Worker domain: 5 canonical vectors, invalid inputs, edit boundary and pure domain PASS');

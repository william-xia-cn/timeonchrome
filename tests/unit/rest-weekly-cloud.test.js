const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
function extract(text, names, globals = {}) {
  const source = ts.createSourceFile('source.ts', text, ts.ScriptTarget.Latest, true);
  const nodes = source.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text));
  assert.equal(nodes.length, names.length);
  const context = vm.createContext(globals);
  vm.runInContext(ts.transpileModule(nodes.map(n => n.getText(source)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context;
}
const worker = extract(fs.readFileSync('workers/src/routes/profiles.ts', 'utf8'), ['buildSchemaDefaults', 'validateRestConfig']);
assert.equal(worker.buildSchemaDefaults().restConfig.weeklyFirstReminderMinutes, 840);
for (const value of [null, 1, 840, 10080]) assert.equal(worker.validateRestConfig({ restConfig: { weeklyFirstReminderMinutes: value } }), null);
for (const value of [0, -1, 10081, 1.5, '840', true]) assert.ok(worker.validateRestConfig({ restConfig: { weeklyFirstReminderMinutes: value } }));
assert.equal(worker.validateRestConfig({ restConfig: { firstReminderMinutes: null } }), null);
const pages = fs.readFileSync('pages/index.html', 'utf8').split('<script>')[1].split('</script>')[0];
const view = extract(pages, ['quotaFiniteNumber', 'autonomyConfigView']);
assert.equal(view.autonomyConfigView({}).weeklyReminderEnabled, true);
assert.equal(view.autonomyConfigView({}).weeklyFirstReminderMinutes, 840);
assert.equal(view.autonomyConfigView({ restConfig: { weeklyFirstReminderMinutes: null } }).weeklyReminderEnabled, false);
assert.equal(view.autonomyConfigView({ restConfig: { weeklyFirstReminderMinutes: 930 } }).weeklyFirstReminderMinutes, 930);
assert.equal(view.autonomyConfigView({ restConfig: { firstReminderMinutes: null } }).weeklyReminderEnabled, true);
console.log('Rest weekly cloud defaults, validation and independent view: PASS');

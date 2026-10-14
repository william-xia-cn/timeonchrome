'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '../..');
const core = fs.readFileSync(path.join(root, 'extension/core/downtime.js'), 'utf8');
const coreExports = new Function(`${core.replace(/export (function|const) /g, '$1 ')}\nreturn { readDowntimeConfig, DOWNTIME_DAY_LABELS, DOWNTIME_WEBSITE_LABELS, DOWNTIME_APPLICATION_LABELS };`)();
const code = fs.readFileSync(path.join(root, 'extension/admin/admin.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'extension/admin/admin.html'), 'utf8');
const ast = ts.createSourceFile('admin.js', code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
const render = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === 'renderDowntimeSection');
const host = { innerHTML: '' };
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const context = { ...coreExports, config: {}, escHtml: escape, document: { getElementById: () => host } };
vm.runInNewContext(render.getText(ast), context);
context.renderDowntimeSection();
assert(host.innerHTML.includes('未启用（尚未设置）'));
assert(host.innerHTML.includes('网站执行：</strong>已接入'));
assert(host.innerHTML.includes('应用执行：</strong>待接入'));
context.config = { downtimeConfig: { schemaVersion: 1, enabled: true,
  windowsByWeekday: { monday: [{ start: '22:00', end: '07:00' }] },
  allowedWebsiteTypes: ['study', 'other'], allowedApplicationTypes: ['restrictedEntertainment'] } };
context.renderDowntimeSection();
assert(host.innerHTML.includes('已开启'));
assert(host.innerHTML.includes('学习网站、其他网站'));
assert(host.innerHTML.includes('受限娱乐应用'));
assert(host.innerHTML.includes('22:00 至 07:00（次日）'));
assert(host.innerHTML.includes('北京时间'));
assert(!/<(?:input|button|select|textarea)\b/.test(host.innerHTML));
const before = JSON.stringify(context.config);
context.renderDowntimeSection();
assert.equal(JSON.stringify(context.config), before);
context.config.downtimeConfig.allowedApplicationTypes = ['unknown'];
context.renderDowntimeSection();
assert(host.innerHTML.includes('暂不可读取'));
assert(!host.innerHTML.includes('学习网站'));
assert(html.includes('data-rules-tab="downtime-management"'));
assert(html.includes('data-rules-panel="downtime-management"'));
assert(code.includes("rules: ['quota-management', 'autonomy-management', 'schedule-management', 'downtime-management']"));
assert(code.includes("'rules-downtime-display',"));
const syncSource = fs.readFileSync(path.join(root, 'extension/infra/cloud-sync.js'), 'utf8');
const syncAst = ts.createSourceFile('cloud-sync.js', syncSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
const normalize = syncAst.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === 'normalizeCloudRulesConfig');
function loadCore(file) {
  const loaded = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: loaded, URL, require: name => loadCore(path.resolve(path.dirname(file), name)) });
  return loaded;
}
const runtimeNormalizer = loadCore(path.join(root, 'extension/core/site-access-config-normalizer.js'));
const syncContext = { pickFirstArray: () => null, normalizeRuntimeSiteAccessConfig: runtimeNormalizer.normalizeRuntimeSiteAccessConfig, DEFAULT_CONFIG: {} };
vm.runInNewContext(normalize.getText(syncAst), syncContext);
const raw = { downtimeConfig: coreExports.readDowntimeConfig(undefined).config, studyList: ['example.test'] };
const normalized = syncContext.normalizeCloudRulesConfig(raw);
assert.deepEqual(normalized.downtimeConfig, raw.downtimeConfig);
assert.deepEqual(JSON.parse(JSON.stringify(normalized.studyList)), raw.studyList);
console.log('Admin downtime: read-only/default/unknown/navigation/sync preservation passed');

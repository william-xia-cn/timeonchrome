'use strict';

// 运行真实页面函数，并以现有共享分类读取器验证保存后的有效分类。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'pages/index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');
const ast = ts.createSourceFile('pages.js', scripts, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const functions = new Map(ast.statements.filter(ts.isFunctionDeclaration).map(n => [n.name.text, n.getText(ast)]));
const assignments = new Map(ast.statements.filter(ts.isExpressionStatement)
  .filter(n => ts.isBinaryExpression(n.expression)).map(n => [n.expression.left.getText(ast), n.getText(ast)]));
const defs = ast.statements.find(n => ts.isVariableStatement(n)
  && n.declarationList.declarations.some(d => d.name.getText(ast) === 'RULES_POLICY_DEFS'));
const names = ['getCustomList', 'canonicalSiteIdentityHost', 'normalizeSiteAccessHostKey',
  'normalizeSiteAccessHostname', 'normalizeSiteAccessInput', 'getSiteAccessListsForValidation',
  'findSiteAccessExactConflicts', 'formatSiteAccessConflict', 'siteAccessExactListMatch',
  'findProtectedSiteAccessScope', 'formatProtectedSiteAccessScopeMessage', 'validateRulesSiteAdd',
  'uniqueSiteAccessValues', 'classificationPolicyDefs', 'rulesPolicyDefaultKeys', 'getPolicyDefaultList',
  'getPolicyCustomList', 'getRulesPolicyModel', 'buildCustomSiteAccessPayload',
  'isHostSiteClassificationRule', 'removeExactHostClassificationRules', 'moveCustomSiteToPolicy',
  'siteRuleDecision', 'siteRuleValue', 'canonicalDisplayUrlValue', 'uniqueSiteRules',
  'siteRuleManagementKey', 'approvedUrlRulesForListKey', 'matchDomain', 'applyProfileConfigResponse',
  'saveProfileConfig', 'saveSiteAccessConfig', 'renderRulesSiteRow', 'isYouTubeSpecialRuleValue'];
names.forEach(n => assert(functions.has(n), n));

const domain = fs.readFileSync(path.join(root, 'extension/core/domain-semantics.js'), 'utf8');
const normalizer = fs.readFileSync(path.join(root, 'extension/core/site-access-config-normalizer.js'), 'utf8');
const classification = fs.readFileSync(path.join(root, 'extension/core/site-classification.js'), 'utf8');
const strip = source => source.replace(/^\s*import .*?;\s*$/gm, '').replace(/export\s+(function|const)\s+/g, '$1 ');
const reference = vm.createContext({ URL, console });
vm.runInContext(strip(domain) + '\n' + strip(normalizer) + '\n' + strip(classification), reference);
const runtimeValidate = config => { reference.input = config; return vm.runInContext('validateSiteAccessConfig(input)', reference); };
const classify = (config, host) => {
  reference.input = config; reference.host = host;
  return vm.runInContext('resolveSiteAccessClassification(normalizeRuntimeSiteAccessConfig(input).config, [], "https://" + host + "/")', reference).classification;
};
const clone = x => JSON.parse(JSON.stringify(x));
const hostRule = (value, decision = 'composite') => ({ targetType: 'host', normalizedValue: value, decision, requestId: 'history-ref' });
const base = () => ({ customStudyList: [], customCompositeList: ['127.0.0.1'],
  customRestrictedEntertainmentList: [], customBlockedSites: [], siteClassificationRulesV1: [hostRule('127.0.0.1')] });
let passed = 0;
async function test(name, run) { await run(); passed++; console.log('  ✓ ' + name); }

function page(config = base(), defaults = {}) {
  const calls = [], toasts = [];
  let stored = clone(config), version = 8;
  const context = vm.createContext({ URL, console, currentProfileId: 'isolated-child', remoteConfig: clone(config),
    remoteConfigVersion: version, siteAccessDefaults: clone(defaults), window: {},
    rulesSitePolicyState: { usedUnclassified: [] }, systemAccessCanWrite: false,
    RULES_SOURCE_LABELS: { custom: '自定义', rule: '已批准规则' },
    document: { querySelector: () => ({ dataset: { page: 'sites' } }) },
    toast: (...args) => toasts.push(args), renderRulesPage() {}, renderPage() {},
    youtubeSpecialRuleRows: () => [], unknownUsageIdentifier: () => null,
    rulesSiteMeta: () => '', renderSystemSiteCategoryEditor: () => '',
    htmlEscape: value => String(value), normalizeHostname: value => String(value).toLowerCase(),
    async api(url, method = 'GET', body) {
      calls.push({ url, method, body: body && clone(body) });
      if (method === 'GET') return { data: clone(stored), version };
      assert.equal(body.expectedVersion, context.remoteConfigVersion);
      if (body.expectedVersion !== version) {
        const e = new Error('conflict'); e.status = 409; e.code = 'PROFILE_CONFIG_VERSION_CONFLICT'; throw e;
      }
      const merged = { ...stored, ...clone(body.data) };
      assert.equal(runtimeValidate(merged).ok, true, 'saved list/rules must be accepted by shared validator');
      stored = merged; version++;
      return { version };
    },
  });
  vm.runInContext(defs.getText(ast) + '\n' + names.map(n => functions.get(n)).join('\n')
    + '\n' + ['window.deleteRulesCustomSite', 'window.classifyRulesSiteEntry'].map(n => assignments.get(n)).join('\n'), context);
  return { context, calls, toasts, stored: () => clone(stored), bump: () => version++ };
}

async function run() {
  await test('旧删除入口不能撤销分类；直接改类仍正常', async () => {
    const p = page();
    p.context.window._rulesSiteDirectoryEntries = [{ source: 'custom', classification: 'composite', value: '127.0.0.1' }];
    p.context.window.deleteRulesCustomSite(0);
    assert.deepEqual(clone(p.context.remoteConfig),base());
    assert.equal(p.calls.filter(c => c.method === 'PUT').length, 0);
    assert.equal(p.context.moveCustomSiteToPolicy('127.0.0.1', 'study'), true);
    await p.context.saveSiteAccessConfig();
    assert.equal(classify(p.stored(), '127.0.0.1'), 'study');
  });
  for (const [policy, expected] of [['study','study'], ['composite','composite'], ['restricted','restricted'], ['blocked','blocked']]) {
    await test('直接移动到' + policy + '，同目标审批覆盖退出，实际读取采用新分类', async () => {
      const p = page();
      assert.equal(p.context.moveCustomSiteToPolicy('127.0.0.1', policy), true);
      await p.context.saveSiteAccessConfig();
      assert.deepEqual(p.stored().siteClassificationRulesV1, []);
      assert.equal(classify(p.stored(), '127.0.0.1'), expected);
    });
  }
  await test('规则单独存在时可见可移动、不可删除；已有custom同分类不重复展示', async () => {
    const p = page({ ...base(), customCompositeList: [] });
    const model = p.context.getRulesPolicyModel().find(m => m.key === 'composite');
    assert.equal(model.rules.length, 1);
    const entry = { source: 'rule', classification: 'composite', value: '127.0.0.1', rule: model.rules[0] };
    assert.match(p.context.renderRulesSiteRow(entry, 0), /classifyRulesSiteEntry\(0, 'study'\)/);
    assert.doesNotMatch(p.context.renderRulesSiteRow(entry, 0), /deleteRulesCustomSite\(0\)/);
    p.context.window._rulesSiteDirectoryEntries = [entry];
    await p.context.window.classifyRulesSiteEntry(0, 'study');
    await p.context.saveSiteAccessConfig();
    assert.equal(classify(p.stored(), '127.0.0.1'), 'study');
    const q = page({ ...base(), customCompositeList: [] });
    q.context.window._rulesSiteDirectoryEntries = [entry]; q.context.window.deleteRulesCustomSite(0);
    assert.deepEqual(clone(q.context.remoteConfig.siteClassificationRulesV1),base().siteClassificationRulesV1);
    assert.equal(page().context.getRulesPolicyModel().find(m => m.key === 'composite').rules.length, 0);
  });
  await test('旧删除别名入口不改父域／子域／URL／YouTube／用途规则和历史对象', async () => {
    const preserved = [hostRule('child.example.com'), hostRule('other.example.com'),
      { targetType: 'url', normalizedValue: 'https://example.com/page?a=1', decision: 'study' },
      { targetType: 'url', normalizedValue: 'https://www.youtube.com/watch?v=test', decision: 'study' }];
    const config = { ...base(), customCompositeList: ['www.example.com', 'child.example.com'],
      siteClassificationRulesV1: [hostRule('example.com'), ...preserved],
      siteUsageClassificationRulesV1: [{ targetType:'host', normalizedValue:'other.example.com', classification:'other' }] };
    const before = clone(config), p = page(config);
    p.context.window._rulesSiteDirectoryEntries = [{ source:'custom', classification:'composite', value:'www.example.com' }];
    p.context.window.deleteRulesCustomSite(0); await p.context.saveSiteAccessConfig();
    assert.deepEqual(p.stored().siteClassificationRulesV1,config.siteClassificationRulesV1);
    assert.deepEqual(p.stored().customCompositeList,config.customCompositeList);
    assert.deepEqual(config, before, 'input/audit facts must not be mutated');
    assert.deepEqual(p.stored().siteUsageClassificationRulesV1, config.siteUsageClassificationRulesV1);
  });
  await test('移动子域不改父域、wildcard或同域精确URL', async () => {
    const config = { ...base(), customCompositeList: ['example.com','child.example.com','*.example.com'],
      siteClassificationRulesV1: [hostRule('example.com'), hostRule('child.example.com'), hostRule('*.example.com'),
        { targetType:'url', normalizedValue:'https://child.example.com/exact', decision:'composite' }] };
    const p = page(config); assert.equal(p.context.moveCustomSiteToPolicy('child.example.com','study'), true);
    await p.context.saveSiteAccessConfig();
    assert.deepEqual(p.stored().customCompositeList, ['example.com','*.example.com']);
    assert.equal(p.stored().siteClassificationRulesV1.length, 3);
  });
  await test('系统同目标冲突与受限父域保护不被移动操作绕过', async () => {
    const p = page(base(), { defaultCompositeSites:['127.0.0.1'] });
    assert.equal(p.context.moveCustomSiteToPolicy('127.0.0.1','study'), false);
    assert.deepEqual(clone(p.context.remoteConfig), base());
    const q = page({ ...base(), customCompositeList:['child.example.com'],
      siteClassificationRulesV1:[hostRule('example.com','reject')] });
    assert.equal(q.context.moveCustomSiteToPolicy('child.example.com','study'), false);
    assert.equal(q.context.moveCustomSiteToPolicy('*.child.example.com','study'), false);
    assert.equal(q.context.moveCustomSiteToPolicy('*.example.com','study'), false);
    const r = page(); r.context.window._rulesSiteDirectoryEntries = [{source:'system',classification:'composite',value:'127.0.0.1'}];
    r.context.window.deleteRulesCustomSite(0); assert.deepEqual(clone(r.context.remoteConfig), base());
  });
  await test('残留审批规则在添加校验中可见，不能制造第二份冲突分类', async () => {
    const p = page({ ...base(), customCompositeList: [] });
    assert.equal(p.context.validateRulesSiteAdd('127.0.0.1', 'study').ok, false);
    assert.equal(p.context.findSiteAccessExactConflicts({ ...p.context.remoteConfig, customStudyList:['127.0.0.1'] }).length, 1);
  });
  await test('版本冲突只刷新最新配置，不重放过期改类或覆盖他人修改', async () => {
    const p = page(); p.context.window._rulesSiteDirectoryEntries = [{source:'custom',classification:'composite',value:'127.0.0.1'}];
    p.context.moveCustomSiteToPolicy('127.0.0.1','study'); p.bump(); await p.context.saveSiteAccessConfig();
    assert.equal(p.calls.filter(c => c.method==='PUT').length, 1);
    assert.deepEqual(p.stored(), base()); assert.deepEqual(clone(p.context.remoteConfig), base());
    assert(p.toasts.some(args => args[0].includes('配置已被其他页面更新')));
  });
  console.log(`\n[Pages site classification edit] ${passed}/${passed} PASS`);
}
run().catch(e => { console.error(e); process.exitCode = 1; });

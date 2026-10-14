'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const domains = require('../../pages/access-config-domains.js');
const source = fs.readFileSync(path.join(__dirname, '../../pages/downtime-config.js'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '../../pages/index.html'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source.replace(/export (function|const) /g, '$1 '), context);
const helper = context.window.TimeOnChromeDowntime;
const json = value => JSON.parse(JSON.stringify(value));
let count = 0;
function test(name, body) { body(); count++; }
const active = { ...json(helper.defaultConfig()), enabled: true,
  windowsByWeekday: { monday: [{ start: '22:00', end: '07:00' }] },
  allowedWebsiteTypes: ['study'], allowedApplicationTypes: ['study'] };

test('missing configurations have detached disabled defaults', () => {
  const a = helper.normalize(undefined), b = helper.normalize(undefined);
  assert.equal(a.enabled, false);
  assert.equal(Object.keys(a.windowsByWeekday).length, 7);
  a.windowsByWeekday.monday.push({ start: '08:00', end: '12:00' });
  assert.equal(b.windowsByWeekday.monday.length, 0);
});
test('overnight and 24:00 are legal, equal endpoints and 24:00 starts are rejected', () => {
  assert.equal(helper.validate(active), null);
  assert.equal(helper.validate({ ...active, windowsByWeekday: { monday: [{ start: '00:00', end: '24:00' }] } }), null);
  for (const pair of [['24:00', '07:00'], ['08:00', '08:00'], ['8:00', '12:00'], ['08:00', '24:01']]) {
    assert(helper.validate({ ...active, windowsByWeekday: { monday: [{ start: pair[0], end: pair[1] }] } }));
  }
});
test('malformed objects, versions, unknown days and excessive windows are rejected', () => {
  for (const value of [null, [], {}, { ...active, schemaVersion: 2 }, { ...active, enabled: 1 },
    { ...active, extra: true }, { ...active, windowsByWeekday: { monday: null } },
    { ...active, windowsByWeekday: { monday: [{ start: '08:00', end: '12:00', domain: 'not-permitted' }] } },
    { ...active, windowsByWeekday: { unexpected: [] } },
    { ...active, windowsByWeekday: { monday: Array.from({ length: 33 }, () => ({ start: '08:00', end: '12:00' })) } }]) {
    assert(helper.validate(value));
    assert.throws(() => helper.normalize(value));
  }
});
test('only explicitly supported website and application types can be exceptions', () => {
  assert.equal(helper.validate({ ...active, allowedWebsiteTypes: ['study', 'composite', 'restricted', 'other'],
    allowedApplicationTypes: ['study', 'composite', 'restrictedEntertainment', 'other'] }), null);
  for (const field of ['allowedWebsiteTypes', 'allowedApplicationTypes']) {
    for (const list of [null, ['study', 'study'], ['blocked'], ['unclassified'], ['unknown'], ['https://example.test']]) {
      assert(helper.validate({ ...active, [field]: list }));
    }
  }
});
test('turning off cannot hide a corrupted schedule or type list', () => {
  assert(helper.validate({ ...active, enabled: false, allowedWebsiteTypes: ['unknown'] }));
});
test('normalization preserves input, canonicalizes order and keeps empty exceptions', () => {
  const input = { ...active, allowedApplicationTypes: ['other', 'study'] }, before = JSON.stringify(input);
  const normalized = helper.normalize(input);
  assert.deepEqual(json(normalized.allowedApplicationTypes), ['study', 'other']);
  normalized.windowsByWeekday.monday[0].end = '06:00';
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(json(helper.normalize({ ...active, allowedWebsiteTypes: [] }).allowedWebsiteTypes), []);
});
test('one-digit UI hours normalize without accepting double colons or invalid midnight', () => {
  assert.equal(helper.normalizeClock(' 8:00 '), '08:00');
  assert.equal(helper.normalizeClock('24:00'), '24:00');
  assert.equal(helper.normalizeClock('24::00'), '24::00');
});
test('summaries are Chinese and explicitly identify overnight ranges', () => {
  const summary = helper.summary(active);
  assert(summary.includes('周一 22:00-07:00（次日）'));
  assert(summary.includes('学习网站'));
  assert(summary.includes('学习应用'));
  assert(!summary.includes('study'));
});

const legacy = { app: 'TimeOnChrome', configType: 'profile-config', configVersion: 1, quota: {}, siteAccess: {} };
test('public access export includes downtime while website-only export excludes it', () => {
  assert.deepEqual(domains.createFile('publicAccess', { ...legacy, downtime: active }).profileConfig.downtime, active);
  assert.equal(domains.createFile('websites', { ...legacy, downtime: active }).profileConfig.downtime, undefined);
  assert.equal(domains.createFile('publicAccess', legacy).profileConfig.downtime, undefined);
});
test('selected downtime imports replace only the independent policy', () => {
  const candidate = { downtimeConfig: active, domainQuotas: { 'example.test': 20 } };
  const diff = { area: 'downtime', key: 'policy', type: 'modify' };
  assert.deepEqual(domains.buildPatch('publicAccess', candidate, {}, [diff]), { downtimeConfig: active });
  assert.throws(() => domains.buildPatch('websites', candidate, {}, [diff]));
  assert.deepEqual(domains.buildPatch('publicAccess', candidate, {}, []), {});
});

function pageFunction(name) {
  const script = page.match(/<script>([\s\S]*?)<\/script>/)[1];
  const ast = ts.createSourceFile('pages.js', script, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const statement = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert(statement, `missing ${name}`);
  return statement.getText(ast);
}
const importContext = { window: { TimeOnChromeDowntime: helper }, CONFIG_IMPORT_LIST_FIELDS: [],
  quotaFiniteNumber: value => value === null ? null : typeof value === 'number' ? value : undefined,
  uniqueSiteRules: values => values, sanitizeTimeWindowsDailyForConfigIo: value => value };
vm.runInNewContext(pageFunction('normalizeProfileConfigImportData'), importContext);
test('the real import normalizer does not clear downtime from old backups', () => {
  assert.equal(importContext.normalizeProfileConfigImportData(legacy).downtimeConfig, undefined);
  assert.deepEqual(json(importContext.normalizeProfileConfigImportData({ ...legacy, downtime: active }).downtimeConfig), json(helper.normalize(active)));
  assert.throws(() => importContext.normalizeProfileConfigImportData({ ...legacy, downtime: null }));
});

async function verifySave() {
  const elements = { 'downtime-enabled': { checked: true }, 'downtime-config-error': { textContent: '' }, 'save-downtime-btn': { disabled: false } };
  const calls = [];
  const row = { querySelector: selector => selector.includes('midnight') ? { checked: true }
    : ({ value: selector.includes('start') ? '8:00' : '00:00' }) };
  const ctx = { window: { TimeOnChromeDowntime: helper }, currentProfileId: 'isolated-child', remoteConfig: {},
    downtimeRenderedProfile: 'isolated-child', downtimeSaving: false, downtimeDraft: null, remoteConfigVersion: 7,
    cloudRulesManagementActiveTab: 'downtime', document: {
      getElementById: id => elements[id],
      querySelector: selector => ({ querySelectorAll: () => selector.includes('monday') ? [row] : [] }),
      querySelectorAll: selector => [{ value: selector.includes('allowedWebsiteTypes') ? 'study' : 'other' }],
    }, saveProfileConfig: async (payload, reason) => { calls.push({ payload: json(payload), reason }); ctx.remoteConfigVersion = 8; return { version: 8 }; },
    api: async url => { calls.push({ url }); return { version: 8 }; }, applyProfileConfigResponse: () => {}, renderDowntimePage: () => {}, toast: () => {},
    updateDowntimeInputs: () => { elements['save-downtime-btn'].disabled = ctx.downtimeSaving; } };
  vm.runInNewContext(pageFunction('readDowntimeEditor') + '\n' + pageFunction('saveDowntimeConfig'), ctx);
  await ctx.saveDowntimeConfig();
  assert.deepEqual(Object.keys(calls[0].payload), ['downtimeConfig']);
  assert.equal(calls[0].reason, 'downtime_config_save');
  assert.deepEqual(calls[0].payload.downtimeConfig.windowsByWeekday.monday, [{ start: '08:00', end: '24:00' }]);
  assert.equal(calls[1].url, '/profiles/isolated-child/config');
  assert.equal(elements['save-downtime-btn'].disabled, false);
  count++;
  calls.length = 0;
  ctx.downtimeDraft = { profileId: 'isolated-child', baseVersion: 6, dirty: true };
  await ctx.saveDowntimeConfig();
  assert.equal(calls.length, 0, 'stale draft cannot silently use the latest version');
  assert(elements['downtime-config-error'].textContent.includes('云端配置已变化'));
  ctx.downtimeDraft = null;
  count++;
  calls.length = 0;
  ctx.saveProfileConfig = async () => { ctx.currentProfileId = 'another-child'; };
  await ctx.saveDowntimeConfig();
  assert.equal(calls.length, 0, 'a switched child must not receive an old refresh');
  count++;
  ctx.currentProfileId = 'isolated-child';
  ctx.saveProfileConfig = async () => { throw new Error('配置版本冲突'); };
  await ctx.saveDowntimeConfig();
  assert.equal(elements['downtime-config-error'].textContent, '配置版本冲突');
  assert.equal(elements['save-downtime-btn'].disabled, false);
  count++;
  ctx.saveProfileConfig = async () => { ctx.remoteConfigVersion = 9; return { version: 9 }; };
  ctx.api = async () => ({ version: 10 });
  let applied = false;
  ctx.applyProfileConfigResponse = () => { applied = true; };
  await ctx.saveDowntimeConfig();
  assert.equal(applied, false, 'later GET version must not replace saved state');
  assert(elements['downtime-config-error'].textContent.includes('云端版本已变化'));
  count++;
  ctx.remoteConfig = { downtimeConfig: helper.normalize(active) };
  elements['downtime-enabled'].checked = false;
  row.querySelector = selector => selector.includes('midnight') ? { checked: false }
    : { value: selector.includes('start') ? '10:00' : '' };
  calls.length = 0;
  let notice = '';
  ctx.toast = message => { notice = message; };
  ctx.saveProfileConfig = async payload => { calls.push(json(payload)); ctx.remoteConfigVersion = 11; return { version: 11 }; };
  ctx.api = async () => ({ version: 11 });
  await ctx.saveDowntimeConfig();
  assert.equal(calls[0].downtimeConfig.enabled, false);
  assert.deepEqual(calls[0].downtimeConfig.windowsByWeekday, json(helper.normalize(active).windowsByWeekday));
  assert(notice.includes('未完成的时段修改未保存'));
  count++;
  console.log(`downtime configuration: ${count}/${count} tests passed`);
}
verifySave().catch(error => { console.error(error); process.exitCode = 1; });

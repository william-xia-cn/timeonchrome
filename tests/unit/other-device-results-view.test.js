'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function select(source, predicate) {
  const tree = ts.createSourceFile('fixture.js', source, ts.ScriptTarget.Latest, true);
  let result;
  function visit(node) { if (predicate(node)) result = node; else ts.forEachChild(node, visit); }
  visit(tree);
  assert(result, 'production view entry must exist');
  return result.getText(tree);
}
const admin = read('extension/admin/admin.js'), popup = read('extension/popup/popup.js');
const render = select(admin, n => ts.isFunctionDeclaration(n) && n.name?.text === 'renderWeeklyRestSection');
const metric = select(popup, n => ts.isVariableDeclaration(n) && n.name.getText() === 'metric');
const popupSub = select(popup, n => ts.isPropertyAssignment(n) && n.name.getText() === 'sub'
  && n.initializer.getText().includes('cloudSnapshotAvailable')).split(':').slice(1).join(':');
const quota = read('extension/core/quota-read-model-v2.js').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
const build = new Function(quota + '\nreturn buildQuotaReadModelV2;')();
for (const scenario of ['local_only', 'cloud_missing', 'cloud_zero']) {
  const other = scenario === 'cloud_zero' ? 0 : 30;
  const model = build({ date: '2026-10-17', weekStart: '2026-10-12', weekEnd: '2026-10-18', deviceId: 'self',
    localProjection: { complete: true, today: { onlineSeconds: 120, byQuotaBucket: { rest: 120 }, byDomain: {} }, weekRestSeconds: 120 },
    cloudSnapshot: scenario === 'local_only' ? null : { snapshotId: 'synthetic',
      period: { weekStart: '2026-10-12', weekEnd: '2026-10-18' }, completeness: { complete: false, missingDevices: ['offline'] },
      deviceAccounts: [{ deviceId: 'self', date: '2026-10-17', quotaProjection: { activeSeconds: 999, byQuotaBucket: [{ quotaBucket: 'rest', durationSeconds: 999 }], byDomain: [] } },
        { deviceId: 'other', date: '2026-10-17', quotaProjection: { activeSeconds: other, byQuotaBucket: [{ quotaBucket: 'rest', durationSeconds: other }], byDomain: [] } }] } });
  const node = { innerHTML: '' };
  new Function('document', 'config', 'adminRulesCloudMeta', 'formatSeconds', `
    const weeklyRestLimitFromConfig=()=>({value:60,source:'timeQuota'}),getQuotaCalendarContext=()=>({}),
    formatBeijingDateTime=()=> '2026-10-17',formatQuotaText=()=> '1小时',weeklyQuotaSourceLabel=()=> '显式周上限',escHtml=s=>s;
    ${render};renderWeeklyRestSection();`)(
    { getElementById: () => node }, { timeQuota: { accountingVersion: 2 } }, { quotaReadModel: model }, n => `${n}秒`);
  const expectedOther = scenario === 'local_only' ? 0 : other;
  assert(node.innerHTML.includes(`本机 120秒 · 云端其他设备已确认 ${expectedOther}秒`));
  assert(node.innerHTML.includes(`>${120 + expectedOther}秒<`), 'rendered total uses the same execution result');
  assert(!node.innerHTML.includes('其他设备数据未知') && !node.innerHTML.includes('账目完整'));
  assert(model.completeness.complete, 'cloud gaps do not invalidate the readable local result');
  const sub = new Function('config', 'snapshot', `return (${popupSub});`)(
    { timeQuota: { accountingVersion: 2 } }, { quotaReadModel: model });
  assert.equal(sub, scenario === 'local_only' ? '前台网页 · 本机用量' : '前台网页 · 本机＋云端已确认');
  const markup = new Function('formatSeconds', `const ${metric};return metric;`)(n => `${n}秒`)(
    { icon: '', label: '在线时长', used: model.usage.totalSeconds, sub });
  assert(markup.includes(`${120 + expectedOther}秒`) && markup.includes(sub));
}
console.log('Other device results view PASS: production quota model / Admin / Popup, missing increments and known zero');

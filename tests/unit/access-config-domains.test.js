'use strict';
const assert = require('node:assert/strict');
const api = require('../../pages/access-config-domains.js');
let count = 0;
function test(name, run) { run(); count++; console.log(`PASS ${name}`); }
// 与真实 profile-config v1 一致：日期为 monday…sunday，onlineMinutes 是网页专属限制。
const legacy = {
  app: 'TimeOnChrome', configType: 'profile-config', configVersion: 1,
  profile: { id: 'private-child', name: 'private-name' }, token: 'private-token',
  siteAccess: {
    customLists: { studySites: ['example.test'], blockedSites: ['blocked.test'], secret: 'private-token' },
    classificationRules: [{ decision: 'study', targetType: 'host', normalizedValue: 'example.test', rawRule: { requestId: 'private-request', token: 'private-token' } }],
    usageClassificationRules: [{ classification: 'other', targetType: 'host', normalizedValue: 'tool.test', requestId: 'private-request' }],
    classificationRequests: [{ identity: 'private-request' }],
  },
  quota: {
    timeQuota: { accountingVersion: 2, daily: { monday: { studyMinutes: 60, compositeMinutes: 40, restMinutes: null, onlineMinutes: 180 } }, weekly: { restMinutes: 600, secret: 'private-token' } },
    restConfig: { firstReminderMinutes: null, repeatReminderMinutes: 30, weeklyFirstReminderMinutes: 420 },
    autonomyConfig: { restrictedEntryConfirmationRequired: true, softReminderTimeoutAction: 'continue' },
    domainQuotas: { 'example.test': 10 }, legacyQuotaSnapshot: { dailyOnlineQuota: 180 },
  },
  notifications: { unclassifiedUsage: { enabled: true, thresholdMinutes: 30, email: 'private-email' } },
  timeWindows: { daily: { monday: { studyWindows: null, compositeWindows: [], restWindows: [{ start: '08:00', end: '12:00' }], onlineWindows: ['derived'] } } },
};
const current = {
  timeQuota: { accountingVersion: 2, daily: { monday: { studyMinutes: 60, compositeMinutes: 40, restMinutes: null, onlineMinutes: 180 } }, weekly: { restMinutes: 600 } },
  timeWindows: { daily: { monday: { studyWindows: null, compositeWindows: [] }, tuesday: { restWindows: null } } },
};
test('公共文件没有网站对象、网站在线额、审核或私密字段', () => {
  const file = api.createFile('publicAccess', legacy);
  assert.deepEqual(file.profileConfig.quota.timeQuota.daily.monday, { studyMinutes: 60, compositeMinutes: 40, restMinutes: null });
  assert.equal(file.profileConfig.siteAccess, undefined);
  assert.equal(file.profileConfig.quota.domainQuotas, undefined);
  assert.equal(file.profileConfig.quota.legacyQuotaSnapshot, undefined);
  assert.equal(JSON.stringify(file).includes('private-'), false);
  assert.equal(JSON.stringify(file).includes('onlineWindows'), false);
});
test('网站文件保留 other 与在线额但不包含公共时间规则', () => {
  const file = api.createFile('websites', legacy);
  assert.deepEqual(file.profileConfig.quota.timeQuota.daily.monday, { onlineMinutes: 180 });
  assert.equal(file.profileConfig.quota.restConfig, undefined);
  assert.equal(file.profileConfig.timeWindows, undefined);
  assert.equal(file.profileConfig.siteAccess.usageClassificationRules[0].classification, 'other');
  assert.equal(JSON.stringify(file).includes('private-'), false);
});
test('应用文件必须由 canonical App Policy 处理', () => assert.throws(() => api.createFile('applications', legacy), /App Policy/));
test('未知域拒绝而不回退混合配置', () => assert.throws(() => api.createFile('unexpected', legacy)));
test('公共域拒绝全局网站配置', () => assert.throws(() => api.createFile('publicAccess', legacy, {})));
test('新格式往返与 null 完全一致', () => {
  const file = api.createFile('publicAccess', legacy);
  assert.deepEqual(api.readFile('publicAccess', file).profileConfig, file.profileConfig);
});
test('错误域和版本不能静默导入', () => {
  assert.throws(() => api.readFile('websites', api.createFile('publicAccess', legacy)));
  assert.throws(() => api.readFile('publicAccess', { ...api.createFile('publicAccess', legacy), schemaVersion: 3 }));
});
test('旧 profile 按所选域裁剪而不新增缺失域删除项', () => {
  assert.equal(api.readFile('publicAccess', legacy).profileConfig.siteAccess, undefined);
  assert.equal(api.readFile('websites', legacy).profileConfig.quota.restConfig, undefined);
});
const system = { app: 'TimeOnChrome', configType: 'system-access-config', schemaVersion: 1, taxonomyVersion: 'qustodio-web-filters-v1' };
const bundle = { app: 'TimeOnChrome', configType: 'access-management-config-bundle', schemaVersion: 1, scopes: { userConfig: true, systemConfig: true }, userConfig: legacy, systemConfig: system };
test('旧混合 bundle 在公共域不夹带全局网站库', () => assert.equal(api.readFile('publicAccess', bundle).systemConfig, null));
test('旧混合 bundle 在网站域保留全局网站库供原预检', () => assert.deepEqual(api.readFile('websites', bundle).systemConfig, system));
test('旧文件 scope 关闭不借用隐藏内容', () => assert.throws(() => api.readFile('publicAccess', { ...bundle, scopes: { userConfig: false, systemConfig: true } })));
test('系统单文件只可在网站域读取', () => {
  assert.equal(api.readFile('websites', system).profileConfig, null);
  assert.throws(() => api.readFile('publicAccess', system));
});
test('系统独立导出无需孩子配置且能往返', () => {
  const file = api.createFile('websites', null, system);
  assert.equal(file.profileConfig, undefined);
  assert.deepEqual(api.readFile('websites', file), { domain: 'websites', profileConfig: null, systemConfig: system });
});
test('旧文件缺少用途规则不产生显式空清单', () => {
  const old = structuredClone(legacy); delete old.siteAccess.usageClassificationRules;
  assert.equal(Object.hasOwn(api.readFile('websites', old).profileConfig.siteAccess, 'usageClassificationRules'), false);
  old.siteAccess.usageClassificationRules = [];
  assert.deepEqual(api.readFile('websites', old).profileConfig.siteAccess.usageClassificationRules, []);
});
test('非法混入全局库的新公共文件拒绝', () => assert.throws(() => api.readFile('publicAccess', { ...api.createFile('publicAccess', legacy), systemConfig: system })));
test('域内差异筛选覆盖在线额与 other 用途规则', () => {
  const diffs = [{ area: 'quota', field: 'studyMinutes' }, { area: 'quota', field: 'onlineMinutes' }, { area: 'usage-rule' }, { area: 'autonomy', key: 'softReminderTimeoutAction' }, { area: 'application-policy' }];
  assert.deepEqual(api.filterDiffs('publicAccess', diffs), [diffs[0], diffs[3]]);
  assert.deepEqual(api.filterDiffs('websites', diffs), [diffs[1], diffs[2]]);
});
const context = { childId: 'opaque-child', version: 12, domain: 'publicAccess', instance: 'view-generation' };
test('未改变的条件预览允许使用', () => api.assertContext(context, { ...context }));
for (const field of ['childId', 'version', 'domain', 'instance']) test(`条件预览拒绝 ${field} 改变`, () => assert.throws(() => api.assertContext(context, { ...context, [field]: 'changed' })));
test('缺失或无效配置版本拒绝', () => assert.throws(() => api.assertContext({ ...context, version: null }, context)));
test('公共配额写入保留同日网页限制，不提交其他域', () => {
  const candidate = structuredClone(current); candidate.timeQuota.daily.monday.studyMinutes = 90;
  candidate.timeQuota.daily.monday.onlineMinutes = 0;
  const patch = api.buildPatch('publicAccess', candidate, current, [{ area: 'quota', field: 'studyMinutes', day: 'monday' }]);
  assert.deepEqual(patch, { timeQuota: { daily: { monday: { studyMinutes: 90, compositeMinutes: 40, restMinutes: null, onlineMinutes: 180 } } } });
});
test('网页在线额度保留公共配额且不复制 accountingVersion', () => {
  const candidate = structuredClone(current); candidate.timeQuota.daily.monday.onlineMinutes = 120; candidate.timeQuota.daily.monday.studyMinutes = 0;
  const patch = api.buildPatch('websites', candidate, current, [{ area: 'quota', field: 'onlineMinutes', day: 'monday' }]);
  assert.deepEqual(patch.timeQuota.daily.monday, { studyMinutes: 60, compositeMinutes: 40, restMinutes: null, onlineMinutes: 120 });
  assert.equal(patch.timeQuota.accountingVersion, undefined);
});
test('删除选中字段不清空同日其他配额', () => {
  const candidate = structuredClone(current); delete candidate.timeQuota.daily.monday.studyMinutes;
  assert.deepEqual(api.buildPatch('publicAccess', candidate, current, [{ area: 'quota', field: 'studyMinutes', day: 'monday' }]).timeQuota.daily.monday, { compositeMinutes: 40, restMinutes: null, onlineMinutes: 180 });
});
test('跨域写入与未知公共字段拒绝', () => {
  assert.throws(() => api.buildPatch('publicAccess', current, current, [{ area: 'rule' }]));
  assert.throws(() => api.buildPatch('publicAccess', current, current, [{ area: 'autonomy', key: 'token' }]));
});
test('只修改选中的提醒字段，默认值不覆盖未选字段', () => {
  assert.deepEqual(api.buildPatch('publicAccess', { restConfig: { firstReminderMinutes: 120, repeatReminderMinutes: 60, weeklyFirstReminderMinutes: null } }, current, [{ area: 'rest-reminder', key: 'weeklyFirstReminderMinutes' }]), { restConfig: { weeklyFirstReminderMinutes: null } });
});
test('时段写入保留未选日期和同日其他时段', () => {
  const candidate = { timeWindows: { daily: { monday: { studyWindows: [] } } } };
  assert.deepEqual(api.buildPatch('publicAccess', candidate, current, [{ area: 'time-window', field: 'studyWindows', day: 'monday' }]), { timeWindows: { daily: { monday: { studyWindows: [], compositeWindows: [] }, tuesday: { restWindows: null } } } });
});
test('空选择不生成任何写入或默认值', () => assert.deepEqual(api.buildPatch('publicAccess', {}, current, []), {}));
test('所有投影与兼容封装均不修改输入', () => {
  const before = JSON.stringify({ legacy, current, bundle });
  api.createFile('publicAccess', legacy); api.readFile('websites', bundle);
  api.buildPatch('publicAccess', current, current, [{ area: 'quota', field: 'restMinutes', day: 'monday' }]);
  assert.equal(JSON.stringify({ legacy, current, bundle }), before);
});
console.log(`${count}/${count} 配置域固定回归通过`);

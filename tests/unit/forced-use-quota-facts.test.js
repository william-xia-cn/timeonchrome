'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, dependencies = {}) {
  const exports = {};
  const source = fs.readFileSync(path.resolve(__dirname, '../../extension/core', relative), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, require: name => dependencies[name] });
  return exports;
}
const quotaConfig = load('quota-config.js');
const facts = load('forced-use-quota-facts.js', { './quota-config.js': quotaConfig });
const build = (config, usage, policy) => JSON.parse(JSON.stringify(facts.buildForcedUseQuotaFacts(
  config, usage, policy, { date: '2026-10-15', domain: 'example.com' })));
const hard = (config, usage, policy) => JSON.parse(JSON.stringify(facts.buildForcedUseHardQuotaState(
  config, usage, policy, { date: '2026-10-15' })));
const select = (source, bucket) => JSON.parse(JSON.stringify(facts.selectForcedUseQuotaFacts(source, bucket)));
const finalComposite = source => JSON.parse(JSON.stringify(facts.forcedCompositeFinalRemainingSeconds(source)));
const config = { timeQuota: { daily: { thursday: { studyMinutes: 60, compositeMinutes: 90,
  restMinutes: 120, onlineMinutes: null } }, weekly: { restMinutes: 840 } }, domainQuotas: { 'example.com': 30 } };
const usage = { ok: true, studySeconds: 3600, compositeSeconds: 5400, restSeconds: 120,
  totalSeconds: 9120, weekRestSeconds: 20000, domainSeconds: { 'example.com': 600 } };
const policy = { enabled: true, quotaOverrunMinutes: { dailyStudy: 30, dailyComposite: null,
  dailyRest: 60, dailyOnline: 0, weeklyRest: 120, domain: 0 } };
const result = build(config, usage, policy);
const disabledConfig = { ...config, autonomyConfig: { quotaOverrunConfirmationRequired: false } };
assert(build(disabledConfig, usage, policy).quotas.every(row => row.overrunSeconds === 0));
assert.equal(hard(disabledConfig, usage, policy).state.studyLocked, true);
assert.equal(build({ ...config, autonomyConfig: { quotaOverrunConfirmationRequired: true } }, usage, policy).quotas.find(row => row.id === 'dailyStudy').overrunSeconds, null);
assert.equal(policy.quotaOverrunMinutes.dailyStudy, 30, 'toggle must not rewrite stored allowance');
assert.equal(result.ok, true);
assert.deepEqual(result.quotas.map(row => row.id),
  ['dailyStudy', 'dailyComposite', 'dailyRest', 'weeklyRest', 'domain']);
assert.deepEqual(result.quotas.find(row => row.id === 'dailyStudy'), {
  id: 'dailyStudy', usedSeconds: 3600, limitSeconds: 3600, overrunSeconds: null });
assert.equal(result.quotas.find(row => row.id === 'dailyComposite').overrunSeconds, null);
assert.equal(result.quotas.find(row => row.id === 'domain').limitSeconds, 1800);
assert.deepEqual(select(result, 'study').quotas.map(row => row.id), ['dailyStudy', 'domain']);
assert.deepEqual(select(result, 'composite').quotas.map(row => row.id), ['dailyComposite', 'domain']);
assert.deepEqual(select(result, 'rest').quotas.map(row => row.id), ['dailyRest', 'weeklyRest', 'domain']);
assert.deepEqual(select(result, 'other').quotas.map(row => row.id), ['domain']);
assert.equal(select(result, null).reason, 'quota_bucket_unavailable');
assert.deepEqual(finalComposite(result), { ok: true, seconds: null });
assert.deepEqual(finalComposite(build(config, usage, { ...policy, quotaOverrunMinutes: {
  ...policy.quotaOverrunMinutes, dailyComposite: 30 } })), { ok: true, seconds: null });
assert.equal(finalComposite({ ok: false }).ok, false);
assert.equal(build({ ...config, domainQuotas: { 'example.com': 0 } }, usage, policy)
  .quotas.some(row => row.id === 'domain'), false);
assert.equal(build({ ...config, domainQuotas: { 'example.com': '30' } }, usage, policy)
  .quotas.find(row => row.id === 'domain').limitSeconds, 1800);
assert.equal(build(config, { ...usage, ok: false }, policy).reason, 'quota_facts_unavailable');
assert.equal(build(config, { ...usage, weekRestSeconds: undefined }, policy).reason, 'quota_usage_invalid');
assert.equal(build(config, { ...usage, domainSeconds: {} }, policy).quotas.find(row => row.id === 'domain').usedSeconds, 0);
assert.equal(build(config, { ...usage, domainSeconds: null }, policy).reason, 'domain_usage_invalid');
assert.equal(build(config, usage, { ...policy, quotaOverrunMinutes: { ...policy.quotaOverrunMinutes,
  dailyRest: -1 } }).reason, 'quota_policy_invalid');
assert.equal(build(config, usage, { enabled: false, quotaOverrunMinutes: policy.quotaOverrunMinutes }).reason,
  'quota_facts_unavailable');
assert.deepEqual(hard(config, usage, policy), { ok: true, lockedDomains: [], state: {
  onlineLocked: false, studyLocked: false, undeterminedLocked: false,
  dailyRestLocked: false, weeklyRestLocked: false, restLocked: false } });
assert.equal(hard(config, { ...usage, studySeconds: 5400, domainSeconds: { 'example.com': 1800 } }, policy)
  .state.studyLocked, false);
assert.deepEqual(hard(config, { ...usage, studySeconds: 5400, domainSeconds: { 'example.com': 1800 } }, policy)
  .lockedDomains, []);
assert.equal(hard(config, { ...usage, compositeSeconds: 20000 }, policy).state.undeterminedLocked, false);
console.log('forced-use-quota-facts: passed');
const allConfig = { ...config, timeQuota: { ...config.timeQuota, daily: {
  thursday: { ...config.timeQuota.daily.thursday, onlineMinutes: 10 } } } };
const allUsage = { ...usage, studySeconds: 90000, compositeSeconds: 90000, totalSeconds: 200000,
  domainSeconds: { 'example.com': 90000 } };
const allFacts = build(allConfig, allUsage, policy);
for (const id of ['dailyStudy', 'dailyComposite', 'dailyOnline', 'domain']) {
  assert.equal(allFacts.quotas.find(row => row.id === id).overrunSeconds, null);
}
assert(build({ ...allConfig, autonomyConfig: { quotaOverrunConfirmationRequired: false } },
  allUsage, policy).quotas.every(row => row.overrunSeconds === 0));
assert.equal(hard(config, { ...usage, restSeconds: 10800 }, policy).state.dailyRestLocked, true);
assert.equal(hard(config, { ...usage, weekRestSeconds: 57600 }, policy).state.weeklyRestLocked, true);

// Run with: node tests/unit/site-classification-other-approval.test.js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(
  path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'siteClassificationRequests.ts'),
  'utf8',
).replace(/\r\n/g, '\n');
const start = source.indexOf('export function normalizeSiteClassificationDecisionForWorker');
const end = source.indexOf('\nasync function verifyProfileOwner', start);
assert(start >= 0 && end > start, 'Worker helpers must remain extractable for isolated tests');

const compiled = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = {
  exports: {},
  normalizeSiteClassificationDecision(value) {
    return ['study', 'composite', 'return', 'reject', 'blocked'].includes(value) ? value : null;
  },
  decisionToStatus(value) {
    return ({ study: 'approved_study', composite: 'approved_composite', return: 'returned', reject: 'rejected', blocked: 'blocked' })[value] || null;
  },
};
vm.createContext(context);
vm.runInContext(compiled, context, { filename: 'site-classification-other-approval.vm.js' });
const helpers = context.exports;

assert.equal(helpers.normalizeSiteClassificationDecisionForWorker('other'), 'other');
assert.equal(helpers.normalizeSiteClassificationDecisionForWorker('study'), 'study');
assert.equal(helpers.normalizeSiteClassificationDecisionForWorker('other-ish'), null);
assert.equal(helpers.siteClassificationDecisionStatusForWorker('other'), 'approved_other');
assert.equal(helpers.siteClassificationDecisionStatusForWorker('study'), 'approved_study');

const originalAccessRules = [{ requestId: 'access-1', decision: 'study' }];
const config = {
  siteClassificationRulesV1: originalAccessRules,
  studyList: ['study.example'],
  compositeList: ['composite.example'],
  unsafeList: ['blocked.example'],
};
helpers.upsertOtherUsageClassificationRule(config, 'usage-1', { targetType: 'host', normalizedValue: 'other.example' }, 100);
helpers.upsertOtherUsageClassificationRule(config, 'usage-1', { targetType: 'host', normalizedValue: 'other.example' }, 200);
config.siteUsageClassificationRulesV1.push({
  id: 'stale-usage-rule', requestId: 'older-request', targetType: 'host',
  targetValue: 'other.example', normalizedValue: 'other.example', classification: 'other', createdAt: 50, updatedAt: 50,
});
helpers.upsertOtherUsageClassificationRule(config, 'usage-2', { targetType: 'host', normalizedValue: 'other.example' }, 300);

assert.deepEqual(config.siteClassificationRulesV1, originalAccessRules, 'other attribution must not mutate access rules');
assert.deepEqual(config.studyList, ['study.example']);
assert.deepEqual(config.compositeList, ['composite.example']);
assert.deepEqual(config.unsafeList, ['blocked.example']);
assert.equal(config.siteUsageClassificationRulesV1.length, 1, 'same target approvals must not accumulate duplicate rules');
assert.equal(config.siteUsageClassificationRulesV1[0].requestId, 'usage-2');
assert.equal(config.siteUsageClassificationRulesV1[0].classification, 'other');
assert.equal(config.siteUsageClassificationRulesV1[0].updatedAt, 300);
helpers.removeUsageClassificationRuleForTarget(config, { targetType: 'host', normalizedValue: 'other.example' });
assert.equal(config.siteUsageClassificationRulesV1.length, 0, 'an explicit replacement classification must clear the old usage override');

assert(source.includes("if (decision === 'other') {\n      upsertOtherUsageClassificationRule"), 'other approval must use the separate usage rule store');
assert(source.includes('siteClassificationDecisionStatusForWorker(decision)'), 'other approval response must use approved_other status');
assert(source.includes('removeUsageClassificationRuleForTarget(config, target)'), 'later non-other decisions must remove the old usage-only override');
console.log('site classification other approval: PASS');

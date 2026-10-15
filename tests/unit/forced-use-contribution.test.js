'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.resolve(__dirname, '../../extension/core/forced-use-contribution.js');
const moduleExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: moduleExports });
const plain = value => JSON.parse(JSON.stringify(value));
const derive = (segment, intervals) => plain(moduleExports.deriveForcedUseContribution(segment, intervals));
const add = (book, row) => plain(moduleExports.addForcedUseContribution(book, row));
const summary = (book, input) => plain(moduleExports.summarizeForcedUseDay(book, input));

const segment = { id: 'seg-1', profileId: 'child-1', deviceId: 'device-1', date: '2026-10-15',
  startMs: 100000, endMs: 280000, durationSeconds: 180, channel: 'active',
  domain: 'example.com', managedTargetId: 'target-1' };
const confirmed = { profileId: 'child-1', deviceId: 'device-1', domain: 'example.com',
  managedTargetId: 'target-1', startMs: 100000, endMs: 280000 };

const both = derive(segment, [
  { ...confirmed, ruleId: 'rule-1', causes: ['dailyRest'] },
  { ...confirmed, ruleId: 'rule-1', causes: ['schedule'] },
]);
assert.equal(both.ok, true);
assert.equal(both.contribution.seconds, 180);
assert.deepEqual(both.contribution.byRuleSeconds, { 'rule-1': 180 });
assert.deepEqual(both.contribution.byCauseSeconds, { dailyRest: 180, schedule: 180 });

const partial = derive(segment, [{ ...confirmed, ruleId: 'quota', causes: ['dailyRest'], startMs: 190000 },
  { ...confirmed, ruleId: 'quota', causes: ['dailyRest'], startMs: 200000 }]);
assert.equal(partial.contribution.seconds, 90);
assert.deepEqual(partial.contribution.byRuleSeconds, { quota: 90 });
assert.deepEqual(partial.contribution.byCauseSeconds, { dailyRest: 90 });
assert.equal(derive(segment, [{ ...confirmed, deviceId: 'device-2', ruleId: 'quota' }]).contribution.seconds, 0);
assert.equal(derive({ ...segment, channel: 'backgroundMedia' }, [
  { ...confirmed, ruleId: 'quota' }]).contribution, null);
assert.deepEqual(derive(segment, null), { ok: false, reason: 'intervals_unavailable' });

const first = add({}, both.contribution);
assert.equal(first.ok, true);
assert.equal(add(first.book, both.contribution).duplicate, true);
assert.deepEqual(add(first.book, { ...both.contribution, seconds: 179 }),
  { ok: false, reason: 'contribution_conflict' });
assert.deepEqual(summary(first.book, { profileId: 'child-1', deviceId: 'device-1', date: '2026-10-15' }),
  { seconds: 180, byRuleSeconds: { 'rule-1': 180 },
    byCauseSeconds: { dailyRest: 180, schedule: 180 } });
assert.deepEqual(summary(first.book, { profileId: 'child-1', deviceId: 'device-2', date: '2026-10-15' }),
  { seconds: 0, byRuleSeconds: {}, byCauseSeconds: {} });
console.log('forced-use-contribution: passed');

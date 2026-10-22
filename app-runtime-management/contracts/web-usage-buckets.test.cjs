const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const buckets = require('./web-usage-buckets.cjs');
const snapshot = {
  durationUnit: 'seconds', complete: true, totalDuration: 26,
  categories: [{ classification: 'blocked', duration: 7 }],
  applicationUsage: { nonSpecialTotal: 21,
    nonSpecialCategories: { study: 1, composite: 2, unclassified: 3, restrictedEntertainment: 4, other: 4, blocked: 7 },
    specialTotal: 5, complete: true, reasonCodes: [] },
};
const original = JSON.stringify(snapshot);
const expected = { values: { study: 1, composite: 5, rest: 4, other: 11 }, complete: true };
assert.deepEqual(buckets.application(snapshot), expected);
assert.deepEqual(buckets.application(snapshot), expected, '重复读取不累加');
assert.equal(JSON.stringify(snapshot), original, '不改原总量、黑名单明细及特殊应用小计');
assert.equal(Object.values(expected.values).reduce((a,b) => a+b, 0), 21, '只含nonSpecial，特殊5秒不重复入桶');
const make = (categories, total = 0) => ({ durationUnit: 'seconds', complete: true,
  applicationUsage: { nonSpecialCategories: categories, nonSpecialTotal: total, specialTotal: 0, complete: true } });
assert.deepEqual(buckets.application(make({blocked: 0})), {values:buckets.empty(),complete:true});
assert.deepEqual(buckets.application(make({blocked: 7}, 7)), {values:{study:0,composite:0,rest:0,other:7},complete:true});
assert.equal(buckets.application(make({unknown: 7}, 7)).complete, false, '未知分类不能补进其他');
assert.equal(buckets.application(make({unknown: 7}, 7)).values.other, 0);
for (const value of [-1, 1.2, '7', Number.NaN]) assert.equal(buckets.application(make({blocked:value},7)).values,null);
assert.equal(buckets.application(make({blocked:Number.MAX_SAFE_INTEGER,other:1},1)).values,null, '加和溢出不得通过');
assert.equal(buckets.category({quotaBucket:'blocked'}), null, '不改网页实际quotaBucket解释');
const quotaSchema = JSON.parse(fs.readFileSync(path.join(__dirname,'quota-buckets-v2.schema.json'),'utf8'));
assert.deepEqual(quotaSchema.$defs.buckets.required,['study','composite','rest']);
assert.deepEqual(Object.keys(quotaSchema.$defs.buckets.properties),['study','composite','rest']);
assert.equal(quotaSchema.$defs.buckets.additionalProperties,false, '本次不扩展配额契约');
console.log('web-usage-buckets: PASS (blocked→other仅展示、原总量/明细不变、特殊排除、零/未知/非法及三桶配额边界)');

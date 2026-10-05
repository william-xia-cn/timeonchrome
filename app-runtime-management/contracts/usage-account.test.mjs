import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createUsageAccount, hashUsageAccountValue, canonicalUsageAccountJson,
  parseUsageAccountRows, verifyUsageAccountManifest, validateUsageAccountDimensions,
  usageAccountDayStart, parseUsageAccountReceipt, parseApplicationUsageProjection,
  createUsageAccountV2, verifyUsageAccountManifestV2, parseApplicationUsageSeconds,
  allocateUsageAccountSeconds,parseUsageAccountRowsV2,validateUsageAccountDimensionsV2,
  APPLICATION_STATISTICS_CHILD_SCOPE_CAPABILITY } from './dist/usage-account.js';

const vectors = JSON.parse(readFileSync(new URL('./usage-account.vectors.json', import.meta.url), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('./usage-account.schema.json', import.meta.url), 'utf8'));
assert.equal(schema.additionalProperties, false);
assert.equal(schema.$defs.row.additionalProperties, false);
assert.equal(schema.properties.rowCount.maximum, 10000);
assert.equal(schema.$defs.manifestV2.properties.schemaVersion.const, 2);
assert.equal(schema.$defs.manifestV2.properties.durationUnit.const, 'seconds');
assert.equal(schema.$defs.manifestV2.additionalProperties, false);
assert.equal(APPLICATION_STATISTICS_CHILD_SCOPE_CAPABILITY,'application-statistics-child-scope-v1');
assert.equal(schema.$defs.manifestV2.properties.childId.$ref,'#/$defs/identifier');
assert(!schema.$defs.manifestV2.required.includes('childId'),'旧秒清单仍兼容');
assert.equal(schema.$defs.applicationUsageSeconds.properties.nonSpecialTotal.maximum, 86400);
assert(!schema.$defs.receipt.required.includes('publicationErrorCode'), 'N-1 receipt remains valid');
assert.deepEqual(schema.$defs.receipt.properties.publicationErrorCode.type, ['string', 'null']);
for (const v of vectors.receiptCompatibility.vectors) {
  const value = { ...vectors.receiptCompatibility.base, ...v.patch };
  const original = JSON.stringify(value);
  if (!v.valid) assert.throws(() => parseUsageAccountReceipt(value), /USAGE_ACCOUNT_INVALID_/, v.id);
  else {
    const parsed = parseUsageAccountReceipt(value);
    assert.deepEqual(parsed, value, v.id);
    // N-1 consumers read the original six fields; diagnostics do not change ACK semantics.
    const legacy = Object.fromEntries(schema.$defs.receipt.required.map(key => [key, parsed[key]]));
    assert.equal(legacy.published, value.published);
    assert.equal(legacy.publishStatus, value.publishStatus);
    if (!Object.hasOwn(value, 'publicationErrorCode')) assert(!Object.hasOwn(parsed, 'publicationErrorCode'));
  }
  assert.equal(JSON.stringify(value), original, 'receipt validation cannot mutate ACK');
}
assert.deepEqual(parseUsageAccountReceipt({ ...vectors.receiptCompatibility.base, receivedChunkIndexes: [0] }),
  vectors.receiptCompatibility.base, 'existing status metadata does not alter receipt identity');
const start = usageAccountDayStart('2026-09-27');
const header = { schemaVersion: 1, sourceKind: 'application', durationUnit: 'milliseconds', timezone: 'Asia/Shanghai',
  date: '2026-09-27', revision: 1, generatedAtMs: start + 86400000, settledThroughMs: start + 86400000,
  algorithmVersion: 'app-union-v1', policyVersions: [0], associationVersion: null, correctionVersion: 0,
  rawFactCount: 1, rawFactHash: 'a'.repeat(64), complete: true, reasonCodes: [] };
const row = (kind, hour, duration, category = null, subjectKey = null, displayName = null) =>
  ({ kind, hour, duration, category, subjectKey, displayName });
for (const v of vectors.vectors) {
  const rows = [row('total', null, v.duration), ...Array.from({ length: 24 }, (_, h) => row('total', h, h === v.hour ? v.duration : 0)),
    ...v.categories.flatMap(c => [row('category', null, c.duration, c.category), row('category', v.hour, c.duration, c.category)])];
  const original = JSON.stringify(rows);
  const account = await createUsageAccount({ ...header, sourceKind: v.sourceKind, durationUnit: v.durationUnit,
    policyVersions: v.policyVersions ?? header.policyVersions }, rows);
  assert.equal(validateUsageAccountDimensions(account.rows).total, v.expectedTotal, v.id);
  assert.equal(JSON.stringify(rows), original, 'producer facts not mutated');
  assert.deepEqual(await verifyUsageAccountManifest(account.manifest), account.manifest);
  assert.equal(await hashUsageAccountValue(account.chunks[0].rows), account.chunks[0].chunkHash);
}
assert.equal(canonicalUsageAccountJson(vectors.canonicalHashVector.input), vectors.canonicalHashVector.canonical);
assert.equal(await hashUsageAccountValue(vectors.canonicalHashVector.input), vectors.canonicalHashVector.sha256);
assert.equal(canonicalUsageAccountJson(vectors.unicodeHashVector.input), vectors.unicodeHashVector.canonical);
assert.equal(await hashUsageAccountValue(vectors.unicodeHashVector.input), vectors.unicodeHashVector.sha256);
const totals = [row('total', null, 0), ...Array.from({ length: 24 }, (_, h) => row('total', h, 0))];
const base = await createUsageAccount(header, totals);
const projection = { nonSpecialTotalMs: 0, nonSpecialCategoryMs: { study: 0, other: 0 },
  specialTotalMs: 0, complete: true, reasonCodes: [] };
const attached = await createUsageAccount({ ...header, applicationUsage: projection }, totals);
assert.deepEqual(attached.manifest.applicationUsage, projection);
assert.deepEqual(attached.rows, base.rows, '附属视图不得改变原有统计行');
assert.notEqual(attached.manifest.manifestHash, base.manifest.manifestHash, '视图必须随同一清单签入哈希');
assert(!Object.hasOwn(base.manifest, 'applicationUsage'), '旧统计不猜补为零投影');
await assert.rejects(verifyUsageAccountManifest({ ...attached.manifest,
  applicationUsage: { ...projection, specialTotalMs: 1 } }), /HASH_MISMATCH/);
await assert.rejects(createUsageAccount({ ...header, sourceKind: 'web', durationUnit: 'seconds',
  applicationUsage: projection }, totals), /INVALID_APPLICATION_USAGE/);
assert.throws(() => parseApplicationUsageProjection({ ...projection, remainingMs: 0 }), /INVALID_FIELDS/);
assert.throws(() => parseApplicationUsageProjection({ ...projection, nonSpecialTotalMs: 0.5 }), /INVALID_APPLICATION_USAGE/);
assert.throws(() => parseApplicationUsageProjection({ ...projection, nonSpecialCategoryMs: { study: 1 } }), /INVALID_APPLICATION_USAGE/);
assert.throws(() => parseApplicationUsageProjection({ ...projection, complete: false }), /INVALID_APPLICATION_USAGE/);
assert.deepEqual(parseApplicationUsageProjection({ nonSpecialTotalMs: 10,
  nonSpecialCategoryMs: { study: 10, restrictedEntertainment: 10 }, specialTotalMs: 10,
  complete: true, reasonCodes: [] }).nonSpecialCategoryMs,
  { study: 10, restrictedEntertainment: 10 }, '分类有重叠，不能把类别相加作为总量');
await assert.rejects(verifyUsageAccountManifest({ ...base.manifest, revision: 2 }), /HASH_MISMATCH/);
await assert.rejects(verifyUsageAccountManifest({ ...base.manifest, childId: 'forged' }), /INVALID_FIELDS/);
await assert.rejects(createUsageAccount({ ...header, durationUnit: 'seconds' }, totals), /INVALID_SCHEMA/);
await assert.rejects(createUsageAccount({ ...header, complete: false }, totals), /INVALID_COMPLETENESS/);
const incomplete = await createUsageAccount({ ...header, complete: false, reasonCodes: ['SOURCE_GAP'] }, totals);
assert.equal(incomplete.manifest.complete, false);
assert.throws(() => usageAccountDayStart('2026-02-30'), /INVALID_DATE/);
assert.throws(() => usageAccountDayStart('1969-12-31'), /INVALID_DATE/);
assert.throws(() => validateUsageAccountDimensions([row('total', null, 1), ...totals.slice(1)]), /DIMENSION_MISMATCH/);
assert.throws(() => parseUsageAccountRows([base.rows[0], base.rows[0]]), /DUPLICATE_ROW/);
assert.throws(() => parseUsageAccountRows([{ ...totals[0], duration: 0.5 }]), /INVALID_ROW/);
assert.throws(() => parseUsageAccountRows([{ ...totals[0], path: 'private' }]), /INVALID_FIELDS/);
assert.throws(() => validateUsageAccountDimensions([row('total', null, 1),
  ...Array.from({ length: 24 }, (_, h) => row('total', h, h === 0 ? 1 : 0)),
  row('category', null, 1, 'study'), row('category', 1, 1, 'study')]), /HOUR_EXCEEDS_TOTAL/);
const many = [...totals, ...Array.from({ length: 60 }, (_, n) =>
  [row('subject', null, 0, null, `product-${n}`, `Product ${n}`), row('subject', 0, 0, null, `product-${n}`, `Product ${n}`)]).flat()];
const chunked = await createUsageAccount(header, many);
assert.deepEqual(chunked.chunks.map(c => c.rows.length), [100, 45]);
assert.throws(() => parseUsageAccountRows(Array(10001).fill(totals[0])), /INVALID_ROWS/);
for (const v of vectors.secondAllocationCases) {
  const before = JSON.stringify(v.slices);
  const assigned = allocateUsageAccountSeconds(v.slices, v.totalSeconds);
  assert.deepEqual(assigned, v.expected, v.id);
  assert.equal(assigned.reduce((a, b) => a + b, 0), v.totalSeconds, v.id);
  assert.equal(JSON.stringify(v.slices), before, '秒分配不修改原区间');
}
for(const v of vectors.secondDimensionCases){
  if(v.totalSlices){
    assert.deepEqual(allocateUsageAccountSeconds(v.totalSlices,v.totalSeconds),v.expectedTotal,v.id);
    assert.deepEqual(allocateUsageAccountSeconds(v.subsetSlices,v.subsetSeconds),v.expectedSubset,v.id);
  }else{
    assert.deepEqual([Math.floor((v.boundaryMs-v.interval.startMs)/1000),
      Math.floor((v.interval.endMs-v.boundaryMs)/1000)],v.expectedDailySeconds,v.id);
  }
}
assert.throws(() => allocateUsageAccountSeconds([{startMs:0,endMs:600}], 0.6), /INVALID_SECOND_SLICES/);
assert.throws(() => allocateUsageAccountSeconds([{startMs:600,endMs:0}], 0), /INVALID_SECOND_SLICES/);
assert.throws(() => allocateUsageAccountSeconds([{startMs:0,endMs:1500}], 0), /INVALID_SECOND_TOTAL/);
assert.throws(() => allocateUsageAccountSeconds([{startMs:0,endMs:500}], 2), /INVALID_SECOND_TOTAL/);
const secondHeader = {...header, schemaVersion:2, durationUnit:'seconds', algorithmVersion:'application-seconds-v2'};
const secondRows = [row('total',null,51), ...Array.from({length:24},(_,h)=>row('total',h,h===12?51:0)),
  row('category',null,51,'study'), row('category',12,51,'study'),
  row('category',null,51,'composite'), row('category',12,51,'composite')];
const secondProjection = {nonSpecialTotal:51,nonSpecialCategories:{study:51,composite:51},
  specialTotal:0,complete:true,reasonCodes:[]};
const secondAccount = await createUsageAccountV2({...secondHeader,applicationUsage:secondProjection},secondRows);
for(const vector of vectors.childScopeCases){
  const input={...secondHeader,...vector.patch},before=JSON.stringify(input);
  if(!vector.valid)await assert.rejects(createUsageAccountV2(input,secondRows),/INVALID_CHILD_SCOPE/,vector.id);
  else{
    const scoped=await createUsageAccountV2(input,secondRows);
    assert.deepEqual(await verifyUsageAccountManifestV2(scoped.manifest),scoped.manifest,vector.id);
    assert.equal(Object.hasOwn(scoped.manifest,'childId'),Object.hasOwn(vector.patch,'childId'),vector.id);
    if(Object.hasOwn(vector.patch,'childId')){
      assert.equal(scoped.manifest.childId,vector.patch.childId);
      await assert.rejects(verifyUsageAccountManifestV2({...scoped.manifest,childId:'changed-child'}),/HASH_MISMATCH/);
      const {childId,...removed}=scoped.manifest;
      await assert.rejects(verifyUsageAccountManifestV2(removed),/HASH_MISMATCH/,'冻结孩子不能被移除后复用哈希');
    }
  }
  assert.equal(JSON.stringify(input),before,'校验不改清单归属');
}
// 日内总段900/950ms与子段900/100ms，独立定秒后的小时位置不同。
const boundaryTotal=allocateUsageAccountSeconds([{startMs:0,endMs:900},{startMs:900,endMs:1850}],1);
const boundaryCategory=allocateUsageAccountSeconds([{startMs:0,endMs:900},{startMs:900,endMs:1000}],1);
assert.deepEqual(boundaryTotal,[0,1]);assert.deepEqual(boundaryCategory,[1,0]);
const boundaryRows=[row('total',null,1),...Array.from({length:24},(_,h)=>row('total',h,boundaryTotal[h]??0)),
  row('category',null,1,'study'),row('category',0,1,'study'),
  {...row('subject',null,1,null,'boundary-product','边界产品'),classifications:['study']},
  {...row('subject',0,1,null,'boundary-product','边界产品'),classifications:['study']}];
const boundaryAccount=await createUsageAccountV2(secondHeader,boundaryRows);
assert.equal(validateUsageAccountDimensionsV2(boundaryAccount.rows).total,1);
assert.throws(()=>validateUsageAccountDimensions(boundaryAccount.rows),/HOUR_EXCEEDS_TOTAL/,'v1保留小时上界');
await assert.rejects(createUsageAccountV2(secondHeader,boundaryRows.map(r=>r.kind==='category'?{...r,duration:2}:r)),
  /DIMENSION_EXCEEDS_TOTAL/,'v2保留日级上界');
await assert.rejects(createUsageAccountV2(secondHeader,boundaryRows.map(r=>r.kind==='category'&&r.hour===null?{...r,duration:0}:r)),
  /DIMENSION_MISMATCH/,'v2保留自身日小时守恒');
assert.equal(validateUsageAccountDimensions(secondAccount.rows).total,51);
assert.deepEqual(secondAccount.manifest.applicationUsage,secondProjection,'分类允许重叠，不保存余额');
assert.equal(secondAccount.manifest.generatedAtMs,header.generatedAtMs,'时间戳不转换为秒');
assert.deepEqual(await verifyUsageAccountManifestV2(secondAccount.manifest),secondAccount.manifest);
await assert.rejects(verifyUsageAccountManifest(secondAccount.manifest), /INVALID_SCHEMA/,'旧端拒绝秒清单');
await assert.rejects(verifyUsageAccountManifestV2(base.manifest), /INVALID_SCHEMA/,'新端不得静默误读旧毫秒');
await assert.rejects(verifyUsageAccountManifestV2({...secondAccount.manifest,revision:2}), /HASH_MISMATCH/);
await assert.rejects(createUsageAccountV2({...secondHeader,durationUnit:'milliseconds'},secondRows), /INVALID_SCHEMA/);
await assert.rejects(createUsageAccountV2(secondHeader,secondRows.map(r=>({...r,duration:r.duration+0.125}))), /INVALID_ROW/);
await assert.rejects(createUsageAccountV2(secondHeader,[row('total',null,3601),
  ...Array.from({length:24},(_,h)=>row('total',h,h===0?3601:0))]), /INVALID_ROW/);
assert.throws(()=>parseApplicationUsageSeconds({...secondProjection,nonSpecialTotalMs:51000}), /INVALID_FIELDS/);
assert.throws(()=>parseApplicationUsageSeconds({...secondProjection,remainingSeconds:1}), /INVALID_FIELDS/);
assert.throws(()=>parseApplicationUsageSeconds({...secondProjection,nonSpecialTotal:51.125}), /INVALID_APPLICATION_USAGE/);
assert(!Object.hasOwn((await createUsageAccountV2(secondHeader,secondRows)).manifest,'applicationUsage'),
  '缺失实际用量投影不猜补为零');
const secondChunked=await createUsageAccountV2(secondHeader,many.map(r=>r.kind==='subject'
  ?{...r,classifications:['historicalUnknown']}:r));
assert.deepEqual(secondChunked.chunks.map(c=>c.rows.length),[100,45]);
const subjectSeconds={...row('subject',null,51,null,'product-test','测试产品'),classifications:['composite','study']};
assert.deepEqual(parseUsageAccountRowsV2([subjectSeconds]),[subjectSeconds]);
assert.throws(()=>parseUsageAccountRows([subjectSeconds]), /INVALID_FIELDS/,'v1不能误读v2产品明细');
assert.throws(()=>parseUsageAccountRowsV2([row('subject',null,51,null,'product-test','测试产品')]), /INVALID_FIELDS/);
assert.throws(()=>parseUsageAccountRowsV2([{...subjectSeconds,classifications:['study','study']}]), /INVALID_SUBJECT_CLASSIFICATIONS/);
assert.throws(()=>parseUsageAccountRowsV2([{...subjectSeconds,classifications:['not-a-category']}]), /INVALID_SUBJECT_CLASSIFICATIONS/);
assert.throws(()=>parseUsageAccountRowsV2([{...subjectSeconds,classifications:['study','composite']}]), /INVALID_SUBJECT_CLASSIFICATIONS/);
assert.throws(()=>parseUsageAccountRowsV2([{...row('total',null,51),classifications:['study']}]), /INVALID_FIELDS/);
console.log('usage-account: golden vectors and compatibility/integrity checks passed');

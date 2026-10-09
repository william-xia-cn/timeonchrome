import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { APPLICATION_CHECKPOINT_SECONDS, APPLICATION_RECOVERY_SECONDS, parseApplicationLedgerSegment,
  canonicalApplicationLedgerJson, applicationLedgerSegmentId, verifyApplicationLedgerSegment,
  applicationLedgerKey, splitApplicationLedgerDays, allocateApplicationLedgerHours,
  applicationLedgerDayStart, parseApplicationObservationSegment, canonicalApplicationObservationJson,
  applicationObservationSegmentId, verifyApplicationObservationSegment, programInstanceId,
  canonicalProgramInstanceJson, parseProgramObservationResolution, applicationObservationSubject } from './dist/application-ledger.js';

const vectors = JSON.parse(readFileSync(new URL('./application-ledger.vectors.json', import.meta.url), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('./application-ledger-v3.schema.json', import.meta.url), 'utf8'));
const oldSchemaText = readFileSync(new URL('./runtime-accounting-v2.schema.json', import.meta.url), 'utf8');
assert.equal(schema.additionalProperties, false);
assert.equal(schema.properties.schemaVersion.const, 3);
assert.equal(schema.properties.durationSeconds.maximum, APPLICATION_CHECKPOINT_SECONDS);
assert.deepEqual(schema.properties.estimated.properties.cappedAtSeconds.enum, [APPLICATION_RECOVERY_SECONDS, null]);
assert(!Object.hasOwn(schema.properties, 'monotonicDurationMilliseconds'));
assert(!schema.required.includes('policySnapshot'));
assert.equal(JSON.parse(oldSchemaText).$defs.usageSegment.properties.schemaVersion.const, 2);
assert(JSON.parse(oldSchemaText).$defs.usageSegment.required.includes('monotonicDurationMilliseconds'));
assert.equal(APPLICATION_CHECKPOINT_SECONDS, vectors.rules.checkpointSeconds);
assert.equal(APPLICATION_RECOVERY_SECONDS, vectors.rules.estimateSeconds);
const base = vectors.hashVector.segment;
const before = JSON.stringify(base);
const observed={...base,schemaVersion:4,application:{platform:'windows',observationRef:'1'.repeat(32)}};
observed.id=await applicationObservationSegmentId(observed);
assert.deepEqual(observed,vectors.observationHashVector.segment);
assert.equal(canonicalApplicationObservationJson(observed),vectors.observationHashVector.canonical);
const observationSchema=JSON.parse(readFileSync(new URL('./application-ledger-v4.schema.json',import.meta.url),'utf8'));
assert.equal(observationSchema.properties.schemaVersion.const,4);
assert.deepEqual(observationSchema.properties.application.required,['platform','observationRef']);
assert.equal(observationSchema.properties.application.additionalProperties,false);
assert.deepEqual(await verifyApplicationObservationSegment(observed),observed);
assert.notEqual(observed.id,base.id);
assert.throws(()=>parseApplicationLedgerSegment(observed),/APPLICATION_LEDGER_INVALID/);
assert.throws(()=>parseApplicationObservationSegment(base),/APPLICATION_LEDGER_INVALID/);
assert.throws(()=>parseApplicationObservationSegment({...observed,application:{...observed.application,productId:'claimed'}}),/APPLICATION_LEDGER_INVALID/);
assert.throws(()=>parseApplicationObservationSegment({...observed,durationSeconds:180.1}),/APPLICATION_LEDGER_INVALID/);
assert.throws(()=>parseApplicationObservationSegment({...observed,application:{...observed.application,observationRef:'C:/private'}}),/APPLICATION_LEDGER_INVALID/);
await assert.rejects(verifyApplicationObservationSegment({...observed,childId:'another-child'}),/APPLICATION_LEDGER_INVALID/);
assert.equal(createHash('sha256').update(canonicalApplicationObservationJson(observed)).digest('hex'),observed.id);
const descriptor={machineId:'machine-a',platform:'windows',locationRef:'2'.repeat(32),executableSha256:'a'.repeat(64)};
const instance=await programInstanceId(descriptor);
assert.deepEqual(descriptor,vectors.programInstanceVector.descriptor);
assert.equal(instance,vectors.programInstanceVector.id);
assert.equal(createHash('sha256').update(canonicalProgramInstanceJson(descriptor)).digest('hex'),instance);
for(const change of [{machineId:'machine-b'},{locationRef:'3'.repeat(32)},{executableSha256:'b'.repeat(64)}])
  assert.notEqual(await programInstanceId({...descriptor,...change}),instance);
await assert.rejects(programInstanceId({...descriptor,childId:'child-a'}),/APPLICATION_LEDGER_INVALID/);
await assert.rejects(programInstanceId({...descriptor,path:'C:/private/app.exe'}),/APPLICATION_LEDGER_INVALID/);
const observedBefore=JSON.stringify(observed);
await programInstanceId(descriptor); // 内容确认在原账之外，不改变原账字节或ID。
assert.equal(JSON.stringify(observed),observedBefore);
const resolution={observationRef:observed.application.observationRef,instance:descriptor};
for (const platform of [['windows'], {toString:()=> 'windows'}, new String('macos'), null, 0]) {
  assert.throws(()=>parseProgramObservationResolution({...resolution,instance:{...descriptor,platform}}),/APPLICATION_LEDGER_INVALID/);
  assert.throws(()=>parseApplicationObservationSegment({...observed,application:{...observed.application,platform}}),/APPLICATION_LEDGER_INVALID/);
}
assert.deepEqual(parseProgramObservationResolution(resolution),resolution);
assert.notEqual(parseProgramObservationResolution(resolution).instance,descriptor);
const unresolvedSubject=await applicationObservationSubject('machine-a','windows',resolution.observationRef);
assert.match(unresolvedSubject,/^observation:[a-f0-9]{64}$/);
assert.notEqual(await applicationObservationSubject('machine-b','windows',resolution.observationRef),unresolvedSubject);
assert.equal(await applicationObservationSubject('machine-a','windows',resolution.observationRef,resolution),`instance:${instance}`);
assert.equal(await applicationObservationSubject('machine-a','windows','4'.repeat(32),{...resolution,observationRef:'4'.repeat(32)}),`instance:${instance}`);
await assert.rejects(applicationObservationSubject('machine-b','windows',resolution.observationRef,resolution),/APPLICATION_LEDGER_INVALID/);
await assert.rejects(applicationObservationSubject('machine-a','macos',resolution.observationRef,resolution),/APPLICATION_LEDGER_INVALID/);
await assert.rejects(applicationObservationSubject('machine-a','windows','5'.repeat(32),resolution),/APPLICATION_LEDGER_INVALID/);
assert.throws(()=>parseProgramObservationResolution({...resolution,instanceId:instance}),/APPLICATION_LEDGER_INVALID/);
assert.equal(JSON.stringify(observed),observedBefore,'解析只关联事实，不覆盖原账');
assert.equal(canonicalApplicationLedgerJson(base), vectors.hashVector.canonical);
assert.equal(createHash('sha256').update(vectors.hashVector.canonical, 'utf8').digest('hex'), base.id);
assert.equal(await applicationLedgerSegmentId(base), base.id);
assert.deepEqual(await verifyApplicationLedgerSegment(base), base);
assert.deepEqual(applicationLedgerKey(base), ['child-a', base.id]);
assert.equal(JSON.stringify(base), before, '解析和哈希不修改原账');
for (const change of [{ childId: 'child-b' }, { source: { ...base.source, machineId: 'machine-b' } },
  { source: { ...base.source, localUserId: 'user-b' } }]) {
  assert.notEqual(await applicationLedgerSegmentId({ ...base, ...change }), base.id);
  await assert.rejects(verifyApplicationLedgerSegment({ ...base, ...change }), /APPLICATION_LEDGER_INVALID/);
}
const invalid = [
  { ...base, childId: null }, { ...base, childId: '' }, { ...base, childId: 'child\n' },
  { ...base, durationSeconds: 180.5 }, { ...base, durationSeconds: 179 },
  { ...base, monotonicDurationMilliseconds: 180000 }, { ...base, schemaVersion: 2 },
  { ...base, source: { ...base.source, sid: 'not-an-allowed-field' } },
  { ...base, policySnapshot: {} }, { ...base, date: '2026-02-30' },
  { ...base, date: '2026-10-06' }, { ...base, estimated: { isEstimated: true, reason: null, cappedAtSeconds: 90 } },
  { ...base, estimated: { isEstimated: true, reason: 'failed', cappedAtSeconds: 90 } }
];
for (const value of invalid) assert.throws(() => parseApplicationLedgerSegment(value), /APPLICATION_LEDGER_INVALID/);
const estimate = { ...base, endWallTimeMs: base.startWallTimeMs + 90000,
  endMonotonicTimeMs: base.startMonotonicTimeMs + 90000, durationSeconds: 90,
  endReason: 'serviceRecovery', estimated: { isEstimated: true, reason: 'serviceRecovery', cappedAtSeconds: 90 } };
assert.equal(parseApplicationLedgerSegment(estimate).durationSeconds, 90);

// 仅读取现有网页纯函数作对照，不接触Chrome、真实storage或网页记账线。
let webCode = readFileSync(new URL('../../extension/core/usage-segments.js', import.meta.url), 'utf8');
webCode = webCode.replace(/^\s*import .*?;\s*$/gm, '').replace(/export\s+(?=(?:async\s+)?function|const|let|class)/g, '');
const web = new Function('hashUsageSegmentContent', 'isUsageSegmentContentHash', `${webCode}\nreturn { splitSegmentByLocalDate, splitSegmentByLocalHour };`)(
  () => 'a'.repeat(64), value => /^[a-f0-9]{64}$/.test(value));
const pick = value => value.map(s => ({ date: s.date, startMs: s.startMs, endMs: s.endMs, durationSeconds: s.durationSeconds }));
const start = applicationLedgerDayStart('2026-10-05');
assert.equal(start, vectors.dayStartMs);
for (const v of vectors.dayVectors) {
  const input = { startMs: start + v.startOffsetMs, endMs: start + v.endOffsetMs,
    timezone: 'Asia/Shanghai', sourceState: 'ACTIVE', channel: 'active', domain: 'isolated.invalid' };
  const actual = splitApplicationLedgerDays(input.startMs, input.endMs);
  assert.deepEqual(actual.map(s => s.durationSeconds), v.expectedSeconds, v.id);
  assert.deepEqual(actual, pick(web.splitSegmentByLocalDate(input)), `${v.id}: 与网页实际日分段一致`);
}
for (const v of vectors.hourVectors) {
  const input = { startMs: start + v.startOffsetMs, endMs: start + v.endOffsetMs,
    timezone: 'Asia/Shanghai', durationSeconds: v.durationSeconds };
  const actual = allocateApplicationLedgerHours(input.startMs, input.endMs, input.durationSeconds);
  const expected = web.splitSegmentByLocalHour(input).map(s => ({ hour: s.hour, startMs: s.startMs, endMs: s.endMs, durationSeconds: s.durationSeconds }));
  assert.deepEqual(actual.map(s => s.durationSeconds), v.expectedSeconds, v.id);
  assert.deepEqual(actual, expected, `${v.id}: 与网页实际小时分配一致`);
  assert.equal(actual.reduce((sum, s) => sum + s.durationSeconds, 0), v.durationSeconds);
}
assert.throws(() => allocateApplicationLedgerHours(start, start + 1000, 2), /APPLICATION_LEDGER_INVALID/);
assert.throws(() => allocateApplicationLedgerHours(start, start + 86400001, 86400), /APPLICATION_LEDGER_INVALID/);
assert.equal(readFileSync(new URL('./runtime-accounting-v2.schema.json', import.meta.url), 'utf8'), oldSchemaText);
console.log(`application-ledger v3 PASS: 哈希/归属/单位拒绝及${vectors.dayVectors.length + vectors.hourVectors.length}项网页真实纯函数对照；Native切片/改绑/实机须独立验收。`);

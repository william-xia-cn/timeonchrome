'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const url = f => pathToFileURL(path.join(root, f)).href;
const clone = v => structuredClone(v);
async function run() {
  const archive = process.argv[2];
  const golden = {"executionPreparation":{"schemaVersion":1,"basisRevision":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","policyIdentity":{"schemaVersion":1,"revision":"profile-config:8","effectiveAtMs":0,"stage":"shadow","policyHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"projection":{"basisRevision":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","policyRevision":"profile-config:8","complete":true,"reasonCodes":[],"days":[{"date":"2026-09-28","complete":true,"reasonCodes":[],"usedMs":{"study":1200000,"composite":0,"rest":0},"remainingMs":{"study":null,"composite":null,"rest":null},"borrowedRestMs":0}],"week":{"fromDate":"2026-09-28","toDate":"2026-09-28","restUsedMs":0,"restRemainingMs":null}},"transportStatus":"online","replacementVersions":[{"source":"web","sourceKey":"web:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","date":"2026-09-28","revisionOrdinal":2,"contentRevision":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"},{"source":"application","sourceKey":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","date":"2026-09-28","revisionOrdinal":3,"contentRevision":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}],"reasonCodes":[],"executionEnabled":false},"executionIdentityHash":"4c0f9512a8fef4f4bcf5481f4f60804ef410e1f6f453a948ca02c4fe05765e4d"};
  let v = golden;
  if (archive) {
    const bytes = fs.readFileSync(archive);
    assert.equal(bytes.length, 109153);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), '83138e4e8b66cebc8331ac6b87cc4b58a2b9f1f2169c976b1eb440f8915984d7');
    v = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/shared-web-sync.vectors.json'], { encoding: 'utf8' }));
    assert.deepEqual(v.executionPreparation, golden.executionPreparation);
    assert.equal(v.executionIdentityHash, golden.executionIdentityHash);
    await checkFinalVectors(archive);
  }
  const { sharedQuotaExecutionIdentityV1: identity } = await import(url('extension/core/shared-contracts/1.30.0/shared-web-sync.js'));
  const base = v.executionPreparation;
  assert.equal(await identity(base), v.executionIdentityHash);
  const offline = clone(base); offline.transportStatus = 'offline'; offline.replacementVersions.reverse();
  assert.equal(await identity(offline), v.executionIdentityHash, 'transport/order must not refresh identity');
  for (const mutate of [
    x => { x.policyIdentity.effectiveAtMs++; },
    x => { x.policyIdentity.policyHash = '1'.repeat(64); },
    x => { x.replacementVersions[0].revisionOrdinal++; },
    x => { x.replacementVersions[0].contentRevision = '2'.repeat(64); },
    x => { x.projection.days[0].usedMs.study -= 1000; },
  ]) {
    const changed = clone(base); mutate(changed);
    assert.notEqual(await identity(changed), v.executionIdentityHash);
  }
  for (const mutate of [
    x => { x.executionEnabled = true; },
    x => { x.projection.complete = false; },
    x => { x.reasonCodes = ['INCOMPLETE']; },
    x => { x.replacementVersions.push(clone(x.replacementVersions[0])); },
    x => { x.projection.days[0].usedMs.rest = -1; },
    x => { x.transportStatus = 'unavailable'; },
  ]) {
    const invalid = clone(base); mutate(invalid);
    await assert.rejects(identity(invalid));
  }
  let preparation = clone(base), reads = 0, duringFact = null, fact = { active: true, key: 'same-page' };
  globalThis.__executionIdentityFixture = {
    read: async () => { reads++; return clone(preparation); },
    activity: () => ({ leaseId: 'lease', activityId: 'activity', key: 'same-page', active: true }),
    fact: async () => { duringFact?.(); return fact; },
  };
  const source = fs.readFileSync(path.join(root, 'extension/product/shared-browser-execution-preparation.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '');
  const module = await import('data:text/javascript;base64,' + Buffer.from(
    `import { sharedQuotaExecutionIdentityV1 } from '${url('extension/core/shared-contracts/1.30.0/shared-web-sync.js')}';\n`
    + 'const f=globalThis.__executionIdentityFixture; const readSharedAccessRuntime=async()=>{const p=await f.read();return {ok:true,policy:{revision:p.policyIdentity.revision},executionRevision:await sharedQuotaExecutionIdentityV1(p)}};\n'
    + 'const inspectSharedBrowserActivity=f.activity,readBrowserRestActivity=f.fact,getSharedBrowserActivityLease=()=>"lease",hasSharedReminderContinuityCapability=()=>false;\n'
    + source).toString('base64'));
  const state = { policyRevision: 'untrusted-service-revision', stateRevision: 'untrusted-cloud-basis' };
  const current = await module.readBrowserExecutionContext(state);
  assert.equal(current.stateRevision, v.executionIdentityHash);
  assert.equal(current.policyRevision, base.policyIdentity.revision);
  assert.equal(current.restEligible, true);
  assert.equal(reads, 2, 'capture again after async activity check');
  duringFact = () => { preparation.replacementVersions[0].revisionOrdinal++; };
  assert.equal((await module.readBrowserExecutionContext(state)).restEligible, false,
    'new contribution during activity read must invalidate old balance');
  duringFact = null;
  fact = { active: false, key: 'same-page' };
  assert.equal((await module.readBrowserExecutionContext(state)).restEligible, false);
  preparation.projection.complete = false;
  await assert.rejects(module.readBrowserExecutionContext(state));
  delete globalThis.__executionIdentityFixture;
  console.log('Shared execution identity: fixed vectors, replacement changes, strict completeness and real context PASS');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

async function checkFinalVectors(archive) {
  const read = name => JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/' + name], { encoding: 'utf8' }));
  const access = await import(url('extension/core/shared-contracts/1.30.0/shared-access.js'));
  const execution = await import(url('extension/core/shared-contracts/1.30.0/shared-quota-execution.js'));
  const lifecycle = await import(url('extension/core/shared-contracts/1.30.0/shared-reminder-lifecycle.js'));
  const consumer = await import(url('extension/core/shared-browser-execution.js'));
  const vectors = read('shared-quota-execution.vectors.json');
  const policy = { ...access.projectLegacySharedAccessPolicy({}, 1, 0), stage: 'shared' };
  for (const c of vectors.admissionCases) {
    const p = clone(policy), nature = c.category === 'restrictedEntertainment' ? 'rest'
      : c.category === 'study' ? 'study' : 'composite';
    p.timeWindows.monday[nature] = c.windows;
    const day = { date: '2026-09-28', complete: c.complete !== false,
      remainingMs: { study: c.study ?? null, composite: c.composite ?? null, rest: c.rest ?? null } };
    assert.deepEqual(access.sharedAccessAdmissionV1(p, day,
      { complete: c.complete !== false, restRemainingMs: c.weekRest ?? null }, c.category, c.minute, c.objectAllowed !== false),
    { decision: c.decision, reasonCode: c.reason, quotaBucket: c.bucket }, c.name);
  }
  const previous = { scopeRevision: 'current-scope', policyIdentity: await access.createSharedAccessPolicyIdentityV1(policy),
    fromDate: '2026-09-28', toDate: '2026-09-28', sources: vectors.sourceEntries.map(entry => ({ ...clone(entry),
      contribution: { ...clone(entry.contribution), date: '2026-09-28', policyRevision: policy.revision } })) };
  for (const c of vectors.continuityCases) {
    const next = clone(previous), entry = next.sources[0], fact = entry.contribution;
    switch (c.change) {
      case 'growth': entry.revisionOrdinal++; fact.bucketsMs.rest += 1000; fact.statisticsRevision = 'next'; break;
      case 'reorder': next.sources.reverse(); break;
      case 'lower': entry.revisionOrdinal++; fact.bucketsMs.rest -= 1000; break;
      case 'correction': fact.correctionRevision = 'next'; break;
      case 'association': next.sources[1].contribution.productAssociationVersion = 'next'; break;
      case 'missing': next.sources.pop(); break;
      case 'scope': next.scopeRevision = 'other'; break;
      case 'policy': next.policyIdentity.policyHash = '0'.repeat(64); break;
      case 'incomplete': fact.complete = false; break;
      case 'ordinal': entry.revisionOrdinal = 0; break;
      case 'conflict': fact.statisticsRevision = 'other'; break;
      case 'settlement': entry.revisionOrdinal++; fact.settledAtMs = 0; break;
    }
    assert.equal(execution.sharedQuotaReminderContinuityV1(previous, next), c.expected, c.name);
  }
  const v = read('shared-reminder-lifecycle.vectors.json'), revision = v.continuity.currentStateRevision;
  const state = { ...v.state, ...v.browserExecution.statePatch };
  const browser = { ...v.browserActivity.context, bootId: v.context.bootId, monotonicNowMs: 10000,
    current: { message: v.browserActivity.message, receivedMonotonicMs: 10000, bootId: v.context.bootId } };
  const context = { ...v.context, monotonicNowMs: 10000, state, currentStateRevision: revision,
    continuousUsageGrowth: { triggerStateRevision: state.stateRevision, currentStateRevision: revision } };
  const target = { ...v.browserExecution.target, continuitySupported: true };
  const issued = lifecycle.authorizeSharedBrowserExecution(context, browser, target);
  assert.equal(issued.triggerStateRevision, state.stateRevision);
  for (const c of v.continuity.cases) {
    if (c.operation === 'authorize') {
      const ctx = { ...context, currentPolicyRevision: c.policyRevision ?? context.currentPolicyRevision,
        continuousUsageGrowth: c.continuity === false ? undefined : { ...context.continuousUsageGrowth,
          currentStateRevision: c.continuityCurrent ?? revision } };
      assert.equal(lifecycle.authorizeSharedBrowserExecution(ctx, browser,
        { ...target, continuitySupported: c.supported !== false })?.effect ?? null, c.expectedEffect, c.name);
    } else {
      const ctx = { ...v.browserExecution.consumer, attemptedIds: new Set(), continuitySupported: c.supported !== false,
        stateRevision: c.currentRevision ?? revision, reminder: { ...state, stateRevision: c.triggerRevision ?? state.stateRevision } };
      const result = lifecycle.sharedBrowserExecutionEligibility(issued, ctx);
      assert.equal(result.eligible, c.expectedEligible, c.name);
      assert.deepEqual(consumer.sharedBrowserExecutionEligibility(issued, ctx), result, c.name);
    }
  }
  const ack = { ...issued, outcome: 'completed' };
  for (const field of ['targetSource', 'effect', 'maxAgeMs']) delete ack[field];
  assert.equal(consumer.validateSharedBrowserExecutionOutcome(issued, ack).ok, true);
  delete ack.triggerStateRevision;
  assert.equal(consumer.validateSharedBrowserExecutionOutcome(issued, ack).ok, false);
  console.log('Final contract: 13 admission / 12 continuity / 9 permit vectors and trigger ACK PASS');
}

'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const url = f => pathToFileURL(path.join(root, f)).href;
const clone = v => structuredClone(v);
async function run() {
  const contract = await import(url('extension/core/shared-contracts/1.30.0/shared-access.js'));
  const identity = await import(url('extension/core/shared-contracts/1.30.0/shared-web-sync.js'));
  let source = fs.readFileSync(path.join(root, 'extension/product/shared-access-runtime.js'), 'utf8');
  source = source.replace(/^import .*;\r?\n/gm, '').replace(/^import[\s\S]*?;\r?\n/gm, '');
  source = `import {matchesSharedAccessPolicyIdentityV1} from '${url('extension/core/shared-contracts/1.30.0/shared-access.js')}';\n`
    + `import {sharedQuotaExecutionIdentityV1} from '${url('extension/core/shared-contracts/1.30.0/shared-web-sync.js')}';\n`
    + 'const readLocalSharedQuotaPreparation=async()=>null,readSharedWebSourceBinding=async()=>null,readSharedAccessPolicyLkg=async()=>null,requestSharedQuotaState=async()=>null,getSharedBrowserActivityLease=()=>null,browserExecutionFence={invalidate(){}};\n' + source;
  const runtime = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const date = '2026-09-28';
  const policy = { ...contract.projectLegacySharedAccessPolicy({ timeQuota: { daily: {
    monday: { studyMinutes: null, compositeMinutes: 120, restMinutes: 120 },
  } } }, 8, 0), stage: 'shared' };
  const policyIdentity = await contract.createSharedAccessPolicyIdentityV1(policy);
  const web = { source: 'web', sourceKey: 'web:' + 'a'.repeat(64), date, revisionOrdinal: 2, contentRevision: 'b'.repeat(64) };
  const app = { source: 'application', sourceKey: 'c'.repeat(64), date, revisionOrdinal: 3, contentRevision: 'd'.repeat(64) };
  const local = { schemaVersion: 1, basisRevision: 'e'.repeat(64), policyIdentity, transportStatus: 'online', reasonCodes: [], executionEnabled: false,
    replacementVersions: [web], projection: { basisRevision: 'e'.repeat(64), policyRevision: policy.revision, complete: true, reasonCodes: [],
      days: [{ date, complete: true, reasonCodes: [], usedMs: { study: 0, composite: 0, rest: 600000 },
        remainingMs: { study: null, composite: 7200000, rest: 6600000 }, borrowedRestMs: 0 }],
      week: { fromDate: date, toDate: date, restUsedMs: 600000, restRemainingMs: null } } };
  const combined = clone(local); combined.replacementVersions.push(app);
  combined.projection.days[0].usedMs.rest = 1200000; combined.projection.days[0].remainingMs.rest = 6000000;
  combined.projection.week.restUsedMs = 1200000;
  let reply = { ok: true, policyIdentityStatus: 'available', sharedAccessPolicyIdentity: policyIdentity, sharedQuotaPreparation: clone(combined) };
  let binding = { ok: true, webSourceKey: web.sourceKey, applicationSourceKey: app.sourceKey, connectionHash: 'f'.repeat(64) };
  let lease = 'lease', revokes = 0;
  const options = { enabled: true, readLocal: async () => clone(local), readPolicy: async () => ({ ok: true, policy }),
    readBinding: async () => clone(binding), native: async () => clone(reply), readLease: () => lease, fence: { invalidate() { revokes++; } } };
  const modelReader = runtime.createSharedAccessRuntime(options);
  const model = await modelReader.read(date);
  assert.equal(model.ok, true);
  assert.equal(model.executionRevision, await identity.sharedQuotaExecutionIdentityV1(combined));
  const projected = runtime.projectSharedRuntimeQuota({ timeQuota: { daily: { monday: { onlineMinutes: 240 } } } }, model,
    { totalMinutes: 10, totalSeconds: 600, domainSeconds: { example: 600 } }, date);
  assert.equal(projected.usage.restSeconds, 1200); assert.equal(projected.usage.totalSeconds, 600);
  assert.deepEqual(projected.usage.domainSeconds, { example: 600 });
  assert.equal(projected.config.timeQuota.daily.monday.onlineMinutes, 240);
  reply.sharedQuotaPreparation.replacementVersions[1].revisionOrdinal++;
  reply.sharedQuotaPreparation.projection.days[0].usedMs.rest -= 1000;
  reply.sharedQuotaPreparation.projection.week.restUsedMs -= 1000;
  assert.equal((await modelReader.read(date)).ok, true, 'higher version can reduce use');
  assert.equal(revokes, 1);
  reply.sharedQuotaPreparation.replacementVersions[0].revisionOrdinal++;
  assert.equal((await modelReader.read(date)).errorCode, 'shared_access_web_version_changed');
  reply = { ok: true, policyIdentityStatus: 'available', sharedAccessPolicyIdentity: policyIdentity, sharedQuotaPreparation: clone(combined) };
  reply.sharedQuotaPreparation.replacementVersions[1].sourceKey = '0'.repeat(64);
  assert.equal((await modelReader.read(date)).errorCode, 'shared_access_application_scope_unverified');
  lease = null;
  assert.equal((await modelReader.read(date)).ok, false);
  assert.equal((await runtime.createSharedAccessRuntime({ ...options, enabled: false }).read(date)).errorCode, 'shared_access_execution_disabled');
  const consumerConfig = { enabled: true, domainQuotas: { example: 1 }, timeQuota: { accountingVersion: 1,
    daily: { monday: { studyMinutes: 1, restMinutes: 1, compositeMinutes: 1, onlineMinutes: 240 } } } };
  globalThis.__sharedQuotaConsumer = { model: clone(model), config: consumerConfig, project: runtime.projectSharedRuntimeQuota };
  const quotaSource = fs.readFileSync(path.join(root, 'extension/product/quota.js'), 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  const quota = await import('data:text/javascript;base64,' + Buffer.from(
    `import {getEffectiveQuotaForDate} from '${url('extension/core/quota-config.js')}';\n`
    + 'const g=globalThis.__sharedQuotaConsumer;const isSharedAccessRuntimeEnabled=()=>true,readSharedAccessRuntime=async()=>g.model,projectSharedRuntimeQuota=g.project,getConfig=async()=>g.config;\n'
    + 'const readQuotaReadModelV2=async()=>({ok:true,usage:{ok:true,totalMinutes:10,totalSeconds:600,domainSeconds:{example:600}}});\n'
    + `const getQuotaCalendarContext=()=>({date:'${date}',weekStart:'${date}'}),CLOUD_QUOTA_STATE_FACT_KEY='unused',chrome={storage:{local:{remove:async()=>{}}}};\n`
    + quotaSource).toString('base64'));
  const evaluated = await quota.evaluateQuotaState();
  assert.equal(evaluated.sharedRuntime, true); assert.equal(evaluated.usage.restSeconds, 1200);
  assert.equal(evaluated.newState.restLocked, false, 'actual caller uses shared 120 minute limit, not stale 1 minute config');
  assert.deepEqual(evaluated.lockedDomains, ['example']); assert.equal(evaluated.newState.onlineLocked, false);
  globalThis.__sharedQuotaConsumer.model.preparation.projection.days[0].usedMs.rest = 7200000;
  globalThis.__sharedQuotaConsumer.model.preparation.projection.week.restUsedMs = 7200000;
  assert.equal((await quota.evaluateQuotaState()).newState.restLocked, true);
  globalThis.__sharedQuotaConsumer.model.policy.dailyMinutes.monday.rest = 240;
  assert.equal((await quota.evaluateQuotaState()).newState.restLocked, false, 'raised limit releases local derived restriction');
  globalThis.__sharedQuotaConsumer.model = { ok: false };
  assert.equal((await quota.evaluateQuotaState()).accountingUnavailable, true);
  delete globalThis.__sharedQuotaConsumer;
  console.log('Shared access runtime: trusted replacements, policy, isolation, quotas and revocation PASS');
}
run().catch(e => { console.error(e); process.exitCode = 1; });

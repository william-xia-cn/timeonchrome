'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const url = f => pathToFileURL(path.join(root, f)).href;
const clone = v => structuredClone(v);
async function run() {
  const quotaContractPath = process.env.TIMEONCHROME_SOURCE_STATISTICS_CONTRACT_PATH;
  if (quotaContractPath) {
    const ts = require('typescript');
    const js = ts.transpileModule(fs.readFileSync(quotaContractPath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    globalThis.__sharedBucketsContract = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  } else globalThis.__sharedBucketsContract = await import(url('extension/core/shared-contracts/1.55.0/source-statistics.js'));
  const contract = await import(url('extension/core/shared-contracts/1.30.0/shared-access.js'));
  const identity = await import(url('extension/core/shared-contracts/1.30.0/shared-web-sync.js'));
const v2Contract = await import(url('extension/core/shared-contracts/1.54.0/shared-access.js'));
  let source = fs.readFileSync(path.join(root, 'extension/product/shared-access-runtime.js'), 'utf8');
  source = source.replace(/^import .*;\r?\n/gm, '').replace(/^import[\s\S]*?;\r?\n/gm, '');
  source = `import {matchesSharedAccessPolicyIdentityV1} from '${url('extension/core/shared-contracts/1.30.0/shared-access.js')}';\n`
    + `import {canonicalSharedAccessPolicyV2,createSharedAccessPolicyIdentityV2} from '${url('extension/core/shared-contracts/1.54.0/shared-access.js')}';\n`
    + `import {projectIndependentSharedQuotaSeconds,sourceStatisticsDates} from '${url('extension/core/shared-contracts/1.54.0/source-statistics.js')}';\n`
    + `import {sharedQuotaExecutionIdentityV1} from '${url('extension/core/shared-contracts/1.30.0/shared-web-sync.js')}';\n`
    + 'const sourceStatisticsContract=globalThis.__sharedBucketsContract;const readLocalSharedQuotaPreparation=async()=>null,readSharedWebSourceBinding=async()=>null,readSharedAccessPolicyLkg=async()=>null,requestSharedQuotaState=async()=>null,getSharedBrowserActivityLease=()=>null,browserExecutionFence={invalidate(){}};\n' + source;
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
  const v2Policy = v2Contract.projectSharedAccessPolicyV2({ timeQuota: { daily: { monday: {
    studyMinutes: null, compositeMinutes: 1, restMinutes: 120 } }, weekly: { restMinutes: 840 } },
    forcedUsePolicyV1: { schemaVersion: 1, enabled: true, reminderIntervalMinutes: 30,
      quotaOverrunMinutes: { dailyStudy: null, dailyComposite: null, dailyRest: null,
        dailyOnline: null, weeklyRest: null, domain: null }, advisoryWindowDailyMaxMinutes: null } }, 8, 0);
  const snapshot = (kind, categoriesSeconds) => ({ schemaVersion: 1, durationUnit: 'seconds', source: kind,
    childId: 'fixture-child', fromDate: date, toDate: date, revision: kind + '-1', readAtMs: 1000,
    includedSourceKeys: [kind + '-source'], excludedSourceKeys: [], days: [{ date,
      totalSeconds: Object.values(categoriesSeconds).reduce((a,b) => a+b, 0), categoriesSeconds,
      ...(kind === 'application' ? { nonSpecialTotalSeconds: Object.values(categoriesSeconds).reduce((a,b) => a+b, 0) } : {}),
      settledThroughMs: 1000, complete: true, reasonCodes: [] }] });
  const independentModel = { ok: true, policy: v2Policy, executionRevision: 'independent-1', sourceStatistics: {
    web: snapshot('web', { study: 0, composite: 300, rest: 300 }),
    application: snapshot('application', { study: 0, composite: 1200, restrictedEntertainment: 600 }) } };
  const independentConfig = { timeQuota: { daily: { monday: { onlineMinutes: 240 } } }, domainQuotas: { example: 1 } };
  const independent = runtime.projectSharedRuntimeQuota(independentConfig, independentModel,
    { totalMinutes: 10, totalSeconds: 600, domainSeconds: { example: 600 } }, date);
  assert.equal(independent.ok, true);
  assert.equal(independent.usage.compositeSeconds, 1500, 'application composite never borrows rest in V2');
  assert.equal(independent.usage.restSeconds, 900);
  assert.equal(independent.usage.totalSeconds, 600, 'online remains web-only');
  assert.deepEqual(independent.usage.domainSeconds, { example: 600 });
  assert.deepEqual(independent.config.domainQuotas, { example: 1 });
  assert.equal(independent.config.timeQuota.daily.monday.onlineMinutes, 240);
  assert.equal(independentConfig.forcedUsePolicyV1, undefined, 'projection never rewrites configuration');
  let localVersion = 8, replaceDuringRead = false;
  const independentReader = runtime.createIndependentSharedAccessRuntime({ enabled: true,
    readPolicy: async () => ({ ok: true, policy: { ...v2Policy, stage: 'shared' } }),
    readScope: async () => ({ childId: 'fixture-child', scopeHash: 'fixture-scope' }),
    readConfigContext: async () => ({ version: localVersion, config: independentConfig }),
    readSources: async () => {
      if (replaceDuringRead) localVersion++;
      return { ok: true, childId: 'fixture-child', scopeHash: 'fixture-scope', sourceStatistics: independentModel.sourceStatistics };
    }, fence: { invalidate() {} } });
  assert.equal((await independentReader.read(date)).ok, true, 'V2 needs no legacy basis or local replacement version');
  replaceDuringRead = true;
  assert.equal((await independentReader.read(date)).errorCode, 'shared_access_context_changed',
    'configuration changes invalidate an in-flight shared read');
  const partial = clone(independentModel); partial.sourceStatistics.application.days[0].complete = false;
  partial.sourceStatistics.application.days[0].reasonCodes = ['fixture_gap'];
  assert.equal(runtime.projectSharedRuntimeQuota(independentConfig, partial, {}, date).usage.ok, false);
  const incompleteUsage = runtime.projectSharedRuntimeQuota(independentConfig, partial,
    { ok: true, restSeconds: 7200, undeterminedSeconds: 60, totalSeconds: 7260 }, date).usage;
  assert.equal(incompleteUsage.ok, false);
  assert.equal(incompleteUsage.sharedIncomplete, true);
  assert.equal(incompleteUsage.restSeconds, 7200, 'known local lower bound survives a missing shared source');
  assert.equal(incompleteUsage.compositeSeconds, 60);
  assert.equal(incompleteUsage.weekRestSeconds, undefined, 'unknown fields must not become zero');
  const buckets = (kind, rest) => ({ schemaVersion: 2, durationUnit: 'seconds', source: kind,
    childId: 'fixture-child', fromDate: date, toDate: date, readAtMs: 1000, days: [{ date,
      bucketsSeconds: { study: 0, composite: 0, rest }, settledThroughMs: null, complete: true, reasonCodes: [] }] });
  const bucketModel = { ...independentModel, sourceStatistics: {
    web: buckets('web', 600), application: buckets('application', 600) } };
  const combinedBuckets = () => runtime.projectSharedRuntimeQuota(independentConfig, bucketModel, {}, date);
  assert.equal(combinedBuckets().usage.restSeconds, 1200, '600 web + 600 application = 1200, no borrowing');
  assert.equal(combinedBuckets().usage.restSeconds, 1200, 'repeated projections never accumulate');
  bucketModel.sourceStatistics.application.days[0].bucketsSeconds.rest = 100;
  assert.equal(combinedBuckets().usage.restSeconds, 700, 'decreased usage is honored');
  bucketModel.sourceStatistics.application = null;
  assert.equal(combinedBuckets().usage.restSeconds, 600);
  assert.equal(combinedBuckets().usage.ok, true);
  assert.equal(combinedBuckets().usage.sharedIncomplete, true);
  assert.deepEqual(combinedBuckets().usage.missingSources, ['application']);
  bucketModel.sourceStatistics = { web: null, application: buckets('application', 600) };
  assert.equal(runtime.projectSharedRuntimeQuota(independentConfig, bucketModel, { ok: false }, date).usage.restSeconds, 600,
    'unavailable web cannot erase known application usage');
  bucketModel.sourceStatistics.application = null;
  assert.equal(combinedBuckets().usage.restSeconds, 0, 'missing sources count as zero only in ephemeral calculation');
  assert.equal(combinedBuckets().completeness.complete, false);
  assert.deepEqual(combinedBuckets().usage.missingSources, ['web', 'application']);
  const fenceSources = { web: buckets('web', 600), application: buckets('application', 600) };
  const bucketReader = runtime.createIndependentSharedAccessRuntime({ enabled: true,
    readPolicy: async () => ({ ok: true, policy: { ...v2Policy, stage: 'shared' } }),
    readScope: async () => ({ childId: 'fixture-child', scopeHash: 'fixture-scope' }),
    readConfigContext: async () => ({ version: 8, config: independentConfig }),
    readSources: async () => ({ ok: true, childId: 'fixture-child', scopeHash: 'fixture-scope', sourceStatistics: fenceSources }),
    fence: { invalidate() {} } });
  const firstBucketRevision = (await bucketReader.read(date)).executionRevision;
  fenceSources.web.readAtMs++;
  assert.equal((await bucketReader.read(date)).executionRevision, firstBucketRevision,
    'a fresh read timestamp alone cannot invalidate an ongoing confirmation');
  fenceSources.application.days[0].bucketsSeconds.rest = 100;
  assert.notEqual((await bucketReader.read(date)).executionRevision, firstBucketRevision,
    'changed bucket values still invalidate the execution fence');
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
    + `import {readForcedUsePolicy} from '${url('extension/core/forced-use-policy.js')}';\n`
    + `import {buildForcedUseHardQuotaState} from '${url('extension/core/forced-use-quota-facts.js')}';\n`
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
  globalThis.__sharedQuotaConsumer.model = clone(independentModel);
  const independentEvaluation = await quota.evaluateQuotaState();
  assert.equal(independentEvaluation.usage.compositeSeconds, 1500);
  assert.equal(independentEvaluation.newState.undeterminedLocked, false, 'standard quota allows confirmation before final block');
  globalThis.__sharedQuotaConsumer.model.policy.autonomy.quotaOverrunConfirmationRequired = false;
  assert.equal((await quota.evaluateQuotaState()).newState.undeterminedLocked, true, 'confirmation-off blocks at standard quota');
  globalThis.__sharedQuotaConsumer.model = { ok: false };
  assert.equal((await quota.evaluateQuotaState()).accountingUnavailable, true);
  delete globalThis.__sharedQuotaConsumer;
  console.log('Shared access runtime: trusted replacements, policy, isolation, quotas and revocation PASS');
}
run().catch(e => { console.error(e); process.exitCode = 1; });

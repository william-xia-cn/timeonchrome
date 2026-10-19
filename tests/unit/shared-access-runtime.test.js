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
  } else globalThis.__sharedBucketsContract = await import(url('extension/core/shared-contracts/1.58.0/source-statistics.js'));
const v2Contract = await import(url('extension/core/shared-contracts/1.58.0/shared-access.js'));
  let source = fs.readFileSync(path.join(root, 'extension/product/shared-access-runtime.js'), 'utf8');
  source = source.replace(/^import .*;\r?\n/gm, '').replace(/^import[\s\S]*?;\r?\n/gm, '');
  source = `import {canonicalSharedAccessPolicyV2,createSharedAccessPolicyIdentityV2} from '${url('extension/core/shared-contracts/1.58.0/shared-access.js')}';\n`
    + `import {sourceStatisticsDates} from '${url('extension/core/shared-contracts/1.58.0/source-statistics.js')}';\n`
    + 'const sourceStatisticsContract=globalThis.__sharedBucketsContract;const readSharedAccessPolicyV2Lkg=async()=>null,readCurrentSourceStatistics=async()=>null,readSharedAccessPolicyContext=async()=>null,browserExecutionFence={invalidate(){}};\n' + source;
  const runtime = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const date = '2026-09-28';
  const v2Policy = v2Contract.projectSharedAccessPolicyV2({ timeQuota: { daily: { monday: {
    studyMinutes: null, compositeMinutes: 1, restMinutes: 120 } }, weekly: { restMinutes: 840 } },
    forcedUsePolicyV1: { schemaVersion: 1, enabled: true, reminderIntervalMinutes: 30,
      quotaOverrunMinutes: { dailyStudy: null, dailyComposite: null, dailyRest: null,
        dailyOnline: null, weeklyRest: null, domain: null }, advisoryWindowDailyMaxMinutes: null } }, 8, 0);
  const snapshot = (kind, bucketsSeconds) => ({ schemaVersion: 2, durationUnit: 'seconds', source: kind,
    childId: 'fixture-child', fromDate: date, toDate: date, readAtMs: 1000,
    days: [{ date, bucketsSeconds, settledThroughMs: 1000, complete: true, reasonCodes: [] }] });
  const independentModel = { ok: true, policy: v2Policy, executionRevision: 'independent-1', sourceStatistics: {
    web: snapshot('web', { study: 0, composite: 300, rest: 300 }),
    application: snapshot('application', { study: 0, composite: 1200, rest: 600 }) } };
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
  partial.sourceStatistics.application.days[0].reasonCodes = ['APPLICATION_SOURCE_PARTIAL'];
  const partialProjection = runtime.projectSharedRuntimeQuota(independentConfig, partial, {}, date);
  assert.equal(partialProjection.usage.ok, true);
  assert.equal(partialProjection.usage.sharedIncomplete, true);
  assert.equal(partialProjection.usage.restSeconds, 900, 'known bucket values survive partial status');
  const obsolete = clone(independentModel); obsolete.sourceStatistics.application.schemaVersion = 1;
  assert.equal(runtime.projectSharedRuntimeQuota(independentConfig, obsolete, {}, date).ok, false, 'old snapshot is not reinterpreted');
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
  const consumerConfig = { enabled: true, domainQuotas: { example: 1 }, timeQuota: { accountingVersion: 1,
    daily: { monday: { studyMinutes: 1, restMinutes: 1, compositeMinutes: 1, onlineMinutes: 240 } } } };
  globalThis.__sharedQuotaConsumer = { model: clone(independentModel), config: consumerConfig, project: runtime.projectSharedRuntimeQuota };
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
  assert.equal(evaluated.sharedRuntime, true); assert.equal(evaluated.usage.restSeconds, 900);
  assert.equal(evaluated.newState.restLocked, false, 'actual caller uses shared 120 minute limit, not stale 1 minute config');
  assert.deepEqual(evaluated.lockedDomains, [], 'current forced-use policy permits confirmation before final domain block'); assert.equal(evaluated.newState.onlineLocked, false);
  globalThis.__sharedQuotaConsumer.model.sourceStatistics.application.days[0].bucketsSeconds.rest = 7200;
  assert.equal((await quota.evaluateQuotaState()).newState.restLocked, false, 'confirmation-enabled policy does not immediately impose final restriction');
  globalThis.__sharedQuotaConsumer.model.policy.autonomy.quotaOverrunConfirmationRequired = false;
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

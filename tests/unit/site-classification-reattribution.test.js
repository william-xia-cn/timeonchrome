'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.join(__dirname, '..', '..');
const requestRoute = fs.readFileSync(path.join(root, 'workers', 'src', 'routes', 'siteClassificationRequests.ts'), 'utf8');
const statsRoute = fs.readFileSync(path.join(root, 'workers', 'src', 'routes', 'stats.ts'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'workers', 'src', 'index.ts'), 'utf8');
const service = fs.readFileSync(path.join(root, 'workers', 'src', 'services', 'usageAccountingCorrections.ts'), 'utf8');

assert(requestRoute.includes("decision === 'reject'"));
assert(requestRoute.includes("classification === 'restricted'"));
assert(requestRoute.includes('processRestrictedReattributions'));
assert(statsRoute.includes('hasPendingClassification'));
const uploadTrigger = statsRoute.slice(statsRoute.indexOf('const hasPendingClassification'), statsRoute.indexOf('return json({', statsRoute.indexOf('const hasPendingClassification')));
assert(!uploadTrigger.includes('target_rule_id'), 'late upload trigger must not depend on request IDs');
assert(!uploadTrigger.includes('requestIds:'), 'late uploads scan decisions for the authenticated profile');
assert(statsRoute.includes('ctx.waitUntil(reattributionWork)'));
assert(worker.includes('processRestrictedReattributions(env, { maxBatchesPerRequest: 4 })'));

assert(service.includes("s.channel = 'active'"));
assert(!service.includes('s.target_rule_id IN (?, ?)'));
assert(service.includes('r.client_request_id IN'));
assert(service.includes('matchDomain(row.domain, scope.targetValue)'));
assert(service.includes('s.end_ms <= ?'));
assert(service.includes('unsupported_target_scope'));
assert(requestRoute.includes("(classification === 'restricted' || classification === 'study') && matchingPending.length === 0"));
assert(service.includes("s.target_classification_at_time IN ('pending_composite', 'unclassified')"));
assert(!service.includes('media_segments_v1'));
assert(service.includes("context.decision === 'study' ? 'study' : 'restricted'"));
assert(service.includes("r.decision IN ('reject','study')"));
assert(service.includes('LEFT JOIN usage_segment_corrections_v1 c ON c.segment_id = s.id'));

console.log('[Site Classification Reattribution] passed');

async function verifyManualEntry() {
  const start = requestRoute.indexOf('async function classifyUsedUnclassifiedSite(');
  const end = requestRoute.indexOf('\nexport ', start);
  const source = requestRoute.slice(start, end) + '\nthis.classify = classifyUsedUnclassifiedSite;';
  let operations, pending, ensuredOk, configured;
  const context = {
    verifyProfileOwner: async () => true,
    normalizeObservedHost: value => value,
    listForSiteManagementClassification: value => value === 'restricted' ? 'customRestrictedEntertainmentList' : 'customStudyList',
    getProfileSiteAccessConfig: async () => ({}),
    getPendingRequestsByHost: async () => new Map(pending ? [['example.com', [{ id: 'existing-request' }]]] : []),
    sameHostRule: (a, b) => a === b,
    rowToResponse: row => row,
    resolveSiteAccessClassification: () => ({ classification: configured ? 'restricted' : 'pending_composite' }),
    ensureUnclassifiedSiteRequest: async (_env, profile, input) => {
      operations.push('ensure'); assert.strictEqual(profile, 'child'); assert.strictEqual(input.targetValue, 'example.com');
      if (!ensuredOk) return { ok: false };
      pending = true; return { ok: true, request: { id: 'ensured-request' } };
    },
    mutateProfileConfig: async (_env, input, edit) => { operations.push('config'); assert.strictEqual(input.profileId, 'child'); edit({}); },
    addHostToProfileCustomList: () => {},
    closeMatchingPendingRequests: async () => { operations.push('decision'); return pending ? ['decided-request'] : []; },
    processRestrictedReattributions: async (_env, options) => {
      operations.push('correction'); assert.strictEqual(options.profileId, 'child');
      assert.strictEqual(options.requestIds[0], 'decided-request'); return [{ complete: true }];
    },
    json: (body, status = 200) => ({ body, status }),
    Date,
  };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText, context);
  async function run({ hasPending = false, ensureSuccess = true, alreadyClassified = false, classification = 'restricted' } = {}) {
    operations = []; pending = hasPending; ensuredOk = ensureSuccess; configured = alreadyClassified;
    return context.classify({ json: async () => ({ domain: 'example.com', classification }) }, {}, 'child');
  }
  assert.strictEqual((await run()).status, 200);
  assert.deepStrictEqual(operations, ['ensure', 'config', 'decision', 'correction']);
  assert.strictEqual((await run({ hasPending: true })).status, 200);
  assert.deepStrictEqual(operations, ['config', 'decision', 'correction']);
  assert.strictEqual((await run({ ensureSuccess: false })).status, 409);
  assert.deepStrictEqual(operations, ['ensure'], 'do not update config when an auditable decision cannot be established');
  await run({ alreadyClassified: true }); assert.deepStrictEqual(operations, []);
  await run({ classification: 'study' }); assert.deepStrictEqual(operations, ['ensure', 'config', 'decision', 'correction']);
  await run({ classification: 'study', hasPending: true }); assert.deepStrictEqual(operations, ['config', 'decision', 'correction']);
  await run({ classification: 'composite' }); assert.deepStrictEqual(operations, ['config', 'decision']);
  console.log('[Site Classification Reattribution] manual entry passed');
}
verifyManualEntry().catch(error => { console.error(error); process.exitCode = 1; });

async function verifyApprovalRefresh() {
  const page = fs.readFileSync(path.join(root, 'pages/index.html'), 'utf8');
  const start = page.indexOf('async function decideSiteClassificationRequestRecord(');
  const end = page.indexOf('\nasync function decideSiteClassificationRequest(', start);
  let context, switchProfile, concurrentSave;
  const operations = [];
  context = vm.createContext({
    currentProfileId: 'child', remoteConfigVersion: 1, remoteConfig: {customStudyList: []},
    siteRequestDecisionDefault: () => 'ankiuser.net',
    findProtectedSiteClassificationActionScope: () => null,
    api: async (url, method) => {
      operations.push(method === 'POST' ? 'decision' : 'config');
      if (method === 'POST' && switchProfile) context.currentProfileId = 'other-child';
      if (method !== 'POST' && concurrentSave) context.remoteConfigVersion = 3;
      return {version: 2, data: {customStudyList: ['ankiuser.net']}};
    },
    applyProfileConfigResponse: result => { context.remoteConfig=result.data; context.remoteConfigVersion=result.version; },
    renderRulesPolicyNav: () => operations.push('nav'),
    renderRulesSiteDirectory: () => operations.push('directory'),
    toast: () => {},
    loadSiteClassificationRequests: async () => operations.push('requests'),
    loadUsedUnclassifiedSitesForRules: async () => operations.push('usage'),
  });
  vm.runInContext(page.slice(start,end)+'\nthis.decide=decideSiteClassificationRequestRecord;',context);
  await context.decide({id:'request',requestedTargetType:'host'},'study');
  assert.strictEqual(context.remoteConfig.customStudyList[0],'ankiuser.net');
  assert.deepStrictEqual(operations,['decision','config','nav','directory','requests','usage']);
  operations.length=0; context.remoteConfigVersion=1; switchProfile=true;
  await context.decide({id:'request',requestedTargetType:'host'},'study');
  assert.deepStrictEqual(operations,['decision'],'do not refresh another child after approval');
  operations.length=0; context.currentProfileId='child'; switchProfile=false; concurrentSave=true;
  await context.decide({id:'request',requestedTargetType:'host'},'study');
  assert.strictEqual(context.remoteConfigVersion,3,'stale config response cannot overwrite a newer save');
  assert(!operations.includes('directory'));
  console.log('[Site Classification Reattribution] approval config refresh passed');
}
verifyApprovalRefresh().catch(error => { console.error(error); process.exitCode = 1; });

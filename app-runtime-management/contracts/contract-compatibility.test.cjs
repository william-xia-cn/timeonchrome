const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const legacy = [
  'runtime-api-v1.schema.json',
  'runtime-contract-v1.schema.json',
  'runtime-machine-api-v2.schema.json',
  'runtime-accounting-v2.schema.json',
];
assert.equal(pkg.version, '1.23.1');
assert(pkg.exports['./shared-access'], 'shared access contract must be exported');
const sharedAccess = JSON.parse(fs.readFileSync(path.join(root, 'shared-access-v1.schema.json'), 'utf8'));
assert.equal(sharedAccess.$defs.policy.properties.stage.enum[0], 'legacy');
assert.equal(sharedAccess.$defs.policy.properties.autonomy.properties.visibleResponseDeadlineSeconds.const, 60);
const quotaWeek=sharedAccess.$defs.state.properties.week;
assert.equal(quotaWeek.additionalProperties,false);
assert.deepEqual(quotaWeek.required,['fromDate','toDate','complete','reasonCodes','restUsedMs','restRemainingMs']);
assert.equal(quotaWeek.properties.toDate.$ref,'#/$defs/date');
assert.equal(quotaWeek.properties.complete.type,'boolean');
assert.equal(quotaWeek.properties.reasonCodes.type,'array');
for(const week of [
  {fromDate:'2026-09-28',toDate:'2026-10-02',complete:true,reasonCodes:[],restUsedMs:10,restRemainingMs:20},
  {fromDate:'2026-09-28',toDate:'2026-10-02',complete:false,reasonCodes:['APPLICATION_SOURCE_UNAVAILABLE'],restUsedMs:10,restRemainingMs:null},
]) {
  assert(Object.keys(week).every(key=>Object.hasOwn(quotaWeek.properties,key)),'real weekly fields must not be rejected');
  assert(quotaWeek.required.every(key=>Object.hasOwn(week,key)),'weekly completeness must be explicit');
}
assert(sharedAccess.$defs.contribution.allOf[0].then.required.includes('chromeExcludedMs'));
assert(sharedAccess.$defs.contribution.properties.chromeIncludedInApplicationMs,
  'Chrome marginal display deduction is distinct from quota exclusion');
assert(!sharedAccess.$defs.applicationUpload.properties.childId && !sharedAccess.$defs.applicationUpload.properties.sourceKey,
  'machine-authenticated upload cannot select a Child or server-derived source key');
const computerUsage = JSON.parse(fs.readFileSync(path.join(root, 'computer-usage-v1.schema.json'), 'utf8'));
assert.equal(computerUsage.$defs.response.properties.schemaVersion.const, 1);
assert.equal(computerUsage.$defs.request.properties.limit.maximum, 100);
assert(computerUsage.$defs.request.allOf.every(rule => rule.then.required.includes('revision')));
assert.equal(computerUsage.$defs.response.additionalProperties, false, 'public results cannot expose raw evidence fields');
assert.equal(computerUsage.$defs.timelineItem.additionalProperties, false);
assert.equal(computerUsage.$defs.response.properties.products.maxItems, 100);
assert.equal(computerUsage.$defs.response.properties.timeline.maxItems, 100);
assert(!computerUsage.$defs.request.properties.childId, 'ownership is selected by the authenticated child route, not an internal source override');
assert(!computerUsage.$defs.request.properties.quotaBucket, 'unified display does not define quota configuration');
const enrollment = JSON.parse(fs.readFileSync(path.join(root, 'machine-enrollment-recovery-v1.schema.json'), 'utf8'));
assert.deepEqual(enrollment.$defs.request.required, ['code', 'platform']);
assert.equal(enrollment.$defs.request.properties.clientMachineToken.pattern, '^rt_machine_token_[A-Za-z0-9_-]{43}$');
assert.deepEqual(enrollment.$defs.response.required, ['machineId', 'machineToken', 'platform']);
const appPolicy = JSON.parse(fs.readFileSync(path.join(root, 'runtime-app-policy-v1.schema.json'), 'utf8'));
assert(!appPolicy.required.includes('productIdentityProjection'), 'N-1 policy does not require product projection');
assert(!appPolicy.required.includes('productBlockPolicy'), 'N-1 policy does not require product block policy');
assert.deepEqual(appPolicy.properties.productBlockPolicy.required,
  ['schemaVersion','knowledgeVersion','associationVersion','entries']);
assert.deepEqual(appPolicy.properties.productIdentityProjection.required, ['version','knowledgeVersion','items']);
assert.equal(appPolicy.properties.productIdentityProjection.properties.items.items.properties.isChromeContainer.type,'boolean');
assert(!appPolicy.properties.productIdentityProjection.properties.items.items.required.includes('isChromeContainer'),
  'older client projections without Chrome role remain valid and unconfirmed');
assert.equal(appPolicy.properties.repairWeekStart.const, '2026-09-21');
assert(!appPolicy.required.includes('weekReclassification'), 'N-1 policy stays valid');
assert.deepEqual(appPolicy.properties.weekReclassification.required, ['fromMs', 'toMs', 'applications']);
assert.deepEqual(appPolicy.properties.weekReclassification.properties.applications.items.properties.classification.enum,
  ['study', 'composite', 'restrictedEntertainment', 'unclassified', 'other', 'blocked']);
assert(appPolicy.properties.classifications.items.properties.classification.enum.includes('other'));
assert.equal(appPolicy.properties.weekReclassification.properties.applications.maxItems, 12000);
const machineApi = JSON.parse(fs.readFileSync(path.join(root, 'runtime-machine-api-v2.schema.json'), 'utf8'));
assert(!machineApi.required.includes('applicationCorrectionPage'), 'N-1 machine protocol stays valid');
assert.deepEqual(machineApi.$defs.applicationCorrectionPage.required, ['cursor', 'hasMore', 'items']);
assert.equal(machineApi.$defs.applicationCorrectionPage.properties.items.maxItems, 1);
for (const file of legacy) assert(fs.existsSync(path.join(root, file)), `${file} must remain for N-1 compatibility`);
const sso = JSON.parse(fs.readFileSync(path.join(root, 'runtime-browser-sso-v1.schema.json'), 'utf8'));
const inventoryV2 = JSON.parse(fs.readFileSync(path.join(root, 'application-inventory-v2.schema.json'), 'utf8'));
assert.equal(sso.$defs.ticketClaims.properties.aud.const, 'app-runtime-management:sso');
assert.equal(sso.$defs.sessionResponse.properties.tokenType.const, 'RuntimeSession');
assert.equal(sso.$defs.sessionResponse.properties.token.pattern, '^[A-Za-z0-9_-]{43}$');
assert.equal(sso.$defs.ticketClaims.properties.selected_child_id.type, 'string');
assert.equal(sso.$defs.sessionResponse.properties.selectedChildId.type, 'string');
assert.equal(inventoryV2.properties.schemaVersion.const, 2);
assert.deepEqual(inventoryV2.required, ['schemaVersion', 'batchId', 'products', 'variants']);
assert(inventoryV2.$defs.scan.required.includes('sourceResults'));
assert.equal(inventoryV2.$defs.scan.properties.sourceResults.maxItems, 16);
assert(inventoryV2.$defs.source.enum.includes('distribution-ea'));
assert(inventoryV2.$defs.source.enum.includes('distribution-ubisoft'));
assert(inventoryV2.$defs.source.enum.includes('distribution-gog'));
assert(inventoryV2.$defs.discovery.properties.objectKind.enum.includes('packageContainer'));
assert.deepEqual(inventoryV2.$defs.discovery.properties.applicationOrigin.enum, ['user', 'operatingSystem', 'unknown']);
assert.deepEqual(inventoryV2.$defs.discovery.properties.originEvidenceCode.enum, ['exactPackageRule', 'osMetadata', 'reviewedSystemBinary']);
assert.match(inventoryV2.$defs.discovery.properties.applicationOrigin.description, /advisory.*cloud.*authoritative/i);
assert.match(inventoryV2.$defs.discovery.properties.originEvidenceCode.description, /advisory.*cloud.*authoritative/i);
const knowledge = JSON.parse(fs.readFileSync(path.join(root, 'application-knowledge.schema.json'), 'utf8'));
assert(knowledge.properties.schemaVersion.enum.includes(3));
assert.equal(knowledge.$defs.binding.properties.products.items.properties.enhancedBlocking.const,true);
assert(knowledge.$defs.appType.enum.includes('gameUtility'));
const nativeHost = JSON.parse(fs.readFileSync(path.join(root, 'native-host-v1.schema.json'), 'utf8'));
const nativeHostV2 = JSON.parse(fs.readFileSync(path.join(root, 'native-host-v2.schema.json'), 'utf8'));
assert.equal(nativeHost.properties.protocolVersion.const, 1);
assert(nativeHost.properties.messageType.enum.includes('settledUsageSegments'));
assert.equal(nativeHost.additionalProperties, false);
assert.equal(nativeHostV2.properties.protocolVersion.const, 2);
assert.deepEqual(nativeHostV2.properties.channel.enum, ['health', 'ledger']);
assert(nativeHostV2.required.includes('channel'));
assert(nativeHostV2.allOf.some((rule) => rule.then?.required?.includes('batchId')));
const nativeHostV3 = JSON.parse(fs.readFileSync(path.join(root, 'native-host-v3.schema.json'), 'utf8'));
assert.equal(nativeHostV3.properties.protocolVersion.const, 3);
assert.deepEqual(nativeHostV3.properties.channel.enum, ['health', 'statistics', 'application', 'sharedQuota']);
assert.deepEqual(nativeHostV3.properties.messageType.enum,
  ['heartbeat', 'probe', 'dailyUsageSnapshot', 'getApplicationUsage', 'getSharedQuotaState', 'reportReminderResult']);
assert.equal(nativeHostV3.$defs.applicationQuery.additionalProperties, false);
assert.deepEqual(nativeHostV3.$defs.sharedQuotaQuery.required, ['date']);
assert.deepEqual(Object.keys(nativeHostV3.$defs.sharedQuotaQuery.properties), ['date']);
assert.equal(nativeHostV3.$defs.sharedQuotaQuery.additionalProperties, false);
assert.equal(nativeHostV3.allOf[3].then.allOf[1].then.properties.payload.$ref,
  'shared-access-v1.schema.json#/$defs/reminderResult');
assert.deepEqual(nativeHostV3.$defs.applicationQuery.required, ['fromDate', 'toDate', 'offset']);
assert.equal(nativeHostV3.$defs.applicationQuery.properties.offset.maximum, 20000);
assert.equal(nativeHostV3.$defs.dailySnapshot.properties.activeSeconds.type, 'integer');
assert(nativeHostV3.$defs.dailySnapshot.required.includes('correctionRevision'));
assert(nativeHostV3.$defs.dailySnapshot.required.includes('snapshotRevision'));
console.log('app-runtime contract compatibility: PASS');

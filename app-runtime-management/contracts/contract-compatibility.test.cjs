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
assert.equal(pkg.version, '1.58.2');
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'usage-account.schema.json'),'utf8')).$defs.fixedIdentityRowV2.properties.displayName.maxLength,512);
assert(pkg.exports['./native-application-identification']);
const instanceLedger = JSON.parse(fs.readFileSync(path.join(root,'application-ledger-v4.schema.json'),'utf8'));
assert.equal(instanceLedger.properties.schemaVersion.const,4);
assert(instanceLedger.required.includes('childId'));
const instanceStatistics=JSON.parse(fs.readFileSync(path.join(root,'usage-account.schema.json'),'utf8')).$defs;
for (const retired of ['manifestV3','rowV3','productProjection','productProjectionRow','productProjectionReceipt'])
  assert.equal(Object.hasOwn(instanceStatistics,retired),false,`旧实例／产品投影schema必须退出：${retired}`);
assert.equal(instanceStatistics.manifestV2.properties.durationUnit.const,'seconds');
assert(instanceStatistics.fixedIdentityRowV2.required.includes('subjectKey'));
assert(pkg.exports['./source-statistics']);
assert(pkg.exports['./application-ledger'], '固定孩子原账契约必须独立导出');
const applicationLedger = JSON.parse(fs.readFileSync(path.join(root, 'application-ledger-v3.schema.json'), 'utf8'));
assert.equal(applicationLedger.properties.schemaVersion.const, 3);
assert(applicationLedger.required.includes('childId'));
assert(applicationLedger.required.includes('durationSeconds'));
assert(!applicationLedger.required.includes('policySnapshot'));
const productSchema=JSON.parse(fs.readFileSync(path.join(root,'application-knowledge.schema.json'),'utf8')).$defs.product;
assert.equal(productSchema.properties.catalogGroup.const,'specialApplication');
assert(!productSchema.required.includes('catalogGroup'),'旧产品定义无需补字段');
assert(pkg.exports['./shared-web-sync']);
assert(pkg.exports['./shared-reminder-lifecycle']);
assert(pkg.exports['./shared-access']);
assert.equal(Object.hasOwn(pkg.exports,'./shared-quota-execution'),false);
assert.equal(pkg.files.includes('shared-quota-execution.ts'),false);
assert.equal(pkg.scripts.test.includes('shared-quota-execution.test.mjs'),false);
for(const retired of ['shared-access-v1.schema.json','shared-web-sync-v1.schema.json',
  'shared-quota-execution-v1.schema.json','shared-quota-execution.ts','shared-quota-execution.test.mjs',
  'shared-quota-execution.vectors.json','shared-web-sync.vectors.json','shared-reminder.vectors.json'])
  assert.equal(fs.existsSync(path.join(root,retired)),false,`旧业务专属契约必须退出：${retired}`);
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
assert(!appPolicy.required.includes('programInstanceExecutionPolicy'), 'old clients do not require the new execution branch');
assert.equal(appPolicy.properties.programInstanceExecutionPolicy.$ref, '#/$defs/programInstanceExecutionPolicy');
assert.deepEqual(appPolicy.$defs.programInstanceExecutionPolicy.required, ['schemaVersion','catalogVersion','blockedProducts']);
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
  ['heartbeat', 'probe', 'dailyUsageSnapshot', 'getApplicationUsageSeconds',
    'getSharedReminderState', 'acknowledgeSharedReminderDelivery', 'resolveSharedReminder', 'reportBrowserActivity', 'acknowledgeBrowserExecution',
    'getSharedWebSourceScope', 'bindSharedWebSourceV2', 'exchangeQuotaBuckets']);
const retiredBridgeMessages = ['getApplicationUsage', 'getApplicationIdentityUsage', 'getSharedQuotaState', 'reportReminderResult',
  'getSharedWebSourceChallenge', 'bindSharedWebSource', 'replaceSharedWebContribution', 'replaceSharedWebContributionV2'];
const bridgeSource = fs.readFileSync(path.join(root, 'native-host.ts'), 'utf8');
const currentEnvelope = bridgeSource.split('export interface BrowserBridgeV3Envelope')[1].split('export interface BrowserDailyUsageSnapshotResponse')[0];
for (const message of retiredBridgeMessages) {
  assert(!nativeHostV3.properties.messageType.enum.includes(message), `旧本地消息不得被schema接受：${message}`);
  assert(!currentEnvelope.includes(`'${message}'`), `旧本地消息不得被TypeScript消息类型接受：${message}`);
  assert(!nativeHostV3.allOf.some(rule => rule.then?.properties?.messageType?.enum?.includes(message)), `旧本地消息不得保留通道分派：${message}`);
}
for (const rule of nativeHostV3.allOf) {
  for (const payloadRule of rule.then?.allOf || []) {
    assert(nativeHostV3.properties.messageType.enum.includes(payloadRule.if.properties.messageType.const));
  }
}
assert(nativeHostV3.allOf.find(rule => rule.if?.properties?.channel?.const === 'sharedQuota').then.allOf.some(
  rule => rule.if?.properties?.messageType?.const === 'exchangeQuotaBuckets'
    && rule.then.properties.payload.$ref === 'quota-buckets-v2.schema.json#/$defs/exchange'));
const reusableSchema=JSON.parse(fs.readFileSync(path.join(root,'shared-web-sync-v2.schema.json'),'utf8'));
assert.equal(Object.hasOwn(reusableSchema.$defs,'replaceQuery'),false,'可复用身份契约不得夹带旧贡献替换');
const quotaBucketsSchema=JSON.parse(fs.readFileSync(path.join(root,'quota-buckets-v2.schema.json'),'utf8'));
assert.equal(fs.existsSync(path.join(root,'source-statistics-v1.schema.json')),false);
assert.equal(quotaBucketsSchema.$defs.snapshot.properties.schemaVersion.const,2);
assert.equal(quotaBucketsSchema.$defs.snapshot.properties.durationUnit.const,'seconds');
assert.deepEqual(quotaBucketsSchema.$defs.buckets.required,['study','composite','rest']);
assert.equal(quotaBucketsSchema.$defs.snapshot.additionalProperties,false);
assert.equal(Object.hasOwn(quotaBucketsSchema.$defs.snapshot.properties,'includedSourceKeys'),false);
assert.equal(Object.hasOwn(quotaBucketsSchema.$defs.day.properties,'categoriesSeconds'),false);
assert.equal(reusableSchema.$defs.webClaims.additionalProperties,false);
assert(!reusableSchema.$defs.webClaims.properties.connectionHash);
assert(!reusableSchema.$defs.webClaims.properties.challengeId);
assert.equal(reusableSchema.$defs.webClaims.properties.schemaVersion.const,2);
assert.equal(Object.hasOwn(nativeHostV3.$defs, 'applicationQuery'), false);
assert.equal(Object.hasOwn(nativeHostV3.$defs, 'sharedQuotaQuery'), false);
assert(pkg.exports['./application-usage-seconds']);
assert(pkg.files.includes('application-usage-seconds.ts'));
const applicationSecondsSchema=JSON.parse(fs.readFileSync(path.join(root,'application-usage-seconds-v2.schema.json'),'utf8'));
assert.equal(applicationSecondsSchema.$defs.snapshot.properties.durationUnit.const,'seconds');
assert.equal(applicationSecondsSchema.$defs.query.additionalProperties,false);
assert.equal(applicationSecondsSchema.$defs.snapshot.properties.applications.maxItems,100);
const payloadRef = (channel, message) => nativeHostV3.allOf.find(rule => rule.if.properties.channel.const === channel)
  .then.allOf.find(rule => rule.if.properties.messageType.const === message).then.properties.payload.$ref;
assert.equal(payloadRef('application', 'getApplicationUsageSeconds'),
  'application-usage-seconds-v2.schema.json#/$defs/query');
assert.equal(applicationSecondsSchema.$defs.identitySnapshot.properties.schemaVersion.const,3);
assert.equal(applicationSecondsSchema.$defs.identityQuery.additionalProperties,false);
assert.equal(payloadRef('sharedQuota', 'getSharedReminderState'),'shared-reminder-lifecycle-v2.schema.json#/$defs/stateQuery');
assert.equal(payloadRef('sharedQuota', 'acknowledgeSharedReminderDelivery'),
  'shared-reminder-lifecycle-v2.schema.json#/$defs/deliveryAck');
assert.equal(payloadRef('sharedQuota', 'resolveSharedReminder'),
  'shared-reminder-lifecycle-v2.schema.json#/$defs/resolution');
assert.equal(payloadRef('sharedQuota', 'reportBrowserActivity'),
  'shared-reminder-lifecycle-v2.schema.json#/$defs/browserActivity');
const lifecycle=JSON.parse(fs.readFileSync(path.join(root,'shared-reminder-lifecycle-v2.schema.json'),'utf8'));
assert.equal(payloadRef('sharedQuota', 'acknowledgeBrowserExecution'),
  'shared-reminder-lifecycle-v2.schema.json#/$defs/browserExecutionAck');
for(const type of ['browserExecution','browserExecutionAck']) {
  assert.equal(lifecycle.$defs[type].additionalProperties,false);
  assert.deepEqual(lifecycle.$defs[type].required,Object.keys(lifecycle.$defs[type].properties));
  assert.equal(Object.hasOwn(lifecycle.$defs[type].properties,'triggerStateRevision'),false);
  assert.equal(lifecycle.$defs[type].properties.schemaVersion.const,2);
}
assert.equal(lifecycle.$defs.state.additionalProperties,false);
assert.deepEqual(lifecycle.$defs.state.required,Object.keys(lifecycle.$defs.state.properties));
assert.deepEqual(applicationSecondsSchema.$defs.query.required, ['fromDate', 'toDate', 'offset']);
assert.equal(applicationSecondsSchema.$defs.query.properties.offset.maximum, 20000);
assert.equal(nativeHostV3.$defs.dailySnapshot.properties.activeSeconds.type, 'integer');
assert(nativeHostV3.$defs.dailySnapshot.required.includes('correctionRevision'));
assert(nativeHostV3.$defs.dailySnapshot.required.includes('snapshotRevision'));
require('node:child_process').execFileSync(process.execPath, [path.join(root, 'application-ledger.test.mjs')], { stdio: 'inherit' });
console.log('app-runtime contract compatibility: PASS');

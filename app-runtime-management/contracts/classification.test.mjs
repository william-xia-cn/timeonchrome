import assert from 'node:assert/strict';
import {parseProgramInstanceExecutionPolicy, PROGRAM_INSTANCE_EXECUTION_POLICY_CAPABILITY} from './dist/application-classification.js';
assert.equal(PROGRAM_INSTANCE_EXECUTION_POLICY_CAPABILITY, 'program-instance-execution-policy-v1');
const executionHint = {signerKey:'a'.repeat(64), productName:'Fixture'};
const executionPolicy = {schemaVersion:1,catalogVersion:11,blockedProducts:[
  {productId:'ordinary',suspectedMatchers:[]}, {productId:'enhanced',suspectedMatchers:[executionHint]}]};
assert.deepEqual(parseProgramInstanceExecutionPolicy(executionPolicy), executionPolicy);
const executionCopy = parseProgramInstanceExecutionPolicy(executionPolicy);
executionCopy.blockedProducts[1].suspectedMatchers[0].productName = 'changed';
assert.equal(executionHint.productName, 'Fixture');
assert.deepEqual(parseProgramInstanceExecutionPolicy({...executionPolicy,blockedProducts:[]}).blockedProducts,[]);
for (const value of [null, {}, {...executionPolicy,schemaVersion:2}, {...executionPolicy,catalogVersion:-1},
  {...executionPolicy,catalogVersion:1.5}, {...executionPolicy,catalogVersion:Number.MAX_SAFE_INTEGER+1},
  {...executionPolicy,childId:'child-a'}, {...executionPolicy,associationVersion:'old'},
  {schemaVersion:1,catalogVersion:11}, {...executionPolicy,blockedProducts:[{productId:'ordinary'}]},
  {...executionPolicy,blockedProducts:[{productId:'ordinary',suspectedMatchers:[],enhancedBlocking:false}]},
  {...executionPolicy,blockedProducts:[executionPolicy.blockedProducts[0],executionPolicy.blockedProducts[0]]},
  {...executionPolicy,blockedProducts:[{productId:'other',suspectedMatchers:[executionHint,executionHint]}]},
  {...executionPolicy,blockedProducts:[executionPolicy.blockedProducts[1],{productId:'other',suspectedMatchers:[executionHint]}]},
  {...executionPolicy,blockedProducts:[{productId:'bad\n',suspectedMatchers:[]}]},
  ...[{...executionHint,signerKey:'A'.repeat(64)},{...executionHint,productName:''},
    {...executionHint,productName:'bad\n'},{...executionHint,path:'C:/fake'}].map(hint =>
      ({...executionPolicy,blockedProducts:[{productId:'enhanced',suspectedMatchers:[hint]}]})),
  {...executionPolicy,blockedProducts:Array.from({length:1001},(_,i)=>({productId:`p${i}`,suspectedMatchers:[]}))},
  {...executionPolicy,blockedProducts:Array.from({length:100},(_,i)=>({productId:`p${i}`,
    suspectedMatchers:[{signerKey:'a'.repeat(64),productName:`${i}${'中'.repeat(230)}`}]}))},
]) assert.throws(()=>parseProgramInstanceExecutionPolicy(value),/INVALID_PROGRAM_INSTANCE_EXECUTION_POLICY/);
import { readFileSync } from 'node:fs';
import { resolveApplication, safeAutomatic, associateApplicationEvidence, isSpecialApplicationProduct, resolveProductOwnership, buildProgramInstanceProductMapping, parseProductOwnershipEvidence, parseProgramInstanceRegistrationBatch } from './dist/application-classification.js';
import { parseApplicationKnowledge, parseApplicationKnowledgeV4, parseAppEvidence, parseProgramInstanceProjectionContext } from './dist/application-knowledge-validation.js';
import { parseProgramInstanceMappingReadRequest, parseProgramInstanceMappingReadResponse } from './dist/application-classification.js';
import {parseProgramInstanceCapabilities,parseProgramInstanceRegistrationReceipt} from './dist/application-classification.js';
import {evaluateProgramInstanceCondition,resolveProgramInstanceClassification} from './dist/application-classification.js';
import {parseProgramInstallationLinkBatch,parseProgramInstallationLinkReceipt,PROGRAM_INSTALLATION_LINK_CAPABILITY} from './dist/application-classification.js';
const installationVectors=JSON.parse(readFileSync(new URL('./program-installation-links-v1.vectors.json',import.meta.url),'utf8'));
for(const item of installationVectors.cases) {
  const value={...installationVectors.request,...item.patch};
  const request=()=>parseProgramInstallationLinkBatch(value,installationVectors.scope);
  const receipt=()=>parseProgramInstallationLinkReceipt(value,installationVectors.request,installationVectors.scope.machineId);
  if(item.requestValid)assert.doesNotThrow(request,item.id);else assert.throws(request,undefined,item.id);
  if(item.receiptValid)assert.doesNotThrow(receipt,item.id);else assert.throws(receipt,undefined,item.id);
}
const installScope={machineId:'machine-a',childId:'child-a',localUserId:'user-a',assignmentVersion:1,scanId:'1'.repeat(32)};
const installLinks={schemaVersion:1,childId:'child-a',localUserId:'user-a',assignmentVersion:1,scanId:installScope.scanId,links:[
  {variantKey:'entry-a',instanceId:'a'.repeat(64)},
  {variantKey:'entry-a',instanceId:'b'.repeat(64)},
  {variantKey:'entry-b',instanceId:'a'.repeat(64)}]};
assert.deepEqual(parseProgramInstallationLinkBatch(installLinks,installScope),installLinks);
const detachedLinks=parseProgramInstallationLinkBatch(installLinks,installScope);
detachedLinks.links[0].variantKey='changed';assert.equal(installLinks.links[0].variantKey,'entry-a');
// 跨孩子复用规则不意味着安装事实可以跨认证范围采用。
for(const patch of [{childId:'child-b'},{localUserId:'user-b'},{assignmentVersion:2},{scanId:'2'.repeat(32)},
  {schemaVersion:2},{machineId:'machine-a'},{productId:'product-a'},{links:[]},
  {links:[installLinks.links[0],installLinks.links[0]]},
  {links:[{variantKey:'entry-a',instanceId:'not-an-instance'}]},
  {links:[{variantKey:'\n',instanceId:'a'.repeat(64)}]},
  {links:[{...installLinks.links[0],productId:'product-a'}]},
  {links:[{...installLinks.links[0],status:'uninstalled'}]},
  {links:[{...installLinks.links[0],path:'/private/file'}]}])
  assert.throws(()=>parseProgramInstallationLinkBatch({...installLinks,...patch},installScope),/INVALID_PROGRAM_INSTALLATION_LINKS/);
for(const patch of [{machineId:''},{childId:''},{localUserId:''},{assignmentVersion:0},{scanId:''}])
  assert.throws(()=>parseProgramInstallationLinkBatch(installLinks,{...installScope,...patch}));
assert.throws(()=>parseProgramInstallationLinkBatch(installLinks,null));
// 即使调用范围与请求一致，也不能接受实际inventory扫描协议不支持的格式。
for(const scanId of ['scan-a','A'.repeat(32),'a'.repeat(31),'a'.repeat(33),null])
  assert.throws(()=>parseProgramInstallationLinkBatch({...installLinks,scanId},{...installScope,scanId}));
for(const length of [128,129]) {
  const localUserId='u'.repeat(length),read=()=>parseProgramInstallationLinkBatch({...installLinks,localUserId},{...installScope,localUserId});
  if(length===128)assert.equal(read().localUserId,localUserId);else assert.throws(read);
}
const maximumLinks={...installLinks,links:Array.from({length:100},(_,i)=>({variantKey:`entry-${i}`,instanceId:'a'.repeat(64)}))};
assert.equal(parseProgramInstallationLinkBatch(maximumLinks,installScope).links.length,100);
assert.throws(()=>parseProgramInstallationLinkBatch({...maximumLinks,links:[...maximumLinks.links,{variantKey:'overflow',instanceId:'b'.repeat(64)}]},installScope));
// 同一正向事实可重放；接收端按扫描和二元组幂等，不产生用量或产品识别。
assert.deepEqual(parseProgramInstallationLinkBatch(installLinks,installScope),parseProgramInstallationLinkBatch(installLinks,installScope));
assert.deepEqual(parseProgramInstallationLinkReceipt(installLinks,installLinks,installScope.machineId),installLinks);
const reverseReceipt={...installLinks,links:[...installLinks.links].reverse()};
assert.deepEqual(parseProgramInstallationLinkReceipt(reverseReceipt,installLinks,installScope.machineId),reverseReceipt);
for(const patch of [{childId:'child-b'},{localUserId:'user-b'},{assignmentVersion:2},{scanId:'2'.repeat(32)},
  {links:installLinks.links.slice(1)}, {links:[...installLinks.links,installLinks.links[0]]},
  {links:installLinks.links.map(link=>({...link,instanceId:'f'.repeat(64)}))},
  {links:[...installLinks.links,{variantKey:'another',instanceId:'a'.repeat(64)}]}])
  assert.throws(()=>parseProgramInstallationLinkReceipt({...installLinks,...patch},installLinks,installScope.machineId),/INVALID_PROGRAM_INSTALLATION_RECEIPT/);
assert.throws(()=>parseProgramInstallationLinkReceipt(installLinks,null,installScope.machineId));
const installationCaps={schemaVersion:1,enabled:true,capabilities:['program-instance-registration-v1',PROGRAM_INSTALLATION_LINK_CAPABILITY]};
assert.deepEqual(parseProgramInstanceCapabilities(installationCaps),installationCaps);
assert.throws(()=>parseProgramInstanceCapabilities({...installationCaps,enabled:false,capabilities:[PROGRAM_INSTALLATION_LINK_CAPABILITY]}));
const registrationReceipt={schemaVersion:1,childId:'child-a',items:[{instanceId:'a'.repeat(64),evidenceRevision:2,evidenceHash:'b'.repeat(64)}]};
assert.deepEqual(parseProgramInstanceRegistrationReceipt(registrationReceipt,registrationReceipt),registrationReceipt);
assert.equal(parseProgramInstanceRegistrationReceipt({...registrationReceipt,items:[{...registrationReceipt.items[0],evidenceRevision:3,
  evidenceHash:'c'.repeat(64)}]},registrationReceipt).items[0].evidenceRevision,3);
for(const patch of [{childId:'child-b'},{items:[]},{items:[registrationReceipt.items[0],registrationReceipt.items[0]]},
  {items:[{...registrationReceipt.items[0],evidenceRevision:1}]},{items:[{...registrationReceipt.items[0],evidenceHash:'c'.repeat(64)}]},
  {items:[{...registrationReceipt.items[0],productId:'must-not-ack-identity'}]}])
  assert.throws(()=>parseProgramInstanceRegistrationReceipt({...registrationReceipt,...patch},registrationReceipt));
for(const enabled of [false,true]) {
  const response={schemaVersion:1,enabled,capabilities:enabled?['program-instance-registration-v1']:[]};
  assert.deepEqual(parseProgramInstanceCapabilities(response),response);
  assert.throws(()=>parseProgramInstanceCapabilities({...response,enabled:!enabled}));
}
const mappingRequest={childId:'child-a',localUserId:'user-a',assignmentVersion:1,instanceIds:['a'.repeat(64)]};
const mappingResponse={schemaVersion:1,childId:'child-a',assignmentVersion:1,catalogVersion:2,
  items:[{instanceId:'a'.repeat(64),evidenceRevision:1,status:'confirmed',productId:'product-a'}],products:[{id:'product-a',name:'Product A'}]};
assert.deepEqual(parseProgramInstanceMappingReadRequest(mappingRequest),mappingRequest);
assert.deepEqual(parseProgramInstanceMappingReadResponse(mappingResponse,mappingRequest),mappingResponse);
const projectionContext={...mappingResponse,schemaVersion:2,products:[{...mappingResponse.products[0],type:'other',catalogGroup:'specialApplication'}],
  rules:[],binding:{childId:'child-a',products:[{productId:'product-a',classification:'other'}],ruleIds:[]}};
assert.deepEqual(parseProgramInstanceProjectionContext(projectionContext,mappingRequest),projectionContext);
const detachedContext=parseProgramInstanceProjectionContext(projectionContext,mappingRequest);
detachedContext.products[0].name='changed';assert.equal(projectionContext.products[0].name,'Product A');
for(const patch of [{childId:'other'},{assignmentVersion:2},{catalogVersion:null},
  {binding:{...projectionContext.binding,childId:'other'}},
  {products:[{...projectionContext.products[0],isChromeContainer:true}]},
  {products:[...projectionContext.products,{id:'unused',name:'unused',type:'other'}]}])
  assert.throws(()=>parseProgramInstanceProjectionContext({...projectionContext,...patch},mappingRequest));
assert.throws(()=>parseProgramInstanceMappingReadResponse(projectionContext,mappingRequest));
for(const patch of [{childId:'child-b'},{assignmentVersion:2},{catalogVersion:null},{products:[]},{items:[]},
  {items:[{...mappingResponse.items[0],status:'pending'}]},{products:[...mappingResponse.products,{id:'extra',name:'Extra'}]},
  {items:[{...mappingResponse.items[0],instanceId:'b'.repeat(64)}]}])
  assert.throws(()=>parseProgramInstanceMappingReadResponse({...mappingResponse,...patch},mappingRequest),/INVALID_PROGRAM_INSTANCE_MAPPING_RESPONSE/);
for(const status of ['pending','unresolved','conflict']) {
  const response={...mappingResponse,catalogVersion:status==='pending'?null:2,items:[{...mappingResponse.items[0],status,productId:null}],products:[]};
  assert.deepEqual(parseProgramInstanceMappingReadResponse(response,mappingRequest),response);
}
for(const patch of [{instanceIds:[]},{instanceIds:['a'.repeat(64),'a'.repeat(64)]},{instanceIds:['name']},{localUserId:'\n'},
  {assignmentVersion:0},{productId:'forged'}])
  assert.throws(()=>parseProgramInstanceMappingReadRequest({...mappingRequest,...patch}),/INVALID_PROGRAM_INSTANCE_MAPPING_READ/);
const detachedMapping=parseProgramInstanceMappingReadResponse(mappingResponse,mappingRequest);
detachedMapping.products[0].name='Changed'; detachedMapping.items[0].status='pending';
assert.equal(mappingResponse.products[0].name,'Product A'); assert.equal(mappingResponse.items[0].status,'confirmed');
const vectors = JSON.parse(readFileSync(new URL('./application-classification.vectors.json', import.meta.url)));
for (const vector of vectors.executionPolicyCases) {
  if (vector.valid) assert.deepEqual(parseProgramInstanceExecutionPolicy(vector.input), vector.input, vector.name);
  else assert.throws(() => parseProgramInstanceExecutionPolicy(vector.input), /INVALID_PROGRAM_INSTANCE_EXECUTION_POLICY/, vector.name);
}
const policySchema = JSON.parse(readFileSync(new URL('./runtime-app-policy-v1.schema.json', import.meta.url)));
assert.equal(policySchema.properties.programInstanceExecutionPolicy.$ref, '#/$defs/programInstanceExecutionPolicy');
assert.equal(policySchema.required.includes('programInstanceExecutionPolicy'), false, 'old policy remains representable');
const executionSchema = policySchema.$defs.programInstanceExecutionPolicy;
assert.equal(executionSchema.additionalProperties, false);
assert.deepEqual(executionSchema.required, Object.keys(executionPolicy));
assert.equal(executionSchema.properties.catalogVersion.maximum, Number.MAX_SAFE_INTEGER);
assert.equal(executionSchema.properties.blockedProducts.maxItems, 1000);
const entrySchema = executionSchema.properties.blockedProducts.items;
assert.equal(entrySchema.additionalProperties, false);
assert.deepEqual(entrySchema.required, Object.keys(executionPolicy.blockedProducts[0]));
assert.equal(entrySchema.properties.productId.$ref, '#/$defs/executionText');
const hintSchema = entrySchema.properties.suspectedMatchers.items;
assert.equal(hintSchema.additionalProperties, false);
assert.deepEqual(hintSchema.required, Object.keys(executionHint));
assert.equal(hintSchema.properties.productName.$ref, '#/$defs/executionText');
assert.equal(new RegExp(hintSchema.properties.signerKey.pattern).test(executionHint.signerKey), true);
assert.equal(new RegExp(hintSchema.properties.signerKey.pattern).test('A'.repeat(64)), false);
assert.equal(policySchema.$defs.executionText.maxLength, 256);
for (const invalidText of ['', 'bad\n', 'bad\u0000', 'bad\u007f'])
  assert.equal(new RegExp(policySchema.$defs.executionText.pattern).test(invalidText), false);
for(const vector of vectors.instanceConditionCases)
  assert.equal(evaluateProgramInstanceCondition(vector.expression,parseProductOwnershipEvidence(vector.evidence)),vector.expected,vector.name);
const instanceRule={id:'product',name:'Product rule',kind:'product',productId:'product-a',
  match:{operator:'all',conditions:[]},exclude:[],mode:'automatic',classification:'study',type:'other',enabled:true,source:'fixture',reason:'fixture'};
const instanceContext={...projectionContext,binding:{childId:'child-a',products:[],ruleIds:['product']},rules:[instanceRule]};
const instanceEvidence={platform:'windows',verified:{binaryHash:'a'.repeat(64)}};
const resolveInstance=(context=instanceContext)=>resolveProgramInstanceClassification(context,'child-a','a'.repeat(64),instanceEvidence);
assert.deepEqual(resolveInstance(),{classification:'study',status:'automatic',ruleIds:['product']});
for(const field of ['signerKey','fileSeriesKey','packageId','runtimeIdentity']) {
  const context={...instanceContext,rules:[{...instanceRule,exclude:[{operator:'all',conditions:[{field,value:'instance'}]}]}]};
  assert.deepEqual(resolveInstance(context),{classification:null,status:'unknown',ruleIds:['product']});
  assert.deepEqual(resolveInstance({...context,binding:projectionContext.binding}),{classification:'other',status:'explicit',ruleIds:[]});
}
const knownExclude={operator:'all',conditions:[{field:'binaryHash',value:'a'.repeat(64)}]};
assert.equal(resolveInstance({...instanceContext,rules:[{...instanceRule,exclude:[knownExclude]}]}).status,'unclassified');
assert.equal(resolveInstance({...instanceContext,rules:[{...instanceRule,match:{operator:'all',conditions:[{field:'binaryHash',value:'b'.repeat(64)}]},
  exclude:[{operator:'all',conditions:[{field:'signerKey',value:'missing'}]}]}]}).status,'unclassified');
const unknownLower={...instanceRule,id:'lower',kind:'type',productId:undefined,exclude:[{operator:'all',conditions:[{field:'signerKey',value:'missing'}]}]};
const rankedContext={...instanceContext,binding:{...instanceContext.binding,ruleIds:['product','lower']},rules:[instanceRule,unknownLower]};
assert.equal(resolveInstance(rankedContext).status,'automatic');
assert.equal(resolveInstance({...rankedContext,rules:[{...instanceRule,exclude:unknownLower.exclude},{...unknownLower,exclude:[]}]}).status,'unknown');
assert.equal(resolveInstance({...rankedContext,rules:[instanceRule,{...instanceRule,id:'lower',classification:'other'}]}).status,'conflict');
assert.equal(resolveInstance({...instanceContext,rules:[{...instanceRule,kind:'type',productId:undefined}]}).status,'automatic');
assert.equal(resolveInstance({...instanceContext,rules:[{...instanceRule,mode:'suggestion'}]}).status,'unclassified');
assert.equal(resolveInstance({...instanceContext,items:[{...mappingResponse.items[0],status:'unresolved',productId:null}]}).status,'unknown');
assert.throws(()=>resolveProgramInstanceClassification(instanceContext,'other-child','a'.repeat(64),instanceEvidence),/APPLICATION_PRODUCT_SCOPE_INVALID/);
const legacyShape = result => ({productId:result.productId,classification:result.classification,status:result.status,ruleIds:result.ruleIds,suggestions:result.suggestions});
// 新规则独立于孩子／实例：同证据在不同孩子及不同位置执行仍归同产品，实例不在这里合并。
const ownershipRule = {id:'exact',revision:1,enabled:true,platform:'windows',productId:'browser',match:{kind:'binaryHash',sha256:'a'.repeat(64)}};
const ownershipEvidence = {platform:'windows',verified:{binaryHash:'a'.repeat(64)}};
const knowledgeV4={schemaVersion:4,version:1,products:[{id:'browser',name:'Browser',type:'other',catalogGroup:'specialApplication'}],
  ownershipRules:[ownershipRule],rules:[],bindings:[{childId:'child-a',products:[{productId:'browser',classification:'other'}],ruleIds:[]}]};
assert.deepEqual(parseApplicationKnowledgeV4(knowledgeV4),knowledgeV4);
assert.notEqual(parseApplicationKnowledgeV4(knowledgeV4).ownershipRules[0].match,ownershipRule.match);
assert.throws(()=>parseApplicationKnowledge(knowledgeV4));
assert.throws(()=>parseApplicationKnowledgeV4({...knowledgeV4,schemaVersion:3}));
assert.throws(()=>parseApplicationKnowledgeV4({...knowledgeV4,products:[{...knowledgeV4.products[0],selectors:[]}]}));
assert.throws(()=>parseApplicationKnowledgeV4({...knowledgeV4,ownershipRules:[{...ownershipRule,productId:'missing'}]}));
assert.throws(()=>parseApplicationKnowledgeV4({...knowledgeV4,ownershipRules:[{...ownershipRule,childId:'child-a'}]}));
assert.throws(()=>parseApplicationKnowledgeV4({...knowledgeV4,bindings:[{childId:'child-a',products:[{productId:'missing',classification:'other'}],ruleIds:[]}]}));
const registrationScope={machineId:'machine-a',childId:'child-a',localUserId:'user-a',assignmentVersion:1};
const registration={schemaVersion:1,childId:'child-a',localUserId:'user-a',assignmentVersion:1,items:[{
  instance:{machineId:'machine-a',platform:'windows',locationRef:'1'.repeat(32),executableSha256:'a'.repeat(64)},
  evidenceRevision:1,evidence:ownershipEvidence}]};
const registrationBefore=JSON.stringify(registration);
const registered=await parseProgramInstanceRegistrationBatch(registration,registrationScope);
assert.deepEqual(registered,registration);
assert.notEqual(registered.items[0].instance,registration.items[0].instance);
assert.notEqual(registered.items[0].evidence.verified,ownershipEvidence.verified);
for(const change of [{childId:'child-b'},{localUserId:'user-b'},{assignmentVersion:2},{productId:'forged'},
  {items:[registration.items[0],registration.items[0]]},{items:Array(101).fill(registration.items[0])}])
  await assert.rejects(parseProgramInstanceRegistrationBatch({...registration,...change},registrationScope));
for(const change of [{evidenceRevision:0},{evidenceRevision:1.5},{productId:'forged'},
  {instance:{...registration.items[0].instance,machineId:'machine-b'}},
  {evidence:{platform:'macos',verified:{}}},
  {evidence:{platform:'windows',verified:{binaryHash:'b'.repeat(64)}}}])
  await assert.rejects(parseProgramInstanceRegistrationBatch({...registration,items:[{...registration.items[0],...change}]},registrationScope));
const anotherPosition={...registration.items[0],instance:{...registration.items[0].instance,locationRef:'2'.repeat(32)}};
assert.equal((await parseProgramInstanceRegistrationBatch({...registration,items:[registration.items[0],anotherPosition]},registrationScope)).items.length,2);
assert.equal((await parseProgramInstanceRegistrationBatch({...registration,items:[]},registrationScope)).items.length,0);
assert.equal((await parseProgramInstanceRegistrationBatch({...registration,items:[{...registration.items[0],evidence:{platform:'windows',verified:{}}}]},registrationScope)).items.length,1);
assert.equal(JSON.stringify(registration),registrationBefore);
assert.deepEqual(parseProductOwnershipEvidence(ownershipEvidence),ownershipEvidence);
assert.notEqual(parseProductOwnershipEvidence(ownershipEvidence).verified,ownershipEvidence.verified);
assert.throws(()=>parseProductOwnershipEvidence({...ownershipEvidence,productId:'claimed'}),/INVALID_PRODUCT_OWNERSHIP_EVIDENCE/);
assert.throws(()=>parseProductOwnershipEvidence({...ownershipEvidence,verified:{path:'C:\\private\\app.exe'}}),/INVALID_PRODUCT_OWNERSHIP_EVIDENCE/);
assert.throws(()=>parseProductOwnershipEvidence({platform:'windows',verified:{macosSignerKey:'b'.repeat(64)}}),/INVALID_PRODUCT_OWNERSHIP_EVIDENCE/);
assert.throws(()=>parseProductOwnershipEvidence({platform:'macos',verified:{binaryHash:'not-a-hash'}}),/INVALID_PRODUCT_OWNERSHIP_EVIDENCE/);
assert.deepEqual(parseProductOwnershipEvidence({platform:'macos',verified:{}}),{platform:'macos',verified:{}});
assert.deepEqual(resolveProductOwnership([ownershipRule],ownershipEvidence),{status:'confirmed',productId:'browser',ruleIds:['exact']});
assert.equal(resolveProductOwnership([ownershipRule],{platform:'windows',verified:{}}).status,'unresolved');
assert.equal(resolveProductOwnership([ownershipRule],{...ownershipEvidence,platform:'macos'}).status,'unresolved');
assert.equal(resolveProductOwnership([{...ownershipRule,enabled:false}],ownershipEvidence).status,'unresolved');
assert.equal(resolveProductOwnership([],ownershipEvidence).status,'unresolved');
assert.deepEqual(resolveProductOwnership([ownershipRule,{...ownershipRule,id:'second'}],ownershipEvidence),{status:'confirmed',productId:'browser',ruleIds:['exact','second']});
assert.equal(resolveProductOwnership([ownershipRule,{...ownershipRule,id:'other',productId:'different'}],ownershipEvidence).status,'conflict');
assert.throws(()=>resolveProductOwnership([{...ownershipRule,childId:'child'}],ownershipEvidence),/INVALID_PRODUCT_OWNERSHIP_RULE/);
assert.throws(()=>resolveProductOwnership([ownershipRule,ownershipRule],ownershipEvidence),/INVALID_PRODUCT_OWNERSHIP_RULE/);
assert.throws(()=>resolveProductOwnership([{...ownershipRule,match:{kind:'name',name:'Chrome'}}],ownershipEvidence),/INVALID_PRODUCT_OWNERSHIP_RULE/);
const aumidRule={...ownershipRule,match:{kind:'windowsAumid',aumid:'Fixture_family!Main'}};
assert.equal(resolveProductOwnership([aumidRule],{platform:'windows',verified:{windowsAumid:'Fixture_family!Main'}}).status,'confirmed');
assert.equal(resolveProductOwnership([aumidRule],{platform:'windows',verified:{windowsAumid:'Fixture_family!Other'}}).status,'unresolved');
assert.throws(()=>resolveProductOwnership([{...aumidRule,match:{kind:'windowsAumid',aumid:'Fixture_family'}}],ownershipEvidence),/INVALID_PRODUCT_OWNERSHIP_RULE/);
const macRule={...ownershipRule,platform:'macos',match:{kind:'macosSignature',signerKey:'b'.repeat(64),signingIdentifier:'fixture.browser'}};
assert.equal(resolveProductOwnership([macRule],{platform:'macos',verified:{macosSignerKey:'b'.repeat(64)}}).status,'unresolved');
assert.equal(resolveProductOwnership([macRule],{platform:'macos',verified:{macosSignerKey:'b'.repeat(64),macosSigningIdentifier:'fixture.browser'}}).status,'confirmed');
assert.equal(resolveProductOwnership([macRule],{platform:'macos',verified:{macosSignerKey:'b'.repeat(64),macosSigningIdentifier:'fixture.other'}}).status,'unresolved');
const seriesRule={...ownershipRule,match:{kind:'windowsFileSeries',fileSeriesKey:'c'.repeat(64)}};
assert.equal(resolveProductOwnership([seriesRule],{platform:'windows',verified:{windowsFileSeriesKey:'c'.repeat(64)}}).status,'confirmed');
const programInstances=[{instanceId:'machine-location-content-b',evidence:ownershipEvidence},
  {instanceId:'machine-location-content-a',evidence:ownershipEvidence}];
const mapA=buildProgramInstanceProductMapping('child-a',1,['browser'],[ownershipRule],programInstances);
const mapB=buildProgramInstanceProductMapping('child-b',1,['browser'],[ownershipRule],programInstances);
assert.notEqual(mapA.childId,mapB.childId);
assert.deepEqual(mapA.items,mapB.items);
assert.equal(mapA.items.length,2); // 同产品不折叠实例
assert.deepEqual(mapA.items.map(item=>item.instanceId),['machine-location-content-a','machine-location-content-b']);
assert.equal(Object.hasOwn(mapA.items[0],'canonicalName'),false);
assert.equal(Object.hasOwn(mapA.items[0],'classification'),false);
assert.equal(buildProgramInstanceProductMapping('child-a',2,['browser'],[],programInstances).items[0].status,'unresolved');
assert.throws(()=>buildProgramInstanceProductMapping('child-a',1,[],[ownershipRule],programInstances),/PRODUCT_OWNERSHIP_TARGET_MISSING/);
assert.throws(()=>buildProgramInstanceProductMapping('child-a',1,['browser'],[ownershipRule],[programInstances[0],programInstances[0]]),/INVALID_PROGRAM_INSTANCE_MAPPING/);
assert.throws(()=>buildProgramInstanceProductMapping('child-a',1,['browser'],[ownershipRule],[{...programInstances[0],productId:'forced'}]),/INVALID_PROGRAM_INSTANCE_MAPPING/);
assert.throws(()=>buildProgramInstanceProductMapping('',1,['browser'],[ownershipRule],programInstances),/INVALID_PROGRAM_INSTANCE_MAPPING/);
assert.deepEqual(programInstances.map(item=>item.instanceId),['machine-location-content-b','machine-location-content-a']); // 不修改输入事实
// 映射是可重建结果；修改规则不能就地改变旧映射或实例证据。
const originalMappingJson=JSON.stringify(mapA);
const originalInstancesJson=JSON.stringify(programInstances);
const redirectedRule={...ownershipRule,revision:2,productId:'replacement'};
const redirected=buildProgramInstanceProductMapping('child-a',2,['browser','replacement'],[redirectedRule],programInstances);
assert.ok(redirected.items.every(item=>item.status==='confirmed' && item.productId==='replacement'));
const ambiguous=buildProgramInstanceProductMapping('child-a',3,['browser','replacement'],
  [ownershipRule,{...redirectedRule,id:'second-target'}],programInstances);
assert.ok(ambiguous.items.every(item=>item.status==='conflict' && item.productId===null));
const withdrawn=buildProgramInstanceProductMapping('child-a',4,['browser'],[{...ownershipRule,enabled:false}],programInstances);
assert.ok(withdrawn.items.every(item=>item.status==='unresolved' && item.productId===null));
const changedContent=[{instanceId:'machine-location-new-content',evidence:{platform:'windows',verified:{binaryHash:'d'.repeat(64)}}}];
assert.equal(buildProgramInstanceProductMapping('child-a',5,['browser'],[ownershipRule],changedContent).items[0].status,'unresolved');
assert.equal(JSON.stringify(mapA),originalMappingJson);
assert.equal(JSON.stringify(programInstances),originalInstancesJson);
// 新证据不能伪装成旧分类证据：包容器不等于完整AUMID，旧签名字段也不自动成为平台验签结果。
for(const verified of [{packageId:'Fixture_family'}, {fileSeriesKey:'c'.repeat(64)}, {signerKey:'b'.repeat(64)}])
  assert.throws(()=>parseProductOwnershipEvidence({platform:'windows',verified}),/INVALID_PRODUCT_OWNERSHIP_EVIDENCE/);
for (const vector of vectors.cases) assert.deepEqual(legacyShape(resolveApplication(vector.knowledge, vector.childId, vector.evidence, vector.previous)), vector.expected, vector.name);
assert.equal(safeAutomatic({operator:'any',conditions:[]}),false);
assert.equal(safeAutomatic({operator:'invalid',conditions:[{field:'binaryHash',value:'hash'}]}),false);
const valid = {schemaVersion:1,version:0,products:[],rules:[],bindings:[]};
assert.deepEqual(parseApplicationKnowledge(valid), valid);
const confirmedBlock={schemaVersion:3,version:1,products:[{id:'firefox',name:'Firefox',type:'other',selectors:[
  {platform:'windows',match:{operator:'all',conditions:[{field:'fileSeriesKey',value:'a'.repeat(64)}]}}],
  suspectedMatchers:[{platform:'windows',signerKey:'b'.repeat(64),productName:'Firefox'}]}],rules:[],
  bindings:[{childId:'child',products:[{productId:'firefox',classification:'blocked',enhancedBlocking:true}],ruleIds:[]}]};
assert.deepEqual(parseApplicationKnowledge(confirmedBlock),confirmedBlock);
const specialKnowledge = {...confirmedBlock,products:[
  {...confirmedBlock.products[0],catalogGroup:'specialApplication'},
  {...confirmedBlock.products[0],id:'second-browser',catalogGroup:'specialApplication'},
  {...confirmedBlock.products[0],id:'ordinary-other'},
]};
assert.deepEqual(parseApplicationKnowledge(specialKnowledge),specialKnowledge);
assert.equal(isSpecialApplicationProduct('firefox',specialKnowledge),true);
assert.equal(isSpecialApplicationProduct('second-browser',specialKnowledge),true);
assert.equal(isSpecialApplicationProduct('ordinary-other',specialKnowledge),false);
assert.equal(isSpecialApplicationProduct(null,specialKnowledge),false);
assert.throws(()=>parseApplicationKnowledge({...confirmedBlock,products:[{...confirmedBlock.products[0],catalogGroup:'other'}]}),/INVALID_PRODUCT/);
assert.throws(()=>parseApplicationKnowledge({...confirmedBlock,products:[{...confirmedBlock.products[0],suspectedMatchers:[{platform:'windows',signerKey:'not-a-hash',productName:'Firefox'}]}]}),/INVALID_SUSPECTED_MATCHER/);
assert.throws(()=>parseApplicationKnowledge({...confirmedBlock,bindings:[{childId:'child',products:[{productId:'firefox',classification:'study',enhancedBlocking:true}],ruleIds:[]}]}),/INVALID_PRODUCT_BINDING/);
assert.throws(()=>parseApplicationKnowledge({...confirmedBlock,schemaVersion:2}),/INVALID_PRODUCT/);
assert.notEqual(parseApplicationKnowledge(valid), valid);
assert.throws(() => parseApplicationKnowledge({...valid,path:'C:/private'}), /INVALID_APPLICATION_KNOWLEDGE/);
assert.throws(() => parseApplicationKnowledge({...valid,products:[{id:'p',name:'Game',type:'game',selectors:[{platform:'windows',match:{operator:'all',conditions:[{field:'productName',value:'Game'}]}}]}]}), /WEAK_PRODUCT_SELECTOR/);
const rule = {id:'r',name:'Rule',kind:'developer',match:{operator:'all',conditions:[{field:'productName',value:'Game'}]},exclude:[],mode:'automatic',classification:'restrictedEntertainment',type:'game',enabled:true,source:'fixture',reason:'fixture'};
assert.throws(() => parseApplicationKnowledge({...valid,rules:[rule]}), /WEAK_AUTOMATIC_RULE/);
assert.throws(() => parseApplicationKnowledge({...valid,rules:[{...rule,kind:'product',match:{operator:'all',conditions:[{field:'signerKey',value:'signer'}]}}]}), /INVALID_PRODUCT_RULE_SCOPE/);
assert.throws(() => parseApplicationKnowledge({...valid,bindings:[{childId:'child',products:[],ruleIds:['missing']}]}), /INVALID_CHILD_BINDING/);
const evidence = {platform:'windows',runtimeIdentity:'opaque',displayName:'App',values:{},verifiedFields:['runtimeIdentity']};
assert.deepEqual(parseAppEvidence(evidence),evidence);
const discovery = {role:'component',nameSource:'fallback',sourceKinds:['package']};
assert.deepEqual(parseAppEvidence({...evidence,discovery}).discovery,discovery);
const systemDiscovery = {role:'application',nameSource:'appList',sourceKinds:['package'],applicationOrigin:'operatingSystem',originEvidenceCode:'exactPackageRule'};
assert.deepEqual(parseAppEvidence({...evidence,discovery:systemDiscovery}).discovery,systemDiscovery);
const packageContainer = {role:'application',nameSource:'installation',sourceKinds:['package','distribution-ea','distribution-ubisoft','distribution-gog'],objectKind:'packageContainer',sourceKind:'user-packages'};
assert.deepEqual(parseAppEvidence({...evidence,discovery:packageContainer}).discovery,packageContainer);
assert.deepEqual(parseAppEvidence({...evidence,discovery:{...discovery,applicationOrigin:'unknown'}}).discovery.applicationOrigin,'unknown');
assert.throws(()=>parseAppEvidence({...evidence,discovery:{...discovery,originEvidenceCode:'exactPackageRule'}}),/INVALID_DISCOVERY_SUMMARY/);
assert.throws(()=>parseAppEvidence({...evidence,discovery:{...discovery,path:'C:/private'}}),/INVALID_DISCOVERY_SUMMARY/);
const packaged = {...evidence,runtimeIdentity:'package-main',values:{packageId:'Fixture!Main'},verifiedFields:['packageId']};
const runtime = {...packaged,runtimeIdentity:'old-binary-id',values:{packageId:'Fixture!Main',binaryHash:'a'.repeat(64)},verifiedFields:['packageId','binaryHash']};
const copy = {...evidence,runtimeIdentity:'copy-id',values:{binaryHash:'a'.repeat(64)},verifiedFields:['binaryHash']};
let associated=associateApplicationEvidence([packaged,runtime,copy,{...evidence,runtimeIdentity:'same-name'}]);
assert.equal(associated.get('windows\npackage-main'),associated.get('windows\nold-binary-id'));
assert.equal(associated.get('windows\ncopy-id'),associated.get('windows\nold-binary-id'));
assert.notEqual(associated.get('windows\nsame-name'),associated.get('windows\nold-binary-id'));
associated=associateApplicationEvidence([runtime,{...runtime,runtimeIdentity:'second-app',values:{...runtime.values,packageId:'Fixture!Video'}}]);
assert.notEqual(associated.get('windows\nold-binary-id'),associated.get('windows\nsecond-app'));
assert.throws(() => parseAppEvidence({...evidence,productId:'forged'}), /INVALID_APPLICATION_EVIDENCE/);
assert.throws(() => parseAppEvidence({...evidence,values:{path:'C:/private'}}), /INVALID_APPLICATION_EVIDENCE/);
assert.throws(() => parseAppEvidence({...evidence,verifiedFields:['signerKey']}), /MISSING_VERIFIED_VALUE/);
assert.throws(() => parseAppEvidence({...evidence,values:{signerKey:'certificate-plaintext'}}), /INVALID_OPAQUE_APPLICATION_EVIDENCE/);
assert.throws(() => parseAppEvidence({...evidence,values:{productName:'C:/Users/private/game.exe'}}), /PRIVATE_APPLICATION_EVIDENCE/);
assert.throws(() => parseApplicationKnowledge({...valid,products:[{id:'p',name:'Game',type:'game',selectors:[{platform:'windows',match:{operator:'all',conditions:[{field:'signerKey',value:'signer'}]}}]}]}), /BROAD_PRODUCT_SELECTOR/);
const typeKnowledge={schemaVersion:2,version:1,products:[{id:'aimlabs',name:'Aimlabs',type:'game',selectors:[{platform:'windows',match:{operator:'all',conditions:[{field:'distributionKey',value:'steam:714010'}]}}]}],rules:[{id:'games',name:'Games',kind:'type',match:{operator:'all',conditions:[]},exclude:[],mode:'automatic',classification:'restrictedEntertainment',type:'game',enabled:true,source:'fixture',reason:'confirmed type'}],bindings:[{childId:'child',products:[],ruleIds:['games']}]};
const aimlabs={platform:'windows',runtimeIdentity:'opaque',displayName:'Aimlabs',values:{distributionKey:'steam:714010'},verifiedFields:['distributionKey']};
assert.deepEqual(resolveApplication(typeKnowledge,'child',aimlabs),{productId:'aimlabs',classification:'restrictedEntertainment',status:'automatic',ruleIds:['games'],suggestions:[],appType:'game',typeStatus:'confirmed',typeReasonCode:'distributionProductRule'});
assert.equal(resolveApplication({...typeKnowledge,bindings:[{childId:'child',products:[{productId:'aimlabs',classification:'composite'}],ruleIds:['games']}]},'child',aimlabs).classification,'composite');
assert.equal(resolveApplication(typeKnowledge,'child',{...aimlabs,runtimeIdentity:'spoof',values:{declaredType:'game'},verifiedFields:[]}).typeStatus,'unknown');
const utilityKnowledge={...typeKnowledge,products:[{id:'game-bar',name:'Game Bar',type:'gameUtility',selectors:[{platform:'windows',match:{operator:'all',conditions:[{field:'distributionKey',value:'microsoft-store:microsoft.xboxgamingoverlay_8wekyb3d8bbwe'}]}}]}]};
const gameBar={platform:'windows',runtimeIdentity:'game-bar',displayName:'Game Bar',values:{distributionKey:'microsoft-store:microsoft.xboxgamingoverlay_8wekyb3d8bbwe'},verifiedFields:['distributionKey']};
assert.deepEqual(resolveApplication(utilityKnowledge,'child',gameBar),{productId:'game-bar',classification:'unclassified',status:'unclassified',ruleIds:[],suggestions:[],appType:'gameUtility',typeStatus:'confirmed',typeReasonCode:'distributionProductRule'});
assert.equal(parseApplicationKnowledge({...valid,products:utilityKnowledge.products}).products[0].type,'gameUtility');
assert.throws(()=>parseAppEvidence({...aimlabs,values:{distributionKey:'unknown:714010'}}),/INVALID_DISTRIBUTION_KEY/);
const schema = JSON.parse(readFileSync(new URL('./application-knowledge.schema.json', import.meta.url)));
assert.equal(schema.additionalProperties,false);
assert.deepEqual(schema.required,Object.keys(valid));
for (const platform of [['windows'], {toString:()=> 'windows'}, new String('macos'), null, 0])
  assert.throws(()=>parseProductOwnershipEvidence({platform,verified:{}}),/INVALID_PRODUCT_OWNERSHIP_EVIDENCE/);
console.log('classification vectors: '+vectors.cases.length+' legacy + '+vectors.instanceConditionCases.length+' instance conditions PASS; projection assertions PASS');

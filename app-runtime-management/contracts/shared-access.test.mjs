import assert from 'node:assert/strict';
import fs from 'node:fs';
import {projectSharedAccessPolicyV2, canonicalSharedAccessPolicyV2, createSharedAccessPolicyIdentityV2, SHARED_ACCESS_POLICY_V2_CAPABILITY} from './dist/shared-access.js';
import * as currentAccess from './dist/shared-access.js';
assert.equal(SHARED_ACCESS_POLICY_V2_CAPABILITY,'shared-access-policy-v2');
const modernConfig={forcedUsePolicyV1:{schemaVersion:1,enabled:true,reminderIntervalMinutes:20,
  quotaOverrunMinutes:{dailyStudy:0,dailyComposite:0,dailyRest:10,dailyOnline:0,weeklyRest:null,domain:0},
  advisoryWindowDailyMaxMinutes:null},autonomyConfig:{quotaOverrunConfirmationRequired:false,
  timeWindowAdvisoryEnabled:true,softReminderTimeoutAction:'continue'}};
const modern=projectSharedAccessPolicyV2(modernConfig,9,100);
// 当前策略从统一配置直接读取，不借旧策略生成器或旧策略验证器接管。
const currentPolicySource=fs.readFileSync(new URL('./shared-access.ts',import.meta.url),'utf8');
const currentPolicyFunctions=currentPolicySource.slice(currentPolicySource.indexOf('export function projectSharedAccessPolicyV2'),
  currentPolicySource.indexOf('function projectChildAccessPolicyFields'));
assert.doesNotMatch(currentPolicyFunctions,/projectLegacySharedAccessPolicy\(|canonicalSharedAccessPolicyV1\(|validateSharedAccessPolicyIdentityV1\(/);
const currentLimits=projectSharedAccessPolicyV2({timeQuota:{daily:{monday:{studyMinutes:10,compositeMinutes:0,restMinutes:5}},
  weekly:{restMinutes:null}},timeWindows:{daily:{monday:{studyWindows:[{start:'08:00',end:'24:00'}]}}}},52,1234);
assert.deepEqual(currentLimits.dailyMinutes.monday,{study:10,composite:0,rest:5});
assert.equal(currentLimits.weeklyRestMinutes,null);
assert.deepEqual(currentLimits.timeWindows.monday.study,[{start:'08:00',end:'24:00'}]);
assert.equal(currentLimits.stage,'legacy','独立工作阶段名称保留，不是旧业务回退');
assert.equal(modern.schemaVersion,2);assert.equal(modern.stage,'legacy');
assert.deepEqual(modern.forcedUsePolicyV1,modernConfig.forcedUsePolicyV1);
assert.equal(modern.autonomy.quotaOverrunConfirmationRequired,false);
assert.equal(modern.autonomy.timeWindowAdvisoryEnabled,true);
assert.equal(modern.autonomy.visibleResponseDeadlineSeconds,60);
assert.equal(Object.hasOwn(modern.autonomy,'dailyFirstReminderMinutes'),false);
assert.equal(projectSharedAccessPolicyV2({},1,1).forcedUsePolicyV1,null);
assert.equal(projectSharedAccessPolicyV2({},1,1).downtimeConfig.enabled,false);
assert.throws(()=>canonicalSharedAccessPolicyV2({...modern,schemaVersion:1}));
assert.throws(()=>canonicalSharedAccessPolicyV2({...modern,extra:true}));
assert.throws(()=>projectSharedAccessPolicyV2({...modernConfig,autonomyConfig:{quotaOverrunConfirmationRequired:'false'}},1,1));
assert.throws(()=>projectSharedAccessPolicyV2({...modernConfig,forcedUsePolicyV1:{...modernConfig.forcedUsePolicyV1,reminderIntervalMinutes:0}},1,1));
assert.throws(()=>canonicalSharedAccessPolicyV2({...modern,downtimeConfig:{...modern.downtimeConfig,allowedApplicationTypes:['blocked']}}));
const captured=structuredClone(modern);modernConfig.forcedUsePolicyV1.quotaOverrunMinutes.dailyRest=99;
assert.deepEqual(modern,captured,'projection must capture configuration rather than retain mutable references');
const modernIdentity=await createSharedAccessPolicyIdentityV2(modern);
assert.equal(modernIdentity.schemaVersion,2);
for (const change of [p=>{p.stage='shadow';}, p=>{p.autonomy.quotaOverrunConfirmationRequired=true;},
  p=>{p.forcedUsePolicyV1.quotaOverrunMinutes.dailyRest=11;}, p=>{p.downtimeConfig.enabled=true;}]) {
  const updated=structuredClone(modern);change(updated);
  assert.notEqual((await createSharedAccessPolicyIdentityV2(updated)).policyHash,modernIdentity.policyHash);
}

for (const retired of ['projectLegacySharedAccessPolicy','projectSharedQuotaDay','canonicalSharedAccessPolicyV1',
  'createSharedAccessPolicyIdentityV1','validateSharedAccessPolicyIdentityV1','matchesSharedAccessPolicyIdentityV1',
  'sharedAccessAdmissionV1','validateSharedReminderResult','SHARED_ACCESS_SCHEMA_VERSION'])
  assert.equal(Object.hasOwn(currentAccess,retired),false,`旧业务导出必须退出：${retired}`);
// 仍有效的原策略安全案例迁到V2，不随旧实现删除。
const beforeIdentity=structuredClone(modern);
const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).reverse().map(key=>[key,reorder(value[key])])):value;
assert.deepEqual(await createSharedAccessPolicyIdentityV2(reorder(modern)),modernIdentity);
currentAccess.validateSharedAccessPolicyIdentityV2(modernIdentity);
for(const change of [p=>{p.effectiveAtMs+=1;},p=>{p.dailyMinutes.monday.study=1;},
  p=>{p.timeWindows.monday.study=[{start:'01:00',end:'24:00'}];}]) {
  const changed=structuredClone(modern);change(changed);
  assert.notEqual((await createSharedAccessPolicyIdentityV2(changed)).policyHash,modernIdentity.policyHash);
}
for(const bad of [{...modern,token:'private'},{...modern,revision:'profile-config:9007199254740992'},
  {...modern,stage:{toString:()=>'legacy'}},{...modern,autonomy:{...modern.autonomy,extra:true}},
  {...modern,timeWindows:{...modern.timeWindows,monday:{study:[{start:'24:00',end:'24:00'}],composite:null,rest:null}}}])
  assert.throws(()=>canonicalSharedAccessPolicyV2(bad),/INVALID_SHARED_ACCESS_POLICY_V2/);
for(const bad of [{...modernIdentity,policyHash:'A'.repeat(64)},{...modernIdentity,token:'private'},
  {...modernIdentity,stage:'unknown'},{...modernIdentity,schemaVersion:1}])
  assert.throws(()=>currentAccess.validateSharedAccessPolicyIdentityV2(bad),/INVALID_SHARED_ACCESS_POLICY_IDENTITY_V2/);
const duringDigest=structuredClone(modern),pending=createSharedAccessPolicyIdentityV2(duringDigest);
duringDigest.stage='shared';duringDigest.effectiveAtMs+=1;
assert.deepEqual(await pending,modernIdentity,'摘要等待期间捕获的当前策略不受调用者修改影响');
assert.deepEqual(modern,beforeIdentity,'身份计算不修改统一配置');
console.log('shared access V2: direct configuration/strict fields/content identity/digest race/retired exports PASS');

'use strict';
// Actual device router and owner-scoped policy reader; isolated authentication/DB fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function load(relative, dependencies) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => dependencies[id] || {}, module, module.exports);
  return module.exports;
}
(async () => {
  const contract = await import('../../app-runtime-management/contracts/dist/shared-access.js');
  const quota = load('extension/core/quota-config.js', {});
  const downtime = load('pages/downtime-config.js', {});
  const { readSharedAccessPolicyV2ForChild, normalizeSharedAccessRolloutV1 } = load('workers/src/routes/profiles.ts', {
    '@timeonchrome/app-runtime-contracts/shared-access': contract,
    '../../../extension/core/quota-config.js': quota,
    '../../../pages/downtime-config.js': downtime,
  });
  let identity = { profileId: 'bound-child', deviceId: 'bound-device', unbound: false };
  let missing = false, fail = false;
  let basisRevision = 'a'.repeat(64), policyChanged = false, bindingChanged = false, basisFail = false;
  let basisReads = 0, authReads = 0;
  let derivedError = '', derivedReads = 0, v1PolicyReads = 0, v2PolicyReads = 0;
  const calls = [];
  const config = { timeQuota: { daily: { friday: { studyMinutes: 0, compositeMinutes: 30, restMinutes: 60 } },
    weekly: { restMinutes: 120 } }, restConfig: { repeatReminderMinutes: 10 } };
  const env = { DB: { prepare(sql) {
    return { bind(...args) { calls.push({ sql, args }); return { async first() {
      if (fail) throw new Error('private database details must not leak');
      if (missing) return null;
      if (sql === 'SELECT account_id FROM profiles WHERE id = ?') {
        assert.deepEqual(args, ['bound-child']); return { account_id: 'bound-owner' };
      }
      assert.equal(sql, 'SELECT config, version, updated_at FROM profiles WHERE id = ? AND account_id = ?');
      assert.deepEqual(args, ['bound-child', 'bound-owner']);
      return { config: JSON.stringify(config), version: policyChanged && basisReads ? 10 : 9, updated_at: 100 };
    } }; } };
  } } };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
  const { deviceRouter } = load('workers/src/routes/device.ts', {
    '../db/middleware': { json },
    './profiles': {
      readSharedAccessPolicyV2ForChild: (...args) => { v2PolicyReads++; return readSharedAccessPolicyV2ForChild(...args); },
    },
    '@timeonchrome/app-runtime-contracts/shared-access': contract,
    '../services/sharedWebContributions': {
      readSharedWebJson: request => request.json(),
    },
    '../services/sharedWebSourceBinding': {
      issueSharedWebSourceBindingV2: async (_env, scope, scopeProof) => {
        derivedReads++;basisReads++;assert.equal(scope.accountId,'bound-owner');assert.equal(scope.deviceToken,'fixture-device');
        if(derivedError)throw Error(derivedError);
        return {schemaVersion:2,scopeProof};
      },
    },
    './deviceIdentity': {
      verifyDeviceTokenFromRequest: async request => {
        authReads++; return request.headers.get('Authorization') === 'Bearer fixture-device'
          ? {...identity,profileId:bindingChanged && authReads%2===0?'new-child':identity.profileId} : null;
      },
      deviceUnboundResponse: () => json({ code: 'DEVICE_UNBOUND' }, 403),
    },
  });
  const request = (query = '', auth = true) => new Request('https://fixture/device/shared-access/v2' + query,
    { headers: auth ? { Authorization: 'Bearer fixture-device' } : {} });
  assert.equal((await deviceRouter.handle(request('', false), env)).status, 401);
  assert.equal(calls.length, 0, 'unauthenticated requests cannot read profiles');
  identity.unbound = true;
  assert.equal((await deviceRouter.handle(request(), env)).status, 403);
  assert.equal(calls.length, 0);
  identity.unbound = false;
  for (const query of ['?childId=other', '?deviceId=other', '?date=2026-10-02', '?profileId=other']) {
    assert.equal((await deviceRouter.handle(request(query), env)).status, 400);
    assert.equal(calls.length, 0, 'caller-selected scope cannot reach database');
  }
  const response = await deviceRouter.handle(request(), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['policy', 'profileId', 'schemaVersion']);
  assert.equal(body.profileId, 'bound-child', 'binding is authenticated, not caller-selected');
  assert.equal(body.schemaVersion, 2);
  assert.equal(body.policy.stage, 'legacy', 'read does not enable shared execution');
  assert.equal(body.policy.revision, 'profile-config:9');
  assert.equal(body.policy.dailyMinutes.friday.study, 0);
  assert.equal(body.policy.dailyMinutes.friday.composite, 30);
  assert.equal(body.policy.weeklyRestMinutes, 120);
  const v2request = (query = '', auth = true) => new Request('https://fixture/device/shared-access/v2' + query,
    {headers: auth ? {Authorization: 'Bearer fixture-device'} : {}});
  assert.equal((await deviceRouter.handle(v2request('',false),env)).status,401);
  assert.equal((await deviceRouter.handle(v2request('?childId=foreign'),env)).status,400);
  const v2body=await (await deviceRouter.handle(v2request(),env)).json();
  assert.equal(v2body.schemaVersion,2);assert.equal(v2body.profileId,'bound-child');
  assert.equal(v2body.policy.stage,'legacy');assert.equal(v2body.policy.forcedUsePolicyV1,null);
  assert.deepEqual(v2body.policy.dailyMinutes,body.policy.dailyMinutes);
  config.downtimeConfig={schemaVersion:1,enabled:true,windowsByWeekday:{friday:[{start:'22:00',end:'07:00'}]},
    allowedWebsiteTypes:['study'],allowedApplicationTypes:['other']};
  const withDowntime=await (await deviceRouter.handle(v2request(),env)).json();
  assert.deepEqual(withDowntime.policy.downtimeConfig.windowsByWeekday.friday,[{start:'22:00',end:'07:00'}]);
  assert.deepEqual(withDowntime.policy.downtimeConfig.windowsByWeekday.monday,[]);
  assert.deepEqual(withDowntime.policy.downtimeConfig.allowedApplicationTypes,['other']);
  delete config.downtimeConfig;
  config.sharedAccessRolloutV1={schemaVersion:1,stage:'shared'};
  assert.equal((await (await deviceRouter.handle(v2request(),env)).json()).policy.stage,'shadow');
  delete config.sharedAccessRolloutV1;
  assert.deepEqual(body.policy, await readSharedAccessPolicyV2ForChild(env.DB, 'bound-owner', 'bound-child'),
    'device and parent consume exactly the same projection');
  for(const invalid of [null,[],{schemaVersion:2,stage:'shared'}, {schemaVersion:1,stage:'active'},
    {schemaVersion:1,stage:'shared',enabled:true},{schemaVersion:1,stage:{toString:()=> 'shared'}}])
    assert.equal(normalizeSharedAccessRolloutV1(invalid),null,'rollout metadata cannot smuggle a separate configuration');
  config.sharedAccessRolloutV1={schemaVersion:1,stage:'shadow'};
  const shadow=await readSharedAccessPolicyV2ForChild(env.DB,'bound-owner','bound-child');
  assert.equal(shadow.stage,'shadow');
  assert.deepEqual(shadow.dailyMinutes,body.policy.dailyMinutes,'stage does not create another quota source');
  config.sharedAccessRolloutV1.stage='shared';
  assert.equal((await readSharedAccessPolicyV2ForChild(env.DB,'bound-owner','bound-child')).stage,'shadow',
    'stored rollout intent cannot bypass the default-off deployment switch');
  env.SHARED_ACCESS_EXECUTION_ENABLED='true';
  const shared=(await (await deviceRouter.handle(request(),env)).json()).policy;
  assert.equal(shared.stage,'shared');
  assert.deepEqual(shared,await readSharedAccessPolicyV2ForChild(env.DB,'bound-owner','bound-child',true));
  assert.notEqual((await contract.createSharedAccessPolicyIdentityV2(shared)).policyHash,
    (await contract.createSharedAccessPolicyIdentityV2(shadow)).policyHash,'phase switch invalidates cached full configuration identity');
  delete config.sharedAccessRolloutV1;delete env.SHARED_ACCESS_EXECUTION_ENABLED;
  const parent = load('workers/src/routes/profiles.ts',{
    '../db/middleware':{json,verifyAccountToken:async req=>req.headers.get('Authorization')==='Bearer parent-fixture'?'bound-owner':null},
    '../config/system-access-config':{getSystemAccessConfig:async()=>({defaultCompositeSites:[],defaultUserCompositeSites:[]}),mergeWithDefaults:()=>[]},
    '@timeonchrome/app-runtime-contracts/shared-access':contract,
    '../../../extension/core/quota-config.js':quota,
    '../../../pages/downtime-config.js':downtime,
  }).profilesRouter;
  let writes=0;
  const parentEnv={DB:{prepare(sql){return {bind(...args){return {
    async first(){
      if(sql.trim()==='SELECT id FROM profiles WHERE id = ? AND account_id = ?')return args[1]==='bound-owner'?{id:'bound-child'}:null;
      if(sql.trim()==='SELECT config, version, updated_at FROM profiles WHERE id = ?')return {config:JSON.stringify(config),version:9,updated_at:100};
      throw Error('unexpected parent query');
    },async run(){writes++;throw Error('disabled execution must not write');},
  };}};}}};
  const parentRequest=(rollout,expectedVersion=9,auth=true)=>new Request('https://fixture/profiles/bound-child/config',{
    method:'PUT',headers:auth?{Authorization:'Bearer parent-fixture'}:{},
    body:JSON.stringify({expectedVersion,data:{sharedAccessRolloutV1:rollout},sourceAction:'shared_access_rollout'}),
  });
  assert.equal((await parent.handle(parentRequest({schemaVersion:1,stage:'shared'},9,false),parentEnv)).status,401);
  assert.equal((await parent.handle(parentRequest({schemaVersion:1,stage:'shared'},8),parentEnv)).status,409);
  assert.equal((await parent.handle(parentRequest({schemaVersion:1,stage:'shared',dailyMinutes:{}}),parentEnv)).status,400);
  assert.deepEqual(await (await parent.handle(parentRequest({schemaVersion:1,stage:'shared'}),parentEnv)).json(),
    {code:'SHARED_ACCESS_EXECUTION_NOT_ENABLED'});
  parentEnv.SHARED_ACCESS_EXECUTION_ENABLED='true';
  parentEnv.SHARED_WEB_CONTRIBUTIONS_ENABLED='true';
  assert.equal((await parent.handle(parentRequest({schemaVersion:1,stage:'shared'}),parentEnv)).status,409,'missing dedicated proof key cannot enable execution');
  assert.equal(writes,0,'failed rollout cannot mutate config, audit or ledgers');
  missing = true;
  assert.equal((await deviceRouter.handle(request(), env)).status, 404);
  missing = false; fail = true;
  const failed = await deviceRouter.handle(request(), env);
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { code: 'SHARED_ACCESS_POLICY_UNAVAILABLE' });
  fail=false;
  fail=false;
  const derived=(path,body,auth=true)=>new Request('https://fixture/device/'+path,{method:body?'POST':'GET',headers:auth?{Authorization:'Bearer fixture-device'}:{},body:body?JSON.stringify(body):undefined});
  for(const path of ['shared-access/v1','shared-web-capabilities/v1','shared-web-contributions/v1','shared-web-watermark/v1','shared-web-source-binding/v1','shared-quota-execution/v1'])
    assert.equal((await deviceRouter.handle(derived(path),env)).status,404,'retired route cannot read old state or tables');
  env.SHARED_WEB_CONTRIBUTIONS_ENABLED='true';
  const v2='shared-web-source-binding/v2';
  const beforeV2={v1:v1PolicyReads,v2:v2PolicyReads};
  assert.equal((await deviceRouter.handle(derived(v2,{scopeProof:{}},false),env)).status,401);
  identity.unbound=true;assert.equal((await deviceRouter.handle(derived(v2,{scopeProof:{}}),env)).status,403);identity.unbound=false;
  for(const body of [{challengeId:'a'.repeat(64)},{scopeProof:{},childId:'caller'},{scopeProof:{},connectionHash:'d'.repeat(64)}])
    assert.equal((await deviceRouter.handle(derived(v2,body),env)).status,400);
  assert.equal((await deviceRouter.handle(derived(v2+'?childId=caller',{scopeProof:{}}),env)).status,400);
  const reusableResponse=await deviceRouter.handle(derived(v2,{scopeProof:{schemaVersion:2}}),env);
  assert.equal(reusableResponse.status,200);assert.equal(reusableResponse.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(await reusableResponse.json(),{schemaVersion:2,scopeProof:{schemaVersion:2}});
  for(const [code,status] of [['WEB_SOURCE_SCOPE_MISMATCH',409],['WEB_SOURCE_PROOF_EXPIRED',409],
    ['WEB_SOURCE_PROOF_SIGNATURE_INVALID',403],['SHARED_ACCESS_ASSIGNMENT_UNAVAILABLE',409],
    ['SOURCE_SCOPE_LIMIT',503],['WEB_SOURCE_BINDING_UNAVAILABLE',503],['INVALID_WEB_SOURCE_BINDING',400]]){
    derivedError=code;const response=await deviceRouter.handle(derived(v2,{scopeProof:{}}),env);
    assert.equal(response.status,status);assert.deepEqual(await response.json(),{code});
  }
  derivedError='';authReads=0;bindingChanged=true;
  assert.deepEqual(await (await deviceRouter.handle(derived(v2,{scopeProof:{}}),env)).json(),{code:'SHARED_ACCESS_BINDING_CHANGED'});
  bindingChanged=false;
  basisReads=0;policyChanged=true;
  assert.deepEqual(await(await deviceRouter.handle(derived(v2,{scopeProof:{}}),env)).json(),
    {code:'SHARED_ACCESS_POLICY_CHANGED'},'V2 policy mutation invalidates an in-flight current binding');
  policyChanged=false;
  assert.equal(v1PolicyReads,beforeV2.v1,'current reusable binding never reads retired V1 policy');
  assert(v2PolicyReads>beforeV2.v2,'current reusable binding checks current V2 policy before and after issuance');
  console.log('device shared access policy: PASS (current V2 ownership/config/rollout/proof, in-flight changes, retired routes absent)');
})().catch(error => { console.error(error); process.exitCode = 1; });

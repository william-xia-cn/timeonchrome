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
  const { readSharedAccessPolicyForChild, normalizeSharedAccessRolloutV1 } = load('workers/src/routes/profiles.ts', {
    '@timeonchrome/app-runtime-contracts/shared-access': contract,
    '../../../extension/core/quota-config.js': quota,
  });
  let identity = { profileId: 'bound-child', deviceId: 'bound-device', unbound: false };
  let missing = false, fail = false;
  let basisRevision = 'a'.repeat(64), policyChanged = false, bindingChanged = false, basisFail = false;
  let basisReads = 0, authReads = 0;
  let derivedError = '', derivedReads = 0;
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
    './profiles': { readSharedAccessPolicyForChild },
    '@timeonchrome/app-runtime-contracts/shared-access': contract,
    '../services/sharedWebContributions': {
      readSharedWebJson: request => request.json(),
      publishSharedWebContribution: async (_env, scope, body) => {
        derivedReads++; basisReads++;
        assert.deepEqual(scope,{accountId:'bound-owner',childId:'bound-child',deviceId:'bound-device',deviceToken:'fixture-device'});
        if(derivedError)throw Error(derivedError);
        return {status:'accepted',revisionOrdinal:body.revisionOrdinal};
      },
      readSharedWebWatermark: async (_env, scope, date) => {
        derivedReads++; assert.equal(scope.childId,'bound-child');
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('INVALID_WEB_CONTRIBUTION_DATE');
        return {schemaVersion:1,date,revisionOrdinal:0};
      },
    },
    '../services/sharedWebSourceBinding': {
      issueSharedWebSourceBinding: async (_env, scope, challengeId) => {
        derivedReads++;assert.equal(scope.deviceToken,'fixture-device');
        return {challengeId};
      },
    },
    '../services/sharedAccessState': {
      readSharedQuotaExecutionBasis: async (_env, owner, child, date, policy) => {
        basisReads++; if (basisFail) throw Error('private failure');
        assert.equal(owner, 'bound-owner'); assert.equal(child, 'bound-child');
        return { revision: basisRevision, policyRevision: policy.revision, fromDate:'2026-09-28',toDate:date,days:[] };
      },
      sharedWebSourceKey: async (owner, device) => {
        assert.equal(owner,'bound-owner'); assert.equal(device,'bound-device'); return 'opaque-own-web';
      },
      pageSharedQuotaExecutionBasis: (basis, own, offset, limit, expected) => {
        assert.equal(own,'opaque-own-web');
        if (expected && expected!==basis.revision) throw Error('EXECUTION_BASIS_VERSION_CHANGED');
        if(offset>2)throw Error('INVALID_EXECUTION_CURSOR');
        return {schemaVersion:1,basisRevision:basis.revision,policyRevision:basis.policyRevision,
          page:{offset,limit,total:2,nextOffset:null,items:[]},authorizedScopes:[]};
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
  const request = (query = '', auth = true) => new Request('https://fixture/device/shared-access/v1' + query,
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
  assert.equal(body.schemaVersion, 1);
  assert.equal(body.policy.stage, 'legacy', 'read does not enable shared execution');
  assert.equal(body.policy.revision, 'profile-config:9');
  assert.equal(body.policy.dailyMinutes.friday.study, 0);
  assert.equal(body.policy.dailyMinutes.friday.composite, 30);
  assert.equal(body.policy.weeklyRestMinutes, 120);
  assert.deepEqual(body.policy, await readSharedAccessPolicyForChild(env.DB, 'bound-owner', 'bound-child'),
    'device and parent consume exactly the same projection');
  for(const invalid of [null,[],{schemaVersion:2,stage:'shared'}, {schemaVersion:1,stage:'active'},
    {schemaVersion:1,stage:'shared',enabled:true},{schemaVersion:1,stage:{toString:()=> 'shared'}}])
    assert.equal(normalizeSharedAccessRolloutV1(invalid),null,'rollout metadata cannot smuggle a separate configuration');
  config.sharedAccessRolloutV1={schemaVersion:1,stage:'shadow'};
  const shadow=await readSharedAccessPolicyForChild(env.DB,'bound-owner','bound-child');
  assert.equal(shadow.stage,'shadow');
  assert.deepEqual(shadow.dailyMinutes,body.policy.dailyMinutes,'stage does not create another quota source');
  config.sharedAccessRolloutV1.stage='shared';
  assert.equal((await readSharedAccessPolicyForChild(env.DB,'bound-owner','bound-child')).stage,'shadow',
    'stored rollout intent cannot bypass the default-off deployment switch');
  env.SHARED_ACCESS_EXECUTION_ENABLED='true';
  const shared=(await (await deviceRouter.handle(request(),env)).json()).policy;
  assert.equal(shared.stage,'shared');
  assert.deepEqual(shared,await readSharedAccessPolicyForChild(env.DB,'bound-owner','bound-child',true));
  assert.notEqual((await contract.createSharedAccessPolicyIdentityV1(shared)).policyHash,
    (await contract.createSharedAccessPolicyIdentityV1(shadow)).policyHash,'phase switch invalidates cached full configuration identity');
  delete config.sharedAccessRolloutV1;delete env.SHARED_ACCESS_EXECUTION_ENABLED;
  const parent = load('workers/src/routes/profiles.ts',{
    '../db/middleware':{json,verifyAccountToken:async req=>req.headers.get('Authorization')==='Bearer parent-fixture'?'bound-owner':null},
    '../config/system-access-config':{getSystemAccessConfig:async()=>({defaultCompositeSites:[],defaultUserCompositeSites:[]}),mergeWithDefaults:()=>[]},
    '@timeonchrome/app-runtime-contracts/shared-access':contract,
    '../../../extension/core/quota-config.js':quota,
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
  const execution=(query='?date=2026-10-02',auth=true)=>new Request('https://fixture/device/shared-quota-execution/v1'+query,
    {headers:auth?{Authorization:'Bearer fixture-device'}:{}});
  const before=calls.length;
  assert.equal((await deviceRouter.handle(execution(undefined,false),env)).status,401);
  identity.unbound=true;assert.equal((await deviceRouter.handle(execution(),env)).status,403);identity.unbound=false;
  const savedDevice=identity.deviceId;identity.deviceId=null;
  assert.deepEqual(await (await deviceRouter.handle(execution(),env)).json(),{code:'SHARED_SOURCE_BINDING_UNAVAILABLE'});
  identity.deviceId=savedDevice;
  for(const query of ['','?date=2026-02-30','?date=2026-10-02&childId=other','?date=2026-10-02&sourceKey=other',
    '?date=2026-10-02&limit=101','?date=2026-10-02&offset=1','?date=2026-10-02&offset=-1',
    '?date=2026-10-02&date=2026-10-01','?date=2026-10-02&revision=not-a-hash'])
    assert.equal((await deviceRouter.handle(execution(query),env)).status,400,query);
  assert.equal(calls.length,before,'bad auth/scope/cursor cannot read sources');
  const executionResponse=await deviceRouter.handle(execution(),env);
  assert.equal(executionResponse.status,200);assert.equal(executionResponse.headers.get('Cache-Control'),'no-store');
  const executionBody=await executionResponse.json();
  assert.equal(executionBody.profileId,'bound-child');assert.equal(executionBody.basisRevision,basisRevision);
  assert.equal(JSON.stringify(executionBody).includes('fixture-device'),false);
  assert.equal((await deviceRouter.handle(execution('?date=2026-10-02&offset=1&revision='+basisRevision),env)).status,200);
  assert.equal((await deviceRouter.handle(execution('?date=2026-10-02&offset=1&revision='+'b'.repeat(64)),env)).status,409);
  assert.equal((await deviceRouter.handle(execution('?date=2026-10-02&offset=3&revision='+basisRevision),env)).status,400);
  authReads=0;bindingChanged=true;
  assert.deepEqual(await (await deviceRouter.handle(execution(),env)).json(),{code:'SHARED_ACCESS_BINDING_CHANGED'});
  bindingChanged=false;basisReads=0;policyChanged=true;
  assert.deepEqual(await (await deviceRouter.handle(execution(),env)).json(),{code:'EXECUTION_BASIS_VERSION_CHANGED'});
  policyChanged=false;basisFail=true;
  assert.deepEqual(await (await deviceRouter.handle(execution(),env)).json(),{code:'SHARED_EXECUTION_BASIS_UNAVAILABLE'});
  basisFail=false;missing=true;assert.equal((await deviceRouter.handle(execution(),env)).status,404);missing=false;
  assert.equal((await deviceRouter.handle(new Request('https://fixture/device/shared-quota-execution/v1',{method:'POST'}),env)).status,404);
  assert.equal((await deviceRouter.handle(new Request('https://fixture/device/shared-access/v1', { method: 'POST' }), env)).status, 404);
  const derived=(path,body,auth=true)=>new Request('https://fixture/device/'+path,{method:body?'POST':'GET',
    headers:auth?{Authorization:'Bearer fixture-device'}:{},...(body?{body:JSON.stringify(body)}:{})});
  const capabilities=await deviceRouter.handle(derived('shared-web-capabilities/v1'),env);
  assert.deepEqual(await capabilities.json(),{schemaVersion:1,protocol:'shared-web-sync-v1',enabled:false});
  assert.equal((await deviceRouter.handle(derived('shared-web-contributions/v1',{revisionOrdinal:1}),env)).status,503,
    'default disabled does not require new tables or silently enable contributions');
  env.SHARED_WEB_CONTRIBUTIONS_ENABLED='true';
  const startReads=derivedReads;
  assert.equal((await deviceRouter.handle(derived('shared-web-contributions/v1',{revisionOrdinal:1},false),env)).status,401);
  assert.equal((await deviceRouter.handle(derived('shared-web-watermark/v1?date=2026-10-03&childId=foreign'),env)).status,400);
  assert.equal((await deviceRouter.handle(derived('shared-web-contributions/v1?sourceKey=foreign',{revisionOrdinal:1}),env)).status,400);
  assert.equal(derivedReads,startReads,'unauthenticated or caller-selected scope never reaches derived storage');
  assert.equal((await deviceRouter.handle(derived('shared-web-watermark/v1?date=2026-10-03'),env)).status,200);
  assert.equal((await deviceRouter.handle(derived('shared-web-watermark/v1'),env)).status,400);
  assert.equal((await deviceRouter.handle(derived('shared-web-source-binding/v1',{challengeId:'a'.repeat(64),deviceToken:'caller'}),env)).status,400);
  assert.equal((await deviceRouter.handle(derived('shared-web-source-binding/v1',{challengeId:'a'.repeat(64)}),env)).status,200);
  const published=await deviceRouter.handle(derived('shared-web-contributions/v1',{revisionOrdinal:1}),env);
  assert.equal(published.status,200);assert.equal(published.headers.get('Cache-Control'),'no-store');
  for(const [code,status] of [['WEB_CONTRIBUTION_HASH_MISMATCH',400],['WEB_CONTRIBUTION_REVISION_CONFLICT',409],
    ['WEB_CONTRIBUTION_BODY_TOO_LARGE',413],['private database failure',503]]){
    derivedError=code;const response=await deviceRouter.handle(derived('shared-web-contributions/v1',{revisionOrdinal:1}),env);
    assert.equal(response.status,status);assert.ok(!JSON.stringify(await response.json()).includes('private'));
  }
  derivedError='';basisReads=0;policyChanged=true;
  assert.deepEqual(await (await deviceRouter.handle(derived('shared-web-contributions/v1',{revisionOrdinal:1}),env)).json(),
    {code:'SHARED_ACCESS_POLICY_CHANGED'},'policy mutation during publication invalidates its response');
  policyChanged=false;authReads=0;bindingChanged=true;
  assert.equal((await deviceRouter.handle(derived('shared-web-contributions/v1',{revisionOrdinal:1}),env)).status,409);
  console.log('device shared access policy: PASS (actual routes, derived scope isolation, shared projection, failures)');
})().catch(error => { console.error(error); process.exitCode = 1; });

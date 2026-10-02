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
  const { readSharedAccessPolicyForChild } = load('workers/src/routes/profiles.ts', {
    '@timeonchrome/app-runtime-contracts/shared-access': contract,
    '../../../extension/core/quota-config.js': quota,
  });
  let identity = { profileId: 'bound-child', deviceId: 'bound-device', unbound: false };
  let missing = false, fail = false;
  let basisRevision = 'a'.repeat(64), policyChanged = false, bindingChanged = false, basisFail = false;
  let basisReads = 0, authReads = 0;
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
  console.log('device shared access policy: PASS (actual routes, scope isolation, shared projection, failures)');
})().catch(error => { console.error(error); process.exitCode = 1; });

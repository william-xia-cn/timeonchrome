'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../../workers/src/routes/profiles.ts'), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleObject = {exports:{}};
const json = (data, status = 200) => new Response(JSON.stringify(data), {status});
const stubs = {
  '../db/middleware': {json, verifyAccountToken: async request => request.headers.get('Authorization') === 'Bearer parent' ? 'account-a' : null},
  '../../../extension/core/quota-audit.js': {},
  '../config/system-access-config': {},
  '../../../extension/core/site-classification.js': {},
  '../../../extension/core/quota-config.js': {buildEffectiveTimeQuota: config => ({daily:config.timeQuota.daily})},
  '@timeonchrome/app-runtime-contracts/shared-access': {projectLegacySharedAccessPolicy:(config, version, updatedAtMs) =>
    ({stage:'legacy',revision:`profile-config:${version}`,effectiveAtMs:updatedAtMs,dailyMinutes:config.timeQuota.daily})},
  '../services/nativeAppIdentityBridge': {},
  '../services/appRuntimeIdentityBridge': {},
};
vm.runInNewContext(compiled, {module:moduleObject,exports:moduleObject.exports,require:name=>{
  assert.ok(name in stubs, `unexpected dependency ${name}`); return stubs[name];
},Request,Response,URL,crypto:require('node:crypto').webcrypto,console});
const router = moduleObject.exports.profilesRouter;
let configReads = 0;
const env = {JWT_SECRET:'unused',DB:{prepare(sql){
  if (sql.includes('SELECT id FROM profiles WHERE id = ? AND account_id = ?')) return {bind(child,account){return {first:async()=>
    child === 'child-a' && account === 'account-a' ? {id:child} : null};}};
  if (sql.includes('SELECT config, version, updated_at FROM profiles WHERE id = ? AND account_id = ?')) return {bind(child,account){return {first:async()=>{
    configReads++; assert.equal(child,'child-a'); assert.equal(account,'account-a'); return {version:7,updated_at:123,config:JSON.stringify({
      timeQuota:{daily:{friday:{studyMinutes:20,restMinutes:40,compositeMinutes:30}}},
      timeWindows:{daily:{friday:{studyWindows:null,compositeWindows:null,restWindows:null}}},
    })};
  }};}};
  throw new Error(`unexpected query ${sql}`);
}}};
(async()=>{
  const endpoint = 'https://example.invalid/profiles/child-a/shared-access/v1';
  assert.equal((await router.handle(new Request(endpoint),env)).status,401);
  assert.equal((await router.handle(new Request(endpoint.replace('child-a','child-b'),
    {headers:{Authorization:'Bearer parent'}}),env)).status,404);
  assert.equal(configReads,0,'unauthorized children cannot read config');
  const response=await router.handle(new Request(endpoint,{headers:{Authorization:'Bearer parent'}}),env);
  assert.equal(response.status,200);
  assert.deepEqual(JSON.parse(await response.text()),{profileId:'child-a',policy:{stage:'legacy',
    revision:'profile-config:7',effectiveAtMs:123,dailyMinutes:{friday:{studyMinutes:20,restMinutes:40,compositeMinutes:30}}}});
  assert.equal(configReads,1);
  console.log('shared access route: owner-only read-only legacy projection PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});

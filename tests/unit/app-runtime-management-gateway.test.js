'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto').webcrypto;
const root = path.resolve(__dirname, '../..');
const modules = new Map();
function load(relative) {
  const filename = path.join(root, relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} }; modules.set(filename, module);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, Request, Response, URL, Headers,
    TextEncoder, TextDecoder, ArrayBuffer, Uint8Array, btoa, atob, crypto, console, Date,
    require(name) {
      if (name === '@timeonchrome/app-runtime-contracts') return {
        APP_RUNTIME_ACCOUNT_AUDIENCE: 'app-runtime-management:account',
      };
      assert.ok(name.startsWith('.'), `unexpected dependency ${name}`);
      return load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts')));
    },
  }, { filename });
  return module.exports;
}
const { handleAppRuntimeManagement } = load('workers/src/services/appRuntimeManagementGateway.ts');
const { generateToken } = load('workers/src/db/middleware.ts');
let count = 0;
async function test(name, run) { await run(); count++; console.log(`PASS ${name}`); }
(async () => {
  const keys = await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'}, true, ['sign','verify']);
  const privateJwk = JSON.stringify(await crypto.subtle.exportKey('jwk', keys.privateKey));
  const secret = 'fixture-only-secret';
  const token = await generateToken({account_id:'family-a',exp:Math.floor(Date.now()/1000)+300},secret);
  let calls = [], reads = 0, upstream;
  const env = { JWT_SECRET:secret, APP_RUNTIME_TOKEN_PRIVATE_JWK:privateJwk,
    DB:{prepare(sql){ assert.ok(sql.includes('WHERE account_id=?')); return {bind(account){
      assert.equal(account,'family-a'); reads++; return {all:async()=>({results:[{child_id:'child-a',child_name:'Fixture'}]})};
    }};}},
    APP_RUNTIME_SERVICE:{async fetch(url, init){calls.push({url,init}); return upstream ? upstream(url,init)
      : new Response('{"machines":[]}', {headers:{'Content-Type':'application/json',ETag:'"v7"',
        'Set-Cookie':'private=must-not-forward','X-Internal-Identity':'must-not-forward'}});}},
  };
  const request = (resource, options={}) => new Request(`https://guardian.invalid/app-runtime/manage/v1/${resource}`, {
    ...options, headers:{Authorization:`Bearer ${token}`,...options.headers},
  });
  const call = (resource, options) => handleAppRuntimeManagement(request(resource,options),env);
  await test('missing/expired/forged parent credentials never reach D1 or Runtime', async()=>{
    const expired = await generateToken({account_id:'family-a',exp:1},secret);
    for(const Authorization of ['', 'Bearer forged', `Bearer ${expired}`])
      assert.equal((await call('machines',{headers:{Authorization}})).status,401);
    assert.equal(calls.length,0); assert.equal(reads,0);
  });
  await test('fixed route and verb allowlist rejects private API and arbitrary URLs', async()=>{
    for(const resource of ['../machines/enroll','https://outside.invalid','machines/enroll',
      'application-knowledge/unknown','machines/x/users/y/extra','machines/x%2Fy/users','__proto__'])
      assert.equal((await call(resource)).status,404,resource);
    for(const method of ['POST','DELETE','PUT','HEAD']) assert.equal((await call('machines',{method})).status,405);
    assert.equal(calls.length,0);
  });
  await test('unexpected and duplicate query fields cannot influence destination or identity', async()=>{
    for(const resource of ['machines?url=https://outside.invalid','machines?accountId=family-b',
      'app-policy?childId=child-a&childId=child-b','app-catalog?token=private'])
      assert.equal((await call(resource)).status,400);
    assert.equal(calls.length,0);
  });
  await test('account-module JWT is signed, owner-scoped and stays inside Service Binding', async()=>{
    const response = await call('machines',{headers:{Cookie:'do-not-forward', 'X-Account-Id':'family-b'}});
    assert.equal(response.status,200); assert.equal(response.headers.get('Cache-Control'),'no-store');
    assert.equal(response.headers.get('ETag'),'"v7"');
    assert.equal(response.headers.get('Set-Cookie'),null); assert.equal(response.headers.get('X-Internal-Identity'),null);
    const value=await response.text(); assert.equal(value,'{"machines":[]}'); assert.ok(!value.includes(token));
    const {url,init}=calls.at(-1); assert.equal(url,'https://app-runtime.internal/v2/module/machines');
    assert.equal(init.redirect,'manual'); assert.equal(init.headers.get('cookie'),null);
    assert.equal(init.headers.get('X-Account-Id'),null);
    const internal=init.headers.get('Authorization').slice(7); assert.notEqual(internal,token);
    const [header,payload,signature]=internal.split('.');
    const claims=JSON.parse(Buffer.from(payload,'base64url'));
    assert.equal(claims.account_id,'family-a'); assert.deepEqual(claims.children,[{id:'child-a',name:'Fixture'}]);
    assert.equal(claims.aud,'app-runtime-management:account'); assert.equal(claims.exp-claims.iat,300);
    assert.ok(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},keys.publicKey,
      Buffer.from(signature,'base64url'),new TextEncoder().encode(`${header}.${payload}`)));
  });
  await test('conditional object update streams body and preserves conflict, never retries a mutation', async()=>{
    upstream=async(url,init)=>{
      assert.equal(url,'https://app-runtime.internal/v2/module/app-policy?childId=child-a');
      assert.equal(init.headers.get('If-Match'),'"app-policy-v8"');
      assert.deepEqual(await new Response(init.body).json(),{classifications:[]});
      return new Response('{"code":"VERSION_CONFLICT"}',{status:409,headers:{ETag:'"app-policy-v9"'}});
    };
    const previous=calls.length;
    const response=await call('app-policy?childId=child-a',{method:'PUT',headers:{'If-Match':'"app-policy-v8"',
      'Content-Type':'application/json'},body:JSON.stringify({classifications:[]})});
    assert.equal(response.status,409); assert.equal(response.headers.get('ETag'),'"app-policy-v9"');
    assert.equal(calls.length,previous+1); assert.equal((await response.json()).code,'VERSION_CONFLICT');
  });
  await test('Runtime remains owner authorizer for an unknown child or machine', async()=>{
    upstream=async()=>new Response('{"code":"CHILD_NOT_FOUND"}',{status:404});
    assert.equal((await call('app-catalog?childId=other-child')).status,404);
    assert.equal((await call('machines/other-machine/users')).status,404);
  });
  await test('machine assignment actions use only fixed module paths', async()=>{
    upstream=async()=>new Response('{}');
    for(const [resource,method] of [['machines/machine-a/users','GET'],['machines/machine-a/users/user-a','PATCH'],
      ['machines/machine-a/default-assignment','PATCH'],['machines/machine-a/revoke','POST'],
      ['machines/machine-a/uninstall-codes','POST'],['pairing-codes','POST']]) {
      assert.equal((await call(resource,{method})).status,200);
      assert.equal(calls.at(-1).url,`https://app-runtime.internal/v2/module/${resource}`);
    }
  });
  await test('upstream redirects and cookies never escape the management gateway', async()=>{
    upstream=async()=>new Response(null,{status:302,headers:{Location:'https://outside.invalid/?token=private'}});
    const response=await call('machines'); assert.equal(response.status,502);
    assert.equal(response.headers.get('Location'),null); assert.ok(!(await response.text()).includes('private'));
  });
  await test('missing binding, signing failure and transport exceptions have stable redacted errors', async()=>{
    for(const modified of [{...env,APP_RUNTIME_SERVICE:undefined},{...env,APP_RUNTIME_TOKEN_PRIVATE_JWK:'invalid-private-key'}]) {
      const response=await handleAppRuntimeManagement(request('machines'),modified);
      assert.equal(response.status,503); assert.ok(!(await response.text()).includes('private-key'));
    }
    upstream=async()=>{throw new Error(`transport accidentally includes ${token}`);};
    const response=await call('machines'); assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{error:'RUNTIME_MANAGEMENT_UNAVAILABLE',code:'RUNTIME_MANAGEMENT_UNAVAILABLE'});
  });
  assert.ok(fs.readFileSync(path.join(root,'workers/src/index.ts'),'utf8').includes("handleAppRuntimeManagement(request, env)"));
  console.log(`app runtime management gateway: ${count}/${count} PASS`);
})().catch(error=>{console.error(error);process.exitCode=1;});

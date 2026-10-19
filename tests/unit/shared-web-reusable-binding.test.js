'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const url = p => pathToFileURL(path.join(root, p)).href;
const clone = v => structuredClone(v);
async function run() {
  const vectors = JSON.parse(fs.readFileSync(path.join(root, 'extension/core/shared-contracts/1.58.0/shared-web-sync-v2.vectors.json'), 'utf8'));
  const fixed = await import(url('extension/core/shared-contracts/1.58.0/shared-web-sync.js'));
  const nativeCore = await import(url('extension/core/shared-web-native.js'));
  globalThis.__bindingContract = fixed;
  globalThis.__bindingNativeCore = nativeCore;
  const bindingSource = fs.readFileSync(path.join(root, 'extension/infra/shared-web-reusable-binding.js'), 'utf8');
  const isolatedBinding = bindingSource.replace(/^import[\s\S]*?;\r?\n/gm, '');
  const { createReusableSharedWebBinding, createApplicationIdentityBinding } = await import('data:text/javascript;base64,' + Buffer.from(
    'const {validateSharedWebReusableProofV2,canonicalSharedWebSync}=globalThis.__bindingContract;\n'
    + 'const {SHARED_WEB_IDENTITY_ERRORS}=globalThis.__bindingNativeCore;\n' + isolatedBinding).toString('base64'));
  const diagnosticsSource = fs.readFileSync(path.join(root, 'extension/infra/shared-sync-diagnostics.js'), 'utf8');
  assert.match(diagnosticsSource, /import \{ readCurrentApplicationIdentityConfirmation \} from '\.\/shared-web-reusable-binding\.js'/);
  const key = await crypto.subtle.importKey('jwk', vectors.publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const expected = Object.fromEntries(['applicationSourceKey', 'childScopeHash', 'assignmentVersion'].map(k => [k, vectors.machineProof.claims[k]]));
  for (const proof of [vectors.machineProof, vectors.webProof]) {
    const verify = (value, scope = expected, now = 2000) => fixed.verifySharedWebReusableProofV2(value, proof.keyId, key, scope, proof.claims.audience, now);
    assert.deepEqual(await verify(proof), proof.claims);
    await assert.rejects(verify(proof, { ...expected, childScopeHash: '0'.repeat(64) }), /WEB_SOURCE_SCOPE_MISMATCH/);
    await assert.rejects(verify(proof, expected, 301000), /WEB_SOURCE_PROOF_EXPIRED/);
    const tampered = clone(proof); tampered.claims.expiresAtMs--;
    await assert.rejects(verify(tampered), /WEB_SOURCE_PROOF_SIGNATURE_INVALID/);
  }
  let clock = 2000, connection = {}, offline = false, scope = clone(vectors.machineProof), proof = clone(vectors.webProof);
  let exchangeCount = 0, rejection = null, invalidate = false;
  const calls = [];
  const binding = createReusableSharedWebBinding({ now: () => clock,
    exchange: async () => { exchangeCount++; return offline ? { ok: false, errorCode: 'shared_access_unavailable' } : { ok: true, value: clone(proof) }; },
    native: async (method, payload) => {
      calls.push({ method, payload: clone(payload) });
      if (method === 'getSharedWebSourceScope') return { ok: true, value: clone(scope) };
      if (invalidate) connection = {};
      if (rejection) return { ok: false, errorCode: rejection };
      return { ok: true, value: { status: 'verified', webSourceKey: payload.proof.claims.webSourceKey, expiresAtMs: payload.proof.claims.expiresAtMs } };
    } });
  const context = { scopeHash: 'a'.repeat(64) };
  const bind = () => binding.bind(context, connection, c => c === connection);
  assert.equal((await bind()).ok, true); assert.equal(exchangeCount, 1);
  const beforeProofRead = calls.length;
  const readProof = binding.readProof(context);
  assert.deepEqual(readProof, proof);
  readProof.claims.assignmentVersion++;
  assert.deepEqual(binding.readProof(context), proof, 'proof readers cannot mutate the live cached proof');
  assert.equal(binding.readProof({ scopeHash: 'different-scope' }), null);
  assert.equal(calls.length, beforeProofRead, 'proof reads never perform Native or cloud exchanges');
  connection = {}; offline = true;
  assert.equal((await bind()).ok, true); assert.equal(exchangeCount, 1, 'fresh proof rebinds locally on new Port');
  rejection = 'WEB_SOURCE_PROOF_SIGNATURE_INVALID';
  assert.equal((await bind()).errorCode, rejection);
  rejection = null; offline = false;
  assert.equal((await bind()).ok, true); assert.equal(exchangeCount, 2, 'rejected proof is evicted');
  invalidate = true;
  assert.equal((await bind()).errorCode, 'shared_web_identity_changed'); invalidate = false;
  clock = 301000; scope.claims.issuedAtMs = clock; scope.claims.expiresAtMs = clock + 300000; offline = true;
  assert.equal(binding.readProof(context), null, 'expired proofs cannot be reused for source selection');
  const before = calls.filter(c => c.method === 'bindSharedWebSourceV2').length;
  assert.equal((await bind()).errorCode, 'shared_web_proof_unavailable');
  assert.equal(calls.filter(c => c.method === 'bindSharedWebSourceV2').length, before, 'expired proof never rebinds');
  offline = false; proof.claims.issuedAtMs = clock; proof.claims.expiresAtMs = clock + 300000;
  assert.equal((await bind()).ok, true);
  scope.claims.assignmentVersion++;
  assert.equal((await bind()).errorCode, 'WEB_SOURCE_SCOPE_MISMATCH');
  assert(calls.every(c => ['getSharedWebSourceScope', 'bindSharedWebSourceV2'].includes(c.method)), 'no V1 downgrade');
  const request = await nativeCore.captureSharedWebNativeRequest('bindSharedWebSourceV2', { proof });
  assert.equal(nativeCore.captureSharedWebNativeReceipt('bindSharedWebSourceV2', { sharedWebIdentity: { status: 'verified', webSourceKey: proof.claims.webSourceKey, expiresAtMs: proof.claims.expiresAtMs } }, request, clock).status, 'verified');
  await assert.rejects(nativeCore.captureSharedWebNativeRequest('bindSharedWebSourceV2', { proof: scope }));
  assert.throws(() => nativeCore.captureSharedWebNativeReceipt('bindSharedWebSourceV2', { sharedWebIdentity: { status: 'verified', webSourceKey: 'web:' + '0'.repeat(64), expiresAtMs: proof.claims.expiresAtMs } }, request, clock));
  let liveContext = {apiBase:'https://binding.invalid',childId:'child-a',deviceId:'device-a',deviceToken:'synthetic'};
  let liveConnection = {}, generation = 1, liveClock = 2000, proofRequests = 0;
  const lifecycle = createApplicationIdentityBinding({ readContext:async()=>liveContext,
    readIdentityConnection:()=>({connection:liveConnection,connectionGeneration:generation,reusableSourceSupported:true}),
    now:()=>liveClock, exchangeV2:async()=>{proofRequests++;return {ok:true,value:clone(vectors.webProof)};},
    identityNative:async(method,payload)=>method==='getSharedWebSourceScope'
      ? {ok:true,value:clone(vectors.machineProof)} : {ok:true,value:{status:'verified',webSourceKey:payload.proof.claims.webSourceKey,expiresAtMs:payload.proof.claims.expiresAtMs}} });
  assert.equal((await lifecycle.ensureApplicationIdentityBinding()).ok,true);
  assert.equal((await lifecycle.readApplicationIdentityConfirmation(liveContext)).confirmed,true);
  assert.deepEqual(await lifecycle.readApplicationSourceProof(liveContext),vectors.webProof);
  liveConnection={}; generation++;
  assert.equal((await lifecycle.readApplicationIdentityConfirmation(liveContext)).confirmed,null);
  assert.equal((await lifecycle.ensureApplicationIdentityBinding()).ok,true);
  assert.equal(proofRequests,1,'reconnect reuses unexpired cloud proof but confirms the new connection');
  liveContext={...liveContext,childId:'child-b'};
  assert.equal((await lifecycle.readApplicationIdentityBinding()).ok,false);
  assert.equal(await lifecycle.readApplicationSourceProof(liveContext),null);
  lifecycle.invalidate();
  assert.equal((await lifecycle.readApplicationIdentityConfirmation(liveContext)).confirmed,null);
  liveClock=301000;
  assert.equal((await lifecycle.readApplicationIdentityBinding()).ok,false);
  let releaseOldProof, markOldStarted, activeProofs = 0, maxActiveProofs = 0, racedProofRequests = 0;
  const oldProofStarted = new Promise(resolve => { markOldStarted = resolve; });
  const oldProofGate = new Promise(resolve => { releaseOldProof = resolve; });
  const racedConnection = {};
  const racedBinding = createApplicationIdentityBinding({ readContext: async () => liveContext,
    readIdentityConnection: () => ({ connection: racedConnection, connectionGeneration: 1, reusableSourceSupported: true }),
    now: () => 2000, exchangeV2: async () => {
      racedProofRequests++; activeProofs++; maxActiveProofs = Math.max(maxActiveProofs, activeProofs);
      if (racedProofRequests === 1) { markOldStarted(); await oldProofGate; }
      activeProofs--; return { ok: true, value: clone(vectors.webProof) };
    }, identityNative: async (method, payload) => method === 'getSharedWebSourceScope'
      ? { ok: true, value: clone(vectors.machineProof) }
      : { ok: true, value: { status: 'verified', webSourceKey: payload.proof.claims.webSourceKey, expiresAtMs: payload.proof.claims.expiresAtMs } } });
  const retiredPreparation = racedBinding.ensureApplicationIdentityBinding();
  await oldProofStarted;
  racedBinding.invalidate();
  const currentPreparation = racedBinding.ensureApplicationIdentityBinding();
  await Promise.resolve();
  assert.equal(racedProofRequests, 1, 'new generation waits for the retired authentication instead of running concurrently');
  releaseOldProof();
  assert.equal((await retiredPreparation).ok, false, 'retired-generation proof remains rejected');
  assert.equal((await currentPreparation).ok, true, 'current generation prepares once after the retired request settles');
  assert.equal(racedProofRequests, 2); assert.equal(maxActiveProofs, 1);
  assert.equal((await racedBinding.readApplicationIdentityConfirmation(liveContext)).confirmed, true);
  const source = fs.readFileSync(path.join(root, 'extension/infra/cloud-sync.js'), 'utf8');
  const body = source.slice(source.indexOf('async function readCapturedSharedDeviceJson'), source.indexOf('export async function readCloudSharedAccessPolicy'));
  const cloud = await import('data:text/javascript;base64,' + Buffer.from('const getCloudApiBase=()=>"https://fixture.invalid", CLOUD_CONFIG={REQUEST_TIMEOUT_MS:1000};\n' + body).toString('base64'));
  const savedFetch = global.fetch; let response, requests = [];
  global.fetch = async (url, options) => { requests.push({ url, options }); return response; };
  try {
    response = new Response(JSON.stringify(proof), { status: 200 });
    assert.deepEqual(await cloud.requestCloudSharedWebSourceBindingV2({ deviceToken: 'fixture-token', apiBase: 'https://fixture.invalid' }, scope), { ok: true, value: proof });
    assert(requests[0].url.endsWith('/device/shared-web-source-binding/v2'));
    assert.deepEqual(JSON.parse(requests[0].options.body), { scopeProof: scope });
    response = new Response(JSON.stringify({ code: 'WEB_SOURCE_SCOPE_MISMATCH', message: 'private detail' }), { status: 409 });
    assert.equal((await cloud.requestCloudSharedWebSourceBindingV2({ deviceToken: 'fixture-token', apiBase: 'https://fixture.invalid' }, scope)).errorCode, 'WEB_SOURCE_SCOPE_MISMATCH');
    response = new Response(JSON.stringify({ code: 'private detail' }), { status: 403 });
    assert(!JSON.stringify(await cloud.requestCloudSharedWebSourceBindingV2({ deviceToken: 'fixture-token' }, scope)).includes('private'));
    const count = requests.length;
    assert.equal((await cloud.requestCloudSharedWebSourceBindingV2({}, { data: 'a'.repeat(1801) })).errorCode, 'INVALID_WEB_SOURCE_SCOPE');
    assert.equal(requests.length, count);
  } finally { global.fetch = savedFetch; }
  console.log('[Shared Web Reusable Binding] passed: fixed signatures, scope, expiry, reconnect, revocation and direct HTTP proof');
}
run().catch(e => { console.error(e); process.exit(1); });

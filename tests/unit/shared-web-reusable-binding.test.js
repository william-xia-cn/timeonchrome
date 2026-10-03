'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const url = p => pathToFileURL(path.join(root, p)).href;
const clone = v => structuredClone(v);
async function run() {
  assert(process.argv[2], 'fixed 1.31.0 archive required');
  const archive = fs.readFileSync(process.argv[2]);
  assert.equal(createHash('sha256').update(archive).digest('hex'), '355c558784807b43e2e02f0b12c8ab221ecf9ffa38330f8ae48c644507c55395');
  const unpack = p => execFileSync('tar', ['-xOf', process.argv[2], 'package/' + p], { encoding: 'utf8' });
  for (const name of ['shared-web-sync.js', 'shared-access.js']) {
    assert.equal(fs.readFileSync(path.join(root, 'extension/core/shared-contracts/1.31.0', name), 'utf8'), unpack('dist/' + name));
  }
  const vectors = JSON.parse(unpack('shared-web-sync-v2.vectors.json'));
  const fixed = await import(url('extension/core/shared-contracts/1.31.0/shared-web-sync.js'));
  const nativeCore = await import(url('extension/core/shared-web-native.js'));
  const { createReusableSharedWebBinding } = await import(url('extension/infra/shared-web-reusable-binding.js'));
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
  connection = {}; offline = true;
  assert.equal((await bind()).ok, true); assert.equal(exchangeCount, 1, 'fresh proof rebinds locally on new Port');
  rejection = 'WEB_SOURCE_PROOF_SIGNATURE_INVALID';
  assert.equal((await bind()).errorCode, rejection);
  rejection = null; offline = false;
  assert.equal((await bind()).ok, true); assert.equal(exchangeCount, 2, 'rejected proof is evicted');
  invalidate = true;
  assert.equal((await bind()).errorCode, 'shared_web_identity_changed'); invalidate = false;
  clock = 301000; scope.claims.issuedAtMs = clock; scope.claims.expiresAtMs = clock + 300000; offline = true;
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

import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import fs from 'node:fs';
import * as currentProof from './dist/shared-web-sync.js';
const {signSharedWebReusableProofV2,verifySharedWebReusableProofV2}=currentProof;
globalThis.crypto ??= webcrypto;
for(const retired of ['sharedWebContributionHashV1','verifySharedWebContributionV1','sharedWebExecutionSourceV1',
  'signSharedWebSourceBindingV1','verifySharedWebSourceBindingV1','sharedQuotaExecutionIdentityV1',
  'sharedWebLocalLeaseCurrentV1','validateSharedWebContributionUploadV1','validateSharedWebSourceBindingProofV1'])
  assert.equal(Object.hasOwn(currentProof,retired),false,`旧业务导出必须退出：${retired}`);

const machineV2={schemaVersion:2,audience:'timeonchrome:shared-web-machine-scope:v2',
  applicationSourceKey:'b'.repeat(64),childScopeHash:'c'.repeat(64),assignmentVersion:7,issuedAtMs:1000,expiresAtMs:301000};
const webV2={...machineV2,audience:'timeonchrome:shared-web-source:v2',webSourceKey:'web:'+'d'.repeat(64),bindingEpochHash:'e'.repeat(64)};
const expectedV2={applicationSourceKey:machineV2.applicationSourceKey,childScopeHash:machineV2.childScopeHash,assignmentVersion:7};
// 当前可复用证明用例不依赖旧挑战的签发结果。
const currentKeyId='a'.repeat(64);
const currentKey=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
for(const candidate of [machineV2,webV2]) {
  const signed=await signSharedWebReusableProofV2(candidate,currentKeyId,currentKey.privateKey);
  for(const time of [1000,2000,300999]) assert.deepEqual(
    await verifySharedWebReusableProofV2(signed,currentKeyId,currentKey.publicKey,expectedV2,candidate.audience,time),candidate);
  await assert.rejects(()=>verifySharedWebReusableProofV2(signed,currentKeyId,currentKey.publicKey,expectedV2,candidate.audience,301000),/EXPIRED/);
  for(const change of [{childScopeHash:'f'.repeat(64)},{applicationSourceKey:'f'.repeat(64)},{assignmentVersion:8}])
    await assert.rejects(()=>verifySharedWebReusableProofV2(signed,currentKeyId,currentKey.publicKey,{...expectedV2,...change},candidate.audience,2000),/SCOPE_MISMATCH/);
  const other=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
  await assert.rejects(()=>verifySharedWebReusableProofV2(signed,currentKeyId,other.publicKey,expectedV2,candidate.audience,2000),/SIGNATURE_INVALID/);
  await assert.rejects(()=>verifySharedWebReusableProofV2(signed,'0'.repeat(64),currentKey.publicKey,expectedV2,candidate.audience,2000),/INVALID_WEB_SOURCE_KEY/);
  await assert.rejects(()=>verifySharedWebReusableProofV2(signed,currentKeyId,currentKey.publicKey,expectedV2,candidate.audience,999),/EXPIRED/);
  for(const change of [{expiresAtMs:301001},{connectionHash:'a'.repeat(64)},{childId:'private'},{deviceToken:'private'}])
    await assert.rejects(()=>signSharedWebReusableProofV2({...candidate,...change},currentKeyId,currentKey.privateKey));
}
const signedWebV2=await signSharedWebReusableProofV2(webV2,currentKeyId,currentKey.privateKey);
await assert.rejects(()=>verifySharedWebReusableProofV2(signedWebV2,currentKeyId,currentKey.publicKey,expectedV2,machineV2.audience,2000));
await assert.rejects(()=>verifySharedWebReusableProofV2({...signedWebV2,claims:{...webV2,bindingEpochHash:'f'.repeat(64)}},
  currentKeyId,currentKey.publicKey,expectedV2,webV2.audience,2000),/SIGNATURE_INVALID/);
console.log('shared-web-sync v2: reusable scope/signature/isolation/expiry/audience tests PASS');
const goldenV2=JSON.parse(fs.readFileSync(new URL('./shared-web-sync-v2.vectors.json',import.meta.url)));
const publicV2=await crypto.subtle.importKey('jwk',goldenV2.publicJwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
for(const signed of [goldenV2.machineProof,goldenV2.webProof]) assert.deepEqual(
  await verifySharedWebReusableProofV2(signed,signed.keyId,publicV2,expectedV2,signed.claims.audience,goldenV2.verificationTimeMs),
  signed.claims,'public-only reusable cross-platform signature vector');


const mutable=structuredClone(webV2),pendingProof=signSharedWebReusableProofV2(mutable,currentKeyId,currentKey.privateKey);
mutable.bindingEpochHash='f'.repeat(64);
const capturedProof=await pendingProof;
assert.deepEqual(capturedProof.claims,webV2,'签发前捕获声明，等待期间不可篡改');
const mutableProof=structuredClone(capturedProof),pendingVerification=verifySharedWebReusableProofV2(
  mutableProof,currentKeyId,currentKey.publicKey,expectedV2,webV2.audience,2000);
mutableProof.claims.bindingEpochHash='f'.repeat(64);
assert.deepEqual(await pendingVerification,webV2,'验签前捕获声明');
assert.equal(Object.hasOwn(capturedProof.claims,'connectionHash'),false);
console.log('current reusable proof: mutation isolation and retired export absence PASS');

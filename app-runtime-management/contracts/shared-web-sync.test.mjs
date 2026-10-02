import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import { sharedWebContributionHashV1, verifySharedWebContributionV1, sharedWebExecutionSourceV1,
  signSharedWebSourceBindingV1, verifySharedWebSourceBindingV1 } from './dist/shared-web-sync.js';
globalThis.crypto ??= webcrypto;
const policyIdentity={schemaVersion:1,revision:'profile-config:8',effectiveAtMs:0,stage:'shadow',policyHash:'a'.repeat(64)};
const base={schemaVersion:1,date:'2026-10-03',revisionOrdinal:1,statisticsRevision:'statistics-hash',correctionRevision:'correction-1',
  policyIdentity,computedAtMs:1000,settledAtMs:null,activeMs:1200000,bucketsMs:{study:600000,composite:0,rest:0},otherMs:600000,complete:true,reasonCodes:[]};
const upload={...base,contentHash:await sharedWebContributionHashV1(base)};
assert.deepEqual(await verifySharedWebContributionV1(upload),upload);
const vectors=JSON.parse(fs.readFileSync(new URL('./shared-web-sync.vectors.json',import.meta.url)));
assert.deepEqual(upload,vectors.upload,'cross-platform canonical contribution golden hash');
const goldenKey=await crypto.subtle.importKey('jwk',vectors.publicJwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
const goldenExpected=Object.fromEntries(['challengeId','connectionHash','applicationSourceKey','childScopeHash','assignmentVersion']
  .map(field=>[field,vectors.proof.claims[field]]));
assert.deepEqual(await verifySharedWebSourceBindingV1(vectors.proof,vectors.proof.keyId,goldenKey,goldenExpected,vectors.verificationTimeMs),
  vectors.proof.claims,'public-only P1363 cross-platform signature golden vector');
const reordered=Object.fromEntries(Object.entries(base).reverse());
assert.equal(await sharedWebContributionHashV1(reordered),upload.contentHash);
assert.equal(sharedWebExecutionSourceV1(upload,'web:'+'b'.repeat(64)).revisionOrdinal,1);
assert.equal(sharedWebExecutionSourceV1(upload,'web:'+'b'.repeat(64)).contribution.bucketsMs.study,600000);
for(const change of [{childId:'private'},{sourceKey:'caller-selected'},{deviceToken:'private'},{activeMs:1200001},
  {revisionOrdinal:0},{date:'2026-02-30'},{bucketsMs:{study:600001,composite:0,rest:0}},
  {settledAtMs:1001},{reasonCodes:['URL=https://private']},{otherMs:0}]) {
  await assert.rejects(()=>verifySharedWebContributionV1({...upload,...change}));
}
await assert.rejects(()=>verifySharedWebContributionV1({...upload,statisticsRevision:'other'}),/HASH_MISMATCH/);
const correction={...base,revisionOrdinal:2,activeMs:600000,otherMs:0,correctionRevision:'correction-2'};
assert.equal((await verifySharedWebContributionV1({...correction,contentHash:await sharedWebContributionHashV1(correction)})).activeMs,600000,
  'new contribution revision may decrease after an approved correction');
const key=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const claims={schemaVersion:1,audience:'timeonchrome:shared-web-source:v1',challengeId:'c'.repeat(64),connectionHash:'d'.repeat(64),
  applicationSourceKey:'e'.repeat(64),childScopeHash:'f'.repeat(64),assignmentVersion:3,webSourceKey:'web:'+'b'.repeat(64),issuedAtMs:1000,expiresAtMs:301000};
const expected={challengeId:claims.challengeId,connectionHash:claims.connectionHash,applicationSourceKey:claims.applicationSourceKey,
  childScopeHash:claims.childScopeHash,assignmentVersion:3};
const proof=await signSharedWebSourceBindingV1(claims,'a'.repeat(64),key.privateKey);
assert.deepEqual(await verifySharedWebSourceBindingV1(proof,proof.keyId,key.publicKey,expected,1000),claims);
for(const change of [{challengeId:'0'.repeat(64)},{connectionHash:'0'.repeat(64)},{applicationSourceKey:'0'.repeat(64)},
  {childScopeHash:'0'.repeat(64)},{assignmentVersion:4}]) {
  await assert.rejects(()=>verifySharedWebSourceBindingV1(proof,proof.keyId,key.publicKey,{...expected,...change},1000),/CONTEXT_CHANGED/);
}
await assert.rejects(()=>verifySharedWebSourceBindingV1(proof,proof.keyId,key.publicKey,{},1000),/CONTEXT_CHANGED/);
await assert.rejects(()=>verifySharedWebSourceBindingV1(proof,proof.keyId,key.publicKey,expected,301000),/CONTEXT_CHANGED/);
await assert.rejects(()=>verifySharedWebSourceBindingV1(proof,'0'.repeat(64),key.publicKey,expected,1000),/CONTEXT_CHANGED/);
await assert.rejects(()=>verifySharedWebSourceBindingV1({...proof,claims:{...claims,webSourceKey:'web:'+'0'.repeat(64)}},proof.keyId,key.publicKey,expected,1000),/SIGNATURE_INVALID/);
await assert.rejects(()=>signSharedWebSourceBindingV1({...claims,deviceToken:'private'},proof.keyId,key.privateKey));
console.log('shared-web-sync: authority/precision/hash/version/privacy/source-proof tests PASS');

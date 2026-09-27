import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolveRuntimeOsVersion,RUNTIME_UNINSTALL_RECEIPT_TTL_MS} from './dist/app-runtime-control.js';
const vectors=JSON.parse(readFileSync(new URL('./machine-control.vectors.json',import.meta.url),'utf8'));
for(const vector of vectors.heartbeat) assert.deepEqual(resolveRuntimeOsVersion(vector.platform,vector.input),vector.expected);
assert.equal(createHash('sha256').update(vectors.receipt.confirmationSecret).digest('hex'),vectors.receipt.confirmationSecretHash);
assert.equal(vectors.receipt.expiredAtMs-vectors.receipt.committedAtMs,RUNTIME_UNINSTALL_RECEIPT_TTL_MS);
assert.equal(vectors.receipt.validAtMs+1,vectors.receipt.expiredAtMs);
for(const [platform,input,expected] of [
  ['windows',{windowsVersion:'10.0.26100'},{ok:true,osVersion:'10.0.26100'}],
  ['windows',{osVersion:'10.0.26100'},{ok:true,osVersion:'10.0.26100'}],
  ['windows',{windowsVersion:'10',osVersion:'10'},{ok:true,osVersion:'10'}],
  ['windows',{windowsVersion:'10',osVersion:'10 '},{ok:false,code:'HEARTBEAT_VERSION_CONFLICT'}],
  ['macos',{osVersion:'15.7'},{ok:true,osVersion:'15.7'}],
  ['macos',{osVersion:'15.7',windowsVersion:'15.7'},{ok:false,code:'INVALID_REQUEST'}],
  ['macos',{windowsVersion:'15.7'},{ok:false,code:'INVALID_REQUEST'}],
  ['windows',{}, {ok:false,code:'INVALID_REQUEST'}],
]) assert.deepEqual(resolveRuntimeOsVersion(platform,input),expected);
for(const value of [null,undefined,12,'','  ','a'.repeat(129),'10\n','15\u0085']) {
  assert.deepEqual(resolveRuntimeOsVersion('windows',{osVersion:value}),{ok:false,code:'INVALID_REQUEST'});
  assert.deepEqual(resolveRuntimeOsVersion('windows',{osVersion:'10',windowsVersion:value}),{ok:false,code:'INVALID_REQUEST'});
}
assert.equal(resolveRuntimeOsVersion('windows',{osVersion:'a'.repeat(128)}).ok,true);
assert.equal(RUNTIME_UNINSTALL_RECEIPT_TTL_MS,604800000);
console.log('Machine control contract PASS: authenticated-platform OS compatibility, exact conflicts, invalid values and receipt lifetime');

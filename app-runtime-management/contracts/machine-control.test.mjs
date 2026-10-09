import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolveRuntimeOsVersion,RUNTIME_UNINSTALL_RECEIPT_TTL_MS,parseProgramInstancePolicyStatusReport,
  PROGRAM_INSTANCE_POLICY_STATUS_CAPABILITY} from './dist/app-runtime-control.js';
const vectors=JSON.parse(readFileSync(new URL('./machine-control.vectors.json',import.meta.url),'utf8'));
for(const vector of vectors.heartbeat) assert.deepEqual(resolveRuntimeOsVersion(vector.platform,vector.input),vector.expected);
assert.equal(createHash('sha256').update(vectors.receipt.confirmationSecret).digest('hex'),vectors.receipt.confirmationSecretHash);
assert.equal(vectors.receipt.expiredAtMs-vectors.receipt.committedAtMs,RUNTIME_UNINSTALL_RECEIPT_TTL_MS);
assert.equal(vectors.receipt.validAtMs+1,vectors.receipt.expiredAtMs);
// 机器控制 v1 语义未变；冻结上一兼容版向量，不随新增共享身份能力改写历史夹具。
// 当前包版本由 contract-compatibility.test.cjs 独立核验。
assert.equal(vectors.contractVersion,'1.30.0');
assert.deepEqual(vectors.http.commit.body,vectors.http.receipt.body);
assert.deepEqual(Object.keys(vectors.http.receipt.body).sort(),['committedAtMs','operationId','revoked','status']);
assert.equal(vectors.http.unavailable.status,404);
assert.equal(vectors.http.unavailable.body.error.code,'UNINSTALL_RESULT_UNAVAILABLE');
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

const userStatus={localUserId:'a'.repeat(64),assignmentVersion:2,state:'accepted',catalogVersion:8};
const report={schemaVersion:1,users:[userStatus]};
const parsedReport=parseProgramInstancePolicyStatusReport(report);
assert.deepEqual(parsedReport,report);
assert.notEqual(parsedReport.users[0],userStatus);
assert.deepEqual(parseProgramInstancePolicyStatusReport({schemaVersion:1,users:[]}),{schemaVersion:1,users:[]});
for(const state of ['noSession','unsupported','pending','partial','unknown']){
  assert.equal(parseProgramInstancePolicyStatusReport({schemaVersion:1,users:[{...userStatus,state,catalogVersion:null}]}).users[0].state,state);
  assert.throws(()=>parseProgramInstancePolicyStatusReport({schemaVersion:1,users:[{...userStatus,state}]}),/INVALID_PROGRAM_INSTANCE_POLICY_STATUS/,
    'historical or partial status must not carry a version that looks fully adopted');
}
for(const changed of [
  {catalogVersion:null},{catalogVersion:0},{catalogVersion:1.5},{catalogVersion:'8'},
  {assignmentVersion:0},{assignmentVersion:Number.MAX_SAFE_INTEGER+1},{assignmentVersion:'2'},
  {state:'applied'},{state:['accepted']},{localUserId:'S-1-5-21-123'},{localUserId:'x'.repeat(129)},
  {childId:'child-not-trusted'},{sequence:1},{path:'C:/app.exe'},{observationRef:'not-uploaded'},
  {lastActionOutcome:'terminated'}
])assert.throws(()=>parseProgramInstancePolicyStatusReport({schemaVersion:1,users:[{...userStatus,...changed}]}),/INVALID_PROGRAM_INSTANCE_POLICY_STATUS/);
for(const invalid of [null,[],{}, {...report,schemaVersion:2},{...report,receivedAtMs:1},
  {...report,users:[userStatus,userStatus]},{...report,users:Array(101).fill(userStatus)}])
  assert.throws(()=>parseProgramInstancePolicyStatusReport(invalid),/INVALID_PROGRAM_INSTANCE_POLICY_STATUS/);
const multiple=parseProgramInstancePolicyStatusReport({schemaVersion:1,users:[userStatus,
  {...userStatus,localUserId:'b'.repeat(64),assignmentVersion:3,state:'partial',catalogVersion:null}]});
assert.equal(multiple.users[1].state,'partial');
assert.equal(multiple.users[0].catalogVersion,8);
assert.equal(PROGRAM_INSTANCE_POLICY_STATUS_CAPABILITY,'program-instance-policy-status-v1');
const adoptionVectors=JSON.parse(readFileSync(new URL('./program-policy-status.vectors.json',import.meta.url),'utf8'));
assert.equal(adoptionVectors.capability,PROGRAM_INSTANCE_POLICY_STATUS_CAPABILITY);
for(const vector of adoptionVectors.vectors){
  if(vector.valid)assert.deepEqual(parseProgramInstancePolicyStatusReport(vector.input),vector.input,vector.name);
  else assert.throws(()=>parseProgramInstancePolicyStatusReport(vector.input),/INVALID_PROGRAM_INSTANCE_POLICY_STATUS/,vector.name);
}
const machineSchema=JSON.parse(readFileSync(new URL('./runtime-machine-api-v2.schema.json',import.meta.url),'utf8')).$defs;
assert.equal(machineSchema.programInstancePolicyStatus.properties.users.maxItems,100);
assert.equal(machineSchema.programInstancePolicyUserStatus.additionalProperties,false);
assert.deepEqual(machineSchema.programInstancePolicyUserStatus.required,Object.keys(userStatus));
console.log('Program instance policy status contract PASS: bounded users, isolated assignments, unknown/partial vs accepted, no action or identity payload');

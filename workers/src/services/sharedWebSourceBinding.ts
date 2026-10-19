import { canonicalSharedWebSync, validateSharedWebReusableProofV2, signSharedWebReusableProofV2,
  verifySharedWebReusableProofV2, type SharedWebSourceBindingClaimsV2,
  type SharedWebSourceVerificationKeyV1 } from '@timeonchrome/app-runtime-contracts/shared-web-sync';
import type { Env } from '../db/middleware';
import { sharedWebSourceKey } from './sharedAccessState';
import { readSharedWebJson, type SharedWebAuthenticatedScope } from './sharedWebContributions';

export interface SourceBindingEnv extends Env { RUNTIME_COMPUTER_USAGE?: {fetch?(request:Request):Promise<Response>} }
const sha=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
export const sharedChildScopeHash=async(accountId:string,childId:string)=>sha(`shared-web-child\n${accountId}\n${childId}`);
const fields=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
  &&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=128;
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
async function signingKeys(env:Env) {
  if(!env.SHARED_WEB_SOURCE_BINDING_PRIVATE_JWK)throw Error('WEB_SOURCE_BINDING_UNAVAILABLE');
  try {
    const jwk:JsonWebKey=JSON.parse(env.SHARED_WEB_SOURCE_BINDING_PRIVATE_JWK);
    if(jwk.kty!=='EC'||jwk.crv!=='P-256'||typeof jwk.d!=='string'||typeof jwk.x!=='string'||typeof jwk.y!=='string')throw Error('invalid');
    const publicJwk={kty:'EC' as const,crv:'P-256' as const,x:jwk.x,y:jwk.y};
    const keyId=await sha(canonicalSharedWebSync(publicJwk));
    const privateKey=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
    const publicKey=await crypto.subtle.importKey('jwk',publicJwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
    return {publicJwk,keyId,privateKey,publicKey};
  }catch{throw Error('WEB_SOURCE_BINDING_UNAVAILABLE');}
}
export async function readSharedWebVerificationKey(env:Env):Promise<SharedWebSourceVerificationKeyV1> {
  const {publicJwk,keyId}=await signingKeys(env);return {schemaVersion:1,keyId,publicJwk};
}
async function requireCurrentAssignment(env:SourceBindingEnv,row:{account_id:unknown;profile_id:unknown;machine_id:unknown;local_user_id:unknown;assignment_version:unknown;application_source_key:unknown}) {
  if(!env.RUNTIME_COMPUTER_USAGE?.fetch)throw Error('WEB_SOURCE_BINDING_UNAVAILABLE');
  const response=await env.RUNTIME_COMPUTER_USAGE.fetch(new Request('https://runtime-capability/verifySharedWebSourceAssignment',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:row.account_id,childId:row.profile_id,
      machineId:row.machine_id,localUserId:row.local_user_id,assignmentVersion:row.assignment_version,applicationSourceKey:row.application_source_key})}));
  const result=await readSharedWebJson(response,2048);
  if(!response.ok||!fields(result,['owned'])||result.owned!==true)throw Error('WEB_SOURCE_ASSIGNMENT_CHANGED');
}
/** Restricted Runtime caller supplies authenticated machine context; v2 stores no challenge. */
export async function createSharedWebMachineScope(env:SourceBindingEnv,input:unknown,now=Date.now()) {
  if(env.SHARED_WEB_CONTRIBUTIONS_ENABLED!=='true')throw Error('WEB_SOURCE_BINDING_UNAVAILABLE');
  if(!fields(input,['accountId','childId','machineId','localUserId','assignmentVersion','applicationSourceKey'])
    ||![input.accountId,input.childId,input.machineId,input.localUserId].every(text)
    ||!Number.isSafeInteger(input.assignmentVersion)||Number(input.assignmentVersion)<1||!hex(input.applicationSourceKey))
    throw Error('INVALID_WEB_SOURCE_SCOPE');
  const owner=await env.DB.prepare('SELECT 1 AS owned FROM profiles WHERE id=? AND account_id=?')
    .bind(input.childId,input.accountId).first();
  if(!owner)throw Error('WEB_SOURCE_SCOPE_MISMATCH');
  const row={account_id:input.accountId,profile_id:input.childId,machine_id:input.machineId,local_user_id:input.localUserId,
    assignment_version:input.assignmentVersion,application_source_key:input.applicationSourceKey};
  const check=async()=>{try{await requireCurrentAssignment(env,row);}catch(error){
    if(error instanceof Error&&error.message==='WEB_SOURCE_ASSIGNMENT_CHANGED')throw Error('SHARED_ACCESS_ASSIGNMENT_UNAVAILABLE');throw error;}
    if(!await env.DB.prepare('SELECT 1 AS owned FROM profiles WHERE id=? AND account_id=?').bind(input.childId,input.accountId).first())
      throw Error('WEB_SOURCE_SCOPE_MISMATCH');};
  await check();
  const {privateKey,keyId}=await signingKeys(env);
  const proof=await signSharedWebReusableProofV2({schemaVersion:2,audience:'timeonchrome:shared-web-machine-scope:v2',
    applicationSourceKey:input.applicationSourceKey,childScopeHash:await sharedChildScopeHash(String(input.accountId),String(input.childId)),
    assignmentVersion:Number(input.assignmentVersion),issuedAtMs:now,expiresAtMs:now+300000},keyId,privateKey);
  await check();
  if(proof.claims.expiresAtMs<=Date.now())throw Error('WEB_SOURCE_PROOF_EXPIRED');
  return proof;
}
async function requireReusableAssignment(env:SourceBindingEnv,accountId:string,childId:string,
  applicationSourceKey:string,assignmentVersion:number) {
  if(!env.RUNTIME_COMPUTER_USAGE?.fetch)throw Error('WEB_SOURCE_BINDING_UNAVAILABLE');
  let response:Response,result:unknown;
  try{
    response=await env.RUNTIME_COMPUTER_USAGE.fetch(new Request('https://runtime-capability/verifySharedWebSourceScope',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId,childId,applicationSourceKey,assignmentVersion})}));
    result=await readSharedWebJson(response,2048);
  }catch{throw Error('WEB_SOURCE_BINDING_UNAVAILABLE');}
  if(!response.ok||!fields(result,['owned'])||result.owned!==true){
    if(result&&typeof result==='object'&&'code' in result&&result.code==='SOURCE_SCOPE_LIMIT')throw Error('SOURCE_SCOPE_LIMIT');
    throw Error('SHARED_ACCESS_ASSIGNMENT_UNAVAILABLE');
  }
}
async function requireBrowserBinding(env:Env,scope:SharedWebAuthenticatedScope) {
  const browser=await env.DB.prepare(`SELECT 1 AS active FROM devices d JOIN profiles p ON p.id=d.profile_id
    WHERE d.id=? AND d.profile_id=? AND p.account_id=? AND d.device_token=? AND COALESCE(d.status,'bound')='bound'`)
    .bind(scope.deviceId,scope.childId,scope.accountId,scope.deviceToken).first();
  if(!browser)throw Error('WEB_SOURCE_SCOPE_MISMATCH');
}
export async function issueSharedWebSourceBindingV2(env:SourceBindingEnv,scope:SharedWebAuthenticatedScope,input:unknown,now=Date.now()) {
  if(env.SHARED_WEB_CONTRIBUTIONS_ENABLED!=='true')throw Error('WEB_SOURCE_BINDING_UNAVAILABLE');
  validateSharedWebReusableProofV2(input,'timeonchrome:shared-web-machine-scope:v2');
  const {keyId,privateKey,publicKey}=await signingKeys(env);
  const expected={applicationSourceKey:input.claims.applicationSourceKey,assignmentVersion:input.claims.assignmentVersion,
    childScopeHash:await sharedChildScopeHash(scope.accountId,scope.childId)};
  const claims=await verifySharedWebReusableProofV2(input,keyId,publicKey,expected,'timeonchrome:shared-web-machine-scope:v2',now);
  await requireReusableAssignment(env,scope.accountId,scope.childId,claims.applicationSourceKey,claims.assignmentVersion);
  await requireBrowserBinding(env,scope);
  const proof=await signSharedWebReusableProofV2({schemaVersion:2,audience:'timeonchrome:shared-web-source:v2',
    ...expected,webSourceKey:await sharedWebSourceKey(scope.accountId,scope.deviceId),
    bindingEpochHash:await sha(`shared-web-binding\n${scope.deviceId}\n${scope.deviceToken}`),
    issuedAtMs:now,expiresAtMs:Math.min(now+300000,claims.expiresAtMs)},keyId,privateKey);
  await requireReusableAssignment(env,scope.accountId,scope.childId,claims.applicationSourceKey,claims.assignmentVersion);
  await requireBrowserBinding(env,scope);
  if(proof.claims.expiresAtMs<=Date.now())throw Error('WEB_SOURCE_PROOF_EXPIRED');
  return proof;
}
export async function verifyCurrentSharedWebSource(env:SourceBindingEnv,input:unknown,accountId:string,childId:string,
  applicationSourceKey:string,now:number):Promise<SharedWebSourceBindingClaimsV2> {
  if(env.SHARED_WEB_CONTRIBUTIONS_ENABLED!=='true')throw Error('WEB_SOURCE_BINDING_UNAVAILABLE');
  validateSharedWebReusableProofV2(input,'timeonchrome:shared-web-source:v2');
  const {keyId,publicKey}=await signingKeys(env);
  const claims=await verifySharedWebReusableProofV2(input,keyId,publicKey,{applicationSourceKey,
    childScopeHash:await sharedChildScopeHash(accountId,childId),assignmentVersion:input.claims.assignmentVersion},
    'timeonchrome:shared-web-source:v2',now) as SharedWebSourceBindingClaimsV2;
  await requireReusableAssignment(env,accountId,childId,applicationSourceKey,claims.assignmentVersion);
  const {results}=await env.DB.prepare(`SELECT d.id,d.device_token FROM devices d JOIN profiles p ON p.id=d.profile_id
    WHERE d.profile_id=? AND p.account_id=? AND COALESCE(d.status,'bound')='bound' ORDER BY d.id LIMIT 201`)
    .bind(childId,accountId).all<{id:string;device_token:string}>();
  if(results.length>200)throw Error('SOURCE_SCOPE_LIMIT');
  let matched=false,matchedDevice:string|null=null;
  for(const device of results){
    if(await sharedWebSourceKey(accountId,device.id)!==claims.webSourceKey)continue;
    matched=await sha(`shared-web-binding\n${device.id}\n${device.device_token}`)===claims.bindingEpochHash;
    matchedDevice=device.id;
    break;
  }
  if(!matched)throw Error('WEB_SOURCE_SCOPE_MISMATCH');
  await requireReusableAssignment(env,accountId,childId,applicationSourceKey,claims.assignmentVersion);
  const current=await env.DB.prepare(`SELECT d.device_token FROM devices d JOIN profiles p ON p.id=d.profile_id
    WHERE d.id=? AND d.profile_id=? AND p.account_id=? AND COALESCE(d.status,'bound')='bound'`)
    .bind(matchedDevice,childId,accountId).first<{device_token:string}>();
  if(!current||await sha(`shared-web-binding\n${matchedDevice}\n${current.device_token}`)!==claims.bindingEpochHash)
    throw Error('WEB_SOURCE_SCOPE_MISMATCH');
  if(claims.expiresAtMs<=Date.now())throw Error('WEB_SOURCE_PROOF_EXPIRED');
  return claims;
}
/** 只复用现有证明；无有效本机关联时不伪造来源，也不影响已授权合计读取。 */
export async function readApplicationSourceForDevice(env:SourceBindingEnv,scope:SharedWebAuthenticatedScope,
  input:unknown,now=Date.now()):Promise<{applicationSourceKey:string;assignmentVersion:number}|null> {
  if(input==null)return null;
  try {
    validateSharedWebReusableProofV2(input,'timeonchrome:shared-web-source:v2');
    const expectedWebSource=await sharedWebSourceKey(scope.accountId,scope.deviceId);
    if(!('webSourceKey' in input.claims)||!('bindingEpochHash' in input.claims)
      ||input.claims.webSourceKey!==expectedWebSource
      ||input.claims.bindingEpochHash!==await sha(`shared-web-binding\n${scope.deviceId}\n${scope.deviceToken}`))return null;
    const claims=await verifyCurrentSharedWebSource(env,input,scope.accountId,scope.childId,input.claims.applicationSourceKey,now);
    await requireBrowserBinding(env,scope);
    return {applicationSourceKey:claims.applicationSourceKey,assignmentVersion:claims.assignmentVersion};
  }catch{return null;}
}

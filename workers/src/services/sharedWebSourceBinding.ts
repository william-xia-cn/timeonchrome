import { canonicalSharedWebSync, signSharedWebSourceBindingV1, verifySharedWebSourceBindingV1,
  validateSharedWebSourceBindingProofV1, type SharedWebSourceVerificationKeyV1 } from '@timeonchrome/app-runtime-contracts/shared-web-sync';
import type { Env } from '../db/middleware';
import { sharedWebSourceKey } from './sharedAccessState';
import { readSharedWebJson, type SharedWebAuthenticatedScope } from './sharedWebContributions';

export interface SourceBindingEnv extends Env { RUNTIME_COMPUTER_USAGE?: {fetch?(request:Request):Promise<Response>} }
interface ChallengeRow {
  challenge_id:string;account_id:string;profile_id:string;machine_id:string;local_user_id:string;
  assignment_version:number;application_source_key:string;connection_hash:string;created_at:number;
  expires_at:number;device_id:string|null;web_source_key:string|null;binding_epoch_hash:string|null;
}
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
async function requireCurrentAssignment(env:SourceBindingEnv,row:ChallengeRow) {
  if(!env.RUNTIME_COMPUTER_USAGE?.fetch)throw Error('WEB_SOURCE_BINDING_UNAVAILABLE');
  const response=await env.RUNTIME_COMPUTER_USAGE.fetch(new Request('https://runtime-capability/verifySharedWebSourceAssignment',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:row.account_id,childId:row.profile_id,
      machineId:row.machine_id,localUserId:row.local_user_id,assignmentVersion:row.assignment_version,applicationSourceKey:row.application_source_key})}));
  const result=await readSharedWebJson(response,2048);
  if(!response.ok||!fields(result,['owned'])||result.owned!==true)throw Error('WEB_SOURCE_ASSIGNMENT_CHANGED');
}
/** Only Runtime's restricted service binding may supply raw machine/assignment context. */
export async function createSharedWebSourceChallenge(env:SourceBindingEnv,input:unknown,now=Date.now()) {
  if(env.SHARED_WEB_CONTRIBUTIONS_ENABLED!=='true')throw Error('WEB_SOURCE_BINDING_UNAVAILABLE');
  if(!fields(input,['accountId','childId','machineId','localUserId','assignmentVersion','applicationSourceKey','connectionHash'])
    ||![input.accountId,input.childId,input.machineId,input.localUserId].every(text)
    ||!Number.isSafeInteger(input.assignmentVersion)||Number(input.assignmentVersion)<1
    ||!hex(input.applicationSourceKey)||!hex(input.connectionHash))throw Error('INVALID_WEB_SOURCE_CHALLENGE');
  await signingKeys(env);
  const row:ChallengeRow={challenge_id:await sha(crypto.randomUUID()+crypto.randomUUID()),account_id:String(input.accountId),
    profile_id:String(input.childId),machine_id:String(input.machineId),local_user_id:String(input.localUserId),
    assignment_version:Number(input.assignmentVersion),application_source_key:input.applicationSourceKey,connection_hash:input.connectionHash,
    created_at:now,expires_at:now+90000,device_id:null,web_source_key:null,binding_epoch_hash:null};
  await requireCurrentAssignment(env,row);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM shared_web_source_challenges_v1 WHERE challenge_id IN (
      SELECT challenge_id FROM shared_web_source_challenges_v1 WHERE expires_at<? ORDER BY expires_at LIMIT 100)`)
      .bind(now-300000),
    env.DB.prepare(`INSERT INTO shared_web_source_challenges_v1(challenge_id,account_id,profile_id,machine_id,local_user_id,
      assignment_version,application_source_key,connection_hash,created_at,expires_at)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM profiles WHERE id=? AND account_id=?)`)
      .bind(row.challenge_id,row.account_id,row.profile_id,row.machine_id,row.local_user_id,row.assignment_version,
        row.application_source_key,row.connection_hash,now,row.expires_at,row.profile_id,row.account_id),
  ]);
  const exists=await env.DB.prepare('SELECT challenge_id FROM shared_web_source_challenges_v1 WHERE challenge_id=?').bind(row.challenge_id).first();
  if(!exists)throw Error('WEB_SOURCE_ASSIGNMENT_CHANGED');
  return {schemaVersion:1,challengeId:row.challenge_id,connectionHash:row.connection_hash,expiresAtMs:row.expires_at};
}
export async function issueSharedWebSourceBinding(env:SourceBindingEnv,scope:SharedWebAuthenticatedScope,challengeId:unknown,now=Date.now()) {
  if(env.SHARED_WEB_CONTRIBUTIONS_ENABLED!=='true')throw Error('WEB_SOURCE_BINDING_UNAVAILABLE');
  if(!hex(challengeId))throw Error('INVALID_WEB_SOURCE_CHALLENGE');
  const row=await env.DB.prepare(`SELECT * FROM shared_web_source_challenges_v1 WHERE challenge_id=? AND account_id=? AND profile_id=?`)
    .bind(challengeId,scope.accountId,scope.childId).first<ChallengeRow>();
  if(!row||row.expires_at<=now||row.created_at>now)throw Error('WEB_SOURCE_CHALLENGE_EXPIRED');
  await requireCurrentAssignment(env,row);
  const sourceKey=await sharedWebSourceKey(scope.accountId,scope.deviceId);
  const bindingEpochHash=await sha(`shared-web-binding\n${scope.deviceId}\n${scope.deviceToken}`);
  await env.DB.prepare(`UPDATE shared_web_source_challenges_v1 SET device_id=?,web_source_key=?,binding_epoch_hash=?
    WHERE challenge_id=? AND account_id=? AND profile_id=? AND expires_at>?
      AND (device_id IS NULL OR (device_id=? AND binding_epoch_hash=?)) AND EXISTS(SELECT 1 FROM devices d JOIN profiles p ON p.id=d.profile_id
        WHERE d.id=? AND d.profile_id=? AND p.account_id=? AND d.device_token=? AND COALESCE(d.status,'bound')='bound')`)
    .bind(scope.deviceId,sourceKey,bindingEpochHash,challengeId,scope.accountId,scope.childId,now,scope.deviceId,bindingEpochHash,
      scope.deviceId,scope.childId,scope.accountId,scope.deviceToken).run();
  const bound=await env.DB.prepare(`SELECT device_id,web_source_key,binding_epoch_hash FROM shared_web_source_challenges_v1 WHERE challenge_id=?`)
    .bind(challengeId).first<{device_id:string;web_source_key:string;binding_epoch_hash:string}>();
  if(bound?.device_id!==scope.deviceId||bound?.web_source_key!==sourceKey||bound?.binding_epoch_hash!==bindingEpochHash)
    throw Error('WEB_SOURCE_BINDING_CONFLICT');
  const browser=await env.DB.prepare(`SELECT 1 AS active FROM devices d JOIN profiles p ON p.id=d.profile_id
    WHERE d.id=? AND d.profile_id=? AND p.account_id=? AND d.device_token=? AND COALESCE(d.status,'bound')='bound'`)
    .bind(scope.deviceId,scope.childId,scope.accountId,scope.deviceToken).first();
  if(!browser)throw Error('WEB_SOURCE_ASSIGNMENT_CHANGED');
  await requireCurrentAssignment(env,row);
  const {privateKey,keyId}=await signingKeys(env);
  return signSharedWebSourceBindingV1({schemaVersion:1,audience:'timeonchrome:shared-web-source:v1',challengeId:row.challenge_id,
    connectionHash:row.connection_hash,applicationSourceKey:row.application_source_key,
    childScopeHash:await sharedChildScopeHash(row.account_id,row.profile_id),assignmentVersion:row.assignment_version,
    webSourceKey:sourceKey,issuedAtMs:row.created_at,expiresAtMs:row.created_at+300000},keyId,privateKey);
}
/** Cloud revalidates current browser binding and assignment, not merely a valid old signature. */
export async function verifyCurrentSharedWebSource(env:SourceBindingEnv,input:unknown,accountId:string,childId:string,
  applicationSourceKey:string,now=Date.now()) {
  validateSharedWebSourceBindingProofV1(input);
  const proof=JSON.parse(canonicalSharedWebSync(input)) as typeof input;
  const row=await env.DB.prepare(`SELECT * FROM shared_web_source_challenges_v1 WHERE challenge_id=? AND account_id=? AND profile_id=?`)
    .bind(proof.claims.challengeId,accountId,childId).first<ChallengeRow>();
  if(!row||!row.device_id||row.web_source_key!==proof.claims.webSourceKey||row.application_source_key!==applicationSourceKey)
    throw Error('WEB_SOURCE_BINDING_CONFLICT');
  const {keyId,publicKey}=await signingKeys(env);
  const claims=await verifySharedWebSourceBindingV1(proof,keyId,publicKey,{challengeId:row.challenge_id,
    connectionHash:row.connection_hash,applicationSourceKey,childScopeHash:await sharedChildScopeHash(accountId,childId),
    assignmentVersion:row.assignment_version},now);
  const active=await env.DB.prepare(`SELECT d.device_token FROM devices d JOIN profiles p ON p.id=d.profile_id
    WHERE d.id=? AND d.profile_id=? AND p.account_id=? AND COALESCE(d.status,'bound')='bound'`)
    .bind(row.device_id,childId,accountId).first<{device_token:string}>();
  if(!active||await sha(`shared-web-binding\n${row.device_id}\n${active.device_token}`)!==row.binding_epoch_hash)
    throw Error('WEB_SOURCE_ASSIGNMENT_CHANGED');
  await requireCurrentAssignment(env,row);return claims;
}

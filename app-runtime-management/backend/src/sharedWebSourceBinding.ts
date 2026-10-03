import { applicationSharedQuotaSourceKey } from './applicationSharedQuota';
import { HttpError, readJsonBody, jsonResponse, methodNotAllowed } from './http';
import { requireMachine } from './auth';
import type { MachineSelfResponse } from './contracts';
import { isRecord } from './validation';
import { validateSharedWebSourceBindingProofV1, validateSharedWebReusableProofV2,
  type SharedWebSourceBindingProofV1, type SharedWebSourceBindingProofV2 } from '@timeonchrome/app-runtime-contracts/shared-web-sync';
import { sha256Hex } from './crypto';

/** Parsed header is not yet trusted: Guardian must verify signature and current browser assignment. */
export async function parseMachineWebSourceProof(request:Request,machine:MachineSelfResponse,childId:string,
  assignmentVersion:number,applicationSourceKey:string):Promise<SharedWebSourceBindingProofV1|SharedWebSourceBindingProofV2|null> {
  const header=request.headers.get('X-Shared-Web-Source-Proof');if(header===null)return null;
  let v2=false;
  try{
    if(header.length>4096)throw Error('oversize');
    const value:unknown=JSON.parse(header);
    if(isRecord(value)&&value.schemaVersion===2){v2=true;validateSharedWebReusableProofV2(value,'timeonchrome:shared-web-source:v2');}
    else validateSharedWebSourceBindingProofV1(value);
    const proof=value as SharedWebSourceBindingProofV1|SharedWebSourceBindingProofV2;
    if(proof.claims.applicationSourceKey!==applicationSourceKey||proof.claims.assignmentVersion!==assignmentVersion
      ||proof.claims.childScopeHash!==await sha256Hex(`shared-web-child\n${machine.accountId}\n${childId}`))throw Error('scope');
    return proof;
  }catch{throw new HttpError(403,v2?'WEB_SOURCE_SCOPE_MISMATCH':'WEB_SOURCE_BINDING_CONFLICT','Source proof does not match the authenticated machine.');}
}
/** Resolve only bounded current assignments in the trusted account/Child scope; opaque keys grant no authority. */
export async function verifySharedWebSourceScope(db:D1Database,input:unknown):Promise<boolean> {
  const fields=['accountId','childId','assignmentVersion','applicationSourceKey'];
  if(!isRecord(input)||Object.keys(input).length!==fields.length||Object.keys(input).some(k=>!fields.includes(k))
    ||['accountId','childId'].some(k=>typeof input[k]!=='string'||!String(input[k]).length||String(input[k]).length>128)
    ||!Number.isSafeInteger(input.assignmentVersion)||Number(input.assignmentVersion)<1
    ||typeof input.applicationSourceKey!=='string'||!/^[a-f0-9]{64}$/.test(input.applicationSourceKey))return false;
  const {results}=await db.prepare(`SELECT a.machine_id,a.local_user_id,a.assignment_version FROM runtime_user_assignments_v2 a
    JOIN runtime_machines_v2 m ON m.id=a.machine_id WHERE m.account_id=? AND m.revoked_at_ms IS NULL
      AND a.child_id=? AND a.protected=1 AND NOT EXISTS(SELECT 1 FROM runtime_user_assignments_v2 n
        WHERE n.machine_id=a.machine_id AND n.local_user_id=a.local_user_id AND n.assignment_version>a.assignment_version)
    ORDER BY a.machine_id,a.local_user_id LIMIT 201`).bind(input.accountId,input.childId)
    .all<{machine_id:string;local_user_id:string;assignment_version:number}>();
  if(results.length>200)throw new HttpError(503,'SOURCE_SCOPE_LIMIT','Current source scope exceeds the bounded lookup.');
  for(const row of results){
    if(row.assignment_version===input.assignmentVersion
      &&await applicationSharedQuotaSourceKey(row.machine_id,row.local_user_id,row.assignment_version)===input.applicationSourceKey)return true;
  }
  return false;
}

/** Internal server scope, never a Host-specified Child. */
export async function verifySharedWebSourceAssignment(db:D1Database,input:unknown):Promise<boolean> {
  const fields=['accountId','childId','machineId','localUserId','assignmentVersion','applicationSourceKey'];
  if(!isRecord(input)||Object.keys(input).length!==fields.length||Object.keys(input).some(k=>!fields.includes(k))
    ||fields.filter(k=>k!=='assignmentVersion').some(k=>typeof input[k]!=='string'||!String(input[k]).length||String(input[k]).length>128)
    ||!Number.isSafeInteger(input.assignmentVersion)||Number(input.assignmentVersion)<1
    ||typeof input.applicationSourceKey!=='string'||!/^[a-f0-9]{64}$/.test(input.applicationSourceKey))return false;
  if(await applicationSharedQuotaSourceKey(String(input.machineId),String(input.localUserId),Number(input.assignmentVersion))!==input.applicationSourceKey)return false;
  return !!await db.prepare(`SELECT 1 AS owned FROM runtime_user_assignments_v2 a JOIN runtime_machines_v2 m ON m.id=a.machine_id
    WHERE m.account_id=? AND m.id=? AND m.revoked_at_ms IS NULL AND a.local_user_id=? AND a.assignment_version=?
      AND a.child_id=? AND a.protected=1 AND NOT EXISTS(SELECT 1 FROM runtime_user_assignments_v2 n
        WHERE n.machine_id=a.machine_id AND n.local_user_id=a.local_user_id AND n.assignment_version>a.assignment_version)`)
    .bind(input.accountId,input.machineId,input.localUserId,input.assignmentVersion,input.childId).first();
}
async function boundedJson(response:Response,max=4096):Promise<unknown> {
  const reader=response.body?.getReader();if(!reader)throw Error('empty');
  const chunks:Uint8Array[]=[];let length=0;
  try{while(true){const c=await reader.read();if(c.done)break;length+=c.value.byteLength;
    if(length>max){await reader.cancel();throw Error('oversize');}chunks.push(c.value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let position=0;for(const c of chunks){bytes.set(c,position);position+=c.byteLength;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function routeSharedWebSourceBinding(request:Request,env:Env,machine:MachineSelfResponse,now:number):Promise<Response> {
  const path=new URL(request.url).pathname;
  const isKey=path==='/v2/machines/shared-web-source/verification-key';
  const isScope=path==='/v2/machines/shared-web-source/scope';
  if(request.method!==(isKey?'GET':'POST'))return methodNotAllowed(isKey?'GET':'POST');
  if([...new URL(request.url).searchParams].length)throw new HttpError(400,'INVALID_REQUEST','Source binding query is invalid.');
  if(!env.GUARDIAN_COMPUTER_USAGE)throw new HttpError(503,'WEB_SOURCE_BINDING_UNAVAILABLE','Source binding is unavailable.');
  let input:Record<string,unknown>={};
  let readAssignment:(()=>Promise<{child_id:string}|null>)|null=null;
  let child:string|null=null;
  if(!isKey){
    const body=await readJsonBody(request,2048);
    const allowed=isScope?['localUserId','assignmentVersion']:['localUserId','assignmentVersion','connectionHash'];
    if(!isRecord(body)||Object.keys(body).length!==allowed.length||Object.keys(body).some(k=>!allowed.includes(k))
      ||typeof body.localUserId!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(body.localUserId)
      ||!Number.isSafeInteger(body.assignmentVersion)||Number(body.assignmentVersion)<1
      ||!isScope&&(typeof body.connectionHash!=='string'||!/^[a-f0-9]{64}$/.test(body.connectionHash)))
      throw new HttpError(400,isScope?'INVALID_WEB_SOURCE_SCOPE':'INVALID_WEB_SOURCE_CHALLENGE','Source binding scope is invalid.');
    readAssignment=()=>env.RUNTIME_DB.prepare(`SELECT a.child_id FROM runtime_user_assignments_v2 a WHERE a.machine_id=? AND a.local_user_id=?
      AND a.assignment_version=? AND a.protected=1 AND a.child_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM runtime_user_assignments_v2 n
        WHERE n.machine_id=a.machine_id AND n.local_user_id=a.local_user_id AND n.assignment_version>a.assignment_version)`)
      .bind(machine.machineId,body.localUserId,body.assignmentVersion).first<{child_id:string}>();
    child=(await readAssignment())?.child_id??null;
    if(!child)throw new HttpError(403,'SHARED_ACCESS_ASSIGNMENT_UNAVAILABLE','Assignment is unavailable.');
    input={accountId:machine.accountId,childId:child,machineId:machine.machineId,localUserId:body.localUserId,
      assignmentVersion:body.assignmentVersion,...(isScope?{}:{connectionHash:body.connectionHash}),
      applicationSourceKey:await applicationSharedQuotaSourceKey(machine.machineId,body.localUserId,Number(body.assignmentVersion))};
  }
  let result:unknown;
  try{
    const response=await env.GUARDIAN_COMPUTER_USAGE.fetch(new Request(`https://guardian-capability/${isKey?'readSharedWebVerificationKey':isScope?'createSharedWebMachineScope':'createSharedWebSourceChallenge'}`,
      {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}));
    result=await boundedJson(response);
    if(!response.ok){
      if(isScope&&isRecord(result)&&['WEB_SOURCE_SCOPE_MISMATCH','SHARED_ACCESS_ASSIGNMENT_UNAVAILABLE','SOURCE_SCOPE_LIMIT',
        'WEB_SOURCE_PROOF_EXPIRED','WEB_SOURCE_BINDING_UNAVAILABLE'].includes(String(result.code)))
        throw new HttpError(['SOURCE_SCOPE_LIMIT','WEB_SOURCE_BINDING_UNAVAILABLE'].includes(String(result.code))?503:409,
          String(result.code),'Source binding is unavailable.');
      throw Error('unavailable');
    }
  }catch(error){if(error instanceof HttpError)throw error;
    throw new HttpError(503,'WEB_SOURCE_BINDING_UNAVAILABLE','Source binding is unavailable.');}
  if(isScope){
    try{
      validateSharedWebReusableProofV2(result,'timeonchrome:shared-web-machine-scope:v2');
      if(result.claims.applicationSourceKey!==input.applicationSourceKey||result.claims.assignmentVersion!==input.assignmentVersion
        ||result.claims.childScopeHash!==await sha256Hex(`shared-web-child\n${machine.accountId}\n${child}`)
        ||result.claims.issuedAtMs>Date.now()||result.claims.expiresAtMs<=Date.now())throw Error('scope');
    }catch{throw new HttpError(503,'WEB_SOURCE_BINDING_UNAVAILABLE','Machine scope response is invalid.');}
  }else if(!isRecord(result)||result.schemaVersion!==1)throw new HttpError(503,'WEB_SOURCE_BINDING_UNAVAILABLE','Source binding response is invalid.');
  if(!isKey&&!isScope&&(!isRecord(result)||Object.keys(result).length!==4||typeof result.challengeId!=='string'||!/^[a-f0-9]{64}$/.test(result.challengeId)
    ||result.connectionHash!==input.connectionHash||!Number.isSafeInteger(result.expiresAtMs)||Number(result.expiresAtMs)<=Date.now()||Number(result.expiresAtMs)>Date.now()+90000))
    throw new HttpError(503,'WEB_SOURCE_BINDING_UNAVAILABLE','Challenge response is invalid.');
  if(isKey){
    if(!isRecord(result))throw new HttpError(503,'WEB_SOURCE_BINDING_UNAVAILABLE','Verification key response is invalid.');
    const publicJwk=result.publicJwk;
    if(Object.keys(result).length!==3||typeof result.keyId!=='string'||!/^[a-f0-9]{64}$/.test(result.keyId)||!isRecord(publicJwk)
      ||Object.keys(publicJwk).length!==4||publicJwk.kty!=='EC'||publicJwk.crv!=='P-256'
      ||['x','y'].some(k=>typeof publicJwk[k]!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(String(publicJwk[k]))))
      throw new HttpError(503,'WEB_SOURCE_BINDING_UNAVAILABLE','Verification key response is invalid.');
  }
  const current=await requireMachine(request,env.RUNTIME_DB,now,false);
  if(current.machineId!==machine.machineId||current.accountId!==machine.accountId||readAssignment&&(await readAssignment())?.child_id!==child)
    throw new HttpError(409,'SHARED_ACCESS_BINDING_CHANGED','Source binding changed.');
  if(isScope&&isRecord(result)&&isRecord(result.claims)&&Number(result.claims.expiresAtMs)<=Date.now())
    throw new HttpError(409,'WEB_SOURCE_PROOF_EXPIRED','Source proof expired.');
  return jsonResponse(isKey||isScope ? result : {...result as Record<string,unknown>, applicationSourceKey:input.applicationSourceKey,
    childScopeHash:await sha256Hex(`shared-web-child\n${machine.accountId}\n${child}`)},{headers:{'cache-control':'no-store'}});
}

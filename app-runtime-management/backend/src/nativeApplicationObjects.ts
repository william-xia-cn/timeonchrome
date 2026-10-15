import {parseNativeApplicationObjectBatch,nativeApplicationManagementTargetKey,
 type NativeApplicationObjectBatch,type NativeApplicationPresentation,NATIVE_APPLICATION_MANAGEMENT_CAPABILITY}
 from '@timeonchrome/app-runtime-contracts/native-application-identification';
import {canonicalUsageAccountJson,hashUsageAccountValue} from '@timeonchrome/app-runtime-contracts/usage-account';
import {getAppPolicy} from './appPolicy';
import type {MachineSelfResponse} from './contracts';
import {HttpError} from './http';
export {NATIVE_APPLICATION_MANAGEMENT_CAPABILITY};
const fail=(status:number,code:string):never=>{throw new HttpError(status,code,code);};
export async function nativeApplicationObjectStorageReady(db:D1Database) {
 const row=await db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE
 (type='table' AND name IN('runtime_native_application_objects_v1','runtime_native_application_projections_v1'))
 OR (type='trigger' AND name IN('runtime_native_object_scope_v1','runtime_native_object_revision_v1'))`).first<{n:number}>();
 return row?.n===4;
}
export async function requireNativeApplicationScope(db:D1Database,machine:MachineSelfResponse,
 scope:{childId?:string;localUserId:string;assignmentVersion:number}) {
 if(machine.revoked)return fail(403,'NATIVE_APPLICATION_SCOPE_CHANGED');
 const row=await db.prepare(`SELECT a.child_id FROM runtime_user_assignments_v2 a
 JOIN runtime_machines_v2 m ON m.id=a.machine_id WHERE a.machine_id=?1 AND m.account_id=?2
 AND m.platform=?3 AND m.revoked_at_ms IS NULL AND a.local_user_id=?4 AND a.assignment_version=?5
 AND a.protected=1 AND a.child_id IS NOT NULL AND a.assignment_version=(SELECT MAX(assignment_version)
 FROM runtime_user_assignments_v2 WHERE machine_id=?1 AND local_user_id=?4)`)
 .bind(machine.machineId,machine.accountId,machine.platform,scope.localUserId,scope.assignmentVersion).first<{child_id:string}>();
 if(!row||scope.childId!==undefined&&row.child_id!==scope.childId)return fail(403,'NATIVE_APPLICATION_SCOPE_CHANGED');
 return row.child_id;
}
export async function receiveNativeApplicationObjects(db:D1Database,machine:MachineSelfResponse,input:unknown,nowMs:number) {
 let batch:NativeApplicationObjectBatch;try{batch=parseNativeApplicationObjectBatch(input);}catch{return fail(400,'INVALID_NATIVE_APPLICATION_OBJECT');}
 if(batch.items.some(item=>item.observedAtMs>nowMs+300000))return fail(400,'INVALID_NATIVE_APPLICATION_TIME');
 await requireNativeApplicationScope(db,machine,batch);
 if(!await nativeApplicationObjectStorageReady(db))return fail(503,'NATIVE_APPLICATION_STORAGE_UNAVAILABLE');
 const prepared=await Promise.all(batch.items.map(async item=>({item,payload:canonicalUsageAccountJson(item),hash:await hashUsageAccountValue(item)})));
 if(!prepared.length)return {...batch,items:[]};
 const statements:D1PreparedStatement[]=[];
 for(const {item,payload,hash} of prepared)statements.push(db.prepare(`INSERT INTO runtime_native_application_objects_v1
 (child_id,machine_id,local_user_id,assignment_version,native_id,revision,payload_hash,payload_json,received_at_ms)
 VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)
 ON CONFLICT(child_id,machine_id,local_user_id,assignment_version,native_id) DO UPDATE SET
 revision=excluded.revision,payload_hash=excluded.payload_hash,payload_json=excluded.payload_json,received_at_ms=excluded.received_at_ms
 WHERE excluded.revision>runtime_native_application_objects_v1.revision`)
 .bind(batch.childId,machine.machineId,batch.localUserId,batch.assignmentVersion,item.nativeId,item.revision,hash,payload,nowMs));
 for(const {item}of prepared)statements.push(db.prepare(`SELECT native_id,revision,payload_hash FROM runtime_native_application_objects_v1
 WHERE child_id=?1 AND machine_id=?2 AND local_user_id=?3 AND assignment_version=?4 AND native_id=?5`)
 .bind(batch.childId,machine.machineId,batch.localUserId,batch.assignmentVersion,item.nativeId));
 try {
  const result=await db.batch<{native_id:string;revision:number;payload_hash:string}>(statements);
  return {schemaVersion:1,childId:batch.childId,localUserId:batch.localUserId,assignmentVersion:batch.assignmentVersion,
   items:result.slice(prepared.length).map(r=>({nativeId:r.results[0].native_id,revision:r.results[0].revision,payloadHash:r.results[0].payload_hash}))};
 }catch(error){
  if(error instanceof Error&&error.message.includes('NATIVE_APPLICATION_REVISION_CONFLICT'))return fail(409,'NATIVE_APPLICATION_REVISION_CONFLICT');
  if(error instanceof Error&&error.message.includes('NATIVE_APPLICATION_SCOPE_CHANGED'))return fail(403,'NATIVE_APPLICATION_SCOPE_CHANGED');
  throw error;
 }
}
/** 子范围目录直接取独立对象，不等待原始段、实例捕获或旧产品目录。 */
export async function readNativeApplicationObjects(db:D1Database,accountId:string,childId:string,offset=0) {
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return fail(400,'INVALID_CURSOR');
 if(!await nativeApplicationObjectStorageReady(db))return {schemaVersion:1,state:'unavailable',childId,items:[],nextOffset:null};
 // 先按对象分页，再载入该页的来源，避免按来源分页截断同一对象。
 const targets=await db.prepare(`SELECT DISTINCT n.machine_id,n.native_id,m.platform FROM runtime_native_application_objects_v1 n
 JOIN runtime_machines_v2 m ON m.id=n.machine_id WHERE m.account_id=?1 AND n.child_id=?2 AND m.revoked_at_ms IS NULL
 ORDER BY n.machine_id,n.native_id LIMIT 101 OFFSET ?3`).bind(accountId,childId,offset).all<{machine_id:string;native_id:string;platform:string}>();
 const page=targets.results.slice(0,100),policy=await getAppPolicy(db,accountId,childId);
 const rows=page.length?await db.prepare(`SELECT n.* FROM runtime_native_application_objects_v1 n
 JOIN runtime_machines_v2 m ON m.id=n.machine_id WHERE m.account_id=?1 AND n.child_id=?2 AND m.revoked_at_ms IS NULL
 AND EXISTS(SELECT 1 FROM json_each(?3) r WHERE json_extract(r.value,'$.machine_id')=n.machine_id
 AND json_extract(r.value,'$.native_id')=n.native_id) ORDER BY n.received_at_ms DESC,n.local_user_id,n.assignment_version DESC LIMIT 3201`)
 .bind(accountId,childId,JSON.stringify(page)).all<{machine_id:string;native_id:string;payload_json:string;received_at_ms:number}>():{results:[]};
 if(rows.results.length>3200)return fail(503,'NATIVE_APPLICATION_READ_LIMIT');
 const items=page.map(target=>{
  const ref={machineId:target.machine_id,nativeId:target.native_id},sources=rows.results.filter(r=>r.machine_id===ref.machineId&&r.native_id===ref.nativeId);
  const presentations:NativeApplicationPresentation[]=[];
  for(const source of sources){
   const saved=JSON.parse(source.payload_json) as NativeApplicationObjectBatch['items'][number];
   for(const p of saved.presentations)if(!presentations.some(old=>canonicalUsageAccountJson(old)===canonicalUsageAccountJson(p)))presentations.push(p);
  }
  return {target:ref,platform:target.platform,presentations,updatedAtMs:sources[0]?.received_at_ms??null,
   configuration:policy.nativeApplications?.find(entry=>nativeApplicationManagementTargetKey(entry.target)===nativeApplicationManagementTargetKey(ref))??null};
 });
 return {schemaVersion:1,state:'available',childId,policyVersion:policy.version,items,nextOffset:targets.results.length>100?offset+100:null};
}
export async function readNativeApplicationConfiguration(db:D1Database,machine:MachineSelfResponse,localUserId:string,assignmentVersion:number) {
 const childId=await requireNativeApplicationScope(db,machine,{localUserId,assignmentVersion});
 const policy=await getAppPolicy(db,machine.accountId,childId);
 return {schemaVersion:1,childId,version:policy.version,effectiveAtMs:policy.effectiveAtMs,
  applications:(policy.nativeApplications??[]).filter(entry=>entry.target.machineId===machine.machineId)};
}

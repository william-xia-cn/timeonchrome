import { parseNativeApplicationIdentificationBatch, parseNativeApplicationIdentificationReceipt, normalizeNativeApplicationIdentificationItem,
  type NativeApplicationIdentification, type NativeApplicationIdentificationBatch } from '@timeonchrome/app-runtime-contracts/native-application-identification';
import { canonicalUsageAccountJson, hashUsageAccountValue } from '@timeonchrome/app-runtime-contracts/usage-account';
import type { MachineSelfResponse } from './contracts';
import { HttpError } from './http';
const fail=(status:number,code:string):never=>{throw new HttpError(status,code,code);};
export { NATIVE_APPLICATION_IDENTIFICATION_CAPABILITY } from '@timeonchrome/app-runtime-contracts/native-application-identification';
export async function nativeApplicationIdentificationStorageReady(db:D1Database) {
  const result=await db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE
    (type='table' AND name='runtime_native_application_identifications_v1') OR
    (type='trigger' AND name IN('runtime_native_identification_scope_v1','runtime_native_identification_revision_v1'))`)
    .first<{n:number}>();
  return result?.n===3;
}
/** 当前认证分配下的命名快照；统计和产品映射没有任何写入。 */
export async function receiveNativeApplicationIdentifications(db:D1Database,machine:MachineSelfResponse,input:unknown,nowMs:number) {
  let value:NativeApplicationIdentificationBatch;
  try{value=parseNativeApplicationIdentificationBatch(input);}catch{return fail(400,'INVALID_NATIVE_APPLICATION_IDENTIFICATION');}
  if(!Number.isSafeInteger(nowMs)||nowMs<0||value.items.some(item=>item.observedAtMs>nowMs+300000))
    return fail(400,'INVALID_NATIVE_IDENTIFICATION_TIME');
  if(machine.revoked)return fail(403,'NATIVE_IDENTIFICATION_SCOPE_CHANGED');
  if(!await nativeApplicationIdentificationStorageReady(db))return fail(503,'NATIVE_IDENTIFICATION_STORAGE_UNAVAILABLE');
  const assignment=await db.prepare(`SELECT a.child_id FROM runtime_user_assignments_v2 a
    JOIN runtime_machines_v2 m ON m.id=a.machine_id WHERE a.machine_id=?1 AND m.account_id=?2
      AND m.platform=?3 AND m.revoked_at_ms IS NULL AND a.local_user_id=?4 AND a.assignment_version=?5
      AND a.child_id=?6 AND a.protected=1 AND a.assignment_version=(SELECT MAX(assignment_version)
        FROM runtime_user_assignments_v2 WHERE machine_id=?1 AND local_user_id=?4)`)
    .bind(machine.machineId,machine.accountId,machine.platform,value.localUserId,value.assignmentVersion,value.childId)
    .first<{child_id:string}>();
  if(!assignment)return fail(403,'NATIVE_IDENTIFICATION_SCOPE_CHANGED');
  const ids=value.items.map(item=>item.instanceId);
  const scopes=await db.prepare(`SELECT instance_id FROM runtime_program_instance_scopes_v1
    WHERE machine_id=?1 AND child_id=?2 AND local_user_id=?3 AND assignment_version=?4
      AND instance_id IN(SELECT value FROM json_each(?5))`)
    .bind(machine.machineId,value.childId,value.localUserId,value.assignmentVersion,JSON.stringify(ids)).all<{instance_id:string}>();
  if(scopes.results.length!==ids.length)return fail(409,'NATIVE_IDENTIFICATION_INSTANCE_PENDING');
  // 规范化无序集合；名称变更保留在独立命名修订，原证据版本不变。
  const prepared=await Promise.all(value.items.map(async item=>{
    const normalized=normalizeNativeApplicationIdentificationItem(item);
    return {...normalized,payload:canonicalUsageAccountJson(normalized),hash:await hashUsageAccountValue(normalized)};
  }));
  type Saved={instance_id:string;revision:number;payload_hash:string};
  const statements:D1PreparedStatement[]=[];
  for(const item of prepared)statements.push(db.prepare(`INSERT INTO runtime_native_application_identifications_v1
    (child_id,machine_id,instance_id,local_user_id,assignment_version,revision,payload_hash,payload_json,received_at_ms)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)
    ON CONFLICT(child_id,machine_id,instance_id,local_user_id,assignment_version) DO UPDATE SET
      revision=excluded.revision,payload_hash=excluded.payload_hash,payload_json=excluded.payload_json,received_at_ms=excluded.received_at_ms
    WHERE excluded.revision>runtime_native_application_identifications_v1.revision`)
    .bind(value.childId,machine.machineId,item.instanceId,value.localUserId,value.assignmentVersion,item.revision,item.hash,item.payload,nowMs));
  for(const item of prepared)statements.push(db.prepare(`SELECT instance_id,revision,payload_hash FROM runtime_native_application_identifications_v1
    WHERE child_id=?1 AND machine_id=?2 AND instance_id=?3 AND local_user_id=?4 AND assignment_version=?5`)
    .bind(value.childId,machine.machineId,item.instanceId,value.localUserId,value.assignmentVersion));
  if(!statements.length)return {...value,items:[]};
  let results:D1Result<Saved>[];
  try{results=await db.batch<Saved>(statements);}catch(error){
    if(error instanceof Error&&error.message.includes('NATIVE_IDENTIFICATION_REVISION_CONFLICT'))return fail(409,'NATIVE_IDENTIFICATION_REVISION_CONFLICT');
    if(error instanceof Error&&error.message.includes('NATIVE_IDENTIFICATION_SCOPE_CHANGED'))return fail(403,'NATIVE_IDENTIFICATION_SCOPE_CHANGED');
    throw error;
  }
  const items=results.slice(prepared.length).map((result,index)=>{
    const stored=result.results[0];
    if(!stored||stored.instance_id!==prepared[index].instanceId)return fail(500,'NATIVE_IDENTIFICATION_ACK_UNAVAILABLE');
    return {instanceId:stored.instance_id,revision:stored.revision,payloadHash:stored.payload_hash};
  });
  return parseNativeApplicationIdentificationReceipt({...value,items},{...value,items:prepared.map(item=>({
    instanceId:item.instanceId,revision:item.revision,payloadHash:item.hash}))});
}
export interface NativeIdentificationRead {
  state:'available'|'missing'|'invalidated'|'multiple-sources'|'unavailable';
  sources:Array<{sourceKey:string;revision:number;observedAtMs:number;receivedAtMs:number;identifications:NativeApplicationIdentification[]|null}>;
}
/** 最近成功的本机登记，只命名，不推断产品或当前在线状态。 */
export async function readNativeApplicationIdentifications(db:D1Database,account:string,child:string,
  references:readonly {machineId:string;instanceId:string}[]):Promise<Map<string,NativeIdentificationRead>> {
  const result=new Map<string,NativeIdentificationRead>();
  const key=(r:{machineId:string;instanceId:string})=>`${r.machineId}:${r.instanceId}`;
  if(references.length>100)return fail(400,'NATIVE_IDENTIFICATION_READ_LIMIT');
  for(const ref of references)result.set(key(ref),{state:'missing',sources:[]});
  if(!references.length)return result;
  if(!await nativeApplicationIdentificationStorageReady(db)) {
    for(const ref of references)result.set(key(ref),{state:'unavailable',sources:[]});return result;
  }
  type Row={instance_id:string;machine_id:string;local_user_id:string;assignment_version:number;revision:number;payload_json:string;received_at_ms:number};
  // 一次有界查询，不为每次刷新遍历历史观察或重做识别。
  const rows=await db.prepare(`SELECT n.* FROM runtime_native_application_identifications_v1 n
    JOIN runtime_machines_v2 m ON m.id=n.machine_id
    JOIN runtime_user_assignments_v2 a ON a.machine_id=n.machine_id AND a.local_user_id=n.local_user_id
      AND a.assignment_version=n.assignment_version AND a.child_id=n.child_id
    WHERE m.account_id=?1 AND m.revoked_at_ms IS NULL AND n.child_id=?2 AND a.protected=1
      AND a.assignment_version=(SELECT MAX(assignment_version) FROM runtime_user_assignments_v2
        WHERE machine_id=n.machine_id AND local_user_id=n.local_user_id)
      AND EXISTS(SELECT 1 FROM json_each(?3) r WHERE json_extract(r.value,'$.machineId')=n.machine_id
        AND json_extract(r.value,'$.instanceId')=n.instance_id)
    ORDER BY n.machine_id,n.instance_id,n.local_user_id LIMIT 801`)
    .bind(account,child,JSON.stringify(references)).all<Row>();
  if(rows.results.length>800)return fail(503,'NATIVE_IDENTIFICATION_READ_LIMIT');
  for(const row of rows.results) {
    const id=key({machineId:row.machine_id,instanceId:row.instance_id}),entry=result.get(id)!;
    if(entry.state==='unavailable')continue;
    if(entry.sources.length>=8){entry.state='unavailable';entry.sources=[];continue;}
    const payload=parseNativeApplicationIdentificationBatch({schemaVersion:1,childId:child,localUserId:row.local_user_id,
      assignmentVersion:row.assignment_version,items:[JSON.parse(row.payload_json)]}).items[0];
    if(payload.instanceId!==row.instance_id||payload.revision!==row.revision)return fail(503,'NATIVE_IDENTIFICATION_STORED_INVALID');
    const sourceKey=await hashUsageAccountValue([row.machine_id,row.local_user_id,child,row.assignment_version]);
    entry.sources.push({sourceKey,revision:row.revision,observedAtMs:payload.observedAtMs,
      receivedAtMs:row.received_at_ms,identifications:payload.identifications});
    entry.state=entry.sources.length>1?'multiple-sources':payload.identifications===null?'invalidated':'available';
  }
  return result;
}

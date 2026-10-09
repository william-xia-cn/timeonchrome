import {parseProgramInstallationLinkBatch} from '@timeonchrome/app-runtime-contracts/classification';
import type {MachineSelfResponse} from './contracts';
import {HttpError} from './http';
import {isRecord} from './validation';

const fail=(status:number,code:string):never=>{throw new HttpError(status,code,code);};

export async function programInstallationStorageReady(db:D1Database):Promise<boolean> {
  const storage=await db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE
    (type='table' AND name='runtime_program_installation_links_v1') OR
    (type='trigger' AND name IN ('runtime_program_installation_scope_v1','runtime_program_installation_immutable_v1'))`)
    .first<{n:number}>();
  return storage?.n===3;
}

/** 引用与基础登记独立可重试；不接受产品归属，不读取或改写用量。 */
export async function receiveProgramInstallationLinks(db:D1Database,machine:MachineSelfResponse,input:unknown) {
  if(!isRecord(input)||typeof input.localUserId!=='string'||typeof input.scanId!=='string'
    ||!Number.isSafeInteger(input.assignmentVersion)||Number(input.assignmentVersion)<1)
    return fail(400,'INVALID_PROGRAM_INSTALLATION_LINKS');
  if(machine.revoked)return fail(403,'PROGRAM_INSTALLATION_ASSIGNMENT_MISMATCH');
  const assignment=await db.prepare(`SELECT a.child_id FROM runtime_user_assignments_v2 a
    JOIN runtime_machines_v2 m ON m.id=a.machine_id
    WHERE a.machine_id=?1 AND a.local_user_id=?2 AND a.assignment_version=?3
      AND a.protected=1 AND m.account_id=?4 AND m.revoked_at_ms IS NULL`)
    .bind(machine.machineId,input.localUserId,input.assignmentVersion,machine.accountId)
    .first<{child_id:string|null}>();
  if(!assignment?.child_id||input.childId!==assignment.child_id)
    return fail(403,'PROGRAM_INSTALLATION_ASSIGNMENT_MISMATCH');
  const batch=(()=>{try{return parseProgramInstallationLinkBatch(input,{
    machineId:machine.machineId,childId:assignment.child_id,localUserId:input.localUserId,
    assignmentVersion:Number(input.assignmentVersion),scanId:input.scanId,
  });}catch{return fail(400,'INVALID_PROGRAM_INSTALLATION_LINKS');}})();
  if(!await programInstallationStorageReady(db))return fail(503,'PROGRAM_INSTALLATION_STORAGE_UNAVAILABLE');
  try {
    await db.batch(batch.links.map(link=>db.prepare(`INSERT INTO runtime_program_installation_links_v1
      (machine_id,scan_id,child_id,local_user_id,assignment_version,variant_key,instance_id)
      VALUES(?1,?2,?3,?4,?5,?6,?7)
      ON CONFLICT(machine_id,scan_id,variant_key,instance_id) DO NOTHING`)
      .bind(machine.machineId,batch.scanId,batch.childId,batch.localUserId,batch.assignmentVersion,link.variantKey,link.instanceId)));
  } catch(error) {
    if(error instanceof Error) {
      if(error.message.includes('PROGRAM_INSTALLATION_SCOPE_CONFLICT'))return fail(409,'PROGRAM_INSTALLATION_SCOPE_CONFLICT');
      if(error.message.includes('PROGRAM_INSTALLATION_DEPENDENCIES_PENDING'))return fail(409,'PROGRAM_INSTALLATION_DEPENDENCIES_PENDING');
    }
    throw error;
  }
  // 只有完整事务成功才确认该批；失败不返回已接收或修改其他模块状态。
  return batch;
}

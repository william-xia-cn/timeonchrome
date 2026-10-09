import {parseProgramInstancePolicyStatusReport} from '@timeonchrome/app-runtime-contracts';
import type {MachineSelfResponse} from './contracts';
import {HttpError} from './http';

export async function programPolicyStatusReady(db:D1Database):Promise<boolean> {
  return Boolean(await db.prepare("SELECT 1 AS ready FROM sqlite_master WHERE type='table' AND name='runtime_program_policy_status_v1'").first());
}

export async function receiveProgramPolicyStatus(db:D1Database,machine:MachineSelfResponse,input:unknown,nowMs:number) {
  const report=(()=>{try{return parseProgramInstancePolicyStatusReport(input);}
    catch{throw new HttpError(400,'INVALID_PROGRAM_INSTANCE_POLICY_STATUS','Invalid adoption report.');}})();
  if(!await programPolicyStatusReady(db))throw new HttpError(503,'PROGRAM_POLICY_STATUS_UNAVAILABLE','Adoption storage unavailable.');
  // Validation and write share one SQL statement: a concurrent reassignment cannot admit a stale scope.
  const result=await db.prepare(`INSERT INTO runtime_program_policy_status_v1(machine_id,payload_json,received_at_ms)
    SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM runtime_machines_v2 WHERE id=?1 AND account_id=?4 AND revoked_at_ms IS NULL)
    AND NOT EXISTS(SELECT 1 FROM json_each(?2,'$.users') item WHERE NOT EXISTS(
      SELECT 1 FROM runtime_user_assignments_v2 a WHERE a.machine_id=?1
      AND a.local_user_id=json_extract(item.value,'$.localUserId')
      AND a.assignment_version=json_extract(item.value,'$.assignmentVersion') AND a.protected=1 AND a.child_id IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM runtime_user_assignments_v2 n WHERE n.machine_id=a.machine_id
        AND n.local_user_id=a.local_user_id AND n.assignment_version>a.assignment_version)))
    ON CONFLICT(machine_id) DO UPDATE SET payload_json=excluded.payload_json,received_at_ms=excluded.received_at_ms
    WHERE excluded.received_at_ms>=runtime_program_policy_status_v1.received_at_ms`)
    .bind(machine.machineId,JSON.stringify(report),nowMs,machine.accountId).run();
  if(!result.meta.changes)throw new HttpError(409,'PROGRAM_POLICY_STATUS_SCOPE_CHANGED','Assignment or report scope changed.');
}

export async function readProgramPolicyStatus(db:D1Database,accountId:string,machineId:string,nowMs:number) {
  if(!await programPolicyStatusReady(db))return [];
  const row=await db.prepare(`SELECT s.payload_json,s.received_at_ms,m.last_seen_at_ms,m.revoked_at_ms,
    (SELECT json_extract(payload_json,'$.schemaVersion') FROM runtime_application_knowledge_versions_v1 WHERE account_id=?2 ORDER BY version DESC LIMIT 1) AS catalog_schema,
    (SELECT MAX(version) FROM runtime_application_knowledge_versions_v1 WHERE account_id=?2) AS catalog_version
    FROM runtime_program_policy_status_v1 s JOIN runtime_machines_v2 m ON m.id=s.machine_id
    WHERE s.machine_id=?1 AND m.account_id=?2`).bind(machineId,accountId)
    .first<{payload_json:string;received_at_ms:number;last_seen_at_ms:number;revoked_at_ms:number|null;catalog_version:number|null;catalog_schema:number|null}>();
  if(!row)return [];
  const report=parseProgramInstancePolicyStatusReport(JSON.parse(row.payload_json));
  const assignments=await db.prepare(`SELECT a.local_user_id,a.assignment_version,a.protected,a.child_id
    FROM runtime_user_assignments_v2 a WHERE a.machine_id=?1 AND NOT EXISTS(
      SELECT 1 FROM runtime_user_assignments_v2 n WHERE n.machine_id=a.machine_id
      AND n.local_user_id=a.local_user_id AND n.assignment_version>a.assignment_version)`)
    .bind(machineId).all<{local_user_id:string;assignment_version:number;protected:number;child_id:string|null}>();
  return report.users.map(user=>{
    const assignment=assignments.results.find(a=>a.local_user_id===user.localUserId);
    const scope=assignment?.protected===1&&assignment.child_id!==null&&assignment.assignment_version===user.assignmentVersion;
    const fresh=row.revoked_at_ms===null&&nowMs>=row.received_at_ms&&nowMs-row.received_at_ms<=600_000
      &&nowMs-row.last_seen_at_ms<=600_000;
    return {...user,receivedAtMs:row.received_at_ms,currentState:!scope||!fresh?'unknown':
      user.state==='accepted'&&(user.catalogVersion!==row.catalog_version||row.catalog_schema!==4)?'pending':user.state};
  });
}

import type { AccountModuleClaims } from './contracts';
import { sha256Hex } from './crypto';
import { HttpError } from './http';
import { isRecord } from './validation';

interface Registration {
  localUserId: string;
  displayName: string;
  childId: string;
}

export function parseMachineUserRegistration(value: unknown): Registration {
  if (!isRecord(value) || Object.keys(value).some(key => !['localUserId', 'displayName', 'childId'].includes(key))
    // Service derives 32 HMAC bytes encoded without Base64 padding. Never accept an OS SID or a name.
    || typeof value.localUserId !== 'string' || !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u.test(value.localUserId)
    || typeof value.displayName !== 'string' || !value.displayName.trim() || value.displayName.length > 128
    || /[\u0000-\u001f\u007f]/u.test(value.displayName)
    || typeof value.childId !== 'string' || !value.childId.trim() || value.childId.length > 128) {
    throw new HttpError(400, 'INVALID_REQUEST', '预登记需要真实本机用户标识、显示名称和指定孩子。');
  }
  return { localUserId: value.localUserId, displayName: value.displayName, childId: value.childId };
}

export async function registerMachineUser(
  database: D1Database, claims: AccountModuleClaims, machineId: string, input: Registration, nowMs: number,
): Promise<{ localUserId: string; childId: string; assignmentVersion: number; policyVersion: number; replayed: boolean }> {
  const machineQuery = () => database.prepare(`
    SELECT desired_policy_version, default_child_id FROM runtime_machines_v2
    WHERE id=?1 AND account_id=?2 AND revoked_at_ms IS NULL AND platform='windows'
  `).bind(machineId, claims.account_id).first<{ desired_policy_version: number; default_child_id: string | null }>();
  const machine = await machineQuery();
  if (!machine || !claims.children.some(child => child.id === input.childId)) {
    throw new HttpError(404, 'MACHINE_OR_CHILD_NOT_FOUND', '未找到可预登记的电脑或孩子。');
  }
  const existingQuery = () => database.prepare(`
    SELECT u.display_name, a.child_id, a.protected, a.assignment_source, a.assignment_version
    FROM runtime_machine_users_v2 u LEFT JOIN runtime_user_assignments_v2 a
      ON a.machine_id=u.machine_id AND a.local_user_id=u.local_user_id
      AND a.assignment_version=(SELECT MAX(x.assignment_version) FROM runtime_user_assignments_v2 x
        WHERE x.machine_id=u.machine_id AND x.local_user_id=u.local_user_id)
    WHERE u.machine_id=?1 AND u.local_user_id=?2
  `).bind(machineId, input.localUserId).first<{
    display_name: string; child_id: string | null; protected: number | null;
    assignment_source: string | null; assignment_version: number | null;
  }>();
  const replay = (row: NonNullable<Awaited<ReturnType<typeof existingQuery>>>, policyVersion: number) => {
    if (row.display_name !== input.displayName || row.child_id !== input.childId
      || row.protected !== 1 || row.assignment_source !== 'override' || row.assignment_version === null) {
      throw new HttpError(409, 'MACHINE_USER_ALREADY_REGISTERED', '账户已有不同登记或分配；预登记不会覆盖。');
    }
    return { localUserId: input.localUserId, childId: input.childId,
      assignmentVersion: Number(row.assignment_version), policyVersion, replayed: true };
  };
  const existing = await existingQuery();
  if (existing) return replay(existing, Number(machine.desired_policy_version));
  const previousVersion = Number(machine.desired_policy_version), version = previousVersion + 1;
  if (!Number.isSafeInteger(version)) throw new HttpError(409, 'MACHINE_POLICY_CHANGED', '电脑策略版本无效。');
  const hash = await sha256Hex(JSON.stringify({ machineId, version, defaultChildId: machine.default_child_id }));
  try {
    await database.batch([
      database.prepare(`
        INSERT INTO runtime_machine_users_v2(
          machine_id, local_user_id, display_name, first_seen_at_ms, last_seen_at_ms, session_active
        ) VALUES (?1, (
          SELECT CASE WHEN account_id=?2 AND revoked_at_ms IS NULL AND platform='windows'
            AND desired_policy_version=?3 THEN ?4 ELSE NULL END FROM runtime_machines_v2 WHERE id=?1
        ), ?5, ?6, ?6, 0)
      `).bind(machineId, claims.account_id, previousVersion, input.localUserId, input.displayName, nowMs),
      database.prepare(`
        INSERT INTO runtime_machine_policy_versions_v2(machine_id, version, payload_hash, created_at_ms)
        VALUES (?1, ?2, ?3, ?4)
      `).bind(machineId, version, hash, nowMs),
      database.prepare(`
        INSERT INTO runtime_user_assignments_v2(
          machine_id, local_user_id, assignment_version, child_id, protected,
          assignment_source, effective_at_ms, created_at_ms
        ) VALUES (?1, ?2, ?3, ?4, 1, 'override', ?5, ?5)
      `).bind(machineId, input.localUserId, version, input.childId, nowMs),
      database.prepare(`
        UPDATE runtime_machines_v2 SET desired_policy_version=?2, policy_state='pending',
          policy_error=NULL, updated_at_ms=?3 WHERE id=?1
      `).bind(machineId, version, nowMs),
    ]);
  } catch (error) {
    // The NOT NULL guard and existing unique keys abort the entire batch on a race.
    // Re-read only to classify a conflict/idempotent replay; never retry a write or overwrite.
    const current = await machineQuery();
    if (!current) throw new HttpError(409, 'MACHINE_POLICY_CHANGED', '电脑状态已变化，请重新核对。');
    const concurrent = await existingQuery();
    if (concurrent) return replay(concurrent, Number(current.desired_policy_version));
    if (Number(current.desired_policy_version) !== previousVersion) {
      throw new HttpError(409, 'MACHINE_POLICY_CHANGED', '电脑策略已变化，请重新核对。');
    }
    throw error;
  }
  return { localUserId: input.localUserId, childId: input.childId,
    assignmentVersion: version, policyVersion: version, replayed: false };
}

import { accountingMediaId, accountingUsageId, segmentContentHash } from './canonical';
import type {
  AccountingMediaEnvelope,
  AccountingReadModelResponse,
  AccountingUsageEnvelope,
  AccountModuleClaims,
  MachineSegmentEnvelope,
  MachineSelfResponse,
  RuntimePlatform,
  UploadAcceptance,
} from './contracts';
import { randomToken, sha256Hex } from './crypto';
import { getAppPolicy, resolveClassification } from './appPolicy';

type PolicyState = MachineSelfResponse['policyState'];

interface MachineRow {
  id: string;
  account_id: string;
  platform: RuntimePlatform;
  display_name: string | null;
  default_child_id: string | null;
  desired_policy_version: number;
  applied_policy_version: number;
  policy_state: PolicyState;
  revoked_at_ms: number | null;
}

interface AssignmentRow {
  child_id: string | null;
  protected: number;
  assignment_source: 'default' | 'override' | 'unprotected';
}

function humanCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const raw = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function machineResponse(row: MachineRow): MachineSelfResponse {
  return {
    machineId: row.id,
    accountId: row.account_id,
    platform: row.platform,
    displayName: row.display_name,
    defaultChildId: row.default_child_id,
    desiredPolicyVersion: Number(row.desired_policy_version),
    appliedPolicyVersion: Number(row.applied_policy_version),
    policyState: row.policy_state,
    revoked: row.revoked_at_ms != null,
  };
}

async function policyHash(machineId: string, version: number, defaultChildId: string | null): Promise<string> {
  return sha256Hex(JSON.stringify({ machineId, version, defaultChildId }));
}

export async function createMachinePairingCode(
  database: D1Database,
  claims: AccountModuleClaims,
  defaultChildId: string,
  displayName: string | null,
  nowMs: number,
): Promise<{ code: string; expiresAtMs: number }> {
  if (!claims.children.some((child) => child.id === defaultChildId)) throw new Error('CHILD_NOT_FOUND');
  const code = humanCode();
  const expiresAtMs = nowMs + 600_000;
  await database.prepare(`
    INSERT INTO runtime_machine_pairing_codes_v2(
      code_hash, account_id, default_child_id, display_name, created_by_jti,
      expires_at_ms, consumed_at_ms, consumed_by_machine_id, created_at_ms
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, ?7)
  `).bind(await sha256Hex(code), claims.account_id, defaultChildId, displayName,
    claims.jti, expiresAtMs, nowMs).run();
  return { code, expiresAtMs };
}

export async function enrollMachine(
  database: D1Database,
  input: { code: string; platform: RuntimePlatform; displayName?: string | null },
  nowMs: number,
): Promise<{ machineId: string; machineToken: string; platform: RuntimePlatform } | null> {
  const codeHash = await sha256Hex(input.code);
  const pending = await database.prepare(`
    SELECT account_id, default_child_id, display_name
    FROM runtime_machine_pairing_codes_v2
    WHERE code_hash=?1 AND consumed_at_ms IS NULL AND expires_at_ms>=?2
  `).bind(codeHash, nowMs).first<{ account_id: string; default_child_id: string; display_name: string | null }>();
  if (!pending || input.platform !== 'windows') return null;
  const machineId = `rt_machine_${crypto.randomUUID()}`;
  const machineToken = randomToken('rt_machine_token_', 32);
  const tokenHash = await sha256Hex(machineToken);
  const hash = await policyHash(machineId, 1, pending.default_child_id);
  const results = await database.batch([
    database.prepare(`
      UPDATE runtime_machine_pairing_codes_v2
      SET consumed_at_ms=?1, consumed_by_machine_id=?2
      WHERE code_hash=?3 AND consumed_at_ms IS NULL AND expires_at_ms>=?1
    `).bind(nowMs, machineId, codeHash),
    database.prepare(`
      INSERT INTO runtime_machines_v2(
        id, account_id, platform, token_hash, display_name, default_child_id,
        desired_policy_version, applied_policy_version, policy_state,
        last_seen_at_ms, created_at_ms, updated_at_ms
      ) SELECT ?1, account_id, ?2, ?3, COALESCE(?4, display_name), default_child_id,
        1, 0, 'pending', ?5, ?5, ?5
      FROM runtime_machine_pairing_codes_v2
      WHERE code_hash=?6 AND consumed_by_machine_id=?1
    `).bind(machineId, input.platform, tokenHash, input.displayName ?? null, nowMs, codeHash),
    database.prepare(`
      INSERT INTO runtime_machine_policy_versions_v2(machine_id, version, payload_hash, created_at_ms)
      VALUES (?1, 1, ?2, ?3)
    `).bind(machineId, hash, nowMs),
  ]);
  if ((results[0]?.meta.changes ?? 0) !== 1 || (results[1]?.meta.changes ?? 0) !== 1) return null;
  return { machineId, machineToken, platform: input.platform };
}

export async function authenticateMachine(
  database: D1Database,
  token: string,
  nowMs: number,
): Promise<MachineSelfResponse | null> {
  const row = await database.prepare(`
    SELECT id, account_id, platform, display_name, default_child_id,
      desired_policy_version, applied_policy_version, policy_state, revoked_at_ms
    FROM runtime_machines_v2 WHERE token_hash=?1 AND revoked_at_ms IS NULL
  `).bind(await sha256Hex(token)).first<MachineRow>();
  if (!row) return null;
  await database.prepare('UPDATE runtime_machines_v2 SET last_seen_at_ms=?1, updated_at_ms=?1 WHERE id=?2')
    .bind(nowMs, row.id).run();
  return machineResponse(row);
}

export async function listAccountMachines(
  database: D1Database,
  accountId: string,
  nowMs: number,
): Promise<{ machines: unknown[] }> {
  const rows = await database.prepare(`
    SELECT id, display_name, platform, default_child_id, desired_policy_version,
      applied_policy_version, policy_state, policy_error, service_version, os_version,
      architecture, last_seen_at_ms, last_upload_at_ms, last_tamper_at_ms,
      tamper_count, revoked_at_ms, created_at_ms
    FROM runtime_machines_v2 WHERE account_id=?1 ORDER BY created_at_ms DESC
  `).bind(accountId).all<Record<string, unknown>>();
  return { machines: (rows.results || []).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    platform: row.platform,
    defaultChildId: row.default_child_id,
    desiredPolicyVersion: Number(row.desired_policy_version),
    appliedPolicyVersion: Number(row.applied_policy_version),
    policyState: row.policy_state,
    policyError: row.policy_error,
    serviceVersion: row.service_version,
    windowsVersion: row.os_version,
    architecture: row.architecture,
    lastSeenAtMs: Number(row.last_seen_at_ms),
    lastSyncAtMs: row.last_upload_at_ms,
    lastTamperAtMs: row.last_tamper_at_ms,
    tamperCount: Number(row.tamper_count),
    status: row.revoked_at_ms ? 'revoked' : nowMs - Number(row.last_seen_at_ms) <= 600_000 ? 'online'
      : nowMs - Number(row.last_seen_at_ms) <= 86_400_000 ? 'recentlyOnline' : 'offline',
    createdAtMs: Number(row.created_at_ms),
  })) };
}

async function ownsMachine(database: D1Database, accountId: string, machineId: string): Promise<boolean> {
  return Boolean(await database.prepare('SELECT 1 AS ok FROM runtime_machines_v2 WHERE id=?1 AND account_id=?2')
    .bind(machineId, accountId).first());
}

export async function listMachineUsers(
  database: D1Database,
  accountId: string,
  machineId: string,
): Promise<{ users: unknown[] } | null> {
  if (!await ownsMachine(database, accountId, machineId)) return null;
  const rows = await database.prepare(`
    SELECT u.local_user_id, u.display_name, u.first_seen_at_ms, u.last_seen_at_ms,
      u.session_active, u.applied_policy_version, u.policy_state, u.policy_error,
      u.tamper_count, u.last_tamper_at_ms,
      a.assignment_version, a.child_id, a.protected, a.assignment_source
    FROM runtime_machine_users_v2 u
    LEFT JOIN runtime_user_assignments_v2 a
      ON a.machine_id=u.machine_id AND a.local_user_id=u.local_user_id
      AND a.assignment_version=(SELECT MAX(x.assignment_version) FROM runtime_user_assignments_v2 x
        WHERE x.machine_id=u.machine_id AND x.local_user_id=u.local_user_id)
    WHERE u.machine_id=?1 ORDER BY u.first_seen_at_ms ASC
  `).bind(machineId).all<Record<string, unknown>>();
  return { users: (rows.results || []).map((row) => ({
    localUserId: row.local_user_id,
    displayName: row.display_name,
    firstSeenAtMs: Number(row.first_seen_at_ms),
    lastSeenAtMs: Number(row.last_seen_at_ms),
    sessionActive: Boolean(row.session_active),
    assignmentVersion: Number(row.assignment_version),
    childId: row.child_id,
    protected: Boolean(row.protected),
    assignmentSource: row.assignment_source,
    appliedPolicyVersion: Number(row.applied_policy_version),
    policyState: row.policy_state,
    policyError: row.policy_error,
    tamperCount: Number(row.tamper_count),
    lastTamperAtMs: row.last_tamper_at_ms,
  })) };
}

async function bumpPolicy(
  database: D1Database,
  machineId: string,
  defaultChildId: string | null,
  nowMs: number,
): Promise<number> {
  const row = await database.prepare(`
    UPDATE runtime_machines_v2 SET desired_policy_version=desired_policy_version+1,
      policy_state='pending', policy_error=NULL, updated_at_ms=?2 WHERE id=?1
    RETURNING desired_policy_version
  `).bind(machineId, nowMs).first<{ desired_policy_version: number }>();
  if (!row) throw new Error('MACHINE_NOT_FOUND');
  const version = Number(row.desired_policy_version);
  await database.prepare(`
    INSERT INTO runtime_machine_policy_versions_v2(machine_id, version, payload_hash, created_at_ms)
    VALUES (?1, ?2, ?3, ?4)
  `).bind(machineId, version, await policyHash(machineId, version, defaultChildId), nowMs).run();
  return version;
}

export async function updateDefaultAssignment(
  database: D1Database,
  claims: AccountModuleClaims,
  machineId: string,
  childId: string,
  nowMs: number,
): Promise<{ policyVersion: number } | null> {
  if (!claims.children.some((child) => child.id === childId) || !await ownsMachine(database, claims.account_id, machineId)) return null;
  const machine = await database.prepare('SELECT default_child_id FROM runtime_machines_v2 WHERE id=?1')
    .bind(machineId).first<{ default_child_id: string | null }>();
  const version = await bumpPolicy(database, machineId, childId, nowMs);
  const inherited = await database.prepare(`
    SELECT u.local_user_id FROM runtime_machine_users_v2 u
    JOIN runtime_user_assignments_v2 a ON a.machine_id=u.machine_id AND a.local_user_id=u.local_user_id
      AND a.assignment_version=(SELECT MAX(x.assignment_version) FROM runtime_user_assignments_v2 x
        WHERE x.machine_id=u.machine_id AND x.local_user_id=u.local_user_id)
    WHERE u.machine_id=?1 AND a.assignment_source='default'
  `).bind(machineId).all<{ local_user_id: string }>();
  const statements: D1PreparedStatement[] = [database.prepare(
    'UPDATE runtime_machines_v2 SET default_child_id=?1 WHERE id=?2',
  ).bind(childId, machineId)];
  for (const user of inherited.results || []) statements.push(database.prepare(`
    INSERT INTO runtime_user_assignments_v2(
      machine_id, local_user_id, assignment_version, child_id, protected,
      assignment_source, effective_at_ms, created_at_ms
    ) VALUES (?1, ?2, ?3, ?4, 1, 'default', ?5, ?5)
  `).bind(machineId, user.local_user_id, version, childId, nowMs));
  await database.batch(statements);
  return { policyVersion: version };
}

export async function updateUserAssignment(
  database: D1Database,
  claims: AccountModuleClaims,
  machineId: string,
  localUserId: string,
  input: { protected: boolean; childId: string | null },
  nowMs: number,
): Promise<{ policyVersion: number } | null> {
  if (!await ownsMachine(database, claims.account_id, machineId)) return null;
  if (input.protected && (!input.childId || !claims.children.some((child) => child.id === input.childId))) return null;
  if (!await database.prepare('SELECT 1 AS ok FROM runtime_machine_users_v2 WHERE machine_id=?1 AND local_user_id=?2')
    .bind(machineId, localUserId).first()) return null;
  const machine = await database.prepare('SELECT default_child_id FROM runtime_machines_v2 WHERE id=?1')
    .bind(machineId).first<{ default_child_id: string | null }>();
  const version = await bumpPolicy(database, machineId, machine?.default_child_id ?? null, nowMs);
  await database.prepare(`
    INSERT INTO runtime_user_assignments_v2(
      machine_id, local_user_id, assignment_version, child_id, protected,
      assignment_source, effective_at_ms, created_at_ms
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
  `).bind(machineId, localUserId, version, input.protected ? input.childId : null,
    input.protected ? 1 : 0, input.protected ? 'override' : 'unprotected', nowMs).run();
  return { policyVersion: version };
}

export async function revokeMachine(
  database: D1Database, accountId: string, machineId: string, nowMs: number,
): Promise<boolean> {
  const result = await database.prepare(
    'UPDATE runtime_machines_v2 SET revoked_at_ms=?1, updated_at_ms=?1 WHERE id=?2 AND account_id=?3',
  ).bind(nowMs, machineId, accountId).run();
  return (result.meta.changes ?? 0) === 1;
}

export async function createUninstallCode(
  database: D1Database,
  claims: AccountModuleClaims,
  machineId: string,
  nowMs: number,
): Promise<{ code: string; expiresAtMs: number } | null> {
  if (!await ownsMachine(database, claims.account_id, machineId)) return null;
  const code = humanCode();
  const expiresAtMs = nowMs + 600_000;
  await database.prepare(`
    INSERT INTO runtime_uninstall_codes_v2(
      code_hash, machine_id, account_id, created_by_jti, expires_at_ms, consumed_at_ms, created_at_ms
    ) VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6)
  `).bind(await sha256Hex(code), machineId, claims.account_id, claims.jti, expiresAtMs, nowMs).run();
  return { code, expiresAtMs };
}

export async function syncMachineUsers(
  database: D1Database,
  machine: MachineSelfResponse,
  users: Array<{ localUserId: string; displayName: string; sessionActive: boolean }>,
  nowMs: number,
): Promise<number> {
  const assignmentState = await database.prepare(`
    SELECT u.local_user_id, u.applied_policy_version, a.assignment_version
    FROM runtime_machine_users_v2 u
    LEFT JOIN runtime_user_assignments_v2 a
      ON a.machine_id=u.machine_id AND a.local_user_id=u.local_user_id
      AND a.assignment_version=(SELECT MAX(x.assignment_version) FROM runtime_user_assignments_v2 x
        WHERE x.machine_id=u.machine_id AND x.local_user_id=u.local_user_id)
    WHERE u.machine_id=?1
  `).bind(machine.machineId).all<{
    local_user_id: string;
    applied_policy_version: number;
    assignment_version: number | null;
  }>();
  const assignmentByUser = new Map((assignmentState.results || []).map((row) => [row.local_user_id, row]));
  const usersWithoutAssignment = users.filter((user) => assignmentByUser.get(user.localUserId)?.assignment_version == null);
  const hasUnseenAssignment = machine.desiredPolicyVersion === machine.appliedPolicyVersion && users.some((user) => {
    const current = assignmentByUser.get(user.localUserId);
    return current?.assignment_version != null
      && Number(current.assignment_version) <= machine.appliedPolicyVersion
      && Number(current.applied_policy_version) < Number(current.assignment_version);
  });
  const policyVersion = usersWithoutAssignment.length || hasUnseenAssignment
    ? machine.desiredPolicyVersion + 1
    : machine.desiredPolicyVersion;
  const statements: D1PreparedStatement[] = [];
  if (policyVersion !== machine.desiredPolicyVersion) {
    statements.push(database.prepare(`
      UPDATE runtime_machines_v2 SET desired_policy_version=?1, policy_state='pending',
        policy_error=NULL, updated_at_ms=?2
      WHERE id=?3 AND desired_policy_version=?4
    `).bind(policyVersion, nowMs, machine.machineId, machine.desiredPolicyVersion));
    statements.push(database.prepare(`
      INSERT INTO runtime_machine_policy_versions_v2(machine_id, version, payload_hash, created_at_ms)
      VALUES (?1, ?2, ?3, ?4)
    `).bind(machine.machineId, policyVersion,
      await policyHash(machine.machineId, policyVersion, machine.defaultChildId), nowMs));
  }
  for (const user of users) {
    statements.push(database.prepare(`
      INSERT INTO runtime_machine_users_v2(
        machine_id, local_user_id, display_name, first_seen_at_ms, last_seen_at_ms, session_active
      ) VALUES (?1, ?2, ?3, ?4, ?4, ?5)
      ON CONFLICT(machine_id, local_user_id) DO UPDATE SET
        display_name=excluded.display_name, last_seen_at_ms=excluded.last_seen_at_ms,
        session_active=excluded.session_active
    `).bind(machine.machineId, user.localUserId, user.displayName, nowMs, user.sessionActive ? 1 : 0));
    statements.push(database.prepare(`
      INSERT INTO runtime_user_assignments_v2(
        machine_id, local_user_id, assignment_version, child_id, protected,
        assignment_source, effective_at_ms, created_at_ms
      ) SELECT ?1, ?2, ?3, default_child_id,
        CASE WHEN default_child_id IS NULL THEN 0 ELSE 1 END,
        CASE WHEN default_child_id IS NULL THEN 'unprotected' ELSE 'default' END, ?4, ?4
      FROM runtime_machines_v2 m WHERE m.id=?1
        AND NOT EXISTS(SELECT 1 FROM runtime_user_assignments_v2 a
          WHERE a.machine_id=?1 AND a.local_user_id=?2)
    `).bind(machine.machineId, user.localUserId, policyVersion, nowMs));
  }
  if (statements.length) await database.batch(statements);
  return policyVersion;
}

export async function getMachinePolicy(
  database: D1Database,
  machine: MachineSelfResponse,
): Promise<{ etag: string; policy: unknown }> {
  const users = await listMachineUsers(database, machine.accountId, machine.machineId);
  const policyUsers = (users?.users || []).map((value) => {
    const user = value as Record<string, unknown>;
    return {
      localUserId: user.localUserId,
      assignmentVersion: user.assignmentVersion,
      childId: user.childId,
      protected: user.protected,
    };
  });
  const childIds = new Set<string>();
  if (machine.defaultChildId) childIds.add(machine.defaultChildId);
  for (const user of policyUsers) {
    if (user.protected && typeof user.childId === 'string') childIds.add(user.childId);
  }
  const appPolicies = await Promise.all([...childIds].map(async (childId) => ({
    childId,
    policy: await getAppPolicy(database, machine.accountId, childId),
  })));
  const policy = {
    version: machine.desiredPolicyVersion,
    defaultChildId: machine.defaultChildId,
    users: policyUsers,
    appPolicies,
  };
  return { etag: `"policy-${machine.machineId}-${machine.desiredPolicyVersion}"`, policy };
}

export async function acknowledgePolicy(
  database: D1Database,
  machine: MachineSelfResponse,
  input: { version: number; state: PolicyState; error?: string | null; users?: Array<{ localUserId: string; state: PolicyState }> },
  nowMs: number,
): Promise<boolean> {
  if (input.version > machine.desiredPolicyVersion) return false;
  const statements: D1PreparedStatement[] = [database.prepare(`
    UPDATE runtime_machines_v2 SET applied_policy_version=?1, policy_state=?2,
      policy_error=?3, updated_at_ms=?4 WHERE id=?5
  `).bind(input.version, input.state, input.error ?? null, nowMs, machine.machineId)];
  for (const user of input.users || []) statements.push(database.prepare(`
    UPDATE runtime_machine_users_v2 SET applied_policy_version=?1, policy_state=?2,
      policy_error=NULL WHERE machine_id=?3 AND local_user_id=?4
  `).bind(input.version, user.state, machine.machineId, user.localUserId));
  await database.batch(statements);
  return true;
}

export async function recordMachineHeartbeat(
  database: D1Database,
  machine: MachineSelfResponse,
  input: { serviceVersion: string; windowsVersion: string; architecture: string; tamperCount: number; policyState: PolicyState },
  nowMs: number,
): Promise<void> {
  await database.prepare(`
    UPDATE runtime_machines_v2 SET service_version=?1, os_version=?2, architecture=?3,
      tamper_count=MAX(tamper_count, ?4),
      last_tamper_at_ms=CASE WHEN ?4>tamper_count THEN ?5 ELSE last_tamper_at_ms END,
      policy_state=?6, last_seen_at_ms=?5, updated_at_ms=?5 WHERE id=?7
  `).bind(input.serviceVersion, input.windowsVersion, input.architecture, input.tamperCount,
    nowMs, input.policyState, machine.machineId).run();
}

export async function persistMachineSegments(
  database: D1Database,
  machine: MachineSelfResponse,
  envelopes: MachineSegmentEnvelope[],
  nowMs: number,
): Promise<UploadAcceptance> {
  const acceptedIds: string[] = [];
  const rejected: Array<{ id: string; code: string }> = [];
  for (const envelope of envelopes) {
    const assignment = await database.prepare(`
      SELECT child_id, protected, assignment_source FROM runtime_user_assignments_v2
      WHERE machine_id=?1 AND local_user_id=?2 AND assignment_version=?3
    `).bind(machine.machineId, envelope.localUserId, envelope.assignmentVersion).first<AssignmentRow>();
    if (!assignment || !assignment.protected || !assignment.child_id) {
      rejected.push({ id: envelope.segment.id, code: 'ASSIGNMENT_NOT_PROTECTED' });
      continue;
    }
    const contentHash = await segmentContentHash(envelope.segment);
    const existing = await database.prepare(`
      SELECT content_hash FROM runtime_usage_segments_v2
      WHERE machine_id=?1 AND local_user_id=?2 AND id=?3
    `).bind(machine.machineId, envelope.localUserId, envelope.segment.id).first<{ content_hash: string }>();
    if (existing) {
      if (existing.content_hash === contentHash) acceptedIds.push(envelope.segment.id);
      else rejected.push({ id: envelope.segment.id, code: 'ID_CONFLICT' });
      continue;
    }
    const segment = envelope.segment;
    const statements: D1PreparedStatement[] = [database.prepare(`
      INSERT INTO runtime_usage_segments_v2(
        id, machine_id, local_user_id, assignment_version, child_id, runtime_session_id,
        platform, runtime_identity, display_name, start_at_ms, end_at_ms, duration_ms,
        end_reason, content_hash, uploaded_at_ms
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
    `).bind(segment.id, machine.machineId, envelope.localUserId, envelope.assignmentVersion,
      assignment.child_id, segment.runtimeSessionID, segment.application.platform,
      segment.application.runtimeIdentity, segment.application.displayName ?? null,
      segment.startAtMs, segment.endAtMs, segment.durationMilliseconds,
      segment.endReason, contentHash, nowMs)];
    let cursor = segment.startAtMs;
    while (cursor < segment.endAtMs) {
      const hourStart = Math.floor(cursor / 3_600_000) * 3_600_000;
      const sliceEnd = Math.min(segment.endAtMs, hourStart + 3_600_000);
      statements.push(database.prepare(`
        INSERT INTO runtime_app_hourly_stats_v2(
          child_id, machine_id, local_user_id, hour_start_ms, runtime_identity,
          display_name, duration_ms, updated_at_ms
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ON CONFLICT(child_id, machine_id, local_user_id, hour_start_ms, runtime_identity)
        DO UPDATE SET duration_ms=runtime_app_hourly_stats_v2.duration_ms+excluded.duration_ms,
          display_name=COALESCE(excluded.display_name, runtime_app_hourly_stats_v2.display_name),
          updated_at_ms=excluded.updated_at_ms
      `).bind(assignment.child_id, machine.machineId, envelope.localUserId, hourStart,
        segment.application.runtimeIdentity, segment.application.displayName ?? null,
        sliceEnd - cursor, nowMs));
      cursor = sliceEnd;
    }
    statements.push(database.prepare(
      'UPDATE runtime_machines_v2 SET last_upload_at_ms=?1, updated_at_ms=?1 WHERE id=?2',
    ).bind(nowMs, machine.machineId));
    try {
      await database.batch(statements);
      acceptedIds.push(segment.id);
    } catch {
      rejected.push({ id: segment.id, code: 'ID_CONFLICT' });
    }
  }
  return { acceptedIds, rejected };
}

export async function persistAccountingUsageSegments(
  database: D1Database,
  machine: MachineSelfResponse,
  envelopes: AccountingUsageEnvelope[],
  nowMs: number,
): Promise<UploadAcceptance> {
  const acceptedIds: string[] = [];
  const rejected: Array<{ id: string; code: string }> = [];
  for (const envelope of envelopes) {
    const assignment = await assignmentFor(database, machine.machineId, envelope.localUserId, envelope.assignmentVersion);
    if (!assignment?.protected || !assignment.child_id) {
      rejected.push({ id: envelope.segment.id, code: 'ASSIGNMENT_NOT_PROTECTED' });
      continue;
    }
    const segment = envelope.segment;
    if (await accountingUsageId(segment) !== segment.id) {
      rejected.push({ id: segment.id, code: 'ID_MISMATCH' });
      continue;
    }
    const table = segment.diagnostic ? 'runtime_usage_diagnostic_segments_v2' : 'runtime_usage_segments_v2';
    const existing = await database.prepare(`
      SELECT content_hash FROM ${table}
      WHERE machine_id=?1 AND local_user_id=?2 AND id=?3
    `).bind(machine.machineId, envelope.localUserId, segment.id).first<{ content_hash: string }>();
    if (existing) {
      if (existing.content_hash === segment.id) acceptedIds.push(segment.id);
      else rejected.push({ id: segment.id, code: 'ID_CONFLICT' });
      continue;
    }
    const statements: D1PreparedStatement[] = [];
    if (segment.diagnostic) {
      statements.push(database.prepare(`
        INSERT INTO runtime_usage_diagnostic_segments_v2(
          id,machine_id,local_user_id,assignment_version,child_id,runtime_session_id,
          platform,runtime_identity,clock_epoch_id,wall_time_ms,monotonic_time_ms,
          diagnostic_code,content_hash,uploaded_at_ms
        ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
      `).bind(
        segment.id, machine.machineId, envelope.localUserId, envelope.assignmentVersion,
        assignment.child_id, segment.runtimeSessionID, machine.platform,
        segment.application?.runtimeIdentity ?? null, segment.clockEpochId,
        segment.startWallTimeMs, segment.startMonotonicTimeMs,
        segment.diagnosticCode, segment.id, nowMs,
      ));
    } else {
      const application = segment.application!;
      let resolved;
      try {
        resolved = await resolveClassification(
          database,
          machine.accountId,
          assignment.child_id,
          application.platform,
          application.runtimeIdentity,
          segment.policySnapshot?.appPolicyVersion ?? null,
        );
      } catch (error) {
        if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
          rejected.push({ id: segment.id, code: error.code });
          continue;
        }
        throw error;
      }
      statements.push(database.prepare(`
        INSERT INTO runtime_usage_segments_v2(
          id,machine_id,local_user_id,assignment_version,child_id,runtime_session_id,
          platform,runtime_identity,display_name,start_at_ms,end_at_ms,duration_ms,
          end_reason,content_hash,uploaded_at_ms,accounting_schema_version,channel,
          activity_basis,clock_epoch_id,start_wall_time_ms,end_wall_time_ms,
          start_monotonic_time_ms,end_monotonic_time_ms,monotonic_duration_ms,
          estimated,estimate_reason,estimate_cap_ms,last_evidence_wall_time_ms,
          last_evidence_monotonic_time_ms,diagnostic,diagnostic_code,policy_snapshot_json,
          app_policy_version,application_classification,quota_bucket
        ) VALUES(
          ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,2,?16,
          ?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,0,NULL,?29,?30,?31,?32
        )
      `).bind(
        segment.id, machine.machineId, envelope.localUserId, envelope.assignmentVersion,
        assignment.child_id, segment.runtimeSessionID, application.platform,
        application.runtimeIdentity, application.displayName ?? null,
        segment.startMonotonicTimeMs, segment.endMonotonicTimeMs,
        segment.monotonicDurationMilliseconds, segment.endReason, segment.id, nowMs,
        segment.channel, segment.activityBasis, segment.clockEpochId,
        segment.startWallTimeMs, segment.endWallTimeMs,
        segment.startMonotonicTimeMs, segment.endMonotonicTimeMs,
        segment.monotonicDurationMilliseconds, segment.estimated.isEstimated ? 1 : 0,
        segment.estimated.reason, segment.estimated.cappedAtMilliseconds,
        segment.lastEvidenceWallTimeMs, segment.lastEvidenceMonotonicTimeMs,
        JSON.stringify({
          assignmentVersion: envelope.assignmentVersion,
          appPolicyVersion: resolved.version,
          applicationClassification: resolved.classification,
          quotaBucket: resolved.quotaBucket,
        }),
        resolved.version, resolved.classification, resolved.quotaBucket,
      ));
    }
    statements.push(database.prepare(
      'UPDATE runtime_machines_v2 SET last_upload_at_ms=?1,updated_at_ms=?1 WHERE id=?2',
    ).bind(nowMs, machine.machineId));
    try {
      await database.batch(statements);
      acceptedIds.push(segment.id);
    } catch {
      rejected.push({ id: segment.id, code: 'ID_CONFLICT' });
    }
  }
  return { acceptedIds, rejected };
}

export async function persistAccountingMediaSegments(
  database: D1Database,
  machine: MachineSelfResponse,
  envelopes: AccountingMediaEnvelope[],
  nowMs: number,
): Promise<UploadAcceptance> {
  const acceptedIds: string[] = [];
  const rejected: Array<{ id: string; code: string }> = [];
  for (const envelope of envelopes) {
    const assignment = await assignmentFor(database, machine.machineId, envelope.localUserId, envelope.assignmentVersion);
    if (!assignment?.protected || !assignment.child_id) {
      rejected.push({ id: envelope.segment.id, code: 'ASSIGNMENT_NOT_PROTECTED' });
      continue;
    }
    const segment = envelope.segment;
    if (await accountingMediaId(segment) !== segment.id) {
      rejected.push({ id: segment.id, code: 'ID_MISMATCH' });
      continue;
    }
    const existing = await database.prepare(`
      SELECT content_hash FROM runtime_media_segments_v2
      WHERE machine_id=?1 AND local_user_id=?2 AND id=?3
    `).bind(machine.machineId, envelope.localUserId, segment.id).first<{ content_hash: string }>();
    if (existing) {
      if (existing.content_hash === segment.id) acceptedIds.push(segment.id);
      else rejected.push({ id: segment.id, code: 'ID_CONFLICT' });
      continue;
    }
    try {
      await database.batch([
        database.prepare(`
          INSERT INTO runtime_media_segments_v2(
            id,machine_id,local_user_id,assignment_version,child_id,runtime_session_id,
            platform,runtime_identity,display_name,media_kind,presentation,clock_epoch_id,
            start_wall_time_ms,end_wall_time_ms,start_monotonic_time_ms,end_monotonic_time_ms,
            monotonic_duration_ms,end_reason,estimated,estimate_reason,estimate_cap_ms,
            last_evidence_wall_time_ms,last_evidence_monotonic_time_ms,
            authoritative_for_usage,content_hash,uploaded_at_ms
          ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,
            ?17,?18,?19,?20,?21,?22,?23,0,?24,?25)
        `).bind(
          segment.id, machine.machineId, envelope.localUserId, envelope.assignmentVersion,
          assignment.child_id, segment.runtimeSessionID, segment.application.platform,
          segment.application.runtimeIdentity, segment.application.displayName ?? null,
          segment.mediaKind, segment.presentation, segment.clockEpochId,
          segment.startWallTimeMs, segment.endWallTimeMs,
          segment.startMonotonicTimeMs, segment.endMonotonicTimeMs,
          segment.monotonicDurationMilliseconds, segment.endReason,
          segment.estimated.isEstimated ? 1 : 0, segment.estimated.reason,
          segment.estimated.cappedAtMilliseconds, segment.lastEvidenceWallTimeMs,
          segment.lastEvidenceMonotonicTimeMs, segment.id, nowMs,
        ),
        database.prepare(
          'UPDATE runtime_machines_v2 SET last_upload_at_ms=?1,updated_at_ms=?1 WHERE id=?2',
        ).bind(nowMs, machine.machineId),
      ]);
      acceptedIds.push(segment.id);
    } catch {
      rejected.push({ id: segment.id, code: 'ID_CONFLICT' });
    }
  }
  return { acceptedIds, rejected };
}

export async function queryAccounting(
  database: D1Database,
  accountId: string,
  childId: string,
  fromMs: number,
  toMs: number,
  machineId?: string,
  localUserId?: string,
): Promise<AccountingReadModelResponse> {
  const values: unknown[] = [accountId, childId, fromMs, toMs];
  let filter = '';
  if (machineId) { values.push(machineId); filter += ` AND s.machine_id=?${values.length}`; }
  if (localUserId) { values.push(localUserId); filter += ` AND s.local_user_id=?${values.length}`; }
  const usage = await database.prepare(`
    SELECT s.machine_id,s.local_user_id,s.runtime_session_id,s.clock_epoch_id,
      s.runtime_identity,s.display_name,s.channel,s.start_wall_time_ms,s.end_wall_time_ms,
      s.estimated,s.monotonic_duration_ms
    FROM runtime_usage_segments_v2 s JOIN runtime_machines_v2 m ON m.id=s.machine_id
    WHERE m.account_id=?1 AND s.child_id=?2 AND s.accounting_schema_version=2
      AND s.start_wall_time_ms<?4 AND s.end_wall_time_ms>?3${filter}
    ORDER BY s.start_wall_time_ms,s.end_wall_time_ms,s.id
  `).bind(...values).all<{
    machine_id: string; local_user_id: string; runtime_session_id: string; clock_epoch_id: string;
    runtime_identity: string; display_name: string | null; channel: 'active' | 'pipActive';
    start_wall_time_ms: number; end_wall_time_ms: number; estimated: number; monotonic_duration_ms: number;
  }>();
  const diagnostics = await database.prepare(`
    SELECT COUNT(*) AS count FROM runtime_usage_diagnostic_segments_v2 s
    JOIN runtime_machines_v2 m ON m.id=s.machine_id
    WHERE m.account_id=?1 AND s.child_id=?2 AND s.wall_time_ms>=?3 AND s.wall_time_ms<?4${filter}
  `).bind(...values).first<{ count: number }>();
  const media = await database.prepare(`
    SELECT s.runtime_identity,s.display_name,s.media_kind,s.start_wall_time_ms,s.end_wall_time_ms
    FROM runtime_media_segments_v2 s JOIN runtime_machines_v2 m ON m.id=s.machine_id
    WHERE m.account_id=?1 AND s.child_id=?2
      AND s.start_wall_time_ms<?4 AND s.end_wall_time_ms>?3${filter}
    ORDER BY s.start_wall_time_ms,s.end_wall_time_ms,s.id
  `).bind(...values).all<{
    runtime_identity: string; display_name: string | null; media_kind: 'audio' | 'video';
    start_wall_time_ms: number; end_wall_time_ms: number;
  }>();

  const mainIntervalGroups = new Map<string, Array<[number, number]>>();
  const bucketIntervalGroups = new Map<number, Map<string, Array<[number, number]>>>();
  const byApp = new Map<string, {
    runtimeIdentity: string; displayName: string | null; activeMs: number; pipActiveMs: number;
    intervalGroups: Map<string, Array<[number, number]>>;
  }>();
  let estimatedDuration = 0;
  let estimatedCount = 0;
  for (const row of usage.results || []) {
    const start = Math.max(fromMs, Number(row.start_wall_time_ms));
    const end = Math.min(toMs, Number(row.end_wall_time_ms));
    if (end <= start) continue;
    const duration = end - start;
    const group = `${row.machine_id}\n${row.local_user_id}\n${row.runtime_session_id}\n${row.clock_epoch_id}`;
    const mainIntervals = mainIntervalGroups.get(group) || [];
    mainIntervals.push([start, end]);
    mainIntervalGroups.set(group, mainIntervals);
    let cursor = start;
    while (cursor < end) {
      const hourStart = Math.floor(cursor / 3_600_000) * 3_600_000;
      const sliceEnd = Math.min(end, hourStart + 3_600_000);
      const bucketGroups = bucketIntervalGroups.get(hourStart) || new Map<string, Array<[number, number]>>();
      const bucketIntervals = bucketGroups.get(group) || [];
      bucketIntervals.push([cursor, sliceEnd]);
      bucketGroups.set(group, bucketIntervals);
      bucketIntervalGroups.set(hourStart, bucketGroups);
      cursor = sliceEnd;
    }
    const app = byApp.get(row.runtime_identity) || {
      runtimeIdentity: row.runtime_identity, displayName: row.display_name,
      activeMs: 0, pipActiveMs: 0, intervalGroups: new Map<string, Array<[number, number]>>(),
    };
    if (row.channel === 'active') app.activeMs += duration;
    else app.pipActiveMs += duration;
    const appIntervals = app.intervalGroups.get(group) || [];
    appIntervals.push([start, end]);
    app.intervalGroups.set(group, appIntervals);
    byApp.set(row.runtime_identity, app);
    if (row.estimated) { estimatedCount += 1; estimatedDuration += duration; }
  }

  const mediaByApp = new Map<string, {
    runtimeIdentity: string; displayName: string | null; audioMs: number; videoMs: number;
  }>();
  let mediaTotal = 0;
  for (const row of media.results || []) {
    const duration = Math.max(0, Math.min(toMs, Number(row.end_wall_time_ms))
      - Math.max(fromMs, Number(row.start_wall_time_ms)));
    mediaTotal += duration;
    const app = mediaByApp.get(row.runtime_identity) || {
      runtimeIdentity: row.runtime_identity, displayName: row.display_name, audioMs: 0, videoMs: 0,
    };
    if (row.media_kind === 'audio') app.audioMs += duration;
    else app.videoMs += duration;
    mediaByApp.set(row.runtime_identity, app);
  }
  const syncValues: unknown[] = [accountId];
  let syncFilter = '';
  if (machineId) { syncValues.push(machineId); syncFilter = ' AND id=?2'; }
  const sync = await database.prepare(`
    SELECT MAX(last_upload_at_ms) AS last_sync FROM runtime_machines_v2
    WHERE account_id=?1${syncFilter}
  `).bind(...syncValues).first<{ last_sync: number | null }>();
  return {
    mainUsageTotalMs: groupedIntervalUnion(mainIntervalGroups),
    buckets: [...bucketIntervalGroups.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([startAtMs, groups]) => ({ startAtMs, durationMs: groupedIntervalUnion(groups) })),
    applications: [...byApp.values()].map((app) => ({
      runtimeIdentity: app.runtimeIdentity,
      displayName: app.displayName,
      activeMs: app.activeMs,
      pipActiveMs: app.pipActiveMs,
      unionMs: groupedIntervalUnion(app.intervalGroups),
    })).sort((left, right) => right.unionMs - left.unionMs),
    estimated: { segmentCount: estimatedCount, durationMs: estimatedDuration },
    diagnostic: { segmentCount: Number(diagnostics?.count || 0) },
    mediaPlaybackTotalMs: mediaTotal,
    media: [...mediaByApp.values()].sort((left, right) =>
      (right.audioMs + right.videoMs) - (left.audioMs + left.videoMs)),
    lastSyncAtMs: sync?.last_sync ?? null,
  };
}

async function assignmentFor(
  database: D1Database,
  machineId: string,
  localUserId: string,
  assignmentVersion: number,
): Promise<AssignmentRow | null> {
  return database.prepare(`
    SELECT child_id,protected,assignment_source FROM runtime_user_assignments_v2
    WHERE machine_id=?1 AND local_user_id=?2 AND assignment_version=?3
  `).bind(machineId, localUserId, assignmentVersion).first<AssignmentRow>();
}

function intervalUnion(intervals: Array<[number, number]>): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  let total = 0;
  let start = sorted[0]![0];
  let end = sorted[0]![1];
  for (const interval of sorted.slice(1)) {
    if (interval[0] <= end) end = Math.max(end, interval[1]);
    else { total += end - start; [start, end] = interval; }
  }
  return total + end - start;
}

function groupedIntervalUnion(groups: Map<string, Array<[number, number]>>): number {
  let total = 0;
  for (const intervals of groups.values()) total += intervalUnion(intervals);
  return total;
}

export async function authorizeUninstall(
  database: D1Database,
  machine: MachineSelfResponse,
  code: string,
  nowMs: number,
): Promise<boolean> {
  const result = await database.prepare(`
    UPDATE runtime_uninstall_codes_v2 SET consumed_at_ms=?1
    WHERE code_hash=?2 AND machine_id=?3 AND account_id=?4
      AND consumed_at_ms IS NULL AND expires_at_ms>=?1
  `).bind(nowMs, await sha256Hex(code), machine.machineId, machine.accountId).run();
  if ((result.meta.changes ?? 0) !== 1) return false;
  await database.prepare('UPDATE runtime_machines_v2 SET revoked_at_ms=?1, updated_at_ms=?1 WHERE id=?2')
    .bind(nowMs, machine.machineId).run();
  return true;
}

export async function queryAccountUsage(
  database: D1Database,
  accountId: string,
  childId: string,
  fromMs: number,
  toMs: number,
  machineId?: string,
  localUserId?: string,
): Promise<unknown> {
  const owner = await database.prepare('SELECT 1 AS ok FROM runtime_machines_v2 WHERE account_id=?1 LIMIT 1')
    .bind(accountId).first();
  const legacyOwner = await database.prepare('SELECT 1 AS ok FROM runtime_children_v1 WHERE account_id=?1 AND child_id=?2')
    .bind(accountId, childId).first();
  if (!owner && !legacyOwner) return { totalDurationMs: 0, buckets: [], applications: [], lastSyncAtMs: null };
  const values: unknown[] = [childId, fromMs, toMs];
  let filter = '';
  if (machineId) { values.push(machineId); filter += ` AND machine_id=?${values.length}`; }
  if (localUserId) { values.push(localUserId); filter += ` AND local_user_id=?${values.length}`; }
  const v2 = await database.prepare(`
    SELECT hour_start_ms, runtime_identity, MAX(display_name) AS display_name, SUM(duration_ms) AS duration_ms
    FROM runtime_app_hourly_stats_v2 WHERE child_id=?1 AND hour_start_ms>=?2 AND hour_start_ms<?3${filter}
    GROUP BY hour_start_ms, runtime_identity
  `).bind(...values).all<{ hour_start_ms: number; runtime_identity: string; display_name: string | null; duration_ms: number }>();
  const legacy = (!machineId && !localUserId) ? await database.prepare(`
    SELECT hour_start_ms, runtime_identity, MAX(display_name) AS display_name, SUM(duration_ms) AS duration_ms
    FROM runtime_app_hourly_stats_v1 WHERE child_id=?1 AND hour_start_ms>=?2 AND hour_start_ms<?3
    GROUP BY hour_start_ms, runtime_identity
  `).bind(childId, fromMs, toMs).all<{ hour_start_ms: number; runtime_identity: string; display_name: string | null; duration_ms: number }>() : { results: [] };
  const rows = [...(legacy.results || []), ...(v2.results || [])];
  const buckets = new Map<number, number>();
  const apps = new Map<string, { runtimeIdentity: string; displayName: string | null; durationMs: number }>();
  for (const row of rows) {
    buckets.set(Number(row.hour_start_ms), (buckets.get(Number(row.hour_start_ms)) || 0) + Number(row.duration_ms));
    const app = apps.get(row.runtime_identity) || { runtimeIdentity: row.runtime_identity, displayName: row.display_name, durationMs: 0 };
    app.durationMs += Number(row.duration_ms); apps.set(row.runtime_identity, app);
  }
  const sync = await database.prepare(`SELECT MAX(last_upload_at_ms) AS last_sync FROM runtime_machines_v2
    WHERE account_id=?1${machineId ? ' AND id=?2' : ''}`)
    .bind(...(machineId ? [accountId, machineId] : [accountId])).first<{ last_sync: number | null }>();
  return {
    totalDurationMs: rows.reduce((sum, row) => sum + Number(row.duration_ms), 0),
    buckets: [...buckets].sort((a, b) => a[0] - b[0]).map(([startAtMs, durationMs]) => ({ startAtMs, durationMs })),
    applications: [...apps.values()].sort((a, b) => b.durationMs - a.durationMs),
    lastSyncAtMs: sync?.last_sync ?? null,
  };
}

export async function deleteRuntimeChildV2(database: D1Database, accountId: string, childId: string): Promise<void> {
  const machines = await database.prepare(`
    SELECT id, desired_policy_version, default_child_id FROM runtime_machines_v2 WHERE account_id=?1
  `).bind(accountId).all<{ id: string; desired_policy_version: number; default_child_id: string | null }>();
  const statements: D1PreparedStatement[] = [
    database.prepare('DELETE FROM runtime_app_classification_history_v1 WHERE account_id=?1 AND child_id=?2').bind(accountId, childId),
    database.prepare('DELETE FROM runtime_child_app_policy_versions_v1 WHERE account_id=?1 AND child_id=?2').bind(accountId, childId),
    database.prepare('DELETE FROM runtime_media_segments_v2 WHERE child_id=?1').bind(childId),
    database.prepare('DELETE FROM runtime_usage_diagnostic_segments_v2 WHERE child_id=?1').bind(childId),
    database.prepare('DELETE FROM runtime_app_hourly_stats_v2 WHERE child_id=?1').bind(childId),
    database.prepare('DELETE FROM runtime_usage_segments_v2 WHERE child_id=?1').bind(childId),
  ];
  const nowMs = Date.now();
  for (const machine of machines.results || []) {
    const affectedUsers = await database.prepare(`
      SELECT a.local_user_id FROM runtime_user_assignments_v2 a
      WHERE a.machine_id=?1 AND a.child_id=?2
        AND a.assignment_version=(SELECT MAX(x.assignment_version) FROM runtime_user_assignments_v2 x
          WHERE x.machine_id=a.machine_id AND x.local_user_id=a.local_user_id)
    `).bind(machine.id, childId).all<{ local_user_id: string }>();
    const clearDefault = machine.default_child_id === childId;
    if (!clearDefault && (affectedUsers.results || []).length === 0) continue;
    const version = Number(machine.desired_policy_version) + 1;
    const nextDefault = clearDefault ? null : machine.default_child_id;
    statements.push(database.prepare(`
      UPDATE runtime_machines_v2 SET default_child_id=?1, desired_policy_version=?2,
        policy_state='pending', policy_error=NULL, updated_at_ms=?3 WHERE id=?4
    `).bind(nextDefault, version, nowMs, machine.id));
    for (const user of affectedUsers.results || []) statements.push(database.prepare(`
      INSERT INTO runtime_user_assignments_v2(
        machine_id, local_user_id, assignment_version, child_id, protected,
        assignment_source, effective_at_ms, created_at_ms
      ) VALUES (?1, ?2, ?3, NULL, 0, 'unprotected', ?4, ?4)
    `).bind(machine.id, user.local_user_id, version, nowMs));
    statements.push(database.prepare(`
      INSERT INTO runtime_machine_policy_versions_v2(machine_id, version, payload_hash, created_at_ms)
      VALUES (?1, ?2, ?3, ?4)
    `).bind(machine.id, version, await policyHash(machine.id, version, nextDefault), nowMs));
  }
  await database.batch(statements);
}

import { segmentContentHash } from './canonical';
import type {
  AccountModuleClaims,
  MachineSegmentEnvelope,
  MachineSelfResponse,
  RuntimePlatform,
  UploadAcceptance,
} from './contracts';
import { randomToken, sha256Hex } from './crypto';

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
): Promise<void> {
  const statements: D1PreparedStatement[] = [];
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
      ) SELECT ?1, ?2, desired_policy_version, default_child_id,
        CASE WHEN default_child_id IS NULL THEN 0 ELSE 1 END,
        CASE WHEN default_child_id IS NULL THEN 'unprotected' ELSE 'default' END, ?3, ?3
      FROM runtime_machines_v2 m WHERE m.id=?1
        AND NOT EXISTS(SELECT 1 FROM runtime_user_assignments_v2 a
          WHERE a.machine_id=?1 AND a.local_user_id=?2)
    `).bind(machine.machineId, user.localUserId, nowMs));
  }
  if (statements.length) await database.batch(statements);
}

export async function getMachinePolicy(
  database: D1Database,
  machine: MachineSelfResponse,
): Promise<{ etag: string; policy: unknown }> {
  const users = await listMachineUsers(database, machine.accountId, machine.machineId);
  const policy = {
    version: machine.desiredPolicyVersion,
    defaultChildId: machine.defaultChildId,
    users: (users?.users || []).map((value) => {
      const user = value as Record<string, unknown>;
      return {
        localUserId: user.localUserId,
        assignmentVersion: user.assignmentVersion,
        childId: user.childId,
        protected: user.protected,
      };
    }),
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

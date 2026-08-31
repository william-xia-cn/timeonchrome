import { segmentContentHash } from './canonical';
import type {
  CreateEnrollmentCodeResponse,
  DeviceSelfResponse,
  EnrollDeviceRequest,
  EnrollDeviceResponse,
  RuntimePlatform,
  UploadAcceptance,
  UsageSegment,
} from './contracts';
import { randomToken, sha256Hex } from './crypto';
import type { SegmentValidation } from './validation';

interface DeviceRow {
  id: string;
  subject_id: string;
  platform: RuntimePlatform;
  display_name: string | null;
  created_at_ms: number;
  last_seen_at_ms: number;
  account_id: string | null;
  child_id: string | null;
  revoked_at_ms?: number | null;
}

interface ExistingSegmentRow {
  content_hash: string;
}

export async function createEnrollmentCode(
  database: D1Database,
  subjectId: string,
  ttlSeconds: number,
  nowMs: number,
): Promise<CreateEnrollmentCodeResponse> {
  const code = randomToken('rt_enroll_', 24);
  const codeHash = await sha256Hex(code);
  const expiresAtMs = nowMs + ttlSeconds * 1_000;
  await database.prepare(
    `INSERT INTO runtime_enrollment_codes(
       code_hash, subject_id, expires_at_ms, consumed_at_ms,
       consumed_by_device_id, created_at_ms
     ) VALUES (?1, ?2, ?3, NULL, NULL, ?4)`,
  ).bind(codeHash, subjectId, expiresAtMs, nowMs).run();
  return { code, expiresAtMs };
}

export async function enrollDevice(
  database: D1Database,
  enrollment: EnrollDeviceRequest,
  nowMs: number,
): Promise<EnrollDeviceResponse | null> {
  const codeHash = await sha256Hex(enrollment.code);
  const deviceId = `rt_device_${crypto.randomUUID()}`;
  const deviceToken = randomToken('rt_token_', 32);
  const tokenHash = await sha256Hex(deviceToken);
  const pending = await database.prepare(`
    SELECT account_id, child_id, display_name, replace_device_id
    FROM runtime_enrollment_codes
    WHERE code_hash = ?1 AND consumed_at_ms IS NULL AND revoked_at_ms IS NULL
      AND expires_at_ms >= ?2 AND platform = 'windows'
  `).bind(codeHash, nowMs).first<{
    account_id: string | null; child_id: string | null; display_name: string | null; replace_device_id: string | null;
  }>();
  if (!pending?.account_id || !pending.child_id) return null;
  const targetDeviceId = pending.replace_device_id || deviceId;
  const results = await database.batch([
    database.prepare(
      `UPDATE runtime_enrollment_codes
       SET consumed_at_ms = ?1, consumed_by_device_id = ?2
       WHERE code_hash = ?3 AND consumed_at_ms IS NULL AND expires_at_ms >= ?1`,
    ).bind(nowMs, deviceId, codeHash),
    pending.replace_device_id ? database.prepare(
      `UPDATE runtime_devices SET token_hash=?1, display_name=COALESCE(?2, display_name),
         revoked_at_ms=NULL, last_seen_at_ms=?3 WHERE id=?4 AND account_id=?5 AND child_id=?6`,
    ).bind(tokenHash, enrollment.displayName ?? pending.display_name, nowMs, targetDeviceId, pending.account_id, pending.child_id)
      : database.prepare(
      `INSERT INTO runtime_devices(
         id, subject_id, platform, token_hash, display_name, created_at_ms,
         last_seen_at_ms, revoked_at_ms, account_id, child_id
       ) SELECT ?1, child_id, ?2, ?3, COALESCE(?4, display_name), ?5, ?5, NULL, account_id, child_id
       FROM runtime_enrollment_codes
       WHERE code_hash = ?6 AND consumed_by_device_id = ?1`,
    ).bind(
      deviceId,
      enrollment.platform,
      tokenHash,
      enrollment.displayName ?? null,
      nowMs,
      codeHash,
    ),
  ]);
  if ((results[1]?.meta.changes ?? 0) !== 1) {
    return null;
  }
  return { deviceId: targetDeviceId, deviceToken, platform: enrollment.platform };
}

export async function authenticateDevice(
  database: D1Database,
  token: string,
  nowMs: number,
): Promise<DeviceSelfResponse | null> {
  const tokenHash = await sha256Hex(token);
  const row = await database.prepare(
    `SELECT id, subject_id, platform, display_name, created_at_ms, last_seen_at_ms,
            account_id, child_id, revoked_at_ms
     FROM runtime_devices
     WHERE token_hash = ?1 AND revoked_at_ms IS NULL`,
  ).bind(tokenHash).first<DeviceRow>();
  if (row === null) {
    return null;
  }
  await database.prepare(
    'UPDATE runtime_devices SET last_seen_at_ms = ?1 WHERE id = ?2',
  ).bind(nowMs, row.id).run();
  return {
    deviceId: row.id,
    subjectId: row.subject_id,
    platform: row.platform,
    displayName: row.display_name,
    createdAtMs: row.created_at_ms,
    lastSeenAtMs: nowMs,
    accountId: row.account_id ?? undefined,
    childId: row.child_id ?? undefined,
    revoked: row.revoked_at_ms != null,
  };
}

function pairingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const raw = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export async function createModulePairingCode(
  database: D1Database,
  owner: { account_id: string; child_id: string; child_name: string; jti: string },
  nowMs: number,
  replaceDeviceId?: string,
): Promise<{ code: string; expiresAtMs: number }> {
  if (replaceDeviceId) {
    const device = await database.prepare(
      'SELECT id FROM runtime_devices WHERE id=?1 AND account_id=?2 AND child_id=?3',
    ).bind(replaceDeviceId, owner.account_id, owner.child_id).first();
    if (!device) throw new Error('DEVICE_NOT_FOUND');
  }
  const code = pairingCode();
  const expiresAtMs = nowMs + 600_000;
  await database.batch([
    database.prepare(`
      INSERT INTO runtime_children_v1(child_id, account_id, child_name, created_at_ms, updated_at_ms)
      VALUES (?1, ?2, ?3, ?4, ?4)
      ON CONFLICT(child_id) DO UPDATE SET account_id=excluded.account_id,
        child_name=excluded.child_name, updated_at_ms=excluded.updated_at_ms
    `).bind(owner.child_id, owner.account_id, owner.child_name, nowMs),
    database.prepare(`
      INSERT INTO runtime_enrollment_codes(
        code_hash, subject_id, expires_at_ms, consumed_at_ms, consumed_by_device_id,
        created_at_ms, account_id, child_id, platform, display_name, created_by_jti,
        revoked_at_ms, replace_device_id
      ) VALUES (?1, ?2, ?3, NULL, NULL, ?4, ?5, ?2, 'windows', ?6, ?7, NULL, ?8)
    `).bind(await sha256Hex(code), owner.child_id, expiresAtMs, nowMs, owner.account_id,
      replaceDeviceId ? null : 'Windows 电脑', owner.jti, replaceDeviceId ?? null),
  ]);
  return { code, expiresAtMs };
}

export async function listModuleDevices(
  database: D1Database, accountId: string, childId: string, nowMs: number,
): Promise<{ devices: unknown[] }> {
  const devices = await database.prepare(`
    SELECT id, display_name, platform, created_at_ms, last_seen_at_ms, revoked_at_ms,
           agent_version, os_version, architecture, last_upload_at_ms
    FROM runtime_devices WHERE account_id=?1 AND child_id=?2 ORDER BY created_at_ms DESC
  `).bind(accountId, childId).all<Record<string, unknown>>();
  const pending = await database.prepare(`
    SELECT expires_at_ms, replace_device_id, display_name FROM runtime_enrollment_codes
    WHERE account_id=?1 AND child_id=?2 AND consumed_at_ms IS NULL AND revoked_at_ms IS NULL
      AND expires_at_ms >= ?3 ORDER BY created_at_ms DESC
  `).bind(accountId, childId, nowMs).all<Record<string, unknown>>();
  return {
    devices: [
      ...(pending.results || []).map((row) => ({
        id: `pending:${row.replace_device_id || row.expires_at_ms}`, displayName: row.display_name,
        status: 'pending', expiresAtMs: row.expires_at_ms, replaceDeviceId: row.replace_device_id,
      })),
      ...(devices.results || []).map((row) => {
        const lastSeen = Number(row.last_seen_at_ms || 0);
        const status = row.revoked_at_ms ? 'revoked'
          : nowMs - lastSeen <= 600_000 ? 'online'
            : nowMs - lastSeen <= 86_400_000 ? 'recentlyOnline' : 'offline';
        return {
          id: row.id, displayName: row.display_name, platform: row.platform, status,
          createdAtMs: row.created_at_ms, lastSeenAtMs: lastSeen,
          agentVersion: row.agent_version, windowsVersion: row.os_version,
          architecture: row.architecture, lastSyncAtMs: row.last_upload_at_ms,
        };
      }),
    ],
  };
}

export async function revokeModuleDevice(
  database: D1Database, accountId: string, childId: string, deviceId: string, nowMs: number,
): Promise<boolean> {
  const result = await database.prepare(
    'UPDATE runtime_devices SET revoked_at_ms=?1 WHERE id=?2 AND account_id=?3 AND child_id=?4',
  ).bind(nowMs, deviceId, accountId, childId).run();
  return (result.meta.changes ?? 0) === 1;
}

export async function recordHeartbeat(
  database: D1Database, deviceId: string, input: { agentVersion: string; windowsVersion: string; architecture: string }, nowMs: number,
): Promise<void> {
  await database.prepare(`
    UPDATE runtime_devices SET agent_version=?1, os_version=?2, architecture=?3, last_seen_at_ms=?4 WHERE id=?5
  `).bind(input.agentVersion, input.windowsVersion, input.architecture, nowMs, deviceId).run();
}

export async function deleteRuntimeChild(database: D1Database, accountId: string, childId: string): Promise<void> {
  const deviceRows = await database.prepare(
    'SELECT id FROM runtime_devices WHERE account_id=?1 AND child_id=?2',
  ).bind(accountId, childId).all<{ id: string }>();
  const ids = (deviceRows.results || []).map((row) => row.id);
  const statements: D1PreparedStatement[] = [
    database.prepare('DELETE FROM runtime_enrollment_codes WHERE account_id=?1 AND child_id=?2').bind(accountId, childId),
    database.prepare('DELETE FROM runtime_app_hourly_stats_v1 WHERE child_id=?1').bind(childId),
  ];
  for (const id of ids) statements.push(database.prepare('DELETE FROM runtime_usage_segments WHERE device_id=?1').bind(id));
  statements.push(database.prepare('DELETE FROM runtime_devices WHERE account_id=?1 AND child_id=?2').bind(accountId, childId));
  statements.push(database.prepare('DELETE FROM runtime_children_v1 WHERE account_id=?1 AND child_id=?2').bind(accountId, childId));
  await database.batch(statements);
}

export async function queryModuleUsage(
  database: D1Database, accountId: string, childId: string, fromMs: number, toMs: number, deviceId?: string,
): Promise<unknown> {
  const bindings: unknown[] = [childId, fromMs, toMs];
  let filter = '';
  if (deviceId) { filter = ' AND s.device_id=?4'; bindings.push(deviceId); }
  const owner = await database.prepare(
    'SELECT child_id FROM runtime_children_v1 WHERE child_id=?1 AND account_id=?2',
  ).bind(childId, accountId).first();
  if (!owner) return { totalDurationMs: 0, buckets: [], applications: [], lastSyncAtMs: null };
  const rows = await database.prepare(`
    SELECT s.hour_start_ms, s.runtime_identity, MAX(s.display_name) AS display_name,
           SUM(s.duration_ms) AS duration_ms
    FROM runtime_app_hourly_stats_v1 s
    WHERE s.child_id=?1 AND s.hour_start_ms>=?2 AND s.hour_start_ms<?3${filter}
    GROUP BY s.hour_start_ms, s.runtime_identity ORDER BY s.hour_start_ms ASC
  `).bind(...bindings).all<{ hour_start_ms: number; runtime_identity: string; display_name: string | null; duration_ms: number }>();
  const result = rows.results || [];
  const bucketMap = new Map<number, number>();
  const appMap = new Map<string, { runtimeIdentity: string; displayName: string | null; durationMs: number }>();
  for (const row of result) {
    bucketMap.set(row.hour_start_ms, (bucketMap.get(row.hour_start_ms) || 0) + Number(row.duration_ms));
    const app = appMap.get(row.runtime_identity) || { runtimeIdentity: row.runtime_identity, displayName: row.display_name, durationMs: 0 };
    app.durationMs += Number(row.duration_ms); appMap.set(row.runtime_identity, app);
  }
  const sync = await database.prepare(`
    SELECT MAX(last_upload_at_ms) AS last_sync FROM runtime_devices WHERE account_id=?1 AND child_id=?2${deviceId ? ' AND id=?3' : ''}
  `).bind(...(deviceId ? [accountId, childId, deviceId] : [accountId, childId])).first<{ last_sync: number | null }>();
  return {
    totalDurationMs: result.reduce((sum, row) => sum + Number(row.duration_ms), 0),
    buckets: [...bucketMap].map(([startAtMs, durationMs]) => ({ startAtMs, durationMs })),
    applications: [...appMap.values()].sort((a, b) => b.durationMs - a.durationMs),
    lastSyncAtMs: sync?.last_sync ?? null,
  };
}

export async function persistSegments(
  database: D1Database,
  device: DeviceSelfResponse,
  validations: SegmentValidation[],
  nowMs: number,
): Promise<UploadAcceptance> {
  const rejected = validations
    .filter((result): result is Extract<SegmentValidation, { ok: false }> => !result.ok)
    .map((result) => ({ id: result.id, code: result.code }));
  const valid = validations
    .filter((result): result is Extract<SegmentValidation, { ok: true }> => result.ok)
    .map((result) => result.segment);

  const unique = new Map<string, { segment: UsageSegment; contentHash: string }>();
  const duplicateConflicts = new Set<string>();
  for (const segment of valid) {
    const contentHash = await segmentContentHash(segment);
    const previous = unique.get(segment.id);
    if (previous !== undefined && previous.contentHash !== contentHash) {
      duplicateConflicts.add(segment.id);
      unique.delete(segment.id);
    } else if (previous === undefined && !duplicateConflicts.has(segment.id)) {
      unique.set(segment.id, { segment, contentHash });
    }
  }
  for (const id of duplicateConflicts) {
    rejected.push({ id, code: 'ID_CONFLICT' });
  }

  const candidates = [...unique.values()];
  if (candidates.length === 0) {
    return { acceptedIds: [], rejected };
  }
  const existingResults = await database.batch<ExistingSegmentRow>(candidates.map(({ segment }) =>
    database.prepare(
      'SELECT content_hash FROM runtime_usage_segments WHERE device_id = ?1 AND id = ?2',
    ).bind(device.deviceId, segment.id)));

  const accepted = new Set<string>();
  const inserts: Array<{ segment: UsageSegment; contentHash: string; statement: D1PreparedStatement }> = [];
  candidates.forEach((candidate, index) => {
    const existing = existingResults[index]?.results[0];
    if (existing !== undefined) {
      if (existing.content_hash === candidate.contentHash) {
        accepted.add(candidate.segment.id);
      } else {
        rejected.push({ id: candidate.segment.id, code: 'ID_CONFLICT' });
      }
      return;
    }
    const { segment, contentHash } = candidate;
    inserts.push({
      segment,
      contentHash,
      statement: database.prepare(
        `INSERT INTO runtime_usage_segments(
           id, device_id, runtime_session_id, platform, runtime_identity,
           display_name, start_at_ms, end_at_ms, duration_ms,
           end_reason, content_hash, uploaded_at_ms
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(device_id, id) DO UPDATE SET id = excluded.id
         WHERE runtime_usage_segments.content_hash = excluded.content_hash`,
      ).bind(
        segment.id,
        device.deviceId,
        segment.runtimeSessionID,
        segment.application.platform,
        segment.application.runtimeIdentity,
        segment.application.displayName ?? null,
        segment.startAtMs,
        segment.endAtMs,
        segment.durationMilliseconds,
        segment.endReason,
        contentHash,
        nowMs,
      ),
    });
  });

  if (inserts.length > 0) {
    for (const item of inserts) {
      const statements = [item.statement];
      if (device.childId) {
        let cursor = item.segment.startAtMs;
        while (cursor < item.segment.endAtMs) {
          const hourStart = Math.floor(cursor / 3_600_000) * 3_600_000;
          const sliceEnd = Math.min(item.segment.endAtMs, hourStart + 3_600_000);
          statements.push(database.prepare(`
            INSERT INTO runtime_app_hourly_stats_v1(
              child_id, device_id, hour_start_ms, runtime_identity, display_name, duration_ms, updated_at_ms
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(child_id, device_id, hour_start_ms, runtime_identity) DO UPDATE SET
              duration_ms=runtime_app_hourly_stats_v1.duration_ms+excluded.duration_ms,
              display_name=COALESCE(excluded.display_name, runtime_app_hourly_stats_v1.display_name),
              updated_at_ms=excluded.updated_at_ms
          `).bind(device.childId, device.deviceId, hourStart, item.segment.application.runtimeIdentity,
            item.segment.application.displayName ?? null, sliceEnd - cursor, nowMs));
          cursor = sliceEnd;
        }
        statements.push(database.prepare(
          'UPDATE runtime_devices SET last_upload_at_ms=?1 WHERE id=?2',
        ).bind(nowMs, device.deviceId));
      }
      const result = await database.batch(statements);
      if ((result[0]?.meta.changes ?? 0) === 1) accepted.add(item.segment.id);
      else rejected.push({ id: item.segment.id, code: 'ID_CONFLICT' });
    }
  }

  const acceptedIds = valid
    .map((segment) => segment.id)
    .filter((id, index, all) => accepted.has(id) && all.indexOf(id) === index);
  return { acceptedIds, rejected };
}

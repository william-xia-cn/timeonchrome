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
  const results = await database.batch([
    database.prepare(
      `UPDATE runtime_enrollment_codes
       SET consumed_at_ms = ?1, consumed_by_device_id = ?2
       WHERE code_hash = ?3 AND consumed_at_ms IS NULL AND expires_at_ms >= ?1`,
    ).bind(nowMs, deviceId, codeHash),
    database.prepare(
      `INSERT INTO runtime_devices(
         id, subject_id, platform, token_hash, display_name,
         created_at_ms, last_seen_at_ms, revoked_at_ms
       )
       SELECT ?1, subject_id, ?2, ?3, ?4, ?5, ?5, NULL
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
  return { deviceId, deviceToken, platform: enrollment.platform };
}

export async function authenticateDevice(
  database: D1Database,
  token: string,
  nowMs: number,
): Promise<DeviceSelfResponse | null> {
  const tokenHash = await sha256Hex(token);
  const row = await database.prepare(
    `SELECT id, subject_id, platform, display_name, created_at_ms, last_seen_at_ms
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
    const insertResults = await database.batch(inserts.map((item) => item.statement));
    insertResults.forEach((result, index) => {
      const segment = inserts[index]?.segment;
      if (segment === undefined) {
        return;
      }
      if ((result.meta.changes ?? 0) === 1) {
        accepted.add(segment.id);
      } else {
        rejected.push({ id: segment.id, code: 'ID_CONFLICT' });
      }
    });
  }

  const acceptedIds = valid
    .map((segment) => segment.id)
    .filter((id, index, all) => accepted.has(id) && all.indexOf(id) === index);
  return { acceptedIds, rejected };
}

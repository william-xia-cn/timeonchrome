import { Env, json, verifyAccountToken } from '../db/middleware';
import {
  createOrReuseProfileAccountSnapshotV2,
  readProfileAccountSnapshotPageV2,
} from '../services/profileAccountSnapshotsV2';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SNAPSHOT_ROUTE_RE = /^\/profiles\/([^/]+)\/accounts\/v2\/snapshot$/;
const RECONCILIATION_ROUTE_RE = /^\/profiles\/([^/]+)\/accounts\/v2\/reconciliations$/;

function parsePage(value: string | null): number | null {
  if (value === null) return 0;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 0 ? page : null;
}

export async function handleDeviceProfileAccountSnapshotV2(
  request: Request, env: Env, profileId: string
): Promise<Response> {
  const url = new URL(request.url);
  const weekStart = url.searchParams.get('weekStart');
  const snapshotId = url.searchParams.get('snapshotId');
  const page = parsePage(url.searchParams.get('page'));
  if (!DATE_RE.test(String(weekStart || '')) || page === null) {
    return json({ error: 'Invalid weekStart/page', code: 'PROFILE_ACCOUNT_INVALID_SNAPSHOT_REQUEST' }, 400);
  }
  const snapshot = snapshotId
    ? { id: snapshotId }
    : await createOrReuseProfileAccountSnapshotV2(env, profileId, weekStart!);
  if (!snapshot) return json({ success: true, found: false, weekStart });
  const result = await readProfileAccountSnapshotPageV2(env, profileId, snapshot.id, page);
  if (!result) return json({ error: 'Snapshot not found or expired', code: 'PROFILE_ACCOUNT_SNAPSHOT_NOT_FOUND' }, 404);
  if (result.period?.weekStart !== weekStart) {
    return json({ error: 'Snapshot period mismatch', code: 'PROFILE_ACCOUNT_SNAPSHOT_PERIOD_MISMATCH' }, 409);
  }
  return json({ success: true, found: true, ...result });
}

async function verifyOwnedProfile(request: Request, env: Env, profileId: string): Promise<Response | null> {
  const accountId = await verifyAccountToken(request, env.JWT_SECRET);
  if (!accountId) return json({ error: 'Unauthorized' }, 401);
  const profile = await env.DB.prepare(`SELECT id FROM profiles WHERE id = ? AND account_id = ?`)
    .bind(profileId, accountId).first<any>();
  return profile ? null : json({ error: 'Profile not found' }, 404);
}

async function handleReconciliations(request: Request, env: Env, profileId: string): Promise<Response> {
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
    return json({ error: 'from/to must be YYYY-MM-DD' }, 400);
  }
  const where = ['profile_id = ?'];
  const binds: any[] = [profileId];
  if (from) { where.push('date >= ?'); binds.push(from); }
  if (to) { where.push('date <= ?'); binds.push(to); }
  const rows = await env.DB.prepare(
    `SELECT device_id, date, revision, manifest_id, raw_cutoff, status,
            expected_raw_count, actual_raw_count, expected_raw_hash, actual_raw_hash,
            expected_stats_hash, actual_stats_hash, total_seconds_delta,
            difference_json, checked_at
       FROM device_account_reconciliations_v2
      WHERE ${where.join(' AND ')}
      ORDER BY date DESC, device_id ASC, revision DESC LIMIT 500`
  ).bind(...binds).all<any>();
  return json({
    success: true,
    reconciliations: (rows.results || []).map((row) => ({
      deviceId: row.device_id,
      date: row.date,
      revision: Number(row.revision),
      manifestId: row.manifest_id,
      rawCutoff: Number(row.raw_cutoff),
      status: row.status,
      expectedRawCount: Number(row.expected_raw_count),
      actualRawCount: Number(row.actual_raw_count),
      expectedRawHash: row.expected_raw_hash,
      actualRawHash: row.actual_raw_hash,
      expectedStatsHash: row.expected_stats_hash,
      actualStatsHash: row.actual_stats_hash,
      totalSecondsDelta: row.total_seconds_delta == null ? null : Number(row.total_seconds_delta),
      comparison: JSON.parse(row.difference_json || '{}'),
      checkedAt: Number(row.checked_at),
    })),
  });
}

export const profileAccountsV2Router = {
  async handle(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    const snapshotMatch = path.match(SNAPSHOT_ROUTE_RE);
    const reconciliationMatch = path.match(RECONCILIATION_ROUTE_RE);
    const profileId = snapshotMatch?.[1] || reconciliationMatch?.[1];
    if (!profileId) return json({ error: 'Not found' }, 404);
    const denied = await verifyOwnedProfile(request, env, profileId);
    if (denied) return denied;
    try {
      if (request.method === 'GET' && snapshotMatch) return await handleDeviceProfileAccountSnapshotV2(request, env, profileId);
      if (request.method === 'GET' && reconciliationMatch) return await handleReconciliations(request, env, profileId);
      return json({ error: 'Not found' }, 404);
    } catch (error: any) {
      return json({ error: 'Profile account V2 operation failed', code: String(error?.message || 'PROFILE_ACCOUNT_V2_FAILED').slice(0, 96) }, 500);
    }
  },
};


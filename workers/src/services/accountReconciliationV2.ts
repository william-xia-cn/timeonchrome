import { Env } from '../db/middleware';
import { canonicalDeviceAccountJson, hashDeviceAccountValue, validateDeviceAccountRows } from '../../../extension/core/device-account-v2.js';
import {
  buildAuditDeviceAccountFromSegments,
  compareDeviceAccountAudit,
} from '../../../extension/core/account-reconciliation-v2.js';
import { readManifestAccountV2 } from './profileAccountsV2';

function parseJson(value: string | null): any {
  if (!value) return null;
  try { return JSON.parse(value); } catch (_) { return null; }
}

function normalizeRawSegment(row: any): any {
  return {
    id: row.id,
    date: row.date,
    timezone: row.timezone || 'Asia/Shanghai',
    dayStartMs: Number(row.day_start_ms || 0),
    dayEndMs: Number(row.day_end_ms || 0),
    startMs: Number(row.start_ms),
    endMs: Number(row.end_ms),
    durationSeconds: Number(row.duration_seconds),
    domain: row.domain,
    channel: row.channel,
    mode: row.mode,
    sourceState: row.source_state || '',
    settlementReason: row.settlement_reason || '',
    parentSegmentId: row.parent_segment_id || null,
    partIndex: Number(row.part_index || 1),
    partCount: Number(row.part_count || 1),
    tabId: row.tab_id == null ? null : String(row.tab_id),
    windowId: row.window_id == null ? null : Number(row.window_id),
    description: parseJson(row.description_json),
    managedTargetId: row.managed_target_id || null,
    managedTargetType: row.managed_target_type || null,
    managedTargetNamespace: row.managed_target_namespace || null,
    managedTargetValue: row.managed_target_value || null,
    managedTargetLabelAtTime: row.managed_target_label_at_time || null,
    targetSourceAtTime: row.target_source_at_time || null,
    targetRuleId: row.target_rule_id || null,
    targetMatchLevel: row.target_match_level || null,
    targetClassificationAtTime: row.target_classification_at_time || null,
    quotaBucketAtTime: row.quota_bucket_at_time || null,
  };
}

async function readRawSegments(env: Env, profileId: string, deviceId: string, date: string, rawCutoff: number): Promise<any[]> {
  const result = await env.DB.prepare(
    `SELECT id, date, timezone, day_start_ms, day_end_ms, start_ms, end_ms, duration_seconds,
            domain, channel, mode, source_state, settlement_reason, parent_segment_id,
            part_index, part_count, tab_id, window_id, description_json,
            managed_target_id, managed_target_type, managed_target_namespace,
            managed_target_value, managed_target_label_at_time, target_source_at_time,
            target_rule_id, target_match_level, target_classification_at_time, quota_bucket_at_time
       FROM usage_segments_v1
      WHERE profile_id = ? AND device_id = ? AND date = ? AND created_at <= ?
      ORDER BY id ASC`
  ).bind(profileId, deviceId, date, rawCutoff).all<any>();
  return (result.results || []).map(normalizeRawSegment);
}

function resultFingerprint(status: string, comparison: any): Promise<string> {
  return hashDeviceAccountValue({ status, comparison });
}

export async function reconcileDeviceAccountV2(
  env: Env,
  { profileId, deviceId, manifestId }: { profileId: string; deviceId: string; manifestId: string }
): Promise<any> {
  const manifest = await readManifestAccountV2(env, manifestId);
  if (!manifest || manifest.profileId !== profileId || manifest.deviceId !== deviceId) {
    throw new Error('ACCOUNT_RECONCILIATION_MANIFEST_NOT_FOUND');
  }
  const rawCutoff = manifest.generatedAt;
  const rawSegments = await readRawSegments(env, profileId, deviceId, manifest.date, rawCutoff);
  let status: string;
  let audit: any = null;
  let comparison: any = {
    rawFactCountDelta: rawSegments.length - manifest.rawFactCount,
    rawFactHashMatched: false,
    statsHashMatched: false,
    totalSecondsDelta: null,
    rowDifferenceCount: 0,
    rowDifferences: [],
  };

  if (!manifest.complete || manifest.lossCount > 0) {
    status = 'insufficient_evidence';
  } else if (rawSegments.length < manifest.rawFactCount) {
    status = 'pending_raw';
  } else if (rawSegments.length > manifest.rawFactCount) {
    status = 'manual_review_required';
  } else {
    audit = await buildAuditDeviceAccountFromSegments(manifest.date, rawSegments);
    const expectedValidation = validateDeviceAccountRows(manifest.rows, manifest.date);
    if (!expectedValidation.ok) throw new Error(expectedValidation.code);
    comparison = compareDeviceAccountAudit({
      rows: manifest.rows,
      rawFactCount: manifest.rawFactCount,
      rawFactHash: manifest.rawFactHash,
      statsHash: manifest.statsHash,
      totalSeconds: expectedValidation.totalSeconds,
    }, audit);
    status = comparison.matched ? 'matched' : 'mismatch';
  }

  const now = Date.now();
  const differenceJson = canonicalDeviceAccountJson(comparison);
  const reconciliationId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO device_account_reconciliations_v2
        (id, profile_id, device_id, date, revision, manifest_id, raw_cutoff, status,
         expected_raw_count, actual_raw_count, expected_raw_hash, actual_raw_hash,
         expected_stats_hash, actual_stats_hash, total_seconds_delta, difference_json, checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(profile_id, device_id, date, revision, raw_cutoff) DO UPDATE SET
         status = excluded.status, actual_raw_count = excluded.actual_raw_count,
         actual_raw_hash = excluded.actual_raw_hash, actual_stats_hash = excluded.actual_stats_hash,
         total_seconds_delta = excluded.total_seconds_delta,
         difference_json = excluded.difference_json, checked_at = excluded.checked_at`
    ).bind(
      reconciliationId, profileId, deviceId, manifest.date, manifest.revision, manifestId,
      rawCutoff, status, manifest.rawFactCount, rawSegments.length, manifest.rawFactHash,
      audit?.rawFactHash || null, manifest.statsHash, audit?.statsHash || null,
      comparison.totalSecondsDelta, differenceJson, now
    ),
  ];

  if (status === 'mismatch' || status === 'manual_review_required') {
    const fingerprint = await resultFingerprint(status, comparison);
    statements.push(env.DB.prepare(
      `INSERT INTO device_account_reconciliation_incidents_v2
        (id, profile_id, device_id, date, revision, fingerprint, status,
         first_seen_at, last_seen_at, occurrences, difference_json)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, 1, ?)
       ON CONFLICT(profile_id, device_id, date, revision, fingerprint) DO UPDATE SET
         last_seen_at = excluded.last_seen_at,
         occurrences = device_account_reconciliation_incidents_v2.occurrences + 1,
         difference_json = excluded.difference_json`
    ).bind(crypto.randomUUID(), profileId, deviceId, manifest.date, manifest.revision, fingerprint, now, now, differenceJson));
    statements.push(env.DB.prepare(
      `DELETE FROM device_account_reconciliation_incidents_v2 WHERE id IN (
         SELECT id FROM device_account_reconciliation_incidents_v2 WHERE profile_id = ?
          ORDER BY last_seen_at DESC LIMIT -1 OFFSET 100
       )`
    ).bind(profileId));
  } else if (status === 'matched') {
    statements.push(env.DB.prepare(
      `UPDATE device_account_reconciliation_incidents_v2 SET status = 'resolved', last_seen_at = ?
        WHERE profile_id = ? AND device_id = ? AND date = ? AND revision = ? AND status = 'open'`
    ).bind(now, profileId, deviceId, manifest.date, manifest.revision));
  }
  await env.DB.batch(statements);

  return {
    status,
    profileId,
    deviceId,
    date: manifest.date,
    revision: manifest.revision,
    manifestId,
    rawCutoff,
    expectedRawCount: manifest.rawFactCount,
    actualRawCount: rawSegments.length,
    expectedRawHash: manifest.rawFactHash,
    actualRawHash: audit?.rawFactHash || null,
    expectedStatsHash: manifest.statsHash,
    actualStatsHash: audit?.statsHash || null,
    comparison,
    checkedAt: now,
  };
}


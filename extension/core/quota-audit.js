// Shared read-only audit protocol. Never include configuration or page metadata.
export const QUOTA_AUDIT_KEYS = [
  'usage_segments_v1', 'daily_usage_stats_v1', 'segment_sync_outbox_v1',
  'stats_sync_outbox_v1', 'target_stats_sync_outbox_v1',
  'usage_stats_history_synced_through_date_v1',
];
const DAY = 86400000;
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9_:-]{1,128}$/.test(value);
const finite = value => value != null && Number.isFinite(Number(value)) ? Number(value) : null;
const pick = (value, allowed) => allowed.includes(value) ? value : 'unknown';
export function validAuditDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validateQuotaAuditRequest(request, now = Date.now()) {
  if (!request || !safeId(request.requestId) || !safeId(request.deviceId)) return false;
  if (!validAuditDate(request.fromDate) || !validAuditDate(request.toDate)) return false;
  const span = Date.parse(request.toDate) - Date.parse(request.fromDate);
  return span >= 0 && span <= 6 * DAY && Number.isFinite(request.expiresAt) &&
    request.expiresAt > now && request.expiresAt <= now + DAY &&
    request.toDate <= new Date(now + 8 * 3600000).toISOString().slice(0, 10);
}
export function projectAuditSegment(segment) {
  if (!safeId(segment?.id) || !validAuditDate(segment?.date)) throw new Error('audit_invalid_segment_identity');
  return ['segment', segment.id, segment.date, finite(segment.startMs), finite(segment.endMs),
    finite(segment.durationSeconds), pick(segment.channel, ['active', 'backgroundMedia', 'background', 'background_media', 'pip']),
    pick(segment.mode, ['study', 'composite', 'rest', 'paused', 'locked', 'unknown']),
    pick(segment.targetClassificationAtTime, ['study', 'composite', 'pending_composite', 'restricted', 'rejected', 'blocked', 'rest']),
    pick(segment.quotaBucketAtTime, ['study', 'composite', 'rest', 'paused', 'locked', 'unknown']), finite(segment.uploadedAt)];
}
export async function auditDigest(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function summarizeAuditDays(daily = {}, fromDate, toDate) {
  const days = [];
  for (let ms = Date.parse(fromDate); ms <= Date.parse(toDate); ms += DAY) {
    const date = new Date(ms).toISOString().slice(0, 10);
    const stats = daily[date];
    const row = { date, present: !!stats, updatedAt: finite(stats?.updatedAt), uploadedAt: finite(stats?.uploadedAt),
      study: 0, composite: 0, rest: 0, unknown: 0, targetCount: 0,
      compactedSeconds: 0, activeSeconds: 0 };
    let bucketCoverageKnown = true;
    for (const target of Object.values(stats?.targets || {})) {
      row.targetCount++;
      row.activeSeconds += Math.max(0, Number(target?.activeSeconds || 0));
      if (!target || typeof target.activeByQuotaBucket !== 'object' || target.activeByQuotaBucket === null) {
        bucketCoverageKnown = false;
        continue;
      }
      for (const [bucket, seconds] of Object.entries(target.activeByQuotaBucket || {})) {
        if (finite(seconds) === null) { bucketCoverageKnown = false; continue; }
        const key = ['study', 'composite', 'rest'].includes(bucket) ? bucket : 'unknown';
        row[key] += Math.max(0, Number(seconds || 0));
      }
    }
    row.compactedSeconds = Object.values(stats?.compactedOnlineByMode || {}).reduce((sum, n) => sum + Math.max(0, Number(n || 0)), 0);
    row.bucketCoverage = bucketCoverageKnown && row.targetCount ? 'target_buckets' : 'unavailable';
    if (row.bucketCoverage === 'unavailable') row.study = row.composite = row.rest = row.unknown = null;
    days.push(row);
  }
  return days;
}
export async function buildQuotaAuditSnapshot(data, request, cutoff = Date.now(), snapshotId = crypto.randomUUID()) {
  if (!validateQuotaAuditRequest(request, cutoff)) throw new Error('audit_invalid_request');
  const within = date => date >= request.fromDate && date <= request.toDate;
  const rows = Object.values(data.usage_segments_v1 || {})
    .filter(s => within(s.date) && (finite(s.endMs) === null || Number(s.endMs) <= cutoff)).map(projectAuditSegment)
    .sort((a, b) => a[1].localeCompare(b[1]));
  const outbox = data.segment_sync_outbox_v1 || {};
  let outsideRangePendingCount = 0;
  // Include orphan IDs too; their absence from the ledger must remain diagnosable.
  for (const id of [...new Set(outbox.dirtySegmentIds || [])].sort()) {
    if (!safeId(id)) throw new Error('audit_invalid_pending_identity');
    const segment = data.usage_segments_v1?.[id];
    if (segment && !within(segment.date)) { outsideRangePendingCount++; continue; }
    rows.push(['pending', id, segment ? (within(segment.date) ? 'in_range' : 'outside_range') : 'missing_local']);
  }
  const manifest = {
    requestId: request.requestId, snapshotId, cutoff, fromDate: request.fromDate, toDate: request.toDate,
    rowCount: rows.length, chunkCount: Math.ceil(rows.length / 20),
    totalPendingCount: new Set(outbox.dirtySegmentIds || []).size, outsideRangePendingCount,
    days: summarizeAuditDays(data.daily_usage_stats_v1, request.fromDate, request.toDate),
    dirtyDates: (data.stats_sync_outbox_v1?.dirtyDates || []).filter(within),
    dirtyTargetDates: (data.target_stats_sync_outbox_v1?.dirtyDates || []).filter(within),
    watermark: validAuditDate(data.usage_stats_history_synced_through_date_v1) ? data.usage_stats_history_synced_through_date_v1 : null,
  };
  const digest = await auditDigest({ manifest, rows });
  const packets = [{ kind: 'manifest', ...manifest, digest }];
  for (let index = 0; index < manifest.chunkCount; index++) {
    packets.push({ kind: 'chunk', requestId: request.requestId, snapshotId, index, rows: rows.slice(index * 20, index * 20 + 20) });
  }
  packets.push({ kind: 'complete', requestId: request.requestId, snapshotId, digest });
  if (new TextEncoder().encode(JSON.stringify(packets)).length > 480 * 1024) throw new Error('audit_snapshot_too_large');
  return packets;
}
export async function verifyQuotaAuditPackets(packets) {
  if (!Array.isArray(packets) || packets.some(p => !p || typeof p !== 'object')) return { complete: false, reason: 'invalid_packets' };
  const manifests = packets.filter(p => p.kind === 'manifest');
  if (manifests.length !== 1) return { complete: false, reason: 'manifest_missing_or_duplicate' };
  const { kind, digest, ...manifest } = manifests[0];
  if (!safeId(manifest.requestId) || !safeId(manifest.snapshotId) || !validAuditDate(manifest.fromDate) || !validAuditDate(manifest.toDate) ||
      !Number.isFinite(manifest.cutoff) || !Number.isInteger(manifest.rowCount) || !Array.isArray(manifest.days) || manifest.days.length > 7 ||
      !Number.isInteger(manifest.chunkCount) || manifest.chunkCount < 0 || manifest.chunkCount > 1000) return { complete: false, reason: 'invalid_manifest' };
  const chunks = new Map();
  for (const p of packets) {
    if (p.requestId !== manifest.requestId || p.snapshotId !== manifest.snapshotId) return { complete: false, reason: 'mixed_snapshot' };
    if (p.kind === 'chunk') {
      if (chunks.has(p.index) || !Number.isInteger(p.index) || p.index < 0 || p.index >= manifest.chunkCount || !Array.isArray(p.rows) || p.rows.length > 20) return { complete: false, reason: 'invalid_chunk' };
      chunks.set(p.index, p.rows);
    }
  }
  if (chunks.size !== manifest.chunkCount || !packets.some(p => p.kind === 'complete' && p.digest === digest)) return { complete: false, reason: 'missing_packets' };
  const rows = Array.from({ length: manifest.chunkCount }, (_, i) => chunks.get(i)).flat();
  if (rows.length !== manifest.rowCount || await auditDigest({ manifest, rows }) !== digest) return { complete: false, reason: 'checksum_mismatch' };
  if (rows.some(r => !Array.isArray(r) || !safeId(r[1]) || !['segment', 'pending'].includes(r[0]) ||
      (r[0] === 'segment' && (r.length !== 11 || !validAuditDate(r[2]))) || (r[0] === 'pending' && r.length !== 3))) return { complete: false, reason: 'invalid_rows' };
  const ids = rows.filter(r => r[0] === 'segment').map(r => r[1]);
  if (new Set(ids).size !== ids.length) return { complete: false, reason: 'duplicate_segment' };
  return { complete: true, manifest, rows };
}
export function compareQuotaAudit(verified, cloudRows) {
  if (!verified.complete) return verified;
  const local = new Map(verified.rows.filter(r => r[0] === 'segment').map(r => [r[1], r]));
  const cloud = new Map(cloudRows.map(r => [r[1], r]));
  const pending = new Set(verified.rows.filter(r => r[0] === 'pending').map(r => r[1]));
  const localOnly = [], cloudOnly = [], conflicts = [];
  for (const [id, row] of local) {
    if (!cloud.has(id)) localOnly.push(row);
    else if (JSON.stringify(row.slice(0, 10)) !== JSON.stringify(cloud.get(id).slice(0, 10))) conflicts.push({ id, local: row, cloud: cloud.get(id) });
  }
  for (const [id, row] of cloud) if (!local.has(id)) cloudOnly.push(row);
  const union = new Map([...cloud, ...local]);
  const days = verified.manifest.days.map(day => {
    const sum = map => [...map.values()].filter(r => r[2] === day.date && r[6] === 'active' && r[9] === 'rest').reduce((n, r) => n + Math.max(0, Number(r[5] || 0)), 0);
    return { ...day, localRawRest: sum(local), cloudRawRest: sum(cloud), unionRawRest: sum(union), aggregateDelta: day.present && day.rest != null ? day.rest - sum(union) : null };
  });
  const validationCandidates = [...local.values()].flatMap(row => {
    const reasons = [];
    if (row[3] == null || row[4] == null) reasons.push('invalid_time');
    else if (row[4] <= row[3]) reasons.push('non_positive_range');
    if (row[5] == null || row[5] < 0) reasons.push('invalid_duration');
    if (!['active', 'backgroundMedia', 'pip'].includes(row[6])) reasons.push('invalid_channel');
    return reasons.length ? [{ id: row[1], date: row[2], reasons }] : [];
  });
  return { complete: true, snapshot: verified.manifest, localOnly, cloudOnly, conflicts, days,
    validationCandidates,
    pendingIds: [...pending], orphanPendingIds: verified.rows.filter(r => r[0] === 'pending' && r[2] === 'missing_local').map(r => r[1]),
    conclusion: conflicts.length ? 'conflicting_facts' : validationCandidates.length ? 'invalid_upload_candidates' : 'evidence_ready',
    cloudOnlyMeaning: 'may_be_pruned_uploaded_copies_not_proven_loss' };
}

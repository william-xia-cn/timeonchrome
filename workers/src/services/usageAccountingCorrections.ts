import { Env } from '../db/middleware';

const AUTO_RESTRICTED_REASON = 'unclassified_to_restricted_current_week';
const AUTO_CORRECTION_BATCH_SIZE = 99;
const AUTO_CORRECTION_MAX_BATCHES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export type UsageAccountingCorrection = {
  id: string;
  batchId: string;
  segmentId: string;
  profileId: string;
  deviceId: string;
  date: string;
  domain: string;
  startMs: number;
  endMs: number;
  durationSeconds: number;
  channel: string;
  originalMode: string;
  originalTargetClassification: string | null;
  originalQuotaBucket: string | null;
  effectiveMode: string;
  effectiveTargetClassification: string;
  effectiveQuotaBucket: string;
  createdAt: number;
  managedTargetId?: string | null;
};

export type RestrictedReattributionSummary = {
  requestId: string;
  applicable: boolean;
  complete: boolean;
  weekStart: string | null;
  weekEnd: string | null;
  segmentCount: number;
  durationSeconds: number;
  batchCount: number;
};

function beijingDateKey(timestamp: number) {
  return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function getBeijingWeekForTimestamp(timestamp: number) {
  const date = beijingDateKey(timestamp);
  const midday = Date.parse(`${date}T12:00:00Z`);
  const weekday = new Date(midday).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const weekStart = new Date(midday + mondayOffset * DAY_MS).toISOString().slice(0, 10);
  const weekEnd = new Date(Date.parse(`${weekStart}T00:00:00Z`) + 6 * DAY_MS).toISOString().slice(0, 10);
  return { weekStart, weekEnd };
}

function isPendingClassification(value: unknown) {
  return value === 'pending_composite' || value === 'unclassified';
}

export function isEligibleRestrictedReattributionSegment(
  row: any,
  requestId: string,
  weekStart: string,
  weekEnd: string,
  clientRequestId?: string | null,
) {
  const ruleIds = new Set([requestId, clientRequestId].filter((value): value is string => !!value));
  return !!row && row.channel === 'active' && ruleIds.has(row.target_rule_id) &&
    row.date >= weekStart && row.date <= weekEnd && isPendingClassification(row.target_classification_at_time) &&
    Number(row.duration_seconds || 0) >= 0;
}

async function requestReattributionContext(env: Env, profileId: string, requestId: string) {
  return env.DB.prepare(
    `SELECT r.id, r.profile_id, r.client_request_id, r.decision, r.decided_at, p.account_id
       FROM site_classification_requests_v1 r
       JOIN profiles p ON p.id = r.profile_id
      WHERE r.id = ? AND r.profile_id = ?`
  ).bind(requestId, profileId).first<any>();
}

async function nextCorrectionGroup(
  env: Env,
  profileId: string,
  requestId: string,
  clientRequestId: string | null,
  weekStart: string,
  weekEnd: string,
) {
  return env.DB.prepare(
    `SELECT s.device_id, s.date, s.domain
       FROM usage_segments_v1 s
       LEFT JOIN usage_segment_corrections_v1 c ON c.segment_id = s.id
      WHERE s.profile_id = ? AND s.target_rule_id IN (?, ?)
        AND s.date >= ? AND s.date <= ? AND s.channel = 'active'
        AND s.target_classification_at_time IN ('pending_composite', 'unclassified')
        AND c.segment_id IS NULL
      ORDER BY s.date ASC, s.device_id ASC, s.domain ASC, s.start_ms ASC, s.id ASC
      LIMIT 1`
  ).bind(profileId, requestId, clientRequestId || requestId, weekStart, weekEnd).first<any>();
}

async function correctionGroupSegments(
  env: Env,
  profileId: string,
  requestId: string,
  clientRequestId: string | null,
  weekStart: string,
  weekEnd: string,
  group: any,
) {
  const result = await env.DB.prepare(
    `SELECT s.id, s.profile_id, s.device_id, s.date, s.domain, s.start_ms, s.end_ms,
            s.duration_seconds, s.channel, s.mode, s.target_rule_id,
            s.target_classification_at_time, s.quota_bucket_at_time
       FROM usage_segments_v1 s
       LEFT JOIN usage_segment_corrections_v1 c ON c.segment_id = s.id
      WHERE s.profile_id = ? AND s.target_rule_id IN (?, ?)
        AND s.date >= ? AND s.date <= ? AND s.channel = 'active'
        AND s.target_classification_at_time IN ('pending_composite', 'unclassified')
        AND s.device_id = ? AND s.date = ? AND s.domain = ?
        AND c.segment_id IS NULL
      ORDER BY s.start_ms ASC, s.id ASC
      LIMIT ${AUTO_CORRECTION_BATCH_SIZE}`
  ).bind(profileId, requestId, clientRequestId || requestId, weekStart, weekEnd, group.device_id, group.date, group.domain).all<any>();
  return (result.results || []).filter((row) =>
    isEligibleRestrictedReattributionSegment(row, requestId, weekStart, weekEnd, clientRequestId));
}

export async function applyRestrictedReattributionForRequest(
  env: Env,
  profileId: string,
  requestId: string,
  options: { maxBatches?: number } = {},
): Promise<RestrictedReattributionSummary> {
  const context = await requestReattributionContext(env, profileId, requestId);
  if (!context || context.decision !== 'reject' || !Number.isFinite(Number(context.decided_at))) {
    return { requestId, applicable: false, complete: true, weekStart: null, weekEnd: null, segmentCount: 0, durationSeconds: 0, batchCount: 0 };
  }

  const { weekStart, weekEnd } = getBeijingWeekForTimestamp(Number(context.decided_at));
  const clientRequestId = typeof context.client_request_id === 'string' && context.client_request_id
    ? context.client_request_id
    : null;
  const maxBatches = Math.max(1, Math.min(AUTO_CORRECTION_MAX_BATCHES, Number(options.maxBatches || AUTO_CORRECTION_MAX_BATCHES)));
  let segmentCount = 0;
  let durationSeconds = 0;
  let batchCount = 0;

  while (batchCount < maxBatches) {
    const group = await nextCorrectionGroup(env, profileId, requestId, clientRequestId, weekStart, weekEnd);
    if (!group) break;
    const segments = await correctionGroupSegments(env, profileId, requestId, clientRequestId, weekStart, weekEnd, group);
    if (segments.length === 0) break;

    const batchId = crypto.randomUUID();
    const now = Date.now();
    const batchSeconds = segments.reduce((sum, row) => sum + Number(row.duration_seconds || 0), 0);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO usage_accounting_correction_batches_v1
          (id, profile_id, device_id, date, domain, segment_count, duration_seconds, reason_code, note, approved_by_account_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(batchId, profileId, group.device_id, group.date, group.domain, segments.length, batchSeconds,
        AUTO_RESTRICTED_REASON, `site classification request ${requestId}`, context.account_id, now),
      ...segments.map((row) => env.DB.prepare(
        `INSERT INTO usage_segment_corrections_v1
          (id, batch_id, segment_id, profile_id, device_id, date, domain, start_ms, end_ms, duration_seconds,
           channel, original_mode, original_target_classification, original_quota_bucket,
           effective_mode, effective_target_classification, effective_quota_bucket,
           reason_code, approved_by_account_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rest', 'restricted', 'rest', ?, ?, ?)`
      ).bind(crypto.randomUUID(), batchId, row.id, profileId, row.device_id, row.date, row.domain,
        row.start_ms, row.end_ms, row.duration_seconds, row.channel, row.mode,
        row.target_classification_at_time || null, row.quota_bucket_at_time || row.mode,
        AUTO_RESTRICTED_REASON, context.account_id, now)),
    ]);
    segmentCount += segments.length;
    durationSeconds += batchSeconds;
    batchCount += 1;
  }

  const remaining = await nextCorrectionGroup(env, profileId, requestId, clientRequestId, weekStart, weekEnd);
  return {
    requestId,
    applicable: true,
    complete: !remaining,
    weekStart,
    weekEnd,
    segmentCount,
    durationSeconds,
    batchCount,
  };
}

export async function processRestrictedReattributions(
  env: Env,
  options: { profileId?: string; requestIds?: string[]; since?: number; maxRequests?: number; maxBatchesPerRequest?: number } = {},
) {
  const where = [`r.decision = 'reject'`, 'r.decided_at IS NOT NULL'];
  const binds: any[] = [];
  if (options.profileId) { where.push('r.profile_id = ?'); binds.push(options.profileId); }
  const requestIds = [...new Set((options.requestIds || []).filter(Boolean))];
  if (requestIds.length > 0) {
    const placeholders = requestIds.map(() => '?').join(',');
    where.push(`(r.id IN (${placeholders}) OR r.client_request_id IN (${placeholders}))`);
    binds.push(...requestIds, ...requestIds);
  } else {
    where.push('r.decided_at >= ?');
    binds.push(Number(options.since || Date.now() - 14 * DAY_MS));
  }
  const maxRequests = Math.max(1, Math.min(100, Number(options.maxRequests || 100)));
  const result = await env.DB.prepare(
    `SELECT r.id, r.profile_id FROM site_classification_requests_v1 r
      WHERE ${where.join(' AND ')} ORDER BY r.decided_at ASC LIMIT ${maxRequests}`
  ).bind(...binds).all<any>();
  const summaries: RestrictedReattributionSummary[] = [];
  for (const row of result.results || []) {
    try {
      summaries.push(await applyRestrictedReattributionForRequest(env, row.profile_id, row.id, {
        maxBatches: options.maxBatchesPerRequest,
      }));
    } catch {
      summaries.push({ requestId: row.id, applicable: true, complete: false, weekStart: null, weekEnd: null, segmentCount: 0, durationSeconds: 0, batchCount: 0 });
    }
  }
  return summaries;
}

function mapRow(row: any): UsageAccountingCorrection {
  return {
    id: row.id, batchId: row.batch_id, segmentId: row.segment_id,
    profileId: row.profile_id, deviceId: row.device_id, date: row.date, domain: row.domain,
    startMs: Number(row.start_ms), endMs: Number(row.end_ms), durationSeconds: Number(row.duration_seconds),
    channel: row.channel, originalMode: row.original_mode,
    originalTargetClassification: row.original_target_classification || null,
    originalQuotaBucket: row.original_quota_bucket || null,
    effectiveMode: row.effective_mode,
    effectiveTargetClassification: row.effective_target_classification,
    effectiveQuotaBucket: row.effective_quota_bucket,
    createdAt: Number(row.created_at || 0),
    managedTargetId: row.managed_target_id || null,
  };
}

export async function listUsageAccountingCorrections(
  env: Env,
  profileId: string,
  options: { from?: string; to?: string; deviceId?: string } = {},
): Promise<UsageAccountingCorrection[]> {
  const where = ['profile_id = ?'];
  const binds: any[] = [profileId];
  if (options.from) { where.push('date >= ?'); binds.push(options.from); }
  if (options.to) { where.push('date <= ?'); binds.push(options.to); }
  if (options.deviceId) { where.push('device_id = ?'); binds.push(options.deviceId); }
  try {
    const result = await env.DB.prepare(
      `SELECT c.*, s.managed_target_id
         FROM usage_segment_corrections_v1 c
         LEFT JOIN usage_segments_v1 s ON s.id = c.segment_id
        WHERE ${where.map((clause) => `c.${clause}`).join(' AND ')} ORDER BY c.start_ms ASC, c.segment_id ASC`
    ).bind(...binds).all<any>();
    return (result.results || []).map(mapRow);
  } catch {
    return [];
  }
}

export type DeviceCorrectionEvidence = Pick<UsageAccountingCorrection,
  'segmentId' | 'date' | 'startMs' | 'endMs' | 'durationSeconds' | 'channel' |
  'originalMode' | 'originalQuotaBucket' | 'effectiveMode' | 'effectiveQuotaBucket'>;

/** Read-only, device-scoped evidence. Unlike legacy config compaction, failures must surface. */
export async function listDeviceCorrectionEvidencePage(
  env: Env,
  profileId: string,
  deviceId: string,
  weekStart: string,
  weekEnd: string,
  anchorAtMs: number,
  offset: number,
  limit = 100,
): Promise<{ items: DeviceCorrectionEvidence[]; total: number; revision: string; nextOffset: number | null }> {
  if (!Number.isSafeInteger(anchorAtMs) || anchorAtMs < 0 || !Number.isSafeInteger(offset) || offset < 0
      || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError('Invalid correction evidence pagination');
  }
  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS total, COALESCE(MAX(created_at), 0) AS latest
       FROM usage_segment_corrections_v1
      WHERE profile_id = ? AND device_id = ? AND date >= ? AND date <= ? AND created_at <= ?`
  ).bind(profileId, deviceId, weekStart, weekEnd, anchorAtMs)
    .first<{ total: number; latest: number }>();
  const total = Number(count?.total || 0);
  const result = await env.DB.prepare(
    `SELECT segment_id,date,start_ms,end_ms,duration_seconds,channel,
            original_mode,original_quota_bucket,effective_mode,effective_quota_bucket
       FROM usage_segment_corrections_v1
      WHERE profile_id = ? AND device_id = ? AND date >= ? AND date <= ? AND created_at <= ?
      ORDER BY date ASC,start_ms ASC,segment_id ASC
      LIMIT ? OFFSET ?`
  ).bind(profileId, deviceId, weekStart, weekEnd, anchorAtMs, limit, offset).all<{
    segment_id: string; date: string; start_ms: number; end_ms: number;
    duration_seconds: number; channel: string; original_mode: string;
    original_quota_bucket: string | null; effective_mode: string; effective_quota_bucket: string;
  }>();
  const items = (result.results || []).map((row) => ({
    segmentId: row.segment_id,
    date: row.date,
    startMs: Number(row.start_ms),
    endMs: Number(row.end_ms),
    durationSeconds: Number(row.duration_seconds),
    channel: row.channel,
    originalMode: row.original_mode,
    originalQuotaBucket: row.original_quota_bucket,
    effectiveMode: row.effective_mode,
    effectiveQuotaBucket: row.effective_quota_bucket,
  }));
  return {
    items,
    total,
    revision: `${weekStart}:${weekEnd}:${total}:${Number(count?.latest || 0)}`,
    nextOffset: offset + items.length < total ? offset + items.length : null,
  };
}

function correctionHourSlices(correction: UsageAccountingCorrection) {
  const total = Math.max(0, correction.durationSeconds);
  if (correction.endMs <= correction.startMs) return [{ hourKey: new Date(correction.startMs + 8 * 3600000).toISOString().slice(0, 13), seconds: total }];
  const raw: Array<{ hourKey: string; ms: number; seconds: number; remainder: number }> = [];
  let cursor = correction.startMs;
  while (cursor < correction.endMs) {
    const shifted = cursor + 8 * 3600000;
    const hourStartShifted = Math.floor(shifted / 3600000) * 3600000;
    const end = Math.min(correction.endMs, hourStartShifted - 8 * 3600000 + 3600000);
    const ms = Math.max(0, end - cursor);
    raw.push({ hourKey: new Date(hourStartShifted).toISOString().slice(0, 13), ms, seconds: Math.floor(ms / 1000), remainder: ms % 1000 });
    cursor = end;
  }
  let remaining = Math.max(0, total - raw.reduce((sum, row) => sum + row.seconds, 0));
  for (const row of [...raw].sort((a, b) => b.remainder - a.remainder)) {
    if (remaining-- <= 0) break;
    row.seconds += 1;
  }
  return raw.map((row) => ({ hourKey: row.hourKey, seconds: row.seconds }));
}

function rowIdentity(row: any, kind: 'daily_domain' | 'hourly_domain' | 'daily_target' | 'hourly_target') {
  const hourly = kind.startsWith('hourly');
  const target = kind.endsWith('target');
  return [row.device_id, hourly ? row.hour_key : row.date, target ? row.target_key : row.domain,
    row.channel, row.mode, target ? row.quota_bucket : ''].join('\u0000');
}

export function applyCorrectionsToV1StatsRows(
  sourceRows: any[], corrections: UsageAccountingCorrection[], kind: 'daily_domain' | 'hourly_domain' | 'daily_target' | 'hourly_target'
) {
  const rows = (sourceRows || []).map((row) => ({ ...row }));
  const hourly = kind.startsWith('hourly');
  const target = kind.endsWith('target');
  for (const correction of corrections) {
    const slices = hourly ? correctionHourSlices(correction) : [{ hourKey: null, seconds: correction.durationSeconds }];
    for (const slice of slices) {
      if (slice.seconds <= 0) continue;
      const subject = target ? (correction.managedTargetId || `fallback:domain:${correction.domain}`) : correction.domain;
      const originalLookup: any = {
        device_id: correction.deviceId, date: correction.date, hour_key: slice.hourKey,
        domain: correction.domain, target_key: subject, channel: correction.channel,
        mode: correction.originalMode, quota_bucket: correction.originalQuotaBucket || correction.originalMode,
      };
      const originalIndex = rows.findIndex((row) => rowIdentity(row, kind) === rowIdentity(originalLookup, kind));
      if (originalIndex < 0 || Number(rows[originalIndex].duration_seconds || 0) < slice.seconds) continue;
      const original = rows[originalIndex];
      original.duration_seconds = Number(original.duration_seconds || 0) - slice.seconds;
      if (Number.isFinite(Number(original.segments_count))) original.segments_count = Math.max(0, Number(original.segments_count) - 1);
      const effective = {
        ...original,
        mode: correction.effectiveMode,
        ...(target ? {
          quota_bucket: correction.effectiveQuotaBucket,
          target_classification_at_time: correction.effectiveTargetClassification,
        } : {}),
        duration_seconds: slice.seconds,
        segments_count: 1,
      };
      const effectiveIndex = rows.findIndex((row) => rowIdentity(row, kind) === rowIdentity(effective, kind));
      if (effectiveIndex >= 0) {
        rows[effectiveIndex].duration_seconds = Number(rows[effectiveIndex].duration_seconds || 0) + slice.seconds;
        if (Number.isFinite(Number(rows[effectiveIndex].segments_count))) rows[effectiveIndex].segments_count = Number(rows[effectiveIndex].segments_count) + 1;
        if (target) rows[effectiveIndex].target_classification_at_time = correction.effectiveTargetClassification;
      } else {
        rows.push(effective);
      }
    }
  }
  return rows.filter((row) => Number(row.duration_seconds || 0) > 0);
}

export function compactUsageAccountingCorrectionDeltas(rows: UsageAccountingCorrection[]) {
  const groups = new Map<string, any>();
  for (const row of rows) {
    const key = [row.deviceId, row.date, row.domain, row.channel, row.originalMode,
      row.originalTargetClassification || '', row.originalQuotaBucket || '', row.effectiveMode,
      row.effectiveTargetClassification, row.effectiveQuotaBucket].join('\u0000');
    const current = groups.get(key) || { ...row, correctionIds: [], segmentCount: 0, durationSeconds: 0 };
    current.correctionIds.push(row.id);
    current.segmentCount += 1;
    current.durationSeconds += row.durationSeconds;
    groups.set(key, current);
  }
  return [...groups.values()].map(({ correctionIds, segmentCount, durationSeconds, ...row }) => ({
    id: correctionIds.sort()[0], deviceId: row.deviceId, date: row.date, domain: row.domain,
    channel: row.channel, originalMode: row.originalMode,
    originalTargetClassification: row.originalTargetClassification,
    originalQuotaBucket: row.originalQuotaBucket,
    effectiveMode: row.effectiveMode,
    effectiveTargetClassification: row.effectiveTargetClassification,
    effectiveQuotaBucket: row.effectiveQuotaBucket,
    segmentCount, durationSeconds,
  }));
}

function adjustBucket(rows: any[], keyFields: string[], lookup: Record<string, string>, delta: number) {
  const key = keyFields.map((field) => lookup[field] || '').join('\u0000');
  const found = rows.find((row) => keyFields.map((field) => row[field] || '').join('\u0000') === key);
  if (found) found.durationSeconds = Math.max(0, Number(found.durationSeconds || 0) + delta);
  else if (delta > 0) rows.push({ ...lookup, durationSeconds: delta });
  for (let index = rows.length - 1; index >= 0; index--) {
    if (Number(rows[index].durationSeconds || 0) <= 0) rows.splice(index, 1);
  }
}

export function applyCorrectionsToCompactDeviceAccounts(accounts: any[], corrections: UsageAccountingCorrection[]): any[] {
  const copies = accounts.map((account) => JSON.parse(JSON.stringify(account)));
  for (const correction of corrections) {
    const account = copies.find((item) => item.deviceId === correction.deviceId && item.date === correction.date);
    if (!account || correction.durationSeconds <= 0) continue;
    account.accountingCorrections = account.accountingCorrections || [];
    account.accountingCorrections.push({
      id: correction.id,
      segmentId: correction.segmentId,
      durationSeconds: correction.durationSeconds,
      originalMode: correction.originalMode,
      originalQuotaBucket: correction.originalQuotaBucket,
      effectiveMode: correction.effectiveMode,
      effectiveQuotaBucket: correction.effectiveQuotaBucket,
    });
    const seconds = correction.durationSeconds;
    adjustBucket(account.total.byChannelMode, ['channel', 'mode'], { channel: correction.channel, mode: correction.originalMode }, -seconds);
    adjustBucket(account.total.byChannelMode, ['channel', 'mode'], { channel: correction.channel, mode: correction.effectiveMode }, seconds);
    adjustBucket(account.total.byQuotaBucket, ['quotaBucket'], { quotaBucket: correction.originalQuotaBucket || correction.originalMode }, -seconds);
    adjustBucket(account.total.byQuotaBucket, ['quotaBucket'], { quotaBucket: correction.effectiveQuotaBucket }, seconds);
    if (correction.channel === 'active') {
      adjustBucket(account.quotaProjection.byQuotaBucket, ['quotaBucket'], { quotaBucket: correction.originalQuotaBucket || correction.originalMode }, -seconds);
      adjustBucket(account.quotaProjection.byQuotaBucket, ['quotaBucket'], { quotaBucket: correction.effectiveQuotaBucket }, seconds);
    }
  }
  return copies;
}

export function summarizeCompactDeviceAccounts(accounts: any[]) {
  const channelMode = new Map<string, number>();
  const quota = new Map<string, number>();
  let totalSeconds = 0;
  for (const account of accounts) {
    totalSeconds += Number(account?.total?.totalSeconds || 0);
    for (const row of account?.total?.byChannelMode || []) {
      const key = `${row.channel}\u0000${row.mode}`;
      channelMode.set(key, (channelMode.get(key) || 0) + Number(row.durationSeconds || 0));
    }
    for (const row of account?.total?.byQuotaBucket || []) {
      quota.set(row.quotaBucket, (quota.get(row.quotaBucket) || 0) + Number(row.durationSeconds || 0));
    }
  }
  return {
    totalSeconds,
    byChannelMode: [...channelMode.entries()].map(([key, durationSeconds]) => {
      const [channel, mode] = key.split('\u0000'); return { channel, mode, durationSeconds };
    }).sort((a, b) => `${a.channel}:${a.mode}`.localeCompare(`${b.channel}:${b.mode}`)),
    byQuotaBucket: [...quota.entries()].map(([quotaBucket, durationSeconds]) => ({ quotaBucket, durationSeconds }))
      .sort((a, b) => a.quotaBucket.localeCompare(b.quotaBucket)),
  };
}

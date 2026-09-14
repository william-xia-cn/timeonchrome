import { Env } from '../db/middleware';

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

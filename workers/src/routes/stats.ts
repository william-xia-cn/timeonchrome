// Stats 路由 - 统计上传/查询 (legacy + v1)
import { json, Env, verifyAccountToken } from '../db/middleware';
import { normalizeHostname } from '../../../extension/core/domain-semantics.js';
import { deviceUnboundResponse, verifyDeviceToken } from './deviceIdentity';
import {
  evaluateDailyUnclassifiedEmailNotifications,
  processEmailClassificationOutbox,
} from '../services/siteClassificationEmail';

// ── Segment payload schema validation ───────────────────────────────────────────

const VALID_CHANNELS = new Set(['active', 'backgroundMedia', 'pip']);
const VALID_MODES = new Set(['study', 'rest', 'locked', 'paused', 'unknown', 'composite']);
const VALID_MEDIA_CLASSES = new Set(['foregroundAudio', 'backgroundAudio', 'foregroundVideo', 'backgroundVideo', 'pip']);
const MEDIA_CLASS_FIELDS = [
  ['foregroundAudio', 'foregroundAudioSeconds'],
  ['backgroundAudio', 'backgroundAudioSeconds'],
  ['foregroundVideo', 'foregroundVideoSeconds'],
  ['backgroundVideo', 'backgroundVideoSeconds'],
  ['pip', 'pipSeconds'],
] as const;

function validateSegment(s: any): string | null {
  if (!s || typeof s !== 'object') return 'segment must be an object';
  if (!s.id || typeof s.id !== 'string') return 'segment.id is required';
  if (!s.date || typeof s.date !== 'string') return 'segment.date is required';
  if (typeof s.startMs !== 'number' || typeof s.endMs !== 'number') return 'segment.startMs/endMs must be numbers';
  if (s.endMs <= s.startMs) return 'segment.endMs must be > startMs';
  if (typeof s.durationSeconds !== 'number' || !Number.isFinite(s.durationSeconds) || s.durationSeconds < 0) return 'segment.durationSeconds must be >= 0';
  if (!s.domain || typeof s.domain !== 'string') return 'segment.domain is required';
  if (!s.channel || !VALID_CHANNELS.has(s.channel)) return `segment.channel must be one of: ${[...VALID_CHANNELS].join(', ')}`;
  if (!s.mode || !VALID_MODES.has(s.mode)) return `segment.mode must be one of: ${[...VALID_MODES].join(', ')}`;
  return null;
}

function validateStatsV1Domain(d: any): string | null {
  if (!d || typeof d !== 'object') return 'domain entry must be an object';
  if (!d.domain || typeof d.domain !== 'string') return 'domain.domain is required';
  if (!d.channel || !VALID_CHANNELS.has(d.channel)) return `domain.channel must be one of: ${[...VALID_CHANNELS].join(', ')}`;
  if (!d.mode || !VALID_MODES.has(d.mode)) return `domain.mode must be one of: ${[...VALID_MODES].join(', ')}`;
  if (typeof d.durationSeconds !== 'number' || d.durationSeconds < 0) return 'domain.durationSeconds must be >= 0';
  return null;
}

function normalizeTargetKey(t: any): string | null {
  const raw = typeof t?.targetKey === 'string' && t.targetKey.trim()
    ? t.targetKey.trim()
    : (typeof t?.managedTargetId === 'string' && t.managedTargetId.trim() ? t.managedTargetId.trim() : null);
  if (raw) return raw.slice(0, 512);
  const fallbackDomain = t?.fallbackDomain ? normalizeHostname(t.fallbackDomain) : null;
  return fallbackDomain ? `fallback:domain:${fallbackDomain}` : null;
}

function normalizeOptionalString(value: any, max = 512): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function expandTargetStatsRows(targets: any[] | undefined): Array<{
  targetKey: string;
  managedTargetId: string | null;
  managedTargetType: string | null;
  managedTargetNamespace: string | null;
  managedTargetValue: string | null;
  managedTargetLabelAtTime: string | null;
  targetSourceAtTime: string | null;
  targetRuleId: string | null;
  targetMatchLevel: string | null;
  targetClassificationAtTime: string | null;
  fallbackDomain: string | null;
  isFallback: number;
  channel: string;
  mode: string;
  quotaBucket: string;
  durationSeconds: number;
  segmentsCount: number;
  firstSeenAt: number | null;
  lastSeenAt: number | null;
}> {
  const expandedRows: Array<any> = [];
  if (!Array.isArray(targets)) return expandedRows;

  for (const t of targets) {
    if (!t || typeof t !== 'object') continue;
    const targetKey = normalizeTargetKey(t);
    if (!targetKey) continue;
    const fallbackDomain = t.fallbackDomain ? normalizeHostname(t.fallbackDomain) : null;
    const base = {
      targetKey,
      managedTargetId: normalizeOptionalString(t.managedTargetId, 128),
      managedTargetType: normalizeOptionalString(t.managedTargetType, 64),
      managedTargetNamespace: normalizeOptionalString(t.managedTargetNamespace, 64),
      managedTargetValue: normalizeOptionalString(t.managedTargetValue, 1024),
      managedTargetLabelAtTime: normalizeOptionalString(t.managedTargetLabelAtTime, 512),
      targetSourceAtTime: normalizeOptionalString(t.targetSourceAtTime, 64),
      targetRuleId: normalizeOptionalString(t.targetRuleId, 128),
      targetMatchLevel: normalizeOptionalString(t.targetMatchLevel, 64),
      targetClassificationAtTime: normalizeOptionalString(t.targetClassificationAtTime, 64),
      fallbackDomain,
      isFallback: t.isFallback ? 1 : 0,
      firstSeenAt: typeof t.firstSeenAt === 'number' ? t.firstSeenAt : null,
      lastSeenAt: typeof t.lastSeenAt === 'number' ? t.lastSeenAt : null,
    };

    if (Array.isArray(t.rows) && t.rows.length > 0) {
      for (const row of t.rows) {
        const channel = row?.channel;
        const mode = row?.mode;
        const quotaBucket = row?.quotaBucket || mode;
        const durationSeconds = Number(row?.durationSeconds || 0);
        if (!VALID_CHANNELS.has(channel) || !VALID_MODES.has(mode) || !VALID_MODES.has(quotaBucket)) continue;
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) continue;
        const segmentsCount = Number.isFinite(Number(row?.segmentsCount))
          ? Math.max(0, Math.trunc(Number(row.segmentsCount)))
          : 0;
        expandedRows.push({ ...base, channel, mode, quotaBucket, durationSeconds, segmentsCount });
      }
      continue;
    }

    const byChannel = [
      ['active', t.activeByMode || {}, t.activeByQuotaBucket || {}],
      ['backgroundMedia', t.backgroundMediaByMode || {}, t.backgroundMediaByQuotaBucket || {}],
      ['pip', t.pipByMode || {}, t.pipByQuotaBucket || {}],
    ] as const;
    for (const [channel, byMode, byQuota] of byChannel) {
      for (const [mode, seconds] of Object.entries(byMode || {})) {
        const durationSeconds = Number(seconds || 0);
        if (!VALID_MODES.has(mode) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) continue;
        const quotaBucket = VALID_MODES.has(mode) ? mode : 'unknown';
        expandedRows.push({ ...base, channel, mode, quotaBucket, durationSeconds, segmentsCount: 0 });
      }
      if (Object.keys(byMode || {}).length === 0) {
        for (const [quotaBucket, seconds] of Object.entries(byQuota || {})) {
          const durationSeconds = Number(seconds || 0);
          if (!VALID_MODES.has(quotaBucket) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) continue;
          expandedRows.push({ ...base, channel, mode: quotaBucket, quotaBucket, durationSeconds, segmentsCount: 0 });
        }
      }
    }
  }
  return expandedRows;
}

function validateMediaSegment(s: any): string | null {
  if (!s || typeof s !== 'object') return 'segment must be an object';
  if (!s.id || typeof s.id !== 'string') return 'segment.id is required';
  if (!s.date || typeof s.date !== 'string') return 'segment.date is required';
  if (typeof s.startMs !== 'number' || typeof s.endMs !== 'number') return 'segment.startMs/endMs must be numbers';
  if (s.endMs <= s.startMs) return 'segment.endMs must be > startMs';
  if (typeof s.durationSeconds !== 'number' || !Number.isFinite(s.durationSeconds) || s.durationSeconds < 0) return 'segment.durationSeconds must be >= 0';
  if (!s.domain || typeof s.domain !== 'string') return 'segment.domain is required';
  if (!s.mediaClass || !VALID_MEDIA_CLASSES.has(s.mediaClass)) return `segment.mediaClass must be one of: ${[...VALID_MEDIA_CLASSES].join(', ')}`;
  if (!s.mode || !VALID_MODES.has(s.mode)) return `segment.mode must be one of: ${[...VALID_MODES].join(', ')}`;
  return null;
}

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function isDateKey(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isHourKey(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(value);
}

function encodeSegmentCursor(startMs: number, id: string): string {
  const json = JSON.stringify({ startMs, id });
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeSegmentCursor(cursor: string | null): { startMs: number; id: string } | null {
  if (!cursor) return null;
  try {
    const normalized = cursor.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const parsed = JSON.parse(atob(padded));
    const startMs = Number(parsed?.startMs);
    const id = typeof parsed?.id === 'string' ? parsed.id : '';
    if (!Number.isFinite(startMs) || !id) return null;
    return { startMs, id };
  } catch (_) {
    return null;
  }
}

function stringifyJsonField(value: any): string | null {
  if (value === null || value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return null;
  }
}

function parseJsonField(value: string | null): any | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function normalizeDomainFilterInput(value: string | null): string | null {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  let normalized = raw;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      normalized = parsed.hostname;
    }
  } catch {
    normalized = raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  }
  normalized = normalized.replace(/\.+$/g, '').trim();
  return normalized || null;
}

function escapeSqlLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function addDomainLikeFilter(where: string[], binds: any[], column: string, rawValue: string | null): string | null {
  const normalized = normalizeDomainFilterInput(rawValue);
  if (!normalized) return rawValue ? 'invalid domain' : null;
  where.push(`${column} LIKE ? ESCAPE '\\'`);
  binds.push(`%${escapeSqlLike(normalized)}%`);
  return null;
}

function reconciliationStatus(statsSeconds: number, segmentSeconds: number): string {
  if (statsSeconds === segmentSeconds) return 'match';
  if (statsSeconds <= 0 && segmentSeconds > 0) return 'stats_missing';
  if (statsSeconds > 0 && segmentSeconds <= 0) return 'segments_missing';
  return 'mismatch';
}

async function verifyProfileDevice(env: Env, profileId: string, deviceId: string | null): Promise<boolean> {
  if (!deviceId) return true;
  const device = await env.DB.prepare(
    `SELECT id FROM devices WHERE id = ? AND profile_id = ?`
  ).bind(deviceId, profileId).first<{ id: string }>();
  return !!device;
}

type UsageStatsMetric = { count: number; seconds: number };
type UsageStatsIntegrity = {
  usageSegments: UsageStatsMetric;
  dailyStats: UsageStatsMetric;
  targetStats: UsageStatsMetric;
  hourlyStats: UsageStatsMetric;
  hourlyTargetStats: UsageStatsMetric;
  complete: boolean;
  issues: string[];
  checks: Record<string, boolean>;
};

async function readUsageStatsIntegrity(env: Env, profileId: string, deviceId: string, date: string): Promise<UsageStatsIntegrity> {
  const readMetric = async (table: string) => {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(duration_seconds), 0) as seconds
       FROM ${table}
       WHERE profile_id = ? AND device_id = ? AND date = ?`
    ).bind(profileId, deviceId, date).first<{ count: number; seconds: number }>();
    return {
      count: Number(row?.count || 0),
      seconds: Number(row?.seconds || 0),
    };
  };

  const [usageSegments, dailyStats, targetStats, hourlyStats, hourlyTargetStats] = await Promise.all([
    readMetric('usage_segments_v1'),
    readMetric('stats_v1'),
    readMetric('target_stats_v1'),
    readMetric('hourly_stats_v1'),
    readMetric('hourly_target_stats_v1'),
  ]);

  const usageSeconds = Number(usageSegments.seconds || 0);
  const checks = {
    dailyMatchesUsage: Number(dailyStats.seconds || 0) === usageSeconds,
    targetMatchesUsage: Number(targetStats.seconds || 0) === usageSeconds,
    hourlyMatchesUsage: Number(hourlyStats.seconds || 0) === usageSeconds,
    hourlyTargetMatchesUsage: Number(hourlyTargetStats.seconds || 0) === usageSeconds,
  };
  const issues = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);
  const complete = issues.length === 0;

  return {
    usageSegments,
    dailyStats,
    targetStats,
    hourlyStats,
    hourlyTargetStats,
    complete,
    issues,
    checks,
  };
}

export const statsRouter = {
  async handle(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url  = new URL(request.url);
    const path = url.pathname;

    // ═══════════════════════════════════════════════════════════════════════════════
    // V1: GET /device/stats-integrity/v1 — 终端按日期校验云端普通 usage 数据完整性
    // ═══════════════════════════════════════════════════════════════════════════════
    if (request.method === 'GET' && path === '/device/stats-integrity/v1') {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

      const device = await verifyDeviceToken(env, auth.slice(7), { updateLastSeen: true });
      if (!device) return json({ error: 'Invalid device token' }, 401);
      if (device.unbound) return deviceUnboundResponse(device.deviceId);

      const date = url.searchParams.get('date');
      if (!isDateKey(date)) return json({ error: 'date must be YYYY-MM-DD' }, 400);

      const integrity = await readUsageStatsIntegrity(env, device.profileId, device.deviceId, date);
      return json({
        profileId: device.profileId,
        deviceId: device.deviceId,
        date,
        ...integrity,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // V1: POST /device/media-segments/v1 — 上传已结算的媒体分段
    // ═══════════════════════════════════════════════════════════════════════════════
    if (request.method === 'POST' && path === '/device/media-segments/v1') {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

      const device = await verifyDeviceToken(env, auth.slice(7), { updateLastSeen: true });
      if (!device) return json({ error: 'Invalid device token' }, 401);
      if (device.unbound) return deviceUnboundResponse(device.deviceId);

      try {
        const body = await request.json<{ segments?: any[] }>();
        const segments = body?.segments;
        if (!Array.isArray(segments) || segments.length === 0) {
          return json({ error: 'segments array required' }, 400);
        }

        const now = Date.now();
        let inserted = 0;
        let updated = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const s of segments) {
          const validationError = validateMediaSegment(s);
          if (validationError) {
            failed++;
            errors.push(`${s?.id || 'unknown'}: ${validationError}`);
            continue;
          }
          const normalizedDomain = normalizeHostname(s.domain);
          if (!normalizedDomain) {
            failed++;
            errors.push(`${s.id}: invalid domain`);
            continue;
          }

          const existing = await env.DB.prepare(
            `SELECT id FROM media_segments_v1 WHERE id = ?`
          ).bind(s.id).first<{ id: string }>();
          const descriptionJson = stringifyJsonField(s.description || null);

          if (existing) {
            await env.DB.prepare(
              `UPDATE media_segments_v1
               SET tab_id = ?, window_id = ?, description_json = ?, uploaded_at = ?, updated_at = ?
               WHERE id = ?`
            ).bind(
              s.tabId == null ? null : String(s.tabId),
              typeof s.windowId === 'number' ? s.windowId : null,
              descriptionJson,
              now,
              now,
              s.id
            ).run();
            updated++;
          } else {
            await env.DB.prepare(
              `INSERT INTO media_segments_v1
               (id, profile_id, device_id, date, timezone, day_start_ms, day_end_ms,
                start_ms, end_ms, duration_seconds, domain, tab_id, window_id,
                media_class, media_kind, visibility, mode, settlement_reason,
                parent_segment_id, part_index, part_count, created_at, updated_at, uploaded_at,
                description_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              s.id, device.profileId, device.deviceId, s.date, s.timezone || 'Asia/Shanghai',
              typeof s.dayStartMs === 'number' ? s.dayStartMs : 0,
              typeof s.dayEndMs === 'number' ? s.dayEndMs : 0,
              s.startMs, s.endMs, s.durationSeconds, normalizedDomain,
              s.tabId == null ? null : String(s.tabId),
              typeof s.windowId === 'number' ? s.windowId : null,
              s.mediaClass, s.mediaKind || null, s.visibility || null, s.mode,
              s.settlementReason || '', s.parentSegmentId || null,
              typeof s.partIndex === 'number' ? s.partIndex : 1,
              typeof s.partCount === 'number' ? s.partCount : 1,
              s.createdAt || now, s.updatedAt || now, now,
              descriptionJson
            ).run();
            inserted++;
          }
        }

        return json({
          success: true,
          count: inserted + updated,
          inserted,
          updated,
          failed: failed > 0 ? failed : undefined,
          errors: errors.length > 0 ? errors : undefined,
        });
      } catch (e: any) {
        return json({ error: 'Failed to upload media segments: ' + e.message }, 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // V1: POST /device/media-stats/v1 — 上传每日媒体聚合统计
    // ═══════════════════════════════════════════════════════════════════════════════
    if (request.method === 'POST' && path === '/device/media-stats/v1') {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

      const device = await verifyDeviceToken(env, auth.slice(7), { updateLastSeen: true });
      if (!device) return json({ error: 'Invalid device token' }, 401);
      if (device.unbound) return deviceUnboundResponse(device.deviceId);

      try {
        const body = await request.json<{
          date?: string; timezone?: string; dayStartMs?: number; dayEndMs?: number;
          domains?: Array<{ domain: string; byMode?: Record<string, any>; [key: string]: any }>;
        }>();
        const date = body?.date;
        const domains = body?.domains;
        if (!date || !Array.isArray(domains)) {
          return json({ error: 'date and domains[] required' }, 400);
        }

        const expandedRows: Array<{ domain: string; mediaClass: string; mode: string; durationSeconds: number; firstSeenAt?: number; lastSeenAt?: number }> = [];
        for (const d of domains) {
          if (!d?.domain || typeof d.domain !== 'string') continue;
          const normalizedDomain = normalizeHostname(d.domain);
          if (!normalizedDomain) continue;
          const byMode = d.byMode && typeof d.byMode === 'object' ? d.byMode : {};
          let hasRows = false;
          for (const [mode, modeStats] of Object.entries(byMode)) {
            if (!VALID_MODES.has(mode) || !modeStats || typeof modeStats !== 'object') continue;
            for (const [mediaClass, field] of MEDIA_CLASS_FIELDS) {
              const seconds = Number((modeStats as any)[field] || 0);
              if (seconds > 0) {
                expandedRows.push({ domain: normalizedDomain, mediaClass, mode, durationSeconds: seconds, firstSeenAt: d.firstSeenAt, lastSeenAt: d.lastSeenAt });
                hasRows = true;
              }
            }
          }
          if (!hasRows) {
            for (const [mediaClass, field] of MEDIA_CLASS_FIELDS) {
              const seconds = Number(d[field] || 0);
              if (seconds > 0) {
                expandedRows.push({ domain: normalizedDomain, mediaClass, mode: 'unknown', durationSeconds: seconds, firstSeenAt: d.firstSeenAt, lastSeenAt: d.lastSeenAt });
              }
            }
          }
        }

        if (expandedRows.length === 0) {
          return json({ error: 'no valid media stats rows after expansion' }, 400);
        }

        const now = Date.now();
        let upserted = 0;
        for (const row of expandedRows) {
          const existing = await env.DB.prepare(
            `SELECT id FROM daily_media_stats_v1
             WHERE profile_id = ? AND device_id = ? AND date = ? AND domain = ? AND media_class = ? AND mode = ?`
          ).bind(device.profileId, device.deviceId, date, row.domain, row.mediaClass, row.mode).first<{ id: string }>();
          if (existing) {
            await env.DB.prepare(
              `UPDATE daily_media_stats_v1
               SET duration_seconds = ?, first_seen_at = ?, last_seen_at = ?, updated_at = ?
               WHERE id = ?`
            ).bind(row.durationSeconds, row.firstSeenAt || null, row.lastSeenAt || null, now, existing.id).run();
          } else {
            await env.DB.prepare(
              `INSERT INTO daily_media_stats_v1
               (id, profile_id, device_id, date, timezone, day_start_ms, day_end_ms,
                domain, media_class, mode, duration_seconds, first_seen_at, last_seen_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              crypto.randomUUID(), device.profileId, device.deviceId, date, body.timezone || 'Asia/Shanghai',
              typeof body.dayStartMs === 'number' ? body.dayStartMs : 0,
              typeof body.dayEndMs === 'number' ? body.dayEndMs : 0,
              row.domain, row.mediaClass, row.mode, row.durationSeconds,
              row.firstSeenAt || null, row.lastSeenAt || null, now, now
            ).run();
          }
          upserted++;
        }

        const notificationWork = evaluateDailyUnclassifiedEmailNotifications(env, device.profileId, date)
          .then((result) => result.queued > 0 ? processEmailClassificationOutbox(env) : null)
          .catch((error) => {
            console.warn('[site-classification-email] target stats evaluation failed', {
              profileId: device.profileId,
              date,
              error: String(error?.message || error || 'unknown').slice(0, 160),
            });
          });
        if (ctx) ctx.waitUntil(notificationWork);
        else void notificationWork;

        return json({ success: true, count: upserted, date, expandedRows: expandedRows.length });
      } catch (e: any) {
        return json({ error: 'Failed to upload media stats v1: ' + e.message }, 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // V1: POST /device/hourly-stats/v1 — 上传每小时前台/网页聚合统计
    // ═══════════════════════════════════════════════════════════════════════════════
    if (request.method === 'POST' && path === '/device/hourly-stats/v1') {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

      const device = await verifyDeviceToken(env, auth.slice(7), { updateLastSeen: true });
      if (!device) return json({ error: 'Invalid device token' }, 401);
      if (device.unbound) return deviceUnboundResponse(device.deviceId);

      try {
        const body = await request.json<{
          hourKey?: string; date?: string; hour?: number; timezone?: string; hourStartMs?: number; hourEndMs?: number;
          segmentsCount?: number; lastSegmentId?: string | null;
          domains?: Array<{ domain: string; rows?: Array<{ channel?: string; mode?: string; durationSeconds?: number; segmentsCount?: number }>; activeByMode?: Record<string, number>; backgroundMediaByMode?: Record<string, number>; pipByMode?: Record<string, number>; [key: string]: any }>;
        }>();
        const hourKey = body?.hourKey;
        const date = body?.date || (hourKey ? hourKey.slice(0, 10) : null);
        const hour = typeof body?.hour === 'number' ? body.hour : (hourKey ? Number(hourKey.slice(11, 13)) : null);
        const domains = body?.domains;
        if (!isHourKey(hourKey || null) || !date || !isDateKey(date) || !Number.isInteger(hour) || hour < 0 || hour > 23 || !Array.isArray(domains)) {
          return json({ error: 'hourKey/date/hour and domains[] required' }, 400);
        }
        const lastSegmentId = typeof body?.lastSegmentId === 'string' ? body.lastSegmentId : null;

        const expandedRows: Array<{ domain: string; channel: string; mode: string; durationSeconds: number; segmentsCount: number; firstSeenAt?: number; lastSeenAt?: number }> = [];
        for (const d of domains) {
          if (!d?.domain || typeof d.domain !== 'string') continue;
          const normalizedDomain = normalizeHostname(d.domain);
          if (!normalizedDomain) continue;
          if (Array.isArray(d.rows) && d.rows.length > 0) {
            for (const row of d.rows) {
              const durationSeconds = Number(row?.durationSeconds || 0);
              if (!VALID_CHANNELS.has(row?.channel || '') || !VALID_MODES.has(row?.mode || '') || durationSeconds <= 0) continue;
              expandedRows.push({
                domain: normalizedDomain,
                channel: row.channel!,
                mode: row.mode!,
                durationSeconds,
                segmentsCount: Number.isFinite(Number(row?.segmentsCount)) ? Math.max(0, Math.trunc(Number(row.segmentsCount))) : 0,
                firstSeenAt: d.firstSeenAt,
                lastSeenAt: d.lastSeenAt,
              });
            }
            continue;
          }
          const modeMaps = [
            { channel: 'active', byMode: d.activeByMode },
            { channel: 'backgroundMedia', byMode: d.backgroundMediaByMode },
            { channel: 'pip', byMode: d.pipByMode },
          ];
          let hasRows = false;
          for (const item of modeMaps) {
            const byMode = item.byMode && typeof item.byMode === 'object' ? item.byMode : {};
            for (const [mode, secs] of Object.entries(byMode)) {
              const durationSeconds = Number(secs || 0);
              if (durationSeconds > 0 && VALID_CHANNELS.has(item.channel) && VALID_MODES.has(mode)) {
                expandedRows.push({ domain: normalizedDomain, channel: item.channel, mode, durationSeconds, segmentsCount: 0, firstSeenAt: d.firstSeenAt, lastSeenAt: d.lastSeenAt });
                hasRows = true;
              }
            }
          }
          if (!hasRows) {
            const total = Number(d.activeSeconds || 0) + Number(d.backgroundMediaSeconds || 0) + Number(d.pipSeconds || 0);
            if (total > 0) {
              expandedRows.push({ domain: normalizedDomain, channel: 'active', mode: 'unknown', durationSeconds: total, segmentsCount: 0, firstSeenAt: d.firstSeenAt, lastSeenAt: d.lastSeenAt });
            }
          }
        }

        if (expandedRows.length === 0) return json({ error: 'no valid hourly stats rows after expansion' }, 400);

        const now = Date.now();
        let upserted = 0;
        for (const row of expandedRows) {
          const existing = await env.DB.prepare(
            `SELECT id FROM hourly_stats_v1
             WHERE profile_id = ? AND device_id = ? AND hour_key = ? AND domain = ? AND channel = ? AND mode = ?`
          ).bind(device.profileId, device.deviceId, hourKey, row.domain, row.channel, row.mode).first<{ id: string }>();
          if (existing) {
            await env.DB.prepare(
              `UPDATE hourly_stats_v1
               SET duration_seconds = ?, segments_count = ?, last_segment_id = ?, first_seen_at = ?, last_seen_at = ?, updated_at = ?
               WHERE id = ?`
            ).bind(row.durationSeconds, row.segmentsCount, lastSegmentId, row.firstSeenAt || null, row.lastSeenAt || null, now, existing.id).run();
          } else {
            await env.DB.prepare(
              `INSERT INTO hourly_stats_v1
               (id, profile_id, device_id, hour_key, date, hour, timezone, hour_start_ms, hour_end_ms,
                domain, channel, mode, duration_seconds, segments_count, last_segment_id, first_seen_at, last_seen_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              crypto.randomUUID(), device.profileId, device.deviceId, hourKey, date, hour, body.timezone || 'Asia/Shanghai',
              typeof body.hourStartMs === 'number' ? body.hourStartMs : 0,
              typeof body.hourEndMs === 'number' ? body.hourEndMs : 0,
              row.domain, row.channel, row.mode, row.durationSeconds, row.segmentsCount, lastSegmentId,
              row.firstSeenAt || null, row.lastSeenAt || null, now, now
            ).run();
          }
          upserted++;
        }

        return json({ success: true, count: upserted, hourKey, expandedRows: expandedRows.length });
      } catch (e: any) {
        return json({ error: 'Failed to upload hourly stats v1: ' + e.message }, 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // V1: POST /device/hourly-media-stats/v1 — 上传每小时媒体聚合统计
    // ═══════════════════════════════════════════════════════════════════════════════
    if (request.method === 'POST' && path === '/device/hourly-media-stats/v1') {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

      const device = await verifyDeviceToken(env, auth.slice(7), { updateLastSeen: true });
      if (!device) return json({ error: 'Invalid device token' }, 401);
      if (device.unbound) return deviceUnboundResponse(device.deviceId);

      try {
        const body = await request.json<{
          hourKey?: string; date?: string; hour?: number; timezone?: string; hourStartMs?: number; hourEndMs?: number;
          segmentsCount?: number; lastSegmentId?: string | null;
          domains?: Array<{ domain: string; byMode?: Record<string, any>; [key: string]: any }>;
        }>();
        const hourKey = body?.hourKey;
        const date = body?.date || (hourKey ? hourKey.slice(0, 10) : null);
        const hour = typeof body?.hour === 'number' ? body.hour : (hourKey ? Number(hourKey.slice(11, 13)) : null);
        const domains = body?.domains;
        if (!isHourKey(hourKey || null) || !date || !isDateKey(date) || !Number.isInteger(hour) || hour < 0 || hour > 23 || !Array.isArray(domains)) {
          return json({ error: 'hourKey/date/hour and domains[] required' }, 400);
        }
        const lastSegmentId = typeof body?.lastSegmentId === 'string' ? body.lastSegmentId : null;

        const expandedRows: Array<{ domain: string; mediaClass: string; mode: string; durationSeconds: number; segmentsCount: number; firstSeenAt?: number; lastSeenAt?: number }> = [];
        for (const d of domains) {
          if (!d?.domain || typeof d.domain !== 'string') continue;
          const normalizedDomain = normalizeHostname(d.domain);
          if (!normalizedDomain) continue;
          const byMode = d.byMode && typeof d.byMode === 'object' ? d.byMode : {};
          let hasRows = false;
          for (const [mode, modeStats] of Object.entries(byMode)) {
            if (!VALID_MODES.has(mode) || !modeStats || typeof modeStats !== 'object') continue;
            for (const [mediaClass, field] of MEDIA_CLASS_FIELDS) {
              const seconds = Number((modeStats as any)[field] || 0);
              if (seconds > 0) {
                expandedRows.push({
                  domain: normalizedDomain,
                  mediaClass,
                  mode,
                  durationSeconds: seconds,
                  segmentsCount: Number.isFinite(Number((modeStats as any)?.segmentCounts?.[mediaClass]))
                    ? Math.max(0, Math.trunc(Number((modeStats as any).segmentCounts[mediaClass])))
                    : 0,
                  firstSeenAt: d.firstSeenAt,
                  lastSeenAt: d.lastSeenAt,
                });
                hasRows = true;
              }
            }
          }
          if (!hasRows) {
            for (const [mediaClass, field] of MEDIA_CLASS_FIELDS) {
              const seconds = Number(d[field] || 0);
              if (seconds > 0) {
                expandedRows.push({ domain: normalizedDomain, mediaClass, mode: 'unknown', durationSeconds: seconds, segmentsCount: 0, firstSeenAt: d.firstSeenAt, lastSeenAt: d.lastSeenAt });
              }
            }
          }
        }

        if (expandedRows.length === 0) return json({ error: 'no valid hourly media stats rows after expansion' }, 400);

        const now = Date.now();
        let upserted = 0;
        for (const row of expandedRows) {
          const existing = await env.DB.prepare(
            `SELECT id FROM hourly_media_stats_v1
             WHERE profile_id = ? AND device_id = ? AND hour_key = ? AND domain = ? AND media_class = ? AND mode = ?`
          ).bind(device.profileId, device.deviceId, hourKey, row.domain, row.mediaClass, row.mode).first<{ id: string }>();
          if (existing) {
            await env.DB.prepare(
              `UPDATE hourly_media_stats_v1
               SET duration_seconds = ?, segments_count = ?, last_segment_id = ?, first_seen_at = ?, last_seen_at = ?, updated_at = ?
               WHERE id = ?`
            ).bind(row.durationSeconds, row.segmentsCount, lastSegmentId, row.firstSeenAt || null, row.lastSeenAt || null, now, existing.id).run();
          } else {
            await env.DB.prepare(
              `INSERT INTO hourly_media_stats_v1
               (id, profile_id, device_id, hour_key, date, hour, timezone, hour_start_ms, hour_end_ms,
                domain, media_class, mode, duration_seconds, segments_count, last_segment_id, first_seen_at, last_seen_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              crypto.randomUUID(), device.profileId, device.deviceId, hourKey, date, hour, body.timezone || 'Asia/Shanghai',
              typeof body.hourStartMs === 'number' ? body.hourStartMs : 0,
              typeof body.hourEndMs === 'number' ? body.hourEndMs : 0,
              row.domain, row.mediaClass, row.mode, row.durationSeconds, row.segmentsCount, lastSegmentId,
              row.firstSeenAt || null, row.lastSeenAt || null, now, now
            ).run();
          }
          upserted++;
        }

        return json({ success: true, count: upserted, hourKey, expandedRows: expandedRows.length });
      } catch (e: any) {
        return json({ error: 'Failed to upload hourly media stats v1: ' + e.message }, 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // V1: POST /device/usage-segments/v1 — 上传已结算的使用分段
    // ═══════════════════════════════════════════════════════════════════════════════
    if (request.method === 'POST' && path === '/device/usage-segments/v1') {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

      const device = await verifyDeviceToken(env, auth.slice(7), { updateLastSeen: true });
      if (!device) return json({ error: 'Invalid device token' }, 401);
      if (device.unbound) return deviceUnboundResponse(device.deviceId);

      try {
        const body = await request.json<{ segments?: any[] }>();
        const segments = body?.segments;

        if (!Array.isArray(segments) || segments.length === 0) {
          return json({ error: 'segments array required' }, 400);
        }

        const now = Date.now();
        let inserted = 0;
        let updated = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const s of segments) {
          const validationError = validateSegment(s);
          if (validationError) {
            failed++;
            errors.push(`${s.id || 'unknown'}: ${validationError}`);
            continue;
          }

          const normalizedDomain = normalizeHostname(s.domain);
          if (!normalizedDomain) {
            failed++;
            errors.push(`${s.id}: invalid domain`);
            continue;
          }

          const parentSegmentId = s.parentSegmentId || null;
          const partIndex = typeof s.partIndex === 'number' ? s.partIndex : 1;
          const partCount = typeof s.partCount === 'number' ? s.partCount : 1;
          const createdAt = s.createdAt || now;
          const updatedAt = s.updatedAt || now;
          const timezone = s.timezone || 'Asia/Shanghai';
          const dayStartMs = typeof s.dayStartMs === 'number' ? s.dayStartMs : 0;
          const dayEndMs = typeof s.dayEndMs === 'number' ? s.dayEndMs : 0;
          const sourceState = s.sourceState || '';
          const settlementReason = s.settlementReason || '';
          const deviceId = device.deviceId;
          const descriptionJson = stringifyJsonField(s.description || null);
          const managedTargetId = normalizeOptionalString(s.managedTargetId, 128);
          const managedTargetType = normalizeOptionalString(s.managedTargetType, 64);
          const managedTargetNamespace = normalizeOptionalString(s.managedTargetNamespace, 64);
          const managedTargetValue = normalizeOptionalString(s.managedTargetValue, 1024);
          const managedTargetLabelAtTime = normalizeOptionalString(s.managedTargetLabelAtTime, 512);
          const targetSourceAtTime = normalizeOptionalString(s.targetSourceAtTime, 64);
          const targetRuleId = normalizeOptionalString(s.targetRuleId, 128);
          const targetMatchLevel = normalizeOptionalString(s.targetMatchLevel, 64);
          const targetClassificationAtTime = normalizeOptionalString(s.targetClassificationAtTime, 64);
          const quotaBucketAtTime = VALID_MODES.has(s.quotaBucketAtTime) ? s.quotaBucketAtTime : null;

          // Idempotent upsert by segment id
          const existing = await env.DB.prepare(
            `SELECT id FROM usage_segments_v1 WHERE id = ?`
          ).bind(s.id).first<{ id: string }>();

          if (existing) {
            // 已存在：更新上传时间与终端诊断字段
            await env.DB.prepare(
              `UPDATE usage_segments_v1
               SET tab_id = ?, window_id = ?, description_json = ?,
                   managed_target_id = ?, managed_target_type = ?, managed_target_namespace = ?,
                   managed_target_value = ?, managed_target_label_at_time = ?, target_source_at_time = ?,
                   target_rule_id = ?, target_match_level = ?, target_classification_at_time = ?,
                   quota_bucket_at_time = ?, uploaded_at = ?, updated_at = ?
               WHERE id = ?`
            ).bind(
              s.tabId == null ? null : String(s.tabId),
              typeof s.windowId === 'number' ? s.windowId : null,
              descriptionJson,
              managedTargetId,
              managedTargetType,
              managedTargetNamespace,
              managedTargetValue,
              managedTargetLabelAtTime,
              targetSourceAtTime,
              targetRuleId,
              targetMatchLevel,
              targetClassificationAtTime,
              quotaBucketAtTime,
              now,
              now,
              s.id
            ).run();
            updated++;
          } else {
            await env.DB.prepare(
              `INSERT INTO usage_segments_v1
               (id, profile_id, device_id, date, timezone, day_start_ms, day_end_ms,
                start_ms, end_ms, duration_seconds, domain, channel, mode,
                source_state, settlement_reason,
                parent_segment_id, part_index, part_count,
                created_at, updated_at, uploaded_at, tab_id, window_id, description_json,
                managed_target_id, managed_target_type, managed_target_namespace,
                managed_target_value, managed_target_label_at_time, target_source_at_time,
                target_rule_id, target_match_level, target_classification_at_time, quota_bucket_at_time)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                       ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                       ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              s.id, device.profileId, deviceId, s.date, timezone, dayStartMs, dayEndMs,
              s.startMs, s.endMs, s.durationSeconds, normalizedDomain, s.channel, s.mode,
              sourceState, settlementReason,
              parentSegmentId, partIndex, partCount,
              createdAt, updatedAt, now,
              s.tabId == null ? null : String(s.tabId),
              typeof s.windowId === 'number' ? s.windowId : null,
              descriptionJson,
              managedTargetId,
              managedTargetType,
              managedTargetNamespace,
              managedTargetValue,
              managedTargetLabelAtTime,
              targetSourceAtTime,
              targetRuleId,
              targetMatchLevel,
              targetClassificationAtTime,
              quotaBucketAtTime
            ).run();
            inserted++;
          }
        }

        // 写入审计日志
        let payloadHash = '';
        try {
          const hashBuffer = await crypto.subtle.digest(
            'SHA-256', new TextEncoder().encode(JSON.stringify(segments))
          );
          payloadHash = Array.from(new Uint8Array(hashBuffer), b => b.toString(16).padStart(2, '0')).join('');
        } catch (_) {}

        await env.DB.prepare(
          `INSERT INTO segment_upload_log
           (id, profile_id, device_id, batch_id, received_count, accepted_count,
            inserted_count, updated_count, duplicate_count, failed_count, payload_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          crypto.randomUUID(), device.profileId, device.deviceId, null,
          segments.length, segments.length - failed,
          inserted, updated, 0, failed, payloadHash, now
        ).run();

        return json({
          success: true,
          count: inserted + updated,
          inserted,
          updated,
          failed: failed > 0 ? failed : undefined,
          errors: errors.length > 0 ? errors : undefined,
        });
      } catch (e: any) {
        return json({ error: 'Failed to upload segments: ' + e.message }, 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // V1: POST /device/stats/v1 — 上传每日聚合统计
    // 接受 buildDailyStatsUploadPayload 的嵌套聚合形状（domains[].activeByMode 等）。
    // 在写入 stats_v1 之前，将按域名的 byMode 对象展开为逐 channel+mode 的平展行。
    // ═══════════════════════════════════════════════════════════════════════════════
    if (request.method === 'POST' && path === '/device/stats/v1') {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

      const device = await verifyDeviceToken(env, auth.slice(7), { updateLastSeen: true });
      if (!device) return json({ error: 'Invalid device token' }, 401);
      if (device.unbound) return deviceUnboundResponse(device.deviceId);

      try {
        const body = await request.json<{
          schemaVersion?: number; date?: string; timezone?: string;
          dayStartMs?: number; dayEndMs?: number;
          segmentsCount?: number; lastSegmentId?: string;
          domains?: Array<{
            domain: string;
            activeSeconds?: number; backgroundMediaSeconds?: number; pipSeconds?: number;
            totalSeconds?: number;
            activeByMode?: Record<string, number>;
            backgroundMediaByMode?: Record<string, number>;
            pipByMode?: Record<string, number>;
            firstSeenAt?: number; lastSeenAt?: number; lastUpdatedAt?: number;
          }>;
        }>();
        const date = body?.date;
        const domains = body?.domains;

        if (!date || !Array.isArray(domains)) {
          return json({ error: 'date and domains[] required' }, 400);
        }

        // 将嵌套的 byMode 载荷拆解为平展的 channel+mode 行
        const expandedRows: Array<{ domain: string; channel: string; mode: string; durationSeconds: number }> = [];

        for (const d of domains) {
          if (!d || !d.domain || typeof d.domain !== 'string') continue;
          const normalizedDomain = normalizeHostname(d.domain);
          if (!normalizedDomain) continue;

          let hasRows = false;

          // activeByMode → channel = 'active'
          if (d.activeByMode && typeof d.activeByMode === 'object') {
            for (const [mode, secs] of Object.entries(d.activeByMode)) {
              if (typeof secs === 'number' && secs > 0 && VALID_MODES.has(mode)) {
                expandedRows.push({ domain: normalizedDomain, channel: 'active', mode, durationSeconds: secs });
                hasRows = true;
              }
            }
          }

          // backgroundMediaByMode → channel = 'backgroundMedia'
          if (d.backgroundMediaByMode && typeof d.backgroundMediaByMode === 'object') {
            for (const [mode, secs] of Object.entries(d.backgroundMediaByMode)) {
              if (typeof secs === 'number' && secs > 0 && VALID_MODES.has(mode)) {
                expandedRows.push({ domain: normalizedDomain, channel: 'backgroundMedia', mode, durationSeconds: secs });
                hasRows = true;
              }
            }
          }

          // pipByMode → channel = 'pip'
          if (d.pipByMode && typeof d.pipByMode === 'object') {
            for (const [mode, secs] of Object.entries(d.pipByMode)) {
              if (typeof secs === 'number' && secs > 0 && VALID_MODES.has(mode)) {
                expandedRows.push({ domain: normalizedDomain, channel: 'pip', mode, durationSeconds: secs });
                hasRows = true;
              }
            }
          }

          // 如果没有 byMode 数据但有总量，使用 'unknown' 模式
          if (!hasRows) {
            const total = (d.activeSeconds || 0) + (d.backgroundMediaSeconds || 0) + (d.pipSeconds || 0);
            if (total > 0) {
              expandedRows.push({ domain: normalizedDomain, channel: 'active', mode: 'unknown', durationSeconds: total });
            }
          }
        }

        if (expandedRows.length === 0) {
          return json({ error: 'no valid stats rows after expansion' }, 400);
        }

        const now = Date.now();
        const timezone = body.timezone || 'Asia/Shanghai';
        const dayStartMs = typeof body.dayStartMs === 'number' ? body.dayStartMs : 0;
        const dayEndMs = typeof body.dayEndMs === 'number' ? body.dayEndMs : 0;
        let upserted = 0;

        for (const row of expandedRows) {
          // Idempotent upsert by (profile_id, device_id, date, domain, channel, mode)
          const existing = await env.DB.prepare(
            `SELECT id FROM stats_v1
             WHERE profile_id = ? AND device_id = ? AND date = ? AND domain = ? AND channel = ? AND mode = ?`
          ).bind(device.profileId, device.deviceId, date, row.domain, row.channel, row.mode).first<{ id: string }>();

          if (existing) {
            await env.DB.prepare(
              `UPDATE stats_v1 SET duration_seconds = ?, updated_at = ? WHERE id = ?`
            ).bind(row.durationSeconds, now, existing.id).run();
          } else {
            await env.DB.prepare(
              `INSERT INTO stats_v1
               (id, profile_id, device_id, date, timezone, day_start_ms, day_end_ms,
                domain, channel, mode, duration_seconds,
                first_seen_at, last_seen_at,
                created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              crypto.randomUUID(), device.profileId, device.deviceId,
              date, timezone, dayStartMs, dayEndMs,
              row.domain, row.channel, row.mode, row.durationSeconds,
              now, now,
              now, now
            ).run();
          }
          upserted++;
        }

        // 写入审计日志
        let payloadHash = '';
        try {
          const hashBuffer = await crypto.subtle.digest(
            'SHA-256', new TextEncoder().encode(JSON.stringify(domains))
          );
          payloadHash = Array.from(new Uint8Array(hashBuffer), b => b.toString(16).padStart(2, '0')).join('');
        } catch (_) {}

        await env.DB.prepare(
          `INSERT INTO stats_upload_log
           (id, profile_id, device_id, date, received_domain_count, received_row_count,
            upserted_count, failed_count, payload_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          crypto.randomUUID(), device.profileId, device.deviceId,
          date, domains.length, expandedRows.length,
          upserted, 0, payloadHash, now
        ).run();

        return json({
          success: true,
          count: upserted,
          date,
          expandedRows: expandedRows.length,
        });
      } catch (e: any) {
        return json({ error: 'Failed to upload stats v1: ' + e.message }, 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // V1: POST /device/target-stats/v1 — 上传每日 managed target 聚合统计
    // ═══════════════════════════════════════════════════════════════════════════════
    if (request.method === 'POST' && path === '/device/target-stats/v1') {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

      const device = await verifyDeviceToken(env, auth.slice(7), { updateLastSeen: true });
      if (!device) return json({ error: 'Invalid device token' }, 401);
      if (device.unbound) return deviceUnboundResponse(device.deviceId);

      try {
        const body = await request.json<{
          date?: string; timezone?: string; dayStartMs?: number; dayEndMs?: number;
          segmentsCount?: number; lastSegmentId?: string | null; targets?: any[];
        }>();
        const date = body?.date;
        if (!isDateKey(date || null) || !Array.isArray(body?.targets)) {
          return json({ error: 'date and targets[] required' }, 400);
        }

        const expandedRows = expandTargetStatsRows(body.targets);
        if (expandedRows.length === 0) {
          return json({ error: 'no valid target stats rows after expansion' }, 400);
        }

        const now = Date.now();
        const lastSegmentId = typeof body?.lastSegmentId === 'string' ? body.lastSegmentId : null;
        let upserted = 0;

        for (const row of expandedRows) {
          const existing = await env.DB.prepare(
            `SELECT id FROM target_stats_v1
             WHERE profile_id = ? AND device_id = ? AND date = ? AND target_key = ? AND channel = ? AND mode = ? AND quota_bucket = ?`
          ).bind(device.profileId, device.deviceId, date, row.targetKey, row.channel, row.mode, row.quotaBucket).first<{ id: string }>();

          if (existing) {
            await env.DB.prepare(
              `UPDATE target_stats_v1
               SET managed_target_id = ?, managed_target_type = ?, managed_target_namespace = ?,
                   managed_target_value = ?, managed_target_label_at_time = ?, target_source_at_time = ?,
                   target_rule_id = ?, target_match_level = ?, target_classification_at_time = ?,
                   fallback_domain = ?, is_fallback = ?, duration_seconds = ?, segments_count = ?,
                   last_segment_id = ?, first_seen_at = ?, last_seen_at = ?, updated_at = ?
               WHERE id = ?`
            ).bind(
              row.managedTargetId, row.managedTargetType, row.managedTargetNamespace,
              row.managedTargetValue, row.managedTargetLabelAtTime, row.targetSourceAtTime,
              row.targetRuleId, row.targetMatchLevel, row.targetClassificationAtTime,
              row.fallbackDomain, row.isFallback, row.durationSeconds, row.segmentsCount,
              lastSegmentId, row.firstSeenAt, row.lastSeenAt, now, existing.id
            ).run();
          } else {
            await env.DB.prepare(
              `INSERT INTO target_stats_v1
               (id, profile_id, device_id, date, timezone, day_start_ms, day_end_ms,
                target_key, managed_target_id, managed_target_type, managed_target_namespace,
                managed_target_value, managed_target_label_at_time, target_source_at_time,
                target_rule_id, target_match_level, target_classification_at_time,
                fallback_domain, is_fallback, channel, mode, quota_bucket, duration_seconds,
                segments_count, last_segment_id, first_seen_at, last_seen_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              crypto.randomUUID(), device.profileId, device.deviceId, date,
              body.timezone || 'Asia/Shanghai',
              typeof body.dayStartMs === 'number' ? body.dayStartMs : 0,
              typeof body.dayEndMs === 'number' ? body.dayEndMs : 0,
              row.targetKey, row.managedTargetId, row.managedTargetType, row.managedTargetNamespace,
              row.managedTargetValue, row.managedTargetLabelAtTime, row.targetSourceAtTime,
              row.targetRuleId, row.targetMatchLevel, row.targetClassificationAtTime,
              row.fallbackDomain, row.isFallback, row.channel, row.mode, row.quotaBucket, row.durationSeconds,
              row.segmentsCount, lastSegmentId, row.firstSeenAt, row.lastSeenAt, now, now
            ).run();
          }
          upserted++;
        }

        return json({ success: true, count: upserted, date, expandedRows: expandedRows.length });
      } catch (e: any) {
        return json({ error: 'Failed to upload target stats v1: ' + e.message }, 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // V1: POST /device/hourly-target-stats/v1 — 上传每小时 managed target 聚合统计
    // ═══════════════════════════════════════════════════════════════════════════════
    if (request.method === 'POST' && path === '/device/hourly-target-stats/v1') {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

      const device = await verifyDeviceToken(env, auth.slice(7), { updateLastSeen: true });
      if (!device) return json({ error: 'Invalid device token' }, 401);
      if (device.unbound) return deviceUnboundResponse(device.deviceId);

      try {
        const body = await request.json<{
          hourKey?: string; date?: string; hour?: number; timezone?: string; hourStartMs?: number; hourEndMs?: number;
          segmentsCount?: number; lastSegmentId?: string | null; targets?: any[];
        }>();
        const hourKey = body?.hourKey;
        const date = body?.date || (hourKey ? hourKey.slice(0, 10) : null);
        const hour = typeof body?.hour === 'number' ? body.hour : (hourKey ? Number(hourKey.slice(11, 13)) : null);
        if (!isHourKey(hourKey || null) || !isDateKey(date || null) || !Number.isInteger(hour) || hour < 0 || hour > 23 || !Array.isArray(body?.targets)) {
          return json({ error: 'hourKey/date/hour and targets[] required' }, 400);
        }

        const expandedRows = expandTargetStatsRows(body.targets);
        if (expandedRows.length === 0) return json({ error: 'no valid hourly target stats rows after expansion' }, 400);

        const now = Date.now();
        const lastSegmentId = typeof body?.lastSegmentId === 'string' ? body.lastSegmentId : null;
        let upserted = 0;

        for (const row of expandedRows) {
          const existing = await env.DB.prepare(
            `SELECT id FROM hourly_target_stats_v1
             WHERE profile_id = ? AND device_id = ? AND hour_key = ? AND target_key = ? AND channel = ? AND mode = ? AND quota_bucket = ?`
          ).bind(device.profileId, device.deviceId, hourKey, row.targetKey, row.channel, row.mode, row.quotaBucket).first<{ id: string }>();

          if (existing) {
            await env.DB.prepare(
              `UPDATE hourly_target_stats_v1
               SET managed_target_id = ?, managed_target_type = ?, managed_target_namespace = ?,
                   managed_target_value = ?, managed_target_label_at_time = ?, target_source_at_time = ?,
                   target_rule_id = ?, target_match_level = ?, target_classification_at_time = ?,
                   fallback_domain = ?, is_fallback = ?, duration_seconds = ?, segments_count = ?,
                   last_segment_id = ?, first_seen_at = ?, last_seen_at = ?, updated_at = ?
               WHERE id = ?`
            ).bind(
              row.managedTargetId, row.managedTargetType, row.managedTargetNamespace,
              row.managedTargetValue, row.managedTargetLabelAtTime, row.targetSourceAtTime,
              row.targetRuleId, row.targetMatchLevel, row.targetClassificationAtTime,
              row.fallbackDomain, row.isFallback, row.durationSeconds, row.segmentsCount,
              lastSegmentId, row.firstSeenAt, row.lastSeenAt, now, existing.id
            ).run();
          } else {
            await env.DB.prepare(
              `INSERT INTO hourly_target_stats_v1
               (id, profile_id, device_id, hour_key, date, hour, timezone, hour_start_ms, hour_end_ms,
                target_key, managed_target_id, managed_target_type, managed_target_namespace,
                managed_target_value, managed_target_label_at_time, target_source_at_time,
                target_rule_id, target_match_level, target_classification_at_time,
                fallback_domain, is_fallback, channel, mode, quota_bucket, duration_seconds,
                segments_count, last_segment_id, first_seen_at, last_seen_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              crypto.randomUUID(), device.profileId, device.deviceId, hourKey, date, hour,
              body.timezone || 'Asia/Shanghai',
              typeof body.hourStartMs === 'number' ? body.hourStartMs : 0,
              typeof body.hourEndMs === 'number' ? body.hourEndMs : 0,
              row.targetKey, row.managedTargetId, row.managedTargetType, row.managedTargetNamespace,
              row.managedTargetValue, row.managedTargetLabelAtTime, row.targetSourceAtTime,
              row.targetRuleId, row.targetMatchLevel, row.targetClassificationAtTime,
              row.fallbackDomain, row.isFallback, row.channel, row.mode, row.quotaBucket, row.durationSeconds,
              row.segmentsCount, lastSegmentId, row.firstSeenAt, row.lastSeenAt, now, now
            ).run();
          }
          upserted++;
        }

        return json({ success: true, count: upserted, hourKey, expandedRows: expandedRows.length });
      } catch (e: any) {
        return json({ error: 'Failed to upload hourly target stats v1: ' + e.message }, 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // V1: GET /profiles/:id/stats/v1 — 查询 v1 每日聚合统计
    // ═══════════════════════════════════════════════════════════════════════════════
    const statsV1Match = path.match(/^\/profiles\/([^/]+)\/stats\/v1$/);
    if (request.method === 'GET' && statsV1Match) {
      const profileId = statsV1Match[1];
      const accountId = await verifyAccountToken(request, env.JWT_SECRET);
      if (!accountId) return json({ error: 'Unauthorized' }, 401);

      const profile = await env.DB.prepare(
        `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
      ).bind(profileId, accountId).first<{ id: string }>();
      if (!profile) return json({ error: 'Profile not found' }, 404);

      const from = url.searchParams.get('from') || (() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
      })();
      const to = url.searchParams.get('to') || new Date().toISOString().split('T')[0];
      const deviceId = url.searchParams.get('deviceId');
      if (!(await verifyProfileDevice(env, profileId, deviceId))) return json({ error: 'Device not found' }, 404);

      const where: string[] = ['profile_id = ?', 'date >= ?', 'date <= ?'];
      const binds: any[] = [profileId, from, to];
      if (deviceId) { where.push('device_id = ?'); binds.push(deviceId); }
      const result = await env.DB.prepare(
        `SELECT device_id, date, timezone, day_start_ms, day_end_ms,
                domain, channel, mode, duration_seconds,
                first_seen_at, last_seen_at, updated_at
         FROM stats_v1
         WHERE ${where.join(' AND ')}
         ORDER BY date DESC, domain ASC, channel ASC, mode ASC`
      ).bind(...binds).all<{
        device_id: string; date: string; timezone: string; day_start_ms: number; day_end_ms: number;
        domain: string; channel: string; mode: string; duration_seconds: number;
        first_seen_at: number; last_seen_at: number; updated_at: number;
      }>();

      return json({ stats: result.results || [] });
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // V1: GET /profiles/:id/hourly-stats/v1 — 查询 v1 每小时聚合统计
    // ═══════════════════════════════════════════════════════════════════════════════
    const hourlyStatsV1Match = path.match(/^\/profiles\/([^/]+)\/hourly-stats\/v1$/);
    if (request.method === 'GET' && hourlyStatsV1Match) {
      const profileId = hourlyStatsV1Match[1];
      const accountId = await verifyAccountToken(request, env.JWT_SECRET);
      if (!accountId) return json({ error: 'Unauthorized' }, 401);

      const profile = await env.DB.prepare(
        `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
      ).bind(profileId, accountId).first<{ id: string }>();
      if (!profile) return json({ error: 'Profile not found' }, 404);

      const from = url.searchParams.get('from') || (() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
      })();
      const to = url.searchParams.get('to') || new Date().toISOString().split('T')[0];
      const rawDomain = url.searchParams.get('domain');
      const domain = rawDomain ? normalizeHostname(rawDomain) : null;
      const channel = url.searchParams.get('channel');
      const mode = url.searchParams.get('mode');
      const deviceId = url.searchParams.get('deviceId');
      if ((from && !isDateKey(from)) || (to && !isDateKey(to))) return json({ error: 'from/to must be YYYY-MM-DD' }, 400);
      if (rawDomain && !domain) return json({ error: 'invalid domain' }, 400);
      if (channel && !VALID_CHANNELS.has(channel)) return json({ error: 'invalid channel' }, 400);
      if (mode && !VALID_MODES.has(mode)) return json({ error: 'invalid mode' }, 400);
      if (!(await verifyProfileDevice(env, profileId, deviceId))) return json({ error: 'Device not found' }, 404);

      const where: string[] = ['profile_id = ?', 'date >= ?', 'date <= ?'];
      const binds: any[] = [profileId, from, to];
      if (deviceId) { where.push('device_id = ?'); binds.push(deviceId); }
      if (domain) { where.push('domain = ?'); binds.push(domain); }
      if (channel) { where.push('channel = ?'); binds.push(channel); }
      if (mode) { where.push('mode = ?'); binds.push(mode); }

      const result = await env.DB.prepare(
        `SELECT device_id, hour_key, date, hour, timezone, hour_start_ms, hour_end_ms,
                domain, channel, mode, duration_seconds,
                segments_count, last_segment_id, first_seen_at, last_seen_at, updated_at
         FROM hourly_stats_v1
         WHERE ${where.join(' AND ')}
         ORDER BY hour_key DESC, domain ASC, channel ASC, mode ASC`
      ).bind(...binds).all<any>();

      return json({ stats: result.results || [] });
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // V1: GET /profiles/:id/target-stats/v1 — 查询每日 managed target 聚合统计
    // ═══════════════════════════════════════════════════════════════════════════════
    const targetStatsV1Match = path.match(/^\/profiles\/([^/]+)\/target-stats\/v1$/);
    if (request.method === 'GET' && targetStatsV1Match) {
      const profileId = targetStatsV1Match[1];
      const accountId = await verifyAccountToken(request, env.JWT_SECRET);
      if (!accountId) return json({ error: 'Unauthorized' }, 401);

      const profile = await env.DB.prepare(
        `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
      ).bind(profileId, accountId).first<{ id: string }>();
      if (!profile) return json({ error: 'Profile not found' }, 404);

      const from = url.searchParams.get('from') || (() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
      })();
      const to = url.searchParams.get('to') || new Date().toISOString().split('T')[0];
      const deviceId = url.searchParams.get('deviceId');
      const targetKey = url.searchParams.get('targetKey');
      const channel = url.searchParams.get('channel');
      const mode = url.searchParams.get('mode');
      const quotaBucket = url.searchParams.get('quotaBucket');
      if ((from && !isDateKey(from)) || (to && !isDateKey(to))) return json({ error: 'from/to must be YYYY-MM-DD' }, 400);
      if (channel && !VALID_CHANNELS.has(channel)) return json({ error: 'invalid channel' }, 400);
      if (mode && !VALID_MODES.has(mode)) return json({ error: 'invalid mode' }, 400);
      if (quotaBucket && !VALID_MODES.has(quotaBucket)) return json({ error: 'invalid quotaBucket' }, 400);
      if (!(await verifyProfileDevice(env, profileId, deviceId))) return json({ error: 'Device not found' }, 404);

      const where: string[] = ['profile_id = ?', 'date >= ?', 'date <= ?'];
      const binds: any[] = [profileId, from, to];
      if (deviceId) { where.push('device_id = ?'); binds.push(deviceId); }
      if (targetKey) { where.push('target_key = ?'); binds.push(targetKey); }
      if (channel) { where.push('channel = ?'); binds.push(channel); }
      if (mode) { where.push('mode = ?'); binds.push(mode); }
      if (quotaBucket) { where.push('quota_bucket = ?'); binds.push(quotaBucket); }

      const result = await env.DB.prepare(
        `SELECT device_id, date, timezone, day_start_ms, day_end_ms,
                target_key, managed_target_id, managed_target_type, managed_target_namespace,
                managed_target_value, managed_target_label_at_time, target_source_at_time,
                target_rule_id, target_match_level, target_classification_at_time,
                fallback_domain, is_fallback, channel, mode, quota_bucket, duration_seconds,
                segments_count, last_segment_id, first_seen_at, last_seen_at, updated_at
         FROM target_stats_v1
         WHERE ${where.join(' AND ')}
         ORDER BY date DESC, target_key ASC, channel ASC, mode ASC, quota_bucket ASC`
      ).bind(...binds).all<any>();

      return json({ stats: result.results || [] });
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // V1: GET /profiles/:id/hourly-target-stats/v1 — 查询每小时 managed target 聚合统计
    // ═══════════════════════════════════════════════════════════════════════════════
    const hourlyTargetStatsV1Match = path.match(/^\/profiles\/([^/]+)\/hourly-target-stats\/v1$/);
    if (request.method === 'GET' && hourlyTargetStatsV1Match) {
      const profileId = hourlyTargetStatsV1Match[1];
      const accountId = await verifyAccountToken(request, env.JWT_SECRET);
      if (!accountId) return json({ error: 'Unauthorized' }, 401);

      const profile = await env.DB.prepare(
        `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
      ).bind(profileId, accountId).first<{ id: string }>();
      if (!profile) return json({ error: 'Profile not found' }, 404);

      const from = url.searchParams.get('from') || (() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
      })();
      const to = url.searchParams.get('to') || new Date().toISOString().split('T')[0];
      const deviceId = url.searchParams.get('deviceId');
      const targetKey = url.searchParams.get('targetKey');
      const channel = url.searchParams.get('channel');
      const mode = url.searchParams.get('mode');
      const quotaBucket = url.searchParams.get('quotaBucket');
      if ((from && !isDateKey(from)) || (to && !isDateKey(to))) return json({ error: 'from/to must be YYYY-MM-DD' }, 400);
      if (channel && !VALID_CHANNELS.has(channel)) return json({ error: 'invalid channel' }, 400);
      if (mode && !VALID_MODES.has(mode)) return json({ error: 'invalid mode' }, 400);
      if (quotaBucket && !VALID_MODES.has(quotaBucket)) return json({ error: 'invalid quotaBucket' }, 400);
      if (!(await verifyProfileDevice(env, profileId, deviceId))) return json({ error: 'Device not found' }, 404);

      const where: string[] = ['profile_id = ?', 'date >= ?', 'date <= ?'];
      const binds: any[] = [profileId, from, to];
      if (deviceId) { where.push('device_id = ?'); binds.push(deviceId); }
      if (targetKey) { where.push('target_key = ?'); binds.push(targetKey); }
      if (channel) { where.push('channel = ?'); binds.push(channel); }
      if (mode) { where.push('mode = ?'); binds.push(mode); }
      if (quotaBucket) { where.push('quota_bucket = ?'); binds.push(quotaBucket); }

      const result = await env.DB.prepare(
        `SELECT device_id, hour_key, date, hour, timezone, hour_start_ms, hour_end_ms,
                target_key, managed_target_id, managed_target_type, managed_target_namespace,
                managed_target_value, managed_target_label_at_time, target_source_at_time,
                target_rule_id, target_match_level, target_classification_at_time,
                fallback_domain, is_fallback, channel, mode, quota_bucket, duration_seconds,
                segments_count, last_segment_id, first_seen_at, last_seen_at, updated_at
         FROM hourly_target_stats_v1
         WHERE ${where.join(' AND ')}
         ORDER BY hour_key DESC, target_key ASC, channel ASC, mode ASC, quota_bucket ASC`
      ).bind(...binds).all<any>();

      return json({ stats: result.results || [] });
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // V1: GET /profiles/:id/stats-integrity/v1 — 查询某终端某日期普通 usage 数据完整性
    // ═══════════════════════════════════════════════════════════════════════════════
    const statsIntegrityV1Match = path.match(/^\/profiles\/([^/]+)\/stats-integrity\/v1$/);
    if (request.method === 'GET' && statsIntegrityV1Match) {
      const profileId = statsIntegrityV1Match[1];
      const accountId = await verifyAccountToken(request, env.JWT_SECRET);
      if (!accountId) return json({ error: 'Unauthorized' }, 401);

      const profile = await env.DB.prepare(
        `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
      ).bind(profileId, accountId).first<{ id: string }>();
      if (!profile) return json({ error: 'Profile not found' }, 404);

      const date = url.searchParams.get('date');
      const deviceId = url.searchParams.get('deviceId');
      if (!isDateKey(date)) return json({ error: 'date must be YYYY-MM-DD' }, 400);
      if (!deviceId) return json({ error: 'deviceId required' }, 400);
      if (!(await verifyProfileDevice(env, profileId, deviceId))) return json({ error: 'Device not found' }, 404);

      const integrity = await readUsageStatsIntegrity(env, profileId, deviceId, date);
      return json({
        profileId,
        deviceId,
        date,
        ...integrity,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // V1: GET /profiles/:id/media-segments/v1 — 查询云端媒体落账明细
    // ═══════════════════════════════════════════════════════════════════════════════
    const mediaSegmentsV1Match = path.match(/^\/profiles\/([^/]+)\/media-segments\/v1$/);
    if (request.method === 'GET' && mediaSegmentsV1Match) {
      const profileId = mediaSegmentsV1Match[1];
      const accountId = await verifyAccountToken(request, env.JWT_SECRET);
      if (!accountId) return json({ error: 'Unauthorized' }, 401);

      const profile = await env.DB.prepare(
        `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
      ).bind(profileId, accountId).first<{ id: string }>();
      if (!profile) return json({ error: 'Profile not found' }, 404);

      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const rawDomain = url.searchParams.get('domain');
      const mediaClass = url.searchParams.get('mediaClass');
      const deviceId = url.searchParams.get('deviceId');
      const limit = parsePositiveInt(url.searchParams.get('limit'), 200, 500);
      const cursor = decodeSegmentCursor(url.searchParams.get('cursor'));
      if ((from && !isDateKey(from)) || (to && !isDateKey(to))) return json({ error: 'from/to must be YYYY-MM-DD' }, 400);
      if (rawDomain && !normalizeDomainFilterInput(rawDomain)) return json({ error: 'invalid domain' }, 400);
      if (mediaClass && !VALID_MEDIA_CLASSES.has(mediaClass)) return json({ error: 'invalid mediaClass' }, 400);
      if (!(await verifyProfileDevice(env, profileId, deviceId))) return json({ error: 'Device not found' }, 404);

      const where: string[] = ['profile_id = ?'];
      const binds: any[] = [profileId];
      if (from) { where.push('date >= ?'); binds.push(from); }
      if (to) { where.push('date <= ?'); binds.push(to); }
      if (rawDomain) {
        const domainError = addDomainLikeFilter(where, binds, 'domain', rawDomain);
        if (domainError) return json({ error: domainError }, 400);
      }
      if (mediaClass) { where.push('media_class = ?'); binds.push(mediaClass); }
      if (deviceId) { where.push('device_id = ?'); binds.push(deviceId); }
      if (cursor) {
        where.push('(start_ms < ? OR (start_ms = ? AND id < ?))');
        binds.push(cursor.startMs, cursor.startMs, cursor.id);
      }
      binds.push(limit + 1);

      const result = await env.DB.prepare(
        `SELECT id, profile_id, device_id, date, timezone, day_start_ms, day_end_ms,
                start_ms, end_ms, duration_seconds, domain, tab_id, window_id,
                media_class, media_kind, visibility, mode, settlement_reason,
                parent_segment_id, part_index, part_count, created_at, updated_at, uploaded_at,
                description_json
         FROM media_segments_v1
         WHERE ${where.join(' AND ')}
         ORDER BY start_ms DESC, id DESC
         LIMIT ?`
      ).bind(...binds).all<any>();

      const rows = result.results || [];
      const page = rows.slice(0, limit);
      const hasMore = rows.length > limit;
      const last = page[page.length - 1];
      const summary = page.reduce((acc: any, row: any) => {
        const seconds = Number(row.duration_seconds || 0);
        acc.totalSeconds += seconds;
        acc.mediaClassSeconds[row.media_class] = (acc.mediaClassSeconds[row.media_class] || 0) + seconds;
        return acc;
      }, { totalSeconds: 0, mediaClassSeconds: {} as Record<string, number> });

      return json({
        segments: page.map((row: any) => ({
          id: row.id,
          deviceId: row.device_id,
          date: row.date,
          timezone: row.timezone,
          dayStartMs: row.day_start_ms,
          dayEndMs: row.day_end_ms,
          startMs: row.start_ms,
          endMs: row.end_ms,
          durationSeconds: row.duration_seconds,
          domain: row.domain,
          tabId: row.tab_id,
          windowId: row.window_id,
          mediaClass: row.media_class,
          mediaKind: row.media_kind,
          visibility: row.visibility,
          mode: row.mode,
          settlementReason: row.settlement_reason,
          parentSegmentId: row.parent_segment_id,
          partIndex: row.part_index,
          partCount: row.part_count,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          uploadedAt: row.uploaded_at,
          description: parseJsonField(row.description_json),
        })),
        summary,
        hasMore,
        nextCursor: hasMore && last ? encodeSegmentCursor(last.start_ms, last.id) : null,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // V1: GET /profiles/:id/media-stats/v1 — 查询云端媒体每日聚合
    // ═══════════════════════════════════════════════════════════════════════════════
    const mediaStatsV1Match = path.match(/^\/profiles\/([^/]+)\/media-stats\/v1$/);
    if (request.method === 'GET' && mediaStatsV1Match) {
      const profileId = mediaStatsV1Match[1];
      const accountId = await verifyAccountToken(request, env.JWT_SECRET);
      if (!accountId) return json({ error: 'Unauthorized' }, 401);

      const profile = await env.DB.prepare(
        `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
      ).bind(profileId, accountId).first<{ id: string }>();
      if (!profile) return json({ error: 'Profile not found' }, 404);

      const from = url.searchParams.get('from') || (() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
      })();
      const to = url.searchParams.get('to') || new Date().toISOString().split('T')[0];
      const deviceId = url.searchParams.get('deviceId');
      if ((from && !isDateKey(from)) || (to && !isDateKey(to))) return json({ error: 'from/to must be YYYY-MM-DD' }, 400);
      if (!(await verifyProfileDevice(env, profileId, deviceId))) return json({ error: 'Device not found' }, 404);

      const where: string[] = ['profile_id = ?', 'date >= ?', 'date <= ?'];
      const binds: any[] = [profileId, from, to];
      if (deviceId) { where.push('device_id = ?'); binds.push(deviceId); }
      const result = await env.DB.prepare(
        `SELECT device_id, date, timezone, day_start_ms, day_end_ms,
                domain, media_class, mode, duration_seconds,
                first_seen_at, last_seen_at, updated_at
         FROM daily_media_stats_v1
         WHERE ${where.join(' AND ')}
         ORDER BY date DESC, domain ASC, media_class ASC, mode ASC`
      ).bind(...binds).all<any>();

      return json({ stats: result.results || [] });
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // V1: GET /profiles/:id/hourly-media-stats/v1 — 查询云端媒体每小时聚合
    // ═══════════════════════════════════════════════════════════════════════════════
    const hourlyMediaStatsV1Match = path.match(/^\/profiles\/([^/]+)\/hourly-media-stats\/v1$/);
    if (request.method === 'GET' && hourlyMediaStatsV1Match) {
      const profileId = hourlyMediaStatsV1Match[1];
      const accountId = await verifyAccountToken(request, env.JWT_SECRET);
      if (!accountId) return json({ error: 'Unauthorized' }, 401);

      const profile = await env.DB.prepare(
        `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
      ).bind(profileId, accountId).first<{ id: string }>();
      if (!profile) return json({ error: 'Profile not found' }, 404);

      const from = url.searchParams.get('from') || (() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
      })();
      const to = url.searchParams.get('to') || new Date().toISOString().split('T')[0];
      const rawDomain = url.searchParams.get('domain');
      const domain = rawDomain ? normalizeHostname(rawDomain) : null;
      const mediaClass = url.searchParams.get('mediaClass');
      const mode = url.searchParams.get('mode');
      const deviceId = url.searchParams.get('deviceId');
      if ((from && !isDateKey(from)) || (to && !isDateKey(to))) return json({ error: 'from/to must be YYYY-MM-DD' }, 400);
      if (rawDomain && !domain) return json({ error: 'invalid domain' }, 400);
      if (mediaClass && !VALID_MEDIA_CLASSES.has(mediaClass)) return json({ error: 'invalid mediaClass' }, 400);
      if (mode && !VALID_MODES.has(mode)) return json({ error: 'invalid mode' }, 400);
      if (!(await verifyProfileDevice(env, profileId, deviceId))) return json({ error: 'Device not found' }, 404);

      const where: string[] = ['profile_id = ?', 'date >= ?', 'date <= ?'];
      const binds: any[] = [profileId, from, to];
      if (deviceId) { where.push('device_id = ?'); binds.push(deviceId); }
      if (domain) { where.push('domain = ?'); binds.push(domain); }
      if (mediaClass) { where.push('media_class = ?'); binds.push(mediaClass); }
      if (mode) { where.push('mode = ?'); binds.push(mode); }

      const result = await env.DB.prepare(
        `SELECT device_id, hour_key, date, hour, timezone, hour_start_ms, hour_end_ms,
                domain, media_class, mode, duration_seconds,
                segments_count, last_segment_id, first_seen_at, last_seen_at, updated_at
         FROM hourly_media_stats_v1
         WHERE ${where.join(' AND ')}
         ORDER BY hour_key DESC, domain ASC, media_class ASC, mode ASC`
      ).bind(...binds).all<any>();

      return json({ stats: result.results || [] });
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // V1: GET /profiles/:id/stats-reconciliation/v1 — stats_v1 与 usage_segments_v1 对账
    // ═══════════════════════════════════════════════════════════════════════════════
    const reconciliationV1Match = path.match(/^\/profiles\/([^/]+)\/stats-reconciliation\/v1$/);
    if (request.method === 'GET' && reconciliationV1Match) {
      const profileId = reconciliationV1Match[1];
      const accountId = await verifyAccountToken(request, env.JWT_SECRET);
      if (!accountId) return json({ error: 'Unauthorized' }, 401);

      const profile = await env.DB.prepare(
        `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
      ).bind(profileId, accountId).first<{ id: string }>();
      if (!profile) return json({ error: 'Profile not found' }, 404);

      const from = url.searchParams.get('from') || new Date().toISOString().split('T')[0];
      const to = url.searchParams.get('to') || from;
      const rawDomain = url.searchParams.get('domain');
      if ((from && !isDateKey(from)) || (to && !isDateKey(to))) {
        return json({ error: 'from/to must be YYYY-MM-DD' }, 400);
      }
      if (rawDomain && !normalizeDomainFilterInput(rawDomain)) {
        return json({ error: 'invalid domain' }, 400);
      }

      const where: string[] = ['profile_id = ?', 'date >= ?', 'date <= ?'];
      const binds: any[] = [profileId, from, to];
      if (rawDomain) {
        const domainError = addDomainLikeFilter(where, binds, 'domain', rawDomain);
        if (domainError) return json({ error: domainError }, 400);
      }
      const whereSql = where.join(' AND ');

      const statsResult = await env.DB.prepare(
        `SELECT date, domain, channel, mode,
                COALESCE(SUM(duration_seconds), 0) as seconds
         FROM stats_v1
         WHERE ${whereSql}
         GROUP BY date, domain, channel, mode`
      ).bind(...binds).all<{
        date: string; domain: string; channel: string; mode: string; seconds: number;
      }>();

      const segmentResult = await env.DB.prepare(
        `SELECT date, domain, channel, mode,
                COALESCE(SUM(duration_seconds), 0) as seconds
         FROM usage_segments_v1
         WHERE ${whereSql}
         GROUP BY date, domain, channel, mode`
      ).bind(...binds).all<{
        date: string; domain: string; channel: string; mode: string; seconds: number;
      }>();

      const rowsByKey = new Map<string, {
        date: string; domain: string; channel: string; mode: string; statsSeconds: number; segmentSeconds: number;
      }>();
      const put = (row: any, side: 'statsSeconds' | 'segmentSeconds') => {
        const key = `${row.date}\t${row.domain}\t${row.channel}\t${row.mode}`;
        const existing = rowsByKey.get(key) || {
          date: row.date,
          domain: row.domain,
          channel: row.channel,
          mode: row.mode,
          statsSeconds: 0,
          segmentSeconds: 0,
        };
        existing[side] = Number(row.seconds || 0);
        rowsByKey.set(key, existing);
      };
      for (const row of statsResult.results || []) put(row, 'statsSeconds');
      for (const row of segmentResult.results || []) put(row, 'segmentSeconds');

      const rows = [...rowsByKey.values()]
        .map((row) => {
          const statsSeconds = Number(row.statsSeconds || 0);
          const segmentSeconds = Number(row.segmentSeconds || 0);
          return {
            date: row.date,
            domain: row.domain,
            channel: row.channel,
            mode: row.mode,
            statsSeconds,
            segmentSeconds,
            deltaSeconds: segmentSeconds - statsSeconds,
            status: reconciliationStatus(statsSeconds, segmentSeconds),
          };
        })
        .sort((a, b) => {
          if (a.status !== b.status) {
            if (a.status === 'match') return 1;
            if (b.status === 'match') return -1;
          }
          if (a.date !== b.date) return a.date < b.date ? 1 : -1;
          if (a.domain !== b.domain) return a.domain < b.domain ? -1 : 1;
          if (a.channel !== b.channel) return a.channel < b.channel ? -1 : 1;
          return a.mode < b.mode ? -1 : (a.mode > b.mode ? 1 : 0);
        });

      const summary = rows.reduce((acc, row) => {
        acc.statsSeconds += row.statsSeconds;
        acc.segmentSeconds += row.segmentSeconds;
        acc.deltaSeconds += row.deltaSeconds;
        if (row.status !== 'match') acc.mismatchCount++;
        acc.statusCounts[row.status] = (acc.statusCounts[row.status] || 0) + 1;
        return acc;
      }, {
        rowCount: rows.length,
        statsSeconds: 0,
        segmentSeconds: 0,
        deltaSeconds: 0,
        mismatchCount: 0,
        statusCounts: {} as Record<string, number>,
      });

      return json({ rows, summary });
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // V1: GET /profiles/:id/usage-segments/v1 — 查询云端落账明细
    // ═══════════════════════════════════════════════════════════════════════════════
    const usageSegmentsV1Match = path.match(/^\/profiles\/([^/]+)\/usage-segments\/v1$/);
    if (request.method === 'GET' && usageSegmentsV1Match) {
      const profileId = usageSegmentsV1Match[1];
      const accountId = await verifyAccountToken(request, env.JWT_SECRET);
      if (!accountId) return json({ error: 'Unauthorized' }, 401);

      const profile = await env.DB.prepare(
        `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
      ).bind(profileId, accountId).first<{ id: string }>();
      if (!profile) return json({ error: 'Profile not found' }, 404);

      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const rawDomain = url.searchParams.get('domain');
      const deviceId = url.searchParams.get('deviceId');
      const limit = parsePositiveInt(url.searchParams.get('limit'), 200, 500);
      const cursor = decodeSegmentCursor(url.searchParams.get('cursor'));
      if ((from && !isDateKey(from)) || (to && !isDateKey(to))) {
        return json({ error: 'from/to must be YYYY-MM-DD' }, 400);
      }
      if (rawDomain && !normalizeDomainFilterInput(rawDomain)) {
        return json({ error: 'invalid domain' }, 400);
      }
      if (url.searchParams.get('cursor') && !cursor) {
        return json({ error: 'invalid cursor' }, 400);
      }
      if (!(await verifyProfileDevice(env, profileId, deviceId))) {
        return json({ error: 'Device not found' }, 404);
      }

      const where: string[] = ['profile_id = ?'];
      const binds: any[] = [profileId];
      if (from) {
        where.push('date >= ?');
        binds.push(from);
      }
      if (to) {
        where.push('date <= ?');
        binds.push(to);
      }
      if (rawDomain) {
        const domainError = addDomainLikeFilter(where, binds, 'domain', rawDomain);
        if (domainError) return json({ error: domainError }, 400);
      }
      if (deviceId) {
        where.push('device_id = ?');
        binds.push(deviceId);
      }

      const summaryWhere = where.join(' AND ');
      const summary = await env.DB.prepare(
        `SELECT COUNT(*) as count,
                COALESCE(SUM(duration_seconds), 0) as total_seconds,
                COALESCE(SUM(CASE WHEN channel = 'active' THEN duration_seconds ELSE 0 END), 0) as active_seconds,
                COALESCE(SUM(CASE WHEN channel = 'backgroundMedia' OR channel = 'pip' THEN duration_seconds ELSE 0 END), 0) as media_seconds
         FROM usage_segments_v1
         WHERE ${summaryWhere}`
      ).bind(...binds).first<{
        count: number; total_seconds: number; active_seconds: number; media_seconds: number;
      }>();

      const queryWhere = [...where];
      const queryBinds = [...binds];
      if (cursor) {
        queryWhere.push('(start_ms < ? OR (start_ms = ? AND id < ?))');
        queryBinds.push(cursor.startMs, cursor.startMs, cursor.id);
      }

      const result = await env.DB.prepare(
        `SELECT id, device_id, date, timezone, day_start_ms, day_end_ms,
                start_ms, end_ms, duration_seconds, domain, channel, mode,
                tab_id, window_id, source_state, settlement_reason,
                parent_segment_id, part_index, part_count,
                created_at, updated_at, uploaded_at, description_json,
                managed_target_id, managed_target_type, managed_target_namespace,
                managed_target_value, managed_target_label_at_time, target_source_at_time,
                target_rule_id, target_match_level, target_classification_at_time, quota_bucket_at_time
         FROM usage_segments_v1
         WHERE ${queryWhere.join(' AND ')}
         ORDER BY start_ms DESC, id DESC
         LIMIT ?`
      ).bind(...queryBinds, limit + 1).all<{
        id: string; device_id: string; date: string; timezone: string; day_start_ms: number; day_end_ms: number;
        start_ms: number; end_ms: number; duration_seconds: number; domain: string; channel: string; mode: string;
        tab_id: string | null; window_id: number | null; source_state: string; settlement_reason: string;
        parent_segment_id: string | null; part_index: number; part_count: number;
        created_at: number; updated_at: number; uploaded_at: number | null; description_json: string | null;
        managed_target_id: string | null; managed_target_type: string | null; managed_target_namespace: string | null;
        managed_target_value: string | null; managed_target_label_at_time: string | null; target_source_at_time: string | null;
        target_rule_id: string | null; target_match_level: string | null; target_classification_at_time: string | null; quota_bucket_at_time: string | null;
      }>();

      const rows = result.results || [];
      const pageRows = rows.slice(0, limit);
      const last = pageRows[pageRows.length - 1];
      return json({
        segments: pageRows.map((row) => ({
          id: row.id,
          deviceId: row.device_id,
          date: row.date,
          timezone: row.timezone,
          dayStartMs: row.day_start_ms,
          dayEndMs: row.day_end_ms,
          startMs: row.start_ms,
          endMs: row.end_ms,
          durationSeconds: row.duration_seconds,
          domain: row.domain,
          channel: row.channel,
          mode: row.mode,
          tabId: row.tab_id,
          windowId: row.window_id,
          sourceState: row.source_state,
          settlementReason: row.settlement_reason,
          description: parseJsonField(row.description_json),
          managedTargetId: row.managed_target_id,
          managedTargetType: row.managed_target_type,
          managedTargetNamespace: row.managed_target_namespace,
          managedTargetValue: row.managed_target_value,
          managedTargetLabelAtTime: row.managed_target_label_at_time,
          targetSourceAtTime: row.target_source_at_time,
          targetRuleId: row.target_rule_id,
          targetMatchLevel: row.target_match_level,
          targetClassificationAtTime: row.target_classification_at_time,
          quotaBucketAtTime: row.quota_bucket_at_time,
          parentSegmentId: row.parent_segment_id,
          partIndex: row.part_index,
          partCount: row.part_count,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          uploadedAt: row.uploaded_at,
          uploaded: row.uploaded_at != null,
        })),
        summary: {
          count: Number(summary?.count || 0),
          totalSeconds: Number(summary?.total_seconds || 0),
          activeSeconds: Number(summary?.active_seconds || 0),
          mediaSeconds: Number(summary?.media_seconds || 0),
        },
        hasMore: rows.length > limit,
        nextCursor: rows.length > limit && last ? encodeSegmentCursor(last.start_ms, last.id) : null,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // Legacy: POST /device/stats — 旧版上传统计（device_token）
    // 安全逐域名 upsert：不再按日期整批删除再插入。
    // ═══════════════════════════════════════════════════════════════════════════════
    if (request.method === 'POST' && path === '/device/stats') {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

      const device = await verifyDeviceToken(env, auth.slice(7), { updateLastSeen: true });
      if (!device) return json({ error: 'Invalid device token' }, 401);
      if (device.unbound) return deviceUnboundResponse(device.deviceId);
      const profileId = device.profileId;

      try {
        const { date, stats } = await request.json<{
          date: string;
          stats: Array<{ domain: string; active_sec?: number; passive_sec?: number }>;
        }>();

        if (!date || !Array.isArray(stats)) {
          return json({ error: 'date and stats[] required' }, 400);
        }

        const now = Date.now();
        let inserted = 0;
        let updated = 0;

        for (const stat of stats) {
          if (!stat.domain) continue;
          const normalizedDomain = normalizeHostname(stat.domain);
          if (!normalizedDomain) continue;
          const duration = (stat.active_sec || 0) + (stat.passive_sec || 0);
          if (duration <= 0) continue;

          // 安全逐域名 upsert：先查是否存在，再决定 INSERT 或 UPDATE
          const existing = await env.DB.prepare(
            `SELECT id FROM stats WHERE profile_id = ? AND date = ? AND domain = ?`
          ).bind(profileId, date, normalizedDomain).first<{ id: string }>();

          if (existing) {
            await env.DB.prepare(
              `UPDATE stats SET duration = ?, created_at = ? WHERE id = ?`
            ).bind(duration, now, existing.id).run();
            updated++;
          } else {
            await env.DB.prepare(
              `INSERT INTO stats (id, profile_id, date, domain, duration, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(crypto.randomUUID(), profileId, date, normalizedDomain, duration, now).run();
            inserted++;
          }
        }

        return json({ success: true, count: inserted + updated, inserted, updated });
      } catch (e: any) {
        return json({ error: 'Failed to upload stats: ' + e.message }, 500);
      }
    }

    // GET /profiles/:id/stats - 查询统计（account_token）
    const statsMatch = path.match(/^\/profiles\/([^/]+)\/stats$/);
    if (request.method === 'GET' && statsMatch) {
      const profileId = statsMatch[1];
      const accountId = await verifyAccountToken(request, env.JWT_SECRET);
      if (!accountId) return json({ error: 'Unauthorized' }, 401);

      // 验证 profile 归属
      const profile = await env.DB.prepare(
        `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
      ).bind(profileId, accountId).first<{ id: string }>();

      if (!profile) return json({ error: 'Profile not found' }, 404);

      const from = url.searchParams.get('from') || (() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
      })();
      const to = url.searchParams.get('to') || new Date().toISOString().split('T')[0];

      const result = await env.DB.prepare(
        `SELECT date, domain, duration
         FROM stats
         WHERE profile_id = ? AND date >= ? AND date <= ?
         ORDER BY date DESC`
      ).bind(profileId, from, to).all<{ date: string; domain: string; duration: number }>();

      return json({ stats: result.results || [] });
    }

    return json({ error: 'Not found' }, 404);
  },
};

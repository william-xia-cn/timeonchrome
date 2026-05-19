// Stats 路由 - 统计上传/查询 (legacy + v1)
import { json, Env, verifyAccountToken } from '../db/middleware';
import { normalizeHostname } from '../../../core/domain-semantics.js';

// 验证 device_token，同时刷新 last_seen；返回 profile_id + device_id 或 null
async function verifyDeviceToken(env: Env, token: string): Promise<{ profileId: string; deviceId: string } | null> {
  const device = await env.DB.prepare(
    `SELECT id, profile_id FROM devices WHERE device_token = ?`
  ).bind(token).first<{ id: string; profile_id: string }>();

  if (!device?.profile_id) return null;

  await env.DB.prepare(
    `UPDATE devices SET last_seen = ? WHERE device_token = ?`
  ).bind(Date.now(), token).run();

  return { profileId: device.profile_id, deviceId: device.id };
}

// ── Segment payload schema validation ───────────────────────────────────────────

const VALID_CHANNELS = new Set(['active', 'backgroundMedia', 'pip']);
const VALID_MODES = new Set(['study', 'rest', 'paused', 'unknown', 'composite']);

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

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function isDateKey(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
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

function reconciliationStatus(statsSeconds: number, segmentSeconds: number): string {
  if (statsSeconds === segmentSeconds) return 'match';
  if (statsSeconds <= 0 && segmentSeconds > 0) return 'stats_missing';
  if (statsSeconds > 0 && segmentSeconds <= 0) return 'segments_missing';
  return 'mismatch';
}

export const statsRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url  = new URL(request.url);
    const path = url.pathname;

    // ═══════════════════════════════════════════════════════════════════════════════
    // V1: POST /device/usage-segments/v1 — 上传已结算的使用分段
    // ═══════════════════════════════════════════════════════════════════════════════
    if (request.method === 'POST' && path === '/device/usage-segments/v1') {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

      const device = await verifyDeviceToken(env, auth.slice(7));
      if (!device) return json({ error: 'Invalid device token' }, 401);

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
          const deviceId = s.deviceId || device.deviceId;

          // Idempotent upsert by segment id
          const existing = await env.DB.prepare(
            `SELECT id FROM usage_segments_v1 WHERE id = ?`
          ).bind(s.id).first<{ id: string }>();

          if (existing) {
            // 已存在：仅更新 uploaded_at
            await env.DB.prepare(
              `UPDATE usage_segments_v1 SET uploaded_at = ?, updated_at = ? WHERE id = ?`
            ).bind(now, now, s.id).run();
            updated++;
          } else {
            await env.DB.prepare(
              `INSERT INTO usage_segments_v1
               (id, profile_id, device_id, date, timezone, day_start_ms, day_end_ms,
                start_ms, end_ms, duration_seconds, domain, channel, mode,
                source_state, settlement_reason,
                parent_segment_id, part_index, part_count,
                created_at, updated_at, uploaded_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                       ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              s.id, device.profileId, deviceId, s.date, timezone, dayStartMs, dayEndMs,
              s.startMs, s.endMs, s.durationSeconds, normalizedDomain, s.channel, s.mode,
              sourceState, settlementReason,
              parentSegmentId, partIndex, partCount,
              createdAt, updatedAt, now
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

      const device = await verifyDeviceToken(env, auth.slice(7));
      if (!device) return json({ error: 'Invalid device token' }, 401);

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
          // Idempotent upsert by (profile_id, date, domain, channel, mode)
          const existing = await env.DB.prepare(
            `SELECT id FROM stats_v1
             WHERE profile_id = ? AND date = ? AND domain = ? AND channel = ? AND mode = ?`
          ).bind(device.profileId, date, row.domain, row.channel, row.mode).first<{ id: string }>();

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

      const result = await env.DB.prepare(
        `SELECT date, timezone, day_start_ms, day_end_ms,
                domain, channel, mode, duration_seconds,
                first_seen_at, last_seen_at, updated_at
         FROM stats_v1
         WHERE profile_id = ? AND date >= ? AND date <= ?
         ORDER BY date DESC, domain ASC, channel ASC, mode ASC`
      ).bind(profileId, from, to).all<{
        date: string; timezone: string; day_start_ms: number; day_end_ms: number;
        domain: string; channel: string; mode: string; duration_seconds: number;
        first_seen_at: number; last_seen_at: number; updated_at: number;
      }>();

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
      const domain = rawDomain ? normalizeHostname(rawDomain) : null;
      if ((from && !isDateKey(from)) || (to && !isDateKey(to))) {
        return json({ error: 'from/to must be YYYY-MM-DD' }, 400);
      }
      if (rawDomain && !domain) {
        return json({ error: 'invalid domain' }, 400);
      }

      const where: string[] = ['profile_id = ?', 'date >= ?', 'date <= ?'];
      const binds: any[] = [profileId, from, to];
      if (domain) {
        where.push('domain = ?');
        binds.push(domain);
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
      const domain = rawDomain ? normalizeHostname(rawDomain) : null;
      const limit = parsePositiveInt(url.searchParams.get('limit'), 200, 500);
      const cursor = decodeSegmentCursor(url.searchParams.get('cursor'));
      if ((from && !isDateKey(from)) || (to && !isDateKey(to))) {
        return json({ error: 'from/to must be YYYY-MM-DD' }, 400);
      }
      if (rawDomain && !domain) {
        return json({ error: 'invalid domain' }, 400);
      }
      if (url.searchParams.get('cursor') && !cursor) {
        return json({ error: 'invalid cursor' }, 400);
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
      if (domain) {
        where.push('domain = ?');
        binds.push(domain);
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
        `SELECT id, date, timezone, day_start_ms, day_end_ms,
                start_ms, end_ms, duration_seconds, domain, channel, mode,
                source_state, settlement_reason,
                parent_segment_id, part_index, part_count,
                created_at, updated_at, uploaded_at
         FROM usage_segments_v1
         WHERE ${queryWhere.join(' AND ')}
         ORDER BY start_ms DESC, id DESC
         LIMIT ?`
      ).bind(...queryBinds, limit + 1).all<{
        id: string; date: string; timezone: string; day_start_ms: number; day_end_ms: number;
        start_ms: number; end_ms: number; duration_seconds: number; domain: string; channel: string; mode: string;
        source_state: string; settlement_reason: string;
        parent_segment_id: string | null; part_index: number; part_count: number;
        created_at: number; updated_at: number; uploaded_at: number | null;
      }>();

      const rows = result.results || [];
      const pageRows = rows.slice(0, limit);
      const last = pageRows[pageRows.length - 1];
      return json({
        segments: pageRows.map((row) => ({
          id: row.id,
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
          sourceState: row.source_state,
          settlementReason: row.settlement_reason,
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

      const device = await verifyDeviceToken(env, auth.slice(7));
      if (!device) return json({ error: 'Invalid device token' }, 401);
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

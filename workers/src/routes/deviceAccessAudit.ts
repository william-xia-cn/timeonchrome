import { Env, json, verifyAccountToken } from '../db/middleware';

type AuditAuth = {
  authResult: string;
  profileId: string | null;
  deviceId: string | null;
  tokenHashPrefix: string | null;
};

function getDeviceToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

function endpointFromPath(pathname: string): string {
  if (pathname.startsWith('/device/')) return pathname;
  return pathname.replace(/\/+$/, '') || '/';
}

function requestKindForEndpoint(endpoint: string): string {
  if (endpoint === '/device/heartbeat') return 'heartbeat';
  if (endpoint === '/device/config') return 'config';
  if (endpoint === '/device/identity-link') return 'identity_link';
  if (endpoint.includes('/device/recover') || endpoint.includes('/device/managed-recover')) return 'device_recovery';
  if (endpoint.includes('usage-segments')) return 'usage_segments';
  if (endpoint.includes('media-segments')) return 'media_segments';
  if (endpoint.includes('client-logs')) return 'client_logs';
  if (endpoint.includes('site-classification-requests')) return 'site_requests';
  if (endpoint.includes('hourly-target-stats')) return 'hourly_target_stats';
  if (endpoint.includes('target-stats')) return 'target_stats';
  if (endpoint.includes('hourly-media-stats')) return 'hourly_media_stats';
  if (endpoint.includes('media-stats')) return 'media_stats';
  if (endpoint.includes('hourly-stats')) return 'hourly_stats';
  if (endpoint.includes('stats')) return 'stats';
  if (endpoint.includes('sessions')) return 'sessions';
  if (endpoint.includes('events')) return 'events';
  if (endpoint.includes('changelog')) return 'changelog';
  if (endpoint.includes('composite') || endpoint.includes('appeal') || endpoint.includes('weekly-sessions')) return 'composite_sessions';
  return 'device';
}

function errorClassFor(status: number, code: string | null, body: any): string | null {
  if (code === 'DEVICE_UNBOUND') return 'auth';
  if (status === 401 || status === 403) return 'auth';
  if (status === 400 || status === 422) return 'validation';
  if (status === 410) return 'deprecated';
  if (status === 429) return 'rate_limit';
  const text = [code, body?.error, body?.message].filter(Boolean).join(' ');
  if (/no such column|no such table|schema/i.test(text)) return 'schema';
  if (status >= 500) return 'server';
  return null;
}

async function tokenHashPrefix(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

async function resolveAuth(env: Env, request: Request): Promise<AuditAuth> {
  const token = getDeviceToken(request);
  if (!token) {
    return { authResult: 'missing_token', profileId: null, deviceId: null, tokenHashPrefix: null };
  }

  const hashPrefix = await tokenHashPrefix(token);
  try {
    const row = await env.DB.prepare(
      `SELECT id, profile_id, COALESCE(status, 'bound') AS status FROM devices WHERE device_token = ?`
    ).bind(token).first<{ id?: string; profile_id?: string; status?: string }>();
    if (!row?.profile_id) {
      return { authResult: 'invalid_token', profileId: null, deviceId: null, tokenHashPrefix: hashPrefix };
    }
    return {
      authResult: row.status === 'unbound' ? 'unbound' : 'ok',
      profileId: row.profile_id,
      deviceId: row.id || null,
      tokenHashPrefix: hashPrefix,
    };
  } catch (error: any) {
    const message = String(error?.message || error || '');
    if (/no such column/i.test(message) && /\bstatus\b/i.test(message)) {
      const row = await env.DB.prepare(
        `SELECT id, profile_id FROM devices WHERE device_token = ?`
      ).bind(token).first<{ id?: string; profile_id?: string }>();
      if (!row?.profile_id) {
        return { authResult: 'invalid_token', profileId: null, deviceId: null, tokenHashPrefix: hashPrefix };
      }
      return { authResult: 'legacy_ok', profileId: row.profile_id, deviceId: row.id || null, tokenHashPrefix: hashPrefix };
    }
    return { authResult: 'auth_error', profileId: null, deviceId: null, tokenHashPrefix: hashPrefix };
  }
}

async function responseSummary(response: Response): Promise<{ code: string | null; body: any }> {
  const text = await response.clone().text().catch(() => '');
  if (!text) return { code: null, body: null };
  try {
    const body = JSON.parse(text);
    return { code: body?.code || null, body };
  } catch {
    return { code: null, body: { error: text.slice(0, 120) } };
  }
}

function countArray(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null;
}

async function payloadCount(request: Request): Promise<number | null> {
  if (request.method === 'GET' || request.method === 'HEAD') return null;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return null;
  return (
    countArray((body as any).segments) ??
    countArray((body as any).stats) ??
    countArray((body as any).logs) ??
    countArray((body as any).requests) ??
    countArray((body as any).events) ??
    countArray((body as any).sessions) ??
    null
  );
}

export const DEVICE_ACCESS_AUDIT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
export const DEVICE_ACCESS_AUDIT_MAX_ROWS_PER_DEVICE = 1000;

export const DELETE_EXPIRED_DEVICE_ACCESS_AUDIT_SQL =
  'DELETE FROM device_access_audit_v1 WHERE timestamp < ?';

export const TRIM_DEVICE_ACCESS_AUDIT_SQL = `DELETE FROM device_access_audit_v1
  WHERE id IN (
    SELECT id
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY profile_id, device_id
               ORDER BY timestamp DESC, id DESC
             ) AS retention_rank
      FROM device_access_audit_v1
      WHERE profile_id IS NOT NULL AND device_id IS NOT NULL
    ) ranked
    WHERE retention_rank > ?
  )`;

export async function cleanupDeviceAccessAuditRetention(env: Env, now: number): Promise<void> {
  const cutoff = now - DEVICE_ACCESS_AUDIT_RETENTION_MS;
  await env.DB.batch([
    env.DB.prepare(DELETE_EXPIRED_DEVICE_ACCESS_AUDIT_SQL).bind(cutoff),
    env.DB.prepare(TRIM_DEVICE_ACCESS_AUDIT_SQL).bind(DEVICE_ACCESS_AUDIT_MAX_ROWS_PER_DEVICE),
  ]);
}

export async function recordDeviceAccessAudit(request: Request, env: Env, response: Response, startedAt: number): Promise<void> {
  const url = new URL(request.url);
  const endpoint = endpointFromPath(url.pathname);
  const now = Date.now();
  const auth = await resolveAuth(env, request);
  const summary = await responseSummary(response);
  const count = await payloadCount(request).catch(() => null);
  const status = response.status || 0;
  const resultCode = summary.code || (status >= 400 ? `HTTP_${status}` : null);
  const clientVersion = request.headers.get('X-TimeOnChrome-Version') || null;
  const requestId = request.headers.get('X-TimeOnChrome-Request-Id') || null;

  await env.DB.prepare(
    `INSERT INTO device_access_audit_v1 (
      id, profile_id, device_id, token_hash_prefix, timestamp, method, endpoint, request_kind,
      status, auth_result, result_code, error_class, duration_ms, client_version, request_id,
      payload_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    auth.profileId,
    auth.deviceId,
    auth.tokenHashPrefix,
    now,
    request.method,
    endpoint,
    requestKindForEndpoint(endpoint),
    status,
    auth.authResult,
    resultCode,
    errorClassFor(status, resultCode, summary.body),
    Math.max(0, now - startedAt),
    clientVersion,
    requestId,
    count,
    now
  ).run();
}

export async function handleDeviceAccessAuditQuery(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/profiles\/([^/]+)\/device-access-audit\/v1$/);
  const profileId = match?.[1];
  if (!profileId) return json({ error: 'Not found' }, 404);

  const accountId = await verifyAccountToken(request, env.JWT_SECRET);
  if (!accountId) return json({ error: 'Unauthorized' }, 401);

  const profile = await env.DB.prepare(
    `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
  ).bind(profileId, accountId).first<{ id: string }>();
  if (!profile) return json({ error: 'Profile not found' }, 404);

  const deviceId = url.searchParams.get('deviceId');
  const from = Number(url.searchParams.get('from') || 0);
  const to = Number(url.searchParams.get('to') || 0);
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 100)));
  const clauses = ['a.profile_id = ?'];
  const bindings: any[] = [profileId];
  if (deviceId) {
    clauses.push('a.device_id = ?');
    bindings.push(deviceId);
  }
  if (Number.isFinite(from) && from > 0) {
    clauses.push('a.timestamp >= ?');
    bindings.push(from);
  }
  if (Number.isFinite(to) && to > 0) {
    clauses.push('a.timestamp <= ?');
    bindings.push(to);
  }
  bindings.push(limit);

  const rows = await env.DB.prepare(
    `SELECT a.id, a.profile_id, a.device_id, d.device_name, a.timestamp, a.method, a.endpoint,
            a.request_kind, a.status, a.auth_result, a.result_code, a.error_class, a.duration_ms,
            a.client_version, a.request_id, a.payload_count
     FROM device_access_audit_v1 a
     LEFT JOIN devices d ON d.id = a.device_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY a.timestamp DESC
     LIMIT ?`
  ).bind(...bindings).all();

  return json({ audits: rows.results || [] });
}

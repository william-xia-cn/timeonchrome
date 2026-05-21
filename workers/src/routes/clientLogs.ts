import { json, Env, verifyAccountToken } from '../db/middleware';
import { normalizeHostname } from '../../../extension/core/domain-semantics.js';

const VALID_LEVELS = new Set(['info', 'warning', 'error']);
const VALID_CATEGORIES = new Set([
  'runtime', 'timing', 'foreground', 'media', 'cloud', 'storage',
  'access', 'popup', 'admin', 'content', 'release',
]);
const MAX_DETAILS_DEPTH = 3;
const MAX_STRING_LENGTH = 300;
const CLOUD_RETENTION_MS = 30 * 86400000;

async function verifyDeviceToken(env: Env, token: string): Promise<{ profileId: string; deviceId: string } | null> {
  const device = await env.DB.prepare(
    `SELECT id, profile_id FROM devices WHERE device_token = ?`
  ).bind(token).first<{ id: string; profile_id: string }>();
  if (!device?.profile_id) return null;
  await env.DB.prepare(`UPDATE devices SET last_seen = ? WHERE device_token = ?`).bind(Date.now(), token).run();
  return { profileId: device.profile_id, deviceId: device.id };
}

async function verifyProfileDevice(env: Env, profileId: string, deviceId: string | null): Promise<boolean> {
  if (!deviceId) return true;
  const device = await env.DB.prepare(
    `SELECT id FROM devices WHERE id = ? AND profile_id = ?`
  ).bind(deviceId, profileId).first<{ id: string }>();
  return !!device;
}

function encodeCursor(timestamp: number, id: string): string {
  return btoa(JSON.stringify({ timestamp, id })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeCursor(cursor: string | null): { timestamp: number; id: string } | null {
  if (!cursor) return null;
  try {
    const normalized = cursor.replace(/-/g, '+').replace(/_/g, '/');
    const parsed = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')));
    const timestamp = Number(parsed?.timestamp);
    const id = typeof parsed?.id === 'string' ? parsed.id : '';
    if (!Number.isFinite(timestamp) || !id) return null;
    return { timestamp, id };
  } catch (_) {
    return null;
  }
}

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function normalizeDomainInput(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return normalizeHostname(parsed.hostname);
  } catch {
    return normalizeHostname(raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, ''));
  }
}

function redactString(value: unknown): string {
  let text = String(value || '');
  try {
    const parsed = new URL(text);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.hostname.toLowerCase();
  } catch {
    // Not a URL; continue with generic redaction.
  }
  if (text.length > MAX_STRING_LENGTH) text = `${text.slice(0, MAX_STRING_LENGTH)}…`;
  text = text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]');
  text = text.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]');
  text = text.replace(
    /([a-zA-Z0-9._%+-])([a-zA-Z0-9._%+-]*)(@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    (_m, first, _rest, domain) => `${first}***${domain.toLowerCase()}`
  );
  return text;
}

function sanitizeDetails(value: any, depth = 0, key = ''): any {
  if (value == null) return value;
  if (/token|password|cookie|jwt|authorization|credential|secret|api[_-]?key/i.test(key)) return '[redacted]';
  if (/email|child.?name|profile.?name|name$/i.test(key)) return '[redacted]';
  if (/^url$|href|uri/i.test(key)) {
    const domain = normalizeHostname(String(value || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, ''));
    return domain ? { domain } : '[redacted-url]';
  }
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= MAX_DETAILS_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeDetails(item, depth + 1, key));
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, 50)) {
      out[childKey] = sanitizeDetails(childValue, depth + 1, childKey);
    }
    return out;
  }
  return redactString(value);
}

function normalizeLog(raw: any, identity: { profileId: string; deviceId: string }, now: number): { row?: any; error?: string } {
  if (!raw || typeof raw !== 'object') return { error: 'log must be an object' };
  const level = VALID_LEVELS.has(raw.level) ? raw.level : null;
  const category = VALID_CATEGORIES.has(raw.category) ? raw.category : null;
  if (!level) return { error: 'invalid level' };
  if (!category) return { error: 'invalid category' };
  const timestamp = Number(raw.timestamp || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return { error: 'invalid timestamp' };
  const domain = raw.domain ? normalizeDomainInput(raw.domain) : null;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 128) : crypto.randomUUID();
  return {
    row: {
      id,
      profileId: identity.profileId,
      deviceId: identity.deviceId,
      timestamp,
      level,
      category,
      eventCode: String(raw.eventCode || 'client_event').replace(/[^a-z0-9_.:-]/gi, '_').slice(0, 96),
      message: redactString(raw.message || ''),
      bindingState: String(raw.bindingState || '').slice(0, 32) || null,
      extensionVersion: raw.extensionVersion ? String(raw.extensionVersion).slice(0, 32) : null,
      domain,
      module: raw.module ? String(raw.module).slice(0, 80) : null,
      detailsJson: JSON.stringify(sanitizeDetails(raw.details || null)),
      uploadedAt: now,
      createdAt: now,
    },
  };
}

export const clientLogsRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'POST' && path === '/device/client-logs/v1') {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
      const device = await verifyDeviceToken(env, auth.slice(7));
      if (!device) return json({ error: 'Invalid device token' }, 401);

      try {
        const body = await request.json<{ logs?: any[] }>();
        const logs = body?.logs;
        if (!Array.isArray(logs) || logs.length === 0) return json({ error: 'logs array required' }, 400);
        const now = Date.now();
        let accepted = 0;
        let failed = 0;
        const errors: string[] = [];
        for (const raw of logs.slice(0, 500)) {
          const normalized = normalizeLog(raw, device, now);
          if (!normalized.row) {
            failed++;
            errors.push(normalized.error || 'invalid log');
            continue;
          }
          const row = normalized.row;
          await env.DB.prepare(
            `INSERT OR IGNORE INTO client_logs_v1
             (id, profile_id, device_id, timestamp, level, category, event_code, message,
              binding_state, extension_version, domain, module, details_json, uploaded_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            row.id, row.profileId, row.deviceId, row.timestamp, row.level, row.category, row.eventCode, row.message,
            row.bindingState, row.extensionVersion, row.domain, row.module, row.detailsJson, row.uploadedAt, row.createdAt
          ).run();
          accepted++;
        }
        try {
          await env.DB.prepare(
            `DELETE FROM client_logs_v1 WHERE profile_id = ? AND timestamp < ?`
          ).bind(device.profileId, now - CLOUD_RETENTION_MS).run();
        } catch {
          // Cloud log retention cleanup must not fail log upload.
        }
        return json({ success: true, accepted, failed, errors: errors.length ? errors.slice(0, 20) : undefined });
      } catch (e: any) {
        return json({ error: 'Failed to upload client logs: ' + e.message }, 500);
      }
    }

    const listMatch = path.match(/^\/profiles\/([^/]+)\/client-logs\/v1$/);
    if (request.method === 'GET' && listMatch) {
      const profileId = listMatch[1];
      const accountId = await verifyAccountToken(request, env.JWT_SECRET);
      if (!accountId) return json({ error: 'Unauthorized' }, 401);
      const profile = await env.DB.prepare(
        `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
      ).bind(profileId, accountId).first<{ id: string }>();
      if (!profile) return json({ error: 'Profile not found' }, 404);

      const deviceId = url.searchParams.get('deviceId');
      if (!(await verifyProfileDevice(env, profileId, deviceId))) return json({ error: 'Device not found' }, 404);
      const level = url.searchParams.get('level');
      const category = url.searchParams.get('category');
      if (level && !VALID_LEVELS.has(level)) return json({ error: 'invalid level' }, 400);
      if (category && !VALID_CATEGORIES.has(category)) return json({ error: 'invalid category' }, 400);
      const from = Number(url.searchParams.get('from') || 0);
      const to = Number(url.searchParams.get('to') || 0);
      const limit = parsePositiveInt(url.searchParams.get('limit'), 200, 500);
      const cursor = decodeCursor(url.searchParams.get('cursor'));
      if (url.searchParams.get('cursor') && !cursor) return json({ error: 'invalid cursor' }, 400);

      const where = ['profile_id = ?'];
      const binds: any[] = [profileId];
      if (deviceId) { where.push('device_id = ?'); binds.push(deviceId); }
      if (level) { where.push('level = ?'); binds.push(level); }
      if (category) { where.push('category = ?'); binds.push(category); }
      if (Number.isFinite(from) && from > 0) { where.push('timestamp >= ?'); binds.push(from); }
      if (Number.isFinite(to) && to > 0) { where.push('timestamp <= ?'); binds.push(to); }
      if (cursor) {
        where.push('(timestamp < ? OR (timestamp = ? AND id < ?))');
        binds.push(cursor.timestamp, cursor.timestamp, cursor.id);
      }

      const result = await env.DB.prepare(
        `SELECT id, profile_id, device_id, timestamp, level, category, event_code, message,
                binding_state, extension_version, domain, module, details_json, uploaded_at, created_at
         FROM client_logs_v1
         WHERE ${where.join(' AND ')}
         ORDER BY timestamp DESC, id DESC
         LIMIT ?`
      ).bind(...binds, limit + 1).all<any>();
      const rows = result.results || [];
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      return json({
        logs: page.map((row: any) => ({
          id: row.id,
          profileId: row.profile_id,
          deviceId: row.device_id,
          timestamp: row.timestamp,
          level: row.level,
          category: row.category,
          eventCode: row.event_code,
          message: row.message,
          bindingState: row.binding_state,
          extensionVersion: row.extension_version,
          domain: row.domain,
          module: row.module,
          details: row.details_json ? JSON.parse(row.details_json) : null,
          uploadedAt: row.uploaded_at,
          createdAt: row.created_at,
        })),
        hasMore: rows.length > limit,
        nextCursor: rows.length > limit && last ? encodeCursor(last.timestamp, last.id) : null,
      });
    }

    return json({ error: 'Not found' }, 404);
  },
};

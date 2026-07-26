import { Env, json, verifyAccountToken } from '../db/middleware';
import {
  SYSTEM_ACCESS_CONFIG_ID,
  diffSystemAccessConfig,
  getSystemAccessConfigRecord,
  normalizeSystemAccessConfig,
  summarizeSystemAccessConfig,
  systemAccessDefaultsResponse,
  validateSystemAccessConfig,
} from '../config/system-access-config';

function adminAccountSet(env: Env): Set<string> {
  return new Set(String(env.ADMIN_ACCOUNT_IDS || '').split(',').map(item => item.trim()).filter(Boolean));
}

async function verifyAccount(request: Request, env: Env): Promise<string | null> {
  return await verifyAccountToken(request, env.JWT_SECRET);
}

function isSystemAccessAdmin(env: Env, accountId: string): boolean {
  const admins = adminAccountSet(env);
  return admins.has('*') || admins.has(accountId);
}

function unwrapConfigBody(body: any) {
  return body?.data && typeof body.data === 'object' ? body.data : body;
}

export const systemAccessConfigRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const accountId = await verifyAccount(request, env);
    if (!accountId) return json({ error: 'Unauthorized' }, 401);

    if (request.method === 'GET' && path === '/system/access-management-config/v1') {
      const record = await getSystemAccessConfigRecord(env);
      return json({
        ok: true,
        source: record.source,
        version: record.version,
        updatedAt: record.updatedAt,
        updatedByAccountId: record.updatedByAccountId,
        note: record.note,
        config: systemAccessDefaultsResponse(record.config),
        summary: summarizeSystemAccessConfig(record.config),
      });
    }

    if (request.method === 'POST' && path === '/system/access-management-config/v1/preflight') {
      if (!isSystemAccessAdmin(env, accountId)) return json({ error: 'Forbidden', code: 'SYSTEM_ACCESS_CONFIG_ADMIN_REQUIRED' }, 403);
      const body = await request.json().catch(() => null) as any;
      const input = unwrapConfigBody(body);
      const validation = validateSystemAccessConfig(input);
      const current = await getSystemAccessConfigRecord(env);
      return json({
        ok: validation.ok,
        schemaCompatible: validation.ok,
        errors: validation.errors,
        warnings: validation.warnings,
        currentSource: current.source,
        currentSummary: summarizeSystemAccessConfig(current.config),
        importedSummary: summarizeSystemAccessConfig(validation.config),
        diff: diffSystemAccessConfig(current.config, validation.config),
        config: systemAccessDefaultsResponse(validation.config),
      }, validation.ok ? 200 : 400);
    }

    if (request.method === 'PUT' && path === '/system/access-management-config/v1') {
      if (!isSystemAccessAdmin(env, accountId)) return json({ error: 'Forbidden', code: 'SYSTEM_ACCESS_CONFIG_ADMIN_REQUIRED' }, 403);
      const body = await request.json().catch(() => null) as any;
      const input = unwrapConfigBody(body);
      const validation = validateSystemAccessConfig(input);
      if (!validation.ok) {
        return json({ ok: false, schemaCompatible: false, errors: validation.errors, warnings: validation.warnings }, 400);
      }
      const now = Date.now();
      const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 400) : null;
      const configJson = JSON.stringify(normalizeSystemAccessConfig(validation.config));
      await env.DB.prepare(
        `INSERT INTO system_access_config_v1 (id, config_json, version, updated_at, updated_by_account_id, note)
         VALUES (?, ?, 1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           config_json = excluded.config_json,
           version = system_access_config_v1.version + 1,
           updated_at = excluded.updated_at,
           updated_by_account_id = excluded.updated_by_account_id,
           note = excluded.note`
      ).bind(SYSTEM_ACCESS_CONFIG_ID, configJson, now, accountId, note).run();
      const saved = await getSystemAccessConfigRecord(env);
      return json({
        ok: true,
        source: saved.source,
        version: saved.version,
        updatedAt: saved.updatedAt,
        summary: summarizeSystemAccessConfig(saved.config),
        config: systemAccessDefaultsResponse(saved.config),
      });
    }

    return json({ error: 'Not found' }, 404);
  },
};

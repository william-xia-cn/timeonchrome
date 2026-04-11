// Changelog 路由 - 配置变更日志
import { json, Env, verifyAccountToken } from '../db/middleware';

async function verifyDeviceToken(env: Env, token: string): Promise<string | null> {
  const device = await env.DB.prepare(
    `SELECT profile_id FROM devices WHERE device_token = ?`
  ).bind(token).first<{ profile_id: string }>();
  return device?.profile_id || null;
}

export const changelogRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url  = new URL(request.url);
    const path = url.pathname;

    // POST /device/changelog - 上传变更日志（device_token）
    if (request.method === 'POST' && path === '/device/changelog') {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

      const profileId = await verifyDeviceToken(env, auth.slice(7));
      if (!profileId) return json({ error: 'Invalid device token' }, 401);

      try {
        const { action, before_data, after_data } =
          await request.json<{ action: string; before_data?: unknown; after_data?: unknown }>();

        if (!action) return json({ error: 'action required' }, 400);

        const now = Date.now();

        // 读取现有日志
        const existingRow = await env.DB.prepare(
          `SELECT changelog FROM profiles WHERE id = ?`
        ).bind(profileId).first<{ changelog: string }>();

        const existingLog: unknown[] = existingRow?.changelog
          ? JSON.parse(existingRow.changelog)
          : [];

        existingLog.unshift({
          id:          crypto.randomUUID(),
          action,
          before_data: before_data ?? null,
          after_data:  after_data  ?? null,
          created_at:  now,
        });

        // 保留最近 100 条
        const trimmedLog = existingLog.slice(0, 100);

        await env.DB.prepare(
          `UPDATE profiles SET changelog = ?, updated_at = ? WHERE id = ?`
        ).bind(JSON.stringify(trimmedLog), now, profileId).run();

        return json({ success: true });
      } catch (e: any) {
        return json({ error: 'Failed to save changelog: ' + e.message }, 500);
      }
    }

    // GET /profiles/:id/changelog - 查询变更日志（account_token）
    const changelogMatch = path.match(/^\/profiles\/([^/]+)\/changelog$/);
    if (request.method === 'GET' && changelogMatch) {
      const profileId = changelogMatch[1];
      const accountId = await verifyAccountToken(request, env.JWT_SECRET);
      if (!accountId) return json({ error: 'Unauthorized' }, 401);

      // 验证归属
      const profile = await env.DB.prepare(
        `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
      ).bind(profileId, accountId).first<{ id: string }>();

      if (!profile) return json({ error: 'Profile not found' }, 404);

      const row = await env.DB.prepare(
        `SELECT changelog FROM profiles WHERE id = ?`
      ).bind(profileId).first<{ changelog: string }>();

      return json({ changelogs: row?.changelog ? JSON.parse(row.changelog) : [] });
    }

    return json({ error: 'Not found' }, 404);
  },
};

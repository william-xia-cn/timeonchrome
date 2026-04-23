// Stats 路由 - 统计上传/查询
import { json, Env, verifyAccountToken } from '../db/middleware';
import { normalizeHostname } from '../../../core/domain-semantics.js';

// 验证 device_token，同时刷新 last_seen；返回 profile_id 或 null
async function verifyDeviceToken(env: Env, token: string): Promise<string | null> {
  const device = await env.DB.prepare(
    `SELECT profile_id FROM devices WHERE device_token = ?`
  ).bind(token).first<{ profile_id: string }>();

  if (!device?.profile_id) return null;

  await env.DB.prepare(
    `UPDATE devices SET last_seen = ? WHERE device_token = ?`
  ).bind(Date.now(), token).run();

  return device.profile_id;
}

export const statsRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url  = new URL(request.url);
    const path = url.pathname;

    // POST /device/stats - 上传统计（device_token）
    if (request.method === 'POST' && path === '/device/stats') {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

      const profileId = await verifyDeviceToken(env, auth.slice(7));
      if (!profileId) return json({ error: 'Invalid device token' }, 401);

      try {
        const { date, stats } = await request.json<{
          date: string;
          stats: Array<{ domain: string; active_sec?: number; passive_sec?: number }>;
        }>();

        if (!date || !Array.isArray(stats)) {
          return json({ error: 'date and stats[] required' }, 400);
        }

        // 替换策略：先删除该日期旧数据，再整批插入
        await env.DB.prepare(
          `DELETE FROM stats WHERE profile_id = ? AND date = ?`
        ).bind(profileId, date).run();

        const now = Date.now();
        let inserted = 0;

        for (const stat of stats) {
          if (!stat.domain) continue;
          const normalizedDomain = normalizeHostname(stat.domain);
          if (!normalizedDomain) continue;
          const duration = (stat.active_sec || 0) + (stat.passive_sec || 0);
          if (duration <= 0) continue;

          await env.DB.prepare(
            `INSERT INTO stats (id, profile_id, date, domain, duration, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(crypto.randomUUID(), profileId, date, normalizedDomain, duration, now).run();

          inserted++;
        }

        return json({ success: true, count: inserted });
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

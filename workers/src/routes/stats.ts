// Stats 路由 - 统计上传/查询
import { json, Env } from '../db/middleware';

// 验证 device_token
async function verifyDeviceToken(env: Env, token: string): Promise<string | null> {
  const stmt = await env.DB.prepare(
    `SELECT profile_id FROM devices WHERE device_token = '${token}'`
  );
  const device = await stmt.first<{ profile_id: string }>();
  return device?.profile_id || null;
}

// 验证 account_token
async function verifyAccountToken(request: Request): Promise<string | null> {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  
  const token = auth.slice(7);
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.account_id || null;
  } catch {
    return null;
  }
}

export const statsRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // POST /device/stats - 上传统计（device_token）
    if (request.method === 'POST' && path === '/device/stats') {
      const auth = request.headers.get('Authorization');
      if (!auth || !auth.startsWith('Bearer ')) {
        return json({ error: 'Unauthorized' }, 401);
      }
      
      const token = auth.slice(7);
      const profileId = await verifyDeviceToken(env, token);
      if (!profileId) {
        return json({ error: 'Invalid device token' }, 401);
      }
      
      try {
        const body = await request.text();
        const data = JSON.parse(body);
        const { date, stats } = data;
        const now = Date.now();
        
        // 批量插入
        for (const stat of stats) {
          const id = crypto.randomUUID();
          const domain = stat.domain.replace(/'/g, "''");
          const activeSec = stat.active_sec || 0;
          const passiveSec = stat.passive_sec || 0;
          
          await env.DB.exec(
            `INSERT INTO stats (id, profile_id, date, domain, duration, created_at) VALUES ('${id}', '${profileId}', '${date}', '${domain}', ${activeSec + passiveSec}, ${now})`
          );
        }
        
        return json({ success: true, count: stats.length });
      } catch (e: any) {
        return json({ error: 'Failed to upload stats: ' + e.message }, 500);
      }
    }
    
    // GET /profiles/:id/stats - 查询统计（account_token）
    const statsMatch = path.match(/^\/profiles\/([^/]+)\/stats$/);
    if (request.method === 'GET' && statsMatch) {
      const profileId = statsMatch[1];
      const accountId = await verifyAccountToken(request);
      if (!accountId) {
        return json({ error: 'Unauthorized' }, 401);
      }
      
      // 验证归属
      const profileStmt = await env.DB.prepare(
        `SELECT id FROM profiles WHERE id = '${profileId}' AND account_id = '${accountId}'`
      );
      const profile = await profileStmt.first<{ id: string }>();
      
      if (!profile) {
        return json({ error: 'Profile not found' }, 404);
      }
      
      const urlParams = url.searchParams;
      const from = urlParams.get('from') || (() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
      })();
      const to = urlParams.get('to') || new Date().toISOString().split('T')[0];
      
      const resultStmt = await env.DB.prepare(
        `SELECT date, domain, duration 
         FROM stats 
         WHERE profile_id = '${profileId}' AND date >= '${from}' AND date <= '${to}'
         ORDER BY date DESC`
      );
      const result = await resultStmt.all<{ date: string; domain: string; duration: number }>();
      
      return json({ stats: result.results || [] });
    }
    
    return json({ error: 'Not found' }, 404);
  }
};
// Stats 路由 - 统计上传/查询
import { json, getJson, Env, verifyAccountToken } from '../db/middleware';

interface StatEntry {
  domain: string;
  active_sec: number;
  passive_sec: number;
}

interface StatsBody {
  date: string;
  stats: StatEntry[];
}

// 验证 device_token
async function verifyDeviceToken(env: Env, token: string): Promise<string | null> {
  const device = await env.DB.prepare(
    'SELECT profile_id FROM devices WHERE device_token = ?',
    [token]
  ).first<{ profile_id: string }>();
  return device?.profile_id || null;
}

// 验证 account_token
async function verifyAccountToken(request: Request, env: Env): Promise<string | null> {
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
        const body = await getJson<StatsBody>(request);
        const { date, stats } = body;
        const now = Date.now();
        
        // 批量插入
        for (const stat of stats) {
          const id = crypto.randomUUID();
          await env.DB.prepare(
            `INSERT OR REPLACE INTO daily_stats 
             (id, profile_id, date, domain, active_sec, passive_sec, uploaded_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, profileId, date, stat.domain, stat.active_sec, stat.passive_sec, now]
          ).run();
        }
        
        return json({ success: true, count: stats.length });
      } catch (e) {
        return json({ error: 'Failed to upload stats' }, 500);
      }
    }
    
    // GET /profiles/:id/stats - 查询统计（account_token）
    const statsMatch = path.match(/^\/profiles\/([^/]+)\/stats$/);
    if (request.method === 'GET' && statsMatch) {
      const profileId = statsMatch[1];
      const accountId = await verifyAccountToken(request, env);
      if (!accountId) {
        return json({ error: 'Unauthorized' }, 401);
      }
      
      // 验证归属
      const profile = await env.DB.prepare(
        'SELECT id FROM profiles WHERE id = ? AND account_id = ?',
        [profileId, accountId]
      ).first<{ id: string }>();
      
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
      
      const result = await env.DB.prepare(
        `SELECT date, domain, active_sec, passive_sec 
         FROM daily_stats 
         WHERE profile_id = ? AND date >= ? AND date <= ?
         ORDER BY date DESC`,
        [profileId, from, to]
      ).all<{ date: string; domain: string; active_sec: number; passive_sec: number }>();
      
      return json({ stats: result.results });
    }
    
    return json({ error: 'Not found' }, 404);
  }
};
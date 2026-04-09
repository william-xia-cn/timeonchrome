// Changelog 路由 - 配置变更日志
import { json, getJson, Env } from '../db/middleware';

interface ChangelogEntry {
  action: string;
  before_data?: string;
  after_data?: string;
}

interface ChangelogBody {
  action: string;
  before_data?: object;
  after_data?: object;
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

export const changelogRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // POST /device/changelog - 上传变更日志（device_token）
    if (request.method === 'POST' && path === '/device/changelog') {
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
        const body = await getJson<ChangelogBody>(request);
        const { action, before_data, after_data } = body;
        
        if (!action) {
          return json({ error: 'action required' }, 400);
        }
        
        const id = crypto.randomUUID();
        await env.DB.prepare(
          'INSERT INTO changelogs (id, profile_id, action, before_data, after_data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [id, profileId, action, 
           before_data ? JSON.stringify(before_data) : null,
           after_data ? JSON.stringify(after_data) : null,
           Date.now()]
        ).run();
        
        return json({ success: true, id });
      } catch (e) {
        return json({ error: 'Failed to save changelog' }, 500);
      }
    }
    
    // GET /profiles/:id/changelog - 查询变更日志（account_token）
    const changelogMatch = path.match(/^\/profiles\/([^/]+)\/changelog$/);
    if (request.method === 'GET' && changelogMatch) {
      const profileId = changelogMatch[1];
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
      
      const limit = url.searchParams.get('limit') || '50';
      
      const result = await env.DB.prepare(
        'SELECT id, action, before_data, after_data, created_at FROM changelogs WHERE profile_id = ? ORDER BY created_at DESC LIMIT ?',
        [profileId, parseInt(limit)]
      ).all<{ id: string; action: string; before_data: string; after_data: string; created_at: number }>();
      
      return json({ 
        changelogs: result.results.map(r => ({
          ...r,
          before_data: r.before_data ? JSON.parse(r.before_data) : null,
          after_data: r.after_data ? JSON.parse(r.after_data) : null
        }))
      });
    }
    
    return json({ error: 'Not found' }, 404);
  }
};
// Profiles 路由 - 孩子 Profile CRUD
import { json, getJson, Env } from '../db/middleware';

interface ProfileBody {
  name: string;
  avatar_color?: string;
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

export const profilesRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // 验证登录
    const accountId = await verifyAccountToken(request, env);
    if (!accountId) {
      return json({ error: 'Unauthorized' }, 401);
    }
    
    // GET /profiles - 获取所有孩子
    if (request.method === 'GET' && path === '/profiles') {
      const result = await env.DB.prepare(
        'SELECT id, name, avatar_color, created_at FROM profiles WHERE account_id = ?',
        [accountId]
      ).all<{ id: string; name: string; avatar_color: string; created_at: number }>();
      
      return json({ profiles: result.results });
    }
    
    // POST /profiles - 创建孩子
    if (request.method === 'POST' && path === '/profiles') {
      try {
        const body = await getJson<ProfileBody>(request);
        const profileId = crypto.randomUUID();
        
        await env.DB.prepare(
          'INSERT INTO profiles (id, account_id, name, avatar_color, created_at) VALUES (?, ?, ?, ?, ?)',
          [profileId, accountId, body.name, body.avatar_color || '#7c6fff', Date.now()]
        ).run();
        
        // 初始化空配置
        const defaultConfig = JSON.stringify({
          version: '1.3',
          studyList: [],
          allowList: [],
          blacklist: []
        });
        await env.DB.prepare(
          'INSERT INTO configs (profile_id, data, updated_at) VALUES (?, ?, ?)',
          [profileId, defaultConfig, Date.now()]
        ).run();
        
        return json({ 
          success: true, 
          profile: { id: profileId, name: body.name, avatar_color: body.avatar_color }
        });
      } catch (e) {
        return json({ error: 'Failed to create profile' }, 500);
      }
    }
    
    // GET /profiles/:id/config - 获取配置
    const configMatch = path.match(/^\/profiles\/([^/]+)\/config$/);
    if (request.method === 'GET' && configMatch) {
      const profileId = configMatch[1];
      
      // 验证归属
      const profile = await env.DB.prepare(
        'SELECT id FROM profiles WHERE id = ? AND account_id = ?',
        [profileId, accountId]
      ).first<{ id: string }>();
      
      if (!profile) {
        return json({ error: 'Profile not found' }, 404);
      }
      
      const config = await env.DB.prepare(
        'SELECT data, updated_at FROM configs WHERE profile_id = ?',
        [profileId]
      ).first<{ data: string; updated_at: number }>();
      
      return json({ 
        data: config ? JSON.parse(config.data) : {},
        updated_at: config?.updated_at || 0,
        profile_id: profileId
      });
    }
    
    // PUT /profiles/:id/config - 更新配置
    if (request.method === 'PUT' && configMatch) {
      const profileId = configMatch[1];
      
      // 验证归属
      const profile = await env.DB.prepare(
        'SELECT id FROM profiles WHERE id = ? AND account_id = ?',
        [profileId, accountId]
      ).first<{ id: string }>();
      
      if (!profile) {
        return json({ error: 'Profile not found' }, 404);
      }
      
      try {
        const body = await getJson<{ data: object }>(request);
        const now = Date.now();
        
        await env.DB.prepare(
          'INSERT OR REPLACE INTO configs (profile_id, data, updated_at) VALUES (?, ?, ?)',
          [profileId, JSON.stringify(body.data), now]
        ).run();
        
        return json({ success: true, updated_at: now });
      } catch (e) {
        return json({ error: 'Failed to update config' }, 500);
      }
    }
    
    return json({ error: 'Not found' }, 404);
  }
};
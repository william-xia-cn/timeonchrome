// Device 路由 - 设备绑定、配置拉取
import { json, getJson, Env } from '../db/middleware';

interface BindBody {
  device_token?: string;
  profile_id: string;
  device_name?: string;
}

// 验证 device_token
async function verifyDeviceToken(request: Request, env: Env): Promise<string | null> {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  
  const token = auth.slice(7);
  
  const device = await env.DB.prepare(
    'SELECT profile_id FROM devices WHERE device_token = ?',
    [token]
  ).first<{ profile_id: string }>();
  
  return device?.profile_id || null;
}

// 生成 device_token
function generateDeviceToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

export const deviceRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // POST /device/bind - 绑定设备
    if (request.method === 'POST' && path === '/device/bind') {
      try {
        const body = await getJson<BindBody>(request);
        const { profile_id, device_name } = body;
        
        if (!profile_id) {
          return json({ error: 'profile_id required' }, 400);
        }
        
        // 验证 profile 存在
        const profile = await env.DB.prepare(
          'SELECT id FROM profiles WHERE id = ?',
          [profile_id]
        ).first<{ id: string }>();
        
        if (!profile) {
          return json({ error: 'Profile not found' }, 404);
        }
        
        // 生成新 token 或复用
        let deviceToken = body.device_token;
        let isNew = false;
        
        if (!deviceToken) {
          deviceToken = generateDeviceToken();
          isNew = true;
        }
        
        if (isNew) {
          const deviceId = crypto.randomUUID();
          await env.DB.prepare(
            'INSERT INTO devices (id, profile_id, device_token, device_name, bound_at) VALUES (?, ?, ?, ?, ?)',
            [deviceId, profile_id, deviceToken, device_name || 'Chrome Extension', Date.now()]
          ).run();
        }
        
        return json({ 
          success: true, 
          device_token: deviceToken,
          profile_id 
        });
      } catch (e) {
        return json({ error: 'Failed to bind device' }, 500);
      }
    }
    
    // GET /device/config - 获取配置（device_token 鉴权）
    if (request.method === 'GET' && path === '/device/config') {
      const profileId = await verifyDeviceToken(request, env);
      if (!profileId) {
        return json({ error: 'Invalid device token' }, 401);
      }
      
      const config = await env.DB.prepare(
        'SELECT data, updated_at FROM configs WHERE profile_id = ?',
        [profileId]
      ).first<{ data: string; updated_at: number }>();
      
      // 获取当前版本号（简化：用 updated_at 作为版本）
      const version = config?.updated_at || 0;
      
      return json({
        data: config ? JSON.parse(config.data) : {},
        version,
        profile_id: profileId
      });
    }
    
    return json({ error: 'Not found' }, 404);
  }
};
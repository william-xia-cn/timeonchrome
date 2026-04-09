// Sessions 路由 - Session 文件上传到 R2
import { json, getJson, Env } from '../db/middleware';

interface SessionEntry {
  id: string;
  domain: string;
  startAt: number;
  endAt: number;
  duration: number;
  activeTime: number;
  passiveTime: number;
  endReason: string;
}

interface SessionsBody {
  date: string;
  sessions: SessionEntry[];
}

// 验证 device_token
async function verifyDeviceToken(env: Env, token: string): Promise<string | null> {
  const device = await env.DB.prepare(
    'SELECT profile_id FROM devices WHERE device_token = ?',
    [token]
  ).first<{ profile_id: string }>();
  return device?.profile_id || null;
}

export const sessionsRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // POST /device/sessions/upload - 上传 Session 文件到 R2
    if (request.method === 'POST' && path === '/device/sessions/upload') {
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
        const body = await getJson<SessionsBody>(request);
        const { date, sessions } = body;
        
        if (!date || !sessions) {
          return json({ error: 'date and sessions required' }, 400);
        }
        
        // R2 路径：sessions/{profile_id}/{date}.json
        const key = `sessions/${profileId}/${date}.json`;
        const content = JSON.stringify({
          profile_id: profileId,
          date,
          sessions,
          uploaded_at: Date.now()
        }, null, 2);
        
        await env.SESSION_FILES.put(key, content);
        
        return json({ 
          success: true, 
          key,
          count: sessions.length
        });
      } catch (e) {
        return json({ error: 'Failed to upload sessions: ' + e.message }, 500);
      }
    }
    
    return json({ error: 'Not found' }, 404);
  }
};
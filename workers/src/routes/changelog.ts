// Changelog 路由 - 配置变更日志
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
        const body = await request.text();
        const data = JSON.parse(body);
        const { action, before_data, after_data } = data;
        
        if (!action) {
          return json({ error: 'action required' }, 400);
        }
        
        const id = crypto.randomUUID();
        const now = Date.now();
        const beforeStr = before_data ? JSON.stringify(before_data).replace(/'/g, "''") : 'NULL';
        const afterStr = after_data ? JSON.stringify(after_data).replace(/'/g, "''") : 'NULL';
        
        // 存储到 profiles 表的 changelog JSON 字段（简化处理）
        // 实际项目中应该新建 changelogs 表
        const existingLogStmt = await env.DB.prepare(
          `SELECT changelog FROM profiles WHERE id = '${profileId}'`
        );
        const existingRow = await existingLogStmt.first<{ changelog: string }>();
        const existingLog = existingRow?.changelog ? JSON.parse(existingRow.changelog) : [];
        
        existingLog.unshift({
          id,
          action,
          before_data: before_data || null,
          after_data: after_data || null,
          created_at: now
        });
        
        // 保留最近 100 条
        const trimmedLog = existingLog.slice(0, 100);
        const logStr = JSON.stringify(trimmedLog).replace(/'/g, "''");
        
        await env.DB.exec(
          `UPDATE profiles SET changelog = '${logStr}', updated_at = ${now} WHERE id = '${profileId}'`
        );
        
        return json({ success: true, id });
      } catch (e: any) {
        return json({ error: 'Failed to save changelog: ' + e.message }, 500);
      }
    }
    
    // GET /profiles/:id/changelog - 查询变更日志（account_token）
    const changelogMatch = path.match(/^\/profiles\/([^/]+)\/changelog$/);
    if (request.method === 'GET' && changelogMatch) {
      const profileId = changelogMatch[1];
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
      
      const configStmt = await env.DB.prepare(
        `SELECT changelog FROM profiles WHERE id = '${profileId}'`
      );
      const row = await configStmt.first<{ changelog: string }>();
      const changelogs = row?.changelog ? JSON.parse(row.changelog) : [];
      
      return json({ changelogs });
    }
    
    return json({ error: 'Not found' }, 404);
  }
};
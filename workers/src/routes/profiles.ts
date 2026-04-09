// Profiles 路由 - 孩子 Profile CRUD
import { json, Env } from '../db/middleware';

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

export const profilesRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // 验证登录
    const accountId = await verifyAccountToken(request);
    if (!accountId) {
      return json({ error: 'Unauthorized' }, 401);
    }
    
    // GET /profiles - 获取所有孩子
    if (request.method === 'GET' && path === '/profiles') {
      const stmt = await env.DB.prepare(
        `SELECT id, name, avatar_color, created_at FROM profiles WHERE account_id = '${accountId}'`
      );
      const result = await stmt.all<{ id: string; name: string; avatar_color: string; created_at: number }>();
      
      return json({ profiles: result.results || [] });
    }
    
    // POST /profiles - 创建孩子
    if (request.method === 'POST' && path === '/profiles') {
      try {
        const body = await request.text();
        const data = JSON.parse(body);
        const profileId = crypto.randomUUID();
        const now = Date.now();
        const avatarColor = data.avatar_color || '#7c6fff';
        
        // 初始化完整配置
        const defaultConfig = JSON.stringify({
          version: '1.3',
          mode: 'whitelist',
          enabled: true,
          // 默认学习网站
          studyList: [
            'google.com', 'drive.google.com', 'docs.google.com', 'sheets.google.com', 'slides.google.com', 'meet.google.com', 'calendar.google.com', 'classroom.google.com', 'keep.google.com',
            'office.com', 'onenote.com', 'outlook.live.com',
            'openai.com', 'claude.ai', 'gemini.google.com', 'perplexity.ai',
            'khanacademy.org', 'coursera.org', 'edx.org', 'brilliant.org', 'udemy.com',
            'github.com', 'stackoverflow.com', 'leetcode.com', 'replit.com', 'codepen.io',
            'notion.so', 'obsidian.md', 'ankiweb.net',
            'canva.com', 'figma.com',
            'arxiv.org', 'scholar.google.com'
          ],
          // 默认允许网站
          allowList: [
            'google.com', 'google.com.hk', 'bing.com', 'search.brave.com', 'duckduckgo.com',
            'youtube.com', 'music.youtube.com', 'spotify.com', 'music.163.com',
            'wikipedia.org', 'ritannica.com'
          ],
          // 默认黑名单
          blacklist: ['douyin.com', 'tiktok.com'],
          dailyQuota: 0,
          domainQuotas: {},
          schedule: {
            enabled: false,
            days: {
              0: { enabled: true, start: '08:00', end: '21:00' },
              1: { enabled: true, start: '15:00', end: '21:00' },
              2: { enabled: true, start: '15:00', end: '21:00' },
              3: { enabled: true, start: '15:00', end: '21:00' },
              4: { enabled: true, start: '15:00', end: '21:00' },
              5: { enabled: true, start: '15:00', end: '21:00' },
              6: { enabled: true, start: '08:00', end: '21:00' }
            }
          },
          restConfig: {
            reminderInterval: 15,
            maxRestDuration: 60
          },
          autoStudyConfig: {
            enabled: true,
            requiredSeconds: 60
          },
          tempWhitelistConfig: {
            duration: 1
          },
          tempWhitelist: {
            domains: {}
          }
        }).replace(/'/g, "''");
        
        await env.DB.exec(
          `INSERT INTO profiles (id, account_id, name, avatar_color, config, created_at, updated_at) VALUES ('${profileId}', '${accountId}', '${data.name}', '${avatarColor}', '${defaultConfig}', ${now}, ${now})`
        );
        
        return json({ 
          success: true, 
          profile: { id: profileId, name: data.name, avatar_color: avatarColor }
        });
      } catch (e: any) {
        return json({ error: 'Failed to create profile: ' + e.message }, 500);
      }
    }
    
    // GET /profiles/:id/config - 获取配置
    const configMatch = path.match(/^\/profiles\/([^/]+)\/config$/);
    if (request.method === 'GET' && configMatch) {
      const profileId = configMatch[1];
      
      // 验证归属
      const stmt = await env.DB.prepare(
        `SELECT id FROM profiles WHERE id = '${profileId}' AND account_id = '${accountId}'`
      );
      const profile = await stmt.first<{ id: string }>();
      
      if (!profile) {
        return json({ error: 'Profile not found' }, 404);
      }
      
      const configStmt = await env.DB.prepare(
        `SELECT config, updated_at FROM profiles WHERE id = '${profileId}'`
      );
      const configRow = await configStmt.first<{ config: string; updated_at: number }>();
      
      const configData = configRow?.config ? JSON.parse(configRow.config) : {};
      
      return json({ 
        data: configData,
        updated_at: configRow?.updated_at || 0,
        profile_id: profileId
      });
    }
    
    // PUT /profiles/:id/config - 更新配置
    if (request.method === 'PUT' && configMatch) {
      const profileId = configMatch[1];
      
      // 验证归属
      const stmt = await env.DB.prepare(
        `SELECT id FROM profiles WHERE id = '${profileId}' AND account_id = '${accountId}'`
      );
      const profile = await stmt.first<{ id: string }>();
      
      if (!profile) {
        return json({ error: 'Profile not found' }, 404);
      }
      
      try {
        const body = await request.text();
        const data = JSON.parse(body);
        const now = Date.now();
        const configStr = JSON.stringify(data.data).replace(/'/g, "''");
        
        await env.DB.exec(
          `UPDATE profiles SET config = '${configStr}', version = version + 1, updated_at = ${now} WHERE id = '${profileId}'`
        );
        
        return json({ success: true, updated_at: now });
      } catch (e: any) {
        return json({ error: 'Failed to update config: ' + e.message }, 500);
      }
    }
    
    return json({ error: 'Not found' }, 404);
  }
};
// Profiles 路由 - 孩子 Profile CRUD
import { json, Env, verifyAccountToken } from '../db/middleware';

// 默认配置（与 background.js DEFAULT_CONFIG 保持一致）
function buildDefaultConfig(): object {
  return {
    version: '1.3',
    mode: 'whitelist',
    enabled: true,
    studyList: [
      // 核心生产力与协作
      'google.com', 'drive.google.com', 'docs.google.com', 'sheets.google.com',
      'slides.google.com', 'meet.google.com', 'calendar.google.com', 'classroom.google.com',
      'keep.google.com', 'colab.research.google.com',
      'office.com', 'onenote.com', 'outlook.live.com', 'planner.microsoft.com',
      'to-do.office.com', 'teams.microsoft.com',
      // AI 增强与学术研究
      'openai.com', 'claude.ai', 'gemini.google.com', 'poe.com', 'perplexity.ai',
      'notebooklm.google.com', 'elicit.org', 'consensus.app', 'scite.ai',
      'wolframalpha.com', 'gamma.app',
      // 语言强化与写作辅助
      'quizlet.com', 'noredink.com', 'membean.com', 'achieve3000.com', 'quillbot.com',
      'grammarly.com', 'overleaf.com', 'zotero.org', 'mendeley.com',
      'owl.purdue.edu', 'citationmachine.net',
      // IB 专项资源
      'ibo.org', 'managebac.com', 'kognity.com', 'revisionvillage.com', 'savemyexams.com',
      'ibdocuments.com', 'ibsurvival.com', 'lanterna.com', 'thinking.net',
      'bioninja.com.au', 'theoryofknowledge.net',
      // 通用学习与在线课程
      'khanacademy.org', 'ocw.mit.edu', 'coursera.org', 'edx.org', 'brilliant.org',
      'udemy.com', 'futurelearn.com', 'britannica.com',
      // 数学、物理与实验模拟
      'desmos.com', 'geogebra.org', 'symbolab.com', 'mathway.com',
      'physicsclassroom.com', 'phet.colorado.edu', 'falstad.com', 'myphysicslab.com', 'logic.ly',
      // 计算机科学与电子工程
      'github.com', 'stackoverflow.com', 'leetcode.com', 'hackerrank.com', 'codingbat.com',
      'replit.com', 'codepen.io', 'tinkercad.com', 'arduino.cc', 'raspberrypi.com',
      'instructables.com',
      // 学术数据库与人文历史
      'arxiv.org', 'scholar.google.com', 'jstor.org', 'researchgate.net',
      'semanticscholar.org', 'pubmed.ncbi.nlm.nih.gov', 'gutenberg.org', 'plato.stanford.edu',
      // 视觉设计与创意
      'canva.com', 'figma.com', 'photopea.com', 'pixlr.com',
      // 效率工具
      'notion.so', 'obsidian.md', 'ankiweb.net', 'trello.com', 'slack.com', 'reclaim.ai',
      // 教育认证
      'collegeboard.org',
    ],
    allowList: [
      // 搜索引擎
      'google.com', 'google.com.hk', 'bing.com', 'baidu.com',
      'search.brave.com', 'duckduckgo.com',
      // 问答社区
      'stackexchange.com', 'reddit.com',
      // 视频/音乐
      'youtube.com', 'music.youtube.com', 'spotify.com', 'music.163.com', 'bilibili.com',
      // 百科/参考
      'wikipedia.org', 'britannica.com', 'wolframalpha.com',
    ],
    blacklist: ['douyin.com', 'tiktok.com'],
    dailyOnlineQuota: 1200,
    dailyStudyQuota:  480,
    dailyRestQuota:   120,
    domainQuotas: {},
    quotaState: { onlineLocked: false, studyLocked: false, restLocked: false },
    schedule: {
      enabled: false,
      days: {
        0: { enabled: true, start: '08:00', end: '21:00' },
        1: { enabled: true, start: '15:00', end: '21:00' },
        2: { enabled: true, start: '15:00', end: '21:00' },
        3: { enabled: true, start: '15:00', end: '21:00' },
        4: { enabled: true, start: '15:00', end: '21:00' },
        5: { enabled: true, start: '15:00', end: '21:00' },
        6: { enabled: true, start: '08:00', end: '21:00' },
      },
    },
    restConfig:         { reminderInterval: 15, maxRestDuration: 60 },
    autoStudyConfig:    { enabled: true, requiredSeconds: 60 },
    tempWhitelistConfig:{ duration: 1 },
    tempWhitelist:      { domains: {} },
  };
}

export const profilesRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url  = new URL(request.url);
    const path = url.pathname;

    const accountId = await verifyAccountToken(request, env.JWT_SECRET);
    if (!accountId) return json({ error: 'Unauthorized' }, 401);

    // GET /profiles
    if (request.method === 'GET' && path === '/profiles') {
      const result = await env.DB.prepare(
        `SELECT id, name, avatar_color, config, created_at, updated_at
         FROM profiles WHERE account_id = ?`
      ).bind(accountId).all<{
        id: string; name: string; avatar_color: string;
        config: string; created_at: number; updated_at: number;
      }>();

      const profiles = (result.results || []).map(row => ({
        id:           row.id,
        name:         row.name,
        avatar_color: row.avatar_color,
        config:       row.config ? JSON.parse(row.config) : null,
        created_at:   row.created_at,
        updated_at:   row.updated_at,
      }));

      return json({ profiles });
    }

    // POST /profiles
    if (request.method === 'POST' && path === '/profiles') {
      try {
        const { name, avatar_color } = await request.json<{ name: string; avatar_color?: string }>();
        const profileId   = crypto.randomUUID();
        const now         = Date.now();
        const avatarColor = avatar_color || '#7c6fff';
        const configStr   = JSON.stringify(buildDefaultConfig());

        await env.DB.prepare(
          `INSERT INTO profiles (id, account_id, name, avatar_color, config, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(profileId, accountId, name, avatarColor, configStr, now, now).run();

        return json({
          success: true,
          profile: {
            id:           profileId,
            name,
            avatar_color: avatarColor,
            config:       buildDefaultConfig(),
            created_at:   Math.floor(now / 1000),
            updated_at:   Math.floor(now / 1000),
          },
        });
      } catch (e: any) {
        return json({ error: 'Failed to create profile: ' + e.message }, 500);
      }
    }

    // ── 以下路由均需 profileId ──────────────────────────────────────────

    const configMatch      = path.match(/^\/profiles\/([^/]+)\/config$/);
    const devicesMatch     = path.match(/^\/profiles\/([^/]+)\/devices$/);
    const deviceIdMatch    = path.match(/^\/profiles\/([^/]+)\/devices\/([^/]+)$/);
    const profileSelfMatch = path.match(/^\/profiles\/([^/]+)$/);

    // 抽取 profileId 并验证归属
    const profileId =
      configMatch?.[1] ?? devicesMatch?.[1] ?? deviceIdMatch?.[1] ?? profileSelfMatch?.[1] ?? null;

    if (!profileId) return json({ error: 'Not found' }, 404);

    const owner = await env.DB.prepare(
      `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
    ).bind(profileId, accountId).first<{ id: string }>();

    if (!owner) return json({ error: 'Profile not found' }, 404);

    // GET /profiles/:id/config
    if (request.method === 'GET' && configMatch) {
      const row = await env.DB.prepare(
        `SELECT config, updated_at FROM profiles WHERE id = ?`
      ).bind(profileId).first<{ config: string; updated_at: number }>();

      return json({
        data:       row?.config ? JSON.parse(row.config) : {},
        updated_at: row?.updated_at || 0,
        profile_id: profileId,
      });
    }

    // PUT /profiles/:id/config
    if (request.method === 'PUT' && configMatch) {
      try {
        const { data } = await request.json<{ data: unknown }>();
        const now       = Date.now();
        const configStr = JSON.stringify(data);

        await env.DB.prepare(
          `UPDATE profiles SET config = ?, version = version + 1, updated_at = ? WHERE id = ?`
        ).bind(configStr, now, profileId).run();

        return json({ success: true, updated_at: now });
      } catch (e: any) {
        return json({ error: 'Failed to update config: ' + e.message }, 500);
      }
    }

    // GET /profiles/:id/devices
    if (request.method === 'GET' && devicesMatch) {
      const result = await env.DB.prepare(
        `SELECT id, device_name, last_seen, created_at
         FROM devices WHERE profile_id = ? ORDER BY last_seen DESC`
      ).bind(profileId).all<{
        id: string; device_name: string; last_seen: number; created_at: number;
      }>();

      return json({ devices: result.results || [] });
    }

    // PATCH /profiles/:id/devices/:deviceId - 重命名设备
    if (request.method === 'PATCH' && deviceIdMatch) {
      const deviceId = deviceIdMatch[2];

      const dev = await env.DB.prepare(
        `SELECT id FROM devices WHERE id = ? AND profile_id = ?`
      ).bind(deviceId, profileId).first<{ id: string }>();

      if (!dev) return json({ error: 'Device not found' }, 404);

      try {
        const { name } = await request.json<{ name: string }>();
        if (!name || typeof name !== 'string') return json({ error: 'name required' }, 400);

        await env.DB.prepare(
          `UPDATE devices SET device_name = ? WHERE id = ?`
        ).bind(name.trim().slice(0, 64), deviceId).run();

        return json({ success: true });
      } catch (e: any) {
        return json({ error: 'Failed to rename: ' + e.message }, 500);
      }
    }

    // DELETE /profiles/:id/devices/:deviceId - 解绑设备
    if (request.method === 'DELETE' && deviceIdMatch) {
      const deviceId = deviceIdMatch[2];

      const dev = await env.DB.prepare(
        `SELECT id FROM devices WHERE id = ? AND profile_id = ?`
      ).bind(deviceId, profileId).first<{ id: string }>();

      if (!dev) return json({ error: 'Device not found' }, 404);

      await env.DB.prepare(
        `DELETE FROM devices WHERE id = ?`
      ).bind(deviceId).run();

      return json({ success: true });
    }

    // PATCH /profiles/:id - 编辑档案（名称、头像颜色）
    if (request.method === 'PATCH' && profileSelfMatch) {
      try {
        const { name, avatar_color } = await request.json<{ name?: string; avatar_color?: string }>();
        if (!name && !avatar_color) return json({ error: 'name or avatar_color required' }, 400);

        const updates: string[] = [];
        const bindings: unknown[] = [];

        if (name) {
          const trimmed = name.trim().slice(0, 50);
          if (!trimmed) return json({ error: 'name cannot be empty' }, 400);
          updates.push('name = ?');
          bindings.push(trimmed);
        }
        if (avatar_color) {
          updates.push('avatar_color = ?');
          bindings.push(avatar_color);
        }

        bindings.push(profileId);
        await env.DB.prepare(
          `UPDATE profiles SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...bindings).run();

        return json({ success: true });
      } catch (e: any) {
        return json({ error: 'Failed to update profile: ' + e.message }, 500);
      }
    }

    // DELETE /profiles/:id - 删除档案（级联删除设备、统计数据）
    if (request.method === 'DELETE' && profileSelfMatch) {
      try {
        // 1. 删除关联设备
        await env.DB.prepare(`DELETE FROM devices WHERE profile_id = ?`).bind(profileId).run();

        // 2. 删除统计数据
        await env.DB.prepare(`DELETE FROM stats WHERE profile_id = ?`).bind(profileId).run();

        // 3. 删除 R2 sessions（列出并批量删除）
        try {
          const listed = await env.SESSION_FILES.list({ prefix: `sessions/${profileId}/` });
          for (const obj of listed.objects) {
            await env.SESSION_FILES.delete(obj.key);
          }
        } catch (e) {
          // R2 删除失败不阻止整体操作
        }

        // 4. 删除 Profile 本身
        await env.DB.prepare(
          `DELETE FROM profiles WHERE id = ? AND account_id = ?`
        ).bind(profileId, accountId).run();

        return json({ success: true });
      } catch (e: any) {
        return json({ error: 'Failed to delete profile: ' + e.message }, 500);
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};

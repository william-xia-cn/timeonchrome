// compositeSessions.ts - 复合型会话 CRUD + 家长审核 + 自动分类规则
import { json, Env, verifyAccountToken } from '../db/middleware';
import { matchDomain as matchDomainV12 } from '../../../extension/core/domain-semantics.js';
import { deviceUnboundResponse, verifyDeviceTokenFromRequest } from './deviceIdentity';

// ── device_token 验证辅助 ──────────────────────────────────────────────────────

// ── 自动分类规则匹配 ────────────────────────────────────────────────────────────

function autoClassify(
  domain: string,
  title: string,
  rules: Array<{ domain: string; keyword: string; classification: string }>
): string | null {
  for (const rule of rules) {
    if (!matchDomainV12(domain, rule.domain)) continue;
    if (title.toLowerCase().includes(rule.keyword.toLowerCase())) {
      return rule.classification;
    }
  }
  return null;
}

// ── 路由 ───────────────────────────────────────────────────────────────────────

export const compositeSessionsRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url  = new URL(request.url);
    const path = url.pathname;

    // ── 设备端接口（device_token 鉴权）─────────────────────────────────────────

    // POST /device/composite-sessions  上传本地缓存的会话记录
    if (request.method === 'POST' && path === '/device/composite-sessions') {
      const device = await verifyDeviceTokenFromRequest(request, env);
      if (!device) return json({ error: 'Invalid device token' }, 401);
      if (device.unbound) return deviceUnboundResponse(device.deviceId);
      const profileId = device.profileId;

      try {
        const { sessions } = await request.json<{
          sessions: Array<{
            id: string; domain: string; title: string; date: string;
            start_time: number; duration: number;
          }>;
        }>();

        if (!Array.isArray(sessions) || sessions.length === 0) {
          return json({ saved: 0 });
        }

        // 获取分类规则，自动打标签
        const profileRow = await env.DB.prepare(
          `SELECT config FROM profiles WHERE id = ?`
        ).bind(profileId).first<{ config: string }>();
        const config = profileRow?.config ? JSON.parse(profileRow.config) : {};
        const rules: any[] = config.classificationRules || [];

        // 获取当前请求设备的 device_id
        const deviceId = device.deviceId;

        let saved = 0;
        for (const s of sessions.slice(0, 200)) {
          const autoClass = autoClassify(s.domain, s.title, rules);
          // UPSERT: 同一 id 重复上传幂等处理
          try {
            await env.DB.prepare(`
              INSERT OR IGNORE INTO composite_sessions
                (id, profile_id, device_id, domain, title, date, start_time, duration,
                 classification, classified_by, classified_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              s.id, profileId, deviceId,
              s.domain, (s.title || '').slice(0, 512), s.date,
              s.start_time, s.duration,
              autoClass,
              autoClass ? 'rule' : null,
              autoClass ? Date.now() : null
            ).run();
            saved++;
          } catch (_) { /* duplicate, skip */ }
        }

        return json({ saved });
      } catch (e: any) {
        return json({ error: e.message }, 500);
      }
    }

    // GET /device/weekly-sessions?week_start=YYYY-MM-DD  孩子端拉取本周待定时段全览
    if (request.method === 'GET' && path === '/device/weekly-sessions') {
      const device = await verifyDeviceTokenFromRequest(request, env);
      if (!device) return json({ error: 'Invalid device token' }, 401);
      if (device.unbound) return deviceUnboundResponse(device.deviceId);
      const profileId = device.profileId;

      const weekStart = url.searchParams.get('week_start');
      if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
        return json({ error: 'week_start required (YYYY-MM-DD)' }, 400);
      }

      // 计算周结束日期（+6天）
      const start = new Date(weekStart);
      const end   = new Date(start);
      end.setDate(end.getDate() + 6);
      const weekEnd = end.toISOString().slice(0, 10);

      const result = await env.DB.prepare(`
        SELECT cs.id, cs.domain, cs.title, cs.date, cs.duration,
               cs.classification, cs.classified_by,
               sa.id as appeal_id, sa.status as appeal_status
        FROM composite_sessions cs
        LEFT JOIN session_appeals sa ON sa.session_id = cs.id AND sa.profile_id = cs.profile_id
        WHERE cs.profile_id = ? AND cs.date >= ? AND cs.date <= ?
        ORDER BY cs.date DESC, cs.start_time DESC
        LIMIT 500
      `).bind(profileId, weekStart, weekEnd).all<{
        id: string; domain: string; title: string; date: string;
        duration: number; classification: string | null; classified_by: string | null;
        appeal_id: string | null; appeal_status: string | null;
      }>();

      return json({ sessions: result.results || [] });
    }

    // POST /device/appeal  孩子提交申诉
    if (request.method === 'POST' && path === '/device/appeal') {
      const device = await verifyDeviceTokenFromRequest(request, env);
      if (!device) return json({ error: 'Invalid device token' }, 401);
      if (device.unbound) return deviceUnboundResponse(device.deviceId);
      const profileId = device.profileId;

      try {
        const { session_id, reason } = await request.json<{ session_id: string; reason?: string }>();
        if (!session_id) return json({ error: 'session_id required' }, 400);

        // 验证会话属于该 profile
        const session = await env.DB.prepare(
          `SELECT id, classification, date FROM composite_sessions WHERE id = ? AND profile_id = ?`
        ).bind(session_id, profileId).first<{ id: string; classification: string; date: string }>();

        if (!session) return json({ error: 'Session not found' }, 404);
        if (!session.classification) return json({ error: 'Cannot appeal unclassified session' }, 400);

        // 只允许本周申诉
        const sessionDate = new Date(session.date);
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        if (sessionDate < weekAgo) {
          return json({ error: 'Appeals only allowed within the same week' }, 400);
        }

        // 每条会话只能申诉一次
        const existing = await env.DB.prepare(
          `SELECT id FROM session_appeals WHERE session_id = ?`
        ).bind(session_id).first<{ id: string }>();
        if (existing) return json({ error: 'Already appealed' }, 409);

        const appealId = crypto.randomUUID();
        await env.DB.prepare(`
          INSERT INTO session_appeals (id, session_id, profile_id, reason, status, original_classification, created_at)
          VALUES (?, ?, ?, ?, 'pending', ?, ?)
        `).bind(appealId, session_id, profileId, reason || null, session.classification, Date.now()).run();

        // 发送申诉通知邮件（非阻塞，最多每小时一次）
        if (env.RESEND_API_KEY) {
          const row = await env.DB.prepare(
            `SELECT a.email, p.name FROM profiles p JOIN accounts a ON p.account_id = a.id WHERE p.id = ?`
          ).bind(profileId).first<{ email: string; name: string }>();

          if (row?.email) {
            const dedupKey = `appeal_notify:${profileId}`;
            const already  = await env.CONFIG_CACHE.get(dedupKey);
            if (!already) {
              const subject = `[TimeOnChrome] ${row.name} 对判定结果提出了申诉`;
              const html = `
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;">
                  <div style="background:#6c63ff;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
                    <h2 style="color:#fff;margin:0;font-size:18px;">TimeOnChrome 申诉通知</h2>
                  </div>
                  <p style="color:#333;font-size:14px;line-height:1.8;">
                    ${row.name} 对一条会话的判定结果提出了申诉，请登录管理控制台查看详情并处理。
                  </p>
                  ${reason ? `<p style="color:#555;font-size:13px;background:#f9f9f9;padding:12px;border-radius:8px;">申诉理由：${reason}</p>` : ''}
                  <hr style="margin:24px 0;border:none;border-top:1px solid #eee;">
                  <p style="color:#999;font-size:12px;margin:0;">请登录 TimeOnChrome 管理控制台处理申诉。</p>
                </div>`.trim();

              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.RESEND_API_KEY}` },
                body: JSON.stringify({ from: 'TimeOnChrome <notify@hornburg-xia.cn>', to: [row.email], subject, html }),
              });
              await env.CONFIG_CACHE.put(dedupKey, '1', { expirationTtl: 3600 });
            }
          }
        }

        return json({ success: true, appeal_id: appealId });
      } catch (e: any) {
        return json({ error: e.message }, 500);
      }
    }

    // ── 家长端接口（account_token 鉴权）────────────────────────────────────────

    const profileMatch = path.match(/^\/profiles\/([^/]+)\/(pending-reviews|appeals|classify|resolve-appeal|classification-rules)$/);
    if (!profileMatch) return json({ error: 'Not found' }, 404);

    const accountId = await verifyAccountToken(request, env.JWT_SECRET);
    if (!accountId) return json({ error: 'Unauthorized' }, 401);

    const profileId  = profileMatch[1];
    const subpath    = profileMatch[2];

    // 验证 profile 归属
    const owner = await env.DB.prepare(
      `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
    ).bind(profileId, accountId).first<{ id: string }>();
    if (!owner) return json({ error: 'Profile not found' }, 404);

    // GET /profiles/:id/pending-reviews  获取待审核会话（自动分组）
    if (request.method === 'GET' && subpath === 'pending-reviews') {
      const dateParam = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);

      const result = await env.DB.prepare(`
        SELECT id, domain, title, date, duration, start_time
        FROM composite_sessions
        WHERE profile_id = ? AND classification IS NULL AND date = ?
        ORDER BY start_time DESC
        LIMIT 200
      `).bind(profileId, dateParam).all<{
        id: string; domain: string; title: string; date: string;
        duration: number; start_time: number;
      }>();

      // 按域名 + 关键词分组（简单启发式：大写字母单词 / 引号内词组）
      const sessions = result.results || [];
      const groups: Record<string, { sessions: typeof sessions; suggestion: string }> = {};

      for (const s of sessions) {
        // 提取标题中前3个显眼词作为分组 key
        const words = s.title.replace(/[-|–—·•]/g, ' ').split(/\s+/).filter(w => w.length > 3).slice(0, 3);
        const groupKey = `${s.domain}|${words.join(' ')}`;
        if (!groups[groupKey]) {
          // 启发式建议：含 "lecture/tutorial/study/学习/课" 建议学习
          const lc = s.title.toLowerCase();
          const studyKeywords = ['lecture', 'tutorial', 'study', 'lesson', 'course', 'class', 'homework', '学习', '课程', '教程', '讲座'];
          const restKeywords  = ['gaming', 'game', 'minecraft', 'entertainment', 'funny', 'vlog', '游戏', '娱乐', '搞笑'];
          const suggestion = studyKeywords.some(k => lc.includes(k)) ? 'study'
            : restKeywords.some(k => lc.includes(k)) ? 'rest' : null;
          groups[groupKey] = { sessions: [], suggestion: suggestion || 'unknown' };
        }
        groups[groupKey].sessions.push(s);
      }

      return json({
        total: sessions.length,
        groups: Object.entries(groups).map(([key, g]) => ({
          key,
          domain:     g.sessions[0].domain,
          suggestion: g.suggestion,
          sessions:   g.sessions,
        }))
      });
    }

    // POST /profiles/:id/classify  家长提交分类结果
    if (request.method === 'POST' && subpath === 'classify') {
      try {
        const { classifications, scope, keyword } = await request.json<{
          classifications: Array<{ session_id: string; classification: 'study' | 'rest' }>;
          scope?: 'session' | 'keyword' | 'domain';  // 默认 session
          keyword?: string;
        }>();

        if (!Array.isArray(classifications) || classifications.length === 0) {
          return json({ error: 'classifications required' }, 400);
        }

        const now = Date.now();
        let updated = 0;

        for (const { session_id, classification } of classifications) {
          await env.DB.prepare(`
            UPDATE composite_sessions
            SET classification = ?, classified_by = 'parent', classified_at = ?
            WHERE id = ? AND profile_id = ?
          `).bind(classification, now, session_id, profileId).run();
          updated++;
        }

        // 如果 scope=keyword，自动添加分类规则
        if (scope === 'keyword' && keyword && classifications.length > 0) {
          const firstSession = await env.DB.prepare(
            `SELECT domain FROM composite_sessions WHERE id = ?`
          ).bind(classifications[0].session_id).first<{ domain: string }>();

          if (firstSession) {
            const profileRow = await env.DB.prepare(
              `SELECT config FROM profiles WHERE id = ?`
            ).bind(profileId).first<{ config: string }>();
            const config = profileRow?.config ? JSON.parse(profileRow.config) : {};
            const rules: any[] = config.classificationRules || [];

            // 避免重复规则
            const exists = rules.some(r => r.domain === firstSession.domain && r.keyword === keyword);
            if (!exists) {
              rules.push({ domain: firstSession.domain, keyword, classification: classifications[0].classification });
              config.classificationRules = rules;
              await env.DB.prepare(
                `UPDATE profiles SET config = ?, version = version + 1, updated_at = ? WHERE id = ?`
              ).bind(JSON.stringify(config), now, profileId).run();
            }
          }
        }

        // 如果 scope=domain，把整个域名从 compositeList 移到 studyList 或完全移出
        if (scope === 'domain' && classifications.length > 0) {
          const firstSession = await env.DB.prepare(
            `SELECT domain FROM composite_sessions WHERE id = ?`
          ).bind(classifications[0].session_id).first<{ domain: string }>();

          if (firstSession) {
            const profileRow = await env.DB.prepare(
              `SELECT config FROM profiles WHERE id = ?`
            ).bind(profileId).first<{ config: string }>();
            const config = profileRow?.config ? JSON.parse(profileRow.config) : {};
            const domain = firstSession.domain;
            const isSameDomain = (a: string, b: string) => matchDomainV12(a, b) && matchDomainV12(b, a);

            config.compositeList = (config.compositeList || []).filter((d: string) => {
              return !isSameDomain(d, domain);
            });

            if (classifications[0].classification === 'study') {
              if (!(config.studyList || []).some((d: string) => isSameDomain(d, domain))) {
                config.studyList = [...(config.studyList || []), domain];
              }
            }

            await env.DB.prepare(
              `UPDATE profiles SET config = ?, version = version + 1, updated_at = ? WHERE id = ?`
            ).bind(JSON.stringify(config), now, profileId).run();
          }
        }

        return json({ success: true, updated });
      } catch (e: any) {
        return json({ error: e.message }, 500);
      }
    }

    // GET /profiles/:id/appeals  获取待处理申诉
    if (request.method === 'GET' && subpath === 'appeals') {
      const result = await env.DB.prepare(`
        SELECT sa.id, sa.session_id, sa.reason, sa.status, sa.original_classification,
               sa.new_classification, sa.created_at,
               cs.domain, cs.title, cs.date, cs.duration
        FROM session_appeals sa
        JOIN composite_sessions cs ON cs.id = sa.session_id
        WHERE sa.profile_id = ? AND sa.status = 'pending'
        ORDER BY sa.created_at DESC
        LIMIT 100
      `).bind(profileId).all();

      return json({ appeals: result.results || [] });
    }

    // POST /profiles/:id/resolve-appeal  家长处理申诉
    if (request.method === 'POST' && subpath === 'resolve-appeal') {
      try {
        const { appeal_id, verdict, new_classification } = await request.json<{
          appeal_id: string;
          verdict: 'upheld' | 'overturned';
          new_classification?: 'study' | 'rest';
        }>();

        if (!appeal_id || !verdict) return json({ error: 'appeal_id and verdict required' }, 400);
        if (verdict === 'overturned' && !new_classification) {
          return json({ error: 'new_classification required when overturning' }, 400);
        }

        const appeal = await env.DB.prepare(
          `SELECT session_id FROM session_appeals WHERE id = ? AND profile_id = ?`
        ).bind(appeal_id, profileId).first<{ session_id: string }>();
        if (!appeal) return json({ error: 'Appeal not found' }, 404);

        const now = Date.now();
        await env.DB.prepare(`
          UPDATE session_appeals
          SET status = ?, new_classification = ?, resolved_at = ?
          WHERE id = ?
        `).bind(verdict, new_classification || null, now, appeal_id).run();

        if (verdict === 'overturned' && new_classification) {
          await env.DB.prepare(`
            UPDATE composite_sessions
            SET classification = ?, classified_by = 'parent', classified_at = ?
            WHERE id = ?
          `).bind(new_classification, now, appeal.session_id).run();
        }

        return json({ success: true });
      } catch (e: any) {
        return json({ error: e.message }, 500);
      }
    }

    // POST /profiles/:id/classification-rules  添加自动分类规则
    if (request.method === 'POST' && subpath === 'classification-rules') {
      try {
        const { domain, keyword, classification } = await request.json<{
          domain: string; keyword: string; classification: 'study' | 'rest';
        }>();

        if (!domain || !keyword || !classification) {
          return json({ error: 'domain, keyword, classification required' }, 400);
        }

        const profileRow = await env.DB.prepare(
          `SELECT config FROM profiles WHERE id = ?`
        ).bind(profileId).first<{ config: string }>();
        const config = profileRow?.config ? JSON.parse(profileRow.config) : {};
        const rules: any[] = config.classificationRules || [];

        const exists = rules.some(r => r.domain === domain && r.keyword === keyword);
        if (exists) return json({ error: 'Rule already exists' }, 409);

        rules.push({ domain, keyword, classification });
        config.classificationRules = rules;

        await env.DB.prepare(
          `UPDATE profiles SET config = ?, version = version + 1, updated_at = ? WHERE id = ?`
        ).bind(JSON.stringify(config), Date.now(), profileId).run();

        return json({ success: true, rules });
      } catch (e: any) {
        return json({ error: e.message }, 500);
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};

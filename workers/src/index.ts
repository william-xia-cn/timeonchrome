// Workers API - 路由入口
// 阶段1: 账户与绑定系统

import { authRouter } from './routes/auth';
import { profilesRouter } from './routes/profiles';
import { deviceRouter } from './routes/device';
import { statsRouter } from './routes/stats';
import { sessionsRouter } from './routes/sessions';
import { changelogRouter } from './routes/changelog';
import { eventsRouter } from './routes/events';
import { compositeSessionsRouter } from './routes/compositeSessions';

// 数据库初始化函数
async function initDatabase(env: Env): Promise<Response> {
  // 先删除旧表再重建
  const dropSQL = `
    DROP TABLE IF EXISTS accounts;
    DROP TABLE IF EXISTS profiles;
    DROP TABLE IF EXISTS devices;
    DROP TABLE IF EXISTS stats;
  `;
  
  const createSQL = `
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE profiles (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      name TEXT NOT NULL,
      config TEXT NOT NULL,
      version INTEGER DEFAULT 1,
      avatar_color TEXT DEFAULT '#4A90D9',
      changelog TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE devices (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      device_token TEXT UNIQUE NOT NULL,
      device_name TEXT,
      last_seen INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE stats (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      date TEXT NOT NULL,
      domain TEXT NOT NULL,
      duration INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `;

  try {
    await env.DB.prepare(dropSQL).run();
    await env.DB.prepare(createSQL).run();
    return new Response(JSON.stringify({ success: true, message: 'Database initialized' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export interface Env {
  DB: D1Database;
  SESSION_FILES: R2Bucket;
  CONFIG_CACHE: KVNamespace;
  JWT_SECRET: string;
  DEVICE_TOKEN_SECRET: string;
  RESEND_API_KEY?: string;
}

// ── 待审核提醒邮件 ───────────────────────────────────────────────────────────

async function sendPendingReviewNotifications(env: Env): Promise<void> {
  if (!env.RESEND_API_KEY) return;

  const today = new Date().toISOString().slice(0, 10);

  // 找出所有有待审核会话的账户（本周内）
  const weekStart = (() => {
    const d = new Date();
    const day = d.getDay() === 0 ? 6 : d.getDay() - 1;
    d.setDate(d.getDate() - day);
    return d.toISOString().slice(0, 10);
  })();

  const rows = await env.DB.prepare(`
    SELECT p.id as profile_id, p.name as child_name, a.email,
           COUNT(cs.id) as pending_count
    FROM composite_sessions cs
    JOIN profiles p ON cs.profile_id = p.id
    JOIN accounts a ON p.account_id = a.id
    WHERE cs.classification IS NULL
      AND cs.date >= ?
    GROUP BY p.id, p.name, a.email
    HAVING pending_count > 0
  `).bind(weekStart).all<{ profile_id: string; child_name: string; email: string; pending_count: number }>();

  for (const row of (rows.results || [])) {
    // 每个账户每天最多发一次提醒
    const dedupKey = `pending_review_notify:${row.profile_id}:${today}`;
    const already = await env.CONFIG_CACHE.get(dedupKey);
    if (already) continue;

    // 检查是否有未处理的申诉
    const appealRow = await env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM session_appeals
      WHERE profile_id = ? AND status = 'pending'
    `).bind(row.profile_id).first<{ cnt: number }>();
    const appealCount = appealRow?.cnt ?? 0;

    const subject = `[TimeOnChrome] ${row.child_name} 有 ${row.pending_count} 条待审核会话`;
    const appealLine = appealCount > 0
      ? `<tr><td style="padding:8px 0;color:#555;">未处理申诉</td><td style="padding:8px 0;font-weight:600;">${appealCount} 条</td></tr>`
      : '';

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                  max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;">
        <div style="background:#6c63ff;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
          <h2 style="color:#fff;margin:0;font-size:18px;">TimeOnChrome 待审核提醒</h2>
        </div>
        <p style="color:#333;font-size:14px;line-height:1.8;">
          ${row.child_name} 本周有新的待定会话需要您审核分类。
        </p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#555;">孩子</td>
              <td style="padding:8px 0;font-weight:600;">${row.child_name}</td></tr>
          <tr><td style="padding:8px 0;color:#555;">待审核会话</td>
              <td style="padding:8px 0;font-weight:600;">${row.pending_count} 条</td></tr>
          ${appealLine}
        </table>
        <hr style="margin:24px 0;border:none;border-top:1px solid #eee;">
        <p style="color:#999;font-size:12px;margin:0;">
          请登录 TimeOnChrome 管理控制台完成审核。
        </p>
      </div>
    `.trim();

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'TimeOnChrome <notify@hornburg-xia.cn>',
        to: [row.email],
        subject,
        html,
      }),
    });

    if (resp.ok) {
      await env.CONFIG_CACHE.put(dedupKey, '1', { expirationTtl: 86400 });
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 路由分发
      if (path.startsWith('/auth/')) {
        return await authRouter.handle(request, env);
      } else if (path.match(/^\/profiles\/[^/]+\/stats/)) {
        return await statsRouter.handle(request, env);
      } else if (path.match(/^\/profiles\/[^/]+\/(pending-reviews|appeals|classify|resolve-appeal|classification-rules)$/)) {
        return await compositeSessionsRouter.handle(request, env);
      } else if (path.match(/^\/profiles\/[^/]+\/changelog/)) {
        return await changelogRouter.handle(request, env);
      } else if (path.startsWith('/profiles')) {
        return await profilesRouter.handle(request, env);
      } else if (path === '/device/heartbeat') {
        return await deviceRouter.handle(request, env);
      } else if (path.startsWith('/device/stats') || path.startsWith('/device/sessions') || path.startsWith('/device/changelog') || path === '/device/events' || path === '/device/composite-sessions' || path === '/device/weekly-sessions' || path === '/device/appeal') {
        // 设备端 API（device_token 鉴权）
        if (path.startsWith('/device/stats')) {
          return await statsRouter.handle(request, env);
        } else if (path.startsWith('/device/sessions')) {
          return await sessionsRouter.handle(request, env);
        } else if (path.startsWith('/device/changelog')) {
          return await changelogRouter.handle(request, env);
        } else if (path === '/device/events') {
          return await eventsRouter.handle(request, env);
        } else if (path === '/device/composite-sessions' || path === '/device/weekly-sessions' || path === '/device/appeal') {
          return await compositeSessionsRouter.handle(request, env);
        }
      } else if (path.startsWith('/device/')) {
        return await deviceRouter.handle(request, env);
      } else if (path.startsWith('/stats')) {
        return await statsRouter.handle(request, env);
      } else if (path.startsWith('/sessions')) {
        return await sessionsRouter.handle(request, env);
      } else if (path.startsWith('/changelog')) {
        return await changelogRouter.handle(request, env);
      } else if (path === '/api/init') {
        // 数据库初始化端点
        return await initDatabase(env);
      }

      return new Response('TimeOnChrome API v1.0', { 
        status: 200,
        headers: corsHeaders
      });
    } catch (e) {
      return new Response('Internal Error: ' + e.message, {
        status: 500,
        headers: corsHeaders
      });
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(sendPendingReviewNotifications(env));
  },
};
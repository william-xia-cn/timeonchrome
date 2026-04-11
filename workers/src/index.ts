// Workers API - 路由入口
// 阶段1: 账户与绑定系统

import { authRouter } from './routes/auth';
import { profilesRouter } from './routes/profiles';
import { deviceRouter } from './routes/device';
import { statsRouter } from './routes/stats';
import { sessionsRouter } from './routes/sessions';
import { changelogRouter } from './routes/changelog';

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
      } else if (path.startsWith('/profiles')) {
        return await profilesRouter.handle(request, env);
      } else if (path === '/device/heartbeat') {
        return await deviceRouter.handle(request, env);
      } else if (path.startsWith('/device/stats') || path.startsWith('/device/sessions') || path.startsWith('/device/changelog')) {
        // 设备端 API（device_token 鉴权）
        if (path.startsWith('/device/stats')) {
          return await statsRouter.handle(request, env);
        } else if (path.startsWith('/device/sessions')) {
          return await sessionsRouter.handle(request, env);
        } else if (path.startsWith('/device/changelog')) {
          return await changelogRouter.handle(request, env);
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
};
// Workers API - 路由入口
// 阶段1: 账户与绑定系统

import { authRouter } from './routes/auth';
import { profilesRouter } from './routes/profiles';
import { deviceRouter } from './routes/device';
import { statsRouter } from './routes/stats';
import { sessionsRouter } from './routes/sessions';
import { changelogRouter } from './routes/changelog';

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
      } else if (path.startsWith('/profiles')) {
        return await profilesRouter.handle(request, env);
      } else if (path.startsWith('/device/')) {
        return await deviceRouter.handle(request, env);
      } else if (path.startsWith('/stats')) {
        return await statsRouter.handle(request, env);
      } else if (path.startsWith('/sessions')) {
        return await sessionsRouter.handle(request, env);
      } else if (path.startsWith('/changelog')) {
        return await changelogRouter.handle(request, env);
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
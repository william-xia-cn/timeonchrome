// TimeOnChrome Cloudflare Workers - 入口文件
// 阶段0: 基础框架

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS 处理
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
    }

    // 路由分发
    try {
      if (path.startsWith('/auth/')) {
        return new Response('auth endpoint placeholder', { status: 200 });
      } else if (path.startsWith('/profiles')) {
        return new Response('profiles endpoint placeholder', { status: 200 });
      } else if (path.startsWith('/device/')) {
        return new Response('device endpoint placeholder', { status: 200 });
      }
      return new Response('TimeOnChrome API v1.0', { status: 200 });
    } catch (e) {
      return new Response('Internal Error: ' + e.message, { status: 500 });
    }
  }
};
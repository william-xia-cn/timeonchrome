// 路由基类
export class Router {
  handle(request: Request, env: Env): Promise<Response> {
    throw new Error('Not implemented');
  }
}

// 简化的 JSON 响应
export function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
}

// 获取请求体 JSON
export async function getJson<T>(request: Request): Promise<T> {
  try {
    return await request.json();
  } catch (e) {
    throw new Error('Invalid JSON');
  }
}

// 解析 Authorization header
export function parseAuth(request: Request): { type: string; token: string } | null {
  const auth = request.headers.get('Authorization');
  if (!auth) return null;
  
  const [type, token] = auth.split(' ');
  if (type === 'Bearer') {
    return { type: 'bearer', token };
  }
  return null;
}

// Env 类型
export interface Env {
  DB: D1Database;
  SESSION_FILES: R2Bucket;
  CONFIG_CACHE: KVNamespace;
  JWT_SECRET: string;
  DEVICE_TOKEN_SECRET: string;
}
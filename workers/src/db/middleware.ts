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

// ── JWT 工具（HMAC-SHA256）────────────────────────────────────────────────

function b64url(buf: ArrayBuffer | ArrayBufferView): string {
  const bytes = buf instanceof ArrayBuffer
    ? new Uint8Array(buf)
    : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** 生成 HMAC-SHA256 签名的 JWT */
export async function generateToken(payload: object, secret: string): Promise<string> {
  const header  = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body    = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const data    = `${header}.${body}`;
  const key     = await hmacKey(secret);
  const sigBuf  = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(sigBuf)}`;
}

/** 验证 JWT，返回 payload 或 null */
export async function verifyToken(token: string, secret: string): Promise<Record<string, any> | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, sig] = parts;
    const data    = `${header}.${body}`;
    const key     = await hmacKey(secret);

    // base64url → Uint8Array
    const sigBytes = Uint8Array.from(
      atob(sig.replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0)
    );
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
    if (!valid) return null;

    return JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

/** 从 Authorization: Bearer <token> 中提取并验证 account_token，返回 account_id */
export async function verifyAccountToken(request: Request, secret: string): Promise<string | null> {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const payload = await verifyToken(auth.slice(7), secret);
  if (Number(payload?.exp || 0) > 0 && Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
  return payload?.account_id ?? null;
}

// Env 类型
export interface Env {
  DB: D1Database;
  SESSION_FILES: R2Bucket;
  CONFIG_CACHE: KVNamespace;
  JWT_SECRET: string;
  DEVICE_TOKEN_SECRET: string;
  ADMIN_ACCOUNT_IDS?: string;
  RESEND_API_KEY?: string;  // Resend 邮件通知 API key（可选，不配置则跳过邮件）
}

// Auth 路由 - 账户注册/登录
import { json, Env } from '../db/middleware';

// 简单的密码哈希（生产环境建议用 bcrypt）
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 生成 JWT（简化版）
function generateToken(payload: object, secret: string): string {
  const email = (payload as any).email || '';
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = btoa(JSON.stringify(payload));
  const signature = btoa(email + secret); // 简化签名
  return `${header}.${payloadB64}.${signature}`;
}

export const authRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // POST /auth/register
    if (request.method === 'POST' && path === '/auth/register') {
      try {
        const body = await request.text();
        const data = JSON.parse(body);
        const { email, password } = data;
        
        if (!email || !password) {
          return json({ error: 'Email and password required' }, 400);
        }
        
        const passwordHash = await hashPassword(password);
        const accountId = crypto.randomUUID();
        const now = Date.now();
        
        try {
          await env.DB.exec(
            `INSERT INTO accounts (id, email, password_hash, created_at) VALUES ('${accountId}', '${email}', '${passwordHash}', ${now})`
          );
          
          return json({ 
            success: true, 
            account_id: accountId,
            token: generateToken({ email, account_id: accountId }, env.JWT_SECRET)
          });
        } catch (e: any) {
          if (e.message.includes('UNIQUE constraint failed')) {
            return json({ error: 'Email already exists' }, 400);
          }
          throw e;
        }
      } catch (e: any) {
        return json({ error: 'Invalid request: ' + e.message }, 400);
      }
    }
    
    // POST /auth/login
    if (request.method === 'POST' && path === '/auth/login') {
      try {
        const body = await request.text();
        const data = JSON.parse(body);
        const { email, password } = data;
        
        if (!email || !password) {
          return json({ error: 'Email and password required' }, 400);
        }
        
        const passwordHash = await hashPassword(password);
        
        const stmt = await env.DB.prepare(
          `SELECT id, email FROM accounts WHERE email = '${email}' AND password_hash = '${passwordHash}'`
        );
        const result = await stmt.first<{ id: string; email: string }>();
        
        if (!result) {
          return json({ error: 'Invalid credentials' }, 401);
        }
        
        return json({
          success: true,
          account_id: result.id,
          token: generateToken({ email: result.email, account_id: result.id }, env.JWT_SECRET)
        });
      } catch (e: any) {
        return json({ error: 'Invalid request: ' + e.message }, 400);
      }
    }
    
    return json({ error: 'Not found' }, 404);
  }
};
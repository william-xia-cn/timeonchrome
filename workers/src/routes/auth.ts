// Auth 路由 - 账户注册/登录
import { Router, json, getJson, Env } from '../db/middleware';

interface RegisterBody {
  email: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
}

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
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = btoa(JSON.stringify(payload));
  const signature = btoa(payload.email + secret); // 简化签名
  return `${header}.${payloadB64}.${signature}`;
}

export const authRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // POST /auth/register
    if (request.method === 'POST' && url.pathname === '/auth/register') {
      try {
        const body = await getJson<RegisterBody>(request);
        const { email, password } = body;
        
        if (!email || !password) {
          return json({ error: 'Email and password required' }, 400);
        }
        
        const passwordHash = await hashPassword(password);
        const accountId = crypto.randomUUID();
        
        try {
          await env.DB.prepare(
            'INSERT INTO accounts (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
            [accountId, email, passwordHash, Date.now()]
          ).run();
          
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
      } catch (e) {
        return json({ error: 'Invalid request' }, 400);
      }
    }
    
    // POST /auth/login
    if (request.method === 'POST' && url.pathname === '/auth/login') {
      try {
        const body = await getJson<LoginBody>(request);
        const { email, password } = body;
        
        if (!email || !password) {
          return json({ error: 'Email and password required' }, 400);
        }
        
        const passwordHash = await hashPassword(password);
        
        const result = await env.DB.prepare(
          'SELECT id, email FROM accounts WHERE email = ? AND password_hash = ?',
          [email, passwordHash]
        ).first<{ id: string; email: string }>();
        
        if (!result) {
          return json({ error: 'Invalid credentials' }, 401);
        }
        
        return json({
          success: true,
          account_id: result.id,
          token: generateToken({ email: result.email, account_id: result.id }, env.JWT_SECRET)
        });
      } catch (e) {
        return json({ error: 'Invalid request' }, 400);
      }
    }
    
    return json({ error: 'Not found' }, 404);
  }
};
// Auth 路由 - 账户注册/登录
import { json, Env, generateToken, verifyAccountToken } from '../db/middleware';

// SHA-256 密码哈希
async function hashPassword(password: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export const authRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url  = new URL(request.url);
    const path = url.pathname;

    // POST /auth/register
    if (request.method === 'POST' && path === '/auth/register') {
      try {
        const body = await request.json<{ email: string; password: string }>();
        const email = normalizeEmail(body?.email);
        const password = body?.password;

        if (!email || !password) {
          return json({ error: 'Email and password required' }, 400);
        }

        const existing = await env.DB.prepare(
          `SELECT id FROM accounts WHERE LOWER(email) = ?`
        ).bind(email).first<{ id: string }>();
        if (existing) {
          return json({ error: 'Email already exists' }, 400);
        }

        const passwordHash = await hashPassword(password);
        const accountId    = crypto.randomUUID();
        const now          = Date.now();

        try {
          await env.DB.prepare(
            `INSERT INTO accounts (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)`
          ).bind(accountId, email, passwordHash, now).run();

          return json({
            success:    true,
            account_id: accountId,
            token:      await generateToken({ email, account_id: accountId }, env.JWT_SECRET),
          });
        } catch (e: any) {
          if (e.message?.includes('UNIQUE constraint failed')) {
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
        const body = await request.json<{ email: string; password: string }>();
        const email = normalizeEmail(body?.email);
        const password = body?.password;

        if (!email || !password) {
          return json({ error: 'Email and password required' }, 400);
        }

        const passwordHash = await hashPassword(password);

        const result = await env.DB.prepare(
          `SELECT id, email FROM accounts WHERE LOWER(email) = ? AND password_hash = ?`
        ).bind(email, passwordHash).first<{ id: string; email: string }>();

        if (!result) {
          return json({ error: 'Invalid credentials' }, 401);
        }

        return json({
          success:    true,
          account_id: result.id,
          token:      await generateToken({ email: result.email, account_id: result.id }, env.JWT_SECRET),
        });
      } catch (e: any) {
        return json({ error: 'Invalid request: ' + e.message }, 400);
      }
    }

    // POST /auth/change-password
    if (request.method === 'POST' && path === '/auth/change-password') {
      try {
        const accountId = await verifyAccountToken(request, env.JWT_SECRET);
        if (!accountId) return json({ error: 'Unauthorized' }, 401);

        const { oldPassword, newPassword } = await request.json<{ oldPassword: string; newPassword: string }>();
        if (!oldPassword || !newPassword) return json({ error: 'oldPassword and newPassword required' }, 400);
        if (newPassword.length < 6) return json({ error: 'New password must be at least 6 characters' }, 400);

        const oldHash = await hashPassword(oldPassword);
        const row = await env.DB.prepare(
          `SELECT id FROM accounts WHERE id = ? AND password_hash = ?`
        ).bind(accountId, oldHash).first<{ id: string }>();

        if (!row) return json({ error: 'Current password is incorrect' }, 401);

        const newHash = await hashPassword(newPassword);
        await env.DB.prepare(
          `UPDATE accounts SET password_hash = ? WHERE id = ?`
        ).bind(newHash, accountId).run();

        return json({ success: true });
      } catch (e: any) {
        return json({ error: 'Failed to change password: ' + e.message }, 400);
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};

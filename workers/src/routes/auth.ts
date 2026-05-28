// Auth 路由 - 账户注册/登录
import { json, Env, generateToken, verifyAccountToken } from '../db/middleware';

const ACCESS_TOKEN_TTL_SECONDS = 12 * 60 * 60;
const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// SHA-256 密码哈希
async function hashPassword(password: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

async function hashRefreshToken(token: string): Promise<string> {
  return hashPassword(token);
}

function generateRefreshToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function generateAccountToken(account: { id: string; email: string }, env: Env): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  return generateToken({
    email: account.email,
    account_id: account.id,
    iat: nowSec,
    exp: nowSec + ACCESS_TOKEN_TTL_SECONDS,
  }, env.JWT_SECRET);
}

async function createRefreshSession(env: Env, accountId: string): Promise<string> {
  const refreshToken = generateRefreshToken();
  const tokenHash = await hashRefreshToken(refreshToken);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO account_sessions (id, account_id, refresh_token_hash, created_at, expires_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), accountId, tokenHash, now, now + REFRESH_TOKEN_TTL_MS, now).run();
  return refreshToken;
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
            token:      await generateAccountToken({ id: accountId, email }, env),
            refreshToken: await createRefreshSession(env, accountId),
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
          token:      await generateAccountToken({ id: result.id, email: result.email }, env),
          refreshToken: await createRefreshSession(env, result.id),
        });
      } catch (e: any) {
        return json({ error: 'Invalid request: ' + e.message }, 400);
      }
    }

    // POST /auth/refresh
    if (request.method === 'POST' && path === '/auth/refresh') {
      try {
        const { refreshToken } = await request.json<{ refreshToken: string }>();
        if (!refreshToken) return json({ error: 'refreshToken required' }, 400);

        const tokenHash = await hashRefreshToken(refreshToken);
        const now = Date.now();
        const session = await env.DB.prepare(
          `SELECT s.id, s.account_id, s.expires_at, a.email
             FROM account_sessions s
             JOIN accounts a ON a.id = s.account_id
            WHERE s.refresh_token_hash = ? AND s.revoked_at IS NULL`
        ).bind(tokenHash).first<{ id: string; account_id: string; expires_at: number; email: string }>();

        if (!session || Number(session.expires_at || 0) <= now) {
          return json({ error: 'Invalid refresh token' }, 401);
        }

        await env.DB.prepare(
          `UPDATE account_sessions SET revoked_at = ?, last_used_at = ? WHERE id = ?`
        ).bind(now, now, session.id).run();

        return json({
          success: true,
          token: await generateAccountToken({ id: session.account_id, email: session.email }, env),
          refreshToken: await createRefreshSession(env, session.account_id),
        });
      } catch (e: any) {
        return json({ error: 'Failed to refresh token: ' + e.message }, 400);
      }
    }

    // POST /auth/logout
    if (request.method === 'POST' && path === '/auth/logout') {
      try {
        const { refreshToken } = await request.json<{ refreshToken?: string }>().catch(() => ({ refreshToken: '' }));
        if (refreshToken) {
          const tokenHash = await hashRefreshToken(refreshToken);
          await env.DB.prepare(
            `UPDATE account_sessions SET revoked_at = ?, last_used_at = ? WHERE refresh_token_hash = ? AND revoked_at IS NULL`
          ).bind(Date.now(), Date.now(), tokenHash).run();
        }
        return json({ success: true });
      } catch (e: any) {
        return json({ error: 'Failed to logout: ' + e.message }, 400);
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

        await env.DB.prepare(
          `UPDATE account_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL`
        ).bind(Date.now(), accountId).run();

        return json({ success: true });
      } catch (e: any) {
        return json({ error: 'Failed to change password: ' + e.message }, 400);
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};

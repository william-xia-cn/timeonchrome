import {
  APP_RUNTIME_AUDIENCE,
  APP_RUNTIME_ACCOUNT_AUDIENCE,
  APP_RUNTIME_LIFECYCLE_AUDIENCE,
  type AppRuntimeChildLifecycleClaims,
  type AppRuntimeModuleClaims,
  type AppRuntimeAccountModuleClaims,
} from '../../../app-runtime-management/contracts/app-runtime-control';
import { json, verifyAccountToken, type Env } from '../db/middleware';

type RuntimeBridgeEnv = Env & {
  APP_RUNTIME_TOKEN_PRIVATE_JWK?: string;
  APP_RUNTIME_BRIDGE_ISSUER?: string;
  APP_RUNTIME_SERVICE?: Fetcher;
};

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function handleAppRuntimeAccountToken(request: Request, env: RuntimeBridgeEnv): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const accountId = await verifyAccountToken(request, env.JWT_SECRET);
  if (!accountId) return json({ error: 'Unauthorized' }, 401);
  const result = await env.DB.prepare(`
    SELECT child_id, child_name FROM runtime_account_children_v2
    WHERE account_id=? ORDER BY child_name ASC, child_id ASC
  `).bind(accountId).all<{ child_id: string; child_name: string }>();
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims: AppRuntimeAccountModuleClaims = {
    iss: env.APP_RUNTIME_BRIDGE_ISSUER || 'guardian-api',
    aud: APP_RUNTIME_ACCOUNT_AUDIENCE,
    sub: accountId,
    account_id: accountId,
    children: (result.results || []).map((child) => ({ id: child.child_id, name: child.child_name })),
    iat: issuedAt,
    exp: issuedAt + 300,
    jti: crypto.randomUUID(),
  };
  try {
    return json({ token: await signJwt(env, claims as unknown as Record<string, unknown>), expiresAt: claims.exp, audience: claims.aud });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'token_issue_failed' }, 503);
  }
}

async function signJwt(env: RuntimeBridgeEnv, claims: Record<string, unknown>): Promise<string> {
  if (!env.APP_RUNTIME_TOKEN_PRIVATE_JWK) throw new Error('app_runtime_identity_bridge_not_configured');
  const key = await crypto.subtle.importKey(
    'jwk', JSON.parse(env.APP_RUNTIME_TOKEN_PRIVATE_JWK),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const encoder = new TextEncoder();
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'ES256', typ: 'JWT' })));
  const payload = base64Url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

export async function handleAppRuntimeModuleToken(request: Request, env: RuntimeBridgeEnv): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const accountId = await verifyAccountToken(request, env.JWT_SECRET);
  if (!accountId) return json({ error: 'Unauthorized' }, 401);
  const match = new URL(request.url).pathname.match(/^\/profiles\/([^/]+)\/app-runtime\/token$/);
  if (!match) return json({ error: 'Not found' }, 404);
  const child = await env.DB.prepare(
    'SELECT id, name FROM profiles WHERE id = ? AND account_id = ?',
  ).bind(match[1], accountId).first<{ id: string; name: string }>();
  if (!child) return json({ error: 'Profile not found' }, 404);
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims: AppRuntimeModuleClaims = {
    iss: env.APP_RUNTIME_BRIDGE_ISSUER || 'guardian-api', aud: APP_RUNTIME_AUDIENCE,
    sub: accountId, account_id: accountId, child_id: child.id, child_name: child.name,
    iat: issuedAt, exp: issuedAt + 300, jti: crypto.randomUUID(),
  };
  try {
    return json({ token: await signJwt(env, claims as unknown as Record<string, unknown>), expiresAt: claims.exp, audience: claims.aud });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'token_issue_failed' }, 503);
  }
}

export function appRuntimeChildDeletedOutboxStatement(
  env: RuntimeBridgeEnv, accountId: string, childId: string,
): D1PreparedStatement {
  const now = Date.now();
  return env.DB.prepare(`
    INSERT INTO runtime_child_lifecycle_outbox_v1
      (id, account_id, child_id, event_type, status, attempts, next_attempt_at, created_at)
    VALUES (?, ?, ?, 'child.deleted', 'pending', 0, ?, ?)
    ON CONFLICT(child_id, event_type) DO UPDATE SET
      account_id = excluded.account_id, status = 'pending', attempts = 0,
      next_attempt_at = excluded.next_attempt_at, last_error = NULL, sent_at = NULL
  `).bind(crypto.randomUUID(), accountId, childId, now, now);
}

export async function processAppRuntimeLifecycleOutbox(env: RuntimeBridgeEnv): Promise<void> {
  if (!env.APP_RUNTIME_TOKEN_PRIVATE_JWK || !env.APP_RUNTIME_SERVICE) return;
  const pending = await env.DB.prepare(`
    SELECT id, account_id, child_id, attempts FROM runtime_child_lifecycle_outbox_v1
    WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY created_at ASC LIMIT 25
  `).bind(Date.now()).all<{ id: string; account_id: string; child_id: string; attempts: number }>();
  for (const row of pending.results || []) {
    const issuedAt = Math.floor(Date.now() / 1000);
    const claims: AppRuntimeChildLifecycleClaims = {
      iss: env.APP_RUNTIME_BRIDGE_ISSUER || 'guardian-api', aud: APP_RUNTIME_LIFECYCLE_AUDIENCE,
      sub: row.account_id, account_id: row.account_id, child_id: row.child_id,
      event: 'child.deleted', iat: issuedAt, exp: issuedAt + 300, jti: crypto.randomUUID(),
    };
    try {
      const token = await signJwt(env, claims as unknown as Record<string, unknown>);
      const response = await env.APP_RUNTIME_SERVICE.fetch('https://app-runtime.internal/v1/identity/child-lifecycle', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`runtime_http_${response.status}`);
      await env.DB.prepare(
        "UPDATE runtime_child_lifecycle_outbox_v1 SET status='sent', sent_at=?, last_error=NULL WHERE id=?",
      ).bind(Date.now(), row.id).run();
    } catch (error) {
      const attempts = Number(row.attempts || 0) + 1;
      const delay = [300_000, 1_800_000, 7_200_000][Math.min(attempts - 1, 2)];
      await env.DB.prepare(`
        UPDATE runtime_child_lifecycle_outbox_v1 SET status=?, attempts=?, next_attempt_at=?, last_error=? WHERE id=?
      `).bind(attempts >= 4 ? 'exhausted' : 'pending', attempts, Date.now() + delay,
        error instanceof Error ? error.message.slice(0, 96) : 'runtime_lifecycle_failed', row.id).run();
    }
  }
}

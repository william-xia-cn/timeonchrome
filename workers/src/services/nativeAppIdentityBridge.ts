import {
  NATIVE_APP_CONTROL_AUDIENCE,
  NATIVE_APP_LIFECYCLE_AUDIENCE,
  type NativeAppModuleClaims,
  type NativeChildLifecycleClaims,
} from '../../../native-app-control/contracts/native-app-control';
import { json, verifyAccountToken, type Env } from '../db/middleware';

type NativeBridgeEnv = Env & {
  NATIVE_APP_TOKEN_PRIVATE_JWK?: string;
  NATIVE_APP_API_BASE_URL?: string;
  NATIVE_APP_BRIDGE_ISSUER?: string;
};

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function signEs256Jwt(env: NativeBridgeEnv, claims: Record<string, unknown>): Promise<string> {
  if (!env.NATIVE_APP_TOKEN_PRIVATE_JWK) throw new Error('native_app_identity_bridge_not_configured');
  const key = await crypto.subtle.importKey(
    'jwk',
    JSON.parse(env.NATIVE_APP_TOKEN_PRIVATE_JWK),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const encoder = new TextEncoder();
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'ES256', typ: 'JWT' })));
  const payload = base64Url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(`${header}.${payload}`)
  );
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

export async function handleNativeAppModuleToken(request: Request, env: NativeBridgeEnv): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const accountId = await verifyAccountToken(request, env.JWT_SECRET);
  if (!accountId) return json({ error: 'Unauthorized' }, 401);
  const match = new URL(request.url).pathname.match(/^\/profiles\/([^/]+)\/native-app-control\/token$/);
  if (!match) return json({ error: 'Not found' }, 404);
  const child = await env.DB.prepare(`
    SELECT id, name FROM profiles WHERE id = ? AND account_id = ?
  `).bind(match[1], accountId).first<{ id: string; name: string }>();
  if (!child) return json({ error: 'Profile not found' }, 404);
  const timestamp = Math.floor(Date.now() / 1000);
  const claims: NativeAppModuleClaims = {
    iss: env.NATIVE_APP_BRIDGE_ISSUER || 'guardian-api',
    aud: NATIVE_APP_CONTROL_AUDIENCE,
    sub: accountId,
    account_id: accountId,
    child_id: child.id,
    child_name: child.name,
    iat: timestamp,
    exp: timestamp + 300,
    jti: crypto.randomUUID(),
  };
  try {
    return json({
      token: await signEs256Jwt(env, claims as unknown as Record<string, unknown>),
      expiresAt: claims.exp,
      audience: claims.aud,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'token_issue_failed' }, 503);
  }
}

export function nativeChildDeletedOutboxStatement(
  env: NativeBridgeEnv,
  accountId: string,
  childId: string
): D1PreparedStatement {
  const timestamp = Date.now();
  return env.DB.prepare(`
    INSERT INTO native_app_lifecycle_outbox_v1 (
      id, account_id, child_id, event_type, status, attempts, next_attempt_at, created_at
    ) VALUES (?, ?, ?, 'child.deleted', 'pending', 0, ?, ?)
    ON CONFLICT(child_id, event_type) DO UPDATE SET
      account_id = excluded.account_id,
      status = 'pending', attempts = 0, next_attempt_at = excluded.next_attempt_at,
      last_error = NULL, sent_at = NULL
  `).bind(crypto.randomUUID(), accountId, childId, timestamp, timestamp);
}

function retryDelay(attempts: number): number {
  return [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000][Math.min(attempts, 2)];
}

export async function processNativeAppLifecycleOutbox(env: NativeBridgeEnv): Promise<void> {
  if (!env.NATIVE_APP_TOKEN_PRIVATE_JWK || !env.NATIVE_APP_API_BASE_URL) return;
  const pending = await env.DB.prepare(`
    SELECT id, account_id, child_id, event_type, attempts
      FROM native_app_lifecycle_outbox_v1
     WHERE status = 'pending' AND next_attempt_at <= ?
     ORDER BY created_at ASC LIMIT 25
  `).bind(Date.now()).all<{
    id: string; account_id: string; child_id: string; event_type: 'child.deleted'; attempts: number;
  }>();
  for (const row of pending.results || []) {
    const issuedAt = Math.floor(Date.now() / 1000);
    const claims: NativeChildLifecycleClaims = {
      iss: env.NATIVE_APP_BRIDGE_ISSUER || 'guardian-api',
      aud: NATIVE_APP_LIFECYCLE_AUDIENCE,
      sub: row.account_id,
      account_id: row.account_id,
      child_id: row.child_id,
      event: 'child.deleted',
      iat: issuedAt,
      exp: issuedAt + 300,
      jti: crypto.randomUUID(),
    };
    try {
      const token = await signEs256Jwt(env, claims as unknown as Record<string, unknown>);
      const response = await fetch(
        `${env.NATIVE_APP_API_BASE_URL.replace(/\/$/, '')}/identity/v1/child-lifecycle`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error(`native_http_${response.status}`);
      await env.DB.prepare(`
        UPDATE native_app_lifecycle_outbox_v1 SET status = 'sent', sent_at = ?, last_error = NULL WHERE id = ?
      `).bind(Date.now(), row.id).run();
    } catch (error) {
      const attempts = Number(row.attempts || 0) + 1;
      const exhausted = attempts >= 4;
      const code = error instanceof Error ? error.message.slice(0, 96) : 'native_lifecycle_failed';
      await env.DB.prepare(`
        UPDATE native_app_lifecycle_outbox_v1
           SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?
      `).bind(
        exhausted ? 'exhausted' : 'pending', attempts,
        Date.now() + retryDelay(attempts - 1), code, row.id
      ).run();
    }
  }
}

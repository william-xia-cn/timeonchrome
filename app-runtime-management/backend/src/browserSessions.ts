import type {
  AppRuntimeBrowserSessionResponse,
  AppRuntimeSsoTicketClaims,
} from '../../contracts/app-runtime-control';
import { sha256Hex, randomToken } from './crypto';
import { HttpError, readJsonBody } from './http';
import { verifyEs256 } from './auth';

const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

function validChildren(value: unknown): value is Array<{ id: string; name: string }> {
  return Array.isArray(value) && value.length <= 100 && value.every((child) => {
    if (!child || typeof child !== 'object' || Array.isArray(child)) return false;
    const row = child as Record<string, unknown>;
    return typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 128
      && typeof row.name === 'string' && row.name.length > 0 && row.name.length <= 128;
  });
}

export async function verifySsoTicket(token: string, env: Env, nowMs: number): Promise<AppRuntimeSsoTicketClaims> {
  if (!env.GUARDIAN_RUNTIME_SSO_PUBLIC_JWK) {
    throw new HttpError(503, 'SERVER_MISCONFIGURED', 'Browser SSO is unavailable.');
  }
  const claims = await verifyEs256(token, env.GUARDIAN_RUNTIME_SSO_PUBLIC_JWK);
  const now = Math.floor(nowMs / 1000);
  if (!claims || claims.aud !== 'app-runtime-management:sso'
    || claims.iss !== (env.GUARDIAN_RUNTIME_ISSUER || 'guardian-api')
    || typeof claims.account_id !== 'string' || claims.sub !== claims.account_id
    || typeof claims.jti !== 'string' || claims.jti.length < 8 || claims.jti.length > 128
    || typeof claims.iat !== 'number' || typeof claims.exp !== 'number'
    || claims.exp <= now || claims.iat > now + 30 || claims.exp - claims.iat > 65
    || !validChildren(claims.children)
    || (claims.selected_child_id !== undefined
      && (typeof claims.selected_child_id !== 'string'
        || !claims.children.some((child) => child.id === claims.selected_child_id)))) {
    throw new HttpError(401, 'SSO_TICKET_INVALID', 'Browser SSO ticket is invalid or expired.');
  }
  return claims as unknown as AppRuntimeSsoTicketClaims;
}

export async function exchangeBrowserSession(
  request: Request,
  env: Env,
  nowMs: number,
): Promise<AppRuntimeBrowserSessionResponse> {
  const body = await readJsonBody(request, 16_384);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'INVALID_REQUEST', 'Browser SSO request is invalid.');
  }
  const ticket = (body as Record<string, unknown>).ticket;
  if (typeof ticket !== 'string' || ticket.length < 64 || ticket.length > 8192) {
    throw new HttpError(400, 'INVALID_REQUEST', 'Browser SSO ticket is invalid.');
  }
  const claims = await verifySsoTicket(ticket, env, nowMs);
  const token = randomToken('', 32);
  const [tokenHash, jtiHash] = await Promise.all([sha256Hex(token), sha256Hex(claims.jti)]);
  const expiresAtMs = nowMs + SESSION_LIFETIME_MS;
  const results = await env.RUNTIME_DB.batch([
    env.RUNTIME_DB.prepare(`
      INSERT INTO runtime_browser_sessions_v1
        (token_hash, account_id, children_json, created_at_ms, expires_at_ms, revoked_at_ms, last_used_at_ms)
      SELECT ?, ?, ?, ?, ?, NULL, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM runtime_consumed_sso_tickets_v1 WHERE jti_hash = ?
      )
    `).bind(tokenHash, claims.account_id, JSON.stringify(claims.children), nowMs, expiresAtMs, nowMs, jtiHash),
    env.RUNTIME_DB.prepare(`
      INSERT OR IGNORE INTO runtime_consumed_sso_tickets_v1
        (jti_hash, account_id, consumed_at_ms, expires_at_ms)
      VALUES (?, ?, ?, ?)
    `).bind(jtiHash, claims.account_id, nowMs, claims.exp * 1000),
  ]);
  if (Number(results[0]?.meta.changes || 0) !== 1 || Number(results[1]?.meta.changes || 0) !== 1) {
    throw new HttpError(401, 'SSO_TICKET_REPLAYED', 'Browser SSO ticket was already used.');
  }
  return {
    token, tokenType: 'RuntimeSession', expiresAt: expiresAtMs, children: claims.children,
    ...(claims.selected_child_id ? { selectedChildId: claims.selected_child_id } : {}),
  };
}

export async function revokeBrowserSession(request: Request, env: Env, nowMs: number): Promise<void> {
  const match = /^RuntimeSession ([A-Za-z0-9_-]{43,256})$/u.exec(request.headers.get('authorization') || '');
  if (!match?.[1]) throw new HttpError(401, 'UNAUTHORIZED', 'Runtime browser session is invalid.');
  const result = await env.RUNTIME_DB.prepare(`
    UPDATE runtime_browser_sessions_v1 SET revoked_at_ms=?
    WHERE token_hash=? AND revoked_at_ms IS NULL AND expires_at_ms>?
  `).bind(nowMs, await sha256Hex(match[1]), nowMs).run();
  if (Number(result.meta.changes || 0) !== 1) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Runtime browser session is invalid.');
  }
}

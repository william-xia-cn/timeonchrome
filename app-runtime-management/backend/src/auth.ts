import type { AccountModuleClaims, DeviceSelfResponse, MachineSelfResponse } from './contracts';
import { timingSafeSecretEquals } from './crypto';
import { HttpError } from './http';
import { authenticateDevice } from './repository';
import { authenticateMachine } from './v2Repository';
import type { ModuleClaims } from './contracts';

export async function requireAdmin(
  request: Request,
  expectedSecret: string | undefined,
): Promise<void> {
  if (typeof expectedSecret !== 'string' || expectedSecret.length < 32) {
    throw new HttpError(503, 'SERVER_MISCONFIGURED', 'Administrator authentication is unavailable.');
  }
  const provided = request.headers.get('x-runtime-admin-key') ?? '';
  if (!await timingSafeSecretEquals(provided, expectedSecret)) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Administrator authentication failed.');
  }
}

export async function requireDevice(
  request: Request,
  database: D1Database,
  nowMs: number,
): Promise<DeviceSelfResponse> {
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/u.exec(authorization);
  if (match?.[1] === undefined) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Runtime device authentication failed.');
  }
  const device = await authenticateDevice(database, match[1], nowMs);
  if (device === null) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Runtime device authentication failed.');
  }
  return device;
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function verifyEs256(token: string, publicJwk: string): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0]!))) as Record<string, unknown>;
    if (header.alg !== 'ES256' || header.typ !== 'JWT') return null;
    const key = await crypto.subtle.importKey(
      'jwk', JSON.parse(publicJwk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    );
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, key, decodeBase64Url(parts[2]!).buffer as ArrayBuffer,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) return null;
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1]!))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function bearer(request: Request): string {
  const match = /^Bearer (\S+)$/u.exec(request.headers.get('authorization') ?? '');
  if (!match) throw new HttpError(401, 'UNAUTHORIZED', 'Module authentication failed.');
  return match[1]!;
}

export async function requireModule(request: Request, env: Env, nowMs: number): Promise<ModuleClaims> {
  if (!env.GUARDIAN_RUNTIME_PUBLIC_JWK) {
    throw new HttpError(503, 'SERVER_MISCONFIGURED', 'Module authentication is unavailable.');
  }
  const claims = await verifyEs256(bearer(request), env.GUARDIAN_RUNTIME_PUBLIC_JWK);
  const now = Math.floor(nowMs / 1000);
  if (!claims || claims.aud !== 'app-runtime-management' || claims.iss !== (env.GUARDIAN_RUNTIME_ISSUER || 'guardian-api')
    || typeof claims.account_id !== 'string' || typeof claims.child_id !== 'string'
    || typeof claims.child_name !== 'string' || typeof claims.jti !== 'string'
    || typeof claims.iat !== 'number' || typeof claims.exp !== 'number'
    || claims.exp <= now || claims.iat > now + 60 || claims.exp - claims.iat > 360) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Module authentication failed.');
  }
  return claims as unknown as ModuleClaims;
}

export async function requireAccountModule(request: Request, env: Env, nowMs: number): Promise<AccountModuleClaims> {
  if (!env.GUARDIAN_RUNTIME_PUBLIC_JWK) {
    throw new HttpError(503, 'SERVER_MISCONFIGURED', 'Module authentication is unavailable.');
  }
  const claims = await verifyEs256(bearer(request), env.GUARDIAN_RUNTIME_PUBLIC_JWK);
  const now = Math.floor(nowMs / 1000);
  const children = claims?.children;
  const validChildren = Array.isArray(children) && children.length <= 100 && children.every((child) => {
    if (typeof child !== 'object' || child === null || Array.isArray(child)) return false;
    const row = child as Record<string, unknown>;
    return typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 128
      && typeof row.name === 'string' && row.name.length > 0 && row.name.length <= 128;
  });
  if (!claims || claims.aud !== 'app-runtime-management:account'
    || claims.iss !== (env.GUARDIAN_RUNTIME_ISSUER || 'guardian-api')
    || typeof claims.account_id !== 'string' || claims.sub !== claims.account_id
    || typeof claims.jti !== 'string' || typeof claims.iat !== 'number' || typeof claims.exp !== 'number'
    || claims.exp <= now || claims.iat > now + 60 || claims.exp - claims.iat > 360 || !validChildren) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Module authentication failed.');
  }
  return claims as unknown as AccountModuleClaims;
}

export async function requireMachine(
  request: Request,
  database: D1Database,
  nowMs: number,
): Promise<MachineSelfResponse> {
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/u.exec(authorization);
  if (!match?.[1]) throw new HttpError(401, 'UNAUTHORIZED', 'Runtime machine authentication failed.');
  const machine = await authenticateMachine(database, match[1], nowMs);
  if (!machine) throw new HttpError(401, 'UNAUTHORIZED', 'Runtime machine authentication failed.');
  return machine;
}

export async function requireLifecycle(request: Request, env: Env, nowMs: number): Promise<Record<string, unknown>> {
  if (!env.GUARDIAN_RUNTIME_PUBLIC_JWK) throw new HttpError(503, 'SERVER_MISCONFIGURED', 'Lifecycle authentication is unavailable.');
  const claims = await verifyEs256(bearer(request), env.GUARDIAN_RUNTIME_PUBLIC_JWK);
  const now = Math.floor(nowMs / 1000);
  if (!claims || claims.aud !== 'app-runtime-management:lifecycle'
    || claims.iss !== (env.GUARDIAN_RUNTIME_ISSUER || 'guardian-api') || claims.event !== 'child.deleted'
    || typeof claims.account_id !== 'string' || typeof claims.child_id !== 'string'
    || typeof claims.exp !== 'number' || claims.exp <= now) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Lifecycle authentication failed.');
  }
  return claims;
}

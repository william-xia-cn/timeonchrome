import type { DeviceSelfResponse } from './contracts';
import { timingSafeSecretEquals } from './crypto';
import { HttpError } from './http';
import { authenticateDevice } from './repository';

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

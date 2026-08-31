import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import hashVectors from '../../contracts/runtime-segment-hash-v1.vectors.json';
import { requireAdmin } from '../src/auth';
import { segmentContentHash } from '../src/canonical';
import { validateSegment } from '../src/validation';

const origin = 'http://runtime.test';
const adminKey = 'test-admin-key-at-least-32-characters';

beforeEach(async () => {
  await env.RUNTIME_DB.batch([
    env.RUNTIME_DB.prepare('DELETE FROM runtime_usage_segments'),
    env.RUNTIME_DB.prepare('DELETE FROM runtime_devices'),
    env.RUNTIME_DB.prepare('DELETE FROM runtime_enrollment_codes'),
  ]);
});

describe('Runtime API', () => {
  it('matches the shared cross-language segment hash vectors', async () => {
    for (const [index, vector] of hashVectors.cases.entries()) {
      const platform = vector.segment.application.platform;
      if (platform !== 'macos' && platform !== 'windows') {
        throw new Error(`Invalid fixture platform: ${platform}`);
      }
      const validation = validateSegment(vector.segment, platform, index);
      expect(validation.ok, vector.name).toBe(true);
      if (validation.ok) {
        await expect(segmentContentHash(validation.segment)).resolves.toBe(vector.expectedHash);
      }
    }
  });

  it('reports health and rejects unknown routes', async () => {
    const health = await call('/v1/health');
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({ status: 'ok', schemaVersion: 1 });

    const missing = await call('/v1/missing');
    expect(missing.status).toBe(404);
  });

  it('requires constant-time protected admin authentication', async () => {
    const response = await call('/v1/admin/enrollment-codes', {
      method: 'POST',
      body: JSON.stringify({ subjectId: 'subject-a' }),
    });
    expect(response.status).toBe(401);
  });

  it('fails closed when the administrator secret is missing or too short', async () => {
    const request = new Request(`${origin}/v1/admin/enrollment-codes`, {
      headers: { 'x-runtime-admin-key': '' },
    });
    await expect(requireAdmin(request, undefined)).rejects.toMatchObject({
      status: 503,
      code: 'SERVER_MISCONFIGURED',
    });
    await expect(requireAdmin(request, 'short')).rejects.toMatchObject({
      status: 503,
      code: 'SERVER_MISCONFIGURED',
    });
  });

  it('enrolls once and authenticates an independent runtime device', async () => {
    const enrollment = await enroll('subject-a', 'Windows laptop');
    expect(enrollment.deviceId).toMatch(/^rt_device_/u);
    expect(enrollment.deviceToken).toMatch(/^rt_token_/u);
    expect(enrollment.platform).toBe('windows');

    const self = await call('/v1/devices/self', {
      headers: { authorization: `Bearer ${enrollment.deviceToken}` },
    });
    expect(self.status).toBe(200);
    await expect(self.json()).resolves.toMatchObject({
      deviceId: enrollment.deviceId,
      subjectId: 'subject-a',
      platform: 'windows',
      displayName: 'Windows laptop',
    });

    const tokenRow = await env.RUNTIME_DB.prepare(
      'SELECT token_hash FROM runtime_devices WHERE id = ?1',
    ).bind(enrollment.deviceId).first<{ token_hash: string }>();
    expect(tokenRow?.token_hash).not.toContain(enrollment.deviceToken);
  });

  it('rejects consumed, expired, and revoked credentials', async () => {
    const code = await createCode('subject-b');
    const first = await enrollWithCode(code, 'Device');
    expect(first.response.status).toBe(201);
    const second = await enrollWithCode(code, 'Device again');
    expect(second.response.status).toBe(401);

    const expiredCode = await createCode('subject-c');
    await env.RUNTIME_DB.prepare(
      'UPDATE runtime_enrollment_codes SET expires_at_ms = 0 WHERE consumed_at_ms IS NULL',
    ).run();
    const expired = await enrollWithCode(expiredCode, 'Expired');
    expect(expired.response.status).toBe(401);

    await env.RUNTIME_DB.prepare(
      'UPDATE runtime_devices SET revoked_at_ms = ?1 WHERE id = ?2',
    ).bind(Date.now(), first.body.deviceId).run();
    const revoked = await call('/v1/devices/self', {
      headers: { authorization: `Bearer ${first.body.deviceToken}` },
    });
    expect(revoked.status).toBe(401);
  });

  it('accepts idempotent segments and rejects content or platform conflicts', async () => {
    const enrollment = await enroll('subject-upload', 'Uploader');
    const segment = validSegment('session-a:0');

    const first = await upload(enrollment.deviceToken, [segment]);
    expect(first).toEqual({ acceptedIds: ['session-a:0'], rejected: [] });

    const duplicate = await upload(enrollment.deviceToken, [segment]);
    expect(duplicate).toEqual({ acceptedIds: ['session-a:0'], rejected: [] });

    const conflict = await upload(enrollment.deviceToken, [
      { ...segment, durationMilliseconds: 501, endAtMs: 601 },
    ]);
    expect(conflict).toEqual({
      acceptedIds: [],
      rejected: [{ id: 'session-a:0', code: 'ID_CONFLICT' }],
    });

    const mixed = await upload(enrollment.deviceToken, [
      validSegment('session-a:1'),
      {
        ...validSegment('session-a:2'),
        application: { platform: 'macos', runtimeIdentity: 'app:wrong' },
      },
    ]);
    expect(mixed).toEqual({
      acceptedIds: ['session-a:1'],
      rejected: [{ id: 'session-a:2', code: 'PLATFORM_MISMATCH' }],
    });

    const row = await env.RUNTIME_DB.prepare(
      'SELECT COUNT(*) AS count FROM runtime_usage_segments',
    ).first<{ count: number }>();
    expect(row?.count).toBe(2);
  });

  it('enforces the 100 item batch limit without database writes', async () => {
    const enrollment = await enroll('subject-limit', 'Limit');
    const segments = Array.from({ length: 101 }, (_, index) => validSegment(`limit:${index}`));
    const response = await call('/v1/segments:upload', {
      method: 'POST',
      headers: { authorization: `Bearer ${enrollment.deviceToken}` },
      body: JSON.stringify({ schemaVersion: 1, segments }),
    });
    expect(response.status).toBe(400);
    const row = await env.RUNTIME_DB.prepare(
      'SELECT COUNT(*) AS count FROM runtime_usage_segments',
    ).first<{ count: number }>();
    expect(row?.count).toBe(0);
  });
});

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  return exports.default.fetch(new Request(`${origin}${path}`, { ...init, headers }));
}

async function createCode(subjectId: string): Promise<string> {
  const response = await call('/v1/admin/enrollment-codes', {
    method: 'POST',
    headers: { 'x-runtime-admin-key': adminKey },
    body: JSON.stringify({ subjectId, ttlSeconds: 600 }),
  });
  expect(response.status).toBe(201);
  const body = await response.json<{ code: string }>();
  return body.code;
}

async function enrollWithCode(code: string, displayName: string): Promise<{
  response: Response;
  body: { deviceId: string; deviceToken: string; platform: string };
}> {
  const response = await call('/v1/devices/enroll', {
    method: 'POST',
    body: JSON.stringify({ code, platform: 'windows', displayName }),
  });
  const body = response.status === 201
    ? await response.clone().json<{ deviceId: string; deviceToken: string; platform: string }>()
    : { deviceId: '', deviceToken: '', platform: '' };
  return { response, body };
}

async function enroll(subjectId: string, displayName: string): Promise<{
  deviceId: string;
  deviceToken: string;
  platform: string;
}> {
  const result = await enrollWithCode(await createCode(subjectId), displayName);
  expect(result.response.status).toBe(201);
  return result.body;
}

async function upload(deviceToken: string, segments: unknown[]): Promise<unknown> {
  const response = await call('/v1/segments:upload', {
    method: 'POST',
    headers: { authorization: `Bearer ${deviceToken}` },
    body: JSON.stringify({ schemaVersion: 1, segments }),
  });
  expect(response.status).toBe(200);
  return response.json();
}

function validSegment(id: string): Record<string, unknown> {
  return {
    id,
    runtimeSessionID: 'session-a',
    application: {
      platform: 'windows',
      runtimeIdentity: 'app:editor',
      displayName: 'Editor',
    },
    startAtMs: 100,
    endAtMs: 600,
    durationMilliseconds: 500,
    endReason: 'periodicSnapshot',
  };
}

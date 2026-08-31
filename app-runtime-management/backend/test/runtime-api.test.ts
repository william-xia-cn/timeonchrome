import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import hashVectors from '../../contracts/runtime-segment-hash-v1.vectors.json';
import { segmentContentHash } from '../src/canonical';
import { validateSegment } from '../src/validation';

const origin = 'http://runtime.test';
const privateJwk = { kty: 'EC', x: 'BOtK86WkXpgT2fjHLsDh-Xa-K2BkdyhPzRq_OPyINqE', y: '5EbyiSiB1mvklK2VrO_MdOf9IhPlQ-A3dw1vnJvHbOA', crv: 'P-256', d: '2Ja3Py77LNt6aspenNTttELbGzm2-u9WcF4x8BQql8w' };

beforeEach(async () => {
  await env.RUNTIME_DB.batch([
    env.RUNTIME_DB.prepare('DELETE FROM runtime_app_hourly_stats_v1'),
    env.RUNTIME_DB.prepare('DELETE FROM runtime_usage_segments'),
    env.RUNTIME_DB.prepare('DELETE FROM runtime_devices'),
    env.RUNTIME_DB.prepare('DELETE FROM runtime_enrollment_codes'),
    env.RUNTIME_DB.prepare('DELETE FROM runtime_children_v1'),
  ]);
});

describe('Runtime product API', () => {
  it('matches shared segment hashes and reports health', async () => {
    for (const [index, vector] of hashVectors.cases.entries()) {
      const platform = vector.segment.application.platform as 'macos' | 'windows';
      const validation = validateSegment(vector.segment, platform, index);
      expect(validation.ok, vector.name).toBe(true);
      if (validation.ok) await expect(segmentContentHash(validation.segment)).resolves.toBe(vector.expectedHash);
    }
    expect((await call('/v1/health')).status).toBe(200);
  });

  it('rejects missing, wrong-audience, and expired module tokens', async () => {
    expect((await call('/v1/module/devices')).status).toBe(401);
    expect((await call('/v1/module/devices', { headers: bearer(await token({ aud: 'wrong' })) })).status).toBe(401);
    expect((await call('/v1/module/devices', { headers: bearer(await token({ exp: 1 })) })).status).toBe(401);
  });

  it('creates a child-scoped single-use pairing code and authenticates the device', async () => {
    const moduleToken = await token();
    const pairing = await createPairing(moduleToken);
    expect(pairing).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/u);
    const first = await enroll(pairing);
    expect(first.response.status).toBe(201);
    expect((await enroll(pairing)).response.status).toBe(401);
    const self = await call('/v1/devices/self', { headers: bearer(first.body.deviceToken) });
    await expect(self.json()).resolves.toMatchObject({ deviceId: first.body.deviceId, childId: 'child-a', accountId: 'account-a' });
    const devices = await call('/v1/module/devices', { headers: bearer(await token({ child_id: 'child-b', child_name: 'Other' })) });
    await expect(devices.json()).resolves.toEqual({ devices: [] });
  });

  it('records heartbeat, revokes, replaces, and rotates the same device', async () => {
    const moduleToken = await token();
    const enrolled = await enroll(await createPairing(moduleToken));
    const heartbeat = await call('/v1/devices/heartbeat', { method: 'POST', headers: bearer(enrolled.body.deviceToken), body: JSON.stringify({ agentVersion: '1.0.0', windowsVersion: '11', architecture: 'x64' }) });
    expect(heartbeat.status).toBe(200);
    expect((await call(`/v1/module/devices/${enrolled.body.deviceId}/revoke`, { method: 'POST', headers: bearer(moduleToken), body: '{}' })).status).toBe(200);
    expect((await call('/v1/devices/self', { headers: bearer(enrolled.body.deviceToken) })).status).toBe(401);
    const replacement = await call(`/v1/module/devices/${enrolled.body.deviceId}/replace-pairing`, { method: 'POST', headers: bearer(moduleToken), body: '{}' });
    const rotated = await enroll((await replacement.json<{ code: string }>()).code);
    expect(rotated.body.deviceId).toBe(enrolled.body.deviceId);
    expect(rotated.body.deviceToken).not.toBe(enrolled.body.deviceToken);
  });

  it('uploads idempotently and aggregates only the first insert', async () => {
    const moduleToken = await token();
    const enrolled = await enroll(await createPairing(moduleToken));
    const segment = validSegment('session-a:0');
    expect(await upload(enrolled.body.deviceToken, [segment])).toEqual({ acceptedIds: ['session-a:0'], rejected: [] });
    expect(await upload(enrolled.body.deviceToken, [segment])).toEqual({ acceptedIds: ['session-a:0'], rejected: [] });
    const usage = await call('/v1/module/usage?fromMs=0&toMs=86400000', { headers: bearer(moduleToken) });
    await expect(usage.json()).resolves.toMatchObject({ totalDurationMs: 500, applications: [{ durationMs: 500 }] });
  });

  it('deletes all child runtime data through signed lifecycle', async () => {
    const moduleToken = await token();
    const enrolled = await enroll(await createPairing(moduleToken));
    await upload(enrolled.body.deviceToken, [validSegment('delete:0')]);
    const lifecycle = await token({ aud: 'app-runtime-management:lifecycle', event: 'child.deleted' });
    expect((await call('/v1/identity/child-lifecycle', { method: 'POST', headers: bearer(lifecycle), body: '{}' })).status).toBe(200);
    for (const table of ['runtime_children_v1', 'runtime_enrollment_codes', 'runtime_devices', 'runtime_usage_segments', 'runtime_app_hourly_stats_v1']) {
      expect((await env.RUNTIME_DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>())?.count, table).toBe(0);
    }
  });
});

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  return exports.default.fetch(new Request(`${origin}${path}`, { ...init, headers }));
}
function bearer(value: string): HeadersInit { return { authorization: `Bearer ${value}` }; }
async function token(overrides: Record<string, unknown> = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: 'guardian-api', aud: 'app-runtime-management', sub: 'account-a', account_id: 'account-a', child_id: 'child-a', child_name: 'Child', iat: now, exp: now + 300, jti: crypto.randomUUID(), ...overrides };
  const encode = (value: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const header = encode({ alg: 'ES256', typ: 'JWT' }); const payload = encode(claims);
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${header}.${payload}`)));
  const encodedSignature = btoa(String.fromCharCode(...signature)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${header}.${payload}.${encodedSignature}`;
}
async function createPairing(moduleToken: string): Promise<string> {
  const response = await call('/v1/module/pairing-codes', { method: 'POST', headers: bearer(moduleToken), body: '{}' });
  return (await response.json<{ code: string }>()).code;
}
async function enroll(code: string): Promise<{ response: Response; body: { deviceId: string; deviceToken: string } }> {
  const response = await call('/v1/devices/enroll', { method: 'POST', body: JSON.stringify({ code, platform: 'windows', displayName: 'Windows PC' }) });
  return { response, body: response.status === 201 ? await response.clone().json() : { deviceId: '', deviceToken: '' } };
}
async function upload(deviceToken: string, segments: unknown[]): Promise<unknown> {
  return (await call('/v1/segments:upload', { method: 'POST', headers: bearer(deviceToken), body: JSON.stringify({ schemaVersion: 1, segments }) })).json();
}
function validSegment(id: string): Record<string, unknown> {
  return { id, runtimeSessionID: 'session-a', application: { platform: 'windows', runtimeIdentity: 'app:editor', displayName: 'Editor' }, startAtMs: 100, endAtMs: 600, durationMilliseconds: 500, endReason: 'periodicSnapshot' };
}

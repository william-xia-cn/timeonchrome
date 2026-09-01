import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import accountingVectors from '../../contracts/runtime-accounting-v2.vectors.json';
import hashVectors from '../../contracts/runtime-segment-hash-v1.vectors.json';
import { accountingMediaId, accountingUsageId, segmentContentHash } from '../src/canonical';
import type { AccountingMediaSegment, AccountingUsageSegment } from '../src/contracts';
import { validateSegment } from '../src/validation';

const origin = 'http://runtime.test';
const privateJwk = { kty: 'EC', x: 'BOtK86WkXpgT2fjHLsDh-Xa-K2BkdyhPzRq_OPyINqE', y: '5EbyiSiB1mvklK2VrO_MdOf9IhPlQ-A3dw1vnJvHbOA', crv: 'P-256', d: '2Ja3Py77LNt6aspenNTttELbGzm2-u9WcF4x8BQql8w' };

beforeEach(async () => {
  await env.RUNTIME_DB.batch([
    env.RUNTIME_DB.prepare('DELETE FROM runtime_media_segments_v2'),
    env.RUNTIME_DB.prepare('DELETE FROM runtime_usage_diagnostic_segments_v2'),
    env.RUNTIME_DB.prepare('DELETE FROM runtime_uninstall_codes_v2'),
    env.RUNTIME_DB.prepare('DELETE FROM runtime_app_hourly_stats_v2'),
    env.RUNTIME_DB.prepare('DELETE FROM runtime_usage_segments_v2'),
    env.RUNTIME_DB.prepare('DELETE FROM runtime_user_assignments_v2'),
    env.RUNTIME_DB.prepare('DELETE FROM runtime_machine_policy_versions_v2'),
    env.RUNTIME_DB.prepare('DELETE FROM runtime_machine_users_v2'),
    env.RUNTIME_DB.prepare('DELETE FROM runtime_machine_pairing_codes_v2'),
    env.RUNTIME_DB.prepare('DELETE FROM runtime_machines_v2'),
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
    const usageGolden = accountingVectors.cases.find((item) => item.expectedFirstUsageId);
    const usage = await accountingUsage({
      runtimeIdentity: 'app:editor', channel: 'active', basis: 'foregroundInteraction', start: 100, end: 1100,
    });
    usage.runtimeSessionID = 'v2-switch';
    usage.endReason = 'applicationSwitch';
    usage.id = await accountingUsageId(usage);
    expect(usage.id).toBe(usageGolden?.expectedFirstUsageId);
    const mediaGolden = accountingVectors.cases.find((item) => item.expectedFirstMediaId);
    const media = await accountingMedia({
      runtimeIdentity: 'app:music', kind: 'audio', presentation: 'background', start: 0, end: 60_000,
    });
    media.runtimeSessionID = 'v2-media-overlap';
    media.id = await accountingMediaId(media);
    expect(media.id).toBe(mediaGolden?.expectedFirstMediaId);
    expect((await call('/v1/health')).status).toBe(200);
  });

  it('streams versioned installer releases with immutable cache metadata', async () => {
    const version = '1.0.0';
    const key = `windows/x64/${version}/TimeOnChrome-AppRuntime-win-x64-${version}.msi`;
    await env.RELEASES.put(key, new Uint8Array([1, 2, 3, 4]));
    await env.RELEASES.put('windows/x64/latest.json', JSON.stringify({ version, sha256: 'test' }));
    const latest = await call('/v1/releases/windows/x64/latest');
    expect(latest.status).toBe(200);
    await expect(latest.json()).resolves.toMatchObject({ version });
    const installer = await call(`/v1/releases/windows/x64/${version}/installer`);
    expect(installer.status).toBe(200);
    expect(installer.headers.get('cache-control')).toContain('immutable');
    expect(new Uint8Array(await installer.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
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
    const account = await accountToken();
    const machinePairing = await (await call('/v2/module/pairing-codes', {
      method: 'POST', headers: bearer(account), body: JSON.stringify({ defaultChildId: 'child-a' }),
    })).json<{ code: string }>();
    const machine = await (await call('/v2/machines/enroll', {
      method: 'POST', body: JSON.stringify({ code: machinePairing.code, platform: 'windows' }),
    })).json<{ machineId: string; machineToken: string }>();
    const localUserId = `user_${'c'.repeat(32)}`;
    await call('/v2/machines/users', { method: 'PUT', headers: bearer(machine.machineToken),
      body: JSON.stringify({ users: [{ localUserId, displayName: 'Child user', sessionActive: true }] }) });
    await call('/v2/segments:upload', { method: 'POST', headers: bearer(machine.machineToken),
      body: JSON.stringify({ schemaVersion: 2, segments: [{ ...validSegment('delete-v2:0'), localUserId, assignmentVersion: 1 }] }) });
    const lifecycle = await token({ aud: 'app-runtime-management:lifecycle', event: 'child.deleted' });
    expect((await call('/v1/identity/child-lifecycle', { method: 'POST', headers: bearer(lifecycle), body: '{}' })).status).toBe(200);
    for (const table of ['runtime_children_v1', 'runtime_enrollment_codes', 'runtime_devices', 'runtime_usage_segments', 'runtime_app_hourly_stats_v1']) {
      expect((await env.RUNTIME_DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>())?.count, table).toBe(0);
    }
    expect((await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS count FROM runtime_machines_v2').first<{ count: number }>())?.count).toBe(1);
    expect((await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS count FROM runtime_usage_segments_v2').first<{ count: number }>())?.count).toBe(0);
    expect((await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS count FROM runtime_app_hourly_stats_v2').first<{ count: number }>())?.count).toBe(0);
    await expect(env.RUNTIME_DB.prepare(`
      SELECT default_child_id, desired_policy_version FROM runtime_machines_v2 WHERE id=?1
    `).bind(machine.machineId).first()).resolves.toMatchObject({ default_child_id: null, desired_policy_version: 2 });
    await expect(env.RUNTIME_DB.prepare(`
      SELECT child_id, protected FROM runtime_user_assignments_v2
      WHERE machine_id=?1 AND local_user_id=?2 ORDER BY assignment_version DESC LIMIT 1
    `).bind(machine.machineId, localUserId).first()).resolves.toMatchObject({ child_id: null, protected: 0 });
  });

  it('enrolls one machine and applies default and per-user policy without exposing SID', async () => {
    const account = await accountToken();
    const pairingResponse = await call('/v2/module/pairing-codes', {
      method: 'POST', headers: bearer(account),
      body: JSON.stringify({ defaultChildId: 'child-a', displayName: 'Family PC' }),
    });
    expect(pairingResponse.status).toBe(201);
    const pairing = await pairingResponse.json<{ code: string }>();
    const enrolledResponse = await call('/v2/machines/enroll', {
      method: 'POST', body: JSON.stringify({ code: pairing.code, platform: 'windows', displayName: 'Family PC' }),
    });
    expect(enrolledResponse.status).toBe(201);
    const enrolled = await enrolledResponse.json<{ machineId: string; machineToken: string }>();
    const machineHeaders = bearer(enrolled.machineToken);
    const localUserId = `user_${'a'.repeat(32)}`;
    expect((await call('/v2/machines/users', {
      method: 'PUT', headers: machineHeaders,
      body: JSON.stringify({ users: [{ localUserId, displayName: 'William', sessionActive: true }] }),
    })).status).toBe(200);
    const users = await call(`/v2/module/machines/${enrolled.machineId}/users`, { headers: bearer(account) });
    const usersBody = await users.json<{ users: Array<Record<string, unknown>> }>();
    expect(usersBody.users[0]).toMatchObject({ localUserId, displayName: 'William', childId: 'child-a', protected: true, assignmentSource: 'default' });
    expect(JSON.stringify(usersBody)).not.toContain('S-1-');
    const unprotected = await call(`/v2/module/machines/${enrolled.machineId}/users/${localUserId}`, {
      method: 'PATCH', headers: bearer(account), body: JSON.stringify({ protected: false, childId: null }),
    });
    expect(unprotected.status).toBe(200);
    const policy = await call('/v2/machines/policy', { headers: machineHeaders });
    expect(policy.headers.get('etag')).toContain('policy-');
    await expect(policy.json()).resolves.toMatchObject({ users: [{ localUserId, protected: false, childId: null }] });
  });

  it('attributes v2 segments from assignment history and keeps upload idempotent', async () => {
    const account = await accountToken();
    const pairing = await (await call('/v2/module/pairing-codes', {
      method: 'POST', headers: bearer(account), body: JSON.stringify({ defaultChildId: 'child-a' }),
    })).json<{ code: string }>();
    const enrolled = await (await call('/v2/machines/enroll', {
      method: 'POST', body: JSON.stringify({ code: pairing.code, platform: 'windows' }),
    })).json<{ machineId: string; machineToken: string }>();
    const localUserId = `user_${'b'.repeat(32)}`;
    await call('/v2/machines/users', {
      method: 'PUT', headers: bearer(enrolled.machineToken),
      body: JSON.stringify({ users: [{ localUserId, displayName: 'Child user', sessionActive: true }] }),
    });
    const segment = { ...validSegment('v2:0'), localUserId, assignmentVersion: 1 };
    for (let index = 0; index < 2; index += 1) {
      const uploadResponse = await call('/v2/segments:upload', {
        method: 'POST', headers: bearer(enrolled.machineToken),
        body: JSON.stringify({ schemaVersion: 2, segments: [segment] }),
      });
      await expect(uploadResponse.json()).resolves.toEqual({ acceptedIds: ['v2:0'], rejected: [] });
    }
    const usage = await call('/v2/module/usage?childId=child-a&fromMs=0&toMs=86400000', { headers: bearer(account) });
    await expect(usage.json()).resolves.toMatchObject({ totalDurationMs: 500, applications: [{ durationMs: 500 }] });
  });

  it('accepts accounting v2 beside legacy, unions main lanes, and directly sums auxiliary media', async () => {
    const { account, enrolled, localUserId } = await createMachineWithUser();
    const active = await accountingUsage({
      runtimeIdentity: 'app:editor', channel: 'active', basis: 'foregroundInteraction',
      start: 0, end: 60_000, estimated: true,
    });
    active.policySnapshot = { assignmentVersion: 1, quotaBucket: null };
    const pip = await accountingUsage({
      runtimeIdentity: 'app:video', channel: 'pipActive', basis: 'pipStrongMedia',
      start: 10_000, end: 70_000,
    });
    const diagnostic = await accountingUsage({
      runtimeIdentity: null, channel: 'diagnostic', basis: 'diagnostic',
      start: 70_000, end: 70_000, diagnostic: true,
    });
    const usagePayload = [active, pip, diagnostic].map((segment) => ({
      ...segment, localUserId, assignmentVersion: 1,
    }));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await call('/v2/segments:upload', {
        method: 'POST', headers: bearer(enrolled.machineToken),
        body: JSON.stringify({ schemaVersion: 2, segments: usagePayload }),
      });
      await expect(response.json()).resolves.toEqual({
        acceptedIds: [active.id, pip.id, diagnostic.id], rejected: [],
      });
    }

    const audio = await accountingMedia({
      runtimeIdentity: 'app:music', kind: 'audio', presentation: 'background', start: 0, end: 60_000,
    });
    const video = await accountingMedia({
      runtimeIdentity: 'app:movie', kind: 'video', presentation: 'foreground', start: 10_000, end: 70_000,
    });
    const mediaResponse = await call('/v2/media-segments:upload', {
      method: 'POST', headers: bearer(enrolled.machineToken),
      body: JSON.stringify({ schemaVersion: 2, segments: [audio, video].map((segment) => ({
        ...segment, localUserId, assignmentVersion: 1,
      })) }),
    });
    await expect(mediaResponse.json()).resolves.toEqual({
      acceptedIds: [audio.id, video.id], rejected: [],
    });

    const read = await call('/v2/module/accounting?childId=child-a&fromMs=0&toMs=80000', {
      headers: bearer(account),
    });
    await expect(read.json()).resolves.toMatchObject({
      mainUsageTotalMs: 70_000,
      estimated: { segmentCount: 1, durationMs: 60_000 },
      diagnostic: { segmentCount: 1 },
      mediaPlaybackTotalMs: 120_000,
      applications: [
        { runtimeIdentity: 'app:editor', activeMs: 60_000, pipActiveMs: 0, unionMs: 60_000 },
        { runtimeIdentity: 'app:video', activeMs: 0, pipActiveMs: 60_000, unionMs: 60_000 },
      ],
    });
    await expect(env.RUNTIME_DB.prepare(`
      SELECT policy_snapshot_json FROM runtime_usage_segments_v2 WHERE id=?1
    `).bind(active.id).first()).resolves.toMatchObject({
      policy_snapshot_json: JSON.stringify(active.policySnapshot),
    });
    expect((await call('/v2/module/usage?childId=child-a&fromMs=0&toMs=80000', {
      headers: bearer(account),
    }).then((response) => response.json<{ totalDurationMs: number }>())).totalDurationMs).toBe(0);
  });

  it('rejects mismatched accounting ids and keeps media ACK independent', async () => {
    const { enrolled, localUserId } = await createMachineWithUser();
    const segment = await accountingUsage({
      runtimeIdentity: 'app:editor', channel: 'active', basis: 'foregroundInteraction', start: 0, end: 1000,
    });
    const invalid = { ...segment, endWallTimeMs: 2000, localUserId, assignmentVersion: 1 };
    const response = await call('/v2/segments:upload', {
      method: 'POST', headers: bearer(enrolled.machineToken),
      body: JSON.stringify({ schemaVersion: 2, segments: [invalid] }),
    });
    await expect(response.json()).resolves.toEqual({
      acceptedIds: [], rejected: [{ id: segment.id, code: 'ID_MISMATCH' }],
    });
    expect((await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS count FROM runtime_media_segments_v2')
      .first<{ count: number }>())?.count).toBe(0);
  });

  it('unions foreground and PiP per user session and clock epoch without collapsing concurrent users', async () => {
    const { account, enrolled, localUserId } = await createMachineWithUser();
    const secondUserId = `user_${'y'.repeat(32)}`;
    await call('/v2/machines/users', {
      method: 'PUT', headers: bearer(enrolled.machineToken),
      body: JSON.stringify({ users: [
        { localUserId, displayName: 'First user', sessionActive: true },
        { localUserId: secondUserId, displayName: 'Second user', sessionActive: true },
      ] }),
    });
    const first = await accountingUsage({
      runtimeIdentity: 'app:shared', channel: 'active', basis: 'foregroundInteraction', start: 0, end: 60_000,
    });
    const firstPip = await accountingUsage({
      runtimeIdentity: 'app:shared', channel: 'pipActive', basis: 'pipStrongMedia', start: 10_000, end: 70_000,
    });
    const second = await accountingUsage({
      runtimeIdentity: 'app:shared', channel: 'active', basis: 'foregroundInteraction', start: 0, end: 60_000,
    });
    second.runtimeSessionID = 'second-session';
    second.id = await accountingUsageId(second);
    const response = await call('/v2/segments:upload', {
      method: 'POST', headers: bearer(enrolled.machineToken),
      body: JSON.stringify({ schemaVersion: 2, segments: [
        { ...first, localUserId, assignmentVersion: 1 },
        { ...firstPip, localUserId, assignmentVersion: 1 },
        { ...second, localUserId: secondUserId, assignmentVersion: 1 },
      ] }),
    });
    expect(response.status).toBe(200);
    const read = await (await call('/v2/module/accounting?childId=child-a&fromMs=0&toMs=80000', {
      headers: bearer(account),
    })).json<{ mainUsageTotalMs: number; applications: Array<{ unionMs: number }> }>();
    expect(read.mainUsageTotalMs).toBe(130_000);
    expect(read.applications[0]?.unionMs).toBe(130_000);
  });

  it('requires a single-use uninstall code and retires the machine token', async () => {
    const account = await accountToken();
    const pairing = await (await call('/v2/module/pairing-codes', {
      method: 'POST', headers: bearer(account), body: JSON.stringify({ defaultChildId: 'child-a' }),
    })).json<{ code: string }>();
    const enrolled = await (await call('/v2/machines/enroll', {
      method: 'POST', body: JSON.stringify({ code: pairing.code, platform: 'windows' }),
    })).json<{ machineId: string; machineToken: string }>();
    const uninstall = await (await call(`/v2/module/machines/${enrolled.machineId}/uninstall-codes`, {
      method: 'POST', headers: bearer(account), body: '{}',
    })).json<{ code: string }>();
    expect((await call('/v2/machines/uninstall', {
      method: 'POST', headers: bearer(enrolled.machineToken), body: JSON.stringify({ code: uninstall.code }),
    })).status).toBe(200);
    expect((await call('/v2/machines/self', { headers: bearer(enrolled.machineToken) })).status).toBe(401);
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
async function accountToken(overrides: Record<string, unknown> = {}): Promise<string> {
  return token({
    aud: 'app-runtime-management:account',
    children: [{ id: 'child-a', name: 'Child' }, { id: 'child-b', name: 'Other' }],
    ...overrides,
  });
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

async function createMachineWithUser(): Promise<{
  account: string;
  enrolled: { machineId: string; machineToken: string };
  localUserId: string;
}> {
  const account = await accountToken();
  const pairing = await (await call('/v2/module/pairing-codes', {
    method: 'POST', headers: bearer(account), body: JSON.stringify({ defaultChildId: 'child-a' }),
  })).json<{ code: string }>();
  const enrolled = await (await call('/v2/machines/enroll', {
    method: 'POST', body: JSON.stringify({ code: pairing.code, platform: 'windows' }),
  })).json<{ machineId: string; machineToken: string }>();
  const localUserId = `user_${'z'.repeat(32)}`;
  await call('/v2/machines/users', {
    method: 'PUT', headers: bearer(enrolled.machineToken),
    body: JSON.stringify({ users: [{ localUserId, displayName: 'Test user', sessionActive: true }] }),
  });
  return { account, enrolled, localUserId };
}

async function accountingUsage(input: {
  runtimeIdentity: string | null;
  channel: 'active' | 'pipActive' | 'diagnostic';
  basis: 'foregroundInteraction' | 'pipStrongMedia' | 'diagnostic';
  start: number;
  end: number;
  estimated?: boolean;
  diagnostic?: boolean;
}): Promise<AccountingUsageSegment> {
  const diagnostic = input.diagnostic === true;
  const segment: AccountingUsageSegment = {
    id: '0'.repeat(64), schemaVersion: 2, runtimeSessionID: 'accounting-session',
    application: input.runtimeIdentity == null ? null : {
      platform: 'windows', runtimeIdentity: input.runtimeIdentity, displayName: input.runtimeIdentity,
    },
    channel: input.channel, activityBasis: input.basis, clockEpochId: 'epoch-a',
    startWallTimeMs: input.start, endWallTimeMs: input.end,
    startMonotonicTimeMs: input.start, endMonotonicTimeMs: input.end,
    monotonicDurationMilliseconds: input.end - input.start,
    endReason: diagnostic ? 'diagnostic' : 'periodicSnapshot',
    estimated: {
      isEstimated: input.estimated === true,
      reason: input.estimated ? 'checkpointUnconfirmed' : null,
      cappedAtMilliseconds: input.estimated ? 30_000 : null,
    },
    lastEvidenceWallTimeMs: diagnostic ? null : input.end,
    lastEvidenceMonotonicTimeMs: diagnostic ? null : input.end,
    diagnostic, diagnosticCode: diagnostic ? 'lateFact' : null,
    diagnosticMessage: diagnostic ? 'wording excluded from id' : null,
    policySnapshot: null,
  };
  segment.id = await accountingUsageId(segment);
  return segment;
}

async function accountingMedia(input: {
  runtimeIdentity: string;
  kind: 'audio' | 'video';
  presentation: 'foreground' | 'background' | 'pip';
  start: number;
  end: number;
}): Promise<AccountingMediaSegment> {
  const segment: AccountingMediaSegment = {
    id: '0'.repeat(64), schemaVersion: 2, runtimeSessionID: 'accounting-session',
    application: { platform: 'windows', runtimeIdentity: input.runtimeIdentity, displayName: input.runtimeIdentity },
    mediaKind: input.kind, presentation: input.presentation, clockEpochId: 'epoch-a',
    startWallTimeMs: input.start, endWallTimeMs: input.end,
    startMonotonicTimeMs: input.start, endMonotonicTimeMs: input.end,
    monotonicDurationMilliseconds: input.end - input.start,
    endReason: 'mediaStopped', estimated: { isEstimated: false, reason: null, cappedAtMilliseconds: null },
    lastEvidenceWallTimeMs: input.end, lastEvidenceMonotonicTimeMs: input.end,
    authoritativeForUsage: false,
  };
  segment.id = await accountingMediaId(segment);
  return segment;
}

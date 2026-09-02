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
    env.RUNTIME_DB.prepare('DELETE FROM runtime_app_classification_history_v1'),
    env.RUNTIME_DB.prepare('DELETE FROM runtime_child_app_policy_versions_v1'),
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

  it('keeps streaming legacy 1.x MSI releases with immutable cache metadata', async () => {
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
    expect(installer.headers.get('content-disposition')).toContain('.msi');
    expect(new Uint8Array(await installer.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('serves 2.x only through the manifest-declared Burn bootstrapper', async () => {
    const version = '2.0.0';
    const bootstrapperPath = `windows/x64/${version}/TimeOnChrome-AppRuntime-Setup-win-x64-${version}.exe`;
    const bytes = new Uint8Array([5, 6, 7, 8]);
    const sha256 = 'a'.repeat(64);
    await env.RELEASES.put(bootstrapperPath, bytes);
    await env.RELEASES.put(`windows/x64/${version}/manifest.json`, JSON.stringify({
      version,
      platform: 'windows',
      architecture: 'x64',
      bootstrapperPath,
      bootstrapperSha256: sha256,
      bootstrapperSizeBytes: bytes.length,
    }));

    const installer = await call(`/v1/releases/windows/x64/${version}/installer`);
    expect(installer.status).toBe(200);
    expect(installer.headers.get('content-disposition')).toContain(`Setup-win-x64-${version}.exe`);
    expect(installer.headers.get('content-type')).toBe('application/octet-stream');
    expect(installer.headers.get('x-release-sha256')).toBe(sha256);
    expect(installer.headers.get('cache-control')).toContain('immutable');
    expect(new Uint8Array(await installer.arrayBuffer())).toEqual(bytes);
  });

  it('fails closed for a 2.x manifest that does not name the exact Burn path', async () => {
    const version = '2.0.0';
    await env.RELEASES.put(`windows/x64/${version}/TimeOnChrome-AppRuntime-win-x64-${version}.msi`, new Uint8Array([1]));
    await env.RELEASES.put(`windows/x64/${version}/manifest.json`, JSON.stringify({
      version,
      platform: 'windows',
      architecture: 'x64',
      bootstrapperPath: `windows/x64/${version}/TimeOnChrome-AppRuntime-win-x64-${version}.msi`,
      bootstrapperSha256: 'b'.repeat(64),
      bootstrapperSizeBytes: 1,
    }));

    const installer = await call(`/v1/releases/windows/x64/${version}/installer`);
    expect(installer.status).toBe(404);
    await expect(installer.json()).resolves.toMatchObject({ error: { code: 'RELEASE_NOT_FOUND' } });
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
      body: JSON.stringify({ schemaVersion: 2, segments: [{ ...validSegment('delete-v2:0'), localUserId, assignmentVersion: 2 }] }) });
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
    `).bind(machine.machineId).first()).resolves.toMatchObject({ default_child_id: null, desired_policy_version: 3 });
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
    const emptyPolicy = await call('/v2/machines/policy', { headers: machineHeaders });
    expect((await emptyPolicy.clone().json<{ version: number; users: unknown[] }>())).toMatchObject({ version: 1, users: [] });
    const emptyPolicyEtag = emptyPolicy.headers.get('etag');
    expect((await call('/v2/machines/policy-ack', {
      method: 'POST', headers: machineHeaders,
      body: JSON.stringify({ version: 1, state: 'applied', users: [] }),
    })).status).toBe(200);
    await env.RUNTIME_DB.batch([
      env.RUNTIME_DB.prepare(`
        INSERT INTO runtime_machine_users_v2(
          machine_id, local_user_id, display_name, first_seen_at_ms, last_seen_at_ms, session_active
        ) VALUES (?1, ?2, 'legacy-garbled-name', 1, 1, 1)
      `).bind(enrolled.machineId, localUserId),
      env.RUNTIME_DB.prepare(`
        INSERT INTO runtime_user_assignments_v2(
          machine_id, local_user_id, assignment_version, child_id, protected,
          assignment_source, effective_at_ms, created_at_ms
        ) VALUES (?1, ?2, 1, 'child-a', 1, 'default', 1, 1)
      `).bind(enrolled.machineId, localUserId),
    ]);
    const firstUserSync = await call('/v2/machines/users', {
      method: 'PUT', headers: machineHeaders,
      body: JSON.stringify({ users: [{ localUserId, displayName: 'William', sessionActive: true }] }),
    });
    expect(firstUserSync.status).toBe(200);
    await expect(firstUserSync.json()).resolves.toMatchObject({ desiredPolicyVersion: 2 });
    const convergedPolicy = await call('/v2/machines/policy', {
      headers: { ...machineHeaders, 'If-None-Match': emptyPolicyEtag || '' },
    });
    expect(convergedPolicy.status).toBe(200);
    await expect(convergedPolicy.json()).resolves.toMatchObject({
      version: 2,
      users: [{ localUserId, assignmentVersion: 1, childId: 'child-a', protected: true }],
    });
    const repeatedUserSync = await call('/v2/machines/users', {
      method: 'PUT', headers: machineHeaders,
      body: JSON.stringify({ users: [{ localUserId, displayName: 'William', sessionActive: true }] }),
    });
    await expect(repeatedUserSync.json()).resolves.toMatchObject({ desiredPolicyVersion: 2 });
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
    const segment = { ...validSegment('v2:0'), localUserId, assignmentVersion: 2 };
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
    active.policySnapshot = { assignmentVersion: 2, quotaBucket: null };
    const pip = await accountingUsage({
      runtimeIdentity: 'app:video', channel: 'pipActive', basis: 'pipStrongMedia',
      start: 10_000, end: 70_000,
    });
    const diagnostic = await accountingUsage({
      runtimeIdentity: null, channel: 'diagnostic', basis: 'diagnostic',
      start: 70_000, end: 70_000, diagnostic: true,
    });
    const usagePayload = [active, pip, diagnostic].map((segment) => ({
      ...segment, localUserId, assignmentVersion: 2,
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
        ...segment, localUserId, assignmentVersion: 2,
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
      buckets: [{ startAtMs: 0, durationMs: 70_000 }],
      estimated: { segmentCount: 1, durationMs: 60_000 },
      diagnostic: { segmentCount: 1 },
      mediaPlaybackTotalMs: 120_000,
      applications: [
        { runtimeIdentity: 'app:editor', activeMs: 60_000, pipActiveMs: 0, unionMs: 60_000 },
        { runtimeIdentity: 'app:video', activeMs: 0, pipActiveMs: 60_000, unionMs: 60_000 },
      ],
    });
    const appUsage = await call('/v2/module/app-usage?childId=child-a&fromMs=0&toMs=80000', {
      headers: bearer(account),
    });
    await expect(appUsage.json()).resolves.toMatchObject({
      totalDurationMs: 70_000,
      mediaPlaybackTotalMs: 120_000,
    });
    await expect(env.RUNTIME_DB.prepare(`
      SELECT policy_snapshot_json,application_classification,app_policy_version,quota_bucket
      FROM runtime_usage_segments_v2 WHERE id=?1
    `).bind(active.id).first()).resolves.toMatchObject({
      application_classification: 'unclassified',
      app_policy_version: null,
      quota_bucket: 'unclassified',
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
    const invalid = { ...segment, endWallTimeMs: 2000, localUserId, assignmentVersion: 2 };
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
        { ...first, localUserId, assignmentVersion: 2 },
        { ...firstPip, localUserId, assignmentVersion: 2 },
        { ...second, localUserId: secondUserId, assignmentVersion: 3 },
      ] }),
    });
    expect(response.status).toBe(200);
    const read = await (await call('/v2/module/accounting?childId=child-a&fromMs=0&toMs=80000', {
      headers: bearer(account),
    })).json<{ mainUsageTotalMs: number; applications: Array<{ unionMs: number }> }>();
    expect(read.mainUsageTotalMs).toBe(130_000);
    expect(read.applications[0]?.unionMs).toBe(130_000);
  });

  it('versions Child app policy with ETag and resolves uploaded classifications server-side', async () => {
    const { account, enrolled, localUserId } = await createMachineWithUser();
    const empty = await call('/v2/module/app-policy?childId=child-a', { headers: bearer(account) });
    expect(empty.headers.get('etag')).toBe('"app-policy-v0"');
    await expect(empty.json()).resolves.toMatchObject({
      version: 0, classifications: [],
      timeWindows: { monday: { study: [{ start: '00:00', end: '24:00' }] } },
    });
    const policyBody = {
      classifications: [{
        platform: 'windows', runtimeIdentity: 'app:editor', displayName: 'Editor', classification: 'study',
      }],
      quotas: {
        dailyCategoryMinutes: { study: 30, composite: null, restrictedEntertainment: 0, unclassified: null },
        weeklyRestrictedEntertainmentMinutes: 60,
        perApplicationDailyMinutes: [{ platform: 'windows', runtimeIdentity: 'app:editor', minutes: 10 }],
      },
    };
    expect((await call('/v2/module/app-policy?childId=child-a', {
      method: 'PUT', headers: { ...bearer(account), 'If-Match': '"app-policy-v9"' }, body: JSON.stringify(policyBody),
    })).status).toBe(412);
    const saved = await call('/v2/module/app-policy?childId=child-a', {
      method: 'PUT', headers: { ...bearer(account), 'If-Match': '"app-policy-v0"' }, body: JSON.stringify(policyBody),
    });
    expect(saved.status).toBe(200);
    expect(saved.headers.get('etag')).toBe('"app-policy-v1"');
    const machinePolicy = await call('/v2/machines/policy', { headers: bearer(enrolled.machineToken) });
    await expect(machinePolicy.json()).resolves.toMatchObject({
      appPolicies: [{ childId: 'child-a', policy: { version: 1, classifications: [{ classification: 'study' }] } }],
    });

    const segment = await accountingUsage({
      runtimeIdentity: 'app:editor', channel: 'active', basis: 'foregroundInteraction', start: 0, end: 600_000,
    });
    segment.policySnapshot = {
      assignmentVersion: 2, appPolicyVersion: 1,
      applicationClassification: 'blocked', quotaBucket: 'blocked',
    };
    segment.id = await accountingUsageId(segment);
    const uploadResponse = await call('/v2/segments:upload', {
      method: 'POST', headers: bearer(enrolled.machineToken),
      body: JSON.stringify({ schemaVersion: 2, segments: [{ ...segment, localUserId, assignmentVersion: 2 }] }),
    });
    await expect(uploadResponse.json()).resolves.toEqual({ acceptedIds: [segment.id], rejected: [] });
    await expect(env.RUNTIME_DB.prepare(`
      SELECT application_classification,quota_bucket,app_policy_version
      FROM runtime_usage_segments_v2 WHERE id=?1
    `).bind(segment.id).first()).resolves.toMatchObject({
      application_classification: 'study', quota_bucket: 'study', app_policy_version: 1,
    });

    const usage = await call('/v2/module/app-usage?childId=child-a&fromMs=0&toMs=86400000', { headers: bearer(account) });
    await expect(usage.json()).resolves.toMatchObject({
      totalDurationMs: 600_000,
      buckets: [{ categories: [{ classification: 'study', durationMs: 600_000 }] }],
      categories: [{ classification: 'study', durationMs: 600_000, quota: { exceeded: false } }],
      applications: [{ runtimeIdentity: 'app:editor', classification: 'study', quota: { limitMs: 600_000, remainingMs: 0, exceeded: false } }],
    });
    const records = await call('/v2/module/app-classification-records?childId=child-a', { headers: bearer(account) });
    await expect(records.json()).resolves.toMatchObject({ pending: [], processed: [] });
    const ledger = await call('/v2/module/usage-segments?childId=child-a&fromMs=0&toMs=86400000&limit=1', { headers: bearer(account) });
    await expect(ledger.json()).resolves.toMatchObject({ items: [{ runtimeIdentity: 'app:editor', authoritativeForUsage: true }] });
  });

  it('keeps legacy observed usage visible as unclassified without rewriting history', async () => {
    const account = await accountToken();
    const recentEnd = Date.now() - 1_000;
    const recentStart = recentEnd - 60_000;
    await env.RUNTIME_DB.batch([
      env.RUNTIME_DB.prepare(`
        INSERT INTO runtime_children_v1(child_id,account_id,child_name,created_at_ms,updated_at_ms)
        VALUES('child-a','account-a','Child',0,0)
      `),
      env.RUNTIME_DB.prepare(`
        INSERT INTO runtime_devices(
          id,subject_id,platform,token_hash,display_name,created_at_ms,last_seen_at_ms,
          account_id,child_id,agent_version,os_version,architecture,last_upload_at_ms
        ) VALUES('legacy-device','child-a','windows','legacy-token','Legacy PC',0,61000,
          'account-a','child-a','1.0.1','Windows 11','x64',61000)
      `),
      env.RUNTIME_DB.prepare(`
        INSERT INTO runtime_usage_segments(
          id,device_id,runtime_session_id,platform,runtime_identity,display_name,
          start_at_ms,end_at_ms,duration_ms,end_reason,content_hash,uploaded_at_ms
        ) VALUES('legacy-segment','legacy-device','legacy-session','windows','app:legacy',
          'Legacy App',1000,61000,60000,'applicationSwitch','legacy-hash',61000)
      `),
      env.RUNTIME_DB.prepare(`
        INSERT INTO runtime_usage_segments(
          id,device_id,runtime_session_id,platform,runtime_identity,display_name,
          start_at_ms,end_at_ms,duration_ms,end_reason,content_hash,uploaded_at_ms
        ) VALUES('legacy-segment-recent','legacy-device','legacy-session-recent','windows','app:legacy',
          'Legacy App',?1,?2,60000,'applicationSwitch','legacy-recent-hash',?2)
      `).bind(recentStart, recentEnd),
    ]);
    const usage = await (await call('/v2/module/app-usage?childId=child-a&fromMs=0&toMs=86400000', {
      headers: bearer(account),
    })).json<{ totalDurationMs: number; categories: Array<{ classification: string; durationMs: number }> }>();
    expect(usage).toMatchObject({
      totalDurationMs: 60_000,
      categories: [{ classification: 'unclassified', durationMs: 60_000 }],
    });
    const records = await (await call('/v2/module/app-classification-records?childId=child-a', {
      headers: bearer(account),
    })).json<{ pending: Array<{ runtimeIdentity: string; mainDurationMs: number }> }>();
    expect(records.pending).toEqual(expect.arrayContaining([
      expect.objectContaining({ runtimeIdentity: 'app:legacy', mainDurationMs: 60_000 }),
    ]));
  });

  it('preserves time windows for legacy policy updates and reports only recent unclassified evidence', async () => {
    const { account, enrolled, localUserId } = await createMachineWithUser();
    const now = Date.now();
    const unclassified = await accountingUsage({
      runtimeIdentity: 'app:observed', channel: 'active', basis: 'foregroundInteraction',
      start: now - 120_000, end: now - 60_000,
    });
    unclassified.policySnapshot = { assignmentVersion: 2, appPolicyVersion: null, quotaBucket: 'unclassified' };
    unclassified.id = await accountingUsageId(unclassified);
    expect((await call('/v2/segments:upload', {
      method: 'POST', headers: bearer(enrolled.machineToken),
      body: JSON.stringify({ schemaVersion: 2, segments: [{ ...unclassified, localUserId, assignmentVersion: 2 }] }),
    })).status).toBe(200);

    const closed = closedTimeWindows();
    const overlapping = closedTimeWindows();
    overlapping.monday!.study = [{ start: '08:00', end: '10:00' }, { start: '09:30', end: '11:00' }];
    expect((await call('/v2/module/app-policy?childId=child-a', {
      method: 'PUT', headers: { ...bearer(account), 'If-Match': '"app-policy-v0"' },
      body: JSON.stringify({
        classifications: [],
        quotas: {
          dailyCategoryMinutes: { study: null, composite: null, restrictedEntertainment: null, unclassified: null },
          weeklyRestrictedEntertainmentMinutes: null,
          perApplicationDailyMinutes: [],
        },
        timeWindows: overlapping,
      }),
    })).status).toBe(400);
    const firstPolicy = {
      classifications: [
        { platform: 'windows', runtimeIdentity: 'app:observed', displayName: 'Observed', classification: 'study' },
        { platform: 'macos', runtimeIdentity: 'app:unused', displayName: 'Unused', classification: 'composite' },
      ],
      quotas: {
        dailyCategoryMinutes: { study: null, composite: null, restrictedEntertainment: null, unclassified: null },
        weeklyRestrictedEntertainmentMinutes: null,
        perApplicationDailyMinutes: [],
      },
      timeWindows: closed,
    };
    expect((await call('/v2/module/app-policy?childId=child-a', {
      method: 'PUT', headers: { ...bearer(account), 'If-Match': '"app-policy-v0"' }, body: JSON.stringify(firstPolicy),
    })).status).toBe(200);

    const processed = await (await call('/v2/module/app-classification-records?childId=child-a', {
      headers: bearer(account),
    })).json<{ windowStartMs: number; windowEndMs: number; pending: unknown[]; processed: Array<{ runtimeIdentity: string }> }>();
    expect(processed.windowEndMs - processed.windowStartMs).toBe(30 * 86_400_000);
    expect(processed.pending).toEqual([]);
    expect(processed.processed).toEqual(expect.arrayContaining([expect.objectContaining({ runtimeIdentity: 'app:observed' })]));
    const catalog = await (await call('/v2/module/app-catalog?childId=child-a', {
      headers: bearer(account),
    })).json<{ items: Array<{ runtimeIdentity: string; classification: string; mainDurationMs: number; observedInWindow: boolean }> }>();
    expect(catalog.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ runtimeIdentity: 'app:observed', classification: 'study', mainDurationMs: 60_000, observedInWindow: true }),
      expect.objectContaining({ runtimeIdentity: 'app:unused', classification: 'composite', mainDurationMs: 0, observedInWindow: false }),
    ]));

    const classified = await accountingUsage({
      runtimeIdentity: 'app:observed', channel: 'active', basis: 'foregroundInteraction',
      start: now - 50_000, end: now - 10_000,
    });
    classified.policySnapshot = { assignmentVersion: 2, appPolicyVersion: 1, quotaBucket: 'study' };
    classified.id = await accountingUsageId(classified);
    await call('/v2/segments:upload', {
      method: 'POST', headers: bearer(enrolled.machineToken),
      body: JSON.stringify({ schemaVersion: 2, segments: [{ ...classified, localUserId, assignmentVersion: 2 }] }),
    });
    const usage = await (await call(`/v2/module/app-usage?childId=child-a&fromMs=${now - 180_000}&toMs=${now}`, {
      headers: bearer(account),
    })).json<{ outsideTimeWindows: { durationMs: number; segmentCount: number } }>();
    expect(usage.outsideTimeWindows).toMatchObject({ durationMs: 40_000, segmentCount: 1 });

    const legacyUpdate = { classifications: firstPolicy.classifications, quotas: firstPolicy.quotas };
    expect((await call('/v2/module/app-policy?childId=child-a', {
      method: 'PUT', headers: { ...bearer(account), 'If-Match': '"app-policy-v1"' }, body: JSON.stringify(legacyUpdate),
    })).status).toBe(200);
    const saved = await (await call('/v2/module/app-policy?childId=child-a', { headers: bearer(account) }))
      .json<{ timeWindows: ReturnType<typeof closedTimeWindows> }>();
    expect(saved.timeWindows).toEqual(closed);
  });

  it('provides privacy-safe accounting diagnostics through runtime log filters', async () => {
    const { account, enrolled, localUserId } = await createMachineWithUser();
    const now = Date.now();
    const diagnostic = await accountingUsage({
      runtimeIdentity: null, channel: 'diagnostic', basis: 'diagnostic',
      start: now - 1_000, end: now - 1_000, diagnostic: true,
    });
    const uploaded = await call('/v2/segments:upload', {
      method: 'POST', headers: bearer(enrolled.machineToken),
      body: JSON.stringify({ schemaVersion: 2, segments: [{ ...diagnostic, localUserId, assignmentVersion: 2 }] }),
    });
    expect(uploaded.status).toBe(200);

    const response = await call(`/v2/module/runtime-logs?childId=child-a&fromMs=${now - 60_000}&toMs=${now + 1}&level=warning&category=accounting&limit=10`, {
      headers: bearer(account),
    });
    expect(response.status).toBe(200);
    const payload = await response.json<{ items: Array<Record<string, unknown>>; summary: Record<string, number> }>();
    expect(payload.summary).toMatchObject({ total: 1, warning: 1 });
    expect(payload.items).toEqual([expect.objectContaining({
      level: 'warning', category: 'accounting', eventCode: 'lateFact', module: 'accounting-state-machine',
    })]);
    expect(payload.items[0]).not.toHaveProperty('localUserId');
    expect(payload.items[0]).not.toHaveProperty('runtimeIdentity');
    expect((await call(`/v2/module/runtime-logs?childId=child-a&fromMs=0&toMs=${now + 1}&level=debug`, {
      headers: bearer(account),
    })).status).toBe(400);
  });

  it('rejects an unknown app policy version and never trusts a client classification', async () => {
    const { enrolled, localUserId } = await createMachineWithUser();
    const segment = await accountingUsage({
      runtimeIdentity: 'app:unknown', channel: 'active', basis: 'foregroundInteraction', start: 0, end: 1000,
    });
    segment.policySnapshot = {
      assignmentVersion: 2, appPolicyVersion: 999,
      applicationClassification: 'study', quotaBucket: 'study',
    };
    segment.id = await accountingUsageId(segment);
    const response = await call('/v2/segments:upload', {
      method: 'POST', headers: bearer(enrolled.machineToken),
      body: JSON.stringify({ schemaVersion: 2, segments: [{ ...segment, localUserId, assignmentVersion: 2 }] }),
    });
    await expect(response.json()).resolves.toEqual({
      acceptedIds: [], rejected: [{ id: segment.id, code: 'APP_POLICY_VERSION_INVALID' }],
    });
  });

  it('evaluates daily quotas per Beijing day instead of summing a weekly range', async () => {
    const { account, enrolled, localUserId } = await createMachineWithUser();
    const policyBody = {
      classifications: [{ platform: 'windows', runtimeIdentity: 'app:editor', displayName: 'Editor', classification: 'study' }],
      quotas: {
        dailyCategoryMinutes: { study: 10, composite: null, restrictedEntertainment: null, unclassified: null },
        weeklyRestrictedEntertainmentMinutes: null,
        perApplicationDailyMinutes: [{ platform: 'windows', runtimeIdentity: 'app:editor', minutes: 10 }],
      },
    };
    expect((await call('/v2/module/app-policy?childId=child-a', {
      method: 'PUT', headers: { ...bearer(account), 'If-Match': '"app-policy-v0"' }, body: JSON.stringify(policyBody),
    })).status).toBe(200);
    const first = await accountingUsage({ runtimeIdentity: 'app:editor', channel: 'active', basis: 'foregroundInteraction', start: 0, end: 600_000 });
    first.policySnapshot = { assignmentVersion: 2, appPolicyVersion: 1, quotaBucket: 'study' };
    first.id = await accountingUsageId(first);
    const second = await accountingUsage({ runtimeIdentity: 'app:editor', channel: 'active', basis: 'foregroundInteraction', start: 86_400_000, end: 87_000_000 });
    second.policySnapshot = { assignmentVersion: 2, appPolicyVersion: 1, quotaBucket: 'study' };
    second.id = await accountingUsageId(second);
    const response = await call('/v2/segments:upload', {
      method: 'POST', headers: bearer(enrolled.machineToken),
      body: JSON.stringify({ schemaVersion: 2, segments: [first, second].map((segment) => ({ ...segment, localUserId, assignmentVersion: 2 })) }),
    });
    expect((await response.json<{ acceptedIds: string[] }>()).acceptedIds).toHaveLength(2);
    const usage = await (await call('/v2/module/app-usage?childId=child-a&fromMs=0&toMs=172800000', {
      headers: bearer(account),
    })).json<{ categories: Array<{ quota: { exceeded: boolean; exceededDays: number } }>; applications: Array<{ quota: { exceeded: boolean; exceededDays: number } }> }>();
    expect(usage.categories[0]?.quota).toMatchObject({ exceeded: false, exceededDays: 0 });
    expect(usage.applications[0]?.quota).toMatchObject({ exceeded: false, exceededDays: 0 });
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
function closedTimeWindows(): Record<string, Record<string, Array<{ start: string; end: string }>>> {
  return Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => [day, {
    study: [], composite: [], restrictedEntertainment: [], unclassified: [],
  }]));
}
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

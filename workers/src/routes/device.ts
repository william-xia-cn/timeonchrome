// Device 路由 - 设备绑定、配置拉取
import { json, Env, verifyAccountToken } from '../db/middleware';
import { matchDomain as matchDomainV12 } from '../../../extension/core/domain-semantics.js';
import { siteAccessDefaults } from '../config/site-access-defaults';
import { buildEffectiveTimeQuota, getEffectiveQuotaForDate } from '../../../extension/core/quota-config.js';
import { deviceUnboundResponse, verifyDeviceToken, verifyDeviceTokenFromRequest } from './deviceIdentity';

type DeviceIdentityLinkBody = {
  chromeIdentityId?: string;
  platform?: string;
  browser?: string;
  extensionVersion?: string;
};

type DeviceRecoveryBootstrapBody = DeviceIdentityLinkBody & {
  deviceNameHint?: string;
};

type ManagedRecoveryBootstrapBody = {
  tenantId?: string;
  devicePolicyId?: string;
  platform?: string;
  browser?: string;
  extensionVersion?: string;
  deviceNameHint?: string;
};

// 生成 64 字符随机 device_token
function generateDeviceToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

function normalizePlatform(value: unknown): string {
  const raw = String(value || '').trim().toLowerCase();
  if (/mac|darwin|os x/.test(raw)) return 'macos';
  if (/win/.test(raw)) return 'windows';
  if (/cros|chromeos/.test(raw)) return 'chromeos';
  if (/linux/.test(raw)) return 'linux';
  return raw || 'unknown';
}

function isSupportedRecoveryPlatform(platform: string): boolean {
  return platform === 'macos' || platform === 'windows';
}

function trimString(value: unknown, max = 128): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function normalizeManagedPolicyId(value: unknown, max = 128): string | null {
  const text = trimString(value, max);
  if (!text || !/^[A-Za-z0-9._:-]+$/.test(text)) return null;
  return text;
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function chromeIdentityHash(env: Env, value: unknown): Promise<string | null> {
  const id = trimString(value, 256);
  if (!id) return null;
  return hmacHex(env.DEVICE_TOKEN_SECRET || env.JWT_SECRET, `chrome-identity:${id}`);
}

async function pollTokenHash(env: Env, value: string): Promise<string> {
  return hmacHex(env.DEVICE_TOKEN_SECRET || env.JWT_SECRET, `device-recovery-poll:${value}`);
}

async function updateDeviceIdentityMetadata(
  env: Env,
  deviceId: string,
  patch: { chromeIdentityHash?: string | null; platform?: string; browser?: string | null; extensionVersion?: string | null }
): Promise<void> {
  const identityHash = patch.chromeIdentityHash || null;
  const platform = patch.platform ? normalizePlatform(patch.platform) : null;
  const browser = patch.browser ? trimString(patch.browser, 64) : null;
  if (!identityHash && !platform && !browser) return;
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE devices
     SET chrome_identity_hash = COALESCE(?, chrome_identity_hash),
         identity_linked_at = CASE WHEN ? IS NOT NULL THEN ? ELSE identity_linked_at END,
         platform = COALESCE(?, platform),
         browser = COALESCE(?, browser),
         recovery_status = ?
     WHERE id = ?`
  ).bind(
    identityHash,
    identityHash,
    now,
    platform,
    browser,
    'identity_linked',
    deviceId
  ).run();
}

async function cleanupDeviceRecoveryRequests(env: Env, profileId: string | null, now: number): Promise<void> {
  if (!profileId) return;
  const cutoff = now - 30 * 24 * 60 * 60 * 1000;
  await env.DB.prepare(
    `DELETE FROM device_recovery_requests_v1
     WHERE profile_id = ? AND status != 'pending' AND updated_at < ?`
  ).bind(profileId, cutoff).run().catch(() => {});
  await env.DB.prepare(
    `DELETE FROM device_recovery_requests_v1
     WHERE profile_id = ? AND status != 'pending' AND id NOT IN (
       SELECT id FROM device_recovery_requests_v1
       WHERE profile_id = ? AND status != 'pending'
       ORDER BY updated_at DESC
       LIMIT 100
     )`
  ).bind(profileId, profileId).run().catch(() => {});
}

async function recordRecoveredDeviceRequest(
  env: Env,
  input: {
    profileId: string;
    identityHash: string;
    platform: string;
    browser?: string | null;
    extensionVersion?: string | null;
    deviceNameHint?: string | null;
    deviceId: string;
    message: string;
    now: number;
  }
): Promise<void> {
  const pollHash = await pollTokenHash(env, generateDeviceToken());
  await env.DB.prepare(
    `INSERT INTO device_recovery_requests_v1 (
      id, profile_id, chrome_identity_hash, platform, browser, extension_version, device_name_hint,
      candidate_device_id, candidate_count, poll_token_hash, status, result_device_id,
      result_profile_id, message, created_at, updated_at, decided_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'recovered', ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    input.profileId,
    input.identityHash,
    input.platform,
    trimString(input.browser, 64),
    trimString(input.extensionVersion, 32),
    trimString(input.deviceNameHint, 128),
    input.deviceId,
    pollHash,
    input.deviceId,
    input.profileId,
    input.message,
    input.now,
    input.now,
    input.now
  ).run();
  await cleanupDeviceRecoveryRequests(env, input.profileId, input.now);
}

async function recordManagedRecoveredDeviceRequest(
  env: Env,
  input: {
    profileId: string;
    platform: string;
    browser?: string | null;
    extensionVersion?: string | null;
    deviceNameHint?: string | null;
    deviceId: string;
    message: string;
    now: number;
  }
): Promise<void> {
  const pollHash = await pollTokenHash(env, generateDeviceToken());
  await env.DB.prepare(
    `INSERT INTO device_recovery_requests_v1 (
      id, profile_id, chrome_identity_hash, platform, browser, extension_version, device_name_hint,
      candidate_device_id, candidate_count, poll_token_hash, status, result_device_id,
      result_profile_id, message, created_at, updated_at, decided_at
    ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 1, ?, 'recovered', ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    input.profileId,
    input.platform,
    trimString(input.browser, 64),
    trimString(input.extensionVersion, 32),
    trimString(input.deviceNameHint, 128),
    input.deviceId,
    pollHash,
    input.deviceId,
    input.profileId,
    input.message,
    input.now,
    input.now,
    input.now
  ).run();
  await cleanupDeviceRecoveryRequests(env, input.profileId, input.now);
}
async function markPendingRecoveryRequestsRecovered(
  env: Env,
  input: {
    profileId: string;
    identityHash: string;
    platform: string;
    deviceId: string;
    now: number;
  }
): Promise<void> {
  await env.DB.prepare(
    `UPDATE device_recovery_requests_v1
     SET status = 'recovered',
         result_device_id = ?,
         result_profile_id = ?,
         updated_at = ?,
         decided_at = COALESCE(decided_at, ?)
     WHERE profile_id = ?
       AND chrome_identity_hash = ?
       AND platform = ?
       AND candidate_device_id = ?
       AND status = 'pending'`
  ).bind(
    input.deviceId,
    input.profileId,
    input.now,
    input.now,
    input.profileId,
    input.identityHash,
    input.platform,
    input.deviceId
  ).run();
}

export const deviceRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url  = new URL(request.url);
    const path = url.pathname;

    // POST /device/bind - 绑定设备（需要 account_token）
    if (request.method === 'POST' && path === '/device/bind') {
      try {
        const accountId = await verifyAccountToken(request, env.JWT_SECRET);
        if (!accountId) return json({ error: 'Unauthorized' }, 401);

        const { profile_id, device_name, device_token: tokenFromBody, chromeIdentityId, platform, browser } =
          await request.json<{ profile_id: string; device_name?: string; device_token?: string; chromeIdentityId?: string; platform?: string; browser?: string }>();

        if (!profile_id) {
          return json({ error: 'profile_id required' }, 400);
        }

        // 验证 profile 属于该账户
        const profile = await env.DB.prepare(
          `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
        ).bind(profile_id, accountId).first<{ id: string }>();

        if (!profile) {
          return json({ error: 'Profile not found' }, 404);
        }

        // 复用传入的 token，或生成新 token
        const deviceToken = tokenFromBody || generateDeviceToken();
        const isNew       = !tokenFromBody;

        let deviceId: string | null = null;
        if (isNew) {
          deviceId = crypto.randomUUID();
          const now      = Date.now();
          const devName  = (device_name || 'Chrome Extension').slice(0, 64);

          const identityHash = await chromeIdentityHash(env, chromeIdentityId);
          await env.DB.prepare(
            `INSERT INTO devices (id, profile_id, device_token, device_name, last_seen, created_at, platform, browser, chrome_identity_hash, identity_linked_at, recovery_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            deviceId,
            profile_id,
            deviceToken,
            devName,
            now,
            now,
            platform ? normalizePlatform(platform) : null,
            trimString(browser, 64),
            identityHash,
            identityHash ? now : null,
            identityHash ? 'identity_linked' : null
          ).run();
        } else {
          const existing = await verifyDeviceToken(env, deviceToken);
          if (!existing || existing.profileId !== profile_id) {
            return json({ error: 'Device token not found', code: 'DEVICE_TOKEN_NOT_FOUND' }, 404);
          }
          if (existing.unbound) return deviceUnboundResponse(existing.deviceId);
          deviceId = existing.deviceId || null;
          const identityHash = await chromeIdentityHash(env, chromeIdentityId);
          if (deviceId && (identityHash || platform || browser)) {
            await updateDeviceIdentityMetadata(env, deviceId, {
              chromeIdentityHash: identityHash,
              platform,
              browser,
            }).catch(() => {});
          }
        }

        return json({ success: true, device_token: deviceToken, profile_id, device_id: deviceId });
      } catch (e: any) {
        return json({ error: 'Failed to bind device: ' + e.message }, 500);
      }
    }

    // POST /device/heartbeat
    if (request.method === 'POST' && path === '/device/heartbeat') {
      const deviceIdentity = await verifyDeviceTokenFromRequest(request, env, { updateLastSeen: true });
      if (!deviceIdentity) return json({ error: 'Invalid device token' }, 401);
      if (deviceIdentity.unbound) return deviceUnboundResponse(deviceIdentity.deviceId);
      return json({ ok: true, ts: Date.now() });
    }

    // GET /device/config
    if (request.method === 'GET' && path === '/device/config') {
      try {
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
        const deviceIdentity = await verifyDeviceTokenFromRequest(request, env, { updateLastSeen: true });
        if (!deviceIdentity) return json({ error: 'Invalid device token' }, 401);
        if (deviceIdentity.unbound) return deviceUnboundResponse(deviceIdentity.deviceId);
        const profileId = deviceIdentity.profileId;

        const row = await env.DB.prepare(
          `SELECT config, version FROM profiles WHERE id = ?`
        ).bind(profileId).first<{ config: string; version: number }>();

        // Fetch monitoring_enabled (column added in migration 002; default 1 if not present)
        let monitoringEnabled = 1;
        try {
          const deviceRow = token ? await env.DB.prepare(
            `SELECT monitoring_enabled FROM devices WHERE device_token = ?`
          ).bind(token).first<{ monitoring_enabled: number }>() : null;
          monitoringEnabled = deviceRow?.monitoring_enabled ?? 1;
        } catch (_) { /* column not yet migrated */ }

        const configData = row?.config ? JSON.parse(row.config) : {};
        if (!Array.isArray(configData.defaultStudySites)) {
          configData.defaultStudySites = siteAccessDefaults.defaultStudySites;
        }
        if (!Array.isArray(configData.defaultCompositeSites)) {
          configData.defaultCompositeSites = siteAccessDefaults.defaultCompositeSites;
        }
        if (!Array.isArray(configData.defaultUserCompositeSites)) {
          configData.defaultUserCompositeSites = siteAccessDefaults.defaultUserCompositeSites || [];
        }
        if (!Array.isArray(configData.defaultRestrictedEntertainmentSites)) {
          configData.defaultRestrictedEntertainmentSites = siteAccessDefaults.defaultRestrictedEntertainmentSites;
        }
        if (!Array.isArray(configData.defaultBlockedSites)) {
          configData.defaultBlockedSites = siteAccessDefaults.defaultBlockedSites;
        }
        const effectiveTimeQuota = buildEffectiveTimeQuota(configData);
        configData.timeQuota = {
          ...(configData.timeQuota || {}),
          daily: effectiveTimeQuota.daily,
        };

        return json({
          data:               configData,
          version:            row?.version || 0,
          profile_id:         profileId,
          device_id:          deviceIdentity.deviceId,
          monitoring_enabled: monitoringEnabled,
        });
      } catch (e: any) {
        return json({
          error: 'Failed to read device config',
          code: 'DEVICE_CONFIG_READ_FAILED',
          message: e?.message || String(e),
        }, 500);
      }
    }

    // POST /device/identity-link - 绑定后补写弱 Chrome identity metadata
    if (request.method === 'POST' && path === '/device/identity-link') {
      const deviceIdentity = await verifyDeviceTokenFromRequest(request, env, { updateLastSeen: true });
      if (!deviceIdentity) return json({ error: 'Invalid device token' }, 401);
      if (deviceIdentity.unbound) return deviceUnboundResponse(deviceIdentity.deviceId);
      const body = await request.json<DeviceIdentityLinkBody>().catch(() => ({} as DeviceIdentityLinkBody));
      const identityHash = await chromeIdentityHash(env, body.chromeIdentityId);
      if (!identityHash) return json({ success: false, code: 'IDENTITY_UNAVAILABLE', error: 'Chrome identity unavailable' }, 200);
      await updateDeviceIdentityMetadata(env, deviceIdentity.deviceId, {
        chromeIdentityHash: identityHash,
        platform: body.platform,
        browser: body.browser,
        extensionVersion: body.extensionVersion,
      });
      return json({ success: true, identityLinked: true });
    }

    // POST /device/managed-recover/bootstrap - managed policy anchor recovery without device token
    if (request.method === 'POST' && path === '/device/managed-recover/bootstrap') {
      const now = Date.now();
      const body = await request.json<ManagedRecoveryBootstrapBody>().catch(() => ({} as ManagedRecoveryBootstrapBody));
      const tenantId = normalizeManagedPolicyId(body.tenantId, 128);
      const devicePolicyId = normalizeManagedPolicyId(body.devicePolicyId, 128);
      const platform = normalizePlatform(body.platform);
      if (!tenantId || !devicePolicyId) {
        return json({ success: false, status: 'MANAGED_POLICY_MALFORMED', code: 'MANAGED_POLICY_MALFORMED' }, 200);
      }
      if (!isSupportedRecoveryPlatform(platform)) {
        return json({ success: false, status: 'UNSUPPORTED_PLATFORM', code: 'UNSUPPORTED_PLATFORM' }, 200);
      }

      const rows = await env.DB.prepare(
        `SELECT m.id AS mapping_id, m.profile_id, m.device_id, m.status AS mapping_status,
                d.device_name, d.status AS device_status, p.name AS profile_name
         FROM managed_device_mappings_v1 m
         JOIN devices d ON d.id = m.device_id AND d.profile_id = m.profile_id
         JOIN profiles p ON p.id = m.profile_id
         WHERE m.tenant_id = ? AND m.device_policy_id = ?`
      ).bind(tenantId, devicePolicyId).all<{
        mapping_id: string; profile_id: string; device_id: string; mapping_status?: string;
        device_name?: string; device_status?: string; profile_name?: string;
      }>();
      const mappings = rows.results || [];
      if (mappings.length <= 0) {
        return json({ success: false, status: 'NO_MAPPING', code: 'NO_MAPPING' }, 200);
      }
      if (mappings.length > 1) {
        return json({ success: false, status: 'MAPPING_CONFLICT', code: 'MAPPING_CONFLICT' }, 200);
      }
      const mapping = mappings[0];
      if (mapping.mapping_status && mapping.mapping_status !== 'active') {
        return json({ success: false, status: 'MAPPING_DISABLED', code: 'MAPPING_DISABLED' }, 200);
      }
      if (mapping.device_status === 'unbound') {
        return deviceUnboundResponse(mapping.device_id);
      }

      const newToken = generateDeviceToken();
      await env.DB.prepare(
        `UPDATE devices
         SET device_token = ?, last_seen = ?, last_recovered_at = ?, recovery_status = 'managed_policy_recovered',
             platform = COALESCE(?, platform), browser = COALESCE(?, browser)
         WHERE id = ? AND COALESCE(status, 'bound') = 'bound'`
      ).bind(
        newToken,
        now,
        now,
        platform,
        trimString(body.browser, 64),
        mapping.device_id
      ).run();
      await env.DB.prepare(
        `UPDATE managed_device_mappings_v1
         SET last_recovered_at = ?, updated_at = ?
         WHERE id = ?`
      ).bind(now, now, mapping.mapping_id).run().catch(() => {});
      await recordManagedRecoveredDeviceRequest(env, {
        profileId: mapping.profile_id,
        platform,
        browser: body.browser,
        extensionVersion: body.extensionVersion,
        deviceNameHint: body.deviceNameHint,
        deviceId: mapping.device_id,
        message: 'Managed policy recovered mapped device candidate.',
        now,
      }).catch(() => {});

      return json({
        success: true,
        status: 'RECOVERED',
        device_token: newToken,
        device_id: mapping.device_id,
        profile_id: mapping.profile_id,
        profile_name: mapping.profile_name || null,
        recovered: true,
        recoverySource: 'managed_policy',
      });
    }
    // POST /device/recover/bootstrap - weak identity based recovery without device token
    if (request.method === 'POST' && path === '/device/recover/bootstrap') {
      const now = Date.now();
      const body = await request.json<DeviceRecoveryBootstrapBody>().catch(() => ({} as DeviceRecoveryBootstrapBody));
      const platform = normalizePlatform(body.platform);
      const identityHash = await chromeIdentityHash(env, body.chromeIdentityId);
      if (!identityHash) {
        return json({ success: false, status: 'IDENTITY_UNAVAILABLE', code: 'IDENTITY_UNAVAILABLE' }, 200);
      }
      if (!isSupportedRecoveryPlatform(platform)) {
        return json({ success: false, status: 'UNSUPPORTED_PLATFORM', code: 'UNSUPPORTED_PLATFORM' }, 200);
      }

      const candidateResult = await env.DB.prepare(
        `SELECT d.id, d.profile_id, d.device_name, d.last_seen, d.status, p.name AS profile_name
         FROM devices d
         JOIN profiles p ON p.id = d.profile_id
         WHERE d.chrome_identity_hash = ?
           AND d.platform = ?
           AND COALESCE(d.status, 'bound') = 'bound'
         ORDER BY COALESCE(d.last_seen, 0) DESC`
      ).bind(identityHash, platform).all<{ id: string; profile_id: string; device_name?: string; last_seen?: number; status?: string; profile_name?: string }>();
      const candidates = candidateResult.results || [];

      if (candidates.length === 1) {
        const candidate = candidates[0];
        const newToken = generateDeviceToken();
        await env.DB.prepare(
          `UPDATE devices
           SET device_token = ?, last_seen = ?, last_recovered_at = ?, recovery_status = 'auto_recovered'
           WHERE id = ? AND COALESCE(status, 'bound') = 'bound'`
        ).bind(newToken, now, now, candidate.id).run();
        await markPendingRecoveryRequestsRecovered(env, {
          profileId: candidate.profile_id,
          identityHash,
          platform,
          deviceId: candidate.id,
          now,
        }).catch(() => {});
        await recordRecoveredDeviceRequest(env, {
          profileId: candidate.profile_id,
          identityHash,
          platform,
          browser: body.browser,
          extensionVersion: body.extensionVersion,
          deviceNameHint: body.deviceNameHint,
          deviceId: candidate.id,
          message: 'Auto recovered unique device candidate.',
          now,
        }).catch(() => {});
        return json({
          success: true,
          status: 'RECOVERED',
          device_token: newToken,
          device_id: candidate.id,
          profile_id: candidate.profile_id,
          profile_name: candidate.profile_name || null,
          recovered: true,
        });
      }

      if (candidates.length <= 0) {
        return json({ success: false, status: 'NO_CANDIDATE', code: 'NO_CANDIDATE' }, 200);
      }

      const sameProfile = new Set(candidates.map(c => c.profile_id));
      if (sameProfile.size !== 1) {
        return json({ success: false, status: 'MULTIPLE_CANDIDATES', code: 'MULTIPLE_CANDIDATES' }, 200);
      }

      const pollToken = generateDeviceToken();
      const requestId = crypto.randomUUID();
      const pollHash = await pollTokenHash(env, pollToken);
      const candidate = candidates[0];
      await env.DB.prepare(
        `INSERT INTO device_recovery_requests_v1 (
          id, profile_id, chrome_identity_hash, platform, browser, extension_version, device_name_hint,
          candidate_device_id, candidate_count, poll_token_hash, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
      ).bind(
        requestId,
        candidate.profile_id,
        identityHash,
        platform,
        trimString(body.browser, 64),
        trimString(body.extensionVersion, 32),
        trimString(body.deviceNameHint, 128),
        candidate.id,
        candidates.length,
        pollHash,
        now,
        now
      ).run();
      await cleanupDeviceRecoveryRequests(env, candidate.profile_id, now);
      return json({
        success: false,
        status: 'PENDING_CLOUD_CONFIRMATION',
        code: 'PENDING_CLOUD_CONFIRMATION',
        recoveryRequestId: requestId,
        recoveryPollToken: pollToken,
      }, 202);
    }

    // GET /device/recover/status?requestId=...&pollToken=...
    if (request.method === 'GET' && path === '/device/recover/status') {
      const requestId = url.searchParams.get('requestId') || '';
      const pollToken = url.searchParams.get('pollToken') || '';
      if (!requestId || !pollToken) return json({ error: 'requestId and pollToken required' }, 400);
      const pollHash = await pollTokenHash(env, pollToken);
      const row = await env.DB.prepare(
        `SELECT r.id, r.status, r.result_device_id, r.result_profile_id, r.message,
                r.platform, r.browser, r.device_name_hint, r.chrome_identity_hash,
                d.profile_id AS device_profile_id, p.name AS profile_name, d.status AS device_status
         FROM device_recovery_requests_v1 r
         LEFT JOIN devices d ON d.id = r.result_device_id
         LEFT JOIN profiles p ON p.id = COALESCE(r.result_profile_id, d.profile_id)
         WHERE r.id = ? AND r.poll_token_hash = ?`
      ).bind(requestId, pollHash).first<{
        id: string; status: string; result_device_id?: string; result_profile_id?: string; message?: string;
        platform?: string; browser?: string; device_name_hint?: string; chrome_identity_hash?: string;
        device_profile_id?: string; profile_name?: string; device_status?: string;
      }>();
      if (!row) return json({ error: 'Recovery request not found', code: 'RECOVERY_REQUEST_NOT_FOUND' }, 404);
      if (row.status === 'approved' && row.result_device_id) {
        if (row.device_status === 'unbound') return deviceUnboundResponse(row.result_device_id);
        const now = Date.now();
        const newToken = generateDeviceToken();
        await env.DB.prepare(
          `UPDATE devices SET device_token = ?, last_seen = ?, last_recovered_at = ?, recovery_status = 'cloud_approved_recovered'
           WHERE id = ? AND COALESCE(status, 'bound') = 'bound'`
        ).bind(newToken, now, now, row.result_device_id).run();
        await env.DB.prepare(
          `UPDATE device_recovery_requests_v1 SET status = 'recovered', updated_at = ?, decided_at = COALESCE(decided_at, ?) WHERE id = ?`
        ).bind(now, now, requestId).run();
        return json({
          success: true,
          status: 'RECOVERED',
          device_token: newToken,
          device_id: row.result_device_id,
          profile_id: row.result_profile_id || row.device_profile_id,
          profile_name: row.profile_name || null,
        });
      }
      if (row.status === 'approved_new' && row.result_profile_id) {
        const now = Date.now();
        const newToken = generateDeviceToken();
        const deviceId = crypto.randomUUID();
        const deviceName = (row.device_name_hint || 'Recovered Chrome Extension').slice(0, 64);
        await env.DB.prepare(
          `INSERT INTO devices (
            id, profile_id, device_token, device_name, last_seen, created_at,
            platform, browser, chrome_identity_hash, identity_linked_at, last_recovered_at, recovery_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cloud_approved_new')`
        ).bind(
          deviceId,
          row.result_profile_id,
          newToken,
          deviceName,
          now,
          now,
          row.platform || null,
          row.browser || null,
          row.chrome_identity_hash || null,
          row.chrome_identity_hash ? now : null,
          now
        ).run();
        await env.DB.prepare(
          `UPDATE device_recovery_requests_v1 SET status = 'recovered', result_device_id = ?, updated_at = ?, decided_at = COALESCE(decided_at, ?) WHERE id = ?`
        ).bind(deviceId, now, now, requestId).run();
        return json({
          success: true,
          status: 'RECOVERED',
          device_token: newToken,
          device_id: deviceId,
          profile_id: row.result_profile_id,
          profile_name: row.profile_name || null,
        });
      }
      return json({ success: false, status: row.status, message: row.message || null });
    }

    // PUT /device/config
    if (request.method === 'PUT' && path === '/device/config') {
      const deviceIdentity = await verifyDeviceTokenFromRequest(request, env, { updateLastSeen: true });
      if (!deviceIdentity) return json({ error: 'Invalid device token' }, 401);
      if (deviceIdentity.unbound) return deviceUnboundResponse(deviceIdentity.deviceId);
      return json({
        success: false,
        error: 'Device config writes are deprecated',
        code: 'DEVICE_CONFIG_WRITE_DEPRECATED',
      }, 410);
    }

    // GET /device/quota-state?date=YYYY-MM-DD
    if (request.method === 'GET' && path === '/device/quota-state') {
      const deviceIdentity = await verifyDeviceTokenFromRequest(request, env);
      if (!deviceIdentity) return json({ error: 'Invalid device token' }, 401);
      if (deviceIdentity.unbound) return deviceUnboundResponse(deviceIdentity.deviceId);
      const profileId = deviceIdentity.profileId;

      const dateParam = url.searchParams.get('date');
      if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        return json({ error: 'date param required (YYYY-MM-DD)' }, 400);
      }

      // Get config for quota limits and studyList
      const profileRow = await env.DB.prepare(
        `SELECT config FROM profiles WHERE id = ?`
      ).bind(profileId).first<{ config: string }>();

      const config = profileRow?.config ? JSON.parse(profileRow.config) : {};
      const studyList: string[]     = config.studyList     || [];
      const compositeList: string[] = config.compositeList || [];
      const borrow                  = config.quotaBorrow   ?? null;
      const effectiveQuota = getEffectiveQuotaForDate(config, dateParam as any).todayEffectiveQuota;
      const limitSeconds = (minutes: number | null | undefined) => {
        if (minutes === null || minutes === undefined) return null;
        const number = Number(minutes);
        return Number.isFinite(number) ? Math.max(0, number * 60) : null;
      };
      const dailyOnlineQuota = limitSeconds(effectiveQuota.onlineMinutes);
      const dailyStudyQuota = limitSeconds(effectiveQuota.studyMinutes);
      const dailyUndeterminedQuota = limitSeconds(effectiveQuota.compositeMinutes);
      const effectiveDailyRestSec = limitSeconds(effectiveQuota.restMinutes);
      const weeklyRestLimitSec = limitSeconds(effectiveQuota.weeklyRestMinutes);

      const matchDomain = matchDomainV12;

      // Sum today's stats for ALL devices under this profile
      const statsResult = await env.DB.prepare(
        `SELECT domain, SUM(duration) as total FROM stats WHERE profile_id = ? AND date = ? GROUP BY domain`
      ).bind(profileId, dateParam).all<{ domain: string; total: number }>();

      let onlineSeconds = 0, studySeconds = 0, undeterminedSeconds = 0;
      for (const row of (statsResult.results || [])) {
        onlineSeconds += row.total;
        const isStudy     = studyList.some(p    => matchDomain(row.domain, p));
        const isComposite = compositeList.some(p => matchDomain(row.domain, p));
        if (isStudy) studySeconds += row.total;
        else if (isComposite) undeterminedSeconds += row.total;
      }
      const restSeconds = Math.max(0, onlineSeconds - studySeconds - undeterminedSeconds);

      // Sum this week's rest (Mon → dateParam)
      const dow = new Date(dateParam).getDay();
      const daysBack = dow === 0 ? 6 : dow - 1;
      const weekStartDate = new Date(dateParam);
      weekStartDate.setDate(weekStartDate.getDate() - daysBack);
      const weekStartStr = weekStartDate.toISOString().slice(0, 10);

      const weekStatsResult = await env.DB.prepare(
        `SELECT domain, SUM(duration) as total FROM stats WHERE profile_id = ? AND date >= ? AND date <= ? GROUP BY domain`
      ).bind(profileId, weekStartStr, dateParam).all<{ domain: string; total: number }>();

      let wOnline = 0, wStudy = 0, wUndetermined = 0;
      for (const row of (weekStatsResult.results || [])) {
        wOnline += row.total;
        if (studyList.some(p => matchDomain(row.domain, p))) wStudy += row.total;
        else if (compositeList.some(p => matchDomain(row.domain, p))) wUndetermined += row.total;
      }
      const weekRestSeconds    = Math.max(0, wOnline - wStudy - wUndetermined);
      const isLimited = (seconds: number | null) => seconds !== null && Number.isFinite(Number(seconds));
      const restLockedByDay    = isLimited(effectiveDailyRestSec) && restSeconds    >= Number(effectiveDailyRestSec);
      const restLockedByWeek   = isLimited(weeklyRestLimitSec)    && weekRestSeconds >= Number(weeklyRestLimitSec);

      return json({
        onlineLocked:       isLimited(dailyOnlineQuota)      && onlineSeconds      >= Number(dailyOnlineQuota),
        studyLocked:        isLimited(dailyStudyQuota)       && studySeconds       >= Number(dailyStudyQuota),
        restLocked:         restLockedByDay || restLockedByWeek,
        weeklyRestLocked:   restLockedByWeek,
        undeterminedLocked: isLimited(dailyUndeterminedQuota) && undeterminedSeconds >= Number(dailyUndeterminedQuota),
        onlineSeconds, studySeconds, undeterminedSeconds, restSeconds,
        weekRestSeconds, weeklyRestLimitSec,
        quotaBorrow: borrow,
      });
    }

    return json({ error: 'Not found' }, 404);
  },
};

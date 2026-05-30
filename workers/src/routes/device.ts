// Device 路由 - 设备绑定、配置拉取
import { json, Env, verifyAccountToken } from '../db/middleware';
import { matchDomain as matchDomainV12 } from '../../../extension/core/domain-semantics.js';
import { siteAccessDefaults } from '../config/site-access-defaults';
import { buildEffectiveTimeQuota, getEffectiveQuotaForDate } from '../../../extension/core/quota-config.js';
import { deviceUnboundResponse, verifyDeviceToken, verifyDeviceTokenFromRequest } from './deviceIdentity';

// 生成 64 字符随机 device_token
function generateDeviceToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
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

        const { profile_id, device_name, device_token: tokenFromBody } =
          await request.json<{ profile_id: string; device_name?: string; device_token?: string }>();

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

          await env.DB.prepare(
            `INSERT INTO devices (id, profile_id, device_token, device_name, last_seen, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(deviceId, profile_id, deviceToken, devName, now, now).run();
        } else {
          const existing = await verifyDeviceToken(env, deviceToken);
          if (!existing || existing.profileId !== profile_id) {
            return json({ error: 'Device token not found', code: 'DEVICE_TOKEN_NOT_FOUND' }, 404);
          }
          if (existing.unbound) return deviceUnboundResponse(existing.deviceId);
          deviceId = existing.deviceId || null;
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

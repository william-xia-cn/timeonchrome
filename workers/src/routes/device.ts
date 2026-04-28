// Device 路由 - 设备绑定、配置拉取
import { json, Env, verifyAccountToken } from '../db/middleware';
import { matchDomain as matchDomainV12 } from '../../../core/domain-semantics.js';

// 验证 device_token，可选同时刷新 last_seen；返回 profile_id 或 null
async function verifyDeviceToken(
  request: Request,
  env: Env,
  updateLastSeen = false
): Promise<string | null> {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;

  const token  = auth.slice(7);
  const device = await env.DB.prepare(
    `SELECT profile_id FROM devices WHERE device_token = ?`
  ).bind(token).first<{ profile_id: string }>();

  if (!device?.profile_id) return null;

  if (updateLastSeen) {
    await env.DB.prepare(
      `UPDATE devices SET last_seen = ? WHERE device_token = ?`
    ).bind(Date.now(), token).run();
  }

  return device.profile_id;
}

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

        if (isNew) {
          const deviceId = crypto.randomUUID();
          const now      = Date.now();
          const devName  = (device_name || 'Chrome Extension').slice(0, 64);

          await env.DB.prepare(
            `INSERT INTO devices (id, profile_id, device_token, device_name, last_seen, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(deviceId, profile_id, deviceToken, devName, now, now).run();
        }

        return json({ success: true, device_token: deviceToken, profile_id });
      } catch (e: any) {
        return json({ error: 'Failed to bind device: ' + e.message }, 500);
      }
    }

    // POST /device/heartbeat
    if (request.method === 'POST' && path === '/device/heartbeat') {
      const profileId = await verifyDeviceToken(request, env, true);
      if (!profileId) return json({ error: 'Invalid device token' }, 401);
      return json({ ok: true, ts: Date.now() });
    }

    // GET /device/config
    if (request.method === 'GET' && path === '/device/config') {
      const authHeader = request.headers.get('Authorization');
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      const profileId = await verifyDeviceToken(request, env, true);
      if (!profileId) return json({ error: 'Invalid device token' }, 401);

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

      return json({
        data:               row?.config ? JSON.parse(row.config) : {},
        version:            row?.version || 0,
        profile_id:         profileId,
        monitoring_enabled: monitoringEnabled,
      });
    }

    // PUT /device/config
    if (request.method === 'PUT' && path === '/device/config') {
      const profileId = await verifyDeviceToken(request, env, true);
      if (!profileId) return json({ error: 'Invalid device token' }, 401);

      try {
        const { data } = await request.json<{ data: unknown }>();
        const now       = Date.now();
        const configStr = JSON.stringify(data);

        await env.DB.prepare(
          `UPDATE profiles SET config = ?, version = version + 1, updated_at = ? WHERE id = ?`
        ).bind(configStr, now, profileId).run();

        const row = await env.DB.prepare(
          `SELECT version FROM profiles WHERE id = ?`
        ).bind(profileId).first<{ version: number }>();

        return json({ success: true, version: row?.version || 1 });
      } catch (e: any) {
        return json({ error: 'Failed to update config: ' + e.message }, 500);
      }
    }

    // GET /device/quota-state?date=YYYY-MM-DD
    if (request.method === 'GET' && path === '/device/quota-state') {
      const profileId = await verifyDeviceToken(request, env);
      if (!profileId) return json({ error: 'Invalid device token' }, 401);

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
      const dailyOnlineQuota        = (config.dailyOnlineQuota       ?? 0) * 60; // minutes → seconds
      const dailyStudyQuota         = (config.dailyStudyQuota        ?? 0)  * 60;
      const dailyUndeterminedQuota  = (config.dailyUndeterminedQuota ?? 60)  * 60;

      // Effective daily rest limit (seconds) — adjusted for borrow
      const baseDailyRest = (config.dailyRestQuota ?? 120); // minutes
      let effectiveDailyRestMin = baseDailyRest;
      if (borrow && !borrow.repaid) {
        if (dateParam === borrow.borrowedFrom) {
          effectiveDailyRestMin = baseDailyRest + borrow.amount;
        } else {
          const repayD = new Date(borrow.borrowedFrom + 'T00:00:00Z');
          repayD.setDate(repayD.getDate() + 1);
          const repayStr = repayD.toISOString().slice(0, 10);
          if (dateParam === repayStr) effectiveDailyRestMin = Math.max(0, baseDailyRest - borrow.amount);
        }
      }
      const effectiveDailyRestSec = effectiveDailyRestMin * 60;

      // Weekly rest limit (seconds)
      const weeklyRestLimitMin = config.weeklyRestQuota ?? (baseDailyRest * 7);
      const weeklyRestLimitSec = weeklyRestLimitMin * 60;

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
      const restLockedByDay    = effectiveDailyRestSec > 0 && restSeconds    >= effectiveDailyRestSec;
      const restLockedByWeek   = weeklyRestLimitSec    > 0 && weekRestSeconds >= weeklyRestLimitSec;

      return json({
        onlineLocked:       dailyOnlineQuota      > 0 && onlineSeconds      >= dailyOnlineQuota,
        studyLocked:        dailyStudyQuota       > 0 && studySeconds       >= dailyStudyQuota,
        restLocked:         restLockedByDay || restLockedByWeek,
        weeklyRestLocked:   restLockedByWeek,
        undeterminedLocked: dailyUndeterminedQuota > 0 && undeterminedSeconds >= dailyUndeterminedQuota,
        onlineSeconds, studySeconds, undeterminedSeconds, restSeconds,
        weekRestSeconds, weeklyRestLimitSec,
        quotaBorrow: borrow,
      });
    }

    return json({ error: 'Not found' }, 404);
  },
};

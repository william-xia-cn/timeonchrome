// Profiles 路由 - 孩子 Profile CRUD
import { json, Env, verifyAccountToken } from '../db/middleware';
import { siteAccessDefaults, mergeWithDefaults } from '../config/site-access-defaults';

// 默认配置（与 background.js DEFAULT_CONFIG 保持一致）

// ── Schema defaults：仅用于 merge / repair / 缺字段补齐 ──
// 不得包含推荐网站名单，网站列表始终为 []
function buildSchemaDefaults(): object {
  return {
    version: '1.3',
    mode: 'study',
    enabled: true,
    studyList: [],
    compositeList: [],
    unsafeList: [],
    restrictedEntertainmentList: [],
    dailyOnlineQuota:       1200,
    dailyStudyQuota:         480,
    dailyRestQuota:          120,
    dailyUndeterminedQuota:  120,
    weeklyRestQuota:        null,
    domainQuotas: {},
    classificationRules: [],
    quotaState: { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false },
    schedule: {
      enabled: false,
      days: {
        0: { enabled: true, start: '08:00', end: '21:00' },
        1: { enabled: true, start: '15:00', end: '21:00' },
        2: { enabled: true, start: '15:00', end: '21:00' },
        3: { enabled: true, start: '15:00', end: '21:00' },
        4: { enabled: true, start: '15:00', end: '21:00' },
        5: { enabled: true, start: '15:00', end: '21:00' },
        6: { enabled: true, start: '08:00', end: '21:00' },
      },
    },
    timeQuota: {
      daily: {
        monday:    { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
        tuesday:   { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
        wednesday: { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
        thursday:  { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
        friday:    { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
        saturday:  { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
        sunday:    { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
      },
    },
    timeWindows: {
      studyWindows: null,
      restWindows: [],
      onlineWindows: null,
    },
    restConfig:         { reminderInterval: 15, maxRestDuration: 60 },
    autoStudyConfig:    { enabled: true, requiredSeconds: 60 },
  };
}

// 当 timeQuota 中所有天的某个字段值完全一致且为有限值时，同步对应的 legacy 字段
// 如果七天值不一致，不修改 legacy 字段，避免 lossy conversion
function syncLegacyQuota(config: Record<string, unknown>): void {
  const daily = (config.timeQuota as any)?.daily;
  if (!daily) return;
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  const allSameFinite = (field: string): number | null => {
    let val: number | undefined = undefined;
    for (const day of days) {
      const v = daily[day]?.[field];
      if (v === null || v === undefined || typeof v !== 'number') return null;
      if (val === undefined) val = v;
      else if (val !== v) return null;
    }
    return val ?? null;
  };

  const studyMinutes = allSameFinite('studyMinutes');
  if (studyMinutes !== null) config.dailyStudyQuota = studyMinutes;

  const restMinutes = allSameFinite('restMinutes');
  if (restMinutes !== null) {
    config.dailyRestQuota = restMinutes;
    config.weeklyRestQuota = restMinutes * 7;
  }

  const compositeMinutes = allSameFinite('compositeMinutes');
  if (compositeMinutes !== null) config.dailyUndeterminedQuota = compositeMinutes;

  // 在线总额 = study + rest + composite，仅当三天都有限时才可计算
  const allOnlineSame = (): number | null => {
    let val: number | undefined = undefined;
    for (const day of days) {
      const d = daily[day];
      if (!d) return null;
      if (d.studyMinutes === null || d.restMinutes === null || d.compositeMinutes === null) return null;
      const dayOnline = (d.studyMinutes || 0) + (d.restMinutes || 0) + (d.compositeMinutes || 0);
      if (val === undefined) val = dayOnline;
      else if (val !== dayOnline) return null;
    }
    return val ?? null;
  };
  const onlineMinutes = allOnlineSame();
  if (onlineMinutes !== null) config.dailyOnlineQuota = onlineMinutes;
}

// ── Initial recommended config：仅用于新建 profile 一次性初始化 ──
// 包含推荐网站名单，不作为 merge/repair 的默认值
function buildDefaultConfig(): object {
  return {
    ...buildSchemaDefaults(),
    studyList: siteAccessDefaults.defaultStudySites,
    compositeList: [
      // 搜索引擎
      'google.com', 'google.com.hk', 'bing.com', 'baidu.com',
      'search.brave.com', 'duckduckgo.com',
      // 问答社区
      'stackexchange.com', 'reddit.com',
      // 视频/音乐
      'youtube.com', 'music.youtube.com', 'spotify.com', 'music.163.com',
      // 百科/参考
      'wikipedia.org', 'britannica.com', 'wolframalpha.com',
    ],
    restrictedEntertainmentList: siteAccessDefaults.defaultRestrictedEntertainmentSites,
    unsafeList: siteAccessDefaults.defaultBlockedSites,
  };
}

export const profilesRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url  = new URL(request.url);
    const path = url.pathname;

    const accountId = await verifyAccountToken(request, env.JWT_SECRET);
    if (!accountId) return json({ error: 'Unauthorized' }, 401);

    // GET /profiles
    if (request.method === 'GET' && path === '/profiles') {
      const result = await env.DB.prepare(
        `SELECT id, name, avatar_color, config, created_at, updated_at
         FROM profiles WHERE account_id = ?`
      ).bind(accountId).all<{
        id: string; name: string; avatar_color: string;
        config: string; created_at: number; updated_at: number;
      }>();

      const profiles = (result.results || []).map(row => ({
        id:           row.id,
        name:         row.name,
        avatar_color: row.avatar_color,
        config:       row.config ? JSON.parse(row.config) : null,
        created_at:   row.created_at,
        updated_at:   row.updated_at,
      }));

      return json({ profiles });
    }

    // POST /profiles
    if (request.method === 'POST' && path === '/profiles') {
      try {
        const { name, avatar_color } = await request.json<{ name: string; avatar_color?: string }>();
        const profileId   = crypto.randomUUID();
        const now         = Date.now();
        const avatarColor = avatar_color || '#7c6fff';
        const configStr   = JSON.stringify(buildDefaultConfig());

        await env.DB.prepare(
          `INSERT INTO profiles (id, account_id, name, avatar_color, config, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(profileId, accountId, name, avatarColor, configStr, now, now).run();

        return json({
          success: true,
          profile: {
            id:           profileId,
            name,
            avatar_color: avatarColor,
            config:       buildDefaultConfig(),
            created_at:   Math.floor(now / 1000),
            updated_at:   Math.floor(now / 1000),
          },
        });
      } catch (e: any) {
        return json({ error: 'Failed to create profile: ' + e.message }, 500);
      }
    }

    // ── 以下路由均需 profileId ──────────────────────────────────────────

    const configMatch      = path.match(/^\/profiles\/([^/]+)\/config$/);
    const defaultsMatch    = path.match(/^\/profiles\/([^/]+)\/defaults$/);
    const devicesMatch     = path.match(/^\/profiles\/([^/]+)\/devices$/);
    const deviceIdMatch    = path.match(/^\/profiles\/([^/]+)\/devices\/([^/]+)$/);
    const profileSelfMatch = path.match(/^\/profiles\/([^/]+)$/);

    // 抽取 profileId 并验证归属
    const profileId =
      configMatch?.[1] ?? defaultsMatch?.[1] ?? devicesMatch?.[1] ?? deviceIdMatch?.[1] ?? profileSelfMatch?.[1] ?? null;

    if (!profileId) return json({ error: 'Not found' }, 404);

    const owner = await env.DB.prepare(
      `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
    ).bind(profileId, accountId).first<{ id: string }>();

    if (!owner) return json({ error: 'Profile not found' }, 404);

    // GET /profiles/:id/config
    if (request.method === 'GET' && configMatch) {
      const row = await env.DB.prepare(
        `SELECT config, updated_at FROM profiles WHERE id = ?`
      ).bind(profileId).first<{ config: string; updated_at: number }>();

      const config = row?.config ? JSON.parse(row.config) : {};

      // 返回时包含 custom 字段（如已存在），不触发写 DB
      return json({
        data:       config,
        updated_at: row?.updated_at || 0,
        profile_id: profileId,
      });
    }

    // GET /profiles/:id/defaults — 返回系统缺省清单（只读）
    if (request.method === 'GET' && defaultsMatch) {
      return json({
        version: 1,
        defaultStudySites: siteAccessDefaults.defaultStudySites,
        defaultRestrictedEntertainmentSites: siteAccessDefaults.defaultRestrictedEntertainmentSites,
        defaultBlockedSites: siteAccessDefaults.defaultBlockedSites,
      });
    }

    // PUT /profiles/:id/config — 受控 merge 写入，防止残缺配置覆盖丢失字段
    if (request.method === 'PUT' && configMatch) {
      try {
        const { data } = await request.json<{ data: unknown }>();
        if (!data || typeof data !== 'object') {
          return json({ error: 'Invalid config data' }, 400);
        }

        const now = Date.now();

        // 1. 读取现有 config
        const existing = await env.DB.prepare(
          `SELECT config FROM profiles WHERE id = ?`
        ).bind(profileId).first<{ config: string }>();

        const existingConfig = existing?.config ? JSON.parse(existing.config) : {};

        // 2. 受控 merge：schema defaults → existing → incoming
        //    使用 buildSchemaDefaults() 而非 buildDefaultConfig()
        //    确保推荐网站名单不会在 merge 中被反复注入
        const mergedConfig: Record<string, unknown> = { ...buildSchemaDefaults(), ...existingConfig };

        // 白名单字段：只允许前端修改以下字段
        const ALLOWED_KEYS = new Set([
          'version', 'mode', 'enabled',
          'studyList', 'compositeList', 'unsafeList', 'restrictedEntertainmentList',
          'customStudyList', 'customRestrictedEntertainmentList', 'customBlockedSites',
          'dailyOnlineQuota', 'dailyStudyQuota', 'dailyRestQuota',
          'dailyUndeterminedQuota', 'weeklyRestQuota',
          'domainQuotas', 'classificationRules',
          'quotaState', 'schedule',
          'restConfig', 'autoStudyConfig',
          'timeQuota', 'timeWindows',
        ]);

        for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
          if (ALLOWED_KEYS.has(key)) {
            mergedConfig[key] = value;
          }
        }

        // 3. 懒迁移：旧 Profile 没有 custom 字段时，从 effective 反推
        if (!mergedConfig.customStudyList && Array.isArray(mergedConfig.studyList)) {
          const defaultSet = new Set(siteAccessDefaults.defaultStudySites.map(d => d.toLowerCase()));
          mergedConfig.customStudyList = (mergedConfig.studyList as string[]).filter(
            d => !defaultSet.has(d.toLowerCase())
          );
        }
        if (!mergedConfig.customRestrictedEntertainmentList && Array.isArray(mergedConfig.restrictedEntertainmentList)) {
          const defaultSet = new Set(siteAccessDefaults.defaultRestrictedEntertainmentSites.map(d => d.toLowerCase()));
          mergedConfig.customRestrictedEntertainmentList = (mergedConfig.restrictedEntertainmentList as string[]).filter(
            d => !defaultSet.has(d.toLowerCase())
          );
        }
        if (!mergedConfig.customBlockedSites && Array.isArray(mergedConfig.unsafeList)) {
          const defaultSet = new Set(siteAccessDefaults.defaultBlockedSites.map(d => d.toLowerCase()));
          mergedConfig.customBlockedSites = (mergedConfig.unsafeList as string[]).filter(
            d => !defaultSet.has(d.toLowerCase())
          );
        }

        // 4. 重新计算 effective 字段（defaults + custom）
        if (Array.isArray(mergedConfig.customStudyList)) {
          mergedConfig.studyList = mergeWithDefaults(
            mergedConfig.customStudyList as string[],
            siteAccessDefaults.defaultStudySites
          );
        }
        if (Array.isArray(mergedConfig.customRestrictedEntertainmentList)) {
          mergedConfig.restrictedEntertainmentList = mergeWithDefaults(
            mergedConfig.customRestrictedEntertainmentList as string[],
            siteAccessDefaults.defaultRestrictedEntertainmentSites
          );
        }
        if (Array.isArray(mergedConfig.customBlockedSites)) {
          mergedConfig.unsafeList = mergeWithDefaults(
            mergedConfig.customBlockedSites as string[],
            siteAccessDefaults.defaultBlockedSites
          );
        }

        // 5. 若提交了 timeQuota，尝试无损同步 legacy 配额字段（仅当七天完全一致时）
        syncLegacyQuota(mergedConfig);

        // 6. 保护运行时状态字段（不应被前端或默认值覆盖）
        const PROTECTED_KEYS = ['adminPasswordHash', 'isInitialized', 'lockedDomains', 'updatedAt'];
        for (const key of PROTECTED_KEYS) {
          if (existingConfig[key] !== undefined) {
            mergedConfig[key] = existingConfig[key];
          }
        }

        const configStr = JSON.stringify(mergedConfig);

        await env.DB.prepare(
          `UPDATE profiles SET config = ?, version = version + 1, updated_at = ? WHERE id = ?`
        ).bind(configStr, now, profileId).run();

        return json({ success: true, updated_at: now });
      } catch (e: any) {
        return json({ error: 'Failed to update config: ' + e.message }, 500);
      }
    }

    // GET /profiles/:id/devices
    if (request.method === 'GET' && devicesMatch) {
      // Try to include monitoring_enabled (added in migration 002); fall back if column missing
      let devices: any[] = [];
      try {
        const result = await env.DB.prepare(
          `SELECT id, device_name, last_seen, monitoring_enabled, created_at
           FROM devices WHERE profile_id = ? ORDER BY last_seen DESC`
        ).bind(profileId).all<{
          id: string; device_name: string; last_seen: number;
          monitoring_enabled: number; created_at: number;
        }>();
        devices = result.results || [];
      } catch (_) {
        // Fallback: column not yet migrated
        const result = await env.DB.prepare(
          `SELECT id, device_name, last_seen, created_at
           FROM devices WHERE profile_id = ? ORDER BY last_seen DESC`
        ).bind(profileId).all<{
          id: string; device_name: string; last_seen: number; created_at: number;
        }>();
        devices = (result.results || []).map(d => ({ ...d, monitoring_enabled: 1 }));
      }

      return json({ devices });
    }

    // PATCH /profiles/:id/devices/:deviceId - 重命名设备 或 切换监控
    if (request.method === 'PATCH' && deviceIdMatch) {
      const deviceId = deviceIdMatch[2];

      const dev = await env.DB.prepare(
        `SELECT id FROM devices WHERE id = ? AND profile_id = ?`
      ).bind(deviceId, profileId).first<{ id: string }>();

      if (!dev) return json({ error: 'Device not found' }, 404);

      try {
        const body = await request.json<{ name?: string; monitoring_enabled?: number }>();
        const updates: string[] = [];
        const bindings: unknown[] = [];

        if (body.name !== undefined) {
          const trimmed = body.name.trim().slice(0, 64);
          if (!trimmed) return json({ error: 'name cannot be empty' }, 400);
          updates.push('device_name = ?');
          bindings.push(trimmed);
        }
        if (body.monitoring_enabled !== undefined) {
          // Check column exists before adding to update (migration 002)
          try {
            await env.DB.prepare(`SELECT monitoring_enabled FROM devices LIMIT 1`).first();
            updates.push('monitoring_enabled = ?');
            bindings.push(body.monitoring_enabled ? 1 : 0);
          } catch (_) { /* column not yet migrated, skip */ }
        }

        if (updates.length === 0) return json({ error: 'name or monitoring_enabled required' }, 400);

        bindings.push(deviceId);
        await env.DB.prepare(
          `UPDATE devices SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...bindings).run();

        return json({ success: true });
      } catch (e: any) {
        return json({ error: 'Failed to update device: ' + e.message }, 500);
      }
    }

    // DELETE /profiles/:id/devices/:deviceId - 解绑设备
    if (request.method === 'DELETE' && deviceIdMatch) {
      const deviceId = deviceIdMatch[2];

      const dev = await env.DB.prepare(
        `SELECT id FROM devices WHERE id = ? AND profile_id = ?`
      ).bind(deviceId, profileId).first<{ id: string }>();

      if (!dev) return json({ error: 'Device not found' }, 404);

      await env.DB.prepare(
        `DELETE FROM devices WHERE id = ?`
      ).bind(deviceId).run();

      return json({ success: true });
    }

    // PATCH /profiles/:id - 编辑档案（名称、头像颜色）
    if (request.method === 'PATCH' && profileSelfMatch) {
      try {
        const { name, avatar_color } = await request.json<{ name?: string; avatar_color?: string }>();
        if (!name && !avatar_color) return json({ error: 'name or avatar_color required' }, 400);

        const updates: string[] = [];
        const bindings: unknown[] = [];

        if (name) {
          const trimmed = name.trim().slice(0, 50);
          if (!trimmed) return json({ error: 'name cannot be empty' }, 400);
          updates.push('name = ?');
          bindings.push(trimmed);
        }
        if (avatar_color) {
          updates.push('avatar_color = ?');
          bindings.push(avatar_color);
        }

        bindings.push(profileId);
        await env.DB.prepare(
          `UPDATE profiles SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...bindings).run();

        return json({ success: true });
      } catch (e: any) {
        return json({ error: 'Failed to update profile: ' + e.message }, 500);
      }
    }

    // DELETE /profiles/:id - 删除档案（级联删除设备、统计数据）
    if (request.method === 'DELETE' && profileSelfMatch) {
      try {
        // 1. 删除关联设备
        await env.DB.prepare(`DELETE FROM devices WHERE profile_id = ?`).bind(profileId).run();

        // 2. 删除统计数据
        await env.DB.prepare(`DELETE FROM stats WHERE profile_id = ?`).bind(profileId).run();

        // 3. 删除 R2 sessions（列出并批量删除）
        try {
          const listed = await env.SESSION_FILES.list({ prefix: `sessions/${profileId}/` });
          for (const obj of listed.objects) {
            await env.SESSION_FILES.delete(obj.key);
          }
        } catch (e) {
          // R2 删除失败不阻止整体操作
        }

        // 4. 删除 Profile 本身
        await env.DB.prepare(
          `DELETE FROM profiles WHERE id = ? AND account_id = ?`
        ).bind(profileId, accountId).run();

        return json({ success: true });
      } catch (e: any) {
        return json({ error: 'Failed to delete profile: ' + e.message }, 500);
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};

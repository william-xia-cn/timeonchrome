// Profiles 路由 - 孩子 Profile CRUD
import { json, Env, verifyAccountToken } from '../db/middleware';
import { applySystemAccessDefaultsToProfileConfig, getSystemAccessConfig, mergeWithDefaults, systemAccessDefaultsResponse, type SystemAccessConfig } from '../config/system-access-config';
import { validateSiteAccessConfig } from '../../../extension/core/site-classification.js';
import { buildEffectiveTimeQuota } from '../../../extension/core/quota-config.js';
import { nativeChildDeletedOutboxStatement } from '../services/nativeAppIdentityBridge';

type DeviceRecoveryActionBody = {
  action?: string;
  deviceId?: string;
  message?: string;
};

type ManagedDeviceMappingBody = {
  tenantId?: string;
  devicePolicyId?: string;
  deviceId?: string;
  status?: string;
};

type CreateDeviceBody = {
  device_name?: string;
  platform?: string;
  browser?: string;
};

function normalizeManagedPolicyId(value: unknown, max = 128): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().slice(0, max);
  if (!text || !/^[A-Za-z0-9._:-]+$/.test(text)) return null;
  return text;
}

function trimString(value: unknown, max = 128): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function normalizePlatform(value: unknown): string | null {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (/mac|darwin|os x/.test(raw)) return 'macos';
  if (/win/.test(raw)) return 'windows';
  if (/cros|chromeos/.test(raw)) return 'chromeos';
  if (/linux/.test(raw)) return 'linux';
  return raw.slice(0, 64);
}

function generateDeviceToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

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
    dailyOnlineQuota:        0,
    dailyStudyQuota:         0,
    dailyRestQuota:          120,
    dailyUndeterminedQuota:  60,
    weeklyRestQuota:        null,
    domainQuotas: {},
    classificationRules: [],
    siteClassificationRulesV1: [],
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
        monday:    { studyMinutes: null, restMinutes: 120, compositeMinutes: 120, onlineMinutes: null },
        tuesday:   { studyMinutes: null, restMinutes: 120, compositeMinutes: 120, onlineMinutes: null },
        wednesday: { studyMinutes: null, restMinutes: 120, compositeMinutes: 120, onlineMinutes: null },
        thursday:  { studyMinutes: null, restMinutes: 120, compositeMinutes: 120, onlineMinutes: null },
        friday:    { studyMinutes: null, restMinutes: 120, compositeMinutes: 120, onlineMinutes: null },
        saturday:  { studyMinutes: null, restMinutes: 120, compositeMinutes: 120, onlineMinutes: null },
        sunday:    { studyMinutes: null, restMinutes: 120, compositeMinutes: 120, onlineMinutes: null },
      },
      weekly: { restMinutes: null },
    },
    timeWindows: {
      daily: {
        monday:    { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
        tuesday:   { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
        wednesday: { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
        thursday:  { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
        friday:    { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
        saturday:  { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
        sunday:    { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
      },
    },
    restConfig:         { reminderInterval: 15, maxRestDuration: 60 },
    autoStudyConfig:    { enabled: true, requiredSeconds: 60 },
    clientLoggingPolicyV1: {
      localEnabled: true,
      localMinLevel: 'warning',
      uploadEnabled: false,
      uploadMinLevel: 'error',
      categories: [],
      uploadCategories: [],
      targetDeviceIds: [],
      sampleRate: 1,
      retentionDays: 7,
      expiresAt: null,
    },
  };
}

const SITE_ACCESS_CONFIG_KEYS = new Set([
  'studyList',
  'compositeList',
  'unsafeList',
  'restrictedEntertainmentList',
  'customStudyList',
  'customCompositeList',
  'customRestrictedEntertainmentList',
  'customBlockedSites',
  'classificationRules',
  'siteClassificationRulesV1',
]);

function normalizeWindowList(windows: any): any[] | null {
  if (!Array.isArray(windows) || windows.length === 0) return null;
  return windows;
}

// 计算单日的在线时段 = studyWindows ∪ compositeWindows ∪ restWindows 的并集
// 任一模式全天允许时，在线时段也显示为全天允许
function computeOnlineWindowsForDay(dayWindows: { studyWindows: any; compositeWindows?: any; restWindows: any }): any[] | null {
  const study = normalizeWindowList(dayWindows.studyWindows);
  const composite = normalizeWindowList(dayWindows.compositeWindows);
  const rest = normalizeWindowList(dayWindows.restWindows);

  if (study === null || composite === null || rest === null) {
    return null;
  }

  // 合并、排序、合并重叠区间
  const merged = [...study, ...composite, ...rest].sort((a: any, b: any) => a.start.localeCompare(b.start));
  const result: any[] = [];
  for (const w of merged) {
    if (result.length === 0 || w.start > result[result.length - 1].end) {
      result.push({ start: w.start, end: w.end });
    } else {
      // 有重叠，扩展当前区间
      result[result.length - 1].end = w.end > result[result.length - 1].end ? w.end : result[result.length - 1].end;
    }
  }
  return result;
}

// 为 config 中 daily 的每一天注入派生的 onlineWindows
// 不修改 source-of-truth，仅在内存中计算用于返回
function injectDerivedOnlineWindows(config: Record<string, unknown>): void {
  const daily = (config.timeWindows as any)?.daily;
  if (!daily) return;
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const day of days) {
    const dayCfg = daily[day];
    if (!dayCfg) continue;
    dayCfg.onlineWindows = computeOnlineWindowsForDay(dayCfg);
  }
}

function injectEffectiveTimeQuota(config: Record<string, unknown>): void {
  const effective = buildEffectiveTimeQuota(config as any);
  config.timeQuota = {
    ...((config.timeQuota as any) || {}),
    daily: effective.daily,
  };
}

// 将旧全局 timeWindows 懒迁移为 per-day 结构（内存中转换，不写入 DB）
function migrateLegacyTimeWindows(config: Record<string, unknown>): void {
  const tw = config.timeWindows as any;
  if (!tw) return;

  // 如果已有 daily 结构，无需迁移
  if (tw.daily) return;

  // 旧全局结构：{ studyWindows, compositeWindows?, restWindows, onlineWindows }
  const oldStudy = tw.studyWindows;
  const oldComposite = tw.compositeWindows;
  const oldRest = tw.restWindows;

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const daily: Record<string, any> = {};
  for (const day of days) {
    daily[day] = {
      studyWindows: oldStudy !== undefined ? oldStudy : null,
      compositeWindows: oldComposite !== undefined ? oldComposite : null,
      restWindows: oldRest !== undefined ? oldRest : [{ start: '15:30', end: '24:00' }],
    };
  }
  tw.daily = daily;
}

// 归一化空数组为 null（UI 清除所有窗口后应为 unrestricted）
function normalizeEmptyArraysToNull(config: Record<string, unknown>): void {
  const daily = (config.timeWindows as any)?.daily;
  if (!daily) return;
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const day of days) {
    const dayCfg = daily[day];
    if (!dayCfg) continue;
    if (Array.isArray(dayCfg.studyWindows) && dayCfg.studyWindows.length === 0) {
      dayCfg.studyWindows = null;
    }
    if (Array.isArray(dayCfg.compositeWindows) && dayCfg.compositeWindows.length === 0) {
      dayCfg.compositeWindows = null;
    }
    if (Array.isArray(dayCfg.restWindows) && dayCfg.restWindows.length === 0) {
      dayCfg.restWindows = null;
    }
  }
}

// 校验时间窗口合法性（后端校验兜底）
function validateTimeWindows(config: Record<string, unknown>): string | null {
  const daily = (config.timeWindows as any)?.daily;
  if (!daily) return null;
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const day of days) {
    const dayCfg = daily[day];
    if (!dayCfg) continue;
    for (const type of ['studyWindows', 'compositeWindows', 'restWindows'] as const) {
      const arr = dayCfg[type];
      if (!Array.isArray(arr)) continue;
      for (const w of arr) {
        if (!w.start || !w.end) return `${day} ${type} 缺少 start/end`;
        if (w.start >= w.end) return `${day} ${type} 开始时间必须早于结束时间`;
        if (w.start === '24:00') return `${day} ${type} 24:00 不能作为开始时间`;
      }
    }
  }
  return null;
}

function validateTimeQuota(config: Record<string, unknown>): string | null {
  const timeQuota = config.timeQuota as any;
  if (timeQuota === undefined) return null;
  if (!timeQuota || typeof timeQuota !== 'object' || Array.isArray(timeQuota)) return 'timeQuota 必须是对象';

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dailyFields = ['studyMinutes', 'restMinutes', 'compositeMinutes', 'onlineMinutes'];
  const validMinutes = (value: unknown, max: number) =>
    value === null || (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0 && value <= max);

  if (timeQuota.daily !== undefined) {
    if (!timeQuota.daily || typeof timeQuota.daily !== 'object' || Array.isArray(timeQuota.daily)) return 'timeQuota.daily 必须是对象';
    for (const day of days) {
      const dayConfig = timeQuota.daily[day];
      if (dayConfig === undefined) continue;
      if (!dayConfig || typeof dayConfig !== 'object' || Array.isArray(dayConfig)) return `${day} 配额必须是对象`;
      for (const field of dailyFields) {
        if (Object.prototype.hasOwnProperty.call(dayConfig, field) && !validMinutes(dayConfig[field], 24 * 60)) {
          return `${day}.${field} 必须是 null 或 0-1440 的整数分钟`;
        }
      }
    }
  }

  if (timeQuota.weekly !== undefined) {
    if (!timeQuota.weekly || typeof timeQuota.weekly !== 'object' || Array.isArray(timeQuota.weekly)) return 'timeQuota.weekly 必须是对象';
    if (Object.prototype.hasOwnProperty.call(timeQuota.weekly, 'restMinutes') && !validMinutes(timeQuota.weekly.restMinutes, 7 * 24 * 60)) {
      return 'weekly.restMinutes 必须是 null 或 0-10080 的整数分钟';
    }
  }
  return null;
}

// 当 timeQuota 中所有天的某个字段值完全一致且为有限值时，同步对应的 daily legacy 字段。
// weeklyRestQuota 不再由每日配额派生。
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
  if (restMinutes !== null) config.dailyRestQuota = restMinutes;

  const compositeMinutes = allSameFinite('compositeMinutes');
  if (compositeMinutes !== null) config.dailyUndeterminedQuota = compositeMinutes;

  const onlineMinutes = allSameFinite('onlineMinutes');
  if (onlineMinutes !== null) config.dailyOnlineQuota = onlineMinutes;

  const weekly = (config.timeQuota as any)?.weekly;
  if (weekly && Object.prototype.hasOwnProperty.call(weekly, 'restMinutes')) {
    const weeklyRest = weekly.restMinutes;
    config.weeklyRestQuota = typeof weeklyRest === 'number' && weeklyRest > 0 ? weeklyRest : 0;
  }
}

// ── Initial config：新建 profile 仅写用户自定义 source lists ──
// 系统网站默认清单由 system_access_config_v1 作为运行时 source 加载
function buildDefaultConfig(siteAccessDefaults: SystemAccessConfig): object {
  const customStudyList = [
    'keystoneacademy.cn',
    'powerschool.keystoneacademy.cn',
    'managebac.cn',
    'reach.cloud',
    'schoolsbuddy.cn',
    'afficienta.com',
  ];
  const customCompositeList: string[] = [];
  const compositeSystemDefaults = mergeWithDefaults(siteAccessDefaults.defaultUserCompositeSites || [], siteAccessDefaults.defaultCompositeSites);
  return {
    ...buildSchemaDefaults(),
    studyList: mergeWithDefaults(customStudyList, siteAccessDefaults.defaultStudySites),
    compositeList: mergeWithDefaults(customCompositeList, compositeSystemDefaults),
    restrictedEntertainmentList: siteAccessDefaults.defaultRestrictedEntertainmentSites,
    unsafeList: siteAccessDefaults.defaultBlockedSites,
    customStudyList,
    customCompositeList,
    customRestrictedEntertainmentList: [],
    customBlockedSites: [],
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
        const siteAccessDefaults = await getSystemAccessConfig(env);
        const defaultConfig = buildDefaultConfig(siteAccessDefaults);
        const configStr   = JSON.stringify(defaultConfig);

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
            config:       defaultConfig,
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
    const deviceTokenActionMatch = path.match(/^\/profiles\/([^/]+)\/devices\/([^/]+)\/token\/(export|reset)$/);
    const recoveryRequestsMatch = path.match(/^\/profiles\/([^/]+)\/device-recovery-requests\/v1$/);
    const recoveryRequestIdMatch = path.match(/^\/profiles\/([^/]+)\/device-recovery-requests\/v1\/([^/]+)$/);
    const managedMappingsMatch = path.match(/^\/profiles\/([^/]+)\/managed-device-mappings\/v1$/);
    const profileSelfMatch = path.match(/^\/profiles\/([^/]+)$/);

    // 抽取 profileId 并验证归属
    const profileId =
      configMatch?.[1] ?? defaultsMatch?.[1] ?? devicesMatch?.[1] ?? deviceIdMatch?.[1] ?? deviceTokenActionMatch?.[1] ??
      recoveryRequestsMatch?.[1] ?? recoveryRequestIdMatch?.[1] ?? managedMappingsMatch?.[1] ?? profileSelfMatch?.[1] ?? null;

    if (!profileId) return json({ error: 'Not found' }, 404);

    const owner = await env.DB.prepare(
      `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
    ).bind(profileId, accountId).first<{ id: string }>();

    if (!owner) return json({ error: 'Profile not found' }, 404);

    // GET/PUT /profiles/:id/managed-device-mappings/v1
    if (managedMappingsMatch) {
      if (request.method === 'GET') {
        const rows = await env.DB.prepare(
          `SELECT m.id, m.tenant_id, m.device_policy_id, m.profile_id, m.device_id, m.status,
                  m.created_at, m.updated_at, m.last_recovered_at, d.device_name, d.last_seen
           FROM managed_device_mappings_v1 m
           LEFT JOIN devices d ON d.id = m.device_id
           WHERE m.profile_id = ?
           ORDER BY m.updated_at DESC`
        ).bind(profileId).all();
        return json({ managedDeviceMappings: rows.results || [] });
      }

      if (request.method === 'PUT') {
        const body = await request.json<ManagedDeviceMappingBody>().catch(() => ({} as ManagedDeviceMappingBody));
        const tenantId = normalizeManagedPolicyId(body.tenantId);
        const devicePolicyId = normalizeManagedPolicyId(body.devicePolicyId);
        const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
        const status = body.status === 'disabled' ? 'disabled' : 'active';
        if (!tenantId || !devicePolicyId || !deviceId) {
          return json({ error: 'tenantId, devicePolicyId and deviceId required', code: 'MANAGED_MAPPING_INVALID' }, 400);
        }
        const dev = await env.DB.prepare(
          `SELECT id FROM devices WHERE id = ? AND profile_id = ? AND COALESCE(status, 'bound') = 'bound'`
        ).bind(deviceId, profileId).first<{ id: string }>();
        if (!dev) return json({ error: 'Device not found or unbound', code: 'MANAGED_MAPPING_DEVICE_NOT_FOUND' }, 404);
        const now = Date.now();
        const existing = await env.DB.prepare(
          `SELECT id FROM managed_device_mappings_v1 WHERE tenant_id = ? AND device_policy_id = ?`
        ).bind(tenantId, devicePolicyId).first<{ id: string }>();
        if (existing) {
          await env.DB.prepare(
            `UPDATE managed_device_mappings_v1
             SET profile_id = ?, device_id = ?, status = ?, updated_at = ?
             WHERE id = ?`
          ).bind(profileId, deviceId, status, now, existing.id).run();
          return json({ success: true, id: existing.id, updated: true });
        }
        const id = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO managed_device_mappings_v1 (
            id, tenant_id, device_policy_id, profile_id, device_id, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(id, tenantId, devicePolicyId, profileId, deviceId, status, now, now).run();
        return json({ success: true, id, created: true });
      }

      return json({ error: 'Method not allowed' }, 405);
    }
    // GET /profiles/:id/device-recovery-requests/v1
    if (request.method === 'GET' && recoveryRequestsMatch) {
      const rows = await env.DB.prepare(
        `SELECT r.id, r.profile_id, r.platform, r.browser, r.extension_version, r.device_name_hint,
                r.candidate_device_id, r.candidate_count, r.status, r.message, r.created_at,
                r.updated_at, r.decided_at, r.result_device_id, d.device_name AS candidate_device_name,
                d.last_seen AS candidate_last_seen, rd.device_name AS result_device_name
         FROM device_recovery_requests_v1 r
         LEFT JOIN devices d ON d.id = r.candidate_device_id
         LEFT JOIN devices rd ON rd.id = r.result_device_id
         WHERE r.profile_id = ?
         ORDER BY r.created_at DESC
         LIMIT 50`
      ).bind(profileId).all();
      return json({ recoveryRequests: rows.results || [] });
    }

    // PATCH /profiles/:id/device-recovery-requests/v1/:requestId
    if (request.method === 'PATCH' && recoveryRequestIdMatch) {
      const requestId = recoveryRequestIdMatch[2];
      const body = await request.json<DeviceRecoveryActionBody>().catch(() => ({} as DeviceRecoveryActionBody));
      const action = String(body.action || '').trim();
      const now = Date.now();

      const recovery = await env.DB.prepare(
        `SELECT id, status, candidate_device_id FROM device_recovery_requests_v1 WHERE id = ? AND profile_id = ?`
      ).bind(requestId, profileId).first<{ id: string; status: string; candidate_device_id?: string }>();
      if (!recovery) return json({ error: 'Recovery request not found' }, 404);
      if (recovery.status !== 'pending') return json({ error: 'Recovery request is not pending', code: 'RECOVERY_REQUEST_NOT_PENDING' }, 409);

      if (action === 'approve') {
        const deviceId = body.deviceId || recovery.candidate_device_id;
        if (!deviceId) return json({ error: 'deviceId required' }, 400);
        const dev = await env.DB.prepare(
          `SELECT id FROM devices WHERE id = ? AND profile_id = ? AND COALESCE(status, 'bound') = 'bound'`
        ).bind(deviceId, profileId).first<{ id: string }>();
        if (!dev) return json({ error: 'Device not found or unbound' }, 404);
        await env.DB.prepare(
          `UPDATE device_recovery_requests_v1
           SET status = 'approved', result_device_id = ?, result_profile_id = ?, message = ?, updated_at = ?, decided_at = ?
           WHERE id = ?`
        ).bind(deviceId, profileId, body.message || null, now, now, requestId).run();
        return json({ success: true, status: 'approved' });
      }

      if (action === 'create_new') {
        await env.DB.prepare(
          `UPDATE device_recovery_requests_v1
           SET status = 'approved_new', result_profile_id = ?, message = ?, updated_at = ?, decided_at = ?
           WHERE id = ?`
        ).bind(profileId, body.message || null, now, now, requestId).run();
        return json({ success: true, status: 'approved_new' });
      }

      if (action === 'ignore' || action === 'reject') {
        await env.DB.prepare(
          `UPDATE device_recovery_requests_v1
           SET status = 'ignored', message = ?, updated_at = ?, decided_at = ?
           WHERE id = ?`
        ).bind(body.message || null, now, now, requestId).run();
        return json({ success: true, status: 'ignored' });
      }

      return json({ error: 'Unsupported recovery action', code: 'UNSUPPORTED_RECOVERY_ACTION' }, 400);
    }

    // GET /profiles/:id/config
    if (request.method === 'GET' && configMatch) {
      const row = await env.DB.prepare(
        `SELECT config, updated_at FROM profiles WHERE id = ?`
      ).bind(profileId).first<{ config: string; updated_at: number }>();

      const siteAccessDefaults = await getSystemAccessConfig(env);
      const config = applySystemAccessDefaultsToProfileConfig(row?.config ? JSON.parse(row.config) : {}, siteAccessDefaults);

      // 懒迁移：旧全局 timeWindows → per-day 结构（内存中，不写入 DB）
      migrateLegacyTimeWindows(config);

      // 注入派生的 onlineWindows（只读，不写入 DB）
      injectDerivedOnlineWindows(config);

      // 注入有效 timeQuota（日配额主读模型，只读，不写入 DB）
      injectEffectiveTimeQuota(config);

      // 返回时包含 custom 字段（如已存在），不触发写 DB
      return json({
        data:       config,
        updated_at: row?.updated_at || 0,
        profile_id: profileId,
      });
    }

    // GET /profiles/:id/defaults — 返回系统配置清单（只读）
    if (request.method === 'GET' && defaultsMatch) {
      const siteAccessDefaults = await getSystemAccessConfig(env);
      return json(systemAccessDefaultsResponse(siteAccessDefaults));
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
        const siteAccessDefaults = await getSystemAccessConfig(env);
        const compositeSystemDefaults = mergeWithDefaults(siteAccessDefaults.defaultUserCompositeSites || [], siteAccessDefaults.defaultCompositeSites);
        const mergedConfig: Record<string, unknown> = { ...buildSchemaDefaults(), ...existingConfig };

        // 白名单字段：只允许前端修改以下字段
        const ALLOWED_KEYS = new Set([
          'version', 'mode', 'enabled',
          'studyList', 'compositeList', 'unsafeList', 'restrictedEntertainmentList',
          'customStudyList', 'customCompositeList', 'customRestrictedEntertainmentList', 'customBlockedSites',
          'dailyOnlineQuota', 'dailyStudyQuota', 'dailyRestQuota',
          'dailyUndeterminedQuota', 'weeklyRestQuota',
          'domainQuotas', 'classificationRules', 'siteClassificationRulesV1',
          'quotaState', 'schedule',
          'restConfig', 'autoStudyConfig',
          'clientLoggingPolicyV1',
          'timeQuota', 'timeWindows',
        ]);

        const incomingConfig = data as Record<string, unknown>;
        const shouldValidateSiteAccess = Object.keys(incomingConfig).some((key) => SITE_ACCESS_CONFIG_KEYS.has(key));
        const incomingQuotaValidationError = validateTimeQuota(incomingConfig);
        if (incomingQuotaValidationError) {
          return json({ error: 'Invalid timeQuota: ' + incomingQuotaValidationError }, 400);
        }

        for (const [key, value] of Object.entries(incomingConfig)) {
          if (ALLOWED_KEYS.has(key)) {
            if (key === 'timeQuota' && value && typeof value === 'object' && !Array.isArray(value)) {
              const currentQuota = (mergedConfig.timeQuota as any) || {};
              const incomingQuota = value as any;
              mergedConfig.timeQuota = {
                ...currentQuota,
                ...incomingQuota,
                daily: incomingQuota.daily === undefined
                  ? currentQuota.daily
                  : { ...(currentQuota.daily || {}), ...(incomingQuota.daily || {}) },
                weekly: incomingQuota.weekly === undefined
                  ? currentQuota.weekly
                  : { ...(currentQuota.weekly || {}), ...(incomingQuota.weekly || {}) },
              };
            } else {
              mergedConfig[key] = value;
            }
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
        if (!mergedConfig.customCompositeList && Array.isArray(mergedConfig.compositeList)) {
          const defaultSet = new Set(compositeSystemDefaults.map(d => d.toLowerCase()));
          mergedConfig.customCompositeList = (mergedConfig.compositeList as string[]).filter(
            d => !defaultSet.has(d.toLowerCase())
          );
        }

        // 4. 重新计算 effective 字段（系统配置 + 家长自定义）
        if (Array.isArray(mergedConfig.customStudyList)) {
          mergedConfig.studyList = mergeWithDefaults(
            mergedConfig.customStudyList as string[],
            siteAccessDefaults.defaultStudySites
          );
        }
        if (Array.isArray(mergedConfig.customCompositeList)) {
          mergedConfig.compositeList = mergeWithDefaults(
            mergedConfig.customCompositeList as string[],
            compositeSystemDefaults
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

        // 6. 归一化空数组为 null（UI 清除后恢复 unrestricted）
        normalizeEmptyArraysToNull(mergedConfig);

        // 7. 校验时间配额和时间窗口合法性
        const quotaValidationError = validateTimeQuota(mergedConfig);
        if (quotaValidationError) {
          return json({ error: 'Invalid timeQuota: ' + quotaValidationError }, 400);
        }
        const validationError = validateTimeWindows(mergedConfig);
        if (validationError) {
          return json({ error: 'Invalid timeWindows: ' + validationError }, 400);
        }

        if (shouldValidateSiteAccess) {
          const siteAccessValidation = validateSiteAccessConfig(mergedConfig);
          if (!siteAccessValidation.ok) {
            return json({
              error: 'SITE_ACCESS_CONFLICT',
              message: '同一网站不能同时出现在不同归类中',
              conflicts: siteAccessValidation.conflicts,
            }, 400);
          }
        }

        // 8. 清理派生字段，不持久化 source-of-truth
        //    onlineWindows 由 GET 时重新计算注入
        const daily = (mergedConfig.timeWindows as any)?.daily;
        if (daily) {
          const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
          for (const day of days) {
            if (daily[day]?.onlineWindows !== undefined) {
              delete daily[day].onlineWindows;
            }
          }
        }

        // 9. 保护运行时状态字段（不应被前端或默认值覆盖）
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

    // POST /profiles/:id/devices - 云端主动创建受管或预绑定设备
    if (request.method === 'POST' && devicesMatch) {
      const body = await request.json<CreateDeviceBody>().catch(() => ({} as CreateDeviceBody));
      const deviceId = crypto.randomUUID();
      const deviceToken = generateDeviceToken();
      const now = Date.now();
      const deviceName = trimString(body.device_name, 64) || 'Managed Chrome Extension';
      const platform = normalizePlatform(body.platform);
      const browser = trimString(body.browser, 64) || 'Chrome';
      await env.DB.prepare(
        `INSERT INTO devices (id, profile_id, device_token, device_name, last_seen, created_at, platform, browser, recovery_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(deviceId, profileId, deviceToken, deviceName, now, now, platform, browser, 'cloud_created').run();
      return json({
        success: true,
        profile_id: profileId,
        device_id: deviceId,
        device_token: deviceToken,
        device: {
          id: deviceId,
          profile_id: profileId,
          device_name: deviceName,
          platform,
          browser,
          created_at: now,
          status: 'bound',
        },
      });
    }
    // GET /profiles/:id/devices
    if (request.method === 'GET' && devicesMatch) {
      // Try to include monitoring_enabled (added in migration 002); fall back if column missing
      let devices: any[] = [];
      try {
        const result = await env.DB.prepare(
          `SELECT id, device_name, last_seen, monitoring_enabled, created_at, status, unbound_at,
                  platform, browser, identity_linked_at, last_recovered_at, recovery_status,
                  CASE WHEN chrome_identity_hash IS NOT NULL AND chrome_identity_hash != '' THEN 1 ELSE 0 END AS chrome_identity_linked
           FROM devices WHERE profile_id = ? AND COALESCE(status, 'bound') = 'bound' ORDER BY last_seen DESC`
        ).bind(profileId).all<{
          id: string; device_name: string; last_seen: number;
          monitoring_enabled: number; created_at: number; status?: string; unbound_at?: number;
          platform?: string; browser?: string; identity_linked_at?: number; last_recovered_at?: number; recovery_status?: string; chrome_identity_linked?: number;
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

    // POST /profiles/:id/devices/:deviceId/token/export|reset
    if (request.method === 'POST' && deviceTokenActionMatch) {
      const deviceId = deviceTokenActionMatch[2];
      const action = deviceTokenActionMatch[3];
      const dev = await env.DB.prepare(
        `SELECT id, profile_id, device_token, device_name, status FROM devices WHERE id = ? AND profile_id = ?`
      ).bind(deviceId, profileId).first<{ id: string; profile_id: string; device_token: string; device_name?: string; status?: string }>();
      if (!dev) return json({ error: 'Device not found', code: 'DEVICE_NOT_FOUND' }, 404);
      if ((dev.status || 'bound') === 'unbound') {
        return json({ error: 'Device is unbound; create a new device or bind again before exporting token', code: 'DEVICE_UNBOUND' }, 409);
      }

      let deviceToken = dev.device_token;
      if (action === 'reset') {
        deviceToken = generateDeviceToken();
        await env.DB.prepare(
          `UPDATE devices SET device_token = ?, recovery_status = ?, last_recovered_at = ? WHERE id = ? AND profile_id = ?`
        ).bind(deviceToken, 'token_reset', Date.now(), deviceId, profileId).run();
      }

      return json({
        success: true,
        action,
        profile_id: profileId,
        device_id: deviceId,
        device_name: dev.device_name || null,
        device_token: deviceToken,
      });
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
        `UPDATE devices SET status = 'unbound', unbound_at = ? WHERE id = ?`
      ).bind(Date.now(), deviceId).run();

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

        const updatedProfile = await env.DB.prepare(
          `SELECT id, name, avatar_color, config, created_at, updated_at
           FROM profiles WHERE id = ?`
        ).bind(profileId).first<{
          id: string; name: string; avatar_color: string;
          config: string; created_at: number; updated_at: number;
        }>();

        return json({
          success: true,
          profile: {
            id:           updatedProfile.id,
            name:         updatedProfile.name,
            avatar_color: updatedProfile.avatar_color,
            config:       updatedProfile.config ? JSON.parse(updatedProfile.config) : null,
            created_at:   updatedProfile.created_at,
            updated_at:   updatedProfile.updated_at,
          },
        });
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
        await env.DB.batch([
          env.DB.prepare(`DELETE FROM profiles WHERE id = ? AND account_id = ?`).bind(profileId, accountId),
          nativeChildDeletedOutboxStatement(env, accountId, profileId),
        ]);

        return json({ success: true });
      } catch (e: any) {
        return json({ error: 'Failed to delete profile: ' + e.message }, 500);
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};

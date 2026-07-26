import { json, Env, verifyAccountToken } from '../db/middleware';
import { validateSiteAccessConfig } from '../../../extension/core/site-classification.js';
import { getSystemAccessConfig, mergeWithDefaults, type SystemAccessConfig } from '../config/system-access-config';

type RestoreMode = 'merge' | 'replace';

type RestoreTableDef = {
  id: string;
  path: string;
  table: string;
  columns: string[];
  jsonColumns?: Record<string, string>;
  restoreByDefault?: boolean;
};

const RESTORE_SCHEMA_VERSION = 1;
const PREFLIGHT_TTL_SECONDS = 30 * 60;

const RESTORE_TABLES: RestoreTableDef[] = [
  {
    id: 'usage-segments',
    path: 'ledgers/usage-segments.jsonl',
    table: 'usage_segments_v1',
    columns: [
      'id', 'profile_id', 'device_id', 'date', 'timezone', 'day_start_ms', 'day_end_ms',
      'start_ms', 'end_ms', 'duration_seconds', 'domain', 'channel', 'mode', 'tab_id',
      'window_id', 'source_state', 'settlement_reason', 'parent_segment_id', 'part_index',
      'part_count', 'created_at', 'updated_at', 'uploaded_at', 'description_json',
      'managed_target_id', 'managed_target_type', 'managed_target_namespace',
      'managed_target_value', 'managed_target_label_at_time', 'target_source_at_time',
      'target_rule_id', 'target_match_level', 'target_classification_at_time',
      'quota_bucket_at_time',
    ],
    jsonColumns: { description_json: 'description' },
    restoreByDefault: true,
  },
  {
    id: 'media-segments',
    path: 'ledgers/media-segments.jsonl',
    table: 'media_segments_v1',
    columns: [
      'id', 'profile_id', 'device_id', 'date', 'timezone', 'day_start_ms', 'day_end_ms',
      'start_ms', 'end_ms', 'duration_seconds', 'domain', 'tab_id', 'window_id',
      'media_class', 'media_kind', 'visibility', 'mode', 'settlement_reason',
      'parent_segment_id', 'part_index', 'part_count', 'created_at', 'updated_at',
      'uploaded_at', 'description_json',
    ],
    jsonColumns: { description_json: 'description' },
    restoreByDefault: true,
  },
  {
    id: 'stats',
    path: 'stats/stats.jsonl',
    table: 'stats_v1',
    columns: [
      'id', 'profile_id', 'device_id', 'date', 'timezone', 'day_start_ms', 'day_end_ms',
      'domain', 'channel', 'mode', 'duration_seconds', 'first_seen_at', 'last_seen_at',
      'created_at', 'updated_at',
    ],
    restoreByDefault: true,
  },
  {
    id: 'hourly-stats',
    path: 'stats/hourly-stats.jsonl',
    table: 'hourly_stats_v1',
    columns: [
      'id', 'profile_id', 'device_id', 'hour_key', 'date', 'hour', 'timezone',
      'hour_start_ms', 'hour_end_ms', 'domain', 'channel', 'mode', 'duration_seconds',
      'segments_count', 'last_segment_id', 'first_seen_at', 'last_seen_at', 'created_at',
      'updated_at',
    ],
    restoreByDefault: true,
  },
  {
    id: 'target-stats',
    path: 'stats/target-stats.jsonl',
    table: 'target_stats_v1',
    columns: [
      'id', 'profile_id', 'device_id', 'date', 'timezone', 'day_start_ms', 'day_end_ms',
      'target_key', 'managed_target_id', 'managed_target_type', 'managed_target_namespace',
      'managed_target_value', 'managed_target_label_at_time', 'target_source_at_time',
      'target_rule_id', 'target_match_level', 'target_classification_at_time',
      'fallback_domain', 'is_fallback', 'channel', 'mode', 'quota_bucket',
      'duration_seconds', 'segments_count', 'last_segment_id', 'first_seen_at',
      'last_seen_at', 'created_at', 'updated_at',
    ],
    restoreByDefault: true,
  },
  {
    id: 'hourly-target-stats',
    path: 'stats/hourly-target-stats.jsonl',
    table: 'hourly_target_stats_v1',
    columns: [
      'id', 'profile_id', 'device_id', 'hour_key', 'date', 'hour', 'timezone',
      'hour_start_ms', 'hour_end_ms', 'target_key', 'managed_target_id',
      'managed_target_type', 'managed_target_namespace', 'managed_target_value',
      'managed_target_label_at_time', 'target_source_at_time', 'target_rule_id',
      'target_match_level', 'target_classification_at_time', 'fallback_domain',
      'is_fallback', 'channel', 'mode', 'quota_bucket', 'duration_seconds',
      'segments_count', 'last_segment_id', 'first_seen_at', 'last_seen_at',
      'created_at', 'updated_at',
    ],
    restoreByDefault: true,
  },
  {
    id: 'media-stats',
    path: 'stats/media-stats.jsonl',
    table: 'daily_media_stats_v1',
    columns: [
      'id', 'profile_id', 'device_id', 'date', 'timezone', 'day_start_ms', 'day_end_ms',
      'domain', 'media_class', 'mode', 'duration_seconds', 'first_seen_at',
      'last_seen_at', 'created_at', 'updated_at',
    ],
    restoreByDefault: true,
  },
  {
    id: 'hourly-media-stats',
    path: 'stats/hourly-media-stats.jsonl',
    table: 'hourly_media_stats_v1',
    columns: [
      'id', 'profile_id', 'device_id', 'hour_key', 'date', 'hour', 'timezone',
      'hour_start_ms', 'hour_end_ms', 'domain', 'media_class', 'mode',
      'duration_seconds', 'segments_count', 'last_segment_id', 'first_seen_at',
      'last_seen_at', 'created_at', 'updated_at',
    ],
    restoreByDefault: true,
  },
  {
    id: 'site-classification-requests',
    path: 'reviews/site-classification-requests.jsonl',
    table: 'site_classification_requests_v1',
    columns: [
      'id', 'profile_id', 'device_id', 'client_request_id', 'requested_target_type',
      'requested_raw_input', 'requested_normalized_value', 'requested_host',
      'display_value', 'status', 'decision', 'decision_target_type',
      'decision_normalized_value', 'requested_at', 'decided_at', 'created_at',
      'updated_at',
    ],
    restoreByDefault: true,
  },
  {
    id: 'composite-sessions',
    path: 'reviews/composite-sessions.jsonl',
    table: 'composite_sessions',
    columns: [
      'id', 'profile_id', 'device_id', 'domain', 'title', 'date', 'start_time',
      'duration', 'classification', 'classified_by', 'classified_at',
    ],
    restoreByDefault: true,
  },
  {
    id: 'session-appeals',
    path: 'reviews/session-appeals.jsonl',
    table: 'session_appeals',
    columns: [
      'id', 'session_id', 'profile_id', 'reason', 'status', 'original_classification',
      'new_classification', 'created_at', 'resolved_at',
    ],
    restoreByDefault: true,
  },
  {
    id: 'client-logs',
    path: 'logs/client-logs.jsonl',
    table: 'client_logs_v1',
    columns: [
      'id', 'profile_id', 'device_id', 'timestamp', 'level', 'category',
      'event_code', 'message', 'binding_state', 'extension_version', 'domain',
      'module', 'details_json', 'uploaded_at', 'created_at',
    ],
    jsonColumns: { details_json: 'details' },
    restoreByDefault: false,
  },
];

const RESTORE_TABLE_BY_PATH = new Map(RESTORE_TABLES.map((def) => [def.path, def]));

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
}

function parseJsonMaybe(value: unknown, fallback: any) {
  if (typeof value !== 'string') return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function parseJsonl(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line));
}

function rowsForPath(files: Record<string, unknown>, path: string): any[] {
  const value = files[path];
  if (value === undefined || value === null) return [];
  if (path.endsWith('.jsonl')) return parseJsonl(value);
  const parsed = parseJsonMaybe(value, null);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') return [parsed];
  return [];
}

function normalizeConfigFromEditable(config: Record<string, any>, editable: any): Record<string, any> {
  if (!editable || typeof editable !== 'object') return config;
  const next = { ...config };
  if (Array.isArray(editable.studySites)) next.customStudyList = editable.studySites;
  if (Array.isArray(editable.compositeSites)) next.customCompositeList = editable.compositeSites;
  if (Array.isArray(editable.restrictedEntertainmentSites)) next.customRestrictedEntertainmentList = editable.restrictedEntertainmentSites;
  if (Array.isArray(editable.blockedSites)) next.customBlockedSites = editable.blockedSites;
  const ruleFrom = (entry: any, decision: string) => {
    const raw = entry?.rule && typeof entry.rule === 'object' ? entry.rule : {};
    const rawType = raw.targetType || raw.decisionTargetType || entry?.type || 'url';
    return {
      ...raw,
      decision,
      targetType: rawType === 'host' ? 'host' : 'url',
      normalizedValue: raw.normalizedValue || raw.decisionNormalizedValue || entry?.value || '',
    };
  };
  const rules = [
    ...(Array.isArray(editable.studyRules) ? editable.studyRules.map((entry: any) => ruleFrom(entry, 'study')) : []),
    ...(Array.isArray(editable.compositeRules) ? editable.compositeRules.map((entry: any) => ruleFrom(entry, 'composite')) : []),
    ...(Array.isArray(editable.rejectedRules) ? editable.rejectedRules.map((entry: any) => ruleFrom(entry, 'reject')) : []),
  ].filter((rule) => rule.targetType && rule.normalizedValue);
  if (rules.length) next.siteClassificationRulesV1 = rules;
  return next;
}

const RESTORE_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function countList(value: unknown): number {
  return stringList(value).length;
}

function summarizeRestoredConfig(config: Record<string, any>) {
  const dailyQuota = config.timeQuota?.daily || {};
  const dailyWindows = config.timeWindows?.daily || {};
  return {
    customStudyListCount: countList(config.customStudyList),
    customCompositeListCount: countList(config.customCompositeList),
    customRestrictedEntertainmentListCount: countList(config.customRestrictedEntertainmentList),
    customBlockedSitesCount: countList(config.customBlockedSites),
    siteClassificationRulesV1Count: Array.isArray(config.siteClassificationRulesV1) ? config.siteClassificationRulesV1.length : 0,
    dailyRestQuota: config.dailyRestQuota ?? null,
    dailyUndeterminedQuota: config.dailyUndeterminedQuota ?? null,
    compositeMinutes: Object.fromEntries(RESTORE_DAYS.map((day) => [day, dailyQuota?.[day]?.compositeMinutes ?? null])),
    restWindows: Object.fromEntries(RESTORE_DAYS.map((day) => [day, dailyWindows?.[day]?.restWindows ?? null])),
  };
}

function normalizeEmptyTimeWindowArrays(config: Record<string, any>): void {
  const daily = config.timeWindows?.daily;
  if (!daily) return;
  for (const day of RESTORE_DAYS) {
    const dayCfg = daily[day];
    if (!dayCfg) continue;
    for (const key of ['studyWindows', 'compositeWindows', 'restWindows']) {
      if (Array.isArray(dayCfg[key]) && dayCfg[key].length === 0) dayCfg[key] = null;
    }
    if (dayCfg.onlineWindows !== undefined) delete dayCfg.onlineWindows;
  }
}

function validateRestoredTimeWindows(config: Record<string, any>): string | null {
  const daily = config.timeWindows?.daily;
  if (!daily) return null;
  for (const day of RESTORE_DAYS) {
    const dayCfg = daily[day];
    if (!dayCfg) continue;
    for (const type of ['studyWindows', 'compositeWindows', 'restWindows']) {
      const windows = dayCfg[type];
      if (!Array.isArray(windows)) continue;
      for (const window of windows) {
        if (!window?.start || !window?.end) return day + ' ' + type + ' 缺少 start/end';
        if (window.start >= window.end) return day + ' ' + type + ' 开始时间必须早于结束时间';
        if (window.start === '24:00') return day + ' ' + type + ' 24:00 不能作为开始时间';
      }
    }
  }
  return null;
}

function allSameFiniteQuota(daily: Record<string, any>, field: string): number | null {
  let value: number | undefined;
  for (const day of RESTORE_DAYS) {
    const next = daily?.[day]?.[field];
    if (next === null || next === undefined || typeof next !== 'number') return null;
    if (value === undefined) value = next;
    else if (value !== next) return null;
  }
  return value ?? null;
}

function syncRestoredLegacyQuota(config: Record<string, any>): void {
  const daily = config.timeQuota?.daily;
  if (!daily) return;
  const studyMinutes = allSameFiniteQuota(daily, 'studyMinutes');
  if (studyMinutes !== null) config.dailyStudyQuota = studyMinutes;
  const restMinutes = allSameFiniteQuota(daily, 'restMinutes');
  if (restMinutes !== null) {
    config.dailyRestQuota = restMinutes;
    config.weeklyRestQuota = restMinutes * 7;
  }
  const compositeMinutes = allSameFiniteQuota(daily, 'compositeMinutes');
  if (compositeMinutes !== null) config.dailyUndeterminedQuota = compositeMinutes;
}

function normalizeRestoredProfileConfig(config: Record<string, any>, siteAccessDefaults: SystemAccessConfig): void {
  if (Array.isArray(config.customStudyList)) {
    config.studyList = mergeWithDefaults(config.customStudyList, siteAccessDefaults.defaultStudySites);
  }
  if (Array.isArray(config.customCompositeList)) {
    config.compositeList = mergeWithDefaults(config.customCompositeList, siteAccessDefaults.defaultCompositeSites);
  }
  if (Array.isArray(config.customRestrictedEntertainmentList)) {
    config.restrictedEntertainmentList = mergeWithDefaults(
      config.customRestrictedEntertainmentList,
      siteAccessDefaults.defaultRestrictedEntertainmentSites
    );
  }
  if (Array.isArray(config.customBlockedSites)) {
    config.unsafeList = mergeWithDefaults(config.customBlockedSites, siteAccessDefaults.defaultBlockedSites);
  }
  syncRestoredLegacyQuota(config);
  normalizeEmptyTimeWindowArrays(config);
}


function valueForColumn(row: Record<string, any>, column: string, profileId: string, def: RestoreTableDef): unknown {
  if (column === 'profile_id') return profileId;
  const camel = snakeToCamel(column);
  if (def.jsonColumns?.[column]) {
    const jsonValue = row[def.jsonColumns[column]] ?? row[camel] ?? row[column];
    return jsonValue === undefined || jsonValue === null ? null : JSON.stringify(jsonValue);
  }
  return row[camel] ?? row[column] ?? null;
}

async function verifyProfile(env: Env, request: Request, profileId: string) {
  const accountId = await verifyAccountToken(request, env.JWT_SECRET);
  if (!accountId) return null;
  return await env.DB.prepare(
    `SELECT id, account_id, name, avatar_color, config, changelog, created_at, updated_at
     FROM profiles WHERE id = ? AND account_id = ?`
  ).bind(profileId, accountId).first<any>();
}

function selectedTableDefs(datasetIds: string[] | undefined, includeLogs: boolean): RestoreTableDef[] {
  const allow = new Set(Array.isArray(datasetIds) ? datasetIds.filter(Boolean) : []);
  return RESTORE_TABLES.filter((def) => {
    if (!def.restoreByDefault && !includeLogs) return false;
    return allow.size === 0 || allow.has(def.id);
  });
}

async function countExistingIds(env: Env, def: RestoreTableDef, profileId: string, ids: string[]): Promise<number> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return 0;
  let count = 0;
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const placeholders = batch.map(() => '?').join(',');
    const result = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM ${def.table} WHERE profile_id = ? AND id IN (${placeholders})`
    ).bind(profileId, ...batch).first<{ cnt: number }>();
    count += Number(result?.cnt || 0);
  }
  return count;
}

async function buildPreflight(env: Env, profile: any, body: any) {
  const manifest = body?.manifest;
  const files = body?.files && typeof body.files === 'object' ? body.files : {};
  const includeLogs = !!body?.includeLogs;
  const selectedDatasets = Array.isArray(body?.datasetIds) ? body.datasetIds : undefined;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!manifest || typeof manifest !== 'object') errors.push('manifest is required');
  if (manifest?.schemaVersion !== RESTORE_SCHEMA_VERSION) warnings.push(`备份 schemaVersion=${manifest?.schemaVersion || 'unknown'}，当前支持 ${RESTORE_SCHEMA_VERSION}`);

  const configRows = rowsForPath(files, 'config/config.json');
  const editableRows = rowsForPath(files, 'config/site-access-editable.json');
  const existingConfig = profile.config ? JSON.parse(profile.config) : {};
  const backupConfig = normalizeConfigFromEditable(configRows[0] || {}, editableRows[0]);
  const siteAccessDefaults = await getSystemAccessConfig(env);
  normalizeRestoredProfileConfig(backupConfig, siteAccessDefaults);
  const siteValidation = validateSiteAccessConfig(backupConfig);
  if (!siteValidation.ok) errors.push('网站规则存在跨分类冲突');
  const timeWindowsValidation = validateRestoredTimeWindows(backupConfig);
  if (timeWindowsValidation) errors.push('时间段配置无效：' + timeWindowsValidation);

  const tables = [];
  for (const def of selectedTableDefs(selectedDatasets, includeLogs)) {
    const rows = rowsForPath(files, def.path);
    const ids = rows.map((row) => row?.id).filter(Boolean);
    const existing = await countExistingIds(env, def, profile.id, ids);
    tables.push({
      id: def.id,
      path: def.path,
      table: def.table,
      rows: rows.length,
      existing,
      insertable: Math.max(0, rows.length - existing),
      skipped: existing,
      restoreByDefault: !!def.restoreByDefault,
    });
  }

  return {
    ok: errors.length === 0,
    schemaCompatible: errors.length === 0,
    errors,
    warnings,
    profile: {
      current: { id: profile.id, name: profile.name },
      backup: manifest?.profile || null,
    },
    config: {
      present: !!configRows[0],
      siteAccessEditablePresent: !!editableRows[0],
      siteAccessConflicts: siteValidation.ok ? [] : siteValidation.conflicts,
      backupSummary: summarizeRestoredConfig(backupConfig),
      currentSummary: summarizeRestoredConfig(existingConfig),
    },
    devices: {
      backupRows: rowsForPath(files, 'devices/devices.json').length,
      note: '设备记录只作为数据归属和显示参考，不恢复 device token。',
    },
    tables,
    requiresReplaceConfirmation: true,
  };
}

async function applyConfigRestore(env: Env, profile: any, files: Record<string, unknown>, mode: RestoreMode) {
  const configRows = rowsForPath(files, 'config/config.json');
  const editableRows = rowsForPath(files, 'config/site-access-editable.json');
  const configPresent = !!configRows[0];
  const siteAccessEditablePresent = !!editableRows[0];
  if (!configPresent && !siteAccessEditablePresent) {
    return { updated: false, changed: false, verified: false, configPresent, siteAccessEditablePresent, reason: 'NO_CONFIG_FILES' };
  }
  const existingConfig = profile.config ? JSON.parse(profile.config) : {};
  const beforeSummary = summarizeRestoredConfig(existingConfig);
  const backupConfig = normalizeConfigFromEditable(configRows[0] || {}, editableRows[0]);
  const siteAccessDefaults = await getSystemAccessConfig(env);
  normalizeRestoredProfileConfig(backupConfig, siteAccessDefaults);
  const nextConfig = mode === 'replace'
    ? backupConfig
    : {
      ...existingConfig,
      ...backupConfig,
      customStudyList: backupConfig.customStudyList || existingConfig.customStudyList || [],
      customCompositeList: backupConfig.customCompositeList || existingConfig.customCompositeList || [],
      customRestrictedEntertainmentList: backupConfig.customRestrictedEntertainmentList || existingConfig.customRestrictedEntertainmentList || [],
      customBlockedSites: backupConfig.customBlockedSites || existingConfig.customBlockedSites || [],
      siteClassificationRulesV1: backupConfig.siteClassificationRulesV1 || existingConfig.siteClassificationRulesV1 || [],
    };
  normalizeRestoredProfileConfig(nextConfig, siteAccessDefaults);
  const validation = validateSiteAccessConfig(nextConfig);
  if (!validation.ok) {
    return { updated: false, changed: false, verified: false, configPresent, siteAccessEditablePresent, error: 'SITE_ACCESS_CONFLICT', conflicts: validation.conflicts };
  }
  const timeWindowsValidation = validateRestoredTimeWindows(nextConfig);
  if (timeWindowsValidation) {
    return { updated: false, changed: false, verified: false, configPresent, siteAccessEditablePresent, error: 'INVALID_TIME_WINDOWS', message: timeWindowsValidation };
  }
  const nextConfigString = JSON.stringify(nextConfig);
  const existingConfigString = JSON.stringify(existingConfig);
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE profiles SET config = ?, version = version + 1, updated_at = ? WHERE id = ?`
  ).bind(nextConfigString, now, profile.id).run();
  const row = await env.DB.prepare(
    `SELECT config FROM profiles WHERE id = ?`
  ).bind(profile.id).first<{ config: string }>();
  const verified = row?.config === nextConfigString;
  return {
    updated: true,
    changed: nextConfigString !== existingConfigString,
    verified,
    configPresent,
    siteAccessEditablePresent,
    beforeSummary,
    backupSummary: summarizeRestoredConfig(backupConfig),
    afterSummary: summarizeRestoredConfig(nextConfig),
  };
}


async function restoreRows(env: Env, def: RestoreTableDef, profileId: string, files: Record<string, unknown>, mode: RestoreMode) {
  const rows = rowsForPath(files, def.path);
  if (rows.length === 0) return { id: def.id, rows: 0, inserted: 0, skipped: 0 };
  const placeholders = def.columns.map(() => '?').join(', ');
  const insertSql = `${mode === 'replace' ? 'INSERT OR REPLACE' : 'INSERT OR IGNORE'} INTO ${def.table} (${def.columns.join(', ')}) VALUES (${placeholders})`;
  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    const result = await env.DB.prepare(insertSql)
      .bind(...def.columns.map((column) => valueForColumn(row, column, profileId, def)))
      .run();
    if ((result.meta as any)?.changes > 0) inserted += 1;
    else skipped += 1;
  }
  return { id: def.id, rows: rows.length, inserted, skipped };
}

async function clearRestoreTables(env: Env, profileId: string, defs: RestoreTableDef[]) {
  const requested = new Set(defs.map((def) => def.table));
  const deleteOrder = [
    'client_logs_v1',
    'session_appeals',
    'composite_sessions',
    'site_classification_requests_v1',
    'hourly_target_stats_v1',
    'target_stats_v1',
    'hourly_media_stats_v1',
    'daily_media_stats_v1',
    'hourly_stats_v1',
    'stats_v1',
    'media_segments_v1',
    'usage_segments_v1',
  ];
  for (const table of deleteOrder) {
    if (requested.has(table)) {
      const sql = 'DELETE FROM ' + table + ' WHERE profile_id = ?';
      await env.DB.prepare(sql).bind(profileId).run();
    }
  }
}

function restoreLogEntry(mode: RestoreMode, summary: any) {
  return {
    at: Date.now(),
    type: 'cloud_restore_v1',
    mode,
    summary,
  };
}

export const restoreRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const preflightMatch = url.pathname.match(/^\/profiles\/([^/]+)\/restore\/v1\/preflight$/);
    const commitMatch = url.pathname.match(/^\/profiles\/([^/]+)\/restore\/v1\/commit$/);
    if (request.method !== 'POST' || (!preflightMatch && !commitMatch)) return json({ error: 'Not found' }, 404);

    const profileId = (preflightMatch || commitMatch)![1];
    const profile = await verifyProfile(env, request, profileId);
    if (!profile) return json({ error: 'Profile not found' }, 404);

    const body = await request.json<any>();
    if (preflightMatch) {
      const preflight = await buildPreflight(env, profile, body);
      const preflightId = crypto.randomUUID();
      await env.CONFIG_CACHE.put(`restore-preflight:${profileId}:${preflightId}`, JSON.stringify({ body, preflight }), { expirationTtl: PREFLIGHT_TTL_SECONDS });
      return json({ ...preflight, preflightId, expiresInSeconds: PREFLIGHT_TTL_SECONDS });
    }

    const preflightId = body?.preflightId;
    if (!preflightId) return json({ error: 'preflightId required' }, 400);
    const cachedRaw = await env.CONFIG_CACHE.get(`restore-preflight:${profileId}:${preflightId}`);
    if (!cachedRaw) return json({ error: 'preflight expired or not found' }, 400);
    const cached = JSON.parse(cachedRaw);
    if (!cached?.preflight?.ok) return json({ error: 'preflight has blocking errors', preflight: cached?.preflight }, 400);

    const restoreMode: RestoreMode = body?.restoreMode === 'replace' ? 'replace' : 'merge';
    if (restoreMode === 'replace') {
      if (body?.confirmProfileId !== profileId || body?.confirmText !== 'RESTORE') {
        return json({ error: 'replace restore requires confirmProfileId and confirmText=RESTORE' }, 400);
      }
    }

    const restoreBody = cached.body || {};
    const files = restoreBody.files && typeof restoreBody.files === 'object' ? restoreBody.files : {};
    const includeLogs = !!restoreBody.includeLogs;
    const selectedDatasets = Array.isArray(restoreBody.datasetIds) ? restoreBody.datasetIds : undefined;

    const configResult = await applyConfigRestore(env, profile, files, restoreMode);
    if ((configResult as any).error) return json({ error: (configResult as any).error, conflicts: (configResult as any).conflicts }, 400);

    const results = [];
    const defs = selectedTableDefs(selectedDatasets, includeLogs);
    if (restoreMode === 'replace') {
      await clearRestoreTables(env, profileId, defs);
    }
    for (const def of defs) {
      results.push(await restoreRows(env, def, profileId, files, restoreMode));
    }

    const existingChangelog = profile.changelog ? JSON.parse(profile.changelog) : [];
    const logEntry = restoreLogEntry(restoreMode, { config: configResult, tables: results });
    await env.DB.prepare(
      `UPDATE profiles SET changelog = ?, updated_at = ? WHERE id = ?`
    ).bind(JSON.stringify([logEntry, ...(Array.isArray(existingChangelog) ? existingChangelog : [])].slice(0, 200)), Date.now(), profileId).run();
    await env.CONFIG_CACHE.delete(`restore-preflight:${profileId}:${preflightId}`);

    return json({ ok: true, restoreMode, config: configResult, tables: results });
  },
};

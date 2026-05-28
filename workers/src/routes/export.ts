import { json, Env, verifyAccountToken } from '../db/middleware';
import { siteAccessDefaults } from '../config/site-access-defaults';
import { normalizeSiteClassificationTarget } from '../../../extension/core/site-classification.js';

type DatasetDef = {
  id: string;
  category: string;
  path: string;
  format: 'json' | 'jsonl';
  table?: string;
  select?: string;
  dateColumn?: string;
  timestampColumn?: string;
  deviceColumn?: string;
  order: string[];
  legacy?: boolean;
};

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

const DATASETS: DatasetDef[] = [
  { id: 'profile', category: 'config', path: 'config/profile.json', format: 'json', order: [] },
  { id: 'config', category: 'config', path: 'config/config.json', format: 'json', order: [] },
  { id: 'defaults', category: 'config', path: 'config/defaults.json', format: 'json', order: [] },
  { id: 'site-access-editable', category: 'config', path: 'config/site-access-editable.json', format: 'json', order: [] },
  {
    id: 'devices', category: 'devices', path: 'devices/devices.json', format: 'json',
    table: 'devices',
    select: 'id, profile_id, device_name, monitoring_enabled, last_seen, created_at',
    deviceColumn: 'id',
    order: ['last_seen DESC', 'id DESC'],
  },
  { id: 'changelog', category: 'logs', path: 'logs/changelog.json', format: 'json', order: [] },
  {
    id: 'client-logs', category: 'logs', path: 'logs/client-logs.jsonl', format: 'jsonl',
    table: 'client_logs_v1',
    select: 'id, profile_id, device_id, timestamp, level, category, event_code, message, binding_state, extension_version, domain, module, details_json, uploaded_at, created_at',
    timestampColumn: 'timestamp',
    deviceColumn: 'device_id',
    order: ['timestamp DESC', 'id DESC'],
  },
  {
    id: 'usage-segments', category: 'ledgers', path: 'ledgers/usage-segments.jsonl', format: 'jsonl',
    table: 'usage_segments_v1',
    select: 'id, profile_id, device_id, date, timezone, day_start_ms, day_end_ms, start_ms, end_ms, duration_seconds, domain, channel, mode, tab_id, window_id, source_state, settlement_reason, parent_segment_id, part_index, part_count, created_at, updated_at, uploaded_at, description_json, managed_target_id, managed_target_type, managed_target_namespace, managed_target_value, managed_target_label_at_time, target_source_at_time, target_rule_id, target_match_level, target_classification_at_time, quota_bucket_at_time',
    dateColumn: 'date',
    deviceColumn: 'device_id',
    order: ['start_ms DESC', 'id DESC'],
  },
  {
    id: 'media-segments', category: 'media', path: 'ledgers/media-segments.jsonl', format: 'jsonl',
    table: 'media_segments_v1',
    select: 'id, profile_id, device_id, date, timezone, day_start_ms, day_end_ms, start_ms, end_ms, duration_seconds, domain, tab_id, window_id, media_class, media_kind, visibility, mode, settlement_reason, parent_segment_id, part_index, part_count, created_at, updated_at, uploaded_at, description_json',
    dateColumn: 'date',
    deviceColumn: 'device_id',
    order: ['start_ms DESC', 'id DESC'],
  },
  {
    id: 'stats', category: 'stats', path: 'stats/stats.jsonl', format: 'jsonl',
    table: 'stats_v1',
    select: 'id, profile_id, device_id, date, timezone, day_start_ms, day_end_ms, domain, channel, mode, duration_seconds, first_seen_at, last_seen_at, created_at, updated_at',
    dateColumn: 'date',
    deviceColumn: 'device_id',
    order: ['date DESC', 'domain ASC', 'channel ASC', 'mode ASC', 'id DESC'],
  },
  {
    id: 'hourly-stats', category: 'stats', path: 'stats/hourly-stats.jsonl', format: 'jsonl',
    table: 'hourly_stats_v1',
    select: 'id, profile_id, device_id, hour_key, date, hour, timezone, hour_start_ms, hour_end_ms, domain, channel, mode, duration_seconds, segments_count, last_segment_id, first_seen_at, last_seen_at, created_at, updated_at',
    dateColumn: 'date',
    deviceColumn: 'device_id',
    order: ['hour_key DESC', 'domain ASC', 'channel ASC', 'mode ASC', 'id DESC'],
  },
  {
    id: 'target-stats', category: 'stats', path: 'stats/target-stats.jsonl', format: 'jsonl',
    table: 'target_stats_v1',
    select: 'id, profile_id, device_id, date, timezone, day_start_ms, day_end_ms, target_key, managed_target_id, managed_target_type, managed_target_namespace, managed_target_value, managed_target_label_at_time, target_source_at_time, target_rule_id, target_match_level, target_classification_at_time, fallback_domain, is_fallback, channel, mode, quota_bucket, duration_seconds, segments_count, last_segment_id, first_seen_at, last_seen_at, created_at, updated_at',
    dateColumn: 'date',
    deviceColumn: 'device_id',
    order: ['date DESC', 'target_key ASC', 'channel ASC', 'mode ASC', 'quota_bucket ASC', 'id DESC'],
  },
  {
    id: 'hourly-target-stats', category: 'stats', path: 'stats/hourly-target-stats.jsonl', format: 'jsonl',
    table: 'hourly_target_stats_v1',
    select: 'id, profile_id, device_id, hour_key, date, hour, timezone, hour_start_ms, hour_end_ms, target_key, managed_target_id, managed_target_type, managed_target_namespace, managed_target_value, managed_target_label_at_time, target_source_at_time, target_rule_id, target_match_level, target_classification_at_time, fallback_domain, is_fallback, channel, mode, quota_bucket, duration_seconds, segments_count, last_segment_id, first_seen_at, last_seen_at, created_at, updated_at',
    dateColumn: 'date',
    deviceColumn: 'device_id',
    order: ['hour_key DESC', 'target_key ASC', 'channel ASC', 'mode ASC', 'quota_bucket ASC', 'id DESC'],
  },
  {
    id: 'media-stats', category: 'media', path: 'stats/media-stats.jsonl', format: 'jsonl',
    table: 'daily_media_stats_v1',
    select: 'id, profile_id, device_id, date, timezone, day_start_ms, day_end_ms, domain, media_class, mode, duration_seconds, first_seen_at, last_seen_at, created_at, updated_at',
    dateColumn: 'date',
    deviceColumn: 'device_id',
    order: ['date DESC', 'domain ASC', 'media_class ASC', 'mode ASC', 'id DESC'],
  },
  {
    id: 'hourly-media-stats', category: 'media', path: 'stats/hourly-media-stats.jsonl', format: 'jsonl',
    table: 'hourly_media_stats_v1',
    select: 'id, profile_id, device_id, hour_key, date, hour, timezone, hour_start_ms, hour_end_ms, domain, media_class, mode, duration_seconds, segments_count, last_segment_id, first_seen_at, last_seen_at, created_at, updated_at',
    dateColumn: 'date',
    deviceColumn: 'device_id',
    order: ['hour_key DESC', 'domain ASC', 'media_class ASC', 'mode ASC', 'id DESC'],
  },
  {
    id: 'site-classification-requests', category: 'reviews', path: 'reviews/site-classification-requests.jsonl', format: 'jsonl',
    table: 'site_classification_requests_v1',
    select: 'id, profile_id, device_id, client_request_id, requested_target_type, requested_raw_input, requested_normalized_value, requested_host, display_value, status, decision, decision_target_type, decision_normalized_value, requested_at, decided_at, created_at, updated_at',
    timestampColumn: 'requested_at',
    deviceColumn: 'device_id',
    order: ['requested_at DESC', 'id DESC'],
  },
  {
    id: 'composite-sessions', category: 'reviews', path: 'reviews/composite-sessions.jsonl', format: 'jsonl',
    table: 'composite_sessions',
    select: 'id, profile_id, device_id, domain, title, date, start_time, duration, classification, classified_by, classified_at',
    dateColumn: 'date',
    deviceColumn: 'device_id',
    order: ['start_time DESC', 'id DESC'],
  },
  {
    id: 'session-appeals', category: 'reviews', path: 'reviews/session-appeals.jsonl', format: 'jsonl',
    table: 'session_appeals',
    select: 'id, session_id, profile_id, reason, status, original_classification, new_classification, created_at, resolved_at',
    timestampColumn: 'created_at',
    order: ['created_at DESC', 'id DESC'],
  },
  {
    id: 'legacy-stats', category: 'stats', path: 'stats/legacy-stats.jsonl', format: 'jsonl',
    table: 'stats',
    select: 'id, profile_id, date, domain, duration, created_at',
    dateColumn: 'date',
    order: ['date DESC', 'domain ASC', 'id DESC'],
    legacy: true,
  },
  { id: 'stats-reconciliation', category: 'diagnostics', path: 'diagnostics/stats-reconciliation.jsonl', format: 'jsonl', order: [] },
];

const DATASET_BY_ID = new Map(DATASETS.map((dataset) => [dataset.id, dataset]));

function isDateKey(value: string | null): boolean {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function dayStartMs(date: string): number {
  return new Date(`${date}T00:00:00+08:00`).getTime();
}

function dayEndMs(date: string): number {
  return new Date(`${date}T23:59:59.999+08:00`).getTime();
}

function encodeCursor(values: unknown[]): string {
  return btoa(JSON.stringify(values)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeCursor(value: string | null): unknown[] | null {
  if (!value) return null;
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')));
    return Array.isArray(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function selectedDatasets(categoriesParam: string | null): DatasetDef[] {
  const categories = new Set(String(categoriesParam || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean));
  return categories.size
    ? DATASETS.filter((dataset) => categories.has(dataset.category))
    : DATASETS;
}

async function verifyProfile(env: Env, request: Request, profileId: string) {
  const accountId = await verifyAccountToken(request, env.JWT_SECRET);
  if (!accountId) return null;
  return await env.DB.prepare(
    `SELECT id, name, avatar_color, config, changelog, created_at, updated_at
     FROM profiles WHERE id = ? AND account_id = ?`
  ).bind(profileId, accountId).first<any>();
}

async function verifyProfileDevice(env: Env, profileId: string, deviceId: string | null): Promise<boolean> {
  if (!deviceId) return true;
  const row = await env.DB.prepare(
    `SELECT id FROM devices WHERE id = ? AND profile_id = ?`
  ).bind(deviceId, profileId).first<{ id: string }>();
  return !!row;
}

function normalizeRow(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row || {})) {
    const camel = key.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
    if (key.endsWith('_json') && typeof value === 'string') {
      try {
        out[camel.replace(/Json$/, '')] = JSON.parse(value);
      } catch {
        out[camel.replace(/Json$/, '')] = null;
      }
    } else {
      out[camel] = value;
    }
  }
  return out;
}

function cursorCondition(order: string[], cursor: unknown[] | null): { sql: string; binds: unknown[] } | null {
  if (!cursor || cursor.length < order.length) return null;
  const columns = order.map((part) => {
    const [column, direction = 'ASC'] = part.split(/\s+/);
    return { column, direction: direction.toUpperCase() };
  });
  const disjuncts: string[] = [];
  const binds: unknown[] = [];
  for (let i = 0; i < columns.length; i++) {
    const prefix = columns.slice(0, i).map((col) => `${col.column} = ?`).join(' AND ');
    const op = columns[i].direction === 'DESC' ? '<' : '>';
    disjuncts.push(`${prefix ? `${prefix} AND ` : ''}${columns[i].column} ${op} ?`);
    binds.push(...cursor.slice(0, i), cursor[i]);
  }
  return { sql: `(${disjuncts.join(' OR ')})`, binds };
}

async function exportTableDataset(env: Env, dataset: DatasetDef, profileId: string, url: URL) {
  const limit = parseLimit(url.searchParams.get('limit'));
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const deviceId = url.searchParams.get('deviceId');
  const cursor = decodeCursor(url.searchParams.get('cursor'));
  if ((from && !isDateKey(from)) || (to && !isDateKey(to))) return json({ error: 'from/to must be YYYY-MM-DD' }, 400);
  if (url.searchParams.get('cursor') && !cursor) return json({ error: 'invalid cursor' }, 400);
  if (deviceId && dataset.deviceColumn && !(await verifyProfileDevice(env, profileId, deviceId))) return json({ error: 'Device not found' }, 404);

  const where = ['profile_id = ?'];
  const binds: unknown[] = [profileId];
  if (dataset.dateColumn && from) { where.push(`${dataset.dateColumn} >= ?`); binds.push(from); }
  if (dataset.dateColumn && to) { where.push(`${dataset.dateColumn} <= ?`); binds.push(to); }
  if (dataset.timestampColumn && from) { where.push(`${dataset.timestampColumn} >= ?`); binds.push(dayStartMs(from)); }
  if (dataset.timestampColumn && to) { where.push(`${dataset.timestampColumn} <= ?`); binds.push(dayEndMs(to)); }
  if (dataset.deviceColumn && deviceId) { where.push(`${dataset.deviceColumn} = ?`); binds.push(deviceId); }
  const cursorPart = cursorCondition(dataset.order, cursor);
  if (cursorPart) {
    where.push(cursorPart.sql);
    binds.push(...cursorPart.binds);
  }

  const orderSql = dataset.order.join(', ');
  const result = await env.DB.prepare(
    `SELECT ${dataset.select} FROM ${dataset.table}
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderSql}
     LIMIT ?`
  ).bind(...binds, limit + 1).all<any>();
  const rows = result.results || [];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const cursorValues = last ? dataset.order.map((part) => {
    const column = part.split(/\s+/)[0];
    return last[column];
  }) : [];
  return json({
    dataset: dataset.id,
    rows: page.map(normalizeRow),
    hasMore: rows.length > limit,
    nextCursor: rows.length > limit ? encodeCursor(cursorValues) : null,
  });
}

function editableRuleType(rule: any): string {
  const targetType = rule.targetType || rule.decisionTargetType || 'url';
  const value = editableRuleValue(rule);
  if (targetType === 'host') return String(value).split('.').length > 2 ? 'subdomain' : 'domain';
  if (/^https:\/\/www\.youtube\.com\/playlist\?list=/i.test(value)) return 'youtube_playlist';
  if (/^https:\/\/www\.youtube\.com\/watch\?v=/i.test(value)) return 'youtube_video';
  return 'url';
}

function editableRuleValue(rule: any): string {
  const value = rule.normalizedValue || rule.decisionNormalizedValue || rule.targetValue || rule.requestedNormalizedValue || '';
  const normalized = normalizeSiteClassificationTarget(value);
  return normalized.ok && normalized.targetType === 'url' ? normalized.normalizedValue : value;
}

function siteAccessEditableFromConfig(config: any, requests: any[] = []) {
  const rules = Array.isArray(config?.siteClassificationRulesV1) ? config.siteClassificationRulesV1 : [];
  const byDecision = (decision: string) => rules
    .filter((rule: any) => rule?.decision === decision)
    .map((rule: any) => ({
      type: rule.targetType || rule.decisionTargetType || 'url',
      displayType: editableRuleType(rule),
      value: editableRuleValue(rule),
      label: rule.label || rule.displayValue || editableRuleValue(rule),
      source: rule.source || 'parent',
      rule,
    }));
  return {
    app: 'TimeOnChrome',
    configType: 'site-access-editable',
    configVersion: 1,
    description: 'Editable site access rules and review history. Ledger and stats files are not intended for manual editing.',
    studySites: config?.customStudyList || [],
    compositeSites: config?.customCompositeList || [],
    restrictedEntertainmentSites: config?.customRestrictedEntertainmentList || [],
    blockedSites: config?.customBlockedSites || [],
    studyRules: byDecision('study'),
    compositeRules: byDecision('composite'),
    rejectedRules: byDecision('reject'),
    classificationRequests: requests,
  };
}

async function exportObjectDataset(env: Env, profile: any, dataset: DatasetDef) {
  if (dataset.id === 'profile') {
    return json({ dataset: dataset.id, rows: [{
      id: profile.id,
      name: profile.name,
      avatarColor: profile.avatar_color,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    }], hasMore: false, nextCursor: null });
  }
  if (dataset.id === 'config') {
    return json({ dataset: dataset.id, rows: [profile.config ? JSON.parse(profile.config) : {}], hasMore: false, nextCursor: null });
  }
  if (dataset.id === 'defaults') {
    return json({ dataset: dataset.id, rows: [siteAccessDefaults], hasMore: false, nextCursor: null });
  }
  if (dataset.id === 'site-access-editable') {
    const requests = await env.DB.prepare(
      `SELECT id, profile_id, device_id, client_request_id, requested_target_type, requested_raw_input,
              requested_normalized_value, requested_host, display_value, status, decision,
              decision_target_type, decision_normalized_value, requested_at, decided_at, created_at, updated_at
       FROM site_classification_requests_v1
       WHERE profile_id = ?
       ORDER BY requested_at DESC, id DESC`
    ).bind(profile.id).all<any>();
    return json({
      dataset: dataset.id,
      rows: [siteAccessEditableFromConfig(profile.config ? JSON.parse(profile.config) : {}, (requests.results || []).map(normalizeRow))],
      hasMore: false,
      nextCursor: null,
    });
  }
  if (dataset.id === 'changelog') {
    return json({ dataset: dataset.id, rows: [profile.changelog ? JSON.parse(profile.changelog) : []], hasMore: false, nextCursor: null });
  }
  return null;
}

async function exportReconciliation(env: Env, profileId: string, url: URL) {
  const from = url.searchParams.get('from') || new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get('to') || from;
  if (!isDateKey(from) || !isDateKey(to)) return json({ error: 'from/to must be YYYY-MM-DD' }, 400);
  const stats = await env.DB.prepare(
    `SELECT date, domain, channel, mode, COALESCE(SUM(duration_seconds), 0) as seconds
     FROM stats_v1 WHERE profile_id = ? AND date >= ? AND date <= ?
     GROUP BY date, domain, channel, mode`
  ).bind(profileId, from, to).all<any>();
  const segments = await env.DB.prepare(
    `SELECT date, domain, channel, mode, COALESCE(SUM(duration_seconds), 0) as seconds
     FROM usage_segments_v1 WHERE profile_id = ? AND date >= ? AND date <= ?
     GROUP BY date, domain, channel, mode`
  ).bind(profileId, from, to).all<any>();
  const map = new Map<string, any>();
  const put = (row: any, side: string) => {
    const key = `${row.date}\t${row.domain}\t${row.channel}\t${row.mode}`;
    const existing = map.get(key) || { date: row.date, domain: row.domain, channel: row.channel, mode: row.mode, statsSeconds: 0, segmentSeconds: 0 };
    existing[side] = Number(row.seconds || 0);
    map.set(key, existing);
  };
  for (const row of stats.results || []) put(row, 'statsSeconds');
  for (const row of segments.results || []) put(row, 'segmentSeconds');
  return json({
    dataset: 'stats-reconciliation',
    rows: [...map.values()].map((row) => ({
      ...row,
      deltaSeconds: row.segmentSeconds - row.statsSeconds,
      status: row.statsSeconds === row.segmentSeconds ? 'match' : (row.statsSeconds <= 0 ? 'stats_missing' : (row.segmentSeconds <= 0 ? 'segments_missing' : 'mismatch')),
    })),
    hasMore: false,
    nextCursor: null,
  });
}

export const exportRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const manifestMatch = path.match(/^\/profiles\/([^/]+)\/export\/v1\/manifest$/);
    const datasetMatch = path.match(/^\/profiles\/([^/]+)\/export\/v1\/([^/]+)$/);
    if (request.method !== 'GET' || (!manifestMatch && !datasetMatch)) return json({ error: 'Not found' }, 404);

    const profileId = (manifestMatch || datasetMatch)![1];
    const profile = await verifyProfile(env, request, profileId);
    if (!profile) return json({ error: 'Profile not found' }, 404);

    const deviceId = url.searchParams.get('deviceId');
    if (deviceId && !(await verifyProfileDevice(env, profileId, deviceId))) return json({ error: 'Device not found' }, 404);

    if (manifestMatch) {
      const datasets = selectedDatasets(url.searchParams.get('categories'));
      return json({
        schemaVersion: 1,
        exportedAt: Date.now(),
        profile: {
          id: profile.id,
          name: profile.name,
          avatarColor: profile.avatar_color,
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
        },
        defaultLimit: DEFAULT_LIMIT,
        maxLimit: MAX_LIMIT,
        datasets: datasets.map(({ id, category, path, format, legacy }) => ({ id, category, path, format, legacy: !!legacy })),
      });
    }

    const dataset = DATASET_BY_ID.get(datasetMatch![2]);
    if (!dataset) return json({ error: 'Unknown dataset' }, 404);

    const objectResponse = await exportObjectDataset(env, profile, dataset);
    if (objectResponse) return objectResponse;
    if (dataset.id === 'stats-reconciliation') return await exportReconciliation(env, profileId, url);
    return await exportTableDataset(env, dataset, profileId, url);
  },
};

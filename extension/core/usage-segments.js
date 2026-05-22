// core/usage-segments.js — 终端用量分段结算引擎
//
// 职责：
// - 创建不可变的 usage_segments_v1 条目
// - 增量更新 daily_usage_stats_v1 物化聚合
// - 标记 segment 和 stats 同步出站为脏
// - 按本地日期边界处理跨日分段拆分
// - 按保留期清理旧 segments 和聚合
//
// 调用者：
// - runtime/session.js   → transitionState, checkpoint, UI flush close
// - runtime/recovery.js  → lifecycle recovery close
// - background.js        → tab close, monitoring off

import { evaluateSuspectSegment } from './suspect-segments.js';

// ── 常量 ─────────────────────────────────────────────────────────────────────────

const USAGE_SEGMENTS_KEY = 'usage_segments_v1';
const SEGMENT_INDEX_KEY = 'usage_segments_index_v1';
const DAILY_STATS_KEY = 'daily_usage_stats_v1';
const HOURLY_STATS_KEY = 'hourly_usage_stats_v1';
const SEGMENT_OUTBOX_KEY = 'segment_sync_outbox_v1';
const STATS_OUTBOX_KEY = 'stats_sync_outbox_v1';
const HOURLY_STATS_OUTBOX_KEY = 'hourly_stats_sync_outbox_v1';
const TARGET_STATS_OUTBOX_KEY = 'target_stats_sync_outbox_v1';
const HOURLY_TARGET_STATS_OUTBOX_KEY = 'hourly_target_stats_sync_outbox_v1';

const DEFAULT_RETENTION_DAYS = 365;

// 计入活跃时长的源状态
const COUNTED_STATES = new Set(['ACTIVE', 'BACKGROUND_ACTIVE', 'PIP_ACTIVE']);

// channel 映射
const STATE_TO_CHANNEL = {
  ACTIVE: 'active',
  BACKGROUND_ACTIVE: 'backgroundMedia',
  PIP_ACTIVE: 'pip',
};

const DESCRIPTION_SOURCES = new Set([
  'chrome_event',
  'timer',
  'ui_action',
  'recovery',
  'mode_boundary',
  'media',
  'debug',
  'unknown',
]);

const TARGET_SNAPSHOT_FIELDS = [
  'managedTargetId',
  'managedTargetType',
  'managedTargetNamespace',
  'managedTargetValue',
  'managedTargetLabelAtTime',
  'targetSourceAtTime',
  'targetRuleId',
  'targetMatchLevel',
  'targetClassificationAtTime',
  'quotaBucketAtTime',
];

// ── 纯函数：segment ID 生成 ─────────────────────────────────────────────────────

/**
 * 生成确定性的 segment ID。
 * 使用所有相关字段的复合键的 64 位哈希（16 个十六进制字符）。
 * 相同的输入总是产生相同的 ID — 实现重复数据删除和幂等性。
 */
export function generateSegmentId(input) {
  const composite = [
    input.profileId || '',
    input.deviceId || '',
    input.date || '',
    String(input.startMs || 0),
    String(input.endMs || 0),
    input.domain || '',
    input.channel || '',
    input.mode || '',
    input.sourceState || '',
    input.settlementReason || '',
    input.parentSegmentId || '',
    String(input.partIndex || 0),
  ].join('::');

  const hash = hash64(composite);
  const dateStr = (input.date || '19700101').replace(/-/g, '');
  return `seg-${dateStr}-${hash}`;
}

/**
 * 64 位哈希（16 个十六进制字符）— 确定性，不依赖 crypto。
 * 对重复数据删除足够；不是加密安全的。
 */
function hash64(input) {
  // 32 位 FNV-1a 哈希，带种子偏移
  function fnv1a(str, seed) {
    let h = (0x811c9dc5 ^ seed) >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
      h = (h >>> 0);
    }
    return h;
  }

  const upper = fnv1a(input, 0).toString(16).padStart(8, '0');
  const lower = fnv1a(input, 0xdeadbeef).toString(16).padStart(8, '0');
  return upper + lower;
}

/**
 * 验证 segment ID 格式。
 */
function isValidSegmentId(id) {
  if (typeof id !== 'string') return false;
  return /^seg-\d{8}-[0-9a-f]{16}$/.test(id);
}

// ── 纯函数：channel 映射 ───────────────────────────────────────────────────────

/**
 * 将源 attention 状态映射到 usage channel。
 * 返回 null 用于不计入的状态（PASSIVE、IDLE）。
 */
export function stateToChannel(state) {
  return STATE_TO_CHANNEL[state] || null;
}

/**
 * 返回源状态是否计入结算。
 */
export function isCountedState(state) {
  return COUNTED_STATES.has(state);
}

// ── 纯函数：跨日拆分 ───────────────────────────────────────────────────────────

/**
 * 获取给定 epoch 毫秒的本地日期信息。
 * timezoneOffsetMinutes: UTC+8 = 480, UTC-5 = -300
 */
export function getLocalDateInfo(epochMs, timezoneOffsetMinutes) {
  // 构建 UTC 日期，然后按偏移量调整
  const offsetMs = (typeof timezoneOffsetMinutes === 'number' ? timezoneOffsetMinutes : -new Date().getTimezoneOffset()) * 60 * 1000;
  const localMs = epochMs + offsetMs;
  const localDate = new Date(localMs);

  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localDate.getUTCDate()).padStart(2, '0');
  const date = `${year}-${month}-${day}`;

  // 本地日开始的 epoch ms
  const dayStartLocal = Date.UTC(year, localDate.getUTCMonth(), localDate.getUTCDate(), 0, 0, 0, 0);
  const dayStartMs = dayStartLocal - offsetMs;
  const dayEndMs = dayStartMs + 86399999;

  return { date, dayStartMs, dayEndMs };
}

function normalizeTargetSnapshot(input = {}) {
  const out = {};
  for (const key of TARGET_SNAPSHOT_FIELDS) {
    const value = input?.[key];
    out[key] = typeof value === 'string' && value.trim() ? value.trim() : null;
  }
  if (!out.quotaBucketAtTime) {
    out.quotaBucketAtTime = typeof input.mode === 'string' && input.mode.trim()
      ? input.mode.trim()
      : 'unknown';
  }
  return out;
}

export function getLocalHourInfo(epochMs, timezoneOffsetMinutes) {
  const offsetMs = (typeof timezoneOffsetMinutes === 'number' ? timezoneOffsetMinutes : -new Date().getTimezoneOffset()) * 60 * 1000;
  const localMs = epochMs + offsetMs;
  const localDate = new Date(localMs);

  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localDate.getUTCDate()).padStart(2, '0');
  const hour = localDate.getUTCHours();
  const date = `${year}-${month}-${day}`;
  const hourKey = `${date}T${String(hour).padStart(2, '0')}`;

  const hourStartLocal = Date.UTC(year, localDate.getUTCMonth(), localDate.getUTCDate(), hour, 0, 0, 0);
  const hourStartMs = hourStartLocal - offsetMs;
  const hourEndMs = hourStartMs + 3599999;
  const dayInfo = getLocalDateInfo(epochMs, timezoneOffsetMinutes);

  return { hourKey, date, hour, hourStartMs, hourEndMs, dayStartMs: dayInfo.dayStartMs, dayEndMs: dayInfo.dayEndMs };
}

function allocateSliceSeconds(rawSlices, totalSeconds) {
  const slices = rawSlices.map((slice, index) => {
    const durationMs = Math.max(0, Number(slice.endMs || 0) - Number(slice.startMs || 0));
    return {
      ...slice,
      durationMs,
      durationSeconds: Math.floor(durationMs / 1000),
      _index: index,
      _remainderMs: durationMs % 1000,
    };
  });
  let remaining = Math.max(0, Number(totalSeconds || 0) - slices.reduce((sum, slice) => sum + slice.durationSeconds, 0));
  const order = [...slices].sort((a, b) => {
    if (b._remainderMs !== a._remainderMs) return b._remainderMs - a._remainderMs;
    return a.startMs - b.startMs;
  });
  for (const slice of order) {
    if (remaining <= 0) break;
    if (slice.durationMs <= 0 && slice._remainderMs <= 0) continue;
    slice.durationSeconds += 1;
    remaining--;
  }
  return slices
    .sort((a, b) => a._index - b._index)
    .map(({ _index, _remainderMs, durationMs, ...slice }) => slice);
}

export function splitSegmentByLocalHour(segment) {
  if (!segment || typeof segment.startMs !== 'number' || typeof segment.endMs !== 'number') return [];
  const timezoneOffsetMinutes = segment.timezone ? parseTimezoneOffset(segment.timezone) : null;
  const startMs = segment.startMs;
  const endMs = segment.endMs;
  const totalSeconds = Math.max(0, Number(segment.durationSeconds ?? Math.floor(Math.max(0, endMs - startMs) / 1000)) || 0);

  if (endMs <= startMs) {
    const info = getLocalHourInfo(startMs, timezoneOffsetMinutes);
    return [{
      ...segment,
      hourKey: info.hourKey,
      date: info.date,
      hour: info.hour,
      hourStartMs: info.hourStartMs,
      hourEndMs: info.hourEndMs,
      dayStartMs: info.dayStartMs,
      dayEndMs: info.dayEndMs,
      startMs,
      endMs,
      durationSeconds: totalSeconds,
    }];
  }

  const rawSlices = [];
  let currentMs = startMs;
  while (currentMs < endMs) {
    const info = getLocalHourInfo(currentMs, timezoneOffsetMinutes);
    const hourEndExclusive = info.hourEndMs + 1;
    const sliceEndMs = Math.min(endMs, hourEndExclusive);
    rawSlices.push({
      ...segment,
      hourKey: info.hourKey,
      date: info.date,
      hour: info.hour,
      hourStartMs: info.hourStartMs,
      hourEndMs: info.hourEndMs,
      dayStartMs: info.dayStartMs,
      dayEndMs: info.dayEndMs,
      startMs: currentMs,
      endMs: sliceEndMs,
    });
    currentMs = sliceEndMs;
  }

  return allocateSliceSeconds(rawSlices, totalSeconds);
}

/**
 * 如果 segment 跨越本地日期边界，则按日期拆分。
 * 返回一个或多个段的数组，带有 parentSegmentId、partIndex、partCount。
 */
export function splitSegmentByLocalDate(input) {
  const {
    startMs, endMs, timezone, domain, channel, mode,
    sourceState, settlementReason,
    profileId, deviceId,
  } = input;

  // 使用 timezone 映射获取开始和结束的本地日期范围
  const timezoneOffsetMinutes = timezone ? parseTimezoneOffset(timezone) : null;
  const startInfo = getLocalDateInfo(startMs, timezoneOffsetMinutes);
  const endInfo = getLocalDateInfo(endMs, timezoneOffsetMinutes);

  // 同一天 — 无需拆分
  if (startInfo.date === endInfo.date) {
    const seg = buildUsageSegment({
      ...input,
      date: startInfo.date,
      dayStartMs: startInfo.dayStartMs,
      dayEndMs: startInfo.dayEndMs,
      parentSegmentId: null,
      partIndex: 1,
      partCount: 1,
    });
    return [seg];
  }

  // 跨越日期边界 — 每个自然日一个 child segment
  const children = [];
  let currentMs = startMs;
  let partIndex = 0;

  while (currentMs < endMs) {
    const info = getLocalDateInfo(currentMs, timezoneOffsetMinutes);
    const dayEndEpoch = info.dayEndMs + 1; // 下一天的开始

    const segEndMs = Math.min(endMs, dayEndEpoch);
    const durationMs = segEndMs - currentMs;
    const durationSeconds = Math.max(0, Math.floor(durationMs / 1000));

    if (durationMs > 0) {
      partIndex++;
      children.push(buildUsageSegment({
        ...input,
        date: info.date,
        dayStartMs: info.dayStartMs,
        dayEndMs: info.dayEndMs,
        startMs: currentMs,
        endMs: segEndMs,
        durationSeconds,
        parentSegmentId: null,
        partIndex,
        partCount: 0, // 最后填充
      }));
    }

    currentMs = segEndMs;
  }

  // 填充 partCount 和链接 parentSegmentId
  const parentId = children.length > 1 ? generateSegmentId({
    ...input,
    date: startInfo.date,
    partIndex: 0,
    parentSegmentId: null,
  }) : null;

  for (let i = 0; i < children.length; i++) {
    children[i].partCount = children.length;
    if (children.length > 1 && parentId) {
      children[i].parentSegmentId = parentId;
      children[i].id = generateSegmentId({ ...children[i], parentSegmentId: parentId });
    }
  }

  return children;
}

/**
 * 解析时区字符串为分钟偏移量。
 * 接受 'Asia/Shanghai' 或 '+08:00' 或 '-05:00'。
 */
function parseTimezoneOffset(tz) {
  if (!tz) return null;

  // +08:00 / -05:00 格式
  const offsetMatch = tz.match(/^([+-])(\d{2}):(\d{2})$/);
  if (offsetMatch) {
    const hours = parseInt(offsetMatch[2], 10);
    const minutes = parseInt(offsetMatch[3], 10);
    const total = hours * 60 + minutes;
    return offsetMatch[1] === '-' ? -total : total;
  }

  // 尝试常见的 IANA 时区名称
  const known = {
    'Asia/Shanghai': 480,
    'Asia/Tokyo': 540,
    'Asia/Seoul': 540,
    'Asia/Singapore': 480,
    'Asia/Kolkata': 330,
    'Europe/London': 0,
    'Europe/Paris': 60,
    'Europe/Berlin': 60,
    'America/New_York': -300,
    'America/Chicago': -360,
    'America/Denver': -420,
    'America/Los_Angeles': -480,
    'Pacific/Auckland': 780,
    'Australia/Sydney': 600,
  };

  if (known[tz] !== undefined) return known[tz];
  return null;
}

function normalizeDescriptionEndpoint(endpoint) {
  const source = DESCRIPTION_SOURCES.has(endpoint?.source) ? endpoint.source : 'unknown';
  const atMs = Number(endpoint?.atMs);
  return {
    reason: typeof endpoint?.reason === 'string' && endpoint.reason.trim() ? endpoint.reason.trim() : null,
    operation: typeof endpoint?.operation === 'string' && endpoint.operation.trim() ? endpoint.operation.trim() : null,
    source,
    atMs: Number.isFinite(atMs) && atMs > 0 ? atMs : null,
  };
}

function endpointSummary(endpoint) {
  return endpoint?.operation || endpoint?.reason || '—';
}

function normalizeSegmentDescription(description) {
  const start = normalizeDescriptionEndpoint(description?.start);
  const end = normalizeDescriptionEndpoint(description?.end);
  const summary = typeof description?.summary === 'string' && description.summary.trim()
    ? description.summary.trim()
    : `开始：${endpointSummary(start)}；结束：${endpointSummary(end)}`;
  return {
    schemaVersion: 1,
    start,
    end,
    summary,
  };
}

// ── 纯函数：segment 构建 ────────────────────────────────────────────────────────

/**
 * 从结算后的输入构建完整的 segment 对象。
 */
export function buildUsageSegment(input) {
  // 从 startMs 推导日期（如果未提供）
  let date = input.date;
  if (!date && typeof input.startMs === 'number') {
    const info = getLocalDateInfo(input.startMs, input.timezone ? parseTimezoneOffset(input.timezone) : null);
    date = info.date;
  }
  if (!date) date = '1970-01-01';
  const targetSnapshot = normalizeTargetSnapshot({ ...input, mode: input.mode || 'unknown' });

  const seg = {
    id: input.id || generateSegmentId({ ...input, date }),
    schemaVersion: 1,
    profileId: input.profileId || null,
    deviceId: input.deviceId || null,
    date,
    timezone: input.timezone || 'Asia/Shanghai',
    dayStartMs: input.dayStartMs,
    dayEndMs: input.dayEndMs,
    startMs: input.startMs,
    endMs: input.endMs,
    durationSeconds: input.durationSeconds || Math.max(0, Math.floor((input.endMs - input.startMs) / 1000)),
    domain: input.domain || '',
    tabId: Number.isInteger(input.tabId) ? input.tabId : null,
    windowId: Number.isInteger(input.windowId) ? input.windowId : null,
    ...targetSnapshot,
    channel: input.channel,
    mode: input.mode || 'unknown',
    sourceState: input.sourceState || 'UNKNOWN',
    settlementReason: input.settlementReason || 'transition_complete',
    description: normalizeSegmentDescription(input.description),
    parentSegmentId: input.parentSegmentId || null,
    partIndex: input.partIndex || 1,
    partCount: input.partCount || 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    uploadedAt: null,
  };

  // 填充 dayStartMs / dayEndMs（如果未提供）
  if (!seg.dayStartMs || !seg.dayEndMs) {
    const info = getLocalDateInfo(seg.startMs, seg.timezone ? parseTimezoneOffset(seg.timezone) : null);
    seg.dayStartMs = info.dayStartMs;
    seg.dayEndMs = info.dayEndMs;
  }

  return seg;
}

// ── 存储操作 ────────────────────────────────────────────────────────────────────

/**
 * 追加 segment 到 usage_segments_v1 存储。
 * 如果该 ID 的 segment 已存在，则不追加（幂等）。
 */
export async function appendUsageSegments(segments) {
  const data = await chrome.storage.local.get([USAGE_SEGMENTS_KEY, SEGMENT_INDEX_KEY]);
  const allSegments = data[USAGE_SEGMENTS_KEY] || {};
  const index = data[SEGMENT_INDEX_KEY] || {};

  let appended = 0;
  const flatSegments = Array.isArray(segments) ? segments : [segments];

  for (const seg of flatSegments) {
    if (!seg || !seg.id || !isValidSegmentId(seg.id)) continue;
    if (allSegments[seg.id]) continue; // 幂等

    seg.updatedAt = Date.now();
    allSegments[seg.id] = seg;
    appended++;

    // 维护按日期索引
    if (!index[seg.date]) index[seg.date] = [];
    if (!index[seg.date].includes(seg.id)) {
      index[seg.date].push(seg.id);
    }
  }

  if (appended > 0) {
    await chrome.storage.local.set({
      [USAGE_SEGMENTS_KEY]: allSegments,
      [SEGMENT_INDEX_KEY]: index,
    });
  }

  return appended;
}

/**
 * 获取给定日期的所有 segments。
 */
export async function getUsageSegmentsByDate(date) {
  const data = await chrome.storage.local.get([USAGE_SEGMENTS_KEY, SEGMENT_INDEX_KEY]);
  const allSegments = data[USAGE_SEGMENTS_KEY] || {};
  const index = data[SEGMENT_INDEX_KEY] || {};
  const ids = index[date] || [];
  return ids.map(id => allSegments[id]).filter(Boolean);
}

/**
 * 获取所有 segments。
 */
export async function getAllUsageSegments() {
  const data = await chrome.storage.local.get(USAGE_SEGMENTS_KEY);
  return data[USAGE_SEGMENTS_KEY] || {};
}

// ── 每日聚合操作 ────────────────────────────────────────────────────────────────

/**
 * 从已结算的 segment 增量更新 daily_usage_stats_v1。
 */
export async function incrementDailyUsageStats(segment) {
  if (!segment || !segment.date || !segment.domain) return;

  const data = await chrome.storage.local.get(DAILY_STATS_KEY);
  const stats = data[DAILY_STATS_KEY] || {};

  if (!stats[segment.date]) {
    stats[segment.date] = {
      date: segment.date,
      timezone: segment.timezone || 'Asia/Shanghai',
      dayStartMs: segment.dayStartMs,
      dayEndMs: segment.dayEndMs,
      segmentsCount: 0,
      lastSegmentId: null,
      domains: {},
      targets: {},
    };
  }

  applySegmentToDailyStats(stats[segment.date], segment);

  await chrome.storage.local.set({ [DAILY_STATS_KEY]: stats });
}

export async function incrementHourlyUsageStats(segment) {
  if (!segment || !segment.domain) return;

  const slices = splitSegmentByLocalHour(segment);
  if (slices.length === 0) return;

  const data = await chrome.storage.local.get(HOURLY_STATS_KEY);
  const stats = data[HOURLY_STATS_KEY] || {};
  const dirtyHourKeys = new Set();

  for (const slice of slices) {
    if (!slice.hourKey) continue;
    if (!stats[slice.hourKey]) {
      stats[slice.hourKey] = {
        hourKey: slice.hourKey,
        date: slice.date,
        hour: slice.hour,
        timezone: slice.timezone || 'Asia/Shanghai',
        hourStartMs: slice.hourStartMs,
        hourEndMs: slice.hourEndMs,
        segmentsCount: 0,
        lastSegmentId: null,
        domains: {},
        targets: {},
      };
    }
    applySegmentToHourlyStats(stats[slice.hourKey], slice);
    dirtyHourKeys.add(slice.hourKey);
  }

  await chrome.storage.local.set({ [HOURLY_STATS_KEY]: stats });
  await markHourlyStatsSyncDirty([...dirtyHourKeys]);
  await markHourlyTargetStatsSyncDirty([...dirtyHourKeys]);
}

function applySegmentToDailyStats(day, segment) {
  if (!day || !segment || !segment.domain) return;

  if (!day.domains) day.domains = {};
  if (!day.targets) day.targets = {};
  const domainKey = segment.domain;
  if (!day.domains[domainKey]) {
    day.domains[domainKey] = makeEmptyDomainStats();
  }

  const ds = day.domains[domainKey];
  const seconds = segment.durationSeconds;
  const modeKey = segment.mode || 'unknown';

  // 按 channel 的增量总计
  if (segment.channel === 'active') {
    ds.activeSeconds += seconds;
    ds.activeByMode[modeKey] = (ds.activeByMode[modeKey] || 0) + seconds;
  } else if (segment.channel === 'backgroundMedia') {
    ds.backgroundMediaSeconds += seconds;
    ds.backgroundMediaByMode[modeKey] = (ds.backgroundMediaByMode[modeKey] || 0) + seconds;
  } else if (segment.channel === 'pip') {
    ds.pipSeconds += seconds;
    ds.pipByMode[modeKey] = (ds.pipByMode[modeKey] || 0) + seconds;
  }

  // totalSeconds 是派生字段
  ds.totalSeconds = ds.activeSeconds + ds.backgroundMediaSeconds + ds.pipSeconds;

  // 更新首次/末次/更新时间
  const nowMs = Date.now();
  if (!ds.firstSeenAt || segment.startMs < ds.firstSeenAt) {
    ds.firstSeenAt = segment.startMs;
  }
  if (!ds.lastSeenAt || segment.endMs > ds.lastSeenAt) {
    ds.lastSeenAt = segment.endMs;
  }
  ds.lastUpdatedAt = nowMs;

  applySegmentToTargetStats(day.targets, segment, nowMs);

  day.segmentsCount = (day.segmentsCount || 0) + 1;
  day.lastSegmentId = segment.id;
}

function applySegmentToHourlyStats(hourStats, slice) {
  if (!hourStats || !slice || !slice.domain) return;

  if (!hourStats.domains) hourStats.domains = {};
  if (!hourStats.targets) hourStats.targets = {};
  const domainKey = slice.domain;
  if (!hourStats.domains[domainKey]) {
    hourStats.domains[domainKey] = makeEmptyDomainStats();
  }

  const ds = hourStats.domains[domainKey];
  const seconds = Number(slice.durationSeconds || 0);
  const modeKey = slice.mode || 'unknown';

  if (slice.channel === 'active') {
    ds.activeSeconds += seconds;
    ds.activeByMode[modeKey] = (ds.activeByMode[modeKey] || 0) + seconds;
  } else if (slice.channel === 'backgroundMedia') {
    ds.backgroundMediaSeconds += seconds;
    ds.backgroundMediaByMode[modeKey] = (ds.backgroundMediaByMode[modeKey] || 0) + seconds;
  } else if (slice.channel === 'pip') {
    ds.pipSeconds += seconds;
    ds.pipByMode[modeKey] = (ds.pipByMode[modeKey] || 0) + seconds;
  }

  ds.totalSeconds = ds.activeSeconds + ds.backgroundMediaSeconds + ds.pipSeconds;

  const nowMs = Date.now();
  if (!ds.firstSeenAt || slice.startMs < ds.firstSeenAt) {
    ds.firstSeenAt = slice.startMs;
  }
  if (!ds.lastSeenAt || slice.endMs > ds.lastSeenAt) {
    ds.lastSeenAt = slice.endMs;
  }
  ds.lastUpdatedAt = nowMs;

  applySegmentToTargetStats(hourStats.targets, slice, nowMs);

  hourStats.segmentsCount = (hourStats.segmentsCount || 0) + 1;
  hourStats.lastSegmentId = slice.id;
}

function makeEmptyDomainStats() {
  return {
    activeSeconds: 0,
    backgroundMediaSeconds: 0,
    pipSeconds: 0,
    totalSeconds: 0,
    activeByMode: {},
    backgroundMediaByMode: {},
    pipByMode: {},
    firstSeenAt: null,
    lastSeenAt: null,
    lastUpdatedAt: null,
  };
}

/**
 * 获取给定日期的每日聚合。
 */
export async function getDailyUsageStats(date) {
  const data = await chrome.storage.local.get(DAILY_STATS_KEY);
  const stats = data[DAILY_STATS_KEY] || {};
  if (date) return stats[date] || null;
  return stats;
}

export async function getHourlyUsageStats(hourKey = null) {
  const data = await chrome.storage.local.get(HOURLY_STATS_KEY);
  const stats = data[HOURLY_STATS_KEY] || {};
  if (hourKey) return stats[hourKey] || null;
  return stats;
}

/**
 * 从 segments 重建每日聚合（用于对账/迁移）。
 */
export async function rebuildDailyUsageStats(date, options = {}) {
  const segments = await getUsageSegmentsByDate(date);
  const {
    excludeSuspect = false,
    forceWriteEmpty = false,
    cleanupMetadata = null,
  } = options || {};
  if (segments.length === 0 && !forceWriteEmpty) return { date, rebuilt: false };

  const includedSegments = excludeSuspect
    ? segments.filter((seg) => !seg?.suspect)
    : segments;
  const firstSegment = segments[0] || {};
  const nextDayStats = {
    date,
    timezone: firstSegment.timezone || 'Asia/Shanghai',
    dayStartMs: firstSegment.dayStartMs || null,
    dayEndMs: firstSegment.dayEndMs || null,
    segmentsCount: 0,
    lastSegmentId: null,
    domains: {},
    targets: {},
  };

  if (cleanupMetadata) {
    nextDayStats.suspectCleanup = {
      ...cleanupMetadata,
      excludeSuspect: !!excludeSuspect,
      rebuiltAt: Date.now(),
    };
  }

  // 重置该日期的聚合
  const data = await chrome.storage.local.get(DAILY_STATS_KEY);
  const stats = data[DAILY_STATS_KEY] || {};

  // 从 segments 重建
  for (const seg of includedSegments) {
    applySegmentToDailyStats(nextDayStats, seg);
  }

  if (includedSegments.length > 0 || forceWriteEmpty || cleanupMetadata) {
    stats[date] = nextDayStats;
  } else {
    delete stats[date];
  }

  await chrome.storage.local.set({ [DAILY_STATS_KEY]: stats });
  await markTargetStatsSyncDirty([date]);

  return {
    date,
    rebuilt: true,
    segmentsUsed: includedSegments.length,
    excludedSuspectSegments: segments.length - includedSegments.length,
  };
}

export async function rebuildHourlyUsageStats(dateOrHourKey, options = {}) {
  const target = String(dateOrHourKey || '');
  const isHourKey = /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(target);
  const date = isHourKey ? target.slice(0, 10) : target;
  const segments = await getUsageSegmentsByDate(date);
  const {
    excludeSuspect = false,
    forceWriteEmpty = false,
  } = options || {};
  if (segments.length === 0 && !forceWriteEmpty) return { target, rebuilt: false, rebuiltHours: [] };

  const includedSegments = excludeSuspect
    ? segments.filter((seg) => !seg?.suspect)
    : segments;
  const nextByHour = {};

  for (const segment of includedSegments) {
    const slices = splitSegmentByLocalHour(segment)
      .filter((slice) => !isHourKey || slice.hourKey === target);
    for (const slice of slices) {
      if (!nextByHour[slice.hourKey]) {
        nextByHour[slice.hourKey] = {
          hourKey: slice.hourKey,
          date: slice.date,
          hour: slice.hour,
          timezone: slice.timezone || 'Asia/Shanghai',
          hourStartMs: slice.hourStartMs,
          hourEndMs: slice.hourEndMs,
          segmentsCount: 0,
          lastSegmentId: null,
          domains: {},
          targets: {},
        };
      }
      applySegmentToHourlyStats(nextByHour[slice.hourKey], slice);
    }
  }

  const data = await chrome.storage.local.get(HOURLY_STATS_KEY);
  const stats = data[HOURLY_STATS_KEY] || {};
  for (const key of Object.keys(stats)) {
    if (isHourKey ? key === target : key.startsWith(`${date}T`)) {
      delete stats[key];
    }
  }
  for (const [key, value] of Object.entries(nextByHour)) {
    stats[key] = value;
  }
  if (Object.keys(nextByHour).length > 0 || forceWriteEmpty) {
    await chrome.storage.local.set({ [HOURLY_STATS_KEY]: stats });
  }
  const rebuiltHours = Object.keys(nextByHour).sort();
  await markHourlyStatsSyncDirty(rebuiltHours);
  await markHourlyTargetStatsSyncDirty(rebuiltHours);
  return { target, date, rebuilt: true, rebuiltHours, segmentsUsed: includedSegments.length };
}

export async function markSuspectUsageSegments({ dryRun = true } = {}) {
  const data = await chrome.storage.local.get([USAGE_SEGMENTS_KEY, SEGMENT_INDEX_KEY]);
  const allSegments = data[USAGE_SEGMENTS_KEY] || {};
  const segments = Object.values(allSegments);
  const suspectByReason = {};
  const affectedDatesSet = new Set();
  let excludedSeconds = 0;
  const candidates = [];

  for (const segment of segments) {
    const evaluation = evaluateSuspectSegment(segment);
    if (!evaluation.suspect) continue;

    affectedDatesSet.add(segment.date);
    if (!segment.suspect) {
      candidates.push({ segment, evaluation });
      suspectByReason[evaluation.reason] = (suspectByReason[evaluation.reason] || 0) + 1;
      excludedSeconds += Number(segment.durationSeconds || 0);
    }
  }

  const affectedDates = [...affectedDatesSet].filter(Boolean).sort();
  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      scannedCount: segments.length,
      markedCount: candidates.length,
      suspectByReason,
      excludedSeconds,
      affectedDates,
      rebuiltDates: [],
    };
  }

  const suspectMarkedAt = Date.now();
  for (const { segment, evaluation } of candidates) {
    allSegments[segment.id] = {
      ...segment,
      suspect: true,
      suspectReason: evaluation.reason,
      suspectMarkedAt,
      suspectEvidence: evaluation.evidence,
    };
  }

  if (candidates.length > 0) {
    await chrome.storage.local.set({ [USAGE_SEGMENTS_KEY]: allSegments });
  }

  const rebuiltDates = [];
  for (const date of affectedDates) {
    const reasonCountsForDate = {};
    let excludedSecondsForDate = 0;
    for (const segment of Object.values(allSegments)) {
      if (segment?.date !== date || !segment?.suspect) continue;
      const reason = segment.suspectReason || 'suspect';
      reasonCountsForDate[reason] = (reasonCountsForDate[reason] || 0) + 1;
      excludedSecondsForDate += Number(segment.durationSeconds || 0);
    }
    const result = await rebuildDailyUsageStats(date, {
      excludeSuspect: true,
      forceWriteEmpty: true,
      cleanupMetadata: {
        reason: 'mark_suspect_segments',
        suspectByReason: reasonCountsForDate,
        excludedSeconds: excludedSecondsForDate,
      },
    });
    rebuiltDates.push(result.date);
  }

  return {
    ok: true,
    dryRun: false,
    scannedCount: segments.length,
    markedCount: candidates.length,
    suspectByReason,
    excludedSeconds,
    affectedDates,
    rebuiltDates,
  };
}

// ── 出站标记 ────────────────────────────────────────────────────────────────────

/**
 * 将 segment IDs 标记为在同步出站中脏。
 */
export async function markSegmentSyncDirty(segmentIds) {
  const ids = Array.isArray(segmentIds) ? segmentIds : [segmentIds];
  const validIds = ids.filter(id => id && isValidSegmentId(id));
  if (validIds.length === 0) return;

  const data = await chrome.storage.local.get(SEGMENT_OUTBOX_KEY);
  const outbox = data[SEGMENT_OUTBOX_KEY] || { dirtySegmentIds: [], retryCounts: {}, lastErrors: {} };
  const dirtySet = new Set(outbox.dirtySegmentIds);

  for (const id of validIds) {
    dirtySet.add(id);
    // 保留现有重试计数仅在上次失败时
  }

  outbox.dirtySegmentIds = [...dirtySet];
  await chrome.storage.local.set({ [SEGMENT_OUTBOX_KEY]: outbox });
}

/**
 * 将日期标记为在统计同步出站中脏。
 */
export async function markStatsSyncDirty(dates) {
  const dateList = Array.isArray(dates) ? dates : [dates];
  const validDates = dateList.filter(d => d && typeof d === 'string');
  if (validDates.length === 0) return;

  const data = await chrome.storage.local.get(STATS_OUTBOX_KEY);
  const outbox = data[STATS_OUTBOX_KEY] || { dirtyDates: [], retryCounts: {}, lastErrors: {} };
  const dirtySet = new Set(outbox.dirtyDates);

  for (const d of validDates) dirtySet.add(d);

  outbox.dirtyDates = [...dirtySet];
  await chrome.storage.local.set({ [STATS_OUTBOX_KEY]: outbox });
}

export async function markTargetStatsSyncDirty(dates) {
  const dateList = Array.isArray(dates) ? dates : [dates];
  const validDates = dateList.filter(d => d && typeof d === 'string');
  if (validDates.length === 0) return;

  const data = await chrome.storage.local.get(TARGET_STATS_OUTBOX_KEY);
  const outbox = data[TARGET_STATS_OUTBOX_KEY] || { dirtyDates: [], retryCounts: {}, lastErrors: {} };
  const dirtySet = new Set(outbox.dirtyDates || []);

  for (const d of validDates) dirtySet.add(d);

  outbox.dirtyDates = [...dirtySet];
  await chrome.storage.local.set({ [TARGET_STATS_OUTBOX_KEY]: outbox });
}

export async function markHourlyStatsSyncDirty(hourKeys) {
  const hourKeyList = Array.isArray(hourKeys) ? hourKeys : [hourKeys];
  const validHourKeys = hourKeyList.filter((key) => key && typeof key === 'string');
  if (validHourKeys.length === 0) return;

  const data = await chrome.storage.local.get(HOURLY_STATS_OUTBOX_KEY);
  const outbox = data[HOURLY_STATS_OUTBOX_KEY] || { dirtyHourKeys: [], retryCounts: {}, lastErrors: {} };
  const dirtySet = new Set(outbox.dirtyHourKeys || []);

  for (const key of validHourKeys) dirtySet.add(key);

  outbox.dirtyHourKeys = [...dirtySet];
  await chrome.storage.local.set({ [HOURLY_STATS_OUTBOX_KEY]: outbox });
}

export async function markHourlyTargetStatsSyncDirty(hourKeys) {
  const hourKeyList = Array.isArray(hourKeys) ? hourKeys : [hourKeys];
  const validHourKeys = hourKeyList.filter((key) => key && typeof key === 'string');
  if (validHourKeys.length === 0) return;

  const data = await chrome.storage.local.get(HOURLY_TARGET_STATS_OUTBOX_KEY);
  const outbox = data[HOURLY_TARGET_STATS_OUTBOX_KEY] || { dirtyHourKeys: [], retryCounts: {}, lastErrors: {} };
  const dirtySet = new Set(outbox.dirtyHourKeys || []);

  for (const key of validHourKeys) dirtySet.add(key);

  outbox.dirtyHourKeys = [...dirtySet];
  await chrome.storage.local.set({ [HOURLY_TARGET_STATS_OUTBOX_KEY]: outbox });
}

/**
 * 清除同步出站状态（上传成功后调用）。
 */
export async function clearSegmentSyncOutbox() {
  await chrome.storage.local.set({
    [SEGMENT_OUTBOX_KEY]: { dirtySegmentIds: [], retryCounts: {}, lastErrors: {} },
  });
}

export async function clearStatsSyncOutbox() {
  await chrome.storage.local.set({
    [STATS_OUTBOX_KEY]: { dirtyDates: [], retryCounts: {}, lastErrors: {} },
  });
}

export async function clearHourlyStatsSyncOutbox() {
  await chrome.storage.local.set({
    [HOURLY_STATS_OUTBOX_KEY]: { dirtyHourKeys: [], retryCounts: {}, lastErrors: {} },
  });
}

export async function clearTargetStatsSyncOutbox() {
  await chrome.storage.local.set({
    [TARGET_STATS_OUTBOX_KEY]: { dirtyDates: [], retryCounts: {}, lastErrors: {} },
  });
}

export async function clearHourlyTargetStatsSyncOutbox() {
  await chrome.storage.local.set({
    [HOURLY_TARGET_STATS_OUTBOX_KEY]: { dirtyHourKeys: [], retryCounts: {}, lastErrors: {} },
  });
}

// ── 出站读取 ────────────────────────────────────────────────────────────────────

/**
 * 获取待上传的 usage segments，可选限制数量。
 * 返回完整的 segment 数据，而不仅仅是 ID。
 */
export async function getPendingUsageSegments(limit = 0) {
  const data = await chrome.storage.local.get([USAGE_SEGMENTS_KEY, SEGMENT_OUTBOX_KEY]);
  const allSegments = data[USAGE_SEGMENTS_KEY] || {};
  const outbox = data[SEGMENT_OUTBOX_KEY] || { dirtySegmentIds: [] };

  const dirtyIds = limit > 0
    ? outbox.dirtySegmentIds.slice(0, limit)
    : outbox.dirtySegmentIds;

  return {
    segments: dirtyIds.map(id => allSegments[id]).filter(Boolean),
    pendingCount: outbox.dirtySegmentIds.length,
    retryCounts: outbox.retryCounts || {},
    lastErrors: outbox.lastErrors || {},
  };
}

/**
 * 获取待上传的每日统计数据，可选过滤日期。
 */
export async function getPendingDailyStats(dates = null) {
  const data = await chrome.storage.local.get([DAILY_STATS_KEY, STATS_OUTBOX_KEY]);
  const allStats = data[DAILY_STATS_KEY] || {};
  const outbox = data[STATS_OUTBOX_KEY] || { dirtyDates: [] };

  const targetDates = dates
    ? (Array.isArray(dates) ? dates : [dates])
    : outbox.dirtyDates;

  const stats = {};
  for (const date of targetDates) {
    if (allStats[date] && allStats[date].domains) {
      stats[date] = allStats[date];
    }
  }

  return {
    stats,
    pendingCount: outbox.dirtyDates.length,
    retryCounts: outbox.retryCounts || {},
    lastErrors: outbox.lastErrors || {},
  };
}

export async function getPendingTargetStats(dates = null) {
  const data = await chrome.storage.local.get([DAILY_STATS_KEY, TARGET_STATS_OUTBOX_KEY]);
  const allStats = data[DAILY_STATS_KEY] || {};
  const outbox = data[TARGET_STATS_OUTBOX_KEY] || { dirtyDates: [] };

  const targetDates = dates
    ? (Array.isArray(dates) ? dates : [dates])
    : outbox.dirtyDates;

  const stats = {};
  for (const date of targetDates || []) {
    if (allStats[date] && allStats[date].targets) {
      stats[date] = allStats[date];
    }
  }

  return {
    stats,
    pendingCount: (outbox.dirtyDates || []).length,
    retryCounts: outbox.retryCounts || {},
    lastErrors: outbox.lastErrors || {},
  };
}

function targetStatsKey(segment) {
  if (typeof segment?.managedTargetId === 'string' && segment.managedTargetId.trim()) {
    return segment.managedTargetId.trim();
  }
  return `fallback:domain:${segment?.domain || 'unknown'}`;
}

function makeEmptyTargetStats(segment, key) {
  const fallback = !(typeof segment?.managedTargetId === 'string' && segment.managedTargetId.trim());
  return {
    managedTargetId: fallback ? null : segment.managedTargetId,
    managedTargetType: fallback ? null : (segment.managedTargetType || null),
    managedTargetNamespace: fallback ? null : (segment.managedTargetNamespace || null),
    managedTargetValue: fallback ? null : (segment.managedTargetValue || null),
    managedTargetLabelAtTime: fallback ? null : (segment.managedTargetLabelAtTime || null),
    targetSourceAtTime: fallback ? null : (segment.targetSourceAtTime || null),
    targetRuleId: fallback ? null : (segment.targetRuleId || null),
    targetMatchLevel: fallback ? 'domain_fallback' : (segment.targetMatchLevel || null),
    targetClassificationAtTime: fallback ? null : (segment.targetClassificationAtTime || null),
    fallbackDomain: segment?.domain || null,
    targetKey: key,
    isFallback: fallback,
    activeSeconds: 0,
    backgroundMediaSeconds: 0,
    pipSeconds: 0,
    totalSeconds: 0,
    activeByMode: {},
    backgroundMediaByMode: {},
    pipByMode: {},
    activeByQuotaBucket: {},
    backgroundMediaByQuotaBucket: {},
    pipByQuotaBucket: {},
    rows: {},
    firstSeenAt: null,
    lastSeenAt: null,
    lastUpdatedAt: null,
  };
}

function incrementBucket(map, key, seconds) {
  const bucket = typeof key === 'string' && key.trim() ? key.trim() : 'unknown';
  map[bucket] = (map[bucket] || 0) + seconds;
}

function applySegmentToTargetStats(targets, segment, nowMs = Date.now()) {
  if (!targets || !segment || !segment.domain) return;
  const key = targetStatsKey(segment);
  if (!targets[key]) targets[key] = makeEmptyTargetStats(segment, key);

  const ts = targets[key];
  const seconds = Number(segment.durationSeconds || 0);
  const modeKey = segment.mode || 'unknown';
  const quotaKey = segment.quotaBucketAtTime || modeKey || 'unknown';
  const rowKey = `${segment.channel || 'active'}::${modeKey}::${quotaKey}`;
  if (!ts.rows || typeof ts.rows !== 'object') ts.rows = {};
  if (!ts.rows[rowKey]) {
    ts.rows[rowKey] = {
      channel: segment.channel || 'active',
      mode: modeKey,
      quotaBucket: quotaKey,
      durationSeconds: 0,
    };
  }
  ts.rows[rowKey].durationSeconds += seconds;

  if (segment.channel === 'active') {
    ts.activeSeconds += seconds;
    incrementBucket(ts.activeByMode, modeKey, seconds);
    incrementBucket(ts.activeByQuotaBucket, quotaKey, seconds);
  } else if (segment.channel === 'backgroundMedia') {
    ts.backgroundMediaSeconds += seconds;
    incrementBucket(ts.backgroundMediaByMode, modeKey, seconds);
    incrementBucket(ts.backgroundMediaByQuotaBucket, quotaKey, seconds);
  } else if (segment.channel === 'pip') {
    ts.pipSeconds += seconds;
    incrementBucket(ts.pipByMode, modeKey, seconds);
    incrementBucket(ts.pipByQuotaBucket, quotaKey, seconds);
  }

  ts.totalSeconds = ts.activeSeconds + ts.backgroundMediaSeconds + ts.pipSeconds;
  if (!ts.firstSeenAt || segment.startMs < ts.firstSeenAt) ts.firstSeenAt = segment.startMs;
  if (!ts.lastSeenAt || segment.endMs > ts.lastSeenAt) ts.lastSeenAt = segment.endMs;
  ts.lastUpdatedAt = nowMs;
}

export async function getPendingHourlyStats(hourKeys = null) {
  const data = await chrome.storage.local.get([HOURLY_STATS_KEY, HOURLY_STATS_OUTBOX_KEY]);
  const allStats = data[HOURLY_STATS_KEY] || {};
  const outbox = data[HOURLY_STATS_OUTBOX_KEY] || { dirtyHourKeys: [] };

  const targetHourKeys = hourKeys
    ? (Array.isArray(hourKeys) ? hourKeys : [hourKeys])
    : outbox.dirtyHourKeys;

  const stats = {};
  for (const hourKey of targetHourKeys || []) {
    if (allStats[hourKey] && allStats[hourKey].domains) {
      stats[hourKey] = allStats[hourKey];
    }
  }

  return {
    stats,
    pendingCount: (outbox.dirtyHourKeys || []).length,
    retryCounts: outbox.retryCounts || {},
    lastErrors: outbox.lastErrors || {},
  };
}

export async function getPendingHourlyTargetStats(hourKeys = null) {
  const data = await chrome.storage.local.get([HOURLY_STATS_KEY, HOURLY_TARGET_STATS_OUTBOX_KEY]);
  const allStats = data[HOURLY_STATS_KEY] || {};
  const outbox = data[HOURLY_TARGET_STATS_OUTBOX_KEY] || { dirtyHourKeys: [] };

  const targetHourKeys = hourKeys
    ? (Array.isArray(hourKeys) ? hourKeys : [hourKeys])
    : outbox.dirtyHourKeys;

  const stats = {};
  for (const hourKey of targetHourKeys || []) {
    if (allStats[hourKey] && allStats[hourKey].targets) {
      stats[hourKey] = allStats[hourKey];
    }
  }

  return {
    stats,
    pendingCount: (outbox.dirtyHourKeys || []).length,
    retryCounts: outbox.retryCounts || {},
    lastErrors: outbox.lastErrors || {},
  };
}

// ── 出站更新（上传后）───────────────────────────────────────────────────────────

/**
 * 将 usage segments 标记为已上传。
 * 更新 uploadedAt 字段并清除出站条目。
 * 不清除 segment 记录本身。
 */
export async function markUsageSegmentsUploaded(segmentIds, uploadedAt = Date.now()) {
  const ids = Array.isArray(segmentIds) ? segmentIds : [segmentIds];
  if (ids.length === 0) return;

  const data = await chrome.storage.local.get([USAGE_SEGMENTS_KEY, SEGMENT_OUTBOX_KEY]);
  const allSegments = data[USAGE_SEGMENTS_KEY] || {};
  const outbox = data[SEGMENT_OUTBOX_KEY] || { dirtySegmentIds: [] };

  let modified = 0;
  const idsSet = new Set(ids);

  for (const id of idsSet) {
    if (allSegments[id]) {
      allSegments[id].uploadedAt = uploadedAt;
      allSegments[id].updatedAt = Date.now();
      modified++;
    }
  }

  // 从出站中移除已上传的 ID
  const remaining = outbox.dirtySegmentIds.filter(id => !idsSet.has(id));
  outbox.dirtySegmentIds = remaining;
  if (!outbox.retryCounts || typeof outbox.retryCounts !== 'object') outbox.retryCounts = {};
  if (!outbox.lastErrors || typeof outbox.lastErrors !== 'object') outbox.lastErrors = {};
  for (const id of idsSet) {
    delete outbox.retryCounts[id];
    delete outbox.lastErrors[id];
  }

  const updates = {
    [SEGMENT_OUTBOX_KEY]: outbox,
  };
  if (modified > 0) {
    updates[USAGE_SEGMENTS_KEY] = allSegments;
  }

  await chrome.storage.local.set(updates);
  return modified;
}

/**
 * 记录 segment 上传失败。保留出站中的脏 ID。
 * 递增重试计数并存储最后一次错误。
 */
export async function markUsageSegmentUploadFailed(segmentIds, error = 'unknown_error') {
  const ids = Array.isArray(segmentIds) ? segmentIds : [segmentIds];
  if (ids.length === 0) return;

  const data = await chrome.storage.local.get(SEGMENT_OUTBOX_KEY);
  const outbox = data[SEGMENT_OUTBOX_KEY] || { dirtySegmentIds: [], retryCounts: {}, lastErrors: {} };

  for (const id of ids) {
    outbox.retryCounts[id] = (outbox.retryCounts[id] || 0) + 1;
    outbox.lastErrors[id] = error;
  }

  await chrome.storage.local.set({ [SEGMENT_OUTBOX_KEY]: outbox });
}

/**
 * 将每日统计数据标记为已上传并清除出站条目。
 */
export async function markDailyStatsUploaded(dates, uploadedAt = Date.now()) {
  const dateList = Array.isArray(dates) ? dates : [dates];
  if (dateList.length === 0) return;

  const data = await chrome.storage.local.get(STATS_OUTBOX_KEY);
  const outbox = data[STATS_OUTBOX_KEY] || { dirtyDates: [] };

  const dateSet = new Set(dateList);
  outbox.dirtyDates = outbox.dirtyDates.filter(d => !dateSet.has(d));
  if (!outbox.retryCounts || typeof outbox.retryCounts !== 'object') outbox.retryCounts = {};
  if (!outbox.lastErrors || typeof outbox.lastErrors !== 'object') outbox.lastErrors = {};
  for (const date of dateSet) {
    delete outbox.retryCounts[date];
    delete outbox.lastErrors[date];
  }

  await chrome.storage.local.set({ [STATS_OUTBOX_KEY]: outbox });
}

export async function markHourlyStatsUploaded(hourKeys, uploadedAt = Date.now()) {
  const hourKeyList = Array.isArray(hourKeys) ? hourKeys : [hourKeys];
  if (hourKeyList.length === 0) return;

  const data = await chrome.storage.local.get([HOURLY_STATS_KEY, HOURLY_STATS_OUTBOX_KEY]);
  const allStats = data[HOURLY_STATS_KEY] || {};
  const outbox = data[HOURLY_STATS_OUTBOX_KEY] || { dirtyHourKeys: [] };

  const hourKeySet = new Set(hourKeyList);
  for (const hourKey of hourKeySet) {
    if (allStats[hourKey]) {
      allStats[hourKey] = { ...allStats[hourKey], uploadedAt, lastUploadedAt: uploadedAt };
    }
  }
  outbox.dirtyHourKeys = (outbox.dirtyHourKeys || []).filter((key) => !hourKeySet.has(key));
  if (!outbox.retryCounts || typeof outbox.retryCounts !== 'object') outbox.retryCounts = {};
  if (!outbox.lastErrors || typeof outbox.lastErrors !== 'object') outbox.lastErrors = {};
  for (const hourKey of hourKeySet) {
    delete outbox.retryCounts[hourKey];
    delete outbox.lastErrors[hourKey];
  }

  await chrome.storage.local.set({
    [HOURLY_STATS_KEY]: allStats,
    [HOURLY_STATS_OUTBOX_KEY]: outbox,
  });
}

export async function markTargetStatsUploaded(dates, uploadedAt = Date.now()) {
  const dateList = Array.isArray(dates) ? dates : [dates];
  if (dateList.length === 0) return;

  const data = await chrome.storage.local.get(TARGET_STATS_OUTBOX_KEY);
  const outbox = data[TARGET_STATS_OUTBOX_KEY] || { dirtyDates: [] };

  const dateSet = new Set(dateList);
  outbox.dirtyDates = (outbox.dirtyDates || []).filter(d => !dateSet.has(d));
  if (!outbox.retryCounts || typeof outbox.retryCounts !== 'object') outbox.retryCounts = {};
  if (!outbox.lastErrors || typeof outbox.lastErrors !== 'object') outbox.lastErrors = {};
  for (const date of dateSet) {
    delete outbox.retryCounts[date];
    delete outbox.lastErrors[date];
  }

  await chrome.storage.local.set({ [TARGET_STATS_OUTBOX_KEY]: outbox });
}

export async function markHourlyTargetStatsUploaded(hourKeys, uploadedAt = Date.now()) {
  const hourKeyList = Array.isArray(hourKeys) ? hourKeys : [hourKeys];
  if (hourKeyList.length === 0) return;

  const data = await chrome.storage.local.get(HOURLY_TARGET_STATS_OUTBOX_KEY);
  const outbox = data[HOURLY_TARGET_STATS_OUTBOX_KEY] || { dirtyHourKeys: [] };

  const hourKeySet = new Set(hourKeyList);
  outbox.dirtyHourKeys = (outbox.dirtyHourKeys || []).filter((key) => !hourKeySet.has(key));
  if (!outbox.retryCounts || typeof outbox.retryCounts !== 'object') outbox.retryCounts = {};
  if (!outbox.lastErrors || typeof outbox.lastErrors !== 'object') outbox.lastErrors = {};
  for (const hourKey of hourKeySet) {
    delete outbox.retryCounts[hourKey];
    delete outbox.lastErrors[hourKey];
  }

  await chrome.storage.local.set({ [HOURLY_TARGET_STATS_OUTBOX_KEY]: outbox });
}

/**
 * 记录统计数据上传失败。保留出站中的脏日期。
 */
export async function markDailyStatsUploadFailed(dates, error = 'unknown_error') {
  const dateList = Array.isArray(dates) ? dates : [dates];
  if (dateList.length === 0) return;

  const data = await chrome.storage.local.get(STATS_OUTBOX_KEY);
  const outbox = data[STATS_OUTBOX_KEY] || { dirtyDates: [], retryCounts: {}, lastErrors: {} };

  for (const d of dateList) {
    outbox.retryCounts[d] = (outbox.retryCounts[d] || 0) + 1;
    outbox.lastErrors[d] = error;
  }

  await chrome.storage.local.set({ [STATS_OUTBOX_KEY]: outbox });
}

export async function markHourlyStatsUploadFailed(hourKeys, error = 'unknown_error') {
  const hourKeyList = Array.isArray(hourKeys) ? hourKeys : [hourKeys];
  if (hourKeyList.length === 0) return;

  const data = await chrome.storage.local.get(HOURLY_STATS_OUTBOX_KEY);
  const outbox = data[HOURLY_STATS_OUTBOX_KEY] || { dirtyHourKeys: [], retryCounts: {}, lastErrors: {} };
  const dirtySet = new Set(outbox.dirtyHourKeys || []);
  if (!outbox.retryCounts || typeof outbox.retryCounts !== 'object') outbox.retryCounts = {};
  if (!outbox.lastErrors || typeof outbox.lastErrors !== 'object') outbox.lastErrors = {};

  for (const key of hourKeyList) {
    dirtySet.add(key);
    outbox.retryCounts[key] = (outbox.retryCounts[key] || 0) + 1;
    outbox.lastErrors[key] = error;
  }
  outbox.dirtyHourKeys = [...dirtySet];

  await chrome.storage.local.set({ [HOURLY_STATS_OUTBOX_KEY]: outbox });
}

export async function markTargetStatsUploadFailed(dates, error = 'unknown_error') {
  const dateList = Array.isArray(dates) ? dates : [dates];
  if (dateList.length === 0) return;

  const data = await chrome.storage.local.get(TARGET_STATS_OUTBOX_KEY);
  const outbox = data[TARGET_STATS_OUTBOX_KEY] || { dirtyDates: [], retryCounts: {}, lastErrors: {} };
  const dirtySet = new Set(outbox.dirtyDates || []);
  if (!outbox.retryCounts || typeof outbox.retryCounts !== 'object') outbox.retryCounts = {};
  if (!outbox.lastErrors || typeof outbox.lastErrors !== 'object') outbox.lastErrors = {};

  for (const d of dateList) {
    dirtySet.add(d);
    outbox.retryCounts[d] = (outbox.retryCounts[d] || 0) + 1;
    outbox.lastErrors[d] = error;
  }
  outbox.dirtyDates = [...dirtySet];

  await chrome.storage.local.set({ [TARGET_STATS_OUTBOX_KEY]: outbox });
}

export async function markHourlyTargetStatsUploadFailed(hourKeys, error = 'unknown_error') {
  const hourKeyList = Array.isArray(hourKeys) ? hourKeys : [hourKeys];
  if (hourKeyList.length === 0) return;

  const data = await chrome.storage.local.get(HOURLY_TARGET_STATS_OUTBOX_KEY);
  const outbox = data[HOURLY_TARGET_STATS_OUTBOX_KEY] || { dirtyHourKeys: [], retryCounts: {}, lastErrors: {} };
  const dirtySet = new Set(outbox.dirtyHourKeys || []);
  if (!outbox.retryCounts || typeof outbox.retryCounts !== 'object') outbox.retryCounts = {};
  if (!outbox.lastErrors || typeof outbox.lastErrors !== 'object') outbox.lastErrors = {};

  for (const key of hourKeyList) {
    dirtySet.add(key);
    outbox.retryCounts[key] = (outbox.retryCounts[key] || 0) + 1;
    outbox.lastErrors[key] = error;
  }
  outbox.dirtyHourKeys = [...dirtySet];

  await chrome.storage.local.set({ [HOURLY_TARGET_STATS_OUTBOX_KEY]: outbox });
}

// ── 出站清理 ────────────────────────────────────────────────────────────────────

/**
 * 清理超过保留期的段同步出站条目。
 */
export async function pruneSegmentSyncOutbox(retentionDays = DEFAULT_RETENTION_DAYS) {
  const data = await chrome.storage.local.get(SEGMENT_OUTBOX_KEY);
  const outbox = data[SEGMENT_OUTBOX_KEY] || { dirtySegmentIds: [], retryCounts: {}, lastErrors: {} };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffMs = cutoff.getTime();

  // 仅移除日期安全的条目 — 保持重试计数仅用于活动条目
  const originalCount = outbox.dirtySegmentIds.length;

  // 保留所有条目；仅清理重试元数据中超过截止日期的条目
  const prunedRetry = {};
  let prunedCount = 0;
  for (const [id, count] of Object.entries(outbox.retryCounts || {})) {
    const datePart = id.substring(4, 12); // seg-YYYYMMDD-xxx
    const dateMs = new Date(
      parseInt(datePart.substring(0, 4)),
      parseInt(datePart.substring(4, 6)) - 1,
      parseInt(datePart.substring(6, 8))
    ).getTime();
    if (dateMs >= cutoffMs) {
      prunedRetry[id] = count;
    } else {
      prunedCount++;
    }
  }

  outbox.retryCounts = prunedRetry;
  await chrome.storage.local.set({ [SEGMENT_OUTBOX_KEY]: outbox });

  return prunedCount;
}

/**
 * 清理超过保留期的统计同步出站条目。
 */
export async function pruneStatsSyncOutbox(retentionDays = DEFAULT_RETENTION_DAYS) {
  const data = await chrome.storage.local.get(STATS_OUTBOX_KEY);
  const outbox = data[STATS_OUTBOX_KEY] || { dirtyDates: [], retryCounts: {}, lastErrors: {} };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  // 移除超过截止日期的脏日期
  const originalDates = outbox.dirtyDates;
  outbox.dirtyDates = outbox.dirtyDates.filter(d => new Date(d) >= cutoff);

  // 并行清理重试元数据
  const prunedRetry = {};
  for (const [date, count] of Object.entries(outbox.retryCounts || {})) {
    if (new Date(date) >= cutoff) {
      prunedRetry[date] = count;
    }
  }
  outbox.retryCounts = prunedRetry;

  await chrome.storage.local.set({ [STATS_OUTBOX_KEY]: outbox });

  return originalDates.length - outbox.dirtyDates.length;
}

export async function pruneTargetStatsSyncOutbox(retentionDays = DEFAULT_RETENTION_DAYS) {
  const data = await chrome.storage.local.get(TARGET_STATS_OUTBOX_KEY);
  const outbox = data[TARGET_STATS_OUTBOX_KEY] || { dirtyDates: [], retryCounts: {}, lastErrors: {} };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const originalDates = outbox.dirtyDates || [];
  outbox.dirtyDates = originalDates.filter(d => new Date(d) >= cutoff);

  const prunedRetry = {};
  for (const [date, count] of Object.entries(outbox.retryCounts || {})) {
    if (new Date(date) >= cutoff) {
      prunedRetry[date] = count;
    }
  }
  outbox.retryCounts = prunedRetry;

  await chrome.storage.local.set({ [TARGET_STATS_OUTBOX_KEY]: outbox });

  return originalDates.length - outbox.dirtyDates.length;
}

export async function pruneHourlyStatsSyncOutbox(retentionDays = DEFAULT_RETENTION_DAYS) {
  const data = await chrome.storage.local.get(HOURLY_STATS_OUTBOX_KEY);
  const outbox = data[HOURLY_STATS_OUTBOX_KEY] || { dirtyHourKeys: [], retryCounts: {}, lastErrors: {} };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const originalHourKeys = outbox.dirtyHourKeys || [];
  outbox.dirtyHourKeys = originalHourKeys.filter((key) => new Date(String(key).slice(0, 10)) >= cutoff);

  const prunedRetry = {};
  for (const [hourKey, count] of Object.entries(outbox.retryCounts || {})) {
    if (new Date(String(hourKey).slice(0, 10)) >= cutoff) {
      prunedRetry[hourKey] = count;
    }
  }
  outbox.retryCounts = prunedRetry;

  await chrome.storage.local.set({ [HOURLY_STATS_OUTBOX_KEY]: outbox });
  return originalHourKeys.length - outbox.dirtyHourKeys.length;
}

export async function pruneHourlyTargetStatsSyncOutbox(retentionDays = DEFAULT_RETENTION_DAYS) {
  const data = await chrome.storage.local.get(HOURLY_TARGET_STATS_OUTBOX_KEY);
  const outbox = data[HOURLY_TARGET_STATS_OUTBOX_KEY] || { dirtyHourKeys: [], retryCounts: {}, lastErrors: {} };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const originalHourKeys = outbox.dirtyHourKeys || [];
  outbox.dirtyHourKeys = originalHourKeys.filter((key) => new Date(String(key).slice(0, 10)) >= cutoff);

  const prunedRetry = {};
  for (const [hourKey, count] of Object.entries(outbox.retryCounts || {})) {
    if (new Date(String(hourKey).slice(0, 10)) >= cutoff) {
      prunedRetry[hourKey] = count;
    }
  }
  outbox.retryCounts = prunedRetry;

  await chrome.storage.local.set({ [HOURLY_TARGET_STATS_OUTBOX_KEY]: outbox });
  return originalHourKeys.length - outbox.dirtyHourKeys.length;
}

// ── Payload builders ────────────────────────────────────────────────────────────

/**
 * 构建 usage segments 的上传载荷。
 * 目标端点：POST /device/usage-segments/v1（未来）
 */
export async function buildUsageSegmentsUploadPayload(segmentIds) {
  const ids = Array.isArray(segmentIds) ? segmentIds : [segmentIds];
  if (ids.length === 0) return { schemaVersion: 1, segments: [] };

  const data = await chrome.storage.local.get(USAGE_SEGMENTS_KEY);
  const allSegments = data[USAGE_SEGMENTS_KEY] || {};

  const segments = [];
  for (const id of ids) {
    const seg = allSegments[id];
    if (!seg) continue;
    segments.push({
      id: seg.id,
      date: seg.date,
      timezone: seg.timezone,
      dayStartMs: seg.dayStartMs,
      dayEndMs: seg.dayEndMs,
      startMs: seg.startMs,
      endMs: seg.endMs,
      durationSeconds: seg.durationSeconds,
      domain: seg.domain,
      tabId: seg.tabId ?? null,
      windowId: seg.windowId ?? null,
      managedTargetId: seg.managedTargetId || null,
      managedTargetType: seg.managedTargetType || null,
      managedTargetNamespace: seg.managedTargetNamespace || null,
      managedTargetValue: seg.managedTargetValue || null,
      managedTargetLabelAtTime: seg.managedTargetLabelAtTime || null,
      targetSourceAtTime: seg.targetSourceAtTime || null,
      targetRuleId: seg.targetRuleId || null,
      targetMatchLevel: seg.targetMatchLevel || null,
      targetClassificationAtTime: seg.targetClassificationAtTime || null,
      quotaBucketAtTime: seg.quotaBucketAtTime || null,
      channel: seg.channel,
      mode: seg.mode,
      sourceState: seg.sourceState,
      settlementReason: seg.settlementReason,
      description: seg.description || null,
      parentSegmentId: seg.parentSegmentId || null,
      partIndex: seg.partIndex || 1,
      partCount: seg.partCount || 1,
      createdAt: seg.createdAt,
      updatedAt: seg.updatedAt,
    });
  }

  return {
    schemaVersion: 1,
    segments,
  };
}

/**
 * 构建每日统计的上传载荷。
 * 目标端点：POST /device/stats/v1（未来）
 */
export async function buildDailyStatsUploadPayload(date) {
  const data = await chrome.storage.local.get(DAILY_STATS_KEY);
  const allStats = data[DAILY_STATS_KEY] || {};
  const dayStats = allStats[date];

  if (!dayStats || !dayStats.domains) {
    return { schemaVersion: 1, date, timezone: 'Asia/Shanghai', dayStartMs: null, dayEndMs: null, domains: [] };
  }

  const domains = [];
  for (const [domain, ds] of Object.entries(dayStats.domains)) {
    if (ds === null || ds === undefined) continue;
    const legacyNumberSeconds = (typeof ds === 'number' && Number.isFinite(ds) && ds > 0)
      ? ds
      : 0;
    const activeSeconds = legacyNumberSeconds || ds.activeSeconds || 0;
    const backgroundMediaSeconds = (typeof ds === 'object' ? (ds.backgroundMediaSeconds || 0) : 0);
    const pipSeconds = (typeof ds === 'object' ? (ds.pipSeconds || 0) : 0);
    const activeByMode = (typeof ds === 'object' && ds.activeByMode && typeof ds.activeByMode === 'object')
      ? ds.activeByMode
      : (activeSeconds > 0 ? { unknown: activeSeconds } : {});
    const backgroundMediaByMode = (typeof ds === 'object' && ds.backgroundMediaByMode && typeof ds.backgroundMediaByMode === 'object')
      ? ds.backgroundMediaByMode
      : (backgroundMediaSeconds > 0 ? { unknown: backgroundMediaSeconds } : {});
    const pipByMode = (typeof ds === 'object' && ds.pipByMode && typeof ds.pipByMode === 'object')
      ? ds.pipByMode
      : (pipSeconds > 0 ? { unknown: pipSeconds } : {});

    domains.push({
      domain,
      activeSeconds,
      backgroundMediaSeconds,
      pipSeconds,
      totalSeconds: (typeof ds === 'object' && Number.isFinite(ds.totalSeconds))
        ? ds.totalSeconds
        : (activeSeconds + backgroundMediaSeconds + pipSeconds),
      activeByMode,
      backgroundMediaByMode,
      pipByMode,
      firstSeenAt: typeof ds === 'object' ? ds.firstSeenAt : null,
      lastSeenAt: typeof ds === 'object' ? ds.lastSeenAt : null,
      lastUpdatedAt: typeof ds === 'object' ? ds.lastUpdatedAt : null,
    });
  }

  return {
    schemaVersion: 1,
    date,
    timezone: dayStats.timezone || 'Asia/Shanghai',
    dayStartMs: dayStats.dayStartMs,
    dayEndMs: dayStats.dayEndMs,
    segmentsCount: dayStats.segmentsCount || 0,
    lastSegmentId: dayStats.lastSegmentId || null,
    domains,
  };
}

function buildTargetRows(targets) {
  const rows = [];
  for (const [targetKey, ts] of Object.entries(targets || {})) {
    if (!ts || typeof ts !== 'object') continue;
    const activeSeconds = Number(ts.activeSeconds || 0);
    const backgroundMediaSeconds = Number(ts.backgroundMediaSeconds || 0);
    const pipSeconds = Number(ts.pipSeconds || 0);
    const totalSeconds = Number.isFinite(ts.totalSeconds)
      ? Number(ts.totalSeconds)
      : activeSeconds + backgroundMediaSeconds + pipSeconds;
    if (totalSeconds <= 0) continue;

    rows.push({
      targetKey: ts.targetKey || targetKey,
      managedTargetId: ts.managedTargetId || null,
      managedTargetType: ts.managedTargetType || null,
      managedTargetNamespace: ts.managedTargetNamespace || null,
      managedTargetValue: ts.managedTargetValue || null,
      managedTargetLabelAtTime: ts.managedTargetLabelAtTime || null,
      targetSourceAtTime: ts.targetSourceAtTime || null,
      targetRuleId: ts.targetRuleId || null,
      targetMatchLevel: ts.targetMatchLevel || null,
      targetClassificationAtTime: ts.targetClassificationAtTime || null,
      fallbackDomain: ts.fallbackDomain || null,
      isFallback: !!ts.isFallback,
      activeSeconds,
      backgroundMediaSeconds,
      pipSeconds,
      totalSeconds,
      activeByMode: ts.activeByMode || {},
      backgroundMediaByMode: ts.backgroundMediaByMode || {},
      pipByMode: ts.pipByMode || {},
      activeByQuotaBucket: ts.activeByQuotaBucket || {},
      backgroundMediaByQuotaBucket: ts.backgroundMediaByQuotaBucket || {},
      pipByQuotaBucket: ts.pipByQuotaBucket || {},
      rows: Object.values(ts.rows || {}).filter((row) =>
        row && typeof row === 'object' && Number(row.durationSeconds || 0) > 0
      ),
      firstSeenAt: ts.firstSeenAt || null,
      lastSeenAt: ts.lastSeenAt || null,
      lastUpdatedAt: ts.lastUpdatedAt || null,
    });
  }
  return rows;
}

/**
 * 构建每日 managed target 统计上传载荷。
 * 目标端点：POST /device/target-stats/v1
 */
export async function buildTargetStatsUploadPayload(date) {
  const data = await chrome.storage.local.get(DAILY_STATS_KEY);
  const allStats = data[DAILY_STATS_KEY] || {};
  const dayStats = allStats[date];

  if (!dayStats || !dayStats.targets) {
    return { schemaVersion: 1, date, timezone: 'Asia/Shanghai', dayStartMs: null, dayEndMs: null, targets: [] };
  }

  return {
    schemaVersion: 1,
    date,
    timezone: dayStats.timezone || 'Asia/Shanghai',
    dayStartMs: dayStats.dayStartMs,
    dayEndMs: dayStats.dayEndMs,
    segmentsCount: dayStats.segmentsCount || 0,
    lastSegmentId: dayStats.lastSegmentId || null,
    targets: buildTargetRows(dayStats.targets),
  };
}

export async function buildHourlyStatsUploadPayload(hourKey) {
  const data = await chrome.storage.local.get(HOURLY_STATS_KEY);
  const allStats = data[HOURLY_STATS_KEY] || {};
  const hourStats = allStats[hourKey];

  if (!hourStats || !hourStats.domains) {
    const date = typeof hourKey === 'string' ? hourKey.slice(0, 10) : null;
    const hour = typeof hourKey === 'string' ? Number(hourKey.slice(11, 13)) : null;
    return { schemaVersion: 1, hourKey, date, hour, timezone: 'Asia/Shanghai', hourStartMs: null, hourEndMs: null, domains: [] };
  }

  const domains = [];
  for (const [domain, ds] of Object.entries(hourStats.domains)) {
    if (ds === null || ds === undefined) continue;
    const activeSeconds = ds.activeSeconds || 0;
    const backgroundMediaSeconds = ds.backgroundMediaSeconds || 0;
    const pipSeconds = ds.pipSeconds || 0;
    domains.push({
      domain,
      activeSeconds,
      backgroundMediaSeconds,
      pipSeconds,
      totalSeconds: Number.isFinite(ds.totalSeconds) ? ds.totalSeconds : (activeSeconds + backgroundMediaSeconds + pipSeconds),
      activeByMode: ds.activeByMode || {},
      backgroundMediaByMode: ds.backgroundMediaByMode || {},
      pipByMode: ds.pipByMode || {},
      firstSeenAt: ds.firstSeenAt || null,
      lastSeenAt: ds.lastSeenAt || null,
      lastUpdatedAt: ds.lastUpdatedAt || null,
    });
  }

  return {
    schemaVersion: 1,
    hourKey,
    date: hourStats.date || String(hourKey).slice(0, 10),
    hour: Number.isInteger(hourStats.hour) ? hourStats.hour : Number(String(hourKey).slice(11, 13)),
    timezone: hourStats.timezone || 'Asia/Shanghai',
    hourStartMs: hourStats.hourStartMs,
    hourEndMs: hourStats.hourEndMs,
    segmentsCount: hourStats.segmentsCount || 0,
    lastSegmentId: hourStats.lastSegmentId || null,
    domains,
  };
}

/**
 * 构建每小时 managed target 统计上传载荷。
 * 目标端点：POST /device/hourly-target-stats/v1
 */
export async function buildHourlyTargetStatsUploadPayload(hourKey) {
  const data = await chrome.storage.local.get(HOURLY_STATS_KEY);
  const allStats = data[HOURLY_STATS_KEY] || {};
  const hourStats = allStats[hourKey];

  if (!hourStats || !hourStats.targets) {
    const date = typeof hourKey === 'string' ? hourKey.slice(0, 10) : null;
    const hour = typeof hourKey === 'string' ? Number(hourKey.slice(11, 13)) : null;
    return { schemaVersion: 1, hourKey, date, hour, timezone: 'Asia/Shanghai', hourStartMs: null, hourEndMs: null, targets: [] };
  }

  return {
    schemaVersion: 1,
    hourKey,
    date: hourStats.date || String(hourKey).slice(0, 10),
    hour: Number.isInteger(hourStats.hour) ? hourStats.hour : Number(String(hourKey).slice(11, 13)),
    timezone: hourStats.timezone || 'Asia/Shanghai',
    hourStartMs: hourStats.hourStartMs,
    hourEndMs: hourStats.hourEndMs,
    segmentsCount: hourStats.segmentsCount || 0,
    lastSegmentId: hourStats.lastSegmentId || null,
    targets: buildTargetRows(hourStats.targets),
  };
}

// ── 清理 ────────────────────────────────────────────────────────────────────────

/**
 * 删除超过保留期的 segments。
 */
export async function pruneUsageSegments(retentionDays = DEFAULT_RETENTION_DAYS) {
  const data = await chrome.storage.local.get([USAGE_SEGMENTS_KEY, SEGMENT_INDEX_KEY]);
  const allSegments = data[USAGE_SEGMENTS_KEY] || {};
  const index = data[SEGMENT_INDEX_KEY] || {};

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffMs = cutoff.getTime();

  let pruned = 0;
  const datesToPrune = [];

  for (const [date, ids] of Object.entries(index)) {
    const dateMs = new Date(date).getTime();
    if (dateMs < cutoffMs) {
      for (const id of ids) {
        if (allSegments[id]) {
          delete allSegments[id];
          pruned++;
        }
      }
      datesToPrune.push(date);
    }
  }

  for (const date of datesToPrune) {
    delete index[date];
  }

  if (pruned > 0) {
    await chrome.storage.local.set({
      [USAGE_SEGMENTS_KEY]: allSegments,
      [SEGMENT_INDEX_KEY]: index,
    });
  }

  return pruned;
}

/**
 * 删除超过保留期的每日聚合。
 */
export async function pruneDailyUsageStats(retentionDays = DEFAULT_RETENTION_DAYS) {
  const data = await chrome.storage.local.get(DAILY_STATS_KEY);
  const stats = data[DAILY_STATS_KEY] || {};

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffMs = cutoff.getTime();

  let pruned = 0;
  for (const date of Object.keys(stats)) {
    const dateMs = new Date(date).getTime();
    if (dateMs < cutoffMs) {
      delete stats[date];
      pruned++;
    }
  }

  if (pruned > 0) {
    await chrome.storage.local.set({ [DAILY_STATS_KEY]: stats });
  }

  return pruned;
}

export async function pruneHourlyUsageStats(retentionDays = DEFAULT_RETENTION_DAYS) {
  const data = await chrome.storage.local.get(HOURLY_STATS_KEY);
  const stats = data[HOURLY_STATS_KEY] || {};

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffMs = cutoff.getTime();

  let pruned = 0;
  for (const hourKey of Object.keys(stats)) {
    const dateMs = new Date(String(hourKey).slice(0, 10)).getTime();
    if (dateMs < cutoffMs) {
      delete stats[hourKey];
      pruned++;
    }
  }

  if (pruned > 0) {
    await chrome.storage.local.set({ [HOURLY_STATS_KEY]: stats });
  }

  return pruned;
}

// ── 主结算入口 ──────────────────────────────────────────────────────────────────

/**
 * 结算已完成的持续时间 segment。
 *
 * 这是所有持续时间关闭路径必须经过的单一入口点。
 * 它处理：
 * 1. 按本地日期拆分
 * 2. 构建 segment 对象
 * 3. 追加到 usage_segments_v1
 * 4. 增量更新 daily_usage_stats_v1 / hourly_usage_stats_v1
 * 5. 标记出站为脏
 *
 * @param {Object} input - Segment 输入参数
 * @returns {Promise<number>} 创建的 segments 数量
 */
export async function settleUsageDuration(input) {
  // 跳过不可计数的状态
  if (input.sourceState && !isCountedState(input.sourceState)) {
    return 0;
  }

  // 默认只跳过无正向时间跨度；显式 diagnostic boundary 允许 endMs == startMs。
  const durationMs = (input.endMs || 0) - (input.startMs || 0);
  if (durationMs < 0 || (durationMs === 0 && !input.allowZeroDurationSegment)) return 0;

  const channel = input.channel || stateToChannel(input.sourceState);
  if (!channel) return 0;
  const normalizedInput = { ...input, channel };

  // 按本地日期拆分
  const segments = splitSegmentByLocalDate(normalizedInput);
  if (segments.length === 0) return 0;

  const existingSegments = await getAllUsageSegments();
  const existingIds = new Set(Object.keys(existingSegments || {}));
  const newSegments = segments.filter((seg) => seg?.id && !existingIds.has(seg.id));

  // 追加 segments
  const appended = await appendUsageSegments(segments);
  if (appended === 0) return 0; // 全部重复

  // 增量聚合
  const datesSet = new Set();
  const hourKeysSet = new Set();
  for (const seg of newSegments) {
    await incrementDailyUsageStats(seg);
    await incrementHourlyUsageStats(seg);
    datesSet.add(seg.date);
    for (const slice of splitSegmentByLocalHour(seg)) {
      if (slice.hourKey) hourKeysSet.add(slice.hourKey);
    }
  }

  // 标记出站
  const validIds = newSegments.map(s => s.id).filter(Boolean);
  if (validIds.length > 0) {
    await markSegmentSyncDirty(validIds);
  }
  await markStatsSyncDirty([...datesSet]);
  await markHourlyStatsSyncDirty([...hourKeysSet]);
  await markTargetStatsSyncDirty([...datesSet]);
  await markHourlyTargetStatsSyncDirty([...hourKeysSet]);

  return appended;
}

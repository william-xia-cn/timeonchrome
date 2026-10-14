// Independent website gate; application execution belongs to Native.
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const WEBSITE_TYPES = ['study', 'composite', 'restricted', 'other'];
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const WEEK_MS = 7 * DAY_MS;
const BEIJING_OFFSET_MS = 8 * 60 * MINUTE_MS;

export const DOWNTIME_DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
export const DOWNTIME_WEBSITE_LABELS = { study: '学习网站', composite: '复合网站', restricted: '受限娱乐网站', other: '其他网站' };
export const DOWNTIME_APPLICATION_LABELS = { study: '学习应用', composite: '复合应用', restrictedEntertainment: '受限娱乐应用', other: '其他应用' };

export function readDowntimeConfig(value) {
  if (value === undefined) return { ok: true, configured: false, config: { schemaVersion: 1, enabled: false,
    windowsByWeekday: Object.fromEntries(DAYS.map(day => [day, []])), allowedWebsiteTypes: [], allowedApplicationTypes: [] } };
  const fields = ['schemaVersion', 'enabled', 'windowsByWeekday', 'allowedWebsiteTypes', 'allowedApplicationTypes'];
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key))
    || value.schemaVersion !== 1 || typeof value.enabled !== 'boolean' || !policyIntervals(value)
    || !Array.isArray(value.allowedApplicationTypes) || value.allowedApplicationTypes.length > 4
    || value.allowedApplicationTypes.some(type => typeof type !== 'string' || !Object.hasOwn(DOWNTIME_APPLICATION_LABELS, type))
    || new Set(value.allowedApplicationTypes).size !== value.allowedApplicationTypes.length) {
    return { ok: false, configured: true, errorCode: 'invalid_downtime_config', config: null };
  }
  return { ok: true, configured: true, config: { schemaVersion: 1, enabled: value.enabled,
    windowsByWeekday: Object.fromEntries(DAYS.map(day => [day, (value.windowsByWeekday[day] || [])
      .map(item => ({ start: item.start, end: item.end })).sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))])),
    allowedWebsiteTypes: WEBSITE_TYPES.filter(type => value.allowedWebsiteTypes.includes(type)),
    allowedApplicationTypes: Object.keys(DOWNTIME_APPLICATION_LABELS).filter(type => value.allowedApplicationTypes.includes(type)) } };
}

function emptyResult(reason) {
  return { ok: true, reason, active: false, blocked: false, exceptionApplied: false,
    activeUntilMs: null, nextChangeAtMs: null };
}

function invalidResult(reason) {
  return { ok: false, reason, active: null, blocked: null, exceptionApplied: false,
    activeUntilMs: null, nextChangeAtMs: null };
}

function minute(value, end = false) {
  if (end && value === '24:00') return 1440;
  if (typeof value !== 'string' || !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(value)) return null;
  const [hour, part] = value.split(':').map(Number);
  return hour * 60 + part;
}

function policyIntervals(policy) {
  const daily = policy.windowsByWeekday;
  const exceptions = policy.allowedWebsiteTypes;
  if (!daily || typeof daily !== 'object' || Array.isArray(daily)
    || Object.keys(daily).some(day => !DAYS.includes(day))
    || !Array.isArray(exceptions) || exceptions.length > WEBSITE_TYPES.length
    || exceptions.some(type => !WEBSITE_TYPES.includes(type))
    || new Set(exceptions).size !== exceptions.length) return null;

  const intervals = [];
  for (const [index, day] of DAYS.entries()) {
    const windows = Object.hasOwn(daily, day) ? daily[day] : [];
    if (!Array.isArray(windows) || windows.length > 32) return null;
    for (const window of windows) {
      if (!window || typeof window !== 'object' || Array.isArray(window)
        || Object.keys(window).length !== 2 || !Object.hasOwn(window, 'start') || !Object.hasOwn(window, 'end')) return null;
      const start = minute(window.start), end = minute(window.end, true);
      if (start === null || end === null || start === end) return null;
      intervals.push({ start: index * DAY_MS + start * MINUTE_MS,
        end: index * DAY_MS + (end < start ? 1440 + end : end) * MINUTE_MS });
    }
  }
  return intervals;
}

function mondayStartMs(atMs) {
  const shifted = new Date(atMs + BEIJING_OFFSET_MS);
  if (!Number.isFinite(shifted.getTime())) return null;
  const midnight = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return midnight - ((shifted.getUTCDay() + 6) % 7) * DAY_MS - BEIJING_OFFSET_MS;
}

// Include last week's Sunday spillover and next week's continuous intervals.
function expandedIntervals(intervals, weekStart) {
  const expanded = [];
  for (const week of [-1, 0, 1, 2]) {
    for (const item of intervals) expanded.push({
      start: weekStart + week * WEEK_MS + item.start,
      end: weekStart + week * WEEK_MS + item.end,
    });
  }
  expanded.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const item of expanded) {
    const previous = merged.at(-1);
    if (previous && item.start <= previous.end) previous.end = Math.max(previous.end, item.end);
    else merged.push({ ...item });
  }
  return merged;
}

/** Only determines the downtime gate; callers must still enforce their other restrictions. */
export function evaluateWebsiteDowntime(policy, websiteType, at = Date.now()) {
  if (policy === undefined || policy === null) return emptyResult('not_configured');
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)
    || typeof policy.enabled !== 'boolean') return invalidResult('invalid_policy');
  if (!policy.enabled) return emptyResult('disabled');
  const intervals = policyIntervals(policy);
  if (!intervals) return invalidResult('invalid_policy');
  const atMs = at instanceof Date ? at.getTime() : at;
  if (!Number.isSafeInteger(atMs)) return invalidResult('invalid_time');
  const weekStart = mondayStartMs(atMs);
  if (weekStart === null) return invalidResult('invalid_time');
  const expanded = expandedIntervals(intervals, weekStart);
  const active = expanded.find(item => atMs >= item.start && atMs < item.end);
  if (!active) return { ...emptyResult('outside_downtime'),
    nextChangeAtMs: expanded.find(item => item.start > atMs)?.start ?? null };
  const exceptionApplied = WEBSITE_TYPES.includes(websiteType) && policy.allowedWebsiteTypes.includes(websiteType);
  const activeUntilMs = active.end - active.start >= WEEK_MS ? null : active.end;
  return { ok: true, reason: exceptionApplied ? 'type_exception' : 'downtime', active: true,
    blocked: !exceptionApplied, exceptionApplied, activeUntilMs, nextChangeAtMs: activeUntilMs };
}

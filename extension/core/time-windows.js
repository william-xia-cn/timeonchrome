// core/time-windows.js - pure time-window read model for mode availability

export const TIME_WINDOW_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const DAY_BY_INDEX = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const MODE_WINDOW_FIELDS = {
  study: 'studyWindows',
  composite: 'compositeWindows',
  rest: 'restWindows',
};

export function timeWindowDayKeyForDate(input = new Date()) {
  if (typeof input === 'string') {
    if (TIME_WINDOW_DAYS.includes(input)) return input;
    const match = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const y = Number(match[1]);
      const m = Number(match[2]);
      const d = Number(match[3]);
      if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
        return DAY_BY_INDEX[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
      }
    }
  }
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return timeWindowDayKeyForDate(new Date());
  return DAY_BY_INDEX[date.getDay()];
}

export function modeWindowField(mode) {
  return MODE_WINDOW_FIELDS[mode] || null;
}

export function normalizeWindowList(windows) {
  if (!Array.isArray(windows) || windows.length === 0) return null;
  const normalized = [];
  for (const item of windows) {
    const start = typeof item?.start === 'string' ? item.start : '';
    const end = typeof item?.end === 'string' ? item.end : '';
    if (!start || !end) continue;
    normalized.push({ start, end });
  }
  return normalized.length ? normalized : null;
}

export function hasTimeWindowsDaily(config = {}) {
  return !!config?.timeWindows?.daily && typeof config.timeWindows.daily === 'object';
}

export function defaultTimeWindowsDaily() {
  const daily = {};
  for (const day of TIME_WINDOW_DAYS) {
    daily[day] = {
      studyWindows: null,
      compositeWindows: null,
      restWindows: [{ start: '15:30', end: '24:00' }],
    };
  }
  return daily;
}

export function effectiveTimeWindowsForDay(config = {}, dayKey = timeWindowDayKeyForDate()) {
  const daily = config?.timeWindows?.daily;
  const dayCfg = daily?.[dayKey] || {};
  return {
    studyWindows: normalizeWindowList(dayCfg.studyWindows),
    compositeWindows: normalizeWindowList(dayCfg.compositeWindows),
    restWindows: normalizeWindowList(dayCfg.restWindows),
  };
}

export function computeOnlineWindowsForDay(dayWindows = {}) {
  const study = normalizeWindowList(dayWindows.studyWindows);
  const composite = normalizeWindowList(dayWindows.compositeWindows);
  const rest = normalizeWindowList(dayWindows.restWindows);

  if (study === null || composite === null || rest === null) return null;

  const merged = [...study, ...composite, ...rest].sort((a, b) => a.start.localeCompare(b.start));
  const result = [];
  for (const window of merged) {
    if (result.length === 0 || window.start > result[result.length - 1].end) {
      result.push({ start: window.start, end: window.end });
    } else if (window.end > result[result.length - 1].end) {
      result[result.length - 1].end = window.end;
    }
  }
  return result;
}

function minutesForDate(input) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return minutesForDate(new Date());
  return date.getHours() * 60 + date.getMinutes();
}

function parseMinute(value) {
  const match = String(value || '').match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour === 24 && minute === 0) return 24 * 60;
  if (hour < 0 || hour > 23) return null;
  return hour * 60 + minute;
}

export function isWithinWindowList(windows, at = new Date()) {
  const normalized = normalizeWindowList(windows);
  if (normalized === null) return true;
  const current = minutesForDate(at);
  for (const window of normalized) {
    const start = parseMinute(window.start);
    const end = parseMinute(window.end);
    if (start === null || end === null || start >= end) continue;
    if (current >= start && current < end) return true;
  }
  return false;
}

export function getModeWindowStatus(config = {}, mode = 'study', at = new Date()) {
  const field = modeWindowField(mode);
  if (!field) {
    return { configured: false, allowed: true, mode, field: null, reason: 'unknown_mode' };
  }
  if (!hasTimeWindowsDaily(config)) {
    return { configured: false, allowed: true, mode, field, reason: 'not_configured' };
  }
  const dayKey = timeWindowDayKeyForDate(at);
  const dayCfg = config.timeWindows.daily?.[dayKey] || {};
  const windows = normalizeWindowList(dayCfg[field]);
  return {
    configured: true,
    allowed: windows === null ? true : isWithinWindowList(windows, at),
    mode,
    field,
    dayKey,
    windows,
    reason: windows === null ? 'unrestricted' : 'window_check',
  };
}

export function reminderReasonForModeWindow(mode) {
  if (mode === 'study') return 'study_schedule_locked';
  if (mode === 'composite') return 'composite_schedule_locked';
  if (mode === 'rest') return 'rest_schedule_locked';
  return 'schedule';
}

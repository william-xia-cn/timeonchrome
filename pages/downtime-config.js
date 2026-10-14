export const DOWNTIME_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
export const DOWNTIME_DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
export const DOWNTIME_WEBSITE_TYPES = { study: '学习网站', composite: '复合网站', restricted: '受限娱乐网站', other: '其他网站' };
export const DOWNTIME_APPLICATION_TYPES = { study: '学习应用', composite: '复合应用', restrictedEntertainment: '受限娱乐应用', other: '其他应用' };

export function defaultDowntimeConfig() {
  return { schemaVersion: 1, enabled: false,
    windowsByWeekday: Object.fromEntries(DOWNTIME_DAYS.map(day => [day, []])),
    allowedWebsiteTypes: [], allowedApplicationTypes: [] };
}

export function validateDowntimeConfig(value) {
  if (value === undefined) return null;
  const fields = ['schemaVersion', 'enabled', 'windowsByWeekday', 'allowedWebsiteTypes', 'allowedApplicationTypes'];
  const object = item => item && typeof item === 'object' && !Array.isArray(item);
  if (!object(value) || Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key)))
    return '停用时间配置必须包含版本、开关、周时段和两类例外';
  if (value.schemaVersion !== 1 || typeof value.enabled !== 'boolean') return '停用时间配置版本或开关无效';
  for (const [field, types] of [['allowedWebsiteTypes', DOWNTIME_WEBSITE_TYPES], ['allowedApplicationTypes', DOWNTIME_APPLICATION_TYPES]]) {
    const list = value[field];
    if (!Array.isArray(list) || list.length > Object.keys(types).length
      || list.some(type => typeof type !== 'string' || !Object.hasOwn(types, type)) || new Set(list).size !== list.length)
      return '停用时间例外只能选择学习、复合、受限娱乐或其他类型，且不能重复';
  }
  const daily = value.windowsByWeekday;
  if (!object(daily) || Object.keys(daily).some(day => !DOWNTIME_DAYS.includes(day))) return '停用时段必须按星期配置';
  const clock = item => typeof item === 'string' && /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(item);
  for (const [index, day] of DOWNTIME_DAYS.entries()) {
    const windows = Object.hasOwn(daily, day) ? daily[day] : [];
    if (!Array.isArray(windows) || windows.length > 32) return `${DOWNTIME_DAY_LABELS[index]}最多配置32个停用时段`;
    for (const item of windows) {
      if (!object(item) || Object.keys(item).length !== 2 || !clock(item.start)
        || !(clock(item.end) || item.end === '24:00') || item.start === item.end)
        return `${DOWNTIME_DAY_LABELS[index]}时段无效：开始为00:00-23:59，结束可为24:00，起止不能相同`;
    }
  }
  return null;
}

export function normalizeDowntimeConfig(value) {
  if (value === undefined) return defaultDowntimeConfig();
  const error = validateDowntimeConfig(value);
  if (error) throw new Error(error);
  return { schemaVersion: 1, enabled: value.enabled,
    windowsByWeekday: Object.fromEntries(DOWNTIME_DAYS.map(day => [day,
      (value.windowsByWeekday[day] || []).map(item => ({ start: item.start, end: item.end }))
        .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))])),
    allowedWebsiteTypes: Object.keys(DOWNTIME_WEBSITE_TYPES).filter(type => value.allowedWebsiteTypes.includes(type)),
    allowedApplicationTypes: Object.keys(DOWNTIME_APPLICATION_TYPES).filter(type => value.allowedApplicationTypes.includes(type)) };
}

export function normalizeDowntimeClock(value) {
  const text = String(value || '').trim();
  const match = /^(\d{1,2}):([0-5][0-9])$/.exec(text);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : text;
}

export function downtimeConfigSummary(value) {
  const config = normalizeDowntimeConfig(value);
  const windows = DOWNTIME_DAYS.flatMap((day, index) => config.windowsByWeekday[day]
    .map(item => `${DOWNTIME_DAY_LABELS[index]} ${item.start}-${item.end}${item.end < item.start ? '（次日）' : ''}`));
  const websites = config.allowedWebsiteTypes.map(type => DOWNTIME_WEBSITE_TYPES[type]).join('、') || '无';
  const apps = config.allowedApplicationTypes.map(type => DOWNTIME_APPLICATION_TYPES[type]).join('、') || '无';
  return `${config.enabled ? '开启' : '关闭'}；${windows.join('；') || '无停用时段'}；网站例外：${websites}；应用例外：${apps}`;
}

if (typeof window !== 'undefined') window.TimeOnChromeDowntime = {
  days: DOWNTIME_DAYS, dayLabels: DOWNTIME_DAY_LABELS, websiteTypes: DOWNTIME_WEBSITE_TYPES,
  applicationTypes: DOWNTIME_APPLICATION_TYPES, defaultConfig: defaultDowntimeConfig,
  validate: validateDowntimeConfig, normalize: normalizeDowntimeConfig,
  normalizeClock: normalizeDowntimeClock, summary: downtimeConfigSummary,
};

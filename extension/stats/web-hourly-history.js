// Display-only history adapter. Never persists statistics or combines sources.
const BUCKETS = ['study', 'composite', 'rest', 'other'];
const scopeKey = scope => JSON.stringify([scope?.profileId, scope?.deviceId, scope?.bindingToken]);

export function cloudWebHourSeries(rows, date, deviceId) {
  if (!Array.isArray(rows)) throw new Error('invalid_hourly_response');
  const series = Array.from({ length: 24 }, (_, hour) => ({
    key: `${date}-${hour}`, hour, label: `${hour}时`,
    categories: Object.fromEntries(BUCKETS.map(key => [key, 0])),
  }));
  for (const row of rows) {
    if (row.date !== date || row.device_id !== deviceId || row.channel !== 'active'
      || !Number.isInteger(row.hour) || row.hour < 0 || row.hour > 23
      || !BUCKETS.includes(row.quota_bucket)
      || !Number.isFinite(row.duration_seconds) || row.duration_seconds < 0) {
      throw new Error('invalid_hourly_row');
    }
    series[row.hour].categories[row.quota_bucket] += row.duration_seconds;
  }
  return series;
}

export function createWebHourlyHistoryReader({ readContext, request, today }) {
  const cache = new Map();
  let generation = 0, binding = null;
  return async function read(view, expectedContext) {
    const ticket = ++generation;
    const applies = view.kind === 'web' && view.range?.mode === 'day';
    if (!applies) return view;
    const scope = expectedContext || await readContext();
    const identity = scopeKey(scope);
    if (binding !== identity) { cache.clear(); binding = identity; }
    const date = view.range?.from;
    const local = view.hourlyRead || {};
    const unavailable = '所选日期小时数据暂不可用';
    const localResult = message => ({ ...view, hourlyNotice: message,
      hourlyEmptyMessage: local.available && local.complete && !view.totalSeconds
        ? '所选日期没有使用记录' : unavailable });
    if (date === today()) {
      return localResult(local.available && local.complete ? '本机小时统计' : `${unavailable}；仅显示本地已知部分，不代表零用量`);
    }
    const key = JSON.stringify([scope?.profileId, scope?.deviceId, date]);
    const stillCurrent = async () => {
      const current = await readContext();
      return ticket === generation && binding === identity && identity === scopeKey(current);
    };
    try {
      if (!scope?.profileId || !scope?.deviceId || !scope?.bindingToken) throw new Error('binding_unavailable');
      const query = new URLSearchParams({ from: date, to: date, deviceId: scope.deviceId, channel: 'active' });
      const response = await request(`/profiles/${encodeURIComponent(scope.profileId)}/hourly-target-stats/v1?${query}`);
      if (!response.ok) throw new Error(`hourly_http_${response.status}`);
      const body = await response.json();
      const series = cloudWebHourSeries(body.stats, date, scope.deviceId);
      if (!await stillCurrent()) return null;
      // Empty cloud rows do not establish zero if the preserved daily total is positive.
      if (!body.stats.length && view.totalSeconds > 0) throw new Error('hourly_missing');
      cache.set(key, series);
      if (cache.size > 8) cache.delete(cache.keys().next().value);
      if (local.pending) return localResult('本地小时读数（含未上传数据，可能不完整）；未与云端相加');
      return { ...view, chartSeries: series, hourlyNotice: '已上传小时统计 · 当前设备；不改变日总量',
        hourlyEmptyMessage: '所选日期没有使用记录' };
    } catch (_) {
      if (!await stillCurrent()) return null;
      if (local.pending) return localResult('本地小时读数（含未上传数据，可能不完整）；云端暂不可用');
      const saved = cache.get(key);
      if (saved) return { ...view, chartSeries: saved, hourlyNotice: '云端读取失败，显示同范围上次成功的小时读数（旧读数）',
        hourlyEmptyMessage: '上次成功读取的所选日期小时用量为零（旧读数）' };
      return localResult(`${unavailable}；${local.available ? '仅显示本地已知部分' : '日总量保持不变'}，不代表零用量`);
    }
  };
}

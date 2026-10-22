// Display-only history adapter. Never persists statistics or combines sources.
const BUCKETS = ['study', 'composite', 'rest', 'other'];
const scopeKey = scope => JSON.stringify([scope?.profileId, scope?.deviceId, scope?.bindingToken]);

// Only allowlisted codes reach the UI; never expose response bodies or arbitrary error text.
function hourlyFailure(error) {
  const messages = {
    binding_unavailable: '当前设备绑定信息不完整',
    invalid_hourly_response: '云端返回的小时数据结构不正确',
    hourly_scope_mismatch: '小时响应与当前孩子、设备或日期不匹配',
    invalid_hourly_row: '云端小时记录的日期、设备、通道或桶字段校验失败',
    hourly_missing: '云端未返回所选日期小时记录，但本地日总量非零',
    invalid_hourly_json: '云端响应不是有效JSON',
    hourly_timeout: '小时查询超时',
    hourly_network: '小时查询网络连接失败',
    hourly_request_failed: '小时查询未完成',
  };
  const message = String(error?.message || '');
  const http = /^hourly_http_([1-5]\d{2})$/.exec(message);
  if (http) {
    const status = Number(http[1]);
    const reason = status === 401 ? '设备授权无效'
      : status === 403 ? '设备已解绑或没有读取权限'
      : status === 404 ? '未找到对应孩子、设备或查询接口'
      : status === 429 ? '查询过于频繁'
      : status >= 500 ? '云端服务错误' : '云端拒绝小时查询';
    return { code: message, httpStatus: status, reason: `${reason}（HTTP ${status}）` };
  }
  const code = Object.hasOwn(messages, message) ? message
    : ['TimeoutError', 'AbortError'].includes(error?.name) ? 'hourly_timeout'
    : error?.name === 'TypeError' ? 'hourly_network' : 'hourly_request_failed';
  return { code, reason: messages[code] };
}

export function cloudWebHourSeries(rows, date, deviceId) {
  if (!Array.isArray(rows)) throw new Error('invalid_hourly_response');
  const series = Array.from({ length: 24 }, (_, hour) => ({
    key: `${date}-${hour}`, hour, label: `${hour}时`,
    categories: Object.fromEntries(BUCKETS.map(key => [key, 0])),
  }));
  for (const row of rows) {
    if (!row || typeof row !== 'object' || row.date !== date || row.device_id !== deviceId || row.channel !== 'active'
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
      const query = new URLSearchParams({ date });
      const response = await request(`/device/hourly-target-stats/v1?${query}`, scope.bindingToken);
      if (!response || typeof response.ok !== 'boolean') throw new Error('invalid_hourly_response');
      if (!response.ok) throw new Error(`hourly_http_${response.status}`);
      let body;
      try { body = await response.json(); } catch (error) {
        if (error?.name === 'SyntaxError') throw new Error('invalid_hourly_json');
        throw error;
      }
      if (!body || typeof body !== 'object') throw new Error('invalid_hourly_response');
      if (body.profileId !== scope.profileId || body.deviceId !== scope.deviceId || body.date !== date) {
        throw new Error('hourly_scope_mismatch');
      }
      const series = cloudWebHourSeries(body.stats, date, scope.deviceId);
      if (!await stillCurrent()) return null;
      // Empty cloud rows do not establish zero if the preserved daily total is positive.
      if (!body.stats.length && view.totalSeconds > 0) throw new Error('hourly_missing');
      cache.set(key, series);
      if (cache.size > 8) cache.delete(cache.keys().next().value);
      if (local.pending) return localResult('本地小时读数（含未上传数据，可能不完整）；未与云端相加');
      return { ...view, chartSeries: series, hourlyNotice: '已上传小时统计 · 当前设备；不改变日总量',
        hourlyEmptyMessage: '所选日期没有使用记录' };
    } catch (error) {
      if (!await stillCurrent()) return null;
      const failure = hourlyFailure(error);
      const diagnosed = result => ({ ...result, hourlyReadError: failure,
        hourlyNotice: `${result.hourlyNotice}；原因：${failure.reason} [${failure.code}]` });
      if (local.pending) return diagnosed(localResult('本地小时读数（含未上传数据，可能不完整）；云端暂不可用'));
      const saved = cache.get(key);
      if (saved) return diagnosed({ ...view, chartSeries: saved, hourlyNotice: '云端读取失败，显示同范围上次成功的小时读数（旧读数）',
        hourlyEmptyMessage: '上次成功读取的所选日期小时用量为零（旧读数）' });
      return diagnosed(localResult(`${unavailable}；${local.available ? '仅显示本地已知部分' : '日总量保持不变'}，不代表零用量`));
    }
  };
}

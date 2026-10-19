const text = v => v == null ? '未知' : String(v);
const time = v => v == null ? '未知' : new Date(v).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
const capabilityNames = { 'application-usage-seconds-read-v1': '应用秒用量读取',
  'shared-web-source-reusable-v2': '可复用孩子身份核验', 'quota-buckets-read-v1': '配额桶读取',
  'quota-buckets-sources-v1': '本机与其他设备来源读取', 'shared-access-policy-v2': '统一时间配置',
  'shared-forced-use-runtime-v2': '统一强行使用运行时' };

const failures = {
  diagnostics_sender_rejected: '管理页身份校验未通过',
  diagnostics_storage_read_failed: '本地诊断缓存读取失败',
  diagnostics_native_read_failed: '当前本地连接状态读取失败',
  diagnostics_shared_read_failed: '当前共享同步状态读取失败',
  diagnostics_projection_failed: '诊断摘要生成失败',
  diagnostics_read_failed: '后台诊断读取失败',
  diagnostics_background_unsupported: '后台尚未加载诊断接口，请重新加载扩展',
  diagnostics_response_invalid: '后台未返回有效诊断摘要',
  diagnostics_channel_unavailable: '管理页与后台通信失败',
  diagnostics_response_interrupted: '后台响应通道中断',
  diagnostics_context_invalidated: '管理页扩展上下文已失效，请重新打开管理页',
};
export function renderSharedSyncDiagnostics(container, model, failure = null, pageVersion = null) {
  container.replaceChildren();
  const doc = container.ownerDocument;
  const append = (parent, tag, value, className) => {
    const element = doc.createElement(tag); element.textContent = value;
    if (className) element.className = className;
    parent.append(element); return element;
  };
  if (!model) {
    const code = Object.hasOwn(failures, failure) ? failure : 'diagnostics_response_invalid';
    append(container, 'p', '共享诊断暂不可读；不代表用量为零。');
    append(container, 'p', `${failures[code]}（${code}）`);
    append(container, 'p', `页面版本：${pageVersion || '未知'}；不代表后台已加载同一版本。`);
    return;
  }
  const rows = append(container, 'dl', '', 'shared-sync-summary');
  const row = (name, value) => { append(rows, 'dt', name); const detail = append(rows, 'dd', value);
    if (detail.style) { detail.style.overflowWrap = 'anywhere'; detail.style.minWidth = '0'; } };
  const c = model.connection || {};
  row('运行版本', text(model.version));
  row('当前连接', c.connectedCurrent === true ? '已连接' : c.connectedCurrent === false ? '未连接' : '未知');
  row('历史连接成功时间', time(c.lastSuccessAtMsHistorical));
  row('历史连接错误码', text(c.lastErrorCodeHistorical));
  const rejection = c.responseRejection;
  row('本次后台最近响应拒绝', rejection
    ? `${time(rejection.atMs)} · ${text(rejection.messageType)} / ${text(rejection.channel)} · ${text(rejection.reason)} · 服务码 ${text(rejection.serviceErrorCode)}`
    : '尚未采样；历史错误无法反推拒绝分支');
  row('协议', c.protocolVersion == null ? '未知' : `v${c.protocolVersion}`);
  row('已协商能力', c.capabilities == null ? '未知' : c.capabilities.map(v => capabilityNames[v] || '未知能力').join('、') || '无');
  row('应用用量读取能力', c.applicationUsageSupported === true ? '支持' : c.applicationUsageSupported === false ? '未协商' : '未知');
  const v2 = model.v2;
  if (v2) {
    row('V2 当前只读观测', '读取已有缓存，不发起同步；以下不代表共享已启用');
    row('网页调试权限', v2.debuggerGranted === true ? '已授予' : v2.debuggerGranted === false ? '未授予' : '未知');
    row('来源缓存身份与周期', v2.scopeCurrent === true ? '匹配当前孩子与本周' : '无可信当前缓存');
    row('V2 当前本地连接同孩子核验', v2.nativePeerSameChild === true ? '已确认' : '未知；不能由缓存来源推断');
    row('V2 策略身份', v2.policy ? `版本 ${v2.policy.schemaVersion} · ${v2.policy.revision}` : '未知');
    row('V2 策略阶段', { legacy: '旧链路', shadow: '影子核对', shared: '共享执行' }[v2.policy?.stage] || '未知');
    row('V2 策略生效时间', time(v2.policy?.effectiveAtMs));
    row('V2 策略摘要', text(v2.policy?.policyHash));
    row('V2 策略读取时间', time(v2.policy?.receivedAtMs));
    const attempt = v2.nativeAttempt;
    const outcome = value => value === true ? '是' : value === false ? '否' : '未知';
    row('最近本机交换记录', attempt?.available ? `当前身份与周期 · ${time(attempt.readAtMs)}；仅代表该次请求` : '无可确认的当前身份与周期记录');
    row('是否属于当前连接', outcome(attempt?.current));
    row('已实际发送至本地组件', outcome(attempt?.sent));
    row('控件已收到对应响应', outcome(attempt?.responseReceived));
    row('当次控件已校验接受', `${outcome(attempt?.accepted)}；不代表当前连接已确认`);
    row('本机交换结果', attempt?.errorCode || (attempt?.accepted === true ? '读取成功' : '未知／尚无明确错误'));
    const originNames = { native: '本地组件', cloud: '云端', last_known_good: '可信缓存',
      local_plus_cloud_other: '本机网页＋云端其他设备', cloud_other: '云端其他设备',
      fresh_with_last_known_good_days: '最新读取＋部分日期可信缓存', unavailable: '不可用', unknown: '未知' };
    const reasonNames = { WEB_LOCAL_DAY_INCOMPLETE: '本机网页日期不完整', WEB_QUOTA_READ_INCOMPLETE: '网页数据不完整', WEB_QUOTA_READ_UNAVAILABLE: '网页用量暂不可读',
      LOCAL_STATISTICS_MISSING: '缺少本机统计', LOCAL_STATISTICS_INCOMPLETE: '本机统计不完整',
      APPLICATION_STATISTICS_NOT_AVAILABLE: '应用统计暂不可用', APPLICATION_STATISTICS_INCOMPLETE: '应用统计不完整',
      APPLICATION_QUOTA_USAGE_INCOMPLETE: '应用配额用量不完整', WEB_STATISTICS_NOT_AVAILABLE: '网页统计暂不可用',
      WEB_QUOTA_USAGE_INCOMPLETE: '网页配额用量不完整', APPLICATION_LOCAL_MISSING: '缺少应用本机用量',
      APPLICATION_OTHER_MISSING: '缺少应用其他设备用量', QUOTA_BUCKETS_PARTIAL: '配额桶数据不完整',
      WEB_SOURCE_UNAVAILABLE: '缺少网页来源', WEB_SOURCE_PARTIAL: '网页来源不完整',
      APPLICATION_SOURCE_UNAVAILABLE: '缺少应用来源', APPLICATION_SOURCE_PARTIAL: '应用来源不完整',
      SOURCE_UNAVAILABLE: '来源不可用', UNKNOWN_REASON: '原因未知' };
    const applicationSources = v2.applicationSources;
    row('V2 应用来源范围', applicationSources?.available ? '本机与其他设备分别显示；合计不重复相加' : '应用合计，无法区分本机');
    const sourceDay = (label, day) => {
      const usage = day.bucketsSeconds
        ? `学习${day.bucketsSeconds.study ?? '未知'}秒／复合${day.bucketsSeconds.composite ?? '未知'}秒／休息${day.bucketsSeconds.rest ?? '未知'}秒`
        : day.totalSeconds == null ? '未知用量' : `${day.totalSeconds}秒`;
      row(`${label} ${day.date}`, `${usage} · ${day.complete === true ? '完整' : day.complete === false ? '不完整' : '完整性未知'} · 结算截至 ${day.settledThroughMs == null ? '未提供' : time(day.settledThroughMs)} · 读取 ${time(day.readAtMs)}${day.reasonCodes?.length ? ` · ${day.reasonCodes.map(code => reasonNames[code] || '原因未知').join('、')}` : ''}`);
    };
    const webSources = v2.webSources;
    row('V2 网页来源范围', webSources?.available ? '本浏览器与其他设备分别显示；合计不重复相加' : '网页合计，无法区分本浏览器');
    if (webSources?.available) {
      row('V2 本浏览器网页', webSources.local ? '本浏览器统计；完整性独立于其他设备' : '本浏览器用量暂不可读');
      for (const day of webSources.local?.days || []) sourceDay('本浏览器网页', day);
      row('V2 网页其他设备', { none: '无其他设备', available: '其他设备已知用量',
        unknown: '其他设备来源范围未确认；已有读数仅为已知部分，不影响本浏览器显示' }[webSources.otherState] || '其他设备用量未知');
      for (const day of webSources.other?.days || []) sourceDay('网页其他设备（已知部分）', day);
    }
    if (applicationSources?.available) {
      row('V2 应用本机', applicationSources.local ? '本机统计；完整性独立于其他设备' : '本机用量暂不可读');
      for (const day of applicationSources.local?.days || []) sourceDay('应用本机', day);
      row('V2 应用其他设备', { none: '无其他设备', available: '其他设备已知用量', unknown: '其他设备用量未知；不影响本机显示' }[applicationSources.otherState] || '其他设备用量未知');
      for (const day of applicationSources.other?.days || []) sourceDay('应用其他设备', day);
    }
    for (const [key, label] of [['web', '网页合计'], ['application', '应用合计']]) {
      const source = v2.sources?.[key];
      row(`V2 ${label}来源`, `${originNames[source?.origin] || '未知'} · ${source?.available ? '有缓存记录' : '暂不可读'}`);
      row(`V2 ${label}范围与读取`, source?.available ? `${source.fromDate} 至 ${source.toDate} · ${time(source.readAtMs)}` : '未知');
      row(`V2 ${label}读取错误`, source?.errorCode || '无可归属的当前错误记录');
      for (const day of source?.days || []) {
        const usage = day.bucketsSeconds
          ? `学习${day.bucketsSeconds.study ?? '未知'}秒／复合${day.bucketsSeconds.composite ?? '未知'}秒／休息${day.bucketsSeconds.rest ?? '未知'}秒`
          : day.totalSeconds == null ? '未知用量' : `${day.totalSeconds}秒`;
        row(`${label} ${day.date}`, `${usage} · ${day.complete === true ? '完整' : day.complete === false ? '不完整' : '完整性未知'} · ${originNames[day.origin] || '未知来源'} · 结算截至 ${day.settledThroughMs == null ? '未提供' : time(day.settledThroughMs)} · 读取 ${time(day.readAtMs)}${day.reasonCodes?.length ? ` · ${day.reasonCodes.map(code => reasonNames[code] || '原因未知').join('、')}` : ''}`);
      }
    }
    row('V2 周合计', '缓存未保存独立周合计；仅列已有逐日结果，不在诊断中重算');
  }

}

export function attachSharedSyncDiagnostics(details, container, { runtime = chrome.runtime, storage = chrome.storage,
  schedule = setInterval, cancel = clearInterval } = {}) {
  let timer = null, reading = false, generation = 0, disposed = false;
  let pageVersion = null;
  try {
    const v = runtime.getManifest?.().version;
    if (typeof v === 'string' && /^[0-9.]{1,32}$/.test(v)) pageVersion = v;
  } catch (_) { /* The page may outlive its extension context. */ }
  const read = async () => {
    if (disposed || !details.open || reading) return;
    const ticket = generation;
    reading = true;
    try {
      const result = await runtime.sendMessage({ type: 'TIMEONCHROME_SHARED_SYNC_DIAGNOSTICS_READ' });
      const valid = result?.ok === true && result.diagnostics && result.diagnostics.connection && typeof result.diagnostics.connection === 'object';
      const failure = result?.error === 'Unknown message type' ? 'diagnostics_background_unsupported'
        : result?.errorCode || 'diagnostics_response_invalid';
      if (!disposed && ticket === generation && details.open) renderSharedSyncDiagnostics(container, valid ? result.diagnostics : null, failure, pageVersion);
    } catch (error) {
      const raw = typeof error?.message === 'string' ? error.message : '';
      const failure = raw.includes('Extension context invalidated') ? 'diagnostics_context_invalidated'
        : raw.includes('message port closed') || raw.includes('message channel closed') ? 'diagnostics_response_interrupted'
          : 'diagnostics_channel_unavailable';
      if (!disposed && ticket === generation && details.open) renderSharedSyncDiagnostics(container, null, failure, pageVersion);
    }
    finally { if (ticket === generation) reading = false; }
  };
  const toggle = () => {
    generation++; reading = false;
    if (timer !== null) { cancel(timer); timer = null; }
    if (details.open) {
      void read();
      timer = schedule(() => { if (!container.ownerDocument.hidden) void read(); }, 5000);
    }
  };
  details.addEventListener('toggle', toggle);
  const changed = (changes, area) => {
    if (area === 'local' && ['local_guardian_status_v1', 'shared_access_policy_lkg_v2',
      'source_statistics_shadow_cache_v1', 'source_statistics_shadow_v1'].some(k => Object.hasOwn(changes, k))) void read();
  };
  storage.onChanged.addListener(changed);
  return () => { disposed = true; generation++; reading = false; if (timer !== null) cancel(timer); details.removeEventListener('toggle', toggle); storage.onChanged.removeListener(changed); };
}

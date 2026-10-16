const text = v => v == null ? '未知' : String(v);
const confirmation = v => v === true ? '已确认' : v === false ? '待确认' : '未知';
const time = v => v == null ? '未知' : new Date(v).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
const stageNames = { local_context: '读取本地上下文', local_projection: '准备派生贡献', native_replace: 'Native 确认',
  cloud_capabilities: '读取云端能力', cloud_watermark: '读取云端水位', source_binding: '来源签名绑定',
  cloud_upload: '上传派生贡献', cloud_ack: '校验云端 ACK', local_preparation: '准备共享读模型' };
const capabilityNames = { 'application-usage-read': '应用用量读取', 'shared-quota-state-read': '共享用量读取',
  'shared-web-contribution-sync-v1': '网页贡献同步', 'shared-access-policy-identity-read': '策略身份读取',
  'shared-quota-execution-preparation-read-v1': '执行准备读取', 'shared-browser-activity-v1': '浏览器活动',
  'shared-reminder-lifecycle-v1': '提醒生命周期', 'shared-reminder-continuity-v1': '提醒连续性',
  'shared-web-local-lease-v1': '本地来源租约', 'shared-web-source-reusable-v2': '可复用孩子身份核验',
  'source-statistics-read-v1': '分域统计读取', 'shared-forced-use-runtime-v2': '统一强行使用运行时' };

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
    for (const [key, label] of [['web', '网页'], ['application', '应用']]) {
      const source = v2.sources?.[key];
      row(`V2 ${label}来源`, `${originNames[source?.origin] || '未知'} · ${source?.available ? '有缓存记录' : '暂不可读'}`);
      row(`V2 ${label}范围与读取`, source?.available ? `${source.fromDate} 至 ${source.toDate} · ${time(source.readAtMs)}` : '未知');
      row(`V2 ${label}读取错误`, source?.errorCode || '无可归属的当前错误记录');
      for (const day of source?.days || []) {
        const usage = day.bucketsSeconds
          ? `学习${day.bucketsSeconds.study ?? '未知'}秒／复合${day.bucketsSeconds.composite ?? '未知'}秒／休息${day.bucketsSeconds.rest ?? '未知'}秒`
          : day.totalSeconds == null ? '未知用量' : `${day.totalSeconds}秒`;
        row(`${label} ${day.date}`, `${usage} · ${day.complete === true ? '完整' : day.complete === false ? '不完整' : '完整性未知'} · ${originNames[day.origin] || '未知来源'} · 结算截至 ${time(day.settledThroughMs)} · 读取 ${time(day.readAtMs)}${day.reasonCodes?.length ? ` · ${day.reasonCodes.map(code => reasonNames[code] || '原因未知').join('、')}` : ''}`);
      }
    }
    row('V2 周合计', '缓存未保存独立周合计；仅列已有逐日结果，不在诊断中重算');
    row('以下为旧版历史贡献', '不代表上方 V2 来源读取或当前连接已确认');
  }
  const stage = { legacy: '旧链路', shadow: '影子核对', shared: '共享执行' }[model.policy?.stage] || '未知';
  row('缓存配置', `${text(model.policy?.revision)} · ${stage}`);
  row('配置读取时间', time(model.policy?.receivedAtMs));
  row('孩子身份确认', { valid: '已确认（同一孩子／当前连接）', disabled: '未确认（功能未启用）', disconnected: '已失效（连接已断开）', unbound: '未确认',
    expired_or_changed: '已失效（已过期或身份／连接已变化）' }[model.bindingState] || '尚无法确认');
  row('同步进度', model.running === true ? stageNames[model.stage] || '进行中' : model.running === false ? '当前无在途同步' : '未知');
  row('最近实际云端 ACK', time(Math.max(...(model.days || []).map(v => v.cloudAckAtMs || 0)) || null));
  row('诊断历史缓存', model.historyCurrent ? '对应当前来源与配置' : '无可信当前缓存（旧缓存不采用）');
  row('贡献缓存来源', model.cacheScopeCurrent === true ? '已核实当前来源' : model.cacheScopeCurrent === false ? '不是当前来源' : '尚无法核实；缓存不作当前确认');
  row('最近同步诊断', `${time(model.lastCompletedAtMs)} · ${model.lastErrorCode == null ? '无错误记录或尚未采样' : model.lastErrorCode}`);
  row('最近失败阶段', model.failedStage ? `${stageNames[model.failedStage] || '未知'}${model.failedDate ? ` · ${model.failedDate}` : ''}` : '未知／无失败记录');
  row('最近本地确认失败', model.nativeFailure ? `${stageNames[model.nativeFailure.stage] || '未知'} · ${text(model.nativeFailure.date)} · ${text(model.nativeFailure.errorCode)} · ${time(model.nativeFailure.atMs)}` : '未知／无失败记录');
  append(container, 'p', '以下为本周派生贡献；云端历史 ACK 和历史 Native 确认不代表当前连接已确认。时间为北京时间。', 'shared-sync-note');
  for (const day of model.days || []) {
    const section = append(container, 'section', '', 'shared-sync-day');
    append(section, 'h4', `${day.date} · ${day.present ? `修订 ${text(day.revision)}` : '本地尚无贡献记录'}`);
    append(section, 'p', `完整性：${day.complete === true ? '完整' : day.complete === false ? '不完整' : '未知'} · 云端历史 ACK：${confirmation(day.cloudConfirmedHistorical)} · 当前贡献接收：${confirmation(day.nativeConfirmedCurrent)}`);
    append(section, 'p', `原因：${day.reasonCodes == null ? '未知' : day.reasonCodes.join('、') || '无'} · 网页 ${text(day.activeMs)} 毫秒 · 三桶 ${text(day.bucketTotalMs)} 毫秒 · 其他 ${text(day.otherMs)} 毫秒`);
    append(section, 'p', `贡献对应当前缓存配置：${day.policyMatchesCurrentCache === true ? '是' : day.policyMatchesCurrentCache === false ? '否' : '未知'}`);
    const coverage = day.storedBucketCoverageBeforeCorrections || {};
    append(section, 'p', `原统计桶覆盖（调账前）：全部 ${text(coverage.allBucketMs)} 毫秒 · 已知 ${text(coverage.knownBucketMs)} 毫秒 · 未识别桶 ${text(coverage.unknownBucketKeyCount)} 种`);
    const after = day.bucketCoverageAfterCorrections;
    append(section, 'p', after
      ? `调账后桶覆盖：全部 ${text(after.allBucketMs)} 毫秒 · 已知 ${text(after.knownBucketMs)} 毫秒 · 未识别 ${text(after.unknownBucketMs)} 毫秒（${text(after.unknownBucketKeyCount)} 种）`
      : '调账后桶覆盖及更正摘要：未知（未采样或版本不匹配）');
    if (after) {
      const correction = after.corrections;
      append(section, 'p', `更正：请求 ${correction.requestedCount} 条 · 已应用 ${correction.appliedCount} 条 · 失败 ${correction.rejectedCount} 条`);
      const bucketNames = { study: '学习', composite: '复合', rest: '休息', other: '其他', unknown: '未知' };
      for (const flow of correction.flows) append(section, 'p', `更正请求流向：${bucketNames[flow.from]} → ${bucketNames[flow.to]} · ${flow.count} 条 · ${flow.requestedSeconds} 秒（不代表全部成功应用）`);
      const failureNames = { local_day_missing: '本地日期缺失', original_bucket_too_small: '原桶用量不足', unknown: '未知原因' };
      for (const [code, count] of Object.entries(correction.failures)) if (count > 0) append(section, 'p', `更正失败：${failureNames[code]} · ${count} 条`);
    }
    append(section, 'p', `最近实际 ACK：${time(day.cloudAckAtMs)} · 历史 Native：${confirmation(day.nativeAcceptedHistorical)}`);
    append(section, 'p', `当前连接 Native ACK：${time(day.nativeAckAtMsCurrent)}`);
    const retry = day.nextRetryAtMs == null ? '未知' : day.nextRetryAtMs === 0 ? '无冷却' : time(day.nextRetryAtMs);
    append(section, 'p', `失败 ${text(day.failures)} 次 · ${day.lastErrorCode || '无错误记录或尚未采样'} · 重试时间：${retry}`);
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
      const valid = result?.ok === true && result.diagnostics && Array.isArray(result.diagnostics.days);
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
    if (area === 'local' && ['shared_web_contribution_queue_v1', 'shared_access_policy_lkg_v1',
      'shared_web_sync_diagnostics_v1', 'local_guardian_status_v1', 'shared_access_policy_lkg_v2',
      'source_statistics_shadow_cache_v1', 'source_statistics_shadow_v1'].some(k => Object.hasOwn(changes, k))) void read();
  };
  storage.onChanged.addListener(changed);
  return () => { disposed = true; generation++; reading = false; if (timer !== null) cancel(timer); details.removeEventListener('toggle', toggle); storage.onChanged.removeListener(changed); };
}

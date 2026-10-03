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
  'shared-web-local-lease-v1': '本地来源租约' };

export function renderSharedSyncDiagnostics(container, model) {
  container.replaceChildren();
  const doc = container.ownerDocument;
  const append = (parent, tag, value, className) => {
    const element = doc.createElement(tag); element.textContent = value;
    if (className) element.className = className;
    parent.append(element); return element;
  };
  if (!model) { append(container, 'p', '共享诊断暂不可读；不代表用量为零。'); return; }
  const rows = append(container, 'dl', '', 'shared-sync-summary');
  const row = (name, value) => { append(rows, 'dt', name); append(rows, 'dd', value); };
  const c = model.connection || {};
  row('运行版本', text(model.version));
  row('当前连接', c.connectedCurrent === true ? '已连接' : c.connectedCurrent === false ? '未连接' : '未知');
  row('协议', c.protocolVersion == null ? '未知' : `v${c.protocolVersion}`);
  row('已协商能力', c.capabilities == null ? '未知' : c.capabilities.map(v => capabilityNames[v] || '未知能力').join('、') || '无');
  row('应用用量读取能力', c.applicationUsageSupported === true ? '支持' : c.applicationUsageSupported === false ? '未协商' : '未知');
  const stage = { legacy: '旧链路', shadow: '影子核对', shared: '共享执行' }[model.policy?.stage] || '未知';
  row('缓存配置', `${text(model.policy?.revision)} · ${stage}`);
  row('配置读取时间', time(model.policy?.receivedAtMs));
  row('当前签名绑定', { valid: '有效（当前连接）', disabled: '未建立（功能未启用）', disconnected: '失效（连接已断开）', unbound: '未建立',
    expired_or_changed: '失效（已过期或连接已变化）' }[model.bindingState] || '无法核实');
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
    append(section, 'p', `完整性：${day.complete === true ? '完整' : day.complete === false ? '不完整' : '未知'} · 云端历史 ACK：${confirmation(day.cloudConfirmedHistorical)} · 当前 Native：${confirmation(day.nativeConfirmedCurrent)}`);
    append(section, 'p', `原因：${day.reasonCodes == null ? '未知' : day.reasonCodes.join('、') || '无'} · 网页 ${text(day.activeMs)} 毫秒 · 三桶 ${text(day.bucketTotalMs)} 毫秒 · 其他 ${text(day.otherMs)} 毫秒`);
    append(section, 'p', `贡献对应当前缓存配置：${day.policyMatchesCurrentCache === true ? '是' : day.policyMatchesCurrentCache === false ? '否' : '未知'}`);
    const coverage = day.storedBucketCoverageBeforeCorrections || {};
    append(section, 'p', `原统计桶覆盖（调账前）：全部 ${text(coverage.allBucketMs)} 毫秒 · 已知 ${text(coverage.knownBucketMs)} 毫秒 · 未识别桶 ${text(coverage.unknownBucketKeyCount)} 种`);
    append(section, 'p', `最近实际 ACK：${time(day.cloudAckAtMs)} · 历史 Native：${confirmation(day.nativeAcceptedHistorical)}`);
    append(section, 'p', `当前连接 Native ACK：${time(day.nativeAckAtMsCurrent)}`);
    const retry = day.nextRetryAtMs == null ? '未知' : day.nextRetryAtMs === 0 ? '无冷却' : time(day.nextRetryAtMs);
    append(section, 'p', `失败 ${text(day.failures)} 次 · ${day.lastErrorCode || '无错误记录或尚未采样'} · 重试时间：${retry}`);
  }
}

export function attachSharedSyncDiagnostics(details, container, { runtime = chrome.runtime, storage = chrome.storage,
  schedule = setInterval, cancel = clearInterval } = {}) {
  let timer = null, reading = false, generation = 0, disposed = false;
  const read = async () => {
    if (disposed || !details.open || reading) return;
    const ticket = generation;
    reading = true;
    try {
      const result = await runtime.sendMessage({ type: 'TIMEONCHROME_SHARED_SYNC_DIAGNOSTICS_READ' });
      if (!disposed && ticket === generation && details.open) renderSharedSyncDiagnostics(container, result?.ok ? result.diagnostics : null);
    } catch (_) { if (!disposed && ticket === generation && details.open) renderSharedSyncDiagnostics(container, null); }
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
      'shared_web_sync_diagnostics_v1', 'local_guardian_status_v1'].some(k => Object.hasOwn(changes, k))) void read();
  };
  storage.onChanged.addListener(changed);
  return () => { disposed = true; generation++; reading = false; if (timer !== null) cancel(timer); details.removeEventListener('toggle', toggle); storage.onChanged.removeListener(changed); };
}

// lib/reporters.js — JSON + Markdown 报告生成器

const fs = require('fs');
const path = require('path');

/**
 * 确保输出目录存在
 * @param {string} dir
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 生成时间戳文件名后缀
 * @returns {string} — 如 20260429-153410
 */
function timestampSuffix() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * 写入 JSON 报告
 * @param {Object} data — 报告数据
 * @param {string} outputDir — 输出目录
 * @returns {string} — 写入的文件路径
 */
function writeJsonReport(data, outputDir) {
  ensureDir(outputDir);
  const scenario = data.meta?.scenario || 'run';
  const filename = `${scenario}-${timestampSuffix()}.json`;
  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  return filepath;
}

/**
 * 生成 Markdown 报告（根据 scenario 自动选择格式）
 * @param {Object} data — 报告数据
 * @param {string} outputDir — 输出目录
 * @returns {string} — 写入的文件路径
 */
function writeMarkdownReport(data, outputDir) {
  ensureDir(outputDir);
  const scenario = data.meta?.scenario || 'run';
  const filename = `${scenario}-${timestampSuffix()}.md`;
  const filepath = path.join(outputDir, filename);

  const lines = [];
  const titleMap = {
    'dry-run': 'Phase 1 Dry-Run',
    'chrome-restart': 'Phase 2 Chrome-Restart',
    'sleep-wake': 'Phase 3 Sleep-Wake',
    'lock-unlock': 'RG-2 Lock-Unlock',
    'network-offline': 'RG-4 Network-Offline',
  };
  lines.push(`# Sleep / Wake / Offline Gate — ${titleMap[scenario] || scenario} 报告`);
  lines.push('');
  lines.push(`> 生成时间：${new Date(data.meta.timestamp).toLocaleString('zh-CN')}`);
  lines.push(`> 场景：${data.meta.scenario}`);
  lines.push(`> 扩展版本：${data.meta.extensionVersion}`);
  lines.push(`> Commit：${data.meta.commit}`);
  lines.push('');

  // Mock Server
  if (data.mockServer) {
    lines.push('## Mock Server');
    lines.push('');
    lines.push(`| 项目 | 状态 |`);
    lines.push(`|------|------|`);
    lines.push(`| Mock Server 启动 | ${data.mockServer.started ? '成功' : '失败'} |`);
    lines.push(`| Mock Server URL | \`${data.mockServer.url || 'N/A'}\` |`);
    lines.push(`| Mock Server 关闭 | ${data.mockServer.closed ? '成功' : '失败'} |`);
    lines.push('');
  }

  // 浏览器状态
  lines.push('## 浏览器与扩展加载状态');
  lines.push('');
  lines.push(`| 项目 | 状态 |`);
  lines.push(`|------|------|`);
  lines.push(`| 扩展加载 | ${data.browser?.loaded ? '成功' : '失败'} |`);
  lines.push(`| Extension ID | \`${data.browser?.extensionId || 'N/A'}\` |`);
  lines.push(`| Service Worker | \`${data.browser?.serviceWorkerUrl || 'N/A'}\` |`);
  if (data.browser?.siteUrl) {
    lines.push(`| 测试页面 URL | \`${data.browser.siteUrl}\` |`);
  }
  lines.push('');

  // 绑定状态检查
  if (data.bindingPreflight) {
    const bp = data.bindingPreflight;
    lines.push('## 绑定状态检查');
    lines.push('');
    lines.push(`| 检查项 | 状态 |`);
    lines.push(`|--------|------|`);
    lines.push(`| 已绑定 | ${bp.bound ? '是' : '否'} |`);
    lines.push(`| deviceToken 存在 | ${bp.deviceTokenPresent ? '是' : '否'} |`);
    lines.push(`| profileId 存在 | ${bp.profileIdPresent ? '是' : '否'} |`);
    lines.push(`| 配置可用 | ${bp.configAvailable ? '是' : '否'} |`);
    lines.push(`| 监控启用 | ${bp.monitoringEnabled ? '是' : '否'} |`);
    lines.push(`| 模式 | ${bp.mode || 'N/A'} |`);
    if (Array.isArray(bp.blockers) && bp.blockers.length > 0) {
      lines.push(`| 阻塞原因 | ${bp.blockers.join('; ')} |`);
    }
    if (bp.action) {
      lines.push(`| 建议动作 | ${bp.action} |`);
    }
    lines.push('');
    if (!bp.bound) {
      if (scenario === 'dry-run') {
        lines.push('> ⚠️ **未绑定状态**。dry-run 可继续验证基础设施，但**不能用于正式 Sleep/Restart Gate 判定**。');
      } else {
        lines.push('> ❌ **设备未绑定**。chrome-restart / sleep-wake / network-offline Gate 在未绑定状态下不应执行。');
      }
      lines.push('');
    } else {
      lines.push('> ✅ 设备已绑定，可以进入后续 Gate 场景。');
      lines.push('');
    }
  }

  // Scenario-specific sections
  if (scenario === 'dry-run') {
    writeDryRunSections(lines, data);
  } else if (scenario === 'chrome-restart') {
    writeChromeRestartSections(lines, data);
  } else if (scenario === 'sleep-wake') {
    writeSleepWakeSections(lines, data);
  } else if (scenario === 'lock-unlock') {
    writeManualGateSections(lines, data, '锁屏 / 解锁');
  } else if (scenario === 'network-offline') {
    writeManualGateSections(lines, data, '网络离线 / 在线');
  }

  // 结论
  lines.push('## 结论');
  lines.push('');
  const resultMap = { PASS: '通过', PARTIAL: '部分通过', FAIL: '失败', SKIP: '跳过', BLOCKED: '阻塞' };
  lines.push(`**${resultMap[data.result] || data.result}**`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('> 本报告由 Sleep / Wake / Offline Gate Runner 自动生成。');
  if (scenario === 'dry-run') {
    lines.push('> 未执行任何睡眠/锁屏/断网/关闭 Chrome 操作。');
  } else if (scenario === 'chrome-restart') {
    lines.push('> Chrome 关闭/重开操作由 Playwright 控制，未涉及 OS 睡眠/锁屏/网络切换。');
  } else if (scenario === 'sleep-wake') {
    lines.push('> Windows OS 睡眠/唤醒由 rundll32 powrprof.dll 触发，Chrome 在睡眠期间保持运行。');
  } else if (scenario === 'lock-unlock') {
    lines.push('> 默认运行只执行前置检查；只有显式允许时才会触发 Windows 锁屏，需要操作者手动解锁。');
  } else if (scenario === 'network-offline') {
    lines.push('> 默认运行只执行前置检查；不会擅自禁用网络适配器或修改网络状态。');
  }

  fs.writeFileSync(filepath, lines.join('\n'), 'utf-8');
  return filepath;
}

function writeManualGateSections(lines, data, label) {
  const preflight = data.preflight || {};
  const procedure = data.procedure || [];
  const validation = data.validation || {};

  lines.push(`## ${label} 前置检查`);
  lines.push('');
  lines.push(`| 检查项 | 结果 |`);
  lines.push(`|--------|------|`);
  for (const [key, value] of Object.entries(preflight)) {
    if (key === 'blockers') continue;
    lines.push(`| ${key} | ${formatReportValue(value)} |`);
  }
  if (Array.isArray(preflight.blockers) && preflight.blockers.length > 0) {
    lines.push(`| blockers | ${preflight.blockers.join('; ')} |`);
  }
  lines.push('');

  if (procedure.length > 0) {
    lines.push(`## ${label} 程序`);
    lines.push('');
    procedure.forEach((step, idx) => {
      lines.push(`${idx + 1}. ${step}`);
    });
    lines.push('');
  }

  lines.push(`## ${label} 校验`);
  lines.push('');
  lines.push(`| 检查项 | 结果 |`);
  lines.push(`|--------|------|`);
  for (const [key, value] of Object.entries(validation)) {
    lines.push(`| ${key} | ${formatReportValue(value)} |`);
  }
  lines.push('');
}

function formatReportValue(value) {
  if (Array.isArray(value)) return value.join('; ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  if (value === true) return '是';
  if (value === false) return '否';
  if (value == null) return 'N/A';
  return String(value);
}

function writeDryRunSections(lines, data) {
  // 数据源摘要
  lines.push('## 数据源摘要');
  lines.push('');
  lines.push(`| 数据源 | 条目数 | 样本 |`);
  lines.push(`|--------|--------|------|`);
  lines.push(`| Event Log | ${data.data?.eventLog?.count ?? 0} | ${JSON.stringify(data.data?.eventLog?.sample || []).slice(0, 120)} |`);
  lines.push(`| Session | — | state=${data.data?.session?.state ?? 'null'}, domain=${data.data?.session?.domain ?? 'null'} |`);
  lines.push(`| Timing Trace | ${data.data?.trace?.count ?? 0} | actions=${JSON.stringify(data.data?.trace?.actions || []).slice(0, 120)} |`);
  lines.push(`| Stats | ${Object.keys(data.data?.stats || {}).length} | ${JSON.stringify(data.data?.stats || {}).slice(0, 120)} |`);
  lines.push(`| Focus Ledger | ${data.data?.focusLedger?.count ?? 0} |`);
  lines.push('');

  // 校验结果
  lines.push('## 数据完整性校验');
  lines.push('');
  lines.push(`| 检查项 | 结果 |`);
  lines.push(`|--------|------|`);
  lines.push(`| Event Log 有数据 | ${data.validation?.eventLogHasEntries ? '通过' : '未通过'} |`);
  lines.push(`| Session 已定义 | ${data.validation?.sessionIsDefined ? '通过' : '未通过'} |`);
  lines.push(`| Timing Trace 有数据 | ${data.validation?.traceHasEntries ? '通过' : '未通过'} |`);
  lines.push(`| Stats 对象存在 | ${data.validation?.statsObjectExists ? '通过' : '未通过'} |`);
  lines.push('');

  // Pipeline 覆盖
  lines.push('## Pipeline 阶段覆盖');
  lines.push('');
  lines.push(`已观测到的 trace action：${(data.validation?.pipelineCoverage || []).join(', ') || '无'}`);
  lines.push('');
}

function writeChromeRestartSections(lines, data) {
  const phases = data.phases || {};
  const validation = data.validation || {};
  const recovery = data.recovery || {};

  // 阶段时间线
  lines.push('## 阶段时间线');
  lines.push('');
  lines.push(`| 阶段 | 时长 | 说明 |`);
  lines.push(`|------|------|------|`);
  lines.push(`| 关闭前运行 | ${phases.preClose?.durationSec ?? 0} 秒 | 扩展累积 session |`);
  lines.push(`| Chrome 关闭 | ${phases.closed?.durationSec ?? 0} 秒 | 模拟离线 / SW 死亡 |`);
  lines.push(`| 重开后运行 | ${phases.postReopen?.durationSec ?? 0} 秒 | SW 启动 + recover() |`);
  lines.push('');

  // 关闭前状态
  lines.push('## 关闭前状态');
  lines.push('');
  lines.push(`| 项目 | 值 |`);
  lines.push(`|------|-----|`);
  lines.push(`| Session state | ${phases.preClose?.session?.state ?? 'null'} |`);
  lines.push(`| Session domain | ${phases.preClose?.session?.domain ?? 'null'} |`);
  lines.push(`| lastHeartbeat | ${phases.preClose?.session?.lastHeartbeat ?? 'N/A'} |`);
  lines.push(`| Event Log 条目数 | ${phases.preClose?.eventLogCount ?? 0} |`);
  lines.push('');

  // 恢复行为验证
  lines.push('## 恢复行为验证');
  lines.push('');
  lines.push(`| 检查项 | 结果 | 说明 |`);
  lines.push(`|--------|------|------|`);
  lines.push(`| recover() 追加 END | ${validation.endEventFound ? '通过' : '未通过'} | 重开后 event log 出现新 END |`);
  lines.push(`| END 时间截断 | ${validation.endTimeTruncated ? '通过' : '未通过'} | END time ≈ lastHeartbeat（误差 ${validation.endTimeDeltaMs ?? 'N/A'} ms） |`);
  lines.push(`| 无重复 END | ${validation.noDuplicateEnd ? '通过' : '未通过'} | 仅 1 个 END 事件 |`);
  lines.push(`| Session 已重置 | ${validation.sessionReset ? '通过' : '未通过'} | recover 后 state/startTime 为 null |`);
  lines.push(`| 离线时间未计入 | ${validation.closedTimeNotCounted ? '通过' : '未通过'} | END time ≈ lastHeartbeat，未将离线时间计入（误差 ${validation.endTimeDeltaMs ?? 'N/A'} ms） |`);
  lines.push('');

  // 重开后状态
  lines.push('## 重开后状态');
  lines.push('');
  lines.push(`| 项目 | 值 |`);
  lines.push(`|------|-----|`);
  lines.push(`| Session state | ${phases.postReopen?.session?.state ?? 'null'} |`);
  lines.push(`| Session domain | ${phases.postReopen?.session?.domain ?? 'null'} |`);
  lines.push(`| Event Log 条目数 | ${phases.postReopen?.eventLogCount ?? 0} |`);
  lines.push('');

  // recover 详情
  if (recovery.endEvent) {
    lines.push('## recover() 追加的 END 事件');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(recovery.endEvent, null, 2));
    lines.push('```');
    lines.push('');
  }
}

function writeSleepWakeSections(lines, data) {
  const phases = data.phases || {};
  const validation = data.validation || {};
  const recovery = data.recovery || {};

  // 阶段时间线
  lines.push('## 阶段时间线');
  lines.push('');
  lines.push(`| 阶段 | 时长 | 说明 |`);
  lines.push(`|------|------|------|`);
  lines.push(`| 睡眠前运行 | ${phases.preSleep?.durationSec ?? 0} 秒 | 扩展累积 session |`);
  lines.push(`| Windows OS 睡眠 | 人工唤醒 | 实际间隔 ${phases.sleep?.observedElapsedSec ?? 'N/A'} 秒 |`);
  lines.push(`| 唤醒后运行 | ${phases.postWake?.durationSec ?? 0} 秒 | wake-after activity |`);
  lines.push('');

  // 睡眠前状态
  lines.push('## 睡眠前状态');
  lines.push('');
  lines.push(`| 项目 | 值 |`);
  lines.push(`|------|-----|`);
  lines.push(`| Session state | ${phases.preSleep?.session?.state ?? 'null'} |`);
  lines.push(`| Session domain | ${phases.preSleep?.session?.domain ?? 'null'} |`);
  lines.push(`| lastHeartbeat | ${phases.preSleep?.session?.lastHeartbeat ?? 'N/A'} |`);
  lines.push(`| Event Log 条目数 | ${phases.preSleep?.eventLogCount ?? 0} |`);
  lines.push('');

  // OS 睡眠详情
  lines.push('## OS 睡眠详情');
  lines.push('');
  lines.push(`| 项目 | 值 |`);
  lines.push(`|------|-----|`);
  lines.push(`| 系统 S3 睡眠支持 | ${data.sleepSupport?.supported ? '支持' : '不支持'} |`);
  if (!data.sleepSupport?.supported) {
    lines.push(`| 不支持原因 | ${data.sleepSupport?.reason || 'N/A'} |`);
  }
  lines.push(`| Sleep 触发模式 | ${phases.sleep?.sleepTriggerMode || 'N/A'} |`);
  lines.push(`| Wake 模式 | ${phases.sleep?.wakeMode || 'N/A'} |`);
  lines.push(`| 指导睡眠时长 | ${phases.sleep?.guidanceSec ?? 0} 秒 |`);
  lines.push(`| 实际间隔时长 | ${phases.sleep?.observedElapsedSec ?? 'N/A'} 秒 |`);
  lines.push(`| Chrome 连接是否存活 | ${recovery.connectionSurvived ? '是' : '否（已重新启动）'} |`);
  lines.push('');

  // 恢复行为验证（核心）
  lines.push('## 恢复行为验证（核心）');
  lines.push('');
  lines.push(`| 检查项 | 结果 | 说明 |`);
  lines.push(`|--------|------|------|`);
  lines.push(`| Chrome / SW 可访问 | ${validation.chromeReachable ? '通过' : '未通过'} | 唤醒后 Chrome 连接可复用或重新启动 |`);
  lines.push(`| Event Log 可读 | ${validation.eventLogReadable ? '通过' : '未通过'} | 唤醒后 event-log 数据可读取 |`);
  lines.push(`| Wake-After Activity 正常 | ${validation.wakeAfterActivityWorks ? '通过' : '未通过'} | 唤醒后扩展仍能产生新事件 |`);
  lines.push('');

  // 诊断项
  lines.push('## 诊断项（不用于 pass/fail）');
  lines.push('');
  lines.push(`| 检查项 | 结果 | 说明 |`);
  lines.push(`|--------|------|------|`);
  lines.push(`| Service Worker 存活 | ${validation.serviceWorkerSurvived ? '是' : '否（已重新创建）'} | SW 是否在被冻结后存活 |`);
  lines.push(`| recover() 观察到 | ${validation.recoverObserved ? '是' : '否'} | 若 SW 重启，是否有 END 事件补写 |`);
  if (validation.recoverObserved) {
    lines.push(`| END 截断误差 | ${validation.endTimeDeltaMs ?? 'N/A'} ms | END time ≈ lastHeartbeat |`);
  }
  lines.push('');

  // 唤醒后状态
  lines.push('## 唤醒后状态');
  lines.push('');
  lines.push(`| 项目 | 值 |`);
  lines.push(`|------|-----|`);
  lines.push(`| Session state | ${phases.postWake?.session?.state ?? 'null'} |`);
  lines.push(`| Session domain | ${phases.postWake?.session?.domain ?? 'null'} |`);
  lines.push(`| Event Log 条目数 | ${phases.postWake?.eventLogCount ?? 0} |`);
  lines.push('');

  // recover 详情
  if (recovery.endEvent) {
    lines.push('## recover() 追加的 END 事件');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(recovery.endEvent, null, 2));
    lines.push('```');
    lines.push('');
  }
}

module.exports = {
  writeJsonReport,
  writeMarkdownReport,
  ensureDir,
  timestampSuffix,
};

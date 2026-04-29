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
  const filename = `dry-run-${timestampSuffix()}.json`;
  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  return filepath;
}

/**
 * 生成 Markdown 报告
 * @param {Object} data — 报告数据
 * @param {string} outputDir — 输出目录
 * @returns {string} — 写入的文件路径
 */
function writeMarkdownReport(data, outputDir) {
  ensureDir(outputDir);
  const filename = `dry-run-${timestampSuffix()}.md`;
  const filepath = path.join(outputDir, filename);

  const lines = [];
  lines.push('# Sleep / Wake / Offline Gate — Phase 1 Dry-Run 报告');
  lines.push('');
  lines.push(`> 生成时间：${new Date(data.meta.timestamp).toLocaleString('zh-CN')}`);
  lines.push(`> 场景：${data.meta.scenario}`);
  lines.push(`> 扩展版本：${data.meta.extensionVersion}`);
  lines.push(`> Commit：${data.meta.commit}`);
  lines.push('');

  // Mock Server 状态
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
  lines.push(`| 扩展加载 | ${data.browser.loaded ? '成功' : '失败'} |`);
  lines.push(`| Extension ID | \`${data.browser.extensionId || 'N/A'}\` |`);
  lines.push(`| Service Worker | \`${data.browser.serviceWorkerUrl || 'N/A'}\` |`);
  lines.push(`| 测试页面 URL | \`${data.browser.siteUrl || 'N/A'}\` |`);
  lines.push('');

  // 数据源摘要
  lines.push('## 数据源摘要');
  lines.push('');
  lines.push(`| 数据源 | 条目数 | 样本 |`);
  lines.push(`|--------|--------|------|`);
  lines.push(`| Event Log | ${data.data.eventLog.count} | ${JSON.stringify(data.data.eventLog.sample).slice(0, 120)} |`);
  lines.push(`| Session | — | state=${data.data.session.state ?? 'null'}, domain=${data.data.session.domain ?? 'null'} |`);
  lines.push(`| Timing Trace | ${data.data.trace.count} | actions=${JSON.stringify(data.data.trace.actions).slice(0, 120)} |`);
  lines.push(`| Stats | ${Object.keys(data.data.stats).length} | ${JSON.stringify(data.data.stats).slice(0, 120)} |`);
  lines.push(`| Focus Ledger | ${data.data.focusLedger.count} |`);
  lines.push('');

  // 校验结果
  lines.push('## 数据完整性校验');
  lines.push('');
  lines.push(`| 检查项 | 结果 |`);
  lines.push(`|--------|------|`);
  lines.push(`| Event Log 有数据 | ${data.validation.eventLogHasEntries ? '通过' : '未通过'} |`);
  lines.push(`| Session 已定义 | ${data.validation.sessionIsDefined ? '通过' : '未通过'} |`);
  lines.push(`| Timing Trace 有数据 | ${data.validation.traceHasEntries ? '通过' : '未通过'} |`);
  lines.push(`| Stats 对象存在 | ${data.validation.statsObjectExists ? '通过' : '未通过'} |`);
  lines.push('');

  // Pipeline 覆盖
  lines.push('## Pipeline 阶段覆盖');
  lines.push('');
  lines.push(`已观测到的 trace action：${data.validation.pipelineCoverage.join(', ') || '无'}`);
  lines.push('');

  // 结论
  lines.push('## 结论');
  lines.push('');
  const resultMap = { PASS: '通过', PARTIAL: '部分通过', FAIL: '失败' };
  lines.push(`**${resultMap[data.result] || data.result}**`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('> 本报告由 Phase 1 Dry-Run Runner 自动生成，未执行任何睡眠/锁屏/断网/关闭 Chrome 操作。');

  fs.writeFileSync(filepath, lines.join('\n'), 'utf-8');
  return filepath;
}

module.exports = {
  writeJsonReport,
  writeMarkdownReport,
  ensureDir,
  timestampSuffix,
};

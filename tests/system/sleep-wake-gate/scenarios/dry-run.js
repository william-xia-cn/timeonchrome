// scenarios/dry-run.js — Phase 1：只读数据路径验证（不执行任何 OS 级操作）

const path = require('path');
const { launchExtensionContext, closeContext } = require('../lib/browser');
const {
  extractCalibration,
  extractTodayStats,
  extractTimingTrace,
  extractEventLog,
  extractSession,
  extractFocusLedger,
  resetCalibrationData,
  initializeRestMode,
} = require('../lib/extractors');
const { writeJsonReport, writeMarkdownReport } = require('../lib/reporters');

/**
 * 执行 Phase 1 Dry-Run
 * @param {Object} options
 * @param {boolean} options.reset — 测试前是否重置 calibration 数据
 * @param {boolean} options.verbose — 是否打印详细日志
 * @param {string} options.outputDir — 报告输出目录
 * @returns {Promise<{ success: boolean, jsonPath: string, mdPath: string, summary: Object }>}
 */
async function runDryRun({ reset = false, verbose = false, outputDir } = {}) {
  const userDataDir = path.resolve(__dirname, `../../../test-system-gate-${Date.now()}`);
  let browserCtx = null;
  let sw = null;
  let extensionId = null;

  const log = (...args) => {
    if (verbose) console.log(...args);
  };

  try {
    log('[dry-run] 启动 Chrome 并加载扩展...');
    const ctx = await launchExtensionContext(userDataDir);
    browserCtx = ctx.browserCtx;
    sw = ctx.sw;
    extensionId = ctx.extensionId;
    log('[dry-run] 扩展已加载，Extension ID:', extensionId);

    // 设置为 rest mode，避免学习模式拦截
    log('[dry-run] 初始化 rest mode...');
    await initializeRestMode(sw);

    // 可选：重置 calibration 数据
    if (reset) {
      log('[dry-run] 重置 calibration 数据...');
      await resetCalibrationData(sw);
    }

    // 打开一个真实网页以产生信号和事件
    log('[dry-run] 打开测试页面...');
    const page = await browserCtx.newPage();
    await page.goto('https://www.example.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000); // 等待信号触发
    log('[dry-run] 页面加载完成，等待 3 秒信号处理...');

    // 提取所有诊断数据
    log('[dry-run] 提取诊断数据...');
    const calibration = await extractCalibration(sw);
    const statsResult = await extractTodayStats(sw);
    const traceResult = await extractTimingTrace(sw);
    const eventLog = await extractEventLog(sw);
    const session = await extractSession(sw);
    const focusLedger = await extractFocusLedger(sw);

    // 构建验证结果
    const eventLogHasEntries = Array.isArray(eventLog) && eventLog.length > 0;
    const sessionIsDefined = session !== null && typeof session === 'object';
    const traceHasEntries = traceResult.success && Array.isArray(traceResult.trace) && traceResult.trace.length > 0;
    const statsObjectExists = statsResult.success && typeof statsResult.stats === 'object';

    // Pipeline 覆盖检查
    const traceActions = traceResult.success && traceResult.trace
      ? traceResult.trace.map(t => t.action)
      : [];
    const pipelineCoverage = [...new Set(traceActions)].filter(a =>
      ['signal_received', 'snapshot_created', 'state_resolved', 'transition_begin', 'transition_end', 'event_appended', 'stats_calculated'].includes(a)
    );

    // 判断总体结果
    let result = 'FAIL';
    if (eventLogHasEntries && sessionIsDefined && traceHasEntries && statsObjectExists) {
      result = 'PASS';
    } else if (eventLogHasEntries || sessionIsDefined || traceHasEntries) {
      result = 'PARTIAL';
    }

    // 组装报告数据
    const reportData = {
      meta: {
        scenario: 'dry-run',
        timestamp: new Date().toISOString(),
        extensionVersion: '1.7.2',
        commit: 'a4f2e06',
      },
      browser: {
        loaded: true,
        extensionId: extensionId || null,
        serviceWorkerUrl: sw?.url() || null,
      },
      data: {
        eventLog: {
          count: eventLog.length,
          sample: eventLog.slice(0, 5),
        },
        session: session || {},
        trace: {
          count: traceResult.success ? (traceResult.trace?.length || 0) : 0,
          actions: traceResult.success
            ? [...new Set(traceResult.trace?.map(t => t.action))]
            : [],
        },
        stats: statsResult.success ? (statsResult.stats || {}) : {},
        focusLedger: {
          count: focusLedger.success ? (focusLedger.ledger?.length || 0) : 0,
        },
        calibration: calibration.success ? { traceCount: calibration.traceCount, eventLogCount: calibration.eventLogCount } : { error: calibration.error },
      },
      validation: {
        eventLogHasEntries,
        sessionIsDefined,
        traceHasEntries,
        statsObjectExists,
        pipelineCoverage,
      },
      result,
    };

    // 生成报告
    const jsonPath = writeJsonReport(reportData, outputDir);
    const mdPath = writeMarkdownReport(reportData, outputDir);

    log('[dry-run] JSON 报告:', jsonPath);
    log('[dry-run] Markdown 报告:', mdPath);

    return {
      success: result !== 'FAIL',
      jsonPath,
      mdPath,
      summary: reportData,
    };
  } catch (err) {
    console.error('[dry-run] 执行失败:', err.message);
    return {
      success: false,
      jsonPath: null,
      mdPath: null,
      summary: { error: err.message, stack: err.stack },
    };
  } finally {
    if (browserCtx) {
      log('[dry-run] 关闭浏览器...');
      await closeContext(browserCtx, userDataDir, true);
    }
  }
}

module.exports = { runDryRun };

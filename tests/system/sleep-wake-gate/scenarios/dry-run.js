// scenarios/dry-run.js — Phase 1：只读数据路径验证（不执行任何 OS 级操作）

const path = require('path');
const http = require('http');
const { launchExtensionContext, closeContext } = require('../lib/browser');
const {
  extractCalibration,
  extractTodayStats,
  extractTimingTrace,
  extractEventLog,
  extractSession,
  extractFocusLedger,
  extractBindingStatus,
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
async function runDryRun({ reset = false, verbose = false, outputDir, userDataDir: explicitUserDataDir } = {}) {
  const isCustomDir = !!explicitUserDataDir;
  const userDataDir = explicitUserDataDir
    ? path.resolve(explicitUserDataDir)
    : path.resolve(__dirname, `../../../test-system-gate-${Date.now()}`);
  let browserCtx = null;
  let sw = null;
  let extensionId = null;
  let mockServer = null;
  let mockServerUrl = null;
  let serverStarted = false;
  let serverClosed = false;

  const log = (...args) => {
    if (verbose) console.log(...args);
  };

  try {
    // 启动本地 mock HTTP server
    log('[dry-run] 启动本地 mock server...');
    mockServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html>
<head><title>TimeOnChrome Sleep Gate Mock</title></head>
<body>
  <h1>TimeOnChrome Sleep Gate Mock</h1>
  <p>本地 mock 页面，用于产生 content.js 信号和 event-log 事件。</p>
</body>
</html>`);
    });
    await new Promise((resolve, reject) => {
      mockServer.listen(0, '127.0.0.1', () => {
        const port = mockServer.address().port;
        mockServerUrl = `http://127.0.0.1:${port}`;
        serverStarted = true;
        resolve();
      });
      mockServer.on('error', reject);
    });
    log('[dry-run] Mock server 启动成功:', mockServerUrl);

    log('[dry-run] 启动 Chrome 并加载扩展...');
    const ctx = await launchExtensionContext(userDataDir, !isCustomDir);
    browserCtx = ctx.browserCtx;
    sw = ctx.sw;
    extensionId = ctx.extensionId;
    log('[dry-run] 扩展已加载，Extension ID:', extensionId);

    // 绑定状态预检
    log('[dry-run] 检查绑定状态...');
    const bindingPreflight = await extractBindingStatus(sw);
    log('[dry-run] 绑定状态:', JSON.stringify(bindingPreflight));

    // 设置为 rest mode，避免学习模式拦截
    log('[dry-run] 初始化 rest mode...');
    await initializeRestMode(sw);

    // 可选：重置 calibration 数据
    if (reset) {
      log('[dry-run] 重置 calibration 数据...');
      await resetCalibrationData(sw);
    }

    // 打开本地 mock 页面以产生信号和事件
    log('[dry-run] 打开本地 mock 页面...');
    const page = await browserCtx.newPage();
    await page.goto(mockServerUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
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
        commit: process.env.GIT_COMMIT || null,
      },
      mockServer: {
        started: serverStarted,
        url: mockServerUrl || null,
        closed: serverClosed,
      },
      browser: {
        loaded: true,
        extensionId: extensionId || null,
        serviceWorkerUrl: sw?.url() || null,
        siteUrl: mockServerUrl || null,
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
      bindingPreflight,
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
      // 仅在未指定自定义 userDataDir 或显式 reset 时清理目录
      await closeContext(browserCtx, userDataDir, !isCustomDir || reset);
    }
    if (mockServer) {
      log('[dry-run] 关闭 mock server...');
      await new Promise(resolve => mockServer.close(resolve));
      serverClosed = true;
      log('[dry-run] Mock server 已关闭');
    }
  }
}

module.exports = { runDryRun };

// scenarios/chrome-restart.js — Phase 2: Chrome 关闭/重开恢复验证

const path = require('path');
const http = require('http');
const { launchExtensionContext, relaunchExtensionContext, closeContext } = require('../lib/browser');
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 执行 Phase 2 Chrome-Restart 验证
 * @param {Object} options
 * @param {number} options.preActiveSeconds — Chrome 关闭前运行秒数（默认 60）
 * @param {number} options.closedSeconds — Chrome 关闭期间秒数（默认 120）
 * @param {number} options.postRestartSeconds — 重开后运行秒数（默认 30）
 * @param {boolean} options.reset — 测试前是否重置 calibration 数据
 * @param {boolean} options.verbose — 是否打印详细日志
 * @param {string} options.outputDir — 报告输出目录
 * @returns {Promise<{ success: boolean, jsonPath: string, mdPath: string, summary: Object }>}
 */
async function runChromeRestart({
  preActiveSeconds = 60,
  closedSeconds = 120,
  postRestartSeconds = 30,
  reset = false,
  verbose = false,
  outputDir,
} = {}) {
  const userDataDir = path.resolve(__dirname, `../../../test-system-gate-${Date.now()}`);
  let browserCtx = null;
  let sw = null;
  let extensionId = null;
  let mockServer = null;
  let mockServerUrl = null;

  const log = (...args) => {
    if (verbose) console.log(...args);
  };

  try {
    // ── 启动本地 mock server ──
    log('[chrome-restart] 启动本地 mock server...');
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
        resolve();
      });
      mockServer.on('error', reject);
    });
    log('[chrome-restart] Mock server 启动成功:', mockServerUrl);

    // ── Phase A: 启动 Chrome 并预运行 ──
    log('[chrome-restart] Phase A: 启动 Chrome...');
    const ctx = await launchExtensionContext(userDataDir);
    browserCtx = ctx.browserCtx;
    sw = ctx.sw;
    extensionId = ctx.extensionId;
    log('[chrome-restart] 扩展已加载，Extension ID:', extensionId);

    // 绑定状态预检
    log('[chrome-restart] 检查绑定状态...');
    const bindingPreflight = await extractBindingStatus(sw);
    log('[chrome-restart] 绑定状态:', JSON.stringify(bindingPreflight));

    if (!bindingPreflight.bound) {
      throw new Error(
        '设备未绑定（缺少 device_token 或 profile_id）。' +
        'chrome-restart / sleep-wake / network-offline Gate 在未绑定状态下不应执行。' +
        '如需强制运行，请使用 dry-run 场景或先完成设备绑定。'
      );
    }

    log('[chrome-restart] 初始化 rest mode...');
    await initializeRestMode(sw);

    if (reset) {
      log('[chrome-restart] 重置 calibration 数据...');
      await resetCalibrationData(sw);
    }

    log('[chrome-restart] 打开本地 mock 页面...');
    const page = await browserCtx.newPage();
    await page.goto(mockServerUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });

    log(`[chrome-restart] Phase A: 等待 ${preActiveSeconds} 秒让扩展累积 session...`);
    await sleep(preActiveSeconds * 1000);

    // ── 提取关闭前快照 ──
    log('[chrome-restart] 提取关闭前快照...');
    const beforeEventLog = await extractEventLog(sw);
    const beforeSession = await extractSession(sw);
    const beforeTrace = await extractTimingTrace(sw);
    log('[chrome-restart] 关闭前 session:', JSON.stringify(beforeSession));

    // ── Phase B: 关闭 Chrome ──
    log('[chrome-restart] Phase B: 关闭 Chrome...');
    await browserCtx.close();
    browserCtx = null;
    sw = null;

    log(`[chrome-restart] Phase B: 等待 ${closedSeconds} 秒（模拟离线时间）...`);
    await sleep(closedSeconds * 1000);

    // ── Phase C: 使用相同 userDataDir 重新启动 Chrome ──
    log('[chrome-restart] Phase C: 重新启动 Chrome...');
    const ctx2 = await relaunchExtensionContext(userDataDir);
    browserCtx = ctx2.browserCtx;
    sw = ctx2.sw;
    extensionId = ctx2.extensionId;
    log('[chrome-restart] Chrome 已重开，Extension ID:', extensionId);

    // 立即提取 session，验证 recover() 已重置（在新信号到达之前）
    log('[chrome-restart] 立即检查 recover() 后的 session 状态...');
    const sessionAfterRecover = await extractSession(sw);
    log('[chrome-restart] recover() 后 session:', JSON.stringify(sessionAfterRecover));

    log(`[chrome-restart] Phase C: 等待 ${postRestartSeconds} 秒让 SW 恢复并产生新信号...`);
    await sleep(postRestartSeconds * 1000);

    // ── 提取重开后快照 ──
    log('[chrome-restart] 提取重开后快照...');
    const afterEventLog = await extractEventLog(sw);
    const afterSession = await extractSession(sw);
    const afterTrace = await extractTimingTrace(sw);
    const afterStats = await extractTodayStats(sw);
    const afterCalibration = await extractCalibration(sw);

    log('[chrome-restart] 最终 session:', JSON.stringify(afterSession));

    // ── 验证恢复行为 ──
    log('[chrome-restart] 执行验证...');

    // 查找 recover() 追加的 END 事件
    const newEvents = afterEventLog.slice(beforeEventLog.length);
    const endEvent = newEvents.find(e => e.type === 'END');

    const lastHeartbeatBefore = beforeSession?.lastHeartbeat || 0;
    const endTime = endEvent?.time || 0;
    const endTimeDelta = Math.abs(endTime - lastHeartbeatBefore);
    const TOLERANCE_MS = 5000; // 5 秒容差

    const validation = {
      endEventFound: !!endEvent,
      endTimeTruncated: endTimeDelta <= TOLERANCE_MS,
      endTimeDeltaMs: endTimeDelta,
      noDuplicateEnd: newEvents.filter(e => e.type === 'END').length === 1,
      // recover() 后、新信号到达前的 session 应为 null（已重置）
      sessionReset: sessionAfterRecover === null || (sessionAfterRecover?.state === null && sessionAfterRecover?.startTime === null),
      // Chrome 重启后 session 从 persistent storage 读取，recover 总会截断到 lastHeartbeat
      closedTimeNotCounted: endTimeDelta <= TOLERANCE_MS,
    };

    // 总体结果
    let result = 'FAIL';
    if (validation.endEventFound && validation.endTimeTruncated && validation.sessionReset && validation.noDuplicateEnd) {
      result = 'PASS';
    } else if (validation.endEventFound) {
      result = 'PARTIAL';
    }

    const reportData = {
      meta: {
        scenario: 'chrome-restart',
        timestamp: new Date().toISOString(),
        extensionVersion: '1.7.2',
        commit: 'a4f2e06',
      },
      mockServer: {
        started: true,
        url: mockServerUrl,
        closed: false,
      },
      phases: {
        preClose: {
          durationSec: preActiveSeconds,
          session: beforeSession || {},
          eventLogCount: beforeEventLog.length,
          traceCount: beforeTrace.success ? (beforeTrace.trace?.length || 0) : 0,
        },
        closed: {
          durationSec: closedSeconds,
        },
        postReopen: {
          durationSec: postRestartSeconds,
          session: afterSession || {},
          eventLogCount: afterEventLog.length,
          traceCount: afterTrace.success ? (afterTrace.trace?.length || 0) : 0,
          stats: afterStats.success ? (afterStats.stats || {}) : {},
        },
      },
      browser: {
        loaded: true,
        extensionId,
        serviceWorkerUrl: sw?.url() || 'N/A',
        siteUrl: mockServerUrl,
      },
      bindingPreflight,
      recovery: {
        endEvent: endEvent || null,
        lastHeartbeatBefore,
        newEventsCount: newEvents.length,
      },
      validation,
      result,
    };

    const jsonPath = writeJsonReport(reportData, outputDir);
    const mdPath = writeMarkdownReport(reportData, outputDir);

    log('[chrome-restart] JSON 报告:', jsonPath);
    log('[chrome-restart] Markdown 报告:', mdPath);

    return {
      success: result !== 'FAIL',
      jsonPath,
      mdPath,
      summary: reportData,
    };
  } catch (err) {
    console.error('[chrome-restart] 执行失败:', err.message);
    return {
      success: false,
      jsonPath: null,
      mdPath: null,
      summary: { error: err.message, stack: err.stack },
    };
  } finally {
    if (browserCtx) {
      log('[chrome-restart] 关闭浏览器...');
      await closeContext(browserCtx, userDataDir, true);
    }
    if (mockServer) {
      log('[chrome-restart] 关闭 mock server...');
      await new Promise(resolve => mockServer.close(resolve));
    }
  }
}

module.exports = { runChromeRestart };

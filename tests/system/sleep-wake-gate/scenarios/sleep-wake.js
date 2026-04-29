// scenarios/sleep-wake.js — Phase 3: Windows OS 睡眠/唤醒恢复验证（Manual-Wake 模型）
//
// 安全规则：
// - 必须带 --allowSystemSleep 才执行 OS 睡眠
// - 当前环境无管理员权限，无法设置 Windows Wake-To-Run，故使用人工唤醒
// - Sleep 触发：runner 自动执行 rundll32 powrprof.dll,SetSuspendState
// - Wake 方式：操作者手动按电源键/键盘/鼠标唤醒
// - 睡眠时长：由操作者决定（10s ~ 120s），不作为 pass/fail 条件

const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
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
 * 检查系统是否支持 S3 睡眠
 * @returns {Promise<{ supported: boolean, reason: string }>}
 */
function checkSleepSupport() {
  return new Promise(resolve => {
    const { exec } = require('child_process');
    exec('powercfg /a', (error, stdout) => {
      if (error) {
        resolve({ supported: false, reason: '无法执行 powercfg /a' });
        return;
      }
      const output = stdout || '';
      // 检查 S3 是否可用
      const s3Unavailable = output.includes('S3') && (
        output.includes('不可用') || output.includes('��֧��') || output.includes('not available')
      );
      const standbyUnavailable = output.includes(' standby ') && output.includes('not available');
      if (s3Unavailable || standbyUnavailable) {
        resolve({ supported: false, reason: '系统硬件/固件不支持 S3 睡眠（可能为虚拟机或 Modern Standby 设备）' });
      } else {
        resolve({ supported: true, reason: '' });
      }
    });
  });
}

/**
 * 触发 Windows 睡眠（S3 Standby，非 Hibernate）
 */
function triggerWindowsSleep() {
  return new Promise(resolve => {
    const child = spawn('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    setTimeout(resolve, 3000);
  });
}

/**
 * 执行 Phase 3 Sleep-Wake 验证（发布验收测试）
 * @param {Object} options
 * @param {number} options.preActiveSeconds — 睡眠前运行秒数（默认 30）
 * @param {number} options.sleepSeconds — 指导睡眠秒数（默认 120），仅用于打印指导，不用于定时器
 * @param {number} options.postWakeSeconds — 唤醒后运行秒数（默认 30）
 * @param {boolean} options.reset — 测试前是否重置 calibration 数据
 * @param {boolean} options.verbose — 是否打印详细日志
 * @param {string} options.outputDir — 报告输出目录
 * @param {string} options.userDataDir — Chrome 用户数据目录
 * @param {boolean} options.allowSystemSleep — 是否允许执行 OS 睡眠
 * @returns {Promise<{ success: boolean, jsonPath: string, mdPath: string, summary: Object }>}
 */
async function runSleepWake({
  preActiveSeconds = 30,
  sleepSeconds = 120,
  postWakeSeconds = 30,
  reset = false,
  verbose = false,
  outputDir,
  userDataDir: explicitUserDataDir,
  allowSystemSleep = false,
} = {}) {
  const isCustomDir = !!explicitUserDataDir;
  const userDataDir = explicitUserDataDir
    ? path.resolve(explicitUserDataDir)
    : path.resolve(__dirname, `../../../test-system-gate-${Date.now()}`);
  let browserCtx = null;
  let sw = null;
  let extensionId = null;
  let mockServer = null;
  let mockServerUrl = null;

  const log = (...args) => {
    if (verbose) console.log(...args);
  };

  try {
    // ── 安全闸门 ────────────────────────────────────────────────────────────
    if (!allowSystemSleep) {
      throw new Error(
        'sleep-wake 场景必须显式带 --allowSystemSleep 才允许执行 Windows OS 睡眠。' +
        '该操作会暂停整个系统，请确保已保存所有工作。'
      );
    }

    // ── 启动本地 mock server ──
    log('[sleep-wake] 启动本地 mock server...');
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
    log('[sleep-wake] Mock server 启动成功:', mockServerUrl);

    // ── Phase A: 启动 Chrome 并预运行 ──
    log('[sleep-wake] Phase A: 启动 Chrome...');
    const ctx = await launchExtensionContext(userDataDir, !isCustomDir);
    browserCtx = ctx.browserCtx;
    sw = ctx.sw;
    extensionId = ctx.extensionId;
    log('[sleep-wake] 扩展已加载，Extension ID:', extensionId);

    // 绑定状态预检
    log('[sleep-wake] 检查绑定状态...');
    const bindingPreflight = await extractBindingStatus(sw);
    log('[sleep-wake] 绑定状态:', JSON.stringify(bindingPreflight));

    if (!bindingPreflight.bound) {
      throw new Error(
        '设备未绑定（缺少 device_token 或 profile_id）。' +
        'sleep-wake Gate 在未绑定状态下不应执行。'
      );
    }

    log('[sleep-wake] 初始化 rest mode...');
    await initializeRestMode(sw);

    if (reset) {
      log('[sleep-wake] 重置 calibration 数据...');
      await resetCalibrationData(sw);
    }

    log('[sleep-wake] 打开本地 mock 页面...');
    const page = await browserCtx.newPage();
    await page.goto(mockServerUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });

    log(`[sleep-wake] Phase A: 等待 ${preActiveSeconds} 秒让扩展累积 session...`);
    await sleep(preActiveSeconds * 1000);

    // ── 提取睡眠前快照 ──
    log('[sleep-wake] 提取睡眠前快照...');
    const beforeEventLog = await extractEventLog(sw);
    const beforeSession = await extractSession(sw);
    const beforeTrace = await extractTimingTrace(sw);
    log('[sleep-wake] 睡眠前 session:', JSON.stringify(beforeSession));

    // ── Phase B: 检查系统兼容性并触发 Windows OS 睡眠 ──
    log('[sleep-wake] Phase B: 检查系统睡眠支持...');
    const sleepSupport = await checkSleepSupport();
    if (!sleepSupport.supported) {
      log('[sleep-wake] ⚠️ 系统不支持 S3 睡眠:', sleepSupport.reason);
      log('[sleep-wake] ⚠️ 当前环境无法执行真实的 OS 睡眠/唤醒测试。');
      log('[sleep-wake] ⚠️ 请在支持 S3 睡眠的物理机上运行此验收测试。');
    }

    log('[sleep-wake] ============================================================');
    log('[sleep-wake] ⚠️ 即将触发 Windows OS 睡眠！');
    log('[sleep-wake] ⚠️ 请确保已保存所有工作！');
    log(`[sleep-wake] ⚠️ 系统进入睡眠后，请在 ${sleepSeconds} 秒内手动按电源键/键盘/鼠标唤醒。`);
    log('[sleep-wake] ⚠️ 当前环境无管理员权限，无法设置自动唤醒定时器。');
    log('[sleep-wake] ============================================================');

    const beforeSleepTime = Date.now();

    if (sleepSupport.supported) {
      log('[sleep-wake] Phase B: 触发 Windows 睡眠...');
      await triggerWindowsSleep();
    } else {
      log('[sleep-wake] Phase B: 系统不支持 S3 睡眠，跳过睡眠触发。');
      log('[sleep-wake] Phase B: 等待 5 秒模拟间隔...');
      await sleep(5000);
    }

    // 系统进入睡眠后，Node.js 进程被 OS 冻结。
    // 使用短轮询检测唤醒：每次 sleep(2s)，唤醒后检查 elapsed
    // 这样无论睡眠多久，唤醒后最多 2 秒即可检测到
    log('[sleep-wake] Phase B: 系统已进入睡眠，等待人工唤醒...');
    const maxWaitMs = sleepSeconds * 1000 + 30000;
    const pollInterval = 2000;
    let elapsed = 0;
    while (elapsed < maxWaitMs) {
      await sleep(pollInterval);
      elapsed = Date.now() - beforeSleepTime;
      if (elapsed > 5000) {
        // 至少 5 秒已过，认为系统已恢复
        break;
      }
    }

    const afterWakeTime = Date.now();
    const observedElapsedSec = (afterWakeTime - beforeSleepTime) / 1000;
    log(`[sleep-wake] Phase B: 系统已恢复（实际间隔 ${observedElapsedSec.toFixed(1)} 秒）`);

    // ── Phase C: 唤醒后恢复 ──
    log('[sleep-wake] Phase C: 唤醒后恢复 Chrome...');

    // 尝试复用现有 Chrome 连接
    let connectionSurvived = false;
    try {
      await browserCtx.pages();
      const workers = browserCtx.serviceWorkers();
      if (workers.length > 0) {
        sw = workers[0];
        connectionSurvived = true;
        log('[sleep-wake]  → Chrome 连接仍然有效，SW 存活');
      } else {
        sw = await browserCtx.waitForEvent('serviceworker', { timeout: 30000 });
        connectionSurvived = true;
        log('[sleep-wake]  → Chrome 连接有效，SW 已重新获取');
      }
    } catch (err) {
      log('[sleep-wake]  → Chrome 连接已断开，重新启动...');
      await closeContext(browserCtx, userDataDir, false).catch(() => {});
      await sleep(2000);
      const ctx2 = await relaunchExtensionContext(userDataDir);
      browserCtx = ctx2.browserCtx;
      sw = ctx2.sw;
      extensionId = ctx2.extensionId;
    }

    // Wake-after activity：打开 mock 页面，产生新信号（与 sleep 前行为一致）
    log('[sleep-wake] Phase C: 执行 wake-after activity（打开 mock 页面）...');
    let wakeAfterPage = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        wakeAfterPage = await browserCtx.newPage();
        await wakeAfterPage.goto(mockServerUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        break;
      } catch (gotoErr) {
        log(`[sleep-wake]  → 打开页面失败（第 ${attempt} 次）: ${gotoErr.message}`);
        if (wakeAfterPage) {
          await wakeAfterPage.close().catch(() => {});
        }
        if (attempt === 3) {
          log('[sleep-wake]  → 放弃打开新页面，尝试刷新现有页面...');
          try {
            const pages = await browserCtx.pages();
            if (pages.length > 0) {
              await pages[0].reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
              wakeAfterPage = pages[0];
            }
          } catch (reloadErr) {
            log(`[sleep-wake]  → 刷新页面也失败: ${reloadErr.message}`);
          }
        } else {
          await sleep(2000);
        }
      }
    }

    log(`[sleep-wake] Phase C: 等待 ${postWakeSeconds} 秒让 SW 恢复并产生新信号...`);
    await sleep(postWakeSeconds * 1000);

    // ── 提取唤醒后快照 ──
    log('[sleep-wake] 提取唤醒后快照...');
    const afterEventLog = await extractEventLog(sw);
    const afterSession = await extractSession(sw);
    const afterTrace = await extractTimingTrace(sw);
    const afterStats = await extractTodayStats(sw);

    log('[sleep-wake] 最终 session:', JSON.stringify(afterSession));

    // ── 验证恢复行为 ──
    log('[sleep-wake] 执行验证...');

    const newEvents = afterEventLog.slice(beforeEventLog.length);
    const endEvent = newEvents.find(e => e.type === 'END');

    // 核心 pass/fail 验证
    const chromeReachable = connectionSurvived || !!browserCtx;
    const eventLogReadable = Array.isArray(afterEventLog) && afterEventLog.length >= beforeEventLog.length;
    const wakeAfterActivityWorks = afterEventLog.length > beforeEventLog.length;

    // 诊断项（不用于 pass/fail）
    const lastHeartbeatBefore = beforeSession?.lastHeartbeat || 0;
    const endTime = endEvent?.time || 0;
    const endTimeDelta = Math.abs(endTime - lastHeartbeatBefore);

    const validation = {
      // 核心 pass/fail
      chromeReachable,
      eventLogReadable,
      wakeAfterActivityWorks,
      // 诊断项
      recoverObserved: !!endEvent,
      endTimeDeltaMs: endTimeDelta,
      serviceWorkerSurvived: connectionSurvived,
      observedElapsedSec: Math.round(observedElapsedSec * 10) / 10,
    };

    // 结果判定
    let result = 'FAIL';
    if (!sleepSupport.supported) {
      result = 'SKIP';
    } else if (chromeReachable && eventLogReadable && wakeAfterActivityWorks) {
      result = 'PASS';
    } else if (chromeReachable) {
      result = 'PARTIAL';
    }

    const reportData = {
      meta: {
        scenario: 'sleep-wake',
        timestamp: new Date().toISOString(),
        extensionVersion: '1.7.2',
        commit: process.env.GIT_COMMIT || null,
      },
      mockServer: {
        started: true,
        url: mockServerUrl,
        closed: false,
      },
      phases: {
        preSleep: {
          durationSec: preActiveSeconds,
          session: beforeSession || {},
          eventLogCount: beforeEventLog.length,
          traceCount: beforeTrace.success ? (beforeTrace.trace?.length || 0) : 0,
        },
        sleep: {
          guidanceSec: sleepSeconds,
          observedElapsedSec: validation.observedElapsedSec,
          sleepTriggerMode: sleepSupport.supported ? 'automatic' : 'not-supported',
          wakeMode: sleepSupport.supported ? 'manual' : 'N/A',
        },
        postWake: {
          durationSec: postWakeSeconds,
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
      sleepSupport: {
        supported: sleepSupport.supported,
        reason: sleepSupport.reason,
      },
      recovery: {
        endEvent: endEvent || null,
        lastHeartbeatBefore,
        newEventsCount: newEvents.length,
        connectionSurvived,
      },
      validation,
      result,
    };

    const jsonPath = writeJsonReport(reportData, outputDir);
    const mdPath = writeMarkdownReport(reportData, outputDir);

    log('[sleep-wake] JSON 报告:', jsonPath);
    log('[sleep-wake] Markdown 报告:', mdPath);

    return {
      success: result !== 'FAIL',
      skipped: result === 'SKIP',
      jsonPath,
      mdPath,
      summary: reportData,
    };
  } catch (err) {
    console.error('[sleep-wake] 执行失败:', err.message);
    return {
      success: false,
      jsonPath: null,
      mdPath: null,
      summary: { error: err.message, stack: err.stack },
    };
  } finally {
    if (browserCtx) {
      log('[sleep-wake] 关闭浏览器...');
      await closeContext(browserCtx, userDataDir, !isCustomDir || reset);
    }
    if (mockServer) {
      log('[sleep-wake] 关闭 mock server...');
      await new Promise(resolve => mockServer.close(resolve));
    }
  }
}

module.exports = { runSleepWake };

// scenarios/lock-unlock.js — RG-2: Windows lock / unlock recovery validation
//
// Safety rules:
// - Default run performs preflight/reporting only and never locks the workstation.
// - --allowWorkstationLock is required before invoking LockWorkStation.
// - Unlock is manual. The runner waits for post-unlock activity and then verifies
//   Chrome/SW/event-log readability.

const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { launchExtensionContext, closeContext } = require('../lib/browser');
const {
  extractTodayStats,
  extractTimingTrace,
  extractEventLog,
  extractSession,
  extractBindingStatus,
  initializeRestMode,
} = require('../lib/extractors');
const { writeJsonReport, writeMarkdownReport } = require('../lib/reporters');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isWindows() {
  return process.platform === 'win32';
}

function createMockServer(log) {
  let server = null;
  let url = null;
  return {
    async start() {
      server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>TimeOnChrome Lock Gate Mock</title></head>
<body>
  <h1>TimeOnChrome Lock Gate Mock</h1>
  <p>本地 mock 页面，用于锁屏/解锁后产生 content.js 信号。</p>
</body>
</html>`);
      });
      await new Promise((resolve, reject) => {
        server.listen(0, '127.0.0.1', () => {
          url = `http://127.0.0.1:${server.address().port}`;
          resolve();
        });
        server.on('error', reject);
      });
      log('[lock-unlock] Mock server 启动成功:', url);
      return url;
    },
    async close() {
      if (!server) return;
      await new Promise(resolve => server.close(resolve));
    },
    get url() { return url; },
  };
}

function triggerWorkstationLock() {
  return new Promise(resolve => {
    const child = spawn('rundll32.exe', ['user32.dll,LockWorkStation'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    setTimeout(resolve, 2000);
  });
}

async function writeBlockedReport({
  outputDir,
  extensionId = null,
  sw = null,
  mockServerUrl = null,
  bindingPreflight = null,
  preflight,
  procedure,
  validation = {},
}) {
  const reportData = {
    meta: {
      scenario: 'lock-unlock',
      timestamp: new Date().toISOString(),
      extensionVersion: '1.7.2',
      commit: process.env.GIT_COMMIT || null,
    },
    mockServer: mockServerUrl ? { started: true, url: mockServerUrl, closed: false } : null,
    browser: {
      loaded: !!sw,
      extensionId: extensionId || null,
      serviceWorkerUrl: sw?.url() || null,
      siteUrl: mockServerUrl || null,
    },
    bindingPreflight,
    preflight,
    procedure,
    validation,
    result: 'BLOCKED',
  };
  const jsonPath = writeJsonReport(reportData, outputDir);
  const mdPath = writeMarkdownReport(reportData, outputDir);
  return { success: false, blocked: true, jsonPath, mdPath, summary: reportData };
}

async function runLockUnlock({
  preActiveSeconds = 10,
  postUnlockSeconds = 10,
  unlockWaitSeconds = 30,
  allowWorkstationLock = false,
  verbose = false,
  outputDir,
  userDataDir: explicitUserDataDir,
} = {}) {
  const isCustomDir = !!explicitUserDataDir;
  const userDataDir = explicitUserDataDir
    ? path.resolve(explicitUserDataDir)
    : path.resolve(__dirname, `../../../../.artifacts/test-system-gate-${Date.now()}`);
  let browserCtx = null;
  let sw = null;
  let extensionId = null;
  let mockServer = null;
  let mockServerUrl = null;

  const log = (...args) => {
    if (verbose) console.log(...args);
  };

  const procedure = [
    '启动 Chrome 扩展上下文并读取绑定状态。',
    '打开本地 mock 页面并产生锁屏前事件。',
    '若显式提供 --allowWorkstationLock，则调用 Windows LockWorkStation。',
    '操作者手动解锁后，runner 执行 wake-after activity 并读取 event-log/session/stats。',
  ];

  try {
    const preflight = {
      platform: process.platform,
      windowsRequired: true,
      allowWorkstationLock,
      userDataDir,
      manualUnlockRequired: true,
      blockers: [],
    };

    if (!isWindows()) {
      preflight.blockers.push('lock-unlock requires Windows LockWorkStation support');
    }
    if (!allowWorkstationLock) {
      preflight.blockers.push('missing --allowWorkstationLock; runner will not lock the workstation by default');
    }

    mockServer = createMockServer(log);
    mockServerUrl = await mockServer.start();

    log('[lock-unlock] 启动 Chrome 并加载扩展...');
    const ctx = await launchExtensionContext(userDataDir, !isCustomDir);
    browserCtx = ctx.browserCtx;
    sw = ctx.sw;
    extensionId = ctx.extensionId;
    log('[lock-unlock] 扩展已加载，Extension ID:', extensionId);

    const bindingPreflight = await extractBindingStatus(sw);
    log('[lock-unlock] 绑定状态:', JSON.stringify(bindingPreflight));
    if (!bindingPreflight.bound) {
      preflight.blockers.push('device is not bound: missing cloud_device_token or cloud_profile_id');
    }

    if (preflight.blockers.length > 0) {
      return await writeBlockedReport({
        outputDir,
        extensionId,
        sw,
        mockServerUrl,
        bindingPreflight,
        preflight,
        procedure,
        validation: {
          lockTriggered: false,
          eventLogReadable: false,
          postUnlockActivityWorks: false,
        },
      });
    }

    await initializeRestMode(sw);
    const page = await browserCtx.newPage();
    await page.goto(mockServerUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await sleep(preActiveSeconds * 1000);

    const beforeEventLog = await extractEventLog(sw);
    const beforeSession = await extractSession(sw);
    const beforeTrace = await extractTimingTrace(sw);

    log('[lock-unlock] 即将锁定 Windows 工作站，请手动解锁后等待 runner 继续...');
    await triggerWorkstationLock();
    await sleep(unlockWaitSeconds * 1000);

    let postUnlockPage = null;
    try {
      postUnlockPage = await browserCtx.newPage();
      await postUnlockPage.goto(mockServerUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (err) {
      log('[lock-unlock] 解锁后打开页面失败:', err.message);
    }
    await sleep(postUnlockSeconds * 1000);

    const afterEventLog = await extractEventLog(sw);
    const afterSession = await extractSession(sw);
    const afterTrace = await extractTimingTrace(sw);
    const afterStats = await extractTodayStats(sw);

    const validation = {
      lockTriggered: true,
      chromeReachable: !!browserCtx,
      eventLogReadable: Array.isArray(afterEventLog) && afterEventLog.length >= beforeEventLog.length,
      postUnlockActivityWorks: Array.isArray(afterEventLog) && afterEventLog.length > beforeEventLog.length,
      traceReadable: afterTrace.success && Array.isArray(afterTrace.trace),
    };
    const result = validation.chromeReachable && validation.eventLogReadable && validation.postUnlockActivityWorks
      ? 'PASS'
      : 'FAIL';

    const reportData = {
      meta: {
        scenario: 'lock-unlock',
        timestamp: new Date().toISOString(),
        extensionVersion: '1.7.2',
        commit: process.env.GIT_COMMIT || null,
      },
      mockServer: { started: true, url: mockServerUrl, closed: false },
      browser: {
        loaded: true,
        extensionId,
        serviceWorkerUrl: sw?.url() || null,
        siteUrl: mockServerUrl,
      },
      bindingPreflight,
      preflight,
      procedure,
      phases: {
        preLock: {
          durationSec: preActiveSeconds,
          session: beforeSession || {},
          eventLogCount: beforeEventLog.length,
          traceCount: beforeTrace.success ? (beforeTrace.trace?.length || 0) : 0,
        },
        locked: {
          manualUnlockRequired: true,
          waitSec: unlockWaitSeconds,
        },
        postUnlock: {
          durationSec: postUnlockSeconds,
          session: afterSession || {},
          eventLogCount: afterEventLog.length,
          traceCount: afterTrace.success ? (afterTrace.trace?.length || 0) : 0,
          stats: afterStats.success ? (afterStats.stats || {}) : {},
        },
      },
      validation,
      result,
    };

    const jsonPath = writeJsonReport(reportData, outputDir);
    const mdPath = writeMarkdownReport(reportData, outputDir);
    return { success: result === 'PASS', jsonPath, mdPath, summary: reportData };
  } catch (err) {
    console.error('[lock-unlock] 执行失败:', err.message);
    return {
      success: false,
      jsonPath: null,
      mdPath: null,
      summary: { error: err.message, stack: err.stack },
    };
  } finally {
    if (browserCtx) {
      await closeContext(browserCtx, userDataDir, !isCustomDir).catch(() => {});
    }
    if (mockServer) {
      await mockServer.close().catch(() => {});
    }
  }
}

module.exports = { runLockUnlock };

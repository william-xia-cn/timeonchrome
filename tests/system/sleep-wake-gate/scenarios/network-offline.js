// scenarios/network-offline.js — RG-4: network offline / online gate preflight
//
// Safety rules:
// - Default run performs preflight/reporting only and never changes network state.
// - OS-level adapter disable/enable requires admin rights and explicit operator
//   control. The runner reports BLOCKED unless those requirements are satisfied.

const path = require('path');
const { exec } = require('child_process');
const { launchExtensionContext, closeContext } = require('../lib/browser');
const {
  extractBindingStatus,
  extractEventLog,
  extractSession,
  extractTimingTrace,
} = require('../lib/extractors');
const { writeJsonReport, writeMarkdownReport } = require('../lib/reporters');

function execText(command) {
  return new Promise(resolve => {
    exec(command, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: stdout || '',
        stderr: stderr || '',
        error: error?.message || null,
      });
    });
  });
}

async function hasWindowsAdminRights() {
  if (process.platform !== 'win32') return false;
  const result = await execText('net session');
  return result.ok;
}

function isWindows() {
  return process.platform === 'win32';
}

async function writeReport({
  outputDir,
  extensionId = null,
  sw = null,
  bindingPreflight = null,
  preflight,
  procedure,
  validation,
  result,
}) {
  const reportData = {
    meta: {
      scenario: 'network-offline',
      timestamp: new Date().toISOString(),
      extensionVersion: '1.7.2',
      commit: process.env.GIT_COMMIT || null,
    },
    browser: {
      loaded: !!sw,
      extensionId: extensionId || null,
      serviceWorkerUrl: sw?.url() || null,
    },
    bindingPreflight,
    preflight,
    procedure,
    validation,
    result,
  };
  const jsonPath = writeJsonReport(reportData, outputDir);
  const mdPath = writeMarkdownReport(reportData, outputDir);
  return {
    success: result === 'PASS',
    blocked: result === 'BLOCKED',
    skipped: result === 'SKIP',
    jsonPath,
    mdPath,
    summary: reportData,
  };
}

async function runNetworkOffline({
  allowNetworkToggle = false,
  networkAdapterName = null,
  verbose = false,
  outputDir,
  userDataDir: explicitUserDataDir,
} = {}) {
  const isCustomDir = !!explicitUserDataDir;
  const userDataDir = explicitUserDataDir
    ? path.resolve(explicitUserDataDir)
    : path.resolve(__dirname, `../../../test-system-gate-${Date.now()}`);
  let browserCtx = null;
  let sw = null;
  let extensionId = null;

  const log = (...args) => {
    if (verbose) console.log(...args);
  };

  const procedure = [
    '启动 Chrome 扩展上下文并读取绑定状态。',
    '确认操作系统、管理员权限与目标网络适配器。',
    '只有显式提供 --allowNetworkToggle 与 --networkAdapterName=<name> 时，才允许进入人工/管理员网络切换流程。',
    '网络断开/恢复期间必须保持测试控制通道可恢复，并在恢复后读取 event-log/session/trace。',
  ];

  try {
    const admin = await hasWindowsAdminRights();
    const preflight = {
      platform: process.platform,
      windowsRequired: true,
      adminRequired: true,
      hasAdminRights: admin,
      allowNetworkToggle,
      networkAdapterName: networkAdapterName || null,
      userDataDir,
      blockers: [],
    };

    if (!isWindows()) {
      preflight.blockers.push('network-offline gate currently requires Windows adapter control');
    }
    if (!admin) {
      preflight.blockers.push('missing administrator rights required for network adapter disable/enable');
    }
    if (!allowNetworkToggle) {
      preflight.blockers.push('missing --allowNetworkToggle; runner will not modify network state by default');
    }
    if (!networkAdapterName) {
      preflight.blockers.push('missing --networkAdapterName=<name> for the adapter to disable/enable');
    }

    log('[network-offline] 启动 Chrome 并加载扩展...');
    const ctx = await launchExtensionContext(userDataDir, !isCustomDir);
    browserCtx = ctx.browserCtx;
    sw = ctx.sw;
    extensionId = ctx.extensionId;
    log('[network-offline] 扩展已加载，Extension ID:', extensionId);

    const bindingPreflight = await extractBindingStatus(sw);
    log('[network-offline] 绑定状态:', JSON.stringify(bindingPreflight));
    if (!bindingPreflight.bound) {
      preflight.blockers.push('device is not bound: missing cloud_device_token or cloud_profile_id');
    }

    const eventLog = await extractEventLog(sw);
    const session = await extractSession(sw);
    const trace = await extractTimingTrace(sw);

    const validation = {
      networkToggled: false,
      eventLogReadable: Array.isArray(eventLog),
      sessionReadable: session === null || typeof session === 'object',
      traceReadable: trace.success && Array.isArray(trace.trace),
    };

    if (preflight.blockers.length > 0) {
      return await writeReport({
        outputDir,
        extensionId,
        sw,
        bindingPreflight,
        preflight,
        procedure,
        validation,
        result: 'BLOCKED',
      });
    }

    // The destructive adapter toggle is intentionally not implemented until the
    // operator supplies a reviewed adapter-control procedure. This keeps the
    // runner recognized and reportable without risking remote/network loss.
    preflight.blockers.push('adapter toggle procedure is not implemented; provide an approved isolated process or manual operator procedure');
    return await writeReport({
      outputDir,
      extensionId,
      sw,
      bindingPreflight,
      preflight,
      procedure,
      validation,
      result: 'BLOCKED',
    });
  } catch (err) {
    console.error('[network-offline] 执行失败:', err.message);
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
  }
}

module.exports = { runNetworkOffline };

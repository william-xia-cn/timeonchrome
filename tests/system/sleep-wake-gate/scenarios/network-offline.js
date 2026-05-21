// scenarios/network-offline.js — RG-4: network offline / online gate preflight
//
// Safety rules:
// - Default run performs preflight/reporting only and never changes network state.
// - OS-level adapter disable/enable requires admin rights and explicit operator
//   control. The runner reports BLOCKED unless those requirements are satisfied.
// - Manual network mode observes operator-driven disconnect/reconnect and never
//   calls adapter disable/enable commands.

const path = require('path');
const { exec } = require('child_process');
const dns = require('dns').promises;
const net = require('net');
const { launchExtensionContext, closeContext } = require('../lib/browser');
const {
  extractBindingStatus,
  extractEventLog,
  extractSession,
  extractTimingTrace,
} = require('../lib/extractors');
const { writeJsonReport, writeMarkdownReport } = require('../lib/reporters');

const DEFAULT_NETWORK_PROBE_URL = 'https://guardian-api.william-xia-cn.workers.dev';

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function probeOnline(probeUrl = DEFAULT_NETWORK_PROBE_URL) {
  const startedAt = Date.now();
  const checks = {
    http: { ok: false, status: null, error: null },
    dns: { ok: false, error: null },
    socket: { ok: false, error: null },
  };

  // Check 1: HTTP reachability
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(probeUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    checks.http.ok = true;
    checks.http.status = resp.status;
  } catch (err) {
    checks.http.error = err.message;
  }

  // Check 2: DNS resolution
  try {
    await dns.lookup('cloudflare.com');
    checks.dns.ok = true;
  } catch (err) {
    checks.dns.error = err.message;
  }

  // Check 3: raw socket egress
  try {
    await new Promise((resolve, reject) => {
      const sock = net.connect({ host: '1.1.1.1', port: 443, timeout: 3000 }, () => {
        sock.destroy();
        resolve();
      });
      sock.on('timeout', () => {
        sock.destroy();
        reject(new Error('socket timeout'));
      });
      sock.on('error', reject);
    });
    checks.socket.ok = true;
  } catch (err) {
    checks.socket.error = err.message;
  }

  const online = checks.http.ok || checks.dns.ok || checks.socket.ok;
  return {
    online,
    probeUrl,
    status: checks.http.status,
    elapsedMs: Date.now() - startedAt,
    error: online ? null : `all probes failed (http=${checks.http.error}; dns=${checks.dns.error}; socket=${checks.socket.error})`,
    checks,
  };
}

async function waitForNetworkState({
  desiredOnline,
  timeoutSeconds,
  probeUrl,
  log,
}) {
  const observations = [];
  const deadline = Date.now() + timeoutSeconds * 1000;

  while (Date.now() <= deadline) {
    const observation = await probeOnline(probeUrl);
    observations.push({
      at: new Date().toISOString(),
      online: observation.online,
      status: observation.status,
      elapsedMs: observation.elapsedMs,
      error: observation.error,
      checks: observation.checks,
    });

    if (observation.online === desiredOnline) {
      return {
        observed: true,
        observation,
        observations,
      };
    }

    log(
      `[network-offline] 等待网络变为 ${desiredOnline ? 'online' : 'offline'}... ` +
      `当前=${observation.online ? 'online' : 'offline'}`
    );
    await sleep(3000);
  }

  return {
    observed: false,
    observation: observations[observations.length - 1] || null,
    observations,
  };
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
  manualNetworkToggle = false,
  networkAdapterName = null,
  networkOfflineTimeoutSeconds = 120,
  networkOnlineTimeoutSeconds = 120,
  networkProbeUrl = null,
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

  const log = (...args) => {
    if (verbose) console.log(...args);
  };

  const procedure = [
    '启动 Chrome 扩展上下文并读取绑定状态。',
    '确认执行模式：手动网络切换或管理员适配器流程。',
    '手动网络切换模式由操作者断开/恢复网络，runner 只通过探测观察 offline/online，不修改 adapter。',
    '管理员适配器模式只有显式提供 --allowNetworkToggle 与 --networkAdapterName=<name> 时，才允许进入适配器流程。',
    '网络断开/恢复期间必须保持测试控制通道可恢复，并在恢复后读取 event-log/session/trace。',
  ];

  try {
    const admin = await hasWindowsAdminRights();
    const preflight = {
      platform: process.platform,
      windowsRequired: true,
      mode: manualNetworkToggle ? 'manual-network-toggle' : 'admin-adapter-toggle',
      adminRequired: !manualNetworkToggle,
      hasAdminRights: admin,
      allowNetworkToggle,
      manualNetworkToggle,
      networkAdapterName: networkAdapterName || null,
      networkProbeUrl: networkProbeUrl || DEFAULT_NETWORK_PROBE_URL,
      networkOfflineTimeoutSeconds,
      networkOnlineTimeoutSeconds,
      userDataDir,
      blockers: [],
    };

    if (!isWindows() && !manualNetworkToggle) {
      preflight.blockers.push('admin adapter network-offline gate currently requires Windows adapter control');
    }
    if (!manualNetworkToggle && !admin) {
      preflight.blockers.push('missing administrator rights required for network adapter disable/enable');
    }
    if (!manualNetworkToggle && !allowNetworkToggle) {
      preflight.blockers.push('missing --allowNetworkToggle; runner will not modify network state by default');
    }
    if (!manualNetworkToggle && !networkAdapterName) {
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

    const beforeEventLog = await extractEventLog(sw);
    const beforeSession = await extractSession(sw);
    const beforeTrace = await extractTimingTrace(sw);

    const validation = {
      networkToggled: false,
      mode: preflight.mode,
      initialOnline: null,
      offlineObserved: false,
      onlineRestored: false,
      eventLogReadable: Array.isArray(beforeEventLog),
      sessionReadable: beforeSession === null || typeof beforeSession === 'object',
      traceReadable: beforeTrace.success && Array.isArray(beforeTrace.trace),
      recoveryStateReadable: false,
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

    if (manualNetworkToggle) {
      const probeUrl = networkProbeUrl || DEFAULT_NETWORK_PROBE_URL;
      const initialProbe = await probeOnline(probeUrl);
      validation.initialOnline = initialProbe.online;
      validation.initialProbe = initialProbe;

      if (!initialProbe.online) {
        preflight.blockers.push('initial online state was not observed before manual network gate');
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

      console.log('');
      console.log('[network-offline] ============================================================');
      console.log('[network-offline] 手动网络切换模式');
      console.log('[network-offline] 请现在手动断开网络连接（例如关闭 Wi-Fi 或拔掉网络）。');
      console.log(`[network-offline] runner 将等待最多 ${networkOfflineTimeoutSeconds} 秒观察 offline。`);
      console.log('[network-offline] ============================================================');

      const offlineWait = await waitForNetworkState({
        desiredOnline: false,
        timeoutSeconds: networkOfflineTimeoutSeconds,
        probeUrl,
        log,
      });
      validation.offlineObserved = offlineWait.observed;
      validation.offlineProbe = offlineWait.observation;
      validation.offlineObservationCount = offlineWait.observations.length;

      if (!offlineWait.observed) {
        return await writeReport({
          outputDir,
          extensionId,
          sw,
          bindingPreflight,
          preflight,
          procedure,
          validation,
          result: 'FAIL',
        });
      }

      console.log('');
      console.log('[network-offline] ============================================================');
      console.log('[network-offline] 已观察到 offline。请现在手动恢复网络连接。');
      console.log(`[network-offline] runner 将等待最多 ${networkOnlineTimeoutSeconds} 秒观察 online。`);
      console.log('[network-offline] ============================================================');

      const onlineWait = await waitForNetworkState({
        desiredOnline: true,
        timeoutSeconds: networkOnlineTimeoutSeconds,
        probeUrl,
        log,
      });
      validation.onlineRestored = onlineWait.observed;
      validation.onlineProbe = onlineWait.observation;
      validation.onlineObservationCount = onlineWait.observations.length;

      const afterEventLog = await extractEventLog(sw);
      const afterSession = await extractSession(sw);
      const afterTrace = await extractTimingTrace(sw);
      validation.eventLogReadable = Array.isArray(afterEventLog);
      validation.sessionReadable = afterSession === null || typeof afterSession === 'object';
      validation.traceReadable = afterTrace.success && Array.isArray(afterTrace.trace);
      validation.recoveryStateReadable =
        validation.eventLogReadable && validation.sessionReadable && validation.traceReadable;
      validation.eventLogCountBefore = Array.isArray(beforeEventLog) ? beforeEventLog.length : null;
      validation.eventLogCountAfter = Array.isArray(afterEventLog) ? afterEventLog.length : null;
      validation.networkToggled = validation.offlineObserved && validation.onlineRestored;

      return await writeReport({
        outputDir,
        extensionId,
        sw,
        bindingPreflight,
        preflight,
        procedure,
        validation,
        result: validation.networkToggled && validation.recoveryStateReadable ? 'PASS' : 'FAIL',
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

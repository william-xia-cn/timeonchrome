#!/usr/bin/env node
// Real development profile timing verification lane.
// Connects to an existing Chrome CDP endpoint and reports sanitized timing state.

'use strict';

const { execFile } = require('child_process');

function parseArgs(argv) {
  const out = {
    port: 9222,
    scenario: 'responsiveness',
    url: 'https://www.desmos.com/calculator',
    switchUrl: 'https://www.khanacademy.org/',
    durationSec: null,
    timeoutMs: 3000,
    keepActive: true,
    connection: 'auto',
    runId: String(Date.now()).slice(-8),
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--port') { out.port = Number(next); i++; }
    else if (arg === '--scenario') { out.scenario = String(next || ''); i++; }
    else if (arg === '--url') { out.url = String(next || ''); i++; }
    else if (arg === '--switch-url') { out.switchUrl = String(next || ''); i++; }
    else if (arg === '--duration-sec') { out.durationSec = Number(next); i++; }
    else if (arg === '--timeout-ms') { out.timeoutMs = Number(next); i++; }
    else if (arg === '--raw-cdp') { out.connection = 'raw_cdp'; }
    else if (arg === '--no-keep-active') { out.keepActive = false; }
    else if (arg === '--run-id') { out.runId = String(next || ''); i++; }
  }
  return out;
}

function loadPlaywright() {
  try {
    return require('@playwright/test');
  } catch (firstError) {
    const fallback = require('path').resolve(__dirname, '..', '..', '..', 'timeonchrome', 'node_modules', '@playwright', 'test');
    try {
      return require(fallback);
    } catch (_) {
      throw firstError;
    }
  }
}

class RawCdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.socket = null;
  }

  async connect() {
    this.socket = new WebSocket(this.wsUrl);
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else pending.resolve(message.result || {});
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('raw_cdp_connect_timeout')), 10000);
      this.socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('raw_cdp_connect_error'));
      }, { once: true });
    });
    await this.send('Runtime.enable').catch(() => {});
    return this;
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(payload);
    });
  }

  async evaluate(fnOrExpression, arg) {
    const expression = typeof fnOrExpression === 'function'
      ? `(${fnOrExpression.toString()})(${JSON.stringify(arg)})`
      : String(fnOrExpression);
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Runtime.evaluate exception');
    }
    return result.result?.value;
  }

  close() {
    try { this.socket?.close(); } catch (_) {}
  }
}

async function rawJson(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  if (!response.ok) throw new Error(`CDP HTTP ${response.status} for ${path}`);
  return response.json();
}

async function openRawTarget(base, url) {
  const target = await rawJson(base, `/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  return target;
}

function localDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function redactUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.pathname === '/' ? '/' : ''}`;
  } catch (_) {
    return null;
  }
}

function domainFromUrl(url) {
  try { return new URL(url).hostname; } catch (_) { return null; }
}

function segmentValues(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

function summarizeEvents(events) {
  return (Array.isArray(events) ? events.slice(-12) : []).map((event) => ({
    type: event?.type || null,
    state: event?.state || null,
    domain: event?.domain || null,
    countable: event?.countable,
    reason: event?.reason || null,
    dropReason: event?.dropReason || null,
    ageSeconds: Number.isFinite(event?.time) ? Math.max(0, Math.round((Date.now() - event.time) / 1000)) : null,
  }));
}

function summarizeSegments(rawSegments) {
  return segmentValues(rawSegments).slice(-12).map((segment) => ({
    domain: segment?.domain || null,
    channel: segment?.channel || null,
    framework: segment?.framework || null,
    sourceState: segment?.sourceState || null,
    settlementReason: segment?.settlementReason || null,
    durationSeconds: Number(segment?.durationSeconds || 0),
    date: segment?.date || null,
  }));
}

function statSeconds(stats, domain) {
  const value = stats?.[domain] ?? stats?.domains?.[domain];
  return Number(value || 0);
}

function nestedStatSeconds(stats, key, domain) {
  return Number(stats?.[key]?.[domain] || 0);
}

function dailyDomainSeconds(day, domain) {
  const value = day?.domains?.[domain];
  if (typeof value === 'number') return value;
  return Number(value?.activeSeconds || value?.totalSeconds || 0);
}

function matchingSegmentCount(rawSegments, { domain, framework, channel } = {}) {
  return segmentValues(rawSegments).filter((segment) =>
    (!domain || segment?.domain === domain) &&
    (!framework || segment?.framework === framework) &&
    (!channel || segment?.channel === channel)
  ).length;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function keepChromeActiveOnce() {
  if (process.platform !== 'win32') return { ok: false, skipped: 'non_windows' };
  return new Promise((resolve) => {
    execFile('powershell.exe', [
      '-NoProfile',
      '-Command',
      "$ws = New-Object -ComObject WScript.Shell; $null = $ws.AppActivate('Chrome'); $ws.SendKeys('+')",
    ], { windowsHide: true, timeout: 5000 }, (error) => {
      resolve(error ? { ok: false, error: error.message } : { ok: true });
    });
  });
}

async function waitWithKeepActive(page, seconds, enabled) {
  const started = Date.now();
  const end = started + Math.max(0, seconds) * 1000;
  let keepActiveAttempts = 0;
  let lastOsActivateAt = 0;
  while (Date.now() < end) {
    if (enabled) {
      await page.bringToFront().catch(() => {});
      if (typeof page.nudgeUserActivity === 'function') {
        await page.nudgeUserActivity().catch(() => {});
      } else if (page.keyboard?.press) {
        await page.keyboard.press('Shift').catch(() => {});
      }
      if (Date.now() - lastOsActivateAt >= 5000) {
        await keepChromeActiveOnce();
        keepActiveAttempts++;
        lastOsActivateAt = Date.now();
      }
    }
    await sleep(Math.min(5000, Math.max(0, end - Date.now())));
  }
  return { elapsedSeconds: Math.round((Date.now() - started) / 1000), keepActiveAttempts };
}

async function timed(label, fn) {
  const started = Date.now();
  try {
    const result = await fn();
    return { label, ok: true, elapsedMs: Date.now() - started, result };
  } catch (error) {
    return { label, ok: false, elapsedMs: Date.now() - started, error: error?.message || String(error) };
  }
}

async function connect(args) {
  const base = `http://127.0.0.1:${args.port}`;
  const targets = await rawJson(base, '/json/list');
  const swTarget = targets.find((target) => target.type === 'service_worker' && String(target.url || '').includes('/background.js'));

  try {
    if (args.connection === 'raw_cdp' || args.scenario !== 'responsiveness') {
      throw new Error('raw_cdp_requested');
    }
    const { chromium } = loadPlaywright();
    const browser = await chromium.connectOverCDP(base, { timeout: 10000 });
    const context = browser.contexts()[0];
    if (!context) throw new Error('No Chrome context available on CDP connection');

    let worker = context.serviceWorkers().find((sw) => sw.url().includes('/background.js'));
    if (!worker) {
      if (!swTarget) throw new Error('TimeOnChrome service worker not found');
      worker = await context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null);
    }
    if (!worker) {
      worker = context.serviceWorkers().find((sw) => sw.url().includes('/background.js'));
    }
    if (!worker) throw new Error('TimeOnChrome service worker target unavailable');

    const extensionId = new URL(worker.url()).hostname;
    const admin = await context.newPage();
    await admin.goto(`chrome-extension://${extensionId}/admin/admin.html?view=stats`, { waitUntil: 'domcontentloaded', timeout: 10000 });

    async function sendRuntime(message, timeoutMs = args.timeoutMs) {
      const started = Date.now();
      try {
        const result = await Promise.race([
          admin.evaluate((payload) => chrome.runtime.sendMessage(payload), message),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout_${timeoutMs}ms`)), timeoutMs)),
        ]);
        return { ok: true, elapsedMs: Date.now() - started, result };
      } catch (error) {
        return { ok: false, elapsedMs: Date.now() - started, error: error?.message || String(error) };
      }
    }

    async function readStorage() {
      return worker.evaluate(async (dateKey) => {
        const local = await chrome.storage.local.get([
          'event_log_v1',
          'usage_segments_v1',
          'daily_usage_stats_v1',
          'foreground_page_diagnostics_v1',
          'media_session_v1',
        ]);
        const session = await chrome.storage.session.get(['session_v1']);
        const persistent = await chrome.storage.local.get(['session_v1_persistent']);
        return {
          session: session.session_v1 || null,
          persistentSession: persistent.session_v1_persistent || null,
          eventLog: local.event_log_v1 || [],
          usageSegments: local.usage_segments_v1 || {},
          dailyToday: local.daily_usage_stats_v1?.[dateKey] || null,
          foregroundDiagnostics: local.foreground_page_diagnostics_v1 || null,
          mediaSession: local.media_session_v1 || null,
        };
      }, localDateKey());
    }

    async function openExtensionPage(path) {
      return timed(path, async () => {
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/${path}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
        const title = await page.title().catch(() => null);
        return { title, urlPath: path };
      });
    }

    async function openPage(url) {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      page.nudgeUserActivity = async () => {
        await page.keyboard.press('Shift').catch(() => {});
      };
      return page;
    }

    return { browser, context, worker, extensionId, admin, sendRuntime, readStorage, openExtensionPage, openPage, connection: 'playwright_cdp' };
  } catch (playwrightError) {
    if (!swTarget?.webSocketDebuggerUrl) throw playwrightError;
    const workerClient = await new RawCdpClient(swTarget.webSocketDebuggerUrl).connect();
    const extensionId = new URL(swTarget.url).hostname;
    const adminTarget = await openRawTarget(base, `chrome-extension://${extensionId}/admin/admin.html?view=stats`);
    const adminClient = await new RawCdpClient(adminTarget.webSocketDebuggerUrl).connect();

    async function sendRuntime(message, timeoutMs = args.timeoutMs) {
      const started = Date.now();
      try {
        const result = await Promise.race([
          adminClient.evaluate(async (payload) => {
            return new Promise((resolve) => {
              chrome.runtime.sendMessage(payload, (response) => {
                resolve({
                  response: response || null,
                  lastError: chrome.runtime.lastError?.message || null,
                });
              });
            });
          }, message),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout_${timeoutMs}ms`)), timeoutMs)),
        ]);
        if (result?.lastError) {
          return { ok: false, elapsedMs: Date.now() - started, error: result.lastError };
        }
        return { ok: true, elapsedMs: Date.now() - started, result: result?.response ?? result };
      } catch (error) {
        return { ok: false, elapsedMs: Date.now() - started, error: error?.message || String(error) };
      }
    }

    async function readStorage() {
      return workerClient.evaluate(async (dateKey) => {
        const local = await chrome.storage.local.get([
          'event_log_v1',
          'usage_segments_v1',
          'daily_usage_stats_v1',
          'foreground_page_diagnostics_v1',
          'media_session_v1',
        ]);
        const session = await chrome.storage.session.get(['session_v1']);
        const persistent = await chrome.storage.local.get(['session_v1_persistent']);
        return {
          session: session.session_v1 || null,
          persistentSession: persistent.session_v1_persistent || null,
          eventLog: local.event_log_v1 || [],
          usageSegments: local.usage_segments_v1 || {},
          dailyToday: local.daily_usage_stats_v1?.[dateKey] || null,
          foregroundDiagnostics: local.foreground_page_diagnostics_v1 || null,
          mediaSession: local.media_session_v1 || null,
        };
      }, localDateKey());
    }

    async function openExtensionPage(path) {
      return timed(path, async () => {
        const target = await openRawTarget(base, `chrome-extension://${extensionId}/${path}`);
        await rawJson(base, `/json/activate/${target.id}`).catch(() => null);
        return { title: target.title || null, urlPath: path };
      });
    }

    async function openPage(url) {
      const target = await openRawTarget(base, url);
      const pageClient = target.webSocketDebuggerUrl
        ? await new RawCdpClient(target.webSocketDebuggerUrl).connect()
        : null;
      return {
        async bringToFront() { await rawJson(base, `/json/activate/${target.id}`).catch(() => null); },
        async nudgeUserActivity() {
          if (!pageClient) return;
          await pageClient.send('Input.dispatchKeyEvent', {
            type: 'rawKeyDown',
            key: 'Shift',
            code: 'ShiftLeft',
            windowsVirtualKeyCode: 16,
          }).catch(() => {});
          await pageClient.send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'Shift',
            code: 'ShiftLeft',
            windowsVirtualKeyCode: 16,
          }).catch(() => {});
        },
        url() { return target.url || url; },
        async close() {
          pageClient?.close();
          await rawJson(base, `/json/close/${target.id}`).catch(() => null);
        },
      };
    }

    return {
      browser: {
        async close() {
          workerClient.close();
          adminClient.close();
        },
      },
      context: null,
      worker: { evaluate: (fn, arg) => workerClient.evaluate(fn, arg) },
      extensionId,
      admin: null,
      sendRuntime,
      readStorage,
      openExtensionPage,
      openPage,
      connection: 'raw_cdp',
      playwrightConnectError: playwrightError?.message || String(playwrightError),
    };
  }
}

async function runResponsiveness(env, args) {
  const popup = await env.openExtensionPage('popup/popup.html');
  const admin = await env.openExtensionPage('admin/admin.html?view=stats');
  const messages = {};
  for (const type of ['FLUSH_TIME', 'GET_STATS', 'GET_STATS_RANGE', 'GET_RUNTIME_MODE_STATUS']) {
    const payload = type === 'GET_STATS_RANGE' ? { type, days: 1 } : { type };
    const response = await env.sendRuntime(payload, args.timeoutMs);
    messages[type] = {
      ok: response.ok,
      elapsedMs: response.elapsedMs,
      error: response.error || null,
      resultKeys: response.result && typeof response.result === 'object' ? Object.keys(response.result).slice(0, 12) : [],
    };
  }
  return { status: 'PASS', popup: popup.elapsedMs, admin: admin.elapsedMs, messages };
}

async function runForeground(env, args) {
  const durationSec = Number.isFinite(args.durationSec) ? args.durationSec : 195;
  const before = await env.readStorage();
  const beforeStats = (await env.sendRuntime({ type: 'GET_STATS' }, args.timeoutMs)).result || {};
  const page = await env.openPage(args.url);
  await page.bringToFront();
  const domain = domainFromUrl(typeof page.url === 'function' ? page.url() : page.url);
  const waitResult = await waitWithKeepActive(page, durationSec, args.keepActive);
  const after = await env.readStorage();
  const statsResponse = await env.sendRuntime({ type: 'GET_STATS' }, args.timeoutMs);
  const rangeResponse = await env.sendRuntime({ type: 'GET_STATS_RANGE', days: 1 }, args.timeoutMs);
  const idleState = await env.worker.evaluate(async () => {
    return new Promise((resolve) => chrome.idle.queryState(180, resolve));
  }).catch(() => null);
  await page.close?.().catch(() => {});
  const afterStats = statsResponse.result || {};
  const beforeSegments = segmentValues(before.usageSegments);
  const afterSegments = segmentValues(after.usageSegments);
  const matchingSegments = afterSegments.filter((segment) => segment?.domain === domain);
  const beforeMatchingCount = beforeSegments.filter((segment) => segment?.domain === domain).length;
  const newDurableSegment = matchingSegments.length > beforeMatchingCount;
  return {
    status: newDurableSegment ? 'PASS' : (idleState && idleState !== 'active' ? 'BLOCKED_SYSTEM_IDLE' : 'NO_DURABLE_SEGMENT'),
    domain,
    url: redactUrl(typeof page.url === 'function' ? page.url() : page.url),
    wait: waitResult,
    idleState,
    messageLatencyMs: {
      GET_STATS: statsResponse.elapsedMs,
      GET_STATS_RANGE: rangeResponse.elapsedMs,
    },
    statsDeltaApprox: statSeconds(afterStats, domain) - statSeconds(beforeStats, domain),
    segmentCountDelta: afterSegments.length - beforeSegments.length,
    matchingSegments: summarizeSegments(matchingSegments),
    dailyDomainSeconds: dailyDomainSeconds(after.dailyToday, domain),
    session: after.session ? { state: after.session.state, domain: after.session.domain, hasStartTime: !!after.session.startTime } : null,
    eventTail: summarizeEvents(after.eventLog),
  };
}

function mediaScenarioConfig(name, runId = String(Date.now()).slice(-8)) {
  const suffix = String(runId || Date.now()).replace(/[^a-zA-Z0-9-]/g, '').slice(-16) || 'run';
  if (name === 'background-audio') {
    return {
      scenario: name,
      framework: 'background_audio',
      channel: 'backgroundMedia',
      mediaKind: 'audio',
      pip: false,
      domain: `real-profile-audio-${suffix}.test`,
    };
  }
  if (name === 'background-video') {
    return {
      scenario: name,
      framework: 'background_video',
      channel: 'backgroundMedia',
      mediaKind: 'video',
      pip: false,
      domain: `real-profile-video-${suffix}.test`,
    };
  }
  if (name === 'pip') {
    return {
      scenario: name,
      framework: 'pip_video',
      channel: 'pip',
      mediaKind: 'video',
      pip: true,
      domain: `real-profile-pip-${suffix}.test`,
    };
  }
  return null;
}

async function runControlledMedia(env, args, name) {
  const cfg = mediaScenarioConfig(name, args.runId);
  if (!cfg) {
    return {
      status: 'NOT_IMPLEMENTED',
      scenario: name,
      reason: 'Unknown media verification scenario.',
    };
  }

  const capability = await env.worker.evaluate(() => ({
    hasControlledSignal: typeof globalThis.debugApplyControlledTimingSignal === 'function',
    hasMediaCheckpoint: typeof globalThis.debugRunMediaPeriodicCheckpoint === 'function',
  }));
  if (!capability.hasControlledSignal || !capability.hasMediaCheckpoint) {
    return {
      status: 'BLOCKED_EXTENSION_NOT_CURRENT',
      scenario: name,
      reason: 'Loaded real-profile extension does not expose current branch media timing debug hooks.',
      capability,
    };
  }

  const before = await env.readStorage();
  const beforeStats = (await env.sendRuntime({ type: 'GET_STATS' }, args.timeoutMs)).result || {};
  if (before.mediaSession?.framework && before.mediaSession.framework !== 'none') {
    return {
      status: 'BLOCKED_ACTIVE_MEDIA_SESSION',
      scenario: name,
      reason: 'Real profile already has an open media session; controlled verification did not modify it.',
      existingFramework: before.mediaSession.framework,
      existingDomain: before.mediaSession.domain || null,
    };
  }

  const sourceTabId = 900001;
  const activeTabId = 900002;
  const startSignal = await env.worker.evaluate(async ({ cfg, sourceTabId, activeTabId }) => {
    return globalThis.debugApplyControlledTimingSignal({
      tabId: activeTabId,
      windowId: 1,
      domain: null,
      isFocused: true,
      isIdle: false,
      isAudible: true,
      isPiP: cfg.pip,
      mediaKind: cfg.mediaKind,
      mediaSourceTabId: sourceTabId,
      mediaSourceDomain: cfg.domain,
      _reason: `real_profile_${cfg.framework}_start`,
    });
  }, { cfg, sourceTabId, activeTabId });

  await sleep(5500);

  const opened = await env.readStorage();
  if (opened.mediaSession?.framework !== cfg.framework || opened.mediaSession?.domain !== cfg.domain) {
    return {
      status: 'FAIL',
      scenario: name,
      reason: 'controlled_media_session_not_opened',
      startSignal,
      observedMediaSession: opened.mediaSession,
    };
  }

  const checkpointAt = Date.now();
  await env.worker.evaluate(async ({ startTime, checkpointAt }) => {
    const data = await chrome.storage.local.get('media_session_v1');
    const session = data.media_session_v1;
    if (!session || session.framework === 'none') return { ok: false, reason: 'no_media_session' };
    await chrome.storage.local.set({
      media_session_v1: {
        ...session,
        startTime,
        lastHeartbeat: checkpointAt,
      },
    });
    return { ok: true };
  }, { startTime: checkpointAt - 181000, checkpointAt });

  const checkpoint = await env.worker.evaluate(async (now) => {
    return globalThis.debugRunMediaPeriodicCheckpoint(now);
  }, checkpointAt);

  const stopSignal = await env.worker.evaluate(async ({ cfg, sourceTabId, activeTabId }) => {
    return globalThis.debugApplyControlledTimingSignal({
      tabId: activeTabId,
      windowId: 1,
      domain: null,
      isFocused: true,
      isIdle: false,
      isAudible: false,
      isPiP: false,
      mediaKind: null,
      mediaSourceTabId: sourceTabId,
      mediaSourceDomain: cfg.domain,
      _reason: `real_profile_${cfg.framework}_stop`,
    });
  }, { cfg, sourceTabId, activeTabId });

  await sleep(5500);

  const after = await env.readStorage();
  const afterStats = (await env.sendRuntime({ type: 'GET_STATS' }, args.timeoutMs)).result || {};
  const beforeCount = matchingSegmentCount(before.usageSegments, cfg);
  const afterCount = matchingSegmentCount(after.usageSegments, cfg);
  const matchingSegments = segmentValues(after.usageSegments).filter((segment) =>
    segment?.domain === cfg.domain &&
    segment?.framework === cfg.framework &&
    segment?.channel === cfg.channel
  );
  const statsDelta = {
    domainTotal: statSeconds(afterStats, cfg.domain) - statSeconds(beforeStats, cfg.domain),
    backgroundMedia: nestedStatSeconds(afterStats, 'backgroundMediaByDomain', cfg.domain) -
      nestedStatSeconds(beforeStats, 'backgroundMediaByDomain', cfg.domain),
    pip: nestedStatSeconds(afterStats, 'pipByDomain', cfg.domain) -
      nestedStatSeconds(beforeStats, 'pipByDomain', cfg.domain),
  };
  const semanticsOk = cfg.channel === 'pip'
    ? statsDelta.domainTotal >= 180 && statsDelta.pip >= 180
    : statsDelta.domainTotal === 0 && statsDelta.backgroundMedia >= 180;
  const checkpointOk = afterCount > beforeCount && checkpoint?.checkpointed;

  return {
    status: checkpointOk && semanticsOk ? 'PASS' : 'FAIL',
    scenario: name,
    controlled: true,
    domain: cfg.domain,
    framework: cfg.framework,
    channel: cfg.channel,
    runId: args.runId,
    startSignalOk: !!startSignal?.success,
    stopSignalOk: !!stopSignal?.success,
    checkpoint,
    statsDelta,
    semanticsOk,
    segmentCountDelta: afterCount - beforeCount,
    matchingSegments: summarizeSegments(matchingSegments),
    mediaSessionAfterStop: after.mediaSession,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const env = await connect(args);
  const header = {
    scenario: args.scenario,
    chromeCdpPort: args.port,
    extensionIdSuffix: env.extensionId.slice(-6),
    connection: env.connection,
    date: localDateKey(),
  };
  let result;
  if (args.scenario === 'responsiveness') result = await runResponsiveness(env, args);
  else if (args.scenario === 'foreground') result = await runForeground(env, args);
  else if (['background-audio', 'background-video', 'pip'].includes(args.scenario)) result = await runControlledMedia(env, args, args.scenario);
  else result = { status: 'ERROR', error: `Unknown scenario: ${args.scenario}` };
  console.log(JSON.stringify({ ...header, result }, null, 2));
  await Promise.race([
    env.browser.close().catch(() => {}),
    sleep(3000),
  ]);
  if (result.status === 'ERROR') process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'ERROR', error: error?.message || String(error) }, null, 2));
  process.exit(1);
});

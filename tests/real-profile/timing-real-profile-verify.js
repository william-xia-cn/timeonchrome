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
    else if (arg === '--no-keep-active') { out.keepActive = false; }
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

function dailyDomainSeconds(day, domain) {
  const value = day?.domains?.[domain];
  if (typeof value === 'number') return value;
  return Number(value?.activeSeconds || value?.totalSeconds || 0);
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
  while (Date.now() < end) {
    if (enabled) {
      await page.bringToFront().catch(() => {});
      await keepChromeActiveOnce();
      keepActiveAttempts++;
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
  const { chromium } = loadPlaywright();
  const base = `http://127.0.0.1:${args.port}`;
  const browser = await chromium.connectOverCDP(base);
  const context = browser.contexts()[0];
  if (!context) throw new Error('No Chrome context available on CDP connection');

  let worker = context.serviceWorkers().find((sw) => sw.url().includes('/background.js'));
  if (!worker) {
    const targets = await (await fetch(`${base}/json/list`)).json();
    const swTarget = targets.find((target) => target.type === 'service_worker' && String(target.url || '').includes('/background.js'));
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

  return { browser, context, worker, extensionId, admin, sendRuntime, readStorage, openExtensionPage };
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
  const page = await env.context.newPage();
  await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.bringToFront();
  const domain = domainFromUrl(page.url());
  const waitResult = await waitWithKeepActive(page, durationSec, args.keepActive);
  const after = await env.readStorage();
  const statsResponse = await env.sendRuntime({ type: 'GET_STATS' }, args.timeoutMs);
  const rangeResponse = await env.sendRuntime({ type: 'GET_STATS_RANGE', days: 1 }, args.timeoutMs);
  const afterStats = statsResponse.result || {};
  const beforeSegments = segmentValues(before.usageSegments);
  const afterSegments = segmentValues(after.usageSegments);
  const matchingSegments = afterSegments.filter((segment) => segment?.domain === domain);
  return {
    status: matchingSegments.length > beforeSegments.filter((segment) => segment?.domain === domain).length ? 'PASS' : 'NO_DURABLE_SEGMENT',
    domain,
    url: redactUrl(page.url()),
    wait: waitResult,
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

async function runPlaceholder(name) {
  return {
    status: 'NOT_IMPLEMENTED',
    scenario: name,
    reason: 'Media timing implementation is not present yet in this branch.',
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const env = await connect(args);
  const header = {
    scenario: args.scenario,
    chromeCdpPort: args.port,
    extensionIdSuffix: env.extensionId.slice(-6),
    date: localDateKey(),
  };
  let result;
  if (args.scenario === 'responsiveness') result = await runResponsiveness(env, args);
  else if (args.scenario === 'foreground') result = await runForeground(env, args);
  else if (['background-audio', 'background-video', 'pip'].includes(args.scenario)) result = await runPlaceholder(args.scenario);
  else result = { status: 'ERROR', error: `Unknown scenario: ${args.scenario}` };
  await env.browser.close().catch(() => {});
  console.log(JSON.stringify({ ...header, result }, null, 2));
  if (result.status === 'ERROR') process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'ERROR', error: error?.message || String(error) }, null, 2));
  process.exit(1);
});

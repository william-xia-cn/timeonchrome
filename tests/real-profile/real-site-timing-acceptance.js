#!/usr/bin/env node
// Real website timing acceptance driver.
// Uses an existing Chrome CDP port, the loaded extension, and real URL/tab actions.

'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const REPORT_DIR = path.resolve(__dirname, '..', '..', 'test-results', 'real-site-timing-acceptance');
const TODAY_KEYS = [
  'usage_segments_v1',
  'daily_usage_stats_v1',
  'event_log_v1',
  'media_session_v1',
  'foreground_page_diagnostics_v1',
  'foreground_timing_diagnostics_v1',
  'session_v1_persistent',
];

const SITES = {
  A: { label: 'A', url: 'https://www.desmos.com/calculator', domains: ['www.desmos.com', 'desmos.com'] },
  B: { label: 'B', url: 'https://www.khanacademy.org/', domains: ['www.khanacademy.org', 'khanacademy.org'] },
  C: { label: 'C', url: 'https://www.wikipedia.org/', domains: ['www.wikipedia.org', 'wikipedia.org'] },
  D: { label: 'D', url: 'https://example.com/', domains: ['example.com'] },
};

const MEDIA_SITES = {
  audio: { label: 'audio', url: 'https://example.com/', domains: ['example.com'] },
  video: { label: 'video', url: 'https://example.com/', domains: ['example.com'] },
};

function parseArgs(argv) {
  const args = {
    port: 9222,
    suite: 'foreground',
    mode: 'quick',
    timeoutMs: 3000,
    toleranceSec: 2,
    keepOpen: false,
    launch: false,
    browser: 'chromium',
    userDataDir: path.resolve(__dirname, '..', '..', 'test-real-site-profile'),
    extensionDir: path.resolve(__dirname, '..', '..', 'extension'),
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--port') { args.port = Number(next); i++; }
    else if (arg === '--suite') { args.suite = String(next || 'foreground'); i++; }
    else if (arg === '--mode') { args.mode = String(next || 'quick'); i++; }
    else if (arg === '--timeout-ms') { args.timeoutMs = Number(next); i++; }
    else if (arg === '--tolerance-sec') { args.toleranceSec = Number(next); i++; }
    else if (arg === '--keep-open') { args.keepOpen = true; }
    else if (arg === '--launch') { args.launch = true; }
    else if (arg === '--browser') { args.browser = String(next || 'chromium'); i++; }
    else if (arg === '--user-data-dir') { args.userDataDir = path.resolve(String(next || '')); i++; }
    else if (arg === '--extension-dir') { args.extensionDir = path.resolve(String(next || '')); i++; }
  }
  return args;
}

function loadPlaywright() {
  try {
    return require('@playwright/test');
  } catch (firstError) {
    const fallback = path.resolve(__dirname, '..', '..', '..', 'timeonchrome', 'node_modules', '@playwright', 'test');
    try {
      return require(fallback);
    } catch (_) {
      throw firstError;
    }
  }
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

async function holdActive(page, holdMs) {
  const end = Date.now() + Math.max(0, holdMs);
  let attempts = 0;
  while (Date.now() < end) {
    await page.bringToFront().catch(() => {});
    await page.keyboard?.press?.('Shift').catch(() => {});
    await page.mouse?.move?.(24 + (attempts % 16), 24 + (attempts % 11)).catch(() => {});
    if (attempts % 2 === 0) await keepChromeActiveOnce();
    attempts++;
    await sleep(Math.min(1000, Math.max(0, end - Date.now())));
  }
  return { attempts };
}

function domainFromUrl(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch (_) { return null; }
}

function normalizeDomain(value) {
  if (typeof value !== 'string') return null;
  return value.trim().toLowerCase().replace(/\.+$/g, '') || null;
}

function segmentValues(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

function redactUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.pathname === '/' ? '/' : ''}`;
  } catch (_) {
    return null;
  }
}

function iso(ms) {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function sanitizeSegment(segment) {
  return {
    idSuffix: typeof segment?.id === 'string' ? segment.id.slice(-10) : null,
    date: segment?.date || null,
    domain: segment?.domain || null,
    channel: segment?.channel || null,
    framework: segment?.framework || null,
    sourceState: segment?.sourceState || null,
    mode: segment?.mode || null,
    start: iso(Number(segment?.startMs)),
    end: iso(Number(segment?.endMs)),
    durationSeconds: Number(segment?.durationSeconds || 0),
    settlementReason: segment?.settlementReason || null,
    suspect: !!segment?.suspect,
  };
}

function summarizeEvents(events) {
  return (Array.isArray(events) ? events.slice(-16) : []).map((event) => ({
    type: event?.type || null,
    state: event?.state || null,
    domain: event?.domain || null,
    reason: event?.reason || null,
    dropReason: event?.dropReason || null,
    countable: event?.countable,
    ageSeconds: Number.isFinite(event?.time) ? Math.max(0, Math.round((Date.now() - event.time) / 1000)) : null,
  }));
}

function getDailyDomains(day) {
  const domains = day?.domains;
  return domains && typeof domains === 'object' ? domains : {};
}

function dailyActiveSeconds(day, domain) {
  const value = getDailyDomains(day)[domain];
  if (typeof value === 'number') return value;
  return Number(value?.activeSeconds || 0);
}

function flatStatsDomainSeconds(stats, domain) {
  return Number(stats?.[domain] || 0);
}

function sumActiveSegmentsByDomain(segments, dateKey) {
  const out = {};
  for (const segment of segmentValues(segments)) {
    if (!segment || segment.suspect) continue;
    if (segment.date && segment.date !== dateKey) continue;
    if (segment.channel !== 'active') continue;
    const domain = normalizeDomain(segment.domain);
    const seconds = Number(segment.durationSeconds || 0);
    if (!domain || !Number.isFinite(seconds) || seconds <= 0) continue;
    out[domain] = (out[domain] || 0) + seconds;
  }
  return out;
}

function sumSegmentsByDomainChannel(segments, dateKey) {
  const out = {};
  for (const segment of segmentValues(segments)) {
    if (!segment || segment.suspect) continue;
    if (segment.date && segment.date !== dateKey) continue;
    const domain = normalizeDomain(segment.domain);
    const channel = segment.channel || 'unknown';
    const seconds = Number(segment.durationSeconds || 0);
    if (!domain || !Number.isFinite(seconds) || seconds <= 0) continue;
    if (!out[domain]) out[domain] = { active: 0, backgroundMedia: 0, pip: 0 };
    if (out[domain][channel] === undefined) out[domain][channel] = 0;
    out[domain][channel] += seconds;
  }
  return out;
}

function dailySecondsForChannel(day, domain, channel) {
  const value = getDailyDomains(day)[domain];
  if (typeof value === 'number') return channel === 'active' ? value : 0;
  if (!value || typeof value !== 'object') return 0;
  if (channel === 'active') return Number(value.activeSeconds || 0);
  if (channel === 'backgroundMedia') return Number(value.backgroundMediaSeconds || 0);
  if (channel === 'pip') return Number(value.pipSeconds || 0);
  return 0;
}

function domainMatches(segment, expectedDomains) {
  const actual = normalizeDomain(segment?.domain);
  return expectedDomains.map(normalizeDomain).includes(actual);
}

function newSegments(beforeSnapshot, afterSnapshot, sinceMs = 0) {
  const beforeIds = new Set(segmentValues(beforeSnapshot.usageSegments).map((segment) => segment?.id).filter(Boolean));
  return segmentValues(afterSnapshot.usageSegments)
    .filter((segment) => !beforeIds.has(segment?.id))
    .filter((segment) => {
      const startMs = Number(segment?.startMs || 0);
      const endMs = Number(segment?.endMs || 0);
      return startMs >= sinceMs - 2000 || endMs >= sinceMs - 2000;
    })
    .sort((a, b) => Number(a?.startMs || 0) - Number(b?.startMs || 0));
}

function findSegment(segments, { domains, channel = 'active', minDuration = 1 } = {}) {
  return segments.find((segment) =>
    (!domains || domainMatches(segment, domains)) &&
    (!channel || segment.channel === channel) &&
    Number(segment.durationSeconds || 0) >= minDuration
  ) || null;
}

function findMediaSegment(segments, { domains, framework, channel, minDuration = 1 } = {}) {
  return segments.find((segment) =>
    (!domains || domainMatches(segment, domains)) &&
    (!framework || segment.framework === framework) &&
    (!channel || segment.channel === channel) &&
    Number(segment.durationSeconds || 0) >= minDuration
  ) || null;
}

function assertResult(condition, message, evidence = {}) {
  return { ok: !!condition, message, evidence };
}

function pass(name, details = {}) {
  return { name, status: 'PASS', ...details };
}

function fail(name, reason, details = {}) {
  return { name, status: 'FAIL', reason, ...details };
}

function notImplemented(name, reason) {
  return { name, status: 'NOT_IMPLEMENTED', reason };
}

function skipped(name, reason, details = {}) {
  return { name, status: 'SKIPPED', reason, ...details };
}

async function rawJson(base, requestPath) {
  const response = await fetch(`${base}${requestPath}`);
  if (!response.ok) throw new Error(`CDP HTTP ${response.status} for ${requestPath}`);
  return response.json();
}

async function connect(args) {
  if (args.launch) {
    return launchWithExtension(args);
  }

  const base = `http://127.0.0.1:${args.port}`;
  const targets = await rawJson(base, '/json/list');
  const serviceWorkerTarget = targets.find((target) =>
    target.type === 'service_worker' && String(target.url || '').includes('/background.js')
  );
  if (!serviceWorkerTarget) {
    throw new Error(`TimeOnChrome service worker not found on CDP port ${args.port}`);
  }

  const { chromium } = loadPlaywright();
  const browser = await chromium.connectOverCDP(base, { timeout: 10000 });
  const context = browser.contexts()[0];
  if (!context) throw new Error('No Chrome context available on CDP connection');

  let worker = context.serviceWorkers().find((sw) => sw.url().includes('/background.js'));
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null);
  if (!worker) worker = context.serviceWorkers().find((sw) => sw.url().includes('/background.js'));
  if (!worker) throw new Error('TimeOnChrome service worker target unavailable');

  const extensionId = new URL(worker.url()).hostname;
  const admin = await context.newPage();
  await admin.goto(`chrome-extension://${extensionId}/admin/admin.html?view=stats`, {
    waitUntil: 'domcontentloaded',
    timeout: 10000,
  });

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
    return worker.evaluate(async ({ keys, dateKey }) => {
      const local = await chrome.storage.local.get(keys);
      const session = await chrome.storage.session.get(['session_v1']);
      return {
        session: session.session_v1 || null,
        persistentSession: local.session_v1_persistent || null,
        usageSegments: local.usage_segments_v1 || {},
        dailyToday: local.daily_usage_stats_v1?.[dateKey] || null,
        dailyAllDateKeys: Object.keys(local.daily_usage_stats_v1 || {}),
        eventLog: local.event_log_v1 || [],
        mediaSession: local.media_session_v1 || null,
        foregroundDiagnostics: local.foreground_page_diagnostics_v1 || local.foreground_timing_diagnostics_v1 || null,
      };
    }, { keys: TODAY_KEYS, dateKey: localDateKey() });
  }

  async function openPage(url, options = {}) {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: options.waitUntil || 'domcontentloaded', timeout: options.timeout || 45000 });
    await page.bringToFront();
    return page;
  }

  async function openExtensionPage(pathname) {
    const page = await context.newPage();
    const started = Date.now();
    await page.goto(`chrome-extension://${extensionId}/${pathname}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    return { page, elapsedMs: Date.now() - started };
  }

  return { browser, context, worker, extensionId, admin, sendRuntime, readStorage, openPage, openExtensionPage };
}

async function launchWithExtension(args) {
  const { chromium } = loadPlaywright();
  fs.mkdirSync(args.userDataDir, { recursive: true });
  const launchOptions = {
    headless: false,
    args: [
      `--disable-extensions-except=${args.extensionDir}`,
      `--load-extension=${args.extensionDir}`,
      '--no-first-run',
      '--disable-default-apps',
      '--disable-sync',
    ],
  };
  if (args.browser === 'chrome') launchOptions.channel = 'chrome';
  const context = await chromium.launchPersistentContext(args.userDataDir, launchOptions);
  let worker = context.serviceWorkers().find((sw) => sw.url().includes('/background.js'));
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
  if (!worker) worker = context.serviceWorkers().find((sw) => sw.url().includes('/background.js'));
  if (!worker) throw new Error(`TimeOnChrome service worker not found after launch: ${args.extensionDir}`);

  const extensionId = new URL(worker.url()).hostname;
  const admin = await context.newPage();
  await admin.goto(`chrome-extension://${extensionId}/admin/admin.html?view=stats`, {
    waitUntil: 'domcontentloaded',
    timeout: 10000,
  });

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
    return worker.evaluate(async ({ keys, dateKey }) => {
      const local = await chrome.storage.local.get(keys);
      const session = await chrome.storage.session.get(['session_v1']);
      return {
        session: session.session_v1 || null,
        persistentSession: local.session_v1_persistent || null,
        usageSegments: local.usage_segments_v1 || {},
        dailyToday: local.daily_usage_stats_v1?.[dateKey] || null,
        dailyAllDateKeys: Object.keys(local.daily_usage_stats_v1 || {}),
        eventLog: local.event_log_v1 || [],
        mediaSession: local.media_session_v1 || null,
        foregroundDiagnostics: local.foreground_page_diagnostics_v1 || local.foreground_timing_diagnostics_v1 || null,
      };
    }, { keys: TODAY_KEYS, dateKey: localDateKey() });
  }

  async function openPage(url, options = {}) {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: options.waitUntil || 'domcontentloaded', timeout: options.timeout || 45000 });
    await page.bringToFront();
    return page;
  }

  async function openExtensionPage(pathname) {
    const page = await context.newPage();
    const started = Date.now();
    await page.goto(`chrome-extension://${extensionId}/${pathname}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    return { page, elapsedMs: Date.now() - started };
  }

  return {
    browser: context,
    context,
    worker,
    extensionId,
    admin,
    sendRuntime,
    readStorage,
    openPage,
    openExtensionPage,
    launched: true,
  };
}

async function closePage(page) {
  if (!page) return;
  await page.close({ runBeforeUnload: false }).catch(() => {});
}

async function openAndHold(env, site, holdMs) {
  const page = await env.openPage(site.url);
  await holdActive(page, holdMs);
  return page;
}

async function waitForActiveDomain(env, domains, timeoutMs = 8000) {
  const expected = domains.map(normalizeDomain);
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const snapshot = await env.readStorage();
    last = snapshot.session;
    const actual = normalizeDomain(snapshot.session?.domain);
    if (snapshot.session?.state === 'ACTIVE' && expected.includes(actual)) {
      return { ok: true, session: snapshot.session };
    }
    await sleep(250);
  }
  return { ok: false, session: last };
}

async function switchTo(env, site, holdMs) {
  const page = await env.openPage(site.url);
  await holdActive(page, holdMs);
  return page;
}

async function forceCheckpointIfAvailable(env) {
  return env.worker.evaluate(async (now) => {
    if (typeof globalThis.debugRunPeriodicCheckpoint !== 'function') {
      return { ok: false, reason: 'debug_checkpoint_unavailable' };
    }
    return globalThis.debugRunPeriodicCheckpoint(now);
  }, Date.now()).catch((error) => ({ ok: false, error: error?.message || String(error) }));
}

async function runF1(env, args) {
  const name = 'F1 foreground stable start';
  const pageA = await env.openPage(SITES.A.url);
  let activeDomain = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await holdActive(pageA, 1800);
    activeDomain = await waitForActiveDomain(env, SITES.A.domains, 5000);
    if (activeDomain.ok) break;
    await pageA.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  }
  const scenarioStart = Date.now();
  const before = await env.readStorage();
  await holdActive(pageA, args.mode === 'full' ? 8000 : 6500);
  const pageB = await switchTo(env, SITES.B, 2500);
  await closePage(pageA);
  await closePage(pageB);
  const after = await env.readStorage();
  const segments = newSegments(before, after, scenarioStart);
  const segA = findSegment(segments, { domains: SITES.A.domains, channel: 'active', minDuration: 4 });
  if (!segA) {
    return fail(name, 'missing_desmos_active_segment', {
      activeDomain,
      segmentDeltas: segments.map(sanitizeSegment),
      eventTail: summarizeEvents(after.eventLog),
    });
  }
  const duration = Number(segA.durationSeconds || 0);
  const durationOk = duration >= 4 && duration <= (args.mode === 'full' ? 20 : 16);
  return durationOk
    ? pass(name, { segment: sanitizeSegment(segA), expectedRangeSeconds: args.mode === 'full' ? '4..20' : '4..16' })
    : fail(name, 'duration_out_of_tolerance', { segment: sanitizeSegment(segA), expectedRangeSeconds: args.mode === 'full' ? '4..20' : '4..16' });
}

async function runF2(env) {
  const name = 'F2 A -> B <1s -> A jitter';
  const pageB = await openAndHold(env, SITES.B, 1500);
  const pageA1 = await openAndHold(env, SITES.A, 2500);
  const scenarioStart = Date.now();
  const before = await env.readStorage();
  await pageB.bringToFront();
  await holdActive(pageB, 500);
  await pageA1.bringToFront();
  await holdActive(pageA1, 4500);
  const pageNone = await switchTo(env, SITES.D, 2200);
  await closePage(pageA1);
  await closePage(pageB);
  await closePage(pageNone);
  const after = await env.readStorage();
  const segments = newSegments(before, after, scenarioStart);
  const bSegments = segments.filter((segment) => domainMatches(segment, SITES.B.domains) && segment.channel === 'active');
  const aSegments = segments.filter((segment) => domainMatches(segment, SITES.A.domains) && segment.channel === 'active');
  if (bSegments.length > 0) {
    return fail(name, 'short_jitter_created_b_segment', { segmentDeltas: segments.map(sanitizeSegment) });
  }
  if (aSegments.length === 0) {
    return fail(name, 'missing_a_segment_after_jitter', { segmentDeltas: segments.map(sanitizeSegment) });
  }
  return pass(name, { aSegments: aSegments.map(sanitizeSegment), segmentDeltas: segments.map(sanitizeSegment) });
}

async function runF3(env) {
  const name = 'F3 A -> B >=1s boundary';
  const scenarioStart = Date.now();
  const before = await env.readStorage();
  const pageA = await openAndHold(env, SITES.A, 3500);
  const switchAt = Date.now();
  const pageB = await switchTo(env, SITES.B, 2500);
  const pageNone = await switchTo(env, SITES.D, 2200);
  await closePage(pageA);
  await closePage(pageB);
  await closePage(pageNone);
  const after = await env.readStorage();
  const segments = newSegments(before, after, scenarioStart);
  const segA = findSegment(segments, { domains: SITES.A.domains, channel: 'active', minDuration: 1 });
  const segB = findSegment(segments, { domains: SITES.B.domains, channel: 'active', minDuration: 1 });
  if (!segA || !segB) {
    return fail(name, 'missing_a_or_b_segment', { segmentDeltas: segments.map(sanitizeSegment) });
  }
  const aEndDeltaSec = Math.abs(Number(segA.endMs || 0) - switchAt) / 1000;
  const bStartDeltaSec = Math.abs(Number(segB.startMs || 0) - switchAt) / 1000;
  const ok = aEndDeltaSec <= 2.5 && bStartDeltaSec <= 2.5;
  return ok
    ? pass(name, { switchAt: iso(switchAt), segmentA: sanitizeSegment(segA), segmentB: sanitizeSegment(segB) })
    : fail(name, 'boundary_timestamp_out_of_tolerance', {
      switchAt: iso(switchAt),
      aEndDeltaSec,
      bStartDeltaSec,
      segmentA: sanitizeSegment(segA),
      segmentB: sanitizeSegment(segB),
    });
}

async function runF4(env) {
  const name = 'F4 A -> none <1s -> A jitter';
  const scenarioStart = Date.now();
  const before = await env.readStorage();
  const pageA = await openAndHold(env, SITES.A, 2500);
  const ext = await env.openExtensionPage('admin/admin.html?view=stats');
  await holdActive(ext.page, 500);
  await pageA.bringToFront();
  await holdActive(pageA, 4500);
  const pageD = await switchTo(env, SITES.D, 2200);
  await closePage(pageA);
  await closePage(pageD);
  await closePage(ext.page);
  const after = await env.readStorage();
  const segments = newSegments(before, after, scenarioStart);
  const aSegments = segments.filter((segment) => domainMatches(segment, SITES.A.domains) && segment.channel === 'active');
  const nonePollution = segments.filter((segment) => segment.domain === null || segment.domain === '__unknown__');
  if (nonePollution.length > 0) {
    return fail(name, 'none_or_unknown_segment_pollution', { segmentDeltas: segments.map(sanitizeSegment) });
  }
  return aSegments.length > 0
    ? pass(name, { aSegments: aSegments.map(sanitizeSegment) })
    : fail(name, 'missing_a_segment_after_none_jitter', { segmentDeltas: segments.map(sanitizeSegment) });
}

async function runF5(env) {
  const name = 'F5 A -> none >=1s closes foreground';
  const scenarioStart = Date.now();
  const before = await env.readStorage();
  const pageA = await openAndHold(env, SITES.A, 3500);
  const ext = await env.openExtensionPage('admin/admin.html?view=stats');
  await holdActive(ext.page, 2200);
  await closePage(pageA);
  await closePage(ext.page);
  const after = await env.readStorage();
  const segments = newSegments(before, after, scenarioStart);
  const segA = findSegment(segments, { domains: SITES.A.domains, channel: 'active', minDuration: 1 });
  return segA
    ? pass(name, { segment: sanitizeSegment(segA), segmentDeltas: segments.map(sanitizeSegment) })
    : fail(name, 'missing_close_on_none_segment', { segmentDeltas: segments.map(sanitizeSegment), eventTail: summarizeEvents(after.eventLog) });
}

async function runF6(env) {
  const name = 'F6 same-domain navigation';
  const scenarioStart = Date.now();
  const before = await env.readStorage();
  const page = await env.openPage('https://www.desmos.com/calculator');
  await holdActive(page, 2500);
  await page.goto('https://www.desmos.com/fourfunction', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await holdActive(page, 3500);
  const pageD = await switchTo(env, SITES.D, 2200);
  await closePage(page);
  await closePage(pageD);
  const after = await env.readStorage();
  const segments = newSegments(before, after, scenarioStart)
    .filter((segment) => domainMatches(segment, SITES.A.domains) && segment.channel === 'active');
  if (segments.length !== 1) {
    return fail(name, 'same_domain_navigation_split_or_missing', { aSegments: segments.map(sanitizeSegment) });
  }
  return pass(name, { segment: sanitizeSegment(segments[0]) });
}

async function runF7(env) {
  const name = 'F7 reload same tab';
  const scenarioStart = Date.now();
  const before = await env.readStorage();
  const page = await openAndHold(env, SITES.A, 2500);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await sleep(3500);
  const pageD = await switchTo(env, SITES.D, 2200);
  await closePage(page);
  await closePage(pageD);
  const after = await env.readStorage();
  const segments = newSegments(before, after, scenarioStart)
    .filter((segment) => domainMatches(segment, SITES.A.domains) && segment.channel === 'active');
  const total = segments.reduce((sum, segment) => sum + Number(segment.durationSeconds || 0), 0);
  if (total < 4) {
    return fail(name, 'reload_lost_timing', { aSegments: segments.map(sanitizeSegment) });
  }
  return pass(name, { totalSeconds: total, aSegments: segments.map(sanitizeSegment) });
}

async function runF8(env) {
  const name = 'F8 active tab close with successor';
  const scenarioStart = Date.now();
  const before = await env.readStorage();
  const pageB = await openAndHold(env, SITES.B, 1500);
  const pageA = await openAndHold(env, SITES.A, 3500);
  await closePage(pageA);
  await pageB.bringToFront().catch(() => {});
  await holdActive(pageB, 2500);
  const pageD = await switchTo(env, SITES.D, 2200);
  await closePage(pageB);
  await closePage(pageD);
  const after = await env.readStorage();
  const segments = newSegments(before, after, scenarioStart);
  const segA = findSegment(segments, { domains: SITES.A.domains, channel: 'active', minDuration: 1 });
  const segB = findSegment(segments, { domains: SITES.B.domains, channel: 'active', minDuration: 1 });
  if (!segA || !segB) {
    return fail(name, 'missing_closed_or_successor_segment', { segmentDeltas: segments.map(sanitizeSegment) });
  }
  return pass(name, { segmentA: sanitizeSegment(segA), segmentB: sanitizeSegment(segB) });
}

async function runF9(env) {
  const name = 'F9 window blur / extension focus';
  const scenarioStart = Date.now();
  const before = await env.readStorage();
  const pageA = await openAndHold(env, SITES.A, 3500);
  const ext = await env.openExtensionPage('admin/admin.html?view=stats');
  await holdActive(ext.page, 2500);
  await pageA.bringToFront();
  await holdActive(pageA, 2500);
  const pageD = await switchTo(env, SITES.D, 2200);
  await closePage(pageA);
  await closePage(pageD);
  await closePage(ext.page);
  const after = await env.readStorage();
  const segments = newSegments(before, after, scenarioStart)
    .filter((segment) => domainMatches(segment, SITES.A.domains) && segment.channel === 'active');
  return segments.length >= 1
    ? pass(name, { aSegments: segments.map(sanitizeSegment) })
    : fail(name, 'blur_did_not_close_or_restart_observably', { segmentDeltas: newSegments(before, after, scenarioStart).map(sanitizeSegment) });
}

async function runFullCheckpoint(env) {
  const name = 'F-full 180s checkpoint settlement';
  const scenarioStart = Date.now();
  const before = await env.readStorage();
  const pageA = await env.openPage(SITES.A.url);
  await holdActive(pageA, 185000);
  const checkpoint = await forceCheckpointIfAvailable(env);
  await closePage(pageA);
  const after = await env.readStorage();
  const segments = newSegments(before, after, scenarioStart);
  const segA = findSegment(segments, { domains: SITES.A.domains, channel: 'active', minDuration: 175 });
  if (!checkpoint?.checkpointed || !segA) {
    return fail(name, 'checkpoint_segment_missing', { checkpoint, segmentDeltas: segments.map(sanitizeSegment) });
  }
  return pass(name, { checkpoint, segment: sanitizeSegment(segA) });
}

async function runStatsConsistency(env) {
  const name = 'S stats consistency';
  // Let startup recovery and extension-page initialization settle before measuring read-path stability.
  await env.sendRuntime({ type: 'GET_STATS' });
  await sleep(1000);
  const snapshotBeforeRead = await env.readStorage();
  const dateKey = localDateKey();
  const beforeIds = new Set(segmentValues(snapshotBeforeRead.usageSegments).map((segment) => segment?.id).filter(Boolean));
  const getStats = await env.sendRuntime({ type: 'GET_STATS' });
  const getRange = await env.sendRuntime({ type: 'GET_STATS_RANGE', days: 1 });
  const snapshot = await env.readStorage();
  const afterIds = new Set(segmentValues(snapshot.usageSegments).map((segment) => segment?.id).filter(Boolean));
  const readPathMutatedSegments = beforeIds.size !== afterIds.size ||
    [...afterIds].some((id) => !beforeIds.has(id));
  const activeSums = sumActiveSegmentsByDomain(snapshot.usageSegments, dateKey);
  const dailyDomains = getDailyDomains(snapshot.dailyToday);
  const rangeToday = getRange.result?.[dateKey] || {};
  const mismatches = [];

  for (const [domain, seconds] of Object.entries(activeSums)) {
    const daily = dailyActiveSeconds(snapshot.dailyToday, domain);
    const stats = flatStatsDomainSeconds(getStats.result, domain);
    const range = flatStatsDomainSeconds(rangeToday, domain);
    if (daily !== seconds) mismatches.push({ domain, source: 'daily_usage_stats_v1', expected: seconds, actual: daily });
    if (stats !== seconds) mismatches.push({ domain, source: 'GET_STATS', expected: seconds, actual: stats });
    if (range !== seconds) mismatches.push({ domain, source: 'GET_STATS_RANGE', expected: seconds, actual: range });
  }

  for (const domain of Object.keys(dailyDomains)) {
    const daily = dailyActiveSeconds(snapshot.dailyToday, domain);
    const expected = activeSums[domain] || 0;
    if (daily !== expected) mismatches.push({ domain, source: 'extra_daily_domain', expected, actual: daily });
  }

  const messageOk = getStats.ok && getRange.ok;
  const ok = messageOk && mismatches.length === 0 && !readPathMutatedSegments;
  return ok
    ? pass(name, {
      activeDomainCount: Object.keys(activeSums).length,
      getStatsLatencyMs: getStats.elapsedMs,
      getStatsRangeLatencyMs: getRange.elapsedMs,
      readPathMutatedSegments,
    })
    : fail(name, 'stats_mismatch_or_timeout', {
      getStats: { ok: getStats.ok, elapsedMs: getStats.elapsedMs, error: getStats.error || null },
      getStatsRange: { ok: getRange.ok, elapsedMs: getRange.elapsedMs, error: getRange.error || null },
      readPathMutatedSegments,
      mismatches: mismatches.slice(0, 20),
    });
}

async function runSettlementPageConsistency(env) {
  const name = 'S today settlement page consistency';
  const snapshot = await env.readStorage();
  const dateKey = localDateKey();
  const expectedRows = segmentValues(snapshot.usageSegments)
    .filter((segment) => segment.date === dateKey)
    .filter((segment) => Number(segment.durationSeconds || 0) > 0);
  const runtimeRows = await env.sendRuntime({ type: 'GET_TODAY_SETTLEMENT_ANALYSIS' });
  const pageInfo = await env.openExtensionPage('admin/admin.html?view=stats');
  const page = pageInfo.page;
  await page.locator('#main-screen').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  await page.waitForFunction(() => {
    const el = document.querySelector('#today-overview-list');
    return el && !String(el.textContent || '').includes('加载中');
  }, null, { timeout: 10000 }).catch(() => {});
  await page.locator('.nav-item[data-page="settlements"]').click({ timeout: 10000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('#settlement-summary');
    return el && !String(el.textContent || '').includes('加载中');
  }, null, { timeout: 10000 }).catch(() => {});
  const summaryText = await page.locator('#settlement-summary').textContent({ timeout: 10000 }).catch(() => '');
  const tableText = await page.locator('#settlement-table-wrap').textContent({ timeout: 10000 }).catch(() => '');
  await closePage(page);
  const rows = Array.isArray(runtimeRows.result?.segments) ? runtimeRows.result.segments : [];
  const countOk = rows.length === expectedRows.length;
  const pageLooksLoaded = summaryText.includes('当前显示') && (expectedRows.length === 0 || tableText.includes('落账原因'));
  if (!runtimeRows.ok || !countOk || !pageLooksLoaded) {
    return fail(name, 'settlement_page_or_message_mismatch', {
      expectedRowCount: expectedRows.length,
      runtimeOk: runtimeRows.ok,
      runtimeRowCount: rows.length,
      pageLooksLoaded,
      summaryText,
    });
  }
  return pass(name, { expectedRowCount: expectedRows.length, runtimeRowCount: rows.length, pageLoadMs: pageInfo.elapsedMs });
}

async function runPopupAdminResponsiveness(env) {
  const name = 'S popup/admin responsiveness';
  const popup = await env.openExtensionPage('popup/popup.html');
  const admin = await env.openExtensionPage('admin/admin.html?view=stats');
  const flush = await env.sendRuntime({ type: 'FLUSH_TIME' });
  await closePage(popup.page);
  await closePage(admin.page);
  const ok = popup.elapsedMs < 3000 && admin.elapsedMs < 3000 && flush.ok && flush.elapsedMs < 3000;
  return ok
    ? pass(name, { popupMs: popup.elapsedMs, adminMs: admin.elapsedMs, flushMs: flush.elapsedMs })
    : fail(name, 'popup_admin_or_flush_timeout', {
      popupMs: popup.elapsedMs,
      adminMs: admin.elapsedMs,
      flush: { ok: flush.ok, elapsedMs: flush.elapsedMs, error: flush.error || null },
    });
}

async function runForegroundSuite(env, args) {
  const scenarios = [
    () => runF1(env, args),
    () => runF2(env, args),
    () => runF3(env, args),
    () => runF4(env, args),
    () => runF5(env, args),
    () => runF6(env, args),
    () => runF7(env, args),
    () => runF8(env, args),
    () => runF9(env, args),
  ];
  if (args.mode === 'full') scenarios.push(() => runFullCheckpoint(env));
  const results = [];
  for (const scenario of scenarios) {
    results.push(await scenario());
  }
  return results;
}

async function runStatsSuite(env) {
  return [
    await runStatsConsistency(env),
    await runSettlementPageConsistency(env),
    await runPopupAdminResponsiveness(env),
  ];
}

async function ensureRestMode(env) {
  const switched = await env.sendRuntime({ type: 'SWITCH_TO_REST' }, 5000);
  if (switched.ok) return { ok: true, method: 'runtime_message', elapsedMs: switched.elapsedMs };
  const fallback = await env.worker.evaluate(async () => {
    const stored = await chrome.storage.local.get(['guardian_config', 'guardian_session']);
    const config = stored.guardian_config || {};
    const session = stored.guardian_session || {};
    await chrome.storage.local.set({
      guardian_config: { ...config, mode: 'rest', enabled: true },
      guardian_session: { ...session, currentMode: 'rest' },
    });
    return { ok: true };
  }).catch((error) => ({ ok: false, error: error?.message || String(error) }));
  return { ok: !!fallback.ok, method: 'storage_fallback', runtimeError: switched.error || null, fallback };
}

async function findFrameWithMedia(page, selector, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let last = [];
  while (Date.now() < deadline) {
    last = [];
    for (const frame of page.frames()) {
      const count = await frame.evaluate((sel) => document.querySelectorAll(sel).length, selector).catch(() => 0);
      last.push({ url: redactUrl(frame.url()), count });
      if (count > 0) return { ok: true, frame, frameUrl: redactUrl(frame.url()) };
    }
    await sleep(500);
  }
  return { ok: false, frames: last };
}

async function startFirstMedia(page, kind) {
  const selector = kind === 'audio' ? 'audio' : 'video';
  if (kind === 'audio') {
    await page.evaluate(() => {
      document.querySelectorAll('[data-toc-acceptance-audio="true"]').forEach((el) => el.remove());
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'auto';
      audio.src = 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3';
      audio.setAttribute('data-toc-acceptance-audio', 'true');
      document.body.prepend(audio);
    }).catch(() => {});
    await sleep(1000);
  } else if (kind === 'video') {
    await page.evaluate(() => {
      document.querySelectorAll('[data-toc-acceptance-video="true"]').forEach((el) => el.remove());
      const video = document.createElement('video');
      video.controls = true;
      video.preload = 'auto';
      video.loop = true;
      video.muted = true;
      video.width = 320;
      video.src = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
      video.setAttribute('data-toc-acceptance-video', 'true');
      document.body.prepend(video);
    }).catch(() => {});
    await sleep(1000);
  }
  let located = await findFrameWithMedia(page, selector);
  if (!located.ok && kind === 'audio') {
    await page.evaluate(() => {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'auto';
      audio.src = 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3';
      audio.setAttribute('data-toc-acceptance-audio', 'true');
      document.body.prepend(audio);
    }).catch(() => {});
    await sleep(750);
    located = await findFrameWithMedia(page, selector, 5000);
  }
  if (!located.ok) {
    return { ok: false, reason: 'missing_media_element', frames: located.frames };
  }
  const frame = located.frame;
  await frame.locator(selector).first().scrollIntoViewIfNeeded().catch(() => {});
  const result = await frame.evaluate(async ({ selector, kind }) => {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, reason: 'missing_media_element' };
    el.scrollIntoView?.({ block: 'center', inline: 'center' });
    el.loop = true;
    if (kind === 'video') {
      el.muted = true;
      el.volume = 0;
    } else {
      el.muted = false;
      el.volume = 0.25;
    }
    const attempts = [];
    for (const muted of [el.muted, true]) {
      el.muted = muted;
      try {
        await el.play();
        el.dispatchEvent(new Event('play', { bubbles: true }));
        el.dispatchEvent(new Event('playing', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 250));
        return {
          ok: !el.paused,
          tagName: el.tagName,
          paused: el.paused,
          muted: el.muted,
          readyState: el.readyState,
          currentTime: Number(el.currentTime || 0),
          pipSupported: !!(document.pictureInPictureEnabled && el.requestPictureInPicture),
        };
      } catch (error) {
        attempts.push(error?.name || error?.message || String(error));
      }
    }
    return {
      ok: false,
      reason: 'play_failed',
      attempts,
      tagName: el.tagName,
      paused: el.paused,
      muted: el.muted,
      readyState: el.readyState,
    };
  }, { selector, kind });
  return { ...result, frameUrl: located.frameUrl };
}

async function stopAllMedia(page) {
  if (!page) return { ok: false, reason: 'no_page' };
  const results = [];
  for (const frame of page.frames()) {
    const result = await frame.evaluate(async () => {
      if (document.pictureInPictureElement && document.exitPictureInPicture) {
        try { await document.exitPictureInPicture(); } catch (_) {}
      }
      const elements = Array.from(document.querySelectorAll('video, audio'));
      for (const el of elements) {
        try { el.pause(); } catch (_) {}
      }
      return { ok: true, stopped: elements.length };
    }).catch((error) => ({ ok: false, error: error?.message || String(error) }));
    results.push({ frameUrl: redactUrl(frame.url()), ...result });
  }
  return { ok: results.some((r) => r.stopped > 0), results };
}

async function enterPictureInPicture(page) {
  const located = await findFrameWithMedia(page, 'video', 5000);
  if (!located.ok) return { ok: false, reason: 'missing_video', frames: located.frames };
  const result = await located.frame.evaluate(async () => {
    const video = document.querySelector('video');
    if (!video) return { ok: false, reason: 'missing_video' };
    if (!document.pictureInPictureEnabled || !video.requestPictureInPicture) {
      return { ok: false, reason: 'pip_api_unavailable' };
    }
    try {
      if (video.paused) await video.play();
      await video.requestPictureInPicture();
      return {
        ok: !!document.pictureInPictureElement,
        reason: document.pictureInPictureElement ? 'entered' : 'not_entered',
      };
    } catch (error) {
      return { ok: false, reason: 'pip_request_failed', error: error?.name || error?.message || String(error) };
    }
  }).catch((error) => ({ ok: false, reason: 'pip_eval_failed', error: error?.message || String(error) }));
  return { ...result, frameUrl: located.frameUrl };
}

async function waitForMediaSession(env, framework, domains, timeoutMs = 15000) {
  const expected = domains.map(normalizeDomain);
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const snapshot = await env.readStorage();
    last = snapshot.mediaSession;
    const actualDomain = normalizeDomain(last?.domain);
    if (last?.framework === framework && expected.includes(actualDomain)) {
      return { ok: true, session: last };
    }
    await sleep(500);
  }
  return { ok: false, session: last };
}

async function runMediaCheckpoint(env, mode, holderPage) {
  if (mode === 'full') {
    await holdActive(holderPage, 185000);
    return env.worker.evaluate(async (now) => {
      if (typeof globalThis.debugRunMediaPeriodicCheckpoint !== 'function') {
        return { ok: false, reason: 'debug_media_checkpoint_unavailable' };
      }
      return globalThis.debugRunMediaPeriodicCheckpoint(now);
    }, Date.now()).catch((error) => ({ ok: false, error: error?.message || String(error) }));
  }

  // Quick mode still uses real page media evidence, then compresses only the
  // checkpoint wait inside the disposable acceptance profile.
  return env.worker.evaluate(async (now) => {
    const data = await chrome.storage.local.get('media_session_v1');
    const session = data.media_session_v1;
    if (!session?.framework || session.framework === 'none' || !session.domain) {
      return { ok: false, reason: 'no_open_media_session' };
    }
    await chrome.storage.local.set({
      media_session_v1: {
        ...session,
        startTime: now - 180000,
        lastHeartbeat: now,
      },
    });
    if (typeof globalThis.debugRunMediaPeriodicCheckpoint !== 'function') {
      return { ok: false, reason: 'debug_media_checkpoint_unavailable' };
    }
    const result = await globalThis.debugRunMediaPeriodicCheckpoint(now);
    return { ...result, accelerated: true };
  }, Date.now()).catch((error) => ({ ok: false, error: error?.message || String(error) }));
}

async function finishMediaScenario(sourcePage, holderPage) {
  await stopAllMedia(sourcePage);
  await holdActive(holderPage || sourcePage, 6500).catch(() => sleep(6500));
  await closePage(sourcePage);
  await closePage(holderPage);
}

function dailyChannelMatchesSegments(snapshot, domain, channel) {
  const dateKey = localDateKey();
  const sums = sumSegmentsByDomainChannel(snapshot.usageSegments, dateKey);
  const expected = Number(sums[domain]?.[channel] || 0);
  const actual = dailySecondsForChannel(snapshot.dailyToday, domain, channel);
  return { ok: expected === actual, expected, actual };
}

async function runM1ForegroundVideo(env, args) {
  const name = 'M1 foreground video';
  const restMode = await ensureRestMode(env);
  if (!restMode.ok) return fail(name, 'could_not_enter_rest_mode_for_media_site', { restMode });
  const scenarioStart = Date.now();
  const before = await env.readStorage();
  const page = await env.openPage(MEDIA_SITES.video.url);
  const start = await startFirstMedia(page, 'video');
  if (!start.ok) {
    await closePage(page);
    return fail(name, 'video_play_failed', { start });
  }
  await holdActive(page, args.mode === 'full' ? 8000 : 6500);
  const pageC = await switchTo(env, SITES.C, 2500);
  await finishMediaScenario(page, pageC);
  const after = await env.readStorage();
  const segments = newSegments(before, after, scenarioStart);
  const active = findSegment(segments, { domains: MEDIA_SITES.video.domains, channel: 'active', minDuration: 4 });
  const unexpectedMedia = segments.filter((segment) =>
    domainMatches(segment, MEDIA_SITES.video.domains) &&
    (segment.channel === 'backgroundMedia' || segment.channel === 'pip')
  );
  if (!active || unexpectedMedia.length > 0) {
    return fail(name, 'foreground_video_classification_mismatch', {
      start,
      active: active ? sanitizeSegment(active) : null,
      unexpectedMedia: unexpectedMedia.map(sanitizeSegment),
      segmentDeltas: segments.map(sanitizeSegment),
    });
  }
  return pass(name, { restMode, start, segment: sanitizeSegment(active) });
}

async function runBackgroundMediaScenario(env, args, { kind, framework }) {
  const name = framework === 'background_audio' ? 'M2 background audio' : 'M3 background video';
  const restMode = await ensureRestMode(env);
  if (!restMode.ok) return fail(name, 'could_not_enter_rest_mode_for_media_site', { restMode });
  const site = kind === 'audio' ? MEDIA_SITES.audio : MEDIA_SITES.video;
  const scenarioStart = Date.now();
  const before = await env.readStorage();
  const sourcePage = await env.openPage(site.url);
  const start = await startFirstMedia(sourcePage, kind);
  if (!start.ok) {
    await closePage(sourcePage);
    return fail(name, `${kind}_play_failed`, { start });
  }
  const holderPage = await switchTo(env, SITES.C, 6500);
  const mediaSession = await waitForMediaSession(env, framework, site.domains, 18000);
  if (!mediaSession.ok) {
    await finishMediaScenario(sourcePage, holderPage);
    const snapshot = await env.readStorage();
    return fail(name, 'media_session_not_opened', {
      start,
      expectedFramework: framework,
      lastMediaSession: mediaSession.session,
      eventTail: summarizeEvents(snapshot.eventLog),
    });
  }
  const checkpoint = await runMediaCheckpoint(env, args.mode, holderPage);
  const after = await env.readStorage();
  await finishMediaScenario(sourcePage, holderPage);
  const segments = newSegments(before, after, scenarioStart);
  const mediaSegment = findMediaSegment(segments, {
    domains: site.domains,
    framework,
    channel: 'backgroundMedia',
    minDuration: args.mode === 'full' ? 175 : 175,
  });
  const domain = normalizeDomain(mediaSegment?.domain);
  const consistency = domain ? dailyChannelMatchesSegments(after, domain, 'backgroundMedia') : { ok: false };
  const checkpointAccepted = checkpoint?.checkpointed || (!!mediaSegment && consistency.ok);
  if (!checkpointAccepted || !mediaSegment || !consistency.ok) {
    return fail(name, 'background_media_checkpoint_or_aggregate_mismatch', {
      start,
      restMode,
      mediaSession,
      checkpoint,
      mediaSegment: mediaSegment ? sanitizeSegment(mediaSegment) : null,
      consistency,
      segmentDeltas: segments.map(sanitizeSegment),
    });
  }
  return pass(name, {
    start,
    restMode,
    mediaSession,
    checkpoint,
    segment: sanitizeSegment(mediaSegment),
    consistency,
    quickCheckpointAccelerated: !!checkpoint.accelerated,
  });
}

async function runM4PiP(env, args) {
  const name = 'M4 pip';
  const restMode = await ensureRestMode(env);
  if (!restMode.ok) return fail(name, 'could_not_enter_rest_mode_for_media_site', { restMode });
  const scenarioStart = Date.now();
  const before = await env.readStorage();
  const sourcePage = await env.openPage(MEDIA_SITES.video.url);
  const start = await startFirstMedia(sourcePage, 'video');
  if (!start.ok) {
    await closePage(sourcePage);
    return fail(name, 'video_play_failed', { start });
  }
  const pip = await enterPictureInPicture(sourcePage);
  if (!pip.ok) {
    await finishMediaScenario(sourcePage, null);
    return skipped(name, 'SKIPPED_PIP_AUTOMATION_UNSUPPORTED', { restMode, start, pip });
  }
  const holderPage = await switchTo(env, SITES.C, 6500);
  const mediaSession = await waitForMediaSession(env, 'pip_video', MEDIA_SITES.video.domains, 18000);
  if (!mediaSession.ok) {
    await finishMediaScenario(sourcePage, holderPage);
    const snapshot = await env.readStorage();
    return skipped(name, 'SKIPPED_PIP_STATE_NOT_OBSERVABLE_IN_REAL_PAGE_FIXTURE', {
      start,
      restMode,
      pip,
      lastMediaSession: mediaSession.session,
      eventTail: summarizeEvents(snapshot.eventLog),
    });
  }
  const checkpoint = await runMediaCheckpoint(env, args.mode, holderPage);
  const after = await env.readStorage();
  await finishMediaScenario(sourcePage, holderPage);
  if (args.mode === 'full' && checkpoint?.reason === 'interval_not_reached') {
    return skipped(name, 'SKIPPED_PIP_FULL_WINDOW_UNSTABLE', {
      start,
      restMode,
      pip,
      mediaSession,
      checkpoint,
    });
  }
  const segments = newSegments(before, after, scenarioStart);
  const pipSegment = findMediaSegment(segments, {
    domains: MEDIA_SITES.video.domains,
    framework: 'pip_video',
    channel: 'pip',
    minDuration: 175,
  });
  const domain = normalizeDomain(pipSegment?.domain);
  const consistency = domain ? dailyChannelMatchesSegments(after, domain, 'pip') : { ok: false };
  if (!checkpoint?.checkpointed || !pipSegment || !consistency.ok) {
    return fail(name, 'pip_checkpoint_or_aggregate_mismatch', {
      start,
      pip,
      mediaSession,
      checkpoint,
      pipSegment: pipSegment ? sanitizeSegment(pipSegment) : null,
      consistency,
      segmentDeltas: segments.map(sanitizeSegment),
    });
  }
  return pass(name, {
    start,
    restMode,
    pip,
    mediaSession,
    checkpoint,
    segment: sanitizeSegment(pipSegment),
    consistency,
    quickCheckpointAccelerated: !!checkpoint.accelerated,
  });
}

async function runMediaSuite(env, args) {
  return [
    await runM1ForegroundVideo(env, args),
    await runBackgroundMediaScenario(env, args, { kind: 'audio', framework: 'background_audio' }),
    await runBackgroundMediaScenario(env, args, { kind: 'video', framework: 'background_video' }),
    await runM4PiP(env, args),
  ];
}

async function runRecoveryLocalMode(env) {
  const name = 'R3 unbound local mode';
  const cloud = await env.sendRuntime({ type: 'GET_CLOUD_STATUS' });
  const popup = await env.openExtensionPage('popup/popup.html');
  const admin = await env.openExtensionPage('admin/admin.html?view=stats');
  const stats = await env.sendRuntime({ type: 'GET_STATS' });
  await closePage(popup.page);
  await closePage(admin.page);
  const localMode = cloud.result?.localMode === true || cloud.result?.isBound === false;
  const ok = cloud.ok && localMode && popup.elapsedMs < 3000 && admin.elapsedMs < 3000 && stats.ok && stats.elapsedMs < 3000;
  return ok
    ? pass(name, {
      cloudStatus: {
        isBound: cloud.result?.isBound,
        localMode: cloud.result?.localMode,
        syncEnabled: cloud.result?.syncEnabled,
        reason: cloud.result?.reason || null,
      },
      popupMs: popup.elapsedMs,
      adminMs: admin.elapsedMs,
      getStatsMs: stats.elapsedMs,
    })
    : fail(name, 'local_mode_or_message_responsiveness_failed', {
      cloud: { ok: cloud.ok, elapsedMs: cloud.elapsedMs, result: cloud.result, error: cloud.error || null },
      popupMs: popup.elapsedMs,
      adminMs: admin.elapsedMs,
      stats: { ok: stats.ok, elapsedMs: stats.elapsedMs, error: stats.error || null },
    });
}

async function runRecoverySuspectDryRun(env) {
  const name = 'R4 suspect data dry-run';
  const before = await env.readStorage();
  const result = await env.sendRuntime({ type: 'MARK_SUSPECT_SEGMENTS', dryRun: true }, 5000);
  const after = await env.readStorage();
  if (!result.ok && /Unknown message type|unsupported/i.test(String(result.error || result.result?.error || ''))) {
    return skipped(name, 'suspect_cleanup_message_unavailable');
  }
  const beforeJson = JSON.stringify(before.usageSegments);
  const afterJson = JSON.stringify(after.usageSegments);
  const notMutated = beforeJson === afterJson;
  if (!result.ok || !notMutated) {
    return fail(name, 'suspect_dry_run_failed_or_mutated_storage', {
      message: { ok: result.ok, elapsedMs: result.elapsedMs, result: result.result, error: result.error || null },
      notMutated,
    });
  }
  return pass(name, {
    elapsedMs: result.elapsedMs,
    summary: {
      scannedCount: result.result?.scannedCount,
      markedCount: result.result?.markedCount,
      dryRun: result.result?.dryRun,
      affectedDates: result.result?.affectedDates,
    },
  });
}

async function runRecoverySuite(env) {
  return [
    skipped('R1 service worker restart', 'manual_supported_not_forced_in_acceptance_profile'),
    skipped('R2 Chrome restart', 'manual_supported_not_forced_in_acceptance_profile'),
    await runRecoveryLocalMode(env),
    await runRecoverySuspectDryRun(env),
  ];
}

function reportStatus(results) {
  const failed = results.filter((r) => r.status === 'FAIL');
  if (failed.length > 0) return 'FAIL';
  const implemented = results.filter((r) => r.status !== 'NOT_IMPLEMENTED');
  if (implemented.length === 0) return 'NOT_IMPLEMENTED';
  return 'PASS';
}

function markdownReport(report) {
  const lines = [];
  lines.push(`# Real Site Timing Acceptance`);
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Suite: ${report.suite}`);
  lines.push(`- Mode: ${report.mode}`);
  lines.push(`- Status: ${report.status}`);
  lines.push(`- Extension suffix: ${report.environment.extensionIdSuffix}`);
  lines.push(`- Launch mode: ${report.environment.launched ? 'yes' : 'no'}`);
  lines.push(`- Browser: ${report.environment.browser}`);
  lines.push(`- CDP port: ${report.environment.port ?? 'n/a'}`);
  lines.push('');
  lines.push(`## Results`);
  for (const result of report.results) {
    lines.push(`- ${result.status}: ${result.name}${result.reason ? ` — ${result.reason}` : ''}`);
  }
  lines.push('');
  lines.push(`## Notes`);
  lines.push('- Evidence is sanitized: no cloud token, profile id, device id, cookies, localStorage dump, email, or full profile path.');
  lines.push('- `event_log_v1` is included only as explanatory tail evidence when a scenario fails.');
  return lines.join('\n');
}

async function writeReports(report) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const jsonPath = path.join(REPORT_DIR, 'latest.json');
  const mdPath = path.join(REPORT_DIR, 'latest.md');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, markdownReport(report));
  return { jsonPath, mdPath };
}

async function main() {
  const args = parseArgs(process.argv);
  const env = await connect(args);
  const results = [];
  const suites = args.suite === 'all'
    ? ['foreground', 'stats', 'media', 'recovery']
    : [args.suite];

  for (const suite of suites) {
    if (suite === 'foreground') results.push(...await runForegroundSuite(env, args));
    else if (suite === 'stats') results.push(...await runStatsSuite(env, args));
    else if (suite === 'media') results.push(...await runMediaSuite(env, args));
    else if (suite === 'recovery') results.push(...await runRecoverySuite(env, args));
    else results.push(fail(`suite ${suite}`, 'unknown_suite'));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    suite: args.suite,
    mode: args.mode,
    status: reportStatus(results),
    environment: {
      port: args.launch ? null : args.port,
      launched: !!args.launch,
      browser: args.launch ? args.browser : 'cdp',
      extensionIdSuffix: env.extensionId.slice(-6),
      date: localDateKey(),
    },
    results,
  };
  const paths = await writeReports(report);
  console.log(JSON.stringify({ ...report, reportPaths: paths }, null, 2));

  if (!args.keepOpen) {
    await env.browser.close().catch(() => {});
  }
  if (report.status === 'FAIL') process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'ERROR', error: error?.message || String(error) }, null, 2));
  process.exit(1);
});

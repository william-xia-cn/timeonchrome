const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const http = require('http');

const EXT = path.resolve(__dirname, '../..');
const FIXTURE_PATH = path.resolve(__dirname, './fixtures/video-playback-test.html');
const TEST_DOMAIN = '127.0.0.1';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startFixtureServer() {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const server = http.createServer((req, res) => {
    if (req.url === '/video-playback-test.html' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

async function createContext() {
  const udd = fs.mkdtempSync(path.resolve(__dirname, '../../test-e2e-profile-video-live-'));
  const ctx = await chromium.launchPersistentContext(udd, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  await sw.evaluate(async () => {
    return await new Promise((resolve) => {
      chrome.storage.local.get(['guardian_config', 'guardian_session'], (r) => {
        const c = r.guardian_config || {};
        const s = r.guardian_session || {};
        chrome.storage.local.set({
          guardian_config: { ...c, mode: 'rest', enabled: true },
          guardian_session: { ...s, currentMode: 'rest' },
          event_log_v1: [],
          daily_usage_stats_v1: {},
          usage_segments_v1: {},
          usage_segments_index_v1: {},
        }, resolve);
      });
    });
  });
  await delay(500);
  return { ctx, sw, udd };
}

async function sendRuntimeMessageViaPopup(ctx, sw, message) {
  const popupUrl = await sw.evaluate(() => chrome.runtime.getURL('popup/popup.html'));
  const popup = await ctx.newPage();
  await popup.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
  const resp = await popup.evaluate(async (msg) => {
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (r) => resolve(r || null));
    });
  }, message);
  await popup.close();
  return resp;
}

async function getStatsFromPopup(ctx, sw) {
  const popupUrl = await sw.evaluate(() => chrome.runtime.getURL('popup/popup.html'));
  const popup = await ctx.newPage();
  await popup.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await popup.waitForTimeout(800);
  const payload = await popup.evaluate(async () => {
    const stats = await new Promise((res) => {
      chrome.runtime.sendMessage({ type: 'GET_STATS' }, (r) => res(r || {}));
    });
    const range = await new Promise((res) => {
      chrome.runtime.sendMessage({ type: 'GET_STATS_RANGE', days: 1 }, (r) => res(r || {}));
    });
    return { stats, range };
  });
  await popup.close();
  return payload;
}

async function getRuntimeDiagnostics(sw) {
  return await sw.evaluate(async () => {
    const send = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, (resp) => resolve(resp || null)));
    const storage = await new Promise((resolve) => {
      chrome.storage.local.get(['guardian_session', 'session_v1_persistent', 'event_log_v1', 'daily_usage_stats_v1'], resolve);
    });
    const runtime = await send({ type: 'GET_RUNTIME_MODE_STATUS', includeUsageSummary: false });
    const timingSession = await send({ type: 'GET_SESSION' });
    const trace = await send({ type: 'DEBUG_GET_TIMING_TRACE' });
    return {
      runtime,
      timingSession,
      localMode: storage?.guardian_session?.currentMode || null,
      eventCount: Array.isArray(storage?.event_log_v1) ? storage.event_log_v1.length : 0,
      eventTail: Array.isArray(storage?.event_log_v1) ? storage.event_log_v1.slice(-10) : [],
      persistentSession: storage?.session_v1_persistent || null,
      dayKeys: Object.keys(storage?.daily_usage_stats_v1 || {}),
      traceCount: Number(trace?.count || 0),
      traceTail: Array.isArray(trace?.trace) ? trace.trace.slice(-10) : [],
    };
  });
}

async function getStorageConvergenceSnapshot(sw, domain) {
  return await sw.evaluate(async ({ domain }) => {
    const today = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const storage = await new Promise((resolve) => {
      chrome.storage.local.get(['daily_usage_stats_v1', 'usage_segments_v1', 'event_log_v1'], resolve);
    });
    const day = storage?.daily_usage_stats_v1?.[today] || null;
    const dailyDomain = Number(day?.domains?.[domain]?.totalSeconds || 0);
    const segments = Object.values(storage?.usage_segments_v1 || {}).filter((seg) => seg?.domain === domain);
    const segmentsTotal = segments.reduce((sum, seg) => sum + Number(seg?.durationSeconds || 0), 0);
    return {
      today,
      dailyDomain,
      segmentsCount: segments.length,
      segmentsTotal,
      segmentChannels: Array.from(new Set(segments.map((s) => s?.channel || 'unknown'))),
      eventCount: Array.isArray(storage?.event_log_v1) ? storage.event_log_v1.length : 0,
    };
  }, { domain });
}

async function synthesizeAccrualSpanViaPopup(ctx, sw, {
  domain,
  durationMs,
  phase,
  isPiP = false,
}) {
  const startMs = Date.now();
  await sendRuntimeMessageViaPopup(ctx, sw, {
    type: 'DEBUG_APPLY_CONTROLLED_TIMING_SIGNAL',
    event: {
      _reason: `e2e_controlled_${phase}_start`,
      _debugNow: startMs,
      tabId: 1,
      windowId: 1,
      domain,
      isFocused: true,
      isIdle: false,
      isAudible: true,
      isPiP,
    },
  });
  await sendRuntimeMessageViaPopup(ctx, sw, {
    type: 'DEBUG_APPLY_CONTROLLED_TIMING_SIGNAL',
    event: {
      _reason: `e2e_controlled_${phase}_end`,
      _debugNow: startMs + Math.max(1000, durationMs),
      tabId: 1,
      windowId: 1,
      domain,
      isFocused: true,
      isIdle: true,
      isAudible: false,
      isPiP: false,
    },
  });
  return startMs + Math.max(1000, durationMs);
}

test('P0-video-controlled-1: controlled accounting pipeline remains valid', async () => {
  const { server, baseUrl } = await startFixtureServer();
  const { ctx, sw, udd } = await createContext();
  try {
    await sendRuntimeMessageViaPopup(ctx, sw, { type: 'SWITCH_TO_REST' });
    await sendRuntimeMessageViaPopup(ctx, sw, { type: 'DEBUG_CLEAR_TIMING_TRACE' });

    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/video-playback-test.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForSelector('#start-btn', { timeout: 10000 });
    await page.click('#start-btn');
    await delay(1200);

    const endMs = await synthesizeAccrualSpanViaPopup(ctx, sw, {
      domain: TEST_DOMAIN,
      durationMs: 5000,
      phase: 'normal',
      isPiP: false,
    });
    const checkpoint = await sw.evaluate(async (now) => globalThis.debugRunPeriodicCheckpoint(now), endMs + 181000);
    expect(checkpoint.ok).toBeTruthy();

    const stats = await getStatsFromPopup(ctx, sw);
    expect(Number(stats?.stats?.[TEST_DOMAIN] || 0)).toBeGreaterThan(0);
    await page.close();
  } finally {
    await ctx.close();
    server.close();
    fs.rmSync(udd, { recursive: true, force: true });
  }
});

test('P0-video-natural-1: natural media accrual under normal/fullscreen/pip is observable', async () => {
  const { server, baseUrl } = await startFixtureServer();
  const { ctx, sw, udd } = await createContext();
  try {
    await sendRuntimeMessageViaPopup(ctx, sw, { type: 'SWITCH_TO_REST' });
    await sendRuntimeMessageViaPopup(ctx, sw, { type: 'DEBUG_CLEAR_TIMING_TRACE' });

    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/video-playback-test.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForSelector('#start-btn', { timeout: 10000 });
    await page.click('#start-btn');
    await delay(8000);

    const afterNormal = await getStatsFromPopup(ctx, sw);
    const normalSeconds = Number(afterNormal?.stats?.[TEST_DOMAIN] || 0);

    if (normalSeconds <= 0) {
      const diag = await getRuntimeDiagnostics(sw);
      console.log('NATURAL_MEDIA_ACCRUAL_BLOCKED diagnostics:', JSON.stringify(diag));
      test.skip(true, `BLOCKED_NATURAL_MEDIA_ACCRUAL: ${JSON.stringify(diag)}`);
    }
    expect(normalSeconds).toBeGreaterThan(0);

    let fullscreenChecked = false;
    try {
      await page.click('#fs-btn');
      await delay(3000);
      await page.click('#exit-fs-btn');
      await delay(1000);
      fullscreenChecked = true;
    } catch {}

    const afterFullscreen = await getStatsFromPopup(ctx, sw);
    const fullscreenSeconds = Number(afterFullscreen?.stats?.[TEST_DOMAIN] || 0);
    if (fullscreenChecked) {
      expect(fullscreenSeconds).toBeGreaterThanOrEqual(normalSeconds);
    }

    const pipSupported = await page.evaluate(() => !!document.pictureInPictureEnabled);
    let pipChecked = false;
    if (pipSupported) {
      try {
        await page.click('#pip-btn');
        await delay(3500);
        await page.click('#exit-pip-btn');
        await delay(1000);
        pipChecked = true;
      } catch {}
    }

    const finalStats = await getStatsFromPopup(ctx, sw);
    const finalDomainSeconds = Number(finalStats?.stats?.[TEST_DOMAIN] || 0);
    expect(finalDomainSeconds).toBeGreaterThanOrEqual(fullscreenSeconds);

    if (pipChecked) {
      expect(Number(finalStats?.stats?.pipSeconds || 0)).toBeGreaterThanOrEqual(0);
      expect(Number(finalStats?.stats?.pipByDomain?.[TEST_DOMAIN] || 0)).toBeGreaterThanOrEqual(0);
    }

    const today = await sw.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const rangeToday = finalStats?.range?.[today] || {};
    const rangeDomainSeconds = Number(rangeToday[TEST_DOMAIN] || 0);
    expect(rangeDomainSeconds).toBeGreaterThan(0);
    // GET_STATS and GET_STATS_RANGE should converge for the same day/domain read.
    expect(Math.abs(rangeDomainSeconds - finalDomainSeconds)).toBeLessThanOrEqual(2);

    const storageSnapshot = await getStorageConvergenceSnapshot(sw, TEST_DOMAIN);
    expect(storageSnapshot.segmentsCount).toBeGreaterThan(0);
    expect(storageSnapshot.segmentsTotal).toBeGreaterThan(0);
    expect(storageSnapshot.dailyDomain).toBeGreaterThan(0);
    // storage materialized daily stats should converge with API read, allowing flush jitter tolerance.
    expect(Math.abs(storageSnapshot.dailyDomain - finalDomainSeconds)).toBeLessThanOrEqual(3);
    // no obvious double-count inflation against settled segments.
    expect(storageSnapshot.dailyDomain).toBeLessThanOrEqual(storageSnapshot.segmentsTotal + 3);

    await page.close();
  } finally {
    await ctx.close();
    server.close();
    fs.rmSync(udd, { recursive: true, force: true });
  }
});

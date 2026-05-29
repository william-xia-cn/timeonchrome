// P0 E2E: GET_STATS from popup + mode-switch verification
// Uses event-log injection (prod fallback path) proven reliable in E2E
const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const http = require('http');
const {
  assertNoForbiddenForegroundOperations,
  assertNoUnexpectedOverlap,
  assertUsageTimeline,
  readLedgerSnapshot,
} = require('./helpers/ledger-assertions');

const EXT = path.resolve(__dirname, '..', '..', 'extension');
const TIME_WINDOW_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function allDayModeTimeWindows() {
  return {
    daily: Object.fromEntries(TIME_WINDOW_DAYS.map((day) => [day, {
      studyWindows: null,
      compositeWindows: null,
      restWindows: null,
    }])),
  };
}

function localDateKey(now = Date.now()) {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function createContext() {
  const udd = fs.mkdtempSync(path.resolve(__dirname, '../../.artifacts/test-e2e-profile-settle-'));
  const ctx = await chromium.launchPersistentContext(udd, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  await sw.evaluate(async (timeWindows) => {
    return new Promise(res => {
      chrome.storage.local.clear(() => {
        chrome.storage.session.clear(() => {
          chrome.storage.local.get(['guardian_config', 'guardian_session'], r => {
            const c = r['guardian_config'] || {}; const s = r['guardian_session'] || {};
            chrome.storage.local.set({
              guardian_config: {
                ...c,
                mode: 'rest',
                enabled: true,
                profileId: 'e2e-profile-settle',
                deviceId: 'e2e-device-id-settle',
                timeWindows,
              },
              guardian_session: {
                ...s,
                currentMode: 'rest',
                profileId: 'e2e-profile-settle',
                deviceId: 'e2e-device-id-settle',
              },
              cloud_profile_id: 'e2e-profile-settle',
              cloud_device_id: 'e2e-device-id-settle',
              cloud_device_token: 'e2e-device-token-settle',
              event_log_v1: [],
              usage_segments_v1: {},
              usage_segments_index_v1: {},
              daily_usage_stats_v1: {},
              segment_sync_outbox_v1: { dirtySegmentIds: [], retryCounts: {}, lastErrors: {} },
              stats_sync_outbox_v1: { dirtyDates: [], retryCounts: {}, lastErrors: {} },
              session_v1_persistent: null,
            }, res);
          });
        });
      });
    });
  }, allDayModeTimeWindows());
  await sw.evaluate(async () => {
    if (typeof globalThis.debugSetRestMode === 'function') {
      await globalThis.debugSetRestMode();
    }
  });
  await new Promise(r => setTimeout(r, 1000));
  return { ctx, sw, udd };
}

async function startCheckpointServer() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><title>Checkpoint Fixture</title><body>${req.url}</body>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    server,
    domain: '127.0.0.1',
    url: `http://127.0.0.1:${port}/checkpoint-open`,
  };
}

async function tabInfoForPage(sw, page) {
  const pageUrl = page.url();
  return await sw.evaluate(async (targetUrl) => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((candidate) => candidate.url === targetUrl);
      if (tab?.id) return { tabId: tab.id, windowId: tab.windowId || null };
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { tabId: null, windowId: null };
  }, pageUrl);
}

async function focusTabForCheckpoint(sw, tabInfo) {
  return await sw.evaluate(async ({ tabId, windowId }) => {
    if (Number.isInteger(windowId) && chrome.windows?.update) {
      try {
        await chrome.windows.update(windowId, { focused: true });
      } catch (_) {}
    }
    if (Number.isInteger(tabId) && chrome.tabs?.update) {
      try {
        await chrome.tabs.update(tabId, { active: true });
      } catch (_) {}
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const active = activeTabs?.[0] || null;
      if (active?.id === tabId) {
        return {
          ok: true,
          tabId: active.id,
          windowId: active.windowId || windowId || null,
          url: active.url || null,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return {
      ok: false,
      reason: 'active_tab_not_confirmed',
      expectedTabId: tabId,
      actualTabId: activeTabs?.[0]?.id ?? null,
      actualUrl: activeTabs?.[0]?.url || null,
    };
  }, tabInfo);
}

async function closeServer(server) {
  if (!server) return;
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(() => resolve()));
}

async function sendRuntimeMessageFromExtensionPage(ctx, sw, type) {
  const debugResponse = await sw.evaluate(async (messageType) => {
    if (typeof globalThis.debugSendModeSwitchMessage !== 'function') return null;
    return await globalThis.debugSendModeSwitchMessage({ type: messageType });
  }, type);
  if (debugResponse?.success === true) return debugResponse.response;

  const popupUrl = await sw.evaluate(() => chrome.runtime.getURL('popup/popup.html'));
  const page = await ctx.newPage();
  try {
    await page.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    return await page.evaluate(async (messageType) => {
      return new Promise(res => {
        chrome.runtime.sendMessage({ type: messageType }, r => res(r));
      });
    }, type);
  } finally {
    await page.close().catch(() => {});
  }
}

// ── Test 1: GET_STATS from popup returns domain data after usage ─────────────
test('P0-settle-1: GET_STATS from popup returns domain stats via event-log', async () => {
  const { ctx, sw, udd } = await createContext();
  try {
    const n = Date.now();
    const date = localDateKey(n);

    // Seed current Stats Foundation aggregate; GET_STATS is backed by durable daily stats,
    // not by ad-hoc event_log fallback.
    await sw.evaluate(async (date) => {
      const endMs = Date.now();
      const startMs = endMs - 30_000;
      const segment = {
        id: `e2e-seed-${date}-visited-site`,
        profileId: 'e2e-profile-settle',
        deviceId: 'e2e-device-id-settle',
        date,
        timezone: 'Asia/Shanghai',
        startMs,
        endMs,
        durationSeconds: 30,
        domain: 'visited-site.example.com',
        sourceState: 'ACTIVE',
        channel: 'active',
        mode: 'rest',
        settlementReason: 'e2e_seed',
        reason: 'e2e_seed',
        description: {
          start: { operation: 'e2e_seed' },
          end: { operation: 'e2e_seed' },
        },
      };
      return new Promise(res => {
        chrome.storage.local.set({
          usage_segments_v1: {
            [segment.id]: segment,
          },
          usage_segments_index_v1: {
            [date]: [segment.id],
          },
          daily_usage_stats_v1: {
            [date]: {
              date,
              domains: {
                'visited-site.example.com': {
                  domain: 'visited-site.example.com',
                  activeSeconds: 30,
                  backgroundMediaSeconds: 0,
                  pipSeconds: 0,
                  totalSeconds: 30,
                  activeByMode: { rest: 30 },
                  backgroundMediaByMode: {},
                  pipByMode: {},
                },
              },
              totals: {
                activeSeconds: 30,
                backgroundMediaSeconds: 0,
                pipSeconds: 0,
                onlineSeconds: 30,
              },
            },
          },
        }, res);
      });
    }, date);

    // Open popup and get stats (exact product path: popup.js → sendMsg('GET_STATS'))
    const popupUrl = await sw.evaluate(() => chrome.runtime.getURL('popup/popup.html'));
    const popup = await ctx.newPage();
    await popup.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await popup.waitForTimeout(2000);

    const stats = await popup.evaluate(async () => {
      return new Promise(res => {
        chrome.runtime.sendMessage({ type: 'GET_STATS' }, r => res(r || {}));
      });
    });

    let online = 0;
    const domainData = [];
    for (const [k, v] of Object.entries(stats || {})) {
      if (['audioSeconds','backgroundMediaByDomain','pipSeconds','pipByDomain','onlineSeconds'].includes(k)) continue;
      online += (typeof v === 'number' ? v : 0);
      domainData.push(`${k}=${v}`);
    }
    console.log(`GET_STATS: online=${online}s, domains=[${domainData}]`);
    console.log(`audioSeconds=${stats?.audioSeconds}, bgByDomain=${Object.keys(stats?.backgroundMediaByDomain || {}).length}`);

    // P0 assertions
    expect(online).toBeGreaterThan(0);
    expect(typeof stats?.audioSeconds).toBe('number');
    expect(stats?.backgroundMediaByDomain).toBeDefined();
    expect(stats?.pipSeconds).toBeDefined();

    const ledger = await readLedgerSnapshot(sw);
    assertNoForbiddenForegroundOperations(ledger.usage);
    assertNoUnexpectedOverlap(ledger.usage, 'usage');

    await popup.close();
  } finally { await ctx.close(); fs.rmSync(udd, { recursive: true, force: true }); }
});

// ── Test 3: Checkpoint-first foreground settlement makes stats durable ──────
test('P0-settle-3: checkpoint settles open bound foreground session into Stats Foundation', async () => {
  const { ctx, sw, udd } = await createContext();
  const serverCtx = await startCheckpointServer();
  let foregroundPage = null;
  try {
    foregroundPage = await ctx.newPage();
    await foregroundPage.goto(serverCtx.url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await foregroundPage.bringToFront();
    await foregroundPage.waitForTimeout(250);
    const tabInfo = await tabInfoForPage(sw, foregroundPage);
    expect(Number.isInteger(tabInfo.tabId)).toBeTruthy();
    expect(Number.isInteger(tabInfo.windowId)).toBeTruthy();
    const focused = await focusTabForCheckpoint(sw, tabInfo);
    expect(focused.ok, JSON.stringify(focused)).toBeTruthy();
    await foregroundPage.waitForTimeout(250);

    const n = Date.now();
    await sw.evaluate(async ({ now, tabInfo, domain, url }) => {
      const result = await globalThis.debugApplyControlledTimingSignal({
        _reason: 'e2eCheckpointOpen',
        _debugNow: now - 181000,
        tabId: tabInfo.tabId,
        windowId: tabInfo.windowId,
        domain,
        url,
        isFocused: true,
        isIdle: false,
        isAudible: false,
      });
      if (!result?.success || result?.state !== 'ACTIVE') {
        throw new Error(`e2eCheckpointOpen failed: ${JSON.stringify(result)}`);
      }
      const session = {
        state: 'ACTIVE',
        domain,
        startTime: now - 181000,
        startAtMs: now - 181000,
        lastHeartbeat: now - 1000,
        startReason: 'e2eCheckpointOpen',
        startOperationSource: 'chrome_event',
        tabId: tabInfo.tabId,
        windowId: tabInfo.windowId,
        quotaBucketAtTime: 'rest',
      };
      return new Promise(res => chrome.storage.session.set({ session_v1: session }, () => {
        chrome.storage.local.set({
          session_v1_persistent: session,
          usage_segments_v1: {},
          usage_segments_index_v1: {},
          daily_usage_stats_v1: {},
        }, res);
      }));
    }, { now: n, tabInfo, domain: serverCtx.domain, url: serverCtx.url });

    const beforeCheckpoint = await sw.evaluate(async () => {
      return new Promise(res => {
        chrome.storage.local.get(['usage_segments_v1'], r => res(r || {}));
      });
    });
    expect(Object.keys(beforeCheckpoint.usage_segments_v1 || {}).length).toBe(0);

    const checkpoint = await sw.evaluate(async (now) => globalThis.debugRunPeriodicCheckpoint(now), n);
    expect(checkpoint.ok).toBeTruthy();
    expect(checkpoint.checkpointed, JSON.stringify(checkpoint)).toBeTruthy();

    const popupUrl = await sw.evaluate(() => chrome.runtime.getURL('popup/popup.html'));
    const popup = await ctx.newPage();
    await popup.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await popup.waitForTimeout(250);

    const afterCheckpoint = await popup.evaluate(async () => {
      return new Promise(res => {
        chrome.runtime.sendMessage({ type: 'GET_STATS' }, r => res(r || {}));
      });
    });
    expect(afterCheckpoint[serverCtx.domain]).toBeGreaterThan(0);
    expect(afterCheckpoint.onlineSeconds).toBeGreaterThan(0);

    const snapshot1 = await sw.evaluate(async () => {
      return new Promise(res => {
        chrome.storage.local.get(['usage_segments_v1', 'daily_usage_stats_v1', 'cloud_profile_id'], r => res(r));
      });
    });
    const segments1 = Object.values(snapshot1.usage_segments_v1 || {});
    expect(segments1.length).toBeGreaterThanOrEqual(1);
    expect(segments1.some(s =>
      s.domain === serverCtx.domain &&
      s.settlementReason === 'periodic_checkpoint'
    )).toBeTruthy();
    const ledger1 = await readLedgerSnapshot(sw);
    assertUsageTimeline(ledger1.usage, [{
      domain: serverCtx.domain,
      settlementReason: 'periodic_checkpoint',
      sourceState: 'ACTIVE',
      duration: { min: 180, max: 181 },
    }], { label: 'P0-settle-3 checkpoint usage ledger' });
    assertNoForbiddenForegroundOperations(ledger1.usage);
    assertNoUnexpectedOverlap(ledger1.usage, 'usage');

    const profileIdCounts = segments1.reduce((acc, seg) => {
      const key = seg?.profileId || '(null)';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const profileSamples = segments1.map((seg) => ({
      id: seg?.id || null,
      profileId: seg?.profileId || null,
      deviceId: seg?.deviceId || null,
      date: seg?.date || null,
      domain: seg?.domain || null,
    }));
    console.log('P0-settle-3 cloud_profile_id:', snapshot1.cloud_profile_id || null);
    console.log('P0-settle-3 profileId distribution:', JSON.stringify(profileIdCounts));
    console.log('P0-settle-3 sample segments:', JSON.stringify(profileSamples.slice(0, 5)));
    expect(segments1.every(s => s.profileId === 'e2e-profile-settle')).toBeTruthy();
    expect(segments1.every(s => s.deviceId === 'e2e-device-id-settle')).toBeTruthy();
    expect(segments1.every(s => s.channel === 'active')).toBeTruthy();

    const second = await popup.evaluate(async () => {
      return new Promise(res => {
        chrome.runtime.sendMessage({ type: 'GET_STATS' }, r => res(r || {}));
      });
    });
    expect(second[serverCtx.domain]).toBeGreaterThanOrEqual(afterCheckpoint[serverCtx.domain]);
    expect(second[serverCtx.domain]).toBeLessThanOrEqual(afterCheckpoint[serverCtx.domain] + 5);
    const snapshot2 = await sw.evaluate(async () => {
      return new Promise(res => chrome.storage.local.get('usage_segments_v1', r => res(r)));
    });
    expect(Object.keys(snapshot2.usage_segments_v1 || {}).length).toBeLessThanOrEqual(segments1.length + 1);
    const ledger2 = await readLedgerSnapshot(sw);
    const popupRows = ledger2.usage.filter((row) => row.settlementReason === 'popup_open');
    assertUsageTimeline(popupRows, popupRows.map((row) => ({
      domain: row.domain,
      mode: row.mode,
      settlementReason: 'popup_open',
      closeOperation: 'popup_open',
      allowZeroDuration: row.durationSeconds === 0,
    })), { label: 'P0-settle-3 popup_open usage ledger', exact: true });
    assertNoForbiddenForegroundOperations(ledger2.usage);

    await popup.close();
  } finally {
    if (foregroundPage) await foregroundPage.close().catch(() => {});
    await closeServer(serverCtx.server);
    await ctx.close();
    fs.rmSync(udd, { recursive: true, force: true });
  }
});

// ── Test 2: Mode switch changes session mode ────────────────────────────────
test('P0-settle-2: SWITCH_TO_STUDY/REST from popup changes mode', async () => {
  const { ctx, sw, udd } = await createContext();
  try {
    // Send each runtime message from a fresh extension page. Mode changes can
    // navigate/close the previous popup context, so reusing it makes the test
    // depend on page lifetime rather than message-router behavior.
    await sendRuntimeMessageFromExtensionPage(ctx, sw, 'SWITCH_TO_STUDY');
    let s1 = await sw.evaluate(async () => {
      return new Promise(res => {
        chrome.storage.local.get('guardian_session', r => res(r['guardian_session']?.currentMode));
      });
    });
    console.log(`STUDY: mode=${s1}`);
    expect(s1).toBe('study');

    // Switch back to rest
    await sendRuntimeMessageFromExtensionPage(ctx, sw, 'SWITCH_TO_REST');
    let s2 = await sw.evaluate(async () => {
      return new Promise(res => {
        chrome.storage.local.get('guardian_session', r => res(r['guardian_session']?.currentMode));
      });
    });
    console.log(`REST: mode=${s2}`);
    expect(s2).toBe('rest');
  } finally { await ctx.close(); fs.rmSync(udd, { recursive: true, force: true }); }
});

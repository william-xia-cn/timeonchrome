// P0 E2E: global PiP disable policy plus mode switch prompt/boundary paths.
// Run with: npx playwright test tests/e2e/mode-switch-pip-close.test.js --reporter=line

const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const http = require('http');
const path = require('path');
const {
  assertMediaTimeline,
  assertNoForbiddenForegroundOperations,
  assertNoUnexpectedOverlap,
  assertUsageTimeline,
  formatTimeline,
  readLedgerSnapshot,
} = require('./helpers/ledger-assertions');

const EXT = path.resolve(__dirname, '..', '..', 'extension');

async function startServer() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html>
<html>
  <head><meta charset="utf-8"><title>PiP Gate Test</title></head>
  <body>
    <main><h1>PiP Gate Test</h1><p>${req.url}</p></main>
  </body>
</html>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    server,
    port,
    studyUrl: `http://127.0.0.1:${port}/study`,
    compositeUrl: `http://localhost:${port}/composite`,
  };
}

async function createContext(initialMode) {
  const udd = path.resolve(__dirname, `../../.artifacts/test-e2e-profile-mode-pip-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(udd, { recursive: true });
  const ctx = await chromium.launchPersistentContext(udd, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  await sw.evaluate(async (mode) => {
    await chrome.storage.local.set({
      guardian_config: {
        enabled: true,
        mode,
        studyList: ['127.0.0.1'],
        compositeList: ['localhost'],
        restrictedEntertainmentList: [],
        unsafeList: [],
        blacklist: [],
        quotaState: {
          onlineLocked: false,
          studyLocked: false,
          restLocked: false,
          undeterminedLocked: false,
        },
      },
      guardian_session: { currentMode: mode },
      cloud_monitoring_enabled: 1,
    });
  }, initialMode);
  return { ctx, sw, udd };
}

async function cleanup(ctx, udd, server) {
  if (ctx) await ctx.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => setTimeout(resolve, 1000));
  if (udd && fs.existsSync(udd)) fs.rmSync(udd, { recursive: true, force: true });
}

async function tabIdForPage(sw, page) {
  const pageUrl = page.url();
  return await sw.evaluate(async (targetUrl) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => t.url === targetUrl);
    if (tab?.id) return tab.id;
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return active?.id || null;
  }, pageUrl);
}

async function sendRuntimeMessage(ctx, sw, page, type) {
  await page.bringToFront();
  const targetTabId = await tabIdForPage(sw, page);
  return await sw.evaluate(async ({ messageType, targetTabId }) => {
    if (targetTabId) await chrome.tabs.update(targetTabId, { active: true });
    if (typeof globalThis.debugSendModeSwitchMessage === 'function') {
      return await globalThis.debugSendModeSwitchMessage({ type: messageType, noticeTabId: targetTabId });
    }
    return { success: false, error: 'debugSendModeSwitchMessage_missing' };
  }, { messageType: type, targetTabId });
}

async function forceRuntimeMode(sw, mode) {
  await sw.evaluate(async (nextMode) => {
    const data = await chrome.storage.local.get(['guardian_config', 'guardian_session']);
    const cfg = data.guardian_config || {};
    cfg.mode = nextMode;
    const session = data.guardian_session || {};
    session.currentMode = nextMode;
    await chrome.storage.local.set({
      guardian_config: cfg,
      guardian_session: session,
    });
    if (nextMode === 'rest' && typeof globalThis.debugSetRestMode === 'function') {
      await globalThis.debugSetRestMode();
    }
  }, mode);
}

async function triggerAutoTransitionHarness(sw, nowStartMs, nowEndMs, tabId) {
  return await sw.evaluate(async ({ start, end, tabId }) => {
    if (typeof globalThis.debugTriggerAutoTransition !== 'function') {
      return { success: false, error: 'debugTriggerAutoTransition_missing' };
    }
    return await globalThis.debugTriggerAutoTransition({
      nowStartMs: start,
      nowEndMs: end,
      tabId,
    });
  }, { start: nowStartMs, end: nowEndMs, tabId });
}

async function activeTabId(sw) {
  return await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id || null;
  });
}

async function seedFakePiP(page, sw) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(250);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.font = '24px sans-serif';
        ctx.fillText('TimeOnChrome PiP', 40, 95);

        const video = document.createElement('video');
        video.id = 'toc-pip-video';
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.srcObject = canvas.captureStream(1);
        video.style.width = '320px';
        video.style.height = '180px';
        document.body.append(video);

        let exitEvents = 0;
        video.addEventListener('leavepictureinpicture', () => {
          exitEvents += 1;
        });

        const button = document.createElement('button');
        button.id = 'toc-open-pip';
        button.textContent = 'Open PiP';
        button.addEventListener('click', async () => {
          await video.play();
          await video.requestPictureInPicture();
        });
        document.body.append(button);

        window.__tocPiPPageState = () => ({
          active: document.pictureInPictureElement === video,
          exitCalls: exitEvents,
        });
        window.__tocPiPKeepAlive = { canvas, video };
      });
      break;
    } catch (err) {
      if (attempt === 2 || !String(err?.message || err).includes('Execution context was destroyed')) throw err;
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(500);
    }
  }
  await page.locator('#toc-open-pip').click();
  const tabId = await sw.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab.id;
  });
  return tabId;
}

async function bannerText(page) {
  return await page.evaluate(() => {
    const host = document.getElementById('__toc_mode_notice__');
    if (!host || !host.shadowRoot) return '';
    const banner = host.shadowRoot.getElementById('toc-pending-banner');
    return banner ? banner.textContent || '' : '';
  });
}

async function fakePiPState(page) {
  return await page.evaluate(() => {
    return window.__tocPiPPageState ? window.__tocPiPPageState() : { active: !!document.pictureInPictureElement, exitCalls: 0 };
  });
}

async function waitForOpenForegroundSession(sw, domain) {
  await expect.poll(async () => {
    return await sw.evaluate(async (expectedDomain) => {
      const data = await chrome.storage.session.get('session_v1');
      const session = data.session_v1 || null;
      return session?.state === 'ACTIVE' && session?.domain === expectedDomain;
    }, domain);
  }, { timeout: 6000 }).toBe(true);
}

async function ensureOpenForegroundSession(sw, domain, tabId, atMs = Date.now(), forceSeed = false) {
  const result = await sw.evaluate(async ({ expectedDomain, targetTabId, atMs, forceSeed }) => {
    const current = await chrome.storage.session.get('session_v1');
    const existing = current.session_v1 || null;
    if (!forceSeed && existing?.state === 'ACTIVE' && existing?.domain === expectedDomain) {
      return { success: true, seeded: false, session: existing };
    }

    if (typeof globalThis.debugApplyControlledTimingSignal !== 'function') {
      return { success: false, error: 'debugApplyControlledTimingSignal_missing' };
    }

    let tab = null;
    try {
      tab = await chrome.tabs.get(targetTabId);
    } catch {
      tab = null;
    }
    if (!tab?.id) {
      return { success: false, error: 'target_tab_missing' };
    }

    const signalResult = await globalThis.debugApplyControlledTimingSignal({
      _reason: 'e2eModeBoundaryForegroundSeed',
      _debugNow: atMs,
      tabId: tab.id,
      windowId: tab.windowId,
      domain: expectedDomain,
      url: tab.url || `https://${expectedDomain}/`,
      isFocused: true,
      isIdle: false,
      isAudible: Boolean(tab.audible),
    });
    if (!signalResult?.success) {
      return { success: false, error: signalResult?.error || 'foreground_seed_failed', signalResult };
    }
    return { success: true, seeded: true, signalResult };
  }, { expectedDomain: domain, targetTabId: tabId, atMs, forceSeed });

  expect(result.success, JSON.stringify(result)).toBe(true);
  await waitForOpenForegroundSession(sw, domain);
}

async function waitForOpenPiPMediaSession(sw, domain) {
  await expect.poll(async () => {
    return await sw.evaluate(async (expectedDomain) => {
      const data = await chrome.storage.local.get('media_sessions_v2');
      return Object.values(data.media_sessions_v2 || {}).some((session) =>
        session?.domain === expectedDomain &&
        session?.mediaClass === 'pip' &&
        session?.startTime != null
      );
    }, domain);
  }, { timeout: 6000 }).toBe(true);
}

async function assertNoOpenPiPMediaSession(sw, domain) {
  await expect.poll(async () => {
    return await sw.evaluate(async (expectedDomain) => {
      const data = await chrome.storage.local.get('media_sessions_v2');
      return Object.values(data.media_sessions_v2 || {}).filter((session) =>
        session?.domain === expectedDomain &&
        session?.mediaClass === 'pip' &&
        session?.startTime != null
      ).length;
    }, domain);
  }, { timeout: 6000 }).toBe(0);
}

async function assertNoPiPPeriodicCheckpointAfterClose(sw, domain, toMode) {
  const checkpoint = await sw.evaluate(async (now) => {
    if (typeof globalThis.debugRunMediaPeriodicCheckpoint !== 'function') {
      return { ok: false, reason: 'debugRunMediaPeriodicCheckpoint_missing' };
    }
    return await globalThis.debugRunMediaPeriodicCheckpoint(now);
  }, Date.now() + 181_000);
  expect(checkpoint?.ok, JSON.stringify(checkpoint)).toBe(true);

  const ledger = await readLedgerSnapshot(sw);
  const badRows = ledger.media.filter((row) =>
    row.domain === domain &&
    (!toMode || row.mode === toMode) &&
    row.mediaClass === 'pip' &&
    row.settlementReason === 'periodic_checkpoint'
  );
  expect(badRows, `unexpected PiP checkpoint rows after close\n${formatTimeline(ledger.media)}`).toEqual([]);
}

async function anchorOpenPiPMediaSession(sw, domain, tabId, atMs, mode = 'rest') {
  const result = await sw.evaluate(async ({ expectedDomain, targetTabId, atMs, mode }) => {
    let tab = null;
    try {
      tab = await chrome.tabs.get(targetTabId);
    } catch {
      tab = null;
    }
    if (!tab?.id) return { success: false, error: 'target_tab_missing' };

    const data = await chrome.storage.local.get('media_sessions_v2');
    const sessions = data.media_sessions_v2 || {};
    const key = `${targetTabId}::pip`;
    const existing = sessions[key] || {};
    sessions[key] = {
      ...existing,
      tabId: targetTabId,
      windowId: tab.windowId,
      domain: expectedDomain,
      mediaClass: 'pip',
      mediaKind: 'pip',
      visibility: 'pip',
      startTime: atMs,
      lastObservedAt: atMs,
      startReason: existing.startReason || 'mediaState',
      startOperationSource: existing.startOperationSource || 'media',
      startAtMs: atMs,
      mode,
    };
    await chrome.storage.local.set({ media_sessions_v2: sessions });
    return { success: true, key, session: sessions[key] };
  }, { expectedDomain: domain, targetTabId: tabId, atMs, mode });

  expect(result.success, JSON.stringify(result)).toBe(true);
}

async function assertForbiddenPiPCleanup(sw, page, domain) {
  await expect.poll(async () => {
    const state = await fakePiPState(page);
    return state.active === false && state.exitCalls > 0;
  }, { timeout: 6000 }).toBe(true);
  try {
    await expect.poll(async () => {
      const ledger = await readLedgerSnapshot(sw);
      return ledger.media.some((row) =>
        row.domain === domain &&
        row.mediaClass === 'pip' &&
        row.settlementReason === 'pip_forbidden_cleanup'
      );
    }, { timeout: 6000 }).toBe(true);
  } catch (err) {
    const ledger = await readLedgerSnapshot(sw);
    console.log(`\nPiP cleanup usage ledger\n${formatTimeline(ledger.usage)}`);
    console.log(`\nPiP cleanup media ledger\n${formatTimeline(ledger.media)}`);
    throw err;
  }

  const ledger = await readLedgerSnapshot(sw);
  assertMediaTimeline(ledger.media, [{
    domain,
    settlementReason: 'pip_forbidden_cleanup',
    mediaClass: 'pip',
    closeOperation: 'pip_forbidden_cleanup',
    allowZeroDuration: true,
  }], { label: 'global forbidden PiP cleanup ledger' });
  await assertNoOpenPiPMediaSession(sw, domain);
  await assertNoPiPPeriodicCheckpointAfterClose(sw, domain, null);
}

async function assertForegroundModeBoundaryLedger(sw, domain, fromMode, toMode) {
  try {
    await expect.poll(async () => {
      const ledger = await readLedgerSnapshot(sw);
      return ledger.usage.some((row) =>
        row.domain === domain &&
        row.mode === fromMode &&
        row.settlementReason === 'mode_effective_boundary'
      );
    }, { timeout: 6000 }).toBe(true);
  } catch (err) {
    const ledger = await readLedgerSnapshot(sw);
    console.log(`\n${fromMode}->${toMode} usage ledger\n${formatTimeline(ledger.usage)}`);
    console.log(`\n${fromMode}->${toMode} media ledger\n${formatTimeline(ledger.media)}`);
    throw err;
  }

  const ledger = await readLedgerSnapshot(sw);
  assertUsageTimeline(ledger.usage, [{
    domain,
    mode: fromMode,
    settlementReason: 'mode_effective_boundary',
    closeOperation: 'mode_effective_boundary',
    allowZeroDuration: true,
  }], { label: `${fromMode}->${toMode} foreground mode boundary ledger` });
  assertNoForbiddenForegroundOperations(ledger.usage);
  assertNoUnexpectedOverlap(ledger.usage, 'usage');
  assertNoUnexpectedOverlap(ledger.media, 'media');
  await assertNoOpenPiPMediaSession(sw, domain);
}

test('Rest -> Composite (manual): globally closes forbidden PiP', async () => {
  const serverCtx = await startServer();
  const { ctx, sw, udd } = await createContext('rest');
  try {
    const page = await ctx.newPage();
    await page.goto(serverCtx.compositeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.bringToFront();
    await forceRuntimeMode(sw, 'rest');
    const tabId = await seedFakePiP(page, sw);
    await assertForbiddenPiPCleanup(sw, page, 'localhost');
    await ensureOpenForegroundSession(sw, 'localhost', tabId);

    await sendRuntimeMessage(ctx, sw, page, 'SWITCH_TO_COMPOSITE');
    await assertForegroundModeBoundaryLedger(sw, 'localhost', 'rest', 'composite');
    await page.waitForTimeout(500);
    await page.close();
  } finally {
    await cleanup(ctx, udd, serverCtx.server);
  }
});

test('Rest -> Study (manual): globally closes forbidden PiP and shows study prompt', async () => {
  const serverCtx = await startServer();
  const { ctx, sw, udd } = await createContext('rest');
  try {
    const page = await ctx.newPage();
    await page.goto(serverCtx.studyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.bringToFront();
    await forceRuntimeMode(sw, 'rest');
    const tabId = await seedFakePiP(page, sw);
    await assertForbiddenPiPCleanup(sw, page, '127.0.0.1');
    await ensureOpenForegroundSession(sw, '127.0.0.1', tabId);

    await sendRuntimeMessage(ctx, sw, page, 'SWITCH_TO_STUDY');
    await expect.poll(() => bannerText(page), { timeout: 5000 }).toContain('学习模式');
    await assertForegroundModeBoundaryLedger(sw, '127.0.0.1', 'rest', 'study');
    await page.waitForTimeout(500);
    await page.close();
  } finally {
    await cleanup(ctx, udd, serverCtx.server);
  }
});

test('Rest -> Composite (auto): globally closes forbidden PiP', async () => {
  const serverCtx = await startServer();
  const { ctx, sw, udd } = await createContext('rest');
  try {
    const page = await ctx.newPage();
    await page.goto(serverCtx.compositeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.bringToFront();
    await forceRuntimeMode(sw, 'rest');
    let tabId = await seedFakePiP(page, sw);
    await assertForbiddenPiPCleanup(sw, page, 'localhost');
    const startMs = Date.now();
    await triggerAutoTransitionHarness(sw, startMs, startMs, tabId);
    await ensureOpenForegroundSession(sw, 'localhost', tabId, startMs - 1000, true);

    const res = await triggerAutoTransitionHarness(sw, startMs, startMs + 30_000, tabId);
    expect(res?.success).toBe(true);
    expect(res?.mode).toBe('composite');
    await assertForegroundModeBoundaryLedger(sw, 'localhost', 'rest', 'composite');
    await page.waitForTimeout(500);
    await page.close();
  } finally {
    await cleanup(ctx, udd, serverCtx.server);
  }
});

test('Rest -> Study (auto): globally closes forbidden PiP and shows study prompt', async () => {
  const serverCtx = await startServer();
  const { ctx, sw, udd } = await createContext('rest');
  try {
    const page = await ctx.newPage();
    await page.goto(serverCtx.studyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.bringToFront();
    await forceRuntimeMode(sw, 'rest');
    let tabId = await seedFakePiP(page, sw);
    await assertForbiddenPiPCleanup(sw, page, '127.0.0.1');
    const startMs = Date.now();
    await triggerAutoTransitionHarness(sw, startMs, startMs, tabId);
    await ensureOpenForegroundSession(sw, '127.0.0.1', tabId, startMs - 1000, true);

    const res = await triggerAutoTransitionHarness(sw, startMs, startMs + 45_000, tabId);
    expect(res?.success).toBe(true);
    expect(res?.mode).toBe('study');
    await expect.poll(() => bannerText(page), { timeout: 5000 }).toContain('学习时间');
    await assertForegroundModeBoundaryLedger(sw, '127.0.0.1', 'rest', 'study');
    await page.waitForTimeout(500);
    await page.close();
  } finally {
    await cleanup(ctx, udd, serverCtx.server);
  }
});

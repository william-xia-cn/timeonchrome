// P0 E2E: mode switch PiP cleanup across manual + auto transition paths.
// Run with: npx playwright test tests/e2e/mode-switch-pip-close.test.js --reporter=line

const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const http = require('http');
const path = require('path');

const EXT = path.resolve(__dirname, '../..');

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
  const udd = path.resolve(__dirname, `../../test-e2e-profile-mode-pip-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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
  if (udd && fs.existsSync(udd)) fs.rmSync(udd, { recursive: true, force: true });
}

async function sendRuntimeMessage(sw, type, tabId) {
  return await sw.evaluate(async ({ messageType, tabId }) => {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (payloadType) => chrome.runtime.sendMessage({ type: payloadType }),
      args: [messageType],
    });
    return result?.result || null;
  }, { messageType: type, tabId });
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

async function seedFakePiP(page, sw) {
  await page.evaluate(() => {
    let active = true;
    let exitCalls = 0;
    const fakeElement = { tagName: 'VIDEO' };
    Object.defineProperty(document, 'pictureInPictureElement', {
      configurable: true,
      get() {
        return active ? fakeElement : null;
      },
    });
    document.exitPictureInPicture = async () => {
      exitCalls += 1;
      active = false;
    };
    window.__tocFakePipPageState = () => ({ active, exitCalls });
  });
  const tabId = await sw.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        let active = true;
        let exitCalls = 0;
        const fakeElement = { tagName: 'VIDEO' };
        Object.defineProperty(document, 'pictureInPictureElement', {
          configurable: true,
          get() {
            return active ? fakeElement : null;
          },
        });
        document.exitPictureInPicture = async () => {
          exitCalls += 1;
          active = false;
        };
        globalThis.__tocFakePipState = () => ({ active, exitCalls });
      },
    });
    return tab.id;
  });
  return tabId;
}

async function bannerText(page) {
  return await page.evaluate(() => {
    const host = document.getElementById('__toc_auto_mode_pending__');
    if (!host || !host.shadowRoot) return '';
    const banner = host.shadowRoot.getElementById('toc-pending-banner');
    return banner ? banner.textContent || '' : '';
  });
}

async function fakePiPState(sw, tabId) {
  return await sw.evaluate(async (targetTabId) => {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: () => (globalThis.__tocFakePipState ? globalThis.__tocFakePipState() : { active: !!document.pictureInPictureElement, exitCalls: 0 }),
    });
    return result?.result || { active: false, exitCalls: 0 };
  }, tabId);
}

test('Rest -> Composite (manual): closes PiP', async () => {
  const serverCtx = await startServer();
  const { ctx, sw, udd } = await createContext('rest');
  try {
    const page = await ctx.newPage();
    await page.goto(serverCtx.compositeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.bringToFront();
    await forceRuntimeMode(sw, 'rest');
    const tabId = await seedFakePiP(page, sw);
    expect((await fakePiPState(sw, tabId)).active).toBe(true);

    await sendRuntimeMessage(sw, 'SWITCH_TO_COMPOSITE', tabId);
    await expect.poll(() => fakePiPState(sw, tabId).then((s) => s.active), { timeout: 5000 }).toBe(false);
    expect((await fakePiPState(sw, tabId)).exitCalls).toBeGreaterThan(0);
    await page.close();
  } finally {
    await cleanup(ctx, udd, serverCtx.server);
  }
});

test('Rest -> Study (manual): closes PiP and shows study prompt', async () => {
  const serverCtx = await startServer();
  const { ctx, sw, udd } = await createContext('rest');
  try {
    const page = await ctx.newPage();
    await page.goto(serverCtx.studyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.bringToFront();
    await forceRuntimeMode(sw, 'rest');
    const tabId = await seedFakePiP(page, sw);
    expect((await fakePiPState(sw, tabId)).active).toBe(true);

    await sendRuntimeMessage(sw, 'SWITCH_TO_STUDY', tabId);
    await expect.poll(() => fakePiPState(sw, tabId).then((s) => s.active), { timeout: 5000 }).toBe(false);
    await expect.poll(() => bannerText(page), { timeout: 5000 }).toContain('学习模式');
    await page.close();
  } finally {
    await cleanup(ctx, udd, serverCtx.server);
  }
});

test('Rest -> Composite (auto): closes PiP', async () => {
  const serverCtx = await startServer();
  const { ctx, sw, udd } = await createContext('rest');
  try {
    const page = await ctx.newPage();
    await page.goto(serverCtx.compositeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.bringToFront();
    await forceRuntimeMode(sw, 'rest');
    const tabId = await seedFakePiP(page, sw);
    expect((await fakePiPState(sw, tabId)).active).toBe(true);

    const res = await triggerAutoTransitionHarness(sw, 0, 60_000, tabId);
    expect(res?.success).toBe(true);
    expect(res?.mode).toBe('composite');
    await expect.poll(() => fakePiPState(sw, tabId).then((s) => s.active), { timeout: 5000 }).toBe(false);
    expect((await fakePiPState(sw, tabId)).exitCalls).toBeGreaterThan(0);
    await page.close();
  } finally {
    await cleanup(ctx, udd, serverCtx.server);
  }
});

test('Rest -> Study (auto): closes PiP and shows study prompt', async () => {
  const serverCtx = await startServer();
  const { ctx, sw, udd } = await createContext('rest');
  try {
    const page = await ctx.newPage();
    await page.goto(serverCtx.studyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.bringToFront();
    await forceRuntimeMode(sw, 'rest');
    const tabId = await seedFakePiP(page, sw);
    expect((await fakePiPState(sw, tabId)).active).toBe(true);

    const res = await triggerAutoTransitionHarness(sw, 0, 90_000, tabId);
    expect(res?.success).toBe(true);
    expect(res?.mode).toBe('study');
    await expect.poll(() => fakePiPState(sw, tabId).then((s) => s.active), { timeout: 5000 }).toBe(false);
    await expect.poll(() => bannerText(page), { timeout: 5000 }).toContain('学习时间');
    await page.close();
  } finally {
    await cleanup(ctx, udd, serverCtx.server);
  }
});

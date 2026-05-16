// P0 E2E: mode switch in-page prompt lifecycle.
// Run with: npx playwright test tests/e2e/mode-switch-prompt-lifecycle.test.js --reporter=line

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
  <head><title>Mode Prompt Test</title></head>
  <body><main><h1>Mode Prompt Test</h1><p>${req.url}</p></main></body>
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
  const udd = path.resolve(__dirname, `../../test-e2e-profile-mode-prompt-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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
  const runtimeUrl = await sw.evaluate(() => chrome.runtime.getURL('popup/popup.html'));
  const extensionPage = await ctx.newPage();
  try {
    await extensionPage.goto(runtimeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    return await extensionPage.evaluate(async ({ messageType, targetTabId }) => {
      if (targetTabId) await chrome.tabs.update(targetTabId, { active: true });
      return await chrome.runtime.sendMessage({ type: messageType, noticeTabId: targetTabId });
    }, { messageType: type, targetTabId });
  } finally {
    await extensionPage.close().catch(() => {});
  }
}

async function getMode(sw) {
  return await sw.evaluate(async () => {
    const r = await chrome.storage.local.get('guardian_session');
    return r.guardian_session?.currentMode || null;
  });
}

async function forceMode(sw, page, mode) {
  await page.bringToFront();
  const tabId = await tabIdForPage(sw, page);
  await sw.evaluate(async ({ tabId, mode }) => {
    const stored = await chrome.storage.local.get(['guardian_config', 'guardian_session']);
    await chrome.storage.local.set({
      guardian_config: {
        ...(stored.guardian_config || {}),
        mode,
      },
      guardian_session: {
        ...(stored.guardian_session || {}),
        currentMode: mode,
      },
    });
    if (Number.isInteger(tabId) && tabId > 0) {
      await chrome.tabs.sendMessage(tabId, {
        type: 'AUTO_MODE_PENDING_CANCEL',
        reason: 'test_reset',
      }, { frameId: 0 }).catch(() => {});
    }
  }, { tabId, mode });
}

async function triggerAutoTransition(sw, page, durationMs = 45_000) {
  await page.bringToFront();
  const tabId = await tabIdForPage(sw, page);
  const nowStartMs = Date.now();
  return await sw.evaluate(async ({ tabId, nowStartMs, nowEndMs }) => {
    return await globalThis.debugTriggerAutoTransition({
      tabId,
      nowStartMs,
      nowEndMs,
    });
  }, { tabId, nowStartMs, nowEndMs: nowStartMs + durationMs });
}

async function sendSyntheticPending(sw, page, targetMode, fromMode) {
  await page.bringToFront();
  const tabId = await tabIdForPage(sw, page);
  await sw.evaluate(async ({ targetMode: to, fromMode: from, tabId }) => {
    const payload = {
      type: 'AUTO_MODE_PENDING_START',
      targetMode: to,
      fromMode: from,
      deadlineAt: Date.now() + 60_000,
      remainingCompositeTime: '60分钟',
    };
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await chrome.tabs.sendMessage(tabId, payload);
        return;
      } catch (err) {
        if (attempt === 19) throw err;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }, { targetMode, fromMode, tabId });
}

async function bannerText(page) {
  return await page.evaluate(() => {
    const host = document.getElementById('__toc_auto_mode_pending__');
    if (!host || !host.shadowRoot) return '';
    const banner = host.shadowRoot.getElementById('toc-pending-banner');
    return banner ? banner.textContent || '' : '';
  });
}

async function bannerExists(page) {
  return await page.evaluate(() => {
    const host = document.getElementById('__toc_auto_mode_pending__');
    return !!(host && host.shadowRoot && host.shadowRoot.getElementById('toc-pending-banner'));
  });
}

test('综合 → 学习：自动切换后显示短暂成功提示并自动消失', async () => {
  const serverCtx = await startServer();
  const { ctx, sw, udd } = await createContext('composite');
  try {
    const page = await ctx.newPage();
    await page.goto(serverCtx.studyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.bringToFront();
    await page.waitForTimeout(500);

    await sendRuntimeMessage(ctx, sw, page, 'SWITCH_TO_STUDY');
    expect(await getMode(sw)).toBe('study');

    await expect.poll(() => bannerText(page), { timeout: 5000 }).toContain('已回到学习模式');
    await expect.poll(() => bannerExists(page), { timeout: 8000 }).toBe(false);
    await page.close();
  } finally {
    await cleanup(ctx, udd, serverCtx.server);
  }
});

test('综合 → 学习：自动 gate 成功后显示页面角标', async () => {
  const serverCtx = await startServer();
  const { ctx, sw, udd } = await createContext('composite');
  try {
    const page = await ctx.newPage();
    await page.goto(serverCtx.studyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.bringToFront();
    await page.waitForTimeout(500);
    await forceMode(sw, page, 'composite');
    expect(await getMode(sw)).toBe('composite');

    const result = await triggerAutoTransition(sw, page, 45_000);
    expect(result.success).toBeTruthy();
    expect(result.tabUrl).toBe(page.url());
    expect(await getMode(sw)).toBe('study');

    await expect.poll(() => bannerText(page), { timeout: 5000 }).toContain('已进入学习时间');
    await expect.poll(() => bannerExists(page), { timeout: 8000 }).toBe(false);
    await page.close();
  } finally {
    await cleanup(ctx, udd, serverCtx.server);
  }
});

test('学习 → 综合：切换前旧 pending 被清理，成功提示按 TTL 消失', async () => {
  const serverCtx = await startServer();
  const { ctx, sw, udd } = await createContext('study');
  try {
    const page = await ctx.newPage();
    await page.goto(serverCtx.compositeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.bringToFront();
    await page.waitForTimeout(500);

    await sendSyntheticPending(sw, page, 'composite', 'study');
    await expect.poll(() => bannerText(page), { timeout: 5000 }).toContain('秒后进入综合时间');

    await sendRuntimeMessage(ctx, sw, page, 'SWITCH_TO_COMPOSITE');
    expect(await getMode(sw)).toBe('composite');
    await expect.poll(() => bannerText(page), { timeout: 5000 }).toContain('已进入综合模式');
    expect(await bannerText(page)).not.toContain('秒后进入综合时间');

    await expect.poll(() => bannerExists(page), { timeout: 8000 }).toBe(false);
    await page.close();
  } finally {
    await cleanup(ctx, udd, serverCtx.server);
  }
});

test('CONTENT_SCRIPT_READY 只恢复未过期提示，且提示不污染新 tab', async () => {
  const serverCtx = await startServer();
  const { ctx, sw, udd } = await createContext('composite');
  try {
    const page = await ctx.newPage();
    await page.goto(serverCtx.studyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.bringToFront();
    await page.waitForTimeout(500);

    await sendRuntimeMessage(ctx, sw, page, 'SWITCH_TO_STUDY');
    await expect.poll(() => bannerText(page), { timeout: 5000 }).toContain('已回到学习模式');

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    await expect.poll(() => bannerText(page), { timeout: 5000 }).toContain('已回到学习模式');

    const otherPage = await ctx.newPage();
    await otherPage.goto(serverCtx.studyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await otherPage.bringToFront();
    await otherPage.waitForTimeout(1000);
    expect(await bannerExists(otherPage)).toBe(false);

    await page.close();
    await otherPage.close();
  } finally {
    await cleanup(ctx, udd, serverCtx.server);
  }
});

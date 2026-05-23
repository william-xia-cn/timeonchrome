// P0 E2E: mode switch in-page prompt lifecycle.
// Run with: npx playwright test tests/e2e/mode-switch-prompt-lifecycle.test.js --reporter=line

const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const http = require('http');
const path = require('path');

const EXT = path.resolve(__dirname, '..', '..', 'extension');

async function seedModePromptConfig(sw, mode) {
  await sw.evaluate(async (nextMode) => {
    await chrome.storage.local.set({
      guardian_config: {
        enabled: true,
        mode: nextMode,
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
      guardian_session: { currentMode: nextMode },
      cloud_monitoring_enabled: 1,
    });
  }, mode);
}

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
  const udd = path.resolve(__dirname, `../../.artifacts/test-e2e-profile-mode-prompt-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(udd, { recursive: true });
  const ctx = await chromium.launchPersistentContext(udd, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  // On a fresh unpacked profile, runtime.onInstalled can still be writing the
  // default config after the service worker is visible. Seed after that initial
  // install write settles, otherwise the test study/composite lists can be
  // overwritten and the page may redirect to reminder.html before assertions.
  await sw.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));
  await seedModePromptConfig(sw, initialMode);
  await sw.evaluate(async (mode) => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const stored = await chrome.storage.local.get(['guardian_config', 'guardian_session']);
      if (
        stored.guardian_config?.studyList?.includes('127.0.0.1') &&
        stored.guardian_config?.compositeList?.includes('localhost') &&
        stored.guardian_session?.currentMode === mode
      ) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
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
    }
    throw new Error('mode prompt test config did not stabilize');
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

async function setModeSession(sw, patch) {
  await sw.evaluate(async (patch) => {
    const stored = await chrome.storage.local.get(['guardian_config', 'guardian_session']);
    await chrome.storage.local.set({
      guardian_config: {
        ...(stored.guardian_config || {}),
        studyList: [],
        compositeList: [],
        restrictedEntertainmentList: [],
        unsafeList: [],
        blacklist: [],
      },
      guardian_session: {
        ...(stored.guardian_session || {}),
        ...patch,
      },
    });
  }, patch);
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
    const host = document.getElementById('__toc_mode_notice__');
    if (!host || !host.shadowRoot) return '';
    const banner = host.shadowRoot.getElementById('toc-pending-banner');
    return banner ? banner.textContent || '' : '';
  });
}

async function bannerExists(page) {
  return await page.evaluate(() => {
    const host = document.getElementById('__toc_mode_notice__');
    return !!(host && host.shadowRoot && host.shadowRoot.getElementById('toc-pending-banner'));
  });
}

async function recentModeEffectTraces(sw) {
  return await sw.evaluate(async () => {
    const data = await chrome.storage.local.get('mode_effect_trace_v1');
    return Array.isArray(data.mode_effect_trace_v1) ? data.mode_effect_trace_v1 : [];
  });
}

async function hasRenderedModeNoticeTrace(sw) {
  const rows = await recentModeEffectTraces(sw);
  return rows.some((row) => row?.result?.noticeAttempted === true && row?.result?.noticeRendered === true);
}

test('综合 → 学习：自动切换后显示短暂成功提示并自动消失', async () => {
  const serverCtx = await startServer();
  const { ctx, sw, udd } = await createContext('composite');
  try {
    const page = await ctx.newPage();
    await page.goto(serverCtx.studyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.bringToFront();
    await page.waitForTimeout(500);

    const switchResponse = await sendRuntimeMessage(ctx, sw, page, 'SWITCH_TO_STUDY');
    expect(await getMode(sw)).toBe('study');
    expect(switchResponse.noticeRendered).toBe(true);

    await expect.poll(() => bannerText(page), { timeout: 5000 }).toContain('已回到学习模式');
    await expect.poll(() => hasRenderedModeNoticeTrace(sw), { timeout: 5000 }).toBe(true);
    await expect.poll(() => bannerExists(page), { timeout: 8000 }).toBe(false);
    await page.close();
  } finally {
    await cleanup(ctx, udd, serverCtx.server);
  }
});

test('综合 → 学习：自动立即切换后显示页面角标', async () => {
  const serverCtx = await startServer();
  const { ctx, sw, udd } = await createContext('composite');
  try {
    const page = await ctx.newPage();
    await page.goto(serverCtx.studyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.bringToFront();
    await page.waitForTimeout(500);
    await forceMode(sw, page, 'composite');
    expect(await getMode(sw)).toBe('composite');

    const result = await triggerAutoTransition(sw, page, 0);
    expect(result.success).toBeTruthy();
    expect(result.tabUrl).toBe(page.url());
    expect(await getMode(sw)).toBe('study');

    await expect.poll(() => bannerText(page), { timeout: 5000 }).toContain('你正在打开学习网站');
    await expect.poll(() => bannerText(page), { timeout: 5000 }).toContain('即将进入学习模式');
    await expect.poll(() => bannerText(page), { timeout: 5000 }).toContain('今日剩余 不限');
    await expect.poll(() => hasRenderedModeNoticeTrace(sw), { timeout: 5000 }).toBe(true);
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

    const switchResponse = await sendRuntimeMessage(ctx, sw, page, 'SWITCH_TO_COMPOSITE');
    expect(await getMode(sw)).toBe('composite');
    expect(switchResponse.noticeRendered).toBe(true);
    await expect.poll(() => bannerText(page), { timeout: 5000 }).toContain('已进入综合模式');
    expect(await bannerText(page)).not.toContain('秒后进入综合时间');

    await expect.poll(() => bannerExists(page), { timeout: 8000 }).toBe(false);
    await page.close();
  } finally {
    await cleanup(ctx, udd, serverCtx.server);
  }
});

test('Rest Exit Grace 生效时访问未归类目标自动回 Rest 且不弹 Reminder', async () => {
  const serverCtx = await startServer();
  const { ctx, sw, udd } = await createContext('study');
  try {
    const page = await ctx.newPage();
    await page.goto(serverCtx.studyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.bringToFront();
    await page.waitForTimeout(500);

    const nowMs = Date.now();
    await setModeSession(sw, {
      currentMode: 'study',
      currentModeStartedAtMs: nowMs - 30_000,
      restExitGraceUntilMs: nowMs + 30_000,
    });

    const result = await triggerAutoTransition(sw, page, 0);
    expect(result.success).toBeTruthy();
    expect(result.blockedStart || result.blockedEnd).toBeFalsy();
    expect(await getMode(sw)).toBe('rest');
    expect(page.url()).not.toContain('reminder.html');
    await expect.poll(() => bannerText(page), { timeout: 5000 }).toContain('已临时回到休息时间');
    await page.close();
  } finally {
    await cleanup(ctx, udd, serverCtx.server);
  }
});

test('Rest Exit Grace 过期后即使 currentModeStartedAtMs 很新也必须弹 Reminder', async () => {
  const serverCtx = await startServer();
  const { ctx, sw, udd } = await createContext('composite');
  try {
    const page = await ctx.newPage();
    await page.goto(serverCtx.studyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.bringToFront();
    await page.waitForTimeout(500);

    const nowMs = Date.now();
    await setModeSession(sw, {
      currentMode: 'composite',
      currentModeStartedAtMs: nowMs,
      restExitGraceUntilMs: nowMs - 1000,
    });

    const result = await triggerAutoTransition(sw, page, 0);
    expect(result.success).toBeTruthy();
    expect(result.blockedStart || result.blockedEnd).toBeTruthy();
    expect(await getMode(sw)).toBe('composite');
    await expect.poll(() => page.url(), { timeout: 5000 }).toContain('reminder.html');
    await page.close();
  } finally {
    await cleanup(ctx, udd, serverCtx.server);
  }
});

test('普通 tabActivated 切换到学习页时无需刷新即可显示提示', async () => {
  const serverCtx = await startServer();
  const { ctx, sw, udd } = await createContext('composite');
  try {
    const compositePage = await ctx.newPage();
    await compositePage.goto(serverCtx.compositeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const studyPage = await ctx.newPage();
    await studyPage.goto(serverCtx.studyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await studyPage.waitForTimeout(500);

    const studyTabId = await tabIdForPage(sw, studyPage);
    await sw.evaluate(async ({ studyTabId }) => {
      if (Number.isInteger(studyTabId)) {
        await chrome.tabs.sendMessage(studyTabId, {
          type: 'AUTO_MODE_PENDING_CANCEL',
          reason: 'test_reset',
        }, { frameId: 0 }).catch(() => {});
      }
      await chrome.storage.local.set({
        guardian_session: { currentMode: 'composite' },
      });
    }, { studyTabId });

    await compositePage.bringToFront();
    await compositePage.waitForTimeout(300);
    await studyPage.bringToFront();

    await expect.poll(() => getMode(sw), { timeout: 5000 }).toBe('study');
    await expect.poll(() => bannerText(studyPage), { timeout: 5000 }).toContain('学习');

    await compositePage.close();
    await studyPage.close();
  } finally {
    await cleanup(ctx, udd, serverCtx.server);
  }
});

test('CONTENT_SCRIPT_READY 只恢复未渲染提示，已渲染提示刷新后不重复', async () => {
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
    await page.waitForTimeout(1000);
    expect(await bannerExists(page)).toBe(false);

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

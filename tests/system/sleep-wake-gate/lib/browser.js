// lib/browser.js — 扩展上下文启动器（复用现有 E2E 的 launchPersistentContext 模式）

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '../../../..');

async function _launchInternal(userDataDir, shouldClean) {
  if (shouldClean && fs.existsSync(userDataDir)) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const launchOpts = {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  };

  let browserCtx;
  try {
    browserCtx = await chromium.launchPersistentContext(userDataDir, launchOpts);
  } catch (err) {
    const msg = String(err?.message || err);
    const shouldFallback = msg.includes('Target page, context or browser has been closed')
      || msg.includes('exitCode=21')
      || msg.includes('Browser logs:');
    if (!shouldFallback) throw err;
    browserCtx = await chromium.launchPersistentContext(userDataDir, {
      ...launchOpts,
      channel: 'chrome',
    });
  }

  const launchStartedAt = Date.now();
  let sw = browserCtx.serviceWorkers()[0];
  let swObservedAt = sw ? Date.now() : null;
  if (!sw) {
    try {
      sw = await browserCtx.waitForEvent('serviceworker', { timeout: 30000 });
    } catch {
      const start = Date.now();
      while (Date.now() - start < 30000) {
        const workers = browserCtx.serviceWorkers();
        if (workers.length > 0) {
          sw = workers[0];
          swObservedAt = Date.now();
          break;
        }
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  if (!sw) {
    throw new Error('Service Worker 未在 30 秒内启动；扩展可能加载失败');
  }

  const extensionId = new URL(sw.url()).hostname;
  if (!swObservedAt) swObservedAt = Date.now();
  const forceReload = process.env.TOC_FORCE_EXTENSION_RELOAD === '1';
  if (forceReload) {
    try {
      await sw.evaluate(() => {
        chrome.runtime.reload();
      });
    } catch (_) {
      // SW may terminate immediately on reload; ignore and wait for next worker.
    }

    let reloadedSw = null;
    const started = Date.now();
    while (Date.now() - started < 30000) {
      const workers = browserCtx.serviceWorkers();
      reloadedSw = workers.find((w) => {
        try {
          return new URL(w.url()).hostname === extensionId;
        } catch {
          return false;
        }
      });
      if (reloadedSw) break;
      try {
        const next = await browserCtx.waitForEvent('serviceworker', { timeout: 2000 });
        if (new URL(next.url()).hostname === extensionId) {
          reloadedSw = next;
          break;
        }
      } catch {
        // keep polling
      }
    }
    if (reloadedSw) sw = reloadedSw;
  }

  return {
    browserCtx,
    sw,
    extensionId,
    userDataDir,
    extensionPath: EXTENSION_PATH,
    launchStartedAt,
    swObservedAt,
  };
}

/**
 * 启动带扩展的 Chrome 持久上下文
 * @param {string} userDataDir — Chrome 用户数据目录
 * @param {boolean} clean — 启动前是否清理目录（默认 true）
 * @returns {Promise<{ browserCtx, sw, extensionId, userDataDir }>}
 */
async function launchExtensionContext(userDataDir, clean = true) {
  return _launchInternal(userDataDir, clean);
}

/**
 * 使用已有 userDataDir 重新启动 Chrome（保留扩展状态）
 * @param {string} userDataDir — 已存在的 Chrome 用户数据目录
 * @returns {Promise<{ browserCtx, sw, extensionId, userDataDir }>}
 */
async function relaunchExtensionContext(userDataDir) {
  return _launchInternal(userDataDir, false);
}

/**
 * 关闭浏览器上下文并清理
 * @param {Object} browserCtx — Playwright BrowserContext
 * @param {string} userDataDir — 用户数据目录（可选清理）
 * @param {boolean} cleanup — 是否删除 userDataDir
 */
async function closeContext(browserCtx, userDataDir, cleanup = true) {
  await browserCtx.close();
  if (cleanup && userDataDir && fs.existsSync(userDataDir)) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

/**
 * 通过扩展 ID 打开扩展内部页面
 * @param {Object} browserCtx — Playwright BrowserContext
 * @param {string} extensionId — 扩展 ID
 * @param {string} relPath — 相对路径，如 'popup/popup.html'
 * @returns {Promise<Object>} — Playwright Page
 */
async function openExtensionPage(browserCtx, extensionId, relPath) {
  const page = await browserCtx.newPage();
  const url = `chrome-extension://${extensionId}/${relPath}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1500);
  return page;
}

module.exports = {
  launchExtensionContext,
  relaunchExtensionContext,
  closeContext,
  openExtensionPage,
};

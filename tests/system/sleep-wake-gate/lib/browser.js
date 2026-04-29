// lib/browser.js — 扩展上下文启动器（复用现有 E2E 的 launchPersistentContext 模式）

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '../../../..');

/**
 * 启动带扩展的 Chrome 持久上下文
 * @param {string} userDataDir — Chrome 用户数据目录
 * @returns {Promise<{ browserCtx, sw, extensionId, userDataDir }>}
 */
async function launchExtensionContext(userDataDir) {
  if (fs.existsSync(userDataDir)) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
  fs.mkdirSync(userDataDir, { recursive: true });

  const browserCtx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  });

  let sw = browserCtx.serviceWorkers()[0];
  if (!sw) {
    try {
      sw = await browserCtx.waitForEvent('serviceworker', { timeout: 30000 });
    } catch {
      // 备选：轮询已存在的 service workers
      const start = Date.now();
      while (Date.now() - start < 30000) {
        const workers = browserCtx.serviceWorkers();
        if (workers.length > 0) {
          sw = workers[0];
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

  return { browserCtx, sw, extensionId, userDataDir };
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
  closeContext,
  openExtensionPage,
};

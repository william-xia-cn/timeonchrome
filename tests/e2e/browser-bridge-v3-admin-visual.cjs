// Local mock-only visual check; never logs in or reads household browser data.
'use strict';

const { chromium } = require('@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [label, viewport] of Object.entries({
      desktop: { width: 1440, height: 900 },
      mobile: { width: 390, height: 844 },
    })) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
      const html = path.join(__dirname, '../../extension/admin/admin.html');
      await page.goto(pathToFileURL(html).href);
      await page.evaluate(() => {
        document.querySelector('#login-screen').style.display = 'none';
        // Match the authenticated code path in admin.js; flex would create a false mobile failure.
        document.querySelector('#main-screen').style.display = 'block';
        document.querySelectorAll('.page').forEach((element) => element.classList.remove('active'));
        document.querySelector('#page-system-management').classList.add('active');
        document.querySelector('#native-host-status-card').hidden = false;
        document.querySelector('#native-host-status').textContent = '未检测到本地组件。网页计时、现有配额与云端同步仍可正常运行。';
        document.querySelector('#sync-status').textContent = '测试数据：云端同步状态正常';
      });
      await page.screenshot({
        path: path.join(__dirname, `../../output/playwright/browser-bridge-v3-admin-${label}.png`),
        fullPage: true,
      });
      const card = page.locator('#native-host-status-card');
      if (!(await card.isVisible())) throw new Error(`${label}: Host status card not visible`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

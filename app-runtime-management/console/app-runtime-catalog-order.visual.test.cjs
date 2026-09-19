const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const output = path.resolve('test-results', 'app-runtime-catalog-order');
  await fs.mkdir(output, { recursive: true });

  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
    await page.goto(`${pathToFileURL(path.resolve(__dirname, 'index.html')).href}?mock=1`);
    if (viewport.name === 'mobile') {
      await page.locator('[data-view="apps"]').evaluate((element) => element.click());
    } else {
      await page.locator('[data-view="apps"]').click();
    }
    const groups = await page.locator('.app-directory-card > .app-origin-group').evaluateAll((elements) => elements.map((element) => {
      const heading = element.querySelector('h3') || element.querySelector('summary span');
      return heading?.textContent?.trim();
    }));
    assert.deepEqual(groups, ['普通应用', '游戏', '系统工具']);
    assert.equal(await page.locator('#system-tool-group').getAttribute('open'), null);
    if (viewport.name === 'mobile') {
      await page.locator('.app-directory-card').screenshot({ path: path.join(output, `${viewport.name}.png`) });
    } else {
      await page.screenshot({ path: path.join(output, `${viewport.name}.png`), fullPage: true });
    }
    await page.close();
  }

  await browser.close();
  console.log('PASS: catalog groups render in ordinary application, game, system tool order on desktop and mobile');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

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
    assert.equal(await page.locator('#managed-app-list .product-record').count(), 0, 'inactive app view must not eagerly render product rows');
    if (viewport.name === 'mobile') {
      await page.locator('[data-view="apps"]').evaluate((element) => element.click());
    } else {
      await page.locator('[data-view="apps"]').click();
    }
    const groups = await page.locator('.app-directory-card > .app-origin-group').evaluateAll((elements) => elements.map((element) => {
      const heading = element.querySelector('h3') || element.querySelector('summary span');
      return heading?.textContent?.trim();
    }));
    assert.deepEqual(groups, ['普通应用', '游戏', '系统应用']);
    assert.notEqual(await page.locator('#ordinary-app-group').getAttribute('open'), null);
    assert.notEqual(await page.locator('#game-app-group').getAttribute('open'), null);
    assert.equal(await page.locator('#system-tool-group').getAttribute('open'), null);
    await page.locator('[data-app-category="restrictedEntertainment"]').click();
    assert.match(await page.locator('#game-app-list').innerText(), /Game Bar.*游戏工具 · 受限娱乐/s);
    assert.equal(await page.locator('#system-tool-list .product-record').count(), 0, 'collapsed system tool group must not render rows');
    assert.equal(await page.locator('#processed-records .product-record').count(), 0, 'collapsed processed history must not render rows');
    await page.locator('#ordinary-app-group summary').click();
    assert.equal(await page.locator('#ordinary-app-group').getAttribute('open'), null);
    assert.equal(await page.locator('#managed-app-list .product-record').count(), 0, 'collapsed ordinary group must not render rows');
    await page.locator('#ordinary-app-group summary').click();
    assert.notEqual(await page.locator('#ordinary-app-group').getAttribute('open'), null);
    await page.locator('#game-app-group summary').click();
    assert.equal(await page.locator('#game-app-group').getAttribute('open'), null);
    assert.equal(await page.locator('#game-app-list .product-record').count(), 0, 'collapsed game group must not render rows');
    await page.locator('[data-app-category="composite"]').click();
    await page.locator('#app-search').fill('快速助手');
    await page.waitForTimeout(150);
    assert.notEqual(await page.locator('#system-tool-group').getAttribute('open'), null, 'search match must expand system tools');
    assert.equal(await page.locator('#system-tool-list .product-record').count(), 1);
    assert.match(await page.locator('#system-tool-list').innerText(), /快速助手.*系统应用 · 复合/s);
    await page.locator('#app-search').fill('');
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#system-tool-group').getAttribute('open'), null, 'clearing search must restore user expansion state');
    if (viewport.name === 'mobile') {
      await page.locator('.app-directory-card').screenshot({ path: path.join(output, `${viewport.name}.png`) });
    } else {
      await page.screenshot({ path: path.join(output, `${viewport.name}.png`), fullPage: true });
    }
    await page.close();
  }

  await browser.close();
  console.log('PASS: catalog groups render in ordinary application, game, system application order on desktop and mobile');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

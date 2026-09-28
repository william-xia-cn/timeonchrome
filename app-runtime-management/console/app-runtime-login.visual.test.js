const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

// 完全隔离的跨源导航夹具：所有请求均截获，不访问真实账号或 API。
(async () => {
  const browser = await chromium.launch({ headless: true });
  const origin = 'https://runtime.example.test';
  const output = path.resolve('.wrangler/login-loop-visual');
  await fs.mkdir(output, { recursive: true });
  try {
    for (const scenario of ['network', 'network-recovers', '401-loop', '401-recovers', 'ticket-fails']) {
      const context = await browser.newContext();
      const page = await context.newPage();
      let redirects = 0;
      let exchanges = 0;
      const counts = new Map();
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) {
          const file = path.basename(url.pathname === '/' ? 'index.html' : url.pathname);
          return route.fulfill({ path: path.join(__dirname, file) });
        }
        if (url.origin === 'https://timeonchrome-console.pages.dev') {
          redirects++;
          assert.ok(redirects <= 1, 'must never loop');
          return route.fulfill({ status: 200, contentType: 'text/html', body: `<script>location.replace('${origin}/#ticket=mock-new-ticket')</script>` });
        }
        assert.equal(url.origin, 'https://timeonchrome-app-runtime-api.william-xia-cn.workers.dev');
        if (url.pathname === '/v2/auth/browser-sessions') {
          exchanges++;
          return route.fulfill({ status: scenario === 'ticket-fails' ? 401 : 201,
            json: scenario === 'ticket-fails' ? { error: { message: '登录凭据无效或已过期' } } : {
              token: `mock-token-${exchanges}`, expiresAt: Date.now() + 3600000,
              children: [{ id: 'mock-child', name: '测试孩子' }],
            } });
        }
        if (route.request().method() === 'DELETE') return route.fulfill({ json: {} });
        const count = (counts.get(url.pathname) || 0) + 1;
        counts.set(url.pathname, count);
        if (scenario === 'network' || (scenario === 'network-recovers' && count === 1)) return route.abort('failed');
        if (scenario === '401-loop' || (scenario === '401-recovers' && exchanges === 1))
          return route.fulfill({ status: 401, json: { error: { message: 'unauthorized' } } });
        return route.fulfill({ json: { machines: [], items: [], technicalItems: [],
          classificationRecords: { pending: [], processed: [], technical: [] },
          applications: [], categories: [], buckets: [], totalDurationMs: 0 } });
      });
      await page.goto(`${origin}/#ticket=mock-ticket`);
      const success = scenario.endsWith('recovers');
      if (success) await page.waitForFunction(() => !document.querySelector('main').classList.contains('initial-load-pending') && document.querySelector('#load-empty-state').hidden);
      else {
        await page.locator('#load-empty-state').waitFor({ state: 'visible' });
        const expected = scenario === 'network' ? /暂时无法连接/ : scenario === '401-loop' ? /登录恢复失败/ : /登录凭据无效/;
        await page.waitForFunction(pattern => new RegExp(pattern).test(document.querySelector('#load-empty-message').textContent), expected.source);
        assert.equal(await page.locator('#load-empty-state a').isVisible(), true);
        assert.equal(await page.locator('#initial-load-retry').isVisible(), true);
      }
      assert.equal(redirects, scenario.startsWith('401') ? 1 : 0);
      const marker = await page.evaluate(() => sessionStorage.getItem('timeonchrome_runtime_auth_recovery_v1'));
      assert.equal(marker, scenario === '401-loop' ? '1' : null);
      assert.equal(new URL(page.url()).hash, '');
      if (scenario.startsWith('network')) assert.ok([...counts.values()].every(count => count === 2));
      if (scenario === '401-loop' || scenario === 'network') {
        for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
          await page.setViewportSize(viewport);
          if (viewport.width < 720) await page.waitForFunction(() => document.querySelector('#sidebar').getBoundingClientRect().right <= 0);
          await page.screenshot({ path: path.join(output, `${scenario}-${viewport.width}.png`), fullPage: true });
        }
      }
      console.log(`PASS ${scenario}: redirects=${redirects}, exchanges=${exchanges}`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

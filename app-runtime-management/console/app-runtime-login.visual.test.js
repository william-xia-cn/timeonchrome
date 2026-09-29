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
    for (const scenario of ['network', 'network-recovers', '401-loop', '401-recovers', 'ticket-fails', 'usage-fails', 'usage-pending', 'catalog-fails']) {
      const context = await browser.newContext();
      const page = await context.newPage();
      let redirects = 0;
      let exchanges = 0;
      const counts = new Map();
      let finishUsage;
      const pendingUsage = new Promise(resolve => { finishUsage = resolve; });
      let usageFails = true;
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
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
        if (url.pathname === '/v2/module/app-usage') {
          if (scenario === 'usage-pending' && count === 1) await pendingUsage;
          if (scenario === 'usage-fails' && usageFails) return route.fulfill({ status: 500, json: { error: { message: '服务暂时无法完成请求，请稍后重试。' } } });
        }
        if (scenario === 'catalog-fails' && url.pathname === '/v2/module/app-catalog')
          return route.fulfill({ status: 500, json: { error: { message: '目录暂不可用' } } });
        if (scenario === 'catalog-fails' && url.pathname === '/v2/module/machines')
          return route.fulfill({ json: { machines: [{ id: 'machine-1', displayName: '测试电脑', platform: 'windows', status: 'online', serviceVersion: '2.6.10' }] } });
        if (scenario === 'catalog-fails' && url.pathname === '/v2/module/machines/machine-1/users')
          return route.fulfill({ json: { users: [{ localUserId: 'local-1', displayName: '本机账户', protected: true, childId: 'mock-child' }] } });
        if (scenario === 'network' || (scenario === 'network-recovers' && count === 1)) return route.abort('failed');
        if (scenario === '401-loop' || (scenario === '401-recovers' && exchanges === 1))
          return route.fulfill({ status: 401, json: { error: { message: 'unauthorized' } } });
        return route.fulfill({ json: { machines: [], items: [], technicalItems: [],
          classificationRecords: { pending: [], processed: [], technical: [] },
          applications: [], categories: [], buckets: [], totalDurationMs: 0 } });
      });
      await page.goto(`${origin}/#ticket=mock-ticket`);
      const success = scenario.endsWith('recovers') || scenario.startsWith('usage-') || scenario === 'catalog-fails';
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
      if (scenario.startsWith('usage-')) {
        assert.equal(await page.locator('#total-time').textContent(), '—');
        await page.locator('[data-view="devices"]').click();
        assert.equal(await page.locator('#add-machine').isVisible(), true);
        await page.locator('[data-view="usage"]').click();
        for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
          await page.setViewportSize(viewport);
          if (viewport.width < 720) await page.waitForFunction(() => document.querySelector('#sidebar').getBoundingClientRect().right <= 0);
          await page.screenshot({ path: path.join(output, `${scenario}-${viewport.width}.png`), fullPage: true });
        }
        if (scenario === 'usage-fails') {
          usageFails = false;
          await page.locator('#retry-usage').click();
        } else finishUsage();
        await page.waitForFunction(() => document.querySelector('#total-time').textContent === '0 分钟');
        assert.equal(counts.get('/v2/module/machines'), 1, 'usage retry must not reload devices');
        assert.deepEqual(pageErrors, []);
      }
      if (scenario === 'catalog-fails') {
        await page.locator('[data-view="devices"]').click();
        await page.locator('[data-open-machine]').click();
        assert.equal(await page.locator('#drawer-content').getByText('本机账户').isVisible(), true);
        await page.locator('.drawer-close').click();
        await page.locator('#refresh').click();
        await page.waitForFunction(() => !document.querySelector('#refresh').disabled);
        assert.equal(counts.get('/v2/module/machines'), 2);
        assert.equal(counts.get('/v2/module/machines/machine-1/users'), 2);
        assert.equal(counts.get('/v2/module/app-catalog') || 0, 0, 'device refresh must not query catalog');
        assert.equal(await page.locator('#status-strip').isVisible(), false);
        await page.locator('[data-view="apps"]').click();
        await page.locator('#status-strip.error').waitFor({ state: 'visible' });
        await page.locator('[data-view="devices"]').click();
        assert.equal(await page.locator('#status-strip').isVisible(), false);
        assert.equal(await page.locator('[data-open-machine]').count(), 1);
        await page.screenshot({ path: path.join(output, 'catalog-fails-devices-1440.png'), fullPage: true });
        assert.deepEqual(pageErrors, []);
      }
      if (scenario.startsWith('network')) assert.equal(counts.get('/v2/module/machines'), 2, 'failed machine GET retries once');
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

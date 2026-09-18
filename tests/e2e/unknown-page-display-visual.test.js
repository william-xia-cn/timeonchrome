// Display-only mock acceptance; this is not a real browser accounting test.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, '.tmp/visual-unknown-page');

const row = {
  key: 'fallback:domain:unknown-page.chrome-local', label: 'unknown-page.chrome-local', fallbackDomain: 'unknown-page.chrome-local',
  category: 'composite', categoryLabel: '待归类', targetClassificationAtTime: 'composite', isFallback: true,
  todaySeconds: 1450, weekSeconds: 1726, rangeSeconds: 1450, status: '借用休息配额',
  displayQuotaBuckets: { today: { rest: 1443, study: 7 }, week: { rest: 1719, study: 7 }, range: { rest: 1443, study: 7 } },
  firstSeenAt: '2026-09-15T00:00:00Z', lastSeenAt: '2026-09-15T01:00:00Z',
};
const view = {
  kind: 'web', range: { mode: 'day', from: '2026-09-15', to: '2026-09-15', label: '2026-09-15' },
  totalSeconds: 1510, categoryTotals: { study: 60, composite: 1450, rest: 0, other: 0 },
  targetRows: [row, { key: 'bilibili.com', label: 'bilibili.com', category: 'rest', categoryLabel: '休息', todaySeconds: 60, weekSeconds: 60, rangeSeconds: 60, status: '已限制' }],
  categoryRows: [], weekSummarySeries: [], chartSeries: [],
};

for (const surface of ['pages', 'admin']) {
  test(`${surface}: unknown-page display on desktop and mobile`, async ({ page }) => {
    fs.mkdirSync(output, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    if (surface === 'pages') {
      await page.goto(pathToFileURL(path.join(root, 'pages/index.html')).href);
      await page.evaluate(() => {
        showScreen('main');
        document.querySelectorAll('.page').forEach(node => node.classList.remove('active'));
        document.getElementById('page-stats').classList.add('active');
        cloudUsageState.listMode = 'targets';
        cloudUsageState.query = '';
      });
      await page.evaluate(v => renderCloudUsageView(v), view);
    } else {
      const html = fs.readFileSync(path.join(root, 'extension/admin/admin.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
      await page.route('https://display.test/**', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/admin/admin.html') return route.fulfill({ contentType: 'text/html', body: html });
        const asset = path.join(root, 'extension', url.pathname);
        return fs.existsSync(asset) ? route.fulfill({ path: asset }) : route.abort();
      });
      await page.goto('https://display.test/admin/admin.html');
      const source = fs.readFileSync(path.join(root, 'extension/admin/admin.js'), 'utf8');
      const functions = source.slice(source.indexOf('function usageCategoryLabel('), source.indexOf('async function renderStatsPage()', source.indexOf('function usageCategoryLabel(')));
      await page.addScriptTag({ content: `
        let usageAnalysisState = { listMode: 'targets', query: '', detail: null };
        let usageAnalysisLastView;
        const DAY_NAMES = ['周日','周一','周二','周三','周四','周五','周六'];
        const escHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
        const escAttr = escHtml;
        const formatSeconds = seconds => seconds < 60 ? seconds + '秒' : Math.floor(seconds / 60) + '分';
        ${functions}
      ` });
      await page.evaluate(v => {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('main-screen').style.display = 'block';
        document.querySelectorAll('.page').forEach(node => node.classList.remove('active'));
        document.getElementById('page-stats').classList.add('active');
        renderUsageAnalysisView(v);
      }, view);
    }
    const table = page.locator(surface === 'pages' ? '#cloud-usage-table' : '#usage-analysis-table-wrap');
    const detail = page.locator(surface === 'pages' ? '#cloud-usage-detail' : '#usage-analysis-detail');
    await expect(table).toContainText('未识别页面');
    await expect(table).not.toContainText('借用休息配额');
    await expect(table).toContainText('用量说明');
    await expect(table).toContainText('单站点限额');
    await table.getByText('未识别页面', { exact: true }).click();
    await expect(detail).toContainText('unknown-page.chrome-local');
    await expect(detail).toContainText('休息用量');
    await expect(detail).toContainText('学习用量 7秒');
    await expect(detail).toContainText('08:00:00');
    await detail.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `${surface}-desktop.png`) });
    await page.setViewportSize({ width: 390, height: 844 });
    await detail.scrollIntoViewIfNeeded();
    await expect(detail).toBeVisible();
    expect(await detail.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: path.join(output, `${surface}-mobile.png`) });
    const pageFits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    if (surface === 'pages') expect(pageFits).toBe(true);
    else {
      // Known pre-existing Admin mobile gate remains separate and unresolved.
      test.info().annotations.push({ type: 'known-mobile-layout', description: pageFits ? 'No overflow in this fixture; known gate not closed' : 'Existing page-wide overflow remains unresolved' });
    }

    const mixed = {
      key: 'mixed', label: 'example.com', category: 'composite', targetClassificationAtTime: 'composite',
      todaySeconds: 3000, weekSeconds: 4800, rangeSeconds: 3000,
      displayUsageBreakdown: {
        range: { pending_composite: { composite: 600, rest: 300 }, composite: { composite: 1200, rest: 900 } },
        today: { pending_composite: { composite: 600, rest: 300 }, composite: { composite: 1200, rest: 900 } },
        week: { pending_composite: { composite: 600, rest: 300 }, composite: { composite: 1200, rest: 2700 } },
      },
    };
    const rows = [mixed, ...['study', 'restricted', 'blocked'].map(classification => ({
      key: classification, label: `${classification}.example.com`, rangeSeconds: 60, todaySeconds: 60, weekSeconds: 60,
      displayUsageBreakdown: { range: { [classification]: { study: 60 } }, today: { [classification]: { study: 60 } }, week: { [classification]: { study: 60 } } },
    }))];
    await page.evaluate(({ v, rows, surface }) => {
      if (surface === 'pages') {
        cloudUsageState.detail = null;
        renderCloudUsageView({ ...v, targetRows: rows });
      } else {
        usageAnalysisState.detail = null;
        renderUsageAnalysisView({ ...v, targetRows: rows });
      }
    }, { v: view, rows, surface });
    await expect(table).toContainText('复合/待归类 · 部分借用休息配额');
    await expect(table).toContainText('其中 20分借用休息配额');
    await expect(table).toContainText('受限娱乐');
    await expect(table).toContainText('黑名单');
    await expect(table).not.toContainText('已限制');
    await table.getByText('example.com', { exact: true }).click();
    await expect(detail).toContainText('待归类：复合用量 10分、休息用量 5分');
    await expect(detail).toContainText('复合：复合用量 20分、休息用量 15分');
    await expect(detail).toContainText('休息用量 45分');
    for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
      await page.setViewportSize(viewport);
      await detail.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `${surface}-explanation-${name}.png`) });
      expect(await detail.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    }

    await page.evaluate(({ v, rows, surface }) => {
      const media = { ...v, kind: 'media', targetRows: rows.map(row => ({ ...row, categoryLabel: '前台视频' })) };
      if (surface === 'pages') renderCloudUsageView(media);
      else renderUsageAnalysisView(media);
    }, { v: view, rows, surface });
    await expect(table).toContainText('独立媒体统计，不计网页配额');
    await expect(table).not.toContainText('借用休息配额');

    if (surface === 'admin') {
      const readModel = fs.readFileSync(path.join(root, 'extension/stats/admin-read-model.js'), 'utf8')
        .replace(/export\s+(?=(?:async\s+)?function|const)/g, '');
      const model = new Function(readModel + '\nreturn { targetRowsForAnalysis, mediaRowsForAnalysis };')();
      const week = ['2026-09-14'];
      const emptyDay = ['2026-09-16'];
      const webRows = model.targetRowsForAnalysis({ '2026-09-14': { targets: { earlier: {
        managedTargetValue: 'earlier.example.com', targetClassificationAtTime: 'composite',
        activeSeconds: 1800, activeByQuotaBucket: { rest: 1800 },
      } } } }, emptyDay[0], week, emptyDay, {}, {});
      const mediaRows = model.mediaRowsForAnalysis({ '2026-09-14': { domains: {
        'earlier.example.com': { totalSeconds: 1800, foregroundVideoSeconds: 1800 },
      } } }, emptyDay[0], week, emptyDay);
      for (const [kind, targetRows] of [['web', webRows], ['media', mediaRows]]) {
        await page.evaluate(({ kind, targetRows, v }) => {
          usageAnalysisState.detail = null;
          renderUsageAnalysisView({ ...v, kind, totalSeconds: 0, categoryTotals: {}, targetRows,
            range: { mode: 'day', from: '2026-09-16', to: '2026-09-16', label: '2026-09-16' } });
        }, { kind, targetRows, v: view });
        await expect(table).toContainText('0秒');
        await expect(table).toContainText('30分');
        await table.getByText('earlier.example.com', { exact: true }).click();
        await expect(detail).toContainText(/当前范围\s*0秒/);
        await expect(detail).toContainText(/本周时间\s*30分/);
        for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
          await page.setViewportSize(viewport);
          await detail.scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(output, `admin-empty-range-${kind}-${name}.png`) });
        }
      }
    }
  });
}

// Read-only Pages mock visual verification, not a real accounting acceptance.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, '.tmp/visual-unclassified-usage');

test('unclassified usage metrics, sorting and collapsed evidence on desktop/mobile', async ({ page }) => {
  fs.mkdirSync(output, { recursive: true });
  await page.route('https://**', route => route.abort());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(pathToFileURL(path.join(root, 'pages/index.html')).href);
  await page.evaluate(() => {
    showScreen('main');
    currentProfileId = 'visual-profile';
    document.querySelectorAll('.page').forEach(node => node.classList.remove('active'));
    document.getElementById('page-review').classList.add('active');
    const period = shanghaiWeekDateRange();
    const rows = [
      { date: period.to, label: 'research.example.com', channel: 'active', duration: 3600 },
      { date: period.from, label: 'research.example.com', channel: 'active', duration: 1800 },
      { date: period.to, label: 'another.example.com', channel: 'active', duration: 60 },
    ];
    unclassifiedUsageDisplay = { ...buildUnclassifiedUsageDisplay(rows, period), profileId: currentProfileId };
    const site = { domain: 'research.example.com', totalSeconds: 5400, firstSeenAt: Date.now() - 3600000, lastSeenAt: Date.now(), visitCount: 12 };
    const request = { displayValue: site.domain, requestedNormalizedValue: site.domain, requestedTargetType: 'host', status: 'pending', recordSource: 'auto_unclassified_access', firstObservedAt: Date.now() - 7200000, lastObservedAt: Date.now(), observationCount: 3, deviceId: 'visual-device-long-identifier-00000000-0000-0000-0000-000000000000' };
    const entries = [
      { value: 'another.example.com', title: 'another.example.com', site: { totalSeconds: 60 } },
      { value: site.domain, title: site.domain, site },
      { value: 'processed.example.com', title: 'processed.example.com', site: { historicalPending: true, currentClassification: 'study' } },
    ];
    document.getElementById('review-used-unclassified-container').innerHTML = renderUnclassifiedUsageRecords([request], entries);
  });
  const list = page.locator('#review-used-unclassified-container');
  const first = list.locator('.rules-site-row-wrap').first();
  await expect(first).toContainText('research.example.com');
  await expect(first.locator('.unclassified-usage-metrics')).toContainText('今日使用时长');
  await expect(first.locator('.unclassified-usage-metrics')).toContainText('本周时长');
  await expect(first.locator('.unclassified-usage-metrics')).toContainText('累计时长');
  await expect(list).toContainText('默认先按今日、再按本周、最后按近30天累计使用时长降序排列');
  await expect(first.getByText('归为学习网站', { exact: true })).toBeVisible();
  const details = first.locator('.unclassified-visit-details');
  await expect(details).not.toHaveAttribute('open', '');
  await expect(details.getByText(/终端 visual-device/)).toBeHidden();
  await expect(list.locator('.record-history-details')).not.toHaveAttribute('open', '');
  await list.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await list.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await first.locator('.unclassified-usage-metrics').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
  await details.locator('summary').click();
  await expect(details).toContainText('归类记录');
  await expect(details).toContainText('使用统计（原发现记录）');
  await expect(details).toContainText('顶层导航 3 次');
  await expect(details).toContainText('统计分段 12 条');
  expect(await details.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: path.join(output, 'mobile-details.png'), fullPage: true });
});

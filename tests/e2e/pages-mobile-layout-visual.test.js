// Visual verification for the Pages mobile interaction layout.
// Run with: npx playwright test tests/e2e/pages-mobile-layout-visual.test.js --reporter=line

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT = path.join(ROOT, '.tmp', 'visual-pages-mobile-layout');
const PAGE_URL = pathToFileURL(path.join(ROOT, 'pages', 'index.html')).href;

async function openMockConsole(page) {
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.evaluate(() => {
    showScreen('main');
    currentProfileId = 'profile-mobile';
    profiles = [{ id: currentProfileId, name: 'T.xia', avatar_color: '#2563eb' }];
    document.getElementById('current-profile-avatar').textContent = 'T';
    document.getElementById('current-profile-avatar').style.background = '#2563eb';
    document.getElementById('current-profile-name').textContent = 'T.xia';
    document.getElementById('account-email-display').textContent = 'parent@example.com';

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    remoteConfig = {
      domainQuotas: {},
      restConfig: { firstReminderMinutes: 120, repeatReminderMinutes: 60 },
      timeQuota: { daily: Object.fromEntries(days.map(day => [day, {
        studyMinutes: null,
        restMinutes: null,
        compositeMinutes: 10,
      }])) },
      timeWindows: { daily: Object.fromEntries(days.map(day => [day, {
        studyWindows: null,
        compositeWindows: [{ start: '00:00', end: '01:00' }, { start: '07:00', end: '24:00' }],
        restWindows: [{ start: '00:00', end: '01:00' }, { start: '07:00', end: '24:00' }],
      }])) },
    };
  });
}

async function showStats(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.page').forEach(node => node.classList.remove('active'));
    document.getElementById('page-stats').classList.add('active');
    document.querySelectorAll('.nav-item').forEach(node => node.classList.remove('active'));
    document.querySelector('.nav-item[data-page="stats"]').classList.add('active');
    document.getElementById('cloud-usage-total').textContent = '1小时 18分';
    document.getElementById('cloud-usage-sync-label').textContent = '同步于 今天 18:20';
    document.getElementById('cloud-usage-range-label').textContent = '2026-08-25 周二';
    document.getElementById('cloud-usage-week-chart').innerHTML = Array.from({ length: 7 }, (_, index) =>
      `<div class="usage-stack-slot"><div class="usage-stack-bar" style="height:${26 + index * 8}px"><div class="usage-stack-part study" style="height:62%"></div><div class="usage-stack-part composite" style="height:38%"></div></div><div class="usage-stack-label">${19 + index}</div></div>`
    ).join('');
    document.getElementById('cloud-usage-main-chart').innerHTML = Array.from({ length: 24 }, (_, index) =>
      `<div class="usage-stack-slot"><div class="usage-stack-bar" style="height:${index > 7 && index < 22 ? 18 + (index % 5) * 16 : 2}px"><div class="usage-stack-part ${index % 3 === 0 ? 'rest' : 'study'}" style="height:100%"></div></div><div class="usage-stack-label">${index}时</div></div>`
    ).join('');
    cloudUsageState.listMode = 'targets';
    cloudUsageState.query = '';
    renderCloudUsageList({
      targetColumnLabel: '管理对象',
      categoryColumnLabel: '分类',
      targetRows: [
        { key: 'bilibili.com', label: 'bilibili.com', category: 'rest', categoryLabel: '休息', todaySeconds: 2760, weekSeconds: 2760, limitLabel: '—', status: '受限娱乐' },
        { key: 'wikipedia.org', label: 'wikipedia.org', category: 'composite', categoryLabel: '待归类', todaySeconds: 2100, weekSeconds: 2100, limitLabel: '—', status: '借用休息配额' },
        { key: 'deepseek.com', label: 'deepseek.com', category: 'study', categoryLabel: '学习', todaySeconds: 660, weekSeconds: 660, limitLabel: '—', status: '正常' },
      ],
      categoryRows: [],
    });
  });
}

async function showRulesPanel(page, panel) {
  await page.evaluate((targetPanel) => {
    document.querySelectorAll('.page').forEach(node => node.classList.remove('active'));
    document.getElementById('page-rules').classList.add('active');
    document.querySelectorAll('.nav-item').forEach(node => node.classList.remove('active'));
    document.querySelector('.nav-item[data-page="rules"]').classList.add('active');
    cloudRulesManagementActiveTab = targetPanel;
    syncRulesManagementTabs();
    if (targetPanel === 'quota') renderQuotaPage();
    if (targetPanel === 'schedule') renderSchedulePage();
  }, panel);
}

test('Pages has native mobile navigation and touch layouts without page overflow', async ({ page }) => {
  fs.mkdirSync(OUTPUT, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await openMockConsole(page);
  await showStats(page);

  await expect(page.locator('.sidebar-top')).toBeVisible();
  await expect(page.locator('.sidebar-nav')).toBeVisible();
  await expect(page.locator('#mobile-more-btn')).toBeVisible();
  await expect(page.locator('#cloud-usage-table .usage-analysis-table thead')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.evaluate(() => {
    const nav = document.querySelector('.sidebar-nav').getBoundingClientRect();
    const top = document.querySelector('.sidebar-top').getBoundingClientRect();
    return top.top === 0 && nav.bottom <= window.innerHeight + 1 && nav.bottom >= window.innerHeight - 1;
  })).toBe(true);
  await page.screenshot({ path: path.join(OUTPUT, 'pages-mobile-stats.png'), fullPage: true });

  await page.locator('#mobile-more-btn').click();
  await expect(page.locator('#mobile-more-overlay')).toHaveClass(/show/);
  await expect(page.locator('#mobile-system-management-btn')).toBeVisible();
  await page.screenshot({ path: path.join(OUTPUT, 'pages-mobile-more.png'), fullPage: true });
  await page.locator('#mobile-more-close').click();

  await showRulesPanel(page, 'quota');
  await expect(page.locator('.quota-daily-row')).toHaveCount(7);
  await expect(page.locator('#q-rest-reminder-enabled')).toBeChecked();
  await expect(page.locator('#q-rest-first-reminder')).toHaveValue('120');
  await expect(page.locator('#q-rest-repeat-reminder')).toHaveValue('60');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(OUTPUT, 'pages-mobile-quota.png'), fullPage: true });
  await page.locator('label[title="切换今日休息软限额提醒"]').click();
  await expect(page.locator('#q-rest-first-reminder')).toBeDisabled();
  await expect(page.locator('#q-rest-repeat-reminder')).toBeDisabled();
  await page.screenshot({ path: path.join(OUTPUT, 'pages-mobile-rest-reminder-disabled.png'), fullPage: true });

  await showRulesPanel(page, 'schedule');
  await expect(page.locator('.schedule-table tr').nth(1)).toBeVisible();
  await expect(page.locator('.schedule-table thead')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(OUTPUT, 'pages-mobile-schedule.png'), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await showStats(page);
  await expect(page.locator('.sidebar')).toHaveCSS('width', '220px');
  await expect(page.locator('#mobile-more-btn')).toBeHidden();
  await expect(page.locator('#cloud-usage-table .usage-analysis-table thead')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(OUTPUT, 'pages-desktop-stats.png'), fullPage: true });
  await showRulesPanel(page, 'quota');
  await expect(page.locator('.rest-reminder-fields')).toHaveCSS('grid-template-columns', /.+ .+/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(OUTPUT, 'pages-desktop-quota.png'), fullPage: true });
});

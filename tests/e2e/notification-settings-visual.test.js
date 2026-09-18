// Read-only Pages visual verification for D-097 notification settings.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, '.tmp/visual-notification-settings');

async function seedNotificationState(page) {
  await page.evaluate(() => {
    showScreen('main');
    currentProfileId = 'visual-profile';
    profiles = [{ id: currentProfileId, name: 'T.xia', avatar_color: '#ff7a18' }];
    remoteConfig = {};
    profileNotificationSettingsState = {
      profileId: currentProfileId,
      loading: false,
      settings: { enabled: true, thresholdMinutes: 30 },
    };
    accountNotificationSettingsState = {
      loading: false,
      loaded: true,
      accountEmail: 'parent@example.com',
      settings: {
        emailEnabled: true,
        telegramEnabled: true,
        telegramConnected: true,
        telegramConnectionStatus: 'connected',
        telegramBotUsername: 'TimeOnChromeGuardianBot',
      },
      capabilities: {
        emailAvailable: true,
        telegramAvailable: true,
        telegramBotUsername: 'TimeOnChromeGuardianBot',
      },
    };
  });
}

test('account notification channels render on desktop and mobile', async ({ page }) => {
  fs.mkdirSync(output, { recursive: true });
  await page.route('https://**', route => route.abort());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(pathToFileURL(path.join(root, 'pages/index.html')).href);
  await seedNotificationState(page);
  await page.evaluate(() => {
    document.querySelectorAll('.page').forEach(node => node.classList.remove('active'));
    document.getElementById('page-system-management').classList.add('active');
    cloudSystemManagementActiveTab = 'notifications';
    renderSystemManagementPage();
  });

  const panel = page.locator('[data-system-management-panel="notifications"]');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('账号消息通知');
  await expect(panel).toContainText('不需要填写 Chat ID');
  await expect(page.locator('#account-notification-email-address')).toHaveText('parent@example.com');
  await expect(page.locator('#account-notification-telegram-summary')).toHaveText('已连接并启用');
  await expect(page.locator('#connect-account-telegram-btn')).toBeVisible();
  await page.screenshot({ path: path.join(output, 'account-desktop.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await panel.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#test-account-telegram-btn')).toBeVisible();
  await page.screenshot({ path: path.join(output, 'account-mobile.png'), fullPage: true });
});

test('profile notification feature stays inside Website Management', async ({ page }) => {
  fs.mkdirSync(output, { recursive: true });
  await page.route('https://**', route => route.abort());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(pathToFileURL(path.join(root, 'pages/index.html')).href);
  await seedNotificationState(page);
  await page.evaluate(() => {
    document.querySelectorAll('.page').forEach(node => node.classList.remove('active'));
    document.getElementById('page-rules').classList.add('active');
    cloudRulesManagementActiveTab = 'site-management';
    renderRulesManagementPage();
  });

  const card = page.locator('#unclassified-notification-settings-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('当前孩子的功能规则');
  await expect(page.locator('#unclassified-notification-threshold')).toHaveValue('30');
  await expect(page.locator('#unclassified-notification-channel-summary')).toContainText('邮件、Telegram');
  await page.screenshot({ path: path.join(output, 'profile-desktop.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await card.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#save-unclassified-notification-btn')).toBeVisible();
  await page.screenshot({ path: path.join(output, 'profile-mobile.png'), fullPage: true });
});

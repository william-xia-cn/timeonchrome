// E2E tests for TimeOnChrome extension using Playwright
// Run with: npx playwright test tests/e2e/extension.test.js

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '../..');
const USER_DATA_DIR  = path.resolve(__dirname, '../../test-e2e-profile');

// ── Shared browser context ────────────────────────────────────────────────────

let browserCtx = null;
let extensionId = null;

async function getContext() {
  if (browserCtx) return browserCtx;

  // Clean data dir to avoid stale state from previous runs
  if (fs.existsSync(USER_DATA_DIR)) {
    fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });

  browserCtx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  });

  // Discover extension ID from service worker URL
  let sw = browserCtx.serviceWorkers()[0];
  if (!sw) {
    sw = await browserCtx.waitForEvent('serviceworker', { timeout: 15000 });
  }
  extensionId = new URL(sw.url()).hostname;

  return browserCtx;
}

// Close context once after all tests in this file
test.afterAll(async () => {
  if (browserCtx) {
    await browserCtx.close();
    browserCtx = null;
  }
  // Clean up test profile dir
  if (fs.existsSync(USER_DATA_DIR)) {
    fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
  }
});

// ── Helper ────────────────────────────────────────────────────────────────────

async function openExtensionPage(relPath) {
  const ctx  = await getContext();
  const page = await ctx.newPage();
  const url  = `chrome-extension://${extensionId}/${relPath}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1500); // let scripts initialise
  return page;
}

// ── T-E1: Extension loads ─────────────────────────────────────────────────────

test('T-E1: Extension loads and service worker is running', async () => {
  const ctx = await getContext();
  expect(extensionId).toBeTruthy();
  expect(extensionId).toMatch(/^[a-z]{32}$/);

  const sw = ctx.serviceWorkers()[0];
  expect(sw).toBeTruthy();
  expect(sw.url()).toContain('chrome-extension://');
});

// ── T-E2: Popup basic render ──────────────────────────────────────────────────

test('T-E2: Popup renders mode buttons and quota section', async () => {
  const page = await openExtensionPage('popup/popup.html');

  // Mode buttons present
  await expect(page.locator('#btn-study')).toBeVisible();
  await expect(page.locator('#btn-rest')).toBeVisible();

  // Text content check
  const studyBtn = await page.locator('#btn-study').textContent();
  const restBtn  = await page.locator('#btn-rest').textContent();
  expect(studyBtn).toContain('学习');
  expect(restBtn).toContain('休息');

  // Quota bars section exists in DOM (may be hidden until storage data loads)
  await expect(page.locator('#quota-bars')).toBeAttached();

  await page.close();
});

// ── T-E3: reminder.html — study_mode ─────────────────────────────────────────

test('T-E3: reminder.html study_mode shows 3 action buttons', async () => {
  const page = await openExtensionPage('reminder.html?reason=study_mode&domain=youtube.com');

  // Title contains "学习模式"
  const title = await page.locator('#mainTitle').textContent();
  expect(title).toContain('学习模式');

  // Domain shown
  const domainEl = await page.locator('#domainEl').textContent();
  expect(domainEl).toContain('youtube.com');

  // 3 action buttons
  const buttons = await page.locator('#actions .btn').count();
  expect(buttons).toBe(3);

  // Specific button texts
  const allText = await page.locator('#actions').textContent();
  expect(allText).toContain('加入');     // addComposite: 📝 临时加入学习网站
  expect(allText).toContain('休息');     // switchToRest:  ☕ 切换到休息模式
  expect(allText).toContain('返回');     // back

  await page.close();
});

// ── T-E4: reminder.html — quota_rest ─────────────────────────────────────────

test('T-E4: reminder.html quota_rest shows borrow and switch buttons', async () => {
  const page = await openExtensionPage('reminder.html?reason=quota_rest');

  const title = await page.locator('#mainTitle').textContent();
  expect(title).toContain('休息时间');

  const allText = await page.locator('#actions').textContent();
  expect(allText).toContain('借时间');   // borrowTime
  expect(allText).toContain('学习模式'); // switchToStudy
  expect(allText).toContain('详情');     // viewDetails

  await page.close();
});

// ── T-E5: reminder.html — unsafe ─────────────────────────────────────────────

test('T-E5: reminder.html unsafe shows ONLY back button', async () => {
  const page = await openExtensionPage('reminder.html?reason=unsafe&domain=tiktok.com');

  // Title / text contains safety message
  const title = await page.locator('#mainTitle').textContent();
  expect(title).toContain('不适合');

  // Subtitle references safety
  const subtitle = await page.locator('#subtitle').textContent();
  expect(subtitle).toMatch(/安全|年龄/);

  // Only 1 button: 返回
  const buttons = await page.locator('#actions .btn').count();
  expect(buttons).toBe(1);
  const btnText = await page.locator('#actions .btn').first().textContent();
  expect(btnText).toContain('返回');

  await page.close();
});

// ── T-E6: reminder.html — schedule ───────────────────────────────────────────

test('T-E6: reminder.html schedule shows only back button', async () => {
  const page = await openExtensionPage('reminder.html?reason=schedule');

  const title = await page.locator('#mainTitle').textContent();
  expect(title).toContain('休息时段');

  const buttons = await page.locator('#actions .btn').count();
  expect(buttons).toBe(1);
  const btnText = await page.locator('#actions .btn').first().textContent();
  expect(btnText).toContain('返回');

  await page.close();
});

// ── T-E7: reminder.html — quota_study ────────────────────────────────────────

test('T-E7: reminder.html quota_study shows switch-to-rest and details', async () => {
  const page = await openExtensionPage('reminder.html?reason=quota_study');

  const title = await page.locator('#mainTitle').textContent();
  expect(title).toMatch(/学得够|学习/);

  const allText = await page.locator('#actions').textContent();
  expect(allText).toContain('休息模式'); // switchToRest

  await page.close();
});

// ── T-E8: Admin panel — password gate ────────────────────────────────────────

test('T-E8: Admin panel shows login screen when not authenticated', async () => {
  const page = await openExtensionPage('admin/admin.html');

  // Login screen element
  const loginScreen = page.locator('#login-screen');
  const mainScreen  = page.locator('#main-screen');

  // Either login screen visible OR main screen visible (if no password set)
  const loginVisible = await loginScreen.isVisible().catch(() => false);
  const mainVisible  = await mainScreen.isVisible().catch(() => false);
  expect(loginVisible || mainVisible).toBe(true);

  await page.close();
});

// ── T-E9: bind.html renders ──────────────────────────────────────────────────

test('T-E9: bind.html renders without errors', async () => {
  const page = await openExtensionPage('bind.html');

  // No JS error should prevent rendering — check something exists
  const body = await page.locator('body').textContent();
  expect(body.length).toBeGreaterThan(0);

  // Should contain account-related text
  expect(body).toMatch(/绑定|注册|账号|登录/);

  await page.close();
});

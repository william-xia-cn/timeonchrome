// reminder-v0-validation.test.js
// Browser-level Playwright validation gate for Reminder V0 UI + sendMessage payloads.
// Run with: npx playwright test tests/e2e/reminder-v0-validation.test.js

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '../..');
const USER_DATA_DIR = path.resolve(__dirname, '../../test-e2e-profile-reminder-v0');

// ── Shared browser context ────────────────────────────────────────────────────

let browserCtx = null;
let extensionId = null;

async function getContext() {
  if (browserCtx) return browserCtx;

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

  let sw = browserCtx.serviceWorkers()[0];
  if (!sw) {
    sw = await browserCtx.waitForEvent('serviceworker', { timeout: 15000 });
  }
  extensionId = new URL(sw.url()).hostname;

  return browserCtx;
}

test.afterAll(async () => {
  if (browserCtx) {
    await browserCtx.close();
    browserCtx = null;
  }
  if (fs.existsSync(USER_DATA_DIR)) {
    fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function openReminderPage(queryString) {
  const ctx = await getContext();
  const page = await ctx.newPage();

  // Patch chrome.runtime.sendMessage BEFORE page loads
  await page.addInitScript(() => {
    window.__sendMessageCalls = [];
    const orig = chrome.runtime.sendMessage;
    chrome.runtime.sendMessage = function(...args) {
      const payload = JSON.parse(JSON.stringify(args[0]));
      window.__sendMessageCalls.push(payload);
      const callback = args.length > 1 ? args[args.length - 1] : null;
      if (typeof callback === 'function') {
        // Return realistic responses matching reminder.js expectations
        if (payload.type === 'ADD_TO_COMPOSITE_LIST') {
          callback({ added: true });
        } else if (payload.type === 'GET_RUNTIME_MODE_STATUS') {
          callback({ compositeRemainingSeconds: 3600, restRemainingSeconds: 1800 });
        } else if (payload.type === 'BORROW_REST_QUOTA') {
          callback({ ok: true, amount: 30 });
        } else {
          callback({ ok: true });
        }
      }
      return Promise.resolve({ ok: true });
    };
  });

  const url = `chrome-extension://${extensionId}/reminder.html?${queryString}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(800);

  // Assert spy installed successfully
  const spyInstalled = await page.evaluate(() => {
    return typeof window.__sendMessageCalls !== 'undefined' &&
           Array.isArray(window.__sendMessageCalls) &&
           typeof chrome.runtime.sendMessage === 'function' &&
           chrome.runtime.sendMessage !== (window.__origSendMessage || null);
  });
  expect(spyInstalled, 'chrome.runtime.sendMessage spy must be installed').toBe(true);

  return page;
}

async function getCalls(page) {
  return await page.evaluate(() => window.__sendMessageCalls || []);
}

async function clearCalls(page) {
  await page.evaluate(() => { window.__sendMessageCalls = []; });
}

async function dragSlider(page, trackSelector, thumbSelector) {
  const track = page.locator(trackSelector);
  const thumb = page.locator(thumbSelector);

  await expect(track).toBeVisible();
  await expect(thumb).toBeVisible();

  const trackBox = await track.boundingBox();
  const thumbBox = await thumb.boundingBox();
  expect(trackBox).toBeTruthy();
  expect(thumbBox).toBeTruthy();

  // Drag thumb to 95% of track width
  const startX = trackBox.x + thumbBox.width / 2;
  const startY = trackBox.y + trackBox.height / 2;
  const endX = trackBox.x + trackBox.width * 0.95;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.move(endX, startY);
  await page.waitForTimeout(50);
  await page.mouse.up();
  await page.waitForTimeout(300);
}

// ── T-R1: study_mode (Case #5) ───────────────────────────────────────────────

test('T-R1: study_mode shows dual-path UI, rest slider dispatches SWITCH_TO_REST', async () => {
  const page = await openReminderPage('reason=study_mode&domain=example.com');

  // Title / subtitle
  await expect(page.locator('#mainTitle')).toHaveText('你正在打开未归类网站');
  const subtitleText = await page.locator('#subtitle').textContent();
  expect(subtitleText).toContain('休息时间');

  // Rest slider visible
  await expect(page.locator('#slideTrack')).toBeVisible();
  await expect(page.locator('#slideThumb')).toBeVisible();
  await expect(page.locator('#slideThumb')).toHaveText('确认进入休息时间');

  // Composite apply slider visible
  await expect(page.locator('#dualPathCompositeSection')).toBeVisible();
  await expect(page.locator('#slideTrackComposite')).toBeVisible();
  await expect(page.locator('#slideThumbComposite')).toHaveText('申请使用综合时间');

  // Borrow section hidden
  await expect(page.locator('#dualPathBorrowSection')).toBeHidden();

  // Only 1 button: 返回学习
  const buttons = page.locator('#actions .btn');
  await expect(buttons).toHaveCount(1);
  await expect(buttons.first()).toHaveText('返回学习');

  // Drag rest slider → SWITCH_TO_REST
  await clearCalls(page);
  await dragSlider(page, '#slideTrack', '#slideThumb');
  const calls = await getCalls(page);
  expect(calls.length).toBeGreaterThanOrEqual(1);
  expect(calls[0]).toEqual({ type: 'SWITCH_TO_REST' });

  await page.close();
});

// ── T-R2a: study_mode&restLocked=1 — rest slider ─────────────────────────────

test('T-R2a: study_mode&restLocked=1 rest slider dispatches SWITCH_TO_REST', async () => {
  const page = await openReminderPage('reason=study_mode&restLocked=1&domain=example.com');

  await expect(page.locator('#mainTitle')).toHaveText('你正在打开未归类网站');
  const subtitleText = await page.locator('#subtitle').textContent();
  expect(subtitleText).toContain('向明天借用休息时间');

  // Rest slider visible
  await expect(page.locator('#slideTrack')).toBeVisible();
  await expect(page.locator('#slideThumb')).toBeVisible();

  // Drag rest slider
  await clearCalls(page);
  await dragSlider(page, '#slideTrack', '#slideThumb');
  const calls = await getCalls(page);
  expect(calls.length).toBeGreaterThanOrEqual(1);
  expect(calls[0]).toEqual({ type: 'SWITCH_TO_REST' });

  await page.close();
});

// ── T-R2b: study_mode&restLocked=1 — composite apply slider ──────────────────

test('T-R2b: study_mode&restLocked=1 composite slider dispatches ADD_TO_COMPOSITE_LIST', async () => {
  const page = await openReminderPage('reason=study_mode&restLocked=1&domain=example.com');

  // Composite apply slider visible
  await expect(page.locator('#dualPathCompositeSection')).toBeVisible();
  await expect(page.locator('#slideTrackComposite')).toBeVisible();
  await expect(page.locator('#slideThumbComposite')).toHaveText('申请使用综合时间');

  // Drag composite slider
  await clearCalls(page);
  await dragSlider(page, '#slideTrackComposite', '#slideThumbComposite');
  const calls = await getCalls(page);
  // ADD_TO_COMPOSITE_LIST + SEND_CLOUD_EVENT + GET_RUNTIME_MODE_STATUS
  expect(calls.length).toBeGreaterThanOrEqual(2);
  expect(calls[0]).toEqual({ type: 'ADD_TO_COMPOSITE_LIST', domain: 'example.com' });
  expect(calls[1]).toEqual({ type: 'SEND_CLOUD_EVENT', eventType: 'composite_add', domain: 'example.com' });

  await page.close();
});

// ── T-R2c: study_mode&restLocked=1 — borrow slider ───────────────────────────

test('T-R2c: study_mode&restLocked=1 borrow slider dispatches BORROW_REST_QUOTA', async () => {
  const page = await openReminderPage('reason=study_mode&restLocked=1&domain=example.com');

  // Borrow section visible
  await expect(page.locator('#dualPathBorrowSection')).toBeVisible();
  await expect(page.locator('#slideTrackBorrow')).toBeVisible();
  await expect(page.locator('#slideThumbBorrow')).toHaveText('向明天借用休息时间');

  // Drag borrow slider
  await clearCalls(page);
  await dragSlider(page, '#slideTrackBorrow', '#slideThumbBorrow');
  const calls = await getCalls(page);
  expect(calls.length).toBeGreaterThanOrEqual(1);
  expect(calls[0]).toEqual({ type: 'BORROW_REST_QUOTA' });

  await page.close();
});

// ── T-R3: to_rest_slide_confirm (restricted entertainment) ───────────────────

test('T-R3: to_rest_slide_confirm shows restricted UI, rest slider dispatches SWITCH_TO_REST', async () => {
  const page = await openReminderPage('reason=to_rest_slide_confirm&domain=restricted.example.com');

  // Title
  await expect(page.locator('#mainTitle')).toHaveText('你正在打开受限娱乐网站');

  // Rest quota line visible (confirmed by restQuotaLine display logic)
  const restQuotaLine = page.locator('#restQuotaLine');
  await expect(restQuotaLine).toBeVisible();
  const restQuotaText = await restQuotaLine.textContent();
  expect(restQuotaText.length).toBeGreaterThan(0);

  // Rest slider visible
  await expect(page.locator('#slideTrack')).toBeVisible();
  await expect(page.locator('#slideThumb')).toBeVisible();

  // Composite section hidden for restricted
  await expect(page.locator('#dualPathCompositeSection')).toBeHidden();

  // Only 1 button: 返回 (no originMode → backGeneric)
  const buttons = page.locator('#actions .btn');
  await expect(buttons).toHaveCount(1);
  await expect(buttons.first()).toHaveText('返回');

  // Drag rest slider
  await clearCalls(page);
  await dragSlider(page, '#slideTrack', '#slideThumb');
  const calls = await getCalls(page);
  expect(calls.length).toBeGreaterThanOrEqual(1);
  expect(calls[0]).toEqual({ type: 'SWITCH_TO_REST' });

  await page.close();
});

// ── T-R3b: to_rest_slide_confirm + originMode=study (Study-origin return) ──────

test('T-R3b: to_rest_slide_confirm with originMode=study shows 返回学习, rest slider dispatches SWITCH_TO_REST', async () => {
  const page = await openReminderPage('reason=to_rest_slide_confirm&originMode=study&domain=restricted.example.com');

  // Title
  await expect(page.locator('#mainTitle')).toHaveText('你正在打开受限娱乐网站');

  // Rest quota line visible
  const restQuotaLine = page.locator('#restQuotaLine');
  await expect(restQuotaLine).toBeVisible();
  const restQuotaText = await restQuotaLine.textContent();
  expect(restQuotaText.length).toBeGreaterThan(0);

  // Rest slider visible
  await expect(page.locator('#slideTrack')).toBeVisible();
  await expect(page.locator('#slideThumb')).toBeVisible();

  // Composite section hidden for restricted
  await expect(page.locator('#dualPathCompositeSection')).toBeHidden();

  // Only 1 button: 返回学习 (Study-origin → backToStudy)
  const buttons = page.locator('#actions .btn');
  await expect(buttons).toHaveCount(1);
  await expect(buttons.first()).toHaveText('返回学习');

  // Drag rest slider
  await clearCalls(page);
  await dragSlider(page, '#slideTrack', '#slideThumb');
  const calls = await getCalls(page);
  expect(calls.length).toBeGreaterThanOrEqual(1);
  expect(calls[0]).toEqual({ type: 'SWITCH_TO_REST' });

  await page.close();
});

// ── T-R4: to_rest_confirm + unclassified ─────────────────────────────────────

test('T-R4: to_rest_confirm unclassified shows dual-path, sliders dispatch correct payloads', async () => {
  const page = await openReminderPage('reason=to_rest_confirm&siteType=unclassified&domain=example.com');

  // Title per docs/MODE_TRANSITION_UX_V0.md §8.5: 未归类网站：你正在打开未归类网站
  await expect(page.locator('#mainTitle')).toHaveText('你正在打开未归类网站');

  const subtitleText = await page.locator('#subtitle').textContent();
  expect(subtitleText).toContain('休息时间');
  expect(subtitleText).toContain('综合时间');

  // Dual-path section visible (confirms dual-path code executed)
  await expect(page.locator('#dualPathCompositeSection')).toBeVisible();

  // Rest slider visible
  await expect(page.locator('#slideTrack')).toBeVisible();
  await expect(page.locator('#slideThumb')).toBeVisible();

  // Composite apply slider visible
  await expect(page.locator('#slideTrackComposite')).toBeVisible();

  // Only 1 button: 返回
  const buttons = page.locator('#actions .btn');
  await expect(buttons).toHaveCount(1);
  await expect(buttons.first()).toHaveText('返回');

  // Drag rest slider
  await clearCalls(page);
  await dragSlider(page, '#slideTrack', '#slideThumb');
  let calls = await getCalls(page);
  expect(calls.length).toBeGreaterThanOrEqual(1);
  expect(calls[0]).toEqual({ type: 'SWITCH_TO_REST' });

  // Drag composite slider (fresh calls)
  await clearCalls(page);
  await dragSlider(page, '#slideTrackComposite', '#slideThumbComposite');
  calls = await getCalls(page);
  expect(calls.length).toBeGreaterThanOrEqual(2);
  expect(calls[0]).toEqual({ type: 'ADD_TO_COMPOSITE_LIST', domain: 'example.com' });
  expect(calls[1]).toEqual({ type: 'SEND_CLOUD_EVENT', eventType: 'composite_add', domain: 'example.com' });

  await page.close();
});

// ── T-R5: to_rest_confirm + restricted ───────────────────────────────────────

test('T-R5: to_rest_confirm restricted shows cannot-apply notice, rest slider dispatches SWITCH_TO_REST', async () => {
  const page = await openReminderPage('reason=to_rest_confirm&siteType=restricted&domain=restricted.example.com');

  // Title per docs/MODE_TRANSITION_UX_V0.md §8.5: 受限娱乐网站：你正在打开受限娱乐网站
  await expect(page.locator('#mainTitle')).toHaveText('你正在打开受限娱乐网站');

  const subtitleText = await page.locator('#subtitle').textContent();
  expect(subtitleText).toContain('休息时间');
  expect(subtitleText).toContain('综合时间');

  // Rest slider visible
  await expect(page.locator('#slideTrack')).toBeVisible();

  // Composite section visible but slider hidden + notice shown
  await expect(page.locator('#dualPathCompositeSection')).toBeVisible();
  await expect(page.locator('#slideConfirmWrapComposite')).toBeHidden();
  const bodyText = await page.locator('#dualPathCompositeBody').textContent();
  expect(bodyText).toContain('不能申请使用综合时间');

  // Only 1 button: 返回
  const buttons = page.locator('#actions .btn');
  await expect(buttons).toHaveCount(1);
  await expect(buttons.first()).toHaveText('返回');

  // Drag rest slider
  await clearCalls(page);
  await dragSlider(page, '#slideTrack', '#slideThumb');
  const calls = await getCalls(page);
  expect(calls.length).toBeGreaterThanOrEqual(1);
  expect(calls[0]).toEqual({ type: 'SWITCH_TO_REST' });

  await page.close();
});

// ── T-R6: quota_composite ────────────────────────────────────────────────────

test('T-R6: quota_composite shows enter-rest + return buttons, enter-rest dispatches SWITCH_TO_REST', async () => {
  const page = await openReminderPage('reason=quota_composite&domain=example.com');

  // Title
  await expect(page.locator('#mainTitle')).toHaveText('今日综合时间已用完');

  // Subtitle
  const subtitleText = await page.locator('#subtitle').textContent();
  expect(subtitleText).toContain('综合时间不会自动占用休息时间');
  expect(subtitleText).toContain('进入休息时间继续');

  // Slider hidden
  await expect(page.locator('#slideTrack')).toBeHidden();

  // 2 buttons: 进入休息继续 + 返回
  const buttons = page.locator('#actions .btn');
  await expect(buttons).toHaveCount(2);
  const allText = await page.locator('#actions').textContent();
  expect(allText).toContain('进入休息继续');
  expect(allText).toContain('返回');

  // Click 进入休息继续
  await clearCalls(page);
  await page.locator('#actions .btn').filter({ hasText: '进入休息继续' }).click();
  const calls = await getCalls(page);
  expect(calls.length).toBeGreaterThanOrEqual(1);
  expect(calls[0]).toEqual({ type: 'SWITCH_TO_REST' });

  await page.close();
});

// ── T-R7: quota_composite_and_rest ───────────────────────────────────────────

test('T-R7: quota_composite_and_rest shows only return button, no continue actions', async () => {
  const page = await openReminderPage('reason=quota_composite_and_rest&domain=example.com');

  // Title
  await expect(page.locator('#mainTitle')).toHaveText('今日综合时间和休息时间均已用完');

  // Subtitle
  const subtitleText = await page.locator('#subtitle').textContent();
  expect(subtitleText).toContain('当前不能继续访问');

  // Slider hidden
  await expect(page.locator('#slideTrack')).toBeHidden();

  // Only 1 button: 返回
  const buttons = page.locator('#actions .btn');
  await expect(buttons).toHaveCount(1);
  await expect(buttons.first()).toHaveText('返回');

  // No 进入休息继续
  const allText = await page.locator('#actions').textContent();
  expect(allText).not.toContain('进入休息继续');

  await page.close();
});

// ── T-R8: unsafe (hard blocked) ──────────────────────────────────────────────

test('T-R8: unsafe shows only return button, no borrow/apply/continue', async () => {
  const page = await openReminderPage('reason=unsafe&domain=tiktok.com');

  // Title
  await expect(page.locator('#mainTitle')).toHaveText('此网站不可访问');

  // Subtitle
  await expect(page.locator('#subtitle')).toHaveText('该网站属于禁止访问范围。');

  // Domain shown
  await expect(page.locator('#domainEl')).toHaveText('tiktok.com');

  // Slider hidden
  await expect(page.locator('#slideTrack')).toBeHidden();

  // Only 1 button: 返回
  const buttons = page.locator('#actions .btn');
  await expect(buttons).toHaveCount(1);
  await expect(buttons.first()).toHaveText('返回');

  // Forbidden actions absent
  const allText = await page.locator('#actions').textContent();
  expect(allText).not.toContain('进入休息继续');
  expect(allText).not.toContain('借用');
  expect(allText).not.toContain('申请');

  await page.close();
});

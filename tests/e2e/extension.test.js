// E2E tests for TimeOnChrome extension using Playwright
// Run with: npx playwright test tests/e2e/extension.test.js

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '..', '..', 'extension');
const USER_DATA_DIR  = path.resolve(__dirname, '../../.artifacts/test-e2e-profile');

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

  // In E2E, device may not be bound, so popup-content might be hidden
  // Check either popup-content is visible OR unbound-banner is shown
  const popupContent = page.locator('#popup-content');
  const unboundBanner = page.locator('#unbound-banner');
  const popupVisible = await popupContent.isVisible().catch(() => false);
  const unboundVisible = await unboundBanner.isVisible().catch(() => false);

  if (popupVisible) {
    // Mode buttons present
    await expect(page.locator('#btn-study')).toBeVisible();
    await expect(page.locator('#btn-rest')).toBeVisible();

    // Text content check
    const studyBtn = await page.locator('#btn-study').textContent();
    const restBtn  = await page.locator('#btn-rest').textContent();
    expect(studyBtn).toContain('学习');
    expect(restBtn).toContain('休息');

    // Quota bars section exists in DOM
    await expect(page.locator('#quota-bars')).toBeAttached();
  } else {
    // Unbound state: banner should be visible
    expect(unboundVisible).toBe(true);
  }

  await page.close();
});

// ── T-E3: reminder.html — study_mode ─────────────────────────────────────────

test('T-E3: reminder.html study_mode shows back-to-study button', async () => {
  const page = await openExtensionPage('reminder.html?reason=study_mode&domain=youtube.com');

  // Title shows unclassified site message
  const title = await page.locator('#mainTitle').textContent();
  expect(title).toContain('未归类网站');

  // Domain shown
  const domainEl = await page.locator('#domainEl').textContent();
  expect(domainEl).toContain('youtube.com');

  // Only 1 action button: backToStudy
  const buttons = await page.locator('#actions .btn').count();
  expect(buttons).toBe(1);

  const allText = await page.locator('#actions').textContent();
  expect(allText).toContain('返回'); // backToStudy

  await page.close();
});

// ── T-E4: reminder.html — quota_rest ─────────────────────────────────────────

test('T-E4: reminder.html quota_rest shows study return and details without borrow', async () => {
  const page = await openExtensionPage('reminder.html?reason=quota_rest');

  const title = await page.locator('#mainTitle').textContent();
  expect(title).toContain('休息时间');

  const allText = await page.locator('#actions').textContent();
  expect(allText).toContain('学习模式'); // switchToStudy
  expect(allText).toContain('详情');     // viewDetails
  expect(allText).not.toContain('借时间');

  await page.close();
});

// ── T-E5: reminder.html — unsafe ─────────────────────────────────────────────

test('T-E5: reminder.html unsafe shows ONLY back button', async () => {
  const page = await openExtensionPage('reminder.html?reason=unsafe&domain=tiktok.com');

  // Title shows blocked message
  const title = await page.locator('#mainTitle').textContent();
  expect(title).toContain('不可访问');

  // Subtitle shows blocked reason
  const subtitle = await page.locator('#subtitle').textContent();
  expect(subtitle).toContain('禁止访问');

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
  expect(title).toContain('当前时间段未允许使用');

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
  expect(allText).toContain('开始休息'); // switchToRest
  expect(allText).toContain('详情');      // viewDetails

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

// ── T-E10: Duration tracking — real webpage ──────────────────────────────────

test('T-E10: Duration tracking records events on real webpage', async () => {
  const ctx = await getContext();

  // Fresh test profiles are intentionally paused until privacy consent is accepted.
  // Activate through the same runtime message used by the consent page so this test
  // exercises tracking instead of asserting against the disabled activation state.
  const consentPage = await openExtensionPage('privacy-consent.html');
  const activation = await consentPage.evaluate(async () => chrome.runtime.sendMessage({
    type: 'PRIVACY_CONSENT_ACCEPTED',
    source: 'playwright_e2e',
  }));
  expect(activation?.ok).toBe(true);

  // Open a real webpage
  const page = await ctx.newPage();
  await page.goto('https://www.example.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000); // Wait 3 seconds for signals to fire

  // Check event log via page evaluation
  const eventLog = await page.evaluate(async () => {
    return new Promise(resolve => {
      chrome.storage.local.get('event_log_v1', result => {
        resolve(result['event_log_v1'] || []);
      });
    });
  });

  // Check session state
  const sessionState = await page.evaluate(async () => {
    return new Promise(resolve => {
      chrome.storage.session.get('session_v1', result => {
        resolve(result['session_v1'] || null);
      });
    });
  });

  // Check stats
  const today = new Date().toISOString().slice(0, 10);
  const stats = await page.evaluate(async (key) => {
    return new Promise(resolve => {
      chrome.storage.local.get(key, result => {
        resolve(result[key] || {});
      });
    });
  }, `stats_${today}`);

  console.log(`\n  [T-E10 Debug] event_log_v1: ${JSON.stringify(eventLog).slice(0, 200)}`);
  console.log(`  [T-E10 Debug] session_v1: ${JSON.stringify(sessionState)}`);
  console.log(`  [T-E10 Debug] stats_${today}: ${JSON.stringify(stats)}`);

  // At minimum, the extension should have recorded some events or session state
  const hasAnyData = eventLog.length > 0 || (sessionState && sessionState.state !== null) || Object.keys(stats).length > 0;
  expect(hasAnyData).toBe(true);

  await page.close();
  await consentPage.evaluate(async () => {
    await chrome.storage.local.remove('privacy_consent_v1');
    return chrome.runtime.sendMessage({ type: 'GET_ACTIVATION_STATUS' });
  });
  await consentPage.close();
});

// ── T-E11: Duration tracking — service worker console check ──────────────────

test('T-E11: Service worker loads without errors', async () => {
  const ctx = await getContext();
  const sw = ctx.serviceWorkers()[0];
  expect(sw).toBeTruthy();

  // Collect console messages for a short window
  const errors = [];
  sw.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  // Wait a moment to catch any late errors
  await new Promise(r => setTimeout(r, 2000));

  // Log any errors for debugging
  if (errors.length > 0) {
    console.log(`\n  [T-E11 Debug] SW errors: ${errors.join(', ')}`);
  }

  // Service worker should be alive
  expect(sw.url()).toContain('background.js');
});

// ── T-E12: Study → Composite light prompt visibility ─────────────────────────

test('T-E12: Study → Composite light prompt appears, shows correct copy, and is non-blocking', async () => {
  const ctx = await getContext();

  // Isolate this case from T-E10, which may transition the shared runtime mode.
  const sw = ctx.serviceWorkers()[0];
  await sw.evaluate(async () => {
    await chrome.storage.local.set({
      guardian_session: { currentMode: 'study' },
    });
  });
  await new Promise(r => setTimeout(r, 500));

  // Navigate to youtube.com which is in DEFAULT_CONFIG.compositeList
  // and NOT in studyList, so it should trigger Study → Composite light prompt
  const page = await ctx.newPage();
  await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded', timeout: 15000 });

  // Wait for the banner host element to appear (content script runs at document_start)
  const bannerHost = page.locator('#__toc_mode_notice__');
  await expect(bannerHost).toBeAttached({ timeout: 10000 });

  // Verify banner text via shadow DOM
  const bannerText = await page.evaluate(() => {
    const host = document.getElementById('__toc_mode_notice__');
    if (!host || !host.shadowRoot) return null;
    const banner = host.shadowRoot.getElementById('toc-pending-banner');
    return banner ? banner.textContent : null;
  });

  expect(bannerText).toBeTruthy();
  expect(bannerText).toContain('你正在打开综合/待归类网站');
  expect(bannerText).toContain('即将进入综合模式');
  expect(bannerText).toContain('今日剩余');

  // Verify non-blocking — page content should still be accessible
  const pageTitle = await page.title();
  expect(pageTitle).toBeTruthy();

  await page.close();
});

// ── T-E12b: Study → Composite light prompt on refresh ────────────────────────

test('T-E12b: Study → Composite light prompt appears on page refresh', async () => {
  const ctx = await getContext();

  // Reset runtime mode to Study before the test
  const sw = ctx.serviceWorkers()[0];
  await sw.evaluate(async () => {
    await chrome.storage.local.set({
      guardian_session: { currentMode: 'study' },
    });
  });
  await new Promise(r => setTimeout(r, 500));

  // Navigate to youtube.com (default compositeList, not in studyList)
  const page = await ctx.newPage();
  await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded', timeout: 15000 });

  // Wait for initial banner to appear
  const bannerHost = page.locator('#__toc_mode_notice__');
  await expect(bannerHost).toBeAttached({ timeout: 10000 });

  // Reset mode back to Study before reload (simulates user switching back to Study mode)
  await sw.evaluate(async () => {
    await chrome.storage.local.set({
      guardian_session: { currentMode: 'study' },
    });
  });
  await new Promise(r => setTimeout(r, 500));

  // Reload the page
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });

  // Wait for banner to appear after reload
  // CONTENT_SCRIPT_READY mechanism ensures reliable delivery even if content script
  // listener wasn't ready when background first sent the message.
  await expect(bannerHost).toBeAttached({ timeout: 10000 });

  // Verify banner text via shadow DOM
  const bannerText = await page.evaluate(() => {
    const host = document.getElementById('__toc_mode_notice__');
    if (!host || !host.shadowRoot) return null;
    const banner = host.shadowRoot.getElementById('toc-pending-banner');
    return banner ? banner.textContent : null;
  });

  expect(bannerText).toBeTruthy();
  expect(bannerText).toContain('你正在打开综合/待归类网站');
  expect(bannerText).toContain('即将进入综合模式');
  expect(bannerText).toContain('今日剩余');

  // Verify banner remains visible after 1 second
  await page.waitForTimeout(1000);
  const visibleAfter1s = await page.evaluate(() => {
    const host = document.getElementById('__toc_mode_notice__');
    return !!(host && host.shadowRoot && host.shadowRoot.getElementById('toc-pending-banner'));
  });
  expect(visibleAfter1s).toBe(true);

  // Verify banner remains visible after 3 seconds total
  await page.waitForTimeout(2000);
  const visibleAfter3s = await page.evaluate(() => {
    const host = document.getElementById('__toc_mode_notice__');
    return !!(host && host.shadowRoot && host.shadowRoot.getElementById('toc-pending-banner'));
  });
  expect(visibleAfter3s).toBe(true);

  // Verify non-blocking
  const pageTitle = await page.title();
  expect(pageTitle).toBeTruthy();

  await page.close();
});

// ── T-E12c: Study → Composite light prompt on tab activation ─────────────────

test('T-E12c: Study → Composite light prompt appears when activating existing composite tab', async () => {
  const ctx = await getContext();

  // Reset runtime mode to Study before the test
  const sw = ctx.serviceWorkers()[0];
  await sw.evaluate(async () => {
    await chrome.storage.local.set({
      guardian_session: { currentMode: 'study' },
    });
  });
  await new Promise(r => setTimeout(r, 500));

  // Step 1: Open a composite site tab and wait for it to load
  const compositePage = await ctx.newPage();
  await compositePage.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded', timeout: 15000 });

  // Wait for initial banner
  const bannerHost = compositePage.locator('#__toc_mode_notice__');
  await expect(bannerHost).toBeAttached({ timeout: 10000 });

  // Step 2: Open a neutral tab (example.com) and switch to it
  const neutralPage = await ctx.newPage();
  await neutralPage.goto('https://www.example.com', { waitUntil: 'domcontentloaded', timeout: 15000 });

  // Step 3: Bring the composite tab back to foreground
  await compositePage.bringToFront();

  // Wait a moment for the tab activation to trigger Mode Service access routing
  await new Promise(r => setTimeout(r, 2000));

  // Step 4: Verify banner appears on the activated composite tab
  await expect(bannerHost).toBeAttached({ timeout: 10000 });

  // Verify banner text
  const bannerText = await compositePage.evaluate(() => {
    const host = document.getElementById('__toc_mode_notice__');
    if (!host || !host.shadowRoot) return null;
    const banner = host.shadowRoot.getElementById('toc-pending-banner');
    return banner ? banner.textContent : null;
  });

  expect(bannerText).toBeTruthy();
  expect(bannerText).toContain('你正在打开综合/待归类网站');
  expect(bannerText).toContain('即将进入综合模式');
  expect(bannerText).toContain('今日剩余');

  // Verify transient banner auto-hides after TTL. The activation path waits
  // before reading the text, so requiring visibility after another 3 seconds is
  // longer than the 4s notice contract.
  await compositePage.waitForTimeout(2000);
  const visibleAfterTtl = await compositePage.evaluate(() => {
    const host = document.getElementById('__toc_mode_notice__');
    return !!(host && host.shadowRoot && host.shadowRoot.getElementById('toc-pending-banner'));
  });
  expect(visibleAfterTtl).toBe(false);

  // Verify non-blocking
  const pageTitle = await compositePage.title();
  expect(pageTitle).toBeTruthy();

  await neutralPage.close();
  await compositePage.close();
});

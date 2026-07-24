// Visual verification for unclassified access records and manual study requests.
// Run with: npx playwright test tests/e2e/site-classification-record-split-visual.test.js --reporter=line

const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const EXT = path.join(ROOT, 'extension');
const OUTPUT = path.join(ROOT, '.tmp', 'visual-site-classification-record-split');
const ADMIN_VISUAL_SCRIPT = fs.readFileSync(path.join(EXT, 'admin', 'admin.js'), 'utf8')
  .replace(/^import\s+\{[\s\S]*?\}\s+from\s+['"][^'"]+['"];\s*$/gm, '')
  .replace(/^import\s+[^;]+;\s*$/gm, '');

const MOCK_RECORDS = [
  {
    id: 'auto-record',
    requestedTargetType: 'host',
    requestedNormalizedValue: 'unclassified-research.example.com',
    displayValue: 'unclassified-research.example.com',
    recordSource: 'auto_unclassified_access',
    requestedClassification: null,
    status: 'pending',
    firstObservedAt: 1784847600000,
    lastObservedAt: 1784851200000,
    observationCount: 12,
    requestedAt: 1784847600000,
    deviceId: 'device-auto',
  },
  {
    id: 'manual-request',
    requestedTargetType: 'host',
    requestedNormalizedValue: 'learning-candidate.example.com',
    displayValue: 'learning-candidate.example.com',
    recordSource: 'manual_learning_request',
    requestedClassification: 'study',
    status: 'pending',
    firstObservedAt: 1784848000000,
    lastObservedAt: 1784851600000,
    observationCount: 6,
    requestedAt: 1784848000000,
    manualRequestedAt: 1784850000000,
    deviceId: 'device-manual',
  },
];

test('Popup/Admin/Pages clearly separate access records from study requests', async () => {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const userDataDir = path.join(OUTPUT, `profile-${Date.now()}`);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  });

  try {
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    }

    const popupUrl = await serviceWorker.evaluate(() => chrome.runtime.getURL('popup/popup.html'));
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 420, height: 760 });
    await popup.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await popup.waitForTimeout(1000);
    await popup.evaluate(() => {
      renderRuntimeStatus({
        currentDomain: 'unclassified-research.example.com',
        url: 'https://unclassified-research.example.com/article',
        currentSessionDurationSeconds: 125,
        config: {
          siteClassificationRequestsV1: [{
            id: 'auto-record',
            status: 'pending',
            recordSource: 'auto_unclassified_access',
            requestedTargetType: 'host',
            requestedNormalizedValue: 'unclassified-research.example.com',
          }],
        },
      });
      document.getElementById('site-request-open-btn').click();
      const input = document.getElementById('site-request-input');
      input.value = 'unclassified-research.example.com';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(popup.locator('#runtime-compact')).toContainText('未归类网站访问记录');
    await expect(popup.locator('#site-request-panel')).toContainText('申请归为学习网站');
    await expect(popup.locator('#site-request-panel')).toContainText('家长批准前仍按待归类时间计入');
    expect(await popup.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await popup.screenshot({
      path: path.join(OUTPUT, 'popup-study-request.png'),
      fullPage: true,
    });

    const adminUrl = await serviceWorker.evaluate(() => chrome.runtime.getURL('admin/admin.html?view=stats'));
    const admin = await context.newPage();
    await admin.setViewportSize({ width: 1400, height: 900 });
    await admin.goto(adminUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await admin.waitForTimeout(1500);
    const adminCdp = await context.newCDPSession(admin);
    const injected = await adminCdp.send('Runtime.evaluate', {
      expression: ADMIN_VISUAL_SCRIPT,
      awaitPromise: false,
    });
    if (injected.exceptionDetails) {
      throw new Error(injected.exceptionDetails.text || 'Admin visual renderer injection failed');
    }
    await adminCdp.detach();
    await admin.evaluate((records) => {
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('main-screen').style.display = 'block';
      document.querySelectorAll('.page').forEach((node) => node.classList.remove('active'));
      document.getElementById('page-rules').classList.add('active');
      document.querySelectorAll('.nav-item').forEach((node) => node.classList.remove('active'));
      const rulesNav = document.querySelector('.nav-item[data-page="rules"]');
      rulesNav.style.display = '';
      rulesNav.classList.add('active');
      rulesActiveTab = 'classification-requests';
      syncRulesTabs();
      renderSiteClassificationRequestRecords(records);
    }, MOCK_RECORDS);
    await expect(admin.locator('#main-screen')).toBeVisible();
    const adminPanel = admin.locator('[data-rules-panel="classification-requests"]');
    await expect(adminPanel).toBeVisible();
    await expect(adminPanel).toContainText('未归类网站访问记录');
    await expect(adminPanel).toContainText('学习网站归类申请');
    await expect(adminPanel).toContainText('顶层导航 12 次');
    expect(await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await admin.screenshot({
      path: path.join(OUTPUT, 'admin-classification-records.png'),
      fullPage: true,
    });

    const pages = await context.newPage();
    await pages.setViewportSize({ width: 1440, height: 1000 });
    await pages.goto(pathToFileURL(path.join(ROOT, 'pages', 'index.html')).href, {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });
    await pages.evaluate((records) => {
      showScreen('main');
      currentProfileId = 'profile-visual';
      remoteConfig = {};
      document.querySelectorAll('.page').forEach((node) => node.classList.remove('active'));
      document.getElementById('page-review').classList.add('active');
      document.querySelectorAll('.nav-item').forEach((node) => node.classList.remove('active'));
      document.querySelector('.nav-item[data-page="review"]').classList.add('active');
      window._siteClassificationRequests = records;
      document.getElementById('site-classification-requests-container').innerHTML =
        records.map((record, index) => renderSiteRequestRow(record, index)).join('');
    }, MOCK_RECORDS);
    const review = pages.locator('#page-review');
    await expect(review).toContainText('网站归类审核');
    await expect(review).toContainText('未归类网站访问记录');
    await expect(review).toContainText('学习网站归类申请');
    await expect(review).toContainText('确认为学习网站');
    await expect(review).toContainText('批准归为学习网站');
    await expect(review).toContainText('暂不归类');
    await expect(review).toContainText('退回申请');
    expect(await pages.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await pages.screenshot({
      path: path.join(OUTPUT, 'pages-classification-review.png'),
      fullPage: true,
    });    await pages.setViewportSize({ width: 390, height: 844 });
    expect(await pages.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await pages.evaluate(() => [...document.querySelectorAll('.site-request-row')].every((row) => row.scrollWidth <= row.clientWidth))).toBe(true);
    await expect(pages.locator('.site-request-actions').first()).toBeVisible();
    await pages.screenshot({
      path: path.join(OUTPUT, 'pages-classification-review-mobile.png'),
      fullPage: true,
    });
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

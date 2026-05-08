// E2E: Realistic bound-profile admin/popup stats rendering verification
const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const EXT = path.resolve(__dirname, '../..');

const BOUND_SEED = {
  guardian_config: {
    version: 1, enabled: true, mode: 'rest',
    studyList: [], compositeList: [], unsafeList: [], restrictedEntertainmentList: [],
    dailyOnlineQuota: 0, dailyStudyQuota: 0, dailyRestQuota: 120, dailyUndeterminedQuota: 60,
    weeklyRestQuota: 0, domainQuotas: {}, lockedDomains: [],
    quotaState: { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false },
    schedule: { enabled: false, days: {} },
    timeQuota: { daily: {} }, timeWindows: { daily: {} },
    restConfig: { reminderInterval: 15, maxRestDuration: 60 },
    autoStudyConfig: { enabled: true, requiredSeconds: 60 },
    adminPasswordHash: '', isInitialized: true,
  },
  guardian_session: { currentMode: 'rest' },
  cloud_device_token: 'e2e-token',
  cloud_profile_id: 'e2e-pid',
  cloud_profile_name: 'E2E Child',
  cloud_monitoring_enabled: 1,
};

async function createContext() {
  const udd = path.resolve(__dirname, `../../test-e2e-profile-bound-${Date.now()}`);
  fs.mkdirSync(udd, { recursive: true });
  const ctx = await chromium.launchPersistentContext(udd, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });

  // Seed storage from popup page context (not SW — SW writes may not be visible to pages)
  const popupUrl = await sw.evaluate(() => chrome.runtime.getURL('popup/popup.html'));
  const seedPage = await ctx.newPage();
  await seedPage.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await seedPage.waitForTimeout(1000);
  await seedPage.evaluate(async (s) => {
    return new Promise(res => chrome.storage.local.set(s, res));
  }, BOUND_SEED);
  await seedPage.close();
  await new Promise(r => setTimeout(r, 1000));

  return { ctx, sw, udd };
}

test('bound-admin: Admin page renders overview with domain stats and online duration', async () => {
  const { ctx, sw, udd } = await createContext();
  try {
    const n = Date.now();

    // Seed event-log from SW
    await sw.evaluate(async (now) => {
      return new Promise(res => {
        chrome.storage.local.set({
          event_log_v1: [
            { type: 'START', state: 'ACTIVE', domain: 'bound-test.example.com', time: now - 30000 },
            { type: 'END', state: 'ACTIVE', domain: 'bound-test.example.com', time: now },
          ],
        }, res);
      });
    }, n);

    // Open admin stats page
    const adminUrl = await sw.evaluate(() => chrome.runtime.getURL('admin/admin.html?view=stats'));
    const page = await ctx.newPage();
    await page.goto(adminUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(5000);

    // Verify overview renders with data (not stuck on 加载中...)
    const overviewEl = page.locator('#today-overview-list');
    const overviewText = await overviewEl.textContent();
    console.log(`Overview: "${overviewText.replace(/\s+/g, ' ')}"`);

    // P0 assertions: admin stats must render real data
    expect(overviewText).toContain('在线');
    expect(overviewText).not.toContain('加载中');
    // Online should show non-zero seconds (30s from event-log)
    expect(overviewText).toContain('30秒');

    // Verify rank list shows domain
    const rankEl = page.locator('#today-rank-list');
    const rankText = await rankEl.textContent();
    console.log(`Rank: "${rankText.substring(0, 100)}"`);
    expect(rankText).toContain('bound-test.example.com');

    await page.close();
  } finally { await ctx.close(); fs.rmSync(udd, { recursive: true, force: true }); }
});

test('bound-popup: Popup page receives non-empty GET_STATS', async () => {
  const { ctx, sw, udd } = await createContext();
  try {
    const n = Date.now();

    await sw.evaluate(async (now) => {
      return new Promise(res => {
        chrome.storage.local.set({
          event_log_v1: [
            { type: 'START', state: 'ACTIVE', domain: 'popup-bound.example.com', time: now - 30000 },
            { type: 'END', state: 'ACTIVE', domain: 'popup-bound.example.com', time: now },
          ],
        }, res);
      });
    }, n);

    const popupUrl = await sw.evaluate(() => chrome.runtime.getURL('popup/popup.html'));
    const page = await ctx.newPage();
    await page.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(3000);

    const stats = await page.evaluate(async () => {
      return new Promise(res => {
        chrome.runtime.sendMessage({ type: 'GET_STATS' }, r => res(r || {}));
      });
    });

    let online = 0;
    for (const [k, v] of Object.entries(stats || {})) {
      if (['audioSeconds','backgroundMediaByDomain','pipSeconds','pipByDomain'].includes(k)) continue;
      online += (typeof v === 'number' ? v : 0);
    }
    console.log(`Popup GET_STATS: online=${online}s`);
    expect(online).toBeGreaterThan(0);

    await page.close();
  } finally { await ctx.close(); fs.rmSync(udd, { recursive: true, force: true }); }
});

// P0 E2E: popup/admin both render legacy undetermined data as visible composite time.
// Run with: npx playwright test tests/e2e/popup-admin-composite-time.test.js --reporter=line

const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const EXT = path.resolve(__dirname, '../..');

async function createContext() {
  const udd = path.resolve(__dirname, `../../test-e2e-profile-composite-ui-${Date.now()}`);
  fs.mkdirSync(udd, { recursive: true });
  const ctx = await chromium.launchPersistentContext(udd, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });

  const today = new Date().toISOString().split('T')[0];
  const popupUrl = await sw.evaluate(() => chrome.runtime.getURL('popup/popup.html'));
  const seedPage = await ctx.newPage();
  await seedPage.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await seedPage.evaluate(async ({ date }) => {
    return new Promise(resolve => chrome.storage.local.set({
      guardian_config: {
        version: 1,
        enabled: true,
        mode: 'rest',
        studyList: ['study.example.com'],
        compositeList: ['shared-composite.example.com'],
        unsafeList: [],
        restrictedEntertainmentList: [],
        dailyOnlineQuota: 0,
        dailyStudyQuota: 0,
        dailyRestQuota: 120,
        dailyUndeterminedQuota: 60,
        quotaState: { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false },
      },
      guardian_session: { currentMode: 'rest' },
      cloud_device_token: 'e2e-token-composite-ui',
      cloud_profile_id: 'e2e-profile-composite-ui',
      cloud_profile_name: 'Composite UI Child',
      cloud_monitoring_enabled: 1,
      daily_usage_stats_v1: {
        [date]: {
          date,
          segmentsCount: 2,
          domains: {
            'shared-composite.example.com': {
              activeSeconds: 180,
              backgroundMediaSeconds: 0,
              pipSeconds: 0,
              totalSeconds: 180,
              activeByMode: { composite: 180 },
              backgroundMediaByMode: {},
              pipByMode: {},
            },
            'rest.example.com': {
              activeSeconds: 60,
              backgroundMediaSeconds: 0,
              pipSeconds: 0,
              totalSeconds: 60,
              activeByMode: { rest: 60 },
              backgroundMediaByMode: {},
              pipByMode: {},
            },
          },
        },
      },
    }, resolve));
  }, { date: today });
  await seedPage.close();

  return { ctx, sw, udd, today };
}

test('popup/admin 统一显示 legacy 综合时间，不显示待归类口径', async () => {
  const { ctx, sw, udd, today } = await createContext();
  try {
    const popupUrl = await sw.evaluate(() => chrome.runtime.getURL('popup/popup.html'));
    const popup = await ctx.newPage();
    await popup.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await popup.waitForTimeout(2500);

    const popupCompositeText = await popup.locator('#btn-composite-value').textContent();
    expect(popupCompositeText).toContain('3分');

    const adminUrl = await sw.evaluate(() => chrome.runtime.getURL('admin/admin.html?view=stats'));
    const admin = await ctx.newPage();
    await admin.addInitScript(({ date }) => {
      const originalSendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage = (message, callback) => {
        const responseByType = {
          GET_CONFIG: {
            enabled: true,
            mode: 'rest',
            studyList: ['study.example.com'],
            compositeList: ['shared-composite.example.com'],
            dailyUndeterminedQuota: 60,
            quotaState: { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false },
          },
          GET_CLOUD_STATUS: { isBound: true },
          FLUSH_TIME: { ok: true, flushed: false },
          GET_WEEKLY_SESSIONS: { sessions: [] },
          GET_TIMELINE_SEGMENTS: [],
          GET_STATS_RANGE: {
            [date]: {
              'shared-composite.example.com': 180,
              'rest.example.com': 60,
              audioSeconds: 0,
              backgroundMediaByDomain: {},
              pipSeconds: 0,
              pipByDomain: {},
              onlineSeconds: 240,
              undeterminedSeconds: 180,
            },
          },
        };
        if (message && Object.prototype.hasOwnProperty.call(responseByType, message.type)) {
          const response = responseByType[message.type];
          if (typeof callback === 'function') callback(response);
          return Promise.resolve(response);
        }
        return originalSendMessage(message, callback);
      };
    }, { date: today });
    await admin.goto(adminUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await expect.poll(async () => {
      return (await admin.locator('#today-overview-list').textContent()).replace(/\s+/g, ' ');
    }, { timeout: 5000 }).toContain('综合');

    const overviewText = (await admin.locator('#today-overview-list').textContent()).replace(/\s+/g, ' ');
    expect(overviewText).toContain('综合');
    expect(overviewText).toContain('3分');
    expect(overviewText).not.toContain('待归类');
    expect(overviewText).not.toContain('未归类');

    await popup.close();
    await admin.close();
  } finally {
    await ctx.close();
    fs.rmSync(udd, { recursive: true, force: true });
  }
});

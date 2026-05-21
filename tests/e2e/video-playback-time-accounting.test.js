const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const EXT = path.resolve(__dirname, '..', '..', 'extension');

async function createContext() {
  const udd = fs.mkdtempSync(path.resolve(__dirname, '../../.artifacts/test-e2e-profile-video-'));
  const ctx = await chromium.launchPersistentContext(udd, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  return { ctx, sw, udd };
}

test('P0-video-1: GET_STATS domain includes active + pip while background media is separate', async () => {
  const { ctx, sw, udd } = await createContext();
  try {
    const today = await sw.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const now = Date.now();

    await sw.evaluate(async ({ today, now }) => {
      return new Promise((resolve) => {
        chrome.storage.local.set({
          cloud_device_token: 'e2e-video-token',
          cloud_profile_id: 'e2e-video-profile',
          daily_usage_stats_v1: {
            [today]: {
              date: today,
              timezone: 'Asia/Shanghai',
              segmentsCount: 3,
              domains: {
                'video.test.local': {
                  activeSeconds: 120,
                  backgroundMediaSeconds: 40,
                  pipSeconds: 30,
                  totalSeconds: 190,
                  activeByMode: { rest: 120 },
                  backgroundMediaByMode: { rest: 40 },
                  pipByMode: { rest: 30 },
                  firstSeenAt: now - 190000,
                  lastSeenAt: now,
                  lastUpdatedAt: now,
                },
              },
            },
          },
        }, resolve);
      });
    }, { today, now });

    const popupUrl = await sw.evaluate(() => chrome.runtime.getURL('popup/popup.html'));
    const popup = await ctx.newPage();
    await popup.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await popup.waitForTimeout(1200);

    await expect(popup.locator('#backend-media-row')).toBeVisible();
    await expect(popup.locator('#backend-media-row')).toContainText('后台媒体');
    await expect(popup.locator('#backend-media-value')).toContainText('40秒');
    await expect(popup.locator('#pip-media-row')).toBeVisible();
    await expect(popup.locator('#pip-media-row')).toContainText('PiP');
    await expect(popup.locator('#pip-media-value')).toContainText('30秒');

    const payload = await popup.evaluate(async () => {
      const stats = await new Promise((res) => {
        chrome.runtime.sendMessage({ type: 'GET_STATS' }, (r) => res(r || {}));
      });
      const range = await new Promise((res) => {
        chrome.runtime.sendMessage({ type: 'GET_STATS_RANGE', days: 1 }, (r) => res(r || {}));
      });
      return { stats, range };
    });

    expect(payload.stats['video.test.local']).toBe(150);
    expect(payload.stats.audioSeconds).toBe(40);
    expect(payload.stats.pipSeconds).toBe(30);
    expect(payload.stats.backgroundMediaByDomain['video.test.local']).toBe(40);
    expect(payload.stats.pipByDomain['video.test.local']).toBe(30);

    const todayStats = payload.range[today] || {};
    expect(todayStats['video.test.local']).toBe(150);
    expect(todayStats.audioSeconds).toBe(40);
    expect(todayStats.pipSeconds).toBe(30);

    await popup.close();
  } finally {
    await ctx.close();
    fs.rmSync(udd, { recursive: true, force: true });
  }
});

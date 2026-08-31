// E2E: Realistic bound-profile admin/popup stats rendering verification
const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const EXT = path.resolve(__dirname, '..', '..', 'extension');
const QUOTA_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function currentQuotaFact() {
  const now = Date.now();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(now));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = `${values.year}-${values.month}-${values.day}`;
  const start = new Date(`${date}T00:00:00Z`);
  const daysBack = start.getUTCDay() === 0 ? 6 : start.getUTCDay() - 1;
  start.setUTCDate(start.getUTCDate() - daysBack);
  return {
    schemaVersion: 1,
    date,
    weekStart: start.toISOString().slice(0, 10),
    computedAt: now,
    receivedAt: now,
    source: 'cloud_quota_state',
    state: { weeklyRestLocked: false, dailyRestLocked: false, restLocked: false },
    usage: { onlineSeconds: 5400, studySeconds: 1800, undeterminedSeconds: 600, restSeconds: 3000, weekRestSeconds: 7200 },
  };
}

const DAILY_QUOTA = Object.fromEntries(QUOTA_DAYS.map((day) => [day, {
  studyMinutes: null,
  restMinutes: 240,
  compositeMinutes: 60,
  onlineMinutes: 360,
}]));

const DAILY_WINDOWS = Object.fromEntries(QUOTA_DAYS.map((day) => [day, {
  studyWindows: null,
  compositeWindows: [{ start: '00:00', end: '01:00' }, { start: '07:00', end: '24:00' }],
  restWindows: [{ start: '00:00', end: '01:00' }, { start: '07:00', end: '24:00' }],
}]));

const BOUND_SEED = {
  guardian_config: {
    version: 1, enabled: true, mode: 'rest',
    studyList: [], compositeList: [], unsafeList: [], restrictedEntertainmentList: [],
    dailyOnlineQuota: 0, dailyStudyQuota: 0, dailyRestQuota: 120, dailyUndeterminedQuota: 60,
    weeklyRestQuota: 0, domainQuotas: {}, lockedDomains: [],
    quotaState: { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false },
    schedule: { enabled: false, days: {} },
    timeQuota: { daily: DAILY_QUOTA, weekly: { restMinutes: 840 } },
    timeWindows: { daily: DAILY_WINDOWS },
    restConfig: { firstReminderMinutes: 120, repeatReminderMinutes: 60 },
    adminPasswordHash: '', isInitialized: true,
  },
  guardian_session: { currentMode: 'rest' },
  cloud_device_token: 'e2e-token',
  cloud_profile_id: 'e2e-pid',
  cloud_profile_name: 'E2E Child',
  cloud_monitoring_enabled: 1,
  cloud_config_version: 33,
};

async function createContext() {
  const udd = path.resolve(__dirname, `../../.artifacts/test-e2e-profile-bound-${Date.now()}`);
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
  }, {
    ...BOUND_SEED,
    cloud_last_sync: Date.now(),
    cloud_quota_state_fact_v1: currentQuotaFact(),
  });
  await seedPage.close();
  await new Promise(r => setTimeout(r, 1000));

  return { ctx, sw, udd };
}

async function seedActiveUsage(sw, domain, durationSeconds = 30) {
  const now = Date.now();
  await sw.evaluate(async ({ now, domain, durationSeconds }) => {
    const d = new Date(now);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const id = `seg-${date.replaceAll('-', '')}-${domain.replaceAll('.', '-')}`;
    const startMs = now - durationSeconds * 1000;
    const segment = {
      id, schemaVersion: 1, date, domain, channel: 'active', mode: 'rest', sourceState: 'ACTIVE',
      startMs, endMs: now, durationSeconds, settlementReason: 'e2e_seed', createdAt: now, updatedAt: now,
    };
    const dayStartMs = new Date(`${date}T00:00:00`).getTime();
    await chrome.storage.local.set({
      usage_segments_v1: { [id]: segment },
      usage_segments_index_v1: { byDate: { [date]: [id] } },
      daily_usage_stats_v1: {
        [date]: {
          date, timezone: 'Asia/Shanghai', dayStartMs, dayEndMs: dayStartMs + 86400000,
          segmentsCount: 1, lastSegmentId: id,
          domains: {
            [domain]: {
              activeSeconds: durationSeconds, backgroundMediaSeconds: 0, pipSeconds: 0,
              totalSeconds: durationSeconds, activeByMode: { rest: durationSeconds },
              backgroundMediaByMode: {}, pipByMode: {}, firstSeenAt: startMs, lastSeenAt: now, lastUpdatedAt: now,
            },
          },
        },
      },
    });
  }, { now, domain, durationSeconds });
}

test('bound-admin: Admin page renders overview with domain stats and online duration', async () => {
  const { ctx, sw, udd } = await createContext();
  try {
    await seedActiveUsage(sw, 'bound-test.example.com');

    // Open admin stats page
    const adminUrl = await sw.evaluate(() => chrome.runtime.getURL('admin/admin.html?view=stats'));
    const page = await ctx.newPage();
    await page.goto(adminUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await expect(page.locator('#usage-analysis-total')).toHaveText('30秒');
    await expect(page.locator('#usage-analysis-table-wrap')).toContainText('bound-test.example.com');
    await expect(page.locator('#usage-analysis-table-wrap')).not.toContainText('加载中');

    await page.close();
  } finally { await ctx.close(); fs.rmSync(udd, { recursive: true, force: true }); }
});

test('bound-admin: Access Management mirrors cloud quota and schedule on desktop and mobile', async () => {
  const { ctx, sw, udd } = await createContext();
  try {
    await sw.evaluate(async (cloudState) => {
      await chrome.storage.local.remove(['cloud_device_token']);
      await chrome.storage.local.set(cloudState);
    }, {
      cloud_profile_name: 'E2E Child',
      cloud_config_version: 33,
      cloud_last_sync: Date.now(),
      cloud_quota_state_fact_v1: currentQuotaFact(),
    });
    const adminUrl = await sw.evaluate(() => chrome.runtime.getURL('admin/admin.html?view=stats'));
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(adminUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await expect(page.locator('#main-screen')).toBeVisible();
    await page.locator('.nav-item[data-page="rules"]').click();
    await expect(page.locator('#page-rules')).toBeVisible();
    await page.locator('[data-rules-tab="quota-management"]').click();

    await expect(page.locator('#rules-cloud-summary')).toContainText('E2E Child');
    await expect(page.locator('#rules-cloud-summary')).toContainText('配置 v33');
    await expect(page.locator('#rules-weekly-rest-display')).toContainText('14小时');
    await expect(page.locator('#rules-weekly-rest-display')).toContainText('本周已用');
    await expect(page.locator('#rules-quota-daily-display')).toContainText('在线总额');
    await expect(page.locator('#rules-weekly-plan-display')).toContainText('在线总额计划');

    const artifactDir = path.resolve(__dirname, '..', '..', '.artifacts');
    fs.mkdirSync(artifactDir, { recursive: true });
    await page.screenshot({ path: path.join(artifactDir, 'admin-access-readonly-desktop.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: path.join(artifactDir, 'admin-access-readonly-mobile.png'), fullPage: true });

    await page.locator('[data-rules-tab="schedule-management"]').click();
    await expect(page.locator('#rules-schedule-display')).toContainText('允许：00:00 - 01:00，07:00 - 24:00');
    await expect(page.locator('#rules-schedule-display')).toContainText('锁定：01:00 - 07:00');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: path.join(artifactDir, 'admin-schedule-readonly-mobile.png'), fullPage: true });

    await page.close();
  } finally { await ctx.close(); fs.rmSync(udd, { recursive: true, force: true }); }
});

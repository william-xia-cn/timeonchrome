const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const EXT = path.resolve(__dirname, '..', '..', 'extension');

function localDateKeyParts() {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const compact = date.replace(/-/g, '');
  const dayStartMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return { date, compact, dayStartMs, dayEndMs: dayStartMs + 86399999 };
}

async function createContext() {
  const udd = path.resolve(__dirname, `../../.artifacts/test-e2e-profile-suspect-${Date.now()}`);
  fs.mkdirSync(udd, { recursive: true });
  const ctx = await chromium.launchPersistentContext(udd, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const extensionId = new URL(sw.url()).hostname;
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extensionId}/admin/admin.html?view=stats`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  return { ctx, sw, page, extensionId, udd };
}

async function send(page, payload, timeoutMs = 3000) {
  return Promise.race([
    page.evaluate((message) => chrome.runtime.sendMessage(message), payload),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${payload.type} timeout`)), timeoutMs)),
  ]);
}

test('suspect cleanup marks historical active outlier and excludes it from local stats', async () => {
  const { ctx, sw, page, extensionId, udd } = await createContext();
  try {
    const { date, compact, dayStartMs, dayEndMs } = localDateKeyParts();
    const normalId = `seg-${compact}-1111111111111111`;
    const suspectId = `seg-${compact}-2222222222222222`;
    const normalSeconds = 180;
    const suspectSeconds = 19.5 * 60 * 60;
    const normalDomain = 'normal-cleanup.test';
    const suspectDomain = 'www.desmos.com';

    await sw.evaluate(async ({ date, dayStartMs, dayEndMs, normalId, suspectId, normalSeconds, suspectSeconds, normalDomain, suspectDomain }) => {
      const normal = {
        id: normalId,
        schemaVersion: 1,
        profileId: 'e2e-profile-suspect',
        deviceId: 'e2e-device-suspect',
        date,
        timezone: 'Asia/Shanghai',
        dayStartMs,
        dayEndMs,
        startMs: dayStartMs + 60_000,
        endMs: dayStartMs + 60_000 + normalSeconds * 1000,
        durationSeconds: normalSeconds,
        domain: normalDomain,
        channel: 'active',
        mode: 'study',
        sourceState: 'ACTIVE',
        settlementReason: 'periodic_checkpoint',
        parentSegmentId: null,
        partIndex: 1,
        partCount: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        uploadedAt: null,
      };
      const suspect = {
        ...normal,
        id: suspectId,
        startMs: dayStartMs + 120_000,
        endMs: dayStartMs + 120_000 + suspectSeconds * 1000,
        durationSeconds: suspectSeconds,
        domain: suspectDomain,
        mode: 'composite',
        settlementReason: 'tab_close',
      };
      await chrome.storage.local.set({
        cloud_device_token: 'e2e-suspect-token',
        cloud_profile_id: 'e2e-suspect-profile',
        cloud_profile_name: 'E2E',
        event_log_v1: [],
        usage_segments_v1: {
          [normalId]: normal,
          [suspectId]: suspect,
        },
        usage_segments_index_v1: {
          [date]: [normalId, suspectId],
        },
        daily_usage_stats_v1: {
          [date]: {
            date,
            timezone: 'Asia/Shanghai',
            dayStartMs,
            dayEndMs,
            segmentsCount: 2,
            lastSegmentId: suspectId,
            domains: {
              [normalDomain]: {
                activeSeconds: normalSeconds,
                backgroundMediaSeconds: 0,
                pipSeconds: 0,
                totalSeconds: normalSeconds,
                activeByMode: { study: normalSeconds },
                backgroundMediaByMode: {},
                pipByMode: {},
                firstSeenAt: normal.startMs,
                lastSeenAt: normal.endMs,
                lastUpdatedAt: Date.now(),
              },
              [suspectDomain]: {
                activeSeconds: suspectSeconds,
                backgroundMediaSeconds: 0,
                pipSeconds: 0,
                totalSeconds: suspectSeconds,
                activeByMode: { composite: suspectSeconds },
                backgroundMediaByMode: {},
                pipByMode: {},
                firstSeenAt: suspect.startMs,
                lastSeenAt: suspect.endMs,
                lastUpdatedAt: Date.now(),
              },
            },
          },
        },
        segment_sync_outbox_v1: { dirtySegmentIds: [], retryCounts: {}, lastErrors: {} },
        stats_sync_outbox_v1: { dirtyDates: [], retryCounts: {}, lastErrors: {} },
      });
    }, { date, dayStartMs, dayEndMs, normalId, suspectId, normalSeconds, suspectSeconds, normalDomain, suspectDomain });

    const initialStats = await send(page, { type: 'GET_STATS' });
    expect(initialStats[normalDomain]).toBe(normalSeconds);
    expect(initialStats[suspectDomain]).toBe(suspectSeconds);

    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await expect(popup.locator('#suspect-segments-row')).toBeVisible();
    await expect(popup.locator('#suspect-segments-row')).toContainText('历史异常计时');
    await expect(popup.locator('#suspect-segments-value')).toContainText('1段');
    await popup.close();

    const adminUi = await ctx.newPage();
    await adminUi.goto(`chrome-extension://${extensionId}/admin/admin.html?view=stats`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await expect(adminUi.locator('#suspect-segment-status')).toContainText('待排除异常段');
    await expect(adminUi.locator('#suspect-segment-status')).toContainText('标记并重建本地统计');
    await adminUi.close();

    const beforeDryStorage = await sw.evaluate(() => chrome.storage.local.get(['usage_segments_v1', 'daily_usage_stats_v1']));
    const dry = await send(page, { type: 'MARK_SUSPECT_SEGMENTS', dryRun: true });
    expect(dry.ok).toBe(true);
    expect(dry.dryRun).toBe(true);
    expect(dry.markedCount).toBe(1);
    const afterDryStorage = await sw.evaluate(() => chrome.storage.local.get(['usage_segments_v1', 'daily_usage_stats_v1']));
    expect(JSON.stringify(afterDryStorage)).toBe(JSON.stringify(beforeDryStorage));

    const actual = await send(page, { type: 'MARK_SUSPECT_SEGMENTS', dryRun: false });
    expect(actual.ok).toBe(true);
    expect(actual.dryRun).toBe(false);
    expect(actual.markedCount).toBe(1);
    expect(actual.rebuiltDates).toContain(date);

    const storage = await sw.evaluate(() => chrome.storage.local.get(['usage_segments_v1', 'daily_usage_stats_v1', 'segment_sync_outbox_v1', 'stats_sync_outbox_v1']));
    expect(storage.usage_segments_v1[suspectId]).toBeTruthy();
    expect(storage.usage_segments_v1[suspectId].suspect).toBe(true);
    expect(storage.usage_segments_v1[normalId].suspect).toBeUndefined();
    expect(storage.daily_usage_stats_v1[date].domains[normalDomain].activeSeconds).toBe(normalSeconds);
    expect(storage.daily_usage_stats_v1[date].domains[suspectDomain]).toBeUndefined();
    expect(storage.segment_sync_outbox_v1.dirtySegmentIds).toEqual([]);
    expect(storage.stats_sync_outbox_v1.dirtyDates).toEqual([]);

    const cleanedStats = await send(page, { type: 'GET_STATS' });
    expect(cleanedStats[normalDomain]).toBe(normalSeconds);
    expect(cleanedStats[suspectDomain] || 0).toBe(0);

    const range = await send(page, { type: 'GET_STATS_RANGE', days: 1 });
    expect(range[date][normalDomain]).toBe(normalSeconds);
    expect(range[date][suspectDomain] || 0).toBe(0);

    const second = await send(page, { type: 'MARK_SUSPECT_SEGMENTS', dryRun: false });
    expect(second.ok).toBe(true);
    expect(second.markedCount).toBe(0);
  } finally {
    await ctx.close();
    fs.rmSync(udd, { recursive: true, force: true });
  }
});

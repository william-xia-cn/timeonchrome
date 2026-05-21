// Admin stats summary diagnostic — compares GET_STATS_RANGE vs GET_TIMELINE_SEGMENTS
const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const EXT = path.resolve(__dirname, '..', '..', 'extension');

async function createContext() {
  const udd = path.resolve(__dirname, `../../.artifacts/test-e2e-profile-admin-${Date.now()}`);
  fs.mkdirSync(udd, { recursive: true });
  const ctx = await chromium.launchPersistentContext(udd, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  await sw.evaluate(async () => {
    return new Promise(res => {
      chrome.storage.local.get(['guardian_config', 'guardian_session'], r => {
        const c = r['guardian_config'] || {}; const s = r['guardian_session'] || {};
        chrome.storage.local.set({ guardian_config: { ...c, mode: 'rest', enabled: true }, guardian_session: { ...s, currentMode: 'rest' } }, res);
      });
    });
  });
  await new Promise(r => setTimeout(r, 1000));
  return { ctx, sw, udd };
}

test('admin-summary: GET_STATS_RANGE vs GET_TIMELINE_SEGMENTS shapes', async () => {
  const { ctx, sw, udd } = await createContext();
  try {
    const n = Date.now();
    const today = new Date().toISOString().split('T')[0];

    // Seed event-log with active data and one durable segment for settlement analysis.
    await sw.evaluate(async (now) => {
      const d = new Date(now);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const segment = {
        id: `seg-${date.replaceAll('-', '')}-adminsummary`,
        date,
        domain: 'admin-test.example.com',
        channel: 'active',
        mode: 'rest',
        sourceState: 'ACTIVE',
        startMs: now - 30000,
        endMs: now,
        durationSeconds: 30,
        settlementReason: 'transition_complete',
        createdAt: now,
        updatedAt: now,
      };
      const dayStats = {
        date,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        dayStartMs: new Date(`${date}T00:00:00`).getTime(),
        dayEndMs: new Date(`${date}T00:00:00`).getTime() + 24 * 60 * 60 * 1000,
        segmentsCount: 1,
        lastSegmentId: segment.id,
        domains: {
          'admin-test.example.com': {
            activeSeconds: 30,
            backgroundMediaSeconds: 0,
            pipSeconds: 0,
            totalSeconds: 30,
            activeByMode: { rest: 30 },
            backgroundMediaByMode: {},
            pipByMode: {},
            firstSeenAt: segment.startMs,
            lastSeenAt: segment.endMs,
            lastUpdatedAt: now,
          },
        },
      };
      return new Promise(res => {
        chrome.storage.local.set({
          event_log_v1: [
            { type: 'START', state: 'ACTIVE', domain: 'admin-test.example.com', time: now - 30000 },
            { type: 'END', state: 'ACTIVE', domain: 'admin-test.example.com', time: now },
          ],
          usage_segments_v1: { [segment.id]: segment },
          usage_segments_index_v1: { byDate: { [date]: [segment.id] } },
          daily_usage_stats_v1: { [date]: dayStats },
        }, res);
      });
    }, n);

    // Open admin page
    const adminUrl = await sw.evaluate(() => chrome.runtime.getURL('admin/admin.html'));
    const admin = await ctx.newPage();
    await admin.goto(adminUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await admin.waitForTimeout(3000);

    // Call GET_STATS_RANGE from admin context (exact admin.js path)
    const rangeData = await admin.evaluate(async () => {
      return new Promise(res => {
        chrome.runtime.sendMessage({ type: 'GET_STATS_RANGE', days: 1 }, r => res(r || {}));
      });
    });
    console.log(`GET_STATS_RANGE: ${JSON.stringify(Object.keys(rangeData))}`);
    for (const [date, day] of Object.entries(rangeData)) {
      const domains = Object.keys(day || {}).filter(k => !['audioSeconds','backgroundMediaByDomain','pipSeconds','pipByDomain'].includes(k));
      let online = 0;
      domains.forEach(d => online += (day[d] || 0));
      console.log(`  ${date}: online=${online}s, domains=[${domains}], audio=${day.audioSeconds}`);
    }

    // Call GET_TIMELINE_SEGMENTS from admin context
    const timeline = await admin.evaluate(async () => {
      return new Promise(res => {
        chrome.runtime.sendMessage({ type: 'GET_TIMELINE_SEGMENTS' }, r => res(r || []));
      });
    });
    console.log(`GET_TIMELINE_SEGMENTS: ${timeline.length} segments`);

    const settlements = await admin.evaluate(async () => {
      return new Promise(res => {
        chrome.runtime.sendMessage({ type: 'GET_TODAY_SETTLEMENT_ANALYSIS' }, r => res(r || {}));
      });
    });
    console.log(`GET_TODAY_SETTLEMENT_ANALYSIS: ${settlements?.segments?.length || 0} segments`);

    // Compute online from the actual first day key in rangeData
    const firstDate = Object.keys(rangeData)[0] || today;
    const todayData = rangeData[firstDate] || {};
    const domainKeys = Object.keys(todayData).filter(k => !['audioSeconds','backgroundMediaByDomain','pipSeconds','pipByDomain'].includes(k));
    let online = 0;
    for (const d of domainKeys) online += (todayData[d] || 0);
    console.log(`Summary diagnostics (date=${firstDate}): online=${online}s, domains=[${domainKeys}], audio=${todayData.audioSeconds}`);

    // Both paths should show data for today
    expect(timeline.length).toBeGreaterThan(0);
    expect(online).toBeGreaterThan(0);
    expect(Array.isArray(settlements.segments)).toBe(true);
    expect(settlements.segments.length).toBeGreaterThan(0);
    expect(settlements.segments[0].domain).toBe('admin-test.example.com');

    await admin.close();
  } finally { await ctx.close(); fs.rmSync(udd, { recursive: true, force: true }); }
});

test('admin-local-mode: ?view=stats opens read-only stats without binding', async () => {
  const { ctx, sw, udd } = await createContext();
  try {
    const n = Date.now();
    await sw.evaluate(async (now) => {
      return new Promise(res => {
        chrome.storage.local.set({
          cloud_device_token: null,
          cloud_profile_id: null,
          event_log_v1: [
            { type: 'START', state: 'ACTIVE', domain: 'local-admin.test', time: now - 40000 },
            { type: 'END', state: 'ACTIVE', domain: 'local-admin.test', time: now },
          ],
        }, res);
      });
    }, n);

    const adminUrl = await sw.evaluate(() => chrome.runtime.getURL('admin/admin.html?view=stats'));
    const admin = await ctx.newPage();
    await admin.goto(adminUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });

    await expect(admin.locator('#main-screen')).toBeVisible();
    await expect(admin.locator('#login-screen')).toBeHidden();
    await expect(admin.locator('#sidebar-child-name')).toHaveText('本地模式');
    await expect(admin.locator('#user-info')).toBeHidden();
    await expect(admin.locator('#logout-btn')).toBeHidden();
    await expect(admin.locator('#page-stats')).toHaveClass(/active/);
    await expect(admin.locator('#today-overview-list')).toContainText('在线');

    await admin.locator('.nav-item[data-page="settlements"]').click();
    await expect(admin.locator('#page-settlements')).toHaveClass(/active/);

    await admin.locator('.nav-item[data-page="devices"]').click();
    await expect(admin.locator('#page-devices')).toHaveClass(/active/);
    await expect(admin.locator('#sync-status')).toContainText('本地模式');
    await expect(admin.locator('#sync-status')).toContainText('已停用');

    await admin.close();
  } finally { await ctx.close(); fs.rmSync(udd, { recursive: true, force: true }); }
});

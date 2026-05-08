// Admin stats summary diagnostic — compares GET_STATS_RANGE vs GET_TIMELINE_SEGMENTS
const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const EXT = path.resolve(__dirname, '../..');

async function createContext() {
  const udd = path.resolve(__dirname, `../../test-e2e-profile-admin-${Date.now()}`);
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

    // Seed event-log with active data (same data for both paths)
    await sw.evaluate(async (now) => {
      return new Promise(res => {
        chrome.storage.local.set({
          event_log_v1: [
            { type: 'START', state: 'ACTIVE', domain: 'admin-test.example.com', time: now - 30000 },
            { type: 'END', state: 'ACTIVE', domain: 'admin-test.example.com', time: now },
          ],
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

    await admin.close();
  } finally { await ctx.close(); fs.rmSync(udd, { recursive: true, force: true }); }
});

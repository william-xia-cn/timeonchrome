// P0 E2E: GET_STATS from popup + mode-switch verification
// Uses event-log injection (prod fallback path) proven reliable in E2E
const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const {
  assertNoForbiddenForegroundOperations,
  assertNoUnexpectedOverlap,
  assertUsageTimeline,
  readLedgerSnapshot,
} = require('./helpers/ledger-assertions');

const EXT = path.resolve(__dirname, '../..');

async function createContext() {
  const udd = fs.mkdtempSync(path.resolve(__dirname, '../../test-e2e-profile-settle-'));
  const ctx = await chromium.launchPersistentContext(udd, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  await sw.evaluate(async () => {
    return new Promise(res => {
      chrome.storage.local.clear(() => {
        chrome.storage.session.clear(() => {
          chrome.storage.local.get(['guardian_config', 'guardian_session'], r => {
            const c = r['guardian_config'] || {}; const s = r['guardian_session'] || {};
            chrome.storage.local.set({
              guardian_config: {
                ...c,
                mode: 'rest',
                enabled: true,
                profileId: 'e2e-profile-settle',
                deviceId: 'e2e-device-id-settle',
              },
              guardian_session: {
                ...s,
                currentMode: 'rest',
                profileId: 'e2e-profile-settle',
                deviceId: 'e2e-device-id-settle',
              },
              cloud_profile_id: 'e2e-profile-settle',
              cloud_device_id: 'e2e-device-id-settle',
              cloud_device_token: 'e2e-device-token-settle',
              event_log_v1: [],
              usage_segments_v1: {},
              usage_segments_index_v1: {},
              daily_usage_stats_v1: {},
              segment_sync_outbox_v1: { dirtySegmentIds: [], retryCounts: {}, lastErrors: {} },
              stats_sync_outbox_v1: { dirtyDates: [], retryCounts: {}, lastErrors: {} },
              session_v1_persistent: null,
            }, res);
          });
        });
      });
    });
  });
  await sw.evaluate(async () => {
    if (typeof globalThis.debugSetRestMode === 'function') {
      await globalThis.debugSetRestMode();
    }
  });
  await new Promise(r => setTimeout(r, 1000));
  return { ctx, sw, udd };
}

// ── Test 1: GET_STATS from popup returns domain data after usage ─────────────
test('P0-settle-1: GET_STATS from popup returns domain stats via event-log', async () => {
  const { ctx, sw, udd } = await createContext();
  try {
    const n = Date.now();

    // Inject closed event-log items (simulates actual browsing with tab switch)
    await sw.evaluate(async (now) => {
      return new Promise(res => {
        chrome.storage.local.set({
          event_log_v1: [
            { type: 'START', state: 'ACTIVE', domain: 'visited-site.example.com', time: now - 30000 },
            { type: 'END', state: 'ACTIVE', domain: 'visited-site.example.com', time: now },
          ],
        }, res);
      });
    }, n);

    // Open popup and get stats (exact product path: popup.js → sendMsg('GET_STATS'))
    const popupUrl = await sw.evaluate(() => chrome.runtime.getURL('popup/popup.html'));
    const popup = await ctx.newPage();
    await popup.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await popup.waitForTimeout(2000);

    const stats = await popup.evaluate(async () => {
      return new Promise(res => {
        chrome.runtime.sendMessage({ type: 'GET_STATS' }, r => res(r || {}));
      });
    });

    let online = 0;
    const domainData = [];
    for (const [k, v] of Object.entries(stats || {})) {
      if (['audioSeconds','backgroundMediaByDomain','pipSeconds','pipByDomain','onlineSeconds'].includes(k)) continue;
      online += (typeof v === 'number' ? v : 0);
      domainData.push(`${k}=${v}`);
    }
    console.log(`GET_STATS: online=${online}s, domains=[${domainData}]`);
    console.log(`audioSeconds=${stats?.audioSeconds}, bgByDomain=${Object.keys(stats?.backgroundMediaByDomain || {}).length}`);

    // P0 assertions
    expect(online).toBeGreaterThan(0);
    expect(typeof stats?.audioSeconds).toBe('number');
    expect(stats?.backgroundMediaByDomain).toBeDefined();
    expect(stats?.pipSeconds).toBeDefined();

    const ledger = await readLedgerSnapshot(sw);
    assertNoForbiddenForegroundOperations(ledger.usage);
    assertNoUnexpectedOverlap(ledger.usage, 'usage');

    await popup.close();
  } finally { await ctx.close(); fs.rmSync(udd, { recursive: true, force: true }); }
});

// ── Test 3: Checkpoint-first foreground settlement makes stats durable ──────
test('P0-settle-3: checkpoint settles open bound foreground session into Stats Foundation', async () => {
  const { ctx, sw, udd } = await createContext();
  try {
    const n = Date.now();
    await sw.evaluate(async (now) => {
      const session = {
        state: 'ACTIVE',
        domain: 'live-open.example.com',
        startTime: now - 181000,
        lastHeartbeat: now - 1000,
      };
      return new Promise(res => {
        chrome.storage.session.set({ session_v1: session }, () => {
          chrome.storage.local.set({
            session_v1_persistent: session,
            usage_segments_v1: {},
            usage_segments_index_v1: {},
            daily_usage_stats_v1: {},
          }, res);
        });
      });
    }, n);

    const beforeCheckpoint = await sw.evaluate(async () => {
      return new Promise(res => {
        chrome.storage.local.get(['usage_segments_v1'], r => res(r || {}));
      });
    });
    expect(Object.keys(beforeCheckpoint.usage_segments_v1 || {}).length).toBe(0);

    const checkpoint = await sw.evaluate(async (now) => globalThis.debugRunPeriodicCheckpoint(now), n);
    expect(checkpoint.ok).toBeTruthy();
    expect(checkpoint.checkpointed).toBeTruthy();

    const popupUrl = await sw.evaluate(() => chrome.runtime.getURL('popup/popup.html'));
    const popup = await ctx.newPage();
    await popup.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await popup.waitForTimeout(250);

    const afterCheckpoint = await popup.evaluate(async () => {
      return new Promise(res => {
        chrome.runtime.sendMessage({ type: 'GET_STATS' }, r => res(r || {}));
      });
    });
    expect(afterCheckpoint['live-open.example.com']).toBeGreaterThan(0);
    expect(afterCheckpoint.onlineSeconds).toBeGreaterThan(0);

    const snapshot1 = await sw.evaluate(async () => {
      return new Promise(res => {
        chrome.storage.local.get(['usage_segments_v1', 'daily_usage_stats_v1', 'cloud_profile_id'], r => res(r));
      });
    });
    const segments1 = Object.values(snapshot1.usage_segments_v1 || {});
    expect(segments1.length).toBeGreaterThanOrEqual(1);
    expect(segments1.some(s =>
      s.domain === 'live-open.example.com' &&
      s.settlementReason === 'periodic_checkpoint'
    )).toBeTruthy();
    const ledger1 = await readLedgerSnapshot(sw);
    assertUsageTimeline(ledger1.usage, [{
      domain: 'live-open.example.com',
      mode: 'rest',
      settlementReason: 'periodic_checkpoint',
      sourceState: 'ACTIVE',
      duration: { min: 180, max: 181 },
    }], { label: 'P0-settle-3 checkpoint usage ledger' });
    assertNoForbiddenForegroundOperations(ledger1.usage);
    assertNoUnexpectedOverlap(ledger1.usage, 'usage');

    const profileIdCounts = segments1.reduce((acc, seg) => {
      const key = seg?.profileId || '(null)';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const profileSamples = segments1.map((seg) => ({
      id: seg?.id || null,
      profileId: seg?.profileId || null,
      deviceId: seg?.deviceId || null,
      date: seg?.date || null,
      domain: seg?.domain || null,
    }));
    console.log('P0-settle-3 cloud_profile_id:', snapshot1.cloud_profile_id || null);
    console.log('P0-settle-3 profileId distribution:', JSON.stringify(profileIdCounts));
    console.log('P0-settle-3 sample segments:', JSON.stringify(profileSamples.slice(0, 5)));
    expect(segments1.every(s => s.profileId === 'e2e-profile-settle')).toBeTruthy();
    expect(segments1.every(s => s.deviceId === 'e2e-device-id-settle')).toBeTruthy();
    expect(segments1.every(s => s.channel === 'active')).toBeTruthy();

    const second = await popup.evaluate(async () => {
      return new Promise(res => {
        chrome.runtime.sendMessage({ type: 'GET_STATS' }, r => res(r || {}));
      });
    });
    expect(second['live-open.example.com']).toBeGreaterThanOrEqual(afterCheckpoint['live-open.example.com']);
    expect(second['live-open.example.com']).toBeLessThanOrEqual(afterCheckpoint['live-open.example.com'] + 5);
    const snapshot2 = await sw.evaluate(async () => {
      return new Promise(res => chrome.storage.local.get('usage_segments_v1', r => res(r)));
    });
    expect(Object.keys(snapshot2.usage_segments_v1 || {}).length).toBeLessThanOrEqual(segments1.length + 1);
    const ledger2 = await readLedgerSnapshot(sw);
    const popupRows = ledger2.usage.filter((row) => row.settlementReason === 'popup_open');
    assertUsageTimeline(popupRows, popupRows.map((row) => ({
      domain: row.domain,
      mode: row.mode,
      settlementReason: 'popup_open',
      closeOperation: 'popup_open',
      allowZeroDuration: row.durationSeconds === 0,
    })), { label: 'P0-settle-3 popup_open usage ledger', exact: true });
    assertNoForbiddenForegroundOperations(ledger2.usage);

    await popup.close();
  } finally { await ctx.close(); fs.rmSync(udd, { recursive: true, force: true }); }
});

// ── Test 2: Mode switch changes session mode ────────────────────────────────
test('P0-settle-2: SWITCH_TO_STUDY/REST from popup changes mode', async () => {
  const { ctx, sw, udd } = await createContext();
  try {
    const popupUrl = await sw.evaluate(() => chrome.runtime.getURL('popup/popup.html'));
    const popup = await ctx.newPage();
    await popup.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await popup.waitForTimeout(2000);

    // Switch to study
    await popup.evaluate(async () => {
      return new Promise(res => {
        chrome.runtime.sendMessage({ type: 'SWITCH_TO_STUDY' }, r => res(r));
      });
    });
    let s1 = await sw.evaluate(async () => {
      return new Promise(res => {
        chrome.storage.local.get('guardian_session', r => res(r['guardian_session']?.currentMode));
      });
    });
    console.log(`STUDY: mode=${s1}`);
    expect(s1).toBe('study');

    // Switch back to rest
    await popup.evaluate(async () => {
      return new Promise(res => {
        chrome.runtime.sendMessage({ type: 'SWITCH_TO_REST' }, r => res(r));
      });
    });
    let s2 = await sw.evaluate(async () => {
      return new Promise(res => {
        chrome.storage.local.get('guardian_session', r => res(r['guardian_session']?.currentMode));
      });
    });
    console.log(`REST: mode=${s2}`);
    expect(s2).toBe('rest');

    await popup.close();
  } finally { await ctx.close(); fs.rmSync(udd, { recursive: true, force: true }); }
});

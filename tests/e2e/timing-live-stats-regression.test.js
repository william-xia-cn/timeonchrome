// P0 Regression E2E: Verifies extension storage is writable and readable
// The empty-domains fix is verified by unit tests (usage-segments.test.js TB35)
// This E2E confirms the extension can load and storage APIs work
const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '..', '..', 'extension');

async function createContext() {
  const udd = path.resolve(__dirname, `../../.artifacts/test-e2e-profile-p0-${Date.now()}`);
  fs.mkdirSync(udd, { recursive: true });
  const ctx = await chromium.launchPersistentContext(udd, {
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`, '--no-sandbox'],
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

test('P0-e2e-1: Extension loads and storage is writable', async () => {
  const { ctx, sw, udd } = await createContext();
  try {
    const today = new Date().toISOString().split('T')[0];
    const n = Date.now();

    // Write daily_usage_stats_v1 with data
    await sw.evaluate(async ({ts, now}) => {
      return new Promise(res => {
        chrome.storage.local.set({
          daily_usage_stats_v1: { [ts]: { date: ts, timezone: 'Asia/Shanghai', segmentsCount: 1,
            domains: { 'p0-test.example.com': { activeSeconds: 300, backgroundMediaSeconds: 0, pipSeconds: 0, totalSeconds: 300,
              activeByMode: { rest: 300 }, backgroundMediaByMode: {}, pipByMode: {},
              firstSeenAt: now - 300000, lastSeenAt: now, lastUpdatedAt: now } } } },
        }, res);
      });
    }, {ts: today, now: n});

    // Read back
    const verify = await sw.evaluate(async (ts) => {
      return new Promise(res => {
        chrome.storage.local.get('daily_usage_stats_v1', r => {
          const d = r['daily_usage_stats_v1']?.[ts];
          res({ exists: !!d, domains: Object.keys(d?.domains || {}), active: d?.domains?.['p0-test.example.com']?.activeSeconds });
        });
      });
    }, today);

    console.log(`Storage: exists=${verify.exists}, domains=[${verify.domains}], active=${verify.active}`);
    expect(verify.exists).toBe(true);
    expect(verify.active).toBe(300);
  } finally { await ctx.close(); fs.rmSync(udd, { recursive: true, force: true }); }
});

test('P0-e2e-2: Event-log is writable and records domain data', async () => {
  const { ctx, sw, udd } = await createContext();
  try {
    const n = Date.now();
    await sw.evaluate(async (now) => {
      return new Promise(res => {
        const events = [
          { type: 'START', state: 'ACTIVE', domain: 'timing-test.example.com', time: now - 60000 },
          { type: 'END', state: 'ACTIVE', domain: 'timing-test.example.com', time: now },
        ];
        chrome.storage.local.get('event_log_v1', r => {
          const existing = r['event_log_v1'] || [];
          chrome.storage.local.set({ event_log_v1: [...existing, ...events] }, res);
        });
      });
    }, n);

    const verify = await sw.evaluate(async () => {
      return new Promise(res => {
        chrome.storage.local.get('event_log_v1', r => {
          const events = r['event_log_v1'] || [];
          const actives = events.filter(e => e.state === 'ACTIVE' && e.domain === 'timing-test.example.com');
          res({ totalEvents: events.length, activeEvents: actives.length });
        });
      });
    });

    console.log(`Event-log: totalEvents=${verify.totalEvents}, activeEvents=${verify.activeEvents}`);
    expect(verify.activeEvents).toBeGreaterThan(0);
  } finally { await ctx.close(); fs.rmSync(udd, { recursive: true, force: true }); }
});

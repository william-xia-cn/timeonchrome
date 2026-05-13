// P1-A E2E: verify PAGE_ACTIVITY reaches the extension runtime.
// Run with: npx playwright test tests/e2e/foreground-evidence-p1a.test.js --reporter=line

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const http = require('http');

const EXT = path.resolve(__dirname, '../..');

let server = null;
let BASE = '';

function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!doctype html>
        <html>
          <head><title>P1-A foreground evidence</title></head>
          <body style="height: 2400px">
            <main>
              <button id="target">Activity target</button>
              <input id="field" aria-label="activity field" />
              <section style="margin-top: 1800px">bottom</section>
            </main>
          </body>
        </html>`);
    });
    server.listen(0, '127.0.0.1', () => {
      BASE = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
    server.on('error', reject);
  });
}

test.beforeAll(async () => { await startServer(); });
test.afterAll(async () => {
  if (server) server.close();
});

async function createContext() {
  const userDataDir = fs.mkdtempSync(path.resolve(__dirname, '../../test-e2e-profile-p1a-'));
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  await sw.evaluate(async () => {
    await new Promise(resolve => {
      chrome.storage.local.set({
        guardian_config: {
          mode: 'rest',
          studyList: ['127.0.0.1', 'localhost'],
          compositeList: ['127.0.0.1', 'localhost'],
          unsafeList: [],
          blockedSites: [],
          restrictedEntertainmentSites: [],
          quotaState: { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false },
        },
        guardian_session: { currentMode: 'rest' },
        __timingTrace: [],
        event_log_v1: [],
        usage_segments_v1: {},
        usage_segments_index_v1: {},
        daily_usage_stats_v1: {},
        foreground_timing_diagnostics_v1: [],
        cloud_profile_id: 'profile-e2e-p1a',
        cloud_device_id: 'device-e2e-p1a',
      }, resolve);
    });
  });
  await sw.evaluate(async () => {
    if (typeof globalThis.debugSetRestMode === 'function') {
      await globalThis.debugSetRestMode();
    }
  });
  return { ctx, sw, userDataDir };
}

async function readLocal(sw, key, fallback) {
  return sw.evaluate(async ({ key, fallback }) => {
    return new Promise(resolve => {
      chrome.storage.local.get(key, result => resolve(result[key] ?? fallback));
    });
  }, { key, fallback });
}

async function readSession(sw) {
  return sw.evaluate(async () => {
    return new Promise(resolve => {
      chrome.storage.session.get('session_v1', result => resolve(result.session_v1 || null));
    });
  });
}

function payloadKeys(entry) {
  return Object.keys(entry?.payload?.event || {}).sort();
}

test('P1-A PAGE_ACTIVITY reaches background and bounds foreground settlement', async () => {
  test.setTimeout(120_000);
  const { ctx, sw, userDataDir } = await createContext();
  try {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.bringToFront();
    await page.locator('#target').click();
    await page.locator('#field').press('A');
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(1500);

    const trace = await readLocal(sw, '__timingTrace', []);
    const pageActivitySignals = trace.filter(t => t.action === 'signal_received' && t.reason === 'pageActivity');
    const pageActivitySnapshots = trace.filter(t => t.action === 'snapshot_created' && t.reason === 'pageActivity');
    await expect.poll(async () => {
      const s = await readSession(sw);
      return {
        pageVisible: s?.pageVisible,
        hasPageActivity: Number(s?.lastPageActivityAt) > 0,
      };
    }, {
      timeout: 5000,
      intervals: [250, 500, 1000],
    }).toMatchObject({
      pageVisible: true,
      hasPageActivity: true,
    });
    const session = await readSession(sw);

    expect(pageActivitySignals.length).toBeGreaterThan(0);
    expect(pageActivitySnapshots.length).toBeGreaterThan(0);
    const signal = pageActivitySignals.at(-1);
    expect(signal.payload.event.type).toBe('PAGE_ACTIVITY');
    expect(['pointer', 'key', 'scroll', 'visibility', 'focus']).toContain(signal.payload.event.category);
    expect(signal.payload.event.pageVisible).toBe(true);
    expect(signal.payload.event.at).toBeGreaterThan(0);
    expect(session.pageVisible).toBe(true);
    expect(session.lastPageActivityAt).toBeGreaterThan(0);
    expect(session.lastForegroundEvidenceAt || session.lastPageActivityAt).toBeGreaterThan(0);

    const forbiddenPayloadKeys = [
      'key',
      'code',
      'keyCode',
      'clientX',
      'clientY',
      'screenX',
      'screenY',
      'pageX',
      'pageY',
      'text',
      'textContent',
      'innerHTML',
      'value',
      'path',
      'query',
      'screenshot',
    ];
    expect(payloadKeys(signal).some(k => forbiddenPayloadKeys.includes(k))).toBe(false);

    const controlledStart = Date.now();
    const controlled = await sw.evaluate(async ({ controlledStart }) => {
      return globalThis.debugApplyControlledTimingSignal({
        _reason: 'p1aControlledActiveEvidence',
        _debugNow: controlledStart,
        tabId: 991,
        windowId: 1,
        domain: '127.0.0.1',
        isFocused: true,
        isIdle: false,
        isAudible: false,
        pageVisible: true,
        type: 'PAGE_ACTIVITY',
        category: 'visibility',
        at: controlledStart,
      });
    }, { controlledStart });
    expect(controlled.success).toBe(true);
    expect(controlled.state).toBe('ACTIVE');

    await page.waitForTimeout(65_000);
    const segments = await readLocal(sw, 'usage_segments_v1', {});
    const countedSegments = Object.values(segments).filter(seg => seg.domain === '127.0.0.1' && seg.channel === 'active');
    expect(countedSegments.length).toBeGreaterThan(0);
    expect(Math.max(...countedSegments.map(seg => seg.durationSeconds))).toBeLessThanOrEqual(300);

    const base = Date.now() - 12 * 60_000;
    await sw.evaluate(async ({ base }) => {
      const session = {
        state: 'ACTIVE',
        domain: 'overnight-suspect.example.com',
        startTime: base,
        lastHeartbeat: base + 11 * 60_000,
        mode: 'rest',
        tabId: 99,
        pageVisible: true,
        lastPageActivityAt: null,
        lastVisibleAt: base,
        lastForegroundEvidenceAt: base,
        lastCheckpointAt: base,
      };
      await new Promise(resolve => {
        chrome.storage.session.set({ session_v1: session }, () => {
          chrome.storage.local.set({ session_v1_persistent: session }, resolve);
        });
      });
    }, { base });

    const suspectResult = await sw.evaluate(async ({ base }) => {
      return globalThis.debugApplyControlledTimingSignal({
        _reason: 'p1aLongNoActivityClose',
        _debugNow: base + 11 * 60_000,
        tabId: 99,
        windowId: 1,
        domain: 'overnight-suspect.example.com',
        isFocused: false,
        isIdle: true,
        pageVisible: false,
      });
    }, { base });
    expect(suspectResult.success).toBe(true);

    const diagnostics = await readLocal(sw, 'foreground_timing_diagnostics_v1', []);
    const suspectSegments = await readLocal(sw, 'usage_segments_v1', {});
    expect(diagnostics.some(d => d.domain === 'overnight-suspect.example.com')).toBe(true);
    expect(Object.values(suspectSegments).some(seg => seg.domain === 'overnight-suspect.example.com')).toBe(false);
  } finally {
    await ctx.close().catch(() => {});
    if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

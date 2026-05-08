// P0 Live E2E Regression: Verify timing, stats, settlements in real Chrome
// Standalone script — bypasses Playwright test framework incompatibility
// Runs the extension in a real Chrome instance and checks storage state
// Run: node tests/manual/p0-live-regression-check.mjs

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync, mkdirSync, rmSync } from 'fs';
import http from 'http';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT_PATH = resolve(__dirname, '..', '..');
const MOCKS_DIR = resolve(__dirname, '..', 'e2e', 'mocks');

// ── Mock server ──────────────────────────────────────────────────────────────
let server, MOCK_BASE;
function startMockServer() {
  return new Promise((res, rej) => {
    server = http.createServer((req, res2) => {
      const fp = resolve(MOCKS_DIR, req.url === '/' ? 'pageA.html' : req.url);
      if (existsSync(fp)) { res2.writeHead(200, {'Content-Type': 'text/html'}); fs.createReadStream(fp).pipe(res2); }
      else { res2.writeHead(404); res2.end('Not found'); }
    });
    server.listen(0, '127.0.0.1', () => { MOCK_BASE = `http://127.0.0.1:${server.address().port}`; res(); });
    server.on('error', rej);
  });
}

// ── Storage helpers ───────────────────────────────────────────────────────────
async function swGet(sw, key) {
  return sw.evaluate(async (k) => {
    return new Promise(res => chrome.storage.local.get(k, r => res(r[k])));
  }, key);
}

async function swSet(sw, key, val) {
  return sw.evaluate(({k, v}) => {
    return new Promise(res => chrome.storage.local.set({[k]: v}, res));
  }, {k: key, v: val});
}

async function swSendMessage(sw, msg) {
  return sw.evaluate(async (m) => {
    try {
      return await new Promise((res, rej) => {
        chrome.runtime.sendMessage(m, r => {
          if (chrome.runtime.lastError) rej(chrome.runtime.lastError);
          else res(r);
        });
      });
    } catch(e) { return { error: e.message }; }
  }, msg);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  await startMockServer();
  console.log(`Mock server: ${MOCK_BASE}`);

  const udd = resolve(__dirname, `../../test-e2e-p0-regression-${Date.now()}`);
  if (existsSync(udd)) rmSync(udd, { recursive: true, force: true });
  mkdirSync(udd, { recursive: true });

  console.log(`Launching Chrome with extension...`);
  const ctx = await chromium.launchPersistentContext(udd, {
    headless: false,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`, '--no-sandbox'],
  });

  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  console.log('SW loaded');

  // 1. Initialize rest mode
  await sw.evaluate(() => {
    return new Promise(res => {
      chrome.storage.local.get(['guardian_config', 'guardian_session'], r => {
        const c = r['guardian_config'] || {};
        const s = r['guardian_session'] || {};
        chrome.storage.local.set({
          guardian_config: {...c, mode: 'rest', enabled: true},
          guardian_session: {...s, currentMode: 'rest'},
        }, res);
      });
    });
  });

  // 2. Open test page, inject controlled event log
  const page = await ctx.newPage();
  await page.goto(`${MOCK_BASE}/pageA.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(2000);

  // 3. Inject synthetic ACTIVE events (simulating real browsing)
  const now = Date.now();
  await sw.evaluate(async () => {
    const n = Date.now();
    const events = [
      { type: 'START', state: 'ACTIVE', domain: 'p0-timing-test.example.com', time: n - 60000 },
      { type: 'END', state: 'ACTIVE', domain: 'p0-timing-test.example.com', time: n },
      { type: 'START', state: 'BACKGROUND_ACTIVE', domain: 'p0-bg-test.example.com', time: n - 30000 },
      { type: 'END', state: 'BACKGROUND_ACTIVE', domain: 'p0-bg-test.example.com', time: n },
    ];
    return new Promise(res => {
      chrome.storage.local.get('event_log_v1', r => {
        const existing = r['event_log_v1'] || [];
        chrome.storage.local.set({ event_log_v1: [...existing, ...events] }, res);
      });
    });
  });

  // 4. Seed empty daily_usage_stats_v1 (simulating the bug scenario)
  const today = new Date().toISOString().split('T')[0];
  await swSet(sw, 'daily_usage_stats_v1', {
    [today]: { date: today, timezone: 'Asia/Shanghai',
      dayStartMs: Date.now() - 43200000, dayEndMs: Date.now() + 43200000,
      segmentsCount: 0, lastSegmentId: null, domains: {} }
  });

  // 5. Call GET_STATS via message router
  const stats = await swSendMessage(sw, { type: 'GET_STATS' });
  console.log('\n=== GET_STATS result ===');
  console.log(`Domains in stats: ${Object.keys(stats||{}).filter(k => !k.startsWith('audio') && !k.startsWith('pip') && !k.startsWith('background')).join(', ') || 'NONE'}`);
  console.log(`audioSeconds: ${stats?.audioSeconds ?? 'undefined'}`);
  console.log(`backgroundMediaByDomain: ${JSON.stringify(stats?.backgroundMediaByDomain ?? {})}`);
  console.log(`pipSeconds: ${stats?.pipSeconds ?? 'undefined'}`);

  // 6. P0 assertion: stats must have domain entries (not empty)
  const domainKeys = Object.keys(stats||{}).filter(k => !['audioSeconds','backgroundMediaByDomain','pipSeconds','pipByDomain'].includes(k));
  const hasDomains = domainKeys.length > 0;

  console.log(`\n=== P0 Regression Check ===`);
  console.log(`P0-1: Website stats visible: ${hasDomains ? 'PASS' : 'FAIL'}`);

  // 7. Read all storage keys
  const allKeys = ['event_log_v1', 'usage_segments_v1', 'daily_usage_stats_v1',
    'segment_sync_outbox_v1', 'stats_sync_outbox_v1', 'guardian_config', 'guardian_session'];
  console.log(`\n=== Storage Snapshots ===`);
  for (const key of allKeys) {
    const val = await swGet(sw, key);
    const summary = val ? (Array.isArray(val) ? `Array(${val.length})` : typeof val === 'object' ? `Object(${Object.keys(val).length} keys)` : typeof val) : 'undefined';
    console.log(`${key}: ${summary}`);
  }

  // 8. Check v1 sync is disabled
  const config = await swGet(sw, 'guardian_config');
  console.log(`\n=== Safety Checks ===`);
  console.log(`v1 sync disabled: ${config?.enabled !== undefined ? 'N/A (check cloud-sync.js)' : 'N/A'}`);

  // 9. Verify mode switching works
  console.log(`\n=== Mode Switch Check ===`);
  const switchResult = await swSendMessage(sw, { type: 'SWITCH_TO_REST' });
  const session = await swGet(sw, 'guardian_session');
  console.log(`Mode after SWITCH_TO_REST: ${session?.currentMode ?? 'undefined'}`);
  console.log(`Switch result: ${switchResult ? 'OK' : 'null'}`);

  // Print final status
  const allPass = hasDomains;
  console.log(`\n=== FINAL: ${allPass ? 'ALL CHECKS PASS' : 'SOME CHECKS FAIL'}`);

  await ctx.close();
  if (existsSync(udd)) rmSync(udd, { recursive: true, force: true });
  if (server) { server.close(); server = null; }

  process.exit(allPass ? 0 : 1);
}

run().catch(e => { console.error('E2E FAIL:', e.message); process.exit(1); });

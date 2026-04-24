// V0.1 Duration Accuracy P0 - Layer 2: E2E Wiring Smoke
// Verifies extension loads, domain extraction, and event log writing.
// Does NOT assert ACTIVE timing due to Playwright OS-level idle/focus limitations.
// Run with: npx playwright test tests/e2e/duration-accuracy.test.js

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');
const http = require('http');

const EXTENSION_PATH = path.resolve(__dirname, '../..');
const MOCKS_DIR      = path.resolve(__dirname, 'mocks');

// ── Local mock server ────────────────────────────────────────────────────────
let server = null;
let MOCK_BASE = '';

function startMockServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const filePath = path.join(MOCKS_DIR, req.url === '/' ? 'pageA.html' : req.url);
      if (fs.existsSync(filePath)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      MOCK_BASE = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
    server.on('error', reject);
  });
}

test.beforeAll(async () => { await startMockServer(); });
test.afterAll(async () => {
  if (server) { server.close(); server = null; }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function readEventLog(page) {
  return page.evaluate(async () => {
    return new Promise(resolve => {
      chrome.storage.local.get('event_log_v1', result => resolve(result['event_log_v1'] || []));
    });
  });
}

async function readSession(page) {
  return page.evaluate(async () => {
    return new Promise(resolve => {
      chrome.storage.session.get('session_v1', result => resolve(result['session_v1'] || null));
    });
  });
}

async function createFreshContext() {
  const userDataDir = path.resolve(__dirname, `../../test-e2e-profile-accuracy-${Date.now()}`);
  if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.mkdirSync(userDataDir, { recursive: true });

  const browserCtx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`, '--no-sandbox'],
  });
  let sw = browserCtx.serviceWorkers()[0];
  if (!sw) sw = await browserCtx.waitForEvent('serviceworker', { timeout: 15000 });
  return { browserCtx, sw, userDataDir };
}

// ── T-E1: Extension Wiring Smoke ─────────────────────────────────────────────
test('T-E1: Extension loads and records events on mock page', async () => {
  const { browserCtx, sw, userDataDir } = await createFreshContext();
  const page = await browserCtx.newPage();
  
  await page.goto(`${MOCK_BASE}/pageA.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(3000);

  const events = await readEventLog(page);
  const session = await readSession(page);

  // Verify wiring
  expect(events.length).toBeGreaterThan(0);
  expect(session).not.toBeNull();
  expect(session.domain).toBe('127.0.0.1');
  expect(session.state).toBeDefined(); // Will be IDLE/PASSIVE due to OS focus limits

  console.log(`\n  [T-E1 Wiring] events=${events.length}, session.state=${session.state}, session.domain=${session.domain}`);
  console.log(`  [T-E1 Note] ACTIVE timing cannot be asserted in Playwright environment because OS-level idle/focus is unavailable.`);

  await browserCtx.close();
  if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
});

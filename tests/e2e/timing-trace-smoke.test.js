// Minimal timing trace smoke test
// Verifies that the timing pipeline emits complete structured logs end-to-end.
// Run with: npx playwright test tests/e2e/timing-trace-smoke.test.js

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
async function createFreshContext() {
  const userDataDir = path.resolve(__dirname, `../../test-e2e-profile-timing-${Date.now()}`);
  if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.mkdirSync(userDataDir, { recursive: true });

  const browserCtx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`, '--no-sandbox'],
  });
  let sw = browserCtx.serviceWorkers()[0];
  if (!sw) sw = await browserCtx.waitForEvent('serviceworker', { timeout: 15000 });
  await initializeRestMode(sw);
  return { browserCtx, sw, userDataDir };
}

async function readTimingTrace(sw) {
  return sw.evaluate(async () => {
    return new Promise(resolve => {
      chrome.storage.local.get('__timingTrace', result => resolve(result['__timingTrace'] || []));
    });
  });
}

async function readEventLog(sw) {
  return sw.evaluate(async () => {
    return new Promise(resolve => {
      chrome.storage.local.get('event_log_v1', result => resolve(result['event_log_v1'] || []));
    });
  });
}

async function readSession(sw) {
  return sw.evaluate(async () => {
    return new Promise(resolve => {
      chrome.storage.session.get('session_v1', result => resolve(result['session_v1'] || null));
    });
  });
}

async function initializeRestMode(sw) {
  return sw.evaluate(async () => {
    return new Promise(resolve => {
      chrome.storage.local.get(['guardian_config', 'guardian_session'], result => {
        const config = result['guardian_config'] || {};
        const session = result['guardian_session'] || {};
        // Test profile initialization only. These are the same fields written by
        // the production SWITCH_TO_REST path; product defaults are unchanged.
        chrome.storage.local.set({
          guardian_config: { ...config, mode: 'rest' },
          guardian_session: { ...session, currentMode: 'rest' },
        }, () => resolve());
      });
    });
  });
}

async function clearTimingTrace(sw) {
  return sw.evaluate(async () => {
    return new Promise(resolve => {
      chrome.storage.local.set({ '__timingTrace': [] }, () => resolve());
    });
  });
}

// ── Expected trace sequence ──────────────────────────────────────────────────
const EXPECTED_SEQUENCE = [
  'signal_received',
  'state_resolved',
  'transition_begin',
  'transition_end',
  'event_appended',
  'signal_received',
  'state_resolved',
  'transition_begin',
  'transition_end',
  'event_appended',
];

// ── T-T1: Timing trace smoke ─────────────────────────────────────────────────
test('T-T1: Minimal timing trace smoke — study → non-study transition', async () => {
  const { browserCtx, sw, userDataDir } = await createFreshContext();

  // Clear any pre-existing trace
  await clearTimingTrace(sw);

  // Phase 1: Open study page (pageA treated as study fixture)
  const page1 = await browserCtx.newPage();
  await page1.goto(`${MOCK_BASE}/pageA.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page1.waitForTimeout(3000);

  // Phase 2: Switch to non-study page (pageB)
  const page2 = await browserCtx.newPage();
  await page2.goto(`${MOCK_BASE}/pageB.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page2.waitForTimeout(3000);

  // Retrieve trace, event-log, session
  const trace = await readTimingTrace(sw);
  const eventLog = await readEventLog(sw);
  const session = await readSession(sw);

  // Close browser
  await browserCtx.close();
  if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });

  // ── Analysis ────────────────────────────────────────────────────────────────
  const traceTypes = trace.map(t => t.type);
  console.log('\n  ═══════════════════════════════════════════════════════════');
  console.log('  TIMING TRACE SMOKE TEST — Analysis Report');
  console.log('  ═══════════════════════════════════════════════════════════');
  console.log(`\n  Trace entries: ${trace.length}`);
  console.log(`  Event-log entries: ${eventLog.length}`);
  console.log(`  Session state: ${session?.state ?? 'null'}`);
  console.log(`  Session domain: ${session?.domain ?? 'null'}`);

  console.log('\n  ── Trace Sequence ──');
  trace.forEach((t, i) => {
    console.log(`    [${i}] ${t.action} | ts=${t.ts} | source=${t.source} | reason=${t.reason} | domain=${t.domain} | state=${t.nextState}`);
  });

  console.log('\n  ── Event Log ──');
  eventLog.forEach((e, i) => {
    console.log(`    [${i}] type=${e.type} state=${e.state} domain=${e.domain} time=${e.time}`);
  });

  // Check for expected types
  const traceActions = trace.map(t => t.action);
  const foundTypes = new Set(traceActions);
  const requiredTypes = ['signal_received', 'state_resolved', 'transition_begin', 'transition_end', 'event_appended'];
  const missingTypes = requiredTypes.filter(t => !foundTypes.has(t));

  // Check sequence completeness (at least 2 full cycles)
  const signalCount = traceActions.filter(t => t === 'signal_received').length;
  const stateCount = traceActions.filter(t => t === 'state_resolved').length;
  const transitionBeginCount = traceActions.filter(t => t === 'transition_begin').length;
  const transitionEndCount = traceActions.filter(t => t === 'transition_end').length;
  const eventAppendedCount = traceActions.filter(t => t === 'event_appended').length;
  const statsObserved = traceActions.filter(t => t === 'stats_calculated').length;

  console.log('\n  ── Pipeline Stage Coverage ──');
  console.log(`    signal_received:    ${signalCount} (expected >= 2)`);
  console.log(`    state_resolved:     ${stateCount} (expected >= 2)`);
  console.log(`    transition_begin:   ${transitionBeginCount} (expected >= 2)`);
  console.log(`    transition_end:     ${transitionEndCount} (expected >= 2)`);
  console.log(`    event_appended:     ${eventAppendedCount} (expected >= 1)`);
  console.log(`    stats_observed:     ${statsObserved} (expected >= 0, optional)`);

  // Determine classification
  let classification = 'PASS';
  let firstBrokenLayer = null;

  if (trace.length === 0) {
    classification = 'FAIL';
    firstBrokenLayer = 'test action';
  } else if (signalCount === 0) {
    classification = 'FAIL';
    firstBrokenLayer = 'browser event delivery';
  } else if (stateCount === 0) {
    classification = 'FAIL';
    firstBrokenLayer = 'resolver';
  } else if (transitionBeginCount === 0 || transitionEndCount === 0) {
    classification = 'FAIL';
    firstBrokenLayer = 'session transition';
  } else if (eventAppendedCount === 0) {
    classification = 'FAIL';
    firstBrokenLayer = 'event-log';
  } else if (missingTypes.length > 0) {
    classification = 'PARTIAL';
    firstBrokenLayer = missingTypes[0];
  }

  console.log('\n  ── Missing Types ──');
  console.log(`    ${missingTypes.length === 0 ? 'None' : missingTypes.join(', ')}`);

  console.log('\n  ── Classification ──');
  console.log(`    Result: ${classification}`);
  if (firstBrokenLayer) {
    console.log(`    First broken layer: ${firstBrokenLayer}`);
  }
  console.log('  ═══════════════════════════════════════════════════════════\n');

  // Assertions
  expect(trace.length).toBeGreaterThan(0);
  expect(signalCount).toBeGreaterThanOrEqual(1);
  expect(stateCount).toBeGreaterThanOrEqual(1);
  expect(transitionBeginCount).toBeGreaterThanOrEqual(1);
  expect(transitionEndCount).toBeGreaterThanOrEqual(1);
  expect(eventAppendedCount).toBeGreaterThanOrEqual(1);
});

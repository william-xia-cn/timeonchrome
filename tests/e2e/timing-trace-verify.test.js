// Timing trace verification test — study → non-study → study
// Verifies the full timing pipeline: signal → snapshot → state → session → event-log → stats.
// Run with: npx playwright test tests/e2e/timing-trace-verify.test.js

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
  const userDataDir = path.resolve(__dirname, `../../test-e2e-profile-trace-verify-${Date.now()}`);
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

async function clearTimingTrace(sw) {
  return sw.evaluate(async () => {
    return new Promise(resolve => {
      chrome.storage.local.set({ '__timingTrace': [] }, () => resolve());
    });
  });
}

// ── Trace analysis helper ─────────────────────────────────────────────────────
function classifyTrace(trace) {
  const types = trace.map(t => t.action);
  const counts = {};
  types.forEach(t => { counts[t] = (counts[t] || 0) + 1; });

  const requiredActions = [
    'signal_received',
    'snapshot_created',
    'state_resolved',
    'transition_begin',
    'transition_end',
    'event_appended',
  ];
  const missing = requiredActions.filter(a => !counts[a]);

  // Determine first broken layer
  let firstBrokenLayer = null;
  let classification = 'PASS';

  if (trace.length === 0) {
    classification = 'FAIL';
    firstBrokenLayer = 'test_action';
  } else if (!counts['signal_received']) {
    classification = 'FAIL';
    firstBrokenLayer = 'browser_event_delivery';
  } else if (!counts['snapshot_created']) {
    classification = 'FAIL';
    firstBrokenLayer = 'context_builder';
  } else if (!counts['state_resolved']) {
    classification = 'FAIL';
    firstBrokenLayer = 'resolver';
  } else if (!counts['transition_begin'] || !counts['transition_end']) {
    classification = 'FAIL';
    firstBrokenLayer = 'session_transition';
  } else if (!counts['event_appended']) {
    classification = 'FAIL';
    firstBrokenLayer = 'event_log';
  } else if (missing.length > 0) {
    classification = 'PARTIAL';
    firstBrokenLayer = missing[0];
  }

  return { counts, missing, classification, firstBrokenLayer };
}

// ── T-TV1: Full timing pipeline verification ──────────────────────────────────
test('T-TV1: Timing pipeline — study → non-study → study transition chain', async () => {
  const { browserCtx, sw, userDataDir } = await createFreshContext();
  await clearTimingTrace(sw);

  // Phase 1: Open study page (pageA)
  const page1 = await browserCtx.newPage();
  await page1.goto(`${MOCK_BASE}/pageA.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page1.waitForTimeout(3000);

  // Phase 2: Switch to non-study page (pageB)
  const page2 = await browserCtx.newPage();
  await page2.goto(`${MOCK_BASE}/pageB.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page2.waitForTimeout(3000);

  // Phase 3: Switch back to study page (pageA)
  await page1.bringToFront();
  await page1.waitForTimeout(3000);

  // Retrieve all data
  const trace = await readTimingTrace(sw);
  const eventLog = await readEventLog(sw);
  const session = await readSession(sw);

  // Close browser
  await browserCtx.close();
  if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });

  // ── Analysis Report ─────────────────────────────────────────────────────────
  const analysis = classifyTrace(trace);
  const traceTypes = trace.map(t => t.action);

  console.log('\n  ═══════════════════════════════════════════════════════════');
  console.log('  TIMING TRACE VERIFICATION — Analysis Report');
  console.log('  ═══════════════════════════════════════════════════════════');
  console.log(`\n  Trace entries: ${trace.length}`);
  console.log(`  Event-log entries: ${eventLog.length}`);
  console.log(`  Session state: ${session?.state ?? 'null'}`);
  console.log(`  Session domain: ${session?.domain ?? 'null'}`);

  console.log('\n  ── Full Trace Sequence ──');
  trace.forEach((t, i) => {
    const summary = JSON.stringify({
      action: t.action,
      source: t.source,
      reason: t.reason,
      domain: t.domain,
      previousState: t.previousState,
      nextState: t.nextState,
    }).slice(0, 160);
    console.log(`    [${i}] ts=${t.ts} | ${summary}`);
  });

  console.log('\n  ── Event Log ──');
  eventLog.forEach((e, i) => {
    console.log(`    [${i}] type=${e.type} state=${e.state} domain=${e.domain} time=${e.time}`);
  });

  console.log('\n  ── Pipeline Stage Coverage ──');
  console.log(`    signal_received:    ${analysis.counts['signal_received'] || 0}`);
  console.log(`    snapshot_created:   ${analysis.counts['snapshot_created'] || 0}`);
  console.log(`    state_resolved:     ${analysis.counts['state_resolved'] || 0}`);
  console.log(`    transition_begin:   ${analysis.counts['transition_begin'] || 0}`);
  console.log(`    transition_end:     ${analysis.counts['transition_end'] || 0}`);
  console.log(`    event_appended:     ${analysis.counts['event_appended'] || 0}`);
  console.log(`    stats_calculated:   ${analysis.counts['stats_calculated'] || 0} (optional)`);

  console.log('\n  ── Missing Actions ──');
  console.log(`    ${analysis.missing.length === 0 ? 'None' : analysis.missing.join(', ')}`);

  console.log('\n  ── Classification ──');
  console.log(`    Result: ${analysis.classification}`);
  if (analysis.firstBrokenLayer) {
    console.log(`    First broken layer: ${analysis.firstBrokenLayer}`);
  }
  console.log('  ═══════════════════════════════════════════════════════════\n');

  // ── Assertions ──────────────────────────────────────────────────────────────
  expect(trace.length).toBeGreaterThan(0);
  expect(analysis.counts['signal_received']).toBeGreaterThanOrEqual(1);
  expect(analysis.counts['snapshot_created']).toBeGreaterThanOrEqual(1);
  expect(analysis.counts['state_resolved']).toBeGreaterThanOrEqual(1);
  expect(analysis.counts['transition_begin']).toBeGreaterThanOrEqual(1);
  expect(analysis.counts['transition_end']).toBeGreaterThanOrEqual(1);
  expect(analysis.counts['event_appended']).toBeGreaterThanOrEqual(1);

  // Verify trace schema completeness
  const firstSignal = trace.find(t => t.action === 'signal_received');
  expect(firstSignal).toBeTruthy();
  expect(firstSignal.ts).toBeDefined();
  expect(firstSignal.source).toBeDefined();
  expect(firstSignal.action).toBe('signal_received');

  // Verify session was updated
  expect(session).not.toBeNull();
  expect(session.state).toBeDefined();

  // Verify event-log was written
  expect(eventLog.length).toBeGreaterThan(0);
  const startEvents = eventLog.filter(e => e.type === 'START');
  expect(startEvents.length).toBeGreaterThanOrEqual(1);
});

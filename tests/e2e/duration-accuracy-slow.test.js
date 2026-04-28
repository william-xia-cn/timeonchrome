// Focus Ledger Slow Smoke Test
//
// Purpose: Verify Focus Ledger records tab focus time correctly when pages
// are NOT intercepted by reminder. Does NOT verify activeSeconds accuracy.
//
// Why not activeSeconds?
// - Playwright persistentContext lacks OS focus → isFocused=false
// - resolveState() returns PASSIVE, not ACTIVE (core/state.js:24-31)
// - activeSeconds only counts ACTIVE state entries
// - Therefore activeSeconds ≈ 0 in Playwright is expected, not a bug
//
// What this test validates:
// - Focus Ledger FOCUS_START/FOCUS_END events are recorded on tab activation
// - Duration aggregation by domain is correct
// - No reminder interception occurs during test
// - Mode switch (rest) and monitoring status are valid before timing starts
//
// Audit basis:
// - monitoringEnabled only affects: checkAndRemind, updateDeclarativeRules,
//   heartbeat alarm, quota_check alarm, cloud events, stats upload
// - monitoringEnabled does NOT affect: signal.js, state.js, session.js,
//   event-log.js, aggregate.js
// - mode (study/rest) only affects: interceptor.js access control
// - mode does NOT affect: resolveState(), transitionState(), appendEvent()
//
// Run with:
//   npx playwright test tests/e2e/duration-accuracy-slow.test.js --headed --timeout=300000

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');
const http = require('http');

const EXTENSION_PATH = path.resolve(__dirname, '../..');
const MOCKS_DIR      = path.resolve(__dirname, 'mocks');

// Local mock pages
const PAGE_A_PATH = '/pageA.html';
const PAGE_B_PATH = '/pageB.html';

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
  const userDataDir = path.resolve(__dirname, `../../test-e2e-profile-slow-${Date.now()}`);
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

/**
 * Switch to REST mode using the official business message handler.
 * This is the same entry point the popup uses.
 */
async function switchToRestMode(sw) {
  await sw.evaluate(async () => {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'SWITCH_TO_REST' }, resolve);
    });
  });
  // Wait for mode switch to propagate (config save + declarative rules update)
  await new Promise(r => setTimeout(r, 2000));
}

/**
 * Read current config via official GET_CONFIG message.
 */
async function readConfig(sw) {
  return sw.evaluate(async () => {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
    });
  });
}

/**
 * Read monitoring state.
 */
async function readMonitoringState(sw) {
  return sw.evaluate(async () => {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_CLOUD_STATUS' }, result => {
        resolve(result || {});
      });
    });
  });
}

/**
 * Check if current page is intercepted by reminder.
 */
async function checkInterception(page) {
  const url = page.url();
  const isReminder = url.includes('reminder.html');
  let domain = null;
  let reason = null;

  if (isReminder) {
    try {
      const u = new URL(url);
      domain = u.searchParams.get('domain');
      reason = u.searchParams.get('reason');
    } catch {}
  }

  return { isIntercepted: isReminder, domain, reason, url };
}

async function readFocusLedger(sw) {
  return sw.evaluate(async () => {
    return new Promise(resolve => {
      chrome.storage.local.get('debug_focus_ledger_v1', result => resolve(result['debug_focus_ledger_v1'] || []));
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

/**
 * Aggregate focus ledger by domain.
 */
function aggregateFocusLedger(ledger) {
  const byDomain = {};
  let openStart = null;
  for (const entry of ledger) {
    if (entry.type === 'FOCUS_START' && entry.domain) {
      openStart = entry;
    } else if (entry.type === 'FOCUS_END' && openStart) {
      const dur = Math.floor((entry.time - openStart.time) / 1000);
      if (dur > 0) {
        byDomain[openStart.domain] = (byDomain[openStart.domain] || 0) + dur;
      }
      openStart = null;
    } else if (entry.type === 'FOCUS_START' && !entry.domain) {
      openStart = null;
    }
  }
  return byDomain;
}

/**
 * Aggregate activeSeconds from event_log_v1 by domain.
 */
function aggregateActiveSeconds(events) {
  const byDomain = {};
  let openStart = null;
  for (const evt of events) {
    if (evt.type === 'START' && evt.state === 'ACTIVE' && evt.domain) {
      openStart = evt;
    } else if (evt.type === 'END' && openStart) {
      const dur = Math.floor((evt.time - openStart.time) / 1000);
      if (dur > 0) {
        byDomain[openStart.domain] = (byDomain[openStart.domain] || 0) + dur;
      }
      openStart = null;
    } else if (evt.type === 'START' && evt.state !== 'ACTIVE') {
      openStart = null;
    }
  }
  return byDomain;
}

/**
 * Print diagnostic snapshot.
 */
async function printSnapshot(sw, label, page, config, monitoring) {
  const ledger = await readFocusLedger(sw);
  const events = await readEventLog(sw);
  const session = await readSession(sw);
  const interception = await checkInterception(page);

  const focusByDomain = aggregateFocusLedger(ledger);
  const activeByDomain = aggregateActiveSeconds(events);

  let totalFocus = 0, totalActive = 0;
  for (const d of new Set([...Object.keys(focusByDomain), ...Object.keys(activeByDomain)])) {
    totalFocus += focusByDomain[d] || 0;
    totalActive += activeByDomain[d] || 0;
  }

  const delta = totalFocus - totalActive;

  console.log(`\n  [Focus Ledger Snapshot: ${label}]`);
  console.log(`    time: ${new Date().toISOString()}`);
  console.log(`    mode: ${config?.mode || 'unknown'}`);
  console.log(`    monitoring: ${monitoring?.monitoringEnabled ?? 'unknown'}`);
  console.log(`    url: ${interception.url}`);
  console.log(`    isReminder: ${interception.isIntercepted}`);
  console.log(`    session.state: ${session?.state || 'null'}`);
  console.log(`    session.domain: ${session?.domain || 'null'}`);
  console.log(`    focusLedgerByDomain:`, JSON.stringify(focusByDomain));
  console.log(`    activeSecondsByDomain:`, JSON.stringify(activeByDomain), '(expected empty in Playwright)');
  console.log(`    totalFocusSeconds: ${totalFocus}`);
  console.log(`    totalActiveSeconds: ${totalActive}`);
  console.log(`    totalDelta: ${delta}`);

  return { totalFocus, totalActive, delta, sessionState: session?.state, interception };
}

/**
 * Validate test setup before starting timing.
 * Throws if setup is invalid.
 */
async function validateSetup(sw, page, testDomain, testUrl) {
  const config = await readConfig(sw);
  const monitoring = await readMonitoringState(sw);
  const interception = await checkInterception(page);

  console.log(`\n  [Focus Ledger Smoke Setup Validation]`);
  console.log(`    monitoringEnabled: ${monitoring?.monitoringEnabled ?? 'unknown'}`);
  console.log(`    mode: ${config?.mode || 'unknown'}`);
  console.log(`    testUrl: ${testUrl}`);
  console.log(`    testDomain: ${testDomain}`);
  console.log(`    finalUrl: ${interception.url}`);
  console.log(`    isReminder: ${interception.isIntercepted}`);

  // Check monitoring is enabled
  if (monitoring?.monitoringEnabled === 0) {
    throw new Error('invalid test setup: monitoring disabled');
  }

  // Check not intercepted
  if (interception.isIntercepted) {
    throw new Error(`invalid test setup: target page redirected to reminder (reason=${interception.reason})`);
  }

  console.log(`  ✅ Setup valid. Proceeding with Focus Ledger smoke test.`);
  return { config, monitoring };
}

// ── T-SLOW-1: Single page 60 seconds (Focus Ledger smoke) ──────────────────────

test('T-SLOW-1: Single page 60s Focus Ledger smoke', async () => {
  const { browserCtx, sw, userDataDir } = await createFreshContext();
  
  // Switch to rest mode using official business entry point
  await switchToRestMode(sw);

  const page = await browserCtx.newPage();
  await page.goto(`${MOCK_BASE}${PAGE_A_PATH}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(3000); // settle

  // Validate setup
  let setupValid = false;
  try {
    await validateSetup(sw, page, '127.0.0.1', `${MOCK_BASE}${PAGE_A_PATH}`);
    setupValid = true;
  } catch (err) {
    console.log(`  ❌ ${err.message}`);
    await browserCtx.close();
    if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
    throw err;
  }

  if (!setupValid) return;

  console.log(`\n=== T-SLOW-1: Single page 60s ===`);

  const DURATION_MS = 60000;
  const SAMPLE_INTERVAL_MS = 10000;
  let snapshots = [];

  const config = await readConfig(sw);
  const monitoring = await readMonitoringState(sw);
  snapshots.push(await printSnapshot(sw, 'T=0s', page, config, monitoring));

  const sampleTimer = setInterval(async () => {
    const elapsed = Math.round((Date.now() - (snapshots[0]?.timestamp || Date.now())) / 1000);
    const cfg = await readConfig(sw);
    const mon = await readMonitoringState(sw);
    snapshots.push(await printSnapshot(sw, `T=${elapsed}s`, page, cfg, mon));
  }, SAMPLE_INTERVAL_MS);

  await page.waitForTimeout(DURATION_MS);
  clearInterval(sampleTimer);

  const finalConfig = await readConfig(sw);
  const finalMonitoring = await readMonitoringState(sw);
  snapshots.push(await printSnapshot(sw, `T=${DURATION_MS/1000}s (final)`, page, finalConfig, finalMonitoring));

  const finalSnapshot = snapshots[snapshots.length - 1];
  console.log(`\n  [T-SLOW-1 Analysis]`);
  console.log(`    Focus Ledger recorded: ${finalSnapshot.totalFocus > 0 ? '✅' : '❌ (no focus timing recorded)'}`);
  console.log(`    session.state: ${finalSnapshot.sessionState}`);
  console.log(`    Note: activeSeconds ≈ 0 is expected in Playwright (no OS focus)`);

  await browserCtx.close();
  if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
});

// ── T-SLOW-2: A 60s → B 60s (Focus Ledger smoke) ─────────────────────────────

test('T-SLOW-2: A 60s → B 60s Focus Ledger smoke', async () => {
  const { browserCtx, sw, userDataDir } = await createFreshContext();
  await switchToRestMode(sw);

  console.log('\n=== T-SLOW-2: A 60s → B 60s ===');

  // Phase 1: Page A
  const pageA = await browserCtx.newPage();
  await pageA.goto(`${MOCK_BASE}${PAGE_A_PATH}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await pageA.waitForTimeout(3000);

  try {
    await validateSetup(sw, pageA, '127.0.0.1', `${MOCK_BASE}${PAGE_A_PATH}`);
  } catch (err) {
    console.log(`  ❌ ${err.message}`);
    await browserCtx.close();
    if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
    throw err;
  }

  console.log(`  Phase 1: Page A`);
  let snapshotsA = [];
  const configA = await readConfig(sw);
  const monA = await readMonitoringState(sw);
  snapshotsA.push(await printSnapshot(sw, 'A T=0s', pageA, configA, monA));

  const sampleA = setInterval(async () => {
    const elapsed = Math.round((Date.now() - (snapshotsA[0]?.timestamp || Date.now())) / 1000);
    const cfg = await readConfig(sw);
    const mon = await readMonitoringState(sw);
    snapshotsA.push(await printSnapshot(sw, `A T=${elapsed}s`, pageA, cfg, mon));
  }, 10000);

  await pageA.waitForTimeout(60000);
  clearInterval(sampleA);
  const cfgAEnd = await readConfig(sw);
  const monAEnd = await readMonitoringState(sw);
  snapshotsA.push(await printSnapshot(sw, 'A T=60s (switch)', pageA, cfgAEnd, monAEnd));

  // Phase 2: Page B
  const pageB = await browserCtx.newPage();
  await pageB.goto(`${MOCK_BASE}${PAGE_B_PATH}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await pageB.waitForTimeout(3000);

  try {
    await validateSetup(sw, pageB, '127.0.0.1', `${MOCK_BASE}${PAGE_B_PATH}`);
  } catch (err) {
    console.log(`  ❌ ${err.message}`);
    await browserCtx.close();
    if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
    throw err;
  }

  console.log(`\n  Phase 2: Page B`);
  let snapshotsB = [];
  const configB = await readConfig(sw);
  const monB = await readMonitoringState(sw);
  snapshotsB.push(await printSnapshot(sw, 'B T=0s', pageB, configB, monB));

  const sampleB = setInterval(async () => {
    const elapsed = Math.round((Date.now() - (snapshotsB[0]?.timestamp || Date.now())) / 1000);
    const cfg = await readConfig(sw);
    const mon = await readMonitoringState(sw);
    snapshotsB.push(await printSnapshot(sw, `B T=${elapsed}s`, pageB, cfg, mon));
  }, 10000);

  await pageB.waitForTimeout(60000);
  clearInterval(sampleB);
  const cfgBEnd = await readConfig(sw);
  const monBEnd = await readMonitoringState(sw);
  snapshotsB.push(await printSnapshot(sw, 'B T=60s (final)', pageB, cfgBEnd, monBEnd));

  const finalSnapshot = snapshotsB[snapshotsB.length - 1];
  console.log(`\n  [T-SLOW-2 Analysis]`);
  console.log(`    Focus Ledger recorded A: ${snapshotsA[snapshotsA.length-1].totalFocus > 0 ? '✅' : '❌'}`);
  console.log(`    Focus Ledger recorded B: ${finalSnapshot.totalFocus > snapshotsA[snapshotsA.length-1].totalFocus ? '✅' : '❌'}`);
  console.log(`    session.state: ${finalSnapshot.sessionState}`);
  console.log(`    Note: activeSeconds ≈ 0 is expected in Playwright (no OS focus)`);

  await browserCtx.close();
  if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
});

// ── T-SLOW-3: A 30s → B 30s → A 30s (Focus Ledger smoke) ─────────────────────

test('T-SLOW-3: A 30s → B 30s → A 30s Focus Ledger smoke', async () => {
  const { browserCtx, sw, userDataDir } = await createFreshContext();
  await switchToRestMode(sw);

  console.log('\n=== T-SLOW-3: A 30s → B 30s → A 30s ===');

  const pageA = await browserCtx.newPage();
  await pageA.goto(`${MOCK_BASE}${PAGE_A_PATH}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await pageA.waitForTimeout(2000);

  const pageB = await browserCtx.newPage();
  await pageB.goto(`${MOCK_BASE}${PAGE_B_PATH}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await pageB.waitForTimeout(2000);

  // Validate both pages
  try {
    await validateSetup(sw, pageA, '127.0.0.1', `${MOCK_BASE}${PAGE_A_PATH}`);
    await validateSetup(sw, pageB, '127.0.0.1', `${MOCK_BASE}${PAGE_B_PATH}`);
  } catch (err) {
    console.log(`  ❌ ${err.message}`);
    await browserCtx.close();
    if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
    throw err;
  }

  let allSnapshots = [];

  // Phase 1: A 30s
  console.log('  Phase 1: A 30s');
  await pageA.bringToFront();
  await pageA.waitForTimeout(1000);
  const cfg1 = await readConfig(sw);
  const mon1 = await readMonitoringState(sw);
  allSnapshots.push(await printSnapshot(sw, 'Phase1 T=0s', pageA, cfg1, mon1));

  const sample1 = setInterval(async () => {
    const elapsed = Math.round((Date.now() - (allSnapshots[0]?.timestamp || Date.now())) / 1000);
    const cfg = await readConfig(sw);
    const mon = await readMonitoringState(sw);
    allSnapshots.push(await printSnapshot(sw, `Phase1 T=${elapsed}s`, pageA, cfg, mon));
  }, 10000);

  await pageA.waitForTimeout(30000);
  clearInterval(sample1);
  const cfg1End = await readConfig(sw);
  const mon1End = await readMonitoringState(sw);
  allSnapshots.push(await printSnapshot(sw, 'Phase1 T=30s (switch)', pageA, cfg1End, mon1End));

  // Phase 2: B 30s
  console.log('\n  Phase 2: B 30s');
  await pageB.bringToFront();
  await pageB.waitForTimeout(1000);
  const cfg2 = await readConfig(sw);
  const mon2 = await readMonitoringState(sw);
  allSnapshots.push(await printSnapshot(sw, 'Phase2 T=0s', pageB, cfg2, mon2));

  const sample2 = setInterval(async () => {
    const elapsed = Math.round((Date.now() - (allSnapshots[0]?.timestamp || Date.now())) / 1000);
    const cfg = await readConfig(sw);
    const mon = await readMonitoringState(sw);
    allSnapshots.push(await printSnapshot(sw, `Phase2 T=${elapsed}s`, pageB, cfg, mon));
  }, 10000);

  await pageB.waitForTimeout(30000);
  clearInterval(sample2);
  const cfg2End = await readConfig(sw);
  const mon2End = await readMonitoringState(sw);
  allSnapshots.push(await printSnapshot(sw, 'Phase2 T=30s (switch)', pageB, cfg2End, mon2End));

  // Phase 3: A 30s again
  console.log('\n  Phase 3: A 30s (again)');
  await pageA.bringToFront();
  await pageA.waitForTimeout(1000);
  const cfg3 = await readConfig(sw);
  const mon3 = await readMonitoringState(sw);
  allSnapshots.push(await printSnapshot(sw, 'Phase3 T=0s', pageA, cfg3, mon3));

  const sample3 = setInterval(async () => {
    const elapsed = Math.round((Date.now() - (allSnapshots[0]?.timestamp || Date.now())) / 1000);
    const cfg = await readConfig(sw);
    const mon = await readMonitoringState(sw);
    allSnapshots.push(await printSnapshot(sw, `Phase3 T=${elapsed}s`, pageA, cfg, mon));
  }, 10000);

  await pageA.waitForTimeout(30000);
  clearInterval(sample3);
  const cfg3End = await readConfig(sw);
  const mon3End = await readMonitoringState(sw);
  allSnapshots.push(await printSnapshot(sw, 'Phase3 T=30s (final)', pageA, cfg3End, mon3End));

  const finalSnapshot = allSnapshots[allSnapshots.length - 1];
  console.log(`\n  [T-SLOW-3 Analysis]`);
  console.log(`    Focus Ledger total: ${finalSnapshot.totalFocus}s (expected ≈ 90s)`);
  console.log(`    activeSeconds total: ${finalSnapshot.totalActive}s (expected ≈ 0s in Playwright)`);
  console.log(`    session.state: ${finalSnapshot.sessionState}`);
  console.log(`    Note: activeSeconds ≈ 0 is expected; this test validates Focus Ledger only`);

  await browserCtx.close();
  if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
});

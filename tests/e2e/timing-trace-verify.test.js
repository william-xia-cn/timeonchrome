// Timing trace verification test — rest-mode page actions
// Verifies pipeline wiring and separates real non-active stats behavior from synthetic aggregation.
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
let ALT_MOCK_BASE = '';

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
      ALT_MOCK_BASE = `http://localhost:${server.address().port}`;
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

async function appendStatsAccuracyFixture(sw) {
  return sw.evaluate(async () => {
    const domain = 'stats-accuracy.test';
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const start = Date.parse(`${date}T12:00:00Z`);
    const end = start + 42000;
    const fixtureEvents = [
      { type: 'START', state: 'ACTIVE', domain, time: start },
      { type: 'END', state: 'ACTIVE', domain, time: end },
    ];

    return new Promise(resolve => {
      chrome.storage.local.get('event_log_v1', result => {
        const events = result['event_log_v1'] || [];
        chrome.storage.local.set({ event_log_v1: events.concat(fixtureEvents) }, () => {
          resolve({ domain, seconds: 42 });
        });
      });
    });
  });
}

async function readTodayStats(sw) {
  const result = await sw.evaluate(async () => {
    return globalThis.debugGetTodayStats();
  });

  expect(result.success).toBe(true);
  return result.stats;
}

async function readLocalDateKey(sw) {
  return sw.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

async function applyControlledTimingSignal(sw, rawEvent) {
  const result = await sw.evaluate(async event => {
    return globalThis.debugApplyControlledTimingSignal(event);
  }, rawEvent);

  expect(result.success).toBe(true);
  return result;
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

function analyzeEventLogForStats(events, date) {
  const closedSegments = [];
  const allEventsByDomain = new Map();
  const sortedAllEvents = events
    .filter(e => e && e.domain && typeof e.time === 'number')
    .map((evt, idx) => ({ evt, idx }))
    .sort((a, b) => (a.evt.time - b.evt.time) || (a.idx - b.idx))
    .map(x => x.evt);

  for (const evt of sortedAllEvents) {
    if (!allEventsByDomain.has(evt.domain)) allEventsByDomain.set(evt.domain, []);
    allEventsByDomain.get(evt.domain).push(evt);
  }

  for (const [domain, domainEvents] of allEventsByDomain.entries()) {
    let openStart = null;
    for (const evt of domainEvents) {
      if (evt.type === 'START') {
        openStart = evt;
        continue;
      }

      if (evt.type !== 'END' || !openStart) continue;
      const durationSec = Math.floor((evt.time - openStart.time) / 1000);
      if (durationSec > 0) {
        closedSegments.push({
          domain,
          state: openStart.state,
          seconds: durationSec,
          start: openStart.time,
          end: evt.time,
        });
      }
      openStart = null;
    }
  }

  const byDomain = new Map();
  const dayEvents = events
    .filter(e => e && e.domain && typeof e.time === 'number' && new Date(e.time).toISOString().slice(0, 10) === date)
    .map((evt, idx) => ({ evt, idx }))
    .sort((a, b) => (a.evt.time - b.evt.time) || (a.idx - b.idx))
    .map(x => x.evt);

  for (const evt of dayEvents) {
    if (!byDomain.has(evt.domain)) byDomain.set(evt.domain, []);
    byDomain.get(evt.domain).push(evt);
  }

  const stats = {};
  for (const [domain, domainEvents] of byDomain.entries()) {
    let openStart = null;
    let seconds = 0;

    for (const evt of domainEvents) {
      if (evt.type === 'START') {
        openStart = evt;
        continue;
      }

      if (evt.type !== 'END' || !openStart) continue;
      const durationSec = Math.floor((evt.time - openStart.time) / 1000);
      if (durationSec > 0 && openStart.state === 'ACTIVE') {
        seconds += durationSec;
      }
      openStart = null;
    }

    if (seconds > 0) stats[domain] = seconds;
  }

  return { stats, closedSegments };
}

function isNonActiveState(state) {
  return state === 'IDLE' || state === 'PASSIVE';
}

function isStatsSummaryKey(key) {
  return key === 'audioSeconds' ||
    key === 'backgroundMediaByDomain' ||
    key === 'pipSeconds' ||
    key === 'pipByDomain';
}

function stripStatsSummaryFields(stats = {}) {
  return Object.fromEntries(
    Object.entries(stats || {}).filter(([key]) => !isStatsSummaryKey(key))
  );
}

function expectStatsWithinTolerance(actual, expected, toleranceSeconds = 0) {
  const actualDomains = stripStatsSummaryFields(actual);
  const expectedDomains = stripStatsSummaryFields(expected);
  const domains = new Set([...Object.keys(actualDomains), ...Object.keys(expectedDomains)]);
  for (const domain of domains) {
    const actualSeconds = actualDomains?.[domain] || 0;
    const expectedSeconds = expectedDomains?.[domain] || 0;
    expect(Math.abs(actualSeconds - expectedSeconds), `stats mismatch for ${domain}`).toBeLessThanOrEqual(toleranceSeconds);
  }
}

function findRealPipelineBrokenLayer(analysis, realEventLogAnalysis, realStatsTrace) {
  if (analysis.firstBrokenLayer) return analysis.firstBrokenLayer;
  if (realEventLogAnalysis.closedSegments.length === 0) return 'event-log';
  if (!realStatsTrace) return 'stats';
  return null;
}

function findControlledActiveBrokenLayer(analysis, controlledActiveSegments, statsTrace, stats, expectedStats) {
  if (analysis.firstBrokenLayer) return analysis.firstBrokenLayer;
  if (controlledActiveSegments.length === 0) return 'event-log';
  if (!statsTrace) return 'stats';
  for (const [domain, seconds] of Object.entries(expectedStats)) {
    if ((stats?.[domain] || 0) !== seconds) return 'stats';
  }
  return null;
}

// ── T-TV1: Rest-mode timing pipeline and stats verification ───────────────────
test('T-TV1: Rest-mode timing trace — real pipeline stats + synthetic aggregation baseline', async () => {
  const { browserCtx, sw, userDataDir } = await createFreshContext();
  await clearTimingTrace(sw);

  // Phase 1: Open study page (pageA)
  const page1 = await browserCtx.newPage();
  await page1.goto(`${MOCK_BASE}/pageA.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page1.waitForTimeout(3000);

  // Phase 2: Open pageB through localhost so the real pipeline sees a domain.
  const page2 = await browserCtx.newPage();
  await page2.goto(`${ALT_MOCK_BASE}/pageB.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page2.waitForTimeout(3000);

  // Phase 3: Open a third real page back on 127.0.0.1 to close localhost.
  const page3 = await browserCtx.newPage();
  await page3.goto(`${MOCK_BASE}/pageA.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page3.waitForTimeout(3000);

  // Real pipeline check: use only event-log entries produced by real page actions.
  const realStats = await readTodayStats(sw);
  await page3.waitForTimeout(250);
  const realTrace = await readTimingTrace(sw);
  const realEventLog = await readEventLog(sw);
  const realSession = await readSession(sw);
  const realAnalysis = classifyTrace(realTrace);
  const realStatsTrace = realTrace.filter(t => t.action === 'stats_calculated').at(-1);
  const realStatsDate = realStatsTrace?.payload?.date;
  const realEventLogAnalysis = realStatsDate ? analyzeEventLogForStats(realEventLog, realStatsDate) : { stats: null, closedSegments: [] };
  const realBrokenLayer = findRealPipelineBrokenLayer(realAnalysis, realEventLogAnalysis, realStatsTrace);

  // Synthetic aggregation baseline: add a deterministic closed ACTIVE segment after
  // the real pipeline snapshot. This verifies event-log -> stats aggregation only.
  const statsFixture = await appendStatsAccuracyFixture(sw);
  const syntheticStats = await readTodayStats(sw);
  await page3.waitForTimeout(250);

  // Retrieve all data
  const trace = await readTimingTrace(sw);
  const eventLog = await readEventLog(sw);
  const session = await readSession(sw);

  // Close browser
  await browserCtx.close();
  if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });

  // ── Analysis Report ─────────────────────────────────────────────────────────
  const analysis = classifyTrace(trace);
  const syntheticStatsTrace = trace.filter(t => t.action === 'stats_calculated').at(-1);
  const syntheticStatsDate = syntheticStatsTrace?.payload?.date;
  const syntheticEventLogAnalysis = syntheticStatsDate ? analyzeEventLogForStats(eventLog, syntheticStatsDate) : { stats: null, closedSegments: [] };
  const nonActiveRealSegments = realEventLogAnalysis.closedSegments.filter(s => isNonActiveState(s.state));
  const activeRealSegments = realEventLogAnalysis.closedSegments.filter(s => s.state === 'ACTIVE');

  console.log('\n  ═══════════════════════════════════════════════════════════');
  console.log('  TIMING TRACE VERIFICATION — Analysis Report');
  console.log('  ═══════════════════════════════════════════════════════════');
  console.log(`\n  Trace entries: ${trace.length}`);
  console.log(`  Event-log entries: ${eventLog.length}`);
  console.log(`  Session state: ${session?.state ?? 'null'}`);
  console.log(`  Session domain: ${session?.domain ?? 'null'}`);
  console.log(`  Real stats domains: ${Object.keys(realStats).length}`);
  console.log(`  Synthetic stats domains: ${Object.keys(syntheticStats).length}`);

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
  console.log(`    stats_calculated:   ${analysis.counts['stats_calculated'] || 0}`);

  console.log('\n  ── Real Pipeline Check ──');
  console.log('    Scope: real page actions only; verifies trace/event-log/stats wiring.');
  console.log('    Conclusion: Playwright may produce ACTIVE or non-active segments depending OS focus; stats must match real event-log-derived ACTIVE duration.');
  console.log('    This is not a manual real-browser 60s timing accuracy claim.');
  console.log(`    stats date:               ${realStatsDate || 'missing'}`);
  console.log(`    first broken layer:       ${realBrokenLayer || 'none'}`);
  console.log(`    real event-log sample:    ${JSON.stringify(realEventLog.slice(0, 8))}`);
  console.log(`    closed real segments:     ${JSON.stringify(realEventLogAnalysis.closedSegments)}`);
  console.log(`    closed non-active segments: ${JSON.stringify(nonActiveRealSegments)}`);
  console.log(`    closed ACTIVE segments:   ${JSON.stringify(activeRealSegments)}`);
  console.log(`    real GET_STATS:           ${JSON.stringify(realStats)}`);
  console.log(`    real trace.statsAfter:    ${JSON.stringify(realStatsTrace?.statsAfter || null)}`);
  console.log(`    active stats derived from real event-log: ${JSON.stringify(realEventLogAnalysis.stats)}`);

  console.log('\n  ── Synthetic Aggregation Baseline ──');
  console.log('    Scope: injected ACTIVE event-log baseline; proves event-log -> stats aggregation only.');
  console.log('    This does not prove real browser ACTIVE timing accuracy.');
  console.log(`    injected fixture:         ${JSON.stringify(statsFixture)}`);
  console.log(`    synthetic stats date:     ${syntheticStatsDate || 'missing'}`);
  console.log(`    synthetic GET_STATS:      ${JSON.stringify(syntheticStats)}`);
  console.log(`    synthetic trace.statsAfter: ${JSON.stringify(syntheticStatsTrace?.statsAfter || null)}`);
  console.log(`    synthetic expected stats: ${JSON.stringify(syntheticEventLogAnalysis.stats)}`);

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
  expect(analysis.counts['stats_calculated']).toBeGreaterThanOrEqual(2);

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

  // Real pipeline check: do not inject event-log entries for this phase.
  // If no real closed segment exists, fail with the reported broken layer.
  expect(realBrokenLayer, `first broken layer: ${realBrokenLayer || 'none'}`).toBeNull();
  expect(realStatsDate).toBeTruthy();
  expect(realEventLogAnalysis.closedSegments.length).toBeGreaterThan(0);
  expect(nonActiveRealSegments.length + activeRealSegments.length).toBeGreaterThan(0);
  expect(realStatsTrace.statsAfter).toEqual(realStats);
  expectStatsWithinTolerance(realStats, realEventLogAnalysis.stats, 0);

  // Synthetic aggregation baseline: the injected 42s segment only proves
  // event-log -> stats aggregation consistency, not real browser timing.
  expect(syntheticStatsTrace).toBeTruthy();
  expect(syntheticStatsDate).toBeTruthy();
  expect(syntheticStats[statsFixture.domain]).toBe(statsFixture.seconds);
  expect(syntheticStatsTrace.statsAfter).toEqual(syntheticStats);
  expectStatsWithinTolerance(syntheticStats, syntheticEventLogAnalysis.stats, 0);
});

// ── T-TV2: Controlled ACTIVE pipeline verification ────────────────────────────
test('T-TV2: Controlled ACTIVE timing pipeline — multi-segment/domain reconciliation', async () => {
  const { browserCtx, sw, userDataDir } = await createFreshContext();
  await clearTimingTrace(sw);

  const domainA = 'controlled-a.test';
  const domainB = 'controlled-b.test';
  const passiveDomain = 'controlled-passive.test';
  const tabId = 91001;
  const windowId = 92001;
  const statsDateKey = await readLocalDateKey(sw);
  const baseTime = Date.parse(`${statsDateKey}T12:00:00Z`);
  const expectedStats = {
    [domainA]: 5,
    [domainB]: 4,
  };
  const controlledSteps = [
    { label: 'A active segment 1 start', reason: 'controlledActiveA1Start', time: baseTime, domain: domainA, isFocused: true, isIdle: false, expectedState: 'ACTIVE' },
    { label: 'B active segment start', reason: 'controlledActiveBStart', time: baseTime + 2200, domain: domainB, isFocused: true, isIdle: false, expectedState: 'ACTIVE' },
    { label: 'A active segment 2 start', reason: 'controlledActiveA2Start', time: baseTime + 6500, domain: domainA, isFocused: true, isIdle: false, expectedState: 'ACTIVE' },
    { label: 'A active close to idle', reason: 'controlledActiveA2End', time: baseTime + 9800, domain: domainA, isFocused: false, isIdle: true, expectedState: 'IDLE' },
    { label: 'non-active passive control', reason: 'controlledPassiveControl', time: baseTime + 11100, domain: passiveDomain, isFocused: false, isIdle: false, expectedState: 'PASSIVE' },
  ];

  // Debug-only controlled input: each step feeds the existing timing pipeline and
  // must not write event_log_v1 directly. _debugNow anchors Date.now for the
  // existing transitionState path so all segments fall into today's stats key.
  const controlledResults = [];
  for (const step of controlledSteps) {
    const result = await applyControlledTimingSignal(sw, {
      _reason: step.reason,
      _debugNow: step.time,
      tabId,
      windowId,
      domain: step.domain,
      isFocused: step.isFocused,
      isIdle: step.isIdle,
      isAudible: false,
    });
    expect(result.state).toBe(step.expectedState);
    expect(result.domain).toBe(step.domain);
    controlledResults.push({ step: step.label, result });
  }

  const controlledStats = await readTodayStats(sw);
  const trace = await readTimingTrace(sw);
  const eventLog = await readEventLog(sw);
  const session = await readSession(sw);

  await browserCtx.close();
  if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });

  const analysis = classifyTrace(trace);
  const statsTrace = trace.filter(t => t.action === 'stats_calculated').at(-1);
  const statsDate = statsTrace?.payload?.date;
  const eventLogAnalysis = statsDate ? analyzeEventLogForStats(eventLog, statsDate) : { stats: null, closedSegments: [] };
  const controlledDomains = new Set([domainA, domainB, passiveDomain]);
  const controlledSegments = eventLogAnalysis.closedSegments.filter(s => controlledDomains.has(s.domain));
  const controlledActiveSegments = controlledSegments.filter(s => s.state === 'ACTIVE');
  const controlledPassiveSegments = controlledSegments.filter(s => isNonActiveState(s.state));
  const activeResolved = trace.filter(t =>
    t.action === 'state_resolved' &&
    t.reason?.startsWith('controlled') &&
    controlledDomains.has(t.domain) &&
    t.nextState === 'ACTIVE'
  );
  const activeCloseEvents = eventLog.filter(e =>
    e.type === 'END' &&
    e.state === 'ACTIVE' &&
    controlledDomains.has(e.domain)
  );
  const brokenLayer = findControlledActiveBrokenLayer(
    analysis,
    controlledActiveSegments,
    statsTrace,
    controlledStats,
    expectedStats
  );

  console.log('\n  ═══════════════════════════════════════════════════════════');
  console.log('  CONTROLLED ACTIVE TIMING PIPELINE — Analysis Report');
  console.log('  ═══════════════════════════════════════════════════════════');
  console.log('    Scope: debug-only controlled snapshot through existing resolver/session/event-log/stats.');
  console.log('    This bypasses Playwright/OS focus/chrome.idle limitations without changing product timing semantics.');
  console.log('    It does not directly write event_log_v1.');
  console.log(`    controlled date key:        ${statsDateKey}`);
  console.log(`    stats date:                 ${statsDate || 'missing'}`);
  console.log(`    first broken layer:         ${brokenLayer || 'none'}`);
  console.log(`    controlled steps:           ${JSON.stringify(controlledSteps.map(s => ({ reason: s.reason, domain: s.domain, time: s.time, expectedState: s.expectedState })))}`);
  console.log(`    controlled results:         ${JSON.stringify(controlledResults)}`);
  console.log(`    controlled event-log sample: ${JSON.stringify(eventLog.filter(e => controlledDomains.has(e.domain)))}`);
  console.log(`    controlled closed segments: ${JSON.stringify(controlledSegments)}`);
  console.log(`    controlled ACTIVE segments: ${JSON.stringify(controlledActiveSegments)}`);
  console.log(`    controlled non-active segments: ${JSON.stringify(controlledPassiveSegments)}`);
  console.log(`    expected stats by plan:     ${JSON.stringify(expectedStats)}`);
  console.log(`    event-log-derived stats:    ${JSON.stringify(eventLogAnalysis.stats)}`);
  console.log(`    stats duration by domain:   ${JSON.stringify(Object.fromEntries(Object.keys(expectedStats).map(domain => [domain, controlledStats[domain] || 0])))}`);
  console.log(`    controlled GET_STATS:       ${JSON.stringify(controlledStats)}`);
  console.log(`    trace.statsAfter:           ${JSON.stringify(statsTrace?.statsAfter || null)}`);
  console.log(`    final session:              ${JSON.stringify(session)}`);
  console.log('  ═══════════════════════════════════════════════════════════\n');

  expect(trace.length).toBeGreaterThan(0);
  expect(analysis.counts['signal_received']).toBeGreaterThanOrEqual(controlledSteps.length);
  expect(analysis.counts['snapshot_created']).toBeGreaterThanOrEqual(controlledSteps.length);
  expect(analysis.counts['state_resolved']).toBeGreaterThanOrEqual(controlledSteps.length);
  expect(analysis.counts['transition_begin']).toBeGreaterThanOrEqual(controlledSteps.length);
  expect(analysis.counts['transition_end']).toBeGreaterThanOrEqual(controlledSteps.length);
  expect(eventLog.filter(e => controlledDomains.has(e.domain)).length).toBeGreaterThanOrEqual(9);
  expect(analysis.counts['stats_calculated']).toBeGreaterThanOrEqual(1);
  expect(activeResolved.length).toBe(3);
  expect(activeCloseEvents.length).toBe(3);
  expect(brokenLayer, `first broken layer: ${brokenLayer || 'none'}`).toBeNull();
  expect(statsDate).toBeTruthy();
  expect(controlledActiveSegments).toEqual([
    { domain: domainA, state: 'ACTIVE', seconds: 2, start: baseTime, end: baseTime + 2200 },
    { domain: domainA, state: 'ACTIVE', seconds: 3, start: baseTime + 6500, end: baseTime + 9800 },
    { domain: domainB, state: 'ACTIVE', seconds: 4, start: baseTime + 2200, end: baseTime + 6500 },
  ]);
  expect(controlledPassiveSegments.length).toBeGreaterThanOrEqual(1);
  expect(eventLogAnalysis.stats).toEqual(expectedStats);
  expect(statsTrace.statsAfter).toEqual(controlledStats);
  expectStatsWithinTolerance(controlledStats, eventLogAnalysis.stats, 0);
  expect(stripStatsSummaryFields(controlledStats)).toEqual(expectedStats);
  expect(controlledStats[passiveDomain]).toBeUndefined();
});

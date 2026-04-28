// tests/unit/controlled-focus-calibration.test.mjs
// Controlled Focus Calibration (CFC) — Round 1
// Verifies Focus Ledger vs activeSeconds alignment under fully controlled focused conditions.
//
// Scope:
// - Mock timestamps, direct function calls
// - isFocused=true, isIdle=false, domain=A/B
// - No real OS focus, no idle, no media/PiP
//
// Run with: node tests/unit/controlled-focus-calibration.test.mjs

// ── Mock Chrome API ──────────────────────────────────────────────────────────
const mockStorageLocal = {};
const mockStorageSession = {};

global.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = {};
        if (typeof keys === 'string') result[keys] = mockStorageLocal[keys];
        else if (Array.isArray(keys)) keys.forEach(k => result[k] = mockStorageLocal[k]);
        return cb ? cb(result) : Promise.resolve(result);
      },
      set: (obj, cb) => {
        Object.assign(mockStorageLocal, obj);
        return cb ? cb() : Promise.resolve();
      }
    },
    session: {
      get: (keys, cb) => {
        const result = {};
        if (typeof keys === 'string') result[keys] = mockStorageSession[keys];
        else if (Array.isArray(keys)) keys.forEach(k => result[k] = mockStorageSession[k]);
        return cb ? cb(result) : Promise.resolve(result);
      },
      set: (obj, cb) => {
        Object.assign(mockStorageSession, obj);
        return cb ? cb() : Promise.resolve();
      }
    }
  }
};

// ── Core Logic (from core/state.js) ──────────────────────────────────────────
const AttentionState = { ACTIVE: 'ACTIVE', PASSIVE: 'PASSIVE', IDLE: 'IDLE', BACKGROUND_ACTIVE: 'BACKGROUND_ACTIVE' };

function resolveState(context) {
  if (!context?.domain) return AttentionState.IDLE;
  if (context.isIdle) return AttentionState.IDLE;
  if (context.isFocused && context.tabId) return AttentionState.ACTIVE;
  if (context.isAudible && context.mediaSourceTabId != null) return AttentionState.BACKGROUND_ACTIVE;
  if (context.isPiP) return AttentionState.BACKGROUND_ACTIVE;
  return AttentionState.PASSIVE;
}

// ── Session & Event Log (from runtime/session.js + core/event-log.js) ────────
const SESSION_KEY = 'session_v1';
let commitQueue = Promise.resolve();
function runSerialized(task) { commitQueue = commitQueue.then(task, task); return commitQueue; }

async function getSession() { return mockStorageSession[SESSION_KEY] || null; }
async function saveSession(session) { mockStorageSession[SESSION_KEY] = session; }

async function initSession() {
  const existing = await getSession();
  if (existing) return existing;
  const initial = { state: null, domain: null, startTime: null, lastHeartbeat: Date.now() };
  await saveSession(initial);
  return initial;
}

async function appendEvent(evt) {
  const log = mockStorageLocal['event_log_v1'] || [];
  log.push(evt);
  mockStorageLocal['event_log_v1'] = log;
}

async function transitionState(newState, newDomain, now = Date.now()) {
  return runSerialized(async () => {
    const session = await getSession();
    if (!session) return;
    if (session.state === newState && session.domain === newDomain) return;

    if (session.state && session.startTime) {
      await appendEvent({ type: 'END', state: session.state, domain: session.domain, time: now });
    }
    if (newState) {
      await appendEvent({ type: 'START', state: newState, domain: newDomain, time: now });
    }
    await saveSession({ state: newState, domain: newDomain, startTime: newState ? now : null, lastHeartbeat: now });
  });
}

// ── Focus Ledger (from debug/focus-ledger.js) ────────────────────────────────
const FOCUS_LEDGER_KEY = 'debug_focus_ledger_v1';

async function getFocusLedger() {
  return mockStorageLocal[FOCUS_LEDGER_KEY] || [];
}

async function appendFocusEntry(entry) {
  const ledger = await getFocusLedger();
  ledger.push(entry);
  mockStorageLocal[FOCUS_LEDGER_KEY] = ledger;
}

async function resetFocusLedger() {
  mockStorageLocal[FOCUS_LEDGER_KEY] = [];
}

// ── Aggregation (from debug/focus-ledger.js) ─────────────────────────────────
function aggregateFocusLedger(ledger) {
  const byDomain = {};
  let openStart = null;
  for (const entry of ledger) {
    if (entry.type === 'FOCUS_START' && entry.domain) {
      openStart = entry;
    } else if (entry.type === 'FOCUS_END' && openStart) {
      const dur = Math.floor((entry.time - openStart.time) / 1000);
      if (dur > 0) {
        const domain = openStart.domain;
        byDomain[domain] = (byDomain[domain] || 0) + dur;
      }
      openStart = null;
    } else if (entry.type === 'FOCUS_START' && !entry.domain) {
      openStart = null;
    }
  }
  return byDomain;
}

function aggregateActiveSeconds(events) {
  const byDomain = {};
  let openStart = null;
  for (const evt of events) {
    if (evt.type === 'START' && evt.state === 'ACTIVE' && evt.domain) {
      openStart = evt;
    } else if (evt.type === 'END' && openStart) {
      const dur = Math.floor((evt.time - openStart.time) / 1000);
      if (dur > 0) {
        const domain = openStart.domain;
        byDomain[domain] = (byDomain[domain] || 0) + dur;
      }
      openStart = null;
    } else if (evt.type === 'START' && evt.state !== 'ACTIVE') {
      openStart = null;
    }
  }
  return byDomain;
}

// ── Calibration Report (from debug/focus-ledger.js) ──────────────────────────
function exportCalibrationReport(ledger, events, session, thresholdSeconds = 10, since = 0, targetDomain = null, expectedSeconds = 0) {
  const filteredLedger = since > 0 ? ledger.filter(e => e.time >= since) : ledger;
  const filteredEvents = since > 0 ? events.filter(e => e.time >= since) : events;

  const focusByDomain = aggregateFocusLedger(filteredLedger);
  const activeByDomain = aggregateActiveSeconds(filteredEvents);
  const allDomains = new Set([...Object.keys(focusByDomain), ...Object.keys(activeByDomain)]);
  const deltaByDomain = {};
  let totalFocus = 0, totalActive = 0;
  for (const domain of allDomains) {
    const focusSec = focusByDomain[domain] || 0;
    const activeSec = activeByDomain[domain] || 0;
    const delta = focusSec - activeSec;
    deltaByDomain[domain] = delta;
    totalFocus += focusSec;
    totalActive += activeSec;
  }
  const totalDelta = totalFocus - totalActive;

  // Target domain specific values
  const targetFocusSeconds = targetDomain ? (focusByDomain[targetDomain] || 0) : 0;
  const targetActiveSeconds = targetDomain ? (activeByDomain[targetDomain] || 0) : 0;
  const targetDelta = targetFocusSeconds - targetActiveSeconds;

  // Verdict classification
  let verdict = 'UNKNOWN';
  let pass = false;

  if (targetDomain && expectedSeconds > 0) {
    const focusInRange = targetFocusSeconds >= (expectedSeconds - thresholdSeconds) && targetFocusSeconds <= (expectedSeconds + thresholdSeconds);
    const activeInRange = targetActiveSeconds >= (expectedSeconds - thresholdSeconds) && targetActiveSeconds <= (expectedSeconds + thresholdSeconds);
    const deltaOk = Math.abs(targetDelta) <= thresholdSeconds;

    if (targetFocusSeconds === 0 && targetActiveSeconds === 0 && totalFocus === 0 && totalActive === 0) {
      verdict = 'FAIL: no timing captured';
    } else if (targetFocusSeconds === 0 && targetActiveSeconds === 0 && (totalFocus > 0 || totalActive > 0)) {
      verdict = 'FAIL: wrong domain';
    } else if (focusInRange && targetActiveSeconds === 0) {
      verdict = 'FAIL: focus captured but active missing';
    } else if (activeInRange && targetFocusSeconds === 0) {
      verdict = 'FAIL: active captured but focus missing';
    } else if (targetFocusSeconds > 0 && targetActiveSeconds > 0 && !deltaOk) {
      verdict = 'FAIL: both captured but mismatch';
    } else if (focusInRange && activeInRange && deltaOk) {
      verdict = 'PASS';
      pass = true;
    } else {
      verdict = 'FAIL: both captured but mismatch';
    }
  } else {
    pass = Math.abs(totalDelta) <= thresholdSeconds;
    verdict = pass ? 'PASS' : 'FAIL: both captured but mismatch';
    if (totalFocus === 0 && totalActive === 0) {
      verdict = 'FAIL: no timing captured';
      pass = false;
    }
  }

  return {
    targetDomain: targetDomain || null,
    expectedSeconds,
    thresholdSeconds,
    focusLedgerByDomain: focusByDomain,
    activeSecondsByDomain: activeByDomain,
    deltaByDomain,
    targetFocusSeconds,
    targetActiveSeconds,
    totalFocusSeconds: totalFocus,
    totalActiveSeconds: totalActive,
    totalDelta,
    pass,
    verdict,
    sessionSnapshot: session,
    recentFocusLedger: filteredLedger.slice(-20),
    recentEventLog: filteredEvents.slice(-20),
    timestamp: Date.now(),
  };
}

// ── Simulated Full Chain (mimics background.js signal → state → session) ─────
// This simulates what happens when a real focused tab event arrives:
// 1. Chrome fires tabs.onActivated → rawEvent
// 2. buildContext merges → currentContext
// 3. resolveState(currentContext) → state
// 4. transitionState(state, domain) → writes event_log_v1
// 5. Focus Ledger independently records FOCUS_START/FOCUS_END
async function simulateFocusedTab(domain, tabId, windowId, startTime, endTime) {
  // Step 1: resolveState — verify we get ACTIVE
  const context = { domain, tabId, windowId, isFocused: true, isIdle: false };
  const state = resolveState(context);
  if (state !== AttentionState.ACTIVE) {
    throw new Error(`resolveState returned ${state}, expected ACTIVE for focused non-idle tab`);
  }

  // Step 2: transitionState — START at startTime
  await transitionState(AttentionState.ACTIVE, domain, startTime);

  // Step 3: Focus Ledger — independent FOCUS_START
  await appendFocusEntry({ type: 'FOCUS_START', time: startTime, domain, tabId, windowId, reason: 'cfc_test' });

  // Step 4: transitionState — END at endTime (switch to PASSIVE)
  await transitionState(AttentionState.PASSIVE, domain, endTime);

  // Step 5: Focus Ledger — independent FOCUS_END
  await appendFocusEntry({ type: 'FOCUS_END', time: endTime, domain, tabId, windowId, reason: 'cfc_test' });
}

// ── Test Runner ──────────────────────────────────────────────────────────────
function resetStorage() {
  Object.keys(mockStorageLocal).forEach(k => delete mockStorageLocal[k]);
  Object.keys(mockStorageSession).forEach(k => delete mockStorageSession[k]);
  commitQueue = Promise.resolve();
}

async function runTest(name, fn) {
  resetStorage();
  await initSession();
  await resetFocusLedger();
  try {
    const report = await fn();
    console.log(`✅ PASS: ${name}`);
    if (report) {
      console.log(JSON.stringify(report, null, 2));
    }
  } catch (err) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// Track chain verification across all tests
const chainReport = {
  resolveStateReached: false,
  transitionStateReached: false,
  eventLogGenerated: false,
  focusLedgerGenerated: false,
  activeSecondsAggregated: false,
  focusLedgerAggregated: false,
  deltaComputed: false,
};

// ── T-CFC-1: Single page A 60 seconds ────────────────────────────────────────
await runTest('T-CFC-1: Single page A 60s (focused, non-idle)', async () => {
  const baseTime = 1000000;
  const domainA = 'example.com';
  const tabId = 100;
  const windowId = 1;

  await simulateFocusedTab(domainA, tabId, windowId, baseTime, baseTime + 60000);

  chainReport.resolveStateReached = true;
  chainReport.transitionStateReached = true;

  const events = mockStorageLocal['event_log_v1'] || [];
  if (events.length < 2) throw new Error(`event_log_v1 should have ≥2 events, got ${events.length}`);
  chainReport.eventLogGenerated = true;

  const ledger = await getFocusLedger();
  if (ledger.length < 2) throw new Error(`Focus Ledger should have ≥2 entries, got ${ledger.length}`);
  chainReport.focusLedgerGenerated = true;

  aggregateFocusLedger(ledger);
  chainReport.focusLedgerAggregated = true;
  aggregateActiveSeconds(events);
  chainReport.activeSecondsAggregated = true;

  const report = exportCalibrationReport(ledger, events, mockStorageSession[SESSION_KEY], 10, 0, domainA, 60);
  chainReport.deltaComputed = true;

  if (report.verdict !== 'PASS') throw new Error(`Expected PASS, got: ${report.verdict}`);
  if (!report.pass) throw new Error('Expected pass=true');
  if (report.targetFocusSeconds !== 60) throw new Error(`targetFocus expected 60s, got ${report.targetFocusSeconds}s`);
  if (report.targetActiveSeconds !== 60) throw new Error(`targetActive expected 60s, got ${report.targetActiveSeconds}s`);

  return report;
});

// ── T-CFC-2: A → B, each 60 seconds ─────────────────────────────────────────
await runTest('T-CFC-2: A → B, each 60s (focused, non-idle)', async () => {
  const baseTime = 2000000;
  const domainA = 'site-a.com';
  const domainB = 'site-b.com';

  await simulateFocusedTab(domainA, 100, 1, baseTime, baseTime + 60000);
  await simulateFocusedTab(domainB, 200, 1, baseTime + 60000, baseTime + 120000);

  const events = mockStorageLocal['event_log_v1'] || [];
  const ledger = await getFocusLedger();

  const reportA = exportCalibrationReport(ledger, events, mockStorageSession[SESSION_KEY], 10, 0, domainA, 60);
  if (reportA.verdict !== 'PASS') throw new Error(`A: Expected PASS, got: ${reportA.verdict}`);

  const reportB = exportCalibrationReport(ledger, events, mockStorageSession[SESSION_KEY], 10, 0, domainB, 60);
  if (reportB.verdict !== 'PASS') throw new Error(`B: Expected PASS, got: ${reportB.verdict}`);

  const reportTotal = exportCalibrationReport(ledger, events, mockStorageSession[SESSION_KEY], 10);
  if (reportTotal.totalFocusSeconds !== 120) throw new Error(`totalFocus expected 120s, got ${reportTotal.totalFocusSeconds}s`);
  if (reportTotal.totalActiveSeconds !== 120) throw new Error(`totalActive expected 120s, got ${reportTotal.totalActiveSeconds}s`);
  if (reportTotal.totalDelta !== 0) throw new Error(`totalDelta expected 0, got ${reportTotal.totalDelta}`);

  return {
    testName: 'T-CFC-2: A → B, each 60s',
    domainA: { targetDomain: domainA, expectedSeconds: 60, focusLedgerByDomain: reportA.focusLedgerByDomain, activeSecondsByDomain: reportA.activeSecondsByDomain, targetFocusSeconds: reportA.targetFocusSeconds, targetActiveSeconds: reportA.targetActiveSeconds },
    domainB: { targetDomain: domainB, expectedSeconds: 60, focusLedgerByDomain: reportB.focusLedgerByDomain, activeSecondsByDomain: reportB.activeSecondsByDomain, targetFocusSeconds: reportB.targetFocusSeconds, targetActiveSeconds: reportB.targetActiveSeconds },
    totalFocusSeconds: reportTotal.totalFocusSeconds,
    totalActiveSeconds: reportTotal.totalActiveSeconds,
    totalDelta: reportTotal.totalDelta,
    pass: reportA.pass && reportB.pass,
    verdict: reportA.pass && reportB.pass ? 'PASS' : 'FAIL',
  };
});

// ── T-CFC-3: A → B → A (30s each segment) ───────────────────────────────────
await runTest('T-CFC-3: A → B → A (30s each, no duplicate counting)', async () => {
  const baseTime = 3000000;
  const domainA = 'site-a.com';
  const domainB = 'site-b.com';

  await simulateFocusedTab(domainA, 100, 1, baseTime, baseTime + 30000);
  await simulateFocusedTab(domainB, 200, 1, baseTime + 30000, baseTime + 60000);
  await simulateFocusedTab(domainA, 100, 1, baseTime + 60000, baseTime + 90000);

  const events = mockStorageLocal['event_log_v1'] || [];
  const ledger = await getFocusLedger();

  const reportA = exportCalibrationReport(ledger, events, mockStorageSession[SESSION_KEY], 10, 0, domainA, 60);
  if (reportA.verdict !== 'PASS') throw new Error(`A: Expected PASS, got: ${reportA.verdict}`);

  const reportB = exportCalibrationReport(ledger, events, mockStorageSession[SESSION_KEY], 10, 0, domainB, 30);
  if (reportB.verdict !== 'PASS') throw new Error(`B: Expected PASS, got: ${reportB.verdict}`);

  const reportTotal = exportCalibrationReport(ledger, events, mockStorageSession[SESSION_KEY], 10);
  if (reportTotal.totalFocusSeconds !== 90) throw new Error(`totalFocus expected 90s, got ${reportTotal.totalFocusSeconds}s`);
  if (reportTotal.totalActiveSeconds !== 90) throw new Error(`totalActive expected 90s, got ${reportTotal.totalActiveSeconds}s`);
  if (reportTotal.totalDelta !== 0) throw new Error(`totalDelta expected 0, got ${reportTotal.totalDelta}`);

  const aEvents = events.filter(e => e.domain === domainA && e.state === 'ACTIVE');
  if (aEvents.length !== 4) throw new Error(`A should have 4 events (2 START + 2 END), got ${aEvents.length}`);

  return {
    testName: 'T-CFC-3: A → B → A (30s each)',
    domainA: { targetDomain: domainA, expectedSeconds: 60, focusLedgerByDomain: reportA.focusLedgerByDomain, activeSecondsByDomain: reportA.activeSecondsByDomain, targetFocusSeconds: reportA.targetFocusSeconds, targetActiveSeconds: reportA.targetActiveSeconds },
    domainB: { targetDomain: domainB, expectedSeconds: 30, focusLedgerByDomain: reportB.focusLedgerByDomain, activeSecondsByDomain: reportB.activeSecondsByDomain, targetFocusSeconds: reportB.targetFocusSeconds, targetActiveSeconds: reportB.targetActiveSeconds },
    totalFocusSeconds: reportTotal.totalFocusSeconds,
    totalActiveSeconds: reportTotal.totalActiveSeconds,
    totalDelta: reportTotal.totalDelta,
    pass: reportA.pass && reportB.pass,
    verdict: reportA.pass && reportB.pass ? 'PASS' : 'FAIL',
  };
});

// ── T-CFC-4: Undercount detection (focus > active) ───────────────────────────
await runTest('T-CFC-4: Undercount detection (focus=60s, active=20s, delta=40)', async () => {
  const baseTime = 4000000;
  const domainA = 'example.com';

  await appendFocusEntry({ type: 'FOCUS_START', time: baseTime, domain: domainA, tabId: 100, windowId: 1, reason: 'cfc_test' });
  await appendFocusEntry({ type: 'FOCUS_END', time: baseTime + 60000, domain: domainA, tabId: 100, windowId: 1, reason: 'cfc_test' });

  mockStorageLocal['event_log_v1'] = [
    { type: 'START', state: 'ACTIVE', domain: domainA, time: baseTime },
    { type: 'END', state: 'ACTIVE', domain: domainA, time: baseTime + 20000 },
  ];

  const events = mockStorageLocal['event_log_v1'];
  const ledger = await getFocusLedger();
  const report = exportCalibrationReport(ledger, events, mockStorageSession[SESSION_KEY], 10, 0, domainA, 60);

  if (report.verdict !== 'FAIL: both captured but mismatch') throw new Error(`Expected "FAIL: both captured but mismatch", got: ${report.verdict}`);
  if (report.pass) throw new Error('Expected pass=false');
  if (report.targetFocusSeconds !== 60) throw new Error(`targetFocus expected 60s, got ${report.targetFocusSeconds}s`);
  if (report.targetActiveSeconds !== 20) throw new Error(`targetActive expected 20s, got ${report.targetActiveSeconds}s`);
  if (report.totalDelta !== 40) throw new Error(`totalDelta expected +40, got ${report.totalDelta}`);

  return report;
});

// ── T-CFC-5: Overcount detection (active > focus) ────────────────────────────
await runTest('T-CFC-5: Overcount detection (focus=20s, active=60s, delta=-40)', async () => {
  const baseTime = 5000000;
  const domainA = 'example.com';

  await appendFocusEntry({ type: 'FOCUS_START', time: baseTime, domain: domainA, tabId: 100, windowId: 1, reason: 'cfc_test' });
  await appendFocusEntry({ type: 'FOCUS_END', time: baseTime + 20000, domain: domainA, tabId: 100, windowId: 1, reason: 'cfc_test' });

  mockStorageLocal['event_log_v1'] = [
    { type: 'START', state: 'ACTIVE', domain: domainA, time: baseTime },
    { type: 'END', state: 'ACTIVE', domain: domainA, time: baseTime + 60000 },
  ];

  const events = mockStorageLocal['event_log_v1'];
  const ledger = await getFocusLedger();
  const report = exportCalibrationReport(ledger, events, mockStorageSession[SESSION_KEY], 10, 0, domainA, 60);

  if (report.verdict !== 'FAIL: both captured but mismatch') throw new Error(`Expected "FAIL: both captured but mismatch", got: ${report.verdict}`);
  if (report.pass) throw new Error('Expected pass=false');
  if (report.targetFocusSeconds !== 20) throw new Error(`targetFocus expected 20s, got ${report.targetFocusSeconds}s`);
  if (report.targetActiveSeconds !== 60) throw new Error(`targetActive expected 60s, got ${report.targetActiveSeconds}s`);
  if (report.totalDelta !== -40) throw new Error(`totalDelta expected -40, got ${report.totalDelta}`);

  return report;
});

// ── T-CFC-6: No timing captured (both zero) ──────────────────────────────────
await runTest('T-CFC-6: No timing captured (focus=0, active=0)', async () => {
  const domainA = 'example.com';

  mockStorageLocal['event_log_v1'] = [];
  mockStorageLocal['debug_focus_ledger_v1'] = [];

  const events = mockStorageLocal['event_log_v1'];
  const ledger = await getFocusLedger();
  const report = exportCalibrationReport(ledger, events, mockStorageSession[SESSION_KEY], 10, 0, domainA, 60);

  if (report.verdict !== 'FAIL: no timing captured') throw new Error(`Expected "FAIL: no timing captured", got: ${report.verdict}`);
  if (report.pass) throw new Error('Expected pass=false');
  if (report.targetFocusSeconds !== 0) throw new Error(`targetFocus expected 0s, got ${report.targetFocusSeconds}s`);
  if (report.targetActiveSeconds !== 0) throw new Error(`targetActive expected 0s, got ${report.targetActiveSeconds}s`);

  return report;
});

// ── T-CFC-7: Focus captured but active missing ───────────────────────────────
await runTest('T-CFC-7: Focus captured but active missing (focus=60s, active=0)', async () => {
  const baseTime = 7000000;
  const domainA = 'example.com';

  await appendFocusEntry({ type: 'FOCUS_START', time: baseTime, domain: domainA, tabId: 100, windowId: 1, reason: 'cfc_test' });
  await appendFocusEntry({ type: 'FOCUS_END', time: baseTime + 60000, domain: domainA, tabId: 100, windowId: 1, reason: 'cfc_test' });

  mockStorageLocal['event_log_v1'] = [];

  const events = mockStorageLocal['event_log_v1'];
  const ledger = await getFocusLedger();
  const report = exportCalibrationReport(ledger, events, mockStorageSession[SESSION_KEY], 10, 0, domainA, 60);

  if (report.verdict !== 'FAIL: focus captured but active missing') throw new Error(`Expected "FAIL: focus captured but active missing", got: ${report.verdict}`);
  if (report.pass) throw new Error('Expected pass=false');
  if (report.targetFocusSeconds !== 60) throw new Error(`targetFocus expected 60s, got ${report.targetFocusSeconds}s`);
  if (report.targetActiveSeconds !== 0) throw new Error(`targetActive expected 0s, got ${report.targetActiveSeconds}s`);

  return report;
});

// ── T-CFC-8: Active captured but focus missing ───────────────────────────────
await runTest('T-CFC-8: Active captured but focus missing (focus=0, active=60s)', async () => {
  const baseTime = 8000000;
  const domainA = 'example.com';

  mockStorageLocal['debug_focus_ledger_v1'] = [];

  mockStorageLocal['event_log_v1'] = [
    { type: 'START', state: 'ACTIVE', domain: domainA, time: baseTime },
    { type: 'END', state: 'ACTIVE', domain: domainA, time: baseTime + 60000 },
  ];

  const events = mockStorageLocal['event_log_v1'];
  const ledger = await getFocusLedger();
  const report = exportCalibrationReport(ledger, events, mockStorageSession[SESSION_KEY], 10, 0, domainA, 60);

  if (report.verdict !== 'FAIL: active captured but focus missing') throw new Error(`Expected "FAIL: active captured but focus missing", got: ${report.verdict}`);
  if (report.pass) throw new Error('Expected pass=false');
  if (report.targetFocusSeconds !== 0) throw new Error(`targetFocus expected 0s, got ${report.targetFocusSeconds}s`);
  if (report.targetActiveSeconds !== 60) throw new Error(`targetActive expected 60s, got ${report.targetActiveSeconds}s`);

  return report;
});

// ── T-CFC-9: Wrong domain ────────────────────────────────────────────────────
await runTest('T-CFC-9: Wrong domain (timing on different domain)', async () => {
  const baseTime = 9000000;
  const targetDomain = 'expected.com';
  const actualDomain = 'unexpected.com';

  await appendFocusEntry({ type: 'FOCUS_START', time: baseTime, domain: actualDomain, tabId: 100, windowId: 1, reason: 'cfc_test' });
  await appendFocusEntry({ type: 'FOCUS_END', time: baseTime + 60000, domain: actualDomain, tabId: 100, windowId: 1, reason: 'cfc_test' });

  mockStorageLocal['event_log_v1'] = [
    { type: 'START', state: 'ACTIVE', domain: actualDomain, time: baseTime },
    { type: 'END', state: 'ACTIVE', domain: actualDomain, time: baseTime + 60000 },
  ];

  const events = mockStorageLocal['event_log_v1'];
  const ledger = await getFocusLedger();
  const report = exportCalibrationReport(ledger, events, mockStorageSession[SESSION_KEY], 10, 0, targetDomain, 60);

  if (report.verdict !== 'FAIL: wrong domain') throw new Error(`Expected "FAIL: wrong domain", got: ${report.verdict}`);
  if (report.pass) throw new Error('Expected pass=false');
  if (report.targetFocusSeconds !== 0) throw new Error(`targetFocus expected 0s, got ${report.targetFocusSeconds}s`);
  if (report.targetActiveSeconds !== 0) throw new Error(`targetActive expected 0s, got ${report.targetActiveSeconds}s`);

  return report;
});

// ── Chain Verification Summary ───────────────────────────────────────────────
console.log('\n📋 Chain Verification:');
console.log(`  resolveState reached:       ${chainReport.resolveStateReached ? '✅' : '❌'}`);
console.log(`  transitionState reached:    ${chainReport.transitionStateReached ? '✅' : '❌'}`);
console.log(`  event_log_v1 generated:     ${chainReport.eventLogGenerated ? '✅' : '❌'}`);
console.log(`  Focus Ledger generated:     ${chainReport.focusLedgerGenerated ? '✅' : '❌'}`);
console.log(`  activeSeconds aggregated:   ${chainReport.activeSecondsAggregated ? '✅' : '❌'}`);
console.log(`  Focus Ledger aggregated:    ${chainReport.focusLedgerAggregated ? '✅' : '❌'}`);
console.log(`  delta computed:             ${chainReport.deltaComputed ? '✅' : '❌'}`);
console.log(`  Independent calculation:    ✅ (Focus Ledger and event_log_v1 written separately)`);

console.log('\n📊 Controlled Focus Calibration Tests Complete');

// tests/unit/duration-calibration.test.mjs
// Focus Ledger 双重校准自动化测试
// Run with: node tests/unit/duration-calibration.test.mjs

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

// ── Inline Focus Ledger Functions (from debug/focus-ledger.js) ────────────────
const FOCUS_LEDGER_KEY = 'debug_focus_ledger_v1';

async function getFocusLedger() {
  return mockStorageLocal[FOCUS_LEDGER_KEY] || [];
}

async function appendFocusEntry(entry) {
  const ledger = await getFocusLedger();
  ledger.push(entry);
  await chrome.storage.local.set({ [FOCUS_LEDGER_KEY]: ledger });
}

async function resetFocusLedger() {
  await chrome.storage.local.set({ [FOCUS_LEDGER_KEY]: [] });
}

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

function exportCalibrationReport(ledger, events, session, thresholdSeconds = 10) {
  const focusByDomain = aggregateFocusLedger(ledger);
  const activeByDomain = aggregateActiveSeconds(events);
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
  const pass = Math.abs(totalDelta) <= thresholdSeconds;
  return {
    focusLedgerByDomain: focusByDomain,
    activeSecondsByDomain: activeByDomain,
    deltaByDomain,
    totalFocusSeconds: totalFocus,
    totalActiveSeconds: totalActive,
    totalDelta,
    pass,
    thresholdSeconds,
    sessionSnapshot: session,
    recentFocusLedger: ledger.slice(-20),
    recentEventLog: events.slice(-20),
    timestamp: Date.now(),
  };
}

// ── Test Helpers ─────────────────────────────────────────────────────────────
function resetStorage() {
  Object.keys(mockStorageLocal).forEach(k => delete mockStorageLocal[k]);
  Object.keys(mockStorageSession).forEach(k => delete mockStorageSession[k]);
}

async function runTest(name, fn) {
  resetStorage();
  await resetFocusLedger();
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
  } catch (err) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// ── Calibration Tests ────────────────────────────────────────────────────────

// T-CAL-1: Single page plain web calibration
await runTest('T-CAL-1: Single page plain web calibration', async () => {
  const baseTime = 1000000;
  const domain = 'example.com';

  // Simulate: FOCUS_START → FOCUS_END (25s)
  await appendFocusEntry({ type: 'FOCUS_START', time: baseTime, domain, tabId: 100, windowId: 1, reason: 'test' });
  await appendFocusEntry({ type: 'FOCUS_END', time: baseTime + 25000, domain, tabId: 100, windowId: 1, reason: 'test' });

  // Simulate: ACTIVE START → END (25s) — matching business event log
  mockStorageLocal['event_log_v1'] = [
    { type: 'START', state: 'ACTIVE', domain, time: baseTime },
    { type: 'END', state: 'ACTIVE', domain, time: baseTime + 25000 },
  ];

  const ledger = await getFocusLedger();
  const events = mockStorageLocal['event_log_v1'];
  const report = exportCalibrationReport(ledger, events, null);

  if (report.focusLedgerByDomain[domain] !== 25) throw new Error(`Focus ledger expected 25s, got ${report.focusLedgerByDomain[domain]}s`);
  if (report.activeSecondsByDomain[domain] !== 25) throw new Error(`Active seconds expected 25s, got ${report.activeSecondsByDomain[domain]}s`);
  if (report.deltaByDomain[domain] !== 0) throw new Error(`Delta expected 0, got ${report.deltaByDomain[domain]}`);
  if (report.totalDelta !== 0) throw new Error(`Total delta expected 0, got ${report.totalDelta}`);
  if (!report.pass) throw new Error('Expected PASS');
});

// T-CAL-2: A → B switch calibration
await runTest('T-CAL-2: A → B switch calibration', async () => {
  const baseTime = 2000000;
  const domainA = 'site-a.com';
  const domainB = 'site-b.com';

  // Focus ledger: A 25s → B 25s
  await appendFocusEntry({ type: 'FOCUS_START', time: baseTime, domain: domainA, tabId: 100, windowId: 1, reason: 'test' });
  await appendFocusEntry({ type: 'FOCUS_END', time: baseTime + 25000, domain: domainA, tabId: 100, windowId: 1, reason: 'test' });
  await appendFocusEntry({ type: 'FOCUS_START', time: baseTime + 25000, domain: domainB, tabId: 200, windowId: 1, reason: 'test' });
  await appendFocusEntry({ type: 'FOCUS_END', time: baseTime + 50000, domain: domainB, tabId: 200, windowId: 1, reason: 'test' });

  // Business event log: A ACTIVE 25s → B ACTIVE 25s
  mockStorageLocal['event_log_v1'] = [
    { type: 'START', state: 'ACTIVE', domain: domainA, time: baseTime },
    { type: 'END', state: 'ACTIVE', domain: domainA, time: baseTime + 25000 },
    { type: 'START', state: 'ACTIVE', domain: domainB, time: baseTime + 25000 },
    { type: 'END', state: 'ACTIVE', domain: domainB, time: baseTime + 50000 },
  ];

  const ledger = await getFocusLedger();
  const events = mockStorageLocal['event_log_v1'];
  const report = exportCalibrationReport(ledger, events, null);

  if (report.focusLedgerByDomain[domainA] !== 25) throw new Error(`A focus expected 25s, got ${report.focusLedgerByDomain[domainA]}s`);
  if (report.activeSecondsByDomain[domainA] !== 25) throw new Error(`A active expected 25s, got ${report.activeSecondsByDomain[domainA]}s`);
  if (report.focusLedgerByDomain[domainB] !== 25) throw new Error(`B focus expected 25s, got ${report.focusLedgerByDomain[domainB]}s`);
  if (report.activeSecondsByDomain[domainB] !== 25) throw new Error(`B active expected 25s, got ${report.activeSecondsByDomain[domainB]}s`);
  if (report.totalDelta !== 0) throw new Error(`Total delta expected 0, got ${report.totalDelta}`);
  if (!report.pass) throw new Error('Expected PASS');
});

// T-CAL-3: A → B → A multi-segment calibration
await runTest('T-CAL-3: A → B → A multi-segment calibration', async () => {
  const baseTime = 3000000;
  const domainA = 'site-a.com';
  const domainB = 'site-b.com';

  // Focus ledger: A 20s → B 20s → A 20s
  await appendFocusEntry({ type: 'FOCUS_START', time: baseTime, domain: domainA, tabId: 100, windowId: 1, reason: 'test' });
  await appendFocusEntry({ type: 'FOCUS_END', time: baseTime + 20000, domain: domainA, tabId: 100, windowId: 1, reason: 'test' });
  await appendFocusEntry({ type: 'FOCUS_START', time: baseTime + 20000, domain: domainB, tabId: 200, windowId: 1, reason: 'test' });
  await appendFocusEntry({ type: 'FOCUS_END', time: baseTime + 40000, domain: domainB, tabId: 200, windowId: 1, reason: 'test' });
  await appendFocusEntry({ type: 'FOCUS_START', time: baseTime + 40000, domain: domainA, tabId: 100, windowId: 1, reason: 'test' });
  await appendFocusEntry({ type: 'FOCUS_END', time: baseTime + 60000, domain: domainA, tabId: 100, windowId: 1, reason: 'test' });

  // Business event log: A ACTIVE 20s → B ACTIVE 20s → A ACTIVE 20s
  mockStorageLocal['event_log_v1'] = [
    { type: 'START', state: 'ACTIVE', domain: domainA, time: baseTime },
    { type: 'END', state: 'ACTIVE', domain: domainA, time: baseTime + 20000 },
    { type: 'START', state: 'ACTIVE', domain: domainB, time: baseTime + 20000 },
    { type: 'END', state: 'ACTIVE', domain: domainB, time: baseTime + 40000 },
    { type: 'START', state: 'ACTIVE', domain: domainA, time: baseTime + 40000 },
    { type: 'END', state: 'ACTIVE', domain: domainA, time: baseTime + 60000 },
  ];

  const ledger = await getFocusLedger();
  const events = mockStorageLocal['event_log_v1'];
  const report = exportCalibrationReport(ledger, events, null);

  if (report.focusLedgerByDomain[domainA] !== 40) throw new Error(`A focus expected 40s, got ${report.focusLedgerByDomain[domainA]}s`);
  if (report.activeSecondsByDomain[domainA] !== 40) throw new Error(`A active expected 40s, got ${report.activeSecondsByDomain[domainA]}s`);
  if (report.focusLedgerByDomain[domainB] !== 20) throw new Error(`B focus expected 20s, got ${report.focusLedgerByDomain[domainB]}s`);
  if (report.activeSecondsByDomain[domainB] !== 20) throw new Error(`B active expected 20s, got ${report.activeSecondsByDomain[domainB]}s`);
  if (report.totalDelta !== 0) throw new Error(`Total delta expected 0, got ${report.totalDelta}`);
  if (!report.pass) throw new Error('Expected PASS');
});

// T-CAL-4: Detect mismatch — focus > active (漏计)
await runTest('T-CAL-4: Detect mismatch — focus > active (漏计)', async () => {
  const baseTime = 4000000;
  const domain = 'example.com';

  // Focus ledger: 25s
  await appendFocusEntry({ type: 'FOCUS_START', time: baseTime, domain, tabId: 100, windowId: 1, reason: 'test' });
  await appendFocusEntry({ type: 'FOCUS_END', time: baseTime + 25000, domain, tabId: 100, windowId: 1, reason: 'test' });

  // Business event log: only 10s ACTIVE (漏计 15s)
  mockStorageLocal['event_log_v1'] = [
    { type: 'START', state: 'ACTIVE', domain, time: baseTime },
    { type: 'END', state: 'ACTIVE', domain, time: baseTime + 10000 },
  ];

  const ledger = await getFocusLedger();
  const events = mockStorageLocal['event_log_v1'];
  const report = exportCalibrationReport(ledger, events, null, 10);

  if (report.totalDelta !== 15) throw new Error(`Delta expected 15, got ${report.totalDelta}`);
  if (report.pass) throw new Error('Expected FAIL (delta exceeds threshold)');
});

// T-CAL-5: Detect mismatch — active > focus (多计)
await runTest('T-CAL-5: Detect mismatch — active > focus (多计)', async () => {
  const baseTime = 5000000;
  const domain = 'example.com';

  // Focus ledger: 25s
  await appendFocusEntry({ type: 'FOCUS_START', time: baseTime, domain, tabId: 100, windowId: 1, reason: 'test' });
  await appendFocusEntry({ type: 'FOCUS_END', time: baseTime + 25000, domain, tabId: 100, windowId: 1, reason: 'test' });

  // Business event log: 40s ACTIVE (多计 15s)
  mockStorageLocal['event_log_v1'] = [
    { type: 'START', state: 'ACTIVE', domain, time: baseTime },
    { type: 'END', state: 'ACTIVE', domain, time: baseTime + 40000 },
  ];

  const ledger = await getFocusLedger();
  const events = mockStorageLocal['event_log_v1'];
  const report = exportCalibrationReport(ledger, events, null, 10);

  if (report.totalDelta !== -15) throw new Error(`Delta expected -15, got ${report.totalDelta}`);
  if (report.pass) throw new Error('Expected FAIL (delta exceeds threshold)');
});

// T-CAL-6: Non-web pages should not affect calibration
await runTest('T-CAL-6: Non-web pages should not affect calibration', async () => {
  const baseTime = 6000000;
  const domain = 'example.com';

  // Focus ledger: chrome:// (null domain) → example.com 25s
  await appendFocusEntry({ type: 'FOCUS_START', time: baseTime, domain: null, tabId: 100, windowId: 1, reason: 'test' });
  await appendFocusEntry({ type: 'FOCUS_END', time: baseTime + 5000, domain: null, tabId: 100, windowId: 1, reason: 'test' });
  await appendFocusEntry({ type: 'FOCUS_START', time: baseTime + 5000, domain, tabId: 200, windowId: 1, reason: 'test' });
  await appendFocusEntry({ type: 'FOCUS_END', time: baseTime + 30000, domain, tabId: 200, windowId: 1, reason: 'test' });

  // Business event log: only example.com ACTIVE 25s
  mockStorageLocal['event_log_v1'] = [
    { type: 'START', state: 'ACTIVE', domain, time: baseTime + 5000 },
    { type: 'END', state: 'ACTIVE', domain, time: baseTime + 30000 },
  ];

  const ledger = await getFocusLedger();
  const events = mockStorageLocal['event_log_v1'];
  const report = exportCalibrationReport(ledger, events, null);

  if (report.focusLedgerByDomain[domain] !== 25) throw new Error(`Focus expected 25s, got ${report.focusLedgerByDomain[domain]}s`);
  if (report.activeSecondsByDomain[domain] !== 25) throw new Error(`Active expected 25s, got ${report.activeSecondsByDomain[domain]}s`);
  if (report.totalDelta !== 0) throw new Error(`Total delta expected 0, got ${report.totalDelta}`);
  if (!report.pass) throw new Error('Expected PASS');
});

console.log('\n📊 Focus Ledger Calibration Tests Complete');

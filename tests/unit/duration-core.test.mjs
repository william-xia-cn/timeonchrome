// tests/unit/duration-core.test.mjs
// Layer 1: Deterministic core timing tests
// Verifies "focused tab = attention duration" logic without OS-level idle/focus
// Run with: node tests/unit/duration-core.test.mjs

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

// ── Inline Core Logic (pure functions from core/*.js) ────────────────────────
const AttentionState = { ACTIVE: 'ACTIVE', PASSIVE: 'PASSIVE', IDLE: 'IDLE', BACKGROUND_ACTIVE: 'BACKGROUND_ACTIVE' };

function resolveState(context) {
  if (!context?.domain) return AttentionState.IDLE;
  if (context.isIdle) return AttentionState.IDLE;
  if (context.isFocused && context.tabId) return AttentionState.ACTIVE;
  if (context.isAudible && context.mediaSourceTabId != null) return AttentionState.BACKGROUND_ACTIVE;
  if (context.isPiP) return AttentionState.BACKGROUND_ACTIVE;
  return AttentionState.PASSIVE;
}

function buildContext(current, rawEvent) {
  const isMediaSignal = rawEvent.mediaSourceTabId != null && rawEvent.domain == null;
  const nextTabId = isMediaSignal ? (current?.lastActiveTabId ?? current?.tabId ?? null) : (rawEvent.tabId ?? current?.lastActiveTabId ?? null);
  const nextMediaSourceTabId = rawEvent.isAudible === false ? null : (rawEvent.mediaSourceTabId ?? current?.mediaSourceTabId ?? null);
  return {
    tabId: nextTabId,
    windowId: rawEvent.windowId ?? current?.lastFocusedWindowId ?? null,
    domain: isMediaSignal ? (current?.domain ?? null) : (rawEvent.domain ?? current?.domain ?? null),
    isFocused: rawEvent.isFocused ?? current?.isFocused ?? false,
    isIdle: rawEvent.isIdle ?? current?.isIdle ?? false,
    isAudible: rawEvent.isAudible ?? current?.isAudible ?? false,
    mediaSourceTabId: nextMediaSourceTabId,
    isPiP: rawEvent.isPiP ?? current?.isPiP ?? false,
    timestamp: Date.now(),
    lastActiveTabId: isMediaSignal ? current?.lastActiveTabId : (rawEvent.tabId ?? current?.lastActiveTabId),
    lastFocusedWindowId: rawEvent.windowId ?? current?.lastFocusedWindowId,
  };
}

// ── Session & Event Log (mimics runtime/session.js & core/event-log.js) ──────
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

// ── Test Helpers ─────────────────────────────────────────────────────────────
function resetStorage() {
  Object.keys(mockStorageLocal).forEach(k => delete mockStorageLocal[k]);
  Object.keys(mockStorageSession).forEach(k => delete mockStorageSession[k]);
  commitQueue = Promise.resolve();
}

function computeActiveSeconds(events, domain) {
  let total = 0, openStart = null;
  for (const evt of events) {
    if (evt.domain !== domain) continue;
    if (evt.type === 'START' && evt.state === 'ACTIVE') openStart = evt;
    else if (evt.type === 'END' && openStart) {
      const dur = Math.floor((evt.time - openStart.time) / 1000);
      if (dur > 0) total += dur;
      openStart = null;
    } else if (evt.type === 'START' && evt.state !== 'ACTIVE') openStart = null;
  }
  return total;
}

function getEventLog() { return mockStorageLocal['event_log_v1'] || []; }

// ── Test Runner ──────────────────────────────────────────────────────────────
async function runTest(name, fn) {
  resetStorage();
  await initSession();
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
  } catch (err) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// T-D1: Single page foreground timing
await runTest('T-D1: Single page foreground timing', async () => {
  const baseTime = 1000000;
  const domain = 'example.com';
  
  await transitionState(AttentionState.ACTIVE, domain, baseTime);
  await transitionState(AttentionState.PASSIVE, domain, baseTime + 25000);
  
  const activeSec = computeActiveSeconds(getEventLog(), domain);
  if (activeSec !== 25) throw new Error(`Expected 25s, got ${activeSec}s`);
});

// T-D2: A → B switch (no double counting)
await runTest('T-D2: A → B switch stops old page timing', async () => {
  const baseTime = 1000000;
  const domainA = 'site-a.com';
  const domainB = 'site-b.com';
  
  await transitionState(AttentionState.ACTIVE, domainA, baseTime);
  await transitionState(AttentionState.ACTIVE, domainB, baseTime + 25000);
  await transitionState(AttentionState.PASSIVE, domainB, baseTime + 50000);
  
  const log = getEventLog();
  const activeA = computeActiveSeconds(log, domainA);
  const activeB = computeActiveSeconds(log, domainB);
  
  if (activeA !== 25) throw new Error(`A expected 25s, got ${activeA}s`);
  if (activeB !== 25) throw new Error(`B expected 25s, got ${activeB}s`);
  if (activeA + activeB !== 50) throw new Error(`Total expected 50s, got ${activeA + activeB}s`);
});

// T-D3: A → B → A multi-segment accumulation
await runTest('T-D3: A → B → A multi-segment accumulation', async () => {
  const baseTime = 1000000;
  const domainA = 'site-a.com';
  const domainB = 'site-b.com';
  
  await transitionState(AttentionState.ACTIVE, domainA, baseTime);
  await transitionState(AttentionState.ACTIVE, domainB, baseTime + 20000);
  await transitionState(AttentionState.ACTIVE, domainA, baseTime + 40000);
  await transitionState(AttentionState.PASSIVE, domainA, baseTime + 60000);
  
  const log = getEventLog();
  const activeA = computeActiveSeconds(log, domainA);
  const activeB = computeActiveSeconds(log, domainB);
  
  if (activeA !== 40) throw new Error(`A expected 40s, got ${activeA}s`);
  if (activeB !== 20) throw new Error(`B expected 20s, got ${activeB}s`);
  if (activeA + activeB !== 60) throw new Error(`Total expected 60s, got ${activeA + activeB}s`);
});

console.log('\n📊 Layer 1 Deterministic Core Timing Tests Complete');

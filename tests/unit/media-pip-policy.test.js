// Media PiP policy integration tests
// Run with: node tests/unit/media-pip-policy.test.js

'use strict';

const fs = require('fs');
const path = require('path');

global.chrome = { tabs: {}, windows: {} };

function loadMediaTiming(stubs = {}) {
  const abs = path.join(__dirname, '..', '..', 'extension', 'core', 'media-timing.js');
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import[\s\S]*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  const keys = Object.keys(stubs);
  const prelude = keys.length ? `const { ${keys.join(', ')} } = __injected;\n` : '';
  return new Function('__injected', `${prelude}${code}\nreturn { observeMediaFromSignal, runMediaCheckpoint, processMediaModeBoundary };`)(stubs);
}

function check(name, condition, details = '') {
  if (!condition) throw new Error(`${name}${details ? `: ${details}` : ''}`);
}

function makeHarness(overrides = {}) {
  global.chrome = overrides.chrome || { tabs: {}, windows: {} };
  const calls = {
    applied: [],
    cleanup: [],
    ledgerCleanup: [],
    checkpoint: [],
    split: [],
    trace: [],
    fallback: [],
  };
  const cleanupResult = overrides.cleanupResult || ((tabId) => ({
    ok: true,
    handled: true,
    closed: true,
    confirmedNoPiP: true,
    tabResults: [{ tabId, ok: true, handled: true, closed: true, confirmedNoPiP: true }],
  }));
  const api = loadMediaTiming({
    applyMediaFacts: async (fact, reason, atMs) => {
      calls.applied.push({ fact, reason, atMs });
      return { ok: true };
    },
    classifyMediaFact: (fact) => {
      if (fact?.isPiP === true) return { mediaClass: 'pip', mediaKind: 'pip', visibility: 'pip' };
      if (fact?.mediaKind === 'video') return { mediaClass: 'foregroundVideo', mediaKind: 'video', visibility: 'foreground' };
      if (fact?.playing || fact?.audible) return { mediaClass: 'foregroundAudio', mediaKind: 'audio', visibility: 'foreground' };
      return null;
    },
    closeForbiddenPictureInPicture: async ({ preferredTabId, reason }) => {
      calls.cleanup.push({ preferredTabId, reason });
      return cleanupResult(preferredTabId);
    },
    closeForbiddenPiPSessionsForTab: async (tabId, reason, options) => {
      calls.ledgerCleanup.push({ tabId, reason, options });
      return { ok: true, closedPiP: 1 };
    },
    isPictureInPictureDisallowed: () => true,
    getMediaFact: async () => null,
    getMediaSessions: async () => overrides.sessions || {},
    runMediaPeriodicCheckpoint: async (now) => {
      calls.checkpoint.push(now);
      return { ok: true, reason: 'periodic_checkpoint', flushedSegments: 0 };
    },
    splitOpenMediaSessionsAtModeBoundary: async (intent) => {
      calls.split.push(intent);
      return { ok: true, reason: 'mode_effective_boundary', split: 0 };
    },
    closeMediaForTab: async () => ({}),
    extractDomain: () => 'pip.example.com',
    emitTrace: async (action, payload) => calls.trace.push({ action, payload }),
    logFallbackEventBestEffort: (entry) => calls.fallback.push(entry),
  });
  return { api, calls };
}

async function testMediaStatePiPTriggersPolicyCleanup() {
  const { api, calls } = makeHarness();
  const result = await api.observeMediaFromSignal({
    _reason: 'mediaState',
    mediaSourceTabId: 42,
    domain: 'pip.example.com',
    playing: true,
    mediaKind: 'video',
    isPiP: true,
  });
  check('pip media fact is still applied first', calls.applied.length === 1);
  check('pip fact triggers shared cleanup helper', calls.cleanup.length === 1 && calls.cleanup[0].preferredTabId === 42, JSON.stringify(calls.cleanup));
  check('successful cleanup closes local pip ledger', calls.ledgerCleanup.length === 1 && calls.ledgerCleanup[0].reason === 'pip_forbidden_cleanup', JSON.stringify(calls.ledgerCleanup));
  check('result includes pip policy result', result.pipPolicy?.ok === true, JSON.stringify(result));
}

async function testCleanupFailureKeepsLedgerFact() {
  const { api, calls } = makeHarness({
    cleanupResult: (tabId) => ({
      ok: false,
      handled: true,
      closed: false,
      confirmedNoPiP: false,
      tabResults: [{ tabId, ok: false, handled: true, closed: false, confirmedNoPiP: false }],
    }),
  });
  const result = await api.observeMediaFromSignal({
    _reason: 'mediaState',
    mediaSourceTabId: 43,
    domain: 'pip.example.com',
    playing: true,
    mediaKind: 'video',
    isPiP: true,
  });
  check('cleanup failure does not close local pip ledger', calls.ledgerCleanup.length === 0);
  check('cleanup failure emits diagnostic trace', calls.trace.some((entry) => entry.action === 'pip_forbidden_cleanup_failed'), JSON.stringify(calls.trace));
  check('result reports failed pip policy', result.pipPolicy?.ok === false, JSON.stringify(result));
}

async function testConfirmedExitAfterCleanupAttemptUsesPolicyReason() {
  const { api, calls } = makeHarness({
    cleanupResult: (tabId) => ({
      ok: false,
      handled: true,
      closed: false,
      confirmedNoPiP: false,
      tabResults: [{ tabId, ok: false, handled: true, closed: false, confirmedNoPiP: false }],
    }),
  });
  await api.observeMediaFromSignal({
    _reason: 'mediaState',
    mediaSourceTabId: 47,
    domain: 'pip.example.com',
    playing: true,
    mediaKind: 'video',
    isPiP: true,
  });
  const result = await api.observeMediaFromSignal({
    _reason: 'mediaState',
    mediaSourceTabId: 47,
    domain: 'pip.example.com',
    playing: true,
    mediaKind: 'video',
    isPiP: false,
  });
  check('confirmed non-pip fact closes pending pip ledger with policy reason', calls.ledgerCleanup.length === 1 && calls.ledgerCleanup[0].reason === 'pip_forbidden_cleanup', JSON.stringify(calls.ledgerCleanup));
  check('result reports pending cleanup confirmation', result.pipPolicy?.reason === 'pip_forbidden_cleanup_confirmed_by_media_fact', JSON.stringify(result));
}

async function testCheckpointRetriesCleanupBeforeMediaCheckpoint() {
  const { api, calls } = makeHarness({
    sessions: {
      '44::pip': {
        tabId: 44,
        domain: 'pip.example.com',
        mediaClass: 'pip',
        startTime: 1000,
      },
    },
  });
  const result = await api.runMediaCheckpoint(181000);
  check('checkpoint first attempts pip cleanup', calls.cleanup.length === 1 && calls.cleanup[0].preferredTabId === 44, JSON.stringify(calls.cleanup));
  check('checkpoint closes local pip ledger on successful cleanup', calls.ledgerCleanup.length === 1 && calls.ledgerCleanup[0].options.now === 181000, JSON.stringify(calls.ledgerCleanup));
  check('media checkpoint still runs after policy pass', calls.checkpoint.length === 1 && result.ok === true, JSON.stringify(result));
}

async function testCheckpointFailureStillRunsFactualCheckpoint() {
  const { api, calls } = makeHarness({
    sessions: {
      '45::pip': {
        tabId: 45,
        domain: 'pip.example.com',
        mediaClass: 'pip',
        startTime: 1000,
      },
    },
    cleanupResult: (tabId) => ({
      ok: false,
      handled: true,
      closed: false,
      confirmedNoPiP: false,
      tabResults: [{ tabId, ok: false, handled: true, closed: false, confirmedNoPiP: false }],
    }),
  });
  const result = await api.runMediaCheckpoint(181000);
  check('failed checkpoint cleanup does not close local pip ledger', calls.ledgerCleanup.length === 0);
  check('factual media checkpoint still runs after cleanup failure', calls.checkpoint.length === 1 && result.ok === true, JSON.stringify(result));
}

async function testCheckpointDiscoversActiveTabMediaSnapshot() {
  const chromeMock = {
    tabs: {
      query: async (queryInfo) => {
        if (queryInfo.active) {
          return [{
            id: 80,
            windowId: 8,
            active: true,
            audible: false,
            url: 'https://www.youtube.com/watch?v=abc',
          }];
        }
        if (queryInfo.audible) return [];
        return [];
      },
      get: async (tabId) => ({
        id: tabId,
        windowId: 8,
        active: true,
        audible: false,
        url: 'https://www.youtube.com/watch?v=abc',
      }),
      sendMessage: async (_tabId, msg) => {
        if (msg?.type !== 'GET_MEDIA_SNAPSHOT') throw new Error('unexpected message');
        return { ok: true, playing: true, isPiP: false, mediaKind: 'video' };
      },
    },
    windows: {
      get: async () => ({ focused: true, state: 'normal' }),
    },
  };
  const { api, calls } = makeHarness({ chrome: chromeMock });
  const result = await api.runMediaCheckpoint(181000);
  check('checkpoint applies discovered active-tab media fact', calls.applied.some((entry) => entry.reason === 'media_checkpoint_discovery'), JSON.stringify(calls.applied));
  check('checkpoint discovery records applied fact', result.discovery?.factsApplied === 1, JSON.stringify(result.discovery));
  check('media checkpoint still runs after discovery', calls.checkpoint.length === 1, JSON.stringify(calls.checkpoint));
}

async function testCheckpointMissingContentSnapshotOnlyWarns() {
  const chromeMock = {
    tabs: {
      query: async (queryInfo) => {
        if (queryInfo.active) {
          return [{
            id: 81,
            windowId: 8,
            active: true,
            audible: false,
            url: 'https://www.youtube.com/watch?v=def',
          }];
        }
        if (queryInfo.audible) return [];
        return [];
      },
      get: async (tabId) => ({
        id: tabId,
        windowId: 8,
        active: true,
        audible: false,
        url: 'https://www.youtube.com/watch?v=def',
      }),
      sendMessage: async () => { throw new Error('Receiving end does not exist.'); },
    },
    windows: {
      get: async () => ({ focused: true, state: 'normal' }),
    },
  };
  const { api, calls } = makeHarness({ chrome: chromeMock });
  const result = await api.runMediaCheckpoint(181000);
  check('missing content snapshot does not apply a fake media fact', calls.applied.length === 0, JSON.stringify(calls.applied));
  check('missing content snapshot records warning', calls.fallback.some((entry) => entry.eventCode === 'media_checkpoint_content_snapshot_unavailable'), JSON.stringify(calls.fallback));
  check('media checkpoint continues after snapshot warning', calls.checkpoint.length === 1 && result.ok === true, JSON.stringify(result));
}

async function testModeBoundaryEnforcesGlobalPiPPolicy() {
  const { api, calls } = makeHarness({
    sessions: {
      '46::pip': {
        tabId: 46,
        domain: 'pip.example.com',
        mediaClass: 'pip',
        startTime: 1000,
      },
    },
  });
  await api.processMediaModeBoundary({
    boundaryAtMs: 30000,
    fromMode: 'composite',
    toMode: 'rest',
    reason: 'manual_mode_switch',
  });
  check('mode boundary enforces pip policy for any mode pair', calls.cleanup.length === 1 && calls.cleanup[0].preferredTabId === 46, JSON.stringify(calls.cleanup));
  check('mode boundary closes ledger at boundary time after cleanup', calls.ledgerCleanup.length === 1 && calls.ledgerCleanup[0].options.now === 30000, JSON.stringify(calls.ledgerCleanup));
  check('mode boundary still runs media mode splitter', calls.split.length === 1, JSON.stringify(calls.split));
}

async function run() {
  const tests = [
    testMediaStatePiPTriggersPolicyCleanup,
    testCleanupFailureKeepsLedgerFact,
    testConfirmedExitAfterCleanupAttemptUsesPolicyReason,
    testCheckpointRetriesCleanupBeforeMediaCheckpoint,
    testCheckpointFailureStillRunsFactualCheckpoint,
    testCheckpointDiscoversActiveTabMediaSnapshot,
    testCheckpointMissingContentSnapshotOnlyWarns,
    testModeBoundaryEnforcesGlobalPiPPolicy,
  ];
  let passed = 0;
  for (const test of tests) {
    await test();
    passed++;
  }
  console.log(`[Media PiP Policy] ${passed}/${tests.length} passed`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

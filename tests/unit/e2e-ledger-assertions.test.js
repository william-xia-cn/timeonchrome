// E2E ledger assertion helper unit checks
// Run with: node tests/unit/e2e-ledger-assertions.test.js

'use strict';

const {
  assertMediaTimeline,
  assertNoForbiddenForegroundOperations,
  assertNoUnexpectedOverlap,
  assertUsageTimeline,
  normalizeMediaSegments,
  normalizeUsageSegments,
} = require('../e2e/helpers/ledger-assertions.js');

function check(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    console.error(`FAIL: ${name}`);
    throw err;
  }
}

function expectThrows(name, fn) {
  let threw = false;
  try {
    fn();
  } catch (_) {
    threw = true;
  }
  if (!threw) throw new Error(`${name}: expected throw`);
}

check('usage timeline matches duration range and operations', () => {
  const rows = normalizeUsageSegments({
    a: {
      id: 'a',
      startMs: 1000,
      endMs: 6200,
      durationSeconds: 5,
      domain: 'a.example.com',
      mode: 'rest',
      sourceState: 'ACTIVE',
      settlementReason: 'transition_complete',
      description: {
        start: { reason: 'tabUpdated' },
        end: { reason: 'tabActivated' },
      },
    },
  });
  assertUsageTimeline(rows, [{
    domain: 'a.example.com',
    mode: 'rest',
    sourceState: 'ACTIVE',
    settlementReason: 'transition_complete',
    openOperation: 'tabUpdated',
    closeOperation: 'tabActivated',
    duration: { min: 5, max: 5 },
  }], { exact: true });
});

check('forbidden foreground operation is detected', () => {
  const rows = normalizeUsageSegments({
    a: {
      id: 'a',
      startMs: 1000,
      endMs: 2000,
      durationSeconds: 1,
      domain: 'a.example.com',
      settlementReason: 'transition_complete',
      description: {
        start: { reason: 'tabAudible' },
        end: { reason: 'tabActivated' },
      },
    },
  });
  expectThrows('forbidden operation', () => assertNoForbiddenForegroundOperations(rows));
});

check('usage overlap is detected', () => {
  const rows = normalizeUsageSegments({
    a: { id: 'a', startMs: 1000, endMs: 3000, durationSeconds: 2, domain: 'a.example.com' },
    b: { id: 'b', startMs: 2000, endMs: 4000, durationSeconds: 2, domain: 'b.example.com' },
  });
  expectThrows('usage overlap', () => assertNoUnexpectedOverlap(rows, 'usage'));
});

check('media overlap is scoped to tabId and mediaClass', () => {
  const rows = normalizeMediaSegments({
    a: { id: 'a', startMs: 1000, endMs: 3000, durationSeconds: 2, domain: 'a.example.com', tabId: 1, mediaClass: 'foregroundVideo' },
    b: { id: 'b', startMs: 2000, endMs: 4000, durationSeconds: 2, domain: 'b.example.com', tabId: 2, mediaClass: 'foregroundVideo' },
    c: { id: 'c', startMs: 2000, endMs: 4000, durationSeconds: 2, domain: 'c.example.com', tabId: 1, mediaClass: 'pip' },
  });
  assertNoUnexpectedOverlap(rows, 'media');
  assertMediaTimeline(rows, [
    { domain: 'a.example.com', tabId: 1, mediaClass: 'foregroundVideo', duration: 2 },
    { domain: 'b.example.com', tabId: 2, mediaClass: 'foregroundVideo', duration: 2 },
  ]);
});

check('same tab and mediaClass media overlap is detected', () => {
  const rows = normalizeMediaSegments({
    a: { id: 'a', startMs: 1000, endMs: 3000, durationSeconds: 2, domain: 'a.example.com', tabId: 1, mediaClass: 'foregroundVideo' },
    b: { id: 'b', startMs: 2000, endMs: 4000, durationSeconds: 2, domain: 'b.example.com', tabId: 1, mediaClass: 'foregroundVideo' },
  });
  expectThrows('media overlap', () => assertNoUnexpectedOverlap(rows, 'media'));
});

console.log('[E2E Ledger Assertions] all checks passed');

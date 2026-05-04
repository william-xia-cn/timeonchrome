// Unit tests for shared stale-gap accounting boundary helpers.
// Run with: node tests/unit/time-boundary.test.js

'use strict';

const fs = require('fs');
const path = require('path');

function loadProdModule(relPath, exportNames, injected = {}) {
  const abs = path.join(__dirname, '..', '..', relPath);
  let code = fs.readFileSync(abs, 'utf8');

  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');

  const injectedKeys = Object.keys(injected);
  const prelude = injectedKeys.length ? `const { ${injectedKeys.join(', ')} } = __injected;\n` : '';
  const factory = new Function('__injected', `${prelude}${code}\nreturn { ${exportNames.join(', ')} };`);
  return factory(injected);
}

const {
  getReliableCloseTime,
  getCappedElapsedMs,
  STALE_GAP_THRESHOLD,
} = loadProdModule('runtime/time-boundary.js', [
  'getReliableCloseTime',
  'getCappedElapsedMs',
  'STALE_GAP_THRESHOLD',
]);

let passed = 0;
let failed = 0;

function check(desc, condition) {
  if (condition) {
    passed++;
    return;
  }
  failed++;
  console.error(`  x ${desc}`);
}

function expectEqual(desc, actual, expected) {
  check(`${desc} expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`, JSON.stringify(actual) === JSON.stringify(expected));
}

function runTests() {
  const t0 = 1777205000000;

  const fresh = getReliableCloseTime({
    state: 'ACTIVE',
    startTime: t0,
    lastHeartbeat: t0 + 30_000,
  }, t0 + 60_000);
  expectEqual('non-stale close uses now', fresh, { closeTime: t0 + 60_000, stale: false });

  const stale = getReliableCloseTime({
    state: 'ACTIVE',
    startTime: t0,
    lastHeartbeat: t0 + 10_000,
  }, t0 + STALE_GAP_THRESHOLD + 20_000);
  expectEqual('stale close uses lastHeartbeat', stale, { closeTime: t0 + 10_000, stale: true });

  const invalidEarly = getReliableCloseTime({
    state: 'ACTIVE',
    startTime: t0,
    lastHeartbeat: t0 - 5_000,
  }, t0 + STALE_GAP_THRESHOLD + 20_000);
  expectEqual('close time clamps upward to startTime', invalidEarly, { closeTime: t0, stale: true });

  const invalidNaN = getReliableCloseTime({
    state: 'ACTIVE',
    startTime: t0,
    lastHeartbeat: Number.NaN,
  }, t0 + STALE_GAP_THRESHOLD + 20_000);
  expectEqual('non-finite lastHeartbeat closes at now', invalidNaN, { closeTime: t0 + STALE_GAP_THRESHOLD + 20_000, stale: false });

  const cappedElapsed = getCappedElapsedMs({
    state: 'ACTIVE',
    startTime: t0,
    lastHeartbeat: t0 + 8_000,
  }, t0 + STALE_GAP_THRESHOLD + 30_000);
  expectEqual('badge/current elapsed caps at lastHeartbeat when stale', cappedElapsed, 8_000);

  const total = passed + failed;
  console.log(`\n[Time Boundary] ${passed}/${total} passed${failed ? ` - ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

runTests();

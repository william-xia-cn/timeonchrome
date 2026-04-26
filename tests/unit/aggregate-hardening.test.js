// Phase 2A test-first: aggregation hardening tests for core/aggregate.js
// Run with: node tests/unit/aggregate-hardening.test.js

'use strict';

const fs = require('fs');
const path = require('path');

function loadProdModule(relPath, exportNames) {
  const abs = path.join(__dirname, '..', '..', relPath);
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');

  const exportObjFields = exportNames.map(
    n => `"${n}": (typeof ${n} !== 'undefined' ? ${n} : undefined)`
  );
  const factory = new Function(`${code}\nreturn { ${exportObjFields.join(', ')} };`);
  return factory();
}

const aggregateApi = loadProdModule('core/aggregate.js', [
  'computeDuration',
  'computeAllDomains',
  'computeAllDomainsWithAudio',
  // optional internal diagnostics helper path (if later added)
  'aggregateWithDiagnostics',
  '__aggregateWithDiagnostics',
]);

const computeDuration = aggregateApi.computeDuration;
const computeAllDomains = aggregateApi.computeAllDomains;
const computeAllDomainsWithAudio = aggregateApi.computeAllDomainsWithAudio;
const diagFn = aggregateApi.aggregateWithDiagnostics || aggregateApi.__aggregateWithDiagnostics;

function ts(h, m, s = 0) {
  return new Date(2026, 3, 21, h, m, s).getTime(); // local 2026-04-21
}

function localTs(date, h, m, s = 0) {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m, s).getTime();
}

let passed = 0;
let failed = 0;

function expect(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${desc}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

function expectTrue(desc, cond) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
  }
}

function section(name) {
  console.log(`\n[${name}]`);
}

async function runTests() {
  const date = '2026-04-21';

  section('A1: out-of-order START/END should still produce deterministic duration after sorting');
  {
    const events = [
      { type: 'END', state: 'ACTIVE', domain: 'a.com', time: ts(10, 0, 1) },
      { type: 'START', state: 'ACTIVE', domain: 'a.com', time: ts(10, 0, 0) },
    ];

    expect('computeDuration(a.com)=1s', computeDuration(events, 'a.com', date), 1);
    expect('computeAllDomains(a.com)=1s', computeAllDomains(events, date)['a.com'], 1);
  }

  section('A2: orphan END must be ignored (no guessed START)');
  {
    const events = [
      { type: 'END', state: 'ACTIVE', domain: 'a.com', time: ts(11, 0, 0) },
    ];

    expect('computeDuration should be 0', computeDuration(events, 'a.com', date), 0);
    const all = computeAllDomains(events, date);
    expectTrue('allDomains should not contain a.com', !('a.com' in all));

    if (typeof diagFn === 'function') {
      const d = diagFn(events, date);
      expectTrue('diagnostics should report ignored orphan END', (d?.diagnostics?.ignored_orphan_end || 0) >= 1);
    }
  }

  section('A3: consecutive START without END should not count duration');
  {
    const events = [
      { type: 'START', state: 'ACTIVE', domain: 'a.com', time: ts(12, 0, 0) },
      { type: 'START', state: 'ACTIVE', domain: 'a.com', time: ts(12, 0, 5) },
    ];

    expect('computeDuration should be 0', computeDuration(events, 'a.com', date), 0);
    const all = computeAllDomains(events, date);
    expectTrue('allDomains should not contain a.com', !('a.com' in all));
  }

  section('A4: non-positive segment durations must be ignored');
  {
    const events = [
      { type: 'START', state: 'ACTIVE', domain: 'a.com', time: ts(13, 0, 0) },
      { type: 'END', state: 'ACTIVE', domain: 'a.com', time: ts(13, 0, 0) }, // zero duration
    ];

    expect('computeDuration should be 0', computeDuration(events, 'a.com', date), 0);
    const all = computeAllDomains(events, date);
    expectTrue('allDomains should not contain a.com', !('a.com' in all));
  }

  section('A5: orphan END for another domain must not close current open START');
  {
    const events = [
      { type: 'START', state: 'ACTIVE', domain: 'a.com', time: ts(14, 0, 0) },
      { type: 'END', state: 'ACTIVE', domain: 'b.com', time: ts(14, 0, 1) }, // orphan for b.com
      { type: 'END', state: 'ACTIVE', domain: 'a.com', time: ts(14, 0, 2) },
    ];

    const all = computeAllDomains(events, date);
    expect('a.com should be 2s (wait for same-domain END)', all['a.com'], 2);
    expectTrue('b.com should not be counted', !('b.com' in all));
    expect('computeDuration(a.com)=2s', computeDuration(events, 'a.com', date), 2);
  }

  section('A6: unknown state should remain conservative (weight=0)');
  {
    const events = [
      { type: 'START', state: 'UNKNOWN_STATE', domain: 'a.com', time: ts(15, 0, 0) },
      { type: 'END', state: 'UNKNOWN_STATE', domain: 'a.com', time: ts(15, 0, 2) },
    ];

    expect('computeDuration should be 0', computeDuration(events, 'a.com', date), 0);
    const all = computeAllDomains(events, date);
    expectTrue('allDomains should not contain a.com', !('a.com' in all));
  }


  section('A7: BACKGROUND_ACTIVE should be split into audioSeconds only');
  {
    const events = [
      { type: 'START', state: 'BACKGROUND_ACTIVE', domain: 'music.com', time: ts(16, 0, 0) },
      { type: 'END', state: 'BACKGROUND_ACTIVE', domain: 'music.com', time: ts(16, 0, 5) },
      { type: 'START', state: 'ACTIVE', domain: 'study.com', time: ts(16, 1, 0) },
      { type: 'END', state: 'ACTIVE', domain: 'study.com', time: ts(16, 1, 4) },
    ];

    const all = computeAllDomains(events, date);
    expectTrue('普通统计不应包含 music.com', !('music.com' in all));
    expect('study.com active=4s', all['study.com'], 4);

    const split = computeAllDomainsWithAudio(events, date);
    expect('audioSeconds=5s', split.audioSeconds, 5);
    expectTrue('split.domains 不含 music.com', !('music.com' in split.domains));
    expect('split.domains.study.com=4s', split.domains['study.com'], 4);
  }

  section('A8: cross-midnight ACTIVE segment should be split by local natural day');
  {
    const events = [
      { type: 'START', state: 'ACTIVE', domain: 'late.example', time: localTs('2026-04-21', 23, 59, 50) },
      { type: 'END', state: 'ACTIVE', domain: 'late.example', time: localTs('2026-04-22', 0, 0, 10) },
    ];

    expect('start day gets 10s', computeDuration(events, 'late.example', '2026-04-21'), 10);
    expect('end day gets 10s', computeDuration(events, 'late.example', '2026-04-22'), 10);
    expect('allDomains start day gets 10s', computeAllDomains(events, '2026-04-21'), { 'late.example': 10 });
    expect('allDomains end day gets 10s', computeAllDomains(events, '2026-04-22'), { 'late.example': 10 });
  }

  section('A9: cross-midnight BACKGROUND_ACTIVE should be split into audioSeconds by local day');
  {
    const events = [
      { type: 'START', state: 'BACKGROUND_ACTIVE', domain: 'music.example', time: localTs('2026-04-21', 23, 59, 55) },
      { type: 'END', state: 'BACKGROUND_ACTIVE', domain: 'music.example', time: localTs('2026-04-22', 0, 0, 5) },
    ];

    expect('ordinary domains stay empty on start day', computeAllDomains(events, '2026-04-21'), {});
    expect('ordinary domains stay empty on end day', computeAllDomains(events, '2026-04-22'), {});
    expect('audioSeconds start day gets 5s', computeAllDomainsWithAudio(events, '2026-04-21').audioSeconds, 5);
    expect('audioSeconds end day gets 5s', computeAllDomainsWithAudio(events, '2026-04-22').audioSeconds, 5);
  }

  const total = passed + failed;
  console.log(`\n[Aggregate Hardening] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});

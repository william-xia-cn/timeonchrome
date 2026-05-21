// media-settlement-analysis.test.js
// Run with: node tests/unit/media-settlement-analysis.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function expect(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else {
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

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayKey() {
  return formatDate(new Date());
}

function loadHandleMessage(stubs = {}) {
  const abs = path.join(__dirname, '..', '..', 'extension', 'message-router.js');
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');

  const context = {
    getDateKey: todayKey,
    formatDate,
    getMediaSettlementAnalysisView: async () => ({ ok: true, rows: [], summary: { totalSeconds: 0 } }),
    getConfig: async () => ({}),
    flushOpenSessionToStats: async () => ({ ok: true }),
    ...stubs,
    URL,
    chrome: {
      runtime: {
        id: 'ext-id',
        getURL: (p = '/') => `chrome-extension://ext-id${p}`,
      },
      storage: { local: { set: async () => {} } },
      tabs: { query: async () => [], update: async () => {} },
    },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    btoa: (s) => Buffer.from(String(s), 'utf8').toString('base64'),
    console,
  };

  vm.createContext(context);
  vm.runInContext(`${code}\nthis.__handleMessage = handleMessage;`, context, { filename: 'message-router.js' });
  return { handleMessage: context.__handleMessage };
}

function mediaSegment(id, overrides = {}) {
  const base = new Date(`${todayKey()}T10:00:00+08:00`).getTime();
  return {
    id,
    date: todayKey(),
    startMs: base,
    endMs: base + 15_000,
    durationSeconds: 15,
    domain: 'media.example.com',
    tabId: 11,
    windowId: 22,
    mediaClass: 'foregroundVideo',
    mediaKind: 'video',
    visibility: 'foreground',
    mode: 'study',
    settlementReason: 'tabAudible',
    description: {
      schemaVersion: 1,
      start: { reason: 'mediaState', operation: 'mediaState', source: 'media', atMs: base },
      end: { reason: 'tabAudible', operation: 'tabAudible', source: 'media', atMs: base + 15_000 },
      summary: '开始：mediaState；结束：tabAudible',
    },
    ...overrides,
  };
}

async function run() {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'message-router.js'), 'utf8');
  expectTrue('router imports managed media settlement view', source.includes("from './stats/managed-statistics.js'") && source.includes('getMediaSettlementAnalysisView'));
  expectTrue('router exposes media settlement analysis message', source.includes('GET_MEDIA_SETTLEMENT_ANALYSIS_RANGE'));

  let flushCalls = 0;
  const oldDate = '1970-01-01';
  const rows = [
    {
      ...mediaSegment('a', { mediaClass: 'foregroundVideo', durationSeconds: 15 }),
      openOperation: 'mediaState',
      closeOperation: 'tabAudible',
    },
    {
      ...mediaSegment('b', { mediaClass: 'backgroundAudio', durationSeconds: 20 }),
      openOperation: 'mediaState',
      closeOperation: 'tabAudible',
    },
    {
      ...mediaSegment('c', { date: oldDate, mediaClass: 'pip', durationSeconds: 30, description: null }),
      openOperation: null,
      closeOperation: null,
    },
  ];
  const byRange = {
    today: {
      ok: true,
      range: 'today',
      rows: rows.filter((row) => row.date === todayKey()),
      summary: { totalSeconds: 35, foregroundVideoSeconds: 15, backgroundAudioSeconds: 20 },
    },
    all: {
      ok: true,
      range: 'all',
      rows,
      summary: { totalSeconds: 65 },
    },
    week: {
      ok: true,
      range: 'week',
      rows: rows.filter((row) => row.date !== oldDate),
      summary: { totalSeconds: 35 },
    },
  };
  const { handleMessage } = loadHandleMessage({
    getMediaSettlementAnalysisView: async (range) => byRange[range] || byRange.today,
    flushOpenSessionToStats: async () => { flushCalls++; return { ok: true }; },
  });

  const today = await handleMessage({ type: 'GET_MEDIA_SETTLEMENT_ANALYSIS_RANGE', range: 'today' }, {});
  expect('today returns only today media rows', today.rows.length, 2);
  expect('today summary total seconds', today.summary.totalSeconds, 35);
  expect('today foreground video seconds', today.summary.foregroundVideoSeconds, 15);
  expect('today background audio seconds', today.summary.backgroundAudioSeconds, 20);
  expect('media rows expose open operation', today.rows.find(row => row.id === 'a').openOperation, 'mediaState');
  expect('media rows expose close operation', today.rows.find(row => row.id === 'a').closeOperation, 'tabAudible');
  expect('media analysis does not flush sessions', flushCalls, 0);

  const all = await handleMessage({ type: 'GET_MEDIA_SETTLEMENT_ANALYSIS_RANGE', range: 'all' }, {});
  expect('all returns historical rows too', all.rows.length, 3);
  expect('missing description is tolerated', all.rows.find(row => row.id === 'c').openOperation, null);
  expectTrue('media rows sort newest first', all.rows[0].startMs >= all.rows[1].startMs);

  const week = await handleMessage({ type: 'GET_MEDIA_SETTLEMENT_ANALYSIS_RANGE', range: 'week' }, {});
  expect('week excludes old date row', week.rows.some(row => row.date === oldDate), false);

  const total = passed + failed;
  console.log(`\n[Media Settlement Analysis] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

// admin-read-model.test.js
// Run with: node tests/unit/admin-read-model.test.js

'use strict';

const fs = require('fs');
const path = require('path');

class MockStorage {
  constructor() { this.data = {}; }
  reset() { this.data = {}; }
  async get(keys) {
    if (keys === null) return { ...this.data };
    if (Array.isArray(keys)) {
      const out = {};
      keys.forEach((key) => { out[key] = this.data[key]; });
      return out;
    }
    if (typeof keys === 'string') return { [keys]: this.data[keys] };
    if (keys && typeof keys === 'object') {
      const out = {};
      Object.keys(keys).forEach((key) => { out[key] = this.data[key] ?? keys[key]; });
      return out;
    }
    return {};
  }
  async set(obj) { Object.assign(this.data, obj); }
}

function loadProdModule(relPath, exportNames) {
  const abs = path.join(__dirname, '..', '..', 'extension', relPath);
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');
  const factory = new Function(`${code}\nreturn { ${exportNames.join(', ')} };`);
  return factory();
}

let passed = 0;
let failed = 0;

function check(label, condition, details = '') {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  FAIL ${label}${details ? `: ${details}` : ''}`);
  }
}

function eq(label, actual, expected) {
  check(label, JSON.stringify(actual) === JSON.stringify(expected), `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const local = new MockStorage();
global.chrome = { storage: { local } };

const sourcePath = path.join(__dirname, '..', '..', 'extension', 'stats', 'admin-read-model.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const adminStats = loadProdModule('stats/admin-read-model.js', [
  'getAdminUsageAnalysisView',
  'getAdminSettlementView',
  'getAdminMediaSettlementView',
  'getAdminHourlyUsageView',
  'getAdminHourlyMediaView',
  'getAdminRangeBounds',
]);

async function seedBaseData() {
  const today = todayKey();
  const yesterday = yesterdayKey();
  const now = Date.now();
  await local.set({
    guardian_config: {
      studyList: ['study.example'],
      compositeList: ['video.example'],
    },
    daily_usage_stats_v1: {
      [today]: {
        date: today,
        domains: {
          'study.example': {
            activeSeconds: 120,
            backgroundMediaSeconds: 5,
            pipSeconds: 0,
            activeByMode: { study: 120 },
            backgroundMediaByMode: { study: 5 },
            pipByMode: {},
          },
          'video.example': {
            activeSeconds: 60,
            backgroundMediaSeconds: 0,
            pipSeconds: 0,
            activeByMode: { composite: 60 },
            backgroundMediaByMode: {},
            pipByMode: {},
          },
          'rest.example': {
            activeSeconds: 30,
            backgroundMediaSeconds: 0,
            pipSeconds: 7,
            activeByMode: { rest: 30 },
            backgroundMediaByMode: {},
            pipByMode: { rest: 7 },
          },
        },
      },
      [yesterday]: {
        date: yesterday,
        domains: {
          'old.example': {
            activeSeconds: 40,
            backgroundMediaSeconds: 0,
            pipSeconds: 0,
            activeByMode: { rest: 40 },
            backgroundMediaByMode: {},
            pipByMode: {},
          },
        },
      },
    },
    usage_segments_v1: {
      seg1: {
        id: 'seg1',
        date: today,
        domain: 'study.example',
        channel: 'active',
        mode: 'study',
        sourceState: 'ACTIVE',
        startMs: now - 210000,
        endMs: now - 90000,
        durationSeconds: 120,
        settlementReason: 'periodic_checkpoint',
        description: { start: { reason: 'tabUpdated' }, end: { reason: 'periodic_checkpoint' } },
      },
      seg2: {
        id: 'seg2',
        date: today,
        domain: 'video.example',
        channel: 'active',
        mode: 'composite',
        sourceState: 'ACTIVE',
        startMs: now - 90000,
        endMs: now - 30000,
        durationSeconds: 60,
        settlementReason: 'transition_complete',
      },
      seg3: {
        id: 'seg3',
        date: today,
        domain: 'rest.example',
        channel: 'active',
        mode: 'rest',
        sourceState: 'ACTIVE',
        startMs: now - 30000,
        endMs: now,
        durationSeconds: 30,
        settlementReason: 'transition_complete',
        suspect: true,
        suspectReason: 'active_over_3h',
      },
    },
    media_segments_v1: {
      media1: {
        id: 'media1',
        date: today,
        domain: 'video.example',
        tabId: 10,
        windowId: 1,
        mediaClass: 'foregroundVideo',
        mediaKind: 'video',
        visibility: 'foreground',
        mode: 'composite',
        startMs: now - 60000,
        endMs: now,
        durationSeconds: 60,
        settlementReason: 'mediaState',
        description: { start: { reason: 'mediaState' }, end: { reason: 'mediaState' } },
      },
    },
    daily_media_stats_v1: {
      [today]: {
        date: today,
        domains: {
          'video.example': {
            byMode: {
              composite: { foregroundVideoSeconds: 60 },
            },
          },
        },
      },
    },
    hourly_usage_stats_v1: {
      [`${today}T09`]: {
        hourKey: `${today}T09`,
        date: today,
        hour: 9,
        domains: {
          'study.example': { activeByMode: { study: 30 }, backgroundMediaByMode: {}, pipByMode: {} },
        },
      },
    },
    hourly_media_stats_v1: {
      [`${today}T09`]: {
        hourKey: `${today}T09`,
        date: today,
        hour: 9,
        domains: {
          'video.example': { byMode: { composite: { foregroundVideoSeconds: 60 } } },
        },
      },
    },
  });
}

async function run() {
  const today = todayKey();
  local.reset();
  await seedBaseData();

  check('admin read model has no imports', !/^\s*import\s/m.test(source));
  check('admin read model does not reference background-only modules', !/core\/|runtime\/|product\/|infra\/|message-router/.test(source));
  check('admin read model reads chrome.storage.local', /chrome\.storage\.local\.get/.test(source));

  const usage = await adminStats.getAdminUsageAnalysisView();
  eq('today overview online seconds', usage.todayOverview.online, 217);
  eq('today overview study seconds', usage.todayOverview.study, 120);
  eq('today overview composite seconds', usage.todayOverview.composite, 60);
  eq('today overview rest seconds', usage.todayOverview.rest, 37);
  eq('week data includes yesterday', usage.weekData.domainStats['old.example'], 40);
  eq('timeline uses settled usage segments', usage.timelineSegments.length, 3);
  eq('composite detail comes from local stats', usage.todayCompositeSessions[0].domain, 'video.example');
  eq('suspect summary reads local segments', usage.suspectSummary.markedCount, 1);

  const settlement = await adminStats.getAdminSettlementView('today');
  eq('settlement rows from local usage segments', settlement.segments.length, 3);
  eq('settlement reconciliation stats seconds', settlement.reconciliation.summary.statsSeconds, 222);
  eq('settlement reconciliation segment seconds', settlement.reconciliation.summary.segmentSeconds, 210);

  const media = await adminStats.getAdminMediaSettlementView('today');
  eq('media rows from local media segments', media.rows.length, 1);
  eq('media foreground video summary', media.summary.foregroundVideoSeconds, 60);

  const hourlyUsage = await adminStats.getAdminHourlyUsageView('today');
  eq('hourly usage row count', hourlyUsage.rows.length, 1);
  eq('hourly usage active seconds', hourlyUsage.summary.activeSeconds, 30);

  const hourlyMedia = await adminStats.getAdminHourlyMediaView('today');
  eq('hourly media row count', hourlyMedia.rows.length, 1);
  eq('hourly media foreground video seconds', hourlyMedia.summary.foregroundVideoSeconds, 60);

  local.reset();
  await local.set({
    daily_usage_stats_v1: {
      [today]: {
        date: today,
        domains: {
          'plain.example': {
            activeSeconds: 10,
            backgroundMediaSeconds: 0,
            pipSeconds: 0,
            activeByMode: { rest: 10 },
            backgroundMediaByMode: {},
            pipByMode: {},
          },
        },
      },
    },
  });
  const missingConfig = await adminStats.getAdminUsageAnalysisView();
  eq('missing config falls back without throwing', missingConfig.todayOverview.rest, 10);

  const total = passed + failed;
  console.log(`\n[Admin Read Model] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

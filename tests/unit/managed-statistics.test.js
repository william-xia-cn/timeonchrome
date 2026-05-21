// managed-statistics.test.js
// Run with: node tests/unit/managed-statistics.test.js

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

function loadProdModule(relPath, exportNames, injected = {}) {
  const abs = path.join(__dirname, '..', '..', 'extension', relPath);
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

const local = new MockStorage();
const session = new MockStorage();
global.chrome = { storage: { local, session } };

const usageSegments = {};
const dailyStats = {};
const mediaSegments = {};
const hourlyUsageStats = {};
const hourlyMediaStats = {};
const traces = [];

function matchDomain(domain, pattern) {
  const d = String(domain || '').replace(/^www\./, '');
  const p = String(pattern || '').replace(/^www\./, '');
  return !!d && !!p && (d === p || d.endsWith(`.${p}`));
}

function resolveSiteAccessClassification(config, _records, domain) {
  if ((config.studyList || []).some((pattern) => matchDomain(domain, pattern))) {
    return { classification: 'study' };
  }
  if ((config.compositeList || []).some((pattern) => matchDomain(domain, pattern))) {
    return { classification: 'composite' };
  }
  return { classification: null };
}

const statsApi = loadProdModule('stats/managed-statistics.js', [
  'convertDailyStatsToLegacyShape',
  'getTodayUsageView',
  'getUsageRangeView',
  'getPopupModeStatsView',
  'getQuotaUsageView',
  'getSettlementAnalysisView',
  'getMediaSettlementAnalysisView',
  'getHourlyUsageStatsRangeView',
  'getHourlyMediaStatsRangeView',
], {
  computeAllDomainsWithAudio: () => ({
    domains: { 'fallback.example': 42 },
    audioSeconds: 5,
    backgroundMediaByDomain: { 'audio.example': 5 },
    pipSeconds: 7,
    pipByDomain: { 'pip.example': 7 },
  }),
  matchDomain,
  resolveSiteAccessClassification,
  emitTrace: async (...args) => traces.push(args),
  getAllUsageSegments: async () => usageSegments,
  getDailyUsageStats: async () => dailyStats,
  getMediaSegments: async () => mediaSegments,
  getHourlyUsageStats: async () => hourlyUsageStats,
  getHourlyMediaStats: async () => hourlyMediaStats,
});

let passed = 0;
let failed = 0;

function check(label, condition, details = '') {
  if (condition) {
    passed++;
  } else {
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

async function run() {
  const today = todayKey();
  local.reset();
  session.reset();
  traces.length = 0;

  await local.set({
    daily_usage_stats_v1: {
      [today]: {
        date: today,
        domains: {
          'study.example': {
            activeSeconds: 120,
            backgroundMediaSeconds: 30,
            pipSeconds: 10,
            activeByMode: { study: 120 },
            backgroundMediaByMode: { study: 30 },
            pipByMode: { study: 10 },
          },
          'video.example': {
            activeSeconds: 60,
            backgroundMediaSeconds: 0,
            pipSeconds: 20,
            activeByMode: { rest: 60 },
            backgroundMediaByMode: {},
            pipByMode: { rest: 20 },
          },
          'temp.example': {
            activeSeconds: 90,
            backgroundMediaSeconds: 0,
            pipSeconds: 0,
            activeByMode: { rest: 90 },
            backgroundMediaByMode: {},
            pipByMode: {},
          },
        },
      },
    },
  });
  await session.set({ temporary_composite_domains: ['temp.example'] });

  const todayView = await statsApi.getTodayUsageView({ date: today, config: { compositeList: ['video.example'] } });
  eq('daily stats converts active+pip domain total', todayView.stats['study.example'], 130);
  eq('daily stats exposes background media separately', todayView.stats.audioSeconds, 30);
  eq('daily stats exposes pip by domain', todayView.stats.pipByDomain['video.example'], 20);
  eq('today view uses daily source', todayView.source, 'daily_usage_stats_v1');
  eq('summary computes online seconds from legacy domain totals', todayView.statsWithSummary.onlineSeconds, 300);
  eq('summary computes composite seconds from config', todayView.statsWithSummary.compositeSeconds, 80);

  const popupView = await statsApi.getPopupModeStatsView(today);
  eq('popup mode stats uses active mode seconds only for mode buckets', {
    studySeconds: popupView.summary.studySeconds,
    restSeconds: popupView.summary.restSeconds,
    compositeSeconds: popupView.summary.compositeSeconds,
  }, { studySeconds: 120, restSeconds: 150, compositeSeconds: 0 });
  eq('popup online includes pip', popupView.summary.onlineSeconds, 300);

  const quotaView = await statsApi.getQuotaUsageView(today, { config: { studyList: ['study.example'], compositeList: ['video.example'] } });
  eq('quota classifies study seconds', quotaView.studySeconds, 130);
  eq('quota classifies composite plus temporary composite seconds', quotaView.compositeSeconds, 170);
  eq('quota keeps background media outside online/domain quota', quotaView.media.backgroundMediaSeconds, 30);
  eq('quota rest excludes study/composite domains', quotaView.restSeconds, 0);

  await local.set({ daily_usage_stats_v1: {}, event_log_v1: [{ type: 'START' }] });
  const fallbackView = await statsApi.getTodayUsageView({ date: today });
  eq('fallback source is explicit', fallbackView.source, 'event_log_v1_fallback');
  eq('fallback merges pip into legacy domain total', fallbackView.stats['pip.example'], 7);

  usageSegments.a = {
    id: 'a',
    date: today,
    domain: 'study.example',
    channel: 'active',
    mode: 'study',
    startMs: Date.now() - 10_000,
    endMs: Date.now(),
    durationSeconds: 10,
    settlementReason: 'periodic_checkpoint',
    description: { start: { reason: 'tabUpdated' }, end: { reason: 'periodic_checkpoint' } },
  };
  dailyStats[today] = {
    domains: {
      'study.example': {
        activeByMode: { study: 10 },
        backgroundMediaByMode: {},
        pipByMode: {},
      },
    },
  };
  const settlement = await statsApi.getSettlementAnalysisView('today');
  eq('settlement rows come from usage ledger', settlement.segments.length, 1);
  eq('settlement reconciliation matches daily stats', settlement.reconciliation.summary.mismatchCount, 0);

  mediaSegments.m = {
    id: 'm',
    date: today,
    domain: 'video.example',
    tabId: 11,
    windowId: 22,
    mediaClass: 'foregroundVideo',
    mediaKind: 'video',
    visibility: 'foreground',
    mode: 'rest',
    startMs: Date.now() - 20_000,
    endMs: Date.now(),
    durationSeconds: 20,
    settlementReason: 'mediaState',
    uploadedAt: Date.now(),
    description: { start: { reason: 'mediaState' }, end: { reason: 'mediaState' } },
  };
  const media = await statsApi.getMediaSettlementAnalysisView('today');
  eq('media settlement rows come from media ledger', media.rows.length, 1);
  eq('media settlement preserves upload status', media.rows[0].uploaded, true);
  eq('media summary totals by class', media.summary.foregroundVideoSeconds, 20);

  hourlyUsageStats[`${today}T12`] = {
    hourKey: `${today}T12`,
    date: today,
    hour: 12,
    hourStartMs: 1000,
    hourEndMs: 2000,
    domains: {
      'hour.example': {
        activeByMode: { rest: 70 },
        backgroundMediaByMode: { rest: 5 },
        pipByMode: {},
      },
    },
  };
  const hourlyUsage = await statsApi.getHourlyUsageStatsRangeView('today');
  eq('hourly usage rows flatten by channel/mode', hourlyUsage.rows.map((r) => [r.domain, r.channel, r.mode, r.durationSeconds]), [
    ['hour.example', 'active', 'rest', 70],
    ['hour.example', 'backgroundMedia', 'rest', 5],
  ]);
  eq('hourly usage summary total', hourlyUsage.summary.totalSeconds, 75);

  hourlyMediaStats[`${today}T13`] = {
    hourKey: `${today}T13`,
    date: today,
    hour: 13,
    hourStartMs: 3000,
    hourEndMs: 4000,
    domains: {
      'media-hour.example': {
        byMode: {
          study: {
            foregroundVideoSeconds: 30,
            backgroundAudioSeconds: 15,
          },
        },
      },
    },
  };
  const hourlyMedia = await statsApi.getHourlyMediaStatsRangeView('today');
  eq('hourly media rows flatten media class/mode', hourlyMedia.rows.map((r) => [r.domain, r.mediaClass, r.mode, r.durationSeconds]), [
    ['media-hour.example', 'backgroundAudio', 'study', 15],
    ['media-hour.example', 'foregroundVideo', 'study', 30],
  ]);
  eq('hourly media summary total', hourlyMedia.summary.totalSeconds, 45);

  const total = passed + failed;
  console.log(`\n[Managed Statistics] ${passed}/${total} passed${failed ? ' FAILED' : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

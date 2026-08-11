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

function resetObject(obj) {
  for (const key of Object.keys(obj)) delete obj[key];
}

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
  'convertDailyStatsToTargetShape',
  'getTodayUsageView',
  'getUsageRangeView',
  'getPopupModeStatsView',
  'getQuotaUsageView',
  'getSettlementAnalysisView',
  'getMediaSettlementAnalysisView',
  'getHourlyUsageStatsRangeView',
  'getHourlyMediaStatsRangeView',
], {
  matchDomain,
  resolveSiteAccessClassification,
  emitTrace: async (...args) => traces.push(args),
  getAllUsageSegments: async () => usageSegments,
  getUsageSegmentsByDate: async (date) => Object.values(usageSegments).filter((seg) => seg?.date === date),
  rebuildDailyUsageStats: async (date) => {
    const segments = Object.values(usageSegments).filter((seg) => seg?.date === date);
    const data = await local.get('daily_usage_stats_v1');
    const allStats = data.daily_usage_stats_v1 || {};
    const day = {
      date,
      timezone: 'Asia/Shanghai',
      dayStartMs: null,
      dayEndMs: null,
      segmentsCount: 0,
      lastSegmentId: null,
      domains: {},
      targets: {},
    };
    for (const seg of segments) {
      const domain = seg.domain;
      const seconds = Number(seg.durationSeconds || 0);
      const mode = seg.mode || 'unknown';
      if (!day.domains[domain]) {
        day.domains[domain] = {
          activeSeconds: 0,
          backgroundMediaSeconds: 0,
          pipSeconds: 0,
          totalSeconds: 0,
          activeByMode: {},
          backgroundMediaByMode: {},
          pipByMode: {},
        };
      }
      const ds = day.domains[domain];
      ds.activeSeconds += seconds;
      ds.totalSeconds += seconds;
      ds.activeByMode[mode] = (ds.activeByMode[mode] || 0) + seconds;
      const targetKey = `fallback:domain:${domain}`;
      if (!day.targets[targetKey]) {
        day.targets[targetKey] = {
          targetKey,
          fallbackDomain: domain,
          isFallback: true,
          activeSeconds: 0,
          totalSeconds: 0,
          activeByMode: {},
          activeByQuotaBucket: {},
          rows: {},
        };
      }
      const ts = day.targets[targetKey];
      ts.activeSeconds += seconds;
      ts.totalSeconds += seconds;
      ts.activeByMode[mode] = (ts.activeByMode[mode] || 0) + seconds;
      ts.activeByQuotaBucket[mode] = (ts.activeByQuotaBucket[mode] || 0) + seconds;
      day.segmentsCount += 1;
      day.lastSegmentId = seg.id;
    }
    allStats[date] = day;
    await local.set({ daily_usage_stats_v1: allStats });
    return { date, rebuilt: true, segmentsUsed: segments.length };
  },
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
        targets: {
          mt_study_playlist: {
            managedTargetId: 'mt_study_playlist',
            managedTargetType: 'playlist',
            managedTargetNamespace: 'youtube',
            managedTargetValue: 'PLSTUDY',
            managedTargetLabelAtTime: 'Study Playlist',
            targetClassificationAtTime: 'study',
            fallbackDomain: 'www.youtube.com',
            isFallback: false,
            activeSeconds: 150,
            backgroundMediaSeconds: 0,
            pipSeconds: 0,
            totalSeconds: 150,
            activeByMode: { rest: 150 },
            activeByQuotaBucket: { study: 150 },
          },
          pending_borrow_rest_quota: {
            managedTargetId: 'pending_borrow_rest_quota',
            managedTargetType: 'domain',
            managedTargetNamespace: 'site',
            managedTargetValue: 'www.youtube.com',
            managedTargetLabelAtTime: 'www.youtube.com',
            targetClassificationAtTime: 'pending_composite',
            fallbackDomain: 'www.youtube.com',
            isFallback: false,
            activeSeconds: 45,
            backgroundMediaSeconds: 0,
            pipSeconds: 0,
            totalSeconds: 45,
            activeByMode: { rest: 45 },
            activeByQuotaBucket: { rest: 45 },
          },
          'fallback:domain:video.example': {
            fallbackDomain: 'video.example',
            isFallback: true,
            activeSeconds: 80,
            backgroundMediaSeconds: 0,
            pipSeconds: 20,
            totalSeconds: 100,
            activeByMode: { rest: 80 },
            pipByMode: { rest: 20 },
            activeByQuotaBucket: { composite: 80 },
            pipByQuotaBucket: { composite: 20 },
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
  eq('today view exposes target rows', todayView.targetStats.rows.length, 3);
  eq('target row prefers snapshot label', todayView.targetStats.rows[0].targetLabel, 'Study Playlist');
  const pendingBorrowRow = todayView.targetStats.rows.find((row) => row.managedTargetId === 'pending_borrow_rest_quota');
  eq('pending Rest borrow keeps content classification and quota source separate', {
    classification: pendingBorrowRow?.targetClassificationAtTime,
    activeByMode: pendingBorrowRow?.activeByMode,
    activeByQuotaBucket: pendingBorrowRow?.activeByQuotaBucket,
  }, {
    classification: 'pending_composite',
    activeByMode: { rest: 45 },
    activeByQuotaBucket: { rest: 45 },
  });

  const popupView = await statsApi.getPopupModeStatsView(today);
  eq('popup mode stats uses active mode seconds only for mode buckets', {
    studySeconds: popupView.summary.studySeconds,
    restSeconds: popupView.summary.restSeconds,
    compositeSeconds: popupView.summary.compositeSeconds,
  }, { studySeconds: 120, restSeconds: 150, compositeSeconds: 0 });
  eq('popup online includes pip', popupView.summary.onlineSeconds, 300);

  const quotaView = await statsApi.getQuotaUsageView(today, { config: { studyList: ['study.example'], compositeList: ['video.example'] } });
  eq('quota uses target bucket study seconds', quotaView.studySeconds, 150);
  eq('quota display uses target classification before rest bucket', quotaView.compositeSeconds, 145);
  eq('quota keeps background media outside online/domain quota', quotaView.media.backgroundMediaSeconds, 30);
  eq('quota source is target classification snapshot', quotaView.quotaSource, 'target_classification_snapshot');
  eq('quota rest excludes target study/composite display buckets', quotaView.restSeconds, 0);

  resetObject(usageSegments);
  await local.set({ daily_usage_stats_v1: {}, event_log_v1: [{ type: 'START' }] });
  const emptyView = await statsApi.getTodayUsageView({ date: today });
  eq('missing daily with no segments returns empty segment source', emptyView.source, 'usage_segments_v1_empty');
  eq('missing daily does not fall back to event log', emptyView.stats['fallback.example'], undefined);

  usageSegments.rebuild = {
    id: 'rebuild',
    date: today,
    domain: 'rebuild.example',
    channel: 'active',
    mode: 'study',
    durationSeconds: 42,
  };
  const rebuiltView = await statsApi.getTodayUsageView({ date: today });
  eq('missing daily with segments rebuilds from usage ledger', rebuiltView.source, 'daily_usage_stats_v1_rebuilt');
  eq('rebuilt daily returns segment-derived seconds', rebuiltView.stats['rebuild.example'], 42);

  resetObject(usageSegments);
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

'use strict';

const fs = require('fs');
const path = require('path');

class MockStorage {
  constructor() { this.data = {}; }
  async get(keys) {
    if (keys === null) return { ...this.data };
    if (Array.isArray(keys)) {
      const out = {};
      keys.forEach((k) => { out[k] = this.data[k]; });
      return out;
    }
    if (typeof keys === 'string') return { [keys]: this.data[keys] };
    if (typeof keys === 'object') {
      const out = {};
      Object.keys(keys).forEach((k) => { out[k] = this.data[k] ?? keys[k]; });
      return out;
    }
    return {};
  }
  async set(obj) { Object.assign(this.data, obj); }
}

const mockLocal = new MockStorage();
global.chrome = { storage: { local: mockLocal, session: mockLocal } };

function convertDailyStatsToLegacyShape(dayStats) {
  if (!dayStats || !dayStats.domains) {
    return { audioSeconds: 0, backgroundMediaByDomain: {}, pipSeconds: 0, pipByDomain: {} };
  }
  const out = {};
  const backgroundMediaByDomain = {};
  const pipByDomain = {};
  let audioSeconds = 0;
  let pipSeconds = 0;
  for (const [domain, ds] of Object.entries(dayStats.domains)) {
    out[domain] = (ds.activeSeconds || 0) + (ds.pipSeconds || 0);
    if (ds.backgroundMediaSeconds > 0) {
      backgroundMediaByDomain[domain] = ds.backgroundMediaSeconds;
      audioSeconds += ds.backgroundMediaSeconds;
    }
    if (ds.pipSeconds > 0) {
      pipByDomain[domain] = ds.pipSeconds;
      pipSeconds += ds.pipSeconds;
    }
  }
  return { ...out, audioSeconds, backgroundMediaByDomain, pipSeconds, pipByDomain };
}

function popupModeStats(dayStats) {
  const summary = { studySeconds: 0, restSeconds: 0, compositeSeconds: 0, onlineSeconds: 0, backgroundMediaSeconds: 0, pipSeconds: 0 };
  for (const ds of Object.values(dayStats?.domains || {})) {
    summary.studySeconds += ds.activeByMode?.study || 0;
    summary.restSeconds += ds.activeByMode?.rest || 0;
    summary.compositeSeconds += ds.activeByMode?.composite || 0;
    summary.onlineSeconds += (ds.activeSeconds || 0) + (ds.pipSeconds || 0);
    summary.backgroundMediaSeconds += ds.backgroundMediaSeconds || 0;
    summary.pipSeconds += ds.pipSeconds || 0;
  }
  return summary;
}

function loadProdModule(relPath, exportNames, injected = {}) {
  const abs = path.join(__dirname, '..', '..', 'extension', relPath);
  let code = fs.readFileSync(abs, 'utf-8');
  code = code.replace(/^\s*import[\s\S]*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');
  const injectedKeys = Object.keys(injected);
  const prelude = injectedKeys.length ? `const { ${injectedKeys.join(', ')} } = __injected;\n` : '';
  const factory = new Function('__injected', `${prelude}${code}\nreturn { ${exportNames.join(', ')} };`);
  return factory(injected);
}

const storageApi = loadProdModule('infra/storage.js', ['getTodayStats', 'getPopupSettledModeStats', 'getDateKey'], {
  computeAllDomains: () => ({}),
  computeAllDomainsWithAudio: () => ({ domains: {}, audioSeconds: 0, backgroundMediaByDomain: {}, pipSeconds: 0, pipByDomain: {} }),
  matchDomainV12: () => false,
  normalizeHostname: (h) => h,
  emitTrace: () => {},
  getTodayUsageView: async () => {
    const today = storageApi.getDateKey();
    const dayStats = mockLocal.data.daily_usage_stats_v1?.[today];
    return { stats: convertDailyStatsToLegacyShape(dayStats) };
  },
  getPopupModeStatsView: async () => {
    const today = storageApi.getDateKey();
    const dayStats = mockLocal.data.daily_usage_stats_v1?.[today];
    return { summary: popupModeStats(dayStats) };
  },
});

async function run() {
  const today = storageApi.getDateKey();
  await mockLocal.set({
    daily_usage_stats_v1: {
      [today]: {
        date: today,
        domains: {
          'video.example.com': {
            activeSeconds: 120,
            backgroundMediaSeconds: 30,
            pipSeconds: 50,
            totalSeconds: 200,
            activeByMode: { study: 40, composite: 80 },
            backgroundMediaByMode: { composite: 30 },
            pipByMode: { study: 10, rest: 40 },
          },
          'study.example.com': {
            activeSeconds: 90,
            backgroundMediaSeconds: 0,
            pipSeconds: 0,
            totalSeconds: 90,
            activeByMode: { rest: 90 },
            backgroundMediaByMode: {},
            pipByMode: {},
          },
        },
      },
    },
  });

  const stats = await storageApi.getTodayStats();
  if (stats['video.example.com'] !== 170) {
    throw new Error(`expected domain total active+pip=170, got ${stats['video.example.com']}`);
  }
  if (stats.audioSeconds !== 30) {
    throw new Error(`expected audioSeconds=30, got ${stats.audioSeconds}`);
  }
  if (stats.pipSeconds !== 50) {
    throw new Error(`expected pipSeconds=50, got ${stats.pipSeconds}`);
  }
  if ((stats.backgroundMediaByDomain || {})['video.example.com'] !== 30) {
    throw new Error('expected backgroundMediaByDomain to retain domain contribution');
  }
  if ((stats.pipByDomain || {})['video.example.com'] !== 50) {
    throw new Error('expected pipByDomain to retain domain contribution');
  }

  const popupModeStats = await storageApi.getPopupSettledModeStats();
  const expectedPopupModeStats = {
    studySeconds: 40,
    restSeconds: 90,
    compositeSeconds: 80,
    onlineSeconds: 260,
    backgroundMediaSeconds: 30,
    pipSeconds: 50,
  };
  if (JSON.stringify(popupModeStats) !== JSON.stringify(expectedPopupModeStats)) {
    throw new Error(`expected popup mode stats ${JSON.stringify(expectedPopupModeStats)}, got ${JSON.stringify(popupModeStats)}`);
  }

  await mockLocal.set({ daily_usage_stats_v1: {} });
  const emptyPopupModeStats = await storageApi.getPopupSettledModeStats();
  const expectedEmpty = {
    studySeconds: 0,
    restSeconds: 0,
    compositeSeconds: 0,
    onlineSeconds: 0,
    backgroundMediaSeconds: 0,
    pipSeconds: 0,
  };
  if (JSON.stringify(emptyPopupModeStats) !== JSON.stringify(expectedEmpty)) {
    throw new Error('expected missing popup mode stats to return zeros without fallback');
  }

  console.log('PASS storage-legacy-shape-media-total');
}

run().catch((err) => {
  console.error('FAIL storage-legacy-shape-media-total:', err?.message || err);
  process.exit(1);
});

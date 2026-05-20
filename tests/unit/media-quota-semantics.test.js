// Media quota semantics tests
// Run with: node tests/unit/media-quota-semantics.test.js

'use strict';

const fs = require('fs');
const path = require('path');

function loadProdModule(relPath, exportNames, injected = {}) {
  const abs = path.join(__dirname, '..', '..', relPath);
  let code = fs.readFileSync(abs, 'utf8');
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

function matchDomain(domain, pattern) {
  const d = String(domain || '').replace(/^www\./, '');
  const p = String(pattern || '').replace(/^www\./, '');
  return !!d && !!p && (d === p || d.endsWith('.' + p));
}

function makeConfig(overrides = {}) {
  return {
    enabled: true,
    studyList: ['study.example'],
    compositeList: ['composite.example'],
    dailyOnlineQuota: 0,
    dailyStudyQuota: 0,
    dailyRestQuota: 0,
    dailyUndeterminedQuota: 0,
    weeklyRestQuota: 0,
    quotaState: {
      onlineLocked: false,
      studyLocked: false,
      restLocked: false,
      undeterminedLocked: false,
      weeklyRestLocked: false,
    },
    lockedDomains: [],
    domainQuotas: {},
    ...overrides,
  };
}

let config = makeConfig();
let todayStats = {};
let undeterminedStats = {};
let savedConfig = null;
let redirectAllCalls = 0;
let redirectQuotaCalls = 0;
let redirectLockedCalls = 0;
const notifications = [];

global.chrome = {
  notifications: {
    create: (...args) => notifications.push(args),
  },
  tabs: {
    query: async () => [],
    update: async () => {},
  },
  runtime: {
    getURL: (p) => p,
  },
};

const quotaApi = loadProdModule('product/quota.js', ['checkAllTabsQuota'], {
  getConfig: async () => config,
  saveConfig: async (next) => {
    savedConfig = JSON.parse(JSON.stringify(next));
    config = next;
  },
  getTodayStats: async () => todayStats,
  getTodayUndeterminedStats: async () => undeterminedStats,
  getStatsRange: async () => ({ '2026-05-15': todayStats }),
  getTemporaryCompositeDomains: async () => [],
  getSiteClassificationRequestRecords: async () => [],
  hasTemporaryCompositePermission: async () => false,
  resolveSiteAccessClassification: (cfg, _records, domain) => {
    const isStudy = (cfg.studyList || []).some(p => matchDomain(domain, p));
    const isComposite = (cfg.compositeList || []).some(p => matchDomain(domain, p));
    return { classification: isStudy ? 'study' : isComposite ? 'composite' : null };
  },
  matchDomain,
  extractDomain: (url) => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return null; }
  },
  isSpecialUrl: () => false,
  getDateKey: () => '2026-05-15',
  formatDate: (date) => date.toISOString().slice(0, 10),
});

function reset({ cfg = {}, stats = {}, undetermined = {} } = {}) {
  config = makeConfig(cfg);
  todayStats = stats;
  undeterminedStats = undetermined;
  savedConfig = null;
  redirectAllCalls = 0;
  redirectQuotaCalls = 0;
  redirectLockedCalls = 0;
  notifications.length = 0;
}

async function runQuotaCheck() {
  await quotaApi.checkAllTabsQuota(
    null,
    async () => { redirectAllCalls += 1; },
    async () => { redirectQuotaCalls += 1; },
    async () => { redirectLockedCalls += 1; },
  );
  return savedConfig?.quotaState || config.quotaState;
}

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

async function testRestDomainPipLocksRestQuota() {
  reset({
    cfg: { dailyRestQuota: 1 },
    stats: {
      'rest.example': 60,
      pipSeconds: 60,
      pipByDomain: { 'rest.example': 60 },
      audioSeconds: 0,
      backgroundMediaByDomain: {},
    },
  });
  const state = await runQuotaCheck();
  check('rest domain active+pip reaches rest quota', state.restLocked === true, JSON.stringify(state));
  check('rest quota invokes quota redirect', redirectQuotaCalls === 1, `redirectQuotaCalls=${redirectQuotaCalls}`);
}

async function testStudyDomainPipLocksStudyQuota() {
  reset({
    cfg: { dailyStudyQuota: 1 },
    stats: {
      'study.example': 60,
      pipSeconds: 60,
      pipByDomain: { 'study.example': 60 },
      audioSeconds: 0,
      backgroundMediaByDomain: {},
    },
  });
  const state = await runQuotaCheck();
  check('study domain pip participates in study total', state.studyLocked === true, JSON.stringify(state));
}

async function testCompositeDomainPipLocksUndeterminedQuota() {
  reset({
    cfg: { dailyUndeterminedQuota: 1 },
    stats: {
      'composite.example': 60,
      pipSeconds: 60,
      pipByDomain: { 'composite.example': 60 },
      audioSeconds: 0,
      backgroundMediaByDomain: {},
    },
    undetermined: { 'composite.example': 60 },
  });
  const state = await runQuotaCheck();
  check('composite domain pip participates in composite quota', state.undeterminedLocked === true, JSON.stringify(state));
}

async function testBackgroundAudioDoesNotLockQuota() {
  reset({
    cfg: { dailyOnlineQuota: 1, dailyRestQuota: 1, dailyStudyQuota: 1, dailyUndeterminedQuota: 1 },
    stats: {
      audioSeconds: 7200,
      backgroundMediaByDomain: { 'rest.example': 7200 },
      pipSeconds: 0,
      pipByDomain: {},
    },
  });
  const state = await runQuotaCheck();
  check('background audio does not trigger online quota', state.onlineLocked === false, JSON.stringify(state));
  check('background audio does not trigger rest quota', state.restLocked === false, JSON.stringify(state));
  check('background audio does not trigger study quota', state.studyLocked === false, JSON.stringify(state));
  check('background audio does not trigger composite quota', state.undeterminedLocked === false, JSON.stringify(state));
}

async function testBackgroundVideoDoesNotLockQuota() {
  reset({
    cfg: { dailyOnlineQuota: 1, dailyRestQuota: 1, dailyStudyQuota: 1, dailyUndeterminedQuota: 1 },
    stats: {
      audioSeconds: 10800,
      backgroundMediaByDomain: { 'video.example': 10800 },
      pipSeconds: 0,
      pipByDomain: {},
    },
  });
  const state = await runQuotaCheck();
  check('background video does not trigger online quota', state.onlineLocked === false, JSON.stringify(state));
  check('background video does not trigger rest quota', state.restLocked === false, JSON.stringify(state));
  check('background video does not trigger study quota', state.studyLocked === false, JSON.stringify(state));
  check('background video does not trigger composite quota', state.undeterminedLocked === false, JSON.stringify(state));
}

(async () => {
  const tests = [
    testRestDomainPipLocksRestQuota,
    testStudyDomainPipLocksStudyQuota,
    testCompositeDomainPipLocksUndeterminedQuota,
    testBackgroundAudioDoesNotLockQuota,
    testBackgroundVideoDoesNotLockQuota,
  ];
  for (const test of tests) await test();
  console.log(`\n[Media Quota Semantics] ${passed}/${passed + failed} passed${failed ? ` — ${failed} FAILED` : ''}`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

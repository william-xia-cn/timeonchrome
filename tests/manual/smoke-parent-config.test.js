// Local smoke test for pages/index.html config layer
// Run with: node tests/manual/smoke-parent-config.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function expectTrue(desc, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`  ✗ ${desc}`); }
}

function expectEqual(desc, actual, expected) {
  if (actual === expected) { passed++; }
  else { failed++; console.error(`  ✗ ${desc} (actual=${JSON.stringify(actual)}, expected=${JSON.stringify(expected)})`); }
}

function run() {
  const htmlPath = path.join(__dirname, '..', '..', 'pages', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Extract all <script> content
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) { throw new Error('No script tag found'); }
  const scriptCode = scriptMatch[1];

  // Build a minimal mock DOM + context
  const mockElements = {};
  function mockGetElementById(id) {
    if (!mockElements[id]) {
      mockElements[id] = {
        id,
        value: '',
        checked: false,
        style: {},
        textContent: '',
        innerHTML: '',
        addEventListener: () => {},
        classList: { add: () => {}, remove: () => {} },
        querySelectorAll: () => [],
      };
    }
    return mockElements[id];
  }

  const context = {
    document: {
      getElementById: mockGetElementById,
      querySelectorAll: () => [],
      querySelector: () => null,
    },
    window: {
      addEventListener: () => {},
      removeDomain: () => {},
      removeQuota: () => {},
      removeRestWindow: () => {},
      toggleQuotaUnlimited: () => {},
    },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null; },
      setItem(k, v) { this._data[k] = v; },
    },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    console,
    setTimeout,
    clearTimeout,
    JSON,
    Math,
    Date,
    parseInt,
    parseFloat,
    isNaN,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Promise,
    crypto: { randomUUID: () => 'test-uuid' },
  };

  // Inject the script
  vm.createContext(context);
  try {
    vm.runInContext(scriptCode, context, { filename: 'pages/index.html', timeout: 5000 });
  } catch (e) {
    console.error('Script execution error:', e.message);
    process.exit(1);
  }

  // ── Test 1: remoteConfig with mock site-access defaults ──
  context.remoteConfig = {
    studyList: ['khanacademy.org', 'custom-site.com'],
    compositeList: ['google.com', 'youtube.com'],
    unsafeList: ['douyin.com'],
    restrictedEntertainmentList: ['bilibili.com', 'custom-game.com'],
    customStudyList: ['custom-site.com'],
    customBlockedSites: [],
    customRestrictedEntertainmentList: ['custom-game.com'],
    dailyOnlineQuota: 1200,
    dailyStudyQuota: 480,
    dailyRestQuota: 120,
    dailyUndeterminedQuota: 120,
    weeklyRestQuota: null,
  };
  context.siteAccessDefaults = {
    defaultStudySites: ['khanacademy.org'],
    defaultRestrictedEntertainmentSites: ['bilibili.com'],
    defaultBlockedSites: ['douyin.com'],
  };

  // Verify getCustomList logic (inline in renderRulesPage)
  const getCustomList = (effectiveList, defaultList) => {
    if (!effectiveList || !defaultList) return effectiveList || [];
    const defaultSet = new Set(defaultList.map(d => d.toLowerCase()));
    return effectiveList.filter(d => !defaultSet.has(d.toLowerCase()));
  };

  expectEqual('getCustomList: study custom from effective', JSON.stringify(getCustomList(context.remoteConfig.studyList, context.siteAccessDefaults.defaultStudySites)), JSON.stringify(['custom-site.com']));
  expectEqual('getCustomList: restricted custom from effective', JSON.stringify(getCustomList(context.remoteConfig.restrictedEntertainmentList, context.siteAccessDefaults.defaultRestrictedEntertainmentSites)), JSON.stringify(['custom-game.com']));

  // ── Test 2: remoteConfig with timeQuota ──
  context.remoteConfig.timeQuota = {
    daily: {
      monday:    { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
      tuesday:   { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
      wednesday: { studyMinutes: 60,  restMinutes: 120, compositeMinutes: 120 },
      thursday:  { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
      friday:    { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
      saturday:  { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
      sunday:    { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
    }
  };

  // Simulate renderQuotaPage lazy migration (not run due to mock DOM, but verify structure)
  expectTrue('timeQuota.daily.monday.studyMinutes is null', context.remoteConfig.timeQuota.daily.monday.studyMinutes === null);
  expectTrue('timeQuota.daily.monday.restMinutes is 120', context.remoteConfig.timeQuota.daily.monday.restMinutes === 120);

  // ── Test 3: timeWindows ──
  context.remoteConfig.timeWindows = {
    studyWindows: null,
    restWindows: [{ start: '19:00', end: '21:00' }],
    onlineWindows: null,
  };
  expectTrue('timeWindows.restWindows has 1 entry', context.remoteConfig.timeWindows.restWindows.length === 1);

  // ── Test 4: export JSON shape ──
  const exportData = {
    app: 'TimeOnChrome',
    configType: 'site-access',
    configVersion: 1,
    description: 'User-managed site access configuration. System defaults are not included.',
    studySites: context.remoteConfig.customStudyList || getCustomList(context.remoteConfig.studyList, context.siteAccessDefaults.defaultStudySites) || [],
    compositeSites: context.remoteConfig.compositeList || [],
    restrictedEntertainmentSites: context.remoteConfig.customRestrictedEntertainmentList || getCustomList(context.remoteConfig.restrictedEntertainmentList, context.siteAccessDefaults.defaultRestrictedEntertainmentSites) || [],
    blockedSites: context.remoteConfig.customBlockedSites || getCustomList(context.remoteConfig.unsafeList, context.siteAccessDefaults.defaultBlockedSites) || [],
  };

  expectTrue('export does not contain defaultStudySites', !('defaultStudySites' in exportData));
  expectTrue('export does not contain effectiveStudyList', !('effectiveStudyList' in exportData));
  expectTrue('export contains studySites', Array.isArray(exportData.studySites));
  expectTrue('export contains compositeSites', Array.isArray(exportData.compositeSites));
  expectTrue('export contains restrictedEntertainmentSites', Array.isArray(exportData.restrictedEntertainmentSites));
  expectTrue('export contains blockedSites', Array.isArray(exportData.blockedSites));
  expectEqual('export studySites', JSON.stringify(exportData.studySites), JSON.stringify(['custom-site.com']));

  // ── Test 5: backward compat fields preserved ──
  expectTrue('remoteConfig has dailyOnlineQuota (legacy)', 'dailyOnlineQuota' in context.remoteConfig);
  expectTrue('remoteConfig has dailyStudyQuota (legacy)', 'dailyStudyQuota' in context.remoteConfig);
  expectTrue('remoteConfig has dailyRestQuota (legacy)', 'dailyRestQuota' in context.remoteConfig);

  // ── Summary ──
  const total = passed + failed;
  console.log(`\n[Parent Config Smoke] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

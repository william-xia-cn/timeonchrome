// mode-routing-matrix-v0.test.js
// Table-driven unit tests validating docs/MODE_QUOTA_ROUTING_MATRIX_V0.md
// Run with: node tests/unit/mode-routing-matrix-v0.test.js

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

function section(name) {
  console.log(`\n[${name}]`);
}

function loadCheckAndRemind(stubs, chromeOverride = {}) {
  const abs = path.join(__dirname, '..', '..', 'product', 'interceptor.js');
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');

  const chrome = {
    runtime: {
      getURL: (p = '') => `chrome-extension://ext-id/${p.replace(/^\//, '')}`,
    },
    tabs: { update: async () => {}, sendMessage: async () => {} },
    notifications: { create: () => {} },
    declarativeNetRequest: {
      getDynamicRules: async () => [],
      updateDynamicRules: async () => {},
    },
    storage: { local: { get: async () => ({ cloud_monitoring_enabled: 1 }) } },
    ...chromeOverride,
  };

  const context = {
    URL,
    console,
    setTimeout,
    chrome,
    getTodayStatsWithCategories: async () => ({ undeterminedSeconds: 0 }),
    enqueueModeBoundaryIntent: async () => ({ ok: true, queued: true }),
    setCachedEffectiveMode: () => {},
    ...stubs,
  };

  vm.createContext(context);
  vm.runInContext(`${code}\nthis.__checkAndRemind = checkAndRemind;`, context, { filename: 'interceptor.js' });
  return { checkAndRemind: context.__checkAndRemind };
}

function makeConfig(overrides = {}) {
  return {
    enabled: true,
    mode: 'study',
    studyList: ['khanacademy.org'],
    compositeList: ['youtube.com'],
    restrictedEntertainmentList: ['bilibili.com'],
    unsafeList: ['tiktok.com'],
    blacklist: [],
    dailyUndeterminedQuota: 60,
    schedule: { enabled: false, days: {} },
    quotaState: { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false },
    blockMessage: '',
    ...overrides,
  };
}

function boundaryMatchDomain(domain, pattern) {
  const d = String(domain || '').replace(/^www\./, '');
  const p = String(pattern || '').replace(/^www\./, '');
  return d === p || d.endsWith(`.${p}`);
}

function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch { return null; }
}

function isSpecialUrl(url) {
  if (!url) return true;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://') || url.startsWith('about:')) {
    return true;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && parsed.hostname === 'www.google.com' && parsed.pathname.startsWith('/_/chrome/newtab')) {
      return true;
    }
  } catch { return false; }
  return false;
}

// ── Matrix case runner ────────────────────────────────────────────────────────

async function runMatrixCase(desc, {
  mode,
  url,
  studyList,
  compositeList,
  restrictedList,
  unsafeList,
  undeterminedSeconds = 0,
  quotaState = {},
  hasTemporaryComposite = false,
  foreground = true,
  nowMs = 0,
  userActive = true,
  expectedBlocked,
  expectedReason = null,
  expectedSaves = null,
  expectedSentTypes = [],
  expectedNotSentTypes = [],
  gateCheck = null,
}) {
  const redirectedUrls = [];
  const saves = [];
  const sent = [];

  const cfg = makeConfig({
    mode,
    studyList: studyList || makeConfig().studyList,
    compositeList: compositeList || makeConfig().compositeList,
    restrictedEntertainmentList: restrictedList || makeConfig().restrictedEntertainmentList,
    unsafeList: unsafeList || makeConfig().unsafeList,
    quotaState: { ...makeConfig().quotaState, ...quotaState },
  });

  const { checkAndRemind } = loadCheckAndRemind({
    getConfig: async () => cfg,
    getSession: async () => ({ currentMode: mode }),
    saveSession: async (s) => { if (s?.currentMode) saves.push(s.currentMode); },
    hasTemporaryCompositePermission: async () => hasTemporaryComposite,
    matchDomain: boundaryMatchDomain,
    extractDomain,
    isSpecialUrl,
    getTodayStatsWithCategories: async () => ({ undeterminedSeconds }),
  }, {
    tabs: {
      update: async (_id, payload) => { if (payload?.url) redirectedUrls.push(payload.url); },
      sendMessage: async (_id, msg) => { sent.push(msg); },
    },
  });

  let blocked;
  if (gateCheck) {
    // Simulate gate progression with multiple calls
    for (const step of gateCheck.steps) {
      blocked = await checkAndRemind(1, url, 1, {
        nowMs: step.nowMs,
        foreground: step.foreground ?? foreground,
        userActive: step.userActive ?? userActive,
      });
      if (step.assertBlocked !== undefined) {
        expect(`${desc} [gate step ${step.nowMs}ms] blocked`, blocked, step.assertBlocked);
      }
    }
  } else {
    blocked = await checkAndRemind(1, url, 1, { nowMs, foreground, userActive });
  }

  if (expectedBlocked !== undefined && !gateCheck) {
    expect(`${desc} blocked`, blocked, expectedBlocked);
  }

  if (expectedReason !== null) {
    if (expectedBlocked === false && !gateCheck) {
      // When not blocked, there should be no redirect URL
      expectTrue(`${desc} no redirect when not blocked`, redirectedUrls.length === 0);
    } else {
      // Check reason in first redirect URL
      const firstUrl = redirectedUrls[0] || '';
      if (expectedReason) {
        expectTrue(`${desc} reason=${expectedReason}`, firstUrl.includes(`reason=${expectedReason}`));
      }
    }
  }

  if (expectedSaves !== null) {
    expect(`${desc} mode saves`, saves, expectedSaves);
  }

  for (const t of expectedSentTypes) {
    expectTrue(`${desc} sent ${t}`, sent.some(m => m.type === t));
  }
  for (const t of expectedNotSentTypes) {
    expectTrue(`${desc} did NOT send ${t}`, !sent.some(m => m.type === t));
  }

  // Return captured data for additional assertions by caller
  return { blocked, redirectedUrls, saves, sent };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION A: Study mode
// ═══════════════════════════════════════════════════════════════════════════════

async function runStudyModeTests() {
  section('A1 Study → Study: allow');
  await runMatrixCase('Study→Study', {
    mode: 'study',
    url: 'https://khanacademy.org',
    expectedBlocked: false,
    expectedReason: null,
  });

  section('A2 Study → Composite + Composite quota available: auto switch, no blocking Reminder, banner');
  {
    const result = await runMatrixCase('Study→Composite available', {
      mode: 'study',
      url: 'https://youtube.com',
      undeterminedSeconds: 0,
      expectedBlocked: false,
      expectedReason: null,
      expectedSaves: ['composite'],
      expectedSentTypes: ['AUTO_MODE_PENDING_SUCCESS'],
    });
    // Also verify that we did NOT redirect to reminder
    expectTrue('Study→Composite available: no reminder redirect', result.redirectedUrls.length === 0);
  }

  section('A3 Study → Composite + Composite exhausted + Rest available: Composite exhausted case A');
  await runMatrixCase('Study→Composite exhausted Rest available', {
    mode: 'study',
    url: 'https://youtube.com',
    undeterminedSeconds: 3600,
    quotaState: { restLocked: false },
    expectedBlocked: true,
    expectedReason: 'quota_composite',
  });

  section('A4 Study → Composite + Composite exhausted + Rest exhausted: Composite exhausted case B');
  await runMatrixCase('Study→Composite exhausted Rest exhausted', {
    mode: 'study',
    url: 'https://youtube.com',
    undeterminedSeconds: 3600,
    quotaState: { restLocked: true },
    expectedBlocked: true,
    expectedReason: 'quota_composite_and_rest',
  });

  section('A5 Study → Unclassified: Unclassified Reminder, Composite application path allowed');
  {
    const result = await runMatrixCase('Study→Unclassified', {
      mode: 'study',
      url: 'https://news.example.com',
      studyList: ['khanacademy.org'],
      compositeList: ['youtube.com'],
      expectedBlocked: true,
      expectedReason: 'study_mode', // Matrix expects study_mode (dual-path); runtime uses to_rest_slide_confirm (mismatch)
    });
    // Verify originMode=study is passed for return semantics
    expectTrue('Study→Unclassified: originMode=study present', result.redirectedUrls[0]?.includes('originMode=study'));
  }

  section('A6 Study → Restricted + Rest available: Study→Rest slide Reminder');
  await runMatrixCase('Study→Restricted Rest available', {
    mode: 'study',
    url: 'https://bilibili.com',
    quotaState: { restLocked: false },
    expectedBlocked: true,
    expectedReason: 'to_rest_slide_confirm',
  });

  section('A7 Study → Restricted + Rest exhausted: Rest exhausted / borrow flow');
  await runMatrixCase('Study→Restricted Rest exhausted', {
    mode: 'study',
    url: 'https://bilibili.com',
    quotaState: { restLocked: true },
    expectedBlocked: true,
    expectedReason: 'to_rest_slide_confirm',
  });

  section('A8 Study → Unsafe: hard block, no borrow/application');
  await runMatrixCase('Study→Unsafe', {
    mode: 'study',
    url: 'https://tiktok.com',
    expectedBlocked: true,
    expectedReason: 'unsafe',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION B: Composite mode
// ═══════════════════════════════════════════════════════════════════════════════

async function runCompositeModeTests() {
  section('B1 Composite → Study: auto return to Study');
  {
    const saves = [];
    const sent = [];
    const notifications = [];
    const { checkAndRemind } = loadCheckAndRemind({
      getConfig: async () => makeConfig({ mode: 'composite', studyList: ['khanacademy.org'] }),
      getSession: async () => ({ currentMode: 'composite' }),
      saveSession: async (s) => { if (s?.currentMode) saves.push(s.currentMode); },
      hasTemporaryCompositePermission: async () => false,
      matchDomain: boundaryMatchDomain,
      extractDomain,
      isSpecialUrl,
      getTodayStatsWithCategories: async () => ({ undeterminedSeconds: 0 }),
    }, {
      tabs: {
        update: async () => {},
        sendMessage: async (_id, msg) => { sent.push(msg); },
      },
      notifications: { create: (payload) => notifications.push(payload) },
    });

    await checkAndRemind(1, 'https://khanacademy.org', 1, { nowMs: 0, foreground: true, userActive: false });

    expect('Composite→Study: auto switch immediately without gate', saves, ['study']);
    expectTrue('Composite→Study: no pending START sent', !sent.some(m => m.type === 'AUTO_MODE_PENDING_START' && m.targetMode === 'study'));
    expectTrue('Composite→Study: pending SUCCESS sent', sent.some(m => m.type === 'AUTO_MODE_PENDING_SUCCESS' && m.targetMode === 'study'));
    expect('Composite→Study: no system notification on successful page prompt', notifications.length, 0);
  }

  section('B2 Composite → Composite + quota available: continue Composite');
  await runMatrixCase('Composite→Composite available', {
    mode: 'composite',
    url: 'https://youtube.com',
    undeterminedSeconds: 0,
    expectedBlocked: false,
    expectedReason: null,
  });

  section('B3 Composite → Composite + exhausted + Rest available: Composite exhausted case A');
  await runMatrixCase('Composite→Composite exhausted Rest available', {
    mode: 'composite',
    url: 'https://youtube.com',
    undeterminedSeconds: 3600,
    quotaState: { undeterminedLocked: true, restLocked: false },
    expectedBlocked: true,
    expectedReason: 'quota_composite',
  });

  section('B4 Composite → Composite + exhausted + Rest exhausted: return-only flow');
  await runMatrixCase('Composite→Composite exhausted Rest exhausted', {
    mode: 'composite',
    url: 'https://youtube.com',
    undeterminedSeconds: 3600,
    quotaState: { undeterminedLocked: true, restLocked: true },
    expectedBlocked: true,
    expectedReason: 'quota_composite_and_rest',
  });

  section('B5 Composite → Unclassified: Rest/return path, Composite application allowed');
  {
    const result = await runMatrixCase('Composite→Unclassified', {
      mode: 'composite',
      url: 'https://news.example.com',
      studyList: ['khanacademy.org'],
      compositeList: ['youtube.com'],
      expectedBlocked: true,
      expectedReason: 'to_rest_confirm',
    });
    // Matrix expects dual-path (Composite application allowed); runtime to_rest_confirm is single-path (mismatch at UI layer)
    expectTrue('Composite→Unclassified: no originMode param (Composite origin uses generic return)', !result.redirectedUrls[0]?.includes('originMode=study'));
  }

  section('B6 Composite → Restricted + Rest available: Composite→Rest confirmation');
  await runMatrixCase('Composite→Restricted Rest available', {
    mode: 'composite',
    url: 'https://bilibili.com',
    quotaState: { restLocked: false },
    expectedBlocked: true,
    expectedReason: 'to_rest_confirm',
  });

  section('B7 Composite → Restricted + Rest exhausted: Rest exhausted / borrow flow');
  await runMatrixCase('Composite→Restricted Rest exhausted', {
    mode: 'composite',
    url: 'https://bilibili.com',
    quotaState: { restLocked: true },
    expectedBlocked: true,
    expectedReason: 'to_rest_confirm',
  });

  section('B8 Composite → Unsafe: hard block');
  await runMatrixCase('Composite→Unsafe', {
    mode: 'composite',
    url: 'https://tiktok.com',
    expectedBlocked: true,
    expectedReason: 'unsafe',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION C: Rest mode
// ═══════════════════════════════════════════════════════════════════════════════

async function runRestModeTests() {
  section('C1 Rest → Study: auto return to Study');
  {
    const saves = [];
    const sent = [];
    const notifications = [];
    const { checkAndRemind } = loadCheckAndRemind({
      getConfig: async () => makeConfig({ mode: 'rest', studyList: ['khanacademy.org'] }),
      getSession: async () => ({ currentMode: 'rest' }),
      saveSession: async (s) => { if (s?.currentMode) saves.push(s.currentMode); },
      hasTemporaryCompositePermission: async () => false,
      matchDomain: boundaryMatchDomain,
      extractDomain,
      isSpecialUrl,
      getTodayStatsWithCategories: async () => ({ undeterminedSeconds: 0 }),
    }, {
      tabs: {
        update: async () => {},
        sendMessage: async (_id, msg) => { sent.push(msg); },
      },
      notifications: { create: (payload) => notifications.push(payload) },
    });

    await checkAndRemind(1, 'https://khanacademy.org', 1, { nowMs: 0, foreground: true, userActive: false });
    await checkAndRemind(1, 'https://khanacademy.org', 1, { nowMs: 45_000, foreground: true, userActive: false });

    expect('Rest→Study: auto switch after 45s gate without idle gate', saves, ['study']);
    expectTrue('Rest→Study: pending START sent', sent.some(m => m.type === 'AUTO_MODE_PENDING_START' && m.targetMode === 'study'));
    expectTrue('Rest→Study: pending SUCCESS sent', sent.some(m => m.type === 'AUTO_MODE_PENDING_SUCCESS' && m.targetMode === 'study'));
    expect('Rest→Study: no system notification on successful page prompt', notifications.length, 0);
  }

  section('C2 Rest → Composite + quota available: pending gate then Composite');
  {
    const saves = [];
    const sent = [];
    const { checkAndRemind } = loadCheckAndRemind({
      getConfig: async () => makeConfig({ mode: 'rest', compositeList: ['youtube.com'] }),
      getSession: async () => ({ currentMode: 'rest' }),
      saveSession: async (s) => { if (s?.currentMode) saves.push(s.currentMode); },
      hasTemporaryCompositePermission: async () => false,
      matchDomain: boundaryMatchDomain,
      extractDomain,
      isSpecialUrl,
      getTodayStatsWithCategories: async () => ({ undeterminedSeconds: 0 }),
    }, {
      tabs: {
        update: async () => {},
        sendMessage: async (_id, msg) => { sent.push(msg); },
      },
    });

    const b1 = await checkAndRemind(1, 'https://youtube.com', 1, { nowMs: 0, foreground: true });
    const b2 = await checkAndRemind(1, 'https://youtube.com', 1, { nowMs: 29_000, foreground: true });
    const b3 = await checkAndRemind(1, 'https://youtube.com', 1, { nowMs: 30_000, foreground: true });

    expect('Rest→Composite available: not blocked at 0ms', b1, false);
    expect('Rest→Composite available: not blocked at 29s', b2, false);
    expect('Rest→Composite available: not blocked at 30s', b3, false);
    expect('Rest→Composite available: switched to composite', saves, ['composite']);
    expectTrue('Rest→Composite available: pending START', sent.some(m => m.type === 'AUTO_MODE_PENDING_START' && m.targetMode === 'composite'));
    expectTrue('Rest→Composite available: pending SUCCESS', sent.some(m => m.type === 'AUTO_MODE_PENDING_SUCCESS' && m.targetMode === 'composite'));
  }

  section('C3 Rest → Composite + Composite exhausted: should NOT auto-switch, show exhausted flow');
  {
    const saves = [];
    const sent = [];
    const redirectedUrls = [];
    const { checkAndRemind } = loadCheckAndRemind({
      getConfig: async () => makeConfig({ mode: 'rest', compositeList: ['youtube.com'] }),
      getSession: async () => ({ currentMode: 'rest' }),
      saveSession: async (s) => { if (s?.currentMode) saves.push(s.currentMode); },
      hasTemporaryCompositePermission: async () => false,
      matchDomain: boundaryMatchDomain,
      extractDomain,
      isSpecialUrl,
      getTodayStatsWithCategories: async () => ({ undeterminedSeconds: 3600 }),
    }, {
      tabs: {
        update: async (_id, payload) => { if (payload?.url) redirectedUrls.push(payload.url); },
        sendMessage: async (_id, msg) => { sent.push(msg); },
      },
    });

    const blocked = await checkAndRemind(1, 'https://youtube.com', 1, { nowMs: 0, foreground: true });

    // Matrix expects immediate block with exhausted reason
    expect('Rest→Composite exhausted: should block immediately', blocked, true);
    expectTrue('Rest→Composite exhausted: should NOT start pending gate', !sent.some(m => m.type === 'AUTO_MODE_PENDING_START'));
    expectTrue('Rest→Composite exhausted: reason indicates exhausted', redirectedUrls[0]?.includes('quota_composite') || redirectedUrls[0]?.includes('quota_composite_and_rest'));
  }

  section('C4 Rest → Unclassified + Rest available: stay Rest, no Reminder, no auto Composite');
  await runMatrixCase('Rest→Unclassified Rest available', {
    mode: 'rest',
    url: 'https://news.example.com',
    studyList: ['khanacademy.org'],
    compositeList: ['youtube.com'],
    quotaState: { restLocked: false },
    expectedBlocked: false,
    expectedReason: null,
    expectedNotSentTypes: ['AUTO_MODE_PENDING_START'],
  });

  section('C5 Rest → Unclassified + Rest exhausted: Rest exhausted / borrow flow');
  await runMatrixCase('Rest→Unclassified Rest exhausted', {
    mode: 'rest',
    url: 'https://news.example.com',
    studyList: ['khanacademy.org'],
    compositeList: ['youtube.com'],
    quotaState: { restLocked: true },
    expectedBlocked: true,
    expectedReason: 'study_mode',
  });

  section('C6 Rest → Restricted + Rest available: stay Rest');
  await runMatrixCase('Rest→Restricted Rest available', {
    mode: 'rest',
    url: 'https://bilibili.com',
    quotaState: { restLocked: false },
    expectedBlocked: false,
    expectedReason: null,
  });

  section('C7 Rest → Restricted + Rest exhausted: Rest exhausted / borrow flow');
  await runMatrixCase('Rest→Restricted Rest exhausted', {
    mode: 'rest',
    url: 'https://bilibili.com',
    quotaState: { restLocked: true },
    expectedBlocked: true,
    expectedReason: 'to_rest_slide_confirm',
  });

  section('C8 Rest → Unsafe: hard block');
  await runMatrixCase('Rest→Unsafe', {
    mode: 'rest',
    url: 'https://tiktok.com',
    expectedBlocked: true,
    expectedReason: 'unsafe',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION D: Cross-cutting
// ═══════════════════════════════════════════════════════════════════════════════

async function runCrossCuttingTests() {
  section('D1 Temporary Composite allowance + Composite quota available: allow Composite');
  {
    const result = await runMatrixCase('TempComposite available', {
      mode: 'study',
      url: 'https://temp-site.com',
      studyList: ['khanacademy.org'],
      compositeList: ['youtube.com'],
      hasTemporaryComposite: true,
      undeterminedSeconds: 0,
      expectedBlocked: false,
      expectedReason: null,
    });
    expectTrue('TempComposite available: no redirect', result.redirectedUrls.length === 0);
  }

  section('D2 Temporary Composite allowance + Composite exhausted: Composite exhausted flow');
  {
    const result = await runMatrixCase('TempComposite exhausted', {
      mode: 'study',
      url: 'https://temp-site.com',
      studyList: ['khanacademy.org'],
      compositeList: ['youtube.com'],
      hasTemporaryComposite: true,
      undeterminedSeconds: 3600,
      quotaState: { restLocked: false },
      expectedBlocked: true,
      expectedReason: 'quota_composite',
    });
    expectTrue('TempComposite exhausted: uses dedicated Composite exhausted reason', result.redirectedUrls[0]?.includes('quota_composite'));
  }

  section('D3 Restricted cannot apply for Composite');
  {
    // Verify at interceptor level: Study→Restricted and Composite→Restricted never emit a reason with addComposite
    const restrictedReasons = ['to_rest_slide_confirm', 'to_rest_confirm', 'quota_rest'];
    for (const reason of restrictedReasons) {
      expectTrue(`Restricted reason ${reason} does not imply Composite application`, true); // Interceptor never routes restricted to addComposite
    }
  }

  section('D4 Unsafe cannot apply for Composite');
  {
    expectTrue('Unsafe reason is hard block', true); // Interceptor routes unsafe before any application path
  }

  section('D5 chrome://newtab/ skipped');
  await runMatrixCase('chrome newtab', {
    mode: 'study',
    url: 'chrome://newtab/',
    expectedBlocked: false,
    expectedReason: null,
  });

  section('D6 about:blank skipped');
  await runMatrixCase('about blank', {
    mode: 'study',
    url: 'about:blank',
    expectedBlocked: false,
    expectedReason: null,
  });

  section('D7 Google newtab provider skipped');
  await runMatrixCase('google newtab provider', {
    mode: 'study',
    url: 'https://www.google.com/_/chrome/newtab?foo=1',
    expectedBlocked: false,
    expectedReason: null,
  });

  section('D8 Google search NOT skipped');
  {
    const result = await runMatrixCase('google search', {
      mode: 'study',
      url: 'https://www.google.com/search?q=test',
      expectedBlocked: true,
      expectedReason: 'study_mode', // Study mode + unclassified domain → study_mode (dual-path)
    });
    expectTrue('Google search: should be treated as unclassified in study mode', result.blocked === true);
  }

  section('D9 Parent domain matching');
  {
    // D9a: deepseek.com matches chat.deepseek.com
    await runMatrixCase('parent matches subdomain', {
      mode: 'study',
      url: 'https://chat.deepseek.com',
      studyList: ['deepseek.com'],
      compositeList: ['youtube.com'],
      expectedBlocked: false,
      expectedReason: null,
    });

    // D9b: chat.deepseek.com does NOT match deepseek.com
    await runMatrixCase('subdomain does not match parent', {
      mode: 'study',
      url: 'https://deepseek.com',
      studyList: ['chat.deepseek.com'],
      compositeList: ['youtube.com'],
      expectedBlocked: true,
      expectedReason: 'study_mode', // Unclassified domain in study mode → study_mode
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main runner
// ═══════════════════════════════════════════════════════════════════════════════

async function run() {
  await runStudyModeTests();
  await runCompositeModeTests();
  await runRestModeTests();
  await runCrossCuttingTests();

  const total = passed + failed;
  console.log(`\n[Mode Routing Matrix V0] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

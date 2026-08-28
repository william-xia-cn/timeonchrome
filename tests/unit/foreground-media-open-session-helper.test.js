// Foreground legacy media helper tests
// Run with: node tests/unit/foreground-media-open-session-helper.test.js

'use strict';

const fs = require('fs');
const path = require('path');

function loadProdModule(relPath, exportNames, injected = {}) {
  const abs = path.join(__dirname, '..', '..', 'extension', relPath);
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import[\s\S]*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');
  const keys = Object.keys(injected);
  const prelude = keys.length ? `const { ${keys.join(', ')} } = __injected;\n` : '';
  return new Function('__injected', `${prelude}${code}\nreturn { ${exportNames.join(', ')} };`)(injected);
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (_) {
    return null;
  }
}

function classifyMediaFact(fact = {}) {
  if (fact.isPiP === true) return { mediaClass: 'pip' };
  const strongContent = fact.evidenceTier === 'content';
  const foreground = fact.isActiveTab === true &&
    fact.windowState !== 'minimized' &&
    (strongContent
      ? fact.documentVisible === true && (
          (fact.mediaKind === 'video' && fact.playing === true && Number(fact.visibleMediaCount) > 0) ||
          (fact.mediaKind === 'audio' && fact.playing === true && fact.audible === true && fact.muted !== true)
        )
      : fact.isWindowFocused === true);
  if (fact.playing !== true && fact.audible !== true) return { mediaClass: null };
  if (fact.mediaKind === 'video') return { mediaClass: foreground ? 'foregroundVideo' : 'backgroundVideo' };
  if (fact.mediaKind === 'audio' || fact.audible === true) return { mediaClass: foreground ? 'foregroundAudio' : 'backgroundAudio' };
  return { mediaClass: null };
}

function check(name, condition, details = '') {
  if (!condition) throw new Error(`${name}${details ? `: ${details}` : ''}`);
}

let tabsById = {};
let windowsById = {};
let contentFactsById = {};
let tabGetCalls = 0;
let mediaFactCalls = 0;

global.chrome = {
  tabs: {
    get: async (tabId) => {
      tabGetCalls++;
      if (!tabsById[tabId]) throw new Error('No tab');
      return tabsById[tabId];
    },
  },
  windows: {
    get: async (windowId) => windowsById[windowId] || { focused: false, state: null },
  },
};

const api = loadProdModule('core/media-timing.js', ['queryForegroundMediaForOpenSession'], {
  applyMediaFacts: async () => ({}),
  classifyMediaFact,
  closeMediaForTab: async () => ({}),
  getFreshContentMediaFact: async (tabId) => {
    mediaFactCalls++;
    return contentFactsById[tabId] || null;
  },
  getMediaFact: async () => null,
  getMediaSessions: async () => ({}),
  runMediaPeriodicCheckpoint: async () => ({}),
  splitOpenMediaSessionsAtModeBoundary: async () => ({}),
  extractDomain,
});

function reset() {
  tabsById = {};
  windowsById = {};
  contentFactsById = {};
  tabGetCalls = 0;
  mediaFactCalls = 0;
}

async function testAudibleCannotCompensateUnfocusedWindow() {
  reset();
  tabsById[1] = { id: 1, windowId: 10, active: true, audible: true, url: 'https://video.example.com/watch' };
  windowsById[10] = { focused: false, state: 'normal' };

  const result = await api.queryForegroundMediaForOpenSession({
    state: 'ACTIVE',
    tabId: 1,
    windowId: 10,
    domain: 'video.example.com',
  }, 'test_audible');

  check('unfocused audible cannot compensate webpage timing', result.ok === false && result.reason === 'no_fresh_content_media', JSON.stringify(result));
  check('unfocused weak audible still checks for strong content once', tabGetCalls === 1 && mediaFactCalls === 1, `${tabGetCalls}/${mediaFactCalls}`);
}

async function testFreshUnfocusedContentVideoWinsAudibleFallback() {
  reset();
  tabsById[1] = { id: 1, windowId: 10, active: true, audible: true, url: 'https://video.example.com/watch' };
  windowsById[10] = { focused: false, state: 'normal' };
  contentFactsById[1] = {
    tabId: 1,
    frameId: 0,
    windowId: 10,
    domain: 'video.example.com',
    playing: true,
    mediaKind: 'video',
    audible: false,
    visibleMediaCount: 1,
    documentVisible: true,
    isActiveTab: true,
    isWindowFocused: false,
    windowState: 'normal',
    evidenceTier: 'content',
    lastObservedAt: Date.now(),
  };

  const result = await api.queryForegroundMediaForOpenSession({
    state: 'ACTIVE',
    tabId: 1,
    windowId: 10,
    domain: 'video.example.com',
  }, 'test_fallback');

  check('fresh unfocused content fact is the only compensation source', result.ok === true && result.source === 'content_media_fact', JSON.stringify(result));
  check('unfocused content video wins over tab audible fallback', result.classification.mediaClass === 'foregroundVideo', JSON.stringify(result));
  check('content lookup runs once', tabGetCalls === 1 && mediaFactCalls === 1, `${tabGetCalls}/${mediaFactCalls}`);
}

async function testFreshUnfocusedContentAudioCanCompensate() {
  reset();
  tabsById[1] = { id: 1, windowId: 10, active: true, audible: true, url: 'https://audio.example.com/listen' };
  windowsById[10] = { focused: false, state: 'normal' };
  contentFactsById[1] = {
    tabId: 1,
    frameId: 0,
    windowId: 10,
    domain: 'audio.example.com',
    playing: true,
    mediaKind: 'audio',
    audible: true,
    muted: false,
    documentVisible: true,
    isActiveTab: true,
    isWindowFocused: false,
    windowState: 'normal',
    evidenceTier: 'content',
    lastObservedAt: Date.now(),
  };

  const result = await api.queryForegroundMediaForOpenSession({
    state: 'ACTIVE', tabId: 1, windowId: 10, domain: 'audio.example.com',
  }, 'test_content_audio');

  check('fresh unfocused content audio can compensate webpage timing', result.ok === true && result.classification.mediaClass === 'foregroundAudio', JSON.stringify(result));
}

async function testSilentOrHiddenContentCannotCompensate() {
  reset();
  tabsById[1] = { id: 1, windowId: 10, active: true, audible: false, url: 'https://audio.example.com/listen' };
  windowsById[10] = { focused: false, state: 'normal' };
  contentFactsById[1] = {
    tabId: 1,
    frameId: 0,
    windowId: 10,
    domain: 'audio.example.com',
    playing: true,
    mediaKind: 'audio',
    audible: false,
    muted: true,
    documentVisible: true,
    isActiveTab: true,
    isWindowFocused: false,
    windowState: 'normal',
    evidenceTier: 'content',
    lastObservedAt: Date.now(),
  };

  const silent = await api.queryForegroundMediaForOpenSession({
    state: 'ACTIVE', tabId: 1, windowId: 10, domain: 'audio.example.com',
  }, 'test_silent_audio');
  check('silent content audio cannot compensate webpage timing', silent.ok === false && silent.reason === 'no_foreground_media', JSON.stringify(silent));

  contentFactsById[1] = {
    ...contentFactsById[1],
    mediaKind: 'video',
    audible: true,
    muted: false,
    visibleMediaCount: 1,
    documentVisible: false,
  };
  const hidden = await api.queryForegroundMediaForOpenSession({
    state: 'ACTIVE', tabId: 1, windowId: 10, domain: 'audio.example.com',
  }, 'test_hidden_video');
  check('hidden content video cannot compensate webpage timing', hidden.ok === false && hidden.reason === 'no_foreground_media', JSON.stringify(hidden));
}

async function testMinimizedStrongContentCannotCompensate() {
  reset();
  tabsById[1] = { id: 1, windowId: 10, active: true, audible: true, url: 'https://video.example.com/watch' };
  windowsById[10] = { focused: false, state: 'minimized' };
  contentFactsById[1] = {
    tabId: 1,
    frameId: 0,
    windowId: 10,
    domain: 'video.example.com',
    playing: true,
    mediaKind: 'video',
    visibleMediaCount: 1,
    documentVisible: true,
    isActiveTab: true,
    isWindowFocused: false,
    windowState: 'minimized',
    evidenceTier: 'content',
    lastObservedAt: Date.now(),
  };

  const result = await api.queryForegroundMediaForOpenSession({
    state: 'ACTIVE', tabId: 1, windowId: 10, domain: 'video.example.com',
  }, 'test_minimized');
  check('minimized window rejects strong content before lookup', result.ok === false && result.reason === 'window_minimized', JSON.stringify(result));
  check('minimized window does not read content fact', mediaFactCalls === 0, String(mediaFactCalls));
}

async function testAudibleWithoutContentCannotCompensate() {
  reset();
  tabsById[1] = { id: 1, windowId: 10, active: true, audible: true, url: 'https://video.example.com/watch' };
  windowsById[10] = { focused: true, state: 'normal' };

  const result = await api.queryForegroundMediaForOpenSession({
    state: 'ACTIVE', tabId: 1, windowId: 10, domain: 'video.example.com',
  }, 'test_weak_only');

  check('audible-only evidence cannot compensate webpage timing', result.ok === false && result.reason === 'no_fresh_content_media', JSON.stringify(result));
  check('audible-only path still checks content evidence once', mediaFactCalls === 1, String(mediaFactCalls));
}

async function testAudibleHardFailuresDoNotFallback() {
  reset();
  tabsById[1] = { id: 1, windowId: 10, active: false, audible: true, url: 'https://video.example.com/watch' };
  windowsById[10] = { focused: true, state: 'normal' };
  contentFactsById[1] = {
    tabId: 1,
    windowId: 10,
    domain: 'video.example.com',
    playing: true,
    mediaKind: 'video',
    isActiveTab: true,
    windowState: 'normal',
  };

  const inactive = await api.queryForegroundMediaForOpenSession({
    state: 'ACTIVE',
    tabId: 1,
    windowId: 10,
    domain: 'video.example.com',
  }, 'test_inactive');

  check('audible inactive tab does not compensate', inactive.ok === false && inactive.reason === 'not_active_tab', JSON.stringify(inactive));
  check('inactive tab does not read content fact', mediaFactCalls === 0, String(mediaFactCalls));

  reset();
  tabsById[1] = { id: 1, windowId: 10, active: true, audible: true, url: 'https://other.example.com/watch' };
  windowsById[10] = { focused: true, state: 'normal' };

  const mismatch = await api.queryForegroundMediaForOpenSession({
    state: 'ACTIVE',
    tabId: 1,
    windowId: 10,
    domain: 'video.example.com',
  }, 'test_mismatch');

  check('audible domain mismatch is reported', mismatch.ok === false && mismatch.reason === 'observed_mismatch', JSON.stringify(mismatch));

  reset();
  tabsById[1] = { id: 1, windowId: 11, active: true, audible: true, url: 'https://video.example.com/watch' };
  windowsById[11] = { focused: true, state: 'normal' };

  const windowMismatch = await api.queryForegroundMediaForOpenSession({
    state: 'ACTIVE',
    tabId: 1,
    windowId: 10,
    domain: 'video.example.com',
  }, 'test_window_mismatch');

  check('audible window mismatch is reported', windowMismatch.ok === false && windowMismatch.reason === 'window_mismatch', JSON.stringify(windowMismatch));
}

async function testInvalidSessionDoesNotQuery() {
  reset();
  const result = await api.queryForegroundMediaForOpenSession({ state: 'IDLE', tabId: 1 }, 'test_invalid');
  check('invalid session returns invalid_open_session', result.ok === false && result.reason === 'invalid_open_session', JSON.stringify(result));
  check('invalid session does not query chrome or media facts', tabGetCalls === 0 && mediaFactCalls === 0, `${tabGetCalls}/${mediaFactCalls}`);
}

async function run() {
  const tests = [
    testAudibleCannotCompensateUnfocusedWindow,
    testFreshUnfocusedContentVideoWinsAudibleFallback,
    testFreshUnfocusedContentAudioCanCompensate,
    testSilentOrHiddenContentCannotCompensate,
    testMinimizedStrongContentCannotCompensate,
    testAudibleWithoutContentCannotCompensate,
    testAudibleHardFailuresDoNotFallback,
    testInvalidSessionDoesNotQuery,
  ];
  let passed = 0;
  for (const test of tests) {
    await test();
    passed++;
  }
  console.log(`[Foreground Media Open Session Helper] ${passed}/${tests.length} passed`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

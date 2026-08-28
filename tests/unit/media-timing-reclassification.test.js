// media-timing-reclassification.test.js
// Run with: node tests/unit/media-timing-reclassification.test.js

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function check(desc, condition, details = '') {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  x ${desc}${details ? `: ${details}` : ''}`);
  }
}

function loadMediaTiming(stubs = {}) {
  const abs = path.join(__dirname, '..', '..', 'extension', 'core', 'media-timing.js');
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import[\s\S]*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  const names = [
    'handleMediaTabActivated',
    'handleMediaTabReplaced',
    'handleMediaWindowFocusChanged',
    'handleMediaWindowStateChanged',
    'refreshKnownMediaTab',
    'queryTabMediaFact',
  ];
  const injectedKeys = Object.keys(stubs);
  const prelude = injectedKeys.length ? `const { ${injectedKeys.join(', ')} } = __injected;\n` : '';
  const factory = new Function('__injected', `${prelude}${code}\nreturn { ${names.join(', ')} };`);
  return factory(stubs);
}

function makeHarness({ knownTabs = [], sessions = {}, tabs = {}, windows = {}, facts = {} } = {}) {
  const known = new Set(knownTabs.map(Number));
  const applyCalls = [];
  const closeCalls = [];
  const api = loadMediaTiming({
    applyMediaFacts: async (fact, reason) => {
      applyCalls.push({ fact, reason });
      return { ok: true };
    },
    classifyMediaFact: (fact) => {
      if (fact?.isPiP) return { mediaClass: 'pip' };
      const strongContent = fact?.evidenceTier === 'content';
      const foreground = fact?.isActiveTab && fact?.windowState !== 'minimized' && (strongContent
        ? fact?.documentVisible === true && (
            (fact?.mediaKind === 'video' && fact?.playing === true && Number(fact?.visibleMediaCount) > 0) ||
            (fact?.mediaKind === 'audio' && fact?.playing === true && fact?.audible === true && fact?.muted !== true)
          )
        : fact?.isWindowFocused === true);
      if (fact?.mediaKind === 'video') return { mediaClass: foreground ? 'foregroundVideo' : 'backgroundVideo' };
      if (fact?.playing || fact?.audible) return { mediaClass: foreground ? 'foregroundAudio' : 'backgroundAudio' };
      return null;
    },
    closeMediaForTab: async (tabId, reason) => {
      closeCalls.push({ tabId, reason });
      return { ok: true, closed: true };
    },
    getMediaFact: async (tabId) => known.has(Number(tabId))
      ? (facts[tabId] || { tabId: Number(tabId), domain: `tab${tabId}.example`, playing: true, audible: true, mediaKind: 'audio', windowId: tabs[tabId]?.windowId ?? 1 })
      : null,
    getMediaSessions: async () => sessions,
    runMediaPeriodicCheckpoint: async () => ({ ok: true }),
    extractDomain: (url) => {
      try { return new URL(url).hostname; } catch { return null; }
    },
    chrome: {
      tabs: {
        get: async (tabId) => tabs[tabId] || { id: tabId, windowId: 1, url: `https://tab${tabId}.example`, active: false, audible: false },
        query: async ({ windowId }) => Object.values(tabs).filter((tab) => tab.windowId === windowId && tab.active),
      },
      windows: {
        get: async (windowId) => windows[windowId] || { id: windowId, focused: true, state: 'normal' },
      },
    },
  });
  return { api, applyCalls, closeCalls };
}

async function run() {
  {
    const { api, applyCalls } = makeHarness({
      knownTabs: [],
      tabs: { 2: { id: 2, windowId: 1, url: 'https://new.example', active: true, audible: true } },
    });
    await api.handleMediaTabActivated(null, 2);
    check('tabActivated does not create media session for unknown tab', applyCalls.length === 0);
  }

  {
    const { api, applyCalls } = makeHarness({
      knownTabs: [1, 2],
      tabs: {
        1: { id: 1, windowId: 1, url: 'https://old.example', active: false, audible: true },
        2: { id: 2, windowId: 1, url: 'https://new.example', active: true, audible: true },
      },
    });
    await api.handleMediaTabActivated(1, 2);
    check('tabActivated refreshes known old and new media tabs', applyCalls.length === 2, JSON.stringify(applyCalls));
    check('new active tab is classified with active fact', applyCalls.some((call) => call.fact.tabId === 2 && call.fact.isActiveTab === true));
  }

  {
    const { api } = makeHarness({
      knownTabs: [11],
      tabs: {
        11: { id: 11, windowId: 6, url: 'https://video.example', active: true, audible: false },
      },
      windows: {
        6: { id: 6, focused: false, state: 'normal' },
      },
      facts: {
        11: {
          tabId: 11,
          windowId: 6,
          domain: 'video.example',
          playing: true,
          mediaKind: 'video',
          visibleMediaCount: 1,
          documentVisible: true,
          evidenceTier: 'content',
          lastObservedAt: Date.now(),
        },
      },
    });
    const fact = await api.queryTabMediaFact(11, {
      isActiveTab: false,
      isWindowFocused: true,
      windowState: 'minimized',
      contextOnly: true,
    });
    check('live tab active state overrides stale event snapshot', fact.isActiveTab === true, JSON.stringify(fact));
    check('live window focus and state override stale event snapshot', fact.isWindowFocused === false && fact.windowState === 'normal', JSON.stringify(fact));
  }

  {
    const { api, applyCalls } = makeHarness({
      knownTabs: [12],
      tabs: {
        12: { id: 12, windowId: 6, url: 'https://www.bilibili.com/video/BV-test', active: true, audible: false },
      },
      facts: {
        12: {
          tabId: 12,
          windowId: 6,
          domain: 'www.bilibili.com',
          playing: true,
          audible: false,
          mediaKind: 'video',
          visibleMediaCount: 1,
          documentVisible: true,
          evidenceTier: 'content',
          source: 'dom_media_event',
        },
      },
    });
    await api.handleMediaTabActivated(null, 12);
    check('tab activation preserves stored strong video kind', applyCalls[0]?.fact.mediaKind === 'video', JSON.stringify(applyCalls));
    check('tab activation preserves visible video evidence', applyCalls[0]?.fact.visibleMediaCount === 1 && applyCalls[0]?.fact.evidenceTier === 'content', JSON.stringify(applyCalls));
  }

  {
    const { api, applyCalls, closeCalls } = makeHarness({
      knownTabs: [5],
      tabs: {
        6: { id: 6, windowId: 2, url: 'https://replacement.example', active: true, audible: true },
      },
    });
    await api.handleMediaTabReplaced(6, 5);
    check('tabReplaced closes removed known media tab', closeCalls.length === 1 && closeCalls[0].reason === 'tab_replaced');
    check('tabReplaced applies added tab current fact', applyCalls.length === 1 && applyCalls[0].fact.tabId === 6);
  }

  {
    const { api, applyCalls, closeCalls } = makeHarness({
      knownTabs: [],
      tabs: {
        8: { id: 8, windowId: 3, url: 'https://replacement.example', active: true, audible: true },
      },
    });
    await api.handleMediaTabReplaced(8, 7);
    check('tabReplaced no-ops when removed tab has no known media', applyCalls.length === 0 && closeCalls.length === 0);
  }

  {
    const { api, applyCalls } = makeHarness({
      knownTabs: [9],
      tabs: {
        9: { id: 9, windowId: 4, url: 'https://window.example', active: true, audible: true },
      },
      windows: {
        4: { id: 4, focused: true, state: 'minimized' },
      },
    });
    await api.handleMediaWindowStateChanged(4, 'minimized');
    check('window minimized reclassifies known active media tab', applyCalls.length === 1);
    check('window minimized passes minimized state', applyCalls[0].fact.windowState === 'minimized');
  }

  {
    const { api, applyCalls } = makeHarness({
      knownTabs: [9, 10],
      sessions: {
        '9::foregroundAudio': { tabId: 9, startTime: 1, mediaClass: 'foregroundAudio' },
        '10::backgroundAudio': { tabId: 10, startTime: 1, mediaClass: 'backgroundAudio' },
      },
      tabs: {
        9: { id: 9, windowId: 4, url: 'https://old-window.example', active: true, audible: true },
        10: { id: 10, windowId: 5, url: 'https://new-window.example', active: true, audible: true },
      },
      windows: {
        4: { id: 4, focused: false, state: 'normal' },
        5: { id: 5, focused: true, state: 'normal' },
      },
      facts: {
        9: {
          tabId: 9,
          windowId: 4,
          domain: 'old-window.example',
          playing: true,
          audible: false,
          mediaKind: 'video',
          visibleMediaCount: 1,
          documentVisible: true,
          evidenceTier: 'content',
          source: 'dom_media_poll',
          lastObservedAt: Date.now(),
        },
      },
    });
    const result = await api.handleMediaWindowFocusChanged(5);
    check('focus change reclassifies every open media tab', applyCalls.length === 2, JSON.stringify(applyCalls));
    check('previous window media receives unfocused fact', applyCalls.some((call) => call.fact.tabId === 9 && call.fact.isWindowFocused === false), JSON.stringify(applyCalls));
    check('unfocused non-minimized strong content video remains foregroundVideo', result.results.some((entry) => entry.tabId === 9 && entry.classification?.mediaClass === 'foregroundVideo'), JSON.stringify(result));
    check('new focused window media receives focused fact', applyCalls.some((call) => call.fact.tabId === 10 && call.fact.isWindowFocused === true), JSON.stringify(applyCalls));
  }

  const total = passed + failed;
  console.log(`\n[Media Timing Reclassification] ${passed}/${total} passed${failed ? ' FAILED' : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

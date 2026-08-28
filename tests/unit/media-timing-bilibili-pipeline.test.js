// Bilibili multi-frame media evidence pipeline tests
// Run with: node tests/unit/media-timing-bilibili-pipeline.test.js

'use strict';

const fs = require('fs');
const path = require('path');

function loadMediaTiming(exportNames, injected = {}) {
  const abs = path.join(__dirname, '..', '..', 'extension', 'core', 'media-timing.js');
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import[\s\S]*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  const keys = Object.keys(injected);
  const prelude = keys.length ? `const { ${keys.join(', ')} } = __injected;\n` : '';
  return new Function('__injected', `${prelude}${code}\nreturn { ${exportNames.join(', ')} };`)(injected);
}

function check(name, condition, details = '') {
  if (!condition) throw new Error(`${name}${details ? `: ${details}` : ''}`);
}

function extractDomain(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch (_) { return null; }
}

const calls = [];
const appliedFacts = [];
let frameResponses = {};
let storedFact = null;

global.chrome = {
  tabs: {
    get: async () => ({
      id: 17,
      windowId: 3,
      url: 'https://www.bilibili.com/video/BV-test',
      active: true,
      audible: true,
      mutedInfo: { muted: false },
    }),
    query: async (query) => {
      if (query.active) {
        return [{
          id: 17,
          windowId: 3,
          url: 'https://www.bilibili.com/video/BV-test',
          active: true,
          audible: true,
        }];
      }
      if (query.audible) return [];
      return [];
    },
    sendMessage: async (tabId, message, options) => {
      calls.push({ tabId, message, options });
      if (!options || !Number.isInteger(options.frameId)) {
        return { ok: true, playing: false, mediaKind: null, audible: false, visibleMediaCount: 0 };
      }
      const response = frameResponses[options.frameId];
      if (response instanceof Error) throw response;
      return response;
    },
  },
  windows: {
    get: async () => ({ id: 3, focused: true, state: 'normal' }),
  },
  webNavigation: {
    getAllFrames: async () => [{ frameId: 0 }, { frameId: 2 }, { frameId: 9 }],
  },
};

const api = loadMediaTiming([
  'queryTabMediaFact',
  'requestContentMediaSnapshot',
  'discoverCheckpointMediaFacts',
], {
  applyMediaFacts: async (fact) => {
    appliedFacts.push(fact);
    return { opened: true };
  },
  classifyMediaFact: () => null,
  closeForbiddenPiPSessionsForTab: async () => ({}),
  closeMediaForTab: async () => ({}),
  getFreshContentMediaFact: async () => null,
  getMediaFact: async () => storedFact,
  getMediaSessions: async () => ({}),
  runMediaPeriodicCheckpoint: async () => ({}),
  splitOpenMediaSessionsAtModeBoundary: async () => ({}),
  extractDomain,
  emitTrace: async () => {},
  logFallbackEventBestEffort: () => {},
  closeForbiddenPictureInPicture: async () => ({}),
  isPictureInPictureDisallowed: () => false,
});

function reset() {
  calls.length = 0;
  appliedFacts.length = 0;
  storedFact = null;
  frameResponses = {
    0: {
      ok: true,
      playing: true,
      mediaKind: 'video',
      isPiP: false,
      audible: false,
      visibleMediaCount: 1,
    },
    2: { ok: true, playing: false, mediaKind: null, isPiP: false, audible: false, visibleMediaCount: 0 },
    9: { ok: true, playing: false, mediaKind: null, isPiP: false, audible: false, visibleMediaCount: 0 },
  };
}

async function testVisibleCountSurvivesFactConversion() {
  reset();
  const fact = await api.queryTabMediaFact(17, {
    mediaFrameId: 0,
    evidenceTier: 'content',
    playing: true,
    mediaKind: 'video',
    audible: false,
    visibleMediaCount: 1,
  });
  check('visible media count survives queryTabMediaFact', fact.visibleMediaCount === 1, JSON.stringify(fact));
  check('muted content video remains strong content evidence', fact.evidenceTier === 'content' && fact.playing === true && fact.mediaKind === 'video');
}

async function testCheckpointAggregatesAllFramesDeterministically() {
  reset();
  const result = await api.requestContentMediaSnapshot(17, 'unit_bilibili');
  check('multi-frame snapshot succeeds', result.ok === true, JSON.stringify(result));
  check('video wins over no-media child frames', result.snapshot.mediaKind === 'video' && result.snapshot.playing === true, JSON.stringify(result.snapshot));
  check('visible media count is retained', result.snapshot.visibleMediaCount === 1, JSON.stringify(result.snapshot));
  check('every request names a frame id', calls.length === 3 && calls.every((call) => Number.isInteger(call.options?.frameId)), JSON.stringify(calls));
  check('all discovered frame ids are queried', calls.map((call) => call.options.frameId).join(',') === '0,2,9', JSON.stringify(calls));
}

async function testDiscoveryAppliesAggregatedSnapshotAsContentEvidence() {
  reset();
  const result = await api.discoverCheckpointMediaFacts(1778800000000);
  check('checkpoint discovers one active media fact', result.factsApplied === 1, JSON.stringify(result));
  check('checkpoint applies video instead of audible fallback', appliedFacts[0]?.mediaKind === 'video', JSON.stringify(appliedFacts[0]));
  check('checkpoint fact is strong content evidence', appliedFacts[0]?.evidenceTier === 'content', JSON.stringify(appliedFacts[0]));
  check('checkpoint fact carries visible video evidence', appliedFacts[0]?.visibleMediaCount === 1, JSON.stringify(appliedFacts[0]));
}

async function run() {
  const tests = [
    testVisibleCountSurvivesFactConversion,
    testCheckpointAggregatesAllFramesDeterministically,
    testDiscoveryAppliesAggregatedSnapshotAsContentEvidence,
  ];
  for (const test of tests) await test();
  console.log(`[Media Timing Bilibili Pipeline] ${tests.length}/${tests.length} passed`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

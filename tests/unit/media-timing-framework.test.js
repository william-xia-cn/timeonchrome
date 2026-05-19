// Media multi-session local ledger tests
// Run with: node tests/unit/media-timing-framework.test.js

'use strict';

const fs = require('fs');
const path = require('path');

class MockStorage {
  constructor() { this.data = {}; }
  reset() { this.data = {}; }
  async get(keys) {
    if (keys == null) return { ...this.data };
    if (Array.isArray(keys)) {
      const out = {};
      keys.forEach((key) => { out[key] = this.data[key]; });
      return out;
    }
    if (typeof keys === 'string') return { [keys]: this.data[keys] };
    const out = {};
    Object.keys(keys || {}).forEach((key) => { out[key] = this.data[key] ?? keys[key]; });
    return out;
  }
  async set(obj) { Object.assign(this.data, obj); }
  async remove(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) delete this.data[key];
  }
}

const localStorage = new MockStorage();
global.chrome = { storage: { local: localStorage } };

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

const mediaApi = loadProdModule('runtime/media-session.js', [
  'applyMediaFacts',
  'classifyMediaFact',
  'closeMediaForTab',
  'closeMediaSession',
  'getDailyMediaStats',
  'getMediaSession',
  'getMediaSessions',
  'getMediaSegments',
  'runMediaPeriodicCheckpoint',
  '__resetMediaSessionForTest',
], {
  getCachedEffectiveMode: () => 'study',
});

function check(name, condition, details = '') {
  if (!condition) throw new Error(`${name}${details ? `: ${details}` : ''}`);
}

function resetAll() {
  localStorage.reset();
  mediaApi.__resetMediaSessionForTest();
}

async function segments() {
  return Object.values(await mediaApi.getMediaSegments());
}

function videoFact(tabId, domain, overrides = {}) {
  return {
    tabId,
    windowId: overrides.windowId ?? 10,
    domain,
    playing: true,
    audible: overrides.audible ?? true,
    mediaKind: 'video',
    isPiP: false,
    isActiveTab: overrides.isActiveTab ?? true,
    windowState: overrides.windowState || 'normal',
    source: overrides.source || 'dom_media_event',
  };
}

function audioFact(tabId, domain, overrides = {}) {
  return {
    tabId,
    windowId: overrides.windowId ?? 10,
    domain,
    playing: true,
    audible: overrides.audible ?? true,
    mediaKind: 'audio',
    isPiP: false,
    isActiveTab: overrides.isActiveTab ?? false,
    windowState: overrides.windowState || 'normal',
    source: overrides.source || 'tabs_api_audible',
  };
}

async function testClassifierRules() {
  resetAll();
  check('active normal video is foregroundVideo',
    mediaApi.classifyMediaFact(videoFact(1, 'video.example.com')).mediaClass === 'foregroundVideo');
  check('minimized active video is backgroundVideo',
    mediaApi.classifyMediaFact(videoFact(1, 'video.example.com', { windowState: 'minimized' })).mediaClass === 'backgroundVideo');
  check('inactive audio is backgroundAudio',
    mediaApi.classifyMediaFact(audioFact(2, 'audio.example.com')).mediaClass === 'backgroundAudio');
  check('active audio is foregroundAudio',
    mediaApi.classifyMediaFact(audioFact(2, 'audio.example.com', { isActiveTab: true })).mediaClass === 'foregroundAudio');
  check('pip wins over video/audio',
    mediaApi.classifyMediaFact({ ...videoFact(3, 'pip.example.com'), isPiP: true }).mediaClass === 'pip');
}

async function testTwoTabsCountConcurrently() {
  resetAll();
  const base = 1778800000000;
  await mediaApi.applyMediaFacts([
    audioFact(1, 'audio.example.com'),
    videoFact(2, 'video.example.com'),
  ], 'mediaState', base);

  const sessions = await mediaApi.getMediaSessions();
  check('two media sessions are open', Object.keys(sessions).length === 2, JSON.stringify(sessions));

  const checkpoint = await mediaApi.runMediaPeriodicCheckpoint(base + 180_000);
  check('checkpoint reports media windows', checkpoint.checkpointWindows === 2, JSON.stringify(checkpoint));

  const rows = await segments();
  check('two media segments are written', rows.length === 2, JSON.stringify(rows));
  check('concurrent duration totals 360s', rows.reduce((sum, row) => sum + row.durationSeconds, 0) === 360);
  check('foreground video class recorded', rows.some((row) => row.mediaClass === 'foregroundVideo'));
  check('background audio class recorded', rows.some((row) => row.mediaClass === 'backgroundAudio'));

  const daily = await mediaApi.getDailyMediaStats(rows[0].date);
  check('daily media stats exists', !!daily);
  check('daily media stats tracks domains', Object.keys(daily.domains).length === 2);
}

async function testVideoTakesPrecedenceWithinTab() {
  resetAll();
  const base = 1778801000000;
  await mediaApi.applyMediaFacts({
    ...videoFact(3, 'mixed.example.com'),
    audible: true,
    playing: true,
  }, 'mediaState', base);
  const sessions = await mediaApi.getMediaSessions();
  const open = Object.values(sessions);
  check('one same-tab media session is open', open.length === 1, JSON.stringify(sessions));
  check('same-tab video+audio is video', open[0].mediaClass === 'foregroundVideo', JSON.stringify(open[0]));
}

async function testPiPTakesPrecedence() {
  resetAll();
  const base = 1778802000000;
  await mediaApi.applyMediaFacts({ ...videoFact(4, 'pip.example.com'), isPiP: true }, 'pip_api', base);
  const legacy = await mediaApi.getMediaSession();
  check('legacy mirror exposes pip_video', legacy.framework === 'pip_video', JSON.stringify(legacy));
  const checkpoint = await mediaApi.runMediaPeriodicCheckpoint(base + 180_000);
  check('pip checkpoint writes segment', checkpoint.flushedSegments === 1, JSON.stringify(checkpoint));
  const [row] = await segments();
  check('pip segment class', row.mediaClass === 'pip', JSON.stringify(row));
  check('pip segment visibility', row.visibility === 'pip', JSON.stringify(row));
}

async function testCloseWritesLocalMediaSegment() {
  resetAll();
  const base = 1778803000000;
  await mediaApi.applyMediaFacts(videoFact(5, 'close.example.com', { isActiveTab: false }), 'mediaState', base);
  const close = await mediaApi.closeMediaForTab(5, 'tab_close', { now: base + 12_000 });
  check('tab close closes one media session', close.closedSessions === 1, JSON.stringify(close));
  const [row] = await segments();
  check('tab close writes local media segment', row.mediaClass === 'backgroundVideo', JSON.stringify(row));
  check('tab close duration is 12s', row.durationSeconds === 12, JSON.stringify(row));
  check('description records close reason', row.description.end.reason === 'tab_close', JSON.stringify(row.description));
}

async function testCloseAllSessions() {
  resetAll();
  const base = 1778804000000;
  await mediaApi.applyMediaFacts([
    audioFact(6, 'a.example.com'),
    audioFact(7, 'b.example.com'),
  ], 'mediaState', base);
  const close = await mediaApi.closeMediaSession('monitoring_off', { now: base + 5_000 });
  check('close all reports two sessions', close.closedSessions === 2, JSON.stringify(close));
  check('close all writes two segments', (await segments()).length === 2);
}

async function testCheckpointIgnoresFactsWithoutOpenSessions() {
  resetAll();
  const base = 1778805000000;
  localStorage.data.media_facts_v1 = {
    8: audioFact(8, 'stale-fact.example.com'),
  };
  const checkpoint = await mediaApi.runMediaPeriodicCheckpoint(base + 180_000);
  check('facts without open media sessions are not checkpointed', checkpoint.checkpointWindows === 0, JSON.stringify(checkpoint));
  check('facts without open media sessions do not write segments', (await segments()).length === 0);
}

async function run() {
  const tests = [
    testClassifierRules,
    testTwoTabsCountConcurrently,
    testVideoTakesPrecedenceWithinTab,
    testPiPTakesPrecedence,
    testCloseWritesLocalMediaSegment,
    testCloseAllSessions,
    testCheckpointIgnoresFactsWithoutOpenSessions,
  ];
  let passed = 0;
  for (const test of tests) {
    await test();
    passed++;
  }
  console.log(`[Media Timing] ${passed}/${tests.length} passed`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

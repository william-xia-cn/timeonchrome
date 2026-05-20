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
  'getMediaFrameFacts',
  'getMediaSessions',
  'getMediaSegments',
  'runMediaPeriodicCheckpoint',
  'splitOpenMediaSessionsAtModeBoundary',
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

function stoppedFact(tabId, domain, overrides = {}) {
  return {
    tabId,
    frameId: overrides.frameId,
    windowId: overrides.windowId ?? 10,
    domain,
    playing: false,
    audible: false,
    mediaKind: null,
    isPiP: false,
    isActiveTab: overrides.isActiveTab ?? true,
    windowState: overrides.windowState || 'normal',
    source: overrides.source || 'dom_media_event',
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
  const facts = [
    audioFact(1, 'audio.example.com'),
    videoFact(2, 'video.example.com'),
  ];
  await mediaApi.applyMediaFacts(facts, 'mediaState', base);

  const sessions = await mediaApi.getMediaSessions();
  check('two media sessions are open', Object.keys(sessions).length === 2, JSON.stringify(sessions));

  await mediaApi.applyMediaFacts(facts, 'mediaState', base + 180_000);
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

async function testRepeatedSameMediaFactDoesNotWriteSegment() {
  resetAll();
  const base = 1778801500000;
  await mediaApi.applyMediaFacts({ ...videoFact(13, 'repeat.example.com'), frameId: 1 }, 'mediaState', base);
  await mediaApi.applyMediaFacts({
    ...videoFact(13, 'repeat.example.com', { source: 'dom_media_poll' }),
    frameId: 1,
  }, 'mediaState', base + 30_000);

  const rows = await segments();
  const sessions = Object.values(await mediaApi.getMediaSessions());
  check('repeated unchanged MEDIA_STATE writes no segment', rows.length === 0, JSON.stringify(rows));
  check('repeated unchanged MEDIA_STATE keeps one open session', sessions.length === 1 && sessions[0].startTime === base, JSON.stringify(sessions));
}

async function testPiPTakesPrecedence() {
  resetAll();
  const base = 1778802000000;
  const fact = { ...videoFact(4, 'pip.example.com'), isPiP: true };
  await mediaApi.applyMediaFacts(fact, 'pip_api', base);
  const legacy = await mediaApi.getMediaSession();
  check('legacy mirror exposes pip_video', legacy.framework === 'pip_video', JSON.stringify(legacy));
  await mediaApi.applyMediaFacts(fact, 'pip_api', base + 180_000);
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

async function testCheckpointEstimatedCloseWithoutFreshConfirmation() {
  resetAll();
  const base = 1778805100000;
  await mediaApi.applyMediaFacts(videoFact(18, 'stale-open.example.com'), 'mediaState', base);

  const checkpoint = await mediaApi.runMediaPeriodicCheckpoint(base + 180_000);
  check('stale open media session is estimated closed', checkpoint.estimatedCloseWindows === 1, JSON.stringify(checkpoint));
  check('stale open media session is not normal checkpointed', checkpoint.checkpointWindows === 0, JSON.stringify(checkpoint));

  const rows = await segments();
  check('estimated close writes one media segment', rows.length === 1, JSON.stringify(rows));
  check('estimated close uses dedicated reason', rows[0].settlementReason === 'media_checkpoint_estimated_close', JSON.stringify(rows[0]));
  check('estimated close description records half interval', rows[0].description.end.reason === 'media_checkpoint_estimated_half_interval_close', JSON.stringify(rows[0].description));
  check('estimated close uses half unconfirmed window', rows[0].durationSeconds === 90, JSON.stringify(rows[0]));
  check('estimated close removes open session', Object.keys(await mediaApi.getMediaSessions()).length === 0);
}

async function testCheckpointDoesNotRefreshLastObservedAt() {
  resetAll();
  const base = 1778805200000;
  await mediaApi.applyMediaFacts(videoFact(19, 'observed.example.com'), 'mediaState', base);
  await mediaApi.applyMediaFacts(videoFact(19, 'observed.example.com'), 'mediaState', base + 190_000);

  const checkpoint = await mediaApi.runMediaPeriodicCheckpoint(base + 200_000);
  check('freshly confirmed session is normally checkpointed', checkpoint.checkpointWindows === 1, JSON.stringify(checkpoint));

  const open = Object.values(await mediaApi.getMediaSessions())[0];
  check('checkpoint reopens at checkpoint boundary', open.startTime === base + 180_000, JSON.stringify(open));
  check('checkpoint keeps last observed media fact time', open.lastObservedAt === base + 190_000, JSON.stringify(open));
  check('checkpoint records separate checkpoint time', open.lastCheckpointAt === base + 180_000, JSON.stringify(open));
}

async function testStoppedFrameDoesNotClosePlayingFrameInSameTab() {
  resetAll();
  const base = 1778805500000;
  await mediaApi.applyMediaFacts({ ...videoFact(20, 'frames.example.com'), frameId: 1 }, 'mediaState', base);
  await mediaApi.applyMediaFacts(stoppedFact(20, 'frames.example.com', { frameId: 2 }), 'mediaState', base + 1000);

  const sessions = Object.values(await mediaApi.getMediaSessions());
  check('stopped sibling frame does not close tab media session', sessions.length === 1 && sessions[0].mediaClass === 'foregroundVideo', JSON.stringify(sessions));
  check('stopped sibling frame writes no segment', (await segments()).length === 0);

  await mediaApi.applyMediaFacts(stoppedFact(20, 'frames.example.com', { frameId: 1 }), 'mediaState', base + 10_000);
  const rows = await segments();
  check('all frames stopped closes media session', rows.length === 1, JSON.stringify(rows));
  check('all frames stopped duration uses original open time', rows[0].durationSeconds === 10, JSON.stringify(rows[0]));
}

async function testFrameAggregationVideoPrecedenceAndFallback() {
  resetAll();
  const base = 1778805600000;
  await mediaApi.applyMediaFacts([
    { ...audioFact(21, 'mixed-frames.example.com'), frameId: 1, isActiveTab: true },
    { ...videoFact(21, 'mixed-frames.example.com'), frameId: 2 },
  ], 'mediaState', base);
  let sessions = Object.values(await mediaApi.getMediaSessions());
  check('same-tab audio+video aggregates to one video session', sessions.length === 1 && sessions[0].mediaClass === 'foregroundVideo', JSON.stringify(sessions));

  await mediaApi.applyMediaFacts(stoppedFact(21, 'mixed-frames.example.com', { frameId: 2 }), 'mediaState', base + 5000);
  sessions = Object.values(await mediaApi.getMediaSessions());
  const rows = await segments();
  check('video stop falls back to remaining audio session', sessions.length === 1 && sessions[0].mediaClass === 'foregroundAudio', JSON.stringify(sessions));
  check('video-to-audio reclassification writes one video segment', rows.length === 1 && rows[0].mediaClass === 'foregroundVideo', JSON.stringify(rows));
}

async function testPiPFramePriorityAndFallback() {
  resetAll();
  const base = 1778805700000;
  await mediaApi.applyMediaFacts({ ...videoFact(22, 'pip-frames.example.com'), frameId: 1, isPiP: true }, 'pip_api', base);
  let sessions = Object.values(await mediaApi.getMediaSessions());
  check('pip frame opens pip session', sessions.length === 1 && sessions[0].mediaClass === 'pip', JSON.stringify(sessions));

  await mediaApi.applyMediaFacts({ ...videoFact(22, 'pip-frames.example.com'), frameId: 1, isPiP: false }, 'pip_api', base + 6000);
  sessions = Object.values(await mediaApi.getMediaSessions());
  const rows = await segments();
  check('leaving pip falls back to video session', sessions.length === 1 && sessions[0].mediaClass === 'foregroundVideo', JSON.stringify(sessions));
  check('pip fallback writes pip segment', rows.length === 1 && rows[0].mediaClass === 'pip', JSON.stringify(rows));
}

async function testNavigationClearsFrameFactsForTab() {
  resetAll();
  const base = 1778805800000;
  await mediaApi.applyMediaFacts({ ...videoFact(23, 'nav-old.example.com'), frameId: 1 }, 'mediaState', base);
  await mediaApi.applyMediaFacts({
    ...stoppedFact(23, 'nav-new.example.com', { frameId: 'tab' }),
    clearMediaFrames: true,
  }, 'tabUpdated', base + 7000);
  const frameFacts = await mediaApi.getMediaFrameFacts();
  const sessions = await mediaApi.getMediaSessions();
  const rows = await segments();
  check('navigation clears old frame facts for tab', Object.keys(frameFacts).length === 1 && frameFacts['23::tab'], JSON.stringify(frameFacts));
  check('navigation closes media session', Object.keys(sessions).length === 0, JSON.stringify(sessions));
  check('navigation writes media segment from old playing frame', rows.length === 1 && rows[0].durationSeconds === 7, JSON.stringify(rows));
}

async function testModeBoundarySplitsOpenMediaSessions() {
  resetAll();
  const base = 1778806000000;
  await mediaApi.applyMediaFacts(videoFact(9, 'mode.example.com'), 'mediaState', base);
  const split = await mediaApi.splitOpenMediaSessionsAtModeBoundary({
    boundaryAtMs: base + 30_000,
    fromMode: 'study',
    toMode: 'composite',
    reason: 'manual_mode_switch',
    source: 'runtime_message',
  });
  check('mode boundary splits one media session', split.split === 1, JSON.stringify(split));
  const rows = await segments();
  check('mode boundary writes old-mode media segment', rows.length === 1 && rows[0].mode === 'study', JSON.stringify(rows));
  check('mode boundary segment reason', rows[0].settlementReason === 'mode_effective_boundary', JSON.stringify(rows[0]));
  const sessions = await mediaApi.getMediaSessions();
  const open = Object.values(sessions)[0];
  check('mode boundary reopens media session with new mode', open?.mode === 'composite' && open.startTime === base + 30_000, JSON.stringify(open));
}

async function testModeBoundarySplitsMultipleOpenMediaSessions() {
  resetAll();
  const base = 1778807000000;
  await mediaApi.applyMediaFacts([
    videoFact(10, 'mode-video.example.com'),
    audioFact(11, 'mode-audio.example.com'),
  ], 'mediaState', base);
  const split = await mediaApi.splitOpenMediaSessionsAtModeBoundary({
    boundaryAtMs: base + 45_000,
    fromMode: 'study',
    toMode: 'rest',
    reason: 'manual_mode_switch',
    source: 'runtime_message',
  });
  check('mode boundary splits two media sessions', split.split === 2, JSON.stringify(split));
  const rows = await segments();
  check('mode boundary writes two media segments', rows.length === 2, JSON.stringify(rows));
  check('all mode boundary old segments use fromMode', rows.every((row) => row.mode === 'study'), JSON.stringify(rows));
  const sessions = Object.values(await mediaApi.getMediaSessions());
  check('all reopened media sessions use toMode', sessions.length === 2 && sessions.every((session) => session.mode === 'rest' && session.startTime === base + 45_000), JSON.stringify(sessions));
}

async function testModeBoundaryNoOpenMediaSessionsNoop() {
  resetAll();
  const base = 1778808000000;
  const split = await mediaApi.splitOpenMediaSessionsAtModeBoundary({
    boundaryAtMs: base + 10_000,
    fromMode: 'study',
    toMode: 'composite',
  });
  check('mode boundary without open media sessions is no-op', split.split === 0 && split.updated === 0 && split.appended === 0, JSON.stringify(split));
  check('mode boundary no-op writes no media segments', (await segments()).length === 0);
}

async function testModeBoundaryBeforeStartOnlyUpdatesMode() {
  resetAll();
  const base = 1778809000000;
  await mediaApi.applyMediaFacts(videoFact(12, 'mode-update.example.com'), 'mediaState', base);
  const split = await mediaApi.splitOpenMediaSessionsAtModeBoundary({
    boundaryAtMs: base,
    fromMode: 'study',
    toMode: 'rest',
  });
  check('mode boundary at session start updates without split', split.split === 0 && split.updated === 1 && split.appended === 0, JSON.stringify(split));
  check('mode boundary at start writes no zero-ms media segment', (await segments()).length === 0);
  const open = Object.values(await mediaApi.getMediaSessions())[0];
  check('mode boundary at start updates open media mode', open?.mode === 'rest' && open.startTime === base, JSON.stringify(open));
}

async function testModeBoundaryClosesPiPWhenTargetModeDisallowsPiP() {
  resetAll();
  const base = 1778810000000;
  await mediaApi.applyMediaFacts({ ...videoFact(24, 'pip-close.example.com'), isPiP: true }, 'pip_api', base);

  const split = await mediaApi.splitOpenMediaSessionsAtModeBoundary({
    boundaryAtMs: base + 20_000,
    fromMode: 'rest',
    toMode: 'composite',
  });

  check('rest to composite closes open pip session', split.closedPiP === 1, JSON.stringify(split));
  const rows = await segments();
  check('pip close writes mode boundary segment', rows.length === 1 && rows[0].mediaClass === 'pip', JSON.stringify(rows));
  check('closed pip segment keeps fromMode', rows[0].mode === 'rest', JSON.stringify(rows[0]));
  const sessions = Object.values(await mediaApi.getMediaSessions());
  check('pip is not reopened after disallowing mode boundary', !sessions.some((session) => session.mediaClass === 'pip'), JSON.stringify(sessions));
}

async function testModeBoundaryClosesPiPAndReclassifiesRemainingVideo() {
  resetAll();
  const base = 1778811000000;
  await mediaApi.applyMediaFacts([
    { ...videoFact(25, 'pip-reclassify.example.com'), frameId: 1, isPiP: true },
    { ...videoFact(25, 'pip-reclassify.example.com'), frameId: 2, isPiP: false },
  ], 'pip_api', base);

  const split = await mediaApi.splitOpenMediaSessionsAtModeBoundary({
    boundaryAtMs: base + 20_000,
    fromMode: 'rest',
    toMode: 'composite',
  });

  check('pip close can reclassify remaining non-pip video', split.closedPiP === 1 && split.reclassified === 1, JSON.stringify(split));
  const sessions = Object.values(await mediaApi.getMediaSessions());
  check('remaining video is reopened as foreground video, not pip', sessions.length === 1 && sessions[0].mediaClass === 'foregroundVideo', JSON.stringify(sessions));
  check('reclassified video uses target mode', sessions[0].mode === 'composite', JSON.stringify(sessions[0]));
}

async function run() {
  const tests = [
    testClassifierRules,
    testTwoTabsCountConcurrently,
    testVideoTakesPrecedenceWithinTab,
    testRepeatedSameMediaFactDoesNotWriteSegment,
    testPiPTakesPrecedence,
    testCloseWritesLocalMediaSegment,
    testCloseAllSessions,
    testCheckpointIgnoresFactsWithoutOpenSessions,
    testCheckpointEstimatedCloseWithoutFreshConfirmation,
    testCheckpointDoesNotRefreshLastObservedAt,
    testStoppedFrameDoesNotClosePlayingFrameInSameTab,
    testFrameAggregationVideoPrecedenceAndFallback,
    testPiPFramePriorityAndFallback,
    testNavigationClearsFrameFactsForTab,
    testModeBoundarySplitsOpenMediaSessions,
    testModeBoundarySplitsMultipleOpenMediaSessions,
    testModeBoundaryNoOpenMediaSessionsNoop,
    testModeBoundaryBeforeStartOnlyUpdatesMode,
    testModeBoundaryClosesPiPWhenTargetModeDisallowsPiP,
    testModeBoundaryClosesPiPAndReclassifiesRemainingVideo,
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

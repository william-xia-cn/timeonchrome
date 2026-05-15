// Media timing framework tests
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
const sessionStorage = new MockStorage();
global.chrome = { storage: { local: localStorage, session: sessionStorage } };

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

const usageApi = loadProdModule('core/usage-segments.js', [
  'appendUsageSegments',
  'buildUsageSegment',
  'incrementDailyUsageStats',
  'markSegmentSyncDirty',
  'markStatsSyncDirty',
  'splitSegmentByLocalDate',
]);
const frameworkApi = loadProdModule('core/media-framework.js', ['MediaFramework', 'resolveMediaFramework']);
const mediaApi = loadProdModule('runtime/media-session.js', [
  'handleMediaBoundary',
  'runMediaPeriodicCheckpoint',
  'closeMediaSession',
  'getMediaSession',
  '__resetMediaSessionForTest',
], {
  ...usageApi,
  getCachedEffectiveMode: () => 'study',
  resolveSettlementIdentity: async () => ({ profileId: 'profile-test', deviceId: 'device-test' }),
});

function check(name, condition, details = '') {
  if (!condition) throw new Error(`${name}${details ? `: ${details}` : ''}`);
}

function resetAll() {
  localStorage.reset();
  sessionStorage.reset();
  mediaApi.__resetMediaSessionForTest();
}

async function stabilize(framework, domain, base) {
  await mediaApi.handleMediaBoundary(framework, domain, 'mediaState', base);
  await mediaApi.handleMediaBoundary(framework, domain, 'mediaState', base + 6000);
}

async function getSegments() {
  const data = await localStorage.get('usage_segments_v1');
  const raw = data.usage_segments_v1 || {};
  return Array.isArray(raw) ? raw : Object.values(raw);
}

async function testResolverRules() {
  const fgVideo = frameworkApi.resolveMediaFramework({
    tabId: 1,
    candidateKind: 'known_domain',
    isFocused: true,
    isIdle: false,
    isAudible: true,
    isPiP: false,
    mediaKind: 'video',
    mediaSourceTabId: 1,
    mediaSourceDomain: 'video.example.com',
  });
  check('foreground same-tab video is owned by foreground_page', fgVideo.framework === 'none');

  const bgAudio = frameworkApi.resolveMediaFramework({
    tabId: 1,
    candidateKind: 'known_domain',
    isFocused: true,
    isIdle: false,
    isAudible: true,
    isPiP: false,
    mediaKind: 'audio',
    mediaSourceTabId: 2,
    mediaSourceDomain: 'audio.example.com',
  });
  check('different source audio resolves background_audio', bgAudio.framework === 'background_audio');

  const bgVideo = frameworkApi.resolveMediaFramework({
    tabId: 1,
    candidateKind: 'none',
    isFocused: false,
    isIdle: false,
    isAudible: true,
    isPiP: false,
    mediaKind: 'video',
    mediaSourceTabId: 1,
    mediaSourceDomain: 'video.example.com',
  });
  check('unfocused source video resolves background_video', bgVideo.framework === 'background_video');

  const pip = frameworkApi.resolveMediaFramework({
    isAudible: false,
    isPiP: true,
    mediaKind: 'video',
    mediaSourceTabId: 3,
    mediaSourceDomain: 'pip.example.com',
  });
  check('pip wins over other media', pip.framework === 'pip_video');
}

async function testCheckpoint(framework, domain, expectedChannel) {
  resetAll();
  const base = 1778800000000;
  await stabilize(framework, domain, base);
  const session = await mediaApi.getMediaSession();
  check(`${framework} session opens`, session.framework === framework && session.startTime === base);
  const checkpoint = await mediaApi.runMediaPeriodicCheckpoint(base + 186000);
  check(`${framework} checkpoint succeeds`, checkpoint.checkpointed === true, JSON.stringify(checkpoint));
  const segments = await getSegments();
  check(`${framework} writes one segment`, segments.length === 1);
  check(`${framework} segment channel`, segments[0].channel === expectedChannel, JSON.stringify(segments[0]));
  check(`${framework} segment framework`, segments[0].framework === framework, JSON.stringify(segments[0]));
  check(`${framework} duration`, segments[0].durationSeconds === 180);
}

async function testUnderCheckpointNoDurableSegment() {
  resetAll();
  const base = 1778801000000;
  await stabilize('background_audio', 'short.example.com', base);
  const checkpoint = await mediaApi.runMediaPeriodicCheckpoint(base + 60000);
  check('under checkpoint skip', checkpoint.checkpointed === false && checkpoint.reason === 'interval_not_reached');
  check('under checkpoint writes no segment', (await getSegments()).length === 0);
}

async function testCloseDoesNotBackfillLongSpan() {
  resetAll();
  const base = 1778802000000;
  await stabilize('background_video', 'close.example.com', base);
  const close = await mediaApi.closeMediaSession('tab_close', { now: base + 10 * 60 * 60_000 });
  check('close reports dropped session', close.closed === true);
  check('close does not write long segment', (await getSegments()).length === 0);
}

async function testMediaJitterDoesNotResetCheckpoint() {
  resetAll();
  const base = 1778803000000;
  await stabilize('background_audio', 'jitter.example.com', base);
  for (let t = 30000; t <= 180000; t += 30000) {
    await mediaApi.handleMediaBoundary('none', null, 'media_jitter', base + t);
    await mediaApi.handleMediaBoundary('background_audio', 'jitter.example.com', 'media_jitter', base + t + 2000);
  }
  const session = await mediaApi.getMediaSession();
  check('media jitter keeps original startTime', session.startTime === base);
  const checkpoint = await mediaApi.runMediaPeriodicCheckpoint(base + 190000);
  check('media checkpoint survives jitter', checkpoint.checkpointed === true);
}

async function run() {
  const tests = [
    testResolverRules,
    () => testCheckpoint('background_audio', 'audio.example.com', 'backgroundMedia'),
    () => testCheckpoint('background_video', 'video.example.com', 'backgroundMedia'),
    () => testCheckpoint('pip_video', 'pip.example.com', 'pip'),
    testUnderCheckpointNoDurableSegment,
    testCloseDoesNotBackfillLongSpan,
    testMediaJitterDoesNotResetCheckpoint,
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

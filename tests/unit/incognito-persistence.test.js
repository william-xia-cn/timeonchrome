// Incognito persistence exit sanitization tests
// Run with: node tests/unit/incognito-persistence.test.js

'use strict';

const fs = require('fs');
const path = require('path');

class MockStorage {
  constructor() { this.data = {}; }
  reset() { this.data = {}; }
  async get(keys) {
    if (keys == null) return { ...this.data };
    if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, this.data[key]]));
    if (typeof keys === 'string') return { [keys]: this.data[keys] };
    return Object.fromEntries(Object.entries(keys || {}).map(([key, fallback]) => [key, this.data[key] ?? fallback]));
  }
  async set(obj) { Object.assign(this.data, obj); }
  async remove(keys) { (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete this.data[key]); }
}

const localStorage = new MockStorage();
global.chrome = {
  storage: { local: localStorage, session: localStorage },
  runtime: { getManifest: () => ({ version: '1.7.3-test' }) },
};

function loadProdModule(relPath, exportNames, injected = {}) {
  const abs = path.join(__dirname, '..', '..', 'extension', relPath);
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

const privacy = loadProdModule('core/incognito-persistence.js', [
  'INCOGNITO_PLACEHOLDER_DOMAIN',
  'INCOGNITO_PLACEHOLDER_TEXT',
  'sanitizeIncognitoForPersistence',
]);

const usage = loadProdModule('core/usage-segments.js', [
  'buildUsageSegment',
  'appendUsageSegments',
  'incrementDailyUsageStats',
  'buildUsageSegmentsUploadPayload',
], {
  evaluateSuspectSegment: () => ({ suspect: false }),
  sanitizeIncognitoForPersistence: privacy.sanitizeIncognitoForPersistence,
});

const media = loadProdModule('runtime/media-session.js', [
  'applyMediaFacts',
  'getMediaSegments',
  'getDailyMediaStats',
  'buildMediaSegmentsUploadPayload',
], {
  getCachedEffectiveMode: () => 'rest',
  resolveSettlementIdentity: async () => ({ profileId: 'profile-1', deviceId: 'device-1' }),
  logFallbackEventBestEffort: () => {},
  sanitizeIncognitoForPersistence: privacy.sanitizeIncognitoForPersistence,
});

const session = loadProdModule('runtime/session.js', [
  'saveSession',
  'getSessionWithPersistenceSource',
], {
  appendEvent: async () => {},
  EVENT_TYPE: { START: 'START', END: 'END' },
  emitTrace: async () => {},
  getReliableCloseTime: () => Date.now(),
  isCountedState: () => true,
  settleUsageDuration: async () => ({ appended: 0 }),
  logClientEventBestEffort: () => {},
  logFallbackEventBestEffort: () => {},
  managedTargets: {},
  sanitizeIncognitoForPersistence: privacy.sanitizeIncognitoForPersistence,
});

const logs = loadProdModule('infra/client-logs.js', [
  'CLIENT_LOGS_KEY',
  'logClientEvent',
  'sanitizeClientLogForUpload',
], {
  INCOGNITO_PLACEHOLDER_DOMAIN: privacy.INCOGNITO_PLACEHOLDER_DOMAIN,
  sanitizeIncognitoForPersistence: privacy.sanitizeIncognitoForPersistence,
});

function check(name, condition) {
  if (!condition) throw new Error(name);
  console.log(`  PASS ${name}`);
}

function assertNoRawContent(name) {
  assertNoRawContentInValue(name, localStorage.data);
}

function assertNoRawContentInValue(name, value) {
  const serialized = JSON.stringify(value);
  for (const raw of [
    'secret.example.com',
    'https://secret.example.com/private/watch?v=VIDEO123&list=PLAYLIST123',
    'Sensitive Private Title',
    'VIDEO123',
    'PLAYLIST123',
  ]) {
    check(`${name} does not contain ${raw}`, !serialized.includes(raw));
  }
}

function assertContainsRawContent(name) {
  const serialized = JSON.stringify(localStorage.data);
  check(`${name} keeps managed domain`, serialized.includes('secret.example.com'));
  check(`${name} keeps managed url`, serialized.includes('https://secret.example.com/private/watch?v=VIDEO123&list=PLAYLIST123'));
  check(`${name} keeps managed title`, serialized.includes('Sensitive Private Title'));
}

function buildPrivateUsageInput(overrides = {}) {
  return {
    startMs: 1778212800000,
    endMs: 1778212860000,
    domain: 'secret.example.com',
    tabId: 123,
    windowId: 456,
    incognito: true,
    managedTargetValue: 'https://secret.example.com/private/watch?v=VIDEO123&list=PLAYLIST123',
    managedTargetLabelAtTime: 'Sensitive Private Title',
    channel: 'active',
    mode: 'rest',
    sourceState: 'ACTIVE',
    settlementReason: 'transition_complete',
    description: {
      start: { reason: 'tabUpdated', operation: 'tabUpdated', source: 'browser', atMs: 1778212800000 },
      end: { reason: 'tabUpdated', operation: 'tabUpdated', source: 'browser', atMs: 1778212860000 },
      summary: 'https://secret.example.com/private/watch?v=VIDEO123&list=PLAYLIST123 Sensitive Private Title',
    },
    ...overrides,
  };
}

(async () => {
  localStorage.reset();
  await session.saveSession({
    state: 'ACTIVE',
    domain: 'secret.example.com',
    startTime: 1778212800000,
    lastHeartbeat: 1778212800000,
    tabId: 123,
    windowId: 456,
    incognito: true,
    targetMatchLevel: 'domain_fallback',
  });
  const restoredSession = await session.getSessionWithPersistenceSource();
  check('persistent foreground session keeps real domain', restoredSession.session.domain === 'secret.example.com');
  check('persistent foreground session keeps incognito flag', restoredSession.session.incognito === true);

  localStorage.reset();
  const seg = usage.buildUsageSegment(buildPrivateUsageInput({
    targetMatchLevel: 'domain_fallback',
  }));
  await usage.appendUsageSegments(seg);
  await usage.incrementDailyUsageStats(seg);
  const payload = await usage.buildUsageSegmentsUploadPayload([seg.id]);
  check('usage segment domain is placeholder', payload.segments[0].domain === privacy.INCOGNITO_PLACEHOLDER_DOMAIN);
  check('usage target value is non-content placeholder', String(payload.segments[0].managedTargetValue || '').startsWith('__incognito_'));
  assertNoRawContent('usage persistence');

  localStorage.reset();
  const pendingSeg = usage.buildUsageSegment(buildPrivateUsageInput({
    managedTargetId: 'mt-pending',
    managedTargetType: 'url',
    targetClassificationAtTime: 'pending_composite',
    targetMatchLevel: 'url',
  }));
  await usage.appendUsageSegments(pendingSeg);
  await usage.incrementDailyUsageStats(pendingSeg);
  check('pending incognito segment domain is placeholder', pendingSeg.domain === privacy.INCOGNITO_PLACEHOLDER_DOMAIN);
  assertNoRawContent('pending usage persistence');

  localStorage.reset();
  const approvedStudySeg = usage.buildUsageSegment(buildPrivateUsageInput({
    managedTargetId: 'mt-study',
    managedTargetType: 'url',
    targetClassificationAtTime: 'study',
    targetMatchLevel: 'url',
  }));
  await usage.appendUsageSegments(approvedStudySeg);
  await usage.incrementDailyUsageStats(approvedStudySeg);
  check('approved study incognito keeps domain', approvedStudySeg.domain === 'secret.example.com');
  assertContainsRawContent('approved study usage persistence');

  localStorage.reset();
  const approvedCompositeSeg = usage.buildUsageSegment(buildPrivateUsageInput({
    managedTargetId: 'mt-composite',
    managedTargetType: 'url',
    targetClassificationAtTime: 'composite',
    targetMatchLevel: 'url',
  }));
  await usage.appendUsageSegments(approvedCompositeSeg);
  await usage.incrementDailyUsageStats(approvedCompositeSeg);
  check('approved composite incognito keeps domain', approvedCompositeSeg.domain === 'secret.example.com');
  assertContainsRawContent('approved composite usage persistence');

  localStorage.reset();
  const normalFallbackSeg = usage.buildUsageSegment(buildPrivateUsageInput({
    incognito: false,
    targetMatchLevel: 'domain_fallback',
  }));
  await usage.appendUsageSegments(normalFallbackSeg);
  await usage.incrementDailyUsageStats(normalFallbackSeg);
  check('normal fallback keeps domain', normalFallbackSeg.domain === 'secret.example.com');
  assertContainsRawContent('normal fallback usage persistence');

  localStorage.reset();
  await media.applyMediaFacts({
    tabId: 789,
    frameId: 0,
    windowId: 456,
    domain: 'secret.example.com',
    mediaSourceDomain: 'secret.example.com',
    playing: true,
    mediaKind: 'video',
    isActiveTab: true,
    windowState: 'normal',
    incognito: true,
    sourceUrl: 'https://secret.example.com/private/watch?v=VIDEO123&list=PLAYLIST123',
    title: 'Sensitive Private Title',
  }, 'mediaState', 1778212800000);
  const openMediaFacts = localStorage.data.media_facts_v1 || {};
  const openFrameFacts = localStorage.data.media_frame_facts_v1 || {};
  const openMediaSessions = localStorage.data.media_sessions_v2 || {};
  check('media facts keep real domain before segment', JSON.stringify(openMediaFacts).includes('secret.example.com'));
  check('media frame facts keep real domain before segment', JSON.stringify(openFrameFacts).includes('secret.example.com'));
  check('media open sessions keep real domain before segment', JSON.stringify(openMediaSessions).includes('secret.example.com'));
  await media.applyMediaFacts({
    tabId: 789,
    frameId: 0,
    windowId: 456,
    domain: 'secret.example.com',
    playing: false,
    mediaKind: 'video',
    incognito: true,
  }, 'mediaState', 1778212860000);
  const mediaSegments = Object.values(await media.getMediaSegments());
  const mediaPayload = await media.buildMediaSegmentsUploadPayload(mediaSegments.map((row) => row.id));
  check('media segment domain is placeholder', mediaPayload.segments[0].domain === privacy.INCOGNITO_PLACEHOLDER_DOMAIN);
  assertNoRawContentInValue('media segment persistence', {
    media_segments_v1: localStorage.data.media_segments_v1,
    daily_media_stats_v1: localStorage.data.daily_media_stats_v1,
    hourly_media_stats_v1: localStorage.data.hourly_media_stats_v1,
    payload: mediaPayload,
  });

  localStorage.reset();
  await logs.logClientEvent({
    level: 'warning',
    category: 'runtime',
    eventCode: 'incognito_warning',
    domain: 'secret.example.com',
    incognito: true,
    details: {
      incognito: true,
      url: 'https://secret.example.com/private/watch?v=VIDEO123&list=PLAYLIST123',
      title: 'Sensitive Private Title',
      playlistId: 'PLAYLIST123',
      videoId: 'VIDEO123',
    },
  });
  const storedLogs = localStorage.data[logs.CLIENT_LOGS_KEY] || [];
  const uploadLog = logs.sanitizeClientLogForUpload(storedLogs[0]);
  check('client log domain is placeholder', uploadLog.domain === privacy.INCOGNITO_PLACEHOLDER_DOMAIN);
  assertNoRawContent('client log persistence');

  console.log('\nincognito-persistence: PASS');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

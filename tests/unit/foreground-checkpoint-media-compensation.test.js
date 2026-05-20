// Foreground checkpoint legacy media compensation scope tests
// Run with: node tests/unit/foreground-checkpoint-media-compensation.test.js

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

function extractDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (_) {
    return null;
  }
}

function check(name, condition, details = '') {
  if (!condition) throw new Error(`${name}${details ? `: ${details}` : ''}`);
}

let idleState = 'active';
let activeTab = null;
let activeWindow = { focused: true, state: 'normal' };
let mediaRequests = [];
let mediaResponder = async () => ({ ok: false, reason: 'no_foreground_media' });

global.chrome = {
  runtime: {},
  idle: {
    queryState: (_seconds, cb) => cb(idleState),
  },
  tabs: {
    query: async () => (activeTab ? [activeTab] : []),
  },
  windows: {
    get: async () => activeWindow,
  },
};

const foregroundApi = loadProdModule('core/foreground-timing.js', ['confirmForegroundPageCheckpoint'], {
  queryForegroundMediaForOpenSession: async (session, reason) => {
    mediaRequests.push({ session, reason });
    return mediaResponder(session, reason);
  },
  extractDomain,
  emitTrace: async () => {},
  applyModeEffectiveBoundary: async () => ({ ok: true }),
  getTimingSession: async () => ({}),
  transitionStateAt: async () => ({}),
});

function reset() {
  idleState = 'active';
  activeTab = { id: 2, windowId: 20, url: 'https://active.example.com/', audible: true, active: true };
  activeWindow = { focused: true, state: 'normal' };
  mediaRequests = [];
  mediaResponder = async () => ({ ok: false, reason: 'no_foreground_media' });
}

async function testSessionTabMediaCanCompensateOldSessionClose() {
  reset();
  idleState = 'idle';
  mediaResponder = async (session) => ({
    ok: true,
    source: 'media_fact',
    fact: { tabId: session.tabId, domain: 'session.example.com', windowId: 10 },
    classification: { mediaClass: 'foregroundVideo' },
  });

  const result = await foregroundApi.confirmForegroundPageCheckpoint({
    state: 'ACTIVE',
    domain: 'session.example.com',
    tabId: 1,
    windowId: 10,
    startTime: 1779000000000,
  });

  check('session tab foreground media compensates old session close', result.ok === true && result.reason === 'foreground_media_compensated:idle_not_active', JSON.stringify(result));
  check('only open session was queried', mediaRequests.length === 1 && mediaRequests[0].session.tabId === 1, JSON.stringify(mediaRequests));
  check('session media query reason is explicit', mediaRequests[0].reason === 'checkpoint_session_media_query', JSON.stringify(mediaRequests));
}

async function testObservedActiveTabMediaDoesNotCompensateOldSession() {
  reset();
  activeWindow = { focused: false, state: 'normal' };
  mediaResponder = async () => ({ ok: false, reason: 'no_foreground_media' });

  const result = await foregroundApi.confirmForegroundPageCheckpoint({
    state: 'ACTIVE',
    domain: 'session.example.com',
    tabId: 1,
    windowId: 10,
    startTime: 1779000000000,
  });

  check('active tab media is not used to compensate old session', result.ok === false && result.reason === 'window_unfocused', JSON.stringify(result));
  check('observed active tab was not queried for media compensation', mediaRequests.length === 1 && mediaRequests[0].session.tabId === 1, JSON.stringify(mediaRequests));
}

async function testNoSessionDoesNotQueryMediaForEstimatedOpen() {
  reset();
  activeWindow = { focused: false, state: 'normal' };

  const result = await foregroundApi.confirmForegroundPageCheckpoint(null);

  check('no session does not media-compensate foreground open', result.ok === false && result.reason === 'window_unfocused', JSON.stringify(result));
  check('no media query without old active session', mediaRequests.length === 0, JSON.stringify(mediaRequests));
}

async function testSessionMediaDomainMismatchDoesNotCompensate() {
  reset();
  idleState = 'idle';
  mediaResponder = async (session) => ({
    ok: false,
    reason: 'observed_mismatch',
    source: 'media_fact',
    fact: { tabId: session.tabId, domain: 'other.example.com', windowId: 10 },
    classification: { mediaClass: 'foregroundVideo' },
  });

  const result = await foregroundApi.confirmForegroundPageCheckpoint({
    state: 'ACTIVE',
    domain: 'session.example.com',
    tabId: 1,
    windowId: 10,
    startTime: 1779000000000,
  });

  check('session media domain mismatch does not compensate', result.ok === false && result.reason === 'observed_mismatch', JSON.stringify(result));
  check('mismatch result is marked as media compensation attempt', result.mediaCompensationAttempted === true, JSON.stringify(result));
}

async function run() {
  const tests = [
    testSessionTabMediaCanCompensateOldSessionClose,
    testObservedActiveTabMediaDoesNotCompensateOldSession,
    testNoSessionDoesNotQueryMediaForEstimatedOpen,
    testSessionMediaDomainMismatchDoesNotCompensate,
  ];
  let passed = 0;
  for (const test of tests) {
    await test();
    passed++;
  }
  console.log(`[Foreground Checkpoint Media Compensation] ${passed}/${tests.length} passed`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

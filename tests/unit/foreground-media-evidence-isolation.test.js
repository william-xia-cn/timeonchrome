// Foreground webpage timing must only accept fresh content media evidence.
// Run with: node tests/unit/foreground-media-evidence-isolation.test.js

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

function check(name, condition, details = '') {
  if (!condition) throw new Error(`${name}${details ? `: ${details}` : ''}`);
}

let openSession = null;
let queryResult = { ok: false, reason: 'no_fresh_content_media' };
let queryCalls = 0;

const api = loadProdModule('core/foreground-timing.js', ['enrichContextWithForegroundMedia'], {
  logFallbackEventBestEffort: () => {},
  getTimingSession: async () => openSession,
  queryForegroundMediaForOpenSession: async () => {
    queryCalls++;
    return queryResult;
  },
});

function mediaObservation(overrides = {}) {
  const now = Date.now();
  return {
    fact: {
      tabId: 1,
      windowId: 10,
      domain: 'video.example.com',
      mediaKind: 'video',
      playing: true,
      isActiveTab: true,
      isWindowFocused: true,
      windowState: 'normal',
      evidenceTier: 'content',
      lastObservedAt: now,
      ...overrides,
    },
    classification: { mediaClass: 'foregroundVideo' },
  };
}

async function run() {
  const baseContext = {
    idleState: 'idle',
    isFocused: true,
    tabId: 1,
    windowId: 10,
    domain: 'video.example.com',
  };

  let result = await api.enrichContextWithForegroundMedia(
    baseContext,
    null,
    { _reason: 'mediaState' },
    mediaObservation({ evidenceTier: 'audible_fallback' })
  );
  check('audible fallback cannot compensate webpage timing', result.foregroundMediaActive === false, JSON.stringify(result));

  result = await api.enrichContextWithForegroundMedia(
    baseContext,
    null,
    { _reason: 'mediaState' },
    mediaObservation()
  );
  check('fresh focused content evidence can compensate idle webpage timing', result.foregroundMediaActive === true, JSON.stringify(result));

  result = await api.enrichContextWithForegroundMedia(
    baseContext,
    null,
    { _reason: 'mediaState' },
    mediaObservation({ lastObservedAt: Date.now() - 90_001 })
  );
  check('stale content evidence cannot compensate webpage timing', result.foregroundMediaActive === false, JSON.stringify(result));

  openSession = { state: 'ACTIVE', tabId: 1, windowId: 10, domain: 'video.example.com' };
  queryResult = { ok: true, ...mediaObservation({ evidenceTier: 'audible_fallback' }) };
  queryCalls = 0;
  result = await api.enrichContextWithForegroundMedia(
    { ...baseContext, isFocused: false },
    null,
    { _reason: 'windowFocusLost' },
    null
  );
  check('defensive validation rejects weak helper result', queryCalls === 1 && result.foregroundMediaActive === false, JSON.stringify(result));

  console.log('[Foreground Media Evidence Isolation] 4/4 passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

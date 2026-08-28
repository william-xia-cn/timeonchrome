// foreground-timing-boundary-dedupe.test.js
// Run with: node tests/unit/foreground-timing-boundary-dedupe.test.js

'use strict';

const fs = require('fs');
const path = require('path');

function loadForegroundTiming(stubs = {}) {
  const abs = path.join(__dirname, '..', '..', 'extension', 'core', 'foreground-timing.js');
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  const keys = Object.keys(stubs);
  const prelude = keys.length ? `const { ${keys.join(', ')} } = __injected;\n` : '';
  return new Function('__injected', `${prelude}${code}\nreturn { processForegroundSignal };`)(stubs);
}

function makeStubs(sessionRef, transitions, traces = []) {
  return {
    buildContext: (_current, rawEvent) => ({
      tabId: rawEvent.tabId ?? null,
      windowId: rawEvent.windowId ?? null,
      domain: rawEvent.domain ?? null,
      isFocused: rawEvent.isFocused !== false,
      isIdle: rawEvent.isIdle === true,
      idleState: rawEvent.idleState || 'active',
      foregroundMediaActive: false,
      resolvedState: rawEvent.resolvedState || null,
    }),
    resolveState: (context) => context.resolvedState || (context.isFocused && !context.isIdle && context.domain ? 'ACTIVE' : 'IDLE'),
    emitTrace: async (event, payload) => traces.push({ event, payload }),
    queryForegroundMediaForOpenSession: async () => ({ ok: false, reason: 'no_foreground_media' }),
    extractDomain: (url) => {
      try { return new URL(url).hostname; } catch { return null; }
    },
    applyModeEffectiveBoundary: async () => ({ ok: true }),
    getTimingSession: async () => sessionRef.current,
    transitionStateAt: async (state, domain, atMs, reason, options) => {
      transitions.push({ state, domain, atMs, reason, options });
      sessionRef.current = state
        ? { state, domain, startTime: atMs, tabId: options?.tabId ?? null, windowId: options?.windowId ?? null }
        : { state: null, domain: null, startTime: null, tabId: null, windowId: null };
      return { ok: true };
    },
  };
}

function check(name, condition, details = '') {
  if (!condition) throw new Error(`${name}${details ? `: ${details}` : ''}`);
}

async function run() {
  {
    const sessionRef = { current: { state: 'ACTIVE', domain: 'example.com', startTime: 1000, tabId: 1, windowId: 10 } };
    const transitions = [];
    const traces = [];
    const { processForegroundSignal } = loadForegroundTiming(makeStubs(sessionRef, transitions, traces));
    await processForegroundSignal({
      tabId: 1,
      windowId: 10,
      domain: 'example.com',
      isFocused: true,
      _reason: 'tabUpdated',
    });
    check('same persisted ACTIVE/domain foreground fact is not re-applied', transitions.length === 0, JSON.stringify(transitions));
    check('same persisted boundary emits skip trace', traces.some((trace) => trace.event === 'foreground_boundary_skipped'));
  }

  {
    const sessionRef = { current: { state: 'ACTIVE', domain: 'old.example.com', startTime: 1000, tabId: 1, windowId: 10 } };
    const transitions = [];
    const { processForegroundSignal } = loadForegroundTiming(makeStubs(sessionRef, transitions));
    await processForegroundSignal({
      tabId: 1,
      windowId: 10,
      domain: 'new.example.com',
      isFocused: true,
      _reason: 'tabUpdated',
    });
    check('different domain still applies foreground boundary', transitions.length === 1, JSON.stringify(transitions));
    check('different domain transition target is new domain', transitions[0].domain === 'new.example.com', JSON.stringify(transitions));
  }

  {
    const sessionRef = { current: { state: 'ACTIVE', domain: 'example.com', startTime: 1000, tabId: 1, windowId: 10 } };
    const transitions = [];
    const { processForegroundSignal } = loadForegroundTiming(makeStubs(sessionRef, transitions));
    await processForegroundSignal({
      tabId: 2,
      windowId: 10,
      domain: 'example.com',
      isFocused: true,
      _reason: 'tabActivated',
    });
    check('same domain but different tabId still applies foreground boundary', transitions.length === 1, JSON.stringify(transitions));
    check('different tab transition target keeps same domain', transitions[0].domain === 'example.com', JSON.stringify(transitions));
  }

  {
    const sessionRef = { current: { state: 'ACTIVE', domain: 'video.example.com', startTime: 1000, tabId: 1, windowId: 10 } };
    const transitions = [];
    const { processForegroundSignal } = loadForegroundTiming(makeStubs(sessionRef, transitions));
    const result = await processForegroundSignal({
      tabId: 1,
      windowId: 10,
      isFocused: false,
      resolvedState: 'BACKGROUND_ACTIVE',
      _reason: 'windowFocusLost',
    });
    check('unfocused weak media closes the existing webpage session', transitions.length === 1 && transitions[0].state === 'IDLE', JSON.stringify(transitions));
    check('weak media remains a diagnostic media state while webpage result is IDLE', result.state === 'IDLE' && result.mediaState === 'BACKGROUND_ACTIVE', JSON.stringify(result));
  }

  console.log('[Foreground Timing Boundary Dedupe] 8/8 passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

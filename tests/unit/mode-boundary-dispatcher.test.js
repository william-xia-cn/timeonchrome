// mode-boundary-dispatcher.test.js
// Run with: node tests/unit/mode-boundary-dispatcher.test.js

'use strict';

const fs = require('fs');
const path = require('path');

function loadDispatcher(stubs = {}) {
  const abs = path.join(__dirname, '..', '..', 'core', 'timing-dispatcher.js');
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  const keys = Object.keys(stubs);
  const prelude = keys.length ? `const { ${keys.join(', ')} } = __injected;\n` : '';
  return new Function('__injected', `${prelude}${code}\nreturn { classifyTimingSignal, dispatchTimingSignal, drainPendingModeBoundaries, processModeBoundarySignal };`)(stubs);
}

function check(name, condition, details = '') {
  if (!condition) throw new Error(`${name}${details ? `: ${details}` : ''}`);
}

async function run() {
  {
    const calls = [];
    const api = loadDispatcher({
      isMediaOnlyTimingSignal: () => false,
      observeMediaFromSignal: async () => null,
      processForegroundSignal: async () => ({ ok: true }),
      processForegroundModeBoundary: async (intent) => { calls.push(['foreground', intent.toMode]); return { ok: true }; },
      processMediaModeBoundary: async (intent) => { calls.push(['media', intent.toMode]); return { ok: true }; },
      drainModeBoundaryIntents: async () => ({ ok: true, processed: 0 }),
    });
    const result = await api.dispatchTimingSignal({
      type: 'mode_boundary',
      boundaryAtMs: 1000,
      fromMode: 'rest',
      toMode: 'study',
      reason: 'rest_to_study',
    });
    check('mode boundary dispatch succeeds', result.ok === true, JSON.stringify(result));
    check('mode boundary fans out to foreground and media', JSON.stringify(calls) === JSON.stringify([['foreground', 'study'], ['media', 'study']]), JSON.stringify(calls));
  }

  {
    const calls = [];
    const api = loadDispatcher({
      isMediaOnlyTimingSignal: () => false,
      observeMediaFromSignal: async () => null,
      processForegroundSignal: async () => ({ ok: true }),
      processForegroundModeBoundary: async () => ({ ok: true }),
      processMediaModeBoundary: async () => ({ ok: true }),
      drainModeBoundaryIntents: async (processor) => {
        calls.push('drain');
        await processor({ id: 'queued', type: 'mode_boundary', boundaryAtMs: 2000, fromMode: 'study', toMode: 'composite' });
        return { ok: true, processed: 1 };
      },
    });
    const result = await api.dispatchTimingSignal({ _reason: 'tabActivated', domain: 'example.com' });
    check('normal signal drains pending mode boundaries first', calls[0] === 'drain', JSON.stringify(calls));
    check('normal signal still processes foreground', result.ok === true);
  }

  {
    const api = loadDispatcher({
      isMediaOnlyTimingSignal: () => false,
      observeMediaFromSignal: async () => null,
      processForegroundSignal: async () => ({ ok: true }),
      processForegroundModeBoundary: async () => ({ ok: true }),
      processMediaModeBoundary: async () => ({ ok: false, reason: 'media_failed' }),
      drainModeBoundaryIntents: async () => ({ ok: true, processed: 0 }),
    });
    const result = await api.dispatchTimingSignal({
      type: 'mode_boundary',
      boundaryAtMs: 3000,
      fromMode: 'study',
      toMode: 'rest',
    });
    check('mode boundary reports failure when media side fails', result.ok === false && result.media.ok === false, JSON.stringify(result));
  }

  {
    let foregroundCalls = 0;
    const api = loadDispatcher({
      isMediaOnlyTimingSignal: () => false,
      observeMediaFromSignal: async () => null,
      processForegroundSignal: async () => { foregroundCalls += 1; return { ok: true }; },
      processForegroundModeBoundary: async () => ({ ok: true }),
      processMediaModeBoundary: async () => ({ ok: true }),
      drainModeBoundaryIntents: async () => ({ ok: true, processed: 0 }),
    });
    const result = await api.dispatchTimingSignal({ _reason: 'windowFocusPolled', isFocused: false });
    check('windowFocusPolled is skipped by dispatcher', result.skipped === true && result.reason === 'focus_polling_disabled', JSON.stringify(result));
    check('windowFocusPolled does not enter foreground consumer', foregroundCalls === 0, String(foregroundCalls));
  }

  {
    let foregroundCalls = 0;
    let mediaCalls = 0;
    const api = loadDispatcher({
      isMediaOnlyTimingSignal: () => true,
      observeMediaFromSignal: async () => { mediaCalls += 1; return { ok: true }; },
      processForegroundSignal: async () => { foregroundCalls += 1; return { ok: true }; },
      processForegroundModeBoundary: async () => ({ ok: true }),
      processMediaModeBoundary: async () => ({ ok: true }),
      drainModeBoundaryIntents: async () => ({ ok: true, processed: 0 }),
    });
    const result = await api.dispatchTimingSignal({ _reason: 'tabAudible', mediaSourceTabId: 1 });
    check('media-only signal is observed by media side', mediaCalls === 1, String(mediaCalls));
    check('media-only signal skips foreground consumer', foregroundCalls === 0, String(foregroundCalls));
    check('media-only signal returns foreground unchanged reason', result.reason === 'media_signal_foreground_unchanged', JSON.stringify(result));
  }

  console.log('[Mode Boundary Dispatcher] 8/8 passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

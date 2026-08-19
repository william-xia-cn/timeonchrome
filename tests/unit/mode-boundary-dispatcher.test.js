// mode-boundary-dispatcher.test.js
// Run with: node tests/unit/mode-boundary-dispatcher.test.js

'use strict';

const fs = require('fs');
const path = require('path');

function loadDispatcher(stubs = {}) {
  const abs = path.join(__dirname, '..', '..', 'extension', 'core', 'timing-dispatcher.js');
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

const auditStubs = {
  createTimingAuditId: (() => {
    let i = 0;
    return () => `audit-${++i}`;
  })(),
  inboundAuditFields: (raw = {}) => ({
    auditId: raw.auditId || null,
    type: raw.type || null,
    _reason: raw._reason || null,
    source: raw.source || null,
    tabId: Number.isInteger(raw.tabId) ? raw.tabId : null,
    windowId: Number.isInteger(raw.windowId) ? raw.windowId : null,
    domain: typeof raw.domain === 'string' ? raw.domain : null,
    url: typeof raw.url === 'string' ? raw.url : null,
    mediaSourceTabId: Number.isInteger(raw.mediaSourceTabId) ? raw.mediaSourceTabId : null,
    mediaFrameId: Number.isInteger(raw.mediaFrameId) ? raw.mediaFrameId : null,
    isPiP: raw.isPiP === true ? true : (raw.isPiP === false ? false : null),
    idleState: typeof raw.idleState === 'string' ? raw.idleState : null,
    isFocused: raw.isFocused === true ? true : (raw.isFocused === false ? false : null),
    timestamp: Number.isFinite(raw.timestamp) ? raw.timestamp : null,
    incognito: raw.incognito === true,
    error: raw.error ? String(raw.error) : null,
  }),
};

async function run() {
  {
    const calls = [];
    const traces = [];
    const api = loadDispatcher({
      ...auditStubs,
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
    }, { emitTrace: async (event, payload) => traces.push({ event, payload }) });
    check('mode boundary dispatch succeeds', result.ok === true, JSON.stringify(result));
    check('mode boundary fans out to foreground and media', JSON.stringify(calls) === JSON.stringify([['foreground', 'study'], ['media', 'study']]), JSON.stringify(calls));
    check('mode boundary produces inbound audit', traces.some((trace) => trace.event === 'timing_inbound_received'), JSON.stringify(traces));
    check('mode boundary result carries audit id', traces.some((trace) => trace.event === 'mode_boundary_result' && trace.payload?.payload?.auditId), JSON.stringify(traces));
  }

  {
    const calls = [];
    const traces = [];
    const api = loadDispatcher({
      ...auditStubs,
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
    const result = await api.dispatchTimingSignal({ _reason: 'tabActivated', domain: 'example.com' }, {
      emitTrace: async (event, payload) => traces.push({ event, payload }),
    });
    check('normal signal drains pending mode boundaries first', calls[0] === 'drain', JSON.stringify(calls));
    check('normal signal still processes foreground', result.ok === true);
    check('normal signal produces received and routed audit', traces.some((trace) => trace.event === 'timing_inbound_received') && traces.some((trace) => trace.event === 'timing_inbound_routed'), JSON.stringify(traces));
  }

  {
    const api = loadDispatcher({
      ...auditStubs,
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
    const traces = [];
    const api = loadDispatcher({
      ...auditStubs,
      isMediaOnlyTimingSignal: () => false,
      observeMediaFromSignal: async () => null,
      processForegroundSignal: async () => { foregroundCalls += 1; return { ok: true }; },
      processForegroundModeBoundary: async () => ({ ok: true }),
      processMediaModeBoundary: async () => ({ ok: true }),
      drainModeBoundaryIntents: async () => ({ ok: true, processed: 0 }),
    });
    const result = await api.dispatchTimingSignal({ _reason: 'windowFocusPolled', isFocused: false }, {
      emitTrace: async (event, payload) => traces.push({ event, payload }),
    });
    check('windowFocusPolled is skipped by dispatcher', result.skipped === true && result.reason === 'focus_polling_disabled', JSON.stringify(result));
    check('windowFocusPolled does not enter foreground consumer', foregroundCalls === 0, String(foregroundCalls));
    check('windowFocusPolled produces inbound skipped audit', traces.some((trace) => trace.event === 'timing_inbound_skipped' && trace.payload.reason === 'focus_polling_disabled'), JSON.stringify(traces));
  }

  {
    let foregroundCalls = 0;
    let mediaCalls = 0;
    const traces = [];
    const api = loadDispatcher({
      ...auditStubs,
      isMediaOnlyTimingSignal: () => true,
      observeMediaFromSignal: async () => { mediaCalls += 1; return { ok: true }; },
      processForegroundSignal: async () => { foregroundCalls += 1; return { ok: true }; },
      processForegroundModeBoundary: async () => ({ ok: true }),
      processMediaModeBoundary: async () => ({ ok: true }),
      drainModeBoundaryIntents: async () => ({ ok: true, processed: 0 }),
    });
    const result = await api.dispatchTimingSignal({ _reason: 'tabAudible', mediaSourceTabId: 1 }, {
      emitTrace: async (event, payload) => traces.push({ event, payload }),
    });
    check('media-only signal is observed by media side', mediaCalls === 1, String(mediaCalls));
    check('media-only signal skips foreground consumer', foregroundCalls === 0, String(foregroundCalls));
    check('media-only signal returns foreground unchanged reason', result.reason === 'media_signal_foreground_unchanged', JSON.stringify(result));
    check('media-only signal produces inbound skipped audit', traces.some((trace) => trace.event === 'timing_inbound_skipped' && trace.payload.reason === 'media_signal_foreground_unchanged'), JSON.stringify(traces));
  }

  {
    let foregroundCalls = 0;
    const fallbackLogs = [];
    const api = loadDispatcher({
      ...auditStubs,
      isMediaOnlyTimingSignal: () => false,
      observeMediaFromSignal: async () => { throw new Error('media ledger unavailable'); },
      processForegroundSignal: async () => { foregroundCalls += 1; return { ok: true, foregroundWritten: true }; },
      processForegroundModeBoundary: async () => ({ ok: true }),
      processMediaModeBoundary: async () => ({ ok: true }),
      drainModeBoundaryIntents: async () => ({ ok: true, processed: 0 }),
      logFallbackEventBestEffort: (event) => fallbackLogs.push(event),
    });
    const result = await api.dispatchTimingSignal({ _reason: 'tabUpdated', domain: 'example.com' });
    check('media consumer failure does not block foreground timing', foregroundCalls === 1 && result.foregroundWritten === true, JSON.stringify(result));
    check('media consumer failure remains visible in result', result.media?.ok === false, JSON.stringify(result));
    check('media consumer failure emits a bounded fallback event', fallbackLogs.some((event) => event.eventCode === 'media_timing_consumer_failed'), JSON.stringify(fallbackLogs));
  }

  console.log('[Mode Boundary Dispatcher] passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

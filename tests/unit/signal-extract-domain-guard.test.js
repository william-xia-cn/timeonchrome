// signal-extract-domain-guard.test.js
// Run with: node tests/unit/signal-extract-domain-guard.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function expectTrue(desc, cond) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
  }
}

function section(name) { console.log(`\n[${name}]`); }

function loadNormalizeHostname() {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'domain-semantics.js'), 'utf8');
  const transformed = code.replace(/export\s+function\s+/g, 'function ') + '\nthis.__d = { normalizeHostname, domainForUrl };';
  const context = { console, URL, this: null };
  context.this = context;
  vm.runInNewContext(transformed, context, { filename: 'domain-semantics.js' });
  return context.__d;
}

function loadSignalInit(deps, hooks) {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'signal.js'), 'utf8');
  const transformed = code
    .replace(/import\s+\{\s*domainForUrl\s*\}\s+from\s+'\.\/domain-semantics\.js';/, 'const domainForUrl = __deps.domainForUrl;')
    .replace(/export\s+function\s+/g, 'function ')
    + '\nthis.__signalExports = { initSignal };';

  const chrome = {
    tabs: {
      onActivated: { addListener(fn) { hooks.onActivated = fn; } },
      onUpdated: { addListener(fn) { hooks.onUpdated = fn; } },
      onRemoved: { addListener(fn) { hooks.onRemoved = fn; } },
      onReplaced: { addListener(fn) { hooks.onReplaced = fn; } },
      get: async (tabId) => hooks.getTab(tabId),
      query: async (queryInfo) => hooks.queryTabs(queryInfo),
    },
    windows: {
      onFocusChanged: { addListener(fn) { hooks.onFocusChanged = fn; } },
      WINDOW_ID_NONE: -1,
      get: async (windowId) => hooks.getWindow(windowId),
      getAll: async () => hooks.getAllWindows(),
    },
    idle: {
      onStateChanged: { addListener(fn) { hooks.onStateChanged = fn; } },
      setDetectionInterval(seconds) { hooks.idleDetectionInterval = seconds; },
    },
    runtime: { onMessage: { addListener(fn) { hooks.onMessage = fn; } } },
    webNavigation: {
      onCommitted: { addListener(fn) { hooks.onCommitted = fn; } },
    },
  };

  const context = {
    console,
    URL,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    chrome,
    __deps: deps,
    this: null,
  };
  context.this = context;
  vm.runInNewContext(transformed, context, { filename: 'signal.js' });
  return context.__signalExports;
}

function loadProdModule(relPath, exportNames) {
  const abs = path.join(__dirname, '..', '..', 'extension', relPath);
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');
  const fields = exportNames.map(n => `"${n}": (typeof ${n} !== 'undefined' ? ${n} : undefined)`);
  const factory = new Function(`${code}\nreturn { ${fields.join(', ')} };`);
  return factory();
}

async function run() {
  const domainSemantics = loadNormalizeHostname();
  const hooks = {
    queryTabs: async () => [{ id: 202, windowId: 20, active: true, url: 'https://Focus.Example.COM./active' }],
    getTab: async () => ({ id: 303, windowId: 30, url: 'https://WWW.Example.COM./from-activated', active: true }),
    getWindow: async () => ({ focused: true }),
    getAllWindows: async () => [{ id: 20, focused: true, type: 'normal' }],
  };
  const emitted = [];
  const { buildContext } = loadProdModule('core/context.js', ['buildContext']);
  const { resolveState, AttentionState } = loadProdModule('core/state.js', ['resolveState', 'AttentionState']);

  const signal = loadSignalInit({ domainForUrl: domainSemantics.domainForUrl }, hooks);
  signal.initSignal((e) => emitted.push(e));

  section('SG0: idle detection interval is configured at 90 seconds');
  expectTrue('idle detection interval should be 90 seconds', hooks.idleDetectionInterval === 90);

  section('SG1: minimal integration guard for onUpdated event domain extraction');
  hooks.onUpdated(101, { url: 'https://WWW.Example.COM./path' }, { active: true, windowId: 10, url: 'https://WWW.Example.COM./path' });
  await new Promise((r) => setTimeout(r, 100));

  expectTrue('应发出至少一个合并事件', emitted.length > 0);
  expectTrue('onUpdated 提取结果应保留 www 且标准化', emitted.some(e => e.domain === 'www.example.com' && e.tabId === 101));
  expectTrue('onUpdated should include window focus snapshot', emitted.some(e => e.domain === 'www.example.com' && e.isFocused === true && e.windowId === 10));
  expectTrue('onUpdated should clear stale media state for the navigating tab', emitted.some(e => e.tabId === 101 && e.isAudible === false && e.mediaSourceTabId === 101));

  section('SG1a: onUpdated complete supplies active tab URL fact without media clearing');
  emitted.length = 0;
  await hooks.onUpdated(102, { status: 'complete' }, { id: 102, active: true, windowId: 10, url: 'https://Complete.Example/path' });
  await new Promise((r) => setTimeout(r, 100));
  expectTrue('status=complete active tab should emit foreground fact', emitted.some(e => e._reason === 'tabUpdated' && e.domain === 'complete.example' && e.tabId === 102));
  expectTrue('status=complete should not clear media state', emitted.every(e => e.isAudible !== false && e.mediaSourceTabId !== 102));

  section('SG1a2: onUpdated complete inactive tab is ignored');
  emitted.length = 0;
  await hooks.onUpdated(103, { status: 'complete' }, { id: 103, active: false, windowId: 10, url: 'https://InactiveComplete.Example/path' });
  await new Promise((r) => setTimeout(r, 100));
  expectTrue('inactive status=complete should not emit foreground fact', emitted.length === 0);

  section('SG1b: tabActivated signal includes current window focus snapshot');
  emitted.length = 0;
  hooks.getTab = async () => ({ id: 303, windowId: 30, url: 'https://WWW.Example.COM./from-activated', active: true });
  await hooks.onActivated({ tabId: 303, windowId: 30 });
  await new Promise((r) => setTimeout(r, 100));

  expectTrue('tabActivated should emit focused signal', emitted.length === 1);
  expectTrue('tabActivated should include isFocused=true', emitted[0]?.isFocused === true);
  expectTrue('tabActivated should include tab URL', emitted[0]?.url === 'https://WWW.Example.COM./from-activated');
  expectTrue('tabActivated should include normalized domain', emitted[0]?.domain === 'www.example.com');

  section('SG1c: tabReplaced active tab emits re-evaluation signal');
  emitted.length = 0;
  hooks.getTab = async (tabId) => ({ id: tabId, windowId: 31, active: true, url: 'https://Replaced.Example.COM./next' });
  await hooks.onReplaced(404, 303);
  await new Promise((r) => setTimeout(r, 100));

  expectTrue('tabReplaced should emit one active signal', emitted.length === 1);
  expectTrue('tabReplaced should use added tab id', emitted[0]?.tabId === 404);
  expectTrue('tabReplaced should preserve removed tab id', emitted[0]?.replacedTabId === 303);
  expectTrue('tabReplaced should include reason', emitted[0]?._reason === 'tabReplaced');
  expectTrue('tabReplaced should include normalized domain', emitted[0]?.domain === 'replaced.example.com');

  section('SG1d: tabReplaced inactive tab is ignored');
  emitted.length = 0;
  hooks.getTab = async (tabId) => ({ id: tabId, windowId: 31, active: false, url: 'https://Inactive.Example.COM./next' });
  await hooks.onReplaced(405, 404);
  await new Promise((r) => setTimeout(r, 100));
  expectTrue('inactive tabReplaced should not emit foreground signal', emitted.length === 0);

  section('SG2: focused window signal includes active tab and domain');
  emitted.length = 0;
  await hooks.onFocusChanged(20);
  await new Promise((r) => setTimeout(r, 100));

  const focusedSignal = emitted[0];
  expectTrue('focused signal should be emitted', !!focusedSignal);
  expectTrue('focused signal should include isFocused=true', focusedSignal?.isFocused === true);
  expectTrue('focused signal should include windowId', focusedSignal?.windowId === 20);
  expectTrue('focused signal should include tabId', focusedSignal?.tabId === 202);
  expectTrue('focused signal should include url', focusedSignal?.url === 'https://Focus.Example.COM./active');
  expectTrue('focused signal should include normalized domain', focusedSignal?.domain === 'focus.example.com');

  const context = buildContext(null, { ...focusedSignal, isIdle: false });
  expectTrue('buildContext should preserve focused tabId', context.tabId === 202);
  expectTrue('buildContext should preserve focused domain', context.domain === 'focus.example.com');
  expectTrue('buildContext should preserve isFocused=true', context.isFocused === true);
  expectTrue('resolveState should return ACTIVE for focused non-idle tab', resolveState(context) === AttentionState.ACTIVE);

  section('SG3: WINDOW_ID_NONE keeps unfocused behavior');
  emitted.length = 0;
  await hooks.onFocusChanged(-1);
  await new Promise((r) => setTimeout(r, 100));

  expectTrue('focus lost signal should be emitted', emitted.length === 1);
  expectTrue('focus lost signal should set isFocused=false', emitted[0]?.isFocused === false);
  expectTrue('focus lost signal reason should remain windowFocusLost', emitted[0]?._reason === 'windowFocusLost');

  section('SG4: active tab query failure emits minimal focused signal');
  emitted.length = 0;
  hooks.queryTabs = async () => { throw new Error('query failed'); };
  await hooks.onFocusChanged(21);
  await new Promise((r) => setTimeout(r, 100));

  expectTrue('query failure still emits signal', emitted.length === 1);
  expectTrue('query failure signal keeps focus=true', emitted[0]?.isFocused === true);
  expectTrue('query failure signal keeps windowId', emitted[0]?.windowId === 21);
  expectTrue('query failure signal includes error info', emitted[0]?.error === 'query failed');

  section('SG5: focus polling is not a foreground boundary source');
  emitted.length = 0;
  hooks.getAllWindows = async () => [{ id: 20, focused: false, type: 'normal' }];
  await new Promise((r) => setTimeout(r, 1100));

  expectTrue('focus poll should not emit foreground signal', emitted.length === 0);

  section('SG6: idle state signal preserves raw active/idle/locked value');
  emitted.length = 0;
  hooks.onStateChanged('locked');
  await new Promise((r) => setTimeout(r, 100));
  expectTrue('locked idle signal should be emitted', emitted.length === 1);
  expectTrue('locked idle signal should preserve idleState=locked', emitted[0]?.idleState === 'locked');
  expectTrue('locked idle signal should mark isIdle=true', emitted[0]?.isIdle === true);

  emitted.length = 0;
  hooks.onStateChanged('active');
  await new Promise((r) => setTimeout(r, 100));
  expectTrue('active idle signal should preserve idleState=active', emitted[0]?.idleState === 'active');
  expectTrue('active idle signal should mark isIdle=false', emitted[0]?.isIdle === false);

  section('SG6b: webNavigation committed main frame supplies active tab URL fact');
  emitted.length = 0;
  hooks.getTab = async (tabId) => ({ id: tabId, windowId: 80, active: true, url: 'https://TabFallback.Example/path' });
  await hooks.onCommitted({ frameId: 0, tabId: 808, url: 'https://Committed.Example/path' });
  await new Promise((r) => setTimeout(r, 100));
  expectTrue('main-frame committed should emit one foreground fact', emitted.length === 1);
  expectTrue('committed signal should use committed URL', emitted[0]?.url === 'https://Committed.Example/path');
  expectTrue('committed signal should normalize committed domain', emitted[0]?.domain === 'committed.example');
  expectTrue('committed signal should include reason', emitted[0]?._reason === 'webNavigationCommitted');

  section('SG6c: webNavigation committed subframe is ignored');
  emitted.length = 0;
  await hooks.onCommitted({ frameId: 1, tabId: 809, url: 'https://Subframe.Example/path' });
  await new Promise((r) => setTimeout(r, 100));
  expectTrue('subframe committed should not emit foreground fact', emitted.length === 0);

  section('SG6d: webNavigation committed inactive tab is ignored');
  emitted.length = 0;
  hooks.getTab = async (tabId) => ({ id: tabId, windowId: 80, active: false, url: 'https://InactiveCommitted.Example/path' });
  await hooks.onCommitted({ frameId: 0, tabId: 810, url: 'https://InactiveCommitted.Example/path' });
  await new Promise((r) => setTimeout(r, 100));
  expectTrue('inactive committed tab should not emit foreground fact', emitted.length === 0);

  section('SG7: content MEDIA_STATE carries media fact source and window snapshot');
  emitted.length = 0;
  await hooks.onMessage(
    { type: 'MEDIA_STATE', playing: true, isPiP: false, mediaKind: 'video', audible: false, visibleMediaCount: 1, source: 'dom_media_event' },
    { frameId: 12, documentId: 'doc-501', tab: { id: 501, windowId: 50, active: true, url: 'https://Video.Example/watch', mutedInfo: { muted: false } } }
  );
  await new Promise((r) => setTimeout(r, 100));
  expectTrue('MEDIA_STATE should emit media source tab id', emitted[0]?.mediaSourceTabId === 501);
  expectTrue('MEDIA_STATE should preserve media kind', emitted[0]?.mediaKind === 'video');
  expectTrue('MEDIA_STATE playing should not imply audible', emitted[0]?.isAudible === false);
  expectTrue('MEDIA_STATE should carry visible media count', emitted[0]?.visibleMediaCount === 1);
  expectTrue('MEDIA_STATE should carry source label', emitted[0]?.mediaFactSource === 'dom_media_event');
  expectTrue('MEDIA_STATE should carry active tab fact', emitted[0]?.isActiveTab === true);
  expectTrue('MEDIA_STATE should be marked as strong content evidence', emitted[0]?.evidenceTier === 'content');
  expectTrue('MEDIA_STATE should carry live window focus', emitted[0]?.isWindowFocused === true);
  expectTrue('MEDIA_STATE should carry frame id', emitted[0]?.mediaFrameId === 12);
  expectTrue('MEDIA_STATE should carry document id', emitted[0]?.mediaDocumentId === 'doc-501');
  expectTrue('MEDIA_STATE should use sender tab URL when frame URL is absent', emitted[0]?.mediaSourceDomain === 'video.example');

  section('SG7b: content MEDIA_STATE uses frame URL for embedded media attribution');
  emitted.length = 0;
  await hooks.onMessage(
    { type: 'MEDIA_STATE', playing: true, isPiP: false, mediaKind: 'video', audible: false, visibleMediaCount: 1, source: 'dom_media_event' },
    {
      frameId: 7,
      documentId: 'youtube-frame',
      url: 'https://www.youtube.com/embed/abc123',
      tab: { id: 502, windowId: 50, active: true, url: 'https://forms.office.com/r/form', mutedInfo: { muted: false } },
    }
  );
  await new Promise((r) => setTimeout(r, 100));
  expectTrue('embedded media should use sender frame URL domain', emitted[0]?.mediaSourceDomain === 'www.youtube.com');
  expectTrue('embedded media should not expose a foreground domain in signal layer', emitted[0]?.domain == null);

  section('SG8: tabs.onUpdated audible emits native media fact for inactive tabs');
  emitted.length = 0;
  await hooks.onUpdated(606, { audible: true }, {
    id: 606,
    active: false,
    windowId: 60,
    audible: true,
    mutedInfo: { muted: false },
    url: 'https://Audio.Example/listen',
  });
  await new Promise((r) => setTimeout(r, 100));
  expectTrue('tabAudible should emit media fact', emitted.length === 1);
  expectTrue('tabAudible should use tab id as media source', emitted[0]?.mediaSourceTabId === 606);
  expectTrue('tabAudible should use tab-level media frame id', emitted[0]?.mediaFrameId === 'tab');
  expectTrue('tabAudible should normalize source domain', emitted[0]?.mediaSourceDomain === 'audio.example');
  expectTrue('tabAudible should mark source', emitted[0]?.mediaFactSource === 'tabs_api_audible');
  expectTrue('tabAudible should be marked as weak evidence', emitted[0]?.evidenceTier === 'audible_fallback');

  section('SG8b: active tab audible does not emit foreground tabUpdated');
  emitted.length = 0;
  await hooks.onUpdated(607, { audible: true }, {
    id: 607,
    active: true,
    windowId: 60,
    audible: true,
    mutedInfo: { muted: false },
    url: 'https://ActiveAudio.Example/listen',
  });
  await new Promise((r) => setTimeout(r, 100));
  expectTrue('active tabAudible should emit exactly one media fact', emitted.length === 1);
  expectTrue('active tabAudible should not emit foreground domain', emitted[0]?.domain == null);
  expectTrue('active tabAudible should keep media reason', emitted[0]?._reason === 'tabAudible');

  section('SG8c: navigation and audible facts stay separate when batched');
  emitted.length = 0;
  await hooks.onUpdated(608, { url: 'https://NavAudio.Example/next', audible: true }, {
    id: 608,
    active: true,
    windowId: 60,
    audible: true,
    mutedInfo: { muted: false },
    url: 'https://NavAudio.Example/next',
  });
  await new Promise((r) => setTimeout(r, 100));
  expectTrue('nav+audible should emit foreground and media records', emitted.length === 2);
  expectTrue('nav+audible should include tabUpdated foreground event', emitted.some(e => e._reason === 'tabUpdated' && e.domain === 'navaudio.example'));
  expectTrue('nav+audible should include separate tabAudible media event', emitted.some(e => e._reason === 'tabAudible' && e.mediaSourceDomain === 'navaudio.example' && e.domain == null));

  section('SG9: merged content video and tab audible keeps video precedence');
  emitted.length = 0;
  await hooks.onMessage(
    { type: 'MEDIA_STATE', playing: true, isPiP: false, mediaKind: 'video', audible: false, visibleMediaCount: 1, source: 'dom_media_event' },
    { frameId: 0, tab: { id: 707, windowId: 70, active: true, url: 'https://Mixed.Example/watch', mutedInfo: { muted: false } } }
  );
  await hooks.onUpdated(707, { audible: true }, {
    id: 707,
    active: true,
    windowId: 70,
    audible: true,
    mutedInfo: { muted: false },
    url: 'https://Mixed.Example/watch',
  });
  await new Promise((r) => setTimeout(r, 100));
  expectTrue('merged media fact should keep video precedence', emitted[0]?.mediaKind === 'video');

  section('SG10: internal content messages bypass the general message router');
  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'background.js'), 'utf8');
  const focusHandlerStart = backgroundSource.indexOf('chrome.windows.onFocusChanged.addListener');
  const focusHandlerEnd = backgroundSource.indexOf('chrome.windows.onBoundsChanged', focusHandlerStart);
  const focusHandler = backgroundSource.slice(focusHandlerStart, focusHandlerEnd);
  expectTrue('background reclassifies open media sessions before WINDOW_ID_NONE return', focusHandlerStart >= 0 && /handleMediaWindowFocusChanged\(windowId\)/.test(focusHandler) && focusHandler.indexOf('handleMediaWindowFocusChanged') < focusHandler.indexOf('WINDOW_ID_NONE'));
  const boundsHandlerStart = backgroundSource.indexOf('chrome.windows.onBoundsChanged');
  const boundsHandlerEnd = backgroundSource.indexOf('function isMonitoringEnabled', boundsHandlerStart);
  const boundsHandler = backgroundSource.slice(boundsHandlerStart, boundsHandlerEnd);
  const windowTimingStart = backgroundSource.indexOf('async function dispatchWindowStateTiming');
  const windowTimingEnd = backgroundSource.indexOf('async function reevaluateTabById', windowTimingStart);
  const windowTimingHelper = backgroundSource.slice(windowTimingStart, windowTimingEnd);
  expectTrue('focused window state transition sends minimized-aware foreground fact to timing dispatcher', boundsHandlerStart >= 0 && /currentWindow\?\.focused === true/.test(boundsHandler) && /dispatchWindowStateTiming\(win\.id/.test(boundsHandler) && windowTimingStart >= 0 && /currentWindow\?\.state !== 'minimized'/.test(windowTimingHelper) && /dispatchTimingSignal\(/.test(windowTimingHelper));
  expectTrue('restored focused window also re-evaluates access policy', /currentWindow\?\.focused === true/.test(boundsHandler) && /currentWindow\?\.state !== 'minimized'/.test(boundsHandler) && /previousState !== win\.state/.test(boundsHandler) && /reevaluateFocusedWindowActiveTab\(win\.id\)/.test(boundsHandler));
  const internalBranch = backgroundSource.indexOf("msg.type === 'MEDIA_STATE' || msg.type === 'TITLE_CHANGE'");
  const generalRouter = backgroundSource.indexOf("ensureBootstrapped('runtimeMessage')");
  expectTrue('background should explicitly acknowledge internal content messages', internalBranch >= 0 && backgroundSource.includes("handledBy: msg.type === 'MEDIA_STATE' ? 'signal' : 'content_metadata'"));
  expectTrue('internal content message branch should run before general router', internalBranch >= 0 && generalRouter > internalBranch);

  const total = passed + failed;
  console.log(`\n[Signal ExtractDomain Guard] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

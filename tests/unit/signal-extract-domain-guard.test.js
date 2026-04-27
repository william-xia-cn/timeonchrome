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
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'domain-semantics.js'), 'utf8');
  const transformed = code.replace(/export\s+function\s+/g, 'function ') + '\nthis.__d = { normalizeHostname };';
  const context = { console, URL, this: null };
  context.this = context;
  vm.runInNewContext(transformed, context, { filename: 'domain-semantics.js' });
  return context.__d.normalizeHostname;
}

function loadSignalInit(deps, hooks) {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'signal.js'), 'utf8');
  const transformed = code
    .replace(/import\s+\{\s*normalizeHostname\s*\}\s+from\s+'\.\/domain-semantics\.js';/, 'const normalizeHostname = __deps.normalizeHostname;')
    .replace(/export\s+function\s+/g, 'function ')
    + '\nthis.__signalExports = { initSignal };';

  const chrome = {
    tabs: {
      onActivated: { addListener(fn) { hooks.onActivated = fn; } },
      onUpdated: { addListener(fn) { hooks.onUpdated = fn; } },
      onRemoved: { addListener(fn) { hooks.onRemoved = fn; } },
      get: async () => ({ id: 303, windowId: 30, url: 'https://WWW.Example.COM./from-activated', active: true }),
      query: async (queryInfo) => hooks.queryTabs(queryInfo),
    },
    windows: {
      onFocusChanged: { addListener(fn) { hooks.onFocusChanged = fn; } },
      WINDOW_ID_NONE: -1,
      get: async (windowId) => hooks.getWindow(windowId),
      getAll: async () => hooks.getAllWindows(),
    },
    idle: { onStateChanged: { addListener(fn) { hooks.onStateChanged = fn; } } },
    runtime: { onMessage: { addListener(fn) { hooks.onMessage = fn; } } },
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
  const abs = path.join(__dirname, '..', '..', relPath);
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
  const normalizeHostname = loadNormalizeHostname();
  const hooks = {
    queryTabs: async () => [{ id: 202, windowId: 20, active: true, url: 'https://Focus.Example.COM./active' }],
    getWindow: async () => ({ focused: true }),
    getAllWindows: async () => [{ id: 20, focused: true, type: 'normal' }],
  };
  const emitted = [];
  const { buildContext } = loadProdModule('core/context.js', ['buildContext']);
  const { resolveState, AttentionState } = loadProdModule('core/state.js', ['resolveState', 'AttentionState']);

  const signal = loadSignalInit({ normalizeHostname }, hooks);
  signal.initSignal((e) => emitted.push(e));

  section('SG1: minimal integration guard for onUpdated event domain extraction');
  hooks.onUpdated(101, { url: 'https://WWW.Example.COM./path' }, { active: true, windowId: 10, url: 'https://WWW.Example.COM./path' });
  await new Promise((r) => setTimeout(r, 100));

  expectTrue('应发出至少一个合并事件', emitted.length > 0);
  expectTrue('onUpdated 提取结果应保留 www 且标准化', emitted.some(e => e.domain === 'www.example.com' && e.tabId === 101));
  expectTrue('onUpdated should include window focus snapshot', emitted.some(e => e.domain === 'www.example.com' && e.isFocused === true && e.windowId === 10));
  expectTrue('onUpdated should clear stale media state for the navigating tab', emitted.some(e => e.tabId === 101 && e.isAudible === false && e.mediaSourceTabId === 101));

  section('SG1b: tabActivated signal includes current window focus snapshot');
  emitted.length = 0;
  await hooks.onActivated({ tabId: 303, windowId: 30 });
  await new Promise((r) => setTimeout(r, 100));

  expectTrue('tabActivated should emit focused signal', emitted.length === 1);
  expectTrue('tabActivated should include isFocused=true', emitted[0]?.isFocused === true);
  expectTrue('tabActivated should include tab URL', emitted[0]?.url === 'https://WWW.Example.COM./from-activated');
  expectTrue('tabActivated should include normalized domain', emitted[0]?.domain === 'www.example.com');

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

  section('SG5: focus polling emits focus lost when Chrome window is unfocused');
  emitted.length = 0;
  hooks.getAllWindows = async () => [{ id: 20, focused: false, type: 'normal' }];
  await new Promise((r) => setTimeout(r, 1100));

  expectTrue('focus poll should emit signal', emitted.length >= 1);
  expectTrue('focus poll should set isFocused=false', emitted.some(e => e.isFocused === false));
  expectTrue('focus poll reason should be windowFocusPolled', emitted.some(e => e._reason === 'windowFocusPolled'));

  const total = passed + failed;
  console.log(`\n[Signal ExtractDomain Guard] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

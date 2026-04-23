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
      get: async () => ({ url: 'https://WWW.Example.COM./from-activated', active: true }),
    },
    windows: { onFocusChanged: { addListener(fn) { hooks.onFocusChanged = fn; } }, WINDOW_ID_NONE: -1 },
    idle: { onStateChanged: { addListener(fn) { hooks.onStateChanged = fn; } } },
    runtime: { onMessage: { addListener(fn) { hooks.onMessage = fn; } } },
  };

  const context = {
    console,
    URL,
    setTimeout,
    clearTimeout,
    chrome,
    __deps: deps,
    this: null,
  };
  context.this = context;
  vm.runInNewContext(transformed, context, { filename: 'signal.js' });
  return context.__signalExports;
}

async function run() {
  const normalizeHostname = loadNormalizeHostname();
  const hooks = {};
  const emitted = [];

  const signal = loadSignalInit({ normalizeHostname }, hooks);
  signal.initSignal((e) => emitted.push(e));

  section('SG1: minimal integration guard for onUpdated event domain extraction');
  hooks.onUpdated(101, {}, { active: true, url: 'https://WWW.Example.COM./path' });
  await new Promise((r) => setTimeout(r, 100));

  expectTrue('应发出至少一个合并事件', emitted.length > 0);
  expectTrue('onUpdated 提取结果应保留 www 且标准化', emitted.some(e => e.domain === 'www.example.com' && e.tabId === 101));

  const total = passed + failed;
  console.log(`\n[Signal ExtractDomain Guard] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

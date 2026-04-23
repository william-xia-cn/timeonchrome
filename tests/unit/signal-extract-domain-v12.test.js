// signal-extract-domain-v12.test.js
// Run with: node tests/unit/signal-extract-domain-v12.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function expectEqual(desc, actual, expected) {
  if (actual === expected) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc} (actual=${String(actual)}, expected=${String(expected)})`);
  }
}

function section(name) { console.log(`\n[${name}]`); }

function loadSignalExtractDomain(deps) {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'signal.js'), 'utf8');
  const transformed = code
    .replace(/import\s+\{\s*normalizeHostname\s*\}\s+from\s+'\.\/domain-semantics\.js';/, 'const normalizeHostname = __deps.normalizeHostname;')
    .replace(/export\s+function\s+/g, 'function ')
    + '\nthis.__signalExports = { extractDomain };';

  const context = {
    console,
    URL,
    setTimeout,
    clearTimeout,
    chrome: {
      tabs: { onActivated: { addListener() {} }, onUpdated: { addListener() {} }, onRemoved: { addListener() {} }, get: async () => ({}) },
      windows: { onFocusChanged: { addListener() {} }, WINDOW_ID_NONE: -1 },
      idle: { onStateChanged: { addListener() {} } },
      runtime: { onMessage: { addListener() {} } },
    },
    __deps: deps,
    this: null,
  };
  context.this = context;
  vm.runInNewContext(transformed, context, { filename: 'signal.js' });
  return context.__signalExports;
}

function loadNormalizeHostname() {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'domain-semantics.js'), 'utf8');
  const transformed = code.replace(/export\s+function\s+/g, 'function ') + '\nthis.__d = { normalizeHostname };';
  const context = { console, URL, this: null };
  context.this = context;
  vm.runInNewContext(transformed, context, { filename: 'domain-semantics.js' });
  return context.__d.normalizeHostname;
}

function run() {
  const normalizeHostname = loadNormalizeHostname();
  const signal = loadSignalExtractDomain({ normalizeHostname });

  section('SE1: direct extractDomain should follow v1.2 normalization layering');
  expectEqual('组合断言: 保留www + lowercase + trailing dot', signal.extractDomain('https://WWW.Example.COM./x'), 'www.example.com');
  expectEqual('chrome:// should be filtered', signal.extractDomain('chrome://settings'), null);
  expectEqual('invalid url returns null', signal.extractDomain('not-a-url'), null);

  const total = passed + failed;
  console.log(`\n[Signal ExtractDomain v1.2] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

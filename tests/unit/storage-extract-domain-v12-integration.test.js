// storage-extract-domain-v12-integration.test.js
// Run with: node tests/unit/storage-extract-domain-v12-integration.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function expectEqual(desc, actual, expected) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${desc} (actual=${String(actual)}, expected=${String(expected)})`);
  }
}

function section(name) {
  console.log(`\n[${name}]`);
}

function loadDomainSemantics() {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'domain-semantics.js'), 'utf8');
  const wrapped = code
    .replace(/export\s+function\s+/g, 'function ')
    + '\nthis.__domainSemantics = { normalizeHostname, matchDomain };';
  const context = { console, URL, this: null };
  context.this = context;
  vm.runInNewContext(wrapped, context, { filename: 'domain-semantics.js' });
  return context.__domainSemantics;
}

function loadStorageExtractDomain(deps) {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'infra', 'storage.js'), 'utf8');
  const transformed = code
    .replace(/import\s+\{[^}]*\}\s+from\s+'\.\.\/core\/aggregate\.js';/, 'const computeAllDomains = __deps.computeAllDomains; const computeAllDomainsWithAudio = __deps.computeAllDomainsWithAudio;')
    .replace(/import\s+\{\s*matchDomain\s+as\s+matchDomainV12,\s*normalizeHostname\s*\}\s+from\s+'\.\.\/core\/domain-semantics\.js';/, 'const matchDomainV12 = __deps.matchDomainV12; const normalizeHostname = __deps.normalizeHostname;')
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s+const\s+/g, 'const ')
    .replace(/export\s+async\s+function\s+/g, 'async function ')
    .replace(/export\s+\{[^}]+\};?/g, '')
    + '\nthis.__storageExports = { extractDomain };';

  const context = {
    console,
    URL,
    TextEncoder,
    crypto: { subtle: { digest: async () => new Uint8Array([0]).buffer } },
    chrome: { storage: { local: { get: async () => ({}), set: async () => ({}) } } },
    __deps: deps,
    this: null,
  };
  context.this = context;
  vm.runInNewContext(transformed, context, { filename: 'storage.js' });
  return context.__storageExports;
}

function run() {
  const domainSemantics = loadDomainSemantics();
  const storage = loadStorageExtractDomain({
    computeAllDomains: () => ({}),
    computeAllDomainsWithAudio: () => ({ domains: {}, audioSeconds: 0 }),
    matchDomainV12: domainSemantics.matchDomain,
    normalizeHostname: domainSemantics.normalizeHostname,
  });

  section('SED-1 storage.extractDomain should delegate hostname normalization to v1.2 normalizeHostname');
  expectEqual('组合断言: 保留www + lowercase + trailing dot', storage.extractDomain('https://WWW.Example.COM./x'), 'www.example.com');
  expectEqual('special page should be filtered', storage.extractDomain('chrome://settings'), null);
  expectEqual('invalid url should return null', storage.extractDomain('not-a-url'), null);

  const total = passed + failed;
  console.log(`\n[Storage ExtractDomain v1.2 Integration] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

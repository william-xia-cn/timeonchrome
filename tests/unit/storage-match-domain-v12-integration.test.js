// storage-match-domain-v12-integration.test.js
// Run with: node tests/unit/storage-match-domain-v12-integration.test.js

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

function loadStorageMatchDomain(deps) {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'infra', 'storage.js'), 'utf8');
  const transformed = code
    .replace(/import\s+\{[^}]*\}\s+from\s+'\.\.\/core\/aggregate\.js';/, 'const computeAllDomains = __deps.computeAllDomains; const computeAllDomainsWithAudio = __deps.computeAllDomainsWithAudio;')
    .replace(/import\s+\{\s*matchDomain\s+as\s+matchDomainV12,\s*normalizeHostname\s*\}\s+from\s+'\.\.\/core\/domain-semantics\.js';/, 'const matchDomainV12 = __deps.matchDomainV12; const normalizeHostname = __deps.normalizeHostname;')
    .replace(/import\s+\{[^}]*\}\s+from\s+'\.\.\/core\/timing-trace\.js';/, 'const emitTrace = async () => {};')
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s+const\s+/g, 'const ')
    .replace(/export\s+async\s+function\s+/g, 'async function ')
    .replace(/export\s+\{[^}]+\};?/g, '')
    + '\nthis.__storageExports = { matchDomain };';

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
  const storage = loadStorageMatchDomain({
    computeAllDomains: () => ({}),
    computeAllDomainsWithAudio: () => ({ domains: {}, audioSeconds: 0 }),
    matchDomainV12: domainSemantics.matchDomain,
    normalizeHostname: domainSemantics.normalizeHostname,
  });

  section('SMD-1 storage.matchDomain should follow V0 parent-domain subdomain rules via delegation');
  expectEqual('a.example.com vs example.com = true', storage.matchDomain('a.example.com', 'example.com'), true);
  expectEqual('a.example.com vs *.example.com = true', storage.matchDomain('a.example.com', '*.example.com'), true);
  expectEqual('example.com vs *.example.com = false', storage.matchDomain('example.com', '*.example.com'), false);
  expectEqual('www.example.com vs example.com = true', storage.matchDomain('www.example.com', 'example.com'), true);
  expectEqual('example.com vs www.example.com = true', storage.matchDomain('example.com', 'www.example.com'), true);

  const total = passed + failed;
  console.log(`\n[Storage MatchDomain v1.2 Integration] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

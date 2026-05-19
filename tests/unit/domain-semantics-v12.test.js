// domain-semantics-v12.test.js
// Run with: node tests/unit/domain-semantics-v12.test.js

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

async function run() {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'domain-semantics.js'), 'utf8');
  const wrapped = code
    .replace(/export\s+function\s+/g, 'function ')
    + '\nthis.__domainSemantics = { normalizeHostname, domainForUrl, matchDomain };';
  const context = { console, URL, this: null };
  context.this = context;
  vm.runInNewContext(wrapped, context, { filename: 'domain-semantics.js' });
  const { normalizeHostname, domainForUrl, matchDomain } = context.__domainSemantics;

  section('N1 normalizeHostname: lowercase / trailing dot / punycode / invalid tolerance');
  expectEqual('lowercase', normalizeHostname('EXAMPLE.COM'), 'example.com');
  expectEqual('trim trailing dot', normalizeHostname('example.com.'), 'example.com');
  expectEqual('keep www (must not strip)', normalizeHostname('WWW.Example.COM'), 'www.example.com');
  expectEqual('idn -> punycode', normalizeHostname('BÜCHER.DE'), 'xn--bcher-kva.de');
  expectEqual('invalid input returns null', normalizeHostname(''), null);

  section('M1 matchDomain: V0 parent-domain covers subdomains');
  expectEqual('exact match', matchDomain('example.com', 'example.com'), true);
  expectEqual('parent covers child subdomain', matchDomain('a.example.com', 'example.com'), true);
  expectEqual('wildcard matches subdomain', matchDomain('a.example.com', '*.example.com'), true);
  expectEqual('wildcard does not include bare domain', matchDomain('example.com', '*.example.com'), false);
  expectEqual('www symmetric alias (www -> bare)', matchDomain('www.example.com', 'example.com'), true);
  expectEqual('www symmetric alias (bare -> www)', matchDomain('example.com', 'www.example.com'), true);
  expectEqual('non-www prefix subdomain is also covered by parent', matchDomain('xwww.example.com', 'example.com'), true);
  expectEqual('boundary safety (suffix false positive)', matchDomain('notexample.com', 'example.com'), false);
  expectEqual('boundary safety (evil subdomain)', matchDomain('example.com.evil.com', 'example.com'), false);

  section('C1 layering contract: www alias belongs to match layer, not normalization');
  expectEqual(
    'normalized forms differ for www and bare domain',
    normalizeHostname('www.example.com') === normalizeHostname('example.com'),
    false
  );
  expectEqual('match still recognizes www symmetric alias', matchDomain('www.example.com', 'example.com'), true);

  section('U1 domainForUrl: special Chrome foreground pages map to safe pseudo domains');
  expectEqual('chrome-extension pseudo domain', domainForUrl('chrome-extension://abc/admin.html'), 'extension-page.chrome-local');
  expectEqual('file pseudo domain', domainForUrl('file:///C:/tmp/a.html'), 'local-file.chrome-local');
  expectEqual('chrome extensions pseudo domain', domainForUrl('chrome://extensions'), 'chrome-extensions.chrome-local');
  expectEqual('chrome settings pseudo domain', domainForUrl('chrome://settings'), 'chrome-settings.chrome-local');
  expectEqual('about pseudo domain', domainForUrl('about:blank'), 'about-page.chrome-local');
  expectEqual('data pseudo domain', domainForUrl('data:text/html,<p>x</p>'), 'embedded-page.chrome-local');
  expectEqual('invalid url still null', domainForUrl('not-a-url'), null);

  const total = passed + failed;
  console.log(`\n[Domain Semantics v1.2] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

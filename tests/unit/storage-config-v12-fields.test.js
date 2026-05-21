// storage-config-v12-fields.test.js
// Run with: node tests/unit/storage-config-v12-fields.test.js

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function expectTrue(desc, cond) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
  }
}

function run() {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'storage.js'), 'utf8');

  expectTrue('DEFAULT_CONFIG 应保留 studyList', /studyList\s*:\s*\[/.test(source));
  expectTrue('DEFAULT_CONFIG 应保留 compositeList', /compositeList\s*:\s*\[/.test(source));
  expectTrue('DEFAULT_CONFIG 应保留 unsafeList', /unsafeList\s*:\s*\[/.test(source));

  expectTrue('DEFAULT_CONFIG 不应再包含 whitelist', !/\bwhitelist\s*:/.test(source));
  expectTrue('DEFAULT_CONFIG 不应再包含 blacklist', !/\bblacklist\s*:/.test(source));

  const total = passed + failed;
  console.log(`\n[Storage Config v1.2 Fields] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

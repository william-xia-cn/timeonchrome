// borrow-concurrency.test.js
// V1-minimal: borrowing runtime is disabled.
// Run with: node tests/unit/borrow-concurrency.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function expect(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

function section(name) {
  console.log(`\n[${name}]`);
}

function loadBorrowRestQuota(stubs) {
  const abs = path.join(__dirname, '..', '..', 'extension', 'product', 'quota.js');
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');
  const context = { ...stubs, Date, Math };
  vm.createContext(context);
  vm.runInContext(`${code}\nthis.__borrowRestQuota = borrowRestQuota;`, context, { filename: 'quota.js' });
  return { borrowRestQuota: context.__borrowRestQuota };
}

async function run() {
  section('B05-1 单次调用返回禁用响应');
  {
    const { borrowRestQuota } = loadBorrowRestQuota({});
    const r = await borrowRestQuota(async () => {});
    expect('统一禁用结构', r, { ok: false, error: 'TIME_BORROWING_DISABLED_FOR_V1_MINIMAL' });
  }

  section('B05-2 并发调用均返回禁用响应');
  {
    const { borrowRestQuota } = loadBorrowRestQuota({});
    const [r1, r2] = await Promise.all([
      borrowRestQuota(async () => {}),
      borrowRestQuota(async () => {}),
    ]);
    expect('并发调用 #1', r1, { ok: false, error: 'TIME_BORROWING_DISABLED_FOR_V1_MINIMAL' });
    expect('并发调用 #2', r2, { ok: false, error: 'TIME_BORROWING_DISABLED_FOR_V1_MINIMAL' });
  }

  const total = passed + failed;
  console.log(`\n[Borrow Disabled] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

// message-router-borrow-source.test.js
// Run with: node tests/unit/message-router-borrow-source.test.js

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

function expectTrue(desc, cond) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
  }
}

function section(name) {
  console.log(`\n[${name}]`);
}

function loadHandleMessage(stubs) {
  const abs = path.join(__dirname, '..', '..', 'message-router.js');
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');

  const context = {
    ...stubs,
    URL,
    chrome: {
      runtime: {
        id: 'ext-id',
        getURL: (p = '/') => `chrome-extension://ext-id${p}`,
      },
      storage: { local: { set: async () => {} } },
    },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    btoa: (s) => Buffer.from(String(s), 'utf8').toString('base64'),
    console,
  };

  vm.createContext(context);
  vm.runInContext(`${code}\nthis.__handleMessage = handleMessage;`, context, { filename: 'message-router.js' });
  return { handleMessage: context.__handleMessage };
}

async function run() {
  const { handleMessage } = loadHandleMessage({
    updateDeclarativeRules: async () => {},
  });

  section('B03-1 popup 调用 borrow 返回 V1-minimal 禁用响应');
  {
    const sender = { id: 'ext-id', url: 'chrome-extension://ext-id/popup/popup.html' };
    const r = await handleMessage({ type: 'BORROW_REST_QUOTA' }, sender);
    expect('返回统一禁用结构', r, { ok: false, error: 'TIME_BORROWING_DISABLED_FOR_V1_MINIMAL' });
  }

  section('B03-2 reminder 调用 borrow 也返回禁用响应');
  {
    const sender = { id: 'ext-id', url: 'chrome-extension://ext-id/reminder.html' };
    const r = await handleMessage({ type: 'BORROW_REST_QUOTA' }, sender);
    expect('返回统一禁用结构', r, { ok: false, error: 'TIME_BORROWING_DISABLED_FOR_V1_MINIMAL' });
  }

  section('B03-3 非白名单扩展页调用 borrow 仍返回禁用响应');
  {
    const sender = { id: 'ext-id', url: 'chrome-extension://ext-id/admin/admin.html' };
    const r = await handleMessage({ type: 'BORROW_REST_QUOTA' }, sender);
    expect('返回统一禁用结构', r, { ok: false, error: 'TIME_BORROWING_DISABLED_FOR_V1_MINIMAL' });
  }

  section('B03-4 非扩展 origin 调用 borrow 返回禁用响应');
  {
    const sender = { id: 'ext-id', tab: { id: 1 }, url: 'https://example.com/page' };
    const r = await handleMessage({ type: 'BORROW_REST_QUOTA' }, sender);
    expect('返回统一禁用结构', r, { ok: false, error: 'TIME_BORROWING_DISABLED_FOR_V1_MINIMAL' });
  }

  const total = passed + failed;
  console.log(`\n[Message Router Borrow Source] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

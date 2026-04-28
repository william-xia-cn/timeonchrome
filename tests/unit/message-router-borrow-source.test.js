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
  let borrowCalls = 0;
  const { handleMessage } = loadHandleMessage({
    borrowRestQuota: async () => { borrowCalls++; return { ok: true, amount: 30 }; },
    updateDeclarativeRules: async () => {},
  });

  section('B03-1 popup 不再允许触发 borrow（P0 仅 reminder 保留借用）');
  {
    borrowCalls = 0;
    const sender = { id: 'ext-id', url: 'chrome-extension://ext-id/popup/popup.html' };
    const r = await handleMessage({ type: 'BORROW_REST_QUOTA' }, sender);
    expect('返回统一拒绝结构', r, { ok: false, error: 'unauthorized_borrow_source', code: 'BORROW_SOURCE_DENIED' });
    expectTrue('borrowRestQuota 不应被调用', borrowCalls === 0);
  }

  section('B03-2 reminder 合法来源允许触发 borrow');
  {
    borrowCalls = 0;
    const sender = { id: 'ext-id', url: 'chrome-extension://ext-id/reminder.html' };
    const r = await handleMessage({ type: 'BORROW_REST_QUOTA' }, sender);
    expect('返回 borrow 成功', r, { ok: true, amount: 30 });
    expectTrue('borrowRestQuota 被调用 1 次', borrowCalls === 1);
  }

  section('B03-3 看似扩展消息但非白名单页面应拒绝');
  {
    borrowCalls = 0;
    const sender = { id: 'ext-id', url: 'chrome-extension://ext-id/admin/admin.html' };
    const r = await handleMessage({ type: 'BORROW_REST_QUOTA' }, sender);
    expect('返回统一拒绝结构', r, { ok: false, error: 'unauthorized_borrow_source', code: 'BORROW_SOURCE_DENIED' });
    expectTrue('borrowRestQuota 不应被调用', borrowCalls === 0);
  }

  section('B03-4 content script 形态 sender.tab 存在但 origin 非法应拒绝');
  {
    borrowCalls = 0;
    const sender = { id: 'ext-id', tab: { id: 1 }, url: 'https://example.com/page' };
    const r = await handleMessage({ type: 'BORROW_REST_QUOTA' }, sender);
    expect('返回统一拒绝结构', r, { ok: false, error: 'unauthorized_borrow_source', code: 'BORROW_SOURCE_DENIED' });
    expectTrue('borrowRestQuota 不应被调用', borrowCalls === 0);
  }

  const total = passed + failed;
  console.log(`\n[Message Router Borrow Source] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

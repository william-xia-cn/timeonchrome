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
  const storageSource = fs.readFileSync(path.join(__dirname, '..', '..', 'infra', 'storage.js'), 'utf8');
  const routerSource = fs.readFileSync(path.join(__dirname, '..', '..', 'message-router.js'), 'utf8');
  const compositeCalls = [];
  const temporaryCompositeRecords = [
    { tabId: 7, domain: 'old.example.com', createdAt: 1000 },
    { tabId: 8, domain: 'new.example.com', createdAt: 2000 },
  ];
  const { handleMessage } = loadHandleMessage({
    updateDeclarativeRules: async () => {},
    getConfig: async () => ({
      mode: 'study',
      compositeList: [],
      restrictedEntertainmentList: [],
      unsafeList: [],
      studyList: [],
      quotaState: {},
    }),
    hasTemporaryCompositePermission: async () => false,
    getTemporaryCompositePermissionRecords: async () => temporaryCompositeRecords,
    addTemporaryCompositeDomain: async (tabId, domain) => {
      compositeCalls.push({ tabId, domain });
      return { added: true };
    },
  });

  section('C00 静态接口检查');
  {
    expectTrue('storage 暴露临时综合记录只读方法', storageSource.includes('export async function getTemporaryCompositePermissionRecords'));
    expectTrue('router 支持 GET_TEMPORARY_COMPOSITE_DOMAINS', routerSource.includes('GET_TEMPORARY_COMPOSITE_DOMAINS') && routerSource.includes('getTemporaryCompositePermissionRecords'));
  }

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

  section('C01-1 reminder 可用 sourceTabId 申请综合时间');
  {
    const sender = { id: 'ext-id', url: 'chrome-extension://ext-id/reminder.html' };
    const r = await handleMessage({ type: 'ADD_TO_COMPOSITE_LIST', domain: 'example.com', sourceTabId: 42 }, sender);
    expect('返回 added', r, { domain: 'example.com', added: true });
    expect('使用 sourceTabId', compositeCalls.at(-1), { tabId: 42, domain: 'example.com' });
  }

  section('C01-2 非 reminder 扩展页不能伪造 sourceTabId');
  {
    const sender = { id: 'ext-id', url: 'chrome-extension://ext-id/admin/admin.html' };
    const r = await handleMessage({ type: 'ADD_TO_COMPOSITE_LIST', domain: 'example.com', sourceTabId: 99 }, sender);
    expect('返回 invalid tab context', r.code, 'INVALID_TAB_CONTEXT');
  }

  section('C01-3 读取临时综合网站记录按申请时间倒序');
  {
    const sender = { id: 'ext-id', url: 'chrome-extension://ext-id/admin/admin.html' };
    const r = await handleMessage({ type: 'GET_TEMPORARY_COMPOSITE_DOMAINS' }, sender);
    expect('返回倒序 records', r, {
      ok: true,
      records: [
        { tabId: 8, domain: 'new.example.com', createdAt: 2000 },
        { tabId: 7, domain: 'old.example.com', createdAt: 1000 },
      ],
    });
  }

  const total = passed + failed;
  console.log(`\n[Message Router Borrow Source] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

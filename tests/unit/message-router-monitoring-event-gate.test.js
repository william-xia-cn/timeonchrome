// message-router-monitoring-event-gate.test.js
// Run with: node tests/unit/message-router-monitoring-event-gate.test.js

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

function loadHandleMessage(stubs, fetchImpl) {
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
    fetch: fetchImpl,
    btoa: (s) => Buffer.from(String(s), 'utf8').toString('base64'),
    console,
  };

  vm.createContext(context);
  vm.runInContext(`${code}\nthis.__handleMessage = handleMessage;`, context, { filename: 'message-router.js' });
  return { handleMessage: context.__handleMessage };
}

async function run() {
  section('MGE-1 monitoring_enabled=0 时应跳过上报并返回稳定结构');
  {
    let fetchCalls = 0;
    const { handleMessage } = loadHandleMessage(
      {
        getSyncState: () => ({ deviceToken: 'token-1', monitoringEnabled: 0 }),
        getCloudConfig: () => ({ API_BASE: 'https://api.example.test' }),
      },
      async () => { fetchCalls++; return { ok: true, json: async () => ({}) }; }
    );

    const r = await handleMessage({ type: 'SEND_CLOUD_EVENT', eventType: 'quota_hit', domain: 'a.com' }, {});
    expect('返回成功但跳过结构', r, { ok: true, skipped: 'monitoring_disabled' });
    expectTrue('不应触发 /device/events fetch', fetchCalls === 0);
  }

  section('MGE-2 monitoring_enabled=1 且有 token 时应保持上报');
  {
    let fetchCalls = 0;
    let calledUrl = '';
    const { handleMessage } = loadHandleMessage(
      {
        getSyncState: () => ({ deviceToken: 'token-2', monitoringEnabled: 1 }),
        getCloudConfig: () => ({ API_BASE: 'https://api.example.test' }),
      },
      async (url) => {
        fetchCalls++;
        calledUrl = url;
        return { ok: true, json: async () => ({}) };
      }
    );

    const r = await handleMessage({ type: 'SEND_CLOUD_EVENT', eventType: 'quota_hit', domain: 'b.com' }, {});
    expect('返回结构保持兼容', r, { ok: true });
    expectTrue('应触发一次 fetch', fetchCalls === 1);
    expectTrue('应请求 /device/events', calledUrl.endsWith('/device/events'));
  }

  section('MGE-3 monitoring_enabled=1 但无 token 时应保持静默成功');
  {
    let fetchCalls = 0;
    const { handleMessage } = loadHandleMessage(
      {
        getSyncState: () => ({ deviceToken: null, monitoringEnabled: 1 }),
        getCloudConfig: () => ({ API_BASE: 'https://api.example.test' }),
      },
      async () => { fetchCalls++; return { ok: true, json: async () => ({}) }; }
    );

    const r = await handleMessage({ type: 'SEND_CLOUD_EVENT', eventType: 'quota_hit', domain: 'c.com' }, {});
    expect('无 token 时返回结构保持稳定', r, { ok: true });
    expectTrue('无 token 时不应触发 fetch', fetchCalls === 0);
  }

  const total = passed + failed;
  console.log(`\n[Message Router Monitoring Event Gate] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

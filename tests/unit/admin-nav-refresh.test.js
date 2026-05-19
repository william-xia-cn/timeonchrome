// admin-nav-refresh.test.js
// Run with: node tests/unit/admin-nav-refresh.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function expectTrue(desc, condition) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
  }
}

function expectEqual(desc, actual, expected) {
  if (actual === expected) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc} (actual=${String(actual)}, expected=${String(expected)})`);
  }
}

function extractFunctionSource(code, functionName) {
  const markers = [`async function ${functionName}(`, `function ${functionName}(`];
  let start = -1;
  for (const marker of markers) {
    start = code.indexOf(marker);
    if (start >= 0) break;
  }
  if (start < 0) throw new Error(`function ${functionName} not found`);
  const braceStart = code.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return code.slice(start, i + 1);
    }
  }
  throw new Error(`function ${functionName} parse failed`);
}

function loadNavRefreshFns() {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'admin', 'admin.js'), 'utf8');
  const fns = [
    extractFunctionSource(code, 'isLatestAdminRefreshRequest'),
    extractFunctionSource(code, 'refreshPageByNav'),
  ];

  const context = {
    console,
    adminPageRefreshSeq: 0,
    config: { marker: 'old' },
    isLocalReadOnlyMode: false,
    sendMsg: async () => ({}),
    renderRulesPage: () => {},
    renderStatsPage: async () => {},
    setupDevicesPage: async () => {},
    setRulesPageError: () => {},
    setStatsPageError: () => {},
    setDevicesPageError: () => {},
  };

  vm.runInNewContext(
    fns.join('\n') + '\nthis.__refreshPageByNav = refreshPageByNav;',
    context,
    { filename: 'admin.js' }
  );
  return { refreshPageByNav: context.__refreshPageByNav, ctx: context };
}

async function run() {
  const { refreshPageByNav, ctx } = loadNavRefreshFns();

  // Case 1: rules 页切换时会重新 GET_CONFIG，并据此渲染
  let renderRulesCalled = 0;
  ctx.adminPageRefreshSeq = 1;
  ctx.config = { marker: 'old' };
  ctx.sendMsg = async (msg) => {
    expectEqual('rules refresh sends GET_CONFIG', msg?.type, 'GET_CONFIG');
    return { marker: 'new' };
  };
  ctx.renderRulesPage = () => { renderRulesCalled += 1; };
  await refreshPageByNav.call(ctx, 'rules', 1);
  expectEqual('rules refresh triggers render', renderRulesCalled, 1);
  expectEqual('rules refresh updates global config', ctx.config.marker, 'new');

  // Case 2: 旧请求（requestSeq 落后）不会覆盖新页面渲染
  let staleRenderCalled = 0;
  ctx.adminPageRefreshSeq = 2;
  ctx.sendMsg = async () => ({ marker: 'stale' });
  ctx.renderRulesPage = () => { staleRenderCalled += 1; };
  await refreshPageByNav.call(ctx, 'rules', 1);
  expectEqual('stale request does not render', staleRenderCalled, 0);

  // Case 3: 请求失败时走错误渲染路径
  let errorMessage = '';
  ctx.adminPageRefreshSeq = 3;
  ctx.sendMsg = async () => { throw new Error('config unavailable'); };
  ctx.setRulesPageError = (msg) => { errorMessage = msg; };
  await refreshPageByNav.call(ctx, 'rules', 3);
  expectTrue('rules refresh failure triggers error handler', errorMessage.includes('config unavailable'));

  const total = passed + failed;
  console.log(`\n[Admin Nav Refresh] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

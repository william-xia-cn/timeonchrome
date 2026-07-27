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
  const abs = path.join(__dirname, '..', '..', 'extension', 'message-router.js');
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
      tabs: {
        get: async (tabId) => ({ id: tabId, url: 'https://example.com/path?a=1' }),
        query: async () => [{ id: 101, url: 'https://fallback.example.com/' }],
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
  const storageSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'storage.js'), 'utf8');
  const routerSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'message-router.js'), 'utf8');
  const compositeCalls = [];
  const siteRequestCalls = [];
  const validateCalls = [];
  const temporaryCompositeRecords = [
    { tabId: 7, domain: 'old.example.com', createdAt: 1000 },
    { tabId: 8, domain: 'new.example.com', createdAt: 2000 },
  ];
  const siteClassificationRecords = [
    { id: 'scr-1', requestedTargetType: 'host', requestedNormalizedValue: 'example.com', status: 'pending', requestedAt: 3000 },
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
    getSiteClassificationRequestRecords: async () => siteClassificationRecords,
    submitSiteClassificationRequest: async (input, context) => {
      siteRequestCalls.push({ input, context });
      return {
        ok: true,
        added: true,
        localOnly: true,
        request: { id: 'scr-new', requestedNormalizedValue: input, sourceTabId: context.sourceTabId },
      };
    },
    normalizeSiteClassificationTarget: (input) => {
      const value = String(input || '').trim().toLowerCase();
      if (!value) return { ok: false, code: 'EMPTY_TARGET' };
      if (value.startsWith('http://') || value.startsWith('https://')) {
        const parsed = new URL(value);
        parsed.hash = '';
        return { ok: true, targetType: 'url', normalizedValue: `${parsed.protocol}//${parsed.hostname}${parsed.pathname}${parsed.search}`, displayValue: `${parsed.protocol}//${parsed.hostname}${parsed.pathname}${parsed.search}` };
      }
      return { ok: true, targetType: 'host', normalizedValue: value, displayValue: value };
    },
    validateSiteClassificationAction: (config, target, action) => {
      validateCalls.push({ config, target, action });
      if (target.normalizedValue === 'learn.blocked-parent.example.com') {
        return { ok: false, code: 'CLASSIFICATION_SCOPE_BLOCKED', error: 'scope blocked', classifiedAs: 'restricted', source: 'restrictedEntertainmentList', pattern: 'blocked-parent.example.com' };
      }
      return { ok: true, target, actionClassification: action };
    },
    getSyncState: () => ({ deviceToken: null }),
    syncNow: async () => ({}),
    extractDomain: (url) => {
      try { return new URL(url).hostname; } catch (_) { return ''; }
    },
    addTemporaryCompositeDomain: async (tabId, domain) => {
      compositeCalls.push({ tabId, domain });
      return { added: true };
    },
  });

  section('C00 静态接口检查');
  {
    expectTrue('storage 暴露临时综合记录只读方法', storageSource.includes('export async function getTemporaryCompositePermissionRecords'));
    expectTrue('router 支持 GET_TEMPORARY_COMPOSITE_DOMAINS', routerSource.includes('GET_TEMPORARY_COMPOSITE_DOMAINS') && routerSource.includes('getTemporaryCompositePermissionRecords'));
    expectTrue('router 支持网站归类申请消息', routerSource.includes('SUBMIT_SITE_CLASSIFICATION_REQUEST') && routerSource.includes('GET_SITE_CLASSIFICATION_REQUESTS'));
    expectTrue('router 支持网站归类申请 dry-run 校验消息', routerSource.includes('VALIDATE_SITE_CLASSIFICATION_REQUEST') && routerSource.includes('validateSiteClassificationRequestMessage') && routerSource.includes('validateSiteClassificationAction'));
    expectTrue('router 网站归类申请失败返回结构化响应', routerSource.includes("code: 'SITE_CLASSIFICATION_REQUEST_FAILED'") && routerSource.includes('catch (error)'));
    expectTrue('router reminder recheck 优先使用 targetUrl', routerSource.includes("searchParams.get('targetUrl')") && routerSource.includes('normalizeHttpTargetUrl'));
    expectTrue('router 支持客户端日志消息', routerSource.includes('GET_CLIENT_LOGS') && routerSource.includes('GET_CLIENT_LOG_STATUS') && routerSource.includes('UPDATE_CLIENT_LOG_CONFIG'));
    expectTrue('router CLOUD_LOGIN 统一小写邮箱', routerSource.includes("const email = String(msg.email || '').trim().toLowerCase();"));
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

  section('C01-1 reminder 可用 sourceTabId 申请待归类时间');
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

  section('C01-3 读取临时待归类记录按申请时间倒序');
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

  section('C02-1 读取网站归类记录');
  {
    const sender = { id: 'ext-id', url: 'chrome-extension://ext-id/admin/admin.html' };
    const r = await handleMessage({ type: 'GET_SITE_CLASSIFICATION_REQUESTS', status: 'all' }, sender);
    expect('返回网站归类记录 records', r, { ok: true, records: siteClassificationRecords });
  }

  section('C02-1b dry-run 校验学习网站归类申请且不写记录');
  {
    const sender = { id: 'ext-id', url: 'chrome-extension://ext-id/popup/popup.html' };
    const beforeSubmitCalls = siteRequestCalls.length;
    const ok = await handleMessage({ type: 'VALIDATE_SITE_CLASSIFICATION_REQUEST', input: 'example.com', sourceTabId: 42, requestedClassification: 'study' }, sender);
    expectTrue('dry-run 校验通过并返回 target', ok.ok && ok.target.normalizedValue === 'example.com' && ok.sourceTabId === 42);
    expect('dry-run 不调用提交写入函数', siteRequestCalls.length, beforeSubmitCalls);
    const blocked = await handleMessage({ type: 'VALIDATE_SITE_CLASSIFICATION_REQUEST', input: 'learn.blocked-parent.example.com', sourceTabId: 42, requestedClassification: 'study' }, sender);
    expect('dry-run 返回范围阻断错误', { ok: blocked.ok, code: blocked.code, classifiedAs: blocked.classifiedAs }, {
      ok: false,
      code: 'CLASSIFICATION_SCOPE_BLOCKED',
      classifiedAs: 'restricted',
    });
    expect('dry-run 失败仍不写记录', siteRequestCalls.length, beforeSubmitCalls);
    expectTrue('dry-run 使用统一动作校验', validateCalls.some(call => call.target.normalizedValue === 'learn.blocked-parent.example.com' && call.action === 'study'));
  }
  section('C02-2 提交学习网站归类申请使用 sourceTabId 上下文');
  {
    const sender = { id: 'ext-id', url: 'chrome-extension://ext-id/popup/popup.html' };
    const r = await handleMessage({ type: 'SUBMIT_SITE_CLASSIFICATION_REQUEST', input: 'example.com', sourceTabId: 42, requestedClassification: 'study' }, sender);
    expectTrue('提交成功', r.ok && r.added);
    expect('返回目标 URL', r.targetUrl, 'https://example.com');
    expect('使用 sourceTabId', r.sourceTabId, 42);
    expect('提交上下文保留 sourceTabId', siteRequestCalls.at(-1).context.sourceTabId, 42);
    expect('提交上下文声明学习归类方向', siteRequestCalls.at(-1).context.requestedClassification, 'study');
  }

  section('C02-2b 提交完整 URL 申请时上下文保存原始 URL');
  {
    const sender = { id: 'ext-id', url: 'chrome-extension://ext-id/popup/popup.html' };
    const r = await handleMessage({ type: 'SUBMIT_SITE_CLASSIFICATION_REQUEST', input: 'https://Example.com/path?q=1#frag', sourceTabId: 42, requestedClassification: 'study' }, sender);
    expectTrue('URL 提交成功', r.ok && r.target.targetType === 'url');
    expect('URL target 去掉 hash', r.target.normalizedValue, 'https://example.com/path?q=1');
    expect('提交上下文 sourceUrl 是原始目标 URL', siteRequestCalls.at(-1).context.url, 'https://example.com/path?q=1');
    expect('提交上下文 sourceDomain 是目标 host', siteRequestCalls.at(-1).context.domain, 'example.com');
  }

  section('C02-2c 非学习归类方向被拒绝');
  {
    const sender = { id: 'ext-id', url: 'chrome-extension://ext-id/popup/popup.html' };
    const r = await handleMessage({
      type: 'SUBMIT_SITE_CLASSIFICATION_REQUEST',
      input: 'example.com',
      requestedClassification: 'composite',
    }, sender);
    expect('只允许手动申请学习归类', { ok: r.ok, code: r.code }, {
      ok: false,
      code: 'INVALID_REQUESTED_CLASSIFICATION',
    });
  }

  section('C02-3 提交学习网站归类申请异常返回结构化失败');
  {
    const { handleMessage: failingHandleMessage } = loadHandleMessage({
      updateDeclarativeRules: async () => {},
      getConfig: async () => ({ mode: 'study' }),
      getSiteClassificationRequestRecords: async () => [],
      submitSiteClassificationRequest: async () => { throw new Error('storage write failed'); },
      normalizeSiteClassificationTarget: (input) => {
        const value = String(input || '').trim();
        return value ? { ok: true, targetType: 'host', normalizedValue: value, displayValue: value } : { ok: false };
      },
      validateSiteClassificationAction: () => ({ ok: true }),
      getSyncState: () => ({ deviceToken: null }),
      syncNow: async () => ({}),
      extractDomain: (url) => {
        try { return new URL(url).hostname; } catch (_) { return ''; }
      },
      hasTemporaryCompositePermission: async () => false,
      getTemporaryCompositePermissionRecords: async () => [],
      addTemporaryCompositeDomain: async () => ({ added: true }),
    });
    const r = await failingHandleMessage({ type: 'SUBMIT_SITE_CLASSIFICATION_REQUEST', input: 'example.com' }, { id: 'ext-id', url: 'chrome-extension://ext-id/popup/popup.html' });
    expect('返回结构化失败', { ok: r.ok, code: r.code, error: r.error }, {
      ok: false,
      code: 'SITE_CLASSIFICATION_REQUEST_FAILED',
      error: 'storage write failed',
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

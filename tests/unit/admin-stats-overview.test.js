// admin-stats-overview.test.js
// Run with: node tests/unit/admin-stats-overview.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function expectEqual(desc, actual, expected) {
  if (actual === expected) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc} (actual=${String(actual)}, expected=${String(expected)})`);
  }
}

function expectTrue(desc, value) {
  if (value) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
  }
}

function extractFunctionSource(code, functionName) {
  const marker = `function ${functionName}(`;
  const start = code.indexOf(marker);
  if (start < 0) throw new Error(`function ${functionName} not found`);
  const braceStart = code.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return code.slice(start, i + 1);
      }
    }
  }
  throw new Error(`function ${functionName} parse failed`);
}

function loadComputeOverview() {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'admin', 'admin.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'admin', 'admin.html'), 'utf8');
  const fns = [
    extractFunctionSource(code, 'matchDomain'),
    extractFunctionSource(code, 'classifyDomain'),
    extractFunctionSource(code, 'isStatsMetaKey'),
    extractFunctionSource(code, 'readCompositeSeconds'),
    extractFunctionSource(code, 'computeOverview'),
    extractFunctionSource(code, 'renderOverviewList')
  ];
  const elements = {};
  const context = {
    URL,
    console,
    config: { studyList: [], compositeList: [] },
    formatSeconds: (seconds) => `${seconds}s`,
    document: {
      getElementById: (id) => {
        if (!elements[id]) elements[id] = {
          innerHTML: '',
          disabled: false,
          textContent: '',
          addEventListener: () => {},
        };
        return elements[id];
      },
    },
  };
  vm.runInNewContext(
    fns.join('\n') + '\nthis.__fn = computeOverview; this.__render = renderOverviewList;',
    context,
    { filename: 'admin.js' }
  );
  return { fn: context.__fn, render: context.__render, ctx: context, elements, code, html };
}

function run() {
  const { fn: computeOverview, render, ctx, elements, code, html } = loadComputeOverview();

  // Helper to call with vm context as `this`
  function call(data) {
    return computeOverview.call(ctx, data);
  }

  // Case 1: PiP is domain-related; background media overview uses backgroundMedia only.
  const r1 = call({ audioSeconds: 30, pipSeconds: 20, domainStats: {} });
  expectEqual('audio=30 + pip=20 => background media 30s', r1.audio, 30);
  expectEqual('audio=30 + pip=20 => PiP 20s', r1.pip, 20);

  // Case 2: PiP alone should not inflate the background media overview.
  const r2 = call({ audioSeconds: 0, pipSeconds: 15, domainStats: {} });
  expectEqual('audio=0 + pip=15 => background media 0s', r2.audio, 0);
  expectEqual('audio=0 + pip=15 => PiP 15s', r2.pip, 15);

  // Case 3: audioSeconds=10, pipSeconds missing => background media = 10
  const r3 = call({ audioSeconds: 10, domainStats: {} });
  expectEqual('audio=10 + pip=missing => background media 10s', r3.audio, 10);

  // Case 4: both missing => background media = 0
  const r4 = call({ domainStats: {} });
  expectEqual('audio=missing + pip=missing => background media 0s', r4.audio, 0);
  expectEqual('audio=missing + pip=missing => PiP 0s', r4.pip, 0);

  ctx.config = { studyList: ['study.example'], compositeList: ['video.example'] };
  const r5 = call({ domainStats: { 'study.example': 100, 'video.example': 200, 'other.example': 300 } });
  expectEqual('domain fallback: compositeList maps to composite seconds', r5.composite, 200);
  expectEqual('domain fallback: composite seconds are not counted as rest', r5.rest, 300);

  const r6 = call({ compositeSeconds: 240, domainStats: { 'other.example': 300 } });
  expectEqual('explicit compositeSeconds has priority', r6.composite, 240);
  expectEqual('explicit compositeSeconds excluded from rest', r6.rest, 60);

  const r7 = call({ undeterminedSeconds: 180, domainStats: { 'other.example': 300 } });
  expectEqual('legacy undeterminedSeconds is read as composite', r7.composite, 180);
  expectEqual('legacy undeterminedSeconds excluded from rest', r7.rest, 120);

  render.call(ctx, 'overview-test', { online: 100, study: 20, rest: 30, audio: 40, pip: 50, composite: 10 });
  const overviewHtml = elements['overview-test'].innerHTML;
  expectTrue('renderOverviewList includes background media row', overviewHtml.includes('后台媒体'));
  expectTrue('renderOverviewList includes PiP row', overviewHtml.includes('PiP'));

  expectTrue('admin stats calls suspect summary message', code.includes("GET_SUSPECT_SEGMENT_SUMMARY"));
  expectTrue('admin stats exposes suspect maintenance action', code.includes('标记并重建本地统计'));
  expectTrue('admin stats explains active over 3h reason', code.includes('active 超过 3 小时'));
  expectTrue('admin stats has clean suspect state text', code.includes('未发现'));
  expectTrue('admin child stats can enter local read-only mode', code.includes('async function enterLocalReadOnlyMode('));
  expectTrue('admin local read-only hides account chrome', code.includes("logoutBtn.style.display = 'none'") && code.includes("userInfo.style.display = 'none'"));
  expectTrue('admin local mode sidebar label is present', code.includes("sidebarNameEl.textContent = '本地模式'"));
  expectTrue('admin local mode renders stats page', code.includes('await renderStatsPage();'));
  expectTrue('admin 登录注册邮箱应统一小写', code.includes('function normalizeEmailInput') && code.includes("normalizeEmailInput(document.getElementById('email-input')?.value)") && code.includes("normalizeEmailInput(document.getElementById('reg-email')?.value)"));
  expectTrue('admin 初始化应先绑定登录事件再读取配置', code.indexOf('setupLoginForm();') >= 0 && code.indexOf("sendMsg({ type: 'GET_CONFIG' })") >= 0 && code.indexOf('setupLoginForm();') < code.indexOf("sendMsg({ type: 'GET_CONFIG' })"));
  expectTrue('admin 初始化配置失败不应阻断登录界面', code.includes('initial GET_CONFIG failed, keeping login available') && code.includes('showBindScreen();'));
  expectTrue('admin sendMsg 应支持 background 冷启动重试', code.includes('background_timeout') && code.includes('setTimeout(resolve, 180)'));
  expectTrue('admin 本地只读模式应保留登录绑定入口', code.includes('function openCloudLogin()') && code.includes('id="cloud-login-btn"') && code.includes('登录/绑定云端'));
  expectTrue('admin 访问规则页应展示网站归类申请记录', html.includes('网站归类申请记录') && html.includes('rules-temporary-composite-display'));
  expectTrue('admin 应读取网站归类申请记录消息', code.includes('GET_SITE_CLASSIFICATION_REQUESTS') && code.includes('renderSiteClassificationRequestRecords'));
  expectTrue('admin local mode renders device status as sync disabled', code.includes('本机计时、popup 和使用分析可用；统计不会同步到云端。'));
  expectTrue('admin has settlement analysis nav item', html.includes('data-page="settlements"'));
  expectTrue('admin has settlement analysis page', html.includes('id="page-settlements"'));
  expectTrue('admin settlement page has domain filter', html.includes('id="settlement-domain-filter"'));
  expectTrue('admin settlement page has range buttons', html.includes('data-settlement-range="today"') && html.includes('data-settlement-range="yesterday"') && html.includes('data-settlement-range="week"') && html.includes('data-settlement-range="all"'));
  expectTrue('admin settlement page has local reconciliation summary', html.includes('id="settlement-reconciliation-summary"'));
  expectTrue('admin settlement page calls range settlement analysis message', code.includes('GET_SETTLEMENT_ANALYSIS_RANGE'));
  expectTrue('admin settlement page renders refresh control', code.includes('settlement-refresh-btn'));
  expectTrue('admin settlement table shows date for multi-day ranges', html.includes('settlement-col-date') && code.includes('row.date'));
  expectTrue('admin settlement page renders readable timing type label', code.includes('计时类型'));
  expectTrue('admin settlement page maps framework to readable labels', code.includes('getSettlementTypeLabel'));
  expectTrue('admin settlement table folds open close into remarks', code.includes('备注') && code.includes('openOperation') && code.includes('closeOperation') && code.includes('buildSettlementRemarkHtml'));
  expectTrue('admin settlement remarks split tab and window lines', code.includes('tab：') && code.includes('window：') && code.includes('来源：'));
  expectTrue('admin settlement table uses compact remarks column', html.includes('overflow-x: auto') && html.includes('settlement-col-remark') && html.includes('settlement-remark-cell'));
  expectTrue('admin settlement open close displays source reason before operation', code.includes("return normalizeSettlementEventReason(endpoint?.reason || endpoint?.operation) || '—';"));
  expectTrue('admin settlement hides invalid media-only operation reasons', code.includes("value === 'tabAudible' || value === 'mediaState'"));
  expectTrue('admin settlement rows sort newest first', code.includes('return bStart - aStart;'));
  expectTrue('admin settlement page renders reconciliation delta', code.includes('renderSettlementReconciliationSummary') && code.includes('formatSignedSeconds'));
  expectTrue('admin has media settlement nav item', html.includes('data-page="media-settlements"'));
  expectTrue('admin has media settlement page', html.includes('id="page-media-settlements"'));
  expectTrue('admin media settlement page calls local media analysis message', code.includes('GET_MEDIA_SETTLEMENT_ANALYSIS_RANGE'));
  expectTrue('admin media settlement page has domain and class filters', html.includes('id="media-settlement-domain-filter"') && html.includes('id="media-settlement-class-filter"'));
  expectTrue('admin media settlement page shows media classes', code.includes('foregroundAudio') && code.includes('backgroundVideo') && code.includes('pip'));
  expectTrue('admin media settlement rows keep media-only reasons visible', code.includes('function normalizeMediaSettlementEventReason') && !extractFunctionSource(code, 'normalizeMediaSettlementEventReason').includes("value === 'tabAudible'"));
  expectTrue('admin media settlement table stays local-only', html.includes('media_segments_v1') && code.includes('<span class="settlement-muted">本地</span>'));

  const total = passed + failed;
  console.log(`\n[Admin Stats Overview] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

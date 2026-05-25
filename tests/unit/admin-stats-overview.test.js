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
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'admin', 'admin.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'admin', 'admin.html'), 'utf8');
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

  expectTrue('admin 使用分析页面采用 Screen Time 结构', html.includes('id="usage-analysis-total"') && html.includes('id="usage-analysis-week-chart"') && html.includes('id="usage-analysis-main-chart"') && html.includes('id="usage-analysis-list-mode"'));
  expectTrue('admin 使用分析默认本机数据口径', html.includes('本机数据：加载中') && html.includes('这台电脑'));
  expectTrue('admin 使用分析支持日周切换和管理对象/分类切换', html.includes('data-usage-range-mode="day"') && html.includes('data-usage-range-mode="week"') && html.includes('显示管理对象') && html.includes('显示分类'));
  expectTrue('admin 使用分析应拆分网页使用和媒体使用 Tab', html.includes('data-usage-ledger="web"') && html.includes('data-usage-ledger="media"') && code.includes('getAdminMediaUsageAnalysisView'));
  expectTrue('admin 使用分析渲染 managedTarget-first view', code.includes('renderUsageAnalysisView') && code.includes('targetRows') && code.includes('categoryRows') && code.includes('usageAnalysisState'));
  expectTrue('admin stats error state targets usage analysis DOM', code.includes('usage-analysis-table-wrap') && code.includes('usage-analysis-week-chart') && !extractFunctionSource(code, 'setStatsPageError').includes('today-overview-list'));
  expectTrue('admin 使用分析不把 suspect 诊断放入普通视图', !code.includes('usageView.suspectSummary'));
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
  expectTrue('admin 访问规则页不应单独展示已批准精确链接规则', !html.includes('已批准精确链接 / 管理对象规则') && !html.includes('rules-approved-target-rules-display') && !code.includes('renderApprovedTargetRules'));
  expectTrue('admin 访问规则页应把已批准 URL 规则合并到对应分类', code.includes('approvedUrlRulesForDecision') && code.includes("targetRules: approvedUrlRulesForDecision('study')") && code.includes("targetRules: approvedUrlRulesForDecision('composite')") && code.includes("targetRules: approvedUrlRulesForDecision('reject')"));
  expectTrue('admin 网站归类申请目标列应加宽并允许长 URL 换行', html.includes('site-request-target-cell') && html.includes('site-request-target-table') && html.includes('overflow-wrap: anywhere') && code.includes('site-request-target-cell'));
  expectTrue('admin 应读取网站归类申请记录消息', code.includes('GET_SITE_CLASSIFICATION_REQUESTS') && code.includes('renderSiteClassificationRequestRecords'));
  expectTrue('admin local mode renders device status as sync disabled', code.includes('本机计时、popup 和使用分析可用；统计不会同步到云端。'));
  expectTrue('admin has system management nav item', html.includes('data-page="system-management"') && html.includes('系统管理'));
  expectTrue('admin keeps local device status before system management', html.includes('本机状态') && html.indexOf('data-page="devices"') < html.indexOf('data-page="system-management"'));
  expectTrue('admin has system management page', html.includes('id="page-system-management"'));
  expectTrue('admin system management has web/media/log tabs', html.includes('data-system-management-tab="web-settlements"') && html.includes('data-system-management-tab="media-settlements"') && html.includes('data-system-management-tab="client-logs"'));
  expectTrue('admin settlement tab is named web settlement', html.includes('网页落账') && !html.includes('今日落账'));
  expectTrue('admin settlement page has domain filter', html.includes('id="settlement-domain-filter"'));
  expectTrue('admin settlement page has range buttons', html.includes('data-settlement-range="today"') && html.includes('data-settlement-range="yesterday"') && html.includes('data-settlement-range="week"') && html.includes('data-settlement-range="all"'));
  expectTrue('admin settlement page has local reconciliation summary', html.includes('id="settlement-reconciliation-summary"'));
  expectTrue('admin html loads admin as module', html.includes('<script type="module" src="admin.js"></script>'));
  expectTrue('admin imports pure read stats model', code.includes("from '../stats/admin-read-model.js'"));
  expectTrue('admin stats no longer calls background stats range message', !code.includes('GET_STATS_RANGE'));
  expectTrue('admin stats no longer calls settlement analysis message', !code.includes('GET_SETTLEMENT_ANALYSIS_RANGE') && !code.includes('GET_TODAY_SETTLEMENT_ANALYSIS'));
  expectTrue('admin stats no longer calls media settlement message', !code.includes('GET_MEDIA_SETTLEMENT_ANALYSIS_RANGE'));
  expectTrue('admin stats no longer calls timeline/suspect read messages', !code.includes('GET_TIMELINE_SEGMENTS') && !code.includes('GET_SUSPECT_SEGMENT_SUMMARY'));
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
  expectTrue('admin media settlement is inside system management tabs', html.includes('data-system-management-panel="media-settlements"'));
  expectTrue('admin media settlement page calls local read model', code.includes('getAdminMediaSettlementView'));
  expectTrue('admin media settlement page has domain and class filters', html.includes('id="media-settlement-domain-filter"') && html.includes('id="media-settlement-class-filter"'));
  expectTrue('admin media settlement page shows media classes', code.includes('foregroundAudio') && code.includes('backgroundVideo') && code.includes('pip'));
  expectTrue('admin media settlement rows keep media-only reasons visible', code.includes('function normalizeMediaSettlementEventReason') && !extractFunctionSource(code, 'normalizeMediaSettlementEventReason').includes("value === 'tabAudible'"));
  expectTrue('admin media settlement table shows media ledger sync status', html.includes('media_segments_v1') && html.includes('独立媒体同步链路') && code.includes("row.uploaded ? '已上传'"));
  expectTrue('admin client logs are inside system management tabs', html.includes('data-system-management-panel="client-logs"'));
  expectTrue('admin client logs use local log messages', code.includes('GET_CLIENT_LOGS') && code.includes('GET_CLIENT_LOG_STATUS') && code.includes('CLEAR_CLIENT_LOGS'));
  expectTrue('admin client logs support level/category filters', html.includes('client-log-level-filter') && html.includes('client-log-category-filter'));

  const total = passed + failed;
  console.log(`\n[Admin Stats Overview] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

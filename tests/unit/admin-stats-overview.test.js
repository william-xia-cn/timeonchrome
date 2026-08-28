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
  expectTrue('admin 左侧导航应将访问规则改为访问管理', html.includes('data-page="rules"') && html.includes('访问管理') && !html.includes('<span class="nav-icon">📋</span> 访问规则'));
  expectTrue('admin 访问管理页应拆分为四个页内 Tab', html.includes('data-rules-tab="site-management"') && html.includes('data-rules-tab="quota-management"') && html.includes('data-rules-tab="schedule-management"') && html.includes('data-rules-tab="classification-requests"') && html.includes('网站管理') && html.includes('时间配额') && html.includes('时间段管理') && html.includes('网站归类记录'));
  expectTrue('admin 访问管理页应包含四个内容面板', html.includes('data-rules-panel="site-management"') && html.includes('data-rules-panel="quota-management"') && html.includes('data-rules-panel="schedule-management"') && html.includes('data-rules-panel="classification-requests"'));
  expectTrue('admin 访问管理页默认展示网站管理', code.includes("let rulesActiveTab = 'site-management'") && html.includes('<div class="rules-panel active" data-rules-panel="site-management">'));
  expectTrue('admin 访问管理 Tab 切换只同步显示状态', code.includes('function syncRulesTabs()') && code.includes('[data-rules-tab]') && code.includes('[data-rules-panel]') && code.includes('rulesActiveTab = btn.dataset.rulesTab'));
  expectTrue('admin 网站归类记录页应与云端使用相同的两单元结构', html.includes('网站归类记录') && html.includes('复合网站申请学习记录') && html.includes('未归类网站使用记录') && html.includes('rules-learning-request-display') && html.includes('rules-unclassified-record-display'));
  expectTrue('admin 本地访问管理不提供配置文件导入导出', !html.includes('data-rules-tab="config-files"') && !html.includes('导入配置文件') && !html.includes('导出配置文件'));
  expectTrue('admin 本地网站管理使用只读策略目录', html.includes('admin-rules-policy-nav') && html.includes('admin-rules-site-directory') && html.includes('rules-readonly-shell') && code.includes('rulesSiteActivePolicy'));
  expectTrue('admin 本地网站管理包含特殊网站入口和 YouTube 规则列表', code.includes("key: 'special'") && code.includes('特殊网站：YouTube') && code.includes('YouTube 特殊对象规则') && code.includes('youtubeSpecialRuleRows') && code.includes('siteRuleManagementRank') && code.includes('孩子可在 Popup 对支持的视频、播放列表、频道发起学习申请') && !code.includes('特殊对象规则只能在云端家长控制台修改'));
  expectTrue('admin 本地网站管理包含独立已使用未归类网站只读模块', code.includes("key: 'used-unclassified'") && code.indexOf("key: 'used-unclassified'") > code.indexOf("key: 'special'") && code.includes('adminUsedUnclassifiedRows') && code.includes('renderAdminUsedUnclassifiedManagement') && code.includes('data-admin-used-unclassified="true"') && code.includes('本页不提供分类操作') && code.includes('云端处理'));
  expectTrue('admin 本地网站管理不提供本地添加保存或编辑分类入口', !html.includes('id="save-rules-btn"') && !html.includes('rules-site-add') && !html.includes('编辑分类') && code.includes('本机只读'));
  expectTrue('admin 本地配额和时间段使用只读表格展示', html.includes('时间配额') && code.includes('rules-quota-grid') && code.includes('rules-schedule-grid') && code.includes('rules-readonly-value'));
  expectTrue('admin 本地配额页应只读显示休息软限额提醒配置', html.includes('id="rules-rest-reminder-display"') && html.includes('休息时间提醒') && code.includes('function getAdminRestReminderView') && code.includes("'firstReminderMinutes'") && code.includes("'repeatReminderMinutes'") && code.includes('今日休息软限额') && code.includes('超额后提醒间隔'));
  expectTrue('admin 本地提醒说明应明确账本和超时口径', code.includes('软限额只做提醒，不会锁定网站访问') && code.includes('Rest 配额网页账本') && code.includes('媒体时长不计入') && code.includes('3 分钟结算周期') && code.includes('60 秒未处理会结束休息'));
  expectTrue('admin 访问规则页不应单独展示已批准精确链接规则', !html.includes('已批准精确链接 / 管理对象规则') && !html.includes('rules-approved-target-rules-display') && !code.includes('renderApprovedTargetRules'));
  expectTrue('admin 访问规则页应把已批准 URL 规则合并到对应分类', code.includes('function adminRulesPolicyDefs') && code.includes('approvedUrlRulesForDecision') && code.includes("targetRules: approvedUrlRulesForDecision('study')") && code.includes("targetRules: approvedUrlRulesForDecision('composite')") && code.includes("targetRules: approvedUrlRulesForDecision('reject')"));
  expectTrue('admin 归为受限娱乐 URL 规则应作为受限精确规则展示', code.includes("targetRules: approvedUrlRulesForDecision('reject')") && code.includes('已批准精确规则') && code.includes('uniqueSiteRules'));
  expectTrue('admin URL 规则展示应规范化 YouTube playlist 历史值', code.includes('function canonicalDisplayUrlValue') && code.includes('https://www.youtube.com/playlist?list=${playlistId}'));
  expectTrue('admin 网站归类记录行应优先显示审批生效对象并允许长链接换行', code.includes('record.decisionNormalizedValue || record.displayValue || record.requestedNormalizedValue') && html.includes('.rules-record-object') && html.includes('overflow-wrap: anywhere'));
  expectTrue('admin 应读取全部网站归类记录消息', code.includes('GET_SITE_CLASSIFICATION_REQUESTS') && code.includes("status: 'all'") && code.includes('renderSiteClassificationRequestRecords'));
  expectTrue('admin 应按云端口径区分访问记录、学习申请和历史记录', code.includes('siteClassificationRecordKind') && code.includes('未归类网站访问记录') && code.includes('学习网站归类申请') && code.includes('历史网站归类记录') && code.includes('顶层导航'));
  expectTrue('admin 两个记录单元应分别筛选学习申请和未归类记录', code.includes("siteClassificationRecordKind(record) === 'learning_request'") && code.includes("siteClassificationRecordKind(record) !== 'learning_request'") && code.includes('rules-learning-request-count') && code.includes('rules-unclassified-record-count'));
  expectTrue('admin 未处理记录应默认显示且已处理记录默认折叠', code.includes('isProcessedSiteClassificationRecord') && code.includes('<details class="rules-record-history">') && !code.includes('<details class="rules-record-history" open>'));
  expectTrue('admin 网站归类记录页应保持只读', html.includes('本页只读展示本机已同步的网站归类记录') && !extractFunctionSource(code, 'renderSiteClassificationRecordRow').includes('<button') && !extractFunctionSource(code, 'renderSiteClassificationRecordRow').includes('<input') && !extractFunctionSource(code, 'renderSiteClassificationRecordRow').includes('<select'));
  expectTrue('admin local mode renders device status as sync disabled', code.includes('本机计时、popup 和使用分析可用；统计不会同步到云端。'));
  expectTrue('admin 本机状态应读取账户和用户信息', extractFunctionSource(code, 'renderSyncStatus').includes('CLOUD_KEYS.CREDENTIALS') && extractFunctionSource(code, 'renderSyncStatus').includes('CLOUD_KEYS.PROFILE_NAME'));
  expectTrue('admin 本机状态应显示账户和用户', extractFunctionSource(code, 'renderSyncStatus').includes('账户：') && extractFunctionSource(code, 'renderSyncStatus').includes('用户：'));
  expectTrue('admin 本机状态账户应从 base64 凭据解析邮箱', extractFunctionSource(code, 'renderSyncStatus').includes('atob(credentials).split'));
  expectTrue('admin 本机状态账户和用户应横向同列展示', extractFunctionSource(code, 'renderSyncStatus').includes('display:flex; gap:24px'));
  expectTrue('admin 本机状态设备名、DeviceID 和 ID 应横向同列展示', extractFunctionSource(code, 'renderSyncStatus').includes('<span style="font-size:15px; font-weight:600;">${deviceName}</span>') && extractFunctionSource(code, 'renderSyncStatus').includes('DeviceID: ${deviceId}') && extractFunctionSource(code, 'renderSyncStatus').includes('ID: ${shortId}'));
  expectTrue('admin 本机状态应读取并展示云端连接状态', extractFunctionSource(code, 'renderSyncStatus').includes('cloud_connection_state_v1') && extractFunctionSource(code, 'renderSyncStatus').includes('云端连接') && extractFunctionSource(code, 'renderSyncStatus').includes('连续失败') && extractFunctionSource(code, 'renderSyncStatus').includes('最近接口'));
  expectTrue('admin 立即同步并发状态应显示为中性提示', code.includes("sync_already_in_progress") && code.includes('已有同步正在进行，已安排完成后补同步') && code.includes("showToast('已有同步正在进行')"));
  expectTrue('admin 本机状态未绑定分支应保留本地模式用户显示', extractFunctionSource(code, 'renderSyncStatus').includes("'本地模式'"));
  expectTrue('admin has system management nav item', html.includes('data-page="system-management"') && html.includes('系统管理'));
  expectTrue('admin local device status should be under system management only', !html.includes('data-page="devices"') && html.includes('data-system-management-tab="device-status"') && html.includes('data-system-management-panel="device-status"'));
  expectTrue('admin has system management page', html.includes('id="page-system-management"'));
  expectTrue('admin system management has device/web/media/log tabs', html.includes('data-system-management-tab="device-status"') && html.includes('data-system-management-tab="web-settlements"') && html.includes('data-system-management-tab="media-settlements"') && html.includes('data-system-management-tab="client-logs"'));
  expectTrue('admin system management defaults to device status', code.includes("let systemManagementActiveTab = 'device-status'") && code.includes("systemManagementActiveTab === 'device-status'"));
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
  expectTrue('admin 落账诊断时间应默认显示北京时间并保留 UTC title', code.includes("timeZone: 'Asia/Shanghai'") && code.includes('北京时间') && code.includes('function formatUtcSettlementTime') && code.includes('formatUtcSettlementTime(row.startMs)'));
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
  expectTrue('admin 系统日志时间应默认显示北京时间并保留 UTC title', code.includes('function formatClientLogTime') && code.includes('formatUtcSettlementTime(log.timestamp)'));

  const total = passed + failed;
  console.log(`\n[Admin Stats Overview] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

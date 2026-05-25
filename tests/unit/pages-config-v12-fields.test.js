// pages-config-v12-fields.test.js
// Run with: node tests/unit/pages-config-v12-fields.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function expectTrue(desc, cond) {
  if (cond) passed++;
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
      if (depth === 0) return code.slice(start, i + 1);
    }
  }
  throw new Error(`function ${functionName} parse failed`);
}

function run() {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'pages', 'index.html'), 'utf8');
  const authSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'auth.js'), 'utf8');
  const bindSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'bind.js'), 'utf8');

  // 源码残留检查
  expectTrue('pages 不应再出现 allowList 字段', !/\ballowList\b/.test(source));
  expectTrue('pages 不应再出现 blacklist 字段', !/\bblacklist\b/.test(source));
  expectTrue('pages 不应再出现 dailyQuota fallback 字段', !/\bdailyQuota\b/.test(source));
  expectTrue('统计分类应仅读取 compositeList', source.includes('const compositeList = cfg.compositeList || [];'));
  expectTrue('Pages 控制台应优先读取 stats/v1', source.includes('/stats/v1?from='));
  expectTrue('Pages 控制台应优先读取 target-stats/v1', source.includes('/target-stats/v1?from=') && source.includes('normalizeTargetStatsRows'));
  expectTrue('Pages 使用分析应采用 Screen Time 结构', source.includes('id="cloud-usage-total"') && source.includes('id="cloud-usage-week-chart"') && source.includes('id="cloud-usage-main-chart"') && source.includes('id="cloud-usage-list-mode"'));
  expectTrue('Pages 使用分析默认全部设备并支持日周切换', source.includes('设备：') && source.includes('全部设备') && source.includes('data-cloud-usage-mode="day"') && source.includes('data-cloud-usage-mode="week"'));
  expectTrue('Pages 使用分析应拆分网页使用和媒体使用 Tab', source.includes('data-cloud-usage-ledger="web"') && source.includes('data-cloud-usage-ledger="media"'));
  expectTrue('Pages 使用分析网页和媒体分别读取对应统计源', source.includes('/target-stats/v1?') && source.includes('/hourly-target-stats/v1?') && source.includes('/media-stats/v1?') && source.includes('/hourly-media-stats/v1?'));
  expectTrue('Pages 使用分析普通列表不暴露落账诊断字段', source.includes('显示管理对象') && source.includes('显示分类') && !extractFunctionSource(source, 'renderCloudUsageList').includes('settlementReason') && !extractFunctionSource(source, 'renderCloudUsageList').includes('tabId'));
  expectTrue('Pages 配额页应通过 effective quota read model 渲染', source.includes('function buildEffectiveTimeQuotaView') && source.includes('quotaTimeField'));
  expectTrue('Pages 配额页不应原地写入 remoteConfig.timeQuota 做懒迁移', !extractFunctionSource(source, 'renderQuotaPage').includes('remoteConfig.timeQuota ='));
  expectTrue('Pages 配额页在线限额未设置时不应伪装成三类合计', extractFunctionSource(source, 'updateWeeklyQuotaTotals').includes("'未设置'") && extractFunctionSource(source, 'updateWeeklyQuotaTotals').includes('dailyOnlineQuota'));
  expectTrue('Pages 控制台应包含 v1 stats 适配器', source.includes('function fetchProfileStats'));
  expectTrue('Pages 登录注册邮箱应统一小写', source.includes('function normalizeEmailInput') && source.includes("normalizeEmailInput(document.getElementById('login-email').value)") && source.includes("normalizeEmailInput(document.getElementById('reg-email').value)"));
  expectTrue('auth.js 绑定登录邮箱应统一小写', authSource.includes('const normalizedEmail') && authSource.includes('email: normalizedEmail'));
  expectTrue('bind.js 登录与保存凭据邮箱应统一小写', bindSource.includes("document.getElementById('email').value.trim().toLowerCase()"));
  expectTrue('Pages 控制台应兼容 stats_v1 duration_seconds', source.includes('duration_seconds'));
  expectTrue('Pages 日期应使用本地日期，不应使用 toISOString 作为显示/查询日期', !/function fmtDate\(d\)\s*\{\s*return d\.toISOString\(\)/.test(source));
  expectTrue('Pages 应包含落账明细导航', source.includes('data-page="settlements"') && source.includes('落账明细'));
  expectTrue('Pages 落账页应读取 usage-segments/v1', source.includes('/usage-segments/v1'));
  expectTrue('Pages 落账页应支持终端筛选和终端列', source.includes('settlement-device-input') && source.includes("params.set('deviceId', deviceInput.value)") && source.includes('终端'));
  expectTrue('Pages 云端落账页应展示紧凑备注列', source.includes('function buildCloudSettlementRemarkHtml') && source.includes('cloudEndpointOperation') && source.includes('target：') && source.includes('tab：') && source.includes('window：') && source.includes('open：') && source.includes('close：') && source.includes('来源：'));
  expectTrue('Pages 云端落账页备注应读取 Open/Close description', source.includes("cloudEndpointOperation(row?.description, 'start')") && source.includes("cloudEndpointOperation(row?.description, 'end')"));
  expectTrue('Pages 应有媒体落账入口', source.includes('data-page="media-settlements"') && source.includes('媒体落账'));
  expectTrue('Pages 媒体落账页应读取 media-segments/v1', source.includes('/media-segments/v1'));
  expectTrue('Pages 媒体落账页应支持终端筛选', source.includes('media-settlement-device-input') && source.includes('selectedCloudDeviceLabel'));
  expectTrue('Pages 媒体落账页应支持媒体类型筛选', source.includes('media-settlement-class-input') && source.includes('mediaClass'));
  expectTrue('Pages 媒体落账页应展示五类媒体统计', source.includes('前台音频') && source.includes('后台音频') && source.includes('前台视频') && source.includes('后台视频') && source.includes('PiP'));
  expectTrue('Pages 媒体落账页应复用备注列展示 tab/window/open/close/source', source.includes("buildCloudSettlementRemarkHtml(row, row.visibility || row.mediaKind || '—')"));
  expectTrue('Pages 系统日志页应包含云端数据下载卡片', source.includes('id="cloud-export-download-btn"') && source.includes('选择目录并下载') && source.includes('id="cloud-export-categories"'));
  expectTrue('Pages 云端数据下载应使用目录选择 API', source.includes('window.showDirectoryPicker') && source.includes('getDirectoryHandle(`${profileName}-${timestamp}`'));
  expectTrue('Pages 云端数据下载应写入 manifest 和分类路径', source.includes("writeExportFile(exportRoot, 'manifest.json'") && source.includes('dataset.path'));
  expectTrue('Pages 云端数据下载应提示不支持目录选择的浏览器', source.includes('当前浏览器不支持直接选择目录下载'));
  expectTrue('Pages 落账相关域名筛选应标明关键词筛选', (source.match(/placeholder="域名关键词筛选"/g) || []).length >= 3);
  expectTrue('Pages 落账页应支持今日/昨日/本周/全部', source.includes('data-settlement-range="today"') && source.includes('data-settlement-range="yesterday"') && source.includes('data-settlement-range="week"') && source.includes('data-settlement-range="all"'));
  expectTrue('Pages 落账页应支持 nextCursor 加载更多', source.includes('nextCursor') && source.includes('settlement-load-more-btn'));
  expectTrue('Pages 落账页应标明最新记录在最上方', source.includes('最新记录显示在最上方'));
  expectTrue('Pages 应包含统计对账导航', source.includes('data-page="reconciliation"') && source.includes('统计对账'));
  expectTrue('Pages 统计对账应读取 stats-reconciliation/v1', source.includes('/stats-reconciliation/v1'));
  expectTrue('Pages 统计对账应展示统计表、落账聚合、差异、状态', source.includes('统计表') && source.includes('落账聚合') && source.includes('差异') && source.includes('状态'));
  expectTrue('Pages 统计对账应支持显示全部开关', source.includes('reconciliation-show-all'));
  expectTrue('Pages 应包含网站归类申请审核入口', source.includes('网站归类申请') && source.includes('site-classification-requests/v1'));
  expectTrue('Pages 网站归类申请应支持审批生效对象编辑', source.includes('审批生效对象') && source.includes('site-request-type-') && source.includes('site-request-target-'));
  expectTrue('Pages 网站归类申请应支持三种审批动作', source.includes('批准为学习网站') && source.includes('批准为综合网站') && source.includes('拒绝'));
  expectTrue('Pages 网站归类申请应支持全部历史筛选', source.includes('site-classification-status-filter') && source.includes('value="all"'));
  expectTrue('Pages 访问规则页不应单独展示已批准精确链接规则', !source.includes('已批准精确链接 / 管理对象规则') && !source.includes('r-approved-target-rules-display') && !source.includes('renderApprovedTargetRules'));
  expectTrue('Pages 访问规则页应把已批准 URL 规则合并到对应分类', source.includes('approvedUrlRulesForListKey') && source.includes("listKey === 'customStudyList'") && source.includes("listKey === 'customCompositeList'") && source.includes("listKey === 'customBlockedSites'"));
  expectTrue('Pages 访问规则添加/导入/保存应校验精确跨类重复', source.includes('function findSiteAccessExactConflicts') && source.includes('formatSiteAccessConflict') && source.includes('SITE_ACCESS_CATEGORY_FIELDS'));
  expectTrue('Pages 应包含系统日志导航和查询接口', source.includes('data-page="client-logs"') && source.includes('/client-logs/v1'));
  expectTrue('Pages 系统日志应支持终端/等级/类别筛选', source.includes('client-log-device-input') && source.includes('client-log-level-input') && source.includes('client-log-category-input'));
  expectTrue('Pages 系统日志应支持远程诊断策略和 TTL', source.includes('clientLoggingPolicyV1') && source.includes('client-log-policy-ttl') && source.includes('expiresAt'));
  expectTrue('Pages 日志上传 TTL 应为 1/3/7 天', source.includes('value="86400000">1 天') && source.includes('value="259200000">3 天') && source.includes('value="604800000">7 天'));
  expectTrue('Pages 日志上传 TTL 不应保留小时级选项', !source.includes('value="3600000">1 小时') && !source.includes('value="21600000">6 小时') && !source.includes('value="86400000">24 小时'));
  const saveClientLoggingPolicySource = extractFunctionSource(source, 'saveClientLoggingPolicy');
  expectTrue('Pages 日志策略保存应只提交 clientLoggingPolicyV1', saveClientLoggingPolicySource.includes("{ data: { clientLoggingPolicyV1: nextPolicy } }"));
  expectTrue('Pages 日志策略保存不应提交完整 remoteConfig', !saveClientLoggingPolicySource.includes('{ data: remoteConfig }') && !saveClientLoggingPolicySource.includes('remoteConfig.clientLoggingPolicyV1 = nextPolicy'));
  expectTrue('Pages 日志开启策略应包含上传过滤字段', saveClientLoggingPolicySource.includes('uploadEnabled: true') && saveClientLoggingPolicySource.includes('uploadMinLevel: level') && saveClientLoggingPolicySource.includes('uploadCategories') && saveClientLoggingPolicySource.includes('targetDeviceIds') && saveClientLoggingPolicySource.includes('expiresAt'));
  expectTrue('Pages 日志关闭策略只更新上传策略字段', saveClientLoggingPolicySource.includes('uploadEnabled: false') && saveClientLoggingPolicySource.includes("uploadMinLevel: 'error'") && saveClientLoggingPolicySource.includes('uploadCategories: []') && saveClientLoggingPolicySource.includes('targetDeviceIds: []'));
  expectTrue('Pages API 错误应优先展示 message', source.includes('data.message || data.error || `HTTP ${r.status}`'));

  // 系统配置文案检查
  expectTrue('pages 应使用"系统配置"文案', source.includes('系统配置'));
  expectTrue('pages 不应再使用"系统默认"文案', !/系统默认（不可编辑）/.test(source));

  // 综合网站系统配置拆分检查
  expectTrue('pages 应包含系统配置综合网站区', source.includes('系统配置综合网站（只读）'));
  expectTrue('pages 应包含家长自定义综合网站区', source.includes('家长自定义综合网站'));
  expectTrue('pages 应包含综合网站系统配置标签容器', source.includes('id="r-composite-default-tags"'));

  // 时间段管理：per-day 结构检查
  expectTrue('pages 应使用 timeWindows.daily 结构', source.includes('timeWindows.daily'));
  expectTrue('pages 应包含七天配置', source.includes("'monday'") && source.includes("'sunday'"));
  expectTrue('pages 学习时段默认应为 null（全天允许）', source.includes('studyWindows: null'));
  expectTrue('pages 综合时段默认应为 null（全天允许）', source.includes('compositeWindows: null'));
  expectTrue('pages 休息时段默认应为 15:30-24:00', source.includes("'15:30'") && source.includes("'24:00'"));
  expectTrue('pages 时间段管理应显示综合时段', source.includes('综合时段') && source.includes('addCompositeWindow') && source.includes('removeCompositeWindow'));
  expectTrue('saveScheduleConfig 应提交 daily 结构', source.includes('timeWindows: { daily }'));
  expectTrue('saveScheduleConfig 应提交 compositeWindows', extractFunctionSource(source, 'saveScheduleConfig').includes('compositeWindows'));
  expectTrue('saveScheduleConfig 不应提交 onlineWindows', !/saveScheduleConfig[\s\S]{0,500}onlineWindows/.test(source));
  expectTrue('schedule 不应被 saveScheduleConfig 覆盖', !/saveScheduleConfig[\s\S]{0,300}schedule/.test(source));

  // 最小行为级断言：综合网站列表绑定 compositeList
  const setupRulesSource = extractFunctionSource(source, 'setupRules');
  const captured = [];
  const context = {
    setupCustomDomainInput: (...args) => captured.push(args),
    document: {
      getElementById: () => ({ addEventListener: () => {} })
    },
    renderTagsFiltered: () => {},
    saveSiteAccessConfig: () => {},
    exportSiteAccessConfig: () => {},
    importSiteAccessConfig: () => {},
    remoteConfig: { studyList: [] },
    this: null
  };
  context.this = context;

  vm.runInNewContext(`${setupRulesSource}\nthis.__fn = setupRules;`, context, { filename: 'pages/index.html' });
  context.__fn();

  const composite = captured.find((entry) => entry[0] === 'r-composite-input');
  expectTrue('综合网站列表应完成 setupCustomDomainInput 绑定', !!composite);
  expectEqual('综合网站列表 customKey 应为 customCompositeList', composite?.[3], 'customCompositeList');

  const total = passed + failed;
  console.log(`\n[Pages Config v1.2 Fields] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

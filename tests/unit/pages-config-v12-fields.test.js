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
  expectTrue('Pages 控制台应包含 v1 stats 适配器', source.includes('function fetchProfileStats'));
  expectTrue('Pages 登录注册邮箱应统一小写', source.includes('function normalizeEmailInput') && source.includes("normalizeEmailInput(document.getElementById('login-email').value)") && source.includes("normalizeEmailInput(document.getElementById('reg-email').value)"));
  expectTrue('auth.js 绑定登录邮箱应统一小写', authSource.includes('const normalizedEmail') && authSource.includes('email: normalizedEmail'));
  expectTrue('bind.js 登录与保存凭据邮箱应统一小写', bindSource.includes("document.getElementById('email').value.trim().toLowerCase()"));
  expectTrue('Pages 控制台应兼容 stats_v1 duration_seconds', source.includes('duration_seconds'));
  expectTrue('Pages 日期应使用本地日期，不应使用 toISOString 作为显示/查询日期', !/function fmtDate\(d\)\s*\{\s*return d\.toISOString\(\)/.test(source));
  expectTrue('Pages 应包含落账明细导航', source.includes('data-page="settlements"') && source.includes('落账明细'));
  expectTrue('Pages 落账页应读取 usage-segments/v1', source.includes('/usage-segments/v1'));
  expectTrue('Pages 落账页应支持终端筛选和终端列', source.includes('settlement-device-input') && source.includes("params.set('deviceId', deviceInput.value)") && source.includes('终端'));
  expectTrue('Pages 应有媒体落账入口', source.includes('data-page="media-settlements"') && source.includes('媒体落账'));
  expectTrue('Pages 媒体落账页应读取 media-segments/v1', source.includes('/media-segments/v1'));
  expectTrue('Pages 媒体落账页应支持终端筛选', source.includes('media-settlement-device-input') && source.includes('selectedCloudDeviceLabel'));
  expectTrue('Pages 媒体落账页应支持媒体类型筛选', source.includes('media-settlement-class-input') && source.includes('mediaClass'));
  expectTrue('Pages 媒体落账页应展示五类媒体统计', source.includes('前台音频') && source.includes('后台音频') && source.includes('前台视频') && source.includes('后台视频') && source.includes('PiP'));
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
  expectTrue('Pages 访问规则添加/导入/保存应校验精确跨类重复', source.includes('function findSiteAccessExactConflicts') && source.includes('formatSiteAccessConflict') && source.includes('SITE_ACCESS_CATEGORY_FIELDS'));
  expectTrue('Pages 应包含系统日志导航和查询接口', source.includes('data-page="client-logs"') && source.includes('/client-logs/v1'));
  expectTrue('Pages 系统日志应支持终端/等级/类别筛选', source.includes('client-log-device-input') && source.includes('client-log-level-input') && source.includes('client-log-category-input'));
  expectTrue('Pages 系统日志应支持远程诊断策略和 TTL', source.includes('clientLoggingPolicyV1') && source.includes('client-log-policy-ttl') && source.includes('expiresAt'));

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
  expectTrue('pages 休息时段默认应为 15:30-24:00', source.includes("'15:30'") && source.includes("'24:00'"));
  expectTrue('saveScheduleConfig 应提交 daily 结构', source.includes('timeWindows: { daily }'));
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

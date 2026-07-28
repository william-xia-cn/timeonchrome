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
  expectTrue('Pages 登录注册应保存 refreshToken', extractFunctionSource(source, 'doLogin').includes('refreshToken: r.refreshToken || null') && extractFunctionSource(source, 'doRegister').includes('refreshToken: r.refreshToken || null'));
  expectTrue('Pages 应支持 auth/refresh 并轮换本地 session', source.includes('function refreshAccountTokenForPage') && extractFunctionSource(source, 'refreshAccountTokenForPage').includes('/auth/refresh') && extractFunctionSource(source, 'refreshAccountTokenForPage').includes('refreshToken: data.refreshToken || saved.refreshToken'));
  expectTrue('Pages API 401 应先尝试 refresh 再重试', extractFunctionSource(source, 'api').includes("r.status === 401") && extractFunctionSource(source, 'api').includes('await refreshAccountTokenForPage()'));
  expectTrue('Pages logout 应吊销 refreshToken', extractFunctionSource(source, 'logout').includes('/auth/logout') && extractFunctionSource(source, 'logout').includes('refreshToken: saved.refreshToken'));
  expectTrue('Pages 改密码提示应说明终端继续同步', source.includes('修改后家长端需要重新登录；已绑定终端会继续同步') && source.includes('密码已修改，家长端需要重新登录；已绑定终端会继续同步'));
  expectTrue('auth.js 绑定登录邮箱应统一小写', authSource.includes('const normalizedEmail') && authSource.includes('email: normalizedEmail'));
  expectTrue('bind.js 登录与保存凭据邮箱应统一小写', bindSource.includes("document.getElementById('email').value.trim().toLowerCase()"));
  expectTrue('Pages 控制台应兼容 stats_v1 duration_seconds', source.includes('duration_seconds'));
  expectTrue('Pages 日期应使用本地日期，不应使用 toISOString 作为显示/查询日期', !/function fmtDate\(d\)\s*\{\s*return d\.toISOString\(\)/.test(source));
  expectTrue('Pages 不应再包含总览一级入口', !source.includes('data-page="overview"') && !source.includes('id="page-overview"'));
  expectTrue('Pages 默认 active 导航应为使用统计', source.includes('<div class="nav-item active" data-page="stats">') && source.includes('<div class="page active" id="page-stats">'));
  const navOrder = ['data-page="stats"', 'data-page="rules"', 'data-page="review"', 'data-page="account"', 'data-page="system-management"'].map(item => source.indexOf(item));
  expectTrue('Pages 左侧导航顺序应为使用统计/访问管理/网站归类审核/子用户管理/系统管理', navOrder.every(i => i >= 0) && navOrder.every((value, index) => index === 0 || value > navOrder[index - 1]));
  expectTrue('Pages 左侧不应再包含一级设备管理入口', !source.includes('data-page="devices"') && !source.includes('<span class="nav-icon">💻</span><span>设备管理</span>'));
  expectTrue('Pages 账户设置可见文案应改为子用户管理', source.includes('子用户管理') && !source.includes('<span>账户设置</span>') && !source.includes('<span>用户管理</span>'));
  expectTrue('Pages 待审核一级导航应改为网站归类审核', source.includes('<span>网站归类审核') && !source.includes('<span>待审核'));
  expectTrue('Pages 应包含系统管理导航', source.includes('data-page="system-management"') && source.includes('系统管理'));
  expectTrue('Pages 系统管理导航应位于用户管理之后', source.indexOf('data-page="account"') < source.indexOf('data-page="system-management"'));
  expectTrue('Pages 系统管理应包含统计对账/网页落账/媒体落账/系统日志/数据备份与恢复/账户管理 Tab', source.includes('data-system-management-tab="reconciliation"') && source.includes('data-system-management-tab="web-settlements"') && source.includes('data-system-management-tab="media-settlements"') && source.includes('data-system-management-tab="client-logs"') && source.includes('data-system-management-tab="backup-restore"') && source.includes('data-system-management-tab="account-management"'));
  const systemPageStart = source.indexOf('<div class="page" id="page-system-management">');
  const reconciliationPageStart = source.indexOf('data-system-management-panel="reconciliation"');
  const accountPageStart = source.indexOf('<div class="page" id="page-account">');
  const systemPageSlice = source.slice(systemPageStart, accountPageStart);
  expectTrue('Pages 统计对账应移入系统管理子 Tab', systemPageStart >= 0 && reconciliationPageStart > systemPageStart && !source.includes('id="page-reconciliation"'));
  expectTrue('Pages 设备管理不应保留顶层页面', !source.includes('id="page-devices"') && !systemPageSlice.includes('id="page-devices"'));
  expectTrue('Pages 系统管理仍应包含全部内部面板', systemPageSlice.includes('data-system-management-panel="reconciliation"') && systemPageSlice.includes('data-system-management-panel="web-settlements"') && systemPageSlice.includes('data-system-management-panel="media-settlements"') && systemPageSlice.includes('data-system-management-panel="client-logs"') && systemPageSlice.includes('data-system-management-panel="backup-restore"') && systemPageSlice.includes('data-system-management-panel="account-management"'));
  const reviewPageStart = source.indexOf('<div class="page" id="page-review">');
  const accountPageSlice = source.slice(accountPageStart, reviewPageStart);
  expectTrue('Pages 子用户管理页面标题应为子用户管理', accountPageSlice.includes('<h2>子用户管理</h2>'));
  expectTrue('Pages 设备内容应迁入子用户管理并位于档案和配置导入之间', accountPageSlice.indexOf('编辑档案') >= 0 && accountPageSlice.indexOf('devices-list') > accountPageSlice.indexOf('编辑档案') && accountPageSlice.indexOf('配置导入与导出') > accountPageSlice.indexOf('devices-list'));
  expectTrue('Pages 修改密码应迁入系统管理账户管理 Tab', systemPageSlice.includes('data-system-management-panel="account-management"') && systemPageSlice.includes('acct-save-pw-btn') && !accountPageSlice.includes('acct-save-pw-btn') && !accountPageSlice.includes('修改密码'));
  expectTrue('Pages 账户管理 Tab 应保留密码表单 ID', systemPageSlice.includes('acct-old-pw') && systemPageSlice.includes('acct-new-pw') && systemPageSlice.includes('acct-confirm-pw') && systemPageSlice.includes('acct-pw-msg'));
  expectTrue('Pages 访问管理应包含网站管理/时间配额/时间段管理/配置文件四个 Tab', source.includes('data-rules-management-tab="site-management"') && source.includes('data-rules-management-tab="quota"') && source.includes('data-rules-management-tab="schedule"') && source.includes('data-rules-management-tab="config-files"'));
  expectTrue('Pages 时间配额和时间段管理不应再作为一级页面', !source.includes('data-page="quota"') && !source.includes('data-page="schedule"') && !source.includes('id="page-quota"') && !source.includes('id="page-schedule"'));
  const renderDevicesPageSource = extractFunctionSource(source, 'renderDevicesPage');
  expectTrue('Pages 设备管理应显示云端设备 ID', renderDevicesPageSource.includes('设备ID：') && renderDevicesPageSource.includes("escHtml(d.id || '未记录')"));
  expectTrue('Pages 设备管理不应展示 device token', !renderDevicesPageSource.includes('device_token') && !renderDevicesPageSource.includes('DEVICE_TOKEN'));
  expectTrue('Pages 设备管理应包含连接诊断入口', source.includes('device-audit-panel') && renderDevicesPageSource.includes('连接诊断') && source.includes('renderDeviceAccessAudit'));
  expectTrue('Pages 连接诊断应读取 device access audit API', source.includes('/device-access-audit/v1?'));
  expectTrue('Pages 连接诊断应展示最近请求成功失败和鉴权结果', source.includes('最后成功') && source.includes('最后失败') && source.includes('auth_result') && source.includes('result_code'));
  expectTrue('Pages 连接诊断应支持恢复相关筛选和摘要', source.includes('identity_link') && source.includes('device_recovery') && source.includes('最近 recover bootstrap') && source.includes('最近 recover status') && source.includes('诊断结论'));
  expectTrue('Pages 设备管理应显示 Chrome 身份记录和最近恢复时间', renderDevicesPageSource.includes('Chrome 身份已记录') && renderDevicesPageSource.includes('last_recovered_at') && renderDevicesPageSource.includes('最近恢复'));
  expectTrue('Pages 设备管理应包含恢复请求面板', source.includes('device-recovery-requests') && source.includes('renderDeviceRecoveryRequests'));
  expectTrue('Pages 恢复请求应读取恢复 API 并提供云端确认动作', source.includes('/device-recovery-requests/v1') && source.includes('恢复到此设备') && source.includes('作为新设备') && source.includes('handleDeviceRecoveryRequest'));
  expectTrue('Pages 恢复请求应拆分待处理和最近恢复历史', source.includes('待处理恢复请求') && source.includes('最近恢复历史') && source.includes('result_device_name') && source.includes('deviceRecoveryStatusLabel'));
  expectTrue('Pages 普通落账应改名为网页落账', source.includes('网页落账') && !source.includes('落账明细</span>'));
  expectTrue('Pages 落账页应读取 usage-segments/v1', source.includes('/usage-segments/v1'));
  expectTrue('Pages 落账页应支持终端筛选和终端列', source.includes('settlement-device-input') && source.includes("params.set('deviceId', deviceInput.value)") && source.includes('终端'));
  expectTrue('Pages 云端落账页应展示紧凑备注列', source.includes('function buildCloudSettlementRemarkHtml') && source.includes('cloudEndpointOperation') && source.includes('target：') && source.includes('tab：') && source.includes('window：') && source.includes('open：') && source.includes('close：') && source.includes('来源：'));
  expectTrue('Pages 云端落账页备注应读取 Open/Close description', source.includes("cloudEndpointOperation(row?.description, 'start')") && source.includes("cloudEndpointOperation(row?.description, 'end')"));
  expectTrue('Pages 媒体落账应在系统管理 Tab 中', source.includes('data-system-management-panel="media-settlements"') && source.includes('媒体落账'));
  expectTrue('Pages 媒体落账页应读取 media-segments/v1', source.includes('/media-segments/v1'));
  expectTrue('Pages 媒体落账页应支持终端筛选', source.includes('media-settlement-device-input') && source.includes('selectedCloudDeviceLabel'));
  expectTrue('Pages 媒体落账页应支持媒体类型筛选', source.includes('media-settlement-class-input') && source.includes('mediaClass'));
  expectTrue('Pages 媒体落账页应展示五类媒体统计', source.includes('前台音频') && source.includes('后台音频') && source.includes('前台视频') && source.includes('后台视频') && source.includes('PiP'));
  expectTrue('Pages 媒体落账页应复用备注列展示 tab/window/open/close/source', source.includes("buildCloudSettlementRemarkHtml(row, row.visibility || row.mediaKind || '—')"));
  expectTrue('Pages 系统日志页应包含云端数据下载卡片', source.includes('id="cloud-export-download-btn"') && source.includes('选择目录并下载') && source.includes('id="cloud-export-categories"'));
  expectTrue('Pages 云端数据下载应使用目录选择 API', source.includes('window.showDirectoryPicker') && source.includes('getDirectoryHandle(`${profileName}-${timestamp}`'));
  expectTrue('Pages 云端数据下载应写入 manifest 和分类路径', source.includes("writeExportFile(exportRoot, 'manifest.json'") && source.includes('dataset.path'));
  expectTrue('Pages 云端数据下载应写入可恢复 manifest 元数据', source.includes('workerSchemaVersion') && source.includes('rowCount') && source.includes('sha256') && source.includes('deviceScope'));
  expectTrue('Pages 云端数据下载应说明 site-access-editable 可手动修改', source.includes('site-access-editable.json') && source.includes('可手动修改'));
  expectTrue('Pages 云端数据下载应提示不支持目录选择的浏览器', source.includes('当前浏览器不支持直接选择目录下载'));
  expectTrue('Pages 应支持备份目录预检和恢复', source.includes('cloud-restore-select-btn') && source.includes('/restore/v1/preflight') && source.includes('/restore/v1/commit'));
  expectTrue('Pages 恢复预检应显示配置文件读取和备份摘要', source.includes('renderRestoreConfigPreflight') && source.includes('配置恢复检查') && source.includes('config/config.json') && source.includes('site-access-editable.json') && source.includes('备份摘要'));
  expectTrue('Pages 恢复完成应显示写后校验和回读结果', source.includes('renderRestoreConfigCommitStatus') && source.includes('写后校验') && source.includes('回读当前配置') && source.includes('恢复后摘要'));
  expectTrue('Pages 恢复提交后应重新读取当前配置', extractFunctionSource(source, 'commitCloudRestore').includes("api(`/profiles/${currentProfileId}/config`)") && extractFunctionSource(source, 'commitCloudRestore').includes('remoteConfig = refreshed.data || {}'));
  expectTrue('Pages 恢复应区分安全合并和整包覆盖', source.includes('安全合并恢复') && source.includes('整包覆盖恢复') && source.includes("confirmText: replace ? confirmText : undefined"));
  expectTrue('Pages 网站管理不应再包含独立导入导出按钮', !source.includes('import-rules-btn') && !source.includes('export-rules-btn'));
  expectTrue('Pages 用户管理应包含配置导入与导出入口', source.includes('配置导入与导出') && source.includes('acct-export-config-btn') && source.includes('acct-import-config-btn'));
  expectTrue('Pages 配置导出应为 profile-config 结构', source.includes("configType: 'profile-config'") && source.includes('siteAccess') && source.includes('quota') && source.includes('timeWindows'));
  expectTrue('Pages 档案配置导出不应混入系统默认清单', !extractFunctionSource(source, 'buildProfileConfigExportData').includes('systemDefaults') && source.includes('customLists') && source.includes('classificationRules') && source.includes('classificationRequests'));
  expectTrue('Pages 配置导入不应写回 systemDefaults', !extractFunctionSource(source, 'buildProfileConfigImportPayload').includes('systemDefaults'));
  expectTrue('Pages 访问管理配置文件应使用单一导入导出入口', source.includes('rules-access-config-export-btn') && source.includes('rules-access-config-import-btn') && source.includes('rules-access-config-import-result') && !source.includes('rules-profile-export-config-btn') && !source.includes('rules-system-export-config-btn'));
  expectTrue('Pages 访问管理配置文件默认提供用户配置和系统配置两个范围', source.includes('rules-config-scope-user') && source.includes('rules-config-scope-system') && source.includes('用户配置') && source.includes('系统配置'));
  expectTrue('Pages 配置文件页应显示当前档案用户配置摘要', source.includes('rules-profile-custom-summary') && source.includes('当前档案用户配置摘要') && source.includes('只影响当前孩子档案；系统配置才会影响所有孩子档案'));
  expectTrue('Pages 用户配置摘要应读取四类 custom 网站清单', source.includes('function renderProfileCustomConfigSummary') && source.includes('function profileCustomListForPolicy') && extractFunctionSource(source, 'renderProfileCustomConfigSummary').includes('classificationPolicyDefs()') && source.includes('customStudyList') && source.includes('customCompositeList') && source.includes('customRestrictedEntertainmentList') && source.includes('customBlockedSites'));
  expectTrue('Pages profile 复合导出 fallback 应排除 defaultUserCompositeSites', extractFunctionSource(source, 'buildProfileConfigExportData').includes('compositeExportDefaults') && extractFunctionSource(source, 'buildProfileConfigExportData').includes('defaultUserCompositeSites') && extractFunctionSource(source, 'buildProfileConfigExportData').includes('getCustomList(cfg.compositeList, compositeExportDefaults)'));
  expectTrue('Pages 访问管理配置新导出应使用 bundle 格式', source.includes('ACCESS_MANAGEMENT_BUNDLE_TYPE') && source.includes('access-management-config-bundle') && source.includes('buildAccessManagementConfigBundle') && source.includes('exportAccessManagementConfigBundle'));
  expectTrue('Pages 访问管理配置导入应兼容旧 profile/system 格式', extractFunctionSource(source, 'normalizeAccessManagementConfigBundleFile').includes("data.configType === 'profile-config'") && extractFunctionSource(source, 'normalizeAccessManagementConfigBundleFile').includes("data.configType === 'system-access-config'"));
  expectTrue('Pages 系统配置应使用 system-access-config API', source.includes('/system/access-management-config/v1') && source.includes('/system/access-management-config/v1/preflight'));
  expectTrue('Pages 系统配置文件应使用 Qustodio taxonomy', source.includes('system-access-config') && source.includes('qustodio-web-filters-v1') && source.includes('Qustodio 分类'));
  expectTrue('Pages 系统网站配置导入应使用差异确认和勾选应用', source.includes('SYSTEM_CONFIG_IMPORT_LIST_FIELDS') && source.includes('buildSystemAccessConfigImportDiffs') && source.includes('buildSystemAccessConfigImportPayload') && source.includes('applyHandler: applyAccessManagementConfigImport') && source.includes('系统配置应用后全局生效'));
  expectTrue('Pages 配置导入应提交最小可写字段', extractFunctionSource(source, 'buildProfileConfigImportPayload').includes('customStudyList') && extractFunctionSource(source, 'buildProfileConfigImportPayload').includes('siteClassificationRulesV1') && extractFunctionSource(source, 'buildProfileConfigImportPayload').includes('timeQuota') && extractFunctionSource(source, 'buildProfileConfigImportPayload').includes('timeWindows'));
  expectTrue('Pages 配置导入应先生成差异确认区', source.includes('acct-config-import-diff') && source.includes('configImportDiffState') && source.includes('buildProfileConfigImportDiffs') && source.includes('renderConfigImportDiffPanel'));
  expectTrue('Pages 配置导入应展示新增删除修改筛选', source.includes('data-config-import-filter="${type}"') && source.includes("['all','add','delete','modify']"));
  expectTrue('Pages 配置导入差异应逐项勾选应用', source.includes('data-config-import-diff-id') && source.includes('全选差异') && source.includes('取消全选') && source.includes('应用选中差异'));
  expectTrue('Pages 配置导入全选应标明覆盖当前配置', source.includes('应用全部差异（覆盖当前配置）'));
  expectTrue('Pages 配置导入选择文件后不应直接 PUT config', !extractFunctionSource(source, 'importProfileConfig').includes("api(`/profiles/${currentProfileId}/config`, 'PUT'"));
  expectTrue('Pages 配置导入应用选中项后应重新读取 config', extractFunctionSource(source, 'applySelectedConfigImportDiffs').includes("api(`/profiles/${currentProfileId}/config`)"));
  expectTrue('Pages 配置导入应复用现有 PUT config API', extractFunctionSource(source, 'applySelectedConfigImportDiffs').includes("api(`/profiles/${currentProfileId}/config`, 'PUT', { data: payload })"));
  expectTrue('Pages 配置导入应规范化 YouTube playlist 后比较规则', extractFunctionSource(source, 'configImportRuleKey').includes('canonicalDisplayUrlValue') && source.includes('uniqueSiteRules(importedRules)'));
  expectTrue('Pages 配置导入应用前应继续校验跨分类冲突', extractFunctionSource(source, 'buildProfileConfigImportPayload').includes('findSiteAccessExactConflicts'));
  expectTrue('Pages 落账相关域名筛选应标明关键词筛选', (source.match(/placeholder="域名关键词筛选"/g) || []).length >= 3);
  expectTrue('Pages 落账页应支持今日/昨日/本周/全部', source.includes('data-settlement-range="today"') && source.includes('data-settlement-range="yesterday"') && source.includes('data-settlement-range="week"') && source.includes('data-settlement-range="all"'));
  expectTrue('Pages 落账页应支持 nextCursor 加载更多', source.includes('nextCursor') && source.includes('settlement-load-more-btn'));
  expectTrue('Pages 落账页应标明最新记录在最上方', source.includes('最新记录显示在最上方'));
  expectTrue('Pages 统计对账不应再是一级导航', !source.includes('data-page="reconciliation"') && source.includes('data-system-management-tab="reconciliation"'));
  expectTrue('Pages 统计对账应读取 stats-reconciliation/v1', source.includes('/stats-reconciliation/v1'));
  expectTrue('Pages 统计对账应展示统计表、落账聚合、差异、状态', source.includes('统计表') && source.includes('落账聚合') && source.includes('差异') && source.includes('状态'));
  expectTrue('Pages 统计对账应支持显示全部开关', source.includes('reconciliation-show-all'));
  expectTrue('Pages 应包含网站归类审核入口', source.includes('网站归类审核') && source.includes('site-classification-requests/v1'));
  expectTrue('Pages 网站归类记录应支持审批生效对象编辑', source.includes('审批生效对象') && source.includes('site-request-type-') && source.includes('site-request-target-'));
  expectTrue('Pages 应为访问记录提供确认/暂不归类动作', source.includes('确认为学习网站') && source.includes('确认为复合网站') && source.includes('暂不归类') && source.includes('归为受限娱乐'));
  expectTrue('Pages 应为学习申请提供批准/改为复合/退回动作', source.includes('批准归为学习网站') && source.includes('改为复合网站') && source.includes('退回申请'));
  expectTrue('Pages 应展示两类记录及聚合访问字段', source.includes('未归类网站访问记录') && source.includes('学习网站归类申请') && source.includes('firstObservedAt') && source.includes('lastObservedAt') && source.includes('observationCount'));
  expectTrue('Pages 移动端归类审核应使用单列记录和两列动作', source.includes('grid-template-columns: minmax(0, 1fr)') && source.includes('.site-request-actions .btn-classify') && source.includes('grid-template-columns: 1fr 1fr'));
  expectTrue('Pages 网站归类记录应支持全部历史筛选', source.includes('site-classification-status-filter') && source.includes('value="all"'));
  expectTrue('Pages 访问规则页不应单独展示已批准精确链接规则', !source.includes('已批准精确链接 / 管理对象规则') && !source.includes('r-approved-target-rules-display') && !source.includes('renderApprovedTargetRules'));
  expectTrue('Pages 访问规则页应把已批准 URL 规则合并到对应分类', source.includes('approvedUrlRulesForListKey') && source.includes("listKey === 'customStudyList'") && source.includes("listKey === 'customCompositeList'") && source.includes("listKey === 'customRestrictedEntertainmentList'") && !source.includes("listKey === 'customBlockedSites'\\n        ? 'reject'"));
  expectTrue('Pages URL 规则展示应去重', source.includes('function uniqueSiteRules') && source.includes('return uniqueSiteRules'));
  expectTrue('Pages URL 规则展示应规范化 YouTube playlist 历史值', source.includes('function canonicalDisplayUrlValue') && source.includes('https://www.youtube.com/playlist?list=${playlistId}'));
  expectTrue('Pages 访问规则添加/导入/保存应校验精确跨类重复', source.includes('function findSiteAccessExactConflicts') && source.includes('formatSiteAccessConflict') && source.includes('SITE_ACCESS_CATEGORY_FIELDS'));
  expectTrue('Pages 添加网站应先校验输入、系统配置和用户自定义重复', source.includes('function validateRulesSiteAdd') && source.includes('getPolicyDefaultList(def)') && source.includes('getPolicyCustomList(def)') && source.includes('该网站已在系统网站配置-分类管理的当前策略中') && source.includes('该网站已在用户自定义配置中') && source.includes('function findProtectedSiteAccessScope') && source.includes('不能归为'));
  expectTrue('Pages 添加入口不应静默移动其他策略已有网站', extractFunctionSource(source, 'addSiteToCurrentPolicy').includes('validateRulesSiteAdd') && extractFunctionSource(source, 'addSiteToCurrentPolicy').includes("toast(validation.message") && source.includes('请点击已有网站的“归为…”操作移动分类'));
  expectTrue('Pages 自定义网站移动应保持 canonical 去重', source.includes('function uniqueSiteAccessValues') && extractFunctionSource(source, 'moveCustomSiteToPolicy').includes('uniqueSiteAccessValues'));
  expectTrue('Pages 用户自定义网站应支持提升到系统配置', source.includes('window.promoteCustomSiteToSystemConfig') && source.includes('添加到系统配置') && source.includes('从当前档案用户自定义配置中移除') && source.includes('function defaultSystemContentCategoryForPolicy') && source.includes('function buildCustomSiteAccessPayload') && source.includes('Promote ${normalized} from profile custom list to system access config'));
  expectTrue('Pages 用户自定义网站提升到系统配置应受 admin 权限控制', source.includes('window.promoteCustomSiteToSystemConfig') && source.includes('systemAccessCanWrite') && source.includes('需要系统管理员权限才能添加到系统配置') && source.includes('disabled title="需要系统管理员权限"'));
  expectTrue('Pages 用户自定义网站提升后应保存系统配置并移除 profile 自定义项', source.includes("/system/access-management-config/v1', 'PUT'") && source.includes('/profiles/${currentProfileId}/config') && source.includes('buildCustomSiteAccessPayload(remoteConfig)'));
  expectTrue('Pages 应包含系统日志 Tab 和查询接口', source.includes('data-system-management-panel="client-logs"') && source.includes('/client-logs/v1'));
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
  expectTrue('pages 应使用"系统网站配置"文案', source.includes('系统网站配置'));
  expectTrue('pages 不应再使用旧访问管理配置命名', !source.includes('档案访问管理配置') && !source.includes('系统访问管理配置') && !source.includes('当前档案自定义') && !source.includes('分类管理（系统配置）'));
  expectTrue('pages 不应再使用"系统默认"文案', !/系统默认（不可编辑）/.test(source));

  // 网站管理策略目录检查
  expectTrue('Pages 网站管理应使用左右策略目录', source.includes('rules-policy-shell') && source.includes('rules-policy-nav') && source.includes('rules-site-directory'));
  expectTrue('Pages 网站管理应按管理策略分类显示', source.includes('RULES_POLICY_DEFS') && source.includes("key: 'study'") && source.includes("key: 'composite'") && source.includes("key: 'restricted'") && source.includes("key: 'blocked'"));
  expectTrue('Pages 已使用未归类网站应是独立策略目录项', source.includes("key: 'used-unclassified'") && source.includes('isUsedUnclassified: true') && source.includes('/used-unclassified-sites/v1?days=30') && source.includes('data-used-unclassified-module="true"'));
  expectTrue('Pages 复合网站不应再承载已使用未归类网站', !source.includes("def.key === 'composite' ? (rulesSitePolicyState.usedUnclassified || [])") && !source.includes("if (def.key === 'composite') {\n    for (const site of rulesSitePolicyState.usedUnclassified") && source.includes('if (def.isUsedUnclassified) {'));
  expectTrue('Pages 网站目录应按来源分组', source.includes('系统网站配置-分类管理') && source.includes('用户自定义配置') && source.includes('已批准精确规则') && source.includes('data-source-group'));
  expectTrue('Pages 已使用未归类网站模块应禁用普通添加入口', source.includes('def.isSpecial || def.isUsedUnclassified') && source.includes('已使用未归类网站来自最近使用历史，不能手动添加'));
  expectTrue('Pages 复合策略应把 defaultUserCompositeSites 纳入系统默认读取', source.includes("defaultKeys: ['defaultCompositeSites', 'defaultUserCompositeSites']") && source.includes('function getPolicyDefaultList') && source.includes('rulesPolicyDefaultKeys(def)'));
  expectTrue('Pages 系统配置应显示页面内分类管理', source.includes('系统网站配置-分类管理') && source.includes('data-system-category-management') && source.includes('rules-system-category-group'));
  expectTrue('Pages 系统配置应按 siteCatalog 内容分类分组', source.includes('systemSiteCatalogEntryForValue') && source.includes('siteCatalog') && source.includes('contentCategory') && source.includes('未标注分类'));
  expectTrue('Pages 网站管理策略目录顺序应将已使用未归类放在特殊网站之后', source.indexOf("key: 'special'") > 0 && source.indexOf("key: 'used-unclassified'") > source.indexOf("key: 'special'"));
  expectTrue('Pages 网站管理应包含特殊网站 YouTube 规则列表', source.includes('YouTube 特殊对象规则') && source.includes('data-special-site-management="youtube"') && source.includes('rules-special-list') && source.includes('youtubeSpecialRuleRows') && source.includes('specialRuleActionButtons') && source.includes('根域固定') && source.includes('每个 YouTube 细节对象一行展示') && source.includes('classifySpecialSiteRule'));
  expectTrue('Pages 特殊网站应是策略目录项而不是来源筛选项', source.includes("key: 'special'") && source.includes('isSpecial: true') && !source.includes('<option value="special">特殊网站</option>') && source.includes('if (def.isSpecial) {') && source.includes('container.innerHTML = renderSpecialSitesSummary();'));
  expectTrue('Pages 普通分类菜单不应允许归为特殊网站', source.includes('policyOptionsHtml(selected)') && source.includes('classificationPolicyDefs()') && source.includes('特殊对象规则通过孩子端 Popup 申请'));
  expectTrue('Pages YouTube 特殊对象分类应支持当前可生效管理属性', source.includes('specialRuleDecisionPatch') && source.includes("targetPolicy === 'restricted'") && source.includes("decision: 'reject'") && source.includes('点击保存后同步'));
  expectTrue('Pages 未标注分类应解释为目录元数据缺失', source.includes('当前策略下的系统网站配置按 Qustodio 内容分类分组') && source.includes('不是网站未归类') && source.includes('需要补齐系统目录元数据'));
  expectTrue('Pages 系统项编辑应包含内容分类和管理策略控件', source.includes('rules-system-content-category-select') && source.includes('rules-system-policy-select') && source.includes('保存系统分类'));
  expectTrue('Pages 点击自定义/未归类网站应支持归类菜单', source.includes('classifyRulesSiteEntry') && source.includes('归为${htmlEscape(def.label)}') && source.includes('RULES_POLICY_DEFS'));
  expectTrue('Pages 系统配置分类保存应要求全局确认', source.includes('saveSystemSiteCategoryEdit') && source.includes('系统网站配置-分类管理保存后会全局生效，影响所有孩子档案') && source.includes('canWrite'));
  expectTrue('Pages 非 admin 应禁用系统分类编辑', source.includes('需要系统管理员权限') && source.includes('disabled title="需要系统管理员权限"'));
  const validateRulesSiteAddSource = [
    `const RULES_POLICY_DEFS = [
      { key: 'study', label: '学习网站', customKey: 'customStudyList', effectiveKey: 'studyList', defaultKey: 'defaultStudySites' },
      { key: 'composite', label: '复合网站', customKey: 'customCompositeList', effectiveKey: 'compositeList', defaultKey: 'defaultCompositeSites', defaultKeys: ['defaultCompositeSites', 'defaultUserCompositeSites'] },
      { key: 'restricted', label: '受限娱乐网站', customKey: 'customRestrictedEntertainmentList', effectiveKey: 'restrictedEntertainmentList', defaultKey: 'defaultRestrictedEntertainmentSites' },
      { key: 'blocked', label: '黑名单网站', customKey: 'customBlockedSites', effectiveKey: 'unsafeList', defaultKey: 'defaultBlockedSites' },
    ];`,
    extractFunctionSource(source, 'normalizeSiteAccessHostname'),
    extractFunctionSource(source, 'normalizeSiteAccessHostKey'),
    extractFunctionSource(source, 'normalizeSiteAccessInput'),
    extractFunctionSource(source, 'getCustomList'),
    "function rulesPolicyDefaultKeys(def = {}) { return Array.isArray(def.defaultKeys) && def.defaultKeys.length ? def.defaultKeys : [def.defaultKey].filter(Boolean); }",
    "function getPolicyDefaultList(def, defaults = siteAccessDefaults || {}) { const out = []; const seen = new Set(); for (const key of rulesPolicyDefaultKeys(def)) { const values = Array.isArray(defaults?.[key]) ? defaults[key] : []; for (const value of values) { const hostKey = normalizeSiteAccessHostKey(value); if (!hostKey || seen.has(hostKey)) continue; seen.add(hostKey); out.push(value); } } return out; }",
    `function getSiteAccessListsForValidation(config = remoteConfig, defaults = siteAccessDefaults || {}) {
      const customOrEffective = (customKey, effectiveKey, defaultList) => {
        if (Array.isArray(config?.[customKey])) return config[customKey];
        return getCustomList(config?.[effectiveKey] || [], defaultList || []);
      };
      const groups = [
        { category: 'study', label: '学习网站', key: 'customStudyList', values: [...(defaults.defaultStudySites || []), ...customOrEffective('customStudyList', 'studyList', defaults.defaultStudySites)] },
        { category: 'composite', label: '复合网站', key: 'customCompositeList', values: [...(defaults.defaultCompositeSites || []), ...(defaults.defaultUserCompositeSites || []), ...customOrEffective('customCompositeList', 'compositeList', [...(defaults.defaultCompositeSites || []), ...(defaults.defaultUserCompositeSites || [])])] },
        { category: 'restricted', label: '受限娱乐网站', key: 'customRestrictedEntertainmentList', values: [...(defaults.defaultRestrictedEntertainmentSites || []), ...customOrEffective('customRestrictedEntertainmentList', 'restrictedEntertainmentList', defaults.defaultRestrictedEntertainmentSites)] },
        { category: 'blocked', label: '黑名单网站', key: 'customBlockedSites', values: [...(defaults.defaultBlockedSites || []), ...customOrEffective('customBlockedSites', 'unsafeList', defaults.defaultBlockedSites)] },
      ];
      return groups.flatMap(group => group.values.map(value => ({ ...group, value })));
    }`,
    `function matchDomain(domain, pattern) {
      const d = normalizeSiteAccessHostname(domain);
      const p = normalizeSiteAccessHostname(pattern);
      return !!d && !!p && (d === p || d.endsWith('.' + p));
    }`,
    `function getPolicyCustomList(def, config = remoteConfig, defaults = siteAccessDefaults || {}) {
      if (Array.isArray(config?.[def.customKey])) return config[def.customKey];
      return getCustomList(config?.[def.effectiveKey] || [], getPolicyDefaultList(def, defaults));
    }`,
    extractFunctionSource(source, 'siteAccessExactListMatch'),
    `function findProtectedSiteAccessScope(value, targetPolicy, config = remoteConfig, defaults = siteAccessDefaults || {}) {
      const normalized = normalizeSiteAccessInput(value);
      if (!normalized) return null;
      const targetKey = normalizeSiteAccessHostKey(normalized);
      const targetIsBlocked = targetPolicy === 'blocked';
      const targetIsLearningOrComposite = targetPolicy === 'study' || targetPolicy === 'composite';
      for (const entry of getSiteAccessListsForValidation(config, defaults)) {
        if (entry.category !== 'blocked' && entry.category !== 'restricted') continue;
        const entryValue = normalizeSiteAccessInput(entry.value);
        if (!entryValue) continue;
        const entryKey = normalizeSiteAccessHostKey(entryValue);
        if (!entryKey || entryKey === targetKey) continue;
        if (!matchDomain(normalized, entryValue)) continue;
        if (entry.category === 'blocked' && !targetIsBlocked) return entry;
        if (entry.category === 'restricted' && targetIsLearningOrComposite) return entry;
      }
      return null;
    }`,
    `function formatProtectedSiteAccessScopeMessage(scope, targetDef) {
      const protectedLabel = scope?.label || '受限娱乐/黑名单';
      const targetLabel = targetDef?.label || '当前分类';
      return '该网站位于' + protectedLabel + '范围内，不能归为' + targetLabel + '。请先调整父域策略。';
    }`,
    extractFunctionSource(source, 'validateRulesSiteAdd'),
    `this.__run = () => ({
      invalid: validateRulesSiteAdd('', 'study'),
      currentSystem: validateRulesSiteAdd('https://www.drive.google.com/docs', 'study'),
      otherSystem: validateRulesSiteAdd('netflix.com', 'study'),
      userCompositeSystem: validateRulesSiteAdd('wikipedia.org', 'study'),
      currentCustom: validateRulesSiteAdd('custom-study.example.com', 'study'),
      otherCustom: validateRulesSiteAdd('custom-game.example.com', 'study'),
      protectedStudy: validateRulesSiteAdd('learn.games.example.com', 'study'),
      protectedComposite: validateRulesSiteAdd('watch.games.example.com', 'composite'),
      allowedStudyChild: validateRulesSiteAdd('docs.google.com', 'study'),
      ok: validateRulesSiteAdd('NEW-SITE.example.com/path', 'study'),
    });`,
  ].join('\n');
  const validateContext = {
    remoteConfig: {
      customStudyList: ['custom-study.example.com'],
      customRestrictedEntertainmentList: ['custom-game.example.com'],
    },
    siteAccessDefaults: {
      defaultStudySites: ['drive.google.com'],
      defaultCompositeSites: ['google.com'],
      defaultUserCompositeSites: ['wikipedia.org'],
      defaultRestrictedEntertainmentSites: ['netflix.com', 'games.example.com'],
      defaultBlockedSites: ['tiktok.com'],
    },
    URL,
  };
  vm.runInNewContext(validateRulesSiteAddSource, validateContext, { filename: 'pages/index.html#validateRulesSiteAdd' });
  const addValidation = validateContext.__run();
  expectTrue('添加网站非法输入应明确失败', addValidation.invalid.ok === false && addValidation.invalid.message.includes('请输入有效域名'));
  expectTrue('添加网站应检查当前策略系统配置重复', addValidation.currentSystem.ok === false && addValidation.currentSystem.message.includes('系统网站配置-分类管理的当前策略'));
  expectTrue('添加网站应检查其他策略系统配置重复', addValidation.otherSystem.ok === false && addValidation.otherSystem.message.includes('系统网站配置-分类管理的受限娱乐网站'));
  expectTrue('添加网站应检查 defaultUserCompositeSites 系统复合默认', addValidation.userCompositeSystem.ok === false && addValidation.userCompositeSystem.message.includes('复合网站'));
  expectTrue('添加网站应检查当前策略用户自定义重复', addValidation.currentCustom.ok === false && addValidation.currentCustom.message.includes('用户自定义配置'));
  expectTrue('添加网站应阻止静默移动其他策略自定义网站', addValidation.otherCustom.ok === false && addValidation.otherCustom.message.includes('归为'));
  expectTrue('添加网站应阻止受限父域下新增学习网站', addValidation.protectedStudy.ok === false && addValidation.protectedStudy.message.includes('受限娱乐网站范围内'));
  expectTrue('添加网站应阻止受限父域下新增复合网站', addValidation.protectedComposite.ok === false && addValidation.protectedComposite.message.includes('受限娱乐网站范围内'));
  expectTrue('添加网站应允许复合父域下细分学习子域', addValidation.allowedStudyChild.ok === true);
  expectTrue('添加网站有效新域名应规范化后通过', addValidation.ok.ok === true && addValidation.ok.value === 'new-site.example.com');
  // 时间段管理：per-day 结构检查
  expectTrue('pages 应使用 timeWindows.daily 结构', source.includes('timeWindows.daily'));
  expectTrue('pages 应包含七天配置', source.includes("'monday'") && source.includes("'sunday'"));
  expectTrue('pages 学习时段默认应为 null（全天允许）', source.includes('studyWindows: null'));
  expectTrue('pages 复合时段默认应为 null（全天允许）', source.includes('compositeWindows: null'));
  expectTrue('pages 休息时段默认应为 15:30-24:00', source.includes("'15:30'") && source.includes("'24:00'"));
  expectTrue('pages 时间段管理应显示复合时段', source.includes('复合时段') && source.includes('addCompositeWindow') && source.includes('removeCompositeWindow'));
  expectTrue('saveScheduleConfig 应提交 daily 结构', source.includes('timeWindows: { daily }'));
  expectTrue('saveScheduleConfig 应提交 compositeWindows', extractFunctionSource(source, 'saveScheduleConfig').includes('compositeWindows'));
  expectTrue('saveScheduleConfig 不应提交 onlineWindows', !/saveScheduleConfig[\s\S]{0,500}onlineWindows/.test(source));
  expectTrue('schedule 不应被 saveScheduleConfig 覆盖', !/saveScheduleConfig[\s\S]{0,300}schedule/.test(source));

  // 最小行为级断言：网站管理绑定策略目录入口
  const setupRulesSource = extractFunctionSource(source, 'setupRules');
  const touched = [];
  const context = {
    addSiteToCurrentPolicy: () => {},
    saveSiteAccessConfig: () => {},
    exportAccessManagementConfigBundle: () => {},
    importAccessManagementConfigBundle: () => {},
    renderRulesSiteDirectory: () => {},
    rulesSitePolicyState: { query: '', source: 'all' },
    document: {
      getElementById: (id) => ({ addEventListener: (event) => touched.push(`${id}:${event}`) })
    },
    this: null
  };
  context.this = context;

  vm.runInNewContext(`${setupRulesSource}\nthis.__fn = setupRules;`, context, { filename: 'pages/index.html' });
  context.__fn();

  expectTrue('网站管理应绑定策略目录搜索和来源筛选', touched.includes('rules-site-search:input') && touched.includes('rules-site-source-filter:change'));
  expectTrue('网站管理应绑定当前策略添加入口', touched.includes('rules-site-add-btn:click') && touched.includes('rules-site-add-input:keydown'));
  const total = passed + failed;
  console.log(`\n[Pages Config v1.2 Fields] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

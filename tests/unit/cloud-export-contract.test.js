// cloud-export-contract.test.js
// Run with: node tests/unit/cloud-export-contract.test.js

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function expectTrue(desc, cond) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
  }
}

function run() {
  const exportSource = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'export.ts'), 'utf8');
  const restoreSource = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'restore.ts'), 'utf8');
  const indexSource = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'index.ts'), 'utf8');
  const profilesSource = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'profiles.ts'), 'utf8');
  const deviceSource = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'device.ts'), 'utf8');
  const systemConfigSource = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'systemAccessConfig.ts'), 'utf8');
  const systemConfigModule = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'config', 'system-access-config.ts'), 'utf8');
  const migrationSource = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'migrations', '020_system_access_config_v1.sql'), 'utf8');

  expectTrue('Worker 应挂载 exportRouter', indexSource.includes("import { exportRouter } from './routes/export';") && indexSource.includes('export\\/v1'));
  expectTrue('Worker 应挂载 restoreRouter', indexSource.includes("import { restoreRouter } from './routes/restore';") && indexSource.includes('restore\\/v1'));
  expectTrue('Worker 应挂载 systemAccessConfigRouter', indexSource.includes("import { systemAccessConfigRouter } from './routes/systemAccessConfig';") && indexSource.includes('/system/access-management-config/v1'));
  expectTrue('导出 API 应验证账号归属', exportSource.includes('verifyAccountToken') && exportSource.includes('account_id = ?'));
  expectTrue('导出 API 应提供 manifest 和 dataset 路由', exportSource.includes('export\\/v1\\/manifest') && exportSource.includes('export\\/v1\\/([^/]+)'));
  expectTrue('导出 API 应使用固定 DATASETS 白名单', exportSource.includes('const DATASETS') && exportSource.includes('DATASET_BY_ID'));
  expectTrue('导出 API 不应选择 device_token', !exportSource.includes('device_token'));
  expectTrue('导出 API 应包含配置/落账/统计/日志/审核/诊断数据集',
    ['config', 'usage-segments', 'media-segments', 'target-stats', 'client-logs', 'site-classification-requests', 'stats-reconciliation']
      .every((name) => exportSource.includes(`id: '${name}'`)));
  expectTrue('导出 API 应支持日期和终端筛选', exportSource.includes('dateColumn') && exportSource.includes('timestampColumn') && exportSource.includes('deviceColumn'));
  expectTrue('导出 API 应支持游标分页', exportSource.includes('encodeCursor') && exportSource.includes('decodeCursor') && exportSource.includes('cursorCondition'));
  expectTrue('导出 API 应将 details_json/description_json 解析为对象', exportSource.includes("key.endsWith('_json')") && exportSource.includes('JSON.parse(value)'));
  expectTrue('导出 API 应包含可编辑网站数据', exportSource.includes("id: 'site-access-editable'") && exportSource.includes('site-access-editable.json') && exportSource.includes('classificationRequests'));
  expectTrue('导出 defaults 应读取统一系统访问配置 loader', exportSource.includes('getSystemAccessConfig') && exportSource.includes('systemAccessDefaultsResponse'));

  expectTrue('恢复 API 应提供 preflight 和 commit 路由', restoreSource.includes('restore\\/v1\\/preflight') && restoreSource.includes('restore\\/v1\\/commit'));
  expectTrue('恢复 API 应验证账号归属', restoreSource.includes('verifyAccountToken') && restoreSource.includes('account_id = ?'));
  expectTrue('恢复 API 覆盖模式应要求 RESTORE 确认', restoreSource.includes("confirmText !== 'RESTORE'") && restoreSource.includes('confirmProfileId'));
  expectTrue('恢复 API 不应恢复 device_token', !restoreSource.includes('device_token'));
  expectTrue('恢复 API 应校验网站规则冲突', restoreSource.includes('validateSiteAccessConfig') && restoreSource.includes('SITE_ACCESS_CONFLICT'));
  expectTrue('恢复 API 应支持 usage/media/target/review 数据集', ['usage_segments_v1', 'media_segments_v1', 'target_stats_v1', 'site_classification_requests_v1'].every(name => restoreSource.includes(name)));
  expectTrue('恢复 API 应返回配置恢复摘要和写后校验', restoreSource.includes('backupSummary') && restoreSource.includes('afterSummary') && restoreSource.includes('verified') && restoreSource.includes('SELECT config FROM profiles WHERE id = ?'));
  expectTrue('恢复 API 应重算网站清单并同步配额/校验时间段', restoreSource.includes('normalizeRestoredProfileConfig') && restoreSource.includes('mergeWithDefaults') && restoreSource.includes('syncRestoredLegacyQuota') && restoreSource.includes('validateRestoredTimeWindows'));
  expectTrue('恢复 API 应通过统一 loader 获取系统访问配置', restoreSource.includes('getSystemAccessConfig') && restoreSource.includes('SystemAccessConfig'));
  expectTrue('profile/device config 应合并云端系统访问配置', profilesSource.includes('applySystemAccessDefaultsToProfileConfig') && profilesSource.includes('getSystemAccessConfig') && deviceSource.includes('applySystemAccessDefaultsToProfileConfig') && deviceSource.includes('getSystemAccessConfig'));
  expectTrue('系统访问配置 API 应提供 GET/preflight/PUT', systemConfigSource.includes("request.method === 'GET'") && systemConfigSource.includes("request.method === 'POST'") && systemConfigSource.includes("/preflight") && systemConfigSource.includes("request.method === 'PUT'"));
  expectTrue('系统访问配置写入应要求 admin account', systemConfigSource.includes('ADMIN_ACCOUNT_IDS') && systemConfigSource.includes('SYSTEM_ACCESS_CONFIG_ADMIN_REQUIRED'));
  expectTrue('系统访问配置模块应支持 D1 优先和 JSON fallback', systemConfigModule.includes('system_access_config_v1') && systemConfigModule.includes('fallbackSystemAccessConfig') && systemConfigModule.includes('site-access-defaults.json'));
  expectTrue('系统访问配置模块应校验 Qustodio taxonomy 和跨分类冲突', systemConfigModule.includes('qustodio-web-filters-v1') && systemConfigModule.includes('QUSTODIO_CONTENT_CATEGORIES') && systemConfigModule.includes('同时存在于'));
  expectTrue('系统访问配置模块应补齐旧 D1 配置缺失的 siteCatalog 元数据', systemConfigModule.includes('ensureCatalogCoverage') && systemConfigModule.includes('DEFAULT_CONTENT_CATEGORY_BY_CLASSIFICATION') && systemConfigModule.includes('fallbackDefaults') && systemConfigModule.includes('defaultUserCompositeSites'));
  expectTrue('系统访问配置 effective 复合清单应合并 defaultUserCompositeSites', systemConfigModule.includes('compositeSystemDefaults') && systemConfigModule.includes('mergeWithDefaults(defaults.defaultUserCompositeSites || [], defaults.defaultCompositeSites || [])') && systemConfigModule.includes("next.compositeList = mergeWithDefaults(customOrEffective('customCompositeList', 'compositeList'), compositeSystemDefaults)"));
  expectTrue('系统访问配置导出响应应包含 schemaVersion', systemConfigModule.includes('schemaVersion: config.schemaVersion'));
  expectTrue('系统访问配置 migration 应创建 D1 表', migrationSource.includes('CREATE TABLE IF NOT EXISTS system_access_config_v1') && migrationSource.includes('config_json') && migrationSource.includes('updated_by_account_id'));
  expectTrue('系统配置 GET 应返回 canWrite 管理员能力标记', systemConfigSource.includes('canWrite: isSystemAccessAdmin(env, accountId)'));

  const workerIndexSource = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'index.ts'), 'utf8');
  const siteRequestsSource = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'siteClassificationRequests.ts'), 'utf8');
  expectTrue('Worker 应路由已使用未归类网站 API', workerIndexSource.includes('/used-unclassified-sites') && siteRequestsSource.includes('listUsedUnclassifiedSites'));
  expectTrue('已使用未归类网站 API 应读取 target_stats_v1 并过滤当前已归类网站', siteRequestsSource.includes('FROM target_stats_v1') && siteRequestsSource.includes('resolveSiteAccessClassification') && siteRequestsSource.includes("resolved.classification !== 'pending_composite'"));
  expectTrue('已使用未归类网站归类应写入当前 profile custom list', siteRequestsSource.includes('classifyUsedUnclassifiedSite') && siteRequestsSource.includes('addHostToProfileCustomList') && siteRequestsSource.includes('customBlockedSites'));
  expectTrue('已使用未归类网站归类应关闭匹配 pending 记录', siteRequestsSource.includes('closeMatchingPendingRequests') && siteRequestsSource.includes("status = ?") && siteRequestsSource.includes("status = 'pending'"));

  const total = passed + failed;
  console.log(`\n[Cloud Export Contract] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

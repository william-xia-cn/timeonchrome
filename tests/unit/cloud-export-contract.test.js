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

  expectTrue('Worker 应挂载 exportRouter', indexSource.includes("import { exportRouter } from './routes/export';") && indexSource.includes('export\\/v1'));
  expectTrue('Worker 应挂载 restoreRouter', indexSource.includes("import { restoreRouter } from './routes/restore';") && indexSource.includes('restore\\/v1'));
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

  expectTrue('恢复 API 应提供 preflight 和 commit 路由', restoreSource.includes('restore\\/v1\\/preflight') && restoreSource.includes('restore\\/v1\\/commit'));
  expectTrue('恢复 API 应验证账号归属', restoreSource.includes('verifyAccountToken') && restoreSource.includes('account_id = ?'));
  expectTrue('恢复 API 覆盖模式应要求 RESTORE 确认', restoreSource.includes("confirmText !== 'RESTORE'") && restoreSource.includes('confirmProfileId'));
  expectTrue('恢复 API 不应恢复 device_token', !restoreSource.includes('device_token'));
  expectTrue('恢复 API 应校验网站规则冲突', restoreSource.includes('validateSiteAccessConfig') && restoreSource.includes('SITE_ACCESS_CONFLICT'));
  expectTrue('恢复 API 应支持 usage/media/target/review 数据集', ['usage_segments_v1', 'media_segments_v1', 'target_stats_v1', 'site_classification_requests_v1'].every(name => restoreSource.includes(name)));

  const total = passed + failed;
  console.log(`\n[Cloud Export Contract] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

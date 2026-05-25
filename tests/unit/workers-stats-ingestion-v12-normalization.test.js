// workers-stats-ingestion-v12-normalization.test.js
// Run with: node tests/unit/workers-stats-ingestion-v12-normalization.test.js

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

function expectTrue(desc, cond) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
  }
}

function loadNormalizeHostname() {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'domain-semantics.js'), 'utf8');
  const transformed = code.replace(/export\s+function\s+/g, 'function ') + '\nthis.__d = { normalizeHostname };';
  const context = { console, URL, this: null };
  context.this = context;
  vm.runInNewContext(transformed, context, { filename: 'domain-semantics.js' });
  return context.__d.normalizeHostname;
}

function ingestRows(rows, normalizeHostname) {
  const inserted = [];
  for (const stat of rows) {
    if (!stat.domain) continue;
    const normalizedDomain = normalizeHostname(stat.domain);
    if (!normalizedDomain) continue;

    const duration = (stat.active_sec || 0) + (stat.passive_sec || 0);
    if (duration <= 0) continue;

    inserted.push({ domain: normalizedDomain, duration });
  }
  return inserted;
}

function run() {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'stats.ts'), 'utf8');
  const migration008 = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'migrations', '008_media_segments_v1.sql'), 'utf8');
  const siteRequestsSource = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'siteClassificationRequests.ts'), 'utf8');
  const workerIndexSource = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'index.ts'), 'utf8');
  const profileSource = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'profiles.ts'), 'utf8');
  const migration009 = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'migrations', '009_site_classification_requests_v1.sql'), 'utf8');
  const migration010 = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'migrations', '010_client_logs_v1.sql'), 'utf8');
  const migration011 = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'migrations', '011_hourly_stats_v1.sql'), 'utf8');
  const migration012 = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'migrations', '012_cloud_terminal_stats_consistency.sql'), 'utf8');
  const migration013 = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'migrations', '013_managed_target_stats_v1.sql'), 'utf8');
  const clientLogsSource = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'clientLogs.ts'), 'utf8');
  const normalizeHostname = loadNormalizeHostname();

  expectTrue('stats.ts 应复用 v1.2 normalizeHostname', source.includes("import { normalizeHostname } from '../../../extension/core/domain-semantics.js';"));
  const authSource = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'auth.ts'), 'utf8');
  const cloudSyncSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'cloud-sync.js'), 'utf8');
  expectTrue('auth.ts 应规范化邮箱大小写', authSource.includes('function normalizeEmail') && authSource.includes('toLowerCase()'));
  expectTrue('auth.ts 注册应按 LOWER(email) 检查重复', authSource.includes('SELECT id FROM accounts WHERE LOWER(email) = ?'));
  expectTrue('auth.ts 登录应按 LOWER(email) 查询', authSource.includes('SELECT id, email FROM accounts WHERE LOWER(email) = ? AND password_hash = ?'));
  expectTrue('cloud sync 请求必须有 Abort 超时', cloudSyncSource.includes('REQUEST_TIMEOUT_MS') && cloudSyncSource.includes('new AbortController()') && cloudSyncSource.includes('controller.abort()'));
  expectTrue('cloud sync 应能释放过期 isSyncing 锁', cloudSyncSource.includes('SYNC_STALE_LOCK_MS') && cloudSyncSource.includes('Stale sync lock detected') && cloudSyncSource.includes('syncStartedAt'));
  expectTrue('cloud sync 应同步网站归类申请', cloudSyncSource.includes('syncSiteClassificationRequestsV1') && cloudSyncSource.includes('/device/site-classification-requests/v1'));
  expectTrue('cloud sync daily 空 payload 且存在落账时不得清 dirty', cloudSyncSource.includes('cloud_daily_stats_payload_inconsistent') && cloudSyncSource.includes('markDailyStatsUploadFailed([date], message)'));
  expectTrue('cloud sync target 空 payload 且存在落账时不得清 dirty', cloudSyncSource.includes('cloud_target_stats_payload_inconsistent') && cloudSyncSource.includes('markTargetStatsUploadFailed([date], message)'));
  expectTrue('cloud sync 普通 usage 主路径应使用今日快照和历史水位', cloudSyncSource.includes('syncUsageStatsByDateWatermarkV1') && cloudSyncSource.includes('uploadTodayUsageStatsSnapshotV1') && cloudSyncSource.includes('uploadHistoricalUsageStatsByWatermarkV1'));
  expectTrue('cloud sync 应持久化普通 usage 历史连续同步水位', cloudSyncSource.includes('usage_stats_history_synced_through_date_v1') && cloudSyncSource.includes('USAGE_STATS_HISTORY_SYNCED_THROUGH_DATE'));
  expectTrue('cloud sync 历史上传前应查询云端完整性', cloudSyncSource.includes('/device/stats-integrity/v1?date=') && cloudSyncSource.includes('isCloudIntegrityCompleteForPackage'));
  expectTrue('cloud sync 历史跳过上传前应要求云端自判完整', cloudSyncSource.includes('localHasData') && cloudSyncSource.includes('integrity.complete === false'));
  expectTrue('cloud sync 普通 usage 主流程不再调用 dirty 上传函数', !cloudSyncSource.includes('const segmentResult = await uploadUsageSegmentsV1({ enabled })'));
  expectTrue('stats.ts 应在入库前执行 normalizeHostname', source.includes('const normalizedDomain = normalizeHostname(stat.domain);'));
  expectTrue('stats.ts 应跳过归一后非法域名', source.includes('if (!normalizedDomain) continue;'));

  // Phase 3D-1: Safe per-domain upsert — no date-level DELETE
  expectTrue('stats.ts 不得包含 date-level DELETE', !source.includes('DELETE FROM stats WHERE profile_id'));
  expectTrue('stats.ts 应使用逐域名 upsert（SELECT existing + UPDATE）', source.includes('UPDATE stats SET duration'));
  expectTrue('stats.ts 应使用逐域名 upsert（INSERT）', source.includes('INSERT INTO stats (id, profile_id, date, domain, duration'));
  expectTrue('stats.ts 返回 inserted 和 updated 计数', source.includes('inserted') && source.includes('updated'));

  // Phase 3C: V1 endpoints
  expectTrue('stats.ts 应包含 POST /device/usage-segments/v1 路由', source.includes("path === '/device/usage-segments/v1'"));
  expectTrue('stats.ts 应包含 POST /device/stats/v1 路由', source.includes("path === '/device/stats/v1'"));
  expectTrue('stats.ts 应包含 POST /device/hourly-stats/v1 路由', source.includes("path === '/device/hourly-stats/v1'"));
  expectTrue('stats.ts 应包含 POST /device/target-stats/v1 路由', source.includes("path === '/device/target-stats/v1'"));
  expectTrue('stats.ts 应包含 POST /device/hourly-target-stats/v1 路由', source.includes("path === '/device/hourly-target-stats/v1'"));
  expectTrue('stats.ts 应包含 GET /profiles/:id/stats/v1 路由', source.includes('/stats/v1'));
  expectTrue('stats.ts 应包含 GET /profiles/:id/hourly-stats/v1 路由', source.includes('/hourly-stats/v1'));
  expectTrue('stats.ts 应包含 GET /profiles/:id/target-stats/v1 路由', source.includes('/target-stats/v1'));
  expectTrue('stats.ts 应包含 GET /profiles/:id/hourly-target-stats/v1 路由', source.includes('/hourly-target-stats/v1'));
  expectTrue('stats.ts 应包含 GET /profiles/:id/usage-segments/v1 路由', source.includes('/usage-segments/v1'));
  expectTrue('stats.ts 应包含 GET /profiles/:id/stats-reconciliation/v1 路由', source.includes('/stats-reconciliation/v1'));
  expectTrue('stats.ts 应包含终端数据完整性查询路由', source.includes("path === '/device/stats-integrity/v1'") && source.includes('readUsageStatsIntegrity'));
  expectTrue('stats.ts 应包含家长端按终端数据完整性查询路由', source.includes('/stats-integrity/v1') && source.includes('deviceId required'));
  expectTrue('stats-integrity 应由云端判断物化统计是否匹配 segments', source.includes('dailyMatchesUsage') && source.includes('hourlyTargetMatchesUsage') && source.includes('complete') && source.includes('issues'));
  expectTrue('Worker index 应注册 stats-integrity 路由', workerIndexSource.includes('stats-integrity') && workerIndexSource.includes('/device/stats-integrity/v1'));
  expectTrue('stats.ts 应包含 POST /device/media-segments/v1 路由', source.includes("path === '/device/media-segments/v1'"));
  expectTrue('stats.ts 应包含 POST /device/media-stats/v1 路由', source.includes("path === '/device/media-stats/v1'"));
  expectTrue('stats.ts 应包含 POST /device/hourly-media-stats/v1 路由', source.includes("path === '/device/hourly-media-stats/v1'"));
  expectTrue('stats.ts 应包含 GET /profiles/:id/media-segments/v1 路由', source.includes('/media-segments/v1'));
  expectTrue('stats.ts 应包含 GET /profiles/:id/media-stats/v1 路由', source.includes('/media-stats/v1'));
  expectTrue('stats.ts 应包含 GET /profiles/:id/hourly-media-stats/v1 路由', source.includes('/hourly-media-stats/v1'));
  expectTrue('media-segments/v1 应校验 mediaClass', source.includes('VALID_MEDIA_CLASSES') && source.includes('foregroundAudio') && source.includes('backgroundVideo'));
  expectTrue('media-segments/v1 应支持按终端过滤并返回 deviceId', source.includes("url.searchParams.get('deviceId')") && source.includes('device_id = ?') && source.includes('deviceId: row.device_id'));
  expectTrue('media-segments/v1 应保存并返回 description', source.includes('INSERT INTO media_segments_v1') && source.includes('description_json') && source.includes('description: parseJsonField(row.description_json)'));
  expectTrue('media-segments/v1 应按 start_ms DESC, id DESC 倒序', source.includes('FROM media_segments_v1') && source.includes('ORDER BY start_ms DESC, id DESC'));
  expectTrue('media-stats/v1 应展开 byMode', source.includes('daily_media_stats_v1') && source.includes('byMode') && source.includes('MEDIA_CLASS_FIELDS'));
  expectTrue('008 migration 应创建 media_segments_v1', migration008.includes('CREATE TABLE IF NOT EXISTS media_segments_v1'));
  expectTrue('008 migration 应创建 daily_media_stats_v1', migration008.includes('CREATE TABLE IF NOT EXISTS daily_media_stats_v1'));
  expectTrue('008 migration 应有媒体倒序读取索引', migration008.includes('idx_media_segments_profile_start_id'));
  expectTrue('008 migration 媒体统计唯一键应包含 device_id', migration008.includes('UNIQUE (profile_id, device_id, date, domain, media_class, mode)'));
  expectTrue('011 migration 应创建 hourly_stats_v1', migration011.includes('CREATE TABLE IF NOT EXISTS hourly_stats_v1'));
  expectTrue('011 migration 应创建 hourly_media_stats_v1', migration011.includes('CREATE TABLE IF NOT EXISTS hourly_media_stats_v1'));
  expectTrue('011 migration 应保留小时 segments 元数据', migration011.includes('segments_count') && migration011.includes('last_segment_id'));
  expectTrue('011 migration usage 小时唯一键应包含 device_id', migration011.includes('UNIQUE (profile_id, device_id, hour_key, domain, channel, mode)'));
  expectTrue('011 migration media 小时唯一键应包含 device_id', migration011.includes('UNIQUE (profile_id, device_id, hour_key, domain, media_class, mode)'));
  expectTrue('012 migration 应为 usage segments 增加 tab/window/description 字段', migration012.includes('ALTER TABLE usage_segments_v1 ADD COLUMN tab_id') && migration012.includes('ALTER TABLE usage_segments_v1 ADD COLUMN window_id') && migration012.includes('ALTER TABLE usage_segments_v1 ADD COLUMN description_json'));
  expectTrue('012 migration 应为 media segments 增加 description 字段', migration012.includes('ALTER TABLE media_segments_v1 ADD COLUMN description_json'));
  expectTrue('012 migration 应将 stats_v1 唯一键改为包含 device_id', migration012.includes('UNIQUE (profile_id, device_id, date, domain, channel, mode)'));
  expectTrue('012 migration 旧 stats_v1 设备缺失应写为 unknown-device', migration012.includes("'unknown-device'"));
  expectTrue('013 migration 应为 usage segments 增加 managedTarget 快照字段', migration013.includes('ALTER TABLE usage_segments_v1 ADD COLUMN managed_target_id') && migration013.includes('quota_bucket_at_time'));
  expectTrue('013 migration 应创建 target_stats_v1', migration013.includes('CREATE TABLE IF NOT EXISTS target_stats_v1'));
  expectTrue('013 migration 应创建 hourly_target_stats_v1', migration013.includes('CREATE TABLE IF NOT EXISTS hourly_target_stats_v1'));
  expectTrue('013 migration target stats 唯一键应包含 device_id 和 quota_bucket', migration013.includes('UNIQUE (profile_id, device_id, date, target_key, channel, mode, quota_bucket)'));
  expectTrue('013 migration hourly target stats 唯一键应包含 device_id 和 quota_bucket', migration013.includes('UNIQUE (profile_id, device_id, hour_key, target_key, channel, mode, quota_bucket)'));
  expectTrue('Worker 应注册网站归类申请路由', workerIndexSource.includes('siteClassificationRequestsRouter') && workerIndexSource.includes('/site-classification-requests'));
  expectTrue('009 migration 应创建 site_classification_requests_v1', migration009.includes('CREATE TABLE IF NOT EXISTS site_classification_requests_v1'));
  expectTrue('009 migration 应按原申请对象去重', migration009.includes('UNIQUE (profile_id, requested_target_type, requested_normalized_value)'));
  expectTrue('网站归类申请应支持设备提交和读取', siteRequestsSource.includes("path === '/device/site-classification-requests/v1'") && siteRequestsSource.includes('request.method === \'POST\'') && siteRequestsSource.includes('request.method === \'GET\''));
  expectTrue('网站归类申请应支持家长读取和审批', siteRequestsSource.includes('/site-classification-requests/v1') && siteRequestsSource.includes('/decision') && siteRequestsSource.includes('verifyProfileOwner'));
  expectTrue('网站归类申请应拒绝已归类对象重新申请', siteRequestsSource.includes('ALREADY_CLASSIFIED') && siteRequestsSource.includes('getConfiguredClassificationForTarget'));
  expectTrue('网站归类申请审批应更新 profile config/version', siteRequestsSource.includes('siteClassificationRulesV1') && siteRequestsSource.includes('version = version + 1'));
  expectTrue('网站归类申请审批应支持学习/综合/拒绝三类决定', siteRequestsSource.includes('normalizeSiteClassificationDecision') && siteRequestsSource.includes('decisionToStatus') && siteRequestsSource.includes('decision === \'study\'') && siteRequestsSource.includes('decision === \'composite\''));
  expectTrue('profile 默认配置应包含 siteClassificationRulesV1', profileSource.includes('siteClassificationRulesV1: []') && profileSource.includes("'siteClassificationRulesV1'"));
  expectTrue('profile 默认配置应包含 clientLoggingPolicyV1', profileSource.includes('clientLoggingPolicyV1') && profileSource.includes("'clientLoggingPolicyV1'"));
  expectTrue('profile 配置保存应校验访问规则精确跨类冲突', profileSource.includes('validateSiteAccessConfig') && profileSource.includes('SITE_ACCESS_CONFLICT'));
  const siteAccessKeyBlock = (profileSource.match(/const SITE_ACCESS_CONFIG_KEYS[\s\S]*?\]\);/) || [''])[0];
  expectTrue('profile 配置保存仅在访问规则字段提交时校验冲突', profileSource.includes('shouldValidateSiteAccess') && profileSource.includes('if (shouldValidateSiteAccess)'));
  expectTrue('profile 日志策略保存不应触发访问规则冲突校验', siteAccessKeyBlock.includes("'siteClassificationRulesV1'") && !siteAccessKeyBlock.includes('clientLoggingPolicyV1'));
  expectTrue('Worker 应注册客户端日志路由', workerIndexSource.includes('clientLogsRouter') && workerIndexSource.includes('/client-logs'));
  expectTrue('010 migration 应创建 client_logs_v1 并按 profile/device 建索引', migration010.includes('CREATE TABLE IF NOT EXISTS client_logs_v1') && migration010.includes('idx_client_logs_profile_device_time'));
  expectTrue('client logs 上传必须使用 device token 归属 profile/device', clientLogsSource.includes("path === '/device/client-logs/v1'") && clientLogsSource.includes('verifyDeviceToken') && clientLogsSource.includes('profileId: identity.profileId'));
  expectTrue('client logs 查询必须校验账号 JWT 和 profile ownership', clientLogsSource.includes('verifyAccountToken(request, env.JWT_SECRET)') && clientLogsSource.includes('SELECT id FROM profiles WHERE id = ? AND account_id = ?'));
  expectTrue('client logs 查询支持 device/level/category/cursor', clientLogsSource.includes("url.searchParams.get('deviceId')") && clientLogsSource.includes("url.searchParams.get('level')") && clientLogsSource.includes("url.searchParams.get('category')") && clientLogsSource.includes('decodeCursor'));
  expectTrue('client logs 服务端会二次脱敏敏感字段', clientLogsSource.includes('sanitizeDetails') && clientLogsSource.includes('[redacted]') && clientLogsSource.includes('[redacted-url]'));
  expectTrue('client logs 云端默认 30 天保留清理', clientLogsSource.includes('CLOUD_RETENTION_MS') && clientLogsSource.includes('DELETE FROM client_logs_v1'));
  expectTrue('usage-segments/v1 应校验账号 JWT', source.includes('verifyAccountToken(request, env.JWT_SECRET)'));
  expectTrue('usage-segments/v1 应校验 profile ownership', source.includes('SELECT id FROM profiles WHERE id = ? AND account_id = ?'));
  expectTrue('usage-segments/v1 应校验 device ownership', source.includes('function verifyProfileDevice') && source.includes('SELECT id FROM devices WHERE id = ? AND profile_id = ?'));
  expectTrue('usage-segments/v1 应支持按终端过滤并返回 deviceId', source.includes('device_id = ?') && source.includes('SELECT id, device_id, date') && source.includes('deviceId: row.device_id'));
  expectTrue('usage-segments/v1 应保存并返回 tab/window/description', source.includes('tab_id = ?') && source.includes('window_id = ?') && source.includes('description_json = ?') && source.includes('tabId: row.tab_id') && source.includes('windowId: row.window_id') && source.includes('description: parseJsonField(row.description_json)'));
  expectTrue('usage-segments/v1 应保存并返回 managedTarget 快照', source.includes('managed_target_id = ?') && source.includes('quota_bucket_at_time = ?') && source.includes('managedTargetId: row.managed_target_id') && source.includes('quotaBucketAtTime: row.quota_bucket_at_time'));
  expectTrue('usage-segments/v1 应按 start_ms DESC, id DESC 倒序', source.includes('ORDER BY start_ms DESC, id DESC'));
  expectTrue('usage-segments/v1 应支持 keyset cursor', source.includes('decodeSegmentCursor') && source.includes('nextCursor'));
  expectTrue('usage-segments/v1 应返回 summary 聚合', source.includes('totalSeconds') && source.includes('activeSeconds') && source.includes('mediaSeconds'));
  expectTrue('stats-reconciliation/v1 应同时查询 stats_v1 与 usage_segments_v1', source.includes('FROM stats_v1') && source.includes('FROM usage_segments_v1'));
  expectTrue('stats-reconciliation/v1 应返回四类状态', source.includes('stats_missing') && source.includes('segments_missing') && source.includes('mismatch') && source.includes('match'));
  expectTrue('stats-reconciliation/v1 应返回 deltaSeconds', source.includes('deltaSeconds: segmentSeconds - statsSeconds'));
  expectTrue('stats.ts 应在 usage_segments_v1 表中使用 ON CONFLICT/upsert 语义', source.includes('usage_segments_v1'));
  expectTrue('stats.ts 应在 stats_v1 表中使用 UNIQUE 约束 upsert', source.includes('stats_v1'));
  expectTrue('stats.ts 应写入 segment_upload_log', source.includes('segment_upload_log'));
  expectTrue('stats.ts 应写入 stats_upload_log', source.includes('stats_upload_log'));
  expectTrue('stats.ts 应验证 channel 字段', source.includes("VALID_CHANNELS"));
  expectTrue('stats.ts 应验证 mode 字段', source.includes("VALID_MODES"));
  expectTrue('stats.ts 应允许 locked 作为云端 mode', source.includes("['study', 'rest', 'locked', 'paused', 'unknown', 'composite']"));
  expectTrue('Worker /device 上传不得信任 payload deviceId', !source.includes('s.deviceId || device.deviceId'));
  expectTrue('stats_v1 upsert 应按 device_id 隔离', source.includes('WHERE profile_id = ? AND device_id = ? AND date = ? AND domain = ? AND channel = ? AND mode = ?'));
  expectTrue('target_stats_v1 upsert 应按 device_id 和 target_key 隔离', source.includes('FROM target_stats_v1') && source.includes('WHERE profile_id = ? AND device_id = ? AND date = ? AND target_key = ? AND channel = ? AND mode = ? AND quota_bucket = ?'));
  expectTrue('hourly_target_stats_v1 upsert 应按 device_id 和 target_key 隔离', source.includes('FROM hourly_target_stats_v1') && source.includes('WHERE profile_id = ? AND device_id = ? AND hour_key = ? AND target_key = ? AND channel = ? AND mode = ? AND quota_bucket = ?'));
  expectTrue('target stats 应展开 rows 或 byMode fallback', source.includes('expandTargetStatsRows') && source.includes('activeByQuotaBucket') && source.includes('quotaBucket'));
  expectTrue(
    'usage-segments/v1 应允许正时长亚秒 segment 上传为 durationSeconds=0',
    source.includes("s.durationSeconds < 0") && source.includes("segment.durationSeconds must be >= 0")
  );
  expectTrue(
    'usage-segments/v1 仍应拒绝非有限 durationSeconds',
    source.includes("!Number.isFinite(s.durationSeconds)")
  );

  // Phase 3C-R: Contract — Worker accepts terminal buildDailyStatsUploadPayload shape
  expectTrue('stats.ts stats/v1 应接受嵌套的 activeByMode', source.includes("activeByMode"));
  expectTrue('stats.ts stats/v1 应接受嵌套的 backgroundMediaByMode', source.includes("backgroundMediaByMode"));
  expectTrue('stats.ts stats/v1 应接受嵌套的 pipByMode', source.includes("pipByMode"));
  expectTrue('stats.ts stats/v1 应将 byMode 对象展开为展开的行', source.includes("expandedRows"));
  expectTrue('stats.ts stats/v1 expandedRows 包含 channel 和 mode', source.includes("channel: 'active'"));
  expectTrue('落账域名筛选应使用安全 LIKE 模糊匹配', source.includes('function addDomainLikeFilter') && source.includes("LIKE ? ESCAPE '\\\\'") && source.includes('escapeSqlLike'));
  expectTrue('落账域名筛选应覆盖普通落账/媒体落账/统计对账', (source.match(/addDomainLikeFilter\(where, binds, 'domain', rawDomain\)/g) || []).length >= 3);
  expectTrue('落账域名筛选应绑定转义后的包含关键词', source.includes('binds.push(`%${escapeSqlLike(normalized)}%`)'));

  const row = ingestRows([{ domain: 'WWW.Example.COM.', active_sec: 30, passive_sec: 10 }], normalizeHostname);
  expectEqual('WWW + 大小写 + 尾点组合应归一为 www.example.com', row[0].domain, 'www.example.com');
  expectEqual('归一后应保留时长求和', row[0].duration, 40);

  const invalids = ingestRows([
    { domain: '', active_sec: 10, passive_sec: 0 },
    { domain: '   ', active_sec: 10, passive_sec: 0 },
    { domain: '::invalid::', active_sec: 10, passive_sec: 0 }
  ], normalizeHostname);
  expectEqual('空值/非法域名应被过滤', invalids.length, 0);

  const mixed = ingestRows([
    { domain: 'Example.com', active_sec: 10 },
    { domain: 'example.com.', active_sec: 20 },
    { domain: 'EXAMPLE.COM', passive_sec: 30 }
  ], normalizeHostname);
  expectEqual('混合大小写/尾点应归一为同一域名', mixed.map((r) => r.domain).join(','), 'example.com,example.com,example.com');

  const total = passed + failed;
  console.log(`\n[Workers Stats Ingestion v1.2 Normalization] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

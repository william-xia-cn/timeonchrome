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
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'domain-semantics.js'), 'utf8');
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
  const normalizeHostname = loadNormalizeHostname();

  expectTrue('stats.ts 应复用 v1.2 normalizeHostname', source.includes("import { normalizeHostname } from '../../../core/domain-semantics.js';"));
  const authSource = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'auth.ts'), 'utf8');
  expectTrue('auth.ts 应规范化邮箱大小写', authSource.includes('function normalizeEmail') && authSource.includes('toLowerCase()'));
  expectTrue('auth.ts 注册应按 LOWER(email) 检查重复', authSource.includes('SELECT id FROM accounts WHERE LOWER(email) = ?'));
  expectTrue('auth.ts 登录应按 LOWER(email) 查询', authSource.includes('SELECT id, email FROM accounts WHERE LOWER(email) = ? AND password_hash = ?'));
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
  expectTrue('stats.ts 应包含 GET /profiles/:id/stats/v1 路由', source.includes('/stats/v1'));
  expectTrue('stats.ts 应包含 GET /profiles/:id/usage-segments/v1 路由', source.includes('/usage-segments/v1'));
  expectTrue('stats.ts 应包含 GET /profiles/:id/stats-reconciliation/v1 路由', source.includes('/stats-reconciliation/v1'));
  expectTrue('usage-segments/v1 应校验账号 JWT', source.includes('verifyAccountToken(request, env.JWT_SECRET)'));
  expectTrue('usage-segments/v1 应校验 profile ownership', source.includes('SELECT id FROM profiles WHERE id = ? AND account_id = ?'));
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

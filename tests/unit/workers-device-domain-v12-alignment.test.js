// workers-device-domain-v12-alignment.test.js
// Run with: node tests/unit/workers-device-domain-v12-alignment.test.js

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

function loadDomainSemantics() {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'domain-semantics.js'), 'utf8');
  const transformed = code.replace(/export\s+function\s+/g, 'function ') + '\nthis.__d = { matchDomain };';
  const context = { console, URL, this: null };
  context.this = context;
  vm.runInNewContext(transformed, context, { filename: 'domain-semantics.js' });
  return context.__d.matchDomain;
}

function run() {
  const deviceSource = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'device.ts'), 'utf8');
  const profilesSource = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'profiles.ts'), 'utf8');
  const restoreSource = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'restore.ts'), 'utf8');
  const matchDomain = loadDomainSemantics();

  expectTrue('device.ts quota-state 应读取 effective timeQuota', /getEffectiveQuotaForDate\(config,\s*dateParam(?:\s+as\s+any)?\)/.test(deviceSource) && !deviceSource.includes('config.dailyUndeterminedQuota ?? 60)  * 60'));
  expectTrue('device.ts quota-state 应读取 V1 quota bucket', deviceSource.includes('FROM target_stats_v1') && deviceSource.includes("quota_bucket = 'rest'"));
  expectTrue('device.ts quota-state 不应读取 legacy stats', !/FROM\s+stats\s+WHERE profile_id/.test(deviceSource));
  expectTrue('device.ts quota-state 应返回周期身份和锁来源', ['date: dateParam', 'weekStart: weekStartStr', 'dailyRestLocked:', 'weeklyRestLocked:'].every((token) => deviceSource.includes(token)));
  expectTrue('device config GET 应返回补齐后的 timeQuota.daily', deviceSource.includes('buildEffectiveTimeQuota(configData)') && deviceSource.includes('configData.timeQuota ='));
  expectTrue('profile config 应校验每日与每周显式配额范围', profilesSource.includes('function validateTimeQuota') && profilesSource.includes('weekly.restMinutes 必须是 null 或 0-10080'));
  expectTrue('profile config 局部更新 weekly 时应保留现有 daily 配额', profilesSource.includes("key === 'timeQuota'") && profilesSource.includes('currentQuota.daily') && profilesSource.includes('currentQuota.weekly'));
  expectTrue('profile config 不应再由每日休息配额乘七生成周上限', !profilesSource.includes('restMinutes * 7') && !profilesSource.includes('restMinutes*7'));
  expectTrue('profile config 应从显式周上限维护 legacy 兼容镜像', profilesSource.includes('config.weeklyRestQuota = typeof weeklyRest'));
  expectTrue('备份恢复不应再由每日休息配额乘七生成周上限', !restoreSource.includes('restMinutes * 7') && !restoreSource.includes('restMinutes*7'));

  // 5 条 V0 断言（父域匹配子域）
  expectEqual('a.example.com vs example.com = true', matchDomain('a.example.com', 'example.com'), true);
  expectEqual('a.example.com vs *.example.com = true', matchDomain('a.example.com', '*.example.com'), true);
  expectEqual('example.com vs *.example.com = false', matchDomain('example.com', '*.example.com'), false);
  expectEqual('www.example.com vs example.com = true', matchDomain('www.example.com', 'example.com'), true);
  expectEqual('example.com vs www.example.com = true', matchDomain('example.com', 'www.example.com'), true);
  expectEqual('m.example.com vs example.com = true', matchDomain('m.example.com', 'example.com'), true);
  expectEqual('example.com vs m.example.com = true', matchDomain('example.com', 'm.example.com'), true);

  const total = passed + failed;
  console.log(`\n[Workers Device Domain v1.2 Alignment] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

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

function classifyWithLists(statsRows, studyList, compositeList, matchDomain) {
  let studySeconds = 0;
  let undeterminedSeconds = 0;
  let onlineSeconds = 0;

  for (const row of statsRows) {
    onlineSeconds += row.total;
    const isStudy = studyList.some((p) => matchDomain(row.domain, p));
    const isComposite = compositeList.some((p) => matchDomain(row.domain, p));
    if (isStudy) studySeconds += row.total;
    else if (isComposite) undeterminedSeconds += row.total;
  }

  return { onlineSeconds, studySeconds, undeterminedSeconds };
}

function run() {
  const deviceSource = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'device.ts'), 'utf8');
  const matchDomain = loadDomainSemantics();

  expectTrue('device.ts 应复用 v1.2 matchDomain 实现', deviceSource.includes("import { matchDomain as matchDomainV12 } from '../../../extension/core/domain-semantics.js';"));
  expectTrue('device.ts 中 matchDomain 应委托到 matchDomainV12', /const\s+matchDomain\s*=\s*matchDomainV12\s*;/.test(deviceSource));
  expectTrue('device.ts quota-state 应读取 effective timeQuota', /getEffectiveQuotaForDate\(config,\s*dateParam(?:\s+as\s+any)?\)/.test(deviceSource) && !deviceSource.includes('config.dailyUndeterminedQuota ?? 60)  * 60'));
  expectTrue('device config GET 应返回补齐后的 timeQuota.daily', deviceSource.includes('buildEffectiveTimeQuota(configData)') && deviceSource.includes('configData.timeQuota ='));

  // 5 条 V0 断言（父域匹配子域）
  expectEqual('a.example.com vs example.com = true', matchDomain('a.example.com', 'example.com'), true);
  expectEqual('a.example.com vs *.example.com = true', matchDomain('a.example.com', '*.example.com'), true);
  expectEqual('example.com vs *.example.com = false', matchDomain('example.com', '*.example.com'), false);
  expectEqual('www.example.com vs example.com = true', matchDomain('www.example.com', 'example.com'), true);
  expectEqual('example.com vs www.example.com = true', matchDomain('example.com', 'www.example.com'), true);
  expectEqual('m.example.com vs example.com = true', matchDomain('m.example.com', 'example.com'), true);
  expectEqual('example.com vs m.example.com = true', matchDomain('example.com', 'm.example.com'), true);

  // quota-state 分类：studyList=['example.com']，stats 仅 a.example.com，应正确归为 study（父域覆盖子域）
  const guard = classifyWithLists(
    [{ domain: 'a.example.com', total: 120 }],
    ['example.com'],
    [],
    matchDomain
  );
  expectEqual('quota-state: a.example.com 应被 example.com 正确归为 study', guard.studySeconds, 120);
  expectEqual('quota-state: onlineSeconds 仍应累计', guard.onlineSeconds, 120);

  const total = passed + failed;
  console.log(`\n[Workers Device Domain v1.2 Alignment] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

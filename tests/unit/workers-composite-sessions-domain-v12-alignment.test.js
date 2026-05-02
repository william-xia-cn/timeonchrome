// workers-composite-sessions-domain-v12-alignment.test.js
// Run with: node tests/unit/workers-composite-sessions-domain-v12-alignment.test.js

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

function loadDomainMatch() {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'domain-semantics.js'), 'utf8');
  const transformed = code.replace(/export\s+function\s+/g, 'function ') + '\nthis.__d = { matchDomain };';
  const context = { console, URL, this: null };
  context.this = context;
  vm.runInNewContext(transformed, context, { filename: 'domain-semantics.js' });
  return context.__d.matchDomain;
}

function run() {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'compositeSessions.ts'), 'utf8');
  const matchDomain = loadDomainMatch();
  const autoClassify = (domain, title, rules) => {
    for (const rule of rules) {
      if (!matchDomain(domain, rule.domain)) continue;
      if (title.toLowerCase().includes(rule.keyword.toLowerCase())) return rule.classification;
    }
    return null;
  };

  expectTrue('compositeSessions.ts 应复用 v1.2 matchDomain 实现', source.includes("import { matchDomain as matchDomainV12 } from '../../../core/domain-semantics.js';"));
  expectTrue('autoClassify 应使用 matchDomainV12', source.includes('if (!matchDomainV12(domain, rule.domain)) continue;'));
  expectTrue('scope=domain 应使用对称域名等价判断', source.includes('const isSameDomain = (a: string, b: string) => matchDomainV12(a, b) && matchDomainV12(b, a);'));

  // 5 条 V0 断言（父域匹配子域）
  expectEqual('a.example.com vs example.com = true', matchDomain('a.example.com', 'example.com'), true);
  expectEqual('a.example.com vs *.example.com = true', matchDomain('a.example.com', '*.example.com'), true);
  expectEqual('example.com vs *.example.com = false', matchDomain('example.com', '*.example.com'), false);
  expectEqual('www.example.com vs example.com = true', matchDomain('www.example.com', 'example.com'), true);
  expectEqual('example.com vs www.example.com = true', matchDomain('example.com', 'www.example.com'), true);

  // autoClassify：子域应被父域规则正确分类
  const auto = autoClassify('a.example.com', 'my lecture note', [{ domain: 'example.com', keyword: 'lecture', classification: 'study' }]);
  expectEqual('autoClassify: 子域应被父域规则正确分类', auto, 'study');

  // scope=domain 写回护栏（不应误删 example.com）
  const isSameDomain = (a, b) => matchDomain(a, b) && matchDomain(b, a);
  const compositeList = ['example.com', 'a.example.com'];
  const operatedDomain = 'a.example.com';
  const kept = compositeList.filter((d) => !isSameDomain(d, operatedDomain));
  expectTrue('scope=domain guard: 不应误删 example.com', kept.includes('example.com'));
  expectTrue('scope=domain guard: 应移除 a.example.com 本身', !kept.includes('a.example.com'));

  const total = passed + failed;
  console.log(`\n[Workers CompositeSessions Domain v1.2 Alignment] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

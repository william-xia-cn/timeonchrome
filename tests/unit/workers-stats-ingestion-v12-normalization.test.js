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
  expectTrue('stats.ts 应在入库前执行 normalizeHostname', source.includes('const normalizedDomain = normalizeHostname(stat.domain);'));
  expectTrue('stats.ts 应跳过归一后非法域名', source.includes('if (!normalizedDomain) continue;'));

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

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

  // 源码残留检查
  expectTrue('pages 不应再出现 allowList 字段', !/\ballowList\b/.test(source));
  expectTrue('pages 不应再出现 blacklist 字段', !/\bblacklist\b/.test(source));
  expectTrue('pages 不应再出现 dailyQuota fallback 字段', !/\bdailyQuota\b/.test(source));
  expectTrue('统计分类应仅读取 compositeList', source.includes('const compositeList = cfg.compositeList || [];'));

  // 最小行为级断言：第三类列表绑定 compositeList
  const setupRulesSource = extractFunctionSource(source, 'setupRules');
  const captured = [];
  const context = {
    setupDomainInput: (...args) => captured.push(args),
    document: {
      getElementById: () => ({ addEventListener: () => {} })
    },
    renderTagsFiltered: () => {},
    saveConfig: () => {},
    remoteConfig: { studyList: [] },
    this: null
  };
  context.this = context;

  vm.runInNewContext(`${setupRulesSource}\nthis.__fn = setupRules;`, context, { filename: 'pages/index.html' });
  context.__fn();

  const third = captured.find((entry) => entry[0] === 'r-allowlist-input');
  expectTrue('第三类列表应完成 setupDomainInput 绑定', !!third);
  expectEqual('第三类列表 listKey 应为 compositeList', third?.[3], 'compositeList');

  const total = passed + failed;
  console.log(`\n[Pages Config v1.2 Fields] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

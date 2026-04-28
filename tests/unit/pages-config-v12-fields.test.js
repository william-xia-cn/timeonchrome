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

  // 系统配置文案检查
  expectTrue('pages 应使用"系统配置"文案', source.includes('系统配置'));
  expectTrue('pages 不应再使用"系统默认"文案', !/系统默认（不可编辑）/.test(source));

  // 综合网站系统配置拆分检查
  expectTrue('pages 应包含系统配置综合网站区', source.includes('系统配置综合网站（只读）'));
  expectTrue('pages 应包含家长自定义综合网站区', source.includes('家长自定义综合网站'));
  expectTrue('pages 应包含综合网站系统配置标签容器', source.includes('id="r-composite-default-tags"'));

  // 时间段管理：per-day 结构检查
  expectTrue('pages 应使用 timeWindows.daily 结构', source.includes('timeWindows.daily'));
  expectTrue('pages 应包含七天配置', source.includes("'monday'") && source.includes("'sunday'"));
  expectTrue('pages 学习时段默认应为 null（全天允许）', source.includes('studyWindows: null'));
  expectTrue('pages 休息时段默认应为 15:30-24:00', source.includes("'15:30'") && source.includes("'24:00'"));
  expectTrue('saveScheduleConfig 应提交 daily 结构', source.includes('timeWindows: { daily }'));
  expectTrue('saveScheduleConfig 不应提交 onlineWindows', !/saveScheduleConfig[\s\S]{0,500}onlineWindows/.test(source));
  expectTrue('schedule 不应被 saveScheduleConfig 覆盖', !/saveScheduleConfig[\s\S]{0,300}schedule/.test(source));

  // 最小行为级断言：综合网站列表绑定 compositeList
  const setupRulesSource = extractFunctionSource(source, 'setupRules');
  const captured = [];
  const context = {
    setupCustomDomainInput: (...args) => captured.push(args),
    document: {
      getElementById: () => ({ addEventListener: () => {} })
    },
    renderTagsFiltered: () => {},
    saveSiteAccessConfig: () => {},
    exportSiteAccessConfig: () => {},
    importSiteAccessConfig: () => {},
    remoteConfig: { studyList: [] },
    this: null
  };
  context.this = context;

  vm.runInNewContext(`${setupRulesSource}\nthis.__fn = setupRules;`, context, { filename: 'pages/index.html' });
  context.__fn();

  const composite = captured.find((entry) => entry[0] === 'r-composite-input');
  expectTrue('综合网站列表应完成 setupCustomDomainInput 绑定', !!composite);
  expectEqual('综合网站列表 customKey 应为 customCompositeList', composite?.[3], 'customCompositeList');

  const total = passed + failed;
  console.log(`\n[Pages Config v1.2 Fields] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

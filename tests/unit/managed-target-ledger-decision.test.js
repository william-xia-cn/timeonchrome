// managed-target-ledger-decision.test.js
// Run with: node tests/unit/managed-target-ledger-decision.test.js

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function check(desc, condition) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  x ${desc}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
}

const decisions = read('DECISIONS.md');
const decisionDoc = read('docs/MANAGED_TARGET_LEDGER.md');
const statsFoundation = read('docs/STATS_STORAGE_FOUNDATION.md');
const design = read('docs/DESIGN.md');
const changelog = read('docs/CHANGELOG.md');
const usageSegments = read('extension/core/usage-segments.js');
const managedStatistics = read('extension/stats/managed-statistics.js');

check('D-045 is recorded in decisions', decisions.includes('D-045') && decisions.includes('ManagedTarget 统计账本身份模型升级'));
check('managed target decision doc marks partial implementation', decisionDoc.includes('Status: Partially implemented.'));
check('decision doc keeps domain as factual compatibility field', decisionDoc.includes('`domain` remains required as a factual and compatibility field.'));
check('decision doc states unmanaged URLs are not persisted', decisionDoc.includes('Unmanaged browsing must not persist full URLs.'));
check('stats foundation marks D-045 first phase implemented', statsFoundation.includes('D-045，已实现第一阶段') && statsFoundation.includes('target_stats_v1'));
check('design marks managedTarget first phase implemented', design.includes('当前实现已完成 D-045 第一阶段'));
check('changelog records managedTarget implementation', changelog.includes('ManagedTarget ledger implementation'));

check('usage segment builder now supports managed target snapshot fields', usageSegments.includes('managedTargetId:') && usageSegments.includes('quotaBucketAtTime'));
check('daily aggregate keeps domain compatibility and adds target rows', usageSegments.includes('const domainKey = segment.domain') && usageSegments.includes('day.targets') && usageSegments.includes('fallback:domain:'));
check('managed statistics exposes target-first interpretation source', managedStatistics.includes('quotaSource') && managedStatistics.includes('target_classification_snapshot'));

const total = passed + failed;
console.log(`\n[ManagedTarget Ledger Decision] ${passed}/${total} passed${failed ? ' FAILED' : ''}`);
if (failed > 0) process.exit(1);

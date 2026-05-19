// monitoring-global-short-circuit.test.js
// Run with: node tests/unit/monitoring-global-short-circuit.test.js

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
  const bg = fs.readFileSync(path.join(__dirname, '..', '..', 'background.js'), 'utf8');
  const interceptor = fs.readFileSync(path.join(__dirname, '..', '..', 'product', 'interceptor.js'), 'utf8');

  // 背景链路：monitoring_enabled=0 时短路 periodicCheckpoint/quota_check/checkAutoStudy
  expectTrue('background: periodicCheckpoint 分支应有 monitoring guard', /if \(alarm\.name === 'periodicCheckpoint'\) \{\s*if \(!isMonitoringEnabled\(\)\) return;/s.test(bg));
  expectTrue('background: quota_check 分支应有 monitoring guard', /else if \(alarm\.name === 'quota_check'\) \{\s*if \(!isMonitoringEnabled\(\)\) return;\s*await checkAllTabsQuota\(/s.test(bg));
  expectTrue('background: checkAutoStudy 应在函数开头短路', /async function checkAutoStudy\(\) \{\s*if \(!isMonitoringEnabled\(\)\) return;/s.test(bg));

  // 拦截规则：monitoring_enabled=0 时清规则后不再 addRules
  expectTrue('interceptor: updateDeclarativeRules 应支持 monitoringEnabled 参数', /export async function updateDeclarativeRules\(config, monitoringEnabled\)/.test(interceptor));
  const removeIdx = interceptor.indexOf('updateDynamicRules({ removeRuleIds: removeIds })');
  const monitorGuardIdx = interceptor.indexOf('if (monitor === 0) return;');
  const addRulesIdx = interceptor.indexOf('updateDynamicRules({ addRules: rules })');
  expectTrue('interceptor: monitor guard 应位于 addRules 之前', removeIdx >= 0 && monitorGuardIdx > removeIdx && addRulesIdx > monitorGuardIdx);

  const total = passed + failed;
  console.log(`\n[Monitoring Global Short Circuit] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

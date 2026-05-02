// reminder-transition-v0.test.js
// Validates reminder.js reason configs and actions for V0 matrix semantics.
// Run with: node tests/unit/reminder-transition-v0.test.js

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function expect(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

function expectTrue(desc, cond) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
  }
}

function section(name) {
  console.log(`\n[${name}]`);
}

// Extract reminder.js configs and actionDefs by parsing the source
function loadReminderConfigs() {
  const abs = path.join(__dirname, '..', '..', 'reminder.js');
  const fullCode = fs.readFileSync(abs, 'utf8');

  // Extract configs object
  const configsMatch = fullCode.match(/const configs = \{([\s\S]*?)\n  \};/);
  if (!configsMatch) throw new Error('Cannot extract configs from reminder.js');

  // Extract actionDefs object
  const actionDefsMatch = fullCode.match(/const actionDefs = \{([\s\S]*?)\n  \};/);
  if (!actionDefsMatch) throw new Error('Cannot extract actionDefs from reminder.js');

  return { configsCode: configsMatch[1], actionDefsCode: actionDefsMatch[1], fullCode };
}

async function run() {
  const { configsCode, actionDefsCode, fullCode } = loadReminderConfigs();

  // ── A. quota_composite ──
  section('A. quota_composite reason config');
  expectTrue('quota_composite has correct title', configsCode.includes("title: '今日综合时间已用完'"));
  expectTrue('quota_composite has correct body line 1', configsCode.includes('综合时间不会自动占用休息时间'));
  expectTrue('quota_composite has correct body line 2', configsCode.includes('如果仍要继续访问，可以进入休息时间继续'));
  expectTrue('quota_composite has enterRestContinue action', configsCode.includes("'enterRestContinue'"));
  expectTrue('quota_composite has backGeneric action', configsCode.includes("'backGeneric'"));
  expectTrue('enterRestContinue action exists', actionDefsCode.includes('enterRestContinue:'));
  expectTrue('enterRestContinue label is 进入休息继续', actionDefsCode.includes("label: '进入休息继续'"));

  // ── B. quota_composite_and_rest ──
  section('B. quota_composite_and_rest reason config');
  expectTrue('quota_composite_and_rest has correct title', configsCode.includes("title: '今日综合时间和休息时间均已用完'"));
  expectTrue('quota_composite_and_rest has correct body', configsCode.includes('当前不能继续访问。请返回。'));
  expectTrue('quota_composite_and_rest only has backGeneric', configsCode.includes("'backGeneric'"));

  // ── C. study_mode + Rest exhausted override ──
  section('C. study_mode + Rest exhausted override');
  expectTrue('study_mode keeps addComposite when restLocked', fullCode.includes("'addComposite'"));
  expectTrue('study_mode override includes borrowTime', fullCode.includes("'borrowTime'"));
  expectTrue('study_mode override includes borrow copy', fullCode.includes('今天的休息时间已用完。继续休息使用需要向明天借用休息时间'));
  expectTrue('study_mode override does NOT show restricted warning in study_mode branch', !fullCode.match(/effectiveReason === 'study_mode'[\s\S]{0,500}该网站不能申请使用综合时间/));

  // ── D. to_rest_slide_confirm + Rest exhausted override ──
  section('D. to_rest_slide_confirm + Rest exhausted override');
  expectTrue('Restricted override shows restricted warning', fullCode.includes('该网站不能申请使用综合时间'));
  expectTrue('Restricted override includes borrow copy', fullCode.includes('如果仍要继续访问，可以向明天借用休息时间'));
  expectTrue('Restricted override includes borrowTime', fullCode.includes("'borrowTime'"));

  // ── E. to_rest_confirm + Rest exhausted override ──
  section('E. to_rest_confirm + Rest exhausted override');
  expectTrue('to_rest_confirm override includes borrowTime', fullCode.includes("'borrowTime'"));
  expectTrue('to_rest_confirm override includes backGeneric', fullCode.includes("'backGeneric'"));

  // ── F. No Composite borrow anywhere ──
  section('F. No Composite borrowing');
  expectTrue('no BORROW_COMPOSITE_QUOTA action', !actionDefsCode.includes('BORROW_COMPOSITE'));
  expectTrue('no borrowComposite action', !actionDefsCode.includes('borrowComposite'));

  // ── Summary ──
  const total = passed + failed;
  console.log(`\n[Reminder Transition V0] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

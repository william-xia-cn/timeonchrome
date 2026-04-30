// reminder-transition-v0.test.js
// Run with: node tests/unit/reminder-transition-v0.test.js

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
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'reminder.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'reminder.html'), 'utf8');

  expectTrue('has to_composite_confirm config', source.includes('to_composite_confirm'));
  expectTrue('has to_rest_confirm config', source.includes('to_rest_confirm'));
  expectTrue('has to_rest_slide_confirm config', source.includes('to_rest_slide_confirm'));

  expectTrue('slide confirm action exists', source.includes('slideToRest'));
  expectTrue('slide flow binds draggable confirm', source.includes('bindSlideConfirm'));
  expectTrue('slide flow sends SWITCH_TO_REST only after threshold', source.includes("if (pos >= max * 0.92)"));
  const slideHandlerMatch = source.match(/slideToRest:\s*\{[\s\S]*?handler:\s*function\(\)\s*\{([\s\S]*?)\n\s*\}\s*\}/);
  const slideHandlerBody = slideHandlerMatch ? slideHandlerMatch[1] : '';
  expectTrue('single click on slide action does not call SWITCH_TO_REST directly', !slideHandlerBody.includes('SWITCH_TO_REST'));

  expectTrue('composite confirm action exists', source.includes('SWITCH_TO_COMPOSITE'));
  expectTrue('composite->rest button wording', source.includes("label: '☕ 开始休息'"));

  expectTrue('slide UI exists in reminder html', html.includes('id="slideConfirmWrap"'));
  expectTrue('slide track exists in reminder html', html.includes('id="slideTrack"'));
  expectTrue('slide thumb exists in reminder html', html.includes('id="slideThumb"'));

  const total = passed + failed;
  console.log(`\n[Reminder Transition V0] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

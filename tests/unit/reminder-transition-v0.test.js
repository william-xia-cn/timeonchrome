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
  expectTrue('reads originMode for return semantics', source.includes("const originMode = params.get('originMode') || '';"));

  expectTrue('slide confirm action exists', source.includes('slideToRest'));
  expectTrue('slide flow binds draggable confirm', source.includes('bindSlideConfirm'));
  expectTrue('slide flow sends SWITCH_TO_REST only after threshold', source.includes("if (pos >= max * 0.92)"));
  expectTrue('pointerdown listener attached for slider', source.includes("slideThumb.addEventListener('pointerdown'"));
  expectTrue('pointermove listener attached for slider', source.includes("slideThumb.addEventListener('pointermove'"));
  expectTrue('pointerup listener attached for slider', source.includes("slideThumb.addEventListener('pointerup'"));
  expectTrue('pointer capture used for stable drag', source.includes('setPointerCapture'));
  expectTrue('drag reset on pointercancel', source.includes("slideThumb.addEventListener('pointercancel'"));
  const slideHandlerMatch = source.match(/slideToRest:\s*\{[\s\S]*?handler:\s*function\(\)\s*\{([\s\S]*?)\n\s*\}\s*\}/);
  const slideHandlerBody = slideHandlerMatch ? slideHandlerMatch[1] : '';
  expectTrue('single click on slide action does not call SWITCH_TO_REST directly', !slideHandlerBody.includes('SWITCH_TO_REST'));

  expectTrue('composite confirm action exists', source.includes('SWITCH_TO_COMPOSITE'));
  expectTrue('composite->rest button wording', source.includes("label: '开始休息'"));
  expectTrue('study->composite primary button wording', source.includes("label: '继续（进入综合时间）'"));
  expectTrue('study->composite secondary button uses 返回学习', source.includes("to_composite_confirm"));
  expectTrue('composite->rest secondary button uses 返回', source.includes("backGeneric"));

  expectTrue('slide UI exists in reminder html', html.includes('id="slideConfirmWrap"'));
  expectTrue('slide track exists in reminder html', html.includes('id="slideTrack"'));
  expectTrue('slide thumb exists in reminder html', html.includes('id="slideThumb"'));
  expectTrue('study->rest subtitle copy updated', source.includes('继续后，这段时间会计入「休息时间」，不会计入「学习时间」。'));
  expectTrue('study->rest uses 返回学习 text', source.includes("label: '返回学习'"));
  expectTrue('rest/composite/quota use 返回 text', source.includes("label: '返回', style: 'outline'"));
  expectTrue('to_rest_slide_confirm chooses back action by originMode', source.includes("actions: [originMode === 'study' ? 'backToStudy' : 'backGeneric']"));
  expectTrue('study->rest back action tries close tab first', source.includes('window.close();'));
  expectTrue('study->rest back action falls back to chrome.tabs.remove', source.includes('chrome.tabs.remove(tab.id)'));
  expectTrue('study->rest shows rest quota line', source.includes('今日休息时间剩余：${remainingRest}'));
  expectTrue('reminder html contains rest quota line placeholder', html.includes('id="restQuotaLine"'));
  expectTrue('normal confirms use aligned card class', source.includes("document.body.classList.add('confirm-standard')"));

  const total = passed + failed;
  console.log(`\n[Reminder Transition V0] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

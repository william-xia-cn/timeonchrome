// badge-and-popup-mode-v0.test.js
// Run with: node tests/unit/badge-and-popup-mode-v0.test.js

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
  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', '..', 'background.js'), 'utf8');
  const popupHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'popup', 'popup.html'), 'utf8');
  const popupJs = fs.readFileSync(path.join(__dirname, '..', '..', 'popup', 'popup.js'), 'utf8');

  expectTrue('badge mode map includes 学', backgroundSource.includes("return '学';"));
  expectTrue('badge mode map includes 综', backgroundSource.includes("return '综';"));
  expectTrue('badge mode map includes 休', backgroundSource.includes("return '休';"));
  expectTrue('badge mode map includes 停', backgroundSource.includes("return '停';"));
  expectTrue('badge text set from mode', /setBadgeText\(\{ text: modeText \}\)/.test(backgroundSource));
  expectTrue('pending badge uses 休…', backgroundSource.includes("const modeText = pending ? '休…' : modeToBadgeText(runtimeMode);"));
  expectTrue('pending title contains remaining seconds', backgroundSource.includes('休息中 · 正在使用综合网站 · ${pending.remainingSeconds}秒后进入综合时间'));

  expectTrue('popup has compact runtime field', popupHtml.includes('id="runtime-compact"'));
  expectTrue('popup has study mode button', popupHtml.includes('id="btn-study"'));
  expectTrue('popup has rest mode button', popupHtml.includes('id="btn-rest"'));
  expectTrue('popup has composite mode button', popupHtml.includes('id="btn-composite"'));
  expectTrue('mode bar is vertical', popupHtml.includes('flex-direction: column;'));
  expectTrue('mode bar gap is 8px', popupHtml.includes('gap: 8px;'));
  expectTrue('mode button full width', popupHtml.includes('width: 100%;'));
  expectTrue('mode button min height 44px', popupHtml.includes('min-height: 44px;'));
  expectTrue('mode button row layout', popupHtml.includes('justify-content: space-between;'));
  expectTrue('mode button padding 0 12px', popupHtml.includes('padding: 0 12px;'));
  expectTrue('popup no longer contains 今日用量 title', !popupHtml.includes('今日用量'));
  expectTrue('popup no longer contains runtime-card', !popupHtml.includes('runtime-card'));
  expectTrue('popup requests runtime mode status', popupJs.includes("type: 'GET_RUNTIME_MODE_STATUS'"));
  expectTrue('popup has composite mode active class', popupJs.includes('active-composite'));
  expectTrue('popup supports SWITCH_TO_COMPOSITE', popupJs.includes("SWITCH_TO_COMPOSITE"));
  expectTrue('popup still caps visits to top 10', popupJs.includes('.slice(0, 10)'));
  expectTrue('popup background media is conditional', popupJs.includes('backendMediaSeconds > 0'));
  expectTrue('popup no undetermined bar in usage area', !popupJs.includes("待归类时长"));

  const total = passed + failed;
  console.log(`\n[Badge & Popup Mode V0] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

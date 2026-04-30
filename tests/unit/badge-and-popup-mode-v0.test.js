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

  expectTrue('popup has current mode field', popupHtml.includes('id="runtime-mode"'));
  expectTrue('popup has current domain field', popupHtml.includes('id="runtime-domain"'));
  expectTrue('popup has current session field', popupHtml.includes('id="runtime-session"'));
  expectTrue('popup has composite remaining field', popupHtml.includes('id="runtime-composite-remaining"'));
  expectTrue('popup has rest remaining field', popupHtml.includes('id="runtime-rest-remaining"'));
  expectTrue('popup requests runtime mode status', popupJs.includes("type: 'GET_RUNTIME_MODE_STATUS'"));

  const total = passed + failed;
  console.log(`\n[Badge & Popup Mode V0] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();


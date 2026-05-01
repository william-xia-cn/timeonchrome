// content-rest-composite-pending-banner.test.js
// Run with: node tests/unit/content-rest-composite-pending-banner.test.js

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
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'content.js'), 'utf8');

  expectTrue('handles REST_COMPOSITE_PENDING_START message', src.includes("msg.type === 'REST_COMPOSITE_PENDING_START'"));
  expectTrue('handles REST_COMPOSITE_PENDING_CANCEL message', src.includes("msg.type === 'REST_COMPOSITE_PENDING_CANCEL'"));
  expectTrue('handles REST_COMPOSITE_PENDING_SUCCESS message', src.includes("msg.type === 'REST_COMPOSITE_PENDING_SUCCESS'"));
  expectTrue('top-frame-only render guard exists', src.includes('const canRenderTopFrameUi = (() => {'));
  expectTrue('pending START guarded by top frame check', src.includes("if (!canRenderTopFrameUi) return;"));

  expectTrue('uses Shadow DOM for banner container', src.includes("attachShadow({ mode: 'open' })"));
  expectTrue('pending banner includes required headline', src.includes('正在使用综合网站'));
  expectTrue('pending banner includes countdown sentence', src.includes('秒后进入综合时间【剩余'));
  expectTrue('pending banner includes remaining composite token', src.includes('【剩余'));
  expectTrue('banner uses fixed positioning', src.includes('position: fixed;'));
  expectTrue('banner uses top offset', src.includes('top: 16px;'));
  expectTrue('banner uses max z-index', src.includes('z-index: 2147483647;'));
  expectTrue('banner has visible width constraints', src.includes('min-width: 300px;'));

  expectTrue('START updates countdown from deadlineAt', src.includes('const deadlineAt = Number(payload?.deadlineAt) || Date.now();'));
  expectTrue('local countdown interval exists', src.includes('setInterval(updateCountdown, 250)'));
  expectTrue('CANCEL clears timers and removes host', src.includes('function clearRestCompositePending()'));
  expectTrue('SUCCESS shows short notice', src.includes('已进入综合时间【剩余'));
  expectTrue('SUCCESS auto-hide exists', src.includes('setTimeout(() => {'));

  const total = passed + failed;
  console.log(`\n[Content Rest->Composite Pending Banner] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

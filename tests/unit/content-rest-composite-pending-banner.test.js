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

  expectTrue('handles AUTO_MODE_PENDING_START message', src.includes("msg.type === 'AUTO_MODE_PENDING_START'"));
  expectTrue('handles AUTO_MODE_PENDING_CANCEL message', src.includes("msg.type === 'AUTO_MODE_PENDING_CANCEL'"));
  expectTrue('handles AUTO_MODE_PENDING_SUCCESS message', src.includes("msg.type === 'AUTO_MODE_PENDING_SUCCESS'"));
  expectTrue('top-frame-only render guard exists', src.includes('const canRenderTopFrameUi = (() => {'));
  expectTrue('pending START guarded by top frame check', src.includes("if (!canRenderTopFrameUi) return;"));

  expectTrue('uses Shadow DOM for banner container', src.includes("attachShadow({ mode: 'open' })"));
  expectTrue('pending composite copy includes exact required template', src.includes('正在使用综合网站 · ${secondsRemaining}秒后进入综合时间 · 今日剩余 ${remainingCompositeTime}'));
  expectTrue('pending study copy includes exact required template', src.includes('正在使用学习网站 · ${secondsRemaining}秒后进入学习时间'));
  expectTrue('banner uses fixed positioning', src.includes('position: fixed;'));
  expectTrue('banner uses top offset', src.includes('top: 16px;'));
  expectTrue('banner uses max z-index', src.includes('z-index: 2147483647;'));
  expectTrue('banner has visible width constraints', src.includes('min-width: 300px;'));

  expectTrue('START updates countdown from deadlineAt', src.includes('const deadlineAt = Number(payload?.deadlineAt) || Date.now();'));
  expectTrue('local countdown interval exists', src.includes('setInterval(updateCountdown, 250)'));
  expectTrue('CANCEL clears timers and removes host', src.includes('function clearAutoModePending()'));
  expectTrue('SUCCESS composite copy is exact', src.includes('已进入综合时间 · 今日剩余 ${remainingCompositeTime}'));
  expectTrue('SUCCESS study copy is exact', src.includes("bannerEl.textContent = '已进入学习时间';"));
  expectTrue('Study banners never include 今日剩余', !src.includes('已进入学习时间 · 今日剩余'));
  expectTrue('SUCCESS auto-hide exists', src.includes('setTimeout(() => {'));

  const total = passed + failed;
  console.log(`\n[Content Rest->Composite Pending Banner] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

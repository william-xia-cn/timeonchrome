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
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'content.js'), 'utf8');

  expectTrue('handles AUTO_MODE_PENDING_START message', src.includes("msg.type === 'AUTO_MODE_PENDING_START'"));
  expectTrue('handles AUTO_MODE_PENDING_CANCEL message', src.includes("msg.type === 'AUTO_MODE_PENDING_CANCEL'"));
  expectTrue('handles AUTO_MODE_PENDING_SUCCESS message', src.includes("msg.type === 'AUTO_MODE_PENDING_SUCCESS'"));
  expectTrue('top-frame-only render guard exists', src.includes('const canRenderTopFrameUi = (() => {'));
  expectTrue('pending START guarded by top frame check', src.includes("reason: 'not_top_frame'"));
  expectTrue('mode notice replies with render ack', src.includes('rendered: true'));
  expectTrue('mode notice success confirms visibility', src.includes('visible: true') && src.includes('waitForModeNoticeVisible'));
  expectTrue('mode notice can report expired payload', src.includes("reason: 'expired_notice'"));

  expectTrue('uses Shadow DOM for banner container', src.includes("attachShadow({ mode: 'open' })"));
  expectTrue('uses mode notice container id', src.includes("__toc_mode_notice__"));
  expectTrue('pending composite copy includes exact required template', src.includes('正在使用综合网站 · ${secondsRemaining}秒后进入综合时间 · 今日剩余 ${remainingCompositeTime}'));
  expectTrue('pending study copy includes exact required template', src.includes('正在使用学习网站 · ${secondsRemaining}秒后进入学习时间'));
  expectTrue('banner uses fixed positioning', src.includes('position: fixed;'));
  expectTrue('banner uses top offset', src.includes('top: 16px;'));
  expectTrue('banner uses max z-index', src.includes('z-index: 2147483647;'));
  expectTrue('banner has visible width constraints', src.includes('min-width: 300px;'));

  expectTrue('START updates countdown from deadlineAt', src.includes('const deadlineAt = Number(payload?.deadlineAt) || Date.now();'));
  expectTrue('local countdown interval exists', src.includes('setInterval(updateCountdown, 250)'));
  expectTrue('pending START has local stale cleanup', src.includes('deadlineAt - Date.now() + 5000'));
  expectTrue('CANCEL clears timers and removes host', src.includes('function clearModeNotice()'));
  expectTrue('SUCCESS composite copy is exact', src.includes('你正在打开综合/待归类网站 · 即将进入综合模式 · 今日剩余 ${remainingCompositeTime}'));
  expectTrue('SUCCESS study copy is exact', src.includes('你正在打开学习网站 · 即将进入学习模式 · 今日剩余 ${remainingStudyTime}'));
  expectTrue('Study unlimited fallback exists', src.includes("const remainingStudyTime = payload?.remainingStudyTime || '不限';"));
  expectTrue('SUCCESS ignores expired payload', src.includes('Date.now() > Number(payload.expiresAt)'));
  expectTrue('SUCCESS default TTL is 4s', src.includes('Number(payload?.displayDuration) || 4000'));
  expectTrue('SUCCESS auto-hide is capped', src.includes('Math.min(Math.max'));
  expectTrue('SUCCESS auto-hide exists', src.includes('setTimeout(() => {'));
  expectTrue('SUCCESS waits for paint before ACK', src.includes('requestAnimationFrame') && src.includes('document.visibilityState'));
  expectTrue('top-frame ready includes visibility/focus recovery signals', src.includes("notifyContentScriptReady('visibilitychange')") && src.includes("notifyContentScriptReady('window_focus')"));

  const total = passed + failed;
  console.log(`\n[Content Rest->Composite Pending Banner] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

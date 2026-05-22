// Static guards for foreground PiP policy notice.
// Run with: node tests/unit/pip-policy-notice.test.js

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

const root = path.join(__dirname, '..', '..');
const content = fs.readFileSync(path.join(root, 'extension', 'content.js'), 'utf8');
const pipPolicy = fs.readFileSync(path.join(root, 'extension', 'core', 'pip-policy.js'), 'utf8');
const interceptor = fs.readFileSync(path.join(root, 'extension', 'product', 'interceptor.js'), 'utf8');

expectTrue('pip policy sends EXIT_PIP with policy notice enabled', pipPolicy.includes("type: 'EXIT_PIP'") && pipPolicy.includes('showPolicyNotice'));
expectTrue('pip policy carries exact notice copy', pipPolicy.includes('TimeOnChrome 当前禁止 PiP 播放，后续版本会陆续放开。'));
expectTrue('pip policy carries 5s notice duration', pipPolicy.includes('PIP_POLICY_NOTICE_DURATION_MS = 5000'));

expectTrue('content renders dedicated PiP policy notice only after actual exit', content.includes("result?.hadPiP === true && result?.exited === true"));
expectTrue('content uses dedicated PiP notice container', content.includes("__toc_pip_policy_notice__"));
expectTrue('content does not reuse ordinary guardian toast for PiP policy notice', content.includes('function showPiPPolicyNotice') && content.includes('toc-pip-policy-notice'));
expectTrue('content notice has explicit title', content.includes('PiP 已被关闭'));
expectTrue('content notice supports manual close', content.includes("aria-label=\"关闭\"") && content.includes("addEventListener('click', clearPiPPolicyNotice)"));
expectTrue('content notice duration is constrained to 4-6 seconds', content.includes('Math.min(Math.max(Number(durationMs) || PIP_POLICY_NOTICE_DEFAULT_MS, 4000), 6000)'));
expectTrue('content notice is large and visually explicit', content.includes('width: min(680px') && content.includes('min-height: 96px') && content.includes('background: #dc2626'));
expectTrue('content notice does not throttle repeated successful PiP closes', !content.includes('PIP_POLICY_NOTICE_THROTTLE_MS') && !content.includes("reason: 'throttled'"));

expectTrue('mode/product interceptor still does not own PiP policy notice', !interceptor.includes('PIP_POLICY_NOTICE') && !interceptor.includes('showPolicyNotice'));

const total = passed + failed;
console.log(`\n[PiP Policy Notice] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
if (failed > 0) process.exit(1);

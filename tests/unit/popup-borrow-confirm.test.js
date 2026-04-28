// popup-borrow-confirm.test.js
// Run with: node tests/unit/popup-borrow-confirm.test.js
// Note: P0 已移除 popup 侧借用功能，本测试验证借用 UI 不存在。

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

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

async function run() {
  section('B02-0 popup P0 不再包含借用 UI');
  {
    const html = fs.readFileSync(path.join(__dirname, '..', '..', 'popup', 'popup.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '..', '..', 'popup', 'popup.js'), 'utf8');
    expectTrue('popup.html 不含 borrow-btn', !html.includes('borrow-btn'));
    expectTrue('popup.html 不含 borrow-section', !html.includes('borrow-section'));
    expectTrue('popup.js 不含 renderBorrowSection', !js.includes('renderBorrowSection'));
    expectTrue('popup.js 不含 BORROW_REST_QUOTA 发送逻辑', !js.includes('BORROW_REST_QUOTA'));
  }

  const total = passed + failed;
  console.log(`\n[Popup Borrow Confirm] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

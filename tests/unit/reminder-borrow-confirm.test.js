// reminder-borrow-confirm.test.js
// V1-minimal: borrowing UI is disabled in reminder page.
// Run with: node tests/unit/reminder-borrow-confirm.test.js

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

function makeElement(id = '') {
  return {
    id,
    textContent: '',
    className: '',
    style: {},
    children: [],
    listeners: {},
    innerHTML: '',
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
  };
}

function setupAndRun(search) {
  const ids = [
    'mainIcon', 'mainTitle', 'subtitle', 'domainEl', 'actions', 'statusFeedback', 'stars', 'customMsg',
    'dualPathBorrowSection', 'slideConfirmWrapBorrow', 'dualPathCompositeSection', 'slideConfirmWrapComposite',
    'slideConfirmWrap', 'slideTrack', 'slideThumb', 'slideHint', 'restQuotaLine',
    'slideTrackComposite', 'slideThumbComposite', 'slideHintComposite',
    'slideTrackBorrow', 'slideThumbBorrow', 'slideHintBorrow', 'dualPathCompositeBody'
  ];
  const elements = {};
  for (const id of ids) elements[id] = makeElement(id);
  elements.slideTrack.clientWidth = 100;
  elements.slideThumb.clientWidth = 10;
  elements.slideTrackComposite.clientWidth = 100;
  elements.slideThumbComposite.clientWidth = 10;
  elements.slideTrackBorrow.clientWidth = 100;
  elements.slideThumbBorrow.clientWidth = 10;

  const sentMessages = [];
  const document = {
    referrer: '',
    body: { classList: { add() {} } },
    getElementById(id) { return elements[id] || null; },
    createElement(tag) { const el = makeElement(tag); el.tagName = String(tag).toUpperCase(); return el; },
  };

  const chrome = {
    runtime: {
      sendMessage(payload, cb) {
        sentMessages.push(payload);
        if (typeof cb === 'function') cb({ ok: true });
      },
      openOptionsPage() {},
    },
  };

  const context = {
    console,
    URLSearchParams,
    URL,
    location: { search },
    document,
    chrome,
    history: { back() {} },
    setTimeout(fn) { fn(); return 1; },
    addEventListener() {},
    window: null,
  };
  context.window = context;

  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'reminder.js'), 'utf8');
  vm.runInNewContext(code, context, { filename: 'reminder.js' });

  return { elements, sentMessages };
}

function run() {
  section('B01-1 quota_rest 不再渲染借用按钮');
  {
    const r = setupAndRun('?reason=quota_rest&domain=example.com');
    const actionTexts = r.elements.actions.children.map((c) => c.textContent || '');
    expectTrue('不包含“向明天借时间”按钮', !actionTexts.some((t) => t.includes('借时间') || t.includes('借用')));
    expectTrue('不发送 BORROW_REST_QUOTA', !r.sentMessages.some((m) => m?.type === 'BORROW_REST_QUOTA'));
  }

  section('B01-2 study_mode + restLocked 不显示借用滑轨区');
  {
    const r = setupAndRun('?reason=study_mode&restLocked=1&domain=example.com');
    expectTrue('restLocked 时休息滑轨不显示', r.elements.slideConfirmWrap.style.display !== 'block');
    expectTrue('dualPathBorrowSection 不显示', r.elements.dualPathBorrowSection.style.display !== 'block');
    expectTrue('slideConfirmWrapBorrow 不显示', r.elements.slideConfirmWrapBorrow.style.display !== 'block');
    expectTrue('不发送 BORROW_REST_QUOTA', !r.sentMessages.some((m) => m?.type === 'BORROW_REST_QUOTA'));
  }

  const total = passed + failed;
  console.log(`\n[Reminder Borrow Disabled] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

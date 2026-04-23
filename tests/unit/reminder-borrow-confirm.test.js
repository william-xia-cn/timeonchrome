// reminder-borrow-confirm.test.js
// Run with: node tests/unit/reminder-borrow-confirm.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function expectTrue(desc, cond) {
  if (cond) {
    passed++;
  } else {
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
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
    click() {
      if (this.listeners.click) this.listeners.click.call(this);
    },
    insertAdjacentHTML(_pos, _html) {},
  };
}

function setupAndRun({
  confirmReturn = true,
  borrowResponse = { ok: true, amount: 30 },
  deferBorrowResponse = false,
}) {
  const ids = [
    'mainIcon', 'mainTitle', 'subtitle', 'domainEl',
    'actions', 'statusFeedback', 'stars', 'customMsg'
  ];
  const elements = {};
  for (const id of ids) elements[id] = makeElement(id);

  // 初始为隐藏，便于断言“静默返回”
  elements.statusFeedback.style.display = 'none';

  const sentMessages = [];
  let confirmText = null;
  let pendingBorrowCb = null;

  const document = {
    referrer: '',
    getElementById(id) {
      return elements[id] || null;
    },
    createElement(tag) {
      const el = makeElement(tag);
      el.tagName = String(tag).toUpperCase();
      return el;
    },
  };

  const chrome = {
    runtime: {
      sendMessage(payload, cb) {
        sentMessages.push(payload);
        if (payload && payload.type === 'BORROW_REST_QUOTA') {
          if (deferBorrowResponse) {
            pendingBorrowCb = cb;
          } else if (typeof cb === 'function') {
            cb(borrowResponse);
          }
          return;
        }
        if (typeof cb === 'function') cb({ ok: true });
      },
      openOptionsPage() {},
    },
  };

  const context = {
    console,
    URLSearchParams,
    location: { search: '?reason=quota_rest&domain=example.com' },
    document,
    chrome,
    history: { back() {} },
    setTimeout(fn) { fn(); return 1; },
    window: null,
    confirm(text) {
      confirmText = text;
      return confirmReturn;
    },
  };
  context.window = context;

  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'reminder.js'), 'utf8');
  vm.runInNewContext(code, context, { filename: 'reminder.js' });

  const actions = elements.actions.children;
  const borrowBtn = actions.find(b => b.textContent.includes('向明天借时间'));
  if (!borrowBtn) throw new Error('borrow button not rendered');
  borrowBtn.click();

  return {
    sentMessages,
    confirmText,
    statusEl: elements.statusFeedback,
    borrowBtn,
    resolveBorrow() {
      if (pendingBorrowCb) {
        const cb = pendingBorrowCb;
        pendingBorrowCb = null;
        cb(borrowResponse);
      }
    },
  };
}

function run() {
  section('B01-1 cancel should be silent and not send BORROW_REST_QUOTA');
  {
    const r = setupAndRun({ confirmReturn: false });
    const originalText = r.borrowBtn.textContent;
    const originalDisabled = r.borrowBtn.disabled;
    expectTrue('确认弹窗被触发', typeof r.confirmText === 'string' && r.confirmText.length > 0);
    expectTrue('不发送借款消息', !r.sentMessages.some(m => m.type === 'BORROW_REST_QUOTA'));
    expectTrue('取消后不显示状态提示（静默返回）', r.statusEl.style.display === 'none');
    expectTrue('取消后按钮文案不变', r.borrowBtn.textContent === originalText);
    expectTrue('取消后按钮可点击状态不变', r.borrowBtn.disabled === originalDisabled);
  }

  section('B01-2 confirm text should match frozen wording exactly');
  {
    const r = setupAndRun({ confirmReturn: false });
    const expected = '确认借用明天时间？\n\n本次将立即增加今日可用休息时间 30 分钟，\n明天会扣减同等时长。\n明天不能连续再次借用。是否继续？';
    expectTrue('确认文案逐字一致', r.confirmText === expected);
  }

  section('B01-3 confirmed action enters processing and then keeps disabled on success');
  {
    const r = setupAndRun({ confirmReturn: true, borrowResponse: { ok: true, amount: 30 }, deferBorrowResponse: true });
    const borrows = r.sentMessages.filter(m => m.type === 'BORROW_REST_QUOTA');
    expectTrue('发送借款消息一次', borrows.length === 1);
    expectTrue('请求中按钮禁用', r.borrowBtn.disabled === true);
    expectTrue('请求中文案为处理中...', r.borrowBtn.textContent === '处理中...');
    r.resolveBorrow();
    expectTrue('成功后按钮保持禁用', r.borrowBtn.disabled === true);
    expectTrue('成功后按钮文案为已借用', r.borrowBtn.textContent === '已借用');
    expectTrue('成功后显示成功提示', r.statusEl.textContent.includes('已借用 30 分钟'));
  }

  section('B01-4 failure should restore button state and keep existing error mapping');
  {
    const r = setupAndRun({ confirmReturn: true, borrowResponse: { ok: false, error: 'already_borrowed' }, deferBorrowResponse: true });
    const originalText = '⏱ 向明天借时间';
    expectTrue('失败前处理中禁用', r.borrowBtn.disabled === true);
    expectTrue('失败前处理中文案', r.borrowBtn.textContent === '处理中...');
    r.resolveBorrow();
    expectTrue('失败后按钮恢复可点', r.borrowBtn.disabled === false);
    expectTrue('失败后按钮文案恢复原始值', r.borrowBtn.textContent === originalText);
    expectTrue('失败提示命中 already_borrowed 文案', r.statusEl.textContent.includes('已有未还借用'));
  }

  const total = passed + failed;
  console.log(`\n[Reminder Borrow Confirm] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

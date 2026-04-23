// popup-borrow-confirm.test.js
// Run with: node tests/unit/popup-borrow-confirm.test.js

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
  let _innerHTML = '';
  return {
    id,
    style: {},
    textContent: '',
    disabled: false,
    listeners: {},
    appendedHtml: [],
    set innerHTML(v) { _innerHTML = String(v); },
    get innerHTML() { return _innerHTML; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    async click() {
      if (this.listeners.click) return await this.listeners.click.call(this);
    },
    querySelector(_sel) {
      return {
        insertAdjacentHTML: (_pos, html) => this.appendedHtml.push(String(html)),
      };
    },
  };
}

function setup({
  confirmReturn = true,
  borrowResponse = { ok: true, amount: 30 },
  deferBorrowResponse = false,
} = {}) {
  const elements = {
    'borrow-section': makeElement('borrow-section'),
  };
  const sentMsgs = [];
  let confirmText = null;
  let pendingBorrowCb = null;
  const created = {};

  const document = {
    addEventListener() {},
    querySelector() { return makeElement('q'); },
    getElementById(id) {
      return elements[id] || created[id] || null;
    },
  };

  // 监听 borrow-section innerHTML，模拟 borrow-btn 出现
  const borrowSection = elements['borrow-section'];
  Object.defineProperty(borrowSection, 'innerHTML', {
    set(v) {
      this._inner = String(v);
      if (this._inner.includes('id="borrow-btn"')) {
        const btn = makeElement('borrow-btn');
        const m = this._inner.match(/<button[^>]*>(.*?)<\/button>/s);
        btn.textContent = m ? m[1].trim() : '';
        created['borrow-btn'] = btn;
        created['borrow-status'] = makeElement('borrow-status');
      } else {
        delete created['borrow-btn'];
        delete created['borrow-status'];
      }
    },
    get() { return this._inner || ''; },
    configurable: true,
  });

  const chrome = {
    runtime: {
      openOptionsPage() {},
      onMessage: { addListener() {} },
      sendMessage: (_payload, _cb) => {},
    },
    storage: { local: { get: (_k, cb) => cb({}) } }
  };

  const context = {
    console,
    Date,
    Math,
    document,
    chrome,
    window: null,
    confirm(text) { confirmText = text; return confirmReturn; },
  };
  context.window = context;

  chrome.runtime.sendMessage = (payload, cb) => {
    sentMsgs.push(payload);
    let resp = {};
    if (payload && payload.type === 'BORROW_REST_QUOTA') {
      if (deferBorrowResponse) {
        pendingBorrowCb = cb;
        return;
      }
      resp = borrowResponse;
    }
    else if (payload && payload.type === 'GET_CONFIG') resp = { quotaBorrow: null };
    else if (payload && payload.type === 'GET_STATS') resp = {};
    else if (payload && payload.type === 'GET_WEEK_REST_SECONDS') resp = { weekRestSeconds: 0 };
    if (typeof cb === 'function') cb(resp);
  };

  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'popup', 'popup.js'), 'utf8');
  vm.runInNewContext(code, context, { filename: 'popup.js' });
  context.init = async () => {};

  // 触发 borrow section 渲染（满足显示借款按钮条件）
  context.renderBorrowSection({ quotaBorrow: null }, { restLocked: true, weeklyRestLocked: false });
  const borrowBtn = document.getElementById('borrow-btn');
  if (!borrowBtn) throw new Error('borrow button not rendered');

  return {
    context,
    document,
    borrowSection,
    borrowBtn,
    sentMsgs,
    getConfirmText: () => confirmText,
    getStatusEl: () => document.getElementById('borrow-status'),
    resolveBorrow() {
      if (pendingBorrowCb) {
        const cb = pendingBorrowCb;
        pendingBorrowCb = null;
        cb(borrowResponse);
      }
    }
  };
}

async function run() {
  section('B02-1 cancel should be silent and must not send BORROW_REST_QUOTA');
  {
    const s = setup({ confirmReturn: false });
    const originalText = s.borrowBtn.textContent;
    const originalDisabled = s.borrowBtn.disabled;
    await s.borrowBtn.click();
    expectTrue('触发确认弹窗', typeof s.getConfirmText() === 'string' && s.getConfirmText().length > 0);
    expectTrue('取消时不发送借款请求', !s.sentMsgs.some(m => m.type === 'BORROW_REST_QUOTA'));
    expectTrue('取消前不应先进入处理中', s.borrowBtn.textContent === originalText && s.borrowBtn.disabled === originalDisabled);
  }

  section('B02-2 confirm text should match frozen wording exactly');
  {
    const s = setup({ confirmReturn: false });
    await s.borrowBtn.click();
    const expected = '确认借用明天时间？\n\n本次将立即增加今日可用休息时间 30 分钟，\n明天会扣减同等时长。\n明天不能连续再次借用。是否继续？';
    expectTrue('确认文案逐字一致', s.getConfirmText() === expected);
  }

  section('B02-3 confirmed action enters processing and keeps disabled on success');
  {
    const s = setup({ confirmReturn: true, borrowResponse: { ok: true, amount: 30 }, deferBorrowResponse: true });
    const p = s.borrowBtn.click();
    const borrowMsgs = s.sentMsgs.filter(m => m.type === 'BORROW_REST_QUOTA');
    expectTrue('借款请求仅发送一次', borrowMsgs.length === 1);
    expectTrue('请求中按钮禁用', s.borrowBtn.disabled === true);
    expectTrue('请求中文案为处理中...', s.borrowBtn.textContent === '处理中...');
    s.resolveBorrow();
    await p;
    const statusEl = s.getStatusEl();
    expectTrue('成功后按钮保持禁用', s.borrowBtn.disabled === true);
    expectTrue('成功后按钮文案为已借用', s.borrowBtn.textContent === '已借用');
    expectTrue('成功后显示成功提示', statusEl && statusEl.textContent.includes('已借用 30 分钟'));
  }

  section('B02-4 failed branch should rollback button and keep mapped error message');
  {
    const s = setup({ confirmReturn: true, borrowResponse: { ok: false, error: 'weekly_quota_exceeded' }, deferBorrowResponse: true });
    const p = s.borrowBtn.click();
    expectTrue('失败前处理中禁用', s.borrowBtn.disabled === true);
    expectTrue('失败前处理中文案', s.borrowBtn.textContent === '处理中...');
    s.resolveBorrow();
    await p;
    const statusEl = s.getStatusEl();
    expectTrue('失败后按钮恢复可点', s.borrowBtn.disabled === false);
    expectTrue('失败后按钮文案恢复原始值', s.borrowBtn.textContent === '⏱ 向明天借时间');
    expectTrue('失败提示命中 weekly_quota_exceeded 文案', statusEl && statusEl.textContent.includes('本周配额已用完，无法借用'));
  }

  const total = passed + failed;
  console.log(`\n[Popup Borrow Confirm] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

// admin-undetermined-list.test.js
// Run with: node tests/unit/admin-undetermined-list.test.js
// Verifies renderUndeterminedList neutralizes D-015 workflow labels for child-readable display.

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function expectEqual(desc, actual, expected) {
  if (actual === expected) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc} (actual=${String(actual)}, expected=${String(expected)})`);
  }
}

function expectTrue(desc, condition) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc} (condition false)`);
  }
}

function extractFunctionSource(code, functionName) {
  const marker = `function ${functionName}(`;
  const start = code.indexOf(marker);
  if (start < 0) throw new Error(`function ${functionName} not found`);
  const braceStart = code.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return code.slice(start, i + 1);
      }
    }
  }
  throw new Error(`function ${functionName} parse failed`);
}

function loadRenderUndeterminedList() {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'admin', 'admin.js'), 'utf8');
  const fns = [
    extractFunctionSource(code, 'escHtml'),
    extractFunctionSource(code, 'formatSeconds'),
    extractFunctionSource(code, 'renderUndeterminedList')
  ];

  // Mock DOM and dependencies
  const context = {
    document: {
      getElementById: () => ({ innerHTML: '' })
    },
    console
  };

  vm.runInNewContext(
    fns.join('\n') + '\nthis.__fn = renderUndeterminedList;',
    context,
    { filename: 'admin.js' }
  );

  return { fn: context.__fn, ctx: context };
}

function run() {
  console.log('[Admin Undetermined List — D-015 Label Neutralization]');

  const { fn: renderUndeterminedList, ctx } = loadRenderUndeterminedList();

  // Capture rendered innerHTML for inspection
  let capturedHtml = '';
  ctx.document.getElementById = () => ({
    set innerHTML(val) { capturedHtml = val; },
    get innerHTML() { return capturedHtml; }
  });

  const testCases = [
    {
      desc: 'pending -> 待归类',
      sessions: [{ domain: 'example.com', duration: 120, classification: 'pending' }],
      expectContains: ['待归类'],
      expectNotContains: ['待审核', '申诉中', '已改判', '标为学习', '标为休息', '<button', 'onclick']
    },
    {
      desc: 'appealing -> 待归类',
      sessions: [{ domain: 'example.com', duration: 120, classification: 'appealing' }],
      expectContains: ['待归类'],
      expectNotContains: ['待审核', '申诉中', '已改判', '标为学习', '标为休息', '<button', 'onclick']
    },
    {
      desc: 'study -> 学习',
      sessions: [{ domain: 'example.com', duration: 120, classification: 'study' }],
      expectContains: ['学习'],
      expectNotContains: ['待审核', '申诉中', '已改判', '标为学习', '标为休息', '<button', 'onclick']
    },
    {
      desc: 'rest -> 休息',
      sessions: [{ domain: 'example.com', duration: 120, classification: 'rest' }],
      expectContains: ['休息'],
      expectNotContains: ['待审核', '申诉中', '已改判', '标为学习', '标为休息', '<button', 'onclick']
    },
    {
      desc: 'empty list -> 暂无待归类明细',
      sessions: [],
      expectContains: ['暂无待归类明细'],
      expectNotContains: ['待审核', '申诉中', '已改判', '标为学习', '标为休息', '<button', 'onclick']
    },
    {
      desc: 'mixed statuses all neutralized',
      sessions: [
        { domain: 'a.com', duration: 60, classification: 'pending' },
        { domain: 'b.com', duration: 90, classification: 'appealing' },
        { domain: 'c.com', duration: 120, classification: 'study' },
        { domain: 'd.com', duration: 30, classification: 'rest' }
      ],
      expectContains: ['待归类', '学习', '休息'],
      expectNotContains: ['待审核', '申诉中', '已改判', '标为学习', '标为休息', '<button', 'onclick']
    }
  ];

  for (const tc of testCases) {
    capturedHtml = '';
    renderUndeterminedList.call(ctx, 'test-id', tc.sessions);

    for (const expected of tc.expectContains) {
      expectTrue(`${tc.desc}: contains "${expected}"`, capturedHtml.includes(expected));
    }
    for (const forbidden of tc.expectNotContains) {
      expectTrue(`${tc.desc}: does NOT contain "${forbidden}"`, !capturedHtml.includes(forbidden));
    }
  }

  const total = passed + failed;
  console.log(`\n[Admin Undetermined List] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

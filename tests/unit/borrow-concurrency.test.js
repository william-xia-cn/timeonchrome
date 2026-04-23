// borrow-concurrency.test.js
// Run with: node tests/unit/borrow-concurrency.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function expect(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadBorrowRestQuota(stubs) {
  const abs = path.join(__dirname, '..', '..', 'product', 'quota.js');
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');

  const context = {
    ...stubs,
    Date,
    Math,
    chrome: {
      notifications: { create() {} },
      tabs: { query: async () => [], update() {} },
      runtime: { getURL: () => '' },
    },
  };

  vm.createContext(context);
  vm.runInContext(`${code}\nthis.__borrowRestQuota = borrowRestQuota;`, context, { filename: 'quota.js' });
  return { borrowRestQuota: context.__borrowRestQuota };
}

async function run() {
  section('B05-1 单次借款不受影响（正常成功）');
  {
    const baseConfig = {
      dailyRestQuota: 120,
      weeklyRestQuota: 0,
      quotaBorrow: null,
      quotaState: { restLocked: true, weeklyRestLocked: true },
    };
    const { borrowRestQuota } = loadBorrowRestQuota({
      getConfig: async () => JSON.parse(JSON.stringify(baseConfig)),
      saveConfig: async () => {},
      getStatsRange: async () => ({}),
      matchDomain: () => false,
      getDateKey: () => '2026-04-22',
      formatDate: (d) => d.toISOString().slice(0, 10),
    });

    const r = await borrowRestQuota(async () => {});
    expectTrue('返回成功', r && r.ok === true);
    expectTrue('返回借用分钟数', typeof r.amount === 'number');
  }

  section('B05-2 真并发双请求：只允许一笔成功，另一笔返回 BORROW_IN_PROGRESS');
  {
    const baseConfig = {
      dailyRestQuota: 120,
      weeklyRestQuota: 0,
      quotaBorrow: null,
      quotaState: { restLocked: true, weeklyRestLocked: true },
    };
    let saveCount = 0;
    const { borrowRestQuota } = loadBorrowRestQuota({
      getConfig: async () => {
        // 故意延时，制造并发重叠窗口（真并发）
        await sleep(40);
        return JSON.parse(JSON.stringify(baseConfig));
      },
      saveConfig: async () => { saveCount++; },
      getStatsRange: async () => ({}),
      matchDomain: () => false,
      getDateKey: () => '2026-04-22',
      formatDate: (d) => d.toISOString().slice(0, 10),
    });

    const [r1, r2] = await Promise.all([
      borrowRestQuota(async () => {}),
      borrowRestQuota(async () => {}),
    ]);

    const successCount = [r1, r2].filter(r => r && r.ok === true).length;
    const conflictCount = [r1, r2].filter(r =>
      r && r.ok === false && r.error === 'borrow_in_progress' && r.code === 'BORROW_IN_PROGRESS'
    ).length;
    expect('恰好 1 笔成功', successCount, 1);
    expect('恰好 1 笔冲突', conflictCount, 1);
    expect('仅发生一次保存', saveCount, 1);
  }

  section('B05-3 冲突返回结构稳定');
  {
    const baseConfig = {
      dailyRestQuota: 120,
      weeklyRestQuota: 0,
      quotaBorrow: null,
      quotaState: { restLocked: true, weeklyRestLocked: true },
    };
    const { borrowRestQuota } = loadBorrowRestQuota({
      getConfig: async () => {
        await sleep(40);
        return JSON.parse(JSON.stringify(baseConfig));
      },
      saveConfig: async () => {},
      getStatsRange: async () => ({}),
      matchDomain: () => false,
      getDateKey: () => '2026-04-22',
      formatDate: (d) => d.toISOString().slice(0, 10),
    });

    const [r1, r2] = await Promise.all([
      borrowRestQuota(async () => {}),
      borrowRestQuota(async () => {}),
    ]);
    const conflict = [r1, r2].find(r => r && r.ok === false);
    expect('冲突结构固定', conflict, {
      ok: false,
      error: 'borrow_in_progress',
      code: 'BORROW_IN_PROGRESS',
    });
  }

  section('B05-4 异常路径后锁必须释放');
  {
    const baseConfig = {
      dailyRestQuota: 120,
      weeklyRestQuota: 0,
      quotaBorrow: null,
      quotaState: { restLocked: true, weeklyRestLocked: true },
    };
    let throwOnce = true;
    const { borrowRestQuota } = loadBorrowRestQuota({
      getConfig: async () => JSON.parse(JSON.stringify(baseConfig)),
      saveConfig: async () => {
        if (throwOnce) {
          throwOnce = false;
          throw new Error('save failed');
        }
      },
      getStatsRange: async () => ({}),
      matchDomain: () => false,
      getDateKey: () => '2026-04-22',
      formatDate: (d) => d.toISOString().slice(0, 10),
    });

    let firstErr = null;
    try {
      await borrowRestQuota(async () => {});
    } catch (e) {
      firstErr = e;
    }
    expectTrue('第一次调用确实抛错', !!firstErr);

    const second = await borrowRestQuota(async () => {});
    expectTrue('第二次调用不应再被 in-progress 卡住', !(second && second.error === 'borrow_in_progress'));
    expectTrue('第二次调用可继续执行并成功', second && second.ok === true);
  }

  const total = passed + failed;
  console.log(`\n[Borrow Concurrency] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

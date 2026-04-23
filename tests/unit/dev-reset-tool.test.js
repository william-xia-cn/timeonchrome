// dev-reset-tool.test.js
// Run with: node tests/unit/dev-reset-tool.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function expectEqual(desc, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
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

function loadDevReset() {
  const abs = path.join(__dirname, '..', '..', 'tools', 'dev-reset.js');
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');

  const context = {
    URLSearchParams,
    console,
    this: null,
  };
  context.this = context;

  vm.createContext(context);
  vm.runInContext(`${code}\nthis.__d = { hasDevResetFlag, canExecuteDevReset, clearLocalStats, clearLocalSessions, clearLocalLocks, requireDangerConfirm };`, context, { filename: 'tools/dev-reset.js' });
  return context.__d;
}

function createStorage(initial) {
  const state = { ...(initial || {}) };
  return {
    _state: state,
    async get(keys) {
      if (keys === null) return { ...state };
      if (Array.isArray(keys)) {
        const out = {};
        keys.forEach((k) => {
          if (Object.prototype.hasOwnProperty.call(state, k)) out[k] = state[k];
        });
        return out;
      }
      if (typeof keys === 'string') {
        return Object.prototype.hasOwnProperty.call(state, keys) ? { [keys]: state[keys] } : {};
      }
      return {};
    },
    async remove(keys) {
      const arr = Array.isArray(keys) ? keys : [keys];
      arr.forEach((k) => { delete state[k]; });
    },
    async set(obj) {
      Object.assign(state, obj);
    }
  };
}

async function run() {
  const d = loadDevReset();

  expectTrue('flag=1 应通过 hasDevResetFlag', d.hasDevResetFlag('?dev_reset=1'));
  expectTrue('无 flag 不通过 hasDevResetFlag', !d.hasDevResetFlag('?x=1'));
  expectTrue('development + flag 才允许执行', d.canExecuteDevReset('development', '?dev_reset=1'));
  expectTrue('非 development 不允许执行', !d.canExecuteDevReset('normal', '?dev_reset=1'));

  {
    const storage = createStorage({
      'stats_2026-01-01': { a: 1 },
      'undetermined_stats_2026-01-01': { b: 2 },
      'stats_2026-01-02': { c: 3 },
      other_key: 1
    });
    const r = await d.clearLocalStats(storage);
    expectEqual('清理统计应移除 3 项', r.cleaned[0].removed, 3);
    const remain = await storage.get(null);
    expectTrue('other_key 应保留', remain.other_key === 1);

    const r2 = await d.clearLocalStats(storage);
    expectEqual('二次执行应幂等并 skipped', r2.skipped[0].reason, 'not_found');
  }

  {
    const storage = createStorage({ guardian_session: {}, guardian_sessions: {}, visit_sessions: {}, x: 1 });
    const r = await d.clearLocalSessions(storage);
    expectEqual('清理会话应移除 3 项', r.cleaned[0].removed, 3);
    const remain = await storage.get(null);
    expectTrue('x 应保留', remain.x === 1);
  }

  {
    const storage = createStorage({});
    const r = await d.clearLocalLocks(storage);
    expectEqual('guardian_config 不存在应 skipped', r.skipped[0].reason, 'not_found');
  }

  {
    const storage = createStorage({
      guardian_config: {
        lockedDomains: ['a.com', 'b.com'],
        quotaState: { onlineLocked: true, studyLocked: false, restLocked: true, undeterminedLocked: false },
        mode: 'study'
      }
    });
    const r = await d.clearLocalLocks(storage);
    expectEqual('清理锁定状态 removed 计数', r.cleaned[0].removed, 4);
    const cfg = (await storage.get('guardian_config')).guardian_config;
    expectEqual('lockedDomains 清空', cfg.lockedDomains, []);
    expectEqual('quotaState 归零', cfg.quotaState, { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false });
    expectEqual('其他字段保留', cfg.mode, 'study');

    const r2 = await d.clearLocalLocks(storage);
    expectEqual('锁定状态重复清理幂等', r2.cleaned[0].removed, 0);
  }

  {
    const ok = await d.requireDangerConfirm(() => true, () => 'RESET');
    expectTrue('二次确认正确短语应通过', ok === true);
    const bad = await d.requireDangerConfirm(() => true, () => 'NO');
    expectTrue('短语错误应拒绝', bad === false);
  }

  const total = passed + failed;
  console.log(`\n[Dev Reset Tool] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Unit tests for recovery mechanism (runtime/recovery.js)
// Run with: node tests/unit/recovery.test.js

'use strict';

// ── Mock Chrome Storage ─────────────────────────────────────────────────────

class MockStorage {
  constructor() {
    this.data = {};
  }
  reset() {
    this.data = {};
  }
  get(keys) {
    const result = {};
    if (Array.isArray(keys)) {
      keys.forEach(k => { result[k] = this.data[k]; });
    } else if (typeof keys === 'string') {
      result[keys] = this.data[keys];
    } else if (typeof keys === 'object') {
      Object.keys(keys).forEach(k => { result[k] = this.data[k] ?? keys[k]; });
    }
    return Promise.resolve(result);
  }
  set(obj) {
    Object.assign(this.data, obj);
    return Promise.resolve();
  }
}

const mockSessionStorage = new MockStorage();
const mockLocalStorage = new MockStorage();

global.chrome = {
  storage: {
    session: mockSessionStorage,
    local: mockLocalStorage,
  },
};

// ── Inline recovery logic ───────────────────────────────────────────────────

const SESSION_KEY = 'session_v1';
const EVENT_LOG_KEY = 'event_log_v1';
const RECOVERY_ESTIMATE_MS = 90 * 1000; // 半个 checkpoint

const EVENT_TYPE = { START: 'START', END: 'END' };

async function getSession() {
  const data = await mockSessionStorage.get(SESSION_KEY);
  return data[SESSION_KEY] || null;
}

async function saveSession(session) {
  await mockSessionStorage.set({ [SESSION_KEY]: session });
}

async function getEvents() {
  const data = await mockLocalStorage.get(EVENT_LOG_KEY);
  return data[EVENT_LOG_KEY] || [];
}

async function appendEvent(event) {
  const events = await getEvents();
  events.push(event);
  await mockLocalStorage.set({ [EVENT_LOG_KEY]: events });
}

async function recover(fakeNow) {
  const session = await getSession();
  if (!session || !session.state || !session.startTime) return;

  const now = fakeNow !== undefined ? fakeNow : Date.now();
  const endTime = Math.min(now, session.startTime + RECOVERY_ESTIMATE_MS);
  const durationSeconds = Math.floor(Math.max(0, endTime - session.startTime) / 1000);

  // 幂等检查：如果最后一条已是同一段会话的 END，则不重复追加
  const events = await getEvents();
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const alreadyClosed = !!lastEvent &&
    lastEvent.type === EVENT_TYPE.END &&
    lastEvent.state === session.state &&
    lastEvent.domain === session.domain &&
    lastEvent.time === endTime;

  if (!alreadyClosed && durationSeconds > 0) {
    await appendEvent({
      type: EVENT_TYPE.END,
      state: session.state,
      domain: session.domain,
      time: endTime,
    });
  }

  await saveSession({
    state: null,
    domain: null,
    startTime: null,
    lastHeartbeat: now,
  });
}

// ── Inline transitionState logic (from runtime/session.js) ───────────────────

async function transitionState(newState, newDomain) {
  const session = await getSession();
  if (!session) return;
  const now = Date.now();

  // 没变化直接忽略（抗抖）
  if (session.state === newState && session.domain === newDomain) return;

  // 1. 关闭旧事件
  if (session.state && session.startTime) {
    await appendEvent({
      type: EVENT_TYPE.END,
      state: session.state,
      domain: session.domain,
      time: now,
    });
  }

  // 2. 开启新事件
  if (newState) {
    await appendEvent({
      type: EVENT_TYPE.START,
      state: newState,
      domain: newDomain,
      time: now,
    });
  }

  // 3. 更新 session
  await saveSession({
    state: newState,
    domain: newDomain,
    startTime: newState ? now : null,
    lastHeartbeat: now,
  });
}

// ── Test runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function expect(description, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${description}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

function expectTrue(description, value) {
  if (value === true) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${description} (got ${JSON.stringify(value)})`);
  }
}

function section(name) {
  console.log(`\n[${name}]`);
}

function resetStorage() {
  mockSessionStorage.reset();
  mockLocalStorage.reset();
}

// ── Tests (sequential async) ────────────────────────────────────────────────

async function runTests() {

// ── Recovery: 短窗口恢复（now 早于半 checkpoint）──────────────────────────────

section('Recovery: 短窗口恢复（使用 now）');

{
  resetStorage();

  const baseTime = 1000000;
  await mockSessionStorage.set({
    [SESSION_KEY]: {
      state: 'ACTIVE',
      domain: 'youtube.com',
      startTime: baseTime,
      lastHeartbeat: baseTime + 10000,
    }
  });

  const fakeNow = baseTime + 10000 + 5000;
  await recover(fakeNow);

  const events = await getEvents();
  expect('补写 1 个 END 事件', events.length, 1);
  expect('END 事件类型为 END', events[0].type, 'END');
  expect('END 事件状态', events[0].state, 'ACTIVE');
  expect('END 事件域名', events[0].domain, 'youtube.com');
  expect('END 事件时间 = 当前时间', events[0].time, fakeNow);

  const session = await getSession();
  expectTrue('session.state 重置为 null', session.state === null);
  expectTrue('session.domain 重置为 null', session.domain === null);
  expect('session.lastHeartbeat 更新', session.lastHeartbeat, fakeNow);
}

// ── Recovery: 长窗口恢复（半 checkpoint 估算）────────────────────────────────

section('Recovery: 长窗口恢复（半 checkpoint 估算）');

{
  resetStorage();

  const baseTime = 1000000;
  const twoHoursAgo = baseTime - 2 * 60 * 60 * 1000;
  const fourHoursAgo = baseTime - 4 * 60 * 60 * 1000;

  await mockSessionStorage.set({
    [SESSION_KEY]: {
      state: 'ACTIVE',
      domain: 'youtube.com',
      startTime: fourHoursAgo,
      lastHeartbeat: twoHoursAgo,
    }
  });

  await recover(baseTime);

  const events = await getEvents();
  expect('补写 1 个 END 事件', events.length, 1);
  expect('END 事件时间 = startTime + 90s', events[0].time, fourHoursAgo + RECOVERY_ESTIMATE_MS);
  expect('END 事件状态', events[0].state, 'ACTIVE');
  expect('END 事件域名', events[0].domain, 'youtube.com');

  const session = await getSession();
  expectTrue('session 重置', session.state === null && session.domain === null);
}

// ── Recovery: 边界值（now = start + 90s 正好）─────────────────────────────────

section('Recovery: 边界值（now = start + 90s）');

{
  resetStorage();

  const baseTime = 1000000;
  const startTime = baseTime - 90000;

  await mockSessionStorage.set({
    [SESSION_KEY]: {
      state: 'ACTIVE',
      domain: 'google.com',
      startTime,
      lastHeartbeat: baseTime - 10_000,
    }
  });

  await recover(baseTime);

  const events = await getEvents();
  expect('END 事件时间 = 当前时间（正好半 checkpoint）', events[0].time, baseTime);
}

// ── Recovery: 无 session 跳过 ────────────────────────────────────────────────

section('Recovery: 无 session 跳过');

{
  resetStorage();

  await recover(1000000);

  const events = await getEvents();
  expect('无事件写入', events.length, 0);
}

// ── Recovery: session 存在但 state 为 null 跳过 ──────────────────────────────

section('Recovery: state 为 null 跳过');

{
  resetStorage();

  await mockSessionStorage.set({
    [SESSION_KEY]: {
      state: null,
      domain: null,
      startTime: null,
      lastHeartbeat: 900000,
    }
  });

  await recover(1000000);

  const events = await getEvents();
  expect('无事件写入', events.length, 0);
}

// ── Recovery: session 存在但 startTime 为 null 跳过 ──────────────────────────

section('Recovery: startTime 为 null 跳过');

{
  resetStorage();

  await mockSessionStorage.set({
    [SESSION_KEY]: {
      state: 'ACTIVE',
      domain: 'youtube.com',
      startTime: null,
      lastHeartbeat: 900000,
    }
  });

  await recover(1000000);

  const events = await getEvents();
  expect('无事件写入', events.length, 0);
}

// ── Recovery: 防止重复恢复 ───────────────────────────────────────────────────

section('Recovery: 防止重复恢复');

{
  resetStorage();

  const baseTime = 1000000;
  const twoHoursAgo = baseTime - 2 * 60 * 60 * 1000;

  await mockSessionStorage.set({
    [SESSION_KEY]: {
      state: 'ACTIVE',
      domain: 'youtube.com',
      startTime: twoHoursAgo - 60000,
      lastHeartbeat: twoHoursAgo,
    }
  });

  await recover(baseTime);
  const events1 = await getEvents();
  expect('第一次恢复：1 个 END 事件', events1.length, 1);

  await recover(baseTime + 1000);
  const events2 = await getEvents();
  expect('第二次恢复：仍只有 1 个 END 事件', events2.length, 1);
}

// ── Recovery: 不同状态恢复 ───────────────────────────────────────────────────

section('Recovery: BACKGROUND_ACTIVE 状态恢复');

{
  resetStorage();

  const baseTime = 1000000;
  const oneHourAgo = baseTime - 60 * 60 * 1000;

  await mockSessionStorage.set({
    [SESSION_KEY]: {
      state: 'BACKGROUND_ACTIVE',
      domain: 'music.youtube.com',
      startTime: oneHourAgo - 30000,
      lastHeartbeat: oneHourAgo,
    }
  });

  await recover(baseTime);

  const events = await getEvents();
  expect('END 事件状态 = BACKGROUND_ACTIVE', events[0].state, 'BACKGROUND_ACTIVE');
  expect('END 事件域名 = music.youtube.com', events[0].domain, 'music.youtube.com');
  expect('END 事件时间 = startTime + 90s', events[0].time, oneHourAgo - 30000 + RECOVERY_ESTIMATE_MS);
}

// ── Recovery: 完整时长计算验证 ───────────────────────────────────────────────

section('Recovery: 完整时长计算验证（估算场景）');

{
  resetStorage();

  const baseTime = 1000000;
  const twoHoursAgo = baseTime - 2 * 60 * 60 * 1000;

  await mockSessionStorage.set({
    [SESSION_KEY]: {
      state: 'ACTIVE',
      domain: 'youtube.com',
      startTime: twoHoursAgo,
      lastHeartbeat: twoHoursAgo, // lastHeartbeat = start time (2 hours ago)
    }
  });

  await recover(baseTime);

  const events = await getEvents();
  expect('恢复写入 1 个 END 事件', events.length, 1);
  expect('END 事件类型正确', events[0].type, 'END');
  expect('END 事件时间 = startTime + 90s', events[0].time, twoHoursAgo + RECOVERY_ESTIMATE_MS);
}

// ── SR-1: Lifecycle recovery 后 transitionState 不重复关闭 ──

section('SR-1: lifecycle recovery closes residual session before transitionState');

{
  resetStorage();

  const baseTime = 1000000;
  const twoHoursAgo = baseTime - 2 * 60 * 60 * 1000;

  // 1. 模拟 lifecycle boundary 前遗留的 ACTIVE session
  await mockSessionStorage.set({
    [SESSION_KEY]: {
      state: 'ACTIVE',
      domain: 'youtube.com',
      startTime: twoHoursAgo,
      lastHeartbeat: twoHoursAgo,
    }
  });

  // 预写对应的 START 事件
  await mockLocalStorage.set({
    [EVENT_LOG_KEY]: [
      { type: 'START', state: 'ACTIVE', domain: 'youtube.com', time: twoHoursAgo }
    ]
  });

  // 2. 模拟 lifecycle boundary 调用 recover
  await recover(baseTime);

  // 3. recover 应按半 checkpoint 估算，END 时间不是当前时间
  const eventsAfterRecover = await getEvents();
  expect('SR-1: recover 产生 1 个 END 事件', eventsAfterRecover.length, 2);
  const endEvent = eventsAfterRecover.find(e => e.type === 'END');
  expect('SR-1: END 时间使用 startTime + 90s', endEvent.time, twoHoursAgo + RECOVERY_ESTIMATE_MS);
  expect('SR-1: END 状态正确', endEvent.state, 'ACTIVE');
  expect('SR-1: END 域名正确', endEvent.domain, 'youtube.com');

  const sessionAfterRecover = await getSession();
  expectTrue('SR-1: recover 后 session.state 为 null', sessionAfterRecover.state === null);
  expectTrue('SR-1: recover 后 session.domain 为 null', sessionAfterRecover.domain === null);

  // 4. 模拟后续信号触发 transitionState（domain 切换）
  // 由于 session 已被重置，transitionState 不应产生额外的 stale END
  const originalNow = Date.now;
  Date.now = () => baseTime;
  await transitionState('ACTIVE', 'google.com');
  Date.now = originalNow;

  const eventsAfterTransition = await getEvents();
  expect('SR-1: transitionState 后总共 3 个事件（START + recover END + 新 START）', eventsAfterTransition.length, 3);

  const endEvents = eventsAfterTransition.filter(e => e.type === 'END');
  expect('SR-1: 只有 1 个 END 事件（recover 产生的，transitionState 未重复关闭）', endEvents.length, 1);

  const startEvents = eventsAfterTransition.filter(e => e.type === 'START');
  expect('SR-1: 有 2 个 START 事件', startEvents.length, 2);
  expect('SR-1: 第二个 START 域名正确', startEvents[1].domain, 'google.com');
  expect('SR-1: 第二个 START 时间正确', startEvents[1].time, baseTime);
}

// ── Summary ───────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n[Recovery] ${passed}/${total} passed${failed > 0 ? ` — ${failed} FAILED` : ''}`);

if (failed > 0) {
  process.exit(1);
}

}

runTests().catch(err => { console.error(err); process.exit(1); });

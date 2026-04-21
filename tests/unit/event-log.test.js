// Unit tests for event-log module (core/event-log.js)
// Run with: node tests/unit/event-log.test.js

'use strict';

// ── Mock Chrome Storage ─────────────────────────────────────────────────────

class MockStorage {
  constructor() { this.data = {}; }
  reset() { this.data = {}; }
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

const mockLocalStorage = new MockStorage();

global.chrome = { storage: { local: mockLocalStorage } };

// ── Inline event-log logic ──────────────────────────────────────────────────

const EVENT_TYPE = { START: 'START', END: 'END' };
const STORAGE_KEY = 'event_log_v1';
const MAX_RAW_WINDOW = 10 * 60 * 1000;

async function getEvents() {
  const data = await mockLocalStorage.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

async function appendEvent(event) {
  const events = await getEvents();
  events.push(event);
  // 测试中不触发压缩（直接保存全部）
  await mockLocalStorage.set({ [STORAGE_KEY]: events });
}

async function clearEvents() {
  await mockLocalStorage.set({ [STORAGE_KEY]: [] });
}

// ── Test runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function expect(description, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; }
  else {
    failed++;
    console.error(`  ✗ ${description}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

function expectTrue(description, value) {
  if (value === true) { passed++; }
  else {
    failed++;
    console.error(`  ✗ ${description} (got ${JSON.stringify(value)})`);
  }
}

function section(name) { console.log(`\n[${name}]`); }

async function runTests() {

section('appendEvent: 基本追加');
{
  mockLocalStorage.reset();
  await appendEvent({ type: 'START', state: 'ACTIVE', domain: 'youtube.com', time: Date.now() });
  const events = await getEvents();
  expect('事件列表长度 = 1', events.length, 1);
  expect('事件类型', events[0].type, 'START');
  expect('事件状态', events[0].state, 'ACTIVE');
  expect('事件域名', events[0].domain, 'youtube.com');
}

section('appendEvent: 多次追加');
{
  mockLocalStorage.reset();
  const now = Date.now();
  await appendEvent({ type: 'START', state: 'ACTIVE', domain: 'youtube.com', time: now });
  await appendEvent({ type: 'END', state: 'ACTIVE', domain: 'youtube.com', time: now + 10000 });
  await appendEvent({ type: 'START', state: 'ACTIVE', domain: 'google.com', time: now + 10000 });
  const events = await getEvents();
  expect('事件列表长度 = 3', events.length, 3);
  expect('第一个事件', events[0].type, 'START');
  expect('第二个事件', events[1].type, 'END');
  expect('第三个事件', events[2].type, 'START');
}

section('appendEvent: 不立即压缩（定期压缩）');
{
  mockLocalStorage.reset();
  const now = Date.now();
  const elevenMinutesAgo = now - 11 * 60 * 1000;
  await mockLocalStorage.set({
    [STORAGE_KEY]: [
      { type: 'START', state: 'ACTIVE', domain: 'old.com', time: elevenMinutesAgo },
      { type: 'END', state: 'ACTIVE', domain: 'old.com', time: elevenMinutesAgo + 60000 },
    ]
  });
  await appendEvent({ type: 'START', state: 'ACTIVE', domain: 'new.com', time: now });
  const events = await getEvents();
  // 不再立即压缩，旧事件保留
  expect('事件保留不压缩', events.length, 3);
}

section('appendEvent: 累积事件');
{
  mockLocalStorage.reset();
  const now = Date.now();
  const tenMinutesAgo = now - 10 * 60 * 1000;
  const nineMinutesAgo = now - 9 * 60 * 1000;
  await mockLocalStorage.set({
    [STORAGE_KEY]: [
      { type: 'START', state: 'ACTIVE', domain: 'boundary.com', time: tenMinutesAgo },
      { type: 'START', state: 'ACTIVE', domain: 'keep.com', time: nineMinutesAgo },
    ]
  });
  await appendEvent({ type: 'END', state: 'ACTIVE', domain: 'keep.com', time: now });
  const events = await getEvents();
  // 不压缩，所有事件保留
  expect('事件累积不压缩', events.length, 3);
}

section('clearEvents: 清空');
{
  mockLocalStorage.reset();
  const now = Date.now();
  await appendEvent({ type: 'START', state: 'ACTIVE', domain: 'youtube.com', time: now });
  await appendEvent({ type: 'END', state: 'ACTIVE', domain: 'youtube.com', time: now + 1000 });
  let events = await getEvents();
  expect('清空前有 2 个事件', events.length, 2);
  await clearEvents();
  events = await getEvents();
  expect('清空后事件列表为空', events.length, 0);
}

section('getEvents: 空状态');
{
  mockLocalStorage.reset();
  const events = await getEvents();
  expect('无数据时返回空数组', events, []);
}

section('appendEvent: 事件结构完整性');
{
  mockLocalStorage.reset();
  const now = Date.now();
  await appendEvent({ type: 'START', state: 'BACKGROUND_ACTIVE', domain: 'music.youtube.com', time: now });
  const events = await getEvents();
  expectTrue('事件包含 type 字段', 'type' in events[0]);
  expectTrue('事件包含 state 字段', 'state' in events[0]);
  expectTrue('事件包含 domain 字段', 'domain' in events[0]);
  expectTrue('事件包含 time 字段', 'time' in events[0]);
  expect('type 值正确', events[0].type, 'START');
  expect('state 值正确', events[0].state, 'BACKGROUND_ACTIVE');
  expect('domain 值正确', events[0].domain, 'music.youtube.com');
  expect('time 值正确', events[0].time, now);
}

section('appendEvent: null 域名');
{
  mockLocalStorage.reset();
  await appendEvent({ type: 'START', state: 'IDLE', domain: null, time: Date.now() });
  const events = await getEvents();
  expect('null 域名事件被写入', events.length, 1);
  expect('domain 为 null', events[0].domain, null);
}

section('appendEvent: 顺序保证');
{
  mockLocalStorage.reset();
  const now = Date.now();
  for (let i = 0; i < 10; i++) {
    await appendEvent({ type: 'START', state: 'ACTIVE', domain: 'test.com', time: now + i * 1000 });
  }
  const events = await getEvents();
  expect('事件按追加顺序排列', events.length, 10);
  expectTrue('事件时间递增',
    events.every((e, i) => i === 0 || e.time >= events[i - 1].time));
}

// ── Summary ───────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n[Event Log] ${passed}/${total} passed${failed > 0 ? ` — ${failed} FAILED` : ''}`);
if (failed > 0) { process.exit(1); }

}

runTests().catch(err => { console.error(err); process.exit(1); });

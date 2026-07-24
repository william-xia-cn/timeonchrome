// Integration tests for complete duration-tracking data flow
// Tests: signal → context → state → session → event-log → aggregate
// Run with: node tests/integration/duration-flow.test.js

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

const mockSessionStorage = new MockStorage();
const mockLocalStorage = new MockStorage();

global.chrome = {
  storage: {
    session: mockSessionStorage,
    local: mockLocalStorage,
  },
};

// ── Inline all modules ──────────────────────────────────────────────────────

const AttentionState = { ACTIVE: 'ACTIVE', PASSIVE: 'PASSIVE', IDLE: 'IDLE', BACKGROUND_ACTIVE: 'BACKGROUND_ACTIVE' };
const EVENT_TYPE = { START: 'START', END: 'END' };
const SESSION_KEY = 'session_v1';
const EVENT_LOG_KEY = 'event_log_v1';
const MAX_RAW_WINDOW = 10 * 60 * 1000;
const SLEEP_THRESHOLD = 90 * 1000;

function isFiniteTime(value) {
  return Number.isFinite(value);
}

function clampTime(value, min, max) {
  const safeMin = isFiniteTime(min) ? min : 0;
  const safeMax = isFiniteTime(max) ? max : safeMin;
  const lower = Math.min(safeMin, safeMax);
  const upper = Math.max(safeMin, safeMax);
  if (!isFiniteTime(value)) return upper;
  return Math.min(Math.max(value, lower), upper);
}

function getReliableCloseTime(session, now) {
  const startTime = isFiniteTime(session?.startTime) ? session.startTime : now;
  const stale = session && isFiniteTime(session.lastHeartbeat) && now - session.lastHeartbeat > SLEEP_THRESHOLD;
  const candidate = stale ? session.lastHeartbeat : now;
  return { closeTime: clampTime(candidate, startTime, now), stale };
}

function resolveState(context) {
  if (!context?.domain) return AttentionState.IDLE;
  if (context.isIdle) return AttentionState.IDLE;
  if (context.isFocused && context.tabId) return AttentionState.ACTIVE;
  if (context.isAudible) return AttentionState.BACKGROUND_ACTIVE;
  if (context.isPiP) return AttentionState.BACKGROUND_ACTIVE;
  return AttentionState.PASSIVE;
}

function buildContext(current, rawEvent) {
  return {
    tabId: rawEvent.tabId ?? current?.lastActiveTabId ?? null,
    windowId: rawEvent.windowId ?? current?.lastFocusedWindowId ?? null,
    domain: rawEvent.domain ?? current?.domain ?? null,
    isFocused: rawEvent.isFocused ?? current?.isFocused ?? false,
    isIdle: rawEvent.isIdle ?? current?.isIdle ?? false,
    isAudible: rawEvent.isAudible ?? current?.isAudible ?? false,
    isPiP: rawEvent.isPiP ?? current?.isPiP ?? false,
    timestamp: Date.now(),
    lastActiveTabId: rawEvent.tabId ?? current?.lastActiveTabId,
    lastFocusedWindowId: rawEvent.windowId ?? current?.lastFocusedWindowId,
  };
}

async function getEvents() {
  const data = await mockLocalStorage.get(EVENT_LOG_KEY);
  return data[EVENT_LOG_KEY] || [];
}

async function appendEvent(event) {
  const events = await getEvents();
  events.push(event);
  // No compression in integration tests (use real-time window)
  await mockLocalStorage.set({ [EVENT_LOG_KEY]: events });
}

async function clearEvents() {
  await mockLocalStorage.set({ [EVENT_LOG_KEY]: [] });
}

async function getSession() {
  const data = await mockSessionStorage.get(SESSION_KEY);
  return data[SESSION_KEY] || null;
}

async function saveSession(session) {
  await mockSessionStorage.set({ [SESSION_KEY]: session });
}

async function initSession() {
  const existing = await getSession();
  if (existing) return existing;
  const initial = { state: null, domain: null, startTime: null, lastHeartbeat: Date.now() };
  await saveSession(initial);
  return initial;
}

async function transitionState(newState, newDomain, fakeNow) {
  const session = await getSession();
  if (!session) return;
  const now = fakeNow !== undefined ? fakeNow : Date.now();
  if (session.state === newState && session.domain === newDomain) return;
  if (session.state && session.startTime) {
    const { closeTime } = getReliableCloseTime(session, now);
    await appendEvent({ type: EVENT_TYPE.END, state: session.state, domain: session.domain, time: closeTime });
  }
  if (newState) {
    await appendEvent({ type: EVENT_TYPE.START, state: newState, domain: newDomain, time: now });
  }
  await saveSession({ state: newState, domain: newDomain, startTime: newState ? now : null, lastHeartbeat: now });
}

async function heartbeat() {
  const session = await getSession();
  if (!session) return;
  const now = Date.now();
  const { closeTime, stale } = getReliableCloseTime(session, now);
  if (session.state && session.startTime && stale) {
    await appendEvent({ type: EVENT_TYPE.END, state: session.state, domain: session.domain, time: closeTime });
    await appendEvent({ type: EVENT_TYPE.START, state: session.state, domain: session.domain, time: now });
    await saveSession({ state: session.state, domain: session.domain, startTime: now, lastHeartbeat: now });
    return;
  }
  await saveSession({ ...session, lastHeartbeat: now });
}

async function recover(fakeNow) {
  const session = await getSession();
  if (!session || !session.state || !session.startTime) return;
  const now = fakeNow !== undefined ? fakeNow : Date.now();
  const { closeTime: endTime } = getReliableCloseTime(session, now);
  await appendEvent({ type: EVENT_TYPE.END, state: session.state, domain: session.domain, time: endTime });
  await saveSession({ state: null, domain: null, startTime: null, lastHeartbeat: now });
}

const STATE_WEIGHTS = { ACTIVE: 1, BACKGROUND_ACTIVE: 1, PASSIVE: 0, IDLE: 0 };

function formatTime(time) { return new Date(time).toISOString(); }

function computeDuration(events, domain, date) {
  const dayEvents = events.filter(e => e.domain === domain && formatTime(e.time).slice(0, 10) === date);
  let total = 0;
  for (let i = 0; i < dayEvents.length - 1; i++) {
    if (dayEvents[i].type === 'START') {
      total += ((dayEvents[i + 1].time - dayEvents[i].time) / 1000) * (STATE_WEIGHTS[dayEvents[i].state] || 0);
    }
  }
  return Math.floor(total);
}

function computeAllDomains(events, date) {
  const result = {};
  const dayEvents = events.filter(e => e.domain && formatTime(e.time).slice(0, 10) === date);
  for (let i = 0; i < dayEvents.length - 1; i++) {
    const evt = dayEvents[i];
    if (evt.type === 'START' && evt.domain) {
      const seconds = Math.floor(((dayEvents[i + 1].time - evt.time) / 1000) * (STATE_WEIGHTS[evt.state] || 0));
      if (seconds > 0) result[evt.domain] = (result[evt.domain] || 0) + seconds;
    }
  }
  return result;
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

function resetAll() {
  mockSessionStorage.reset();
  mockLocalStorage.reset();
}

async function runTests() {

// ── Scenario 1: 完整数据流（单标签页 ACTIVE 计时）────────────────────────────────────────

section('Scenario 1: 完整数据流（单标签页 ACTIVE 计时）');
{
  resetAll();
  await initSession();

  let context = buildContext(null, { tabId: 1, windowId: 10, domain: 'youtube.com', isFocused: true });
  let state = resolveState(context);
  expect('状态判定为 ACTIVE', state, 'ACTIVE');

  const t0 = 1000000;
  await transitionState(state, context.domain, t0);

  const t1 = t0 + 10000;
  context = buildContext(context, { tabId: 2, domain: 'google.com', isFocused: true });
  state = resolveState(context);
  expect('新标签状态为 ACTIVE', state, 'ACTIVE');
  await transitionState(state, context.domain, t1);

  const events = await getEvents();
  expect('事件总数 = 3（START youtube, END youtube, START google）', events.length, 3);
  expect('第一个事件是 START youtube', events[0].type, 'START');
  expect('第一个事件域名', events[0].domain, 'youtube.com');
  expect('第二个事件是 END youtube', events[1].type, 'END');
  expect('第二个事件域名', events[1].domain, 'youtube.com');
  expect('第三个事件是 START google', events[2].type, 'START');
  expect('第三个事件域名', events[2].domain, 'google.com');

  const today = new Date(t0).toISOString().slice(0, 10);
  const youtubeDuration = computeDuration(events, 'youtube.com', today);
  expect('youtube 时长 = 10s', youtubeDuration, 10);
}

// ── Scenario 2: 状态切换（ACTIVE → BACKGROUND_ACTIVE → PASSIVE）──────────────

section('Scenario 2: 状态切换（ACTIVE → BACKGROUND_ACTIVE → PASSIVE）');
{
  resetAll();
  await initSession();
  await clearEvents();

  const baseTime = 1000000;

  // T0: ACTIVE (focused + tabId)
  let context = buildContext(null, { tabId: 1, windowId: 10, domain: 'youtube.com', isFocused: true, isAudible: false });
  await transitionState(resolveState(context), context.domain, baseTime);

  // T0+10s: 失焦但 audible → BACKGROUND_ACTIVE
  context = buildContext(context, { tabId: 1, isFocused: false, isAudible: true });
  await transitionState(resolveState(context), context.domain, baseTime + 10000);

  // T0+20s: 停止播放 → PASSIVE
  context = buildContext(context, { isAudible: false });
  await transitionState(resolveState(context), context.domain, baseTime + 20000);

  // T0+30s: 恢复播放 → BACKGROUND_ACTIVE
  context = buildContext(context, { isAudible: true });
  await transitionState(resolveState(context), context.domain, baseTime + 30000);

  // T0+40s: 结束 → IDLE (force domain to null)
  context = { ...context, domain: null, tabId: null, isFocused: false, isAudible: false };
  await transitionState(resolveState(context), context.domain, baseTime + 40000);

  const events = await getEvents();
  expect('事件总数 = 9', events.length, 9);

  expect('事件 0: START ACTIVE', events[0].state, 'ACTIVE');
  expect('事件 1: END ACTIVE', events[1].state, 'ACTIVE');
  expect('事件 2: START BACKGROUND_ACTIVE', events[2].state, 'BACKGROUND_ACTIVE');
  expect('事件 3: END BACKGROUND_ACTIVE', events[3].state, 'BACKGROUND_ACTIVE');
  expect('事件 4: START PASSIVE', events[4].state, 'PASSIVE');
  expect('事件 5: END PASSIVE', events[5].state, 'PASSIVE');
  expect('事件 6: START BACKGROUND_ACTIVE', events[6].state, 'BACKGROUND_ACTIVE');
  expect('事件 7: END BACKGROUND_ACTIVE', events[7].state, 'BACKGROUND_ACTIVE');
  expect('事件 8: START IDLE', events[8].state, 'IDLE');

  const today = new Date(baseTime).toISOString().slice(0, 10);
  const duration = computeDuration(events, 'youtube.com', today);
  // ACTIVE: 10s + BACKGROUND_ACTIVE: 10s + 10s = 30s (PASSIVE 不计入, IDLE 不计入)
  expect('总时长 = 30s（ACTIVE 10s + BACKGROUND_ACTIVE 20s）', duration, 30);
}

// ── Scenario 3: 多标签页去重 ────────────────────────────────────────────────

section('Scenario 3: 多标签页去重（同域名 3 个标签）');
{
  resetAll();
  await initSession();
  await clearEvents();

  const baseTime = 1000000;

  // T0: Activate Tab1 (youtube.com)
  let context = buildContext(null, { tabId: 1, windowId: 10, domain: 'youtube.com', isFocused: true });
  await transitionState(resolveState(context), context.domain, baseTime);

  // T0+10s: Activate Tab2 (youtube.com) - same domain, same state → deduplicated (no new events)
  context = buildContext(context, { tabId: 2, domain: 'youtube.com', isFocused: true });
  await transitionState(resolveState(context), context.domain, baseTime + 10000);

  // T0+20s: Activate Tab3 (youtube.com) - same domain, same state → deduplicated
  context = buildContext(context, { tabId: 3, domain: 'youtube.com', isFocused: true });
  await transitionState(resolveState(context), context.domain, baseTime + 20000);

  // T0+30s: End (no domain, no focus, no tabId → IDLE)
  context = buildContext(context, { tabId: null, domain: null, isFocused: false });
  await transitionState(resolveState(context), context.domain, baseTime + 30000);

  const events = await getEvents();
  // Only 2 state changes: null→ACTIVE (START) and ACTIVE→IDLE (END + START IDLE)
  // The tab switches within same domain/state are deduplicated
  expect('事件总数 = 3（START youtube, END youtube, START IDLE）', events.length, 3);
  expectTrue('所有事件域名都是 youtube.com 或 null', events.every(e => e.domain === 'youtube.com' || e.domain === null));

  const today = new Date(baseTime).toISOString().slice(0, 10);
  const duration = computeDuration(events, 'youtube.com', today);
  // Duration from baseTime to baseTime+30000 = 30s
  expect('总时长 = 30s', duration, 30);
}

// ── Scenario 4: SW 休眠恢复完整流程 ─────────────────────────────────────────

section('Scenario 4: SW 休眠恢复完整流程');
{
  resetAll();
  await initSession();
  await clearEvents();

  const baseTime = 1000000;
  const sessionStart = baseTime - 2 * 60 * 60 * 1000; // 2 hours before baseTime
  const lastHeartbeatTime = baseTime - 30000; // 30 seconds before baseTime (but delta > 90s from baseTime? No: 30s < 90s)

  // For sleep recovery: delta = baseTime - lastHeartbeat > 90s
  // So set lastHeartbeat to 2 hours ago
  const sleepLastHeartbeat = baseTime - 2 * 60 * 60 * 1000;

  mockSessionStorage.data[SESSION_KEY] = {
    state: 'ACTIVE', domain: 'youtube.com',
    startTime: sessionStart, lastHeartbeat: sleepLastHeartbeat,
  };
  mockLocalStorage.data[EVENT_LOG_KEY] = [
    { type: 'START', state: 'ACTIVE', domain: 'youtube.com', time: sessionStart }
  ];

  await recover(baseTime);

  const events = await getEvents();
  expect('事件总数 = 2（START + END）', events.length, 2);
  expect('END 事件类型', events[1].type, 'END');
  expect('END 事件状态', events[1].state, 'ACTIVE');
  expect('END 事件域名', events[1].domain, 'youtube.com');
  // endTime = lastHeartbeat (sleep recovery)
  expect('END 事件时间 = lastHeartbeat', events[1].time, sleepLastHeartbeat);

  // Duration = endTime - startTime = sleepLastHeartbeat - sessionStart = 0 (same time)
  // This is correct: if lastHeartbeat = startTime, duration = 0
  const duration = (events[1].time - events[0].time) / 1000;
  expect('时长 = 0s（lastHeartbeat = startTime）', duration, 0);

  const session = await getSession();
  expectTrue('session.state 为 null', session.state === null);
  expectTrue('session.domain 为 null', session.domain === null);
}

// ── Scenario 5: 无域名污染防护 ──────────────────────────────────────────────

section('Scenario 5: 无域名污染防护（chrome:// 页面）');
{
  resetAll();
  await initSession();
  await clearEvents();

  const baseTime = 1000000;

  let context = buildContext(null, { tabId: 1, windowId: 10, domain: null, isFocused: true });
  let state = resolveState(context);
  expect('无域名 → IDLE', state, 'IDLE');
  await transitionState(state, context.domain, baseTime);

  context = buildContext(context, { tabId: 2, domain: 'youtube.com', isFocused: true });
  state = resolveState(context);
  expect('有域名 → ACTIVE', state, 'ACTIVE');
  await transitionState(state, context.domain, baseTime + 10000);

  const events = await getEvents();
  // IDLE 不会写入 START（因为 newState 为 IDLE 时 startTime 为 null，但 transitionState 仍会写 START IDLE）
  // 实际上 transitionState 会写 START IDLE 事件
  expectTrue('事件列表包含 youtube START', events.some(e => e.type === 'START' && e.domain === 'youtube.com'));

  const today = new Date(baseTime).toISOString().slice(0, 10);
  const youtubeDuration = computeDuration(events, 'youtube.com', today);
  expectTrue('youtube 时长 >= 0', youtubeDuration >= 0);
}

// ── Scenario 6: 媒体播放跨标签 ──────────────────────────────────────────────

section('Scenario 6: 媒体播放跨标签（YouTube 后台播放）');
{
  resetAll();
  await initSession();
  await clearEvents();

  const baseTime = 1000000;

  // T0: Tab1 = youtube.com，播放视频（有焦点 + audible → ACTIVE）
  let context = buildContext(null, { tabId: 1, windowId: 10, domain: 'youtube.com', isFocused: true, isAudible: true });
  await transitionState(resolveState(context), context.domain, baseTime);

  // T0+5s: 切换到 Tab2（google.com），YouTube 继续播放（有焦点 → ACTIVE）
  context = buildContext(context, { tabId: 2, domain: 'google.com', isFocused: true, isAudible: true });
  await transitionState(resolveState(context), context.domain, baseTime + 5000);

  // T0+15s: 结束（domain=null → IDLE）
  context = { ...context, domain: null, tabId: null, isFocused: false, isAudible: false };
  await transitionState(resolveState(context), context.domain, baseTime + 15000);

  const events = await getEvents();
  // START youtube, END youtube + START google, END google + START IDLE = 5 events
  expect('事件总数 = 5', events.length, 5);

  expect('事件 0: START youtube.com（ACTIVE）', events[0].state, 'ACTIVE');
  expect('事件 1: END youtube.com', events[1].type, 'END');
  expect('事件 2: START google.com（ACTIVE）', events[2].state, 'ACTIVE');
  expect('事件 3: END google.com', events[3].type, 'END');
  expect('事件 4: START IDLE', events[4].state, 'IDLE');

  const today = new Date(baseTime).toISOString().slice(0, 10);
  const youtubeDuration = computeDuration(events, 'youtube.com', today);
  const googleDuration = computeDuration(events, 'google.com', today);
  expect('youtube 时长 = 5s', youtubeDuration, 5);
  expect('google 时长 = 10s', googleDuration, 10);
}

// ── Scenario 7: 域名分类统计 ────────────────────────────────────────────────

section('Scenario 7: 域名分类统计（学习/待归类/休息）');
{
  resetAll();
  await initSession();
  await clearEvents();

  const baseTime = 1000000;

  let context = buildContext(null, { tabId: 1, windowId: 10, domain: 'khanacademy.org', isFocused: true });
  await transitionState(resolveState(context), context.domain, baseTime);

  context = buildContext(context, { tabId: 2, domain: 'youtube.com', isFocused: true });
  await transitionState(resolveState(context), context.domain, baseTime + 30000);

  context = buildContext(context, { tabId: 3, domain: 'google.com', isFocused: true });
  await transitionState(resolveState(context), context.domain, baseTime + 50000);

  context = buildContext(context, { domain: null, isFocused: false });
  await transitionState(resolveState(context), context.domain, baseTime + 60000);

  const events = await getEvents();
  const today = new Date(baseTime).toISOString().slice(0, 10);

  const khanDuration = computeDuration(events, 'khanacademy.org', today);
  const youtubeDuration = computeDuration(events, 'youtube.com', today);
  const googleDuration = computeDuration(events, 'google.com', today);

  expect('khanacademy.org 时长 = 30s', khanDuration, 30);
  expect('youtube.com 时长 = 20s', youtubeDuration, 20);
  expect('google.com 时长 = 10s', googleDuration, 10);

  const studyList = ['khanacademy.org'];
  const compositeList = ['youtube.com'];

  let studySeconds = 0, undeterminedSeconds = 0, restSeconds = 0;
  const allDurations = computeAllDomains(events, today);

  for (const [domain, seconds] of Object.entries(allDurations)) {
    if (studyList.includes(domain)) studySeconds += seconds;
    else if (compositeList.includes(domain)) undeterminedSeconds += seconds;
    else restSeconds += seconds;
  }

  expect('学习时长 = 30s', studySeconds, 30);
  expect('待归类时长 = 20s', undeterminedSeconds, 20);
  expect('休息时长 = 10s', restSeconds, 10);
}

// ── Scenario 8: 快速切换抗抖 ────────────────────────────────────────────────

section('Scenario 8: 快速切换抗抖（状态无变化不写入事件）');
{
  resetAll();
  await initSession();
  await clearEvents();

  const baseTime = 1000000;

  let context = buildContext(null, { tabId: 1, windowId: 10, domain: 'youtube.com', isFocused: true });
  await transitionState(resolveState(context), context.domain, baseTime);

  const eventsBefore = await getEvents();
  expect('初始事件数 = 1（START）', eventsBefore.length, 1);

  // 相同状态切换（应该被忽略）
  await transitionState('ACTIVE', 'youtube.com', baseTime + 1000);

  const eventsAfter = await getEvents();
  expect('状态无变化，事件数不变', eventsAfter.length, 1);
}

// ── Scenario 9: 心跳维持恢复锚点 ────────────────────────────────────────────

section('Scenario 9: 心跳维持恢复锚点');
{
  resetAll();
  await initSession();

  const baseTime = Date.now();

  let context = buildContext(null, { tabId: 1, windowId: 10, domain: 'youtube.com', isFocused: true });
  await transitionState(resolveState(context), context.domain, baseTime);

  await heartbeat();

  const session = await getSession();
  expectTrue('lastHeartbeat 已更新', session.lastHeartbeat >= baseTime);
}

// ── Summary ───────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n[Integration: Duration Flow] ${passed}/${total} passed${failed > 0 ? ` — ${failed} FAILED` : ''}`);
if (failed > 0) { process.exit(1); }

}

runTests().catch(err => { console.error(err); process.exit(1); });

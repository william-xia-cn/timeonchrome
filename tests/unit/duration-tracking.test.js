// Unit tests for new duration-tracking modules (core/state, core/context, core/aggregate)
// Run with: node tests/unit/duration-tracking.test.js

'use strict';

// ── Inline pure functions from new architecture ──────────────────────────────

const AttentionState = {
  ACTIVE: 'ACTIVE',
  PASSIVE: 'PASSIVE',
  IDLE: 'IDLE',
  BACKGROUND_ACTIVE: 'BACKGROUND_ACTIVE',
  PIP_ACTIVE: 'PIP_ACTIVE',
};

function resolveState(context) {
  if (!context?.domain && !context?.mediaSourceDomain) return AttentionState.IDLE;
  if (context.isIdle) return AttentionState.IDLE;
  if (context.isPiP) return AttentionState.PIP_ACTIVE;
  if (context.domain && context.isFocused && context.tabId) return AttentionState.ACTIVE;
  if (context.isAudible) return AttentionState.BACKGROUND_ACTIVE;
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

const STATE_WEIGHTS = {
  ACTIVE: 1,
  BACKGROUND_ACTIVE: 1,
  PIP_ACTIVE: 0,
  PASSIVE: 0,
  IDLE: 0,
};

function formatTime(time) {
  return new Date(time).toISOString();
}

function computeDuration(events, domain, date) {
  const dayEvents = events.filter(e =>
    e.domain === domain &&
    formatTime(e.time).slice(0, 10) === date
  );

  let total = 0;
  for (let i = 0; i < dayEvents.length - 1; i++) {
    if (dayEvents[i].type === 'START') {
      const weight = STATE_WEIGHTS[dayEvents[i].state] || 0;
      const duration = (dayEvents[i + 1].time - dayEvents[i].time) / 1000;
      total += duration * weight;
    }
  }
  return Math.floor(total);
}

function computeAllDomains(events, date) {
  const result = {};
  const dayEvents = events.filter(e =>
    e.domain && formatTime(e.time).slice(0, 10) === date
  );

  for (let i = 0; i < dayEvents.length - 1; i++) {
    const evt = dayEvents[i];
    if (evt.type === 'START' && evt.domain) {
      const weight = STATE_WEIGHTS[evt.state] || 0;
      const duration = (dayEvents[i + 1].time - dayEvents[i].time) / 1000;
      const seconds = Math.floor(duration * weight);
      if (seconds > 0) {
        result[evt.domain] = (result[evt.domain] || 0) + seconds;
      }
    }
  }
  return result;
}

// ── micro-batching merge simulation ─────────────────────────────────────────

function mergeEvent(pending, incoming) {
  return {
    tabId: incoming.tabId ?? pending.tabId,
    windowId: incoming.windowId ?? pending.windowId,
    domain: incoming.domain ?? pending.domain,
    isFocused: incoming.isFocused ?? pending.isFocused,
    isIdle: incoming.isIdle ?? pending.isIdle,
    isAudible: incoming.isAudible ?? pending.isAudible,
    isPiP: incoming.isPiP ?? pending.isPiP,
    timestamp: Date.now(),
  };
}

// ── Test runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function expect(description, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push({ description, expected, actual });
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
    failures.push({ description, expected: true, actual: value });
    console.error(`  ✗ ${description} (got ${JSON.stringify(value)})`);
  }
}

function expectFalse(description, value) {
  if (value === false) {
    passed++;
  } else {
    failed++;
    failures.push({ description, expected: false, actual: value });
    console.error(`  ✗ ${description} (got ${JSON.stringify(value)})`);
  }
}

function section(name) {
  console.log(`\n[${name}]`);
}

// ── resolveState ─────────────────────────────────────────────────────────────

section('resolveState: IDLE conditions');

expectTrue('无域名 → IDLE',
  resolveState({ domain: null, isFocused: true, isIdle: false, tabId: 1 }) === AttentionState.IDLE);

expectTrue('undefined 域名 → IDLE',
  resolveState({ domain: undefined, isFocused: true, isIdle: false, tabId: 1 }) === AttentionState.IDLE);

expectTrue('空字符串域名 → IDLE',
  resolveState({ domain: '', isFocused: true, isIdle: false, tabId: 1 }) === AttentionState.IDLE);

expectTrue('系统空闲 → IDLE',
  resolveState({ domain: 'youtube.com', isFocused: true, isIdle: true, tabId: 1 }) === AttentionState.IDLE);

expectTrue('null context → IDLE',
  resolveState(null) === AttentionState.IDLE);

expectTrue('undefined context → IDLE',
  resolveState(undefined) === AttentionState.IDLE);

section('resolveState: ACTIVE conditions');

expectTrue('窗口有焦点 + 有活跃 tab → ACTIVE',
  resolveState({ domain: 'youtube.com', tabId: 1, isFocused: true, isIdle: false, isAudible: false, isPiP: false }) === AttentionState.ACTIVE);

expectTrue('窗口有焦点 + tabId 存在 → ACTIVE（即使 audible）',
  resolveState({ domain: 'youtube.com', tabId: 1, isFocused: true, isIdle: false, isAudible: true, isPiP: false }) === AttentionState.ACTIVE);

section('resolveState: BACKGROUND_ACTIVE conditions');

expectTrue('媒体播放（audible）+ 无焦点 → BACKGROUND_ACTIVE',
  resolveState({ domain: 'youtube.com', tabId: 1, isFocused: false, isIdle: false, isAudible: true, isPiP: false }) === AttentionState.BACKGROUND_ACTIVE);

expectTrue('画中画（PiP）→ PIP_ACTIVE',
  resolveState({ domain: 'youtube.com', tabId: 1, isFocused: false, isIdle: false, isAudible: false, isPiP: true }) === AttentionState.PIP_ACTIVE);

expectTrue('audible + PiP → PIP_ACTIVE',
  resolveState({ domain: 'youtube.com', tabId: 1, isFocused: false, isIdle: false, isAudible: true, isPiP: true }) === AttentionState.PIP_ACTIVE);

section('resolveState: PASSIVE conditions');

expectTrue('有域名但无焦点、无媒体、无 PiP → PASSIVE',
  resolveState({ domain: 'youtube.com', tabId: 1, isFocused: false, isIdle: false, isAudible: false, isPiP: false }) === AttentionState.PASSIVE);

expectTrue('有域名但无 tabId、无焦点 → PASSIVE',
  resolveState({ domain: 'google.com', tabId: null, isFocused: false, isIdle: false, isAudible: false, isPiP: false }) === AttentionState.PASSIVE);

section('resolveState: 边界情况');

expectTrue('chrome:// 页面无域名 → IDLE',
  resolveState({ domain: null, tabId: 1, isFocused: true, isIdle: false }) === AttentionState.IDLE);

expectTrue('edge:// 页面无域名 → IDLE',
  resolveState({ domain: null, tabId: 1, isFocused: true, isIdle: false }) === AttentionState.IDLE);

// ── buildContext ─────────────────────────────────────────────────────────────

section('buildContext: 初始状态');

{
  const ctx = buildContext(null, { tabId: 1, windowId: 10, domain: 'youtube.com' });
  expect('tabId 设置', ctx.tabId, 1);
  expect('windowId 设置', ctx.windowId, 10);
  expect('domain 设置', ctx.domain, 'youtube.com');
  expectTrue('isFocused 默认 false', ctx.isFocused === false);
  expectTrue('isIdle 默认 false', ctx.isIdle === false);
  expectTrue('isAudible 默认 false', ctx.isAudible === false);
  expectTrue('isPiP 默认 false', ctx.isPiP === false);
  expectTrue('lastActiveTabId 设置', ctx.lastActiveTabId === 1);
  expectTrue('lastFocusedWindowId 设置', ctx.lastFocusedWindowId === 10);
}

section('buildContext: 字段合并');

{
  const current = {
    tabId: 1, windowId: 10, domain: 'youtube.com',
    isFocused: true, isIdle: false, isAudible: false, isPiP: false,
    lastActiveTabId: 1, lastFocusedWindowId: 10,
  };
  const rawEvent = { tabId: 2, domain: 'google.com' };
  const ctx = buildContext(current, rawEvent);

  expect('tabId 被覆盖', ctx.tabId, 2);
  expect('windowId 保留', ctx.windowId, 10);
  expect('domain 被覆盖', ctx.domain, 'google.com');
  expectTrue('isFocused 保留', ctx.isFocused === true);
  expectTrue('lastActiveTabId 更新', ctx.lastActiveTabId === 2);
}

section('buildContext: null/undefined 不覆盖');

{
  const current = {
    tabId: 1, windowId: 10, domain: 'youtube.com',
    isFocused: true, isIdle: false, isAudible: true, isPiP: false,
    lastActiveTabId: 1, lastFocusedWindowId: 10,
  };
  const rawEvent = { isFocused: false };
  const ctx = buildContext(current, rawEvent);

  expect('tabId 保留（rawEvent 无 tabId）', ctx.tabId, 1);
  expect('domain 保留', ctx.domain, 'youtube.com');
  expect('isFocused 被覆盖为 false', ctx.isFocused, false);
  expectTrue('isAudible 保留', ctx.isAudible === true);
}

section('buildContext: 防丢失机制');

{
  // 模拟 window blur/focus 循环
  let ctx = buildContext(null, { tabId: 1, windowId: 10, domain: 'youtube.com', isFocused: true });
  expect('初始 lastActiveTabId', ctx.lastActiveTabId, 1);
  expect('初始 lastFocusedWindowId', ctx.lastFocusedWindowId, 10);

  // 窗口失焦
  ctx = buildContext(ctx, { isFocused: false });
  expectTrue('失焦后 lastActiveTabId 保留', ctx.lastActiveTabId === 1);
  expectTrue('失焦后 lastFocusedWindowId 保留', ctx.lastFocusedWindowId === 10);

  // 重新聚焦到新窗口
  ctx = buildContext(ctx, { windowId: 20, isFocused: true });
  expect('新窗口 lastFocusedWindowId 更新', ctx.lastFocusedWindowId, 20);
  expectTrue('lastActiveTabId 仍保留', ctx.lastActiveTabId === 1);
}

// ── computeDuration ──────────────────────────────────────────────────────────

section('computeDuration: 基本计时');

{
  const baseTime = new Date('2026-04-21T10:00:00Z').getTime();
  const events = [
    { type: 'START', state: 'ACTIVE', domain: 'youtube.com', time: baseTime },
    { type: 'END', state: 'ACTIVE', domain: 'youtube.com', time: baseTime + 60000 },
  ];
  expect('60 秒 ACTIVE 时长', computeDuration(events, 'youtube.com', '2026-04-21'), 60);
}

section('computeDuration: 状态权重');

{
  const baseTime = new Date('2026-04-21T10:00:00Z').getTime();
  const events = [
    { type: 'START', state: 'ACTIVE', domain: 'youtube.com', time: baseTime },
    { type: 'END', state: 'ACTIVE', domain: 'youtube.com', time: baseTime + 10000 },
    { type: 'START', state: 'PASSIVE', domain: 'youtube.com', time: baseTime + 10000 },
    { type: 'END', state: 'PASSIVE', domain: 'youtube.com', time: baseTime + 20000 },
    { type: 'START', state: 'BACKGROUND_ACTIVE', domain: 'youtube.com', time: baseTime + 20000 },
    { type: 'END', state: 'BACKGROUND_ACTIVE', domain: 'youtube.com', time: baseTime + 30000 },
    { type: 'START', state: 'IDLE', domain: 'youtube.com', time: baseTime + 30000 },
    { type: 'END', state: 'IDLE', domain: 'youtube.com', time: baseTime + 40000 },
  ];
  // ACTIVE: 10s * 1 = 10s
  // PASSIVE: 10s * 0 = 0s
  // BACKGROUND_ACTIVE: 10s * 1 = 10s
  // IDLE: 10s * 0 = 0s
  // 总计入 = 20s
  expect('ACTIVE + BACKGROUND_ACTIVE 计入，PASSIVE + IDLE 不计入',
    computeDuration(events, 'youtube.com', '2026-04-21'), 20);
}

section('computeDuration: 多域名');

{
  const baseTime = new Date('2026-04-21T10:00:00Z').getTime();
  const events = [
    { type: 'START', state: 'ACTIVE', domain: 'youtube.com', time: baseTime },
    { type: 'END', state: 'ACTIVE', domain: 'youtube.com', time: baseTime + 30000 },
    { type: 'START', state: 'ACTIVE', domain: 'google.com', time: baseTime + 30000 },
    { type: 'END', state: 'ACTIVE', domain: 'google.com', time: baseTime + 50000 },
  ];
  expect('youtube.com 30s', computeDuration(events, 'youtube.com', '2026-04-21'), 30);
  expect('google.com 20s', computeDuration(events, 'google.com', '2026-04-21'), 20);
}

section('computeDuration: 日期过滤');

{
  const baseTime = new Date('2026-04-21T10:00:00Z').getTime();
  const nextDay = new Date('2026-04-22T10:00:00Z').getTime();
  const events = [
    { type: 'START', state: 'ACTIVE', domain: 'youtube.com', time: baseTime },
    { type: 'END', state: 'ACTIVE', domain: 'youtube.com', time: baseTime + 60000 },
    { type: 'START', state: 'ACTIVE', domain: 'youtube.com', time: nextDay },
    { type: 'END', state: 'ACTIVE', domain: 'youtube.com', time: nextDay + 120000 },
  ];
  expect('2026-04-21 只有 60s', computeDuration(events, 'youtube.com', '2026-04-21'), 60);
  expect('2026-04-22 有 120s', computeDuration(events, 'youtube.com', '2026-04-22'), 120);
}

section('computeDuration: 空事件列表');

{
  expect('空列表返回 0', computeDuration([], 'youtube.com', '2026-04-21'), 0);
  expect('无匹配域名返回 0', computeDuration([
    { type: 'START', state: 'ACTIVE', domain: 'google.com', time: Date.now() },
    { type: 'END', state: 'ACTIVE', domain: 'google.com', time: Date.now() + 10000 },
  ], 'youtube.com', '2026-04-21'), 0);
}

section('computeDuration: 不完整事件对');

{
  const baseTime = new Date('2026-04-21T10:00:00Z').getTime();
  const events = [
    { type: 'START', state: 'ACTIVE', domain: 'youtube.com', time: baseTime },
    // 没有 END 事件
  ];
  expect('只有 START 无 END，不计入', computeDuration(events, 'youtube.com', '2026-04-21'), 0);
}

section('computeDuration: END 事件不计入');

{
  const baseTime = new Date('2026-04-21T10:00:00Z').getTime();
  const events = [
    { type: 'END', state: 'ACTIVE', domain: 'youtube.com', time: baseTime },
    { type: 'START', state: 'ACTIVE', domain: 'youtube.com', time: baseTime + 10000 },
    { type: 'END', state: 'ACTIVE', domain: 'youtube.com', time: baseTime + 20000 },
  ];
  // 第一个 END 不是 START，不计入
  // START → END: 10s
  expect('END 事件不作为起始点', computeDuration(events, 'youtube.com', '2026-04-21'), 10);
}

// ── computeAllDomains ────────────────────────────────────────────────────────

section('computeAllDomains: 多域名聚合');

{
  const baseTime = new Date('2026-04-21T10:00:00Z').getTime();
  const events = [
    { type: 'START', state: 'ACTIVE', domain: 'youtube.com', time: baseTime },
    { type: 'END', state: 'ACTIVE', domain: 'youtube.com', time: baseTime + 30000 },
    { type: 'START', state: 'ACTIVE', domain: 'google.com', time: baseTime + 30000 },
    { type: 'END', state: 'ACTIVE', domain: 'google.com', time: baseTime + 50000 },
    { type: 'START', state: 'ACTIVE', domain: 'bilibili.com', time: baseTime + 50000 },
    { type: 'END', state: 'ACTIVE', domain: 'bilibili.com', time: baseTime + 70000 },
  ];
  const result = computeAllDomains(events, '2026-04-21');
  expect('youtube.com 30s', result['youtube.com'], 30);
  expect('google.com 20s', result['google.com'], 20);
  expect('bilibili.com 20s', result['bilibili.com'], 20);
  expect('总共 3 个域名', Object.keys(result).length, 3);
}

section('computeAllDomains: 权重应用');

{
  const baseTime = new Date('2026-04-21T10:00:00Z').getTime();
  const events = [
    { type: 'START', state: 'ACTIVE', domain: 'youtube.com', time: baseTime },
    { type: 'END', state: 'ACTIVE', domain: 'youtube.com', time: baseTime + 10000 },
    { type: 'START', state: 'PASSIVE', domain: 'youtube.com', time: baseTime + 10000 },
    { type: 'END', state: 'PASSIVE', domain: 'youtube.com', time: baseTime + 20000 },
  ];
  const result = computeAllDomains(events, '2026-04-21');
  expect('PASSIVE 不计入，只有 ACTIVE 10s', result['youtube.com'], 10);
}

section('computeAllDomains: 空事件');

{
  const result = computeAllDomains([], '2026-04-21');
  expect('空列表返回空对象', result, {});
}

// ── mergeEvent (micro-batching) ──────────────────────────────────────────────

section('mergeEvent: 字段优先级');

{
  const pending = { tabId: 1, domain: 'youtube.com', isFocused: true, isAudible: false };
  const incoming = { tabId: 2, domain: null, isFocused: false };
  const merged = mergeEvent(pending, incoming);

  expect('tabId 被覆盖', merged.tabId, 2);
  expect('domain 保留（incoming 为 null）', merged.domain, 'youtube.com');
  expect('isFocused 被覆盖', merged.isFocused, false);
  expectTrue('isAudible 保留', merged.isAudible === false);
}

section('mergeEvent: undefined 不覆盖');

{
  const pending = { tabId: 1, domain: 'youtube.com', isFocused: true };
  const incoming = { isFocused: false };
  const merged = mergeEvent(pending, incoming);

  expect('tabId 保留', merged.tabId, 1);
  expect('domain 保留', merged.domain, 'youtube.com');
  expect('isFocused 被覆盖', merged.isFocused, false);
}

section('mergeEvent: 空 incoming');

{
  const pending = { tabId: 1, domain: 'youtube.com', isFocused: true, isAudible: true };
  const incoming = {};
  const merged = mergeEvent(pending, incoming);

  expect('所有字段保留', merged.tabId, 1);
  expect('domain 保留', merged.domain, 'youtube.com');
  expectTrue('isFocused 保留', merged.isFocused === true);
  expectTrue('isAudible 保留', merged.isAudible === true);
}

// ── Summary ───────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n[Duration Tracking] ${passed}/${total} passed${failed > 0 ? ` — ${failed} FAILED` : ''}`);

if (failed > 0) {
  process.exit(1);
}

// background-new.js — 新入口（只做 wiring）

import { initSignal } from './core/signal.js';
import { buildContext } from './core/context.js';
import { resolveState } from './core/state.js';
import { initSession, transitionState, heartbeat } from './runtime/session.js';
import { recover } from './runtime/recovery.js';

let currentContext = null;

// ── SW 启动 → 先恢复 ─────────────────────────────────────────────

chrome.runtime.onStartup.addListener(async () => {
  await initSession();
  await recover();
  setupAlarms();
});

// ── 安装/更新 ─────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  await initSession();
  await recover();
  setupAlarms();

  if (details.reason === 'install') {
    // 首次安装：打开引导页
    chrome.tabs.create({ url: chrome.runtime.getURL('bind.html?welcome=1') });
  }
});

// ── 信号接入 → 上下文 → 状态 → 事件日志 ──────────────────────────

initSignal(async (rawEvent) => {
  currentContext = buildContext(currentContext, rawEvent);
  const state = resolveState(currentContext);
  const domain = currentContext?.domain || null;
  await transitionState(state, domain);
});

// ── Alarms ────────────────────────────────────────────────────────

function setupAlarms() {
  chrome.alarms.create('heartbeat', { periodInMinutes: 0.5 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'heartbeat') {
    await heartbeat();
  }
});

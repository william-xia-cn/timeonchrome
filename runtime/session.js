// runtime/session.js — 当前会话快照（单一真相源）+ 状态切换 + 心跳

import { appendEvent, EVENT_TYPE } from '../core/event-log.js';

const SESSION_KEY = 'session_v1';
let commitQueue = Promise.resolve();

function runSerialized(task) {
  commitQueue = commitQueue.then(task, task);
  return commitQueue;
}

/**
 * @typedef {Object} SessionState
 * @property {string|null} state
 * @property {string|null} domain
 * @property {number|null} startTime
 * @property {number} lastHeartbeat
 */

/**
 * 获取当前会话快照
 * @returns {Promise<SessionState|null>}
 */
export async function getSession() {
  const data = await chrome.storage.session.get(SESSION_KEY);
  return data[SESSION_KEY] || null;
}

/**
 * 保存当前会话快照
 * @param {SessionState} session
 */
export async function saveSession(session) {
  await chrome.storage.session.set({ [SESSION_KEY]: session });
}

/**
 * 初始化 session（首次）
 * @returns {Promise<SessionState>}
 */
export async function initSession() {
  const existing = await getSession();
  if (existing) return existing;

  const initial = {
    state: null,
    domain: null,
    startTime: null,
    lastHeartbeat: Date.now(),
  };
  await saveSession(initial);
  return initial;
}

/**
 * 状态切换（统一入口，所有 state 变化必须走这里）
 * @param {string|null} newState
 * @param {string|null} newDomain
 */
export async function transitionState(newState, newDomain) {
  return runSerialized(async () => {
    const session = await getSession();
    if (!session) return;

    const now = Date.now();

    // 没变化直接忽略（抗抖）
    if (session.state === newState && session.domain === newDomain) {
      return;
    }

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
  });
}

/**
 * 心跳：维持恢复锚点
 */
export async function heartbeat() {
  return runSerialized(async () => {
    const session = await getSession();
    if (!session) return;

    session.lastHeartbeat = Date.now();
    await saveSession(session);
  });
}

export async function runSessionCommit(task) {
  return runSerialized(task);
}

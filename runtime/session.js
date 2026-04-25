// runtime/session.js — 当前会话快照（单一真相源）+ 状态切换 + 心跳

import { appendEvent, EVENT_TYPE } from '../core/event-log.js';
import { emitTrace } from '../core/timing-trace.js';

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

    const sessionBefore = { state: session.state, domain: session.domain, startTime: session.startTime };

    // 1. 关闭旧事件
    if (session.state && session.startTime) {
      const endEvent = {
        type: EVENT_TYPE.END,
        state: session.state,
        domain: session.domain,
        time: now,
      };
      await appendEvent(endEvent);
      await emitTrace('event_appended', {
        source: 'event-log',
        reason: 'transitionClose',
        domain: session.domain,
        previousState: session.state,
        event: endEvent,
        sessionBefore,
      });
    }

    // 2. 开启新事件
    if (newState) {
      const startEvent = {
        type: EVENT_TYPE.START,
        state: newState,
        domain: newDomain,
        time: now,
      };
      await appendEvent(startEvent);
      await emitTrace('event_appended', {
        source: 'event-log',
        reason: 'transitionOpen',
        domain: newDomain,
        nextState: newState,
        event: startEvent,
        sessionBefore,
      });
    }

    // 3. 更新 session
    const sessionAfter = {
      state: newState,
      domain: newDomain,
      startTime: newState ? now : null,
      lastHeartbeat: now,
    };
    await saveSession(sessionAfter);
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

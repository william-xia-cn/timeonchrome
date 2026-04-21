// core/event-log.js — append-only 事件日志（唯一写入点）

export const EVENT_TYPE = {
  START: 'START',
  END: 'END',
};

const STORAGE_KEY = 'event_log_v1';
const MAX_RAW_WINDOW = 10 * 60 * 1000; // 10 分钟

/**
 * 获取事件列表
 * @returns {Promise<Array<{type: string, state: string, domain: string|null, time: number}>>}
 */
export async function getEvents() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

/**
 * 追加事件（唯一写入口）
 * @param {{type: string, state: string, domain: string|null, time: number}} event
 */
export async function appendEvent(event) {
  const events = await getEvents();
  events.push(event);

  // 压缩：只保留最近 10 分钟的 raw events
  const now = Date.now();
  const filtered = events.filter(e => now - e.time < MAX_RAW_WINDOW);

  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}

/**
 * 清空事件日志（仅用于 debug）
 */
export async function clearEvents() {
  await chrome.storage.local.set({ [STORAGE_KEY]: [] });
}

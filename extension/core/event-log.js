// core/event-log.js — append-only 事件日志（唯一写入点）
import { sanitizeIncognitoForPersistence } from './incognito-persistence.js';
import { budgetedLocalSet } from '../infra/storage-budget.js';

const sanitizePersistence = typeof sanitizeIncognitoForPersistence === 'function'
  ? sanitizeIncognitoForPersistence
  : (value) => value;
const eventStorageSet = (items) => typeof budgetedLocalSet === 'function'
  ? budgetedLocalSet(items, { priority: 'derived', source: 'event_log' })
  : chrome.storage.local.set(items);

export const EVENT_TYPE = {
  START: 'START',
  END: 'END',
};

const STORAGE_KEY = 'event_log_v1';
const MAX_RAW_WINDOW = 24 * 60 * 60 * 1000; // 24 小时，保留全天数据
const LAST_COMPACT_KEY = 'event_log_last_compact';
const COMPACT_INTERVAL = 60 * 60 * 1000; // 每小时压缩一次

/**
 * 获取事件列表
 * @returns {Promise<Array<{type: string, state: string, domain: string|null, time: number}>>}
 */
export async function getEvents() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

/**
 * 获取最后一条事件（只读）
 * @returns {Promise<{type: string, state: string, domain: string|null, time: number}|null>}
 */
export async function getLastEvent() {
  const events = await getEvents();
  return events.length > 0 ? events[events.length - 1] : null;
}

/**
 * 追加事件（唯一写入口）
 * @param {{type: string, state: string, domain: string|null, time: number}} event
 */
export async function appendEvent(event) {
  const events = await getEvents();
  events.push(sanitizePersistence(event));

  // 定期压缩：每小时清理一次超过 24 小时的旧事件
  const now = Date.now();
  const storage = await chrome.storage.local.get(LAST_COMPACT_KEY);
  const lastCompact = storage[LAST_COMPACT_KEY] || 0;

  if (now - lastCompact > COMPACT_INTERVAL) {
    const filtered = events.filter(e => now - e.time < MAX_RAW_WINDOW);
    await eventStorageSet({ [STORAGE_KEY]: filtered, [LAST_COMPACT_KEY]: now });
  } else {
    // 常规写入，不压缩
    await eventStorageSet({ [STORAGE_KEY]: events });
  }
}

/**
 * 清空事件日志（仅用于 debug）
 */
export async function clearEvents() {
  await eventStorageSet({ [STORAGE_KEY]: [] });
}

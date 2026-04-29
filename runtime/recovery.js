// runtime/recovery.js — SW 重启恢复（启动第一优先级）

import { getSession, getSessionWithPersistenceSource, saveSession, runSessionCommit } from './session.js';
import { appendEvent, EVENT_TYPE, getLastEvent } from '../core/event-log.js';
import { getReliableCloseTime } from './time-boundary.js';

/**
 * 恢复未闭合事件
 * 在 SW 启动时调用，检查是否有未闭合的 START 事件
 * 如果有，用 lastHeartbeat 判断是否休眠，补齐 END 事件
 */
export async function recover() {
  const commit = typeof runSessionCommit === 'function'
    ? runSessionCommit
    : async (task) => task();

  return commit(async () => {
    const snapshot = typeof getSessionWithPersistenceSource === 'function'
      ? await getSessionWithPersistenceSource()
      : { session: await getSession(), source: 'session' };
    const { session, source } = snapshot;
    if (!session || !session.state || !session.startTime) return;

    const now = Date.now();
    const { closeTime: endTime } = getReliableCloseTime(session, now, {
      forceStale: source === 'persistent',
    });
    const lastEvent = typeof getLastEvent === 'function' ? await getLastEvent() : null;

    // 幂等恢复：若最后一条已是同一段会话的 END，则不重复追加
    const alreadyClosed = !!lastEvent &&
      lastEvent.type === EVENT_TYPE.END &&
      lastEvent.state === session.state &&
      lastEvent.domain === session.domain &&
      lastEvent.time === endTime;

    if (!alreadyClosed) {
      await appendEvent({
        type: EVENT_TYPE.END,
        state: session.state,
        domain: session.domain,
        time: endTime,
      });
    }

    // 重置 session（避免重复恢复）
    await saveSession({
      state: null,
      domain: null,
      startTime: null,
      lastHeartbeat: now,
    });
  });
}

// runtime/recovery.js — SW 重启恢复（启动第一优先级）

import { closeCurrentSession, getSession, getSessionWithPersistenceSource, runSessionCommit } from './session.js';

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

    await closeCurrentSession(source === 'persistent' ? 'recovery_persistent_close' : 'recovery_gap_close', {
      now: Date.now(),
      alreadySerialized: true,
    });
  });
}

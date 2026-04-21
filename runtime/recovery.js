// runtime/recovery.js — SW 重启恢复（启动第一优先级）

import { getSession, saveSession } from './session.js';
import { appendEvent, EVENT_TYPE } from '../core/event-log.js';

const SLEEP_THRESHOLD = 90 * 1000; // 90 秒，抗 MV3 调度抖动

/**
 * 恢复未闭合事件
 * 在 SW 启动时调用，检查是否有未闭合的 START 事件
 * 如果有，用 lastHeartbeat 判断是否休眠，补齐 END 事件
 */
export async function recover() {
  const session = await getSession();
  if (!session || !session.state || !session.startTime) return;

  const now = Date.now();
  const delta = now - session.lastHeartbeat;

  let endTime;

  // 判断是否发生 sleep / SW 死亡
  if (delta > SLEEP_THRESHOLD) {
    // 休眠：截断到最后一次心跳
    endTime = session.lastHeartbeat;
  } else {
    // 正常：计到当前时间
    endTime = now;
  }

  // 补 END 事件
  await appendEvent({
    type: EVENT_TYPE.END,
    state: session.state,
    domain: session.domain,
    time: endTime,
  });

  // 重置 session（避免重复恢复）
  await saveSession({
    state: null,
    domain: null,
    startTime: null,
    lastHeartbeat: now,
  });
}

// core/state.js — 状态机（纯函数）

export const AttentionState = {
  ACTIVE: 'ACTIVE',
  PASSIVE: 'PASSIVE',
  IDLE: 'IDLE',
  BACKGROUND_ACTIVE: 'BACKGROUND_ACTIVE',
  PIP_ACTIVE: 'PIP_ACTIVE',
};

const ACTIVITY_GRACE_MS = 180_000;
const PASSIVE_FOREGROUND_GRACE_MS = 600_000;

function hasOrdinaryForegroundEvidence(context, now) {
  if (!context?.domain || context.tabId == null || !context.isFocused || context.pageVisible !== true || context.isIdle) {
    return false;
  }
  const lastActivity = Number(context.lastPageActivityAt) || 0;
  if (lastActivity > 0 && now - lastActivity <= ACTIVITY_GRACE_MS) return true;
  const foregroundStart = Number(context.lastVisibleAt || context.startTime || context.foregroundStartedAt) || now;
  return now - foregroundStart <= PASSIVE_FOREGROUND_GRACE_MS;
}

/**
 * 确定性状态判定
 *
 * @param {Object} context - AttentionContext 对象
 * @returns {string} AttentionState 值
 *
 * 规则：
 * 1. 无域名 → IDLE（防止 chrome:// 页面污染）
 * 2. 空闲 → IDLE
 * 3. 窗口有焦点 + 有活跃 tab → ACTIVE
 * 4. 画中画 → PIP_ACTIVE（单独记录，不混入普通在线/后台媒体时长）
 * 5. 媒体播放（失焦但 audible）→ BACKGROUND_ACTIVE
 * 6. 其他 → PASSIVE（权重 = 0）
 */
export function resolveState(context) {
  const now = Number(context?.timestamp) || Date.now();
  if (!context?.domain && !context?.mediaSourceDomain) return AttentionState.IDLE;
  // 媒体播放优先：即使系统 idle，也不能丢失媒体播放计时。
  if (context.isPiP) return AttentionState.PIP_ACTIVE;
  if (hasOrdinaryForegroundEvidence(context, now)) return AttentionState.ACTIVE;
  if (context.isAudible && context.mediaSourceTabId != null) return AttentionState.BACKGROUND_ACTIVE;
  if (context.isIdle) return AttentionState.IDLE;
  return AttentionState.PASSIVE;
}

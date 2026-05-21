// core/state.js — 状态机（纯函数）

export const AttentionState = {
  ACTIVE: 'ACTIVE',
  PASSIVE: 'PASSIVE',
  IDLE: 'IDLE',
  BACKGROUND_ACTIVE: 'BACKGROUND_ACTIVE',
  PIP_ACTIVE: 'PIP_ACTIVE',
};

function isForegroundPageEligible(context) {
  if (!context || context.tabId == null || !context.domain) return false;
  if (context.idleState === 'locked') return false;
  if (context.isFocused === true && isSystemActive(context)) return true;
  return context.foregroundMediaActive === true;
}

function isSystemActive(context) {
  if (!context) return false;
  if (context.idleState === 'idle' || context.idleState === 'locked') return false;
  if (context.idleState === 'active') return true;
  return context.isIdle !== true;
}

/**
 * 确定性状态判定
 *
 * @param {Object} context - AttentionContext 对象
 * @returns {string} AttentionState 值
 *
 * 规则：
 * 1. 无前台域名或媒体域名 → IDLE
 * 2. 空闲 → IDLE
 * 3. 窗口有焦点 + 有活跃 tab → ACTIVE
 * 4. 媒体事实仍保留 legacy foreground compensation，后续需要正式移除
 * 5. 其他媒体 → BACKGROUND_ACTIVE / PIP_ACTIVE，由独立媒体账本接管
 */
export function resolveState(context) {
  if (!context?.domain && !context?.mediaSourceDomain) return AttentionState.IDLE;
  if (context.isPiP) return AttentionState.PIP_ACTIVE;
  if (isForegroundPageEligible(context)) return AttentionState.ACTIVE;
  if (context.isAudible && context.mediaSourceTabId != null) return AttentionState.BACKGROUND_ACTIVE;
  if (!isSystemActive(context)) return AttentionState.IDLE;
  return AttentionState.PASSIVE;
}

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
 * 4. 画中画 → PIP_ACTIVE（单独记录，不混入普通在线/后台媒体时长）
 * 5. 媒体播放（失焦但 audible）→ BACKGROUND_ACTIVE
 * 6. 其他 → PASSIVE（权重 = 0）
 */
export function resolveState(context) {
  if (!context?.domain && !context?.mediaSourceDomain) return AttentionState.IDLE;
  // 媒体播放优先：即使系统 idle，也不能丢失媒体播放计时。
  if (context.isPiP) return AttentionState.PIP_ACTIVE;
  if (isForegroundPageEligible(context)) return AttentionState.ACTIVE;
  if (context.isAudible && context.mediaSourceTabId != null) return AttentionState.BACKGROUND_ACTIVE;
  if (!isSystemActive(context)) return AttentionState.IDLE;
  return AttentionState.PASSIVE;
}

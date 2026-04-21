// core/state.js — 状态机（纯函数）

export const AttentionState = {
  ACTIVE: 'ACTIVE',
  PASSIVE: 'PASSIVE',
  IDLE: 'IDLE',
  BACKGROUND_ACTIVE: 'BACKGROUND_ACTIVE',
};

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
 * 4. 媒体播放（失焦但 audible）→ BACKGROUND_ACTIVE
 * 5. 画中画 → BACKGROUND_ACTIVE
 * 6. 其他 → PASSIVE（权重 = 0）
 */
export function resolveState(context) {
  if (!context?.domain) return AttentionState.IDLE;
  if (context.isIdle) return AttentionState.IDLE;
  if (context.isFocused && context.tabId) return AttentionState.ACTIVE;
  if (context.isAudible) return AttentionState.BACKGROUND_ACTIVE;
  if (context.isPiP) return AttentionState.BACKGROUND_ACTIVE;
  return AttentionState.PASSIVE;
}

// core/context.js — 上下文构建（纯函数）

/**
 * 将原始事件合并为 AttentionContext 对象
 *
 * @param {Object|null} current - 当前上下文
 * @param {Object} rawEvent - 原始事件
 * @returns {Object} 新的 Context 对象（不可变）
 *
 * @typedef {Object} AttentionContext
 * @property {number|null} tabId
 * @property {number|null} windowId
 * @property {string|null} domain
 * @property {boolean} isFocused
 * @property {boolean} isIdle
 * @property {boolean} isAudible
 * @property {boolean} isPiP
 * @property {number} timestamp
 * @property {number|null} lastActiveTabId
 * @property {number|null} lastFocusedWindowId
 */
export function buildContext(current, rawEvent) {
  const isMediaSignal = rawEvent.mediaSourceTabId != null && rawEvent.domain == null;
  const nextTabId = isMediaSignal
    ? (current?.lastActiveTabId ?? current?.tabId ?? null)
    : (rawEvent.tabId ?? current?.lastActiveTabId ?? null);
  const nextMediaSourceTabId = rawEvent.isAudible === false
    ? null
    : (rawEvent.mediaSourceTabId ?? current?.mediaSourceTabId ?? null);

  return {
    tabId: nextTabId,
    windowId: rawEvent.windowId ?? current?.lastFocusedWindowId ?? null,
    domain: isMediaSignal ? (current?.domain ?? null) : (rawEvent.domain ?? current?.domain ?? null),
    isFocused: rawEvent.isFocused ?? current?.isFocused ?? false,
    isIdle: rawEvent.isIdle ?? current?.isIdle ?? false,
    isAudible: rawEvent.isAudible ?? current?.isAudible ?? false,
    mediaSourceTabId: nextMediaSourceTabId,
    isPiP: rawEvent.isPiP ?? current?.isPiP ?? false,
    timestamp: Date.now(),
    // 关键：追踪最后状态，防止 window blur/focus 循环导致状态错乱
    lastActiveTabId: isMediaSignal ? current?.lastActiveTabId : (rawEvent.tabId ?? current?.lastActiveTabId),
    lastFocusedWindowId: rawEvent.windowId ?? current?.lastFocusedWindowId,
  };
}

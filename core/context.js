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
 * @property {string|null} mediaSourceDomain
 * @property {number} timestamp
 * @property {number|null} lastActiveTabId
 * @property {number|null} lastFocusedWindowId
 * @property {boolean|null} pageVisible
 * @property {number|null} lastPageActivityAt
 * @property {number|null} lastVisibleAt
 * @property {number|null} lastForegroundEvidenceAt
 * @property {number|null} serviceHeartbeatAt
 */
export function buildContext(current, rawEvent) {
  const now = Date.now();
  const pageVisible = rawEvent.pageVisible ?? rawEvent.visible ?? current?.pageVisible ?? null;
  const activityAt = Number.isFinite(rawEvent.at) ? rawEvent.at : now;
  const isPageActivity = rawEvent.type === 'PAGE_ACTIVITY' || rawEvent._reason === 'pageActivity';
  const nextLastPageActivityAt = isPageActivity
    ? activityAt
    : (current?.lastPageActivityAt ?? null);
  const nextLastVisibleAt = pageVisible === true && (isPageActivity || current?.pageVisible !== true)
    ? activityAt
    : (current?.lastVisibleAt ?? null);

  if (rawEvent?._replaceContext) {
    const replacementBase = {
      domain: rawEvent.domain ?? null,
      tabId: rawEvent.tabId ?? null,
      isFocused: rawEvent.isFocused ?? false,
      pageVisible,
      isIdle: rawEvent.isIdle ?? current?.isIdle ?? false,
    };
    const replacementForegroundEvidenceAt = hasForegroundEvidence(replacementBase)
      ? now
      : (current?.lastForegroundEvidenceAt ?? null);
    return {
      tabId: rawEvent.tabId ?? null,
      windowId: rawEvent.windowId ?? null,
      domain: rawEvent.domain ?? null,
      isFocused: rawEvent.isFocused ?? false,
      isIdle: rawEvent.isIdle ?? current?.isIdle ?? false,
      isAudible: rawEvent.isAudible ?? false,
      mediaSourceTabId: rawEvent.mediaSourceTabId ?? null,
      mediaSourceDomain: rawEvent.mediaSourceDomain ?? null,
      isPiP: rawEvent.isPiP ?? false,
      timestamp: now,
      lastActiveTabId: rawEvent.tabId ?? null,
      lastFocusedWindowId: rawEvent.windowId ?? null,
      pageVisible,
      lastPageActivityAt: nextLastPageActivityAt,
      lastVisibleAt: nextLastVisibleAt,
      lastForegroundEvidenceAt: replacementForegroundEvidenceAt,
      serviceHeartbeatAt: current?.serviceHeartbeatAt ?? null,
    };
  }

  const isMediaSignal = rawEvent.mediaSourceTabId != null && rawEvent.domain == null;
  const nextTabId = isMediaSignal
    ? (current?.lastActiveTabId ?? current?.tabId ?? null)
    : (rawEvent.tabId ?? current?.lastActiveTabId ?? null);
  const nextMediaSourceTabId = rawEvent.isAudible === false
    ? null
    : (rawEvent.mediaSourceTabId ?? current?.mediaSourceTabId ?? null);
  const nextMediaSourceDomain = rawEvent.isAudible === false
    ? null
    : (rawEvent.mediaSourceDomain ?? current?.mediaSourceDomain ?? null);

  const next = {
    tabId: nextTabId,
    windowId: rawEvent.windowId ?? current?.lastFocusedWindowId ?? null,
    domain: isMediaSignal ? (current?.domain ?? null) : (rawEvent.domain ?? current?.domain ?? null),
    isFocused: rawEvent.isFocused ?? current?.isFocused ?? false,
    isIdle: rawEvent.isIdle ?? current?.isIdle ?? false,
    isAudible: rawEvent.isAudible ?? current?.isAudible ?? false,
    mediaSourceTabId: nextMediaSourceTabId,
    mediaSourceDomain: nextMediaSourceDomain,
    isPiP: rawEvent.isPiP ?? current?.isPiP ?? false,
    timestamp: now,
    // 关键：追踪最后状态，防止 window blur/focus 循环导致状态错乱
    lastActiveTabId: isMediaSignal ? current?.lastActiveTabId : (rawEvent.tabId ?? current?.lastActiveTabId),
    lastFocusedWindowId: rawEvent.windowId ?? current?.lastFocusedWindowId,
    pageVisible,
    lastPageActivityAt: nextLastPageActivityAt,
    lastVisibleAt: nextLastVisibleAt,
    lastForegroundEvidenceAt: current?.lastForegroundEvidenceAt ?? null,
    serviceHeartbeatAt: rawEvent._reason === 'serviceHeartbeat' ? now : (current?.serviceHeartbeatAt ?? null),
  };

  if (rawEvent._reason !== 'serviceHeartbeat' && hasForegroundEvidence(next)) {
    next.lastForegroundEvidenceAt = now;
  }
  return next;
}

function hasForegroundEvidence(context) {
  return !!(
    context?.domain &&
    context?.tabId != null &&
    context?.isFocused &&
    context?.pageVisible === true &&
    !context?.isIdle
  );
}

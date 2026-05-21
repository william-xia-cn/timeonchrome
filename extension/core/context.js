// core/context.js — 上下文构建（纯函数）

function domainForForegroundUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.hostname ? parsed.hostname.toLowerCase().replace(/\.+$/g, '') : null;
    }
    if (parsed.protocol === 'chrome-extension:') return 'extension-page.chrome-local';
    if (parsed.protocol === 'chrome:') {
      if (parsed.hostname === 'extensions') return 'chrome-extensions.chrome-local';
      if (parsed.hostname === 'settings') return 'chrome-settings.chrome-local';
      return 'chrome-page.chrome-local';
    }
    if (parsed.protocol === 'edge:') return 'edge-page.chrome-local';
    if (parsed.protocol === 'file:') return 'local-file.chrome-local';
    if (parsed.protocol === 'about:') return 'about-page.chrome-local';
    if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') return 'embedded-page.chrome-local';
    return 'unknown-page.chrome-local';
  } catch (_) {
    return null;
  }
}

function foregroundDomainFromEvent({ tabId = null, url = undefined, domain = undefined, isFocused = true } = {}) {
  if (!isFocused || tabId == null) return null;
  if (typeof domain === 'string' && domain.trim()) return domain.trim().toLowerCase().replace(/\.+$/g, '');
  if (url === undefined || url === null || url === '') return 'unknown-page.chrome-local';
  const foregroundDomain = domainForForegroundUrl(url);
  return foregroundDomain || 'unknown-page.chrome-local';
}

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
 * @property {'active'|'idle'|'locked'|string} idleState
 * @property {boolean} isIdle
 * @property {boolean} isAudible
 * @property {'audio'|'video'|null} mediaKind
 * @property {boolean} isPiP
 * @property {string|null} mediaSourceDomain
 * @property {boolean} foregroundMediaActive
 * @property {string|null} windowState
 * @property {number} timestamp
 * @property {number|null} lastActiveTabId
 * @property {number|null} lastFocusedWindowId
 */
export function buildContext(current, rawEvent) {
  const isMediaSignal = rawEvent.mediaSourceTabId != null && rawEvent.domain == null;
  const hasExplicitFocusLoss = rawEvent.isFocused === false;
  const hasTabSignal = !isMediaSignal && rawEvent.tabId != null;
  const hasForegroundObservation = hasTabSignal ||
    Object.prototype.hasOwnProperty.call(rawEvent, 'url') ||
    Object.prototype.hasOwnProperty.call(rawEvent, 'domain');
  const nextDomain = isMediaSignal
    ? (current?.domain ?? null)
    : (hasExplicitFocusLoss
        ? null
        : (hasForegroundObservation
            ? foregroundDomainFromEvent({
                tabId: rawEvent.tabId ?? current?.lastActiveTabId ?? current?.tabId ?? null,
                url: rawEvent.url,
                domain: rawEvent.domain,
                isFocused: rawEvent.isFocused ?? current?.isFocused ?? false,
              })
            : (current?.domain ?? null)));
  const nextTabId = isMediaSignal
    ? (current?.lastActiveTabId ?? current?.tabId ?? null)
    : (rawEvent.tabId ?? current?.lastActiveTabId ?? null);
  const nextMediaSourceTabId = rawEvent.isAudible === false
    ? null
    : (rawEvent.mediaSourceTabId ?? current?.mediaSourceTabId ?? null);
  const nextMediaSourceDomain = rawEvent.isAudible === false
    ? null
    : (rawEvent.mediaSourceDomain ?? current?.mediaSourceDomain ?? null);
  const nextMediaKind = rawEvent.isAudible === false
    ? null
    : (rawEvent.mediaKind ?? current?.mediaKind ?? null);
  const rawIdleState = typeof rawEvent.idleState === 'string' ? rawEvent.idleState : null;
  const fallbackIdleState = rawEvent.isIdle === true
    ? 'idle'
    : (rawEvent.isIdle === false
        ? 'active'
        : (current?.idleState || (current?.isIdle === true ? 'idle' : current?.isIdle === false ? 'active' : undefined)));
  const nextIdleState = rawIdleState || fallbackIdleState || 'active';

  const foregroundMediaActive = rawEvent.foregroundMediaActive ??
    (isMediaSignal ? (current?.foregroundMediaActive ?? false) : false);

  return {
    tabId: nextTabId,
    windowId: rawEvent.windowId ?? current?.lastFocusedWindowId ?? null,
    domain: nextDomain,
    isFocused: rawEvent.isFocused ?? current?.isFocused ?? false,
    windowState: rawEvent.windowState ?? current?.windowState ?? null,
    idleState: nextIdleState,
    isIdle: rawEvent.isIdle ?? (nextIdleState !== 'active'),
    isAudible: rawEvent.isAudible ?? current?.isAudible ?? false,
    isMuted: rawEvent.isMuted ?? current?.isMuted ?? false,
    mediaKind: nextMediaKind,
    mediaSourceTabId: nextMediaSourceTabId,
    mediaSourceDomain: nextMediaSourceDomain,
    mediaFactSource: rawEvent.mediaFactSource ?? current?.mediaFactSource ?? null,
    foregroundMediaActive,
    isPiP: rawEvent.isPiP ?? current?.isPiP ?? false,
    timestamp: Date.now(),
    // 关键：追踪最后状态，防止 window blur/focus 循环导致状态错乱
    lastActiveTabId: isMediaSignal ? current?.lastActiveTabId : (rawEvent.tabId ?? current?.lastActiveTabId),
    lastFocusedWindowId: rawEvent.windowId ?? current?.lastFocusedWindowId,
  };
}

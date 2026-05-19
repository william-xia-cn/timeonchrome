// core/signal.js — Chrome API 输入层 + micro-batching 事件合并
import { domainForUrl } from './domain-semantics.js';

const BATCH_WINDOW = 80; // 80ms 覆盖 Chrome 事件簇
const IDLE_DETECTION_SECONDS = 90;

/**
 * 初始化信号监听
 * @param {(rawEvent: Object) => void} onContextChange
 */
export function initSignal(onContextChange) {
  let pending = {};
  let batchTimer = null;
  let lastWindowFocusKey = null;

  try {
    chrome.idle?.setDetectionInterval?.(IDLE_DETECTION_SECONDS);
  } catch (err) {
    console.warn('[Signal] failed to set idle detection interval:', err?.message || err);
  }

  function emitMerged() {
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }
    if (Object.keys(pending).length > 0) {
      onContextChange({ ...pending });
    }
    pending = {};
  }

  function scheduleMerge() {
    if (!batchTimer) {
      batchTimer = setTimeout(emitMerged, BATCH_WINDOW);
    }
  }

  function isMediaOnlyRawEvent(event = {}) {
    const reason = event?._reason || null;
    if (reason === 'tabAudible' || reason === 'mediaState') return true;
    if (event?.mediaFactSource && reason !== 'tabUpdated') return true;
    return event?.mediaSourceTabId != null &&
      event?.domain == null &&
      !Object.prototype.hasOwnProperty.call(event || {}, 'url') &&
      reason !== 'tabUpdated';
  }

  /**
   * 字段优先级合并：incoming 的 null/undefined 不覆盖 pending 的值
   */
  function mergeEvent(pending, incoming) {
    return {
      tabId: incoming.tabId ?? pending.tabId,
      windowId: incoming.windowId ?? pending.windowId,
      url: incoming.url ?? pending.url,
      domain: incoming.domain ?? pending.domain,
      isFocused: incoming.isFocused ?? pending.isFocused,
      idleState: incoming.idleState ?? pending.idleState,
      isIdle: incoming.isIdle ?? pending.isIdle,
      isAudible: incoming.isAudible ?? pending.isAudible,
      playing: incoming.playing ?? pending.playing,
      mediaKind: incoming.mediaKind === 'video' || pending.mediaKind === 'video'
        ? 'video'
        : (incoming.mediaKind ?? pending.mediaKind),
      mediaSourceTabId: incoming.mediaSourceTabId ?? pending.mediaSourceTabId,
      mediaSourceDomain: incoming.mediaSourceDomain ?? pending.mediaSourceDomain,
      isMuted: incoming.isMuted ?? pending.isMuted,
      isPiP: incoming.isPiP ?? pending.isPiP,
      isActiveTab: incoming.isActiveTab ?? pending.isActiveTab,
      windowState: incoming.windowState ?? pending.windowState,
      mediaFactSource: incoming.mediaFactSource ?? pending.mediaFactSource,
      replacedTabId: incoming.replacedTabId ?? pending.replacedTabId,
      error: incoming.error ?? pending.error,
      _reason: incoming._reason ?? pending._reason ?? 'unknown',
      timestamp: Date.now(),
    };
  }

  function onEvent(rawEvent) {
    if (Object.keys(pending).length > 0 && isMediaOnlyRawEvent(pending) !== isMediaOnlyRawEvent(rawEvent)) {
      emitMerged();
    }
    pending = mergeEvent(pending, rawEvent);
    scheduleMerge();
  }

  async function getWindowFocusState(windowId) {
    if (!windowId || windowId === chrome.windows.WINDOW_ID_NONE) return {};
    try {
      const win = await chrome.windows.get(windowId);
      return { isFocused: !!win?.focused, windowState: win?.state || null };
    } catch (err) {
      return { error: err?.message || String(err) };
    }
  }

  async function emitFocusedWindowSignal(windowId, reason) {
    try {
      const tabs = await chrome.tabs.query({ active: true, windowId });
      const tab = tabs && tabs[0];
      const url = tab?.url || null;
      const domain = url ? extractDomain(url) : null;
      lastWindowFocusKey = `focused:${windowId}`;
      onEvent({
        windowId,
        isFocused: true,
        tabId: tab?.id ?? null,
        url,
        domain,
        _reason: reason,
      });
    } catch (err) {
      lastWindowFocusKey = `focused:${windowId}`;
      onEvent({
        windowId,
        isFocused: true,
        error: err?.message || String(err),
        _reason: reason,
      });
    }
  }

  async function pollWindowFocusState() {
    if (!chrome.windows?.getAll) return;
    try {
      const windows = await chrome.windows.getAll({ populate: false });
      const focusedWindow = windows.find((win) => win.focused);
      if (!focusedWindow) {
        if (lastWindowFocusKey !== 'none') {
          lastWindowFocusKey = 'none';
          onEvent({ isFocused: false, _reason: 'windowFocusPolled' });
        }
        return;
      }

      const focusKey = `focused:${focusedWindow.id}`;
      if (lastWindowFocusKey !== focusKey) {
        await emitFocusedWindowSignal(focusedWindow.id, 'windowFocusPolled');
      }
    } catch (err) {
      onEvent({ error: err?.message || String(err), _reason: 'windowFocusPolled' });
    }
  }

  // ── Chrome 事件监听 ─────────────────────────────────────────────

  // 标签页激活
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    // 主动查询 tab URL（onActivated 不提供 URL，onUpdated 对已加载标签不触发）
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      const url = tab.url || null;
      const domain = url ? extractDomain(url) : null;
      const focus = await getWindowFocusState(activeInfo.windowId);
      onEvent({
        tabId: activeInfo.tabId,
        windowId: activeInfo.windowId,
        url,
        domain,
        ...focus,
        _reason: 'tabActivated',
      });
    } catch (err) {
      onEvent({
        tabId: activeInfo.tabId,
        windowId: activeInfo.windowId,
        error: err?.message || String(err),
        _reason: 'tabActivated',
      });
    }
  });

  // 标签页更新（获取域名）
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    const hasForegroundNavigation =
      Object.prototype.hasOwnProperty.call(changeInfo, 'url') ||
      changeInfo.status === 'loading';
    if (hasForegroundNavigation && tab.active && tab.url) {
      const windowId = tab.windowId ?? null;
      const domain = extractDomain(tab.url);
      if (domain) {
        const focus = await getWindowFocusState(windowId);
        const navigationClearsMedia = changeInfo.url || changeInfo.status === 'loading';
        onEvent({
          tabId,
          windowId,
          url: tab.url,
          domain,
          ...(navigationClearsMedia ? { playing: false, isAudible: false, mediaSourceTabId: tabId, mediaSourceDomain: null, isPiP: false } : {}),
          ...focus,
          _reason: 'tabUpdated',
        });
      }
    }

    const hasAudibleFact =
      Object.prototype.hasOwnProperty.call(changeInfo, 'audible') ||
      Object.prototype.hasOwnProperty.call(tab || {}, 'audible');
    if (hasAudibleFact) {
      const windowId = tab?.windowId ?? null;
      const url = tab?.url || null;
      const domain = url ? extractDomain(url) : null;
      const focus = await getWindowFocusState(windowId);
      onEvent({
        windowId,
        playing: tab?.audible === true,
        isAudible: tab?.audible === true,
        mediaKind: tab?.audible ? 'audio' : null,
        mediaSourceTabId: tabId,
        mediaSourceDomain: domain,
        isMuted: tab?.mutedInfo?.muted === true,
        isActiveTab: tab?.active === true,
        windowState: focus.windowState ?? null,
        mediaFactSource: 'tabs_api_audible',
        _reason: 'tabAudible',
      });
    }
  });

  // 标签页替换（prerender / instant / discard restore 可能让可见 tab 换 tabId）
  chrome.tabs.onReplaced?.addListener?.(async (addedTabId, removedTabId) => {
    try {
      const tab = await chrome.tabs.get(addedTabId);
      if (!tab?.active) return;
      const windowId = tab.windowId ?? null;
      const url = tab.url || null;
      const domain = url ? extractDomain(url) : null;
      const focus = await getWindowFocusState(windowId);
      onEvent({
        tabId: addedTabId,
        replacedTabId: removedTabId ?? null,
        windowId,
        url,
        domain,
        ...focus,
        _reason: 'tabReplaced',
      });
    } catch (err) {
      onEvent({
        tabId: addedTabId,
        replacedTabId: removedTabId ?? null,
        error: err?.message || String(err),
        _reason: 'tabReplaced',
      });
    }
  });

  // 窗口焦点变化
  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      lastWindowFocusKey = 'none';
      onEvent({ isFocused: false, _reason: 'windowFocusLost' });
    } else {
      await emitFocusedWindowSignal(windowId, 'windowFocusChanged');
    }
  });

  const focusPollTimer = setInterval(pollWindowFocusState, 1000);
  focusPollTimer?.unref?.();

  // 空闲状态变化
  chrome.idle.onStateChanged.addListener((state) => {
    onEvent({ idleState: state, isIdle: state !== 'active', _reason: 'idleStateChanged' });
  });

  // 媒体状态（从 content.js 或 tabs API 转发）
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg.type === 'MEDIA_STATE' && sender.tab) {
      (async () => {
        const url = sender.tab.url || null;
        const domain = url ? extractDomain(url) : null;
        const focus = await getWindowFocusState(sender.tab.windowId);
        onEvent({
          windowId: sender.tab.windowId ?? null,
          playing: msg.playing === true,
          isAudible: msg.playing === true,
          isPiP: msg.isPiP === true,
          mediaKind: msg.mediaKind || null,
          mediaSourceTabId: sender.tab.id,
          mediaSourceDomain: domain,
          isMuted: sender.tab.mutedInfo?.muted === true,
          isActiveTab: sender.tab.active === true,
          windowState: focus.windowState ?? null,
          mediaFactSource: msg.source || 'content_media_state',
          _reason: 'mediaState',
        });
      })();
    }
  });

  // 标签页关闭时清理
  chrome.tabs.onRemoved.addListener(async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs && tabs[0];
      if (!tab?.id) {
        onEvent({ tabId: null, windowId: null, url: null, domain: null, isFocused: false, _reason: 'tabClosedNoActiveTab' });
        return;
      }
      const focus = await getWindowFocusState(tab.windowId);
      const url = tab.url || null;
      onEvent({
        tabId: tab.id,
        windowId: tab.windowId ?? null,
        url,
        domain: url ? extractDomain(url) : null,
        ...focus,
        _reason: 'tabClosedSuccessor',
      });
    } catch (err) {
      onEvent({ tabId: null, windowId: null, url: null, domain: null, isFocused: false, error: err?.message || String(err), _reason: 'tabClosedNoActiveTab' });
    }
  });
}

/**
 * 从 URL 提取域名
 * @param {string} url
 * @returns {string|null}
 */
function extractDomain(url) {
  return domainForUrl(url);
}

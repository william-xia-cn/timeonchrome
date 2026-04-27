// core/signal.js — Chrome API 输入层 + micro-batching 事件合并
import { normalizeHostname } from './domain-semantics.js';

const BATCH_WINDOW = 80; // 80ms 覆盖 Chrome 事件簇

/**
 * 初始化信号监听
 * @param {(rawEvent: Object) => void} onContextChange
 */
export function initSignal(onContextChange) {
  let pending = {};
  let batchTimer = null;
  let lastWindowFocusKey = null;

  function emitMerged() {
    if (Object.keys(pending).length > 0) {
      onContextChange({ ...pending });
    }
    pending = {};
    batchTimer = null;
  }

  function scheduleMerge() {
    if (!batchTimer) {
      batchTimer = setTimeout(emitMerged, BATCH_WINDOW);
    }
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
      isIdle: incoming.isIdle ?? pending.isIdle,
      isAudible: incoming.isAudible ?? pending.isAudible,
      mediaSourceTabId: incoming.mediaSourceTabId ?? pending.mediaSourceTabId,
      mediaSourceDomain: incoming.mediaSourceDomain ?? pending.mediaSourceDomain,
      isPiP: incoming.isPiP ?? pending.isPiP,
      error: incoming.error ?? pending.error,
      _reason: incoming._reason ?? pending._reason ?? 'unknown',
      timestamp: Date.now(),
    };
  }

  function onEvent(rawEvent) {
    pending = mergeEvent(pending, rawEvent);
    scheduleMerge();
  }

  async function getWindowFocusState(windowId) {
    if (!windowId || windowId === chrome.windows.WINDOW_ID_NONE) return {};
    try {
      const win = await chrome.windows.get(windowId);
      return { isFocused: !!win?.focused };
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
    if (tab.active && tab.url) {
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
          ...(navigationClearsMedia ? { isAudible: false, mediaSourceTabId: tabId, mediaSourceDomain: null, isPiP: false } : {}),
          ...focus,
          _reason: 'tabUpdated',
        });
      }
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
    onEvent({ isIdle: state === 'idle', _reason: 'idleStateChanged' });
  });

  // 媒体状态（从 content.js 或 tabs API 转发）
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg.type === 'MEDIA_STATE' && sender.tab) {
      const url = sender.tab.url || null;
      const domain = url ? extractDomain(url) : null;
      onEvent({
        isAudible: msg.playing,
        isPiP: msg.isPiP,
        mediaSourceTabId: sender.tab.id,
        mediaSourceDomain: domain,
        _reason: 'mediaState',
      });
    }
  });

  // 标签页关闭时清理
  chrome.tabs.onRemoved.addListener((tabId) => {
    // 如果当前 active tab 被关闭，触发一次状态更新
    onEvent({ _reason: 'tabClosed' }); // 触发合并，让 context 重新评估
  });
}

/**
 * 从 URL 提取域名
 * @param {string} url
 * @returns {string|null}
 */
function extractDomain(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    // 排除 chrome://、chrome-extension://、edge://、about: 等特殊页面
    if (u.protocol === 'chrome:' || u.protocol === 'chrome-extension:' || u.protocol === 'edge:' || u.protocol === 'about:') return null;
    const hostname = u.hostname;
    if (!hostname) return null;
    return normalizeHostname(hostname);
  } catch {
    return null;
  }
}

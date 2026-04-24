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
      domain: incoming.domain ?? pending.domain,
      isFocused: incoming.isFocused ?? pending.isFocused,
      isIdle: incoming.isIdle ?? pending.isIdle,
      isAudible: incoming.isAudible ?? pending.isAudible,
      mediaSourceTabId: incoming.mediaSourceTabId ?? pending.mediaSourceTabId,
      isPiP: incoming.isPiP ?? pending.isPiP,
      timestamp: Date.now(),
    };
  }

  function onEvent(rawEvent) {
    pending = mergeEvent(pending, rawEvent);
    scheduleMerge();
  }

  // ── Chrome 事件监听 ─────────────────────────────────────────────

  // 标签页激活
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    // 主动查询 tab URL（onActivated 不提供 URL，onUpdated 对已加载标签不触发）
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      const domain = tab.url ? extractDomain(tab.url) : null;
      onEvent({
        tabId: activeInfo.tabId,
        windowId: activeInfo.windowId,
        domain,
      });
    } catch {
      onEvent({
        tabId: activeInfo.tabId,
        windowId: activeInfo.windowId,
      });
    }
  });

  // 标签页更新（获取域名）
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && tab.url) {
      const domain = extractDomain(tab.url);
      if (domain) {
        onEvent({ tabId, domain });
      }
    }
  });

  // 窗口焦点变化
  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      onEvent({ isFocused: false });
    } else {
      onEvent({ windowId, isFocused: true });
    }
  });

  // 空闲状态变化
  chrome.idle.onStateChanged.addListener((state) => {
    onEvent({ isIdle: state === 'idle' });
  });

  // 媒体状态（从 content.js 或 tabs API 转发）
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg.type === 'MEDIA_STATE' && sender.tab) {
      onEvent({
        isAudible: msg.playing,
        mediaSourceTabId: sender.tab.id,
      });
    }
    if (msg.type === 'PIP_STATE' && sender.tab) {
      onEvent({
        isPiP: msg.pip,
        tabId: sender.tab.id,
      });
    }
  });

  // 标签页关闭时清理
  chrome.tabs.onRemoved.addListener((tabId) => {
    // 如果当前 active tab 被关闭，触发一次状态更新
    onEvent({}); // 触发合并，让 context 重新评估
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

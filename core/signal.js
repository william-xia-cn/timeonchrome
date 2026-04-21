// core/signal.js — Chrome API 输入层 + micro-batching 事件合并

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
  chrome.tabs.onActivated.addListener((activeInfo) => {
    onEvent({
      tabId: activeInfo.tabId,
      windowId: activeInfo.windowId,
    });
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
        tabId: sender.tab.id,
        isAudible: msg.playing,
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
    const hostname = new URL(url).hostname;
    // 排除 chrome:// 等特殊页面
    if (hostname.startsWith('chrome') || hostname.startsWith('chrome-extension')) return null;
    return hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

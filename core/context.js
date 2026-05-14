// core/context.js — 上下文构建（纯函数）

const CandidateKind = {
  KNOWN_DOMAIN: 'known_domain',
  UNKNOWN_DOMAIN: 'unknown_domain',
  NONE: 'none',
};

const SPECIAL_PROTOCOLS = new Set([
  'about:',
  'blob:',
  'chrome:',
  'chrome-extension:',
  'data:',
  'edge:',
  'file:',
]);

function classifyForegroundCandidate({ tabId = null, url = undefined, domain = undefined, isFocused = true } = {}) {
  if (!isFocused || tabId == null) return { kind: CandidateKind.NONE, domain: null };
  if (typeof domain === 'string' && domain.trim()) return { kind: CandidateKind.KNOWN_DOMAIN, domain: domain.trim().toLowerCase() };
  if (url === undefined || url === null || url === '') return { kind: CandidateKind.UNKNOWN_DOMAIN, domain: '__unknown__' };
  try {
    const parsed = new URL(url);
    if (SPECIAL_PROTOCOLS.has(parsed.protocol)) return { kind: CandidateKind.NONE, domain: null };
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { kind: CandidateKind.NONE, domain: null };
    return parsed.hostname
      ? { kind: CandidateKind.KNOWN_DOMAIN, domain: parsed.hostname.toLowerCase() }
      : { kind: CandidateKind.UNKNOWN_DOMAIN, domain: '__unknown__' };
  } catch (_) {
    return { kind: CandidateKind.UNKNOWN_DOMAIN, domain: '__unknown__' };
  }
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
 * @property {boolean} isIdle
 * @property {boolean} isAudible
 * @property {boolean} isPiP
 * @property {string|null} mediaSourceDomain
 * @property {number} timestamp
 * @property {number|null} lastActiveTabId
 * @property {number|null} lastFocusedWindowId
 */
export function buildContext(current, rawEvent) {
  const isMediaSignal = rawEvent.mediaSourceTabId != null && rawEvent.domain == null;
  const hasExplicitFocusLoss = rawEvent.isFocused === false;
  const hasTabSignal = !isMediaSignal && rawEvent.tabId != null;
  const candidate = isMediaSignal
    ? {
        kind: current?.candidateKind ?? CandidateKind.NONE,
        domain: current?.candidateDomain ?? null,
      }
    : (hasExplicitFocusLoss
        ? { kind: CandidateKind.NONE, domain: null }
        : (hasTabSignal || Object.prototype.hasOwnProperty.call(rawEvent, 'url') || Object.prototype.hasOwnProperty.call(rawEvent, 'domain'))
            ? classifyForegroundCandidate({
                tabId: rawEvent.tabId ?? current?.lastActiveTabId ?? current?.tabId ?? null,
                url: rawEvent.url,
                domain: rawEvent.domain,
                isFocused: rawEvent.isFocused ?? current?.isFocused ?? false,
              })
            : {
                kind: current?.candidateKind ?? CandidateKind.NONE,
                domain: current?.candidateDomain ?? null,
              });
  const nextTabId = isMediaSignal
    ? (current?.lastActiveTabId ?? current?.tabId ?? null)
    : (rawEvent.tabId ?? current?.lastActiveTabId ?? null);
  const nextMediaSourceTabId = rawEvent.isAudible === false
    ? null
    : (rawEvent.mediaSourceTabId ?? current?.mediaSourceTabId ?? null);
  const nextMediaSourceDomain = rawEvent.isAudible === false
    ? null
    : (rawEvent.mediaSourceDomain ?? current?.mediaSourceDomain ?? null);

  return {
    tabId: nextTabId,
    windowId: rawEvent.windowId ?? current?.lastFocusedWindowId ?? null,
    domain: isMediaSignal ? (current?.domain ?? null) : (candidate.kind === CandidateKind.KNOWN_DOMAIN ? candidate.domain : null),
    candidateKind: candidate.kind,
    candidateDomain: candidate.domain,
    isFocused: rawEvent.isFocused ?? current?.isFocused ?? false,
    isIdle: rawEvent.isIdle ?? current?.isIdle ?? false,
    isAudible: rawEvent.isAudible ?? current?.isAudible ?? false,
    mediaSourceTabId: nextMediaSourceTabId,
    mediaSourceDomain: nextMediaSourceDomain,
    isPiP: rawEvent.isPiP ?? current?.isPiP ?? false,
    timestamp: Date.now(),
    // 关键：追踪最后状态，防止 window blur/focus 循环导致状态错乱
    lastActiveTabId: isMediaSignal ? current?.lastActiveTabId : (rawEvent.tabId ?? current?.lastActiveTabId),
    lastFocusedWindowId: rawEvent.windowId ?? current?.lastFocusedWindowId,
  };
}

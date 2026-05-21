// core/pip-policy.js — current PiP control policy and shared cleanup helper

export const PIP_POLICY = 'disallow_all';

const PIP_CLOSE_SEND_RETRIES = 6;
const PIP_CLOSE_RETRY_DELAY_MS = 150;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isValidTabId(tabId) {
  return Number.isInteger(tabId) && tabId >= 0;
}

export function isPictureInPictureDisallowed() {
  return PIP_POLICY === 'disallow_all';
}

export function shouldEnforcePictureInPicturePolicy() {
  return isPictureInPictureDisallowed();
}

export async function closeTabPictureInPicture(tabId, options = {}) {
  const retries = Number.isInteger(options.retries) ? options.retries : PIP_CLOSE_SEND_RETRIES;
  const retryDelayMs = Number.isInteger(options.retryDelayMs) ? options.retryDelayMs : PIP_CLOSE_RETRY_DELAY_MS;
  if (!isValidTabId(tabId) || !chrome.tabs?.sendMessage) {
    return { ok: false, handled: false, closed: false, confirmedNoPiP: false, reason: 'invalid_tab_id' };
  }

  let handled = false;
  let confirmedNoPiP = false;
  let lastError = null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'EXIT_PIP' });
      handled = true;
      if (response?.exited === true) {
        return { ok: true, handled: true, closed: true, confirmedNoPiP: true, response };
      }
      if (response?.ok === true && response?.hadPiP === false) {
        confirmedNoPiP = true;
        return { ok: true, handled: true, closed: false, confirmedNoPiP: true, response };
      }
      if (response?.ok === true && response?.hadPiP === true && response?.exited === false) {
        lastError = new Error('pip_still_active');
      }
    } catch (err) {
      lastError = err;
    }
    if (attempt < retries - 1) {
      await delay(retryDelayMs);
    }
  }

  return {
    ok: false,
    handled,
    closed: false,
    confirmedNoPiP,
    error: lastError?.message || String(lastError || 'pip_cleanup_failed'),
  };
}

export async function closeForbiddenPictureInPicture(options = {}) {
  const preferredTabId = Number.isInteger(options.preferredTabId) ? options.preferredTabId : null;
  const tabIds = [];
  if (preferredTabId != null && preferredTabId >= 0) {
    tabIds.push(preferredTabId);
  }

  if (chrome.tabs?.query) {
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs || []) {
        if (!isValidTabId(tab?.id) || tabIds.includes(tab.id)) continue;
        tabIds.push(tab.id);
      }
    } catch {}
  }

  const tabResults = [];
  let handled = false;
  let closed = false;
  let confirmedNoPiP = false;
  for (const tabId of tabIds) {
    const result = await closeTabPictureInPicture(tabId, options);
    tabResults.push({ tabId, ...result });
    handled = handled || result.handled === true;
    closed = closed || result.closed === true;
    confirmedNoPiP = confirmedNoPiP || result.confirmedNoPiP === true;
  }

  const ok = closed || confirmedNoPiP;
  return {
    ok,
    policy: PIP_POLICY,
    attempted: tabIds.length > 0,
    handled,
    closed,
    confirmedNoPiP,
    preferredTabId,
    reason: options.reason || 'pip_forbidden_cleanup',
    tabResults,
  };
}

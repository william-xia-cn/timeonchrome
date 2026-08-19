// debug/focus-ledger.js — Focus Ledger 双重校准机制（只读诊断，不影响业务逻辑）
//
// Purpose:
//   Record browser focus facts independently from business event_log_v1.
//   Compare focus duration vs activeSeconds to detect timing chain breakage.
//
// Scope:
//   - Plain web pages only (no video/audio/PiP handling)
//   - Read-only export, does not modify business state
//   - Independent storage key: debug_focus_ledger_v1
//
// Usage:
//   1. Call initFocusLedger() from background.js startup
//   2. Call exportCalibrationReport() to get comparison data
//   3. Call resetFocusLedger() to clear for a new test session

import { budgetedLocalSet } from '../infra/storage-budget.js';
import { budgetedSessionSet } from '../infra/session-storage-budget.js';

function focusStorageArea() {
  return chrome.storage.session || chrome.storage.local;
}

const focusStorageSet = (items) => chrome.storage.session?.set
  ? (typeof budgetedSessionSet === 'function'
    ? budgetedSessionSet(items, { priority: 'diagnostic', source: 'focus_ledger' })
    : chrome.storage.session.set(items))
  : (typeof budgetedLocalSet === 'function'
    ? budgetedLocalSet(items, { priority: 'diagnostic', source: 'focus_ledger' })
    : chrome.storage.local.set(items));

const FOCUS_LEDGER_KEY = 'debug_focus_ledger_v1';
const MAX_LEDGER_ENTRIES = 500;
const LEDGER_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get current focus ledger entries.
 * @returns {Promise<Array>}
 */
export async function getFocusLedger() {
  const data = await focusStorageArea().get(FOCUS_LEDGER_KEY);
  return data[FOCUS_LEDGER_KEY] || [];
}

/**
 * Append a focus ledger entry.
 * @param {{type: string, time: number, domain: string|null, tabId: number|null, windowId: number|null, reason: string}} entry
 */
export async function appendFocusEntry(entry) {
  const ledger = await getFocusLedger();
  ledger.push(entry);

  // Lifecycle control: prune old entries and enforce max size
  const now = Date.now();
  const pruned = ledger
    .filter(e => now - e.time < LEDGER_TTL_MS)
    .slice(-MAX_LEDGER_ENTRIES);

  await focusStorageSet({ [FOCUS_LEDGER_KEY]: pruned });
}

/**
 * Reset focus ledger (for starting a fresh test session).
 */
export async function resetFocusLedger() {
  await focusStorageSet({ [FOCUS_LEDGER_KEY]: [] });
}

/**
 * Initialize Focus Ledger listeners.
 * Hooks into Chrome events to record focus facts independently.
 * Does NOT modify business event_log_v1 or session_v1.
 *
 * @param {Function} extractDomain - domain extraction function from signal.js
 */
export function initFocusLedger(extractDomain) {
  let currentFocusTabId = null;
  let currentFocusDomain = null;
  let currentFocusWindowId = null;

  async function recordFocusStart(tabId, windowId, domain, reason) {
    currentFocusTabId = tabId;
    currentFocusDomain = domain;
    currentFocusWindowId = windowId;

    await appendFocusEntry({
      type: 'FOCUS_START',
      time: Date.now(),
      domain,
      tabId,
      windowId,
      reason,
    });
  }

  async function recordFocusEnd(reason) {
    if (!currentFocusTabId) return;

    await appendFocusEntry({
      type: 'FOCUS_END',
      time: Date.now(),
      domain: currentFocusDomain,
      tabId: currentFocusTabId,
      windowId: currentFocusWindowId,
      reason,
    });

    currentFocusTabId = null;
    currentFocusDomain = null;
    currentFocusWindowId = null;
  }

  // chrome.tabs.onActivated — primary focus source
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      const domain = tab.url ? extractDomain(tab.url) : null;
      // End previous focus if any
      if (currentFocusTabId && currentFocusTabId !== activeInfo.tabId) {
        await recordFocusEnd('tab_switched');
      }
      await recordFocusStart(activeInfo.tabId, activeInfo.windowId, domain, 'tabs.onActivated');
    } catch {
      // Tab may have been closed already
      if (currentFocusTabId) await recordFocusEnd('tab_error');
    }
  });

  // chrome.windows.onFocusChanged — window-level focus
  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      // Browser lost focus entirely
      await recordFocusEnd('window_blur');
    } else {
      // Browser regained focus — query active tab in this window
      try {
        const tabs = await chrome.tabs.query({ active: true, windowId });
        const tab = tabs && tabs[0];
        if (tab?.id) {
          const domain = tab.url ? extractDomain(tab.url) : null;
          if (currentFocusTabId !== tab.id) {
            if (currentFocusTabId) await recordFocusEnd('window_focus_switch');
            await recordFocusStart(tab.id, windowId, domain, 'windows.onFocusChanged');
          }
        }
      } catch {
        // Ignore errors
      }
    }
  });

  // chrome.tabs.onUpdated — domain change on current tab
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (tabId === currentFocusTabId && tab.url && changeInfo.url) {
      const newDomain = extractDomain(tab.url);
      if (newDomain !== currentFocusDomain) {
        // Domain changed on focused tab — end old, start new
        await recordFocusEnd('domain_changed');
        await recordFocusStart(tabId, currentFocusWindowId, newDomain, 'tabs.onUpdated');
      }
    }
  });

  // chrome.tabs.onRemoved — focused tab closed
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    if (tabId === currentFocusTabId) {
      await recordFocusEnd('tab_closed');
    }
  });
}

/**
 * Aggregate focus ledger by domain.
 * Returns { domain: totalFocusSeconds, ... }
 * Only counts FOCUS_START → FOCUS_END pairs.
 *
 * @param {Array} ledger - focus ledger entries
 * @returns {Object<string, number>}
 */
export function aggregateFocusLedger(ledger) {
  const byDomain = {};
  let openStart = null;

  for (const entry of ledger) {
    if (entry.type === 'FOCUS_START' && entry.domain) {
      openStart = entry;
    } else if (entry.type === 'FOCUS_END' && openStart) {
      const dur = Math.floor((entry.time - openStart.time) / 1000);
      if (dur > 0) {
        const domain = openStart.domain;
        byDomain[domain] = (byDomain[domain] || 0) + dur;
      }
      openStart = null;
    } else if (entry.type === 'FOCUS_START' && !entry.domain) {
      // Focus on non-web page (chrome://, etc.) — close any open start
      openStart = null;
    }
  }

  return byDomain;
}

/**
 * Aggregate activeSeconds from event_log_v1 by domain.
 * Independent from focus ledger — reads business event log directly.
 *
 * @param {Array} events - event_log_v1 entries
 * @returns {Object<string, number>}
 */
export function aggregateActiveSeconds(events) {
  const byDomain = {};
  let openStart = null;

  for (const evt of events) {
    if (evt.type === 'START' && evt.state === 'ACTIVE' && evt.domain) {
      openStart = evt;
    } else if (evt.type === 'END' && openStart) {
      const dur = Math.floor((evt.time - openStart.time) / 1000);
      if (dur > 0) {
        const domain = openStart.domain;
        byDomain[domain] = (byDomain[domain] || 0) + dur;
      }
      openStart = null;
    } else if (evt.type === 'START' && evt.state !== 'ACTIVE') {
      openStart = null;
    }
  }

  return byDomain;
}

/**
 * Export full calibration report.
 * Compares Focus Ledger vs activeSeconds for all domains.
 * Read-only — does not modify any storage.
 *
 * @param {Array} ledger - focus ledger entries
 * @param {Array} events - event_log_v1 entries
 * @param {Object} session - session_v1 snapshot
 * @param {number} thresholdSeconds - PASS/FAIL threshold (default 10)
 * @param {number} since - only include entries with time >= since (ms epoch, optional)
 * @param {string} targetDomain - expected domain to validate against
 * @param {number} expectedSeconds - expected duration for targetDomain (e.g. 60)
 * @returns {Object}
 */
export function exportCalibrationReport(ledger, events, session, thresholdSeconds = 10, since = 0, targetDomain = null, expectedSeconds = 0) {
  // Filter by time if since is provided
  const filteredLedger = since > 0 ? ledger.filter(e => e.time >= since) : ledger;
  const filteredEvents = since > 0 ? events.filter(e => e.time >= since) : events;

  const focusByDomain = aggregateFocusLedger(filteredLedger);
  const activeByDomain = aggregateActiveSeconds(filteredEvents);

  // Collect all domains from both sources
  const allDomains = new Set([...Object.keys(focusByDomain), ...Object.keys(activeByDomain)]);

  const deltaByDomain = {};
  let totalFocus = 0;
  let totalActive = 0;

  for (const domain of allDomains) {
    const focusSec = focusByDomain[domain] || 0;
    const activeSec = activeByDomain[domain] || 0;
    const delta = focusSec - activeSec;
    deltaByDomain[domain] = delta;
    totalFocus += focusSec;
    totalActive += activeSec;
  }

  const totalDelta = totalFocus - totalActive;

  // Target domain specific values
  const targetFocusSeconds = targetDomain ? (focusByDomain[targetDomain] || 0) : 0;
  const targetActiveSeconds = targetDomain ? (activeByDomain[targetDomain] || 0) : 0;
  const targetDelta = targetFocusSeconds - targetActiveSeconds;

  // Verdict classification
  let verdict = 'UNKNOWN';
  let pass = false;

  if (targetDomain && expectedSeconds > 0) {
    const focusInRange = targetFocusSeconds >= (expectedSeconds - thresholdSeconds) && targetFocusSeconds <= (expectedSeconds + thresholdSeconds);
    const activeInRange = targetActiveSeconds >= (expectedSeconds - thresholdSeconds) && targetActiveSeconds <= (expectedSeconds + thresholdSeconds);
    const deltaOk = Math.abs(targetDelta) <= thresholdSeconds;

    if (targetFocusSeconds === 0 && targetActiveSeconds === 0 && totalFocusSeconds === 0 && totalActiveSeconds === 0) {
      verdict = 'FAIL: no timing captured';
    } else if (targetFocusSeconds === 0 && targetActiveSeconds === 0 && (totalFocusSeconds > 0 || totalActiveSeconds > 0)) {
      verdict = 'FAIL: wrong domain';
    } else if (focusInRange && targetActiveSeconds === 0) {
      verdict = 'FAIL: focus captured but active missing';
    } else if (activeInRange && targetFocusSeconds === 0) {
      verdict = 'FAIL: active captured but focus missing';
    } else if (targetFocusSeconds > 0 && targetActiveSeconds > 0 && !deltaOk) {
      verdict = 'FAIL: both captured but mismatch';
    } else if (focusInRange && activeInRange && deltaOk) {
      verdict = 'PASS';
      pass = true;
    } else {
      verdict = 'FAIL: both captured but mismatch';
    }
  } else {
    // Legacy mode: no target domain specified, use simple delta check
    pass = Math.abs(totalDelta) <= thresholdSeconds;
    verdict = pass ? 'PASS' : 'FAIL: both captured but mismatch';
    if (totalFocus === 0 && totalActive === 0) {
      verdict = 'FAIL: no timing captured';
      pass = false;
    }
  }

  return {
    targetDomain: targetDomain || null,
    expectedSeconds,
    thresholdSeconds,
    focusLedgerByDomain: focusByDomain,
    activeSecondsByDomain: activeByDomain,
    deltaByDomain,
    targetFocusSeconds,
    targetActiveSeconds,
    totalFocusSeconds: totalFocus,
    totalActiveSeconds: totalActive,
    totalDelta,
    pass,
    verdict,
    sessionSnapshot: session,
    recentFocusLedger: ledger.slice(-20),
    recentEventLog: events.slice(-20),
    timestamp: Date.now(),
  };
}

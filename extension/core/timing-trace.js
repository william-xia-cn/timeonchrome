// core/timing-trace.js — structured timing trace collector (test/diagnostic only)
// Uses chrome.storage.local key __timingTrace for Playwright retrieval.
// Does NOT affect business logic; all emitTrace calls are fire-and-forget.
import { sanitizeIncognitoForPersistence } from './incognito-persistence.js';
import { budgetedLocalSet } from '../infra/storage-budget.js';

const sanitizePersistence = typeof sanitizeIncognitoForPersistence === 'function'
  ? sanitizeIncognitoForPersistence
  : (value) => value;
const traceStorageSet = (items) => typeof budgetedLocalSet === 'function'
  ? budgetedLocalSet(items, { priority: 'diagnostic', source: 'timing_trace' })
  : chrome.storage.local.set(items);

const TRACE_KEY = '__timingTrace';
const MAX_TRACE_ENTRIES = 1000;
let auditSequence = 0;

export function createTimingAuditId(prefix = 'audit') {
  auditSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${auditSequence.toString(36)}`;
}

export function inboundAuditFields(raw = {}) {
  return {
    auditId: raw.auditId || null,
    type: raw.type || null,
    _reason: raw._reason || null,
    source: raw.source || null,
    tabId: Number.isInteger(raw.tabId) ? raw.tabId : null,
    windowId: Number.isInteger(raw.windowId) ? raw.windowId : null,
    domain: typeof raw.domain === 'string' ? raw.domain : null,
    url: typeof raw.url === 'string' ? raw.url : null,
    mediaSourceTabId: Number.isInteger(raw.mediaSourceTabId) ? raw.mediaSourceTabId : null,
    mediaFrameId: Number.isInteger(raw.mediaFrameId) ? raw.mediaFrameId : null,
    isPiP: raw.isPiP === true ? true : (raw.isPiP === false ? false : null),
    idleState: typeof raw.idleState === 'string' ? raw.idleState : null,
    isFocused: raw.isFocused === true ? true : (raw.isFocused === false ? false : null),
    timestamp: Number.isFinite(raw.timestamp) ? raw.timestamp : null,
    incognito: raw.incognito === true,
    error: raw.error ? String(raw.error) : null,
  };
}

export async function emitTimingInbound(action, raw = {}, fields = {}) {
  const auditId = fields.auditId || raw.auditId || createTimingAuditId();
  const inbound = inboundAuditFields({ ...raw, auditId });
  await emitTrace(action, {
    source: fields.source || 'timing-inbound',
    reason: fields.reason || raw._reason || raw.reason || raw.type || null,
    tabId: inbound.tabId,
    windowId: inbound.windowId,
    url: inbound.url,
    domain: inbound.domain,
    payload: {
      ...inbound,
      ...(fields.payload || {}),
      auditId,
    },
  });
  return auditId;
}

/**
 * Emit a trace entry with normalized schema.
 *
 * Schema:
 *   ts:          number       — wall-clock timestamp (Date.now())
 *   source:      string       — module that emitted the trace (e.g. 'signal', 'context', 'state', 'session', 'event-log', 'stats')
 *   action:      string       — canonical action name (signal_received, snapshot_created, state_resolved, transition_begin, transition_end, event_appended, stats_calculated)
 *   reason:      string       — why this trace was emitted (e.g. 'tabActivated', 'tabUpdated', 'windowFocusChanged', 'idleStateChanged', 'mediaState', 'tabClosed', 'startup', 'test_action')
 *   tabId:       number|null  — Chrome tab ID if available
 *   windowId:    number|null  — Chrome window ID if available
 *   url:         string|null  — full URL if available
 *   domain:      string|null  — extracted domain if available
 *   previousState: string|null — state before this action
 *   nextState:   string|null  — state after this action
 *   sessionBefore: Object|null — session snapshot before transition
 *   sessionAfter:  Object|null — session snapshot after transition
 *   event:       Object|null  — event-log entry if applicable
 *   statsBefore: Object|null  — stats snapshot before calculation
 *   statsAfter:  Object|null  — stats snapshot after calculation
 *   payload:     Object       — free-form additional data
 *
 * @param {string} action - canonical action name
 * @param {Object} fields - partial schema fields to merge
 */
export async function emitTrace(action, fields = {}) {
  try {
    const result = await chrome.storage.local.get(TRACE_KEY);
    const trace = result[TRACE_KEY] || [];
    const entry = {
      ts: Date.now(),
      source: fields.source || 'unknown',
      action,
      reason: fields.reason || null,
      tabId: fields.tabId ?? null,
      windowId: fields.windowId ?? null,
      url: fields.url ?? null,
      domain: fields.domain ?? null,
      previousState: fields.previousState ?? null,
      nextState: fields.nextState ?? null,
      sessionBefore: fields.sessionBefore ?? null,
      sessionAfter: fields.sessionAfter ?? null,
      event: fields.event ?? null,
      statsBefore: fields.statsBefore ?? null,
      statsAfter: fields.statsAfter ?? null,
      payload: fields.payload ?? {},
    };
    trace.push(sanitizePersistence(entry, fields));
    if (trace.length > MAX_TRACE_ENTRIES) {
      trace.splice(0, trace.length - MAX_TRACE_ENTRIES);
    }
    await traceStorageSet({ [TRACE_KEY]: trace });
  } catch {
    // storage unavailable — silently skip (non-blocking, test-only)
  }
}

/**
 * Read all trace entries.
 * @returns {Promise<Array>}
 */
export async function getTrace() {
  try {
    const result = await chrome.storage.local.get(TRACE_KEY);
    return result[TRACE_KEY] || [];
  } catch {
    return [];
  }
}

/**
 * Clear trace log (test-only).
 */
export async function clearTrace() {
  try {
    await traceStorageSet({ [TRACE_KEY]: [] });
  } catch {
    // ignore
  }
}

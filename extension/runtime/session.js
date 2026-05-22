// runtime/session.js — 当前会话快照（单一真相源）+ 状态切换 + 周期 checkpoint

import { appendEvent, EVENT_TYPE } from '../core/event-log.js';
import { emitTrace } from '../core/timing-trace.js';
import { getReliableCloseTime } from './time-boundary.js';
import { isCountedState, settleUsageDuration } from '../core/usage-segments.js';
import { logClientEventBestEffort } from '../infra/client-logs.js';
import * as managedTargets from '../core/managed-targets.js';

const SESSION_KEY = 'session_v1';
const PERSISTENT_SESSION_KEY = 'session_v1_persistent';
const GUARDIAN_SESSION_KEY = 'guardian_session';
const GUARDIAN_CONFIG_KEY = 'guardian_config';
const CLOUD_PROFILE_ID_KEY = 'cloud_profile_id';
const CLOUD_DEVICE_ID_KEY = 'cloud_device_id';
const CLOUD_DEVICE_TOKEN_KEY = 'cloud_device_token';
const SITE_CLASSIFICATION_REQUESTS_KEY = 'site_classification_requests_v1';
const UI_FLUSH_GUARD_KEY = 'ui_flush_guard_v1';
const UI_FLUSH_MIN_INTERVAL_MS = 30 * 1000;
const PERIODIC_CHECKPOINT_MIN_INTERVAL_MS = 3 * 60 * 1000;
const FOREGROUND_CHECKPOINT_MS = 180 * 1000;
const FOREGROUND_CHECKPOINT_REPAIR_MS = Math.floor(FOREGROUND_CHECKPOINT_MS / 2);
const FOREGROUND_UNKNOWN_DOMAIN = '__unknown__';
const FOREGROUND_DIAGNOSTICS_KEY = 'foreground_page_diagnostics_v1';
const FOREGROUND_DIAGNOSTIC_ASSIGN_KEYS = new Set([
  'lastDropAt',
  'lastCheckpointAt',
  'lastCheckpointFailureAt',
]);
let commitQueue = Promise.resolve();

// 缓存的模式上下文 — 在 segment 打开时读取，避免在 segment 关闭后读取到已切换的模式。
// 由 transitionState 在每次打开新 segment 时更新。
let cachedEffectiveMode = 'unknown';

function runSerialized(task) {
  commitQueue = commitQueue.then(task, task);
  return commitQueue;
}

async function recordForegroundDiagnostic(updates = {}) {
  try {
    const data = await chrome.storage.local.get(FOREGROUND_DIAGNOSTICS_KEY);
    const current = data?.[FOREGROUND_DIAGNOSTICS_KEY] || {};
    const next = { ...current };
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'number' && !FOREGROUND_DIAGNOSTIC_ASSIGN_KEYS.has(key)) {
        next[key] = Number(next[key] || 0) + value;
      } else {
        next[key] = value;
      }
    }
    await chrome.storage.local.set({ [FOREGROUND_DIAGNOSTICS_KEY]: next });
  } catch (_) {
    // diagnostics must never block timing
  }
}

function isForegroundPageSession(session) {
  return session?.state === 'ACTIVE';
}

function getBoundedForegroundClose(session, observedAt = Date.now()) {
  const start = Number(session?.startTime || 0);
  if (!start) return { closeTime: observedAt, capped: false };
  const observed = Number.isFinite(observedAt) ? observedAt : Date.now();
  const cap = start + FOREGROUND_CHECKPOINT_MS;
  return {
    closeTime: Math.max(start, Math.min(observed, cap)),
    capped: observed > cap,
  };
}

function boundedForegroundCloseTime(session, observedAt = Date.now()) {
  return getBoundedForegroundClose(session, observedAt).closeTime;
}

function checkpointEstimatedCloseTime(session, observedAt = Date.now()) {
  const start = Number(session?.startTime || 0);
  const observed = Number.isFinite(observedAt) ? observedAt : Date.now();
  if (!Number.isFinite(start) || start <= 0) return observed;
  const elapsed = Math.max(0, observed - start);
  return start + Math.min(elapsed, FOREGROUND_CHECKPOINT_REPAIR_MS);
}

function checkpointEstimatedOpenTime(observedAt = Date.now()) {
  const observed = Number.isFinite(observedAt) ? observedAt : Date.now();
  return Math.max(0, observed - FOREGROUND_CHECKPOINT_REPAIR_MS);
}

function isForegroundSettlementReasonAllowed(reason) {
  return reason === 'periodic_checkpoint' ||
    reason === 'checkpoint_estimated_close' ||
    reason === 'transition_complete' ||
    reason === 'idle_inactive_close' ||
    reason === 'mode_effective_boundary' ||
    reason === 'tab_close' ||
    reason === 'popup_open' ||
    reason === 'monitoring_off' ||
    reason === 'event_close_without_open' ||
    reason === 'event_close_domain_mismatch_close' ||
    reason === 'event_close_domain_mismatch_observed' ||
    reason === 'recovery_estimated_close' ||
    reason === 'recovery_gap_close' ||
    reason === 'recovery_persistent_close';
}

function isDropLikeReason(reason) {
  const value = String(reason || '');
  return value.includes('drop') ||
    value.includes('stale') ||
    value.includes('recovery') ||
    value.includes('tab_close') ||
    value.includes('monitoring_off') ||
    value.includes('checkpoint_confirmation_failed') ||
    value.includes('idle_not_active') ||
    value.includes('observed_mismatch') ||
    value.includes('observed_query_failed') ||
    value.includes('candidate_mismatch') ||
    value.includes('candidate_query_failed') ||
    value.includes('idle_query_failed') ||
    value.includes('special_page');
}

function shouldCountForegroundTransitionEnd(reason) {
  if (isDropLikeReason(reason)) return false;
  return true;
}

function markForegroundEndUncounted(event, reason) {
  return {
    ...event,
    countable: false,
    reason: 'foreground_unconfirmed_drop',
    dropReason: reason || 'foreground_unconfirmed_drop',
  };
}

/**
 * @typedef {Object} SessionState
 * @property {string|null} state
 * @property {string|null} domain
 * @property {number|null} startTime
 * @property {number} lastHeartbeat
 * @property {number|null} [tabId]
 * @property {number|null} [windowId]
 * @property {string|null} [domainResolutionReason]
 * @property {string|null} [domainResolutionError]
 */

/**
 * 获取当前会话快照
 * @returns {Promise<SessionState|null>}
 */
export async function getSession() {
  return (await getSessionWithPersistenceSource()).session;
}

export async function getSessionWithPersistenceSource() {
  const data = await chrome.storage.session.get(SESSION_KEY);
  if (data[SESSION_KEY]) return { session: data[SESSION_KEY], source: 'session' };

  const persistent = await chrome.storage.local.get(PERSISTENT_SESSION_KEY);
  return {
    session: persistent[PERSISTENT_SESSION_KEY] || null,
    source: persistent[PERSISTENT_SESSION_KEY] ? 'persistent' : 'none',
  };
}

/**
 * 保存当前会话快照
 * @param {SessionState} session
 */
export async function saveSession(session) {
  await chrome.storage.session.set({ [SESSION_KEY]: session });
  await chrome.storage.local.set({ [PERSISTENT_SESSION_KEY]: session });
}

/**
 * 初始化 session（首次）
 * @returns {Promise<SessionState>}
 */
export async function initSession() {
  const existing = await getSession();
  if (existing) return existing;

  const initial = {
    state: null,
    domain: null,
    startTime: null,
    lastHeartbeat: Date.now(),
  };
  await saveSession(initial);
  return initial;
}

/**
 * 状态切换（统一入口，所有 state 变化必须走这里）
 * @param {string|null} newState
 * @param {string|null} newDomain
 */
export async function transitionState(newState, newDomain, metadata = {}) {
  return transitionStateAt(newState, newDomain, Date.now(), 'transition', metadata);
}

function sessionMetadataFromOptions(options = {}) {
  return {
    tabId: Number.isInteger(options.tabId) ? options.tabId : null,
    windowId: Number.isInteger(options.windowId) ? options.windowId : null,
    domainResolutionReason: options.domainResolutionReason || null,
    domainResolutionError: options.domainResolutionError || null,
  };
}

const MANAGED_TARGET_SESSION_FIELDS = [
  'managedTargetId',
  'managedTargetType',
  'managedTargetNamespace',
  'managedTargetValue',
  'managedTargetLabelAtTime',
  'targetSourceAtTime',
  'targetRuleId',
  'targetMatchLevel',
  'targetClassificationAtTime',
  'quotaBucketAtTime',
];

function hasManagedTargetSnapshot(value = {}) {
  return MANAGED_TARGET_SESSION_FIELDS.some((key) => typeof value?.[key] === 'string' && value[key].trim());
}

function managedTargetFieldsFrom(value = {}, mode = null) {
  const out = {};
  for (const key of MANAGED_TARGET_SESSION_FIELDS) {
    const field = value?.[key];
    out[key] = typeof field === 'string' && field.trim() ? field.trim() : null;
  }
  const quotaBucketForModeFn = typeof managedTargets !== 'undefined' && typeof managedTargets.quotaBucketForMode === 'function'
    ? managedTargets.quotaBucketForMode
    : ((inputMode) => {
        const normalized = typeof inputMode === 'string' && inputMode.trim() ? inputMode.trim() : 'unknown';
        return ['study', 'composite', 'rest', 'locked'].includes(normalized) ? normalized : 'unknown';
      });
  out.quotaBucketAtTime = quotaBucketForModeFn(mode || out.quotaBucketAtTime || cachedEffectiveMode);
  return out;
}

async function readManagedTargetInputs() {
  try {
    const data = await chrome.storage.local.get([GUARDIAN_CONFIG_KEY, SITE_CLASSIFICATION_REQUESTS_KEY]);
    return {
      config: data?.[GUARDIAN_CONFIG_KEY] || {},
      requests: Array.isArray(data?.[SITE_CLASSIFICATION_REQUESTS_KEY])
        ? data[SITE_CLASSIFICATION_REQUESTS_KEY]
        : [],
    };
  } catch (_) {
    return { config: {}, requests: [] };
  }
}

async function resolveManagedTargetForOpen(domain, options = {}, mode = null) {
  if (hasManagedTargetSnapshot(options)) {
    return managedTargetFieldsFrom(options, mode);
  }
  const source = options.url || options.observedUrl || options.eventUrl || domain || '';
  const { config, requests } = await readManagedTargetInputs();
  const resolveAttribution = typeof managedTargets !== 'undefined' && typeof managedTargets.resolveManagedTargetAttribution === 'function'
    ? managedTargets.resolveManagedTargetAttribution
    : null;
  const fallbackAttribution = typeof managedTargets !== 'undefined' && typeof managedTargets.fallbackDomainAttribution === 'function'
    ? managedTargets.fallbackDomainAttribution
    : ((value) => ({ domain: value || null, fallback: true }));
  const snapshotFields = typeof managedTargets !== 'undefined' && typeof managedTargets.managedTargetSnapshotFields === 'function'
    ? managedTargets.managedTargetSnapshotFields
    : ((attribution, inputMode) => managedTargetFieldsFrom({ targetMatchLevel: attribution?.fallback ? 'domain_fallback' : null }, inputMode));
  const attribution = source && resolveAttribution
    ? resolveAttribution(config, requests, source)
    : fallbackAttribution(domain || '');
  return snapshotFields(attribution, mode);
}

async function managedTargetFieldsForReopen(session = {}, domain = null, options = {}, mode = null) {
  if (hasManagedTargetSnapshot(session) && (!domain || !session.domain || domain === session.domain)) {
    return managedTargetFieldsFrom(session, mode);
  }
  return resolveManagedTargetForOpen(domain || session.domain || null, options, mode);
}

function sampleStateFromConfirmation(confirmation) {
  if (!confirmation?.ok) return null;
  return confirmation?.observedState || confirmation?.candidateState || 'ACTIVE';
}

function sampleDomainFromConfirmation(confirmation) {
  if (!confirmation?.ok) return null;
  return confirmation?.observedDomain || confirmation?.candidateDomain || confirmation?.domain || null;
}

function sampleTabIdFromConfirmation(confirmation) {
  const value = Number(confirmation?.tabId ?? confirmation?.observedTabId ?? confirmation?.candidateTabId);
  return Number.isInteger(value) ? value : null;
}

function sampleWindowIdFromConfirmation(confirmation) {
  const value = Number(confirmation?.windowId ?? confirmation?.observedWindowId ?? confirmation?.candidateWindowId);
  return Number.isInteger(value) ? value : null;
}

function observedDomainFromConfirmation(confirmation) {
  return confirmation?.observedDomain || confirmation?.candidateDomain || confirmation?.domain || null;
}

function isCheckpointActiveSample(confirmation) {
  return !!(confirmation?.ok && sampleStateFromConfirmation(confirmation) === 'ACTIVE' && sampleDomainFromConfirmation(confirmation));
}

function mismatchCheckpointActiveSample(confirmation) {
  const domain = confirmation?.observedDomain || confirmation?.candidateDomain || confirmation?.domain || null;
  if (!domain) return null;
  return {
    state: confirmation?.observedState || confirmation?.candidateState || 'ACTIVE',
    domain,
    tabId: sampleTabIdFromConfirmation(confirmation),
    windowId: sampleWindowIdFromConfirmation(confirmation),
    url: confirmation?.observedUrl || confirmation?.candidateUrl || confirmation?.url || null,
  };
}

function emptySession(now = Date.now()) {
  return {
    state: null,
    domain: null,
    startTime: null,
    lastHeartbeat: now,
  };
}

function settlementResolverOptions(options = {}) {
  return {
    resolveUnknownDomainForSettlement: options.resolveUnknownDomainForSettlement,
    url: options.url || null,
    observedUrl: options.observedUrl || null,
    eventUrl: options.eventUrl || null,
    endReason: options.endReason,
    endOperationSource: options.endOperationSource,
    endAtMs: options.endAtMs,
  };
}

function operationSourceForReason(reason) {
  const value = String(reason || '');
  if (value === 'tabActivated' ||
    value === 'tabUpdated' ||
    value === 'windowFocusChanged' ||
    value === 'windowFocusLost' ||
    value === 'tabClosedSuccessor' ||
    value === 'tabClosedNoActiveTab' ||
    value === 'idleStateChanged' ||
    value === 'idle_active_reopen' ||
    value === 'idle_inactive_close') return 'chrome_event';
  if (value === 'periodic_checkpoint' ||
    value === 'periodic_checkpoint_reopen' ||
    value === 'checkpoint_estimated_close' ||
    value === 'checkpoint_estimated_open' ||
    value === 'checkpoint_estimated_half_interval_close' ||
    value === 'session_expired' ||
    value.includes('heartbeat')) return 'timer';
  if (value === 'ui_flush' || value === 'ui_flush_reopen' || value === 'popup_open' || value === 'popup_open_reopen') return 'ui_action';
  if (value === 'recovery_gap_close' ||
    value === 'recovery_persistent_close' ||
    value === 'recovery_estimated_close' ||
    value === 'recovery_estimated_half_checkpoint') return 'recovery';
  if (value === 'mode_effective_boundary' || value === 'mode_effective_boundary_reopen' || value.includes('mode_effective')) return 'mode_boundary';
  if (value === 'controlledTimingSignal' || value.startsWith('debug_')) return 'debug';
  if (value === 'tab_close' || value === 'monitoring_off') return 'chrome_event';
  return 'unknown';
}

function isMediaOnlyTimingReason(reason) {
  const value = String(reason || '');
  return value === 'tabAudible' || value === 'mediaState';
}

function isDisabledTimingReason(reason) {
  return String(reason || '') === 'windowFocusPolled';
}

function isCoalescibleForegroundOpenReason(reason) {
  const value = String(reason || '');
  return value === 'tabActivated' ||
    value === 'tabUpdated' ||
    value === 'webNavigationCommitted' ||
    value === 'tabReplaced' ||
    value === 'windowFocusChanged' ||
    value === 'tabClosedSuccessor' ||
    value === 'idle_active_reopen';
}

function numericIdentity(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function sameKnownIdentity(aValue, bValue) {
  const a = numericIdentity(aValue);
  const b = numericIdentity(bValue);
  if (a == null || b == null) return true;
  return a === b;
}

function isDuplicateForegroundOpen(session, newState, newDomain, reason, options = {}) {
  return isForegroundPageSession(session) &&
    newState === 'ACTIVE' &&
    session.state === newState &&
    session.domain === newDomain &&
    isCoalescibleForegroundOpenReason(reason) &&
    sameKnownIdentity(session.tabId, options.tabId) &&
    sameKnownIdentity(session.windowId, options.windowId);
}

function normalizeOperationReason(reason) {
  const value = typeof reason === 'string' && reason.trim() ? reason.trim() : null;
  return value;
}

function makeDescriptionEndpoint(reason, atMs, source = null) {
  const normalized = normalizeOperationReason(reason);
  const when = Number(atMs);
  return {
    reason: normalized,
    operation: normalized,
    source: source || operationSourceForReason(normalized),
    atMs: Number.isFinite(when) && when > 0 ? when : null,
  };
}

function makeSettlementDescription(session, endReason, endAtMs, endSource = null) {
  const rawStartReason = session?.startReason || 'unknown_start';
  const startReason = isMediaOnlyTimingReason(rawStartReason) ? 'unknown_start' : rawStartReason;
  const normalizedEndReason = isMediaOnlyTimingReason(endReason) ? 'unknown_end' : endReason;
  const startAtMs = Number(session?.startAtMs || session?.startTime);
  const start = makeDescriptionEndpoint(
    startReason,
    startAtMs,
    isMediaOnlyTimingReason(rawStartReason)
      ? 'unknown'
      : (session?.startOperationSource || operationSourceForReason(startReason))
  );
  const end = makeDescriptionEndpoint(
    normalizedEndReason,
    endAtMs,
    isMediaOnlyTimingReason(endReason) ? 'unknown' : endSource
  );
  return {
    schemaVersion: 1,
    start,
    end,
    summary: `开始：${start.operation || start.reason || '—'}；结束：${end.operation || end.reason || '—'}`,
  };
}

async function resolveUnknownSessionForSettlement(timingSession, reason, options = {}) {
  if (
    timingSession?.state !== 'ACTIVE' ||
    timingSession?.domain !== FOREGROUND_UNKNOWN_DOMAIN ||
    typeof options.resolveUnknownDomainForSettlement !== 'function'
  ) {
    return timingSession;
  }

  let result = null;
  try {
    result = await options.resolveUnknownDomainForSettlement(timingSession, reason);
  } catch (err) {
    result = { ok: false, reason: 'resolver_exception', error: err?.message || String(err) };
  }

  if (result?.ok && typeof result.domain === 'string' && result.domain.trim()) {
    const recovered = {
      ...timingSession,
      domain: result.domain.trim(),
      domainResolutionReason: result.reason || 'unknown_recovered_at_settlement',
      domainResolutionError: null,
    };
    await emitTrace('unknown_recovered_at_settlement', {
      source: 'runtime-session',
      reason,
      domain: recovered.domain,
      previousState: timingSession.state,
      payload: {
        originalDomain: timingSession.domain,
        recoveredDomain: recovered.domain,
        tabId: timingSession.tabId ?? null,
        windowId: timingSession.windowId ?? null,
        resolutionReason: result.reason || 'unknown_recovered_at_settlement',
      },
    });
    await recordForegroundDiagnostic({
      unknownRecoveredAtSettlement: 1,
      lastUnknownRecoveryAt: Date.now(),
      lastUnknownRecoveryDomain: recovered.domain,
      lastUnknownRecoveryReason: result.reason || 'unknown_recovered_at_settlement',
    });
    return recovered;
  }

  await emitTrace('unknown_settlement_unresolved', {
    source: 'runtime-session',
    reason,
    domain: timingSession.domain,
    previousState: timingSession.state,
    payload: {
      tabId: timingSession.tabId ?? null,
      windowId: timingSession.windowId ?? null,
      resolutionReason: result?.reason || 'unknown_resolution_failed',
      resolutionError: result?.error || null,
    },
  });
  await recordForegroundDiagnostic({
    unknownSettlementUnresolved: 1,
    lastUnknownSettlementFailureAt: Date.now(),
    lastUnknownSettlementFailureReason: result?.reason || 'unknown_resolution_failed',
    lastUnknownSettlementFailureError: result?.error || null,
  });
  return timingSession;
}

export async function transitionStateAt(newState, newDomain, timestamp = Date.now(), reason = 'transition', options = {}) {
  return runSerialized(async () => {
    const session = await getSession();
    if (!session) return;

    const now = Number.isFinite(timestamp) ? timestamp : Date.now();
    if (isDisabledTimingReason(reason)) {
      await emitTrace('transition_skipped', {
        source: 'runtime-session',
        reason,
        domain: newDomain || session.domain || null,
        previousState: session.state || null,
        nextState: newState || null,
        payload: { skippedReason: 'disabled_timing_reason' },
      });
      return { ok: true, skipped: true, reason: 'disabled_timing_reason' };
    }
    if (isMediaOnlyTimingReason(reason)) {
      await emitTrace('transition_skipped', {
        source: 'runtime-session',
        reason,
        domain: newDomain || session.domain || null,
        previousState: session.state || null,
        nextState: newState || null,
        payload: { skippedReason: 'media_signal_not_foreground_boundary' },
      });
      return { ok: true, skipped: true, reason: 'media_signal_not_foreground_boundary' };
    }

    const sessionBefore = { state: session.state, domain: session.domain, startTime: session.startTime };
    const hasOpenSession = !!(session.state && session.startTime);

    if (hasOpenSession && newState && isDuplicateForegroundOpen(session, newState, newDomain, reason, options)) {
      await emitTrace('transition_skipped', {
        source: 'runtime-session',
        reason,
        domain: newDomain || session.domain || null,
        previousState: session.state || null,
        nextState: newState || null,
        payload: {
          skippedReason: 'duplicate_foreground_open',
          tabId: options.tabId ?? session.tabId ?? null,
          windowId: options.windowId ?? session.windowId ?? null,
        },
      });
      return { ok: true, skipped: true, reason: 'duplicate_foreground_open' };
    }

    if (!hasOpenSession && !newState) {
      const diagnostic = await settleBoundaryDiagnosticSegment({
        domain: observedCloseDomain(options) || newDomain || null,
        state: options.observedState || 'ACTIVE',
        atMs: now,
        settlementReason: 'event_close_without_open',
        startReason: 'event_close_without_open',
        endReason: reason || 'event_close_without_open',
        operationSource: operationSourceForReason(reason),
        tabId: Number.isInteger(options.tabId) ? options.tabId : null,
        windowId: Number.isInteger(options.windowId) ? options.windowId : null,
      });
      await emitTrace('event_boundary_diagnostic_segment', {
        source: 'runtime-session',
        reason: 'event_close_without_open',
        domain: diagnostic.domain,
        payload: { appended: diagnostic.appended, originalReason: reason },
      });
      await saveSession(emptySession(now));
      return { ok: true, closed: false, diagnostic: true, reason: 'event_close_without_open' };
    }

    // 1. 关闭旧事件
    if (hasOpenSession) {
      const foreground = isForegroundPageSession(session);
      const boundary = foreground
        ? { ...getBoundedForegroundClose(session, now), stale: false }
        : getReliableCloseTime(session, now);
      const { closeTime, stale } = boundary;
      const closeObservedDomain = !newState ? observedCloseDomain(options) : null;
      const closeDomainMismatch = !!(closeObservedDomain && session.domain && closeObservedDomain !== session.domain);
      const baseEndEvent = {
        type: EVENT_TYPE.END,
        state: session.state,
        domain: session.domain,
        time: closeTime,
      };
      const countForegroundEnd = !foreground || shouldCountForegroundTransitionEnd(reason);
      const endEvent = countForegroundEnd
        ? baseEndEvent
        : markForegroundEndUncounted(baseEndEvent, reason);
      await appendEvent(endEvent);
      await emitTrace('event_appended', {
        source: 'event-log',
        reason: stale ? 'transitionStaleClose' : 'transitionClose',
        domain: session.domain,
        previousState: session.state,
        event: endEvent,
        sessionBefore,
      });

      if (foreground && !countForegroundEnd) {
        const droppedMs = Math.max(0, closeTime - session.startTime);
        await recordForegroundDiagnostic({
          droppedUnconfirmedSeconds: Math.floor(droppedMs / 1000),
          lastDropReason: reason,
          lastDropAt: Date.now(),
        });
      } else {
        if (foreground && boundary.capped) {
          await recordForegroundDiagnostic({
            foregroundTailCapped: 1,
            cappedForegroundSeconds: Math.floor(Math.max(0, closeTime - session.startTime) / 1000),
            lastCapReason: reason,
            lastDropReason: 'foreground_tail_capped',
            lastDropAt: Date.now(),
          });
        }
        // 稳定事件边界是普通 foreground_page 的基础落账入口；checkpoint 只负责长段切片。
        const settlementReason = reason === 'idle_inactive_close'
          ? 'idle_inactive_close'
          : (closeDomainMismatch ? 'event_close_domain_mismatch_close' : (stale ? 'transition_stale_close' : 'transition_complete'));
        await settleCurrentSessionSegment(session, closeTime, settlementReason, {
          ...settlementResolverOptions(options),
          endReason: reason,
          endAtMs: closeTime,
          allowZeroDurationSegment: true,
        });
        if (closeDomainMismatch) {
          await settleBoundaryDiagnosticSegment({
            domain: closeObservedDomain,
            state: options.observedState || session.state,
            atMs: closeTime,
            settlementReason: 'event_close_domain_mismatch_observed',
            startReason: 'event_close_domain_mismatch_observed',
            endReason: reason,
            operationSource: operationSourceForReason(reason),
            tabId: Number.isInteger(options.tabId) ? options.tabId : null,
            windowId: Number.isInteger(options.windowId) ? options.windowId : null,
          });
        }
      }
    }

    // 2. 开启新事件
    if (newState) {
      const startEvent = {
        type: EVENT_TYPE.START,
        state: newState,
        domain: newDomain,
        time: now,
      };
      await appendEvent(startEvent);
      await emitTrace('event_appended', {
        source: 'event-log',
        reason: 'transitionOpen',
        domain: newDomain,
        nextState: newState,
        event: startEvent,
        sessionBefore,
      });
    }

    // 3. 缓存模式上下文 — 在 segment 打开时读取，确保 segment 模式反映打开时的模式，而不是关闭时的模式
    if (newState) {
      await refreshCachedMode();
    }

    // 4. 更新 session
    const managedTargetFields = newState
      ? await resolveManagedTargetForOpen(newDomain, options, cachedEffectiveMode)
      : {};
    const sessionAfter = {
      state: newState,
      domain: newDomain,
      startTime: newState ? now : null,
      lastHeartbeat: now,
      startReason: newState ? reason : null,
      startOperationSource: newState ? operationSourceForReason(reason) : null,
      startAtMs: newState ? now : null,
      ...sessionMetadataFromOptions(options),
      ...managedTargetFields,
    };
    await saveSession(sessionAfter);
  });
}

/**
 * Deprecated compatibility hook.
 * Timing facts now come from explicit boundaries and periodicCheckpoint confirmation.
 */
export async function heartbeat() {
  return { ok: true, skipped: true, reason: 'heartbeat_timing_deprecated' };
}

export async function runSessionCommit(task) {
  return runSerialized(task);
}

// ── Mode context cache ──────────────────────────────────────────────────────────

/**
 * 刷新缓存的模式上下文。
 * 在 segment 打开时调用，以便 segment 记录其打开时的模式，而不是关闭时的模式。
 */
async function refreshCachedMode() {
  try {
    const storage = await chrome.storage.local.get(GUARDIAN_SESSION_KEY);
    const gs = storage[GUARDIAN_SESSION_KEY];
    cachedEffectiveMode = gs?.currentMode || 'unknown';
  } catch (_) {
    cachedEffectiveMode = 'unknown';
  }
}

/**
 * 获取当前缓存的模式。segment 打开时会调用 refreshCachedMode，
 * 因此返回的模式是 segment 打开时的模式。
 */
export function getCachedEffectiveMode() {
  return cachedEffectiveMode;
}

export function setCachedEffectiveMode(mode) {
  cachedEffectiveMode = typeof mode === 'string' && mode.trim() ? mode.trim() : 'unknown';
  return cachedEffectiveMode;
}

export async function applyModeEffectiveBoundary(effectiveAtMs, reason = 'auto_mode_effective_boundary', options = {}) {
  return runSerialized(async () => {
    const session = await getSession();
    const boundary = Number(effectiveAtMs);
    if (!session?.state || !session?.startTime || !Number.isFinite(boundary)) {
      if (options.toMode) setCachedEffectiveMode(options.toMode);
      return { ok: true, applied: false, reason: 'no_open_session' };
    }

    const sessionBefore = {
      state: session.state,
      domain: session.domain,
      startTime: session.startTime,
      lastHeartbeat: session.lastHeartbeat,
      tabId: session.tabId ?? null,
      windowId: session.windowId ?? null,
    };

    if (boundary <= session.startTime) {
      if (options.toMode) {
        setCachedEffectiveMode(options.toMode);
      } else {
        await refreshCachedMode();
      }
      await saveSession({
        ...session,
        ...managedTargetFieldsFrom(session, cachedEffectiveMode),
      });
      await emitTrace('auto_mode_effective_boundary', {
        source: 'runtime-session',
        reason,
        domain: session.domain || null,
        previousState: session.state,
        nextState: session.state,
        payload: {
          applied: false,
          boundaryAt: boundary,
          sessionBefore,
          refreshedMode: cachedEffectiveMode || 'unknown',
        },
      });
      return { ok: true, applied: false, reason: 'boundary_before_session_start' };
    }

    const endEvent = {
      type: EVENT_TYPE.END,
      state: session.state,
      domain: session.domain,
      time: boundary,
    };
    await appendEvent(endEvent);
    await emitTrace('event_appended', {
      source: 'event-log',
      reason: 'modeEffectiveClose',
      domain: session.domain,
      previousState: session.state,
      event: endEvent,
      sessionBefore,
    });

    const settlement = isCountedState(session.state)
      ? await settleCurrentSessionSegment(session, boundary, 'mode_effective_boundary', {
          ...settlementResolverOptions(options),
          modeOverride: options.fromMode || null,
          endReason: 'mode_effective_boundary',
          endOperationSource: 'mode_boundary',
          endAtMs: boundary,
        })
      : { appended: 0, durationSeconds: 0 };

    if (options.toMode) {
      setCachedEffectiveMode(options.toMode);
    } else {
      await refreshCachedMode();
    }

    const startEvent = {
      type: EVENT_TYPE.START,
      state: session.state,
      domain: session.domain,
      time: boundary,
    };
    await appendEvent(startEvent);
    await emitTrace('event_appended', {
      source: 'event-log',
      reason: 'modeEffectiveReopen',
      domain: session.domain,
      nextState: session.state,
      event: startEvent,
      sessionBefore,
    });

    await saveSession({
      state: session.state,
      domain: session.domain,
      startTime: boundary,
      lastHeartbeat: Math.max(Number(session.lastHeartbeat) || boundary, boundary),
      startReason: 'mode_effective_boundary_reopen',
      startOperationSource: 'mode_boundary',
      startAtMs: boundary,
      tabId: session.tabId ?? null,
      windowId: session.windowId ?? null,
      domainResolutionReason: session.domainResolutionReason || null,
      domainResolutionError: session.domainResolutionError || null,
      ...(await managedTargetFieldsForReopen(session, session.domain, options, cachedEffectiveMode)),
    });

    await emitTrace('auto_mode_effective_boundary', {
      source: 'runtime-session',
      reason,
      domain: session.domain || null,
      previousState: session.state,
      nextState: session.state,
      payload: {
        applied: true,
        boundaryAt: boundary,
        sessionBefore,
        settlement,
        refreshedMode: cachedEffectiveMode || 'unknown',
      },
    });

    return {
      ok: true,
      applied: true,
      reason,
      boundaryAt: boundary,
      settledSeconds: settlement?.durationSeconds || 0,
      mode: cachedEffectiveMode || 'unknown',
    };
  });
}

function normalizeIdentityValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function pickIdentity(candidates) {
  for (const candidate of candidates) {
    const value = normalizeIdentityValue(candidate.value);
    if (value) return { value, source: candidate.source };
  }
  return { value: null, source: 'missing' };
}

export async function resolveSettlementIdentity(timingSession = null, reason = 'settlement') {
  let storage = {};
  try {
    storage = await chrome.storage.local.get([
      CLOUD_PROFILE_ID_KEY,
      CLOUD_DEVICE_ID_KEY,
      CLOUD_DEVICE_TOKEN_KEY,
      GUARDIAN_CONFIG_KEY,
      GUARDIAN_SESSION_KEY,
    ]);
  } catch (e) {
    console.warn('[Settlement] identity storage read failed; falling back to null identity', {
      reason,
      error: e?.message || String(e),
    });
    storage = {};
  }

  const config = storage[GUARDIAN_CONFIG_KEY] || {};
  const guardianSession = storage[GUARDIAN_SESSION_KEY] || {};
  const profile = pickIdentity([
    { value: storage[CLOUD_PROFILE_ID_KEY], source: CLOUD_PROFILE_ID_KEY },
    { value: config.profileId, source: `${GUARDIAN_CONFIG_KEY}.profileId` },
    { value: guardianSession.profileId, source: `${GUARDIAN_SESSION_KEY}.profileId` },
  ]);
  const device = pickIdentity([
    { value: storage[CLOUD_DEVICE_ID_KEY], source: CLOUD_DEVICE_ID_KEY },
    { value: config.deviceId, source: `${GUARDIAN_CONFIG_KEY}.deviceId` },
    { value: guardianSession.deviceId, source: `${GUARDIAN_SESSION_KEY}.deviceId` },
  ]);

  if (!profile.value || !device.value) {
    const hasDeviceToken = !!normalizeIdentityValue(storage[CLOUD_DEVICE_TOKEN_KEY]);
    const fallback = {
      reason,
      domain: timingSession?.domain || null,
      sourceState: timingSession?.state || null,
      hasProfileId: !!profile.value,
      hasDeviceId: !!device.value,
      hasDeviceToken,
      profileIdSource: profile.source,
      deviceIdSource: device.source,
    };
    console.warn('[Settlement] identity fallback to null because explicit profile/device identity is missing', fallback);
    try {
      await emitTrace('settlement_identity_fallback', {
        source: 'runtime-session',
        reason,
        domain: timingSession?.domain || null,
        payload: fallback,
      });
    } catch (_) {}
  }

  return {
    profileId: profile.value,
    deviceId: device.value,
    profileIdSource: profile.source,
    deviceIdSource: device.source,
  };
}

// ── Usage segment settlement ────────────────────────────────────────────────────

/**
 * 从已完成的时间段会话结算使用 segment。
 * 使用 segment 打开时缓存的模式（而不是关闭后可能已切换的模式）。
 *
 * 可从外部调用（例如 background.js 的 tab close / monitoring off）。
 *
 * @param {{startTime: number, state: string, domain: string}} timingSession - 时间段的 session
 * @param {number} closeTimeMs - 结束的 epoch 毫秒
 * @param {string} reason - settlement 原因
 */
export async function settleCurrentSessionSegment(timingSession, closeTimeMs, reason, options = {}) {
  try {
    const effectiveSession = await resolveUnknownSessionForSettlement(timingSession, reason, options);
    const startMs = timingSession.startTime;
    let endMs = closeTimeMs;
    if (!startMs || !endMs || endMs < startMs || (endMs === startMs && !options.allowZeroDurationSegment)) {
      return { appended: 0, durationSeconds: 0 };
    }

    let capped = false;
    if (effectiveSession.state === 'ACTIVE' && (endMs - startMs) > FOREGROUND_CHECKPOINT_MS) {
      endMs = startMs + FOREGROUND_CHECKPOINT_MS;
      capped = true;
    }

    const durationMs = endMs - startMs;
    const durationSeconds = Math.floor(durationMs / 1000);
    if (effectiveSession.state && !isCountedState(effectiveSession.state)) {
      return { appended: 0, durationSeconds: 0, skipped: 'non_counted_state' };
    }
    if (effectiveSession.state === 'ACTIVE') {
      if (!isForegroundSettlementReasonAllowed(reason)) {
        return { appended: 0, durationSeconds: 0, skipped: 'foreground_checkpoint_required' };
      }
      if (durationMs > FOREGROUND_CHECKPOINT_MS) {
        return { appended: 0, durationSeconds: 0, skipped: 'foreground_window_too_large' };
      }
    }

    // 使用 segment 打开时缓存的模式（而不是当前 guardian_session 中的模式）
    const mode = options.modeOverride || cachedEffectiveMode || 'unknown';
    const identity = await resolveSettlementIdentity(effectiveSession, reason);
    const managedTargetFields = hasManagedTargetSnapshot(effectiveSession)
      ? managedTargetFieldsFrom(effectiveSession, mode)
      : await resolveManagedTargetForOpen(effectiveSession.domain || null, options, mode);

    const appended = await settleUsageDuration({
      startMs,
      endMs,
      domain: effectiveSession.domain || null,
      tabId: Number.isInteger(effectiveSession.tabId) ? effectiveSession.tabId : null,
      windowId: Number.isInteger(effectiveSession.windowId) ? effectiveSession.windowId : null,
      ...managedTargetFields,
      sourceState: effectiveSession.state,
      settlementReason: reason,
      description: makeSettlementDescription(
        effectiveSession,
        options.endReason || reason,
        options.endAtMs || endMs,
        options.endOperationSource || null
      ),
      mode,
      profileId: identity.profileId,
      deviceId: identity.deviceId,
      allowZeroDurationSegment: !!options.allowZeroDurationSegment,
    });
    if (effectiveSession.state === 'ACTIVE' && capped) {
      await recordForegroundDiagnostic({
        foregroundTailCapped: 1,
        cappedForegroundSeconds: durationSeconds,
        lastCapReason: reason,
        lastDropReason: 'foreground_tail_capped',
        lastDropAt: Date.now(),
      });
    }
    return {
      appended,
      durationSeconds,
      domain: effectiveSession.domain || null,
      state: effectiveSession.state || null,
      mode,
      profileIdSource: identity.profileIdSource,
      deviceIdSource: identity.deviceIdSource,
    };
  } catch (e) {
    console.error('[Settlement] settleCurrentSessionSegment failed:', e?.message || e, { reason, domain: timingSession?.domain, sourceState: timingSession?.state });
    logClientEventBestEffort({
      level: 'error',
      category: 'timing',
      eventCode: 'settlement_failed',
      module: 'runtime/session',
      message: e?.message || 'Settlement failed',
      domain: timingSession?.domain || null,
      details: { reason, sourceState: timingSession?.state || null },
    });
    // 结算失败不破坏现有的管线；后续明确边界或 periodicCheckpoint 可再次推进。
    return { appended: 0, durationSeconds: 0, error: e?.message || String(e) };
  }
}

async function settleBoundaryDiagnosticSegment({
  domain,
  state = 'ACTIVE',
  atMs = Date.now(),
  settlementReason,
  startReason,
  endReason,
  operationSource,
  tabId = null,
  windowId = null,
}) {
  const boundaryAt = Number.isFinite(atMs) ? atMs : Date.now();
  const diagnosticDomain = typeof domain === 'string' && domain.trim()
    ? domain.trim()
    : 'unknown-page.chrome-local';
  const diagnosticState = isCountedState(state) ? state : 'ACTIVE';
  const timingSession = {
    state: diagnosticState,
    domain: diagnosticDomain,
    startTime: boundaryAt,
    lastHeartbeat: boundaryAt,
    startReason: startReason || settlementReason,
    startOperationSource: operationSource || operationSourceForReason(settlementReason),
    startAtMs: boundaryAt,
    tabId: Number.isInteger(tabId) ? tabId : null,
    windowId: Number.isInteger(windowId) ? windowId : null,
  };
  const identity = await resolveSettlementIdentity(timingSession, settlementReason);
  const managedTargetFields = await resolveManagedTargetForOpen(diagnosticDomain, {}, cachedEffectiveMode || 'unknown');
  const appended = await settleUsageDuration({
    startMs: boundaryAt,
    endMs: boundaryAt,
    domain: diagnosticDomain,
    tabId: Number.isInteger(tabId) ? tabId : null,
    windowId: Number.isInteger(windowId) ? windowId : null,
    ...managedTargetFields,
    sourceState: diagnosticState,
    settlementReason,
    description: makeSettlementDescription(
      timingSession,
      endReason || settlementReason,
      boundaryAt,
      operationSource || operationSourceForReason(settlementReason)
    ),
    mode: cachedEffectiveMode || 'unknown',
    profileId: identity.profileId,
    deviceId: identity.deviceId,
    allowZeroDurationSegment: true,
  });
  return { appended, durationSeconds: 0, domain: diagnosticDomain };
}

function observedCloseDomain(options = {}) {
  const domain = options.observedDomain || options.eventDomain || options.domain || null;
  return typeof domain === 'string' && domain.trim() ? domain.trim() : null;
}

export async function flushOpenSessionToStats(reason = 'ui_flush', options = {}) {
  const task = async () => {
    const session = await getSession();
    const now = Date.now();

    if (!session?.state || !session?.startTime) {
      return { ok: true, flushed: false, flushedSeconds: 0, reason: 'no_open_session' };
    }
    if (!isCountedState(session.state)) {
      return {
        ok: true,
        flushed: false,
        flushedSeconds: 0,
        domain: session.domain || null,
        state: session.state || null,
        reason: 'non_counted_state',
      };
    }
    if (isForegroundPageSession(session) && !options.allowForeground) {
      return {
        ok: true,
        flushed: false,
        flushedSeconds: 0,
        domain: session.domain || null,
        state: session.state || null,
        reason: 'foreground_checkpoint_required',
      };
    }

    // Guardrail: popup-driven ui_flush should not fragment segments when opened frequently.
    // Only skip when state/domain/mode are exactly the same and last flush is recent.
    if (reason === 'ui_flush') {
      const mode = cachedEffectiveMode || 'unknown';
      const sessionState = session.state || null;
      const sessionDomain = session.domain || null;
      let guard = null;
      try {
        const guardData = await chrome.storage.local.get(UI_FLUSH_GUARD_KEY);
        guard = guardData?.[UI_FLUSH_GUARD_KEY] || null;
      } catch (_) {
        guard = null;
      }

      const isSameContext = !!guard &&
        guard.state === sessionState &&
        guard.domain === sessionDomain &&
        guard.mode === mode;
      const lastFlushAt = Number(guard?.lastFlushAt) || 0;
      if (isSameContext && (now - lastFlushAt) < UI_FLUSH_MIN_INTERVAL_MS) {
        return {
          ok: true,
          flushed: false,
          flushedSeconds: 0,
          domain: sessionDomain,
          state: sessionState,
          reason: 'ui_flush_guard_interval',
          guardIntervalMs: UI_FLUSH_MIN_INTERVAL_MS,
          sinceLastFlushMs: Math.max(0, now - lastFlushAt),
        };
      }
    }

    const closeBoundary = options.closeTime
      ? { closeTime: options.closeTime, stale: false }
      : getReliableCloseTime(session, now);
    const { closeTime, stale } = closeBoundary;
    if (closeTime <= session.startTime) {
      return {
        ok: true,
        flushed: false,
        flushedSeconds: 0,
        domain: session.domain || null,
        state: session.state || null,
        reason: 'non_positive_duration',
      };
    }

    const sessionBefore = {
      state: session.state,
      domain: session.domain,
      startTime: session.startTime,
      lastHeartbeat: session.lastHeartbeat,
    };
    const endEvent = {
      type: EVENT_TYPE.END,
      state: session.state,
      domain: session.domain,
      time: closeTime,
    };
    await appendEvent(endEvent);
    await emitTrace('event_appended', {
      source: 'event-log',
      reason: stale ? 'uiFlushStaleClose' : 'uiFlushClose',
      domain: session.domain,
      previousState: session.state,
      event: endEvent,
      sessionBefore,
    });

    const settlement = await settleCurrentSessionSegment(session, closeTime, reason, {
      ...settlementResolverOptions(options),
      endReason: options.endReason || reason,
      endAtMs: closeTime,
    });
    const reopenedDomain = settlement?.domain || session.domain;
    const reopenTime = Number.isFinite(options.reopenTime) ? options.reopenTime : now;
    const startEvent = {
      type: EVENT_TYPE.START,
      state: session.state,
      domain: reopenedDomain,
      time: reopenTime,
    };
    await appendEvent(startEvent);
    await emitTrace('event_appended', {
      source: 'event-log',
      reason: 'uiFlushReopen',
      domain: reopenedDomain,
      nextState: session.state,
      event: startEvent,
      sessionBefore,
    });

    await saveSession({
      state: session.state,
      domain: reopenedDomain,
      startTime: reopenTime,
      lastHeartbeat: reopenTime,
      startReason: reason === 'periodic_checkpoint' ? 'periodic_checkpoint_reopen' : `${reason}_reopen`,
      startOperationSource: reason === 'periodic_checkpoint' ? 'timer' : operationSourceForReason(reason),
      startAtMs: reopenTime,
      tabId: session.tabId ?? null,
      windowId: session.windowId ?? null,
      domainResolutionReason: settlement?.domain && settlement.domain !== session.domain
        ? 'unknown_recovered_at_settlement'
        : session.domainResolutionReason || null,
      domainResolutionError: null,
      ...(await managedTargetFieldsForReopen(session, reopenedDomain, options, cachedEffectiveMode)),
    });

    if (reason === 'ui_flush') {
      try {
        await chrome.storage.local.set({
          [UI_FLUSH_GUARD_KEY]: {
            state: session.state || null,
            domain: reopenedDomain || null,
            mode: cachedEffectiveMode || 'unknown',
            lastFlushAt: now,
          },
        });
      } catch (_) {
        // Guard write failure must not block popup/read path.
      }
    }

    return {
      ok: true,
      flushed: (settlement?.appended || 0) > 0,
      flushedSegments: settlement?.appended || 0,
      flushedSeconds: settlement?.durationSeconds || 0,
      domain: reopenedDomain || null,
      state: session.state || null,
      reason,
      stale: !!stale,
      reopened: true,
      startTime: session.startTime,
      closeTime,
      reopenedAt: reopenTime,
    };
  };
  return options.alreadySerialized ? task() : runSerialized(task);
}

export async function closeCurrentSession(reason = 'close', options = {}) {
  const task = async () => {
    const session = await getSession();
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    if (isDisabledTimingReason(reason)) {
      await emitTrace('transition_skipped', {
        source: 'runtime-session',
        reason,
        domain: session?.domain || observedCloseDomain(options) || null,
        previousState: session?.state || null,
        nextState: null,
        payload: { skippedReason: 'disabled_timing_reason' },
      });
      return { ok: true, closed: false, skipped: true, reason: 'disabled_timing_reason' };
    }
    if (!session?.state || !session?.startTime) {
      const diagnostic = await settleBoundaryDiagnosticSegment({
        domain: observedCloseDomain(options),
        state: options.observedState || 'ACTIVE',
        atMs: now,
        settlementReason: 'event_close_without_open',
        startReason: 'event_close_without_open',
        endReason: reason,
        operationSource: operationSourceForReason(reason),
        tabId: Number.isInteger(options.tabId) ? options.tabId : null,
        windowId: Number.isInteger(options.windowId) ? options.windowId : null,
      });
      await saveSession({
        state: null,
        domain: null,
        startTime: null,
        lastHeartbeat: now,
      });
      return {
        ok: true,
        closed: false,
        diagnostic: true,
        reason: 'event_close_without_open',
        diagnosticSegment: diagnostic,
      };
    }

    const foreground = isForegroundPageSession(session);
    const closeObservedDomain = observedCloseDomain(options);
    const closeDomainMismatch = !!(closeObservedDomain && session.domain && closeObservedDomain !== session.domain);
    const foregroundBoundary = foreground ? getBoundedForegroundClose(session, now) : null;
    const closeTime = foreground
      ? foregroundBoundary.closeTime
      : getReliableCloseTime(session, now).closeTime;
    const endEvent = {
      type: EVENT_TYPE.END,
      state: session.state,
      domain: session.domain,
      time: closeTime,
    };
    await appendEvent(endEvent);

    let settlement = null;
    if (isCountedState(session.state)) {
      settlement = await settleCurrentSessionSegment(session, closeTime, closeDomainMismatch ? 'event_close_domain_mismatch_close' : reason, {
        ...settlementResolverOptions(options),
        endReason: reason,
        endAtMs: closeTime,
        allowZeroDurationSegment: true,
      });
      if (closeDomainMismatch) {
        await settleBoundaryDiagnosticSegment({
          domain: closeObservedDomain,
          state: options.observedState || session.state,
          atMs: closeTime,
          settlementReason: 'event_close_domain_mismatch_observed',
          startReason: 'event_close_domain_mismatch_observed',
          endReason: reason,
          operationSource: operationSourceForReason(reason),
          tabId: Number.isInteger(options.tabId) ? options.tabId : null,
          windowId: Number.isInteger(options.windowId) ? options.windowId : null,
        });
      }
    }
    if (foreground) {
      const cappedSeconds = Math.floor(Math.max(0, closeTime - session.startTime) / 1000);
      await recordForegroundDiagnostic({
        ...(foregroundBoundary?.capped ? { foregroundTailCapped: 1 } : {}),
        cappedForegroundSeconds: cappedSeconds,
        lastCapReason: reason,
        lastDropReason: foregroundBoundary?.capped ? 'foreground_tail_capped' : reason,
        lastDropAt: Date.now(),
      });
    }

    await saveSession({
      state: null,
      domain: null,
      startTime: null,
      lastHeartbeat: now,
    });
    return {
      ok: true,
      closed: true,
      reason,
      state: session.state,
      domain: session.domain || null,
      closeTime,
      foregroundClosed: foreground,
      foregroundCapped: !!foregroundBoundary?.capped,
      foregroundSettled: foreground ? (settlement?.appended || 0) > 0 : false,
      observedDomain: closeObservedDomain || null,
      domainMismatch: closeDomainMismatch,
      settlement,
    };
  };
  return options.alreadySerialized ? task() : runSerialized(task);
}

/**
 * 后台定时 checkpoint：每次触发时尝试把当前 open counted session 落账为 durable segment。
 * 仅在满足最低条件时才执行；执行后会重开同一 state/domain 的 session。
 */
export async function runPeriodicCheckpoint(now = Date.now(), options = {}) {
  return runSerialized(async () => {
    const session = await getSession();
    if (!session?.state || !session?.startTime) {
      const confirmation = typeof options.confirmForegroundPage === 'function'
        ? await options.confirmForegroundPage(null, now)
        : null;
      if (!isCheckpointActiveSample(confirmation)) {
        return { ok: true, checkpointed: false, reason: 'no_open_session' };
      }
      const openAt = checkpointEstimatedOpenTime(now);
      const state = sampleStateFromConfirmation(confirmation);
      const domain = sampleDomainFromConfirmation(confirmation);
      const startEvent = {
        type: EVENT_TYPE.START,
        state,
        domain,
        time: openAt,
      };
      await appendEvent(startEvent);
      await emitTrace('event_appended', {
        source: 'event-log',
        reason: 'checkpointEstimatedOpen',
        domain,
        nextState: state,
        event: startEvent,
      });
      await refreshCachedMode();
      await saveSession({
        state,
        domain,
        startTime: openAt,
        lastHeartbeat: now,
        startReason: 'checkpoint_estimated_open',
        startOperationSource: 'timer',
        startAtMs: openAt,
        tabId: sampleTabIdFromConfirmation(confirmation),
        windowId: sampleWindowIdFromConfirmation(confirmation),
        ...(await resolveManagedTargetForOpen(domain, { observedUrl: confirmation?.observedUrl || null }, cachedEffectiveMode)),
      });
      await recordForegroundDiagnostic({
        checkpointEstimatedOpens: 1,
        estimatedOpenSeconds: Math.floor(Math.max(0, now - openAt) / 1000),
        lastCheckpointAt: Date.now(),
        lastCheckpointDomain: domain,
        lastCheckpointIdleState: confirmation?.idleState || null,
      });
      return {
        ok: true,
        checkpointed: false,
        opened: true,
        repaired: true,
        reason: 'checkpoint_estimated_open',
        state,
        domain,
        openAt,
      };
    }
    if (!isCountedState(session.state)) {
      return { ok: true, checkpointed: false, reason: 'non_counted_state' };
    }
    if (typeof session.domain !== 'string' || !session.domain.trim()) {
      return { ok: true, checkpointed: false, reason: 'invalid_domain' };
    }
    if (!Number.isFinite(session.startTime) || session.startTime <= 0) {
      return { ok: true, checkpointed: false, reason: 'invalid_start_time' };
    }
    const minIntervalMs = isForegroundPageSession(session)
      ? FOREGROUND_CHECKPOINT_MS
      : PERIODIC_CHECKPOINT_MIN_INTERVAL_MS;
    if ((now - session.startTime) < minIntervalMs) {
      return {
        ok: true,
        checkpointed: false,
        reason: 'interval_not_reached',
        minIntervalMs,
      };
    }

    if (isForegroundPageSession(session)) {
      const confirmation = typeof options.confirmForegroundPage === 'function'
        ? await options.confirmForegroundPage(session, now)
        : { ok: true };
      if (!confirmation?.ok) {
        const closeTime = checkpointEstimatedCloseTime(session, now);
        const endEvent = {
          type: EVENT_TYPE.END,
          state: session.state,
          domain: session.domain,
          time: closeTime,
        };
        await appendEvent(endEvent);
        await emitTrace('event_appended', {
          source: 'event-log',
          reason: 'checkpointEstimatedClose',
          domain: session.domain,
          previousState: session.state,
          event: endEvent,
        });
        const settlement = await settleCurrentSessionSegment(session, closeTime, 'checkpoint_estimated_close', {
          endReason: 'checkpoint_estimated_half_interval_close',
          endOperationSource: 'timer',
          endAtMs: closeTime,
          resolveUnknownDomainForSettlement: options.resolveUnknownDomainForSettlement,
        });
        const nextSample = mismatchCheckpointActiveSample(confirmation);
        const openAt = nextSample ? checkpointEstimatedOpenTime(now) : null;
        if (nextSample) {
          const startEvent = {
            type: EVENT_TYPE.START,
            state: nextSample.state,
            domain: nextSample.domain,
            time: openAt,
          };
          await appendEvent(startEvent);
          await emitTrace('event_appended', {
            source: 'event-log',
            reason: 'checkpointEstimatedSwitchOpen',
            domain: nextSample.domain,
            nextState: nextSample.state,
            event: startEvent,
          });
          await refreshCachedMode();
          await saveSession({
            state: nextSample.state,
            domain: nextSample.domain,
            startTime: openAt,
            lastHeartbeat: now,
            startReason: 'checkpoint_estimated_open',
            startOperationSource: 'timer',
            startAtMs: openAt,
            tabId: nextSample.tabId,
            windowId: nextSample.windowId,
            ...(await resolveManagedTargetForOpen(nextSample.domain, { observedUrl: nextSample.url || null }, cachedEffectiveMode)),
          });
        } else {
          await saveSession(emptySession(now));
        }
        await recordForegroundDiagnostic({
          checkpointEstimatedCloses: 1,
          droppedUnconfirmedSeconds: Math.floor(Math.max(0, closeTime - session.startTime) / 1000),
          lastDropReason: confirmation?.reason || 'checkpoint_confirmation_failed',
          lastDropAt: Date.now(),
          lastCheckpointFailureAt: Date.now(),
          lastCheckpointFailureReason: confirmation?.reason || 'checkpoint_confirmation_failed',
          lastCheckpointObservedDomain: observedDomainFromConfirmation(confirmation),
          lastCheckpointIdleState: confirmation?.idleState || null,
          ...(nextSample ? {
            checkpointEstimatedOpens: 1,
            estimatedOpenSeconds: Math.floor(Math.max(0, now - openAt) / 1000),
          } : {}),
          ...(confirmation?.reason === 'unknown_domain' ? { unknownDomainSeconds: Math.floor(Math.max(0, closeTime - session.startTime) / 1000) } : {}),
          ...((confirmation?.reason === 'observed_query_failed' || confirmation?.reason === 'candidate_query_failed') ? { observedQueryFailures: 1 } : {}),
          ...(confirmation?.reason === 'idle_query_failed' ? { idleQueryFailures: 1 } : {}),
        });
        return {
          ok: true,
          checkpointed: false,
          repaired: true,
          reason: 'checkpoint_estimated_close',
          failureReason: confirmation?.reason || 'checkpoint_confirmation_failed',
          flushedSeconds: settlement?.durationSeconds || 0,
          flushedSegments: settlement?.appended || 0,
          closeAt: closeTime,
          opened: !!nextSample,
          openAt,
          domain: nextSample?.domain || session.domain || null,
        };
      }

      const checkpointEnd = session.startTime + FOREGROUND_CHECKPOINT_MS;
      const flushResult = await flushOpenSessionToStats('periodic_checkpoint', {
        alreadySerialized: true,
        closeTime: checkpointEnd,
        reopenTime: checkpointEnd,
        allowForeground: true,
        resolveUnknownDomainForSettlement: options.resolveUnknownDomainForSettlement,
      });
      if (flushResult?.ok === false || flushResult?.error) {
        console.warn('[Checkpoint] foreground checkpoint settlement failed', {
          error: flushResult?.error || 'unknown_error',
          state: session.state,
          domain: session.domain,
        });
        logClientEventBestEffort({
          level: 'warning',
          category: 'timing',
          eventCode: 'foreground_checkpoint_settlement_failed',
          module: 'runtime/session',
          message: flushResult?.error || 'Foreground checkpoint settlement failed',
          domain: session.domain || null,
          details: { state: session.state || null },
        });
        return { ok: false, checkpointed: false, reason: 'settlement_failed', error: flushResult?.error || null };
      }
      if (flushResult?.flushed) {
        await recordForegroundDiagnostic({
          confirmedCheckpointWindows: 1,
          confirmedCheckpointSeconds: flushResult?.flushedSeconds || 0,
          lastCheckpointAt: Date.now(),
          lastCheckpointDomain: session.domain || FOREGROUND_UNKNOWN_DOMAIN,
          lastCheckpointIdleState: confirmation?.idleState || null,
        });
      }
      await saveSession({
        state: session.state,
        domain: session.domain || FOREGROUND_UNKNOWN_DOMAIN,
        startTime: checkpointEnd,
        lastHeartbeat: now,
        startReason: 'periodic_checkpoint_reopen',
        startOperationSource: 'timer',
        startAtMs: checkpointEnd,
        tabId: session.tabId ?? sampleTabIdFromConfirmation(confirmation),
        windowId: session.windowId ?? sampleWindowIdFromConfirmation(confirmation),
        ...(await managedTargetFieldsForReopen(session, session.domain || FOREGROUND_UNKNOWN_DOMAIN, {
          observedUrl: confirmation?.observedUrl || null,
        }, cachedEffectiveMode)),
      });
      return {
        ok: true,
        checkpointed: !!flushResult?.flushed,
        flushedSeconds: flushResult?.flushedSeconds || 0,
        flushedSegments: flushResult?.flushedSegments || 0,
        reason: 'periodic_checkpoint',
      };
    }

    const flushResult = await flushOpenSessionToStats('periodic_checkpoint', {
      alreadySerialized: true,
      closeTime: now,
      reopenTime: now,
      resolveUnknownDomainForSettlement: options.resolveUnknownDomainForSettlement,
    });
    if (flushResult?.ok === false || flushResult?.error) {
      console.warn('[Checkpoint] periodic checkpoint settlement failed', {
        error: flushResult?.error || 'unknown_error',
        state: session.state,
        domain: session.domain,
      });
      logClientEventBestEffort({
        level: 'warning',
        category: 'timing',
        eventCode: 'periodic_checkpoint_settlement_failed',
        module: 'runtime/session',
        message: flushResult?.error || 'Periodic checkpoint settlement failed',
        domain: session.domain || null,
        details: { state: session.state || null },
      });
      return { ok: false, checkpointed: false, reason: 'settlement_failed', error: flushResult?.error || null };
    }
    return {
      ok: true,
      checkpointed: !!flushResult?.flushed,
      flushedSeconds: flushResult?.flushedSeconds || 0,
      flushedSegments: flushResult?.flushedSegments || 0,
      reason: 'periodic_checkpoint',
    };
  });
}

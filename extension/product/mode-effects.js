// product/mode-effects.js — execute Mode Service decisions against Chrome UI.

import { clearTemporaryCompositeDomains, getConfig, getSession } from '../infra/storage.js';
import { commitModeChange, normalizeMode } from './mode-service.js';
import {
  applyModeTransitionSideEffects,
  clearTabModeNotice,
  redirectToReminder,
  sendNoticeForDecision,
} from './interceptor.js';

export const MODE_EFFECT_TRACE_KEY = 'mode_effect_trace_v1';
const MODE_EFFECT_TRACE_LIMIT = 50;

async function drainQueuedModeBoundary(drainModeBoundary, reason) {
  if (typeof drainModeBoundary !== 'function') return { ok: true, skipped: true };
  try {
    return await drainModeBoundary(reason);
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

function compactModeChange(change) {
  if (!change) return null;
  return {
    toMode: change.toMode || null,
    fromMode: change.fromMode || null,
    reason: change.reason || null,
    source: change.source || null,
    effectiveAtMs: Number.isFinite(Number(change.effectiveAtMs)) ? Number(change.effectiveAtMs) : null,
    setRestExitGrace: change.setRestExitGrace === true,
    clearRestExitGrace: change.clearRestExitGrace === true,
    changed: change.changed === true,
  };
}

function compactDecision(decision = {}) {
  return {
    ok: decision.ok !== false,
    access: decision.access || null,
    reason: decision.reason || null,
    domain: decision.domain || null,
    modeChange: compactModeChange(decision.modeChange),
    reminder: decision.reminder || null,
    notice: decision.notice || null,
    recheckActiveTab: decision.recheckActiveTab === true,
  };
}

function compactModeEffectResult(result = {}) {
  return {
    ok: result.ok !== false,
    blocked: result.blocked === true,
    reminderSent: result.reminderSent === true,
    modeChange: compactModeChange(result.modeChange),
    noticeAttempted: result.noticeAttempted === true,
    noticeTargetTabId: Number.isInteger(result.noticeTargetTabId) ? result.noticeTargetTabId : null,
    noticeSent: result.noticeSent === true,
    noticeAck: result.noticeAck ?? null,
    noticeRendered: result.noticeRendered === true,
    noticeVisible: result.noticeVisible === true || result.noticeDelivery?.visible === true,
    noticeError: result.noticeError || null,
    noticeDeferred: result.noticeDelivery?.deferred === true,
  };
}

function reminderTargetUrlFromEvent(event = {}) {
  const raw = event?.url;
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    return parsed.toString();
  } catch (_) {
    return null;
  }
}

export async function recordModeEffectTrace(entry = {}) {
  try {
    const chromeApi = globalThis.chrome;
    if (!chromeApi?.storage?.local?.get || !chromeApi?.storage?.local?.set) return null;
    const event = entry.event || {};
    const traceEntry = {
      atMs: Date.now(),
      event: {
        type: event.type || null,
        source: event.source || null,
        tabId: Number.isInteger(event.tabId) ? event.tabId : null,
        url: event.url || null,
        domain: event.domain || null,
        frameId: Number.isInteger(event.frameId) ? event.frameId : null,
        hasPending: event.hasPending === true,
        readyReason: event.readyReason || null,
        foreground: event.foreground === true,
      },
      domain: entry.domain || null,
      decision: compactDecision(entry.decision || {}),
      result: compactModeEffectResult(entry.result || {}),
    };
    const stored = await chromeApi.storage.local.get(MODE_EFFECT_TRACE_KEY).catch(() => ({}));
    const existing = Array.isArray(stored?.[MODE_EFFECT_TRACE_KEY]) ? stored[MODE_EFFECT_TRACE_KEY] : [];
    const next = [traceEntry, ...existing].slice(0, MODE_EFFECT_TRACE_LIMIT);
    await chromeApi.storage.local.set({ [MODE_EFFECT_TRACE_KEY]: next });
    return traceEntry;
  } catch {
    return null;
  }
}

export async function getModeEffectTrace(limit = MODE_EFFECT_TRACE_LIMIT) {
  try {
    const chromeApi = globalThis.chrome;
    if (!chromeApi?.storage?.local?.get) return [];
    const stored = await chromeApi.storage.local.get(MODE_EFFECT_TRACE_KEY);
    const rows = Array.isArray(stored?.[MODE_EFFECT_TRACE_KEY]) ? stored[MODE_EFFECT_TRACE_KEY] : [];
    return rows.slice(0, Math.max(1, Math.min(MODE_EFFECT_TRACE_LIMIT, Number(limit) || MODE_EFFECT_TRACE_LIMIT)));
  } catch {
    return [];
  }
}

export async function executeModeDecision(decision = {}, context = {}) {
  const tabId = Number.isInteger(context.tabId) ? context.tabId : null;
  const domain = context.domain || decision.domain || null;
  const config = context.config || decision.config || await getConfig().catch(() => null);
  const session = context.session || await getSession().catch(() => null);
  const fromMode = normalizeMode(decision.modeSnapshot?.mode || session?.currentMode || config?.mode);
  const result = {
    ok: decision.ok !== false,
    blocked: false,
    decision,
    modeChange: null,
    noticeAttempted: false,
    noticeTargetTabId: decision.notice ? tabId : null,
    noticeSent: false,
    noticeAck: null,
    noticeRendered: false,
    noticeVisible: false,
    noticeError: null,
    noticeDelivery: null,
    reminderSent: false,
  };

  const finalize = async () => {
    await recordModeEffectTrace({
      event: context.event || {},
      domain,
      decision,
      result,
    });
    return result;
  };

  if (decision.access === 'reminder' && decision.reminder) {
    await redirectToReminder(tabId, domain, decision.reminder.reason, config?.blockMessage, {
      ...(decision.reminder.params || {}),
      targetUrl: reminderTargetUrlFromEvent(context.event),
      restLocked: config?.quotaState?.restLocked ? '1' : null,
    });
    result.blocked = true;
    result.reminderSent = true;
    return await finalize();
  }

  if (decision.modeChange) {
    const change = await commitModeChange({
      toMode: decision.modeChange.toMode,
      reason: decision.modeChange.reason,
      source: decision.modeChange.source,
      effectiveAtMs: decision.modeChange.effectiveAtMs,
      persistConfigMode: decision.modeChange.persistConfigMode === true,
      setRestExitGrace: decision.modeChange.setRestExitGrace === true,
      clearRestExitGrace: decision.modeChange.clearRestExitGrace === true,
      config,
      session,
      drainModeBoundary: (reason) => drainQueuedModeBoundary(context.drainModeBoundary, reason),
    });
    result.modeChange = change;

    if (decision.modeChange.persistConfigMode === true) {
      await clearTemporaryCompositeDomains();
      if (typeof context.updateDeclarativeRules === 'function') {
        const latestConfig = await getConfig().catch(() => null);
        await context.updateDeclarativeRules(latestConfig || config).catch(() => {});
      }
    }

    if (change.changed) {
      await applyModeTransitionSideEffects({
        fromMode: change.fromMode || fromMode,
        toMode: change.toMode,
        tabId,
        domain,
        sendStudyNotice: false,
      });
    }
  }

  if (decision.notice) {
    result.noticeAttempted = true;
    if (tabId === null) {
      result.noticeError = 'notice_target_missing';
      return await finalize();
    }
    try {
      if (tabId >= 0) {
        await clearTabModeNotice(tabId, 'mode_changed');
      }
      const delivery = await sendNoticeForDecision(decision, {
        tabId,
        domain,
        fromMode: result.modeChange?.fromMode || fromMode,
        config,
      });
      result.noticeDelivery = delivery || null;
      result.noticeSent = delivery?.sent === true;
      result.noticeAck = delivery?.ack ?? null;
      result.noticeRendered = delivery?.rendered === true;
      result.noticeVisible = delivery?.visible === true;
      if (delivery?.ok !== true && delivery?.deferred !== true) {
        result.noticeError = delivery?.error || 'notice_send_failed';
      }
    } catch (err) {
      result.noticeSent = false;
      result.noticeAck = null;
      result.noticeRendered = false;
      result.noticeVisible = false;
      result.noticeError = err?.message || String(err);
    }
  }

  return await finalize();
}

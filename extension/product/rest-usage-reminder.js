// Rest soft-limit reminder orchestration. This module never mutates the usage ledger.

import { getEffectiveQuotaForDate } from '../core/quota-config.js';
import { budgetedLocalSet } from '../infra/storage-budget.js';

export const REST_USAGE_REMINDER_STATE_KEY = 'rest_usage_reminder_state_v1';
export const REST_USAGE_REMINDER_DEADLINE_ALARM = 'restUsageReminderDeadline';
export const REST_USAGE_REMINDER_RETRY_ALARM = 'restUsageReminderDeliveryRetry';
export const REST_USAGE_REMINDER_TIMEOUT_MS = 60 * 1000;
export const REST_USAGE_REMINDER_RETRY_MS = 10 * 1000;
export const REST_USAGE_REMINDER_DEFAULT_FIRST_MINUTES = 120;
export const REST_USAGE_REMINDER_DEFAULT_REPEAT_MINUTES = 60;

const STATE_VERSION = 2;
const MAX_REMINDER_MINUTES = 1440;
const MAX_DELIVERY_ATTEMPTS = 2;

let runtimeDeps = null;
let operationQueue = Promise.resolve();

function runSerialized(task) {
  operationQueue = operationQueue.then(task, task);
  return operationQueue;
}

function randomToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `rest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function validReminderMinutes(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= MAX_REMINDER_MINUTES;
}

function firstReminderMinutes(config = {}) {
  const value = config?.restConfig?.firstReminderMinutes;
  if (value === null) return null;
  return validReminderMinutes(value) ? Number(value) : REST_USAGE_REMINDER_DEFAULT_FIRST_MINUTES;
}

function repeatReminderMinutes(config = {}) {
  const value = config?.restConfig?.repeatReminderMinutes;
  return validReminderMinutes(value) ? Number(value) : REST_USAGE_REMINDER_DEFAULT_REPEAT_MINUTES;
}

function remainingSeconds(limitMinutes, usedSeconds) {
  if (limitMinutes === null || limitMinutes === undefined) return null;
  return Math.max(0, Math.floor(Number(limitMinutes) * 60 - Math.max(0, Number(usedSeconds) || 0)));
}

function freshState(dateKey, firstMinutes, repeatMinutes) {
  return {
    version: STATE_VERSION,
    dateKey,
    firstReminderMinutes: firstMinutes,
    repeatReminderMinutes: repeatMinutes,
    nextThresholdSeconds: firstMinutes === null ? null : firstMinutes * 60,
    lastAcknowledgedUsageSeconds: null,
    deliveryDue: null,
    prompt: null,
    updatedAt: Date.now(),
  };
}

async function readState() {
  const data = await chrome.storage.local.get(REST_USAGE_REMINDER_STATE_KEY);
  return data?.[REST_USAGE_REMINDER_STATE_KEY] || null;
}

async function writeState(state) {
  const next = { ...state, updatedAt: Date.now() };
  await budgetedLocalSet({ [REST_USAGE_REMINDER_STATE_KEY]: next }, {
    priority: 'critical',
    source: 'rest_usage_reminder_state',
  });
  return next;
}

function normalizeState(raw, dateKey, firstMinutes, repeatMinutes, todayUsedSeconds) {
  if (!raw || raw.version !== STATE_VERSION || raw.dateKey !== dateKey) {
    return freshState(dateKey, firstMinutes, repeatMinutes);
  }

  // A visible prompt is immutable until the user continues, ends, or times out.
  if (raw.prompt?.token) return { ...raw };

  const state = { ...raw };
  if (state.firstReminderMinutes !== firstMinutes) {
    state.firstReminderMinutes = firstMinutes;
    state.repeatReminderMinutes = repeatMinutes;
    state.lastAcknowledgedUsageSeconds = null;
    state.deliveryDue = null;
    state.nextThresholdSeconds = firstMinutes === null ? null : firstMinutes * 60;
    return state;
  }

  if (state.repeatReminderMinutes !== repeatMinutes) {
    state.repeatReminderMinutes = repeatMinutes;
    state.deliveryDue = null;
    if (state.lastAcknowledgedUsageSeconds !== null
        && Number.isFinite(Number(state.lastAcknowledgedUsageSeconds))) {
      state.nextThresholdSeconds = todayUsedSeconds + repeatMinutes * 60;
    }
  }

  if (firstMinutes === null) {
    state.deliveryDue = null;
    state.nextThresholdSeconds = null;
  } else if (!Number.isFinite(Number(state.nextThresholdSeconds))) {
    state.nextThresholdSeconds = firstMinutes * 60;
  }
  return state;
}

async function currentForegroundRestContext(deps) {
  const session = await deps.getTimingSession().catch(() => null);
  if (session?.state !== 'ACTIVE' || session?.quotaBucketAtTime !== 'rest' || !Number.isInteger(session?.tabId)) {
    return null;
  }
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
  const tab = tabs?.[0] || null;
  if (!tab?.id || tab.id !== session.tabId) return null;
  const win = Number.isInteger(tab.windowId)
    ? await chrome.windows.get(tab.windowId).catch(() => null)
    : null;
  if (win?.focused !== true || win?.state === 'minimized') return null;
  return { session, tab };
}

async function clearAlarm(name) {
  await chrome.alarms.clear(name).catch(() => false);
}

async function scheduleAlarm(name, when) {
  await chrome.alarms.create(name, { when });
}

async function showPrompt(due) {
  const response = await chrome.tabs.sendMessage(due.sourceTabId, {
    type: 'SHOW_REST_USAGE_REMINDER',
    ...due,
  }, { frameId: 0 }).catch(() => null);
  return response?.ok === true && response?.visible === true;
}

async function activatePrompt(prompt) {
  const activation = await chrome.tabs.sendMessage(prompt.sourceTabId, {
    type: 'ACTIVATE_REST_USAGE_REMINDER',
    token: prompt.token,
    deadlineAt: prompt.deadlineAt,
  }, { frameId: 0 }).catch(() => null);
  if (activation?.ok !== true || activation?.visible !== true) {
    await chrome.tabs.sendMessage(prompt.sourceTabId, {
      type: 'DISMISS_REST_USAGE_REMINDER',
      token: prompt.token,
    }, { frameId: 0 }).catch(() => null);
    return false;
  }

  await chrome.tabs.sendMessage(prompt.sourceTabId, {
    type: 'PAUSE_REST_USAGE_MEDIA',
    token: prompt.token,
  }).catch(() => null);
  return true;
}

async function endPrompt(deps, state, reason, promptOverride = null) {
  const prompt = promptOverride || state?.prompt || state?.deliveryDue;
  if (!prompt?.token) return { ok: true, skipped: 'no_prompt' };
  const next = await writeState({
    ...state,
    deliveryDue: null,
    prompt: null,
    lastResolution: { token: prompt.token, action: 'end', reason, at: Date.now() },
  });
  await Promise.all([
    clearAlarm(REST_USAGE_REMINDER_DEADLINE_ALARM),
    clearAlarm(REST_USAGE_REMINDER_RETRY_ALARM),
  ]);
  const result = await deps.endRestUsage({ prompt, reason });
  const completed = result?.ok !== false || result?.blocked === true || result?.reminderSent === true;
  return { ok: completed, action: 'end', state: next, result };
}

async function attemptDelivery(deps, state, now) {
  const due = state?.deliveryDue;
  if (!due?.token) return { ok: true, skipped: 'no_delivery_due', state };

  const context = await currentForegroundRestContext(deps);
  if (!context) return { ok: true, skipped: 'no_foreground_rest_session', deliveryPending: true, state };

  const candidate = { ...due, sourceTabId: context.tab.id };
  const visible = await showPrompt(candidate);
  if (visible) {
    const prompt = {
      ...candidate,
      shownAt: now,
      deadlineAt: now + REST_USAGE_REMINDER_TIMEOUT_MS,
      deliveryAttempts: Number(candidate.deliveryAttempts) + 1,
    };
    const next = await writeState({ ...state, deliveryDue: null, prompt });
    const activated = await activatePrompt(prompt);
    if (!activated) {
      return registerDeliveryFailure(deps, { ...next, prompt: null, deliveryDue: candidate }, candidate, now);
    }
    await clearAlarm(REST_USAGE_REMINDER_RETRY_ALARM);
    await scheduleAlarm(REST_USAGE_REMINDER_DEADLINE_ALARM, prompt.deadlineAt);
    return { ok: true, prompted: true, visible: true, prompt, state: next };
  }

  return registerDeliveryFailure(deps, state, candidate, now);
}

async function registerDeliveryFailure(deps, state, candidate, now) {
  const deliveryAttempts = Number(candidate.deliveryAttempts || 0) + 1;
  if (deliveryAttempts >= MAX_DELIVERY_ATTEMPTS) {
    return endPrompt(deps, state, 'delivery_failed', { ...candidate, deliveryAttempts });
  }

  const nextRetryAt = now + REST_USAGE_REMINDER_RETRY_MS;
  const deliveryDue = { ...candidate, deliveryAttempts, nextRetryAt };
  const next = await writeState({ ...state, deliveryDue });
  await scheduleAlarm(REST_USAGE_REMINDER_RETRY_ALARM, nextRetryAt);
  return { ok: true, prompted: true, visible: false, deliveryPending: true, state: next };
}

function buildDeliveryDue({ state, context, firstMinutes, todayUsedSeconds, weekUsedSeconds, effectiveQuota, now }) {
  const reminderKind = state.lastAcknowledgedUsageSeconds !== null
    && Number.isFinite(Number(state.lastAcknowledgedUsageSeconds))
    ? 'repeat'
    : 'first';
  return {
    token: randomToken(),
    sourceTabId: context.tab.id,
    dueAt: now,
    deliveryAttempts: 0,
    nextRetryAt: null,
    reminderKind,
    softLimitMinutes: firstMinutes,
    overageSeconds: Math.max(0, todayUsedSeconds - firstMinutes * 60),
    todayUsedSeconds,
    todayRemainingSeconds: remainingSeconds(effectiveQuota.restMinutes, todayUsedSeconds),
    weekUsedSeconds,
    weekRemainingSeconds: remainingSeconds(effectiveQuota.weeklyRestMinutes, weekUsedSeconds),
  };
}

export function configureRestUsageReminder(deps) {
  runtimeDeps = deps;
}

export function restUsageReminderConfigValue(config = {}) {
  return firstReminderMinutes(config);
}

export function restUsageReminderRepeatConfigValue(config = {}) {
  return repeatReminderMinutes(config);
}

export async function evaluateRestUsageReminder(options = {}) {
  return runSerialized(async () => {
    const deps = options.deps || runtimeDeps;
    if (!deps) return { ok: false, error: 'rest_reminder_not_configured' };
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const dateKey = deps.getDateKey(new Date(now));
    const config = await deps.getConfig();
    const firstMinutes = firstReminderMinutes(config);
    const repeatMinutes = repeatReminderMinutes(config);
    const usage = await deps.getQuotaUsageView(dateKey, { config });
    if (usage?.ok === false) return { ok: false, error: usage.error || 'rest_usage_unavailable' };
    const todayUsedSeconds = Math.max(0, Number(usage?.restSeconds) || 0);
    const weekUsedSeconds = Math.max(0, Number(usage?.weekRestSeconds) || 0);
    let state = normalizeState(await readState(), dateKey, firstMinutes, repeatMinutes, todayUsedSeconds);

    if (state.prompt?.token) {
      if (now >= Number(state.prompt.deadlineAt || 0)) {
        return endPrompt(deps, state, options.reason || 'timeout');
      }
      return { ok: true, pending: true, state };
    }

    if (firstMinutes === null) {
      state = await writeState({ ...state, deliveryDue: null, prompt: null, nextThresholdSeconds: null });
      await clearAlarm(REST_USAGE_REMINDER_RETRY_ALARM);
      return { ok: true, skipped: 'disabled', state };
    }

    if (state.deliveryDue?.token) {
      const retryAt = Number(state.deliveryDue.nextRetryAt || 0);
      const forceRetry = options.reason === 'content_script_ready';
      if (!forceRetry && retryAt > now) return { ok: true, deliveryPending: true, state };
      return attemptDelivery(deps, state, now);
    }

    if (todayUsedSeconds < Number(state.nextThresholdSeconds || 0)) {
      state = await writeState(state);
      return { ok: true, skipped: 'below_threshold', state };
    }

    const context = await currentForegroundRestContext(deps);
    if (!context) {
      state = await writeState(state);
      return { ok: true, skipped: 'no_foreground_rest_session', state };
    }

    const effectiveQuota = getEffectiveQuotaForDate(config, new Date(now)).todayEffectiveQuota;
    const deliveryDue = buildDeliveryDue({
      state,
      context,
      firstMinutes,
      todayUsedSeconds,
      weekUsedSeconds,
      effectiveQuota,
      now,
    });
    state = await writeState({ ...state, deliveryDue });
    return attemptDelivery(deps, state, now);
  });
}

export async function handleRestUsageReminderAction(message = {}, sender = {}, options = {}) {
  return runSerialized(async () => {
    const deps = options.deps || runtimeDeps;
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    if (!deps) return { ok: false, error: 'rest_reminder_not_configured' };
    const state = await readState();
    const prompt = state?.prompt;
    if (!prompt?.token || message.token !== prompt.token) return { ok: false, error: 'stale_prompt' };
    if (!Number.isInteger(sender?.tab?.id) || sender.tab.id !== prompt.sourceTabId) {
      return { ok: false, error: 'invalid_prompt_sender' };
    }
    if (now >= Number(prompt.deadlineAt || 0)) return endPrompt(deps, state, 'timeout');
    if (message.action === 'end') return endPrompt(deps, state, 'user_end');
    if (message.action !== 'continue') return { ok: false, error: 'invalid_prompt_action' };

    const config = await deps.getConfig();
    const usage = await deps.getQuotaUsageView(state.dateKey, { config });
    const todayUsedSeconds = Math.max(0, Number(usage?.restSeconds) || Number(prompt.todayUsedSeconds) || 0);
    const next = await writeState({
      ...state,
      prompt: null,
      lastAcknowledgedUsageSeconds: todayUsedSeconds,
      nextThresholdSeconds: todayUsedSeconds + Number(state.repeatReminderMinutes || REST_USAGE_REMINDER_DEFAULT_REPEAT_MINUTES) * 60,
      lastResolution: { token: prompt.token, action: 'continue', reason: 'user_continue', at: now },
    });
    await clearAlarm(REST_USAGE_REMINDER_DEADLINE_ALARM);
    await chrome.tabs.sendMessage(prompt.sourceTabId, {
      type: 'RESUME_REST_USAGE_MEDIA',
      token: prompt.token,
    }).catch(() => null);
    return { ok: true, action: 'continue', nextThresholdSeconds: next.nextThresholdSeconds };
  });
}

export async function restoreRestUsageReminderForTab(tabId, options = {}) {
  return runSerialized(async () => {
    const deps = options.deps || runtimeDeps;
    if (!deps || !Number.isInteger(tabId)) return { ok: false, error: 'invalid_restore' };
    const state = await readState();
    const prompt = state?.prompt;
    if (prompt?.token && prompt.sourceTabId === tabId) {
      if (Date.now() >= Number(prompt.deadlineAt || 0)) return endPrompt(deps, state, 'timeout');
      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'SHOW_REST_USAGE_REMINDER',
        ...prompt,
      }, { frameId: 0 }).catch(() => null);
      if (response?.ok === true && response?.visible === true) {
        await chrome.tabs.sendMessage(tabId, {
          type: 'ACTIVATE_REST_USAGE_REMINDER',
          token: prompt.token,
          deadlineAt: prompt.deadlineAt,
        }, { frameId: 0 }).catch(() => null);
      }
      return { ok: true, restored: true, visible: response?.visible === true };
    }

    if (!state?.deliveryDue?.token || state.deliveryDue.sourceTabId !== tabId) {
      return { ok: true, skipped: 'no_prompt' };
    }
    return attemptDelivery(deps, state, Date.now());
  });
}

// Rest soft-limit reminder orchestration. This module never mutates the usage ledger.

import { getEffectiveQuotaForDate } from '../core/quota-config.js';
import { budgetedLocalSet } from '../infra/storage-budget.js';
import { isAutonomyConfirmationText, softReminderRepeatMinutes } from '../core/autonomy-confirmation.js';
import { grantScheduleConfirmation, revokeScheduleConfirmation, readScheduleConfirmationScope } from './schedule-confirmation.js';

export const REST_USAGE_REMINDER_STATE_KEY = 'rest_usage_reminder_state_v1';
export const REST_USAGE_REMINDER_DEADLINE_ALARM = 'restUsageReminderDeadline';
export const REST_USAGE_REMINDER_RETRY_ALARM = 'restUsageReminderDeliveryRetry';
export const REST_USAGE_REMINDER_TIMEOUT_MS = 60 * 1000;
export const REST_USAGE_REMINDER_RETRY_MS = 10 * 1000;
export const REST_USAGE_REMINDER_DEFAULT_FIRST_MINUTES = 120;
export const REST_USAGE_REMINDER_DEFAULT_REPEAT_MINUTES = 60;
export const REST_USAGE_REMINDER_DEFAULT_WEEKLY_MINUTES = 840;

const STATE_VERSION = 2;
const MAX_REMINDER_MINUTES = 1440;
const MAX_DELIVERY_ATTEMPTS = 2;

let runtimeDeps = null;
let sharedRuntimeSuspended = false;
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
  return REST_USAGE_REMINDER_DEFAULT_REPEAT_MINUTES;
}

export function restUsageReminderWeeklyConfigValue(config = {}) {
  const value = config?.restConfig?.weeklyFirstReminderMinutes;
  if (value === null) return null;
  return Number.isInteger(value) && value >= 1 && value <= 10080 ? value : REST_USAGE_REMINDER_DEFAULT_WEEKLY_MINUTES;
}

function weekKeyForDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

function softReminderTimeoutAction(config = {}) {
  return 'end_rest';
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
    acknowledgementCount: 0,
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

function normalizeState(raw, dateKey, firstMinutes, repeatMinutes, todayUsedSeconds, weeklyMinutes, weekUsedSeconds) {
  // The dialog is a fixed snapshot, including across midnight or a config refresh.
  if (raw?.prompt?.token) return { ...raw };
  const weeklyKey = weekKeyForDate(dateKey);
  let weekly = raw?.weekly?.weekKey === weeklyKey ? { ...raw.weekly } : {
    weekKey: weeklyKey, firstReminderMinutes: weeklyMinutes, repeatReminderMinutes: repeatMinutes,
    nextThresholdSeconds: weeklyMinutes === null ? null : weeklyMinutes * 60, lastAcknowledgedUsageSeconds: null, acknowledgementCount: 0,
  };
  let weeklyChanged = false;
  if (!Number.isInteger(weekly.acknowledgementCount) || weekly.acknowledgementCount < 0) {
    weekly.acknowledgementCount = weekly.lastAcknowledgedUsageSeconds == null ? 0 : 1;
  }
  if (weekly.firstReminderMinutes !== weeklyMinutes) {
    weekly = { ...weekly, firstReminderMinutes: weeklyMinutes, lastAcknowledgedUsageSeconds: null, acknowledgementCount: 0,
      nextThresholdSeconds: weeklyMinutes === null ? null : weeklyMinutes * 60 };
    weeklyChanged = true;
  }
  if (weekly.repeatReminderMinutes !== repeatMinutes) {
    weekly.repeatReminderMinutes = repeatMinutes;
    weekly.nextThresholdSeconds = weeklyMinutes === null ? null : weekUsedSeconds + repeatMinutes * 60;
    weeklyChanged = true;
  }
  if (!raw || raw.version !== STATE_VERSION || raw.dateKey !== dateKey) {
    return { ...freshState(dateKey, firstMinutes, repeatMinutes), weekly };
  }

  const state = { ...raw, weekly };
  if (!Number.isInteger(state.acknowledgementCount) || state.acknowledgementCount < 0) {
    state.acknowledgementCount = state.lastAcknowledgedUsageSeconds == null ? 0 : 1;
  }
  if (weeklyChanged) state.deliveryDue = null;
  if (state.firstReminderMinutes !== firstMinutes) {
    state.firstReminderMinutes = firstMinutes;
    state.repeatReminderMinutes = repeatMinutes;
    state.lastAcknowledgedUsageSeconds = null;
    state.acknowledgementCount = 0;
    state.deliveryDue = null;
    state.nextThresholdSeconds = firstMinutes === null ? null : firstMinutes * 60;
  }

  if (state.repeatReminderMinutes !== repeatMinutes) {
    state.repeatReminderMinutes = repeatMinutes;
    state.deliveryDue = null;
    state.nextThresholdSeconds = firstMinutes === null ? null : todayUsedSeconds + repeatMinutes * 60;
  }

  if (firstMinutes === null) {
    state.nextThresholdSeconds = null;
  } else if (!Number.isFinite(Number(state.nextThresholdSeconds))) {
    state.nextThresholdSeconds = firstMinutes * 60;
  }
  return state;
}

async function currentForegroundRestContext(deps, requireRest = true) {
  const session = await deps.getTimingSession().catch(() => null);
  if (requireRest && (session?.state !== 'ACTIVE' || session?.quotaBucketAtTime !== 'rest' || !Number.isInteger(session?.tabId))) {
    return null;
  }
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
  const tab = tabs?.[0] || null;
  if (!tab?.id || (requireRest && tab.id !== session.tabId)) return null;
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
  const { identityScope, ...presentation } = due;
  const response = await chrome.tabs.sendMessage(due.sourceTabId, {
    type: 'SHOW_REST_USAGE_REMINDER',
    ...presentation,
  }, { frameId: 0 }).catch(() => null);
  return response?.ok === true && response?.visible === true && response?.confirmationVersion === 1;
}

async function activatePrompt(prompt) {
  const activation = await chrome.tabs.sendMessage(prompt.sourceTabId, {
    type: 'ACTIVATE_REST_USAGE_REMINDER',
    token: prompt.token,
    deadlineAt: prompt.deadlineAt,
    timeoutAction: prompt.timeoutAction,
  }, { frameId: 0 }).catch(() => null);
  if (activation?.ok !== true || activation?.visible !== true || activation?.confirmationVersion !== 1) {
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
  await revokeScheduleConfirmation(prompt.sourceTabId);
  const result = prompt.schedule && deps.blockSchedule
    ? await deps.blockSchedule({ prompt, reason }) : await deps.endRestUsage({ prompt, reason });
  const completed = result?.ok !== false || result?.blocked === true || result?.reminderSent === true;
  if (completed) await chrome.tabs.sendMessage(prompt.sourceTabId, {
    type: 'DISMISS_REST_USAGE_REMINDER', token: prompt.token, resumeMedia: false,
  }, { frameId: 0 }).catch(() => null);
  return { ok: completed, action: 'end', state: next, result };
}

async function continuePrompt(deps, state, reason, promptOverride = null, options = {}) {
  const prompt = promptOverride || state?.prompt || state?.deliveryDue;
  if (!prompt?.token) return { ok: true, skipped: 'no_prompt' };
  if (prompt.schedule) {
    if (prompt.identityScope !== await readScheduleConfirmationScope()) return endPrompt(deps, state, 'identity_changed', prompt);
    const current = await deps.getScheduleContext?.(prompt.sourceTabId);
    if (!current || current.key !== prompt.schedule.key) return endPrompt(deps, state, 'schedule_changed', prompt);
    await grantScheduleConfirmation(current);
  }
  if (deps.canContinueRest && !await deps.canContinueRest({ prompt })) {
    return endPrompt(deps, state, 'hard_limit', prompt);
  }
  const config = await deps.getConfig();
  let usage = null;
  try {
    usage = await deps.getQuotaUsageView(deps.getDateKey(new Date()), { config });
  } catch (_error) {
    usage = null;
  }
  const knownUsage = usage?.ok !== false && Number.isFinite(usage?.restSeconds) && Number.isFinite(usage?.weekRestSeconds);
  const todayUsedSeconds = Math.max(0, knownUsage ? usage.restSeconds : Number(prompt.todayUsedSeconds) || 0);
  const weekUsedSeconds = Math.max(0, knownUsage ? usage.weekRestSeconds : Number(prompt.weekUsedSeconds) || 0);
  const dateKey = deps.getDateKey(new Date());
  const base = normalizeState({ ...state, prompt: null, deliveryDue: null }, dateKey,
    firstReminderMinutes(config), repeatReminderMinutes(config), todayUsedSeconds,
    restUsageReminderWeeklyConfigValue(config), weekUsedSeconds);
  const covered = prompt.reminders || [{ scope: 'daily', periodKey: state.dateKey }];
  if (covered.some((r) => r.scope === 'daily' && r.periodKey === base.dateKey) && base.firstReminderMinutes === (prompt.reminders?.find((r) => r.scope === 'daily')?.softLimitMinutes ?? prompt.softLimitMinutes)) {
    base.lastAcknowledgedUsageSeconds = todayUsedSeconds;
    base.nextThresholdSeconds = todayUsedSeconds + softReminderRepeatMinutes(base.acknowledgementCount || 0) * 60;
    base.acknowledgementCount = (base.acknowledgementCount || 0) + 1;
  }
  if (covered.some((r) => r.scope === 'weekly' && r.periodKey === base.weekly.weekKey && r.softLimitMinutes === base.weekly.firstReminderMinutes)) {
    base.weekly.lastAcknowledgedUsageSeconds = weekUsedSeconds;
    base.weekly.nextThresholdSeconds = weekUsedSeconds + softReminderRepeatMinutes(base.weekly.acknowledgementCount || 0) * 60;
    base.weekly.acknowledgementCount = (base.weekly.acknowledgementCount || 0) + 1;
  }
  const next = await writeState({
    ...base,
    deliveryDue: null,
    prompt: null,
    lastResolution: { token: prompt.token, action: 'continue', reason, at: Date.now() },
  });
  await Promise.all([
    clearAlarm(REST_USAGE_REMINDER_DEADLINE_ALARM),
    clearAlarm(REST_USAGE_REMINDER_RETRY_ALARM),
  ]);
  if (options.resumeMedia !== false) {
    await chrome.tabs.sendMessage(prompt.sourceTabId, {
      type: 'RESUME_REST_USAGE_MEDIA',
      token: prompt.token,
    }).catch(() => null);
  }
  return { ok: true, action: 'continue', nextThresholdSeconds: next.nextThresholdSeconds, state: next };
}

async function attemptDelivery(deps, state, now) {
  const due = state?.deliveryDue;
  if (!due?.token) return { ok: true, skipped: 'no_delivery_due', state };

  const context = await currentForegroundRestContext(deps, !due.schedule);
  if (!context) return { ok: true, skipped: 'no_foreground_rest_session', deliveryPending: true, state };
  if (due.schedule && context.tab.id !== due.sourceTabId) return endPrompt(deps, state, 'schedule_target_changed');

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

function buildDeliveryDue({ state, context, firstMinutes, todayUsedSeconds, weekUsedSeconds, effectiveQuota, timeoutAction, now, reminders }) {
  const reminderKind = state.lastAcknowledgedUsageSeconds !== null
    && Number.isFinite(Number(state.lastAcknowledgedUsageSeconds))
    ? 'repeat'
    : 'first';
  return {
    token: randomToken(),
    sourceTabId: context.tab.id,
    sourceHost: context.tab.url ? new URL(context.tab.url).hostname : null,
    dueAt: now,
    deliveryAttempts: 0,
    nextRetryAt: null,
    reminderKind,
    reminders,
    softLimitMinutes: firstMinutes,
    overageSeconds: Math.max(0, todayUsedSeconds - firstMinutes * 60),
    todayUsedSeconds,
    todayRemainingSeconds: remainingSeconds(effectiveQuota.restMinutes, todayUsedSeconds),
    weekUsedSeconds,
    weekRemainingSeconds: remainingSeconds(effectiveQuota.weeklyRestMinutes, weekUsedSeconds),
    timeoutAction,
  };
}

export function configureRestUsageReminder(deps) {
  runtimeDeps = deps;
}

export function suspendLegacyRestUsageReminder(suspended) {
  sharedRuntimeSuspended = suspended === true;
  return runSerialized(async () => {
    if (!sharedRuntimeSuspended) return { ok: true };
    const state = await readState(), prompt = state?.prompt || state?.deliveryDue;
    if (state) await writeState({ ...state, prompt: null, deliveryDue: null });
    await Promise.all([clearAlarm(REST_USAGE_REMINDER_DEADLINE_ALARM), clearAlarm(REST_USAGE_REMINDER_RETRY_ALARM)]);
    if (prompt?.token) {
      await chrome.tabs.sendMessage(prompt.sourceTabId, { type: 'DISMISS_REST_USAGE_REMINDER', token: prompt.token }).catch(() => null);
      await chrome.tabs.sendMessage(prompt.sourceTabId, { type: 'RESUME_REST_USAGE_MEDIA', token: prompt.token }).catch(() => null);
    }
    return { ok: true };
  });
}

export function restUsageReminderConfigValue(config = {}) {
  return firstReminderMinutes(config);
}

export function restUsageReminderRepeatConfigValue(config = {}) {
  return repeatReminderMinutes(config);
}

export function restUsageReminderTimeoutAction(config = {}) {
  return softReminderTimeoutAction(config);
}

export async function requestScheduleUsageConfirmation(schedule, options = {}) {
  return runSerialized(async () => {
    const deps = options.deps || runtimeDeps;
    if (!deps || !schedule) return { ok: false, error: 'schedule_confirmation_unavailable' };
    const now = options.now ?? Date.now();
    let raw = await readState();
    const outstanding = raw?.prompt || raw?.deliveryDue;
    if (outstanding?.token && outstanding.sourceTabId !== schedule.tabId) return { ok: false, error: 'confirmation_busy' };
    if (outstanding?.schedule && (outstanding.schedule.key !== schedule.key || outstanding.identityScope !== await readScheduleConfirmationScope())) {
      await chrome.tabs.sendMessage(outstanding.sourceTabId, { type: 'DISMISS_REST_USAGE_REMINDER', token: outstanding.token }, { frameId: 0 }).catch(() => null);
      raw = await writeState({ ...raw, prompt: null, deliveryDue: null });
      await Promise.all([clearAlarm(REST_USAGE_REMINDER_DEADLINE_ALARM), clearAlarm(REST_USAGE_REMINDER_RETRY_ALARM)]);
    }
    if (raw?.prompt?.token) return { ok: true, pending: true };
    if (raw?.deliveryDue?.token) {
      const deliveryDue = { ...raw.deliveryDue, schedule, identityScope: await readScheduleConfirmationScope() };
      return attemptDelivery(deps, await writeState({ ...raw, deliveryDue }), now);
    }
    const config = await deps.getConfig(), dateKey = deps.getDateKey(new Date(now));
    let usage;
    try { usage = await deps.getQuotaUsageView(dateKey, { config }); } catch { usage = null; }
    const known = usage?.ok !== false && Number.isFinite(usage?.restSeconds) && Number.isFinite(usage?.weekRestSeconds);
    const today = known ? usage.restSeconds : null, week = known ? usage.weekRestSeconds : null;
    const first = firstReminderMinutes(config), weekly = restUsageReminderWeeklyConfigValue(config);
    const state = normalizeState(raw, dateKey, first, 60, today, weekly, week);
    const reminders = [];
    if (known && first !== null && today >= state.nextThresholdSeconds) reminders.push({ scope: 'daily', periodKey: dateKey,
      reminderKind: state.lastAcknowledgedUsageSeconds == null ? 'first' : 'repeat', softLimitMinutes: first, overageSeconds: Math.max(0, today - first * 60) });
    if (known && weekly !== null && week >= state.weekly.nextThresholdSeconds) reminders.push({ scope: 'weekly', periodKey: state.weekly.weekKey,
      reminderKind: state.weekly.lastAcknowledgedUsageSeconds == null ? 'first' : 'repeat', softLimitMinutes: weekly, overageSeconds: Math.max(0, week - weekly * 60) });
    const effectiveQuota = getEffectiveQuotaForDate(config, new Date(now)).todayEffectiveQuota;
    const due = { ...buildDeliveryDue({ state, context: { tab: { id: schedule.tabId } }, firstMinutes: first,
      todayUsedSeconds: today, weekUsedSeconds: week, effectiveQuota, timeoutAction: 'end_rest', now, reminders }),
      schedule, identityScope: await readScheduleConfirmationScope(), confirmationKind: 'schedule', usageKnown: known };
    return attemptDelivery(deps, await writeState({ ...state, deliveryDue: due }), now);
  });
}

export async function evaluateRestUsageReminder(options = {}) {
  return runSerialized(async () => {
    const currentState = await readState();
    if (sharedRuntimeSuspended && !(currentState?.prompt?.schedule || currentState?.deliveryDue?.schedule)) return { ok: true, skipped: 'shared_runtime_active' };
    const deps = options.deps || runtimeDeps;
    if (!deps) return { ok: false, error: 'rest_reminder_not_configured' };
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const dateKey = deps.getDateKey(new Date(now));
    const config = await deps.getConfig();
    const firstMinutes = firstReminderMinutes(config);
    const weeklyMinutes = restUsageReminderWeeklyConfigValue(config);
    const repeatMinutes = repeatReminderMinutes(config);
    if (currentState?.prompt?.token) {
      if (now >= Number(currentState.prompt.deadlineAt || 0)) {
        return endPrompt(deps, currentState, 'confirmation_timeout');
      }
      return { ok: true, pending: true, state: currentState };
    }
    const usage = await deps.getQuotaUsageView(dateKey, { config });
    if (usage?.ok === false || !Number.isFinite(usage?.restSeconds) || !Number.isFinite(usage?.weekRestSeconds)) {
      return { ok: false, error: usage?.error || 'rest_usage_unavailable' };
    }
    const todayUsedSeconds = Math.max(0, Number(usage?.restSeconds) || 0);
    const weekUsedSeconds = Math.max(0, Number(usage?.weekRestSeconds) || 0);
    let state = normalizeState(currentState, dateKey, firstMinutes, repeatMinutes, todayUsedSeconds, weeklyMinutes, weekUsedSeconds);

    if (state.prompt?.token) {
      if (now >= Number(state.prompt.deadlineAt || 0)) {
        return endPrompt(deps, state, 'confirmation_timeout');
      }
      return { ok: true, pending: true, state };
    }

    if (firstMinutes === null && weeklyMinutes === null && !state.deliveryDue?.schedule) {
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

    const reminders = [];
    if (firstMinutes !== null && todayUsedSeconds >= state.nextThresholdSeconds) reminders.push({
      scope: 'daily', periodKey: dateKey, reminderKind: state.lastAcknowledgedUsageSeconds == null ? 'first' : 'repeat',
      softLimitMinutes: firstMinutes, overageSeconds: Math.max(0, todayUsedSeconds - firstMinutes * 60),
    });
    if (weeklyMinutes !== null && weekUsedSeconds >= state.weekly.nextThresholdSeconds) reminders.push({
      scope: 'weekly', periodKey: state.weekly.weekKey, reminderKind: state.weekly.lastAcknowledgedUsageSeconds == null ? 'first' : 'repeat',
      softLimitMinutes: weeklyMinutes, overageSeconds: Math.max(0, weekUsedSeconds - weeklyMinutes * 60),
    });
    if (!reminders.length) {
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
      timeoutAction: softReminderTimeoutAction(config),
      now,
      reminders,
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
    if (sharedRuntimeSuspended && !prompt?.schedule) return { ok: false, error: 'legacy_rest_reminder_inactive' };
    if (!prompt?.token || message.token !== prompt.token) return { ok: false, error: 'stale_prompt' };
    if (!Number.isInteger(sender?.tab?.id) || sender.tab.id !== prompt.sourceTabId) {
      return { ok: false, error: 'invalid_prompt_sender' };
    }
    if (sender.frameId !== undefined && sender.frameId !== 0) return { ok: false, error: 'invalid_prompt_sender' };
    if (now >= Number(prompt.deadlineAt || 0)) {
      return endPrompt(deps, state, 'confirmation_timeout');
    }
    if (message.action === 'end') return endPrompt(deps, state, 'user_end');
    if (message.action !== 'continue') return { ok: false, error: 'invalid_prompt_action' };
    if (!isAutonomyConfirmationText(message.confirmationText)) return { ok: false, error: 'confirmation_text_required' };

    return continuePrompt(deps, state, 'user_continue');
  });
}

export async function restoreRestUsageReminderForTab(tabId, options = {}) {
  return runSerialized(async () => {
    const deps = options.deps || runtimeDeps;
    if (!deps || !Number.isInteger(tabId)) return { ok: false, error: 'invalid_restore' };
    const state = await readState();
    if (sharedRuntimeSuspended && !(state?.prompt?.schedule || state?.deliveryDue?.schedule)) return { ok: true, skipped: 'shared_runtime_active' };
    const pending = state?.prompt || state?.deliveryDue;
    if (pending?.schedule && pending.sourceTabId === tabId) {
      const current = await deps.getScheduleContext?.(tabId);
      if (!current || current.key !== pending.schedule.key || pending.identityScope !== await readScheduleConfirmationScope()) {
        await chrome.tabs.sendMessage(tabId, { type: 'DISMISS_REST_USAGE_REMINDER', token: pending.token }, { frameId: 0 }).catch(() => null);
        await writeState({ ...state, prompt: null, deliveryDue: null });
        await Promise.all([clearAlarm(REST_USAGE_REMINDER_DEADLINE_ALARM), clearAlarm(REST_USAGE_REMINDER_RETRY_ALARM)]);
        return { ok: true, skipped: 'confirmation_context_changed' };
      }
    }
    const prompt = state?.prompt;
    if (prompt?.token && prompt.sourceTabId === tabId) {
      if (Date.now() >= Number(prompt.deadlineAt || 0)) {
        return endPrompt(deps, state, 'confirmation_timeout');
      }
      const visible = await showPrompt(prompt);
      const activated = visible ? await activatePrompt(prompt) : false;
      return { ok: true, restored: true, visible: activated };
    }

    if (!state?.deliveryDue?.token || state.deliveryDue.sourceTabId !== tabId) {
      return { ok: true, skipped: 'no_prompt' };
    }
    return attemptDelivery(deps, state, Date.now());
  });
}

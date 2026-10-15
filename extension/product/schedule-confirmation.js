import { budgetedSessionSet } from '../infra/session-storage-budget.js';

const KEY = 'schedule_confirmation_grants_v1';
const WAITERS_KEY = 'schedule_confirmation_waiters_v1';
export async function readScheduleConfirmationScope() {
  const identity = await chrome.storage.local.get(['cloud_profile_id', 'cloud_device_id']);
  return JSON.stringify([identity.cloud_profile_id ?? null, identity.cloud_device_id ?? null]);
}
export async function hasScheduleConfirmation(context) {
  if (!context) return false;
  const data = await chrome.storage.session.get(KEY);
  const scope = await readScheduleConfirmationScope();
  return data[KEY]?.[context.key]?.scope === scope;
}
export async function readScheduleConfirmationGrant(context) {
  if (!context?.key) return null;
  const data = await chrome.storage.session.get(KEY);
  const grant = data[KEY]?.[context.key];
  return grant?.scope === await readScheduleConfirmationScope() ? grant : null;
}
export async function grantScheduleConfirmation(context) {
  const data = await chrome.storage.session.get(KEY);
  const scope = await readScheduleConfirmationScope();
  const grants = { ...(data[KEY] || {}), [context.key]: {
    scope, at: Date.now(), host: context.host, managedTargetId: context.managedTargetId || null,
  } };
  const retained = Object.fromEntries(Object.entries(grants).sort((a, b) => b[1].at - a[1].at).slice(0, 64));
  await budgetedSessionSet({ [KEY]: retained }, { priority: 'critical', source: 'schedule_confirmation' });
}
export async function revokeScheduleConfirmation(context) {
  if (!context?.key) return;
  const data = await chrome.storage.session.get(KEY);
  const grants = { ...(data[KEY] || {}) };
  delete grants[context.key];
  await budgetedSessionSet({ [KEY]: grants }, { priority: 'critical', source: 'schedule_confirmation' });
}

export async function registerScheduleConfirmationWaiter(context, targetUrl) {
  if (!context?.key || !Number.isInteger(context.tabId)) return false;
  try {
    const parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.hostname !== context.host) return false;
  } catch { return false; }
  const data = await chrome.storage.session.get(WAITERS_KEY);
  const scope = await readScheduleConfirmationScope();
  const waiters = { ...(data[WAITERS_KEY] || {}), [context.tabId]: {
    key: context.key, scope, targetUrl, at: Date.now(),
  } };
  const retained = Object.fromEntries(Object.entries(waiters).sort((a, b) => b[1].at - a[1].at).slice(0, 16));
  await budgetedSessionSet({ [WAITERS_KEY]: retained }, { priority: 'critical', source: 'schedule_confirmation' });
  return true;
}

async function takeScheduleConfirmationWaiters(context) {
  const data = await chrome.storage.session.get(WAITERS_KEY);
  const scope = await readScheduleConfirmationScope();
  const waiters = data[WAITERS_KEY] || {};
  const matching = Object.entries(waiters).filter(([, value]) => value.key === context.key && value.scope === scope);
  if (matching.length) {
    const retained = Object.fromEntries(Object.entries(waiters).filter(([, value]) => value.key !== context.key || value.scope !== scope));
    await budgetedSessionSet({ [WAITERS_KEY]: retained }, { priority: 'critical', source: 'schedule_confirmation' });
  }
  return matching;
}

export async function clearScheduleConfirmationWaiters(context) {
  if (context?.key) await takeScheduleConfirmationWaiters(context);
}

export async function resumeScheduleConfirmationWaiter(context, tabId, targetUrl) {
  if (!context?.key || !Number.isInteger(tabId) || !targetUrl) return false;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const reminderBase = chrome.runtime.getURL('reminder.html');
  if (!tab?.url?.startsWith(`${reminderBase}?`)) return false;
  const url = new URL(tab.url);
  if (url.searchParams.get('sourceTabId') !== String(tabId) ||
      url.searchParams.get('targetUrl') !== targetUrl ||
      url.searchParams.get('reason') !== `${context.mode}_schedule_locked` ||
      url.searchParams.get('confirmationFailure') !== 'pending_elsewhere') return false;
  return !!await chrome.tabs.update(tabId, { url: targetUrl }).catch(() => null);
}

export async function releaseScheduleConfirmationWaiters(context) {
  if (!context?.key) return;
  const waiters = await takeScheduleConfirmationWaiters(context);
  for (const [id, waiter] of waiters) {
    await resumeScheduleConfirmationWaiter(context, Number(id), waiter.targetUrl);
  }
}

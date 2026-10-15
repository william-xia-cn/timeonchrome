import { budgetedSessionSet } from '../infra/session-storage-budget.js';

const KEY = 'schedule_confirmation_grants_v1';
export async function readScheduleConfirmationScope() {
  const identity = await chrome.storage.local.get(['cloud_profile_id', 'cloud_device_id']);
  return JSON.stringify([identity.cloud_profile_id ?? null, identity.cloud_device_id ?? null]);
}
export async function hasScheduleConfirmation(context) {
  if (!context) return false;
  const data = await chrome.storage.session.get(KEY);
  const scope = await readScheduleConfirmationScope();
  return data[KEY]?.[context.tabId]?.key === context.key && data[KEY][context.tabId].scope === scope;
}
export async function grantScheduleConfirmation(context) {
  const data = await chrome.storage.session.get(KEY);
  const scope = await readScheduleConfirmationScope();
  const grants = { ...(data[KEY] || {}), [context.tabId]: { key: context.key, scope, at: Date.now() } };
  const retained = Object.fromEntries(Object.entries(grants).sort((a, b) => b[1].at - a[1].at).slice(0, 64));
  await budgetedSessionSet({ [KEY]: retained }, { priority: 'critical', source: 'schedule_confirmation' });
}
export async function revokeScheduleConfirmation(tabId) {
  const data = await chrome.storage.session.get(KEY);
  const grants = { ...(data[KEY] || {}) };
  delete grants[tabId];
  await budgetedSessionSet({ [KEY]: grants }, { priority: 'critical', source: 'schedule_confirmation' });
}

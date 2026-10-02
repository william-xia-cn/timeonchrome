import { requestSharedReminderLifecycle, getSharedBrowserActivityLease } from '../infra/native-host-client.js';
import { createSharedReminderLifecycle } from '../infra/shared-reminder-lifecycle.js';
import { sharedReminderIdentity, validateSharedReminderMessage, validateSharedReminderState } from '../core/shared-reminder-lifecycle.js';

const ACTION = 'SHARED_REMINDER_ACTION';
const DISMISSED = 'SHARED_REMINDER_DISMISSED';
let current = null;
let registered = false;

export function createSharedReminderContentBridge({ enabled = false, request = requestSharedReminderLifecycle,
  tabs = chrome.tabs, windows = chrome.windows, runtimeId = chrome.runtime.id,
  readLease = getSharedBrowserActivityLease, deliveryTimeoutMs = 3000 } = {}) {
  let binding = null;
  let identity = null;
  let generation = 0;
  async function bounded(operation) {
    let timer;
    try { return await Promise.race([Promise.resolve().then(operation),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), Math.min(3000, Math.max(1, deliveryTimeoutMs))); })]); }
    catch (_) { return null; }
    finally { clearTimeout(timer); }
  }
  async function sameTab(target = binding, cleanup = false) {
    if (!target) return false;
    const tab = await bounded(() => tabs.get(target.id));
    if (tab?.id !== target.id || tab.windowId !== target.windowId || tab.url !== target.url) return false;
    if (cleanup) return true;
    const window = await bounded(() => windows.get(target.windowId));
    return target === binding && tab.active === true && window?.focused === true && window.state !== 'minimized';
  }
  async function send(type, state, target = binding, cleanup = false) {
    if (!await sameTab(target, cleanup)) return { ok: false, visible: false };
    return await bounded(() => tabs.sendMessage(target.id,
      { type, state, presentationId: target.presentationId }, { frameId: 0 })) || { ok: false, visible: false };
  }
  async function revokeDisplay(target, previousIdentity) {
    if (target && previousIdentity) await send('DISMISS_SHARED_REMINDER', previousIdentity, target, true);
  }
  const lifecycle = createSharedReminderLifecycle({ enabled,
    request: async (method, payload) => {
      const captured = generation;
      const target = binding;
      if (!await sameTab(target) || captured !== generation || target?.lease !== readLease()) {
        await invalidate();
        return { ok: false, errorCode: 'shared_reminder_context_changed' };
      }
      const response = await bounded(() => request(method, payload));
      if (captured !== generation) return { ok: false, errorCode: 'shared_reminder_context_changed' };
      const checked = response?.ok ? validateSharedReminderState(response.state,
        method === 'getSharedReminderState' ? { date: payload.date } : sharedReminderIdentity(payload)) : null;
      if (!response || !await sameTab(target) || target.lease !== readLease()
        || (response.ok && !checked?.ok) || (!response.ok && response.errorCode !== 'shared_reminder_busy')) {
        await invalidate();
        return { ok: false, errorCode: 'shared_reminder_context_changed' };
      }
      return response;
    },
    present: async state => {
      const target = binding;
      if (!target) return { visible: false };
      target.presentationId = crypto.randomUUID();
      identity = sharedReminderIdentity(state);
      const expected = identity;
      const reply = await send('SHOW_SHARED_REMINDER', state, target);
      const visible = reply?.ok === true && reply.visible === true && target === binding
        && reply.presentationId === target.presentationId
        && JSON.stringify(reply.identity) === JSON.stringify(expected) && await sameTab(target);
      if (!visible) await revokeDisplay(target, expected);
      return { visible };
    },
    update: async state => {
      const target = binding;
      const reply = await send('ACTIVATE_SHARED_REMINDER', state);
      if (!reply?.ok || !reply.visible || target !== binding || reply.presentationId !== target.presentationId
        || JSON.stringify(reply.identity) !== JSON.stringify(sharedReminderIdentity(state)) || !await sameTab(target)) {
        await invalidate();
        throw new Error('shared_reminder_display_unavailable');
      }
    },
    dismiss: async () => {
      const target = binding;
      const previous = identity;
      identity = null;
      await revokeDisplay(target, previous);
    },
  });
  async function invalidate() {
    const target = binding;
    const previous = identity;
    generation++;
    binding = null;
    identity = null;
    await lifecycle.invalidate();
    await revokeDisplay(target, previous);
  }
  return {
    async poll(tabId, date) {
      if (enabled !== true) return { ok: true, skipped: true, reason: 'shared_reminder_disabled' };
      if (lifecycle.inspect().busy) return { ok: false, errorCode: 'shared_reminder_busy' };
      const tab = await bounded(() => tabs.get(tabId));
      if (!tab?.active || !/^https?:\/\//.test(tab.url || '')) return { ok: false, errorCode: 'shared_reminder_tab_unavailable' };
      if (binding && (binding.id !== tab.id || binding.windowId !== tab.windowId || binding.url !== tab.url)) {
        await invalidate();
      }
      if (!binding) binding = { id: tab.id, windowId: tab.windowId, url: tab.url,
        presentationId: crypto.randomUUID(), lease: readLease() };
      if (!await sameTab()) { await invalidate(); return { ok: false, errorCode: 'shared_reminder_tab_unavailable' }; }
      return lifecycle.poll(date);
    },
    async handleAction(message, sender) {
      if (enabled !== true) return { ok: false, errorCode: 'shared_reminder_disabled' };
      if (sender?.id !== runtimeId || sender.frameId !== 0 || sender.tab?.id !== binding?.id
        || sender.tab?.windowId !== binding?.windowId || sender.url !== binding?.url
        || message.presentationId !== binding?.presentationId || !await sameTab()) {
        return { ok: false, errorCode: 'shared_reminder_sender_rejected' };
      }
      if (message.type === DISMISSED) {
        if (!identity || !message.payload || Object.keys(message.payload).length !== Object.keys(identity).length
          || Object.keys(identity).some(key => message.payload[key] !== identity[key])) {
          return { ok: false, errorCode: 'SHARED_REMINDER_INSTANCE_CHANGED' };
        }
        await invalidate();
        return { ok: true };
      }
      const checked = validateSharedReminderMessage(message?.payload, 'resolveSharedReminder');
      if (!checked.ok) return checked;
      if (!identity || Object.keys(identity).some(key => checked.payload[key] !== identity[key])) {
        return { ok: false, errorCode: 'SHARED_REMINDER_INSTANCE_CHANGED' };
      }
      return lifecycle.choose(checked.payload.action);
    },
    invalidate,
    invalidateTab: async (tabId, windowId) => {
      if (binding && (tabId === binding.id || (tabId == null && windowId === binding.windowId))) await invalidate();
    },
    inspect: lifecycle.inspect,
  };
}

// Only an explicit candidate caller can configure this; no cloud flag or page message enables it.
export function configureSharedReminderContentBridge(options = {}) {
  if (current?.inspect().displayed || current?.inspect().busy) return { ok: false, errorCode: 'shared_reminder_busy' };
  current = createSharedReminderContentBridge(options);
  return { ok: true };
}
export function pollSharedReminderForTab(tabId, date) {
  return current?.poll(tabId, date) || Promise.resolve({ ok: true, skipped: true, reason: 'shared_reminder_disabled' });
}
export function initSharedReminderContentBridge() {
  if (registered) return;
  registered = true;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (![ACTION, DISMISSED].includes(message?.type)) return false;
    Promise.resolve(current?.handleAction(message, sender) || { ok: false, errorCode: 'shared_reminder_disabled' })
      .then(respond, () => respond({ ok: false, errorCode: 'shared_reminder_unavailable' }));
    return true;
  });
  // UI lifetime only: these listeners never open/close a webpage accounting session.
  const ignoreFailure = promise => Promise.resolve(promise).catch(() => {});
  chrome.tabs.onUpdated.addListener((id, change) => {
    if (change.url || change.status === 'loading') ignoreFailure(current?.invalidateTab(id));
  });
  chrome.tabs.onRemoved.addListener(id => ignoreFailure(current?.invalidateTab(id)));
  chrome.tabs.onReplaced.addListener((_added, removed) => ignoreFailure(current?.invalidateTab(removed)));
  chrome.tabs.onActivated.addListener(() => ignoreFailure(current?.invalidate()));
  chrome.windows.onFocusChanged.addListener(() => ignoreFailure(current?.invalidate()));
  chrome.windows.onBoundsChanged.addListener(window => {
    if (window.state === 'minimized') ignoreFailure(current?.invalidateTab(null, window.id));
  });
}

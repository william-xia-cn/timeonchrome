import { getSession } from '../runtime/session.js';
import { confirmForegroundPageCheckpoint } from '../core/foreground-timing.js';
import { extractDomain } from '../infra/storage.js';
import { observeSharedBrowserActivityLease, reportSharedBrowserActivity } from '../infra/native-host-client.js';

function sessionKey(session) {
  if (session?.state !== 'ACTIVE' || session.quotaBucketAtTime !== 'rest'
    || !Number.isInteger(session.tabId) || !Number.isInteger(session.windowId) || !session.domain) return null;
  return JSON.stringify([session.tabId, session.windowId, session.domain, session.quotaBucketAtTime,
    session.targetClassificationAtTime ?? null, session.targetKeyAtTime ?? null]);
}

// Verify the live page independently of persisted ACTIVE, without settling it.
export async function readBrowserRestActivity({ readSession = getSession,
  confirm = confirmForegroundPageCheckpoint, tabs = chrome.tabs, windows = chrome.windows } = {}) {
  try {
    const session = await readSession();
    const key = sessionKey(session);
    if (!key) return { active: false };
    const evidence = await confirm(session);
    if (!evidence?.ok || evidence.observedState !== 'ACTIVE' || evidence.idleState === 'locked'
      || evidence.tabId !== session.tabId || evidence.windowId !== session.windowId
      || evidence.observedDomain !== session.domain) return { active: false };
    const tab = await tabs.get(session.tabId);
    const win = await windows.get(session.windowId);
    if (!tab?.active || tab.id !== session.tabId || tab.windowId !== session.windowId || !/^https?:\/\//.test(tab.url || '')
      || extractDomain(tab.url) !== session.domain
      || win.state === 'minimized' || (evidence.observedUrl && evidence.observedUrl !== tab.url)) return { active: false };
    const visibility = await tabs.sendMessage(tab.id, { type: 'GET_MEDIA_SNAPSHOT' }, { frameId: 0 }).catch(() => null);
    const latestTab = await tabs.get(session.tabId);
    const latestWindow = await windows.get(session.windowId);
    if (sessionKey(await readSession()) !== key || !latestTab?.active || latestTab.windowId !== session.windowId
      || latestTab.url !== tab.url || latestWindow.state === 'minimized') return { active: false };
    return { active: true, key: JSON.stringify([key, tab.url]),
      presentationEligible: latestWindow.focused === true && visibility?.documentVisible === true };
  } catch (_) {
    return { active: false };
  }
}

export function createSharedBrowserActivity({ enabled = false, sample = readBrowserRestActivity,
  send = reportSharedBrowserActivity, uuid = () => crypto.randomUUID(),
  schedule = (callback, ms) => setInterval(callback, ms), cancel = timer => clearInterval(timer),
  deadline = (callback, ms) => setTimeout(callback, ms), clearDeadline = timer => clearTimeout(timer) } = {}) {
  let lease = null;
  let sequenceLease = null;
  let sequence = 0;
  let epoch = 0;
  let timer = null;
  let sampling = false;
  let key = null;
  let activityId = null;
  let active = false;
  function stopTimer() {
    if (timer !== null) cancel(timer);
    timer = null;
  }
  function publish(nextActive, eligible = false) {
    if (!lease || sequence >= Number.MAX_SAFE_INTEGER) return;
    if (!activityId) activityId = uuid();
    const payload = { schemaVersion: 1, leaseId: lease, activityId, sequence: ++sequence,
      status: nextActive ? 'active' : 'inactive', quotaBucket: nextActive ? 'rest' : null,
      presentationEligible: nextActive && eligible === true };
    // Native coalesces the latest queued fact. ACKs never mutate local activity.
    try { Promise.resolve(send(payload)).catch(() => {}); } catch (_) {}
  }
  async function tick() {
    if (!enabled || !lease || sampling) return;
    const token = epoch;
    sampling = true;
    let timeout;
    try {
      const fact = await Promise.race([Promise.resolve().then(sample),
        new Promise(resolve => { timeout = deadline(() => resolve({ active: false }), 3000); })]);
      if (token !== epoch || !enabled || !lease) return;
      if (fact?.active === true && typeof fact.key === 'string' && fact.key) {
        if (!active || key !== fact.key) {
          if (active) publish(false);
          activityId = uuid();
        }
        key = fact.key;
        active = true;
        publish(true, fact.presentationEligible);
      } else {
        key = null;
        active = false;
        publish(false);
      }
    } catch (_) {
      if (token === epoch && enabled && lease) { key = null; active = false; publish(false); }
    } finally { clearDeadline(timeout); sampling = false; }
  }
  function invalidate() {
    epoch++;
    key = null;
    active = false;
    if (enabled) publish(false);
  }
  return {
    tick,
    invalidate,
    setLease(value) {
      const next = typeof value === 'string' && value.trim() && value.length <= 128 ? value : null;
      if (next === lease) return;
      epoch++;
      stopTimer();
      lease = next;
      key = null;
      activityId = null;
      active = false;
      if (next && next !== sequenceLease) { sequenceLease = next; sequence = 0; }
      if (enabled && lease) { timer = schedule(() => { void tick(); }, 5000); void tick(); }
    },
    configure(value) {
      if (enabled === (value === true)) return;
      invalidate();
      enabled = value === true;
      stopTimer();
      if (enabled && lease) { timer = schedule(() => { void tick(); }, 5000); void tick(); }
    },
  };
}

let controller = null;
export function configureSharedBrowserActivity({ enabled = false } = {}) {
  controller?.configure(enabled);
}
export function initSharedBrowserActivity() {
  if (controller) return;
  controller = createSharedBrowserActivity();
  observeSharedBrowserActivityLease(value => controller.setLease(value));
  const invalidate = () => controller.invalidate();
  chrome.tabs.onActivated.addListener(invalidate);
  chrome.tabs.onRemoved.addListener(invalidate);
  chrome.tabs.onReplaced.addListener(invalidate);
  chrome.tabs.onUpdated.addListener((_id, change) => {
    if (change.url || change.status === 'loading') invalidate();
  });
  chrome.windows.onFocusChanged.addListener(invalidate);
  chrome.windows.onRemoved.addListener(invalidate);
  chrome.windows.onBoundsChanged?.addListener(win => { if (win.state === 'minimized') invalidate(); });
  chrome.idle.onStateChanged.addListener(invalidate);
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.id === chrome.runtime.id && sender.tab && message?.type === 'MEDIA_STATE'
      && (message.playing === false || message.documentVisible === false)) invalidate();
    return undefined;
  });
}

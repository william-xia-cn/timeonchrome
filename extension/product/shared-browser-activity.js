import { getSession } from '../runtime/session.js';
import { confirmForegroundPageCheckpoint } from '../core/foreground-timing.js';
import { extractDomain } from '../infra/storage.js';
import { observeSharedBrowserActivityLease, reportSharedBrowserActivity } from '../infra/native-host-client.js';
import { checkSharedActivityAckV2 } from '../core/shared-forced-use-runtime-v2.js';

function sessionKey(session, quotaBuckets = ['rest']) {
  if (session?.state !== 'ACTIVE' || !quotaBuckets.includes(session.quotaBucketAtTime)
    || !Number.isInteger(session.tabId) || !Number.isInteger(session.windowId) || !session.domain) return null;
  return JSON.stringify([session.tabId, session.windowId, session.domain, session.quotaBucketAtTime,
    session.targetClassificationAtTime ?? null, session.targetKeyAtTime ?? null]);
}

// Verify the live page independently of persisted ACTIVE, without settling it.
export async function readBrowserRestActivity({ readSession = getSession,
  confirm = confirmForegroundPageCheckpoint, tabs = chrome.tabs, windows = chrome.windows,
  quotaBuckets = ['rest'] } = {}) {
  try {
    const session = await readSession();
    const key = sessionKey(session, quotaBuckets);
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
    if (sessionKey(await readSession(), quotaBuckets) !== key || !latestTab?.active || latestTab.windowId !== session.windowId
      || latestTab.url !== tab.url || latestWindow.state === 'minimized') return { active: false };
    return { active: true, key: JSON.stringify([key, tab.url]),
      quotaBucket: session.quotaBucketAtTime, tabId: session.tabId, windowId: session.windowId,
      domain: session.domain, url: tab.url,
      presentationEligible: latestWindow.focused === true && visibility?.documentVisible === true };
  } catch (_) {
    return { active: false };
  }
}

export function readBrowserActiveActivity(options = {}) {
  return readBrowserRestActivity({ ...options, quotaBuckets: ['study', 'composite', 'rest', 'other'] });
}

export function createSharedBrowserActivityV2({ enabled = false, sample = readBrowserActiveActivity,
  readContext, readRound, retireRound, resumeIndependent, send = reportSharedBrowserActivity,
  onOwnershipChanged = async () => {}, uuid = () => crypto.randomUUID(), now = () => performance.now() } = {}) {
  let leaseId = null, sequence = 0, activityId = null, key = null;
  let generation = 0, busy = false, owned = false;
  let acknowledgedAt = null;
  async function release() {
    owned = false;
    try { await onOwnershipChanged(false); }
    finally { await resumeIndependent?.(); }
  }
  async function tick() {
    if (!enabled || !leaseId || busy) return { ok: true, skipped: true };
    busy = true;
    const epoch = generation, lease = leaseId;
    let suspended = false;
    let accepted = false;
    try {
      const fact = await sample();
      const context = await readContext(fact);
      if (!context?.ok || epoch !== generation) return { ok: false, errorCode: 'shared_activity_context_changed' };
      const activityKey = fact.key || context.activityKey || null;
      if (!activityId || key !== activityKey) { activityId = uuid(); key = activityKey; }
      const round = await readRound();
      if (!round?.ok) return { ok: false, errorCode: 'independent_round_unavailable' };
      suspended = true;
      const retired = await retireRound(round.roundId);
      if (!retired?.ok || retired.retiredIndependentRoundId !== round.roundId || epoch !== generation) {
        return { ok: false, errorCode: 'independent_round_not_retired' };
      }
      const pending = context.pendingEntry === true;
      const active = fact.active === true && !pending;
      const payload = { schemaVersion: 2, leaseId: lease, activityId, sequence: ++sequence,
        status: pending ? 'pending-entry' : active ? 'active' : 'inactive',
        quotaBucket: pending ? context.quotaBucket : active ? fact.quotaBucket : null,
        presentationEligible: pending ? context.presentationEligible === true : active && fact.presentationEligible === true,
        policyIdentity: context.policyIdentity, ruleScopeKey: active || pending ? context.ruleScopeKey : null,
        reasonCodes: active || pending ? context.reasonCodes : [], independentRoundId: round.roundId };
      const reply = await send(payload);
      const checked = reply?.ok ? checkSharedActivityAckV2(reply.receipt, payload) : null;
      if (!checked?.ok || epoch !== generation || leaseId !== lease) return { ok: false, errorCode: 'shared_activity_ownership_unconfirmed' };
      owned = true;
      acknowledgedAt = now();
      await onOwnershipChanged(true, context, fact, checked.receipt);
      accepted = true;
      return { ok: true, receipt: checked.receipt };
    } catch (_) { return { ok: false, errorCode: 'shared_activity_unavailable' }; }
    finally {
      if (suspended && (!accepted || epoch !== generation)) await release().catch(() => {});
      busy = false;
    }
  }
  return { tick, inspect: () => ({ leaseId, activityId, key,
    owned: owned && acknowledgedAt !== null && now() >= acknowledgedAt && now() - acknowledgedAt < 15000, busy }),
    async setLease(value) {
      const next = typeof value === 'string' && value ? value : null;
      if (next === leaseId) return;
      generation++; leaseId = next; sequence = 0; activityId = null; key = null;
      await release();
    },
    async invalidate() { generation++; await release(); },
    async configure(value) { enabled = value === true; generation++; await release(); },
  };
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
    inspect: () => ({ leaseId: lease, activityId, key, active }),
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
export function inspectSharedBrowserActivity() {
  return controller?.inspect() || null;
}
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

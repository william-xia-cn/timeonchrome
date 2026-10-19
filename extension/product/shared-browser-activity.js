import { getSession } from '../runtime/session.js';
import { confirmForegroundPageCheckpoint } from '../core/foreground-timing.js';
import { extractDomain } from '../infra/storage.js';
import { reportSharedBrowserActivity } from '../infra/native-host-client.js';
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

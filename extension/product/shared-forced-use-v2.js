import { createSharedBrowserActivityV2, readBrowserActiveActivity } from './shared-browser-activity.js';
import { configureSharedReminderContentBridge } from './shared-reminder-content-bridge.js';
import { requestSharedReminderLifecycle, reportSharedBrowserActivity, getSharedBrowserActivityLease } from '../infra/native-host-client.js';
import { browserExecutionFence } from '../infra/shared-browser-execution-fence.js';

const grantKey = value => JSON.stringify([value.identityKey, value.dateKey, value.ruleKey, value.policyIdentity?.policyHash]);
let coordinator = null;

export function hasSharedForcedUseConfirmation(admission) { return coordinator?.hasConfirmation(admission) === true; }
export function requestSharedForcedUseConfirmation(input) {
  return coordinator?.request(input) || Promise.resolve({ ok: false, error: 'shared_forced_use_not_ready' });
}
export function ensureSharedForcedUseConfirmation(admission) {
  return Promise.resolve({ ok: hasSharedForcedUseConfirmation(admission) });
}
export function clearSharedForcedUseContext(host) { return coordinator?.clearHost(host) || Promise.resolve({ ok: true }); }

export function createSharedForcedUseCoordinatorV2({ enabled = false, readDecision, readModel, readRound, retireRound,
  resumeIndependent, tabs = chrome.tabs, windows = chrome.windows, sample = readBrowserActiveActivity,
  sendActivity = reportSharedBrowserActivity, request = requestSharedReminderLifecycle,
  readLease = getSharedBrowserActivityLease, onAccepted = async () => {}, onBlocked = async () => {},
  createBridge = options => { const result = configureSharedReminderContentBridge(options);
    if (!result.ok) throw Error(result.errorCode); return result.bridge; }, effectsEnabled = false,
  readExecutionContext, readCloseCapability, executor } = {}) {
  let current = null, owned = false;
  const grants = new Map(), resolved = new Set();
  let bridge;
  const hasConfirmation = admission => enabled && owned && activity.inspect().owned
    && readLease() === activity.inspect().leaseId
    && admission.reasons.every(reason => grants.get(grantKey(admission))?.has(reason));
  const activity = createSharedBrowserActivityV2({ enabled, sample, readRound, retireRound, resumeIndependent,
    send: sendActivity, readContext: async fact => {
      const [tab] = await tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab || !/^https?:\/\//.test(tab.url || '')) return { ok: false };
      const decision = await readDecision(tab);
      const admission = decision?.forcedAdmission;
      if (!admission?.ok || admission.sharedRuntimeV2 !== true || admission.action === 'block') {
        if (decision?.access === 'reminder') await onBlocked(tab, decision);
        return { ok: false };
      }
      const model = await readModel(admission.dateKey);
      if (!model?.ok || model.policyIdentity.policyHash !== admission.policyIdentity.policyHash) return { ok: false };
      const win = await windows.get(tab.windowId);
      current = { tab, admission, model };
      const pendingEntry = admission.reasons.length > 0 && (!hasConfirmation(admission) || bridge?.inspect().displayed);
      return { ok: true, policyIdentity: admission.policyIdentity, ruleScopeKey: admission.ruleKey,
        reasonCodes: admission.reasons, quotaBucket: admission.quotaBucket, pendingEntry,
        activityKey: JSON.stringify([tab.id, tab.windowId, tab.url]),
        presentationEligible: tab.active === true && win.focused === true && win.state !== 'minimized' };
    },
    onOwnershipChanged: async value => {
      owned = value;
      if (!value) { grants.clear(); resolved.clear(); browserExecutionFence.invalidate(); await bridge?.invalidate(); }
    } });
  bridge = createBridge({ enabled, effectsEnabled, schemaVersion: 2, request, tabs, windows, readLease,
    ...(readCloseCapability ? { readCloseCapability } : {}),
    ...(executor ? { executor } : {}),
    readExecution: async date => {
      const model = await readModel(date);
      if (!owned || !current || !model?.ok || model.policyIdentity.policyHash !== current.admission.policyIdentity.policyHash) return { ok: false };
      return { ...model, ruleScopeKey: current.admission.ruleKey };
    },
    readExecutionContext: readExecutionContext || (async state => {
      const before = activity.inspect(), target = current?.tab;
      if (!owned || !target || !before.owned) throw Error('shared_activity_not_owned');
      const [tab, win, fact, model] = await Promise.all([tabs.get(target.id), windows.get(target.windowId),
        sample(), readModel(state.date)]);
      const after = activity.inspect(), latestState = bridge.inspect().state;
      return { connectionCurrent: readLease() === before.leaseId && before.leaseId === after.leaseId && after.owned,
        leaseId: after.leaseId, activityId: after.activityId,
        restEligible: tab?.id === target.id && tab.windowId === target.windowId && tab.url === target.url
          && tab.active === true && win.focused === true && win.state !== 'minimized'
          && before.activityId === after.activityId && current?.admission.ruleKey === state.ruleScopeKey
          && (fact.active === true || latestState?.roundId === state.roundId),
        policyIdentity: model?.policyIdentity, policyRevision: model?.policy?.revision,
        stateRevision: latestState?.stateRevision };
    }),
    readPresentation: async () => current?.admission.presentation || null,
    onExecuted: async (state, target, result) => {
      if (result?.ok !== true || result.outcome !== 'canceled' || state.resolution !== 'end_rest'
        || !current || state.ruleScopeKey !== current.admission.ruleKey
        || state.policyIdentity.policyHash !== current.admission.policyIdentity.policyHash) return;
      grants.set(grantKey(current.admission), new Set(state.reasonCodes));
      await onAccepted(target.id);
    },
    onResolved: async (state, target) => {
      if (!current || state.ruleScopeKey !== current.admission.ruleKey
        || state.policyIdentity.policyHash !== current.admission.policyIdentity.policyHash) return;
      const key = JSON.stringify([state.roundId, state.deliveryId, state.resolution]);
      if (resolved.has(key)) return;
      resolved.add(key);
      if (resolved.size > 64) resolved.delete(resolved.values().next().value);
      if (state.resolution === 'continue') {
        const scope = grantKey(current.admission);
        grants.set(scope, new Set([...(grants.get(scope) || []), ...state.reasonCodes]));
        if (grants.size > 128) grants.delete(grants.keys().next().value);
        await onAccepted(target.id);
      } else grants.delete(grantKey(current.admission));
    } });
  return { hasConfirmation,
    async tick() {
      if (!enabled) return { ok: true, skipped: true };
      await activity.setLease(readLease());
      const result = await activity.tick();
      if (!result.ok || !owned || !current) return result;
      return bridge.poll(current.tab.id, current.admission.dateKey);
    },
    async request(input) {
      if (!enabled || input?.admission?.sharedRuntimeV2 !== true) return { ok: false, error: 'shared_forced_use_not_ready' };
      const [tab] = await tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.id !== input.tabId) return { ok: false, error: 'shared_forced_use_target_changed' };
      const result = await this.tick();
      return { ...result, prompted: result?.state?.status === 'visible' };
    },
    async clearHost(host) {
      if (current?.tab?.url && new URL(current.tab.url).hostname === host) current = null;
      return { ok: true };
    },
    async stop() { enabled = false; await activity.configure(false); await bridge.invalidate(); },
    inspect: () => ({ owned, current, activity: activity.inspect(), reminder: bridge.inspect() }),
  };
}

export async function configureSharedForcedUseCoordinatorV2(options = {}) {
  await coordinator?.stop();
  coordinator = options.enabled === true ? createSharedForcedUseCoordinatorV2(options) : null;
  return { ok: true };
}
export function pollSharedForcedUseV2() { return coordinator?.tick() || Promise.resolve({ ok: true, skipped: true }); }

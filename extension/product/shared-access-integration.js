import { configureSharedAccessRuntime, isSharedAccessRuntimeEnabled } from './shared-access-runtime.js';
import { configureSharedWebContributionSync } from '../infra/shared-web-contribution-sync.js';
import { configureSharedBrowserActivity } from './shared-browser-activity.js';
import { configureSharedQuotaNativeBridge, hasSharedAccessExecutionCapability, observeSharedAccessPolicyCapability } from '../infra/native-host-client.js';
import { configureSharedAccessPolicyReader, readSharedAccessPolicyLkg } from '../infra/shared-access-policy-reader.js';
import { configureSharedQuotaExecutionReader } from '../infra/shared-quota-execution-reader.js';
import { configureSharedReminderContentBridge, pollSharedReminderForTab } from './shared-reminder-content-bridge.js';
import { readNativeHostDeploymentMarker } from '../core/deployment-mode.js';
import { readSharedBrowserCloseCapability } from './shared-browser-closer.js';

let timer = null, busy = false, epoch = 0;
export async function pollSharedAccessIntegration() {
  if (!isSharedAccessRuntimeEnabled() || busy) return { ok: true, skipped: true };
  const generation = epoch; busy = true;
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (generation !== epoch || !tabs[0]) return { ok: true, skipped: true };
    const date = new Date(Date.now() + 28800000).toISOString().slice(0, 10);
    return await pollSharedReminderForTab(tabs[0].id, date);
  } catch (_) { return { ok: false, errorCode: 'shared_access_poll_failed' }; }
  finally { busy = false; }
}
// Explicit isolated fixture control; production startup uses the verified controller below.
export async function configureSharedAccessIntegration({ enabled = false, effectsEnabled = false } = {}) {
  const configured = configureSharedReminderContentBridge({ enabled, effectsEnabled });
  if (!configured.ok) return configured;
  const generation = ++epoch; clearInterval(timer); timer = null;
  configureSharedQuotaNativeBridge({ enabled });
  await configureSharedAccessPolicyReader({ enabled });
  if (generation !== epoch) return { ok: false, errorCode: 'shared_access_configuration_superseded' };
  await configureSharedQuotaExecutionReader({ enabled });
  if (generation !== epoch) return { ok: false, errorCode: 'shared_access_configuration_superseded' };
  configureSharedAccessRuntime({ enabled }); configureSharedBrowserActivity({ enabled });
  await configureSharedWebContributionSync({ enabled });
  if (generation !== epoch) return { ok: false, errorCode: 'shared_access_configuration_superseded' };
  if (enabled) {
    timer = setInterval(() => { void pollSharedAccessIntegration(); }, 5000);
    await pollSharedAccessIntegration();
  }
  return { ok: true, enabled, effectsEnabled: enabled && effectsEnabled };
}

export function createSharedAccessBootstrap({ allowed = async () => false,
  onExecutionChanged = async () => {},
  readChannel = readNativeHostDeploymentMarker, hostAvailable = hasSharedAccessExecutionCapability,
  policy = readSharedAccessPolicyLkg, capability = readSharedBrowserCloseCapability,
  native = configureSharedQuotaNativeBridge, policyReader = configureSharedAccessPolicyReader,
  basisReader = configureSharedQuotaExecutionReader, contributions = configureSharedWebContributionSync,
  runtime = configureSharedAccessRuntime, activity = configureSharedBrowserActivity,
  reminder = configureSharedReminderContentBridge } = {}) {
  let preparing = false, execution = false, effects = false, inflight = null;
  async function reconcile() {
    if (inflight) return inflight;
    inflight = run().catch(() => ({ ok: false, errorCode: 'shared_access_bootstrap_unavailable' }))
      .finally(() => { inflight = null; });
    return inflight;
  }
  async function run() {
    const permitted = await readChannel() && await allowed();
    if (permitted !== preparing) {
      preparing = permitted;
      native({ enabled: permitted });
      await policyReader({ enabled: permitted });
      await basisReader({ enabled: permitted });
      await contributions({ enabled: permitted });
    }
    const current = permitted && await allowed() && hostAvailable() ? await policy() : null;
    const next = current?.ok === true && current.policy?.stage === 'shared' && hostAvailable() && await allowed();
    const nextEffects = next && (await capability()).available === true;
    if (next !== execution || nextEffects !== effects) {
      if (next !== execution) await onExecutionChanged(next);
      const display = reminder({ enabled: next, effectsEnabled: nextEffects });
      if (!display?.ok) return display;
      runtime({ enabled: next }); activity({ enabled: next });
      execution = next; effects = nextEffects;
    }
    return { ok: true, preparing, execution, effectsEnabled: effects };
  }
  return { reconcile };
}

let bootstrapController = null;
export function initSharedAccessIntegration({ allowed, onExecutionChanged } = {}) {
  if (bootstrapController) return;
  bootstrapController = createSharedAccessBootstrap({ allowed, onExecutionChanged });
  const refresh = () => { void bootstrapController.reconcile().catch(() => {}); };
  chrome.runtime.onStartup.addListener(refresh);
  chrome.runtime.onInstalled.addListener(refresh);
  chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'local' || area === 'managed') refresh(); });
  observeSharedAccessPolicyCapability(refresh);
  setInterval(() => { refresh(); void pollSharedAccessIntegration(); }, 5000);
  refresh();
}

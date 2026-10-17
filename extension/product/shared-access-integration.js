import { configureSharedAccessRuntime, isSharedAccessRuntimeEnabled, isSharedAccessRuntimeV2Enabled } from './shared-access-runtime.js';
import { pollSharedForcedUseV2 } from './shared-forced-use-v2.js';
import { configureSharedWebContributionSync } from '../infra/shared-web-contribution-sync.js';
import { configureSharedBrowserActivity } from './shared-browser-activity.js';
import { configureSharedQuotaNativeBridge, hasSharedAccessExecutionCapability, observeSharedAccessPolicyCapability, readQuotaBucketsReadCapability } from '../infra/native-host-client.js';
import { configureSharedAccessPolicyReader, readSharedAccessPolicyLkg } from '../infra/shared-access-policy-reader.js';
import { configureSharedQuotaExecutionReader } from '../infra/shared-quota-execution-reader.js';
import { configureSharedReminderContentBridge, pollSharedReminderForTab } from './shared-reminder-content-bridge.js';
import { readNativeHostDeploymentMarker } from '../core/deployment-mode.js';
import { readSharedBrowserCloseCapability } from './shared-browser-closer.js';

let timer = null, busy = false, epoch = 0;
export async function pollSharedAccessIntegration() {
  if (isSharedAccessRuntimeV2Enabled()) return pollSharedForcedUseV2();
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
  bucketCapability = readQuotaBucketsReadCapability,
  policy = readSharedAccessPolicyLkg, capability = readSharedBrowserCloseCapability,
  native = configureSharedQuotaNativeBridge, policyReader = configureSharedAccessPolicyReader,
  basisReader = configureSharedQuotaExecutionReader, contributions = configureSharedWebContributionSync,
  runtime = configureSharedAccessRuntime, activity = configureSharedBrowserActivity,
  reminder = configureSharedReminderContentBridge, v2 = null } = {}) {
  let preparing = false, execution = false, effects = false, inflight = null;
  let v2Execution = false, v2Effects = false;
  let bucketPath = false;
  async function reconcile() {
    if (inflight) return inflight;
    inflight = run().catch(() => ({ ok: false, errorCode: 'shared_access_bootstrap_unavailable' }))
      .finally(() => { inflight = null; });
    return inflight;
  }
  async function run() {
    const permitted = await readChannel() && await allowed();
    native({ enabled: permitted });
    const buckets = bucketCapability();
    if (permitted && v2 && buckets.available === true) {
        if (!bucketPath) {
          reminder({ enabled: false }); runtime({ enabled: false }); activity({ enabled: false });
          await contributions({ enabled: false }); await basisReader({ enabled: false }); await policyReader({ enabled: false });
          if (execution) await onExecutionChanged(false);
          bucketPath = true; execution = false; effects = false;
        }
        const result = await v2.policy();
        const next = result?.ok === true && result.policy?.schemaVersion === 2
          && result.policy.stage === 'shared' && result.policy.forcedUsePolicyV1?.enabled === true && v2.available();
        const nextEffects = next && (await capability()).available === true;
        if (next !== v2Execution || nextEffects !== v2Effects) {
          await v2.configure({ enabled: next, effectsEnabled: nextEffects });
          runtime({ enabled: next, schemaVersion: 2 });
          await onExecutionChanged(next);
          v2Execution = next; v2Effects = nextEffects;
        }
        preparing = true; execution = false; effects = false;
        return { ok: true, preparing, execution: v2Execution, effectsEnabled: v2Effects, schemaVersion: 2 };
    }
    if (bucketPath) {
      await v2.configure({ enabled: false }); runtime({ enabled: false });
      if (v2Execution) await onExecutionChanged(false);
      v2Execution = false; v2Effects = false; preparing = false; bucketPath = false;
    }
    const legacy = permitted && buckets.known === true && buckets.available !== true;
    if (legacy !== preparing) {
      preparing = legacy;
      await policyReader({ enabled: legacy });
      await basisReader({ enabled: legacy });
      await contributions({ enabled: legacy });
    }
    const current = legacy && await allowed() && hostAvailable() ? await policy() : null;
    const next = legacy && current?.ok === true && current.policy?.stage === 'shared' && hostAvailable() && await allowed();
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
export function initSharedAccessIntegration({ allowed, onExecutionChanged, v2 } = {}) {
  if (bootstrapController) return;
  bootstrapController = createSharedAccessBootstrap({ allowed, onExecutionChanged, v2 });
  const refresh = () => { void bootstrapController.reconcile().catch(() => {}); };
  chrome.runtime.onStartup.addListener(refresh);
  chrome.runtime.onInstalled.addListener(refresh);
  chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'local' || area === 'managed') refresh(); });
  observeSharedAccessPolicyCapability(refresh);
  setInterval(() => { refresh(); void pollSharedAccessIntegration(); }, 5000);
  refresh();
}

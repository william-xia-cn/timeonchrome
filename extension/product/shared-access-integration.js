import { configureSharedAccessRuntime, isSharedAccessRuntimeV2Enabled } from './shared-access-runtime.js';
import { pollSharedForcedUseV2 } from './shared-forced-use-v2.js';
import { configureSharedQuotaNativeBridge, observeSharedAccessPolicyCapability, readQuotaBucketsReadCapability } from '../infra/native-host-client.js';
import { readNativeHostDeploymentMarker } from '../core/deployment-mode.js';
import { readSharedBrowserCloseCapability } from './shared-browser-closer.js';

export async function pollSharedAccessIntegration() {
  return isSharedAccessRuntimeV2Enabled() ? pollSharedForcedUseV2() : { ok: true, skipped: true };
}

// Missing current capability never enables a contribution/basis implementation.
export function createSharedAccessBootstrap({ allowed = async () => false,
  onExecutionChanged = async () => {}, readChannel = readNativeHostDeploymentMarker,
  bucketCapability = readQuotaBucketsReadCapability, capability = readSharedBrowserCloseCapability,
  native = configureSharedQuotaNativeBridge, runtime = configureSharedAccessRuntime, v2 = null } = {}) {
  let execution = false, effects = false, inflight = null;
  async function run() {
    const permitted = await readChannel() && await allowed();
    native({ enabled: permitted });
    const preparing = permitted && !!v2 && bucketCapability().available === true;
    const result = preparing ? await v2.policy() : null;
    const next = preparing && result?.ok === true && result.policy?.schemaVersion === 2
      && result.policy.stage === 'shared' && result.policy.forcedUsePolicyV1?.enabled === true
      && v2.available() && await allowed();
    const nextEffects = next && (await capability()).available === true;
    if (next !== execution || nextEffects !== effects) {
      if (v2) await v2.configure({ enabled: next, effectsEnabled: nextEffects });
      runtime({ enabled: next, schemaVersion: 2 });
      await onExecutionChanged(next);
      execution = next; effects = nextEffects;
    }
    return { ok: true, preparing, execution, effectsEnabled: effects, schemaVersion: 2 };
  }
  return { reconcile() {
    if (!inflight) inflight = run().catch(async () => {
      if (v2) await v2.configure({ enabled: false });
      runtime({ enabled: false });
      if (execution) await onExecutionChanged(false);
      execution = false; effects = false;
      return { ok: false, errorCode: 'shared_access_bootstrap_unavailable' };
    }).finally(() => { inflight = null; });
    return inflight;
  } };
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

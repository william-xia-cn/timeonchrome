import { readLocalSharedQuotaPreparation, readSharedWebSourceBinding } from '../infra/shared-web-contribution-sync.js';
import { readSharedAccessPolicyLkg } from '../infra/shared-access-policy-reader.js';
import { requestSharedQuotaState, getSharedBrowserActivityLease } from '../infra/native-host-client.js';
import { matchesSharedAccessPolicyIdentityV1 } from '../core/shared-contracts/1.30.0/shared-access.js';
import { sharedQuotaExecutionIdentityV1 } from '../core/shared-contracts/1.30.0/shared-web-sync.js';
import { browserExecutionFence } from '../infra/shared-browser-execution-fence.js';

const failure = errorCode => ({ ok: false, errorCode, executionEnabled: false });
const canonical = v => JSON.stringify(v, Object.keys(v).sort());
export function createSharedAccessRuntime({ enabled = false, readLocal = readLocalSharedQuotaPreparation,
  readBinding = readSharedWebSourceBinding, readPolicy = readSharedAccessPolicyLkg,
  native = requestSharedQuotaState, readLease = getSharedBrowserActivityLease, fence = browserExecutionFence } = {}) {
  let revision = null;
  let busy = false;
  const reject = code => { revision = null; fence.invalidate(); return failure(code); };
  return { enabled: () => enabled,
    async read(date) {
      if (!enabled) return failure('shared_access_execution_disabled');
      if (busy) return failure('shared_access_runtime_busy');
      busy = true;
      try {
        const lease = readLease(), binding = await readBinding(), policy = await readPolicy(), local = await readLocal();
        if (!lease || !binding?.ok || !policy?.ok || policy.policy.stage !== 'shared'
          || !await matchesSharedAccessPolicyIdentityV1(policy.policy, local.policyIdentity)) return reject('shared_access_context_unavailable');
        const localRevision = await sharedQuotaExecutionIdentityV1(local);
        const response = await native({ date, weekStart: local.projection.week.fromDate, policyRevision: policy.policy.revision });
        const preparation = response?.sharedQuotaPreparation;
        if (!response?.ok || response.policyIdentityStatus !== 'available'
          || !await matchesSharedAccessPolicyIdentityV1(policy.policy, response.sharedAccessPolicyIdentity)
          || !await matchesSharedAccessPolicyIdentityV1(policy.policy, preparation?.policyIdentity)) return reject('shared_access_native_unverified');
        const executionRevision = await sharedQuotaExecutionIdentityV1(preparation);
        if (preparation.basisRevision !== local.basisRevision || preparation.projection.week.toDate !== date)
          return reject('shared_access_basis_changed');
        const webs = preparation.replacementVersions.filter(v => v.source === 'web');
        if (webs.length !== local.replacementVersions.length || local.replacementVersions.some(v =>
          v.sourceKey !== binding.webSourceKey || !webs.some(w => canonical(v) === canonical(w))))
          return reject('shared_access_web_version_changed');
        if (preparation.replacementVersions.some(v => v.source === 'application' && v.sourceKey !== binding.applicationSourceKey))
          return reject('shared_access_application_scope_unverified');
        if (!preparation.replacementVersions.some(v => v.source === 'application' && v.date === date))
          return reject('shared_access_application_replacement_missing');
        const latestBinding = await readBinding(), latestPolicy = await readPolicy();
        if (lease !== readLease() || !latestBinding?.ok || canonical(binding) !== canonical(latestBinding)
          || !latestPolicy?.ok || !await matchesSharedAccessPolicyIdentityV1(latestPolicy.policy, preparation.policyIdentity)
          || localRevision !== await sharedQuotaExecutionIdentityV1(await readLocal())) return reject('shared_access_context_changed');
        if (revision !== null && revision !== executionRevision) fence.invalidate();
        revision = executionRevision;
        return { ok: true, policy: policy.policy, preparation, executionRevision, lease,
          source: 'shared_local_replacements', executionEnabled: false };
      } catch (_) { return reject('shared_access_runtime_unavailable'); }
      finally { busy = false; }
    },
  };
}
let runtime = createSharedAccessRuntime();
export function configureSharedAccessRuntime({ enabled = false } = {}) {
  browserExecutionFence.invalidate(); runtime = createSharedAccessRuntime({ enabled });
}
export function isSharedAccessRuntimeEnabled() { return runtime.enabled(); }
export function readSharedAccessRuntime(date) { return runtime.read(date); }

// Ephemeral projection only: it never writes Guardian configuration or accounting.
export function projectSharedRuntimeQuota(config, model, webUsage, date) {
  if (!model?.ok || webUsage?.ok === false) return { ok: false, usage: { ok: false } };
  const { policy, preparation } = model, day = preparation.projection.days.find(d => d.date === date);
  if (!day?.complete) return { ok: false, usage: { ok: false } };
  const daily = {}, windows = {};
  for (const key of Object.keys(policy.dailyMinutes)) {
    const d = policy.dailyMinutes[key];
    daily[key] = { ...config.timeQuota?.daily?.[key], studyMinutes: d.study, compositeMinutes: d.composite, restMinutes: d.rest };
    const w = policy.timeWindows[key];
    windows[key] = { ...config.timeWindows?.daily?.[key], studyWindows: w.study, compositeWindows: w.composite, restWindows: w.rest };
  }
  const usage = { ...webUsage, ok: true, studySeconds: day.usedMs.study / 1000,
    undeterminedSeconds: day.usedMs.composite / 1000, restSeconds: day.usedMs.rest / 1000,
    studyMinutes: day.usedMs.study / 60000, undeterminedMinutes: day.usedMs.composite / 60000,
    restMinutes: day.usedMs.rest / 60000, weekRestSeconds: preparation.projection.week.restUsedMs / 1000,
    weekRestMinutes: preparation.projection.week.restUsedMs / 60000, source: model.source,
    executionRevision: model.executionRevision, sharedPreparation: preparation };
  return { ok: true, usage, config: { ...config,
    timeQuota: { ...config.timeQuota, accountingVersion: 2, daily,
      weekly: { ...config.timeQuota?.weekly, restMinutes: policy.weeklyRestMinutes } },
    timeWindows: { ...config.timeWindows, daily: windows },
    autonomyConfig: { ...config.autonomyConfig, restrictedEntryConfirmationRequired: policy.autonomy.restrictedEntryConfirmationRequired },
  } };
}

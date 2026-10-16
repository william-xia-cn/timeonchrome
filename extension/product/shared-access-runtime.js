import { readLocalSharedQuotaPreparation, readSharedWebSourceBinding } from '../infra/shared-web-contribution-sync.js';
import { readSharedAccessPolicyLkg, readSharedAccessPolicyV2Lkg, readSharedAccessPolicyContext } from '../infra/shared-access-policy-reader.js';
import { readCurrentSourceStatistics } from '../infra/source-statistics-shadow.js';
import { requestSharedQuotaState, getSharedBrowserActivityLease } from '../infra/native-host-client.js';
import { matchesSharedAccessPolicyIdentityV1 } from '../core/shared-contracts/1.30.0/shared-access.js';
import { sharedQuotaExecutionIdentityV1 } from '../core/shared-contracts/1.30.0/shared-web-sync.js';
import { browserExecutionFence } from '../infra/shared-browser-execution-fence.js';
import { canonicalSharedAccessPolicyV2, createSharedAccessPolicyIdentityV2 } from '../core/shared-contracts/1.54.0/shared-access.js';
import { projectIndependentSharedQuotaSeconds, sourceStatisticsDates } from '../core/shared-contracts/1.54.0/source-statistics.js';

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
export function createIndependentSharedAccessRuntime({ enabled = false, readPolicy = readSharedAccessPolicyV2Lkg,
  readSources = readCurrentSourceStatistics, readScope = readSharedAccessPolicyContext,
  readConfigContext = async () => {
    const data = await chrome.storage.local.get(['cloud_profile_config_version', 'guardian_config']);
    return { version: data.cloud_profile_config_version, config: data.guardian_config };
  }, fence = browserExecutionFence } = {}) {
  const reject = code => { fence.invalidate(); return failure(code); };
  return { schemaVersion: 2, enabled: () => enabled, async read(date) {
    if (!enabled) return failure('shared_access_execution_disabled');
    try {
      const scope = await readScope(), local = await readConfigContext(), result = await readPolicy();
      const policy = result?.policy;
      if (!result?.ok || policy?.schemaVersion !== 2 || policy.stage !== 'shared'
        || !Number.isSafeInteger(local?.version) || local.version < 0
        || policy.revision !== `profile-config:${local.version}` || !local.config) return reject('shared_access_policy_version_unavailable');
      const policyIdentity = await createSharedAccessPolicyIdentityV2(policy);
      const sources = await readSources(date);
      if (sources?.ok && (sources.childId !== scope.childId || sources.scopeHash !== scope.scopeHash)) {
        return reject('shared_access_source_scope_changed');
      }
      const [latestScope, latestConfig, latestPolicy] = await Promise.all([readScope(), readConfigContext(), readPolicy()]);
      if (latestScope?.scopeHash !== scope.scopeHash || latestConfig?.version !== local.version
        || JSON.stringify(latestConfig?.config) !== JSON.stringify(local.config)
        || !latestPolicy?.ok || canonicalSharedAccessPolicyV2(latestPolicy.policy) !== canonicalSharedAccessPolicyV2(policy)) {
        return reject('shared_access_context_changed');
      }
      const bytes = new TextEncoder().encode(JSON.stringify([policyIdentity, sources?.sourceStatistics?.web?.revision ?? null,
        sources?.sourceStatistics?.application?.revision ?? null]));
      const executionRevision = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map(value => value.toString(16).padStart(2, '0')).join('');
      return { ok: true, policy, policyIdentity, sourceStatistics: sources?.ok ? sources.sourceStatistics : null,
        statisticsAvailable: sources?.ok === true, sourceErrorCode: sources?.ok ? null : sources?.errorCode || 'shared_access_source_unavailable', localConfig: local.config,
        executionRevision, source: 'shared_source_statistics_v2', executionEnabled: false };
    } catch (_) { return reject('shared_access_runtime_unavailable'); }
  } };
}

let runtime = createSharedAccessRuntime();
export function configureSharedAccessRuntime({ enabled = false, schemaVersion = 1, ...readers } = {}) {
  browserExecutionFence.invalidate();
  runtime = schemaVersion === 2 ? createIndependentSharedAccessRuntime({ enabled, ...readers }) : createSharedAccessRuntime({ enabled });
}
export function isSharedAccessRuntimeEnabled() { return runtime.enabled(); }
export function isSharedAccessRuntimeV2Enabled() { return runtime.enabled() && runtime.schemaVersion === 2; }
export function readSharedAccessRuntime(date) { return runtime.read(date); }

// Ephemeral projection only: it never writes Guardian configuration or accounting.
export function projectSharedRuntimeQuota(config, model, webUsage, date) {
  if (model?.policy?.schemaVersion === 2) return projectIndependentSharedRuntimeQuota(config, model, webUsage, date);
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

export function projectIndependentSharedRuntimeQuota(config, model, webUsage, date) {
  const invalid = () => ({ ok: false, usage: { ok: false, source: 'shared_source_statistics_v2' } });
  if (!model?.ok || webUsage?.ok === false) return invalid();
  try {
    const policy = JSON.parse(canonicalSharedAccessPolicyV2(model.policy));
    const { web, application } = model.sourceStatistics || {};
    const midnight = Date.parse(`${date}T00:00:00+08:00`);
    const weekday = new Date(midnight + 28800000).getUTCDay();
    const fromDate = new Date(midnight - (weekday + 6) % 7 * 86400000 + 28800000).toISOString().slice(0, 10);
    const dates = sourceStatisticsDates(fromDate, date);
    if (!web || !application || [web, application].some(source => source.fromDate !== fromDate || source.toDate !== date)
      || web.childId !== application.childId) return invalid();
    const days = dates.map(day => projectIndependentSharedQuotaSeconds(policy, day, web, application));
    const day = days.at(-1), complete = days.every(row => row.complete);
    if (!complete) return { ...invalid(), completeness: { complete: false,
      reasonCodes: [...new Set(days.flatMap(row => row.reasonCodes))] } };
    const weekRestSeconds = days.reduce((seconds, row) => seconds + row.usedSeconds.rest, 0);
    if (!Number.isSafeInteger(weekRestSeconds)) return invalid();
    const daily = {}, windows = {};
    for (const key of Object.keys(policy.dailyMinutes)) {
      const quota = policy.dailyMinutes[key], window = policy.timeWindows[key];
      daily[key] = { ...config.timeQuota?.daily?.[key], studyMinutes: quota.study,
        compositeMinutes: quota.composite, restMinutes: quota.rest };
      windows[key] = { ...config.timeWindows?.daily?.[key], studyWindows: window.study,
        compositeWindows: window.composite, restWindows: window.rest };
    }
    return { ok: true, config: { ...config,
      timeQuota: { ...config.timeQuota, accountingVersion: 2, daily,
        weekly: { ...config.timeQuota?.weekly, restMinutes: policy.weeklyRestMinutes } },
      timeWindows: { ...config.timeWindows, daily: windows },
      autonomyConfig: { ...config.autonomyConfig,
        restrictedEntryConfirmationRequired: policy.autonomy.restrictedEntryConfirmationRequired,
        quotaOverrunConfirmationRequired: policy.autonomy.quotaOverrunConfirmationRequired,
        timeWindowAdvisoryEnabled: policy.autonomy.timeWindowAdvisoryEnabled,
        softReminderTimeoutAction: policy.autonomy.softReminderTimeoutAction },
      forcedUsePolicyV1: policy.forcedUsePolicyV1 ?? undefined, downtimeConfig: policy.downtimeConfig },
      usage: { ...webUsage, ok: true, source: 'shared_source_statistics_v2',
        studySeconds: day.usedSeconds.study, studyMinutes: day.usedSeconds.study / 60,
        undeterminedSeconds: day.usedSeconds.composite, undeterminedMinutes: day.usedSeconds.composite / 60,
        compositeSeconds: day.usedSeconds.composite, compositeMinutes: day.usedSeconds.composite / 60,
        restSeconds: day.usedSeconds.rest, restMinutes: day.usedSeconds.rest / 60,
        weekRestSeconds, weekRestMinutes: weekRestSeconds / 60,
        executionRevision: model.executionRevision },
      completeness: { complete: true }, sourceStatistics: model.sourceStatistics };
  } catch (_) { return invalid(); }
}

import { canonicalSharedWebSync, sharedWebContributionHashV1, verifySharedWebContributionV1,
  validateSharedWebSourceBindingProofV1, sharedWebExecutionSourceV1, sharedWebLocalLeaseCurrentV1 } from '../core/shared-contracts/1.30.0/shared-web-sync.js';
import { validateSharedAccessPolicyV1 } from '../core/shared-access-policy.js';
import { buildLocalQuotaProjectionV2 } from '../core/quota-read-model-v2.js';
import { getBeijingWeekPeriod } from '../core/profile-account-v2.js';
import { readSharedAccessPolicyContext, readSharedAccessPolicyLkg, SHARED_ACCESS_POLICY_LKG_KEY } from './shared-access-policy-reader.js';
import { readCloudSharedWebCapabilities, readCloudSharedWebWatermark, postCloudSharedWebContribution,
  requestCloudSharedWebSourceBinding } from './cloud-sync.js';
import { requestSharedWebSync, observeSharedAccessPolicyCapability, readSharedWebLocalConnection } from './native-host-client.js';
import { runStorageMutation, budgetedLocalSet } from './storage-budget.js';
import { readSharedQuotaExecutionLkg } from './shared-quota-execution-reader.js';
import { projectLocalSharedQuotaExecution } from '../core/shared-contracts/1.28.0/shared-quota-execution.js';

export const SHARED_WEB_QUEUE_KEY = 'shared_web_contribution_queue_v1';
export const SHARED_WEB_DIAGNOSTICS_KEY = 'shared_web_sync_diagnostics_v1';
const hash = async v => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalSharedWebSync(v))))].map(b => b.toString(16).padStart(2, '0')).join('');
const clone = v => JSON.parse(JSON.stringify(v));
const fail = errorCode => ({ ok: false, errorCode, executionEnabled: false });
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const nonnegative = v => Number.isSafeInteger(v) && v >= 0;
const diagnosticErrors = new Set(['shared_web_identity_changed', 'shared_web_native_rejected', 'shared_web_disabled',
  'shared_web_watermark_unavailable', 'shared_web_stale', 'shared_web_upload_unavailable', 'shared_web_sync_unavailable',
  'shared_web_basis_unavailable', 'shared_web_replacement_context_changed', 'shared_web_binding_unavailable',
  'shared_web_invalid_watermark', 'shared_web_invalid_ack', 'shared_web_context_unavailable', 'shared_web_not_prepared']);
export function summarizeStoredBucketCoverage(stats) {
  const targets = stats?.targets;
  const unknownResult = () => ({ allBucketMs: null, knownBucketMs: null, unknownBucketKeyCount: null });
  if (!targets || typeof targets !== 'object' || Array.isArray(targets)) return unknownResult();
  let all = 0, known = 0;
  const unknown = new Set();
  for (const target of Object.values(targets)) {
    const buckets = target?.activeByQuotaBucket;
    if (!buckets || typeof buckets !== 'object' || Array.isArray(buckets)) return unknownResult();
    for (const [key, value] of Object.entries(buckets)) {
      if (!nonnegative(value) || !Number.isSafeInteger(value * 1000)) return unknownResult();
      all += value * 1000;
      if (['study', 'composite', 'rest', 'other'].includes(key)) known += value * 1000;
      else unknown.add(key);
    }
  }
  return { allBucketMs: Number.isSafeInteger(all) ? all : null, knownBucketMs: Number.isSafeInteger(known) ? known : null, unknownBucketKeyCount: unknown.size };
}
function watermark(v, date, sourceKey = null) {
  if (!exact(v, ['schemaVersion', 'sourceKey', 'date', 'revisionOrdinal', 'contentHash', 'publicationRevision'])
    || v.schemaVersion !== 1 || v.date !== date || !/^web:[a-f0-9]{64}$/.test(v.sourceKey)
    || sourceKey && sourceKey !== v.sourceKey || !nonnegative(v.revisionOrdinal)
    || (v.revisionOrdinal === 0 ? v.contentHash !== null || v.publicationRevision !== null
      : !/^[a-f0-9]{64}$/.test(v.contentHash) || v.publicationRevision !== `${v.revisionOrdinal}:${v.contentHash}`)) throw Error('shared_web_invalid_watermark');
  return clone(v);
}
function receipt(v, upload, sourceKey) {
  if (!exact(v, ['schemaVersion', 'sourceKey', 'date', 'revisionOrdinal', 'contentHash', 'publicationRevision', 'status', 'submittedRevisionOrdinal'])
    || !['accepted', 'duplicate', 'stale'].includes(v.status) || v.submittedRevisionOrdinal !== upload.revisionOrdinal) throw Error('shared_web_invalid_ack');
  const { status, submittedRevisionOrdinal, ...head } = v;
  watermark(head, upload.date, sourceKey);
  if (status !== 'stale' && (v.revisionOrdinal !== upload.revisionOrdinal || v.contentHash !== upload.contentHash)
    || status === 'stale' && v.revisionOrdinal <= upload.revisionOrdinal) throw Error('shared_web_invalid_ack');
  return clone(v);
}

export function createSharedWebContributionSync({ enabled = false, now = Date.now,
  readContext = readSharedAccessPolicyContext, readPolicy = readSharedAccessPolicyLkg,
  readStorage = keys => chrome.storage.local.get(keys), mutate = runStorageMutation,
  capabilities = readCloudSharedWebCapabilities, readWatermark = readCloudSharedWebWatermark,
  upload = postCloudSharedWebContribution, exchange = requestCloudSharedWebSourceBinding, native = requestSharedWebSync,
  readBasis = readSharedQuotaExecutionLkg, readConnection = readSharedWebLocalConnection } = {}) {
  let running = null, queued = false, epoch = 0;
  const nativeReceipts = new Map();
  let preparation = fail('shared_web_not_prepared');
  let preparationScope = null;
  let sourceBinding = null;
  let bindingConnection = null, localLease = null;
  let diagnosticStage = null, diagnosticDate = null;
  let diagnosticContext = null;
  let diagnostic = { lastAttemptAtMs: null, lastCompletedAtMs: null, lastErrorCode: null,
    failedStage: null, failedDate: null, cloudAckAtMsByDate: {}, cloudAckVersionsByDate: {}, coverageByDate: {} };
  const step = (stage, date = null) => { diagnosticStage = stage; diagnosticDate = date; };
  function bindingCurrent(c) {
    const connection = readConnection();
    if (!sourceBinding || sourceBinding.scopeHash !== c.scopeHash || localLease?.policyIdentity.policyHash !== c.policyHash
      || !bindingConnection || connection.connection !== bindingConnection) return false;
    return sourceBinding.expiresAtMs > now() || sharedWebLocalLeaseCurrentV1(localLease, {
      scopeRevision: c.scopeHash, policyIdentity: c.policyIdentity, connectionLive: true,
      capabilityNegotiated: connection.capabilityNegotiated === true, nowMs: now() });
  }
  async function capture() {
    const context = await readContext(), response = await readPolicy();
    const checked = response?.ok && validateSharedAccessPolicyV1(response.policy);
    if (!context || !['apiBase', 'deviceId', 'childId', 'deviceToken'].every(k => typeof context[k] === 'string' && context[k]) || !checked?.ok) throw Error('shared_web_context_unavailable');
    const policyHash = await hash(checked.policy);
    return { ...context, policy: checked.policy, policyHash,
      scopeHash: await hash(['shared-web-v1', context.apiBase, context.deviceId, context.childId, context.deviceToken]),
      policyIdentity: { schemaVersion: 1, revision: checked.policy.revision, effectiveAtMs: checked.policy.effectiveAtMs, stage: checked.policy.stage, policyHash } };
  }
  async function current(c, generation) {
    if (!enabled || generation !== epoch) return false;
    const next = await capture();
    return enabled && generation === epoch && c.scopeHash === next.scopeHash && c.policyHash === next.policyHash;
  }
  async function change(c, generation, transform) {
    return mutate(async storage => {
      if (!await current(c, generation)) return false;
      const raw = (await storage.get(SHARED_WEB_QUEUE_KEY))[SHARED_WEB_QUEUE_KEY];
      let q = raw?.schemaVersion === 1 && raw.scopeHash === c.scopeHash && exact(raw.days || {}, Object.keys(raw.days || {}))
        ? clone(raw) : { schemaVersion: 1, scopeHash: c.scopeHash, days: {} };
      q = await transform(q);
      if (!q || !await current(c, generation)) return false;
      if (new TextEncoder().encode(JSON.stringify(q)).length > 128 * 1024) throw Error('shared_web_queue_size_limit');
      await storage.set({ [SHARED_WEB_QUEUE_KEY]: q });
      return q;
    }, { priority: 'derived', source: 'shared_web_contribution' });
  }
  async function build(c, date, stored, ordinal) {
    const stats = stored.daily_usage_stats_v1?.[date];
    if (stats != null && (typeof stats !== 'object' || Array.isArray(stats)
      || stats.domains != null && (typeof stats.domains !== 'object' || Array.isArray(stats.domains))
      || stats.targets != null && (typeof stats.targets !== 'object' || Array.isArray(stats.targets)))) throw Error('shared_web_statistics_invalid');
    const corrections = (stored.guardian_config?.usageAccountingCorrectionsV1 || []).filter(v => v.date === date && (!v.deviceId || v.deviceId === c.deviceId));
    const values = [...Object.values(stats?.domains || {}).map(r => r?.activeSeconds),
      ...Object.values(stats?.targets || {}).flatMap(r => Object.values(r?.activeByQuotaBucket || {}))];
    if (values.some(v => !nonnegative(v))) throw Error('shared_web_statistics_invalid');
    if (stats?.compactedByChannel?.active != null && !nonnegative(stats.compactedByChannel.active)
      || corrections.some(v => !nonnegative(v.durationSeconds))) throw Error('shared_web_statistics_invalid');
    const local = buildLocalQuotaProjectionV2({ [date]: stats }, { date, weekStart: date, weekEnd: date, deviceId: c.deviceId, corrections });
    const day = local.today, buckets = Object.fromEntries(['study', 'composite', 'rest'].map(k => [k, (day.byQuotaBucket[k] || 0) * 1000]));
    const otherMs = (day.byQuotaBucket.other || 0) * 1000, activeMs = day.onlineSeconds * 1000;
    const reasons = [];
    if (!stats) reasons.push('LOCAL_STATISTICS_MISSING');
    if (!local.complete || !day.complete || local.correctionIssues.length) reasons.push('LOCAL_STATISTICS_INCOMPLETE');
    if (Object.values(buckets).reduce((a, b) => a + b, 0) + otherMs !== activeMs) reasons.push('LOCAL_BUCKETS_INCOMPLETE');
    const base = { schemaVersion: 1, date, statisticsRevision: await hash(stats || null), correctionRevision: await hash(corrections),
      policyIdentity: c.policyIdentity, settledAtMs: null, activeMs, bucketsMs: buckets, otherMs,
      complete: reasons.length === 0, reasonCodes: reasons };
    const fingerprint = await hash(base);
    const body = { ...base, revisionOrdinal: ordinal, computedAtMs: now() };
    return { fingerprint, upload: { ...body, contentHash: await sharedWebContributionHashV1(body) } };
  }
  async function bind(c, generation, sourceKey) {
    const connection = readConnection().connection;
    const challenge = await native('getSharedWebSourceChallenge', {});
    if (!challenge.ok || !await current(c, generation)) return null;
    const r = challenge.value;
    if (!exact(r, ['schemaVersion', 'challengeId', 'connectionHash', 'expiresAtMs']) || r.schemaVersion !== 1
      || !/^[a-f0-9]{64}$/.test(r.challengeId) || !/^[a-f0-9]{64}$/.test(r.connectionHash) || !nonnegative(r.expiresAtMs) || r.expiresAtMs <= now()) return null;
    const proofResponse = await exchange(c, r.challengeId);
    if (!proofResponse.ok || !await current(c, generation)) return null;
    const proof = clone(proofResponse.value);
    validateSharedWebSourceBindingProofV1(proof);
    if (proof.claims.challengeId !== r.challengeId || proof.claims.connectionHash !== r.connectionHash
      || proof.claims.webSourceKey !== sourceKey
      || proof.claims.issuedAtMs > now() || proof.claims.expiresAtMs <= now()) return null;
    // Signature and machine assignment are verified by Host against its trusted HTTPS context.
    const bound = await native('bindSharedWebSource', { proof });
    if (!connection || readConnection().connection !== connection || !await current(c, generation) || !bound.ok || bound.value?.challengeId !== r.challengeId
      || bound.value.webSourceKey !== sourceKey || bound.value.expiresAtMs !== proof.claims.expiresAtMs) return null;
    sourceBinding = { challengeId: r.challengeId, connectionHash: r.connectionHash,
      expiresAtMs: proof.claims.expiresAtMs, webSourceKey: sourceKey,
      applicationSourceKey: proof.claims.applicationSourceKey, scopeHash: c.scopeHash };
    bindingConnection = connection;
    localLease = { schemaVersion: 1, scopeRevision: c.scopeHash, policyIdentity: clone(c.policyIdentity),
      claims: clone(proof.claims), verifiedAtMs: now() };
    nativeReceipts.clear();
    return { challengeId: r.challengeId, expiresAtMs: proof.claims.expiresAtMs };
  }
  async function perform(generation) {
    let c;
    try {
      step('local_context');
      c = await capture();
      diagnosticContext = { scopeHash: c.scopeHash, policyHash: c.policyHash, policyIdentity: clone(c.policyIdentity) };
      if (diagnostic.scopeHash !== c.scopeHash || diagnostic.policyIdentity?.policyHash !== c.policyHash) {
        diagnostic = { lastAttemptAtMs: now(), lastCompletedAtMs: null, lastErrorCode: null, failedStage: null,
          failedDate: null, cloudAckAtMsByDate: {}, cloudAckVersionsByDate: {}, coverageByDate: {}, scopeHash: c.scopeHash,
          policyIdentity: clone(c.policyIdentity) };
      }
      const date = new Date(now() + 28800000).toISOString().slice(0, 10), { weekStart } = getBeijingWeekPeriod(date);
      const stored = clone(await readStorage(['daily_usage_stats_v1', 'guardian_config']));
      let q = await change(c, generation, q => { q.days = Object.fromEntries(Object.entries(q.days).filter(([d]) => d >= weekStart && d <= date)); return q; });
      if (!q) return fail('shared_web_identity_changed');
      const dates = [];
      for (let t = Date.parse(`${weekStart}T00:00:00Z`); t <= Date.parse(`${date}T00:00:00Z`); t += 86400000) dates.push(new Date(t).toISOString().slice(0, 10));
      // Write ahead even offline: original statistics do not depend on network availability.
      for (const d of dates) {
        step('local_projection', d);
        const old = q.days[d], ordinal = (nonnegative(q.days[d]?.upload?.revisionOrdinal) ? q.days[d].upload.revisionOrdinal : 0) + 1;
        let item = await build(c, d, stored, ordinal);
        if (old?.fingerprint === item.fingerprint) {
          const verified = await verifySharedWebContributionV1(old.upload);
          const { computedAtMs, revisionOrdinal, contentHash, ...base } = verified;
          if (await hash(base) !== item.fingerprint) throw Error('shared_web_queue_content_conflict');
          item = old;
        }
        q = await change(c, generation, q => { q.days[d] = item; return q; });
        if (!q) return fail('shared_web_identity_changed');
        diagnostic.coverageByDate[d] = { ...summarizeStoredBucketCoverage(stored.daily_usage_stats_v1?.[d]),
          revisionOrdinal: item.upload.revisionOrdinal, contentHash: item.upload.contentHash };
        diagnostic.coverageByDate = Object.fromEntries(Object.entries(diagnostic.coverageByDate)
          .filter(([date]) => date >= weekStart).slice(-7));
      }
      // Already verified local scope continues before any network read; never send expired proofs online.
      if (bindingCurrent(c)) {
        for (const d of dates) {
          step('native_replace', d);
          const submitted = q.days[d].upload;
          if (nativeReceipts.get(d)?.hash === submitted.contentHash) continue;
          const accepted = await native('replaceSharedWebContribution', { challengeId: sourceBinding.challengeId, upload: submitted });
          if (!await current(c, generation) || !bindingCurrent(c)) return fail('shared_web_identity_changed');
          if (!accepted.ok || accepted.value?.date !== d || accepted.value.revisionOrdinal !== submitted.revisionOrdinal
            || accepted.value.contentHash !== submitted.contentHash) {
            nativeReceipts.clear(); sourceBinding = null; localLease = null; bindingConnection = null;
            preparation = fail('shared_web_native_rejected');
            return preparation;
          }
          nativeReceipts.set(d, { hash: submitted.contentHash, atMs: now() });
          q = await change(c, generation, latest => {
            if (latest.days[d]?.upload.contentHash === submitted.contentHash) latest.days[d].sourceKey = sourceBinding.webSourceKey;
            return latest;
          });
          if (!q) return fail('shared_web_identity_changed');
        }
        preparation = await prepare(c, generation, date, q); preparationScope = c.scopeHash;
      } else {
        nativeReceipts.clear(); preparation = fail('shared_web_binding_unavailable');
      }
      step('cloud_capabilities');
      const cap = await capabilities(c);
      if (!await current(c, generation)) return fail('shared_web_identity_changed');
      if (!cap.ok || !exact(cap.value, ['schemaVersion', 'protocol', 'enabled']) || cap.value.schemaVersion !== 1
        || cap.value.protocol !== 'shared-web-sync-v1' || cap.value.enabled !== true) {
        if (preparation.schemaVersion === 1) preparation.transportStatus = 'offline';
        return fail('shared_web_disabled');
      }
      let sourceKey = null, binding = null;
      for (const d of dates) {
        const old = q.days[d];
        // Watermark is an independent server-derived source identity and ordinal, not a V2 ACK.
        step('cloud_watermark', d);
        const response = await readWatermark(c, d);
        if (!await current(c, generation)) return fail('shared_web_identity_changed');
        if (!response.ok) return fail(response.errorCode || 'shared_web_watermark_unavailable');
        const head = watermark(response.value, d, sourceKey); sourceKey = head.sourceKey;
        const previous = nonnegative(old?.upload?.revisionOrdinal) ? old.upload.revisionOrdinal : 0;
        const next = Math.max(previous, head.revisionOrdinal) + 1;
        if (!Number.isSafeInteger(next)) throw Error('shared_web_ordinal_exhausted');
        let item = await build(c, d, stored, next);
        if (old?.fingerprint === item.fingerprint && old.upload?.policyIdentity?.policyHash === c.policyHash) {
          await verifySharedWebContributionV1(old.upload);
          if (previous > head.revisionOrdinal || previous === head.revisionOrdinal && old.upload.contentHash === head.contentHash) item = old;
        }
        const alreadyConfirmed = old?.cloudConfirmed === true && old.upload?.contentHash === item.upload.contentHash
          && head.revisionOrdinal === item.upload.revisionOrdinal && head.contentHash === item.upload.contentHash;
        q = await change(c, generation, q => { q.days[d] = { ...item, sourceKey, cloudConfirmed: alreadyConfirmed, failures: item.failures || 0, nextRetryAtMs: item.nextRetryAtMs || 0 }; return q; });
        if (!q) return fail('shared_web_identity_changed');
        const submitted = clone(q.days[d].upload);
        diagnostic.coverageByDate[d] = { ...diagnostic.coverageByDate[d],
          revisionOrdinal: submitted.revisionOrdinal, contentHash: submitted.contentHash };
        if (q.days[d].nextRetryAtMs > now()) continue;
        if (!bindingCurrent(c)) {
          step('source_binding', d);
          try { binding = await bind(c, generation, sourceKey); } catch (_) { binding = null; }
          if (!bindingCurrent(c)) diagnostic.nativeFailure = { stage: 'source_binding', date: d,
            errorCode: 'shared_web_binding_unavailable', atMs: now() };
        }
        let nativeAccepted = false;
        if (bindingCurrent(c)) {
          step('native_replace', d);
          const r = nativeReceipts.get(d)?.hash === submitted.contentHash
            ? { ok: true, value: { date: d, revisionOrdinal: submitted.revisionOrdinal, contentHash: submitted.contentHash } }
            : await native('replaceSharedWebContribution', { challengeId: sourceBinding.challengeId, upload: submitted });
          nativeAccepted = r.ok === true && r.value?.date === d && r.value.revisionOrdinal === submitted.revisionOrdinal && r.value.contentHash === submitted.contentHash;
          if (!await current(c, generation)) return fail('shared_web_identity_changed');
          if (nativeAccepted) {
            if (nativeReceipts.get(d)?.hash !== submitted.contentHash) nativeReceipts.set(d, { hash: submitted.contentHash, atMs: now() });
          }
          else { nativeReceipts.delete(d); preparation = fail('shared_web_native_rejected');
            diagnostic.nativeFailure = { stage: 'native_replace', date: d, errorCode: 'shared_web_native_rejected', atMs: now() }; }
          if (nativeAccepted) {
            preparation = await prepare(c, generation, date, q);
            preparationScope = c.scopeHash;
          }
        }
        if (alreadyConfirmed) continue;
        step('cloud_upload', d);
        const r = await upload(c, submitted);
        if (!await current(c, generation)) return fail('shared_web_identity_changed');
        let ack = null;
        if (r.ok) { step('cloud_ack', d); ack = receipt(r.value, submitted, sourceKey); }
        q = await change(c, generation, q => {
          const latest = q.days[d];
          if (latest?.upload?.revisionOrdinal !== submitted.revisionOrdinal || latest.upload.contentHash !== submitted.contentHash) return q;
          latest.nativeAccepted = nativeAccepted;
          latest.cloudConfirmed = ack?.status === 'accepted' || ack?.status === 'duplicate';
          latest.sourceKey = sourceKey;
          latest.failures = latest.cloudConfirmed ? 0 : Math.min(10, (latest.failures || 0) + 1);
          latest.nextRetryAtMs = latest.cloudConfirmed ? 0 : now() + Math.min(1800000, 60000 * 2 ** latest.failures);
          latest.lastErrorCode = latest.cloudConfirmed ? null : ack ? 'shared_web_stale' : 'shared_web_upload_unavailable';
          return q;
        });
        if (!q) return fail('shared_web_identity_changed');
        if (!ack || ack.status === 'stale') return fail(ack ? 'shared_web_stale' : 'shared_web_upload_unavailable');
        diagnostic.cloudAckAtMsByDate[d] = now();
        diagnostic.cloudAckVersionsByDate[d] = { revisionOrdinal: submitted.revisionOrdinal, contentHash: submitted.contentHash };
        diagnostic.cloudAckAtMsByDate = Object.fromEntries(Object.entries(diagnostic.cloudAckAtMsByDate)
          .filter(([date]) => date >= weekStart).slice(-7));
        diagnostic.cloudAckVersionsByDate = Object.fromEntries(Object.entries(diagnostic.cloudAckVersionsByDate)
          .filter(([date]) => date >= weekStart).slice(-7));
      }
      step('local_preparation');
      preparation = await prepare(c, generation, date, q);
      preparationScope = c.scopeHash;
      return { ok: true, sourceKey, dates, preparation, executionEnabled: false };
    } catch (_) { return fail('shared_web_sync_unavailable'); }
  }
  async function prepare(c, generation, date, q) {
    const remote = await readBasis(date);
    if (!remote.ok || !await current(c, generation)) return fail('shared_web_basis_unavailable');
    const replacements = [], versions = [];
    for (const [d, item] of Object.entries(q.days)) {
      const accepted = nativeReceipts.get(d);
      if (!bindingCurrent(c) || accepted?.hash !== item.upload?.contentHash || !item.upload.complete) continue;
      const source = sharedWebExecutionSourceV1(await verifySharedWebContributionV1(item.upload), item.sourceKey);
      const authorized = remote.authorizedScopes?.some(s => s.source === 'web' && s.sourceKey === item.sourceKey && s.date === d);
      const old = remote.basis?.days.find(day => day.date === d)?.sources.find(s => s.contribution.source === 'web' && s.contribution.sourceKey === item.sourceKey);
      if (!authorized || !old) continue;
      replacements.push({ basisRevision: remote.basis.revision, expectedPublicationRevision: old.publicationRevision,
        revisionOrdinal: source.revisionOrdinal, contribution: source.contribution });
      versions.push({ source: 'web', sourceKey: item.sourceKey, date: d, revisionOrdinal: source.revisionOrdinal, contentRevision: item.upload.contentHash });
    }
    try {
      const projection = projectLocalSharedQuotaExecution(c.policy, remote.basis, replacements, remote.authorizedScopes);
      if (versions.length !== Object.keys(q.days).length) {
        projection.complete = false;
        projection.reasonCodes = [...new Set([...projection.reasonCodes, 'LOCAL_WEB_REPLACEMENT_MISSING'])].sort();
      }
      if (!await current(c, generation)) return fail('shared_web_identity_changed');
      return { schemaVersion: 1, basisRevision: remote.basis.revision, policyIdentity: clone(c.policyIdentity), projection,
        transportStatus: remote.status === 'lkg' ? 'offline' : 'online', replacementVersions: versions,
        reasonCodes: projection.reasonCodes, executionEnabled: false };
    } catch (_) { return fail('shared_web_replacement_context_changed'); }
  }
  function refresh() {
    if (!enabled) return Promise.resolve(fail('shared_web_disabled'));
    if (running) { queued = true; return running; }
    const generation = epoch;
    diagnostic.lastAttemptAtMs = now();
    running = perform(generation).then(result => {
      if (generation === epoch) {
        diagnostic.lastCompletedAtMs = now();
        diagnostic.lastErrorCode = result?.ok === false ? diagnosticErrors.has(result.errorCode) ? result.errorCode : 'unknown' : null;
        diagnostic.failedStage = diagnostic.lastErrorCode ? diagnosticStage : null;
        diagnostic.failedDate = diagnostic.lastErrorCode ? diagnosticDate : null;
        void budgetedLocalSet({ [SHARED_WEB_DIAGNOSTICS_KEY]: clone(diagnostic) },
          { priority: 'diagnostic', source: 'shared_web_diagnostics' }).catch(() => {});
      }
      return result;
    }).finally(() => { running = null; if (queued && enabled) { queued = false; void refresh(); } });
    return running;
  }
  return { refresh,
    readDiagnostics(policyHash, days = {}, scopeHash = null) {
      const connection = readConnection();
      let bindingState = !enabled ? 'disabled' : !connection.connection ? 'disconnected' : !sourceBinding ? 'unbound' : 'unknown';
      if (sourceBinding && diagnosticContext && diagnosticContext.policyHash === policyHash) {
        bindingState = bindingCurrent(diagnosticContext) ? 'valid' : 'expired_or_changed';
      }
      return { bindingState, cacheScopeCurrent: diagnosticContext
          ? diagnosticContext.scopeHash === scopeHash && diagnosticContext.policyHash === policyHash : null,
        running: running !== null, stage: running ? diagnosticStage : null,
        currentNativeAckAtMsByDate: Object.fromEntries(Object.entries(days).slice(0, 7).map(([date, item]) =>
          [date, bindingState === 'valid' && nativeReceipts.has(date) && nativeReceipts.get(date).hash === item?.upload?.contentHash
            ? nativeReceipts.get(date).atMs : null])),
        currentNativeConfirmedByDate: Object.fromEntries(Object.entries(days).slice(0, 7).map(([date, item]) =>
          [date, !item?.upload || bindingState === 'unknown' ? null : bindingState === 'valid'
            && nativeReceipts.has(date) && nativeReceipts.get(date).hash === item?.upload?.contentHash])) };
    },
    invalidate() { epoch++; queued = false; sourceBinding = null; localLease = null; bindingConnection = null; diagnosticContext = null; nativeReceipts.clear(); preparation = fail('shared_web_identity_changed'); },
    configure(value) { epoch++; sourceBinding = null; localLease = null; bindingConnection = null; nativeReceipts.clear(); preparation = fail('shared_web_not_prepared'); enabled = value === true; return refresh(); },
    async readBinding() {
      if (!enabled) return fail('shared_web_disabled');
      const generation = epoch, c = await capture(), binding = sourceBinding;
      if (!binding || !bindingCurrent(c) || binding.scopeHash !== c.scopeHash
        || !await current(c, generation) || binding !== sourceBinding) return fail('shared_web_binding_unavailable');
      return { ok: true, ...clone(binding) };
    },
    async readPreparation() {
      if (!enabled) return fail('shared_web_disabled');
      const generation = epoch, c = await capture();
      if (preparationScope !== c.scopeHash || preparation.policyIdentity?.policyHash !== c.policyHash || preparation.projection?.week.toDate !== new Date(now() + 28800000).toISOString().slice(0, 10)) return fail('shared_web_not_prepared');
      if (!bindingCurrent(c)) return fail('shared_web_binding_expired');
      const stored = clone(await readStorage(['daily_usage_stats_v1', 'guardian_config', SHARED_WEB_QUEUE_KEY]));
      const q = stored[SHARED_WEB_QUEUE_KEY];
      for (const v of preparation.replacementVersions) {
        const item = q?.days?.[v.date];
        if (!item || item.upload.contentHash !== v.contentRevision
          || item.upload.statisticsRevision !== await hash(stored.daily_usage_stats_v1?.[v.date] || null)
          || item.upload.correctionRevision !== await hash((stored.guardian_config?.usageAccountingCorrectionsV1 || []).filter(r => r.date === v.date && (!r.deviceId || r.deviceId === c.deviceId)))) return fail('shared_web_local_version_changed');
      }
      if (!await current(c, generation)) return fail('shared_web_identity_changed');
      return clone(preparation);
    },
    async replacements() {
      if (!enabled) return fail('shared_web_disabled');
      try {
        const c = await capture(), raw = (await readStorage([SHARED_WEB_QUEUE_KEY]))[SHARED_WEB_QUEUE_KEY];
        if (raw?.scopeHash !== c.scopeHash) return fail('shared_web_identity_changed');
        const sources = [];
        for (const item of Object.values(raw.days || {})) {
          const accepted = nativeReceipts.get(item.upload?.date);
          if (!bindingCurrent(c) || accepted?.hash !== item.upload?.contentHash || item.upload?.policyIdentity?.policyHash !== c.policyHash) continue;
          sources.push(sharedWebExecutionSourceV1(await verifySharedWebContributionV1(item.upload), item.sourceKey));
        }
        return { ok: true, sources, executionEnabled: false };
      } catch (_) { return fail('shared_web_local_read_failed'); }
    } };
}

let sync;
export function configureSharedWebContributionSync({ enabled = false } = {}) { return sync?.configure(enabled) || Promise.resolve(fail('shared_web_disabled')); }
export function readLocalSharedWebReplacements() { return sync?.replacements() || Promise.resolve(fail('shared_web_disabled')); }
export function readLocalSharedQuotaPreparation() { return sync?.readPreparation() || Promise.resolve(fail('shared_web_disabled')); }
export function readSharedWebSourceBinding() { return sync?.readBinding() || Promise.resolve(fail('shared_web_disabled')); }
export function readSharedWebDiagnosticState(policyHash, days, scopeHash) {
  return sync?.readDiagnostics(policyHash, days, scopeHash) || { bindingState: 'unknown', cacheScopeCurrent: null, running: null, stage: null, currentNativeConfirmedByDate: {} };
}
export function initSharedWebContributionSync() {
  if (sync) return;
  sync = createSharedWebContributionSync();
  const refresh = () => { void sync.refresh().catch(() => {}); };
  chrome.runtime.onStartup.addListener(refresh); chrome.runtime.onInstalled.addListener(refresh);
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'timeonchromeLocalGuardianHeartbeat') refresh(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (['cloud_device_token', 'cloud_device_id', 'cloud_profile_id', SHARED_ACCESS_POLICY_LKG_KEY].some(k => Object.hasOwn(changes, k))) sync.invalidate();
    if (['daily_usage_stats_v1', 'guardian_config', 'cloud_device_token', 'cloud_device_id', 'cloud_profile_id', SHARED_ACCESS_POLICY_LKG_KEY].some(k => Object.hasOwn(changes, k))) refresh();
  });
  let previous = false;
  observeSharedAccessPolicyCapability(available => {
    if (available !== previous) { sync.invalidate(); if (available) refresh(); }
    previous = available;
  });
  refresh();
}

import { deriveForcedUseContribution, summarizeForcedUseDay } from '../core/forced-use-contribution.js';
import { getUsageSegmentsByDate, subscribePersistedUsageSegments } from '../core/usage-segments.js';
import { runStorageMutation } from './storage-budget.js';
import { FORCED_USE_PROMPT_KEY } from '../product/forced-use-prompt.js';

export const FORCED_USE_INTERVALS_KEY = 'forced_use_confirmed_intervals_v1';
export const FORCED_USE_CONTRIBUTIONS_KEY = 'forced_use_contributions_v1';
export const FORCED_USE_ENROLLMENT_KEY = 'forced_use_enrollment_v1';
export const FORCED_USE_GRANT_JOURNAL_KEY = 'forced_use_grant_journal_v1';
export const FORCED_USE_GRANT_ENROLLMENT_KEY = 'forced_use_grant_enrollment_v1';
const MAX_INTERVALS = 128;
const MAX_CONTRIBUTIONS = 2048;
const MAX_GRANT_EVIDENCE = 128;
const RETAIN_DAYS = 3;
let startupRecovery = null;

export async function markDerivedIncomplete({ irrecoverable = false, date = beijingDate(Date.now()) } = {}) {
  await runStorageMutation(async storage => {
    const current = (await storage.get(FORCED_USE_CONTRIBUTIONS_KEY))[FORCED_USE_CONTRIBUTIONS_KEY];
    if (current?.schemaVersion !== 1) return;
    const irrecoverableDates = [...new Set([...(current.irrecoverableDates || []),
      ...(irrecoverable ? [date] : [])])].filter(value => recentDate(value, Date.now()));
    await storage.set({ [FORCED_USE_CONTRIBUTIONS_KEY]: { ...current, complete: false,
      irrecoverableDates } },
      { priority: 'derived', source: 'forced_use_evidence_incomplete' });
  }, { priority: 'derived', source: 'forced_use_evidence_incomplete' }).catch(() => {});
}

export async function ensureForcedUseContributions() {
  try {
    const stored = await chrome.storage.local.get([FORCED_USE_INTERVALS_KEY, FORCED_USE_CONTRIBUTIONS_KEY,
      FORCED_USE_ENROLLMENT_KEY, 'cloud_profile_id', 'cloud_device_id']);
    const identity = { profileId: stored.cloud_profile_id, deviceId: stored.cloud_device_id,
      date: beijingDate(Date.now()) };
    if (!identity.profileId || !identity.deviceId) return { ok: false, reason: 'identity_unavailable' };
    if (stored[FORCED_USE_INTERVALS_KEY] && stored[FORCED_USE_CONTRIBUTIONS_KEY]) return { ok: true };
    if (stored[FORCED_USE_INTERVALS_KEY] || stored[FORCED_USE_CONTRIBUTIONS_KEY]) {
      return { ok: false, reason: 'derived_state_partial' };
    }
    if (stored[FORCED_USE_ENROLLMENT_KEY]?.profileId === identity.profileId
      && stored[FORCED_USE_ENROLLMENT_KEY]?.deviceId === identity.deviceId
      && stored[FORCED_USE_ENROLLMENT_KEY]?.date === identity.date) {
      return { ok: false, reason: 'derived_state_lost' };
    }
    const grants = (await chrome.storage.session.get(FORCED_USE_PROMPT_KEY))[FORCED_USE_PROMPT_KEY]?.grants;
    if (grants?.length) return { ok: false, reason: 'derived_state_missing_with_grants' };
    return runStorageMutation(async storage => {
      const current = await storage.get([FORCED_USE_INTERVALS_KEY, FORCED_USE_CONTRIBUTIONS_KEY,
        FORCED_USE_ENROLLMENT_KEY]);
      if (current[FORCED_USE_INTERVALS_KEY] || current[FORCED_USE_CONTRIBUTIONS_KEY]) {
        return { ok: current[FORCED_USE_INTERVALS_KEY]?.schemaVersion === 1
          && current[FORCED_USE_CONTRIBUTIONS_KEY]?.schemaVersion === 1 };
      }
      if (current[FORCED_USE_ENROLLMENT_KEY]?.profileId === identity.profileId
        && current[FORCED_USE_ENROLLMENT_KEY]?.deviceId === identity.deviceId
        && current[FORCED_USE_ENROLLMENT_KEY]?.date === identity.date) {
        return { ok: false, reason: 'derived_state_lost' };
      }
      await storage.set({ [FORCED_USE_ENROLLMENT_KEY]: identity },
        { priority: 'critical', source: 'forced_use_enrollment' });
      await storage.set({ [FORCED_USE_INTERVALS_KEY]: { schemaVersion: 1, intervals: [] },
        [FORCED_USE_CONTRIBUTIONS_KEY]: { schemaVersion: 1, bySegment: {}, complete: true } },
      { priority: 'derived', source: 'forced_use_initialize' });
      return { ok: true };
    }, { priority: 'derived', source: 'forced_use_initialize' });
  } catch (_) {
    return { ok: false, reason: 'storage_unavailable' };
  }
}

function beijingDate(ms) {
  return new Date(ms + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function recentDate(date, now) {
  const today = beijingDate(now);
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - (RETAIN_DAYS - 1) * 86400000)
    .toISOString().slice(0, 10);
  return date >= cutoff && date <= today;
}

function validGrantEvidence(grant) {
  return grant && typeof grant.profileId === 'string' && grant.profileId
    && typeof grant.deviceId === 'string' && grant.deviceId
    && typeof grant.ruleId === 'string' && grant.ruleId
    && typeof grant.domain === 'string' && grant.domain
    && Array.isArray(grant.causes) && grant.causes.length > 0
    && grant.causes.every(cause => typeof cause === 'string' && cause)
    && Number.isSafeInteger(grant.startMs) && grant.startMs >= 0
    && grant.date === beijingDate(grant.startMs)
    && (grant.closeIntentAt == null || Number.isSafeInteger(grant.closeIntentAt)
      && grant.closeIntentAt >= grant.startMs);
}

export async function persistForcedUseGrantEvidence(grant, now = Date.now()) {
  if (!validGrantEvidence({ ...grant, closeIntentAt: null }) || grant.startMs > now
    || !recentDate(grant.date, now)) return { ok: false, reason: 'grant_evidence_invalid' };
  return runStorageMutation(async storage => {
    const saved = (await storage.get(FORCED_USE_GRANT_JOURNAL_KEY))[FORCED_USE_GRANT_JOURNAL_KEY];
    if (saved && (saved.schemaVersion !== 1 || !Array.isArray(saved.grants)
      || saved.grants.some(row => !validGrantEvidence(row)))) {
      return { ok: false, reason: 'grant_journal_invalid' };
    }
    const grants = (saved?.grants || []).filter(row => recentDate(row.date, now));
    if (grants.some(row => row.profileId === grant.profileId && row.deviceId === grant.deviceId
      && row.ruleId === grant.ruleId && row.domain === grant.domain && row.startMs === grant.startMs)) {
      const existing = grants.find(row => row.profileId === grant.profileId && row.deviceId === grant.deviceId
        && row.ruleId === grant.ruleId && row.domain === grant.domain && row.startMs === grant.startMs);
      return existing.closeIntentAt == null ? { ok: true, duplicate: true }
        : { ok: false, reason: 'grant_evidence_closed' };
    }
    if (grants.length >= MAX_GRANT_EVIDENCE) return { ok: false, reason: 'grant_journal_limit' };
    grants.push({ profileId: grant.profileId, deviceId: grant.deviceId, date: grant.date,
      ruleId: grant.ruleId, domain: grant.domain, causes: [...grant.causes],
      startMs: grant.startMs, closeIntentAt: null });
    await storage.set({ [FORCED_USE_GRANT_JOURNAL_KEY]: { schemaVersion: 1, grants },
      [FORCED_USE_GRANT_ENROLLMENT_KEY]: { schemaVersion: 1, profileId: grant.profileId,
        deviceId: grant.deviceId, date: grant.date } },
      { priority: 'critical', source: 'forced_use_grant_evidence' });
    return { ok: true };
  }, { priority: 'critical', source: 'forced_use_grant_evidence' })
    .catch(() => ({ ok: false, reason: 'grant_journal_unavailable' }));
}

export async function closeForcedUseGrantEvidence(host, endedAt = Date.now()) {
  if (!host || !Number.isSafeInteger(endedAt)) return { ok: false, reason: 'grant_close_invalid' };
  return runStorageMutation(async storage => {
    const data = await storage.get([FORCED_USE_GRANT_JOURNAL_KEY, 'cloud_profile_id', 'cloud_device_id']);
    const saved = data[FORCED_USE_GRANT_JOURNAL_KEY];
    const session = (await chrome.storage.session.get(FORCED_USE_PROMPT_KEY))[FORCED_USE_PROMPT_KEY];
    const expected = (Array.isArray(session?.grants) ? session.grants : []).filter(row =>
      row.durableEvidence === true && row.endMs == null && row.domain === host
      && row.profileId === data.cloud_profile_id && row.deviceId === data.cloud_device_id);
    if (!saved) return expected.length ? { ok: false, reason: 'grant_journal_missing' }
      : { ok: true, closed: 0 };
    if (saved.schemaVersion !== 1 || !Array.isArray(saved.grants)
      || saved.grants.some(row => !validGrantEvidence(row))) {
      return { ok: false, reason: 'grant_journal_invalid' };
    }
    if (expected.some(grant => !saved.grants.some(row => row.profileId === grant.profileId
      && row.deviceId === grant.deviceId && row.ruleId === grant.ruleId
      && row.domain === grant.domain && row.startMs === grant.startMs))) {
      return { ok: false, reason: 'grant_journal_missing' };
    }
    let closed = 0;
    const grants = saved.grants.filter(row => recentDate(row.date, endedAt)).map(row => {
      if (row.profileId !== data.cloud_profile_id || row.deviceId !== data.cloud_device_id
        || row.domain !== host || row.closeIntentAt != null) return row;
      closed++;
      return { ...row, closeIntentAt: Math.max(row.startMs, endedAt) };
    });
    if (closed) await storage.set({ [FORCED_USE_GRANT_JOURNAL_KEY]: { schemaVersion: 1, grants } },
      { priority: 'critical', source: 'forced_use_grant_close' });
    return { ok: true, closed };
  }, { priority: 'critical', source: 'forced_use_grant_close' })
    .catch(() => ({ ok: false, reason: 'grant_journal_unavailable' }));
}

function validInterval(interval) {
  return interval && typeof interval.ruleId === 'string' && interval.ruleId
    && typeof interval.profileId === 'string' && interval.profileId
    && typeof interval.deviceId === 'string' && interval.deviceId
    && Array.isArray(interval.causes) && interval.causes.length > 0
    && interval.causes.every(cause => typeof cause === 'string' && cause)
    && (typeof interval.domain === 'string' && interval.domain || typeof interval.managedTargetId === 'string' && interval.managedTargetId)
    && Number.isSafeInteger(interval.startMs) && Number.isSafeInteger(interval.endMs)
    && interval.startMs >= 0 && interval.endMs > interval.startMs
    && interval.endMs < 8639999971200000
    && beijingDate(interval.startMs) === beijingDate(interval.endMs - 1);
}

export async function recordConfirmedForcedUseInterval(input, now = Date.now()) {
  const identity = await chrome.storage.local.get(['cloud_profile_id', 'cloud_device_id']);
  const interval = {
    ruleId: input?.ruleId,
    causes: input?.causes,
    profileId: identity.cloud_profile_id,
    deviceId: identity.cloud_device_id,
    domain: input?.domain || null,
    managedTargetId: input?.managedTargetId || null,
    startMs: input?.startMs,
    endMs: input?.endMs,
  };
  if (!validInterval(interval) || interval.endMs > now || !recentDate(beijingDate(interval.startMs), now)) {
    return { ok: false, reason: 'interval_invalid' };
  }
  const stored = await runStorageMutation(async storage => {
    const saved = (await storage.get(FORCED_USE_INTERVALS_KEY))[FORCED_USE_INTERVALS_KEY];
    if (saved && (saved.schemaVersion !== 1 || !Array.isArray(saved.intervals)
      || saved.intervals.some(row => !validInterval(row)))) {
      return { ok: false, reason: 'intervals_unavailable' };
    }
    const intervals = (saved?.intervals || []).filter(row => validInterval(row)
      && recentDate(beijingDate(row.startMs), now));
    if (intervals.some(row => JSON.stringify(row) === JSON.stringify(interval))) {
      return { ok: true, duplicate: true };
    }
    const adjacent = intervals.find(row => row.ruleId === interval.ruleId
      && row.profileId === interval.profileId && row.deviceId === interval.deviceId
      && row.domain === interval.domain && row.managedTargetId === interval.managedTargetId
      && JSON.stringify(row.causes) === JSON.stringify(interval.causes)
      && row.endMs === interval.startMs);
    if (adjacent) adjacent.endMs = interval.endMs;
    else {
      if (intervals.length >= MAX_INTERVALS) return { ok: false, reason: 'interval_limit' };
      intervals.push(interval);
    }
    const contributions = (await storage.get(FORCED_USE_CONTRIBUTIONS_KEY))[FORCED_USE_CONTRIBUTIONS_KEY];
    if (contributions && (contributions.schemaVersion !== 1 || !contributions.bySegment
      || typeof contributions.bySegment !== 'object')) return { ok: false, reason: 'derived_state_invalid' };
    await storage.set({
      [FORCED_USE_INTERVALS_KEY]: { schemaVersion: 1, intervals },
      ...(contributions ? {} : { [FORCED_USE_CONTRIBUTIONS_KEY]: { schemaVersion: 1, bySegment: {}, complete: false } }),
    },
      { priority: 'derived', source: 'forced_use_interval' });
    return { ok: true };
  }, { priority: 'derived', source: 'forced_use_interval' }).catch(() => ({ ok: false, reason: 'storage_unavailable' }));
  if (!stored.ok) {
    if (stored.reason === 'interval_limit') await markDerivedIncomplete();
    return stored;
  }
  const rebuilt = await reconcileForcedUseContributions(now).catch(() => ({ ok: false, reason: 'derived_reconcile_failed' }));
  return { ...stored, derivedReady: rebuilt.ok === true,
    ...(rebuilt.ok ? {} : { reason: rebuilt.reason || 'derived_reconcile_failed' }) };
}

export function beginForcedUseContributionRecovery(now = Date.now()) {
  if (!startupRecovery) startupRecovery = recoverForcedUseIntervalsFromGrants(now);
  return startupRecovery;
}

export async function recoverForcedUseIntervalsFromGrants(now = Date.now()) {
  try {
    const identity = await chrome.storage.local.get(['cloud_profile_id', 'cloud_device_id',
      FORCED_USE_INTERVALS_KEY, FORCED_USE_GRANT_JOURNAL_KEY, FORCED_USE_GRANT_ENROLLMENT_KEY]);
    const saved = identity[FORCED_USE_INTERVALS_KEY];
    if (saved && (saved.schemaVersion !== 1 || !Array.isArray(saved.intervals)
      || saved.intervals.some(row => !validInterval(row)))) {
      return { ok: false, reason: 'intervals_unavailable' };
    }
    const coveredIntervals = [...(saved?.intervals || [])];
    const state = (await chrome.storage.session.get(FORCED_USE_PROMPT_KEY))[FORCED_USE_PROMPT_KEY];
    if (state?.grants != null && !Array.isArray(state.grants)) {
      return { ok: false, reason: 'grant_evidence_invalid' };
    }
    const journal = identity[FORCED_USE_GRANT_JOURNAL_KEY];
    const enrollment = identity[FORCED_USE_GRANT_ENROLLMENT_KEY];
    if (!journal && enrollment?.schemaVersion === 1
      && enrollment.profileId === identity.cloud_profile_id
      && enrollment.deviceId === identity.cloud_device_id
      && recentDate(enrollment.date, now)) {
      return { ok: false, reason: 'grant_journal_missing' };
    }
    if (journal && (journal.schemaVersion !== 1 || !Array.isArray(journal.grants)
      || journal.grants.some(row => !validGrantEvidence(row)))) {
      return { ok: false, reason: 'grant_journal_invalid' };
    }
    const keyFor = row => JSON.stringify([row.profileId, row.deviceId, row.ruleId,
      row.domain, row.startMs]);
    const sessionGrants = new Map();
    for (const grant of state?.grants || []) {
      if (!validGrantEvidence({ ...grant, closeIntentAt: null })
        || grant.endMs != null && (!Number.isSafeInteger(grant.endMs)
          || grant.endMs < grant.startMs)) return { ok: false, reason: 'grant_evidence_invalid' };
      sessionGrants.set(keyFor(grant), grant);
    }
    const durableGrants = (journal?.grants || []).filter(row => recentDate(row.date, now));
    const durableKeys = new Set(durableGrants.map(keyFor));
    if ([...sessionGrants.values()].some(row => row.durableEvidence === true
      && !durableKeys.has(keyFor(row)))) return { ok: false, reason: 'grant_journal_missing' };
    let sealed = false;
    const grants = durableGrants.map(row => {
      const session = sessionGrants.get(keyFor(row));
      sessionGrants.delete(keyFor(row));
      if (row.closeIntentAt != null) return row;
      if (session?.endMs == null && session) return row;
      sealed = true;
      return { ...row, closeIntentAt: Math.max(row.startMs, Math.min(session?.endMs ?? now, now)) };
    });
    if (sealed) {
      const result = await runStorageMutation(async storage => {
        const current = (await storage.get(FORCED_USE_GRANT_JOURNAL_KEY))[FORCED_USE_GRANT_JOURNAL_KEY];
        if (current?.schemaVersion !== 1 || !Array.isArray(current.grants)
          || current.grants.some(row => !validGrantEvidence(row))) return { ok: false };
        const closures = new Map(grants.filter(row => row.closeIntentAt != null)
          .map(row => [keyFor(row), row.closeIntentAt]));
        const updated = current.grants.map(row => row.closeIntentAt == null && closures.has(keyFor(row))
          ? { ...row, closeIntentAt: closures.get(keyFor(row)) } : row);
        await storage.set({ [FORCED_USE_GRANT_JOURNAL_KEY]: { schemaVersion: 1, grants: updated } },
          { priority: 'critical', source: 'forced_use_grant_recovery_seal' });
        return { ok: true };
      }, { priority: 'critical', source: 'forced_use_grant_recovery_seal' });
      if (result?.ok !== true) return { ok: false, reason: 'grant_journal_unavailable' };
    }
    grants.push(...sessionGrants.values().map(row => ({ ...row, closeIntentAt: row.endMs ?? null })));
    let recovered = 0;
    const segmentsByDate = new Map();
    for (const grant of grants) {
      if (typeof grant?.date === 'string' && !recentDate(grant.date, now)) continue;
      if (grant.profileId !== identity.cloud_profile_id || grant.deviceId !== identity.cloud_device_id) continue;
      if (!Number.isSafeInteger(grant.startMs)
        || grant.startMs < 0 || !grant.domain || !grant.ruleId
        || !Array.isArray(grant.causes) || !grant.causes.length) {
        return { ok: false, reason: 'grant_evidence_invalid' };
      }
      if (!segmentsByDate.has(grant.date)) {
        segmentsByDate.set(grant.date, await getUsageSegmentsByDate(grant.date));
      }
      const segments = segmentsByDate.get(grant.date);
      for (const segment of segments) {
        if (segment.channel !== 'active' || segment.profileId !== grant.profileId
          || segment.deviceId !== grant.deviceId || segment.domain !== grant.domain) continue;
        const startMs = Math.max(segment.startMs, grant.startMs);
        const endMs = Math.min(segment.endMs, grant.closeIntentAt ?? now, now);
        if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || endMs <= startMs) continue;
        if (coveredIntervals.some(row => row.ruleId === grant.ruleId
          && row.profileId === grant.profileId && row.deviceId === grant.deviceId
          && row.domain === grant.domain && row.startMs <= startMs && row.endMs >= endMs
          && grant.causes.every(cause => row.causes.includes(cause)))) continue;
        const result = await recordConfirmedForcedUseInterval({ ruleId: grant.ruleId,
          causes: grant.causes, domain: grant.domain, startMs, endMs }, now);
        if (!result.ok || result.derivedReady === false) return { ok: false,
          reason: result.reason || 'grant_recovery_failed' };
        if (!result.duplicate) {
          coveredIntervals.push({ ruleId: grant.ruleId, causes: grant.causes,
            profileId: grant.profileId, deviceId: grant.deviceId, domain: grant.domain,
            startMs, endMs });
          recovered++;
        }
      }
    }
    const reconciled = await reconcileForcedUseContributions(now);
    return reconciled.ok ? { ok: true, recovered } : reconciled;
  } catch (_) {
    return { ok: false, reason: 'grant_recovery_unavailable' };
  }
}

export async function reconcileForcedUseContributions(now = Date.now(), settledSegments = null) {
  const stored = await chrome.storage.local.get([FORCED_USE_INTERVALS_KEY, FORCED_USE_CONTRIBUTIONS_KEY]);
  const intervalsState = stored[FORCED_USE_INTERVALS_KEY];
  const bookState = stored[FORCED_USE_CONTRIBUTIONS_KEY];
  if (intervalsState && (intervalsState.schemaVersion !== 1 || !Array.isArray(intervalsState.intervals)
    || intervalsState.intervals.some(row => !validInterval(row)))
    || bookState && (bookState.schemaVersion !== 1 || !bookState.bySegment || typeof bookState.bySegment !== 'object')) {
    return { ok: false, reason: 'derived_state_invalid' };
  }
  const intervals = (intervalsState?.intervals || []).filter(row => validInterval(row)
    && recentDate(beijingDate(row.startMs), now));
  if (!intervals.length) return { ok: true, contributed: 0 };
  const dates = [...new Set(intervals.map(row => beijingDate(row.startMs)))];
  const fullScan = !Array.isArray(settledSegments);
  const segments = !fullScan ? settledSegments
    : (await Promise.all(dates.map(date => getUsageSegmentsByDate(date)))).flat();
  if (fullScan) {
    const scannedIds = new Set(segments.map(row => row.id));
    const missingRaw = Object.values(bookState?.bySegment || {}).some(row => dates.includes(row?.date)
      && !scannedIds.has(row.sourceSegmentId));
    if (missingRaw) {
      await runStorageMutation(async storage => {
        const current = (await storage.get(FORCED_USE_CONTRIBUTIONS_KEY))[FORCED_USE_CONTRIBUTIONS_KEY];
        await storage.set({ [FORCED_USE_CONTRIBUTIONS_KEY]: { ...current, complete: false } },
          { priority: 'derived', source: 'forced_use_evidence_missing' });
      }, { priority: 'derived', source: 'forced_use_evidence_missing' });
      return { ok: false, reason: 'raw_evidence_missing' };
    }
  }
  let book = Object.fromEntries(Object.entries(bookState?.bySegment || {})
    .filter(([, row]) => recentDate(row?.date || '', now)));
  let contributed = 0;
  for (const segment of segments) {
    const result = deriveForcedUseContribution(segment, intervals);
    if (!result.ok) return result;
    if (!result.contribution || result.contribution.seconds === 0) continue;
    const old = book[result.contribution.sourceSegmentId];
    if (old && (old.profileId !== result.contribution.profileId
      || old.deviceId !== result.contribution.deviceId || old.date !== result.contribution.date)) {
      return { ok: false, reason: 'derived_state_conflict' };
    }
    if (JSON.stringify(old) !== JSON.stringify(result.contribution)) {
      book[result.contribution.sourceSegmentId] = result.contribution;
      contributed++;
    }
    if (Object.keys(book).length > MAX_CONTRIBUTIONS) return { ok: false, reason: 'contribution_limit' };
  }
  if (contributed || fullScan) {
    await runStorageMutation(async storage => {
      const current = (await storage.get(FORCED_USE_CONTRIBUTIONS_KEY))[FORCED_USE_CONTRIBUTIONS_KEY];
      let merged = { ...(current?.bySegment || {}) };
      const currentIntervals = (await storage.get(FORCED_USE_INTERVALS_KEY))[FORCED_USE_INTERVALS_KEY]?.intervals || [];
      for (const segment of segments) {
        const result = deriveForcedUseContribution(segment, currentIntervals);
        if (!result.ok) throw new Error(result.reason);
        const row = result.contribution;
        if (!row || row.seconds === 0) continue;
        const old = merged[row.sourceSegmentId];
        if (old && (old.profileId !== row.profileId || old.deviceId !== row.deviceId || old.date !== row.date)) {
          throw new Error('derived_state_conflict');
        }
        merged[row.sourceSegmentId] = row;
      }
      merged = Object.fromEntries(Object.entries(merged).filter(([, row]) => recentDate(row?.date || '', now)));
      if (Object.keys(merged).length > MAX_CONTRIBUTIONS) throw new Error('contribution_limit');
      const irrecoverableDates = (current?.irrecoverableDates || []).filter(value => recentDate(value, now));
      await storage.set({ [FORCED_USE_CONTRIBUTIONS_KEY]: { schemaVersion: 1, bySegment: merged,
        complete: fullScan ? true : current?.complete === true, irrecoverableDates } },
        { priority: 'derived', source: 'forced_use_contribution' });
    }, { priority: 'derived', source: 'forced_use_contribution' });
  }
  return { ok: true, contributed };
}

export async function readForcedUseDay({ profileId, deviceId, date }) {
  try {
    const recovered = await beginForcedUseContributionRecovery();
    if (!recovered.ok) return { ok: false, reason: recovered.reason || 'grant_recovery_unavailable' };
    const stored = await chrome.storage.local.get([FORCED_USE_INTERVALS_KEY, FORCED_USE_CONTRIBUTIONS_KEY]);
    const intervals = stored[FORCED_USE_INTERVALS_KEY];
    const contributions = stored[FORCED_USE_CONTRIBUTIONS_KEY];
    if (!intervals || intervals.schemaVersion !== 1 || !Array.isArray(intervals.intervals)
      || intervals.intervals.some(row => !validInterval(row))
      || !contributions || contributions.schemaVersion !== 1 || !contributions.bySegment) {
      return { ok: false, reason: 'derived_state_unavailable' };
    }
    if (Object.values(contributions.bySegment).some(row => !row?.sourceSegmentId
      || !row.profileId || !row.deviceId || !row.date || !Number.isSafeInteger(row.seconds)
      || row.seconds < 0 || !row.byRuleSeconds || !row.byCauseSeconds
      || Object.values(row.byRuleSeconds).some(seconds => !Number.isSafeInteger(seconds) || seconds < 0)
      || Object.values(row.byCauseSeconds).some(seconds => !Number.isSafeInteger(seconds) || seconds < 0))) {
      return { ok: false, reason: 'derived_state_invalid' };
    }
    if (contributions.irrecoverableDates?.includes(date)) {
      return { ok: false, reason: 'derived_evidence_incomplete' };
    }
    if (contributions.complete !== true) return { ok: false, reason: 'derived_evidence_incomplete' };
    return { ok: true, ...summarizeForcedUseDay(contributions.bySegment, { profileId, deviceId, date }) };
  } catch (_) {
    return { ok: false, reason: 'storage_unavailable' };
  }
}

export function initForcedUseContributionObserver() {
  return subscribePersistedUsageSegments(segments => {
    (async () => {
      const grants = (await chrome.storage.session.get(FORCED_USE_PROMPT_KEY))[FORCED_USE_PROMPT_KEY]?.grants;
      if (grants && !Array.isArray(grants)) return;
      const identity = await chrome.storage.local.get(['cloud_profile_id', 'cloud_device_id',
        FORCED_USE_GRANT_JOURNAL_KEY]);
      const journal = identity[FORCED_USE_GRANT_JOURNAL_KEY];
      if (journal && (journal.schemaVersion !== 1 || !Array.isArray(journal.grants)
        || journal.grants.some(row => !validGrantEvidence(row)))) {
        await markDerivedIncomplete();
        return;
      }
      for (const segment of segments || []) {
        if (segment?.channel !== 'active' || !Number.isSafeInteger(segment.startMs)
          || !Number.isSafeInteger(segment.endMs)) continue;
        for (const grant of grants || []) {
          if (grant.profileId !== identity.cloud_profile_id || grant.deviceId !== identity.cloud_device_id
            || grant.profileId !== segment.profileId || grant.deviceId !== segment.deviceId
            || grant.date !== segment.date || grant.domain !== segment.domain) continue;
          const evidence = (journal?.grants || []).find(row => row.profileId === grant.profileId
            && row.deviceId === grant.deviceId && row.ruleId === grant.ruleId
            && row.domain === grant.domain && row.startMs === grant.startMs);
          if (grant.durableEvidence === true && !evidence) {
            await markDerivedIncomplete({ date: segment.date });
            return;
          }
          const startMs = Math.max(segment.startMs, grant.startMs);
          const endMs = Math.min(segment.endMs, grant.endMs ?? segment.endMs,
            evidence?.closeIntentAt ?? segment.endMs);
          if (endMs <= startMs) continue;
          const recorded = await recordConfirmedForcedUseInterval({ ruleId: grant.ruleId, causes: grant.causes,
            domain: grant.domain, startMs, endMs });
          if (!recorded.ok || recorded.derivedReady === false) {
            await markDerivedIncomplete();
            return;
          }
        }
      }
      const result = await reconcileForcedUseContributions(Date.now(), segments);
      if (!result.ok) await markDerivedIncomplete();
    })().catch(() => markDerivedIncomplete());
  });
}

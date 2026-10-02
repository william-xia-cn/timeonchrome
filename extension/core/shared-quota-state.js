// Read-only validation for the D-114 shared quota state. It does not drive access decisions.

const BUCKETS = ['study', 'composite', 'rest'];
const SOURCES = new Set(['web', 'application']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function quotaBuckets(value, { nullable = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return BUCKETS.every((bucket) => Object.prototype.hasOwnProperty.call(value, bucket)
    && (nullable && value[bucket] === null || nonnegativeInteger(value[bucket])));
}

function validSourceVector(sources) {
  if (!Array.isArray(sources)) return false;
  const seen = new Set();
  for (const source of sources) {
    if (!source || !SOURCES.has(source.source) || typeof source.sourceKey !== 'string' || !source.sourceKey
      || !DATE_PATTERN.test(source.date) || typeof source.revision !== 'string' || !source.revision) return false;
    const key = `${source.source}\0${source.sourceKey}\0${source.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

export function validateSharedQuotaStateV1(value, { date, weekStart, policyRevision } = {}) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1
    || typeof value.revision !== 'string' || !value.revision
    || typeof value.policyRevision !== 'string' || !value.policyRevision
    || !nonnegativeInteger(value.computedAtMs)
    || !(value.settledAtMs === null || nonnegativeInteger(value.settledAtMs))
    || typeof value.complete !== 'boolean' || typeof value.offline !== 'boolean'
    || !Array.isArray(value.reasonCodes) || !value.reasonCodes.every((code) => typeof code === 'string')
    || !validSourceVector(value.sources)) return { ok: false, errorCode: 'shared_quota_invalid_state' };

  if (!value.day || !DATE_PATTERN.test(value.day.date)
    || !quotaBuckets(value.day.usedMs) || !quotaBuckets(value.day.remainingMs, { nullable: true })
    || !nonnegativeInteger(value.day.borrowedRestMs)
    || value.day.borrowedRestMs > value.day.usedMs.rest
    || !value.week || !DATE_PATTERN.test(value.week.fromDate)
    || !nonnegativeInteger(value.week.restUsedMs)
    || !(value.week.restRemainingMs === null || nonnegativeInteger(value.week.restRemainingMs))) {
    return { ok: false, errorCode: 'shared_quota_invalid_state' };
  }

  if (date && value.day.date !== date || weekStart && value.week.fromDate !== weekStart
    || policyRevision && value.policyRevision !== policyRevision) {
    return { ok: false, errorCode: 'shared_quota_stale_state' };
  }
  return { ok: true, state: value };
}

export function inspectWebContributionInSharedStateV1(state, contribution, { weekStart } = {}) {
  if (!contribution || contribution.schemaVersion !== 1 || contribution.source !== 'web'
    || typeof contribution.sourceKey !== 'string' || !contribution.sourceKey
    || typeof contribution.revision !== 'string' || !contribution.revision
    || contribution.complete !== true) {
    return { ok: false, reasonCode: 'WEB_CONTRIBUTION_INCOMPLETE' };
  }
  const checked = validateSharedQuotaStateV1(state, {
    date: contribution.date, weekStart, policyRevision: contribution.policyRevision,
  });
  if (!checked.ok) return { ok: false, reasonCode: checked.errorCode };
  if (state.complete !== true) return { ok: false, reasonCode: 'SHARED_STATE_INCOMPLETE' };
  const source = state.sources.find((item) => item.source === 'web'
    && item.sourceKey === contribution.sourceKey && item.date === contribution.date);
  if (!source) return { ok: false, reasonCode: 'WEB_SOURCE_MISSING' };
  if (source.revision !== contribution.revision) return { ok: false, reasonCode: 'WEB_SOURCE_REVISION_MISMATCH' };
  return { ok: true, matchedRevision: source.revision };
}

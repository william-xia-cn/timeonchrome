// Read-only validation for the D-114 shared quota state. It does not drive access decisions.

const BUCKETS = ['study', 'composite', 'rest'];
const SOURCES = new Set(['web', 'application']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

function mondayOf(date) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
}

function validReasons(value) {
  return Array.isArray(value) && value.length <= 32
    && value.every(code => typeof code === 'string' && code.length > 0 && code.length <= 64);
}

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
      || !validDate(source.date) || typeof source.revision !== 'string' || !source.revision) return false;
    const key = `${source.source}\0${source.sourceKey}\0${source.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

export function validateSharedAccessPolicyIdentityV1(value) {
  const fields = ['schemaVersion', 'revision', 'effectiveAtMs', 'stage', 'policyHash'];
  const valid = value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key))
    && value.schemaVersion === 1 && typeof value.revision === 'string'
    && /^profile-config:(?:0|[1-9][0-9]*)$/.test(value.revision)
    && Number.isSafeInteger(Number(value.revision.slice(15))) && nonnegativeInteger(value.effectiveAtMs)
    && ['legacy', 'shadow', 'shared'].includes(value.stage) && typeof value.policyHash === 'string'
    && /^[a-f0-9]{64}$/.test(value.policyHash);
  return valid ? { ok: true, identity: { ...value } } : { ok: false, errorCode: 'shared_policy_identity_invalid' };
}

export function validateSharedQuotaStateV1(value, { date, weekStart, policyRevision } = {}) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1
    || typeof value.revision !== 'string' || !value.revision
    || typeof value.policyRevision !== 'string' || !value.policyRevision
    || !nonnegativeInteger(value.computedAtMs)
    || !(value.settledAtMs === null || nonnegativeInteger(value.settledAtMs))
    || typeof value.complete !== 'boolean' || typeof value.offline !== 'boolean'
    || !validReasons(value.reasonCodes)
    || !validSourceVector(value.sources)) return { ok: false, errorCode: 'shared_quota_invalid_state' };

  if (!value.day || !validDate(value.day.date)
    || !quotaBuckets(value.day.usedMs) || !quotaBuckets(value.day.remainingMs, { nullable: true })
    || !nonnegativeInteger(value.day.borrowedRestMs)
    || value.day.borrowedRestMs > value.day.usedMs.rest
    || !value.week || !validDate(value.week.fromDate) || !validDate(value.week.toDate)
    || typeof value.week.complete !== 'boolean' || !validReasons(value.week.reasonCodes)
    || (value.complete && (!value.week.complete || value.reasonCodes.length > 0))
    || (value.week.complete && value.week.reasonCodes.length > 0)
    || !nonnegativeInteger(value.week.restUsedMs)
    || !(value.week.restRemainingMs === null || nonnegativeInteger(value.week.restRemainingMs))) {
    return { ok: false, errorCode: 'shared_quota_invalid_state' };
  }

  if (value.week.fromDate !== mondayOf(value.day.date) || value.week.toDate !== value.day.date
    || date && value.day.date !== date || weekStart && value.week.fromDate !== weekStart
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
  if (state.complete !== true || state.week.complete !== true) return { ok: false, reasonCode: 'SHARED_STATE_INCOMPLETE' };
  const source = state.sources.find((item) => item.source === 'web'
    && item.sourceKey === contribution.sourceKey && item.date === contribution.date);
  if (!source) return { ok: false, reasonCode: 'WEB_SOURCE_MISSING' };
  if (source.revision !== contribution.revision) return { ok: false, reasonCode: 'WEB_SOURCE_REVISION_MISMATCH' };
  return { ok: true, matchedRevision: source.revision };
}

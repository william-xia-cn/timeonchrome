// Read-only D-114 projection from settled browser statistics, never a web ledger writer.

const QUOTA_BUCKETS = ['study', 'composite', 'rest'];
const KNOWN_BUCKETS = new Set([...QUOTA_BUCKETS, 'other']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validSeconds(value) {
  return Number.isSafeInteger(value) && value >= 0 && Number.isSafeInteger(value * 1000);
}

export function buildWebSharedQuotaContributionV1(snapshot, { sourceKey, policyRevision } = {}) {
  if (!snapshot || !DATE_PATTERN.test(snapshot.date)
    || typeof snapshot.snapshotRevision !== 'string' || !snapshot.snapshotRevision
    || typeof snapshot.statisticsRevision !== 'string' || !snapshot.statisticsRevision
    || typeof snapshot.correctionRevision !== 'string' || !snapshot.correctionRevision
    || typeof sourceKey !== 'string' || !sourceKey
    || typeof policyRevision !== 'string' || !policyRevision
    || !validSeconds(snapshot.activeSeconds)
    || !snapshot.quotaBucketSeconds || typeof snapshot.quotaBucketSeconds !== 'object'
    || Array.isArray(snapshot.quotaBucketSeconds)) {
    return { ok: false, errorCode: 'shared_web_snapshot_invalid' };
  }

  const reasons = new Set(Array.isArray(snapshot.incompleteReasonCodes)
    ? snapshot.incompleteReasonCodes.filter((code) => typeof code === 'string') : []);
  if (snapshot.complete !== true) reasons.add('WEB_SNAPSHOT_INCOMPLETE');
  let bucketTotal = 0;
  for (const [bucket, value] of Object.entries(snapshot.quotaBucketSeconds)) {
    if (!KNOWN_BUCKETS.has(bucket)) reasons.add('WEB_BUCKET_UNKNOWN');
    if (!validSeconds(value)) return { ok: false, errorCode: 'shared_web_snapshot_invalid' };
    bucketTotal += value;
  }
  if (!Number.isSafeInteger(bucketTotal) || bucketTotal !== snapshot.activeSeconds) {
    reasons.add('WEB_BUCKET_TOTAL_MISMATCH');
  }

  return { ok: true, contribution: {
    schemaVersion: 1, source: 'web', sourceKey, date: snapshot.date,
    revision: snapshot.snapshotRevision,
    statisticsRevision: snapshot.statisticsRevision,
    correctionRevision: snapshot.correctionRevision,
    policyRevision, settledAtMs: null,
    complete: reasons.size === 0, reasonCodes: [...reasons].sort(),
    bucketsMs: Object.fromEntries(QUOTA_BUCKETS.map((bucket) =>
      [bucket, (snapshot.quotaBucketSeconds[bucket] || 0) * 1000])),
  } };
}

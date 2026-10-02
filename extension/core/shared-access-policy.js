// Guardian is the only policy authority. This validator does not project defaults.
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const BUCKETS = ['study', 'composite', 'rest'];
const FIELDS = ['schemaVersion', 'revision', 'effectiveAtMs', 'stage', 'dailyMinutes', 'weeklyRestMinutes', 'timeWindows', 'autonomy'];
const AUTONOMY = ['restrictedEntryConfirmationRequired', 'dailyFirstReminderMinutes', 'weeklyFirstReminderMinutes',
  'repeatReminderMinutes', 'softReminderTimeoutAction', 'visibleResponseDeadlineSeconds'];
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const minutes = value => value === null || Number.isSafeInteger(value) && value >= 0 && value <= 10080;
const start = value => typeof value === 'string' && /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
const windows = value => value === null || Array.isArray(value) && value.every(item => exact(item, ['start', 'end'])
  && start(item.start) && (start(item.end) || item.end === '24:00'));

export function canonicalSharedPolicy(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalSharedPolicy).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonicalSharedPolicy(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function validateSharedAccessPolicyV1(value) {
  const invalid = { ok: false, errorCode: 'shared_access_invalid_policy' };
  if (!exact(value, FIELDS) || value.schemaVersion !== 1 || typeof value.revision !== 'string'
    || !/^profile-config:(?:0|[1-9][0-9]*)$/.test(value.revision)
    || !Number.isSafeInteger(value.effectiveAtMs) || value.effectiveAtMs < 0
    || !['legacy', 'shadow', 'shared'].includes(value.stage)
    || !minutes(value.weeklyRestMinutes) || !exact(value.dailyMinutes, DAYS) || !exact(value.timeWindows, DAYS)
    || !DAYS.every(day => exact(value.dailyMinutes[day], BUCKETS)
      && BUCKETS.every(bucket => minutes(value.dailyMinutes[day][bucket]))
      && exact(value.timeWindows[day], BUCKETS) && BUCKETS.every(bucket => windows(value.timeWindows[day][bucket])))
    || !exact(value.autonomy, AUTONOMY)) return invalid;
  const autonomy = value.autonomy;
  if (typeof autonomy.restrictedEntryConfirmationRequired !== 'boolean'
    || !minutes(autonomy.dailyFirstReminderMinutes) || !minutes(autonomy.weeklyFirstReminderMinutes)
    || !Number.isSafeInteger(autonomy.repeatReminderMinutes) || autonomy.repeatReminderMinutes < 1
    || autonomy.repeatReminderMinutes > 1440 || !['continue', 'end_rest'].includes(autonomy.softReminderTimeoutAction)
    || autonomy.visibleResponseDeadlineSeconds !== 60) return invalid;
  const version = Number(value.revision.slice('profile-config:'.length));
  if (!Number.isSafeInteger(version)) return invalid;
  const canonical = canonicalSharedPolicy(value);
  if (new TextEncoder().encode(canonical).byteLength > 30 * 1024) return invalid;
  return { ok: true, policy: JSON.parse(canonical), version, canonical };
}

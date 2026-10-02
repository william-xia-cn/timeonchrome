const FIELDS = ['schemaVersion', 'leaseId', 'activityId', 'sequence', 'status', 'quotaBucket', 'presentationEligible'];
export function validateSharedBrowserActivity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== FIELDS.length || !FIELDS.every(key => Object.hasOwn(value, key))
    || value.schemaVersion !== 1 || !['leaseId', 'activityId'].every(key => typeof value[key] === 'string'
      && value[key].trim().length > 0 && value[key].length <= 128)
    || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || typeof value.presentationEligible !== 'boolean'
    || (value.status === 'active' ? value.quotaBucket !== 'rest'
      : value.status !== 'inactive' || value.quotaBucket !== null || value.presentationEligible !== false)) {
    return { ok: false, errorCode: 'INVALID_SHARED_BROWSER_ACTIVITY' };
  }
  return { ok: true, payload: { ...value } };
}

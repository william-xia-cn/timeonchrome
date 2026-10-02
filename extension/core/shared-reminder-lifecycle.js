// Wire validation only; Service owns issuance, authorization and the timeout clock.
const ID_FIELDS = ['schemaVersion', 'roundId', 'reminderId', 'deliveryId', 'policyRevision', 'stateRevision'];
const STATE_FIELDS = [...ID_FIELDS, 'date', 'kinds', 'presenter', 'stage', 'issuedAtMs',
  'offerExpiresAtMs', 'visibleAtMs', 'responseDeadlineSeconds', 'timeoutAction', 'status', 'resolution'];
const TIME = value => Number.isSafeInteger(value) && value >= 0;

function exact(value, fields) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
}

function identityValid(value) {
  return value.schemaVersion === 1 && ID_FIELDS.slice(1).every(key =>
    typeof value[key] === 'string' && value[key].trim().length > 0 && value[key].length <= 128);
}

export function sharedReminderIdentity(state) {
  return Object.fromEntries(ID_FIELDS.map(key => [key, state[key]]));
}

export function validateSharedReminderMessage(value, method) {
  const key = method === 'acknowledgeSharedReminderDelivery' ? 'delivery'
    : method === 'resolveSharedReminder' ? 'action' : null;
  if (!key || !exact(value, [...ID_FIELDS, key]) || !identityValid(value)
    || !(key === 'delivery' ? ['visible', 'failed'] : ['continue', 'end_rest']).includes(value[key])) {
    return { ok: false, errorCode: 'INVALID_SHARED_REMINDER_MESSAGE' };
  }
  return { ok: true, payload: { ...value } };
}

export function validateSharedReminderState(value, expected = {}) {
  if (value === null && !expected.roundId) return { ok: true, state: null };
  if (!exact(value, STATE_FIELDS) || !identityValid(value)
    || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)
    || !Array.isArray(value.kinds) || value.kinds.length < 1 || value.kinds.length > 3
    || new Set(value.kinds).size !== value.kinds.length
    || !value.kinds.every(kind => ['entry', 'daily', 'weekly'].includes(kind))
    || !['browser', 'native'].includes(value.presenter) || !['shadow', 'shared'].includes(value.stage)
    || !TIME(value.issuedAtMs) || !TIME(value.offerExpiresAtMs)
    || !(value.visibleAtMs === null || TIME(value.visibleAtMs)) || value.responseDeadlineSeconds !== 60
    || !['continue', 'end'].includes(value.timeoutAction)
    || !['offered', 'visible', 'delivery_failed', 'resolved', 'withdrawn'].includes(value.status)
    || ![null, 'continue', 'end_rest', 'timeout_continue', 'timeout_end'].includes(value.resolution)) {
    return { ok: false, errorCode: 'shared_reminder_invalid_state' };
  }
  if (Object.keys(expected).some(key => value[key] !== expected[key])) {
    return { ok: false, errorCode: 'SHARED_REMINDER_INSTANCE_CHANGED' };
  }
  return { ok: true, state: { ...value, kinds: [...value.kinds] } };
}

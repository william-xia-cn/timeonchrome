// Wire validation only; Service owns issuance, authorization and the timeout clock.
import { checkSharedReminderStateV2, checkSharedReminderMessageV2 } from './shared-forced-use-runtime-v2.js';
const ID_FIELDS = ['schemaVersion', 'roundId', 'reminderId', 'deliveryId', 'policyRevision', 'stateRevision'];

export function sharedReminderIdentity(state) {
  return Object.fromEntries(ID_FIELDS.map(key => [key, state[key]]));
}
export function validateSharedReminderMessage(value, method) {
  return checkSharedReminderMessageV2(value, method);
}
export function validateSharedReminderState(value, expected = {}) {
  return checkSharedReminderStateV2(value, expected);
}

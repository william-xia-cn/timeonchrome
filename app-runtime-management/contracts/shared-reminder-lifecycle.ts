/** Service-issued reminders. These messages never select a child, user or process. */
export const SHARED_REMINDER_LIFECYCLE_CAPABILITY = 'shared-reminder-lifecycle-v1' as const;
export interface SharedReminderIdentity {
  schemaVersion: 1;
  roundId: string;
  reminderId: string;
  deliveryId: string;
  policyRevision: string;
  stateRevision: string;
}
export interface SharedReminderDeliveryAck extends SharedReminderIdentity {
  delivery: 'visible' | 'failed';
}
export interface SharedReminderResolution extends SharedReminderIdentity {
  action: 'continue' | 'end_rest';
}
export interface SharedReminderState extends SharedReminderIdentity {
  date: string;
  kinds: readonly ('entry' | 'daily' | 'weekly')[];
  presenter: 'browser' | 'native';
  stage: 'shadow' | 'shared';
  issuedAtMs: number;
  offerExpiresAtMs: number;
  visibleAtMs: number | null;
  responseDeadlineSeconds: 60;
  timeoutAction: 'continue' | 'end';
  status: 'offered' | 'visible' | 'delivery_failed' | 'resolved' | 'withdrawn';
  resolution: 'continue' | 'end_rest' | 'timeout_continue' | 'timeout_end' | null;
}
/** Service-only monotonic and authorization evidence, never accepted over the bridge. */
export interface SharedReminderRuntimeContext {
  state: SharedReminderState;
  scopeCurrent: boolean;
  /** Verified delivery owner/connection lease; an arbitrary browser cannot ACK Native UI. */
  presenterCurrent: boolean;
  currentPolicyRevision: string;
  currentStateRevision: string;
  executionEnabled: boolean;
  nowMs: number;
  monotonicNowMs: number;
  bootId: string;
  visibleBootId: string | null;
  visibleMonotonicMs: number | null;
}
export interface SharedReminderTransition {
  state: SharedReminderState;
  duplicate: boolean;
  effect: 'none' | 'request-normal-close' | 'force-close';
  /** Persist this with the visible ACK; repeating an ACK must not restart it. */
  visibleMonotonicMs: number | null;
  visibleBootId: string | null;
}
const identityFields = ['schemaVersion','roundId','reminderId','deliveryId','policyRevision','stateRevision'];
function validTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function validateIdentity(value: unknown, extra: string): Record<string, unknown> {
  const fields = [...identityFields, extra];
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field)))
    throw new Error('INVALID_SHARED_REMINDER_MESSAGE');
  const item = value as Record<string, unknown>;
  if (item.schemaVersion !== 1 || identityFields.slice(1).some(field => typeof item[field] !== 'string'
    || !(item[field] as string).trim() || (item[field] as string).length > 128))
    throw new Error('INVALID_SHARED_REMINDER_MESSAGE');
  return item;
}
export function validateSharedReminderDeliveryAck(value: unknown): SharedReminderDeliveryAck {
  const item = validateIdentity(value, 'delivery');
  if (item.delivery !== 'visible' && item.delivery !== 'failed') throw new Error('INVALID_SHARED_REMINDER_MESSAGE');
  return {...item} as unknown as SharedReminderDeliveryAck;
}
export function validateSharedReminderResolution(value: unknown): SharedReminderResolution {
  const item = validateIdentity(value, 'action');
  if (item.action !== 'continue' && item.action !== 'end_rest') throw new Error('INVALID_SHARED_REMINDER_MESSAGE');
  return {...item} as unknown as SharedReminderResolution;
}
function transition(context: SharedReminderRuntimeContext, patch: Partial<SharedReminderState> = {},
  effect: SharedReminderTransition['effect'] = 'none', duplicate = false): SharedReminderTransition {
  return {state:{...context.state,...patch},duplicate,effect,
    visibleMonotonicMs:context.visibleMonotonicMs,visibleBootId:context.visibleBootId};
}
function current(context: SharedReminderRuntimeContext): boolean {
  if (!validTime(context.nowMs) || !validTime(context.monotonicNowMs) || !context.bootId)
    throw new Error('INVALID_SHARED_REMINDER_CLOCK');
  if (!context.scopeCurrent) throw new Error('SHARED_REMINDER_SCOPE_CHANGED');
  if (!context.presenterCurrent) throw new Error('SHARED_REMINDER_PRESENTER_CHANGED');
  return context.currentPolicyRevision === context.state.policyRevision
    && context.currentStateRevision === context.state.stateRevision;
}
function bound(item: SharedReminderIdentity, state: SharedReminderState): void {
  if (identityFields.some(field => item[field as keyof SharedReminderIdentity]
    !== state[field as keyof SharedReminderIdentity])) throw new Error('SHARED_REMINDER_INSTANCE_CHANGED');
}
/** Only the Service's receipt clock is canonical; client timestamps are forbidden. */
export function acknowledgeSharedReminderDelivery(context: SharedReminderRuntimeContext,
  value: unknown): SharedReminderTransition {
  const item = validateSharedReminderDeliveryAck(value);
  bound(item, context.state);
  if (!current(context)) return transition(context,{status:'withdrawn'});
  const state = context.state;
  if ((state.status === 'visible' || state.status === 'resolved') && item.delivery === 'visible')
    return visibleClockValid(context) ? transition(context,{},'none',true) : transition(context,{status:'withdrawn'});
  if (state.status === 'delivery_failed' && item.delivery === 'failed') return transition(context,{},'none',true);
  if (state.status !== 'offered') throw new Error('SHARED_REMINDER_DELIVERY_CONFLICT');
  if (context.nowMs < state.issuedAtMs || context.nowMs >= state.offerExpiresAtMs)
    return transition(context,{status:'withdrawn'});
  if (item.delivery === 'failed') return transition(context,{status:'delivery_failed'});
  return {...transition(context,{status:'visible',visibleAtMs:context.nowMs}),
    visibleMonotonicMs:context.monotonicNowMs,visibleBootId:context.bootId};
}
function visibleClockValid(context: SharedReminderRuntimeContext): boolean {
  return context.visibleBootId === context.bootId && validTime(context.visibleMonotonicMs)
    && context.monotonicNowMs >= context.visibleMonotonicMs;
}
function effect(context: SharedReminderRuntimeContext, forced: boolean): SharedReminderTransition['effect'] {
  if (context.state.stage !== 'shared' || !context.executionEnabled) return 'none';
  return forced ? 'force-close' : 'request-normal-close';
}
export function resolveSharedReminder(context: SharedReminderRuntimeContext, value: unknown): SharedReminderTransition {
  const item = validateSharedReminderResolution(value);
  bound(item,context.state);
  if (!current(context)) return transition(context,{status:'withdrawn'});
  if (context.state.status === 'resolved') {
    if (context.state.resolution !== item.action) throw new Error('SHARED_REMINDER_RESULT_CONFLICT');
    return transition(context,{},'none',true);
  }
  if (context.state.status !== 'visible') throw new Error('SHARED_REMINDER_NOT_VISIBLE');
  if (!visibleClockValid(context)) return transition(context,{status:'withdrawn'});
  // Reject the late intent; only the separate Service timer may authorize a timeout effect.
  if (context.monotonicNowMs - context.visibleMonotonicMs! >= 60_000)
    throw new Error('SHARED_REMINDER_DEADLINE_ELAPSED');
  return transition(context,{status:'resolved',resolution:item.action},item.action === 'end_rest' ? effect(context,false) : 'none');
}
/** Timeout is a Service-local event, never a client-selected action. */
export function expireSharedReminder(context: SharedReminderRuntimeContext): SharedReminderTransition {
  if (!current(context)) return transition(context,{status:'withdrawn'});
  if (context.state.status === 'resolved') return transition(context,{},'none',true);
  if (context.state.status !== 'visible') throw new Error('SHARED_REMINDER_NOT_VISIBLE');
  if (!visibleClockValid(context)) return transition(context,{status:'withdrawn'});
  if (context.monotonicNowMs - context.visibleMonotonicMs! < 60_000)
    throw new Error('SHARED_REMINDER_TIMEOUT_EARLY');
  const forced = context.state.timeoutAction === 'end';
  return transition(context,{status:'resolved',resolution:forced ? 'timeout_end' : 'timeout_continue'},forced ? effect(context,true) : 'none');
}

/** Service-issued reminders. These messages never select a child, user or process. */
export const SHARED_REMINDER_LIFECYCLE_CAPABILITY = 'shared-reminder-lifecycle-v1' as const;
export const SHARED_BROWSER_ACTIVITY_CAPABILITY = 'shared-browser-activity-v1' as const;
export const SHARED_BROWSER_ACTIVITY_RENEW_MS = 5_000 as const;
export const SHARED_BROWSER_ACTIVITY_MAX_AGE_MS = 15_000 as const;
export const SHARED_BROWSER_EXECUTION_CAPABILITY = 'shared-browser-execution-v1' as const;
export const SHARED_BROWSER_EXECUTION_MAX_AGE_MS = 5_000 as const;
/** Live facts only: this is neither usage nor permission to enforce. */
export interface SharedBrowserActivity {
  schemaVersion: 1;
  leaseId: string;
  activityId: string;
  sequence: number;
  status: 'active' | 'inactive';
  quotaBucket: 'rest' | null;
  presentationEligible: boolean;
}
export interface SharedBrowserActivityReceipt {
  message: SharedBrowserActivity;
  receivedMonotonicMs: number;
  bootId: string;
}
/** Service-only connection, session and foreground checks; never client payload. */
export interface SharedBrowserActivityContext {
  leaseId: string;
  leaseCurrent: boolean;
  verifiedChromeForeground: boolean;
  unlocked: boolean;
  monotonicNowMs: number;
  bootId: string;
  current: SharedBrowserActivityReceipt | null;
}
export function validateSharedBrowserActivity(value: unknown): SharedBrowserActivity {
  const fields=['schemaVersion','leaseId','activityId','sequence','status','quotaBucket','presentationEligible'];
  if (!value || typeof value!=='object' || Array.isArray(value)
    || Object.keys(value).length!==fields.length || fields.some(field=>!Object.hasOwn(value,field)))
    throw new Error('INVALID_SHARED_BROWSER_ACTIVITY');
  const item=value as Record<string,unknown>;
  if(item.schemaVersion!==1 || ['leaseId','activityId'].some(field=>typeof item[field]!=='string'
    || !(item[field] as string).trim() || (item[field] as string).length>128)
    || !validTime(item.sequence) || item.sequence<1 || typeof item.presentationEligible!=='boolean'
    || (item.status==='active' ? item.quotaBucket!=='rest'
      : item.status!=='inactive' || item.quotaBucket!==null || item.presentationEligible!==false))
    throw new Error('INVALID_SHARED_BROWSER_ACTIVITY');
  return {...item} as unknown as SharedBrowserActivity;
}
export function receiveSharedBrowserActivity(context: SharedBrowserActivityContext, value: unknown): {
  receipt: SharedBrowserActivityReceipt; duplicate: boolean; stale: boolean;
} {
  const message=validateSharedBrowserActivity(value);
  if(!validTime(context.monotonicNowMs)||!context.bootId)throw new Error('INVALID_SHARED_BROWSER_ACTIVITY_CLOCK');
  if(!context.leaseCurrent||message.leaseId!==context.leaseId)throw new Error('SHARED_BROWSER_ACTIVITY_LEASE_CHANGED');
  const old=context.current;
  if(old&&(old.message.leaseId!==context.leaseId||old.bootId!==context.bootId
    || !validTime(old.receivedMonotonicMs)||context.monotonicNowMs<old.receivedMonotonicMs))
    throw new Error('SHARED_BROWSER_ACTIVITY_LEASE_CHANGED');
  if(old&&message.sequence<=old.message.sequence){
    if(message.sequence===old.message.sequence){
      if(Object.keys(message).some(field=>message[field as keyof SharedBrowserActivity]!==old.message[field as keyof SharedBrowserActivity]))
        throw new Error('SHARED_BROWSER_ACTIVITY_SEQUENCE_CONFLICT');
      return{receipt:old,duplicate:true,stale:false};
    }
    return{receipt:old,duplicate:false,stale:true};
  }
  return{receipt:{message,receivedMonotonicMs:context.monotonicNowMs,bootId:context.bootId},duplicate:false,stale:false};
}
/** Bind each issued reminder to this activityId as well as its presenter lease. */
export function sharedBrowserReminderEligibility(context: SharedBrowserActivityContext,
  expectedActivityId?: string): {eligible:boolean;reasonCode:string|null} {
  const reject=(reasonCode:string)=>({eligible:false,reasonCode});
  if(!context.leaseCurrent)return reject('SHARED_BROWSER_ACTIVITY_LEASE_CHANGED');
  if(!context.unlocked)return reject('SHARED_BROWSER_ACTIVITY_LOCKED');
  if(!context.verifiedChromeForeground)return reject('SHARED_BROWSER_ACTIVITY_NOT_FOREGROUND');
  const receipt=context.current;
  if(!receipt)return reject('SHARED_BROWSER_ACTIVITY_MISSING');
  if(receipt.bootId!==context.bootId||receipt.message.leaseId!==context.leaseId)
    return reject('SHARED_BROWSER_ACTIVITY_LEASE_CHANGED');
  if(!validTime(context.monotonicNowMs)||!validTime(receipt.receivedMonotonicMs)
    || context.monotonicNowMs<receipt.receivedMonotonicMs)return reject('INVALID_SHARED_BROWSER_ACTIVITY_CLOCK');
  if(context.monotonicNowMs-receipt.receivedMonotonicMs>=SHARED_BROWSER_ACTIVITY_MAX_AGE_MS)
    return reject('SHARED_BROWSER_ACTIVITY_EXPIRED');
  if(receipt.message.status!=='active'||receipt.message.quotaBucket!=='rest'||!receipt.message.presentationEligible)
    return reject('SHARED_BROWSER_ACTIVITY_NOT_ELIGIBLE');
  if(expectedActivityId!==undefined&&receipt.message.activityId!==expectedActivityId)
    return reject('SHARED_BROWSER_ACTIVITY_CHANGED');
  return{eligible:true,reasonCode:null};
}
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
/** Explicit Service permission, not inferred from the reminder's resolution. */
export interface SharedBrowserExecution extends SharedReminderIdentity {
  executionId: string;
  leaseId: string;
  activityId: string;
  targetSource: 'browser';
  effect: 'request-normal-close' | 'force-close';
  /** Remaining Service lifetime; consumer measures from request start, not receipt. */
  maxAgeMs: number;
}
export interface SharedBrowserExecutionAck extends SharedReminderIdentity {
  executionId: string;
  leaseId: string;
  activityId: string;
  outcome: 'completed' | 'canceled' | 'failed' | 'stale';
}
const executionIdentityFields = ['executionId','leaseId','activityId'];
function validateExecution(value: unknown, ack: boolean): Record<string, unknown> {
  const fields = [...identityFields,...executionIdentityFields,...(ack ? ['outcome'] : ['targetSource','effect','maxAgeMs'])];
  if (!value || typeof value!=='object' || Array.isArray(value)
    || Object.keys(value).length!==fields.length || fields.some(field=>!Object.hasOwn(value,field)))
    throw new Error('INVALID_SHARED_BROWSER_EXECUTION');
  const item=value as Record<string,unknown>;
  if(item.schemaVersion!==1 || [...identityFields.slice(1),...executionIdentityFields].some(field=>
    typeof item[field]!=='string'||!(item[field] as string).trim()||(item[field] as string).length>128))
    throw new Error('INVALID_SHARED_BROWSER_EXECUTION');
  if(ack ? !['completed','canceled','failed','stale'].includes(item.outcome as string)
    : item.targetSource!=='browser'||!['request-normal-close','force-close'].includes(item.effect as string)
      ||!validTime(item.maxAgeMs)||item.maxAgeMs<1||item.maxAgeMs>SHARED_BROWSER_EXECUTION_MAX_AGE_MS)
    throw new Error('INVALID_SHARED_BROWSER_EXECUTION');
  return item;
}
export function validateSharedBrowserExecution(value: unknown): SharedBrowserExecution {
  return {...validateExecution(value,false)} as unknown as SharedBrowserExecution;
}
export function validateSharedBrowserExecutionAck(value: unknown): SharedBrowserExecutionAck {
  return {...validateExecution(value,true)} as unknown as SharedBrowserExecutionAck;
}
/** Service uses persisted target binding; presenter=native may still target browser. */
export function authorizeSharedBrowserExecution(context: SharedReminderRuntimeContext,
  browser: SharedBrowserActivityContext, target: {source:'browser'|'application';activityId:string;executionId:string;
    leaseId:string;issuedMonotonicMs:number;bootId:string;consumed:boolean}): SharedBrowserExecution|null {
  if(!current(context)||context.state.stage!=='shared'||!context.executionEnabled
    ||target.source!=='browser'||context.state.status!=='resolved'||!visibleClockValid(context)
    ||!validTime(context.state.visibleAtMs))return null;
  const resolution=context.state.resolution;
  if(resolution!=='end_rest'&&resolution!=='timeout_end')return null;
  if(resolution==='timeout_end'&&(context.state.timeoutAction!=='end'
    ||context.monotonicNowMs-context.visibleMonotonicMs!<60_000))return null;
  if(target.consumed||target.bootId!==context.bootId||target.leaseId!==browser.leaseId
    ||browser.bootId!==context.bootId
    ||!validTime(target.issuedMonotonicMs)||context.monotonicNowMs<target.issuedMonotonicMs
    ||context.monotonicNowMs-target.issuedMonotonicMs>=SHARED_BROWSER_EXECUTION_MAX_AGE_MS)return null;
  if(!sharedBrowserReminderEligibility(browser,target.activityId).eligible)return null;
  const identity=Object.fromEntries(identityFields.map(field=>[field,context.state[field as keyof SharedReminderIdentity]]));
  return validateSharedBrowserExecution({...identity,executionId:target.executionId,leaseId:browser.leaseId,
    activityId:target.activityId,targetSource:'browser',effect:resolution==='end_rest'?'request-normal-close':'force-close',
    maxAgeMs:SHARED_BROWSER_EXECUTION_MAX_AGE_MS-(context.monotonicNowMs-target.issuedMonotonicMs)});
}
/** Local receipt clock and current facts. Caller durably claims the ID BEFORE effects. */
export function sharedBrowserExecutionEligibility(value: unknown, context: {
  connectionCurrent:boolean;leaseId:string;activityId:string;policyRevision:string;stateRevision:string;
  reminder:SharedReminderIdentity;restEligible:boolean;requestStartedMonotonicMs:number;monotonicNowMs:number;attemptedIds:ReadonlySet<string>;
}): {eligible:boolean;reasonCode:string|null} {
  const permit=validateSharedBrowserExecution(value);
  const reject=(reasonCode:string)=>({eligible:false,reasonCode});
  if(context.attemptedIds.has(permit.executionId))return reject('SHARED_BROWSER_EXECUTION_ALREADY_ATTEMPTED');
  if(!context.connectionCurrent||context.leaseId!==permit.leaseId)return reject('SHARED_BROWSER_ACTIVITY_LEASE_CHANGED');
  if(context.activityId!==permit.activityId||!context.restEligible)return reject('SHARED_BROWSER_ACTIVITY_CHANGED');
  if(identityFields.some(field=>context.reminder[field as keyof SharedReminderIdentity]
    !==permit[field as keyof SharedReminderIdentity]))return reject('SHARED_BROWSER_EXECUTION_INSTANCE_CHANGED');
  if(context.policyRevision!==permit.policyRevision||context.stateRevision!==permit.stateRevision)
    return reject('SHARED_REMINDER_SCOPE_CHANGED');
  if(!validTime(context.monotonicNowMs)||!validTime(context.requestStartedMonotonicMs)
    ||context.monotonicNowMs<context.requestStartedMonotonicMs)return reject('INVALID_SHARED_BROWSER_EXECUTION_CLOCK');
  if(context.monotonicNowMs-context.requestStartedMonotonicMs>=permit.maxAgeMs)
    return reject('SHARED_BROWSER_EXECUTION_EXPIRED');
  return{eligible:true,reasonCode:null};
}
/** ACK consumes the issued attempt; never changes effect or creates another permit. */
export function acknowledgeSharedBrowserExecution(issued: SharedBrowserExecution, value: unknown,
  existing: SharedBrowserExecutionAck|null, authenticatedLeaseCurrent: boolean): {ack:SharedBrowserExecutionAck;duplicate:boolean} {
  const permit=validateSharedBrowserExecution(issued),ack=validateSharedBrowserExecutionAck(value);
  if(!authenticatedLeaseCurrent)throw new Error('SHARED_BROWSER_ACTIVITY_LEASE_CHANGED');
  if([...identityFields,...executionIdentityFields].some(field=>
    ack[field as keyof SharedBrowserExecutionAck]!==permit[field as keyof SharedBrowserExecution]))
    throw new Error('SHARED_BROWSER_EXECUTION_INSTANCE_CHANGED');
  if(ack.outcome==='canceled'&&permit.effect==='force-close')throw new Error('SHARED_BROWSER_EXECUTION_RESULT_CONFLICT');
  if(existing){
    const prior=validateSharedBrowserExecutionAck(existing);
    if(Object.keys(ack).some(field=>ack[field as keyof SharedBrowserExecutionAck]!==prior[field as keyof SharedBrowserExecutionAck]))
      throw new Error('SHARED_BROWSER_EXECUTION_RESULT_CONFLICT');
    return{ack:prior,duplicate:true};
  }
  return{ack,duplicate:false};
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

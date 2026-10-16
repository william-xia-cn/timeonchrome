/** Service-issued reminders. These messages never select a child, user or process. */
import {validateSharedAccessPolicyIdentityV2, type SharedAccessPolicyIdentityV2} from './shared-access.js';
import {sourceStatisticsDates} from './source-statistics.js';

export const SHARED_FORCED_USE_RUNTIME_V2_CAPABILITY = 'shared-forced-use-runtime-v2' as const;
export const SHARED_FORCED_USE_REASONS = ['restrictedEntry', 'dailyStudy', 'dailyComposite', 'dailyRest', 'dailyOnline', 'weeklyRest', 'domain', 'timeWindow'] as const;
export type SharedForcedUseReason = typeof SHARED_FORCED_USE_REASONS[number];
export function validateSharedReminderStateQueryV2(value: unknown): {schemaVersion: 2; date: string} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SHARED_REMINDER_QUERY_V2');
  const query = value as Record<string, unknown>;
  if (Object.keys(query).length !== 2 || !Object.hasOwn(query,'date') || query.schemaVersion !== 2 || typeof query.date !== 'string')
    throw new Error('INVALID_SHARED_REMINDER_QUERY_V2');
  try { sourceStatisticsDates(query.date,query.date); }
  catch { throw new Error('INVALID_SHARED_REMINDER_QUERY_V2'); }
  return {schemaVersion: 2,date: query.date};
}
/** 仅当前活动/确认上下文，禁止通过此消息上传统计或选择孩子。 */
export interface SharedBrowserActivityV2 extends Omit<SharedBrowserActivity, 'schemaVersion' | 'quotaBucket' | 'status'> {
  schemaVersion: 2;
  status: 'active' | 'pending-entry' | 'inactive';
  quotaBucket: 'study' | 'composite' | 'rest' | 'other' | null;
  policyIdentity: SharedAccessPolicyIdentityV2;
  ruleScopeKey: string | null;
  reasonCodes: readonly SharedForcedUseReason[];
  independentRoundId: string | null;
}
function v2Key(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\u0000-\u0020\u007f]/.test(value);
}
function forcedReasons(value: unknown): value is SharedForcedUseReason[] {
  return Array.isArray(value) && value.length <= SHARED_FORCED_USE_REASONS.length && new Set(value).size === value.length
    && value.every(reason => SHARED_FORCED_USE_REASONS.includes(reason));
}
export function validateSharedBrowserActivityV2(value: unknown): SharedBrowserActivityV2 {
  const fields = ['schemaVersion','leaseId','activityId','sequence','status','quotaBucket','presentationEligible',
    'policyIdentity','ruleScopeKey','reasonCodes','independentRoundId'];
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SHARED_BROWSER_ACTIVITY_V2');
  const item = value as SharedBrowserActivityV2;
  if (Object.keys(item).length !== fields.length || fields.some(field => !Object.hasOwn(item, field))
    || item.schemaVersion !== 2 || !v2Key(item.leaseId) || !v2Key(item.activityId)
    || !validTime(item.sequence) || item.sequence < 1 || typeof item.presentationEligible !== 'boolean'
    || !forcedReasons(item.reasonCodes) || item.independentRoundId !== null && !v2Key(item.independentRoundId)
    || (item.status === 'active' || item.status === 'pending-entry' ? !['study','composite','rest','other'].includes(String(item.quotaBucket))
      || typeof item.ruleScopeKey !== 'string' || !/^[a-f0-9]{64}$/.test(item.ruleScopeKey)
      || item.status === 'pending-entry' && item.reasonCodes.length === 0
      : item.status !== 'inactive' || item.quotaBucket !== null || item.ruleScopeKey !== null
        || item.presentationEligible || item.reasonCodes.length !== 0)) throw new Error('INVALID_SHARED_BROWSER_ACTIVITY_V2');
  validateSharedAccessPolicyIdentityV2(item.policyIdentity);
  return {...structuredClone(item), reasonCodes: [...item.reasonCodes].sort()};
}
export interface SharedBrowserActivityReceiptV2 {message: SharedBrowserActivityV2; receivedMonotonicMs: number; bootId: string}
export interface SharedBrowserActivityAckV2 {
  schemaVersion: 2; leaseId: string; acceptedSequence: number; duplicate: boolean; stale: boolean;
  /** 仅在Service接受调度权且记录控件已撤销的独立轮次后填写。 */
  ownership: 'accepted'; retiredIndependentRoundId: string | null;
}
export function validateSharedBrowserActivityAckV2(value: unknown,
  expected: {leaseId: string; sequence: number; independentRoundId: string | null}): SharedBrowserActivityAckV2 {
  const fields = ['schemaVersion','leaseId','acceptedSequence','duplicate','stale','ownership','retiredIndependentRoundId'];
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SHARED_BROWSER_ACTIVITY_ACK_V2');
  const ack = value as SharedBrowserActivityAckV2;
  if (Object.keys(ack).length !== fields.length || fields.some(k => !Object.hasOwn(ack,k)) || ack.schemaVersion !== 2
    || !v2Key(ack.leaseId) || ack.leaseId !== expected.leaseId || !validTime(ack.acceptedSequence) || ack.acceptedSequence < 1
    || ack.acceptedSequence !== expected.sequence || typeof ack.duplicate !== 'boolean' || ack.stale !== false
    || ack.ownership !== 'accepted' || ack.retiredIndependentRoundId !== expected.independentRoundId
    || ack.retiredIndependentRoundId !== null && !v2Key(ack.retiredIndependentRoundId))
    throw new Error('INVALID_SHARED_BROWSER_ACTIVITY_ACK_V2');
  return {...ack};
}
export function receiveSharedBrowserActivityV2(context: {
  leaseId: string; leaseCurrent: boolean; currentPolicyIdentity: SharedAccessPolicyIdentityV2;
  monotonicNowMs: number; bootId: string; current: SharedBrowserActivityReceiptV2 | null;
}, value: unknown): {receipt: SharedBrowserActivityReceiptV2; duplicate: boolean; stale: boolean; baselineReset: boolean} {
  const message = validateSharedBrowserActivityV2(value);
  validateSharedAccessPolicyIdentityV2(context.currentPolicyIdentity);
  if (!context.leaseCurrent || context.leaseId !== message.leaseId) throw new Error('SHARED_BROWSER_ACTIVITY_LEASE_CHANGED');
  if (!validTime(context.monotonicNowMs) || !v2Key(context.bootId)) throw new Error('INVALID_SHARED_BROWSER_ACTIVITY_CLOCK');
  if ((['revision','effectiveAtMs','stage','policyHash'] as const).some(k => message.policyIdentity[k] !== context.currentPolicyIdentity[k]))
    throw new Error('SHARED_REMINDER_SCOPE_CHANGED');
  const old = context.current;
  if (old && (old.bootId !== context.bootId || old.message.leaseId !== context.leaseId
    || !validTime(old.receivedMonotonicMs) || context.monotonicNowMs < old.receivedMonotonicMs))
    throw new Error('SHARED_BROWSER_ACTIVITY_LEASE_CHANGED');
  if (old && message.sequence <= old.message.sequence) {
    const stable = (m: SharedBrowserActivityV2) => JSON.stringify([m.schemaVersion,m.leaseId,m.activityId,m.sequence,
      m.status,m.quotaBucket,m.presentationEligible,m.policyIdentity.revision,m.policyIdentity.effectiveAtMs,
      m.policyIdentity.stage,m.policyIdentity.policyHash,m.ruleScopeKey,m.reasonCodes,m.independentRoundId]);
    if (message.sequence === old.message.sequence && stable(message) !== stable(old.message))
      throw new Error('SHARED_BROWSER_ACTIVITY_SEQUENCE_CONFLICT');
    return {receipt: old, duplicate: message.sequence === old.message.sequence, stale: message.sequence < old.message.sequence, baselineReset: false};
  }
  const baselineReset = !old || old.message.activityId !== message.activityId
    || context.monotonicNowMs - old.receivedMonotonicMs >= SHARED_BROWSER_ACTIVITY_MAX_AGE_MS;
  return {receipt: {message, receivedMonotonicMs: context.monotonicNowMs, bootId: context.bootId}, duplicate: false, stale: false, baselineReset};
}

/** Service内部调度钟，客户端不能提交这些单调区间或时钟。 */
export interface SharedForcedUseClock {
  bootId: string; lastMonotonicMs: number; accumulatedMs: number;
}
export function advanceSharedForcedUseClock(state: SharedForcedUseClock, bootId: string, nowMs: number,
  sources: readonly {eligible: boolean; validThroughMonotonicMs: number}[]): SharedForcedUseClock {
  if (!v2Key(bootId) || !v2Key(state.bootId) || !validTime(state.lastMonotonicMs)
    || !validTime(state.accumulatedMs) || !validTime(nowMs) || sources.length > 128
    || sources.some(source => typeof source.eligible !== 'boolean' || !validTime(source.validThroughMonotonicMs)))
    throw new Error('INVALID_SHARED_FORCED_USE_CLOCK');
  if (state.bootId !== bootId) return {...state, bootId, lastMonotonicMs: nowMs};
  if (nowMs < state.lastMonotonicMs) throw new Error('INVALID_SHARED_FORCED_USE_CLOCK');
  const through = sources.reduce((end, source) => source.eligible
    ? Math.max(end, Math.min(nowMs, source.validThroughMonotonicMs)) : end, state.lastMonotonicMs);
  const accumulatedMs = state.accumulatedMs + through - state.lastMonotonicMs;
  if (!validTime(accumulatedMs)) throw new Error('INVALID_SHARED_FORCED_USE_CLOCK');
  return {...state, lastMonotonicMs: nowMs, accumulatedMs};
}

export interface SharedReminderStateV2 extends Omit<SharedReminderState, 'schemaVersion' | 'kinds'> {
  schemaVersion: 2; kinds: readonly ('entry' | 'repeat')[];
  timeoutAction: 'end';
  resolution: 'continue' | 'end_rest' | 'timeout_end' | null;
  policyIdentity: SharedAccessPolicyIdentityV2;
  ruleScopeKey: string;
  reasonCodes: readonly SharedForcedUseReason[];
  forcedUsageSeconds: number;
  confirmedAtUsageSeconds: number | null;
}
export interface SharedReminderIdentityV2 extends Omit<SharedReminderIdentity, 'schemaVersion'> {schemaVersion: 2}
export interface SharedReminderDeliveryAckV2 extends SharedReminderIdentityV2 {delivery: 'visible' | 'failed'}
export interface SharedReminderResolutionV2 extends SharedReminderIdentityV2 {action: 'continue' | 'end_rest'}
export interface SharedReminderRuntimeContextV2 extends Omit<SharedReminderRuntimeContext,
  'state' | 'currentPolicyRevision' | 'continuousUsageGrowth'> {
  state: SharedReminderStateV2; currentPolicyIdentity: SharedAccessPolicyIdentityV2;
}
export interface SharedReminderTransitionV2 extends Omit<SharedReminderTransition, 'state'> {state: SharedReminderStateV2}
export function validateSharedReminderStateV2(value: unknown): SharedReminderStateV2 {
  const fields = [...identityFields,'date','kinds','presenter','stage','issuedAtMs','offerExpiresAtMs','visibleAtMs',
    'responseDeadlineSeconds','timeoutAction','status','resolution','policyIdentity','ruleScopeKey','reasonCodes',
    'forcedUsageSeconds','confirmedAtUsageSeconds'];
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SHARED_REMINDER_STATE_V2');
  const s = value as SharedReminderStateV2;
  const start = typeof s.date === 'string' ? Date.parse(`${s.date}T00:00:00+08:00`) : NaN;
  if (Object.keys(s).length !== fields.length || fields.some(k => !Object.hasOwn(s,k)) || s.schemaVersion !== 2
    || identityFields.slice(1).some(k => !v2Key(s[k as keyof SharedReminderIdentityV2]))
    || !Number.isFinite(start) || new Date(start+28800000).toISOString().slice(0,10) !== s.date
    || !['browser','native'].includes(s.presenter) || !['shadow','shared'].includes(s.stage)
    || !validTime(s.issuedAtMs) || !validTime(s.offerExpiresAtMs) || s.offerExpiresAtMs <= s.issuedAtMs
    || s.visibleAtMs !== null && (!validTime(s.visibleAtMs) || s.visibleAtMs < s.issuedAtMs)
    || s.responseDeadlineSeconds !== 60 || s.timeoutAction !== 'end'
    || !['offered','visible','delivery_failed','resolved','withdrawn'].includes(s.status)
    || s.resolution !== null && !['continue','end_rest','timeout_end'].includes(s.resolution)
    || s.status === 'resolved' && (s.resolution === null || s.visibleAtMs === null)
    || s.status !== 'resolved' && s.resolution !== null || s.status === 'visible' && s.visibleAtMs === null)
    throw new Error('INVALID_SHARED_REMINDER_STATE_V2');
  validateSharedAccessPolicyIdentityV2(s.policyIdentity);
  if (s.policyRevision !== s.policyIdentity.revision || s.stage !== s.policyIdentity.stage
    || !/^[a-f0-9]{64}$/.test(s.ruleScopeKey) || !forcedReasons(s.reasonCodes) || s.reasonCodes.length === 0
    || !Array.isArray(s.kinds) || s.kinds.length === 0 || s.kinds.length > 2 || new Set(s.kinds).size !== s.kinds.length
    || s.kinds.some(k => k !== 'entry' && k !== 'repeat') || !validTime(s.forcedUsageSeconds)
    || s.confirmedAtUsageSeconds !== null && (!validTime(s.confirmedAtUsageSeconds) || s.confirmedAtUsageSeconds > s.forcedUsageSeconds))
    throw new Error('INVALID_SHARED_REMINDER_STATE_V2');
  return structuredClone(s);
}
export interface SharedBrowserExecutionV2 extends Omit<SharedBrowserExecution, 'schemaVersion' | 'triggerStateRevision'> {
  schemaVersion: 2; policyIdentity: SharedAccessPolicyIdentityV2;
}
export interface SharedBrowserExecutionAckV2 extends Omit<SharedBrowserExecutionAck, 'schemaVersion' | 'triggerStateRevision'> {
  schemaVersion: 2; policyIdentity: SharedAccessPolicyIdentityV2;
}
function validateExecutionV2(value: unknown, ack: boolean): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SHARED_BROWSER_EXECUTION_V2');
  const {policyIdentity, ...base} = value as Record<string, unknown>;
  if (base.schemaVersion !== 2 || Object.hasOwn(base,'triggerStateRevision')) throw new Error('INVALID_SHARED_BROWSER_EXECUTION_V2');
  validateSharedAccessPolicyIdentityV2(policyIdentity);
  if (base.policyRevision !== policyIdentity.revision) throw new Error('INVALID_SHARED_BROWSER_EXECUTION_V2');
  validateExecution({...base,schemaVersion:1},ack);
  return structuredClone(value) as Record<string, unknown>;
}
export function validateSharedBrowserExecutionV2(value: unknown): SharedBrowserExecutionV2 {
  return validateExecutionV2(value,false) as unknown as SharedBrowserExecutionV2;
}
export function validateSharedBrowserExecutionAckV2(value: unknown): SharedBrowserExecutionAckV2 {
  return validateExecutionV2(value,true) as unknown as SharedBrowserExecutionAckV2;
}

function validateV2ReminderMessage(value: unknown, delivery: boolean): SharedReminderDeliveryAck | SharedReminderResolution {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (value as {schemaVersion?: unknown}).schemaVersion !== 2)
    throw new Error('INVALID_SHARED_REMINDER_MESSAGE_V2');
  // 仅复用严格字段/动作验证，V1消息不会在V2入口被接纳。
  const captured = {...value, schemaVersion: 1};
  return delivery ? validateSharedReminderDeliveryAck(captured) : validateSharedReminderResolution(captured);
}
export function validateSharedReminderDeliveryAckV2(value: unknown): SharedReminderDeliveryAckV2 {
  return {...validateV2ReminderMessage(value,true),schemaVersion:2} as SharedReminderDeliveryAckV2;
}
export function validateSharedReminderResolutionV2(value: unknown): SharedReminderResolutionV2 {
  return {...validateV2ReminderMessage(value,false),schemaVersion:2} as SharedReminderResolutionV2;
}
function v2RuntimeContext(context: SharedReminderRuntimeContextV2): SharedReminderRuntimeContext {
  const s = validateSharedReminderStateV2(context.state);
  validateSharedAccessPolicyIdentityV2(context.currentPolicyIdentity);
  const samePolicy = (['revision','effectiveAtMs','stage','policyHash'] as const)
    .every(k => s.policyIdentity[k] === context.currentPolicyIdentity[k]);
  return {...context, state: {...s, schemaVersion: 1, kinds: s.kinds.map(k => k === 'repeat' ? 'daily' : 'entry')},
    currentPolicyRevision: samePolicy ? s.policyRevision : '',
  };
}
function v2Transition(context: SharedReminderRuntimeContextV2, transition: SharedReminderTransition): SharedReminderTransitionV2 {
  if (transition.state.resolution === 'timeout_continue') throw new Error('INVALID_SHARED_REMINDER_STATE_V2');
  const resolvedNow = transition.state.status === 'resolved' && context.state.status !== 'resolved';
  const advanceBaseline = resolvedNow && (context.state.confirmedAtUsageSeconds === null || context.state.kinds.includes('repeat'));
  return {...transition, state: {...context.state, status: transition.state.status,
    visibleAtMs: transition.state.visibleAtMs, resolution: transition.state.resolution,
    confirmedAtUsageSeconds: advanceBaseline ? context.state.forcedUsageSeconds : context.state.confirmedAtUsageSeconds}};
}
/** 沿用可见后60秒/主动正常关闭/超时强制状态机，完整V2身份先核对。 */
export function acknowledgeSharedReminderDeliveryV2(context: SharedReminderRuntimeContextV2, value: unknown): SharedReminderTransitionV2 {
  const message = validateV2ReminderMessage(value, true);
  return v2Transition(context, acknowledgeSharedReminderDelivery(v2RuntimeContext(context), message));
}
export function resolveSharedReminderV2(context: SharedReminderRuntimeContextV2, value: unknown): SharedReminderTransitionV2 {
  const message = validateV2ReminderMessage(value, false);
  return v2Transition(context, resolveSharedReminder(v2RuntimeContext(context), message));
}
export function expireSharedReminderV2(context: SharedReminderRuntimeContextV2): SharedReminderTransitionV2 {
  return v2Transition(context, expireSharedReminder(v2RuntimeContext(context)));
}

export const SHARED_REMINDER_LIFECYCLE_CAPABILITY = 'shared-reminder-lifecycle-v1' as const;
/** Required by both endpoints before issuing growth-continuation execution permits. */
export const SHARED_REMINDER_CONTINUITY_CAPABILITY = 'shared-reminder-continuity-v1' as const;
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
  /** Present only when ordinary growth continued the original visible instance. */
  triggerStateRevision?: string;
  executionId: string;
  leaseId: string;
  activityId: string;
  targetSource: 'browser';
  effect: 'request-normal-close' | 'force-close';
  /** Remaining Service lifetime; consumer measures from request start, not receipt. */
  maxAgeMs: number;
}
export interface SharedBrowserExecutionAck extends SharedReminderIdentity {
  triggerStateRevision?: string;
  executionId: string;
  leaseId: string;
  activityId: string;
  outcome: 'completed' | 'canceled' | 'failed' | 'stale';
}
const executionIdentityFields = ['executionId','leaseId','activityId'];
function validateExecution(value: unknown, ack: boolean): Record<string, unknown> {
  const fields = [...identityFields,...executionIdentityFields,...(ack ? ['outcome'] : ['targetSource','effect','maxAgeMs'])];
  if (!value || typeof value!=='object' || Array.isArray(value)
    || !Object.keys(value).every(field=>fields.includes(field)||field==='triggerStateRevision')
    || fields.some(field=>!Object.hasOwn(value,field)))
    throw new Error('INVALID_SHARED_BROWSER_EXECUTION');
  const item=value as Record<string,unknown>;
  if(item.schemaVersion!==1 || [...identityFields.slice(1),...executionIdentityFields].some(field=>
    typeof item[field]!=='string'||!(item[field] as string).trim()||(item[field] as string).length>128))
    throw new Error('INVALID_SHARED_BROWSER_EXECUTION');
  if(Object.hasOwn(item,'triggerStateRevision')&&(typeof item.triggerStateRevision!=='string'
    ||!item.triggerStateRevision.trim()||item.triggerStateRevision.length>128))
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
    leaseId:string;issuedMonotonicMs:number;bootId:string;consumed:boolean;continuitySupported?:boolean}): SharedBrowserExecution|null {
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
  if(context.currentStateRevision!==context.state.stateRevision){
    if(target.continuitySupported!==true)return null;
    identity.triggerStateRevision=context.state.stateRevision;
    identity.stateRevision=context.currentStateRevision;
  }
  return validateSharedBrowserExecution({...identity,executionId:target.executionId,leaseId:browser.leaseId,
    activityId:target.activityId,targetSource:'browser',effect:resolution==='end_rest'?'request-normal-close':'force-close',
    maxAgeMs:SHARED_BROWSER_EXECUTION_MAX_AGE_MS-(context.monotonicNowMs-target.issuedMonotonicMs)});
}
/** Local receipt clock and current facts. Caller durably claims the ID BEFORE effects. */
export function sharedBrowserExecutionEligibility(value: unknown, context: {
  connectionCurrent:boolean;leaseId:string;activityId:string;policyRevision:string;stateRevision:string;
  continuitySupported?:boolean;
  reminder:SharedReminderIdentity;restEligible:boolean;requestStartedMonotonicMs:number;monotonicNowMs:number;attemptedIds:ReadonlySet<string>;
}): {eligible:boolean;reasonCode:string|null} {
  const permit=validateSharedBrowserExecution(value);
  const reject=(reasonCode:string)=>({eligible:false,reasonCode});
  if(context.attemptedIds.has(permit.executionId))return reject('SHARED_BROWSER_EXECUTION_ALREADY_ATTEMPTED');
  if(!context.connectionCurrent||context.leaseId!==permit.leaseId)return reject('SHARED_BROWSER_ACTIVITY_LEASE_CHANGED');
  if(context.activityId!==permit.activityId||!context.restEligible)return reject('SHARED_BROWSER_ACTIVITY_CHANGED');
  if(identityFields.filter(field=>field!=='stateRevision').some(field=>context.reminder[field as keyof SharedReminderIdentity]
    !==permit[field as keyof SharedReminderIdentity]))return reject('SHARED_BROWSER_EXECUTION_INSTANCE_CHANGED');
  if(context.reminder.stateRevision!==(permit.triggerStateRevision??permit.stateRevision))
    return reject('SHARED_BROWSER_EXECUTION_INSTANCE_CHANGED');
  if(permit.triggerStateRevision!==undefined&&context.continuitySupported!==true)
    return reject('SHARED_REMINDER_CONTINUITY_UNSUPPORTED');
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
  if(ack.triggerStateRevision!==permit.triggerStateRevision)
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
  /** Internal only. Issuer must derive via sharedQuotaReminderContinuityV1;
   * every refresh since the trigger must pass. Never deserialize this from Host. */
  continuousUsageGrowth?: {triggerStateRevision: string; currentStateRevision: string};
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
    && (context.currentStateRevision === context.state.stateRevision
      || context.continuousUsageGrowth?.triggerStateRevision === context.state.stateRevision
        && context.continuousUsageGrowth.currentStateRevision === context.currentStateRevision);
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

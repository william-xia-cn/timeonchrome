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
export interface SharedBrowserActivityV2 {
  schemaVersion: 2;
  leaseId: string; activityId: string; sequence: number; presentationEligible: boolean;
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

export interface SharedReminderStateV2 extends SharedReminderIdentityV2 {
  schemaVersion: 2; kinds: readonly ('entry' | 'repeat')[];
  date: string; presenter: 'browser' | 'native'; stage: 'shadow' | 'shared';
  issuedAtMs: number; offerExpiresAtMs: number; visibleAtMs: number | null;
  responseDeadlineSeconds: 60;
  status: 'offered' | 'visible' | 'delivery_failed' | 'resolved' | 'withdrawn';
  timeoutAction: 'end';
  resolution: 'continue' | 'end_rest' | 'timeout_end' | null;
  policyIdentity: SharedAccessPolicyIdentityV2;
  ruleScopeKey: string;
  reasonCodes: readonly SharedForcedUseReason[];
  forcedUsageSeconds: number;
  confirmedAtUsageSeconds: number | null;
}
export interface SharedReminderIdentityV2 {
  schemaVersion: 2; roundId: string; reminderId: string; deliveryId: string;
  policyRevision: string; stateRevision: string;
}
export interface SharedReminderDeliveryAckV2 extends SharedReminderIdentityV2 {delivery: 'visible' | 'failed'}
export interface SharedReminderResolutionV2 extends SharedReminderIdentityV2 {action: 'continue' | 'end_rest'}
export interface SharedReminderRuntimeContextV2 {
  state: SharedReminderStateV2; currentPolicyIdentity: SharedAccessPolicyIdentityV2;
  scopeCurrent: boolean; presenterCurrent: boolean; currentStateRevision: string; executionEnabled: boolean;
  nowMs: number; monotonicNowMs: number; bootId: string;
  visibleBootId: string | null; visibleMonotonicMs: number | null;
}
export interface SharedReminderTransitionV2 {
  state: SharedReminderStateV2; duplicate: boolean; effect: 'none' | 'request-normal-close' | 'force-close';
  visibleMonotonicMs: number | null; visibleBootId: string | null;
}
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
export interface SharedBrowserExecutionV2 extends SharedReminderIdentityV2 {
  schemaVersion: 2; policyIdentity: SharedAccessPolicyIdentityV2;
  executionId: string; leaseId: string; activityId: string;
  targetSource: 'browser'; effect: 'request-normal-close' | 'force-close'; maxAgeMs: number;
}
export interface SharedBrowserExecutionAckV2 extends SharedReminderIdentityV2 {
  schemaVersion: 2; policyIdentity: SharedAccessPolicyIdentityV2;
  executionId: string; leaseId: string; activityId: string;
  outcome: 'completed' | 'canceled' | 'failed' | 'stale';
}
function validateExecutionV2(value: unknown, ack: boolean): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SHARED_BROWSER_EXECUTION_V2');
  const {policyIdentity, ...base} = value as Record<string, unknown>;
  if (base.schemaVersion !== 2 || Object.hasOwn(base,'triggerStateRevision')) throw new Error('INVALID_SHARED_BROWSER_EXECUTION_V2');
  validateSharedAccessPolicyIdentityV2(policyIdentity);
  if (base.policyRevision !== policyIdentity.revision) throw new Error('INVALID_SHARED_BROWSER_EXECUTION_V2');
  const fields = [...identityFields,...executionIdentityFields,...(ack ? ['outcome'] : ['targetSource','effect','maxAgeMs'])];
  if (Object.keys(base).length !== fields.length || fields.some(field => !Object.hasOwn(base,field))
    || [...identityFields.slice(1),...executionIdentityFields].some(field => typeof base[field] !== 'string'
      || !(base[field] as string).trim() || (base[field] as string).length > 128)
    || (ack ? !['completed','canceled','failed','stale'].includes(String(base.outcome))
      : base.targetSource !== 'browser' || !['request-normal-close','force-close'].includes(String(base.effect))
        || !validTime(base.maxAgeMs) || base.maxAgeMs < 1 || base.maxAgeMs > SHARED_BROWSER_EXECUTION_MAX_AGE_MS))
    throw new Error('INVALID_SHARED_BROWSER_EXECUTION');
  return structuredClone(value) as Record<string, unknown>;
}
export function validateSharedBrowserExecutionV2(value: unknown): SharedBrowserExecutionV2 {
  return validateExecutionV2(value,false) as unknown as SharedBrowserExecutionV2;
}
export function validateSharedBrowserExecutionAckV2(value: unknown): SharedBrowserExecutionAckV2 {
  return validateExecutionV2(value,true) as unknown as SharedBrowserExecutionAckV2;
}

function validateV2ReminderMessage(value: unknown, delivery: boolean): SharedReminderDeliveryAckV2 | SharedReminderResolutionV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (value as {schemaVersion?: unknown}).schemaVersion !== 2)
    throw new Error('INVALID_SHARED_REMINDER_MESSAGE_V2');
  const item = value as Record<string, unknown>;
  const fields = [...identityFields, delivery ? 'delivery' : 'action'];
  if (Object.keys(item).length !== fields.length || fields.some(field => !Object.hasOwn(item,field))
    || identityFields.slice(1).some(field => typeof item[field] !== 'string'
      || !(item[field] as string).trim() || (item[field] as string).length > 128)
    || (delivery ? !['visible','failed'].includes(String(item.delivery)) : !['continue','end_rest'].includes(String(item.action))))
    throw new Error('INVALID_SHARED_REMINDER_MESSAGE');
  return {...item} as unknown as SharedReminderDeliveryAckV2 | SharedReminderResolutionV2;
}
export function validateSharedReminderDeliveryAckV2(value: unknown): SharedReminderDeliveryAckV2 {
  return {...validateV2ReminderMessage(value,true),schemaVersion:2} as SharedReminderDeliveryAckV2;
}
export function validateSharedReminderResolutionV2(value: unknown): SharedReminderResolutionV2 {
  return {...validateV2ReminderMessage(value,false),schemaVersion:2} as SharedReminderResolutionV2;
}
function currentV2(context: SharedReminderRuntimeContextV2): boolean {
  const s = validateSharedReminderStateV2(context.state);
  validateSharedAccessPolicyIdentityV2(context.currentPolicyIdentity);
  if (!validTime(context.nowMs) || !validTime(context.monotonicNowMs) || !context.bootId)
    throw new Error('INVALID_SHARED_REMINDER_CLOCK');
  if (!context.scopeCurrent) throw new Error('SHARED_REMINDER_SCOPE_CHANGED');
  if (!context.presenterCurrent) throw new Error('SHARED_REMINDER_PRESENTER_CHANGED');
  const samePolicy = (['revision','effectiveAtMs','stage','policyHash'] as const)
    .every(k => s.policyIdentity[k] === context.currentPolicyIdentity[k]);
  return samePolicy && context.currentStateRevision === s.stateRevision;
}
function v2Transition(context: SharedReminderRuntimeContextV2, patch: Partial<SharedReminderStateV2> = {},
  effect: SharedReminderTransitionV2['effect'] = 'none', duplicate = false): SharedReminderTransitionV2 {
  const resolvedNow = patch.status === 'resolved' && context.state.status !== 'resolved';
  const advanceBaseline = resolvedNow && (context.state.confirmedAtUsageSeconds === null || context.state.kinds.includes('repeat'));
  return {state: {...context.state,...patch,
    confirmedAtUsageSeconds: advanceBaseline ? context.state.forcedUsageSeconds : context.state.confirmedAtUsageSeconds},
    effect,duplicate,visibleMonotonicMs:context.visibleMonotonicMs,visibleBootId:context.visibleBootId};
}
function boundV2(item: SharedReminderIdentityV2, state: SharedReminderStateV2): void {
  if (identityFields.some(field => item[field as keyof SharedReminderIdentityV2]
    !== state[field as keyof SharedReminderIdentityV2])) throw new Error('SHARED_REMINDER_INSTANCE_CHANGED');
}
function visibleClockValidV2(context: SharedReminderRuntimeContextV2): boolean {
  return context.visibleBootId === context.bootId && validTime(context.visibleMonotonicMs)
    && context.monotonicNowMs >= context.visibleMonotonicMs;
}
function effectV2(context: SharedReminderRuntimeContextV2, forced: boolean): SharedReminderTransitionV2['effect'] {
  if (context.state.stage !== 'shared' || !context.executionEnabled) return 'none';
  return forced ? 'force-close' : 'request-normal-close';
}
/** 沿用可见后60秒/主动正常关闭/超时强制状态机，完整V2身份先核对。 */
export function acknowledgeSharedReminderDeliveryV2(context: SharedReminderRuntimeContextV2, value: unknown): SharedReminderTransitionV2 {
  const message = validateSharedReminderDeliveryAckV2(value);
  boundV2(message,context.state);
  if (!currentV2(context)) return v2Transition(context,{status:'withdrawn'});
  const state = context.state;
  if ((state.status === 'visible' || state.status === 'resolved') && message.delivery === 'visible')
    return visibleClockValidV2(context) ? v2Transition(context,{},'none',true) : v2Transition(context,{status:'withdrawn'});
  if (state.status === 'delivery_failed' && message.delivery === 'failed') return v2Transition(context,{},'none',true);
  if (state.status !== 'offered') throw new Error('SHARED_REMINDER_DELIVERY_CONFLICT');
  if (context.nowMs < state.issuedAtMs || context.nowMs >= state.offerExpiresAtMs)
    return v2Transition(context,{status:'withdrawn'});
  if (message.delivery === 'failed') return v2Transition(context,{status:'delivery_failed'});
  return {...v2Transition(context,{status:'visible',visibleAtMs:context.nowMs}),
    visibleMonotonicMs:context.monotonicNowMs,visibleBootId:context.bootId};
}
export function resolveSharedReminderV2(context: SharedReminderRuntimeContextV2, value: unknown): SharedReminderTransitionV2 {
  const message = validateSharedReminderResolutionV2(value);
  boundV2(message,context.state);
  if (!currentV2(context)) return v2Transition(context,{status:'withdrawn'});
  if (context.state.status === 'resolved') {
    if (context.state.resolution !== message.action) throw new Error('SHARED_REMINDER_RESULT_CONFLICT');
    return v2Transition(context,{},'none',true);
  }
  if (context.state.status !== 'visible') throw new Error('SHARED_REMINDER_NOT_VISIBLE');
  if (!visibleClockValidV2(context)) return v2Transition(context,{status:'withdrawn'});
  if (context.monotonicNowMs - context.visibleMonotonicMs! >= 60_000)
    throw new Error('SHARED_REMINDER_DEADLINE_ELAPSED');
  return v2Transition(context,{status:'resolved',resolution:message.action},message.action === 'end_rest' ? effectV2(context,false) : 'none');
}
export function expireSharedReminderV2(context: SharedReminderRuntimeContextV2): SharedReminderTransitionV2 {
  if (!currentV2(context)) return v2Transition(context,{status:'withdrawn'});
  if (context.state.status === 'resolved') return v2Transition(context,{},'none',true);
  if (context.state.status !== 'visible') throw new Error('SHARED_REMINDER_NOT_VISIBLE');
  if (!visibleClockValidV2(context)) return v2Transition(context,{status:'withdrawn'});
  if (context.monotonicNowMs - context.visibleMonotonicMs! < 60_000)
    throw new Error('SHARED_REMINDER_TIMEOUT_EARLY');
  return v2Transition(context,{status:'resolved',resolution:'timeout_end'},effectV2(context,true));
}

export const SHARED_BROWSER_ACTIVITY_RENEW_MS = 5_000 as const;
export const SHARED_BROWSER_ACTIVITY_MAX_AGE_MS = 15_000 as const;
export const SHARED_BROWSER_EXECUTION_MAX_AGE_MS = 5_000 as const;
/** Live facts only: this is neither usage nor permission to enforce. */
const identityFields = ['schemaVersion','roundId','reminderId','deliveryId','policyRevision','stateRevision'];
const executionIdentityFields = ['executionId','leaseId','activityId'];
function validTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

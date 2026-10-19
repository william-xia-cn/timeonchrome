/** Service-issued reminders. These messages never select a child, user or process. */
import { validateSharedAccessPolicyIdentityV2 } from './shared-access.js';
import { sourceStatisticsDates } from './source-statistics.js';
export const SHARED_FORCED_USE_RUNTIME_V2_CAPABILITY = 'shared-forced-use-runtime-v2';
export const SHARED_FORCED_USE_REASONS = ['restrictedEntry', 'dailyStudy', 'dailyComposite', 'dailyRest', 'dailyOnline', 'weeklyRest', 'domain', 'timeWindow'];
export function validateSharedReminderStateQueryV2(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('INVALID_SHARED_REMINDER_QUERY_V2');
    const query = value;
    if (Object.keys(query).length !== 2 || !Object.hasOwn(query, 'date') || query.schemaVersion !== 2 || typeof query.date !== 'string')
        throw new Error('INVALID_SHARED_REMINDER_QUERY_V2');
    try {
        sourceStatisticsDates(query.date, query.date);
    }
    catch {
        throw new Error('INVALID_SHARED_REMINDER_QUERY_V2');
    }
    return { schemaVersion: 2, date: query.date };
}
function v2Key(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\u0000-\u0020\u007f]/.test(value);
}
function forcedReasons(value) {
    return Array.isArray(value) && value.length <= SHARED_FORCED_USE_REASONS.length && new Set(value).size === value.length
        && value.every(reason => SHARED_FORCED_USE_REASONS.includes(reason));
}
export function validateSharedBrowserActivityV2(value) {
    const fields = ['schemaVersion', 'leaseId', 'activityId', 'sequence', 'status', 'quotaBucket', 'presentationEligible',
        'policyIdentity', 'ruleScopeKey', 'reasonCodes', 'independentRoundId'];
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('INVALID_SHARED_BROWSER_ACTIVITY_V2');
    const item = value;
    if (Object.keys(item).length !== fields.length || fields.some(field => !Object.hasOwn(item, field))
        || item.schemaVersion !== 2 || !v2Key(item.leaseId) || !v2Key(item.activityId)
        || !validTime(item.sequence) || item.sequence < 1 || typeof item.presentationEligible !== 'boolean'
        || !forcedReasons(item.reasonCodes) || item.independentRoundId !== null && !v2Key(item.independentRoundId)
        || (item.status === 'active' || item.status === 'pending-entry' ? !['study', 'composite', 'rest', 'other'].includes(String(item.quotaBucket))
            || typeof item.ruleScopeKey !== 'string' || !/^[a-f0-9]{64}$/.test(item.ruleScopeKey)
            || item.status === 'pending-entry' && item.reasonCodes.length === 0
            : item.status !== 'inactive' || item.quotaBucket !== null || item.ruleScopeKey !== null
                || item.presentationEligible || item.reasonCodes.length !== 0))
        throw new Error('INVALID_SHARED_BROWSER_ACTIVITY_V2');
    validateSharedAccessPolicyIdentityV2(item.policyIdentity);
    return { ...structuredClone(item), reasonCodes: [...item.reasonCodes].sort() };
}
export function validateSharedBrowserActivityAckV2(value, expected) {
    const fields = ['schemaVersion', 'leaseId', 'acceptedSequence', 'duplicate', 'stale', 'ownership', 'retiredIndependentRoundId'];
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('INVALID_SHARED_BROWSER_ACTIVITY_ACK_V2');
    const ack = value;
    if (Object.keys(ack).length !== fields.length || fields.some(k => !Object.hasOwn(ack, k)) || ack.schemaVersion !== 2
        || !v2Key(ack.leaseId) || ack.leaseId !== expected.leaseId || !validTime(ack.acceptedSequence) || ack.acceptedSequence < 1
        || ack.acceptedSequence !== expected.sequence || typeof ack.duplicate !== 'boolean' || ack.stale !== false
        || ack.ownership !== 'accepted' || ack.retiredIndependentRoundId !== expected.independentRoundId
        || ack.retiredIndependentRoundId !== null && !v2Key(ack.retiredIndependentRoundId))
        throw new Error('INVALID_SHARED_BROWSER_ACTIVITY_ACK_V2');
    return { ...ack };
}
export function receiveSharedBrowserActivityV2(context, value) {
    const message = validateSharedBrowserActivityV2(value);
    validateSharedAccessPolicyIdentityV2(context.currentPolicyIdentity);
    if (!context.leaseCurrent || context.leaseId !== message.leaseId)
        throw new Error('SHARED_BROWSER_ACTIVITY_LEASE_CHANGED');
    if (!validTime(context.monotonicNowMs) || !v2Key(context.bootId))
        throw new Error('INVALID_SHARED_BROWSER_ACTIVITY_CLOCK');
    if (['revision', 'effectiveAtMs', 'stage', 'policyHash'].some(k => message.policyIdentity[k] !== context.currentPolicyIdentity[k]))
        throw new Error('SHARED_REMINDER_SCOPE_CHANGED');
    const old = context.current;
    if (old && (old.bootId !== context.bootId || old.message.leaseId !== context.leaseId
        || !validTime(old.receivedMonotonicMs) || context.monotonicNowMs < old.receivedMonotonicMs))
        throw new Error('SHARED_BROWSER_ACTIVITY_LEASE_CHANGED');
    if (old && message.sequence <= old.message.sequence) {
        const stable = (m) => JSON.stringify([m.schemaVersion, m.leaseId, m.activityId, m.sequence,
            m.status, m.quotaBucket, m.presentationEligible, m.policyIdentity.revision, m.policyIdentity.effectiveAtMs,
            m.policyIdentity.stage, m.policyIdentity.policyHash, m.ruleScopeKey, m.reasonCodes, m.independentRoundId]);
        if (message.sequence === old.message.sequence && stable(message) !== stable(old.message))
            throw new Error('SHARED_BROWSER_ACTIVITY_SEQUENCE_CONFLICT');
        return { receipt: old, duplicate: message.sequence === old.message.sequence, stale: message.sequence < old.message.sequence, baselineReset: false };
    }
    const baselineReset = !old || old.message.activityId !== message.activityId
        || context.monotonicNowMs - old.receivedMonotonicMs >= SHARED_BROWSER_ACTIVITY_MAX_AGE_MS;
    return { receipt: { message, receivedMonotonicMs: context.monotonicNowMs, bootId: context.bootId }, duplicate: false, stale: false, baselineReset };
}
export function advanceSharedForcedUseClock(state, bootId, nowMs, sources) {
    if (!v2Key(bootId) || !v2Key(state.bootId) || !validTime(state.lastMonotonicMs)
        || !validTime(state.accumulatedMs) || !validTime(nowMs) || sources.length > 128
        || sources.some(source => typeof source.eligible !== 'boolean' || !validTime(source.validThroughMonotonicMs)))
        throw new Error('INVALID_SHARED_FORCED_USE_CLOCK');
    if (state.bootId !== bootId)
        return { ...state, bootId, lastMonotonicMs: nowMs };
    if (nowMs < state.lastMonotonicMs)
        throw new Error('INVALID_SHARED_FORCED_USE_CLOCK');
    const through = sources.reduce((end, source) => source.eligible
        ? Math.max(end, Math.min(nowMs, source.validThroughMonotonicMs)) : end, state.lastMonotonicMs);
    const accumulatedMs = state.accumulatedMs + through - state.lastMonotonicMs;
    if (!validTime(accumulatedMs))
        throw new Error('INVALID_SHARED_FORCED_USE_CLOCK');
    return { ...state, lastMonotonicMs: nowMs, accumulatedMs };
}
export function validateSharedReminderStateV2(value) {
    const fields = [...identityFields, 'date', 'kinds', 'presenter', 'stage', 'issuedAtMs', 'offerExpiresAtMs', 'visibleAtMs',
        'responseDeadlineSeconds', 'timeoutAction', 'status', 'resolution', 'policyIdentity', 'ruleScopeKey', 'reasonCodes',
        'forcedUsageSeconds', 'confirmedAtUsageSeconds'];
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('INVALID_SHARED_REMINDER_STATE_V2');
    const s = value;
    const start = typeof s.date === 'string' ? Date.parse(`${s.date}T00:00:00+08:00`) : NaN;
    if (Object.keys(s).length !== fields.length || fields.some(k => !Object.hasOwn(s, k)) || s.schemaVersion !== 2
        || identityFields.slice(1).some(k => !v2Key(s[k]))
        || !Number.isFinite(start) || new Date(start + 28800000).toISOString().slice(0, 10) !== s.date
        || !['browser', 'native'].includes(s.presenter) || !['shadow', 'shared'].includes(s.stage)
        || !validTime(s.issuedAtMs) || !validTime(s.offerExpiresAtMs) || s.offerExpiresAtMs <= s.issuedAtMs
        || s.visibleAtMs !== null && (!validTime(s.visibleAtMs) || s.visibleAtMs < s.issuedAtMs)
        || s.responseDeadlineSeconds !== 60 || s.timeoutAction !== 'end'
        || !['offered', 'visible', 'delivery_failed', 'resolved', 'withdrawn'].includes(s.status)
        || s.resolution !== null && !['continue', 'end_rest', 'timeout_end'].includes(s.resolution)
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
function validateExecutionV2(value, ack) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('INVALID_SHARED_BROWSER_EXECUTION_V2');
    const { policyIdentity, ...base } = value;
    if (base.schemaVersion !== 2 || Object.hasOwn(base, 'triggerStateRevision'))
        throw new Error('INVALID_SHARED_BROWSER_EXECUTION_V2');
    validateSharedAccessPolicyIdentityV2(policyIdentity);
    if (base.policyRevision !== policyIdentity.revision)
        throw new Error('INVALID_SHARED_BROWSER_EXECUTION_V2');
    const fields = [...identityFields, ...executionIdentityFields, ...(ack ? ['outcome'] : ['targetSource', 'effect', 'maxAgeMs'])];
    if (Object.keys(base).length !== fields.length || fields.some(field => !Object.hasOwn(base, field))
        || [...identityFields.slice(1), ...executionIdentityFields].some(field => typeof base[field] !== 'string'
            || !base[field].trim() || base[field].length > 128)
        || (ack ? !['completed', 'canceled', 'failed', 'stale'].includes(String(base.outcome))
            : base.targetSource !== 'browser' || !['request-normal-close', 'force-close'].includes(String(base.effect))
                || !validTime(base.maxAgeMs) || base.maxAgeMs < 1 || base.maxAgeMs > SHARED_BROWSER_EXECUTION_MAX_AGE_MS))
        throw new Error('INVALID_SHARED_BROWSER_EXECUTION');
    return structuredClone(value);
}
export function validateSharedBrowserExecutionV2(value) {
    return validateExecutionV2(value, false);
}
export function validateSharedBrowserExecutionAckV2(value) {
    return validateExecutionV2(value, true);
}
function validateV2ReminderMessage(value, delivery) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 2)
        throw new Error('INVALID_SHARED_REMINDER_MESSAGE_V2');
    const item = value;
    const fields = [...identityFields, delivery ? 'delivery' : 'action'];
    if (Object.keys(item).length !== fields.length || fields.some(field => !Object.hasOwn(item, field))
        || identityFields.slice(1).some(field => typeof item[field] !== 'string'
            || !item[field].trim() || item[field].length > 128)
        || (delivery ? !['visible', 'failed'].includes(String(item.delivery)) : !['continue', 'end_rest'].includes(String(item.action))))
        throw new Error('INVALID_SHARED_REMINDER_MESSAGE');
    return { ...item };
}
export function validateSharedReminderDeliveryAckV2(value) {
    return { ...validateV2ReminderMessage(value, true), schemaVersion: 2 };
}
export function validateSharedReminderResolutionV2(value) {
    return { ...validateV2ReminderMessage(value, false), schemaVersion: 2 };
}
function currentV2(context) {
    const s = validateSharedReminderStateV2(context.state);
    validateSharedAccessPolicyIdentityV2(context.currentPolicyIdentity);
    if (!validTime(context.nowMs) || !validTime(context.monotonicNowMs) || !context.bootId)
        throw new Error('INVALID_SHARED_REMINDER_CLOCK');
    if (!context.scopeCurrent)
        throw new Error('SHARED_REMINDER_SCOPE_CHANGED');
    if (!context.presenterCurrent)
        throw new Error('SHARED_REMINDER_PRESENTER_CHANGED');
    const samePolicy = ['revision', 'effectiveAtMs', 'stage', 'policyHash']
        .every(k => s.policyIdentity[k] === context.currentPolicyIdentity[k]);
    return samePolicy && context.currentStateRevision === s.stateRevision;
}
function v2Transition(context, patch = {}, effect = 'none', duplicate = false) {
    const resolvedNow = patch.status === 'resolved' && context.state.status !== 'resolved';
    const advanceBaseline = resolvedNow && (context.state.confirmedAtUsageSeconds === null || context.state.kinds.includes('repeat'));
    return { state: { ...context.state, ...patch,
            confirmedAtUsageSeconds: advanceBaseline ? context.state.forcedUsageSeconds : context.state.confirmedAtUsageSeconds },
        effect, duplicate, visibleMonotonicMs: context.visibleMonotonicMs, visibleBootId: context.visibleBootId };
}
function boundV2(item, state) {
    if (identityFields.some(field => item[field]
        !== state[field]))
        throw new Error('SHARED_REMINDER_INSTANCE_CHANGED');
}
function visibleClockValidV2(context) {
    return context.visibleBootId === context.bootId && validTime(context.visibleMonotonicMs)
        && context.monotonicNowMs >= context.visibleMonotonicMs;
}
function effectV2(context, forced) {
    if (context.state.stage !== 'shared' || !context.executionEnabled)
        return 'none';
    return forced ? 'force-close' : 'request-normal-close';
}
/** 沿用可见后60秒/主动正常关闭/超时强制状态机，完整V2身份先核对。 */
export function acknowledgeSharedReminderDeliveryV2(context, value) {
    const message = validateSharedReminderDeliveryAckV2(value);
    boundV2(message, context.state);
    if (!currentV2(context))
        return v2Transition(context, { status: 'withdrawn' });
    const state = context.state;
    if ((state.status === 'visible' || state.status === 'resolved') && message.delivery === 'visible')
        return visibleClockValidV2(context) ? v2Transition(context, {}, 'none', true) : v2Transition(context, { status: 'withdrawn' });
    if (state.status === 'delivery_failed' && message.delivery === 'failed')
        return v2Transition(context, {}, 'none', true);
    if (state.status !== 'offered')
        throw new Error('SHARED_REMINDER_DELIVERY_CONFLICT');
    if (context.nowMs < state.issuedAtMs || context.nowMs >= state.offerExpiresAtMs)
        return v2Transition(context, { status: 'withdrawn' });
    if (message.delivery === 'failed')
        return v2Transition(context, { status: 'delivery_failed' });
    return { ...v2Transition(context, { status: 'visible', visibleAtMs: context.nowMs }),
        visibleMonotonicMs: context.monotonicNowMs, visibleBootId: context.bootId };
}
export function resolveSharedReminderV2(context, value) {
    const message = validateSharedReminderResolutionV2(value);
    boundV2(message, context.state);
    if (!currentV2(context))
        return v2Transition(context, { status: 'withdrawn' });
    if (context.state.status === 'resolved') {
        if (context.state.resolution !== message.action)
            throw new Error('SHARED_REMINDER_RESULT_CONFLICT');
        return v2Transition(context, {}, 'none', true);
    }
    if (context.state.status !== 'visible')
        throw new Error('SHARED_REMINDER_NOT_VISIBLE');
    if (!visibleClockValidV2(context))
        return v2Transition(context, { status: 'withdrawn' });
    if (context.monotonicNowMs - context.visibleMonotonicMs >= 60_000)
        throw new Error('SHARED_REMINDER_DEADLINE_ELAPSED');
    return v2Transition(context, { status: 'resolved', resolution: message.action }, message.action === 'end_rest' ? effectV2(context, false) : 'none');
}
export function expireSharedReminderV2(context) {
    if (!currentV2(context))
        return v2Transition(context, { status: 'withdrawn' });
    if (context.state.status === 'resolved')
        return v2Transition(context, {}, 'none', true);
    if (context.state.status !== 'visible')
        throw new Error('SHARED_REMINDER_NOT_VISIBLE');
    if (!visibleClockValidV2(context))
        return v2Transition(context, { status: 'withdrawn' });
    if (context.monotonicNowMs - context.visibleMonotonicMs < 60_000)
        throw new Error('SHARED_REMINDER_TIMEOUT_EARLY');
    return v2Transition(context, { status: 'resolved', resolution: 'timeout_end' }, effectV2(context, true));
}
export const SHARED_BROWSER_ACTIVITY_RENEW_MS = 5_000;
export const SHARED_BROWSER_ACTIVITY_MAX_AGE_MS = 15_000;
export const SHARED_BROWSER_EXECUTION_MAX_AGE_MS = 5_000;
/** Live facts only: this is neither usage nor permission to enforce. */
const identityFields = ['schemaVersion', 'roundId', 'reminderId', 'deliveryId', 'policyRevision', 'stateRevision'];
const executionIdentityFields = ['executionId', 'leaseId', 'activityId'];
function validTime(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

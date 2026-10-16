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
    validateExecution({ ...base, schemaVersion: 1 }, ack);
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
    // 仅复用严格字段/动作验证，V1消息不会在V2入口被接纳。
    const captured = { ...value, schemaVersion: 1 };
    return delivery ? validateSharedReminderDeliveryAck(captured) : validateSharedReminderResolution(captured);
}
export function validateSharedReminderDeliveryAckV2(value) {
    return { ...validateV2ReminderMessage(value, true), schemaVersion: 2 };
}
export function validateSharedReminderResolutionV2(value) {
    return { ...validateV2ReminderMessage(value, false), schemaVersion: 2 };
}
function v2RuntimeContext(context) {
    const s = validateSharedReminderStateV2(context.state);
    validateSharedAccessPolicyIdentityV2(context.currentPolicyIdentity);
    const samePolicy = ['revision', 'effectiveAtMs', 'stage', 'policyHash']
        .every(k => s.policyIdentity[k] === context.currentPolicyIdentity[k]);
    return { ...context, state: { ...s, schemaVersion: 1, kinds: s.kinds.map(k => k === 'repeat' ? 'daily' : 'entry') },
        currentPolicyRevision: samePolicy ? s.policyRevision : '',
    };
}
function v2Transition(context, transition) {
    if (transition.state.resolution === 'timeout_continue')
        throw new Error('INVALID_SHARED_REMINDER_STATE_V2');
    const resolvedNow = transition.state.status === 'resolved' && context.state.status !== 'resolved';
    const advanceBaseline = resolvedNow && (context.state.confirmedAtUsageSeconds === null || context.state.kinds.includes('repeat'));
    return { ...transition, state: { ...context.state, status: transition.state.status,
            visibleAtMs: transition.state.visibleAtMs, resolution: transition.state.resolution,
            confirmedAtUsageSeconds: advanceBaseline ? context.state.forcedUsageSeconds : context.state.confirmedAtUsageSeconds } };
}
/** 沿用可见后60秒/主动正常关闭/超时强制状态机，完整V2身份先核对。 */
export function acknowledgeSharedReminderDeliveryV2(context, value) {
    const message = validateV2ReminderMessage(value, true);
    return v2Transition(context, acknowledgeSharedReminderDelivery(v2RuntimeContext(context), message));
}
export function resolveSharedReminderV2(context, value) {
    const message = validateV2ReminderMessage(value, false);
    return v2Transition(context, resolveSharedReminder(v2RuntimeContext(context), message));
}
export function expireSharedReminderV2(context) {
    return v2Transition(context, expireSharedReminder(v2RuntimeContext(context)));
}
export const SHARED_REMINDER_LIFECYCLE_CAPABILITY = 'shared-reminder-lifecycle-v1';
/** Required by both endpoints before issuing growth-continuation execution permits. */
export const SHARED_REMINDER_CONTINUITY_CAPABILITY = 'shared-reminder-continuity-v1';
export const SHARED_BROWSER_ACTIVITY_CAPABILITY = 'shared-browser-activity-v1';
export const SHARED_BROWSER_ACTIVITY_RENEW_MS = 5_000;
export const SHARED_BROWSER_ACTIVITY_MAX_AGE_MS = 15_000;
export const SHARED_BROWSER_EXECUTION_CAPABILITY = 'shared-browser-execution-v1';
export const SHARED_BROWSER_EXECUTION_MAX_AGE_MS = 5_000;
export function validateSharedBrowserActivity(value) {
    const fields = ['schemaVersion', 'leaseId', 'activityId', 'sequence', 'status', 'quotaBucket', 'presentationEligible'];
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field)))
        throw new Error('INVALID_SHARED_BROWSER_ACTIVITY');
    const item = value;
    if (item.schemaVersion !== 1 || ['leaseId', 'activityId'].some(field => typeof item[field] !== 'string'
        || !item[field].trim() || item[field].length > 128)
        || !validTime(item.sequence) || item.sequence < 1 || typeof item.presentationEligible !== 'boolean'
        || (item.status === 'active' ? item.quotaBucket !== 'rest'
            : item.status !== 'inactive' || item.quotaBucket !== null || item.presentationEligible !== false))
        throw new Error('INVALID_SHARED_BROWSER_ACTIVITY');
    return { ...item };
}
export function receiveSharedBrowserActivity(context, value) {
    const message = validateSharedBrowserActivity(value);
    if (!validTime(context.monotonicNowMs) || !context.bootId)
        throw new Error('INVALID_SHARED_BROWSER_ACTIVITY_CLOCK');
    if (!context.leaseCurrent || message.leaseId !== context.leaseId)
        throw new Error('SHARED_BROWSER_ACTIVITY_LEASE_CHANGED');
    const old = context.current;
    if (old && (old.message.leaseId !== context.leaseId || old.bootId !== context.bootId
        || !validTime(old.receivedMonotonicMs) || context.monotonicNowMs < old.receivedMonotonicMs))
        throw new Error('SHARED_BROWSER_ACTIVITY_LEASE_CHANGED');
    if (old && message.sequence <= old.message.sequence) {
        if (message.sequence === old.message.sequence) {
            if (Object.keys(message).some(field => message[field] !== old.message[field]))
                throw new Error('SHARED_BROWSER_ACTIVITY_SEQUENCE_CONFLICT');
            return { receipt: old, duplicate: true, stale: false };
        }
        return { receipt: old, duplicate: false, stale: true };
    }
    return { receipt: { message, receivedMonotonicMs: context.monotonicNowMs, bootId: context.bootId }, duplicate: false, stale: false };
}
/** Bind each issued reminder to this activityId as well as its presenter lease. */
export function sharedBrowserReminderEligibility(context, expectedActivityId) {
    const reject = (reasonCode) => ({ eligible: false, reasonCode });
    if (!context.leaseCurrent)
        return reject('SHARED_BROWSER_ACTIVITY_LEASE_CHANGED');
    if (!context.unlocked)
        return reject('SHARED_BROWSER_ACTIVITY_LOCKED');
    if (!context.verifiedChromeForeground)
        return reject('SHARED_BROWSER_ACTIVITY_NOT_FOREGROUND');
    const receipt = context.current;
    if (!receipt)
        return reject('SHARED_BROWSER_ACTIVITY_MISSING');
    if (receipt.bootId !== context.bootId || receipt.message.leaseId !== context.leaseId)
        return reject('SHARED_BROWSER_ACTIVITY_LEASE_CHANGED');
    if (!validTime(context.monotonicNowMs) || !validTime(receipt.receivedMonotonicMs)
        || context.monotonicNowMs < receipt.receivedMonotonicMs)
        return reject('INVALID_SHARED_BROWSER_ACTIVITY_CLOCK');
    if (context.monotonicNowMs - receipt.receivedMonotonicMs >= SHARED_BROWSER_ACTIVITY_MAX_AGE_MS)
        return reject('SHARED_BROWSER_ACTIVITY_EXPIRED');
    if (receipt.message.status !== 'active' || receipt.message.quotaBucket !== 'rest' || !receipt.message.presentationEligible)
        return reject('SHARED_BROWSER_ACTIVITY_NOT_ELIGIBLE');
    if (expectedActivityId !== undefined && receipt.message.activityId !== expectedActivityId)
        return reject('SHARED_BROWSER_ACTIVITY_CHANGED');
    return { eligible: true, reasonCode: null };
}
const executionIdentityFields = ['executionId', 'leaseId', 'activityId'];
function validateExecution(value, ack) {
    const fields = [...identityFields, ...executionIdentityFields, ...(ack ? ['outcome'] : ['targetSource', 'effect', 'maxAgeMs'])];
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || !Object.keys(value).every(field => fields.includes(field) || field === 'triggerStateRevision')
        || fields.some(field => !Object.hasOwn(value, field)))
        throw new Error('INVALID_SHARED_BROWSER_EXECUTION');
    const item = value;
    if (item.schemaVersion !== 1 || [...identityFields.slice(1), ...executionIdentityFields].some(field => typeof item[field] !== 'string' || !item[field].trim() || item[field].length > 128))
        throw new Error('INVALID_SHARED_BROWSER_EXECUTION');
    if (Object.hasOwn(item, 'triggerStateRevision') && (typeof item.triggerStateRevision !== 'string'
        || !item.triggerStateRevision.trim() || item.triggerStateRevision.length > 128))
        throw new Error('INVALID_SHARED_BROWSER_EXECUTION');
    if (ack ? !['completed', 'canceled', 'failed', 'stale'].includes(item.outcome)
        : item.targetSource !== 'browser' || !['request-normal-close', 'force-close'].includes(item.effect)
            || !validTime(item.maxAgeMs) || item.maxAgeMs < 1 || item.maxAgeMs > SHARED_BROWSER_EXECUTION_MAX_AGE_MS)
        throw new Error('INVALID_SHARED_BROWSER_EXECUTION');
    return item;
}
export function validateSharedBrowserExecution(value) {
    return { ...validateExecution(value, false) };
}
export function validateSharedBrowserExecutionAck(value) {
    return { ...validateExecution(value, true) };
}
/** Service uses persisted target binding; presenter=native may still target browser. */
export function authorizeSharedBrowserExecution(context, browser, target) {
    if (!current(context) || context.state.stage !== 'shared' || !context.executionEnabled
        || target.source !== 'browser' || context.state.status !== 'resolved' || !visibleClockValid(context)
        || !validTime(context.state.visibleAtMs))
        return null;
    const resolution = context.state.resolution;
    if (resolution !== 'end_rest' && resolution !== 'timeout_end')
        return null;
    if (resolution === 'timeout_end' && (context.state.timeoutAction !== 'end'
        || context.monotonicNowMs - context.visibleMonotonicMs < 60_000))
        return null;
    if (target.consumed || target.bootId !== context.bootId || target.leaseId !== browser.leaseId
        || browser.bootId !== context.bootId
        || !validTime(target.issuedMonotonicMs) || context.monotonicNowMs < target.issuedMonotonicMs
        || context.monotonicNowMs - target.issuedMonotonicMs >= SHARED_BROWSER_EXECUTION_MAX_AGE_MS)
        return null;
    if (!sharedBrowserReminderEligibility(browser, target.activityId).eligible)
        return null;
    const identity = Object.fromEntries(identityFields.map(field => [field, context.state[field]]));
    if (context.currentStateRevision !== context.state.stateRevision) {
        if (target.continuitySupported !== true)
            return null;
        identity.triggerStateRevision = context.state.stateRevision;
        identity.stateRevision = context.currentStateRevision;
    }
    return validateSharedBrowserExecution({ ...identity, executionId: target.executionId, leaseId: browser.leaseId,
        activityId: target.activityId, targetSource: 'browser', effect: resolution === 'end_rest' ? 'request-normal-close' : 'force-close',
        maxAgeMs: SHARED_BROWSER_EXECUTION_MAX_AGE_MS - (context.monotonicNowMs - target.issuedMonotonicMs) });
}
/** Local receipt clock and current facts. Caller durably claims the ID BEFORE effects. */
export function sharedBrowserExecutionEligibility(value, context) {
    const permit = validateSharedBrowserExecution(value);
    const reject = (reasonCode) => ({ eligible: false, reasonCode });
    if (context.attemptedIds.has(permit.executionId))
        return reject('SHARED_BROWSER_EXECUTION_ALREADY_ATTEMPTED');
    if (!context.connectionCurrent || context.leaseId !== permit.leaseId)
        return reject('SHARED_BROWSER_ACTIVITY_LEASE_CHANGED');
    if (context.activityId !== permit.activityId || !context.restEligible)
        return reject('SHARED_BROWSER_ACTIVITY_CHANGED');
    if (identityFields.filter(field => field !== 'stateRevision').some(field => context.reminder[field]
        !== permit[field]))
        return reject('SHARED_BROWSER_EXECUTION_INSTANCE_CHANGED');
    if (context.reminder.stateRevision !== (permit.triggerStateRevision ?? permit.stateRevision))
        return reject('SHARED_BROWSER_EXECUTION_INSTANCE_CHANGED');
    if (permit.triggerStateRevision !== undefined && context.continuitySupported !== true)
        return reject('SHARED_REMINDER_CONTINUITY_UNSUPPORTED');
    if (context.policyRevision !== permit.policyRevision || context.stateRevision !== permit.stateRevision)
        return reject('SHARED_REMINDER_SCOPE_CHANGED');
    if (!validTime(context.monotonicNowMs) || !validTime(context.requestStartedMonotonicMs)
        || context.monotonicNowMs < context.requestStartedMonotonicMs)
        return reject('INVALID_SHARED_BROWSER_EXECUTION_CLOCK');
    if (context.monotonicNowMs - context.requestStartedMonotonicMs >= permit.maxAgeMs)
        return reject('SHARED_BROWSER_EXECUTION_EXPIRED');
    return { eligible: true, reasonCode: null };
}
/** ACK consumes the issued attempt; never changes effect or creates another permit. */
export function acknowledgeSharedBrowserExecution(issued, value, existing, authenticatedLeaseCurrent) {
    const permit = validateSharedBrowserExecution(issued), ack = validateSharedBrowserExecutionAck(value);
    if (!authenticatedLeaseCurrent)
        throw new Error('SHARED_BROWSER_ACTIVITY_LEASE_CHANGED');
    if ([...identityFields, ...executionIdentityFields].some(field => ack[field] !== permit[field]))
        throw new Error('SHARED_BROWSER_EXECUTION_INSTANCE_CHANGED');
    if (ack.triggerStateRevision !== permit.triggerStateRevision)
        throw new Error('SHARED_BROWSER_EXECUTION_INSTANCE_CHANGED');
    if (ack.outcome === 'canceled' && permit.effect === 'force-close')
        throw new Error('SHARED_BROWSER_EXECUTION_RESULT_CONFLICT');
    if (existing) {
        const prior = validateSharedBrowserExecutionAck(existing);
        if (Object.keys(ack).some(field => ack[field] !== prior[field]))
            throw new Error('SHARED_BROWSER_EXECUTION_RESULT_CONFLICT');
        return { ack: prior, duplicate: true };
    }
    return { ack, duplicate: false };
}
const identityFields = ['schemaVersion', 'roundId', 'reminderId', 'deliveryId', 'policyRevision', 'stateRevision'];
function validTime(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function validateIdentity(value, extra) {
    const fields = [...identityFields, extra];
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field)))
        throw new Error('INVALID_SHARED_REMINDER_MESSAGE');
    const item = value;
    if (item.schemaVersion !== 1 || identityFields.slice(1).some(field => typeof item[field] !== 'string'
        || !item[field].trim() || item[field].length > 128))
        throw new Error('INVALID_SHARED_REMINDER_MESSAGE');
    return item;
}
export function validateSharedReminderDeliveryAck(value) {
    const item = validateIdentity(value, 'delivery');
    if (item.delivery !== 'visible' && item.delivery !== 'failed')
        throw new Error('INVALID_SHARED_REMINDER_MESSAGE');
    return { ...item };
}
export function validateSharedReminderResolution(value) {
    const item = validateIdentity(value, 'action');
    if (item.action !== 'continue' && item.action !== 'end_rest')
        throw new Error('INVALID_SHARED_REMINDER_MESSAGE');
    return { ...item };
}
function transition(context, patch = {}, effect = 'none', duplicate = false) {
    return { state: { ...context.state, ...patch }, duplicate, effect,
        visibleMonotonicMs: context.visibleMonotonicMs, visibleBootId: context.visibleBootId };
}
function current(context) {
    if (!validTime(context.nowMs) || !validTime(context.monotonicNowMs) || !context.bootId)
        throw new Error('INVALID_SHARED_REMINDER_CLOCK');
    if (!context.scopeCurrent)
        throw new Error('SHARED_REMINDER_SCOPE_CHANGED');
    if (!context.presenterCurrent)
        throw new Error('SHARED_REMINDER_PRESENTER_CHANGED');
    return context.currentPolicyRevision === context.state.policyRevision
        && (context.currentStateRevision === context.state.stateRevision
            || context.continuousUsageGrowth?.triggerStateRevision === context.state.stateRevision
                && context.continuousUsageGrowth.currentStateRevision === context.currentStateRevision);
}
function bound(item, state) {
    if (identityFields.some(field => item[field]
        !== state[field]))
        throw new Error('SHARED_REMINDER_INSTANCE_CHANGED');
}
/** Only the Service's receipt clock is canonical; client timestamps are forbidden. */
export function acknowledgeSharedReminderDelivery(context, value) {
    const item = validateSharedReminderDeliveryAck(value);
    bound(item, context.state);
    if (!current(context))
        return transition(context, { status: 'withdrawn' });
    const state = context.state;
    if ((state.status === 'visible' || state.status === 'resolved') && item.delivery === 'visible')
        return visibleClockValid(context) ? transition(context, {}, 'none', true) : transition(context, { status: 'withdrawn' });
    if (state.status === 'delivery_failed' && item.delivery === 'failed')
        return transition(context, {}, 'none', true);
    if (state.status !== 'offered')
        throw new Error('SHARED_REMINDER_DELIVERY_CONFLICT');
    if (context.nowMs < state.issuedAtMs || context.nowMs >= state.offerExpiresAtMs)
        return transition(context, { status: 'withdrawn' });
    if (item.delivery === 'failed')
        return transition(context, { status: 'delivery_failed' });
    return { ...transition(context, { status: 'visible', visibleAtMs: context.nowMs }),
        visibleMonotonicMs: context.monotonicNowMs, visibleBootId: context.bootId };
}
function visibleClockValid(context) {
    return context.visibleBootId === context.bootId && validTime(context.visibleMonotonicMs)
        && context.monotonicNowMs >= context.visibleMonotonicMs;
}
function effect(context, forced) {
    if (context.state.stage !== 'shared' || !context.executionEnabled)
        return 'none';
    return forced ? 'force-close' : 'request-normal-close';
}
export function resolveSharedReminder(context, value) {
    const item = validateSharedReminderResolution(value);
    bound(item, context.state);
    if (!current(context))
        return transition(context, { status: 'withdrawn' });
    if (context.state.status === 'resolved') {
        if (context.state.resolution !== item.action)
            throw new Error('SHARED_REMINDER_RESULT_CONFLICT');
        return transition(context, {}, 'none', true);
    }
    if (context.state.status !== 'visible')
        throw new Error('SHARED_REMINDER_NOT_VISIBLE');
    if (!visibleClockValid(context))
        return transition(context, { status: 'withdrawn' });
    // Reject the late intent; only the separate Service timer may authorize a timeout effect.
    if (context.monotonicNowMs - context.visibleMonotonicMs >= 60_000)
        throw new Error('SHARED_REMINDER_DEADLINE_ELAPSED');
    return transition(context, { status: 'resolved', resolution: item.action }, item.action === 'end_rest' ? effect(context, false) : 'none');
}
/** Timeout is a Service-local event, never a client-selected action. */
export function expireSharedReminder(context) {
    if (!current(context))
        return transition(context, { status: 'withdrawn' });
    if (context.state.status === 'resolved')
        return transition(context, {}, 'none', true);
    if (context.state.status !== 'visible')
        throw new Error('SHARED_REMINDER_NOT_VISIBLE');
    if (!visibleClockValid(context))
        return transition(context, { status: 'withdrawn' });
    if (context.monotonicNowMs - context.visibleMonotonicMs < 60_000)
        throw new Error('SHARED_REMINDER_TIMEOUT_EARLY');
    const forced = context.state.timeoutAction === 'end';
    return transition(context, { status: 'resolved', resolution: forced ? 'timeout_end' : 'timeout_continue' }, forced ? effect(context, true) : 'none');
}

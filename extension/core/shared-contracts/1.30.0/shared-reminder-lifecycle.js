/** Service-issued reminders. These messages never select a child, user or process. */
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

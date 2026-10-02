/** D-114: one Child policy. Source ledgers remain separately authoritative. */
export const SHARED_ACCESS_SCHEMA_VERSION = 1;
/** Read-only compatibility projection; it does not activate shared enforcement. */
export function projectLegacySharedAccessPolicy(config, version, updatedAtMs) {
    if (!Number.isSafeInteger(version) || version < 0 || !validMs(updatedAtMs))
        throw new RangeError('INVALID_POLICY_REVISION');
    const asRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
        ? value : {};
    const quota = asRecord(config.timeQuota), daily = asRecord(quota.daily), weekly = asRecord(quota.weekly);
    const windows = asRecord(asRecord(config.timeWindows).daily);
    const rest = asRecord(config.restConfig), autonomy = asRecord(config.autonomyConfig);
    const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const minutes = (value) => value === null || value === undefined
        ? null : validMs(value) ? value : null;
    const normalizedWindows = (value) => Array.isArray(value) && value.length > 0 ? value.map(item => ({ start: String(item.start), end: String(item.end) })) : null;
    return {
        schemaVersion: SHARED_ACCESS_SCHEMA_VERSION,
        revision: `profile-config:${version}`, effectiveAtMs: updatedAtMs, stage: 'legacy',
        dailyMinutes: Object.fromEntries(weekdays.map(day => {
            const dayQuota = asRecord(daily[day]);
            return [day, { study: minutes(dayQuota.studyMinutes), composite: minutes(dayQuota.compositeMinutes),
                    rest: minutes(dayQuota.restMinutes) }];
        })),
        weeklyRestMinutes: Object.hasOwn(weekly, 'restMinutes') ? minutes(weekly.restMinutes)
            : minutes(config.weeklyRestQuota === 0 ? null : config.weeklyRestQuota),
        timeWindows: Object.fromEntries(weekdays.map(day => {
            const dayWindows = asRecord(windows[day]);
            return [day, { study: normalizedWindows(dayWindows.studyWindows),
                    composite: normalizedWindows(dayWindows.compositeWindows), rest: normalizedWindows(dayWindows.restWindows) }];
        })),
        autonomy: { restrictedEntryConfirmationRequired: autonomy.restrictedEntryConfirmationRequired !== false,
            dailyFirstReminderMinutes: rest.firstReminderMinutes === 0 ? null : minutes(rest.firstReminderMinutes),
            weeklyFirstReminderMinutes: rest.weeklyFirstReminderMinutes === 0 ? null : minutes(rest.weeklyFirstReminderMinutes),
            repeatReminderMinutes: validMs(rest.repeatReminderMinutes) && rest.repeatReminderMinutes > 0
                ? rest.repeatReminderMinutes : 60,
            softReminderTimeoutAction: autonomy.softReminderTimeoutAction === 'continue' ? 'continue' : 'end_rest',
            visibleResponseDeadlineSeconds: 60 },
    };
}
const buckets = ['study', 'composite', 'rest'];
const validMs = (value) => Number.isSafeInteger(value) && Number(value) >= 0;
/**
 * Read-only shared quota projection. Source revisions REPLACE previous snapshots;
 * callers must supply one current revision per authenticated source scope.
 * Web Rest already includes web borrowing. Application composite and unclassified
 * borrow only after the existing effective web composite contribution is counted.
 * This function never mutates either authority's ledger or quotas.
 */
export function projectSharedQuotaDay(policy, date, sources) {
    const dayStart = Date.parse(`${date}T00:00:00+08:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(dayStart)
        || new Date(dayStart + 28_800_000).toISOString().slice(0, 10) !== date)
        throw new RangeError('INVALID_DATE');
    const reasons = new Set();
    const seen = new Set();
    const web = { study: 0, composite: 0, rest: 0 };
    const app = { study: 0, composite: 0, restrictedEntertainment: 0, unclassified: 0 };
    let webCount = 0, appCount = 0;
    for (const source of sources) {
        const scope = `${source.source}\u0000${source.sourceKey}\u0000${source.date}`;
        if (seen.has(scope)) {
            reasons.add('DUPLICATE_SOURCE_SCOPE');
            continue;
        }
        seen.add(scope);
        if (source.schemaVersion !== SHARED_ACCESS_SCHEMA_VERSION || source.date !== date || !source.sourceKey
            || !source.revision || source.policyRevision !== policy.revision || !source.complete) {
            reasons.add('SOURCE_INCOMPLETE_OR_VERSION_MISMATCH');
            continue;
        }
        if (source.source === 'web') {
            if (!buckets.every(bucket => validMs(source.bucketsMs[bucket]) && source.bucketsMs[bucket] % 1000 === 0)) {
                reasons.add('INVALID_WEB_CONTRIBUTION');
                continue;
            }
            webCount++;
            for (const bucket of buckets)
                web[bucket] += source.bucketsMs[bucket];
        }
        else {
            const classes = source.applicationClassesMs;
            if (!classes || !Object.values(classes).every(validMs) || !validMs(source.chromeExcludedMs)) {
                reasons.add('INVALID_APPLICATION_CONTRIBUTION');
                continue;
            }
            appCount++;
            app.study += classes.study;
            app.composite += classes.composite;
            app.unclassified += classes.unclassified;
            app.restrictedEntertainment += classes.restrictedEntertainment;
        }
    }
    if (!webCount)
        reasons.add('WEB_COVERAGE_MISSING');
    if (!appCount)
        reasons.add('APPLICATION_COVERAGE_MISSING');
    const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(dayStart + 28_800_000).getUTCDay()];
    const limits = policy.dailyMinutes[weekday];
    const compositeRaw = app.composite + app.unclassified;
    const compositeAvailable = limits.composite === null ? Infinity
        : Math.max(0, limits.composite * 60000 - web.composite);
    const borrowedRestMs = Math.max(0, compositeRaw - compositeAvailable);
    const usedMs = { study: web.study + app.study,
        composite: web.composite + compositeRaw - borrowedRestMs,
        rest: web.rest + app.restrictedEntertainment + borrowedRestMs };
    if (!Object.values(usedMs).every(validMs))
        reasons.add('CONTRIBUTION_OVERFLOW');
    const remainingMs = Object.fromEntries(buckets.map(bucket => [bucket,
        limits[bucket] === null ? null : Math.max(0, limits[bucket] * 60000 - usedMs[bucket])]));
    return { date, complete: reasons.size === 0, reasonCodes: [...reasons].sort(), usedMs, remainingMs, borrowedRestMs };
}
/** Validate a shadow receipt, not an instruction to close an application. */
export function validateSharedReminderResult(value, registration) {
    const fields = ['schemaVersion', 'reminderId', 'policyRevision', 'stateRevision', 'kind',
        'delivery', 'visibleAtMs', 'action', 'resolvedAtMs'];
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field)))
        throw new Error('INVALID_SHARED_REMINDER_RESULT');
    const result = value;
    const ms = (n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
    const revision = (n) => typeof n === 'string' && n.length > 0 && n.length <= 128;
    if (result.schemaVersion !== 1 || !revision(result.reminderId) || !revision(result.policyRevision)
        || !revision(result.stateRevision) || !['entry', 'daily', 'weekly'].includes(result.kind)
        || !['visible', 'failed'].includes(result.delivery) || !ms(result.resolvedAtMs)
        || !(result.visibleAtMs === null || ms(result.visibleAtMs))
        || !['continue', 'end_rest', 'timeout_continue', 'timeout_end', 'delivery_failed_continue',
            'delivery_failed_end'].includes(result.action))
        throw new Error('INVALID_SHARED_REMINDER_RESULT');
    if (!registration || registration.reminderId !== result.reminderId)
        throw new Error('SHARED_REMINDER_NOT_ISSUED');
    if (registration.policyRevision !== result.policyRevision || registration.stateRevision !== result.stateRevision
        || registration.kind !== result.kind)
        throw new Error('SHARED_REMINDER_VERSION_CHANGED');
    if (!ms(registration.issuedAtMs) || result.resolvedAtMs < registration.issuedAtMs)
        throw new Error('INVALID_SHARED_REMINDER_TIME');
    const failedAction = result.action.startsWith('delivery_failed_');
    if (result.delivery === 'failed') {
        if (!failedAction || result.visibleAtMs !== null || registration.visibleAtMs !== null)
            throw new Error('INVALID_SHARED_REMINDER_DELIVERY');
    }
    else {
        if (failedAction || result.visibleAtMs === null || registration.visibleAtMs !== result.visibleAtMs
            || result.visibleAtMs < registration.issuedAtMs || result.resolvedAtMs < result.visibleAtMs)
            throw new Error('INVALID_SHARED_REMINDER_DELIVERY');
        if (result.action.startsWith('timeout_') && result.resolvedAtMs - result.visibleAtMs < 60_000)
            throw new Error('SHARED_REMINDER_TIMEOUT_EARLY');
    }
    return { ...result };
}

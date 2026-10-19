/** D-114: one Child policy. Source ledgers remain separately authoritative. */
export const SHARED_ACCESS_POLICY_V2_CAPABILITY = 'shared-access-policy-v2';
/** 从唯一孩子配置投影，默认不启动共享执行；原字段单位/含义不改写。 */
export function projectSharedAccessPolicyV2(config, version, updatedAtMs) {
    const fields = projectChildAccessPolicyFields(config, version, updatedAtMs);
    const raw = config.autonomyConfig;
    const autonomy = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    if (['restrictedEntryConfirmationRequired', 'quotaOverrunConfirmationRequired', 'timeWindowAdvisoryEnabled']
        .some(k => Object.hasOwn(autonomy, k) && typeof autonomy[k] !== 'boolean')
        || Object.hasOwn(autonomy, 'softReminderTimeoutAction') && !['continue', 'end_rest'].includes(String(autonomy.softReminderTimeoutAction)))
        throw new Error('INVALID_SHARED_ACCESS_POLICY_V2');
    const policy = {
        ...fields, schemaVersion: 2,
        forcedUsePolicyV1: config.forcedUsePolicyV1 === undefined ? null : structuredClone(config.forcedUsePolicyV1),
        autonomy: {
            restrictedEntryConfirmationRequired: autonomy.restrictedEntryConfirmationRequired !== false,
            quotaOverrunConfirmationRequired: autonomy.quotaOverrunConfirmationRequired !== false,
            timeWindowAdvisoryEnabled: autonomy.timeWindowAdvisoryEnabled === true,
            softReminderTimeoutAction: autonomy.softReminderTimeoutAction === 'continue' ? 'continue' : 'end_rest',
            visibleResponseDeadlineSeconds: 60,
        },
        downtimeConfig: config.downtimeConfig === undefined ? {
            schemaVersion: 1, enabled: false,
            windowsByWeekday: { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] },
            allowedWebsiteTypes: [], allowedApplicationTypes: [],
        } : structuredClone(config.downtimeConfig),
    };
    canonicalSharedAccessPolicyV2(policy);
    return policy;
}
/** 严格验证当前V2协议边界，不将字段解释为额外可执行上限。 */
export function canonicalSharedAccessPolicyV2(value) {
    const invalid = () => { throw new Error('INVALID_SHARED_ACCESS_POLICY_V2'); };
    if (!policyExact(value, ['schemaVersion', 'revision', 'effectiveAtMs', 'stage', 'dailyMinutes',
        'weeklyRestMinutes', 'timeWindows', 'autonomy', 'forcedUsePolicyV1', 'downtimeConfig']) || value.schemaVersion !== 2)
        return invalid();
    const a = value.autonomy;
    if (!policyExact(a, ['restrictedEntryConfirmationRequired', 'quotaOverrunConfirmationRequired',
        'timeWindowAdvisoryEnabled', 'softReminderTimeoutAction', 'visibleResponseDeadlineSeconds'])
        || ['restrictedEntryConfirmationRequired', 'quotaOverrunConfirmationRequired', 'timeWindowAdvisoryEnabled'].some(k => typeof a[k] !== 'boolean')
        || !['continue', 'end_rest'].includes(String(a.softReminderTimeoutAction)) || a.visibleResponseDeadlineSeconds !== 60)
        return invalid();
    const { forcedUsePolicyV1: forced, downtimeConfig: downtime } = value;
    if (!validChildAccessPolicyFields(value))
        return invalid();
    const minute = (v) => v === null || validMs(v) && v <= 10080;
    if (forced !== null && (!policyExact(forced, ['schemaVersion', 'enabled', 'reminderIntervalMinutes', 'quotaOverrunMinutes', 'advisoryWindowDailyMaxMinutes'])
        || forced.schemaVersion !== 1 || typeof forced.enabled !== 'boolean' || !validMs(forced.reminderIntervalMinutes)
        || forced.reminderIntervalMinutes < 1 || forced.reminderIntervalMinutes > 1440
        || !policyExact(forced.quotaOverrunMinutes, ['dailyStudy', 'dailyComposite', 'dailyRest', 'dailyOnline', 'weeklyRest', 'domain'])
        || !Object.values(forced.quotaOverrunMinutes).every(minute)
        || forced.advisoryWindowDailyMaxMinutes !== null && (!validMs(forced.advisoryWindowDailyMaxMinutes)
            || forced.advisoryWindowDailyMaxMinutes < 1 || forced.advisoryWindowDailyMaxMinutes > 1440)))
        return invalid();
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const clock = (v) => typeof v === 'string' && /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
    const allowed = (v, types) => Array.isArray(v) && new Set(v).size === v.length && v.every(x => types.includes(x));
    if (!policyExact(downtime, ['schemaVersion', 'enabled', 'windowsByWeekday', 'allowedWebsiteTypes', 'allowedApplicationTypes'])
        || downtime.schemaVersion !== 1 || typeof downtime.enabled !== 'boolean' || !policyExact(downtime.windowsByWeekday, days)
        || !allowed(downtime.allowedWebsiteTypes, ['study', 'composite', 'restricted', 'other'])
        || !allowed(downtime.allowedApplicationTypes, ['study', 'composite', 'restrictedEntertainment', 'other']))
        return invalid();
    for (const windows of Object.values(downtime.windowsByWeekday)) {
        if (!Array.isArray(windows) || windows.length > 32 || windows.some(w => !policyExact(w, ['start', 'end'])
            || !clock(w.start) || !(clock(w.end) || w.end === '24:00') || w.start === w.end))
            return invalid();
    }
    const canonical = policyCanonical(value);
    if (new TextEncoder().encode(canonical).length > 30 * 1024)
        return invalid();
    return canonical;
}
export function validateSharedAccessPolicyIdentityV2(value) {
    if (!policyExact(value, ['schemaVersion', 'revision', 'effectiveAtMs', 'stage', 'policyHash'])
        || value.schemaVersion !== 2 || !validPolicyIdentityFields(value))
        throw new Error('INVALID_SHARED_ACCESS_POLICY_IDENTITY_V2');
}
/** V2缓存与在途请求身份覆盖当前自主度、停用和强行使用策略的完整内容。 */
export async function createSharedAccessPolicyIdentityV2(policy) {
    const canonical = canonicalSharedAccessPolicyV2(policy);
    const captured = JSON.parse(canonical);
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)));
    return { schemaVersion: 2, revision: captured.revision, effectiveAtMs: captured.effectiveAtMs,
        stage: captured.stage, policyHash: [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('') };
}
function projectChildAccessPolicyFields(config, version, updatedAtMs) {
    if (!Number.isSafeInteger(version) || version < 0 || !validMs(updatedAtMs))
        throw new RangeError('INVALID_POLICY_REVISION');
    const asRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
        ? value : {};
    const quota = asRecord(config.timeQuota), daily = asRecord(quota.daily), weekly = asRecord(quota.weekly);
    const windows = asRecord(asRecord(config.timeWindows).daily);
    const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const minutes = (value) => value === null || value === undefined
        ? null : validMs(value) ? value : null;
    const normalizedWindows = (value) => Array.isArray(value) && value.length > 0 ? value.map(item => ({ start: String(item.start), end: String(item.end) })) : null;
    return {
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
    };
}
const validMs = (value) => Number.isSafeInteger(value) && Number(value) >= 0;
const policyExact = (value, fields) => !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
const policyCanonical = (value) => Array.isArray(value)
    ? `[${value.map(policyCanonical).join(',')}]`
    : value && typeof value === 'object'
        ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${policyCanonical(value[key])}`).join(',')}}`
        : JSON.stringify(value);
function validChildAccessPolicyFields(value) {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const buckets = ['study', 'composite', 'rest'];
    const minutes = (v) => v === null || validMs(v) && v <= 10080;
    const time = (v) => typeof v === 'string' && /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
    const windows = (v) => v === null || Array.isArray(v) && v.every(item => policyExact(item, ['start', 'end']) && time(item.start) && (time(item.end) || item.end === '24:00'));
    if (typeof value.revision !== 'string'
        || !/^profile-config:(?:0|[1-9][0-9]*)$/.test(value.revision)
        || !Number.isSafeInteger(Number(value.revision.slice(15)))
        || !validMs(value.effectiveAtMs) || typeof value.stage !== 'string' || !['legacy', 'shadow', 'shared'].includes(value.stage)
        || !minutes(value.weeklyRestMinutes) || !policyExact(value.dailyMinutes, days) || !policyExact(value.timeWindows, days))
        return false;
    for (const day of days) {
        const daily = value.dailyMinutes[day], dailyWindows = value.timeWindows[day];
        if (!policyExact(daily, buckets) || !policyExact(dailyWindows, buckets)
            || !buckets.every(bucket => minutes(daily[bucket]) && windows(dailyWindows[bucket])))
            return false;
    }
    return true;
}
function validPolicyIdentityFields(value) {
    return typeof value.revision === 'string' && /^profile-config:(?:0|[1-9][0-9]*)$/.test(value.revision)
        && Number.isSafeInteger(Number(value.revision.slice(15))) && validMs(value.effectiveAtMs)
        && typeof value.stage === 'string' && ['legacy', 'shadow', 'shared'].includes(value.stage) && typeof value.policyHash === 'string'
        && /^[a-f0-9]{64}$/.test(value.policyHash);
}

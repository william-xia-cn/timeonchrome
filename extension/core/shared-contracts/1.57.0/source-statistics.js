/** v1 仅供旧端兼容；新共享只传配额桶，不使用来源清单或分类快照。 */
export const SOURCE_STATISTICS_READ_CAPABILITY = 'source-statistics-read-v1';
export const SOURCE_STATISTICS_EXCHANGE_MESSAGE = 'exchangeSourceStatistics';
export const QUOTA_BUCKETS_READ_CAPABILITY = 'quota-buckets-read-v1';
export const QUOTA_BUCKETS_EXCHANGE_MESSAGE = 'exchangeQuotaBuckets';
/** 既有交换的可选来源说明；不改变合计快照或新增请求。 */
export const QUOTA_BUCKETS_SOURCES_CAPABILITY = 'quota-buckets-sources-v1';
export const APPLICATION_QUOTA_SOURCE_STATE_HEADER = 'X-Application-Quota-Source-State';
export function validateQuotaBucketsSources(value, expected) {
    const sources = record(value);
    keys(sources, ['local', 'other', 'otherState']);
    if (!['none', 'available', 'unknown'].includes(String(sources.otherState))
        || (sources.otherState === 'available') !== (sources.other !== null))
        fail();
    sourceStatisticsDates(expected.fromDate, expected.toDate);
    for (const snapshot of [sources.local, sources.other]) {
        if (snapshot !== null)
            validateQuotaBucketsSnapshot(snapshot, { source: 'application', ...expected });
    }
    return value;
}
export function validateQuotaBucketsQuery(value) {
    const q = record(value);
    keys(q, ['schemaVersion', 'source', 'fromDate', 'toDate', 'scope']);
    if (q.schemaVersion !== 2 || !['web', 'application'].includes(String(q.source)) || !['all', 'other'].includes(String(q.scope)))
        fail();
    sourceStatisticsDates(q.fromDate, q.toDate);
    return value;
}
/** 原业务查询保持严格；这两个字段只控制云端备用的可选传输侧车。 */
export function readQuotaBucketsCloudRequest(value) {
    const input = record(value);
    const { includeSources, sourceProof, ...rawQuery } = input;
    const query = validateQuotaBucketsQuery(rawQuery);
    if (includeSources !== undefined && includeSources !== true
        || includeSources === true && (query.source !== 'application' || query.scope !== 'all')
        || Object.hasOwn(input, 'sourceProof') && includeSources !== true)
        fail();
    return { query, includeSources: includeSources === true,
        ...(Object.hasOwn(input, 'sourceProof') ? { sourceProof } : {}) };
}
/** 合计仍严格验证；侧车缺失或损坏只丢解释，不能清空有效合计。 */
export function readQuotaBucketsCloudResponse(value, expected) {
    const input = record(value);
    if (!Object.hasOwn(input, 'snapshot')) {
        return { snapshot: validateQuotaBucketsSnapshot(value, expected), applicationSources: null };
    }
    const snapshot = validateQuotaBucketsSnapshot(input.snapshot, expected);
    let applicationSources = null;
    if (expected.source === 'application' && input.applicationSources != null) {
        try {
            applicationSources = validateQuotaBucketsSources(input.applicationSources, expected);
        }
        catch { /* 可选侧车不影响合计 */ }
    }
    return { snapshot, applicationSources };
}
export function validateQuotaBucketsSnapshot(value, expected) {
    const s = record(value);
    keys(s, ['schemaVersion', 'durationUnit', 'source', 'childId', 'fromDate', 'toDate', 'readAtMs', 'days']);
    const dates = sourceStatisticsDates(expected.fromDate, expected.toDate);
    if (s.schemaVersion !== 2 || s.durationUnit !== 'seconds' || s.source !== expected.source || s.childId !== expected.childId
        || !label(s.childId) || s.fromDate !== expected.fromDate || s.toDate !== expected.toDate || !integer(s.readAtMs)
        || !Array.isArray(s.days) || s.days.length !== dates.length)
        fail();
    for (const [index, raw] of s.days.entries()) {
        const d = record(raw);
        keys(d, ['date', 'bucketsSeconds', 'settledThroughMs', 'complete', 'reasonCodes']);
        const buckets = record(d.bucketsSeconds);
        keys(buckets, ['study', 'composite', 'rest']);
        if (d.date !== dates[index] || !Object.values(buckets).every(integer) || typeof d.complete !== 'boolean'
            || d.settledThroughMs !== null && (!integer(d.settledThroughMs) || d.settledThroughMs > Number(s.readAtMs))
            || !Array.isArray(d.reasonCodes) || d.reasonCodes.length > 32 || d.reasonCodes.some(r => !label(r))
            || new Set(d.reasonCodes).size !== d.reasonCodes.length || d.complete && d.reasonCodes.length)
            fail();
    }
    return value;
}
export function validateQuotaBucketsExchange(value, childId) {
    const q = record(value);
    keys(q, ['fromDate', 'toDate', 'webUsage']);
    sourceStatisticsDates(q.fromDate, q.toDate);
    if (q.webUsage !== null)
        validateQuotaBucketsSnapshot(q.webUsage, {
            source: 'web', childId, fromDate: String(q.fromDate), toDate: String(q.toDate),
        });
    return value;
}
/** 应用配额的唯一分类适配：输入已排除特殊应用，不更改统计、不计算借用。 */
export function applicationQuotaBucketsSeconds(categories) {
    if (!Object.values(categories).every(integer))
        fail();
    const composite = (categories.composite ?? 0) + (categories.unclassified ?? 0);
    if (!integer(composite))
        fail();
    return { study: categories.study ?? 0, composite, rest: categories.restrictedEntertainment ?? 0 };
}
/** 只相加两个领域已有桶；缺失临时按0核算，但保留缺源原因，不改写来源统计。 */
export function projectQuotaBucketsSeconds(policy, date, web, application) {
    sourceStatisticsDates(date, date);
    const childId = web?.childId ?? application?.childId, reasons = new Set();
    const usedSeconds = { study: 0, composite: 0, rest: 0 };
    for (const [source, snapshot] of [['web', web], ['application', application]]) {
        if (snapshot)
            validateQuotaBucketsSnapshot(snapshot, { source, childId: childId, fromDate: snapshot.fromDate, toDate: snapshot.toDate });
        const day = snapshot?.days.find(d => d.date === date);
        if (!day) {
            reasons.add(`${source.toUpperCase()}_SOURCE_UNAVAILABLE`);
            continue;
        }
        for (const reason of day.reasonCodes)
            reasons.add(reason);
        if (!day.complete)
            reasons.add(`${source.toUpperCase()}_SOURCE_PARTIAL`);
        for (const bucket of ['study', 'composite', 'rest']) {
            usedSeconds[bucket] += day.bucketsSeconds[bucket];
            if (!integer(usedSeconds[bucket]))
                fail();
        }
    }
    const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(Date.parse(date + 'T00:00:00+08:00') + OFFSET).getUTCDay()];
    const limits = policy.dailyMinutes[weekday];
    const remainingSeconds = Object.fromEntries(['study', 'composite', 'rest'].map(k => [k, limits[k] === null ? null : Math.max(0, limits[k] * 60 - usedSeconds[k])]));
    return { date, complete: reasons.size === 0, reasonCodes: [...reasons].sort(), usedSeconds, remainingSeconds, borrowedRestSeconds: 0 };
}
const DAY = 86_400_000, OFFSET = 28_800_000;
const fail = () => { throw new Error('SOURCE_STATISTICS_INVALID'); };
function record(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return fail();
    return value;
}
function keys(value, required, optional = []) {
    if (required.some(k => !Object.hasOwn(value, k)) || Object.keys(value).some(k => !required.includes(k) && !optional.includes(k)))
        fail();
}
function integer(value) { return Number.isSafeInteger(value) && Number(value) >= 0; }
function label(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value);
}
function sourceKeys(value) {
    if (!Array.isArray(value) || value.length > 200 || new Set(value).size !== value.length || value.some(k => !label(k)))
        fail();
}
export function sourceStatisticsDates(from, to) {
    const parse = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? Date.parse(v + 'T00:00:00+08:00') : NaN;
    const start = parse(from), end = parse(to);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end - start > 6 * DAY
        || new Date(start + OFFSET).toISOString().slice(0, 10) !== from || new Date(end + OFFSET).toISOString().slice(0, 10) !== to)
        return fail();
    return Array.from({ length: (end - start) / DAY + 1 }, (_, i) => new Date(start + i * DAY + OFFSET).toISOString().slice(0, 10));
}
export function validateSourceStatisticsQuery(value) {
    const q = record(value);
    keys(q, ['source', 'fromDate', 'toDate', 'scope'], ['ownSourceKeys']);
    if (!['web', 'application'].includes(String(q.source)) || !['all', 'other'].includes(String(q.scope)))
        fail();
    sourceStatisticsDates(q.fromDate, q.toDate);
    if (q.ownSourceKeys !== undefined)
        sourceKeys(q.ownSourceKeys);
    if (q.scope === 'all' && q.ownSourceKeys !== undefined || q.scope === 'other' && q.source === 'application'
        && (!Array.isArray(q.ownSourceKeys) || q.ownSourceKeys.length === 0))
        fail();
    return value;
}
export function validateSourceStatisticsExchange(value, childId) {
    const q = record(value);
    keys(q, ['fromDate', 'toDate', 'webStatistics']);
    sourceStatisticsDates(q.fromDate, q.toDate);
    if (q.webStatistics !== null)
        validateSourceStatisticsSnapshot(q.webStatistics, { source: 'web', childId, fromDate: String(q.fromDate), toDate: String(q.toDate) });
    return value;
}
export function validateSourceStatisticsSnapshot(value, expected) {
    const s = record(value);
    keys(s, ['schemaVersion', 'durationUnit', 'source', 'childId', 'fromDate', 'toDate', 'revision', 'readAtMs', 'includedSourceKeys', 'excludedSourceKeys', 'days']);
    const dates = sourceStatisticsDates(expected.fromDate, expected.toDate);
    if (s.schemaVersion !== 1 || s.durationUnit !== 'seconds' || s.source !== expected.source || s.childId !== expected.childId
        || s.fromDate !== expected.fromDate || s.toDate !== expected.toDate || !label(s.revision) || !label(s.childId) || !integer(s.readAtMs))
        fail();
    sourceKeys(s.includedSourceKeys);
    sourceKeys(s.excludedSourceKeys);
    const excluded = s.excludedSourceKeys;
    if (s.includedSourceKeys.some(k => excluded.includes(k)) || !Array.isArray(s.days) || s.days.length !== dates.length)
        fail();
    for (const [i, raw] of s.days.entries()) {
        const d = record(raw);
        keys(d, ['date', 'totalSeconds', 'categoriesSeconds', 'settledThroughMs', 'complete', 'reasonCodes'], expected.source === 'application' ? ['nonSpecialTotalSeconds'] : []);
        if (d.date !== dates[i] || typeof d.complete !== 'boolean' || d.totalSeconds !== null && !integer(d.totalSeconds)
            || d.settledThroughMs !== null && (!integer(d.settledThroughMs) || d.settledThroughMs > Number(s.readAtMs)))
            fail();
        if (!Array.isArray(d.reasonCodes) || d.reasonCodes.length > 32 || new Set(d.reasonCodes).size !== d.reasonCodes.length || d.reasonCodes.some(r => !label(r)))
            fail();
        const categories = record(d.categoriesSeconds);
        if (Object.keys(categories).length > 16 || Object.entries(categories).some(([k, n]) => !label(k) || !integer(n)))
            fail();
        if (d.totalSeconds === null && (d.complete || Object.keys(categories).length))
            fail();
        if (d.complete && d.reasonCodes.length)
            fail();
        if (expected.source === 'application') {
            if (!Object.hasOwn(d, 'nonSpecialTotalSeconds') || d.nonSpecialTotalSeconds !== null && (!integer(d.nonSpecialTotalSeconds)
                || d.totalSeconds === null || d.nonSpecialTotalSeconds > Number(d.totalSeconds)))
                fail();
            if (d.totalSeconds === null && d.nonSpecialTotalSeconds !== null)
                fail();
        }
    }
    return value;
}
/** 本机最新＋云端其他来源；只相加不同来源，不进行跨机器时间并集。 */
export async function combineOwnAndOtherStatistics(local, other) {
    const expected = { source: local.source, childId: local.childId, fromDate: local.fromDate, toDate: local.toDate };
    validateSourceStatisticsSnapshot(local, expected);
    validateSourceStatisticsSnapshot(other, expected);
    if (local.includedSourceKeys.some(k => other.includedSourceKeys.includes(k) || !other.excludedSourceKeys.includes(k)))
        throw new Error('SOURCE_STATISTICS_DUPLICATE_SOURCE');
    const add = (a, b) => a === null ? b : b === null ? a : integer(a + b) ? a + b : fail();
    const days = local.days.map((a, i) => {
        const b = other.days[i], categoriesSeconds = { ...a.categoriesSeconds };
        for (const [k, n] of Object.entries(b.categoriesSeconds))
            categoriesSeconds[k] = add(categoriesSeconds[k] ?? 0, n);
        const complete = a.complete && b.complete;
        return { date: a.date, totalSeconds: add(a.totalSeconds, b.totalSeconds), categoriesSeconds,
            ...(local.source === 'application' ? { nonSpecialTotalSeconds: add(a.nonSpecialTotalSeconds ?? null, b.nonSpecialTotalSeconds ?? null) } : {}),
            settledThroughMs: a.settledThroughMs === null || b.settledThroughMs === null ? null : Math.min(a.settledThroughMs, b.settledThroughMs),
            complete, reasonCodes: [...new Set([...a.reasonCodes, ...b.reasonCodes])].sort() };
    });
    const bytes = new TextEncoder().encode(JSON.stringify([local.revision, other.revision, local.includedSourceKeys, other.includedSourceKeys]));
    const revision = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
    return { ...local, revision, readAtMs: Math.max(local.readAtMs, other.readAtMs),
        includedSourceKeys: [...local.includedSourceKeys, ...other.includedSourceKeys].sort(), excludedSourceKeys: [], days };
}
/** 独立配额纯函数；保留网页既有rest借用桶，只对应用复合/未归类计算新增借用。 */
export function projectSharedQuotaSeconds(policy, date, web, application) {
    return projectQuotaSeconds(policy, date, web, application, true);
}
/** 新自主度核算：各分类独立，网页已经发生的桶归属原样保留。 */
export function projectIndependentSharedQuotaSeconds(policy, date, web, application) {
    return projectQuotaSeconds(policy, date, web, application, false);
}
function projectQuotaSeconds(policy, date, web, application, allowApplicationBorrowing) {
    sourceStatisticsDates(date, date);
    const childId = web?.childId ?? application?.childId, reasons = new Set();
    for (const [source, snapshot] of [['web', web], ['application', application]]) {
        if (!snapshot) {
            reasons.add(`${source.toUpperCase()}_SOURCE_UNAVAILABLE`);
            continue;
        }
        validateSourceStatisticsSnapshot(snapshot, { source, childId: childId, fromDate: snapshot.fromDate, toDate: snapshot.toDate });
    }
    const w = web?.days.find(d => d.date === date), a = application?.days.find(d => d.date === date);
    if (!w || w.totalSeconds === null)
        reasons.add('WEB_SOURCE_UNAVAILABLE');
    if (!a || a.totalSeconds === null || a.nonSpecialTotalSeconds === null)
        reasons.add('APPLICATION_SOURCE_UNAVAILABLE');
    for (const d of [w, a]) {
        for (const r of d?.reasonCodes ?? [])
            reasons.add(r);
        if (d && !d.complete)
            reasons.add('SOURCE_PARTIAL');
    }
    const dayStart = Date.parse(date + 'T00:00:00+08:00');
    const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(dayStart + OFFSET).getUTCDay()];
    const limits = policy.dailyMinutes[weekday], wc = w?.categoriesSeconds ?? {}, ac = a?.categoriesSeconds ?? {};
    const appComposite = (ac.composite ?? 0) + (ac.unclassified ?? 0), webComposite = wc.composite ?? 0;
    const available = limits.composite === null ? Infinity : Math.max(0, limits.composite * 60 - webComposite);
    const borrowedRestSeconds = allowApplicationBorrowing ? Math.max(0, appComposite - available) : 0;
    const usedSeconds = { study: (wc.study ?? 0) + (ac.study ?? 0), composite: webComposite + appComposite - borrowedRestSeconds,
        rest: (wc.rest ?? 0) + (ac.restrictedEntertainment ?? 0) + borrowedRestSeconds };
    if (!Object.values(usedSeconds).every(integer) || !integer(borrowedRestSeconds))
        fail();
    const remainingSeconds = Object.fromEntries(['study', 'composite', 'rest'].map(k => [k, reasons.size || limits[k] === null ? null : Math.max(0, limits[k] * 60 - usedSeconds[k])]));
    return { date, complete: reasons.size === 0, reasonCodes: [...reasons].sort(), usedSeconds, remainingSeconds, borrowedRestSeconds };
}

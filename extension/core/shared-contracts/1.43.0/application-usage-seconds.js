/** 应用权威秒统计的只读传输；不生成统计、重分类或计算配额。 */
import { parseApplicationUsageSeconds } from './usage-account.js';
export const APPLICATION_USAGE_SECONDS_READ_CAPABILITY = 'application-usage-seconds-read-v1';
export const APPLICATION_USAGE_SECONDS_PAGE_SIZE = 100;
export const APPLICATION_USAGE_SECONDS_MAX_OFFSET = 20_000;
export const APPLICATION_USAGE_SECONDS_REVISION_PATTERN = '^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$';
/** 与旧名称/分类快照分开协商；产品不可用不改变基础统计。 */
export const APPLICATION_IDENTITY_USAGE_READ_CAPABILITY = 'application-identity-usage-read-v1';
export function validateApplicationIdentityUsageQuery(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('APPLICATION_USAGE_SECONDS_INVALID_QUERY');
    const { view, ...query } = value;
    if (view !== undefined && view !== 'base' && view !== 'product')
        throw new Error('APPLICATION_USAGE_SECONDS_INVALID_QUERY');
    validateApplicationUsageSecondsQuery(query);
    return value;
}
const revisionPattern = new RegExp(APPLICATION_USAGE_SECONDS_REVISION_PATTERN);
function dateMs(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return NaN;
    const n = Date.parse(value + 'T00:00:00+08:00');
    return Number.isFinite(n) && new Date(n + 28_800_000).toISOString().slice(0, 10) === value ? n : NaN;
}
/** 请求不能自报Child/User/来源，也不能跳过后续页的冻结revision。 */
export function validateApplicationUsageSecondsQuery(value) {
    const fail = () => { throw new Error('APPLICATION_USAGE_SECONDS_INVALID_QUERY'); };
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return fail();
    const q = value;
    if (Object.keys(q).some(k => !['fromDate', 'toDate', 'offset', 'expectedRevision'].includes(k)))
        return fail();
    const start = dateMs(q.fromDate), end = dateMs(q.toDate);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end - start > 6 * 86_400_000
        || !Number.isSafeInteger(q.offset) || Number(q.offset) < 0 || Number(q.offset) > APPLICATION_USAGE_SECONDS_MAX_OFFSET
        || (q.expectedRevision !== undefined && (typeof q.expectedRevision !== 'string' || !revisionPattern.test(q.expectedRevision)))
        || (Number(q.offset) > 0 && q.expectedRevision === undefined))
        return fail();
    return value;
}
const categories = new Set(['study', 'composite', 'restrictedEntertainment', 'unclassified', 'other', 'blocked', 'historicalUnknown']);
const invalidSnapshot = () => { throw new Error('APPLICATION_USAGE_SECONDS_INVALID_SNAPSHOT'); };
function object(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return invalidSnapshot();
    const obj = value;
    if (Object.keys(obj).length !== keys.length || keys.some(k => !Object.hasOwn(obj, k)))
        return invalidSnapshot();
    return obj;
}
function integer(value, max = Number.MAX_SAFE_INTEGER) {
    if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > max)
        return invalidSnapshot();
    return value;
}
function nullableInteger(value, max = Number.MAX_SAFE_INTEGER) {
    return value === null ? null : integer(value, max);
}
function text(value, max) {
    if (typeof value !== 'string' || !value.length || value.length > max || /[\u0000-\u001f\u007f]/.test(value))
        return invalidSnapshot();
    return value;
}
function reasons(value) {
    if (!Array.isArray(value) || value.length > 32 || new Set(value).size !== value.length
        || value.some(v => typeof v !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(v)))
        invalidSnapshot();
}
function categoryMap(value, max) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return invalidSnapshot();
    const map = value;
    for (const [key, n] of Object.entries(map)) {
        if (!categories.has(key))
            invalidSnapshot();
        integer(n, max);
    }
    return map;
}
function mapsEqual(a, b) {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].every(k => (a[k] ?? 0) === (b[k] ?? 0));
}
/** 校验只读页面的范围、完整性、自己的日小时守恒与分页；不重算来源统计。 */
export function validateApplicationUsageSecondsSnapshot(value, query) {
    validateApplicationUsageSecondsQuery(query);
    const p = object(value, ['schemaVersion', 'durationUnit', 'fromDate', 'toDate', 'revision', 'computedAtMs', 'lastSettledAtMs',
        'complete', 'reasonCodes', 'totalSeconds', 'knownTotalSeconds', 'knownCategoriesSeconds', 'days', 'applications', 'nextOffset']);
    if (p.schemaVersion !== 2 || p.durationUnit !== 'seconds' || p.fromDate !== query.fromDate || p.toDate !== query.toDate
        || typeof p.complete !== 'boolean' || !revisionPattern.test(text(p.revision, 160))
        || (query.expectedRevision !== undefined && p.revision !== query.expectedRevision))
        return invalidSnapshot();
    nullableInteger(p.computedAtMs);
    nullableInteger(p.lastSettledAtMs);
    reasons(p.reasonCodes);
    const count = (dateMs(query.toDate) - dateMs(query.fromDate)) / 86_400_000 + 1;
    if (!Array.isArray(p.days) || p.days.length !== count || !Array.isArray(p.applications)
        || p.applications.length > APPLICATION_USAGE_SECONDS_PAGE_SIZE)
        return invalidSnapshot();
    const dayTotals = new Map();
    const dayComplete = new Map();
    const categoryTotals = {};
    let known = 0, computed = null, settled = null, complete = true;
    for (let index = 0; index < p.days.length; index++) {
        const d = object(p.days[index], ['date', 'status', 'generatedAtMs', 'settledThroughMs', 'complete', 'reasonCodes', 'totalSeconds', 'categoriesSeconds', 'hours']);
        const date = new Date(dateMs(query.fromDate) + index * 86_400_000 + 28_800_000).toISOString().slice(0, 10);
        if (d.date !== date || !['available', 'pending_update', 'incomplete', 'unknown'].includes(String(d.status))
            || typeof d.complete !== 'boolean' || !Array.isArray(d.hours))
            return invalidSnapshot();
        const total = nullableInteger(d.totalSeconds, 86_400), generated = nullableInteger(d.generatedAtMs), cutoff = nullableInteger(d.settledThroughMs);
        reasons(d.reasonCodes);
        const daily = categoryMap(d.categoriesSeconds, total ?? 0);
        if ((d.status === 'unknown' && (total !== null || d.complete || d.hours.length || generated !== null || cutoff !== null))
            || (d.status !== 'unknown' && (total === null || generated === null || d.hours.length !== 24))
            || (d.status === 'available' && !d.complete) || (d.status === 'incomplete' && d.complete)
            || (cutoff !== null && (generated === null || cutoff > generated)))
            return invalidSnapshot();
        let hourlyTotal = 0;
        const hourlyCategories = {};
        for (let hour = 0; hour < d.hours.length; hour++) {
            const h = object(d.hours[hour], ['hour', 'totalSeconds', 'categoriesSeconds']);
            if (h.hour !== hour)
                return invalidSnapshot();
            hourlyTotal += integer(h.totalSeconds, 3600);
            // 独立维度的小时量化不要求分类小于此小时总量。
            for (const [key, n] of Object.entries(categoryMap(h.categoriesSeconds, 3600)))
                hourlyCategories[key] = (hourlyCategories[key] ?? 0) + n;
        }
        if (total !== null && (total !== hourlyTotal || !mapsEqual(daily, hourlyCategories)))
            return invalidSnapshot();
        for (const [key, n] of Object.entries(daily))
            categoryTotals[key] = (categoryTotals[key] ?? 0) + n;
        if (total !== null)
            known += total;
        if (generated !== null)
            computed = Math.max(computed ?? 0, generated);
        if (cutoff !== null)
            settled = Math.max(settled ?? 0, cutoff);
        complete = complete && d.complete;
        dayTotals.set(date, total);
        dayComplete.set(date, d.complete);
    }
    if (p.complete !== complete || p.knownTotalSeconds !== known || p.totalSeconds !== (complete ? known : null)
        || p.computedAtMs !== computed || p.lastSettledAtMs !== settled
        || !mapsEqual(categoryMap(p.knownCategoriesSeconds, count * 86_400), categoryTotals))
        return invalidSnapshot();
    const keys = new Set();
    for (const raw of p.applications) {
        const app = object(raw, ['key', 'name', 'classifications', 'totalSeconds', 'knownTotalSeconds', 'dailySeconds']);
        const key = text(app.key, 128);
        text(app.name, 160);
        if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(key) || keys.has(key))
            return invalidSnapshot();
        keys.add(key);
        if (!Array.isArray(app.classifications) || !app.classifications.length || app.classifications.length > categories.size
            || new Set(app.classifications).size !== app.classifications.length || app.classifications.some(c => !categories.has(c)))
            return invalidSnapshot();
        const daily = object(app.dailySeconds, [...dayTotals.keys()]);
        let subtotal = 0;
        for (const [date, n] of Object.entries(daily)) {
            const seconds = nullableInteger(n, dayTotals.get(date) ?? 0);
            if (seconds === null && dayComplete.get(date))
                return invalidSnapshot();
            if (seconds !== null)
                subtotal += seconds;
        }
        if (app.knownTotalSeconds !== subtotal || app.totalSeconds !== (complete ? subtotal : null))
            return invalidSnapshot();
    }
    if (p.nextOffset !== null && (integer(p.nextOffset, APPLICATION_USAGE_SECONDS_MAX_OFFSET) !== query.offset + APPLICATION_USAGE_SECONDS_PAGE_SIZE
        || p.applications.length !== APPLICATION_USAGE_SECONDS_PAGE_SIZE))
        return invalidSnapshot();
    return value;
}
/** 校验来源各自的维度与分页，不以产品识别结果判定基础时长有效。 */
export function validateApplicationIdentityUsageSnapshot(value, query) {
    validateApplicationIdentityUsageQuery(query);
    const p = object(value, ['schemaVersion', 'durationUnit', 'timezone', 'fromDate', 'toDate', 'view', 'revision', 'base', 'product', 'subjects', 'nextOffset']);
    if (p.schemaVersion !== 3 || p.durationUnit !== 'seconds' || p.timezone !== 'Asia/Shanghai' || p.view !== (query.view ?? 'base')
        || p.fromDate !== query.fromDate || p.toDate !== query.toDate || !revisionPattern.test(text(p.revision, 160))
        || query.expectedRevision !== undefined && p.revision !== query.expectedRevision)
        return invalidSnapshot();
    const base = object(p.base, ['complete', 'reasonCodes', 'computedAtMs', 'lastSettledAtMs', 'totalSeconds', 'knownTotalSeconds', 'days']);
    reasons(base.reasonCodes);
    const count = (dateMs(query.toDate) - dateMs(query.fromDate)) / 86400000 + 1;
    if (!Array.isArray(base.days) || base.days.length !== count)
        return invalidSnapshot();
    const totals = new Map(), hashes = new Map(), productTotals = new Map();
    let productsComplete = true;
    let known = 0, complete = true, generated = null, settled = null;
    const hash = (v) => { if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v))
        invalidSnapshot(); return v; };
    for (let index = 0; index < count; index++) {
        const d = object(base.days[index], ['date', 'status', 'baseRevision', 'manifestHash', 'generatedAtMs', 'settledThroughMs', 'complete', 'reasonCodes', 'totalSeconds', 'hours']);
        const date = new Date(dateMs(query.fromDate) + index * 86400000 + 28800000).toISOString().slice(0, 10);
        if (d.date !== date || typeof d.complete !== 'boolean' || !['available', 'pending_update', 'incomplete', 'unknown'].includes(String(d.status)) || !Array.isArray(d.hours))
            return invalidSnapshot();
        reasons(d.reasonCodes);
        const total = nullableInteger(d.totalSeconds, 86400), at = nullableInteger(d.generatedAtMs), cutoff = nullableInteger(d.settledThroughMs);
        if (d.status === 'unknown') {
            if (total !== null || at !== null || cutoff !== null || d.baseRevision !== null || d.manifestHash !== null || d.complete || d.hours.length)
                return invalidSnapshot();
        }
        else {
            if (total === null || at === null || integer(d.baseRevision) < 1 || d.hours.length !== 24)
                return invalidSnapshot();
            hash(d.manifestHash);
            if (d.status === 'available' && !d.complete || d.status === 'incomplete' && d.complete)
                return invalidSnapshot();
            let sum = 0;
            for (let hour = 0; hour < 24; hour++) {
                const h = object(d.hours[hour], ['hour', 'totalSeconds']);
                if (h.hour !== hour)
                    return invalidSnapshot();
                sum += integer(h.totalSeconds, 3600);
            }
            if (sum !== total)
                return invalidSnapshot();
        }
        if (cutoff !== null && (at === null || cutoff > at))
            return invalidSnapshot();
        totals.set(date, total);
        hashes.set(date, d.manifestHash);
        known += total ?? 0;
        complete = complete && d.complete;
        if (at !== null)
            generated = Math.max(generated ?? 0, at);
        if (cutoff !== null)
            settled = Math.max(settled ?? 0, cutoff);
    }
    if (base.complete !== complete || base.knownTotalSeconds !== known || base.totalSeconds !== (complete ? known : null)
        || base.computedAtMs !== generated || base.lastSettledAtMs !== settled)
        return invalidSnapshot();
    if (p.view === 'base') {
        if (p.product !== null)
            return invalidSnapshot();
    }
    else {
        const product = object(p.product, ['days']);
        if (!Array.isArray(product.days) || product.days.length !== count)
            return invalidSnapshot();
        for (let index = 0; index < count; index++) {
            const d = object(product.days[index], ['date', 'status', 'baseManifestHash', 'projectionHash', 'revision', 'catalogVersion', 'complete', 'reasonCodes', 'categoriesSeconds', 'hours', 'applicationUsage']);
            const date = [...totals.keys()][index], total = totals.get(date);
            if (d.date !== date || typeof d.complete !== 'boolean' || !['available', 'stale', 'missing', 'unavailable'].includes(String(d.status)))
                return invalidSnapshot();
            reasons(d.reasonCodes);
            const cats = categoryMap(d.categoriesSeconds, total ?? 0);
            if (!Array.isArray(d.hours))
                return invalidSnapshot();
            productsComplete = productsComplete && d.status === 'available' && d.complete;
            if (d.status === 'missing' || d.status === 'unavailable') {
                if (d.complete || d.projectionHash !== null || d.revision !== null || d.catalogVersion !== null || d.applicationUsage !== null || Object.keys(cats).length || d.hours.length)
                    return invalidSnapshot();
                if (d.baseManifestHash !== hashes.get(date))
                    return invalidSnapshot();
                productTotals.set(date, null);
            }
            else {
                if (total === null || d.baseManifestHash !== hashes.get(date) || integer(d.revision) < 1)
                    return invalidSnapshot();
                hash(d.projectionHash);
                integer(d.catalogVersion);
                if (d.hours.length !== 24)
                    return invalidSnapshot();
                const hourly = {};
                for (let hour = 0; hour < 24; hour++) {
                    const h = object(d.hours[hour], ['hour', 'categoriesSeconds']);
                    if (h.hour !== hour)
                        return invalidSnapshot();
                    for (const [category, amount] of Object.entries(categoryMap(h.categoriesSeconds, 3600)))
                        hourly[category] = (hourly[category] ?? 0) + amount;
                }
                if (!mapsEqual(cats, hourly))
                    return invalidSnapshot();
                const usage = parseApplicationUsageSeconds(d.applicationUsage);
                if (usage.nonSpecialTotal + usage.specialTotal !== total || Object.keys(usage.nonSpecialCategories).some(c => !categories.has(c)) || d.complete && !usage.complete)
                    return invalidSnapshot();
                productTotals.set(date, total);
            }
        }
    }
    if (!Array.isArray(p.subjects) || p.subjects.length > 100)
        return invalidSnapshot();
    const keys = new Set();
    for (const raw of p.subjects) {
        const hasName = Boolean(raw && typeof raw === 'object' && Object.hasOwn(raw, 'name'));
        const row = object(raw, ['key', 'totalSeconds', 'knownTotalSeconds', 'dailySeconds', ...(hasName ? ['name'] : [])]);
        const key = text(row.key, 264), isProduct = /^product:[A-Za-z0-9._:-]{1,256}$/.test(key);
        if ((!/^(instance|observation):[a-f0-9]{64}$/.test(key) && !(p.view === 'product' && isProduct)) || keys.has(key))
            return invalidSnapshot();
        keys.add(key);
        if (hasName) {
            if (p.view !== 'product' || !isProduct)
                return invalidSnapshot();
            text(row.name, 256);
        }
        const daily = object(row.dailySeconds, [...totals.keys()]);
        let sum = 0, all = complete && (p.view === 'base' || productsComplete);
        for (const [date, n] of Object.entries(daily)) {
            const limit = (p.view === 'base' ? totals : productTotals).get(date) ?? null;
            if (limit === null) {
                if (n !== null)
                    return invalidSnapshot();
                all = false;
                continue;
            }
            if (n === null)
                return invalidSnapshot();
            sum += integer(n, limit);
        }
        if (row.knownTotalSeconds !== sum || row.totalSeconds !== (all ? sum : null))
            return invalidSnapshot();
    }
    if (p.nextOffset !== null && (integer(p.nextOffset, APPLICATION_USAGE_SECONDS_MAX_OFFSET) !== query.offset + 100 || p.subjects.length !== 100))
        return invalidSnapshot();
    return value;
}

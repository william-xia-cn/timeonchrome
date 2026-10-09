/** 版本化派生统计；不负责生成 Segment、重新分类或计算区间并集。 */
export const USAGE_ACCOUNT_CHUNK_ROWS = 100;
export const USAGE_ACCOUNT_MAX_ROWS = 10_000;
export const APPLICATION_STATISTICS_CHILD_SCOPE_CAPABILITY = 'application-statistics-child-scope-v1';
export const APPLICATION_INSTANCE_STATISTICS_CAPABILITY = 'application-instance-statistics-v1';
const manifestFields = ['schemaVersion', 'sourceKind', 'durationUnit', 'timezone', 'date', 'revision',
    'generatedAtMs', 'settledThroughMs', 'algorithmVersion', 'policyVersions', 'associationVersion',
    'correctionVersion', 'rawFactCount', 'rawFactHash', 'rowCount', 'chunkCount', 'rowsHash', 'complete', 'reasonCodes', 'manifestHash'];
const rowFields = ['kind', 'hour', 'category', 'subjectKey', 'displayName', 'duration'];
const hashPattern = /^[a-f0-9]{64}$/;
const codePattern = /^[A-Z][A-Z0-9_]{0,63}$/;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;
export class UsageAccountError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
    }
}
function fail(code) { throw new UsageAccountError(code); }
function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value, fields) {
    if (!record(value) || Object.keys(value).length !== fields.length
        || fields.some(key => !Object.hasOwn(value, key)))
        fail('USAGE_ACCOUNT_INVALID_FIELDS');
    return value;
}
function integer(value, min = 0) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
}
function orderedUnique(values, valid) {
    return values.every((value, i) => valid(value) && (i === 0 || String(values[i - 1]) < String(value)));
}
function identifier(value) {
    return typeof value === 'string' && identifierPattern.test(value);
}
/** 先校验回执格式；调用者仍须匹配在途manifestId/revision/hash。 */
export function parseUsageAccountReceipt(value) {
    if (!record(value) || typeof value.manifestId !== 'string' || !/^aa1_[a-f0-9]{64}$/.test(value.manifestId)
        || !integer(value.revision, 1) || typeof value.manifestHash !== 'string' || !hashPattern.test(value.manifestHash)
        || typeof value.received !== 'boolean' || typeof value.published !== 'boolean'
        || typeof value.publishStatus !== 'string'
        || !['pending', 'received_not_published', 'published'].includes(value.publishStatus))
        fail('USAGE_ACCOUNT_INVALID_RECEIPT');
    if ((value.publishStatus === 'pending' && (value.received || value.published))
        || (value.publishStatus === 'received_not_published' && (!value.received || value.published))
        || (value.publishStatus === 'published' && (!value.received || !value.published)))
        fail('USAGE_ACCOUNT_INVALID_RECEIPT_STATE');
    const result = { manifestId: value.manifestId, revision: value.revision,
        manifestHash: value.manifestHash, received: value.received, published: value.published,
        publishStatus: value.publishStatus };
    if (Object.hasOwn(value, 'publicationErrorCode')) {
        if (value.publicationErrorCode !== null && (typeof value.publicationErrorCode !== 'string'
            || !codePattern.test(value.publicationErrorCode)))
            fail('USAGE_ACCOUNT_INVALID_PUBLICATION_ERROR');
        result.publicationErrorCode = value.publicationErrorCode;
    }
    return result;
}
export function usageAccountDayStart(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        fail('USAGE_ACCOUNT_INVALID_DATE');
    const start = Date.parse(`${date}T00:00:00+08:00`);
    if (!Number.isFinite(start) || start < 0 || new Date(start + 28_800_000).toISOString().slice(0, 10) !== date)
        fail('USAGE_ACCOUNT_INVALID_DATE');
    return start;
}
export function canonicalUsageAccountJson(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value))
        return JSON.stringify(value);
    if (Array.isArray(value))
        return '[' + value.map(canonicalUsageAccountJson).join(',') + ']';
    if (record(value))
        return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalUsageAccountJson(value[key])).join(',') + '}';
    return fail('USAGE_ACCOUNT_NON_JSON_VALUE');
}
export async function hashUsageAccountValue(value) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalUsageAccountJson(value)));
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function parseUsageAccountManifest(value) {
    const v = exact(value, record(value) && Object.hasOwn(value, 'applicationUsage')
        ? [...manifestFields, 'applicationUsage'] : manifestFields);
    if (v.schemaVersion !== 1 || v.timezone !== 'Asia/Shanghai'
        || (v.sourceKind !== 'application' && v.sourceKind !== 'web' && v.sourceKind !== 'webMedia')
        || v.durationUnit !== (v.sourceKind === 'application' ? 'milliseconds' : 'seconds'))
        fail('USAGE_ACCOUNT_INVALID_SCHEMA');
    if (typeof v.date !== 'string')
        fail('USAGE_ACCOUNT_INVALID_DATE');
    const dayStart = usageAccountDayStart(v.date);
    if (!integer(v.revision, 1) || !integer(v.generatedAtMs, dayStart) || !integer(v.correctionVersion)
        || !integer(v.rawFactCount) || !integer(v.rowCount, 25) || v.rowCount > USAGE_ACCOUNT_MAX_ROWS
        || !integer(v.chunkCount, 1) || v.chunkCount !== Math.ceil(v.rowCount / USAGE_ACCOUNT_CHUNK_ROWS))
        fail('USAGE_ACCOUNT_INVALID_VERSION');
    if (v.settledThroughMs !== null && (!integer(v.settledThroughMs, dayStart)
        || v.settledThroughMs > dayStart + 86_400_000 || v.settledThroughMs > v.generatedAtMs))
        fail('USAGE_ACCOUNT_INVALID_CUTOFF');
    if (!identifier(v.algorithmVersion) || !(v.associationVersion === null || identifier(v.associationVersion)))
        fail('USAGE_ACCOUNT_INVALID_PROJECTION');
    const policyVersions = v.policyVersions;
    if (!Array.isArray(policyVersions) || policyVersions.length > 512
        || !policyVersions.every((item, i) => integer(item) && (i === 0 || Number(policyVersions[i - 1]) < item)))
        fail('USAGE_ACCOUNT_INVALID_POLICY_VERSIONS');
    for (const field of ['rawFactHash', 'rowsHash', 'manifestHash']) {
        if (typeof v[field] !== 'string' || !hashPattern.test(v[field]))
            fail('USAGE_ACCOUNT_INVALID_HASH');
    }
    if (typeof v.complete !== 'boolean' || !Array.isArray(v.reasonCodes) || v.reasonCodes.length > 16
        || !orderedUnique(v.reasonCodes, item => typeof item === 'string' && codePattern.test(item))
        || (v.complete && (v.reasonCodes.length > 0 || v.settledThroughMs === null))
        || (!v.complete && v.reasonCodes.length === 0))
        fail('USAGE_ACCOUNT_INVALID_COMPLETENESS');
    const result = {
        schemaVersion: 1, sourceKind: v.sourceKind, durationUnit: v.sourceKind === 'application' ? 'milliseconds' : 'seconds', timezone: 'Asia/Shanghai',
        date: v.date, revision: v.revision, generatedAtMs: v.generatedAtMs,
        settledThroughMs: v.settledThroughMs === null ? null : Number(v.settledThroughMs),
        algorithmVersion: v.algorithmVersion, policyVersions: policyVersions.map(Number),
        associationVersion: v.associationVersion, correctionVersion: v.correctionVersion,
        rawFactCount: v.rawFactCount, rawFactHash: String(v.rawFactHash), rowCount: v.rowCount,
        chunkCount: v.chunkCount, rowsHash: String(v.rowsHash), complete: v.complete,
        reasonCodes: v.reasonCodes.map(String), manifestHash: String(v.manifestHash),
    };
    if (Object.hasOwn(v, 'applicationUsage')) {
        if (v.sourceKind !== 'application')
            fail('USAGE_ACCOUNT_INVALID_APPLICATION_USAGE');
        result.applicationUsage = parseApplicationUsageProjection(v.applicationUsage);
    }
    return result;
}
export function parseApplicationUsageProjection(value) {
    const v = exact(value, ['nonSpecialTotalMs', 'nonSpecialCategoryMs', 'specialTotalMs', 'complete', 'reasonCodes']);
    if (!integer(v.nonSpecialTotalMs) || v.nonSpecialTotalMs > 86_400_000
        || !integer(v.specialTotalMs) || v.specialTotalMs > 86_400_000
        || !record(v.nonSpecialCategoryMs) || Object.keys(v.nonSpecialCategoryMs).length > 16
        || Object.entries(v.nonSpecialCategoryMs).some(([category, duration]) => !identifier(category) || !integer(duration) || duration > Number(v.nonSpecialTotalMs))
        || typeof v.complete !== 'boolean' || !Array.isArray(v.reasonCodes) || v.reasonCodes.length > 16
        || !orderedUnique(v.reasonCodes, code => typeof code === 'string' && codePattern.test(code))
        || (v.complete ? v.reasonCodes.length !== 0 : v.reasonCodes.length === 0))
        fail('USAGE_ACCOUNT_INVALID_APPLICATION_USAGE');
    return { nonSpecialTotalMs: v.nonSpecialTotalMs, nonSpecialCategoryMs: { ...v.nonSpecialCategoryMs },
        specialTotalMs: v.specialTotalMs, complete: v.complete, reasonCodes: v.reasonCodes.map(String) };
}
export async function verifyUsageAccountManifest(value) {
    const manifest = parseUsageAccountManifest(value);
    const { manifestHash, ...body } = manifest;
    if (await hashUsageAccountValue(body) !== manifestHash)
        fail('USAGE_ACCOUNT_MANIFEST_HASH_MISMATCH');
    return manifest;
}
export function parseUsageAccountRows(value, maximum = USAGE_ACCOUNT_MAX_ROWS) {
    if (!Array.isArray(value) || value.length > maximum)
        fail('USAGE_ACCOUNT_INVALID_ROWS');
    const identities = new Set();
    let previous = '';
    return value.map(item => {
        const v = exact(item, rowFields);
        if ((v.kind !== 'total' && v.kind !== 'category' && v.kind !== 'subject')
            || !(v.hour === null || integer(v.hour) && v.hour < 24) || !integer(v.duration))
            fail('USAGE_ACCOUNT_INVALID_ROW');
        if (v.kind === 'category' ? !identifier(v.category) : v.category !== null)
            fail('USAGE_ACCOUNT_INVALID_CATEGORY');
        if (v.kind === 'subject') {
            if (!identifier(v.subjectKey) || typeof v.displayName !== 'string' || v.displayName.length < 1
                || v.displayName.length > 128 || /[\x00-\x1f\x7f\\/@]/.test(v.displayName))
                fail('USAGE_ACCOUNT_INVALID_SUBJECT');
        }
        else if (v.subjectKey !== null || v.displayName !== null)
            fail('USAGE_ACCOUNT_INVALID_SUBJECT');
        const row = { kind: v.kind, hour: v.hour === null ? null : Number(v.hour),
            category: v.category === null ? null : String(v.category), subjectKey: v.subjectKey === null ? null : String(v.subjectKey),
            displayName: v.displayName === null ? null : String(v.displayName), duration: v.duration };
        const identity = canonicalUsageAccountJson([row.kind, row.hour, row.category, row.subjectKey]);
        if (identities.has(identity))
            fail('USAGE_ACCOUNT_DUPLICATE_ROW');
        identities.add(identity);
        const canonical = canonicalUsageAccountJson(row);
        if (canonical < previous)
            fail('USAGE_ACCOUNT_ROWS_NOT_SORTED');
        previous = canonical;
        return row;
    });
}
export function validateUsageAccountDimensions(rows) {
    return validateDimensions(rows, false);
}
/** 日内独立定秒的各维度自身守恒；小时分配不要求跨维度父子上界。 */
export function validateUsageAccountDimensionsV2(rows) {
    parseUsageAccountRowsV2(rows);
    return validateDimensions(rows, true);
}
function validateDimensions(rows, independentHourlySeconds) {
    // 日／小时在各自维度守恒；跨应用／分类的重叠不能被简单加总。
    const groups = new Map();
    for (const row of rows) {
        const key = canonicalUsageAccountJson([row.kind, row.category, row.subjectKey]);
        const group = groups.get(key) ?? { hourly: 0, hours: new Set(), label: row.displayName };
        if (group.label !== row.displayName)
            fail('USAGE_ACCOUNT_SUBJECT_LABEL_CONFLICT');
        if (row.hour === null) {
            if (group.daily !== undefined)
                fail('USAGE_ACCOUNT_DUPLICATE_ROW');
            group.daily = row.duration;
        }
        else {
            if (group.hours.has(row.hour))
                fail('USAGE_ACCOUNT_DUPLICATE_ROW');
            group.hours.add(row.hour);
            group.hourly += row.duration;
            if (!Number.isSafeInteger(group.hourly))
                fail('USAGE_ACCOUNT_DURATION_OVERFLOW');
        }
        groups.set(key, group);
    }
    const total = groups.get(canonicalUsageAccountJson(['total', null, null]));
    if (!total || total.hours.size !== 24 || total.daily === undefined)
        fail('USAGE_ACCOUNT_MISSING_TOTAL');
    for (const group of groups.values()) {
        if (group.daily !== group.hourly)
            fail('USAGE_ACCOUNT_DIMENSION_MISMATCH');
        if (group.hourly > total.hourly)
            fail('USAGE_ACCOUNT_DIMENSION_EXCEEDS_TOTAL');
    }
    const hourlyTotals = new Map(rows.filter(r => r.kind === 'total' && r.hour !== null).map(r => [r.hour, r.duration]));
    for (const row of rows) {
        if (!independentHourlySeconds && row.hour !== null && row.duration > (hourlyTotals.get(row.hour) ?? 0))
            fail('USAGE_ACCOUNT_HOUR_EXCEEDS_TOTAL');
    }
    return { total: total.daily };
}
export async function createUsageAccount(header, inputRows) {
    const rows = [...inputRows].sort((a, b) => {
        const left = canonicalUsageAccountJson(a), right = canonicalUsageAccountJson(b);
        return left < right ? -1 : left > right ? 1 : 0;
    });
    parseUsageAccountRows(rows);
    validateUsageAccountDimensions(rows);
    const base = { ...header, rowCount: rows.length, chunkCount: Math.ceil(rows.length / USAGE_ACCOUNT_CHUNK_ROWS),
        rowsHash: await hashUsageAccountValue(rows) };
    const manifest = await verifyUsageAccountManifest({ ...base, manifestHash: await hashUsageAccountValue(base) });
    const chunks = [];
    for (let i = 0; i < rows.length; i += USAGE_ACCOUNT_CHUNK_ROWS) {
        const chunkRows = rows.slice(i, i + USAGE_ACCOUNT_CHUNK_ROWS);
        chunks.push({ chunkIndex: chunks.length, rows: chunkRows, chunkHash: await hashUsageAccountValue(chunkRows) });
    }
    return { manifest, rows, chunks };
}
/** v2不隐式接受v1毫秒数据；兼容适配必须由调用者显式完成。 */
export function parseUsageAccountManifestV2(value) {
    const optional = ['applicationUsage', 'childId'].filter(key => record(value) && Object.hasOwn(value, key));
    const v = exact(value, [...manifestFields, ...optional]);
    if (v.schemaVersion !== 2 || v.durationUnit !== 'seconds')
        fail('USAGE_ACCOUNT_INVALID_SCHEMA');
    const { applicationUsage, childId, ...header } = v;
    // 复用原有非用量字段校验，不转换或重算时长，不复用v1哈希。
    const checked = parseUsageAccountManifest({ ...header, schemaVersion: 1,
        durationUnit: v.sourceKind === 'application' ? 'milliseconds' : 'seconds' });
    const { applicationUsage: _legacyUsage, ...checkedHeader } = checked;
    const result = { ...checkedHeader, schemaVersion: 2, durationUnit: 'seconds' };
    if (Object.hasOwn(v, 'childId')) {
        if (v.sourceKind !== 'application' || !identifier(childId))
            fail('USAGE_ACCOUNT_INVALID_CHILD_SCOPE');
        result.childId = childId;
    }
    if (Object.hasOwn(v, 'applicationUsage')) {
        if (v.sourceKind !== 'application')
            fail('USAGE_ACCOUNT_INVALID_APPLICATION_USAGE');
        result.applicationUsage = parseApplicationUsageSeconds(applicationUsage);
    }
    return result;
}
export function parseApplicationUsageSeconds(value) {
    const v = exact(value, ['nonSpecialTotal', 'nonSpecialCategories', 'specialTotal', 'complete', 'reasonCodes']);
    if (!integer(v.nonSpecialTotal) || v.nonSpecialTotal > 86400
        || !integer(v.specialTotal) || v.specialTotal > 86400
        || !record(v.nonSpecialCategories) || Object.keys(v.nonSpecialCategories).length > 16
        || Object.entries(v.nonSpecialCategories).some(([category, duration]) => !identifier(category) || !integer(duration) || duration > Number(v.nonSpecialTotal))
        || typeof v.complete !== 'boolean' || !Array.isArray(v.reasonCodes) || v.reasonCodes.length > 16
        || !orderedUnique(v.reasonCodes, code => typeof code === 'string' && codePattern.test(code))
        || (v.complete ? v.reasonCodes.length !== 0 : v.reasonCodes.length === 0))
        fail('USAGE_ACCOUNT_INVALID_APPLICATION_USAGE');
    return { nonSpecialTotal: v.nonSpecialTotal, nonSpecialCategories: { ...v.nonSpecialCategories },
        specialTotal: v.specialTotal, complete: v.complete, reasonCodes: v.reasonCodes.map(String) };
}
export async function verifyUsageAccountManifestV2(value) {
    const manifest = parseUsageAccountManifestV2(value);
    const { manifestHash, ...header } = manifest;
    if (await hashUsageAccountValue(header) !== manifestHash)
        fail('USAGE_ACCOUNT_MANIFEST_HASH_MISMATCH');
    return manifest;
}
export async function verifyApplicationAccountManifest(value) {
    return record(value) && value.schemaVersion === 2 ? verifyUsageAccountManifestV2(value) : verifyUsageAccountManifest(value);
}
export function parseUsageAccountRowsV2(value, maximum = USAGE_ACCOUNT_MAX_ROWS) {
    if (!Array.isArray(value) || value.length > maximum)
        fail('USAGE_ACCOUNT_INVALID_ROWS');
    const identities = new Set();
    const categories = new Set(['study', 'composite', 'restrictedEntertainment', 'unclassified', 'other', 'blocked', 'historicalUnknown']);
    let previous = '';
    return value.map(item => {
        const v = exact(item, record(item) && item.kind === 'subject' ? [...rowFields, 'classifications'] : rowFields);
        const { classifications, ...base } = v;
        const row = parseUsageAccountRows([base], 1)[0];
        if (row.duration > (row.hour === null ? 86400 : 3600))
            fail('USAGE_ACCOUNT_INVALID_ROW');
        if (row.kind === 'subject') {
            if (!Array.isArray(classifications) || classifications.length < 1 || classifications.length > categories.size
                || !orderedUnique(classifications, c => typeof c === 'string' && categories.has(c)))
                fail('USAGE_ACCOUNT_INVALID_SUBJECT_CLASSIFICATIONS');
            row.classifications = classifications.map(String);
        }
        const identity = canonicalUsageAccountJson([row.kind, row.hour, row.category, row.subjectKey]);
        if (identities.has(identity))
            fail('USAGE_ACCOUNT_DUPLICATE_ROW');
        identities.add(identity);
        const canonical = canonicalUsageAccountJson(row);
        if (canonical < previous)
            fail('USAGE_ACCOUNT_ROWS_NOT_SORTED');
        previous = canonical;
        return row;
    });
}
export function parseApplicationAccountRows(value, schemaVersion, maximum = USAGE_ACCOUNT_MAX_ROWS) {
    return schemaVersion === 2 ? parseUsageAccountRowsV2(value, maximum) : parseUsageAccountRows(value, maximum);
}
export async function createUsageAccountV2(header, inputRows) {
    const rows = [...inputRows].sort((a, b) => {
        const left = canonicalUsageAccountJson(a), right = canonicalUsageAccountJson(b);
        return left < right ? -1 : left > right ? 1 : 0;
    });
    validateUsageAccountDimensionsV2(rows);
    if (rows.some(row => row.duration > (row.hour === null ? 86400 : 3600)))
        fail('USAGE_ACCOUNT_INVALID_ROW');
    const base = { ...header, rowCount: rows.length, chunkCount: Math.ceil(rows.length / USAGE_ACCOUNT_CHUNK_ROWS),
        rowsHash: await hashUsageAccountValue(rows) };
    const manifest = await verifyUsageAccountManifestV2({ ...base, manifestHash: await hashUsageAccountValue(base) });
    const chunks = [];
    for (let i = 0; i < rows.length; i += USAGE_ACCOUNT_CHUNK_ROWS) {
        const chunkRows = rows.slice(i, i + USAGE_ACCOUNT_CHUNK_ROWS);
        chunks.push({ chunkIndex: chunks.length, rows: chunkRows, chunkHash: await hashUsageAccountValue(chunkRows) });
    }
    return { manifest, rows, chunks };
}
export function parseApplicationInstanceAccountRows(value, maximum = USAGE_ACCOUNT_MAX_ROWS) {
    if (!Array.isArray(value) || value.length > maximum)
        fail('USAGE_ACCOUNT_INVALID_ROWS');
    let previous = '';
    const seen = new Set();
    return value.map(item => {
        const v = exact(item, ['kind', 'hour', 'subjectKey', 'duration']);
        if ((v.kind !== 'total' && v.kind !== 'subject') || !(v.hour === null || integer(v.hour) && v.hour < 24)
            || !integer(v.duration) || v.duration > (v.hour === null ? 86400 : 3600))
            fail('USAGE_ACCOUNT_INVALID_ROW');
        if (v.kind === 'subject' ? typeof v.subjectKey !== 'string' || !/^(instance|observation):[a-f0-9]{64}$/.test(v.subjectKey)
            : v.subjectKey !== null)
            fail('USAGE_ACCOUNT_INVALID_SUBJECT');
        const row = { kind: v.kind, hour: v.hour === null ? null : Number(v.hour),
            subjectKey: v.subjectKey === null ? null : String(v.subjectKey), duration: v.duration };
        const key = canonicalUsageAccountJson([row.kind, row.hour, row.subjectKey]), canonical = canonicalUsageAccountJson(row);
        if (seen.has(key))
            fail('USAGE_ACCOUNT_DUPLICATE_ROW');
        if (canonical < previous)
            fail('USAGE_ACCOUNT_ROWS_NOT_SORTED');
        seen.add(key);
        previous = canonical;
        return row;
    });
}
export function validateApplicationInstanceAccountDimensions(rows) {
    const checked = parseApplicationInstanceAccountRows(rows);
    // 仅复用数值维度守恒检查，不用占位显示名通过旧行解析或写入旧格式。
    return validateDimensions(checked.map(row => ({ ...row, category: null, displayName: null })), true);
}
export function parseApplicationInstanceAccountManifest(value) {
    const fields = manifestFields.filter(key => !['policyVersions', 'associationVersion', 'correctionVersion'].includes(key));
    const v = exact(value, [...fields, 'childId', 'observationResolutionHash']);
    if (v.schemaVersion !== 3 || v.sourceKind !== 'application' || v.durationUnit !== 'seconds' || !identifier(v.childId))
        fail('USAGE_ACCOUNT_INVALID_SCHEMA');
    if (typeof v.observationResolutionHash !== 'string' || !hashPattern.test(v.observationResolutionHash))
        fail('USAGE_ACCOUNT_INVALID_HASH');
    const { observationResolutionHash, ...header } = v;
    const validated = parseUsageAccountManifestV2({ ...header, schemaVersion: 2, policyVersions: [], associationVersion: null, correctionVersion: 0 });
    const { policyVersions: _policies, associationVersion: _association, correctionVersion: _correction, applicationUsage: _usage, ...base } = validated;
    return { ...base, schemaVersion: 3, sourceKind: 'application', childId: v.childId, observationResolutionHash };
}
export async function verifyApplicationInstanceAccountManifest(value) {
    const manifest = parseApplicationInstanceAccountManifest(value);
    const { manifestHash, ...body } = manifest;
    if (await hashUsageAccountValue(body) !== manifestHash)
        fail('USAGE_ACCOUNT_MANIFEST_HASH_MISMATCH');
    return manifest;
}
export async function createApplicationInstanceAccount(header, inputRows) {
    const rows = parseApplicationInstanceAccountRows([...inputRows].sort((a, b) => {
        const left = canonicalUsageAccountJson(a), right = canonicalUsageAccountJson(b);
        return left < right ? -1 : left > right ? 1 : 0;
    }));
    validateApplicationInstanceAccountDimensions(rows);
    const body = { ...header, rowCount: rows.length, chunkCount: Math.ceil(rows.length / USAGE_ACCOUNT_CHUNK_ROWS), rowsHash: await hashUsageAccountValue(rows) };
    const manifest = await verifyApplicationInstanceAccountManifest({ ...body, manifestHash: await hashUsageAccountValue(body) });
    const chunks = [];
    for (let i = 0; i < rows.length; i += USAGE_ACCOUNT_CHUNK_ROWS) {
        const chunkRows = rows.slice(i, i + USAGE_ACCOUNT_CHUNK_ROWS);
        chunks.push({ chunkIndex: chunks.length, rows: chunkRows, chunkHash: await hashUsageAccountValue(chunkRows) });
    }
    return { manifest, rows, chunks };
}
/** 网页既有秒分配规则；输入为已确定总量和已生成切片，不负责并集或原账结算。 */
export function allocateUsageAccountSeconds(slices, totalSeconds) {
    if (!integer(totalSeconds) || slices.length > USAGE_ACCOUNT_MAX_ROWS
        || slices.some(slice => !integer(slice.startMs) || !integer(slice.endMs, slice.startMs)))
        fail('USAGE_ACCOUNT_INVALID_SECOND_SLICES');
    const parts = slices.map((slice, index) => ({ index, startMs: slice.startMs,
        width: slice.endMs - slice.startMs, seconds: Math.floor((slice.endMs - slice.startMs) / 1000),
        remainder: (slice.endMs - slice.startMs) % 1000 }));
    const floorTotal = parts.reduce((sum, part) => sum + part.seconds, 0);
    let remaining = totalSeconds - floorTotal;
    if (!Number.isSafeInteger(floorTotal) || remaining < 0 || remaining > parts.filter(part => part.width > 0).length)
        fail('USAGE_ACCOUNT_INVALID_SECOND_TOTAL');
    const order = [...parts].sort((a, b) => b.remainder - a.remainder || a.startMs - b.startMs || a.index - b.index);
    for (const part of order) {
        if (remaining === 0)
            break;
        if (part.width === 0)
            continue;
        part.seconds++;
        remaining--;
    }
    if (remaining !== 0)
        fail('USAGE_ACCOUNT_INVALID_SECOND_TOTAL');
    return parts.map(part => part.seconds);
}
/** PUT正文即ApplicationProductStatisticsProjection；不修改基础上传队列或发布水位。 */
export const APPLICATION_PRODUCT_PROJECTION_UPLOAD_CAPABILITY = 'application-product-projection-upload-v1';
export const APPLICATION_PRODUCT_PROJECTION_MAX_BYTES = 1_048_576;
export function applicationProductProjectionUploadPath(manifestId) {
    if (typeof manifestId !== 'string' || !/^aa1_[a-f0-9]{64}$/.test(manifestId))
        fail('APPLICATION_PRODUCT_MANIFEST_ID_INVALID');
    return `/v2/machines/application-accounts/manifests/${manifestId}/product-projection`;
}
/** ACK须属于当前冻结的请求；单纯received不能确认另一个版本。 */
export function verifyApplicationProductProjectionReceipt(value, manifestId, expected) {
    applicationProductProjectionUploadPath(manifestId);
    const v = exact(value, ['manifestId', 'revision', 'projectionHash', 'received']);
    if (!integer(expected.revision, 1) || typeof expected.projectionHash !== 'string' || !hashPattern.test(expected.projectionHash)
        || v.manifestId !== manifestId || v.revision !== expected.revision || v.projectionHash !== expected.projectionHash
        || v.received !== true)
        fail('APPLICATION_PRODUCT_RECEIPT_MISMATCH');
    return { manifestId, revision: expected.revision, projectionHash: expected.projectionHash, received: true };
}
export function parseApplicationProductStatisticsProjection(value) {
    const v = exact(value, ['schemaVersion', 'baseManifestHash', 'revision', 'catalogVersion', 'generatedAtMs', 'complete',
        'reasonCodes', 'rows', 'applicationUsage', 'projectionHash']);
    if (v.schemaVersion !== 1 || typeof v.baseManifestHash !== 'string' || !hashPattern.test(v.baseManifestHash)
        || typeof v.projectionHash !== 'string' || !hashPattern.test(v.projectionHash) || !integer(v.revision, 1)
        || !integer(v.catalogVersion) || !integer(v.generatedAtMs) || typeof v.complete !== 'boolean'
        || !Array.isArray(v.reasonCodes) || v.reasonCodes.length > 16
        || !orderedUnique(v.reasonCodes, code => typeof code === 'string' && codePattern.test(code))
        || (v.complete ? v.reasonCodes.length !== 0 : v.reasonCodes.length === 0)
        || !Array.isArray(v.rows) || v.rows.length > USAGE_ACCOUNT_MAX_ROWS)
        fail('APPLICATION_PRODUCT_PROJECTION_INVALID');
    const categories = new Set(['study', 'composite', 'restrictedEntertainment', 'unclassified', 'other', 'blocked', 'historicalUnknown']);
    let previous = '';
    const seen = new Set();
    const rows = v.rows.map(item => {
        const r = exact(item, record(item) && item.kind === 'subject' ? ['kind', 'hour', 'category', 'subjectKey', 'duration', 'classifications'] :
            ['kind', 'hour', 'category', 'subjectKey', 'duration']);
        if ((r.kind !== 'category' && r.kind !== 'subject') || !(r.hour === null || integer(r.hour) && r.hour < 24)
            || !integer(r.duration) || r.duration > (r.hour === null ? 86400 : 3600))
            fail('APPLICATION_PRODUCT_PROJECTION_INVALID_ROW');
        if (r.kind === 'category') {
            if (typeof r.category !== 'string' || !categories.has(r.category) || r.subjectKey !== null)
                fail('APPLICATION_PRODUCT_PROJECTION_INVALID_ROW');
        }
        else if (r.category !== null || typeof r.subjectKey !== 'string'
            || !(/^(instance|observation):[a-f0-9]{64}$/.test(r.subjectKey) || /^product:[A-Za-z0-9._:-]{1,256}$/.test(r.subjectKey))
            || !Array.isArray(r.classifications) || !r.classifications.length || r.classifications.length > categories.size
            || !orderedUnique(r.classifications, c => typeof c === 'string' && categories.has(c)))
            fail('APPLICATION_PRODUCT_PROJECTION_INVALID_ROW');
        const row = { kind: r.kind, hour: r.hour === null ? null : Number(r.hour),
            category: r.category === null ? null : String(r.category), subjectKey: r.subjectKey === null ? null : String(r.subjectKey), duration: r.duration,
            ...(Array.isArray(r.classifications) ? { classifications: r.classifications.map(String) } : {}) };
        const key = canonicalUsageAccountJson([row.kind, row.hour, row.category, row.subjectKey]), canonical = canonicalUsageAccountJson(row);
        if (seen.has(key))
            fail('USAGE_ACCOUNT_DUPLICATE_ROW');
        if (canonical < previous)
            fail('USAGE_ACCOUNT_ROWS_NOT_SORTED');
        seen.add(key);
        previous = canonical;
        return row;
    });
    const applicationUsage = parseApplicationUsageSeconds(v.applicationUsage);
    if (Object.keys(applicationUsage.nonSpecialCategories).some(category => !categories.has(category))
        || v.complete && !applicationUsage.complete)
        fail('APPLICATION_PRODUCT_PROJECTION_INVALID');
    return { schemaVersion: 1, baseManifestHash: v.baseManifestHash, revision: v.revision, catalogVersion: v.catalogVersion,
        generatedAtMs: v.generatedAtMs, complete: v.complete, reasonCodes: v.reasonCodes.map(String), rows,
        applicationUsage, projectionHash: v.projectionHash };
}
export async function verifyApplicationProductStatisticsProjection(value, base, baseRows) {
    const projection = parseApplicationProductStatisticsProjection(value), { projectionHash, ...body } = projection;
    if (await hashUsageAccountValue(body) !== projectionHash)
        fail('APPLICATION_PRODUCT_PROJECTION_HASH_MISMATCH');
    if (projection.baseManifestHash !== base.manifestHash)
        fail('APPLICATION_PRODUCT_PROJECTION_BASE_MISMATCH');
    await verifyApplicationInstanceAccountManifest(base);
    validateApplicationInstanceAccountDimensions(baseRows);
    if (baseRows.length !== base.rowCount || await hashUsageAccountValue(baseRows) !== base.rowsHash)
        fail('USAGE_ACCOUNT_ROWS_HASH_MISMATCH');
    const totals = baseRows.filter(row => row.kind === 'total').map(row => ({ ...row, category: null, displayName: null }));
    validateDimensions([...totals, ...projection.rows.map(row => ({ ...row, displayName: null }))], true);
    const total = totals.find(row => row.hour === null).duration;
    if (projection.applicationUsage.nonSpecialTotal + projection.applicationUsage.specialTotal !== total)
        fail('APPLICATION_PRODUCT_PROJECTION_USAGE_MISMATCH');
    return projection;
}

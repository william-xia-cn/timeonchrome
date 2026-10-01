/** 版本化派生统计；不负责生成 Segment、重新分类或计算区间并集。 */
export const USAGE_ACCOUNT_CHUNK_ROWS = 100;
export const USAGE_ACCOUNT_MAX_ROWS = 10_000;
export type UsageAccountSource = 'application' | 'web' | 'webMedia';
export type UsageAccountUnit = 'milliseconds' | 'seconds';
export interface UsageAccountRow {
  kind: 'total' | 'category' | 'subject';
  hour: number | null;
  category: string | null;
  subjectKey: string | null;
  displayName: string | null;
  duration: number;
}
export interface UsageAccountManifest {
  schemaVersion: 1;
  sourceKind: UsageAccountSource;
  durationUnit: UsageAccountUnit;
  timezone: 'Asia/Shanghai';
  date: string;
  revision: number;
  generatedAtMs: number;
  settledThroughMs: number | null;
  algorithmVersion: string;
  policyVersions: number[];
  associationVersion: string | null;
  correctionVersion: number;
  rawFactCount: number;
  rawFactHash: string;
  rowCount: number;
  chunkCount: number;
  rowsHash: string;
  complete: boolean;
  reasonCodes: string[];
  manifestHash: string;
}
export interface UsageAccountChunk {
  chunkIndex: number;
  rows: UsageAccountRow[];
  chunkHash: string;
}
export interface UsageAccountReceipt {
  manifestId: string;
  revision: number;
  manifestHash: string;
  received: boolean;
  published: boolean;
  publishStatus: 'pending' | 'received_not_published' | 'published';
}
const manifestFields = ['schemaVersion','sourceKind','durationUnit','timezone','date','revision',
  'generatedAtMs','settledThroughMs','algorithmVersion','policyVersions','associationVersion',
  'correctionVersion','rawFactCount','rawFactHash','rowCount','chunkCount','rowsHash','complete','reasonCodes','manifestHash'];
const rowFields = ['kind','hour','category','subjectKey','displayName','duration'];
const hashPattern = /^[a-f0-9]{64}$/;
const codePattern = /^[A-Z][A-Z0-9_]{0,63}$/;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;
export class UsageAccountError extends Error {
  constructor(readonly code: string) { super(code); }
}
function fail(code: string): never { throw new UsageAccountError(code); }
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: unknown, fields: string[]): Record<string, unknown> {
  if (!record(value) || Object.keys(value).length !== fields.length
    || fields.some(key => !Object.hasOwn(value, key))) fail('USAGE_ACCOUNT_INVALID_FIELDS');
  return value;
}
function integer(value: unknown, min = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
}
function orderedUnique(values: unknown[], valid: (value: unknown) => boolean): boolean {
  return values.every((value, i) => valid(value) && (i === 0 || String(values[i - 1]) < String(value)));
}
function identifier(value: unknown): value is string {
  return typeof value === 'string' && identifierPattern.test(value);
}
export function usageAccountDayStart(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('USAGE_ACCOUNT_INVALID_DATE');
  const start = Date.parse(`${date}T00:00:00+08:00`);
  if (!Number.isFinite(start) || start < 0 || new Date(start + 28_800_000).toISOString().slice(0, 10) !== date)
    fail('USAGE_ACCOUNT_INVALID_DATE');
  return start;
}
export function canonicalUsageAccountJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalUsageAccountJson).join(',') + ']';
  if (record(value)) return '{' + Object.keys(value).sort().map(key =>
    JSON.stringify(key) + ':' + canonicalUsageAccountJson(value[key])).join(',') + '}';
  return fail('USAGE_ACCOUNT_NON_JSON_VALUE');
}
export async function hashUsageAccountValue(value: unknown): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalUsageAccountJson(value)));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function parseUsageAccountManifest(value: unknown): UsageAccountManifest {
  const v = exact(value, manifestFields);
  if (v.schemaVersion !== 1 || v.timezone !== 'Asia/Shanghai'
    || (v.sourceKind !== 'application' && v.sourceKind !== 'web' && v.sourceKind !== 'webMedia')
    || v.durationUnit !== (v.sourceKind === 'application' ? 'milliseconds' : 'seconds'))
    fail('USAGE_ACCOUNT_INVALID_SCHEMA');
  if (typeof v.date !== 'string') fail('USAGE_ACCOUNT_INVALID_DATE');
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
  for (const field of ['rawFactHash','rowsHash','manifestHash']) {
    if (typeof v[field] !== 'string' || !hashPattern.test(v[field])) fail('USAGE_ACCOUNT_INVALID_HASH');
  }
  if (typeof v.complete !== 'boolean' || !Array.isArray(v.reasonCodes) || v.reasonCodes.length > 16
    || !orderedUnique(v.reasonCodes, item => typeof item === 'string' && codePattern.test(item))
    || (v.complete && (v.reasonCodes.length > 0 || v.settledThroughMs === null))
    || (!v.complete && v.reasonCodes.length === 0)) fail('USAGE_ACCOUNT_INVALID_COMPLETENESS');
  return {
    schemaVersion: 1, sourceKind: v.sourceKind, durationUnit: v.sourceKind === 'application' ? 'milliseconds' : 'seconds', timezone: 'Asia/Shanghai',
    date: v.date, revision: v.revision, generatedAtMs: v.generatedAtMs,
    settledThroughMs: v.settledThroughMs === null ? null : Number(v.settledThroughMs),
    algorithmVersion: v.algorithmVersion, policyVersions: policyVersions.map(Number),
    associationVersion: v.associationVersion, correctionVersion: v.correctionVersion,
    rawFactCount: v.rawFactCount, rawFactHash: String(v.rawFactHash), rowCount: v.rowCount,
    chunkCount: v.chunkCount, rowsHash: String(v.rowsHash), complete: v.complete,
    reasonCodes: v.reasonCodes.map(String), manifestHash: String(v.manifestHash),
  };
}
export async function verifyUsageAccountManifest(value: unknown): Promise<UsageAccountManifest> {
  const manifest = parseUsageAccountManifest(value);
  const { manifestHash, ...body } = manifest;
  if (await hashUsageAccountValue(body) !== manifestHash) fail('USAGE_ACCOUNT_MANIFEST_HASH_MISMATCH');
  return manifest;
}
export function parseUsageAccountRows(value: unknown, maximum = USAGE_ACCOUNT_MAX_ROWS): UsageAccountRow[] {
  if (!Array.isArray(value) || value.length > maximum) fail('USAGE_ACCOUNT_INVALID_ROWS');
  const identities = new Set<string>();
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
    } else if (v.subjectKey !== null || v.displayName !== null) fail('USAGE_ACCOUNT_INVALID_SUBJECT');
    const row: UsageAccountRow = { kind: v.kind, hour: v.hour === null ? null : Number(v.hour),
      category: v.category === null ? null : String(v.category), subjectKey: v.subjectKey === null ? null : String(v.subjectKey),
      displayName: v.displayName === null ? null : String(v.displayName), duration: v.duration };
    const identity = canonicalUsageAccountJson([row.kind, row.hour, row.category, row.subjectKey]);
    if (identities.has(identity)) fail('USAGE_ACCOUNT_DUPLICATE_ROW');
    identities.add(identity);
    const canonical = canonicalUsageAccountJson(row);
    if (canonical < previous) fail('USAGE_ACCOUNT_ROWS_NOT_SORTED');
    previous = canonical;
    return row;
  });
}
export function validateUsageAccountDimensions(rows: UsageAccountRow[]): { total: number } {
  // 日／小时在各自维度守恒；跨应用／分类的重叠不能被简单加总。
  const groups = new Map<string, { daily?: number; hourly: number; hours: Set<number>; label: string | null }>();
  for (const row of rows) {
    const key = canonicalUsageAccountJson([row.kind, row.category, row.subjectKey]);
    const group = groups.get(key) ?? { hourly: 0, hours: new Set<number>(), label: row.displayName };
    if (group.label !== row.displayName) fail('USAGE_ACCOUNT_SUBJECT_LABEL_CONFLICT');
    if (row.hour === null) {
      if (group.daily !== undefined) fail('USAGE_ACCOUNT_DUPLICATE_ROW');
      group.daily = row.duration;
    } else {
      if (group.hours.has(row.hour)) fail('USAGE_ACCOUNT_DUPLICATE_ROW');
      group.hours.add(row.hour); group.hourly += row.duration;
      if (!Number.isSafeInteger(group.hourly)) fail('USAGE_ACCOUNT_DURATION_OVERFLOW');
    }
    groups.set(key, group);
  }
  const total = groups.get(canonicalUsageAccountJson(['total', null, null]));
  if (!total || total.hours.size !== 24 || total.daily === undefined) fail('USAGE_ACCOUNT_MISSING_TOTAL');
  for (const group of groups.values()) {
    if (group.daily !== group.hourly) fail('USAGE_ACCOUNT_DIMENSION_MISMATCH');
    if (group.hourly > total.hourly) fail('USAGE_ACCOUNT_DIMENSION_EXCEEDS_TOTAL');
  }
  const hourlyTotals = new Map(rows.filter(r => r.kind === 'total' && r.hour !== null).map(r => [r.hour, r.duration]));
  for (const row of rows) {
    if (row.hour !== null && row.duration > (hourlyTotals.get(row.hour) ?? 0))
      fail('USAGE_ACCOUNT_HOUR_EXCEEDS_TOTAL');
  }
  return { total: total.daily };
}
export async function createUsageAccount(
  header: Omit<UsageAccountManifest, 'rowCount' | 'chunkCount' | 'rowsHash' | 'manifestHash'>,
  inputRows: UsageAccountRow[],
): Promise<{ manifest: UsageAccountManifest; rows: UsageAccountRow[]; chunks: UsageAccountChunk[] }> {
  const rows = [...inputRows].sort((a, b) => {
    const left = canonicalUsageAccountJson(a), right = canonicalUsageAccountJson(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  parseUsageAccountRows(rows); validateUsageAccountDimensions(rows);
  const base = { ...header, rowCount: rows.length, chunkCount: Math.ceil(rows.length / USAGE_ACCOUNT_CHUNK_ROWS),
    rowsHash: await hashUsageAccountValue(rows) };
  const manifest = await verifyUsageAccountManifest({ ...base, manifestHash: await hashUsageAccountValue(base) });
  const chunks: UsageAccountChunk[] = [];
  for (let i = 0; i < rows.length; i += USAGE_ACCOUNT_CHUNK_ROWS) {
    const chunkRows = rows.slice(i, i + USAGE_ACCOUNT_CHUNK_ROWS);
    chunks.push({ chunkIndex: chunks.length, rows: chunkRows, chunkHash: await hashUsageAccountValue(chunkRows) });
  }
  return { manifest, rows, chunks };
}

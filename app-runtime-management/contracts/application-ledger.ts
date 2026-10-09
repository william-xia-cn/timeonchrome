/** 新原账只定义事实；分类、统计并集、配额与网络授权不在此层。 */
export const APPLICATION_LEDGER_VERSION = 3 as const;
export const APPLICATION_LEDGER_CAPABILITY = 'application-ledger-v3' as const;
export const APPLICATION_CHECKPOINT_SECONDS = 180;
export const APPLICATION_RECOVERY_SECONDS = 90;
const DAY_MS = 86_400_000;
const BJT_OFFSET_MS = 28_800_000;

export interface ApplicationLedgerSegment {
  schemaVersion: 3;
  id: string;
  childId: string;
  source: { machineId: string; localUserId: string; runtimeSessionId: string; assignmentVersion: number };
  application: { platform: 'windows' | 'macos'; runtimeIdentity: string };
  date: string;
  startWallTimeMs: number;
  endWallTimeMs: number;
  startMonotonicTimeMs: number;
  endMonotonicTimeMs: number;
  clockEpochId: string;
  durationSeconds: number;
  channel: 'active' | 'pipActive';
  endReason: 'applicationSwitch' | 'userIdle' | 'sessionUnavailable' | 'systemSleep' |
    'periodicSnapshot' | 'stateCorrection' | 'pipEnded' | 'checkpointUnconfirmed' |
    'serviceRecovery' | 'clockAdjustment' | 'assignmentChanged';
  estimated: { isEstimated: boolean; reason: string | null; cappedAtSeconds: number | null };
}

function invalid(): never { throw new Error('APPLICATION_LEDGER_INVALID'); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some(key => !Object.hasOwn(result, key))) return invalid();
  return result;
}
function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
}
function integer(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
export function applicationLedgerDayStart(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return invalid();
  const start = Date.parse(`${date}T00:00:00+08:00`);
  if (!Number.isFinite(start) || new Date(start + BJT_OFFSET_MS).toISOString().slice(0, 10) !== date) return invalid();
  return start;
}

export function parseApplicationLedgerSegment(value: unknown): ApplicationLedgerSegment {
  const row = object(value, ['schemaVersion', 'id', 'childId', 'source', 'application', 'date',
    'startWallTimeMs', 'endWallTimeMs', 'startMonotonicTimeMs', 'endMonotonicTimeMs',
    'clockEpochId', 'durationSeconds', 'channel', 'endReason', 'estimated']);
  const source = object(row.source, ['machineId', 'localUserId', 'runtimeSessionId', 'assignmentVersion']);
  const app = object(row.application, ['platform', 'runtimeIdentity']);
  const estimated = object(row.estimated, ['isEstimated', 'reason', 'cappedAtSeconds']);
  if (row.schemaVersion !== 3 || typeof row.id !== 'string' || !/^[a-f0-9]{64}$/.test(row.id)
    || !identifier(row.childId) || !identifier(row.clockEpochId)
    || !identifier(source.machineId) || !identifier(source.localUserId) || !identifier(source.runtimeSessionId)
    || !integer(source.assignmentVersion) || !['windows', 'macos'].includes(String(app.platform))
    || !identifier(app.runtimeIdentity) || typeof row.date !== 'string'
    || !['active', 'pipActive'].includes(String(row.channel))
    || !['applicationSwitch', 'userIdle', 'sessionUnavailable', 'systemSleep', 'periodicSnapshot',
      'stateCorrection', 'pipEnded', 'checkpointUnconfirmed', 'serviceRecovery', 'clockAdjustment',
      'assignmentChanged'].includes(String(row.endReason))) return invalid();
  for (const key of ['startWallTimeMs', 'endWallTimeMs', 'startMonotonicTimeMs', 'endMonotonicTimeMs', 'durationSeconds']) {
    if (!integer(row[key])) return invalid();
  }
  const parsed = row as unknown as ApplicationLedgerSegment;
  const start = applicationLedgerDayStart(parsed.date);
  if (parsed.startWallTimeMs < start || parsed.startWallTimeMs >= start + DAY_MS
    || parsed.endWallTimeMs <= parsed.startWallTimeMs || parsed.endWallTimeMs > start + DAY_MS
    || parsed.endMonotonicTimeMs <= parsed.startMonotonicTimeMs
    || parsed.durationSeconds !== Math.floor((parsed.endMonotonicTimeMs - parsed.startMonotonicTimeMs) / 1000)
    || parsed.durationSeconds > APPLICATION_CHECKPOINT_SECONDS) return invalid();
  if (typeof estimated.isEstimated !== 'boolean'
    || !(estimated.reason === null || identifier(estimated.reason))
    || !(estimated.cappedAtSeconds === null || (integer(estimated.cappedAtSeconds) && estimated.cappedAtSeconds === APPLICATION_RECOVERY_SECONDS))) return invalid();
  if (estimated.isEstimated ? estimated.reason === null || estimated.cappedAtSeconds !== APPLICATION_RECOVERY_SECONDS
    || parsed.durationSeconds > APPLICATION_RECOVERY_SECONDS : estimated.reason !== null || estimated.cappedAtSeconds !== null) return invalid();
  return parsed;
}

/** 跨平台哈希前映射。固定数组顺序，不依赖语言的对象字段顺序或当前分类。 */
export function canonicalApplicationLedgerJson(value: ApplicationLedgerSegment): string {
  const s = parseApplicationLedgerSegment(value);
  return JSON.stringify(['application-ledger-v3', s.childId, s.source.machineId, s.source.localUserId,
    s.source.runtimeSessionId, s.source.assignmentVersion, s.application.platform, s.application.runtimeIdentity,
    s.date, s.startWallTimeMs, s.endWallTimeMs, s.startMonotonicTimeMs, s.endMonotonicTimeMs,
    s.clockEpochId, s.durationSeconds, s.channel, s.endReason,
    s.estimated.isEstimated, s.estimated.reason, s.estimated.cappedAtSeconds]);
}
export async function applicationLedgerSegmentId(value: ApplicationLedgerSegment): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalApplicationLedgerJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function verifyApplicationLedgerSegment(value: unknown): Promise<ApplicationLedgerSegment> {
  const s = parseApplicationLedgerSegment(value);
  if (s.id !== await applicationLedgerSegmentId(s)) return invalid();
  return s;
}
export function applicationLedgerKey(value: ApplicationLedgerSegment): readonly [string, string] {
  const s = parseApplicationLedgerSegment(value);
  return [s.childId, s.id];
}

/** 新引用格式；不修改v3内容、哈希或现有能力声明。 */
export const APPLICATION_OBSERVATION_LEDGER_CAPABILITY = 'application-ledger-v4' as const;
export interface ApplicationObservationSegment extends Omit<ApplicationLedgerSegment, 'schemaVersion' | 'application'> {
  schemaVersion: 4;
  application: { platform: 'windows' | 'macos'; observationRef: string };
}
const opaqueReference = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
export function parseApplicationObservationSegment(value: unknown): ApplicationObservationSegment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  const app = object(row.application, ['platform', 'observationRef']);
  if (row.schemaVersion !== 4 || (app.platform !== 'windows' && app.platform !== 'macos')
    || !opaqueReference(app.observationRef)) return invalid();
  // 仅复用既有时间/字段检查；此临时对象不持久化、不传输、不作为旧身份确认。
  const validated = parseApplicationLedgerSegment({...row, schemaVersion: 3,
    application: {platform: app.platform, runtimeIdentity: app.observationRef}});
  return {...validated, schemaVersion: 4, application: {platform: validated.application.platform, observationRef: app.observationRef}};
}
export function canonicalApplicationObservationJson(value: ApplicationObservationSegment): string {
  const s = parseApplicationObservationSegment(value);
  return JSON.stringify(['application-ledger-v4', s.childId, s.source.machineId, s.source.localUserId,
    s.source.runtimeSessionId, s.source.assignmentVersion, s.application.platform, s.application.observationRef,
    s.date, s.startWallTimeMs, s.endWallTimeMs, s.startMonotonicTimeMs, s.endMonotonicTimeMs,
    s.clockEpochId, s.durationSeconds, s.channel, s.endReason,
    s.estimated.isEstimated, s.estimated.reason, s.estimated.cappedAtSeconds]);
}
async function identityDigest(canonical: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function applicationObservationSegmentId(value: ApplicationObservationSegment): Promise<string> {
  return identityDigest(canonicalApplicationObservationJson(value));
}
export async function verifyApplicationObservationSegment(value: unknown): Promise<ApplicationObservationSegment> {
  const segment = parseApplicationObservationSegment(value);
  if (segment.id !== await applicationObservationSegmentId(segment)) return invalid();
  return segment;
}
export interface ProgramInstanceDescriptor {
  machineId: string;
  platform: 'windows' | 'macos';
  locationRef: string;
  executableSha256: string;
}
export function parseProgramInstanceDescriptor(value: unknown): ProgramInstanceDescriptor {
  const row = object(value, ['machineId', 'platform', 'locationRef', 'executableSha256']);
  if (!identifier(row.machineId) || (row.platform !== 'windows' && row.platform !== 'macos')
    || !opaqueReference(row.locationRef) || typeof row.executableSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(row.executableSha256)) return invalid();
  return {machineId: row.machineId, platform: row.platform, locationRef: row.locationRef,
    executableSha256: row.executableSha256};
}
export function canonicalProgramInstanceJson(value: ProgramInstanceDescriptor): string {
  const row = parseProgramInstanceDescriptor(value);
  return JSON.stringify(['program-instance-v1', row.machineId, row.platform, row.locationRef, row.executableSha256]);
}
export async function programInstanceId(value: ProgramInstanceDescriptor): Promise<string> {
  return identityDigest(canonicalProgramInstanceJson(value));
}
export interface ProgramObservationResolution {
  observationRef: string;
  instance: ProgramInstanceDescriptor;
}
/** 单一解析关系；真实性由采集时的文件代际核验保证，本函数不通过当前路径猜补。 */
export function parseProgramObservationResolution(value: unknown): ProgramObservationResolution {
  const row = object(value, ['observationRef', 'instance']);
  if (!opaqueReference(row.observationRef)) return invalid();
  return {observationRef: row.observationRef, instance: parseProgramInstanceDescriptor(row.instance)};
}
/** 只选择基础统计主体，不聚合时长、不查产品、不改变原始段。 */
export async function applicationObservationSubject(machineId: string, platform: 'windows' | 'macos',
  observationRef: string, resolution?: ProgramObservationResolution): Promise<string> {
  if (!identifier(machineId) || !['windows', 'macos'].includes(platform) || !opaqueReference(observationRef)) return invalid();
  if (!resolution) return `observation:${await identityDigest(JSON.stringify(['program-observation-v1', machineId, platform, observationRef]))}`;
  const checked = parseProgramObservationResolution(resolution);
  if (checked.observationRef !== observationRef || checked.instance.machineId !== machineId
    || checked.instance.platform !== platform) return invalid();
  return `instance:${await programInstanceId(checked.instance)}`;
}

/** 网页现行日边界：每个北京时间日段独立取整，不把跨日碎秒补回。 */
export function splitApplicationLedgerDays(startMs: number, endMs: number) {
  if (!integer(startMs) || !integer(endMs) || endMs < startMs) return invalid();
  const slices: { date: string; startMs: number; endMs: number; durationSeconds: number }[] = [];
  for (let cursor = startMs; cursor < endMs;) {
    const date = new Date(cursor + BJT_OFFSET_MS).toISOString().slice(0, 10);
    const end = Math.min(endMs, applicationLedgerDayStart(date) + DAY_MS);
    slices.push({ date, startMs: cursor, endMs: end, durationSeconds: Math.floor((end - cursor) / 1000) });
    cursor = end;
  }
  return slices;
}

/** 网页现行小时分配：先floor、剩余秒最大余数优先，同余数较早时段优先。 */
export function allocateApplicationLedgerHours(startMs: number, endMs: number, durationSeconds: number) {
  if (!integer(startMs) || !integer(endMs) || endMs <= startMs || !integer(durationSeconds)
    || durationSeconds !== Math.floor((endMs - startMs) / 1000)) return invalid();
  const date = new Date(startMs + BJT_OFFSET_MS).toISOString().slice(0, 10);
  if (endMs > applicationLedgerDayStart(date) + DAY_MS) return invalid();
  const slices: { hour: number; startMs: number; endMs: number; durationSeconds: number; remainder: number }[] = [];
  for (let cursor = startMs; cursor < endMs;) {
    const end = Math.min(endMs, (Math.floor((cursor + BJT_OFFSET_MS) / 3_600_000) + 1) * 3_600_000 - BJT_OFFSET_MS);
    slices.push({ hour: new Date(cursor + BJT_OFFSET_MS).getUTCHours(), startMs: cursor, endMs: end,
      durationSeconds: Math.floor((end - cursor) / 1000), remainder: (end - cursor) % 1000 });
    cursor = end;
  }
  let remaining = durationSeconds - slices.reduce((sum, s) => sum + s.durationSeconds, 0);
  for (const s of [...slices].sort((a, b) => b.remainder - a.remainder || a.startMs - b.startMs)) {
    if (remaining <= 0) break;
    s.durationSeconds++; remaining--;
  }
  return slices.map(({ remainder: _, ...s }) => s);
}

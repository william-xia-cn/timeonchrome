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

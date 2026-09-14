import type {
  MachineLoggingPolicy,
  MachineSelfResponse,
  RuntimeLogCategory,
  RuntimeLogLevel,
  RuntimeTerminalLog,
  UploadAcceptance,
} from './contracts';
import { sha256Hex } from './crypto';
import { HttpError } from './http';

export const runtimeLogLevels = ['info', 'warning', 'error'] as const;
export const runtimeLogCategories = ['service', 'session', 'policy', 'upload', 'storage', 'security', 'accounting'] as const;
const levelRank: Record<RuntimeLogLevel, number> = { info: 0, warning: 1, error: 2 };

export function loggingPolicyEtag(machineId: string, version: number): string {
  return `"logging-${machineId}-${version}"`;
}

async function ownsMachine(database: D1Database, accountId: string, machineId: string): Promise<boolean> {
  return Boolean(await database.prepare('SELECT 1 AS ok FROM runtime_machines_v2 WHERE id=?1 AND account_id=?2')
    .bind(machineId, accountId).first());
}

export async function getLoggingPolicy(
  database: D1Database,
  accountId: string,
  machineId: string,
): Promise<MachineLoggingPolicy | null> {
  if (!await ownsMachine(database, accountId, machineId)) return null;
  const row = await database.prepare(`
    SELECT version,enabled,min_level,categories_json,expires_at_ms
    FROM runtime_machine_logging_policy_versions_v1 WHERE machine_id=?1
    ORDER BY version DESC LIMIT 1
  `).bind(machineId).first<Record<string, unknown>>();
  if (!row) return { version: 0, enabled: false, minLevel: 'error', categories: [...runtimeLogCategories], expiresAtMs: null };
  return {
    version: Number(row.version), enabled: Boolean(row.enabled), minLevel: String(row.min_level) as RuntimeLogLevel,
    categories: JSON.parse(String(row.categories_json)) as RuntimeLogCategory[],
    expiresAtMs: row.expires_at_ms == null ? null : Number(row.expires_at_ms),
  };
}

export function parseLoggingPolicyUpdate(value: unknown, nowMs: number): Omit<MachineLoggingPolicy, 'version'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'INVALID_REQUEST', 'Logging policy is invalid.');
  const input = value as Record<string, unknown>;
  if (typeof input.enabled !== 'boolean' || !runtimeLogLevels.includes(input.minLevel as RuntimeLogLevel)
    || !Array.isArray(input.categories)) throw new HttpError(400, 'INVALID_REQUEST', 'Logging policy is invalid.');
  const categories = [...new Set(input.categories.map(String))];
  if (categories.length < 1 || categories.some((item) => !runtimeLogCategories.includes(item as RuntimeLogCategory))) {
    throw new HttpError(400, 'INVALID_LOG_CATEGORY', 'Logging policy category is invalid.');
  }
  const expiresAtMs = input.expiresAtMs == null ? null : Number(input.expiresAtMs);
  if (input.enabled && (!Number.isSafeInteger(expiresAtMs) || expiresAtMs! <= nowMs || expiresAtMs! > nowMs + 7 * 86_400_000)) {
    throw new HttpError(400, 'INVALID_LOG_EXPIRY', 'Enabled logging policy must expire within 7 days.');
  }
  return {
    enabled: input.enabled,
    minLevel: input.minLevel as RuntimeLogLevel,
    categories: categories as RuntimeLogCategory[],
    expiresAtMs: input.enabled ? expiresAtMs : null,
  };
}

export async function putLoggingPolicy(
  database: D1Database,
  accountId: string,
  machineId: string,
  ifMatch: string | null,
  update: Omit<MachineLoggingPolicy, 'version'>,
  nowMs: number,
): Promise<MachineLoggingPolicy | null> {
  const current = await getLoggingPolicy(database, accountId, machineId);
  if (!current) return null;
  if (ifMatch !== loggingPolicyEtag(machineId, current.version)) throw new HttpError(412, 'POLICY_VERSION_CONFLICT', 'Logging policy has changed.');
  const machine = await database.prepare('SELECT default_child_id,desired_policy_version FROM runtime_machines_v2 WHERE id=?1 AND account_id=?2')
    .bind(machineId, accountId).first<{ default_child_id: string | null; desired_policy_version: number }>();
  if (!machine) return null;
  const loggingVersion = current.version + 1;
  const desiredVersion = Number(machine.desired_policy_version) + 1;
  const payloadHash = await sha256Hex(JSON.stringify({ machineId, desiredVersion, defaultChildId: machine.default_child_id }));
  await database.batch([
    database.prepare(`INSERT INTO runtime_machine_logging_policy_versions_v1(
      machine_id,version,enabled,min_level,categories_json,expires_at_ms,created_at_ms
    ) VALUES (?1,?2,?3,?4,?5,?6,?7)`).bind(machineId, loggingVersion, update.enabled ? 1 : 0,
      update.minLevel, JSON.stringify(update.categories), update.expiresAtMs, nowMs),
    database.prepare(`UPDATE runtime_machines_v2 SET desired_policy_version=?1,policy_state='pending',
      policy_error=NULL,updated_at_ms=?2 WHERE id=?3 AND desired_policy_version=?4`)
      .bind(desiredVersion, nowMs, machineId, machine.desired_policy_version),
    database.prepare(`INSERT INTO runtime_machine_policy_versions_v2(machine_id,version,payload_hash,created_at_ms)
      VALUES (?1,?2,?3,?4)`).bind(machineId, desiredVersion, payloadHash, nowMs),
  ]);
  return { version: loggingVersion, ...update };
}

function validCode(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= maximum && /^[a-zA-Z0-9_.-]+$/u.test(value);
}

function parseDetails(value: unknown): Record<string, boolean | number | string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 12) return null;
  const result: Record<string, boolean | number | string> = {};
  for (const [key, item] of entries) {
    if (!validCode(key, 48) || !['boolean', 'number', 'string'].includes(typeof item)) return null;
    if (typeof item === 'number' && (!Number.isSafeInteger(item) || Math.abs(item) > 1_000_000_000)) return null;
    if (typeof item === 'string' && (!validCode(item, 96))) return null;
    result[key] = item as boolean | number | string;
  }
  return result;
}

export function parseTerminalLogs(value: unknown): { logs: RuntimeTerminalLog[]; rejected: Array<{ id: string; code: string }> } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'INVALID_REQUEST', 'Terminal log upload is invalid.');
  const logs = (value as Record<string, unknown>).logs;
  if (!Array.isArray(logs) || logs.length > 100) throw new HttpError(400, 'INVALID_REQUEST', 'Terminal log batch is invalid.');
  const accepted: RuntimeTerminalLog[] = [];
  const rejected: Array<{ id: string; code: string }> = [];
  for (const raw of logs) {
    const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const id = typeof item.id === 'string' ? item.id : '';
    const details = parseDetails(item.details);
    if (!validCode(id, 128) || !Number.isSafeInteger(item.observedAtMs)
      || !runtimeLogLevels.includes(item.level as RuntimeLogLevel)
      || !runtimeLogCategories.includes(item.category as RuntimeLogCategory)
      || !validCode(item.eventCode, 96) || !validCode(item.module, 64)
      || !validCode(item.messageCode, 96) || !validCode(item.serviceVersion, 32)
      || !Number.isSafeInteger(item.policyVersion) || Number(item.policyVersion) < 1 || !details) {
      rejected.push({ id, code: 'INVALID_LOG' }); continue;
    }
    accepted.push(item as unknown as RuntimeTerminalLog);
  }
  return { logs: accepted, rejected };
}

export async function persistTerminalLogs(
  database: D1Database,
  machine: MachineSelfResponse,
  logs: RuntimeTerminalLog[],
  nowMs: number,
): Promise<UploadAcceptance> {
  const policy = await getLoggingPolicy(database, machine.accountId, machine.machineId);
  const acceptedIds: string[] = [];
  const rejected: Array<{ id: string; code: string }> = [];
  if (!policy || !policy.enabled || policy.expiresAtMs == null || policy.expiresAtMs <= nowMs) {
    return { acceptedIds, rejected: logs.map((item) => ({ id: item.id, code: 'LOGGING_DISABLED' })) };
  }
  const statements: D1PreparedStatement[] = [];
  for (const log of logs) {
    if (log.policyVersion !== policy.version || levelRank[log.level] < levelRank[policy.minLevel]
      || !policy.categories.includes(log.category) || Math.abs(nowMs - log.observedAtMs) > 7 * 86_400_000) {
      rejected.push({ id: log.id, code: 'LOG_POLICY_MISMATCH' }); continue;
    }
    const canonical = JSON.stringify(log);
    const contentHash = await sha256Hex(canonical);
    const existing = await database.prepare('SELECT content_hash FROM runtime_terminal_logs_v1 WHERE machine_id=?1 AND id=?2')
      .bind(machine.machineId, log.id).first<{ content_hash: string }>();
    if (existing) {
      if (existing.content_hash === contentHash) acceptedIds.push(log.id);
      else rejected.push({ id: log.id, code: 'ID_CONFLICT' });
      continue;
    }
    statements.push(database.prepare(`INSERT INTO runtime_terminal_logs_v1(
      machine_id,id,observed_at_ms,level,category,event_code,module,message_code,details_json,
      service_version,policy_version,content_hash,uploaded_at_ms
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`)
      .bind(machine.machineId, log.id, log.observedAtMs, log.level, log.category, log.eventCode,
        log.module, log.messageCode, JSON.stringify(log.details), log.serviceVersion,
        log.policyVersion, contentHash, nowMs));
    acceptedIds.push(log.id);
  }
  if (statements.length) await database.batch(statements);
  return { acceptedIds, rejected };
}

export async function queryTerminalLogs(
  database: D1Database,
  accountId: string,
  fromMs: number,
  toMs: number,
  limit: number,
  cursor: { beforeMs: number; beforeId: string } | null,
  options: { machineId?: string; level?: RuntimeLogLevel; category?: RuntimeLogCategory },
): Promise<Array<Record<string, unknown>>> {
  const values: unknown[] = [accountId, fromMs, toMs, cursor?.beforeMs ?? null, cursor?.beforeId ?? ''];
  let filter = '';
  if (options.machineId) { values.push(options.machineId); filter += ` AND l.machine_id=?${values.length}`; }
  if (options.level) { values.push(options.level); filter += ` AND l.level=?${values.length}`; }
  if (options.category) { values.push(options.category); filter += ` AND l.category=?${values.length}`; }
  values.push(limit);
  const rows = await database.prepare(`SELECT l.id,l.machine_id,m.display_name AS machine_name,m.platform,
    l.observed_at_ms,l.level,l.category,l.event_code,l.module,l.message_code,l.details_json,l.service_version
    FROM runtime_terminal_logs_v1 l JOIN runtime_machines_v2 m ON m.id=l.machine_id
    WHERE m.account_id=?1 AND l.observed_at_ms>=?2 AND l.observed_at_ms<?3
      AND (?4 IS NULL OR l.observed_at_ms<?4 OR (l.observed_at_ms=?4 AND l.id<?5))${filter}
    ORDER BY l.observed_at_ms DESC,l.id DESC LIMIT ?${values.length}`)
    .bind(...values).all<Record<string, unknown>>();
  return (rows.results || []).map((row) => ({
    id: row.id, timestampMs: Number(row.observed_at_ms), level: row.level, category: row.category,
    eventCode: row.event_code, machineId: row.machine_id, machineName: row.machine_name || '电脑',
    platform: row.platform, module: row.module, message: row.message_code,
    details: JSON.parse(String(row.details_json)), serviceVersion: row.service_version, source: 'terminal',
  }));
}

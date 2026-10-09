import { hashUsageAccountValue, parseApplicationInstanceAccountRows, verifyApplicationInstanceAccountManifest,
  validateApplicationInstanceAccountDimensions, type ApplicationInstanceAccountRow } from '@timeonchrome/app-runtime-contracts/usage-account';
import { HttpError } from './http';

const DAY = 86400000, OFFSET = 8 * 3600000;
type Filters = { machineId?: string; localUserId?: string; platform?: string };
type Reference = { manifestId: string; revision: number; hash: string; settledThroughMs: number | null };
type Day = { date: string; complete: boolean; totalDuration: number | null; reasonCodes: string[];
  rows: ApplicationInstanceAccountRow[]; references: Reference[]; unsupportedSourceCount: number };
function fail(code: string): never { throw new HttpError(503, code, '实例统计读取失败。'); }
function merge(target: Map<string, ApplicationInstanceAccountRow>, row: ApplicationInstanceAccountRow) {
  const key = JSON.stringify([row.kind, row.hour, row.subjectKey]), previous = target.get(key);
  const duration = (previous?.duration ?? 0) + row.duration;
  if (!Number.isSafeInteger(duration)) fail('APPLICATION_STATISTICS_DURATION_OVERFLOW');
  target.set(key, { ...row, duration });
}

/** 只读已采用的基础统计。产品归属、名称及分类不进入这一层。 */
export async function readProgramInstanceStatistics(db: D1Database, account: string, child: string,
  fromMs: number, toMs: number, filters: Filters = {}) {
  if (!Number.isSafeInteger(fromMs) || !Number.isSafeInteger(toMs) || fromMs < 0 || toMs <= fromMs
    || (fromMs + OFFSET) % DAY !== 0 || (toMs + OFFSET) % DAY !== 0 || toMs - fromMs > 7 * DAY)
    throw new HttpError(400, 'INVALID_RANGE', '实例统计仅支持最多七个北京时间完整日期。');
  const days: Day[] = [], rangeRows = new Map<string, ApplicationInstanceAccountRow>();
  let rowCount = 0;
  for (let cursor = fromMs; cursor < toMs; cursor += DAY) {
    const date = new Date(cursor + OFFSET).toISOString().slice(0, 10);
    const heads = await db.prepare(`SELECT p.manifest_id,p.revision,s.manifest_json,s.manifest_hash
      FROM runtime_application_account_publications_v1 p
      JOIN runtime_application_account_manifests_v1 s ON s.id=p.manifest_id
      JOIN runtime_machines_v2 m ON m.id=p.machine_id
      WHERE p.account_id=?1 AND p.child_id=?2 AND p.date=?3 AND m.account_id=?1
        AND s.account_id=?1 AND s.child_id=?2 AND s.date=?3 AND s.state='received'
        AND s.machine_id=p.machine_id AND s.local_user_id=p.local_user_id
        AND s.assignment_version=p.assignment_version AND s.revision=p.revision
        AND (?4 IS NULL OR p.machine_id=?4) AND (?5 IS NULL OR p.local_user_id=?5)
        AND (?6 IS NULL OR m.platform=?6)
      ORDER BY p.machine_id,p.local_user_id,p.assignment_version LIMIT 101`)
      .bind(account, child, date, filters.machineId ?? null, filters.localUserId ?? null, filters.platform ?? null)
      .all<{ manifest_id: string; revision: number; manifest_json: string; manifest_hash: string }>();
    if (heads.results.length > 100) fail('APPLICATION_STATISTICS_SOURCE_LIMIT');
    const rows = new Map<string, ApplicationInstanceAccountRow>(), references: Reference[] = [];
    let unsupportedSourceCount = 0;
    for (const head of heads.results) {
      const value = JSON.parse(head.manifest_json);
      if (value?.schemaVersion !== 3) { unsupportedSourceCount++; continue; }
      const manifest = await verifyApplicationInstanceAccountManifest(value);
      if (!manifest.complete || manifest.childId !== child || manifest.date !== date
        || manifest.revision !== head.revision || manifest.manifestHash !== head.manifest_hash
        || manifest.algorithmVersion !== 'application-instance-seconds-v1') fail('APPLICATION_STATISTICS_INVALID_PUBLICATION');
      rowCount += manifest.rowCount;
      if (rowCount > 10000) fail('APPLICATION_STATISTICS_ROW_LIMIT');
      const chunks = await db.prepare(`SELECT chunk_index,rows_json FROM runtime_application_account_chunks_v1
        WHERE manifest_id=?1 ORDER BY chunk_index LIMIT 100`).bind(head.manifest_id)
        .all<{ chunk_index: number; rows_json: string }>();
      if (chunks.results.length !== manifest.chunkCount || chunks.results.some((chunk, index) => chunk.chunk_index !== index))
        fail('APPLICATION_STATISTICS_CHUNKS_MISSING');
      const sourceRows = parseApplicationInstanceAccountRows(chunks.results.flatMap(chunk => JSON.parse(chunk.rows_json)));
      if (sourceRows.length !== manifest.rowCount || await hashUsageAccountValue(sourceRows) !== manifest.rowsHash)
        fail('APPLICATION_STATISTICS_HASH_MISMATCH');
      validateApplicationInstanceAccountDimensions(sourceRows);
      for (const row of sourceRows) merge(rows, row);
      references.push({ manifestId: head.manifest_id, revision: head.revision, hash: head.manifest_hash,
        settledThroughMs: manifest.settledThroughMs });
    }
    const dayRows = [...rows.values()];
    for (const row of dayRows) if (row.hour === null) merge(rangeRows, row);
    days.push({ date, complete: references.length > 0 && unsupportedSourceCount === 0,
      totalDuration: dayRows.find(row => row.kind === 'total' && row.hour === null)?.duration ?? null,
      reasonCodes: [...(references.length ? [] : ['APPLICATION_INSTANCE_STATISTICS_NOT_AVAILABLE']),
        ...(unsupportedSourceCount ? ['APPLICATION_INSTANCE_STATISTICS_SOURCE_NOT_ADAPTED'] : [])],
      rows: dayRows, references, unsupportedSourceCount });
  }
  const complete = days.every(day => day.complete), rows = [...rangeRows.values()];
  const availableTotalDuration = rows.find(row => row.kind === 'total')?.duration ?? null;
  return { schemaVersion: 1, sourceKind: 'application' as const, childId: child, durationUnit: 'seconds' as const,
    fromMs, toMs, complete, totalDuration: complete ? availableTotalDuration : null, availableTotalDuration,
    subjects: rows.filter(row => row.kind === 'subject'), days,
    revision: await hashUsageAccountValue(days.map(day => [day.date, day.references, day.unsupportedSourceCount])) };
}

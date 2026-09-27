// Task-owned progress only. Never reads or writes the webpage usage ledger.
type Progress = {
  id: string; taskId: string; taskRevision: number;
  startedAt: number; endedAt: number; seconds: number;
};
type StoredProgress = {
  id: string; task_id: string; task_revision: number;
  started_at: number; ended_at: number; seconds: number;
};
const MAX_REQUEST_ITEMS = 100;
const MAX_TRANSACTION_ITEMS = 50;

function validId(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= limit && value.trim() === value;
}
export function normalizeProgress(value: unknown): Progress | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!validId(v.id, 180) || !validId(v.taskId, 80)) return null;
  for (const key of ['taskRevision', 'startedAt', 'endedAt', 'seconds']) {
    if (typeof v[key] !== 'number' || !Number.isSafeInteger(v[key]) || v[key] <= 0) return null;
  }
  const startedAt = v.startedAt as number, endedAt = v.endedAt as number;
  const duration = endedAt - startedAt;
  if (duration <= 0 || duration > 90_000 || v.seconds !== Math.floor(duration / 1000)) return null;
  return { id: v.id, taskId: v.taskId, taskRevision: v.taskRevision as number,
    startedAt, endedAt, seconds: v.seconds as number };
}

function sameProgress(stored: StoredProgress, item: Progress): boolean {
  return stored.id === item.id && stored.task_id === item.taskId
    && stored.task_revision === item.taskRevision && stored.started_at === item.startedAt
    && stored.ended_at === item.endedAt && stored.seconds === item.seconds;
}

// Each group's facts, union projection and completion audit commit together.
// A retry also projects matching previously persisted facts, repairing old partial writes.
export async function ingestTaskProgress(
  db: D1Database, profileId: string, deviceId: string, values: unknown, now = Date.now(),
): Promise<{ acceptedIds: string[] }> {
  if (!profileId || !deviceId || !Number.isSafeInteger(now) || now <= 0 || !Array.isArray(values)) {
    return { acceptedIds: [] };
  }
  const groups = new Map<string, Progress[]>();
  const unique = new Map<string, Progress>();
  const conflicts = new Set<string>();
  for (const value of values.slice(0, MAX_REQUEST_ITEMS)) {
    const item = normalizeProgress(value);
    if (!item) continue;
    const previous = unique.get(item.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(item)) conflicts.add(item.id);
    else unique.set(item.id, item);
  }
  for (const item of unique.values()) {
    // One ACK ID cannot distinguish two conflicting payloads in a single request.
    if (conflicts.has(item.id)) continue;
    const group = groups.get(item.taskId) || [];
    group.push(item);
    groups.set(item.taskId, group);
  }
  const accepted = new Set<string>();
  for (const [taskId, items] of groups) {
    for (let offset = 0; offset < items.length; offset += MAX_TRANSACTION_ITEMS) {
      const group = items.slice(offset, offset + MAX_TRANSACTION_ITEMS);
      const statements = group.map(item => db.prepare(`
        INSERT INTO task_progress_segments_v1
          (id, task_id, profile_id, device_id, task_revision, started_at, ended_at, seconds, created_at)
        SELECT ?, t.id, ?, ?, ?, ?, ?, ?, ? FROM tasks_v1 t
        WHERE t.id = ? AND t.profile_id = ? AND t.lifecycle_status = 'open' AND t.revision = ?
          AND t.planned_start_at <= ?
          AND EXISTS (SELECT 1 FROM devices d WHERE d.id = ? AND d.profile_id = ?
            AND COALESCE(d.status, 'bound') = 'bound')
        ON CONFLICT(id) DO NOTHING
      `).bind(item.id, profileId, deviceId, item.taskRevision, item.startedAt, item.endedAt,
        item.seconds, now, taskId, profileId, item.taskRevision, item.startedAt, deviceId, profileId));

      // The running maximum, not LAG(end), handles nested and overlapping intervals.
      statements.push(db.prepare(`
        WITH intervals AS (
          SELECT started_at, ended_at,
            MAX(ended_at) OVER (ORDER BY started_at, ended_at, id
              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS previous_end
          FROM task_progress_segments_v1 WHERE task_id = ? AND profile_id = ?
        ), total AS (
          SELECT CAST(COALESCE(SUM(MAX(0, ended_at - MAX(started_at,
            COALESCE(previous_end, started_at)))), 0) / 1000 AS INTEGER) AS seconds FROM intervals
        )
        UPDATE tasks_v1 SET completed_seconds = MIN(required_seconds, (SELECT seconds FROM total)),
          updated_at = ?
        WHERE id = ? AND profile_id = ? AND lifecycle_status IN ('open', 'paused')
          AND completed_seconds <> MIN(required_seconds, (SELECT seconds FROM total))
          AND EXISTS (SELECT 1 FROM devices d WHERE d.id = ? AND d.profile_id = ?
            AND COALESCE(d.status, 'bound') = 'bound')
      `).bind(taskId, profileId, now, taskId, profileId, deviceId, profileId));
      statements.push(db.prepare(`
        INSERT INTO task_events_v1
          (id, task_id, profile_id, event_type, task_revision, source_type, source_id,
           payload_json, occurred_at, created_at)
        SELECT t.id || ':auto-completed:' || (t.revision + 1), t.id, t.profile_id,
          'auto_completed', t.revision + 1, 'system', ?,
          json_object('completedSeconds', t.completed_seconds), ?, ? FROM tasks_v1 t
        WHERE t.id = ? AND t.profile_id = ? AND t.lifecycle_status = 'open'
          AND t.completed_seconds >= t.required_seconds
          AND EXISTS (SELECT 1 FROM devices d WHERE d.id = ? AND d.profile_id = ?
            AND COALESCE(d.status, 'bound') = 'bound')
        ON CONFLICT(id) DO NOTHING
      `).bind(deviceId, now, now, taskId, profileId, deviceId, profileId));
      statements.push(db.prepare(`
        UPDATE tasks_v1 SET lifecycle_status = 'completed', completion_source = 'task_progress',
          completed_at = COALESCE(completed_at, ?), revision = revision + 1, updated_at = ?
        WHERE id = ? AND profile_id = ? AND lifecycle_status = 'open'
          AND completed_seconds >= required_seconds
          AND EXISTS (SELECT 1 FROM devices d WHERE d.id = ? AND d.profile_id = ?
            AND COALESCE(d.status, 'bound') = 'bound')
      `).bind(now, now, taskId, profileId, deviceId, profileId));
      const placeholders = group.map(() => '?').join(',');
      statements.push(db.prepare(`
        SELECT id, task_id, task_revision, started_at, ended_at, seconds
        FROM task_progress_segments_v1 WHERE profile_id = ? AND device_id = ?
          AND id IN (${placeholders})
          AND EXISTS (SELECT 1 FROM devices d WHERE d.id = ? AND d.profile_id = ?
            AND COALESCE(d.status, 'bound') = 'bound')
      `).bind(profileId, deviceId, ...group.map(item => item.id), deviceId, profileId));

      const results = await db.batch<StoredProgress>(statements);
      const stored = results[results.length - 1].results;
      for (const item of group) {
        if (stored.some(row => sameProgress(row, item))) accepted.add(item.id);
      }
    }
  }
  return { acceptedIds: [...accepted] };
}

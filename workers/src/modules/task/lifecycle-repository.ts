export type TaskLifecycleActionInput = {
  profileId: string; taskId: string; actorAccountId: string;
  action: unknown; actionId: unknown; expectedRevision: unknown; note?: unknown; now?: number;
};
type ActionEvent = {
  task_id: string; profile_id: string; event_type: string; task_revision: number;
  source_type: string; source_id: string; payload_json: string;
};
const ACTIONS = {
  pause: { status: 'paused', event: 'paused' },
  resume: { status: 'open', event: 'resumed' },
  complete: { status: 'completed', event: 'completed' },
  cancel: { status: 'cancelled', event: 'cancelled' },
} as const;

// Mutation and its idempotency/audit fact are one transaction, never two writes.
export async function applyTaskLifecycle(db: D1Database, input: TaskLifecycleActionInput) {
  const action = typeof input.action === 'string' ? input.action.trim().toLowerCase() : '';
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) return { ok: false, code: 'INVALID_TASK_ACTION' };
  const rule = ACTIONS[action as keyof typeof ACTIONS];
  const revision = input.expectedRevision;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision <= 0 || revision === Number.MAX_SAFE_INTEGER) {
    return { ok: false, code: 'EXPECTED_REVISION_REQUIRED' };
  }
  const actionId = input.actionId;
  if (typeof actionId !== 'string' || !actionId.trim() || actionId !== actionId.trim() || actionId.length > 128) {
    return { ok: false, code: 'ACTION_ID_REQUIRED' };
  }
  if (!input.actorAccountId || !input.taskId || !input.profileId) return { ok: false, code: 'TASK_NOT_FOUND' };
  const now = input.now ?? Date.now();
  if (!Number.isSafeInteger(now) || now <= 0) return { ok: false, code: 'INVALID_ACTION_TIME' };
  const eventId = `${input.taskId}:action:${actionId}`;
  const note = typeof input.note === 'string' ? input.note.slice(0, 500) || null : null;
  const payload = JSON.stringify({ expectedRevision: revision, note });
  const allowedCurrent = action === 'resume' ? "'paused'" : "'open', 'paused'";
  const result = await db.batch<ActionEvent>([
    db.prepare(`UPDATE tasks_v1 SET lifecycle_status = ?, revision = revision + 1,
      completion_source = COALESCE(?, completion_source), completed_at = COALESCE(?, completed_at),
      cancelled_at = COALESCE(?, cancelled_at), updated_at = ?
      WHERE id = ? AND profile_id = ? AND revision = ? AND lifecycle_status IN (${allowedCurrent})
        AND EXISTS (SELECT 1 FROM profiles WHERE id = ? AND account_id = ?)
        AND NOT EXISTS (SELECT 1 FROM task_events_v1 WHERE id = ?)`)
      .bind(rule.status, action === 'complete' ? 'parent' : null, action === 'complete' ? now : null,
        action === 'cancel' ? now : null, now, input.taskId, input.profileId, revision,
        input.profileId, input.actorAccountId, eventId),
    db.prepare(`INSERT INTO task_events_v1
      (id, task_id, profile_id, event_type, task_revision, source_type, source_id, payload_json, occurred_at, created_at)
      SELECT ?, ?, ?, ?, ?, 'parent', ?, ?, ?, ? WHERE changes() = 1`)
      .bind(eventId, input.taskId, input.profileId, rule.event, revision + 1, input.actorAccountId, payload, now, now),
    db.prepare(`SELECT e.task_id, e.profile_id, e.event_type, e.task_revision,
      e.source_type, e.source_id, e.payload_json FROM task_events_v1 e
      JOIN profiles p ON p.id = e.profile_id
      WHERE e.id = ? AND e.task_id = ? AND e.profile_id = ? AND p.account_id = ?`)
      .bind(eventId, input.taskId, input.profileId, input.actorAccountId),
  ]);
  const event = result[2].results[0];
  if (!event) return { ok: false, code: 'REVISION_CONFLICT_OR_TERMINAL' };
  let previous: { expectedRevision?: unknown; note?: unknown };
  try { previous = JSON.parse(event.payload_json); } catch { return { ok: false, code: 'ACTION_ID_CONFLICT' }; }
  if (!previous || event.event_type !== rule.event || event.task_revision !== revision + 1
    || event.source_type !== 'parent' || event.source_id !== input.actorAccountId
    || previous.expectedRevision !== revision || (previous.note ?? null) !== note) {
    return { ok: false, code: 'ACTION_ID_CONFLICT' };
  }
  return { ok: true, code: null, idempotent: result[0].meta.changes === 0 };
}

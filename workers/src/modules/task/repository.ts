import { ingestTaskProgress } from './progress-repository';
import { applyTaskLifecycle, type TaskLifecycleActionInput } from './lifecycle-repository';
import type { Env } from '../../db/middleware';
import {
  normalizeTaskName,
  normalizeTaskResourceSpec,
  validateTaskRequiredSeconds,
  canEditTaskCoreFields,
  type TaskLifecycleStatus,
} from './domain';

export type TaskCreateInput = {
  id: string;
  profileId: string;
  name: string;
  plannedStartAt: number;
  displayTimezone?: string | null;
  requiredSeconds: number;
  resourceSpec: Record<string, unknown>;
  createdByAccountId?: string | null;
  now?: number;
};

export type TaskEventInput = {
  id: string;
  taskId: string;
  profileId: string;
  eventType: string;
  taskRevision: number;
  sourceType: string;
  sourceId?: string | null;
  payload?: Record<string, unknown> | null;
  occurredAt?: number;
  now?: number;
};

function eventStatement(db: D1Database, input: TaskEventInput, onlyAfterChange = false) {
  const now = input.now ?? Date.now();
  return db.prepare(`INSERT INTO task_events_v1
    (id, task_id, profile_id, event_type, task_revision, source_type, source_id,
     payload_json, occurred_at, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? ${onlyAfterChange ? 'WHERE changes() = 1' : ''}`)
    .bind(input.id, input.taskId, input.profileId, input.eventType, input.taskRevision,
      input.sourceType, input.sourceId ?? null, input.payload ? JSON.stringify(input.payload) : null,
      input.occurredAt ?? now, now);
}

export function taskRowToRecord(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    normalizedName: row.normalized_name,
    plannedStartAt: Number(row.planned_start_at || 0),
    displayTimezone: row.display_timezone || null,
    requiredSeconds: Number(row.required_seconds || 0),
    resourceSpec: row.resource_spec_json ? JSON.parse(row.resource_spec_json) : null,
    lifecycleStatus: row.lifecycle_status,
    revision: Number(row.revision || 0),
    completedSeconds: Number(row.completed_seconds || 0),
    completionSource: row.completion_source || null,
    completedAt: row.completed_at || null,
    cancelledAt: row.cancelled_at || null,
    createdByAccountId: row.created_by_account_id || null,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  };
}

export function validateTaskCreateInput(input: TaskCreateInput) {
  const errors: Array<{ field: string; code: string; index?: number; value?: unknown }> = [];
  if (!input.id) errors.push({ field: 'id', code: 'REQUIRED' });
  if (!input.profileId) errors.push({ field: 'profileId', code: 'REQUIRED' });
  if (!String(input.name || '').trim()) errors.push({ field: 'name', code: 'REQUIRED' });
  const plannedStartAt = Number(input.plannedStartAt);
  if (!Number.isFinite(plannedStartAt) || plannedStartAt <= 0) errors.push({ field: 'plannedStartAt', code: 'INVALID_PLANNED_START' });
  const required = validateTaskRequiredSeconds(input.requiredSeconds);
  if (!required.ok) errors.push({ field: 'requiredSeconds', code: required.code || 'INVALID_REQUIRED_SECONDS' });
  const resource = normalizeTaskResourceSpec(input.resourceSpec || {});
  for (const error of resource.errors || []) errors.push({ ...error, field: error.field || 'resourceSpec', code: error.code || 'INVALID_RESOURCE' });
  return {
    ok: errors.length === 0,
    errors,
    normalized: errors.length === 0 ? {
      ...input,
      name: String(input.name).trim(),
      normalizedName: normalizeTaskName(input.name),
      plannedStartAt,
      requiredSeconds: required.seconds,
      resourceSpec: resource.spec,
      lifecycleStatus: 'open' as TaskLifecycleStatus,
    } : null,
  };
}

export function mergeTaskProgressIntervals(rows: Array<{ started_at?: number; ended_at?: number }>): number {
  const intervals = rows
    .map((row) => [Math.floor(Number(row.started_at || 0)), Math.floor(Number(row.ended_at || 0))])
    .filter(([start, end]) => start > 0 && end > start)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let totalMs = 0;
  let currentStart = 0;
  let currentEnd = 0;
  for (const [start, end] of intervals) {
    if (!currentStart) {
      currentStart = start;
      currentEnd = end;
      continue;
    }
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
      continue;
    }
    totalMs += currentEnd - currentStart;
    currentStart = start;
    currentEnd = end;
  }
  if (currentStart) totalMs += currentEnd - currentStart;
  return Math.max(0, Math.floor(totalMs / 1000));
}
export function createTaskRepository(env: Env) {
  return {
    async createTask(input: TaskCreateInput) {
      const validation = validateTaskCreateInput(input);
      if (!validation.ok || !validation.normalized) return validation;
      const task = validation.normalized;
      const now = Number(input.now || Date.now());
      const insert = env.DB.prepare(
        `INSERT INTO tasks_v1
         (id, profile_id, name, normalized_name, planned_start_at, display_timezone,
          required_seconds, resource_spec_json, lifecycle_status, revision,
          completed_seconds, completion_source, completed_at, cancelled_at,
          created_by_account_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 1, 0, NULL, NULL, NULL, ?, ?, ?)`
      ).bind(
        task.id,
        task.profileId,
        task.name,
        task.normalizedName,
        task.plannedStartAt,
        task.displayTimezone || null,
        task.requiredSeconds,
        JSON.stringify(task.resourceSpec),
        task.createdByAccountId || null,
        now,
        now,
      );
      await env.DB.batch([insert, eventStatement(env.DB, {
        id: `${task.id}:created:1`,
        taskId: task.id,
        profileId: task.profileId,
        eventType: 'created',
        taskRevision: 1,
        sourceType: 'parent',
        sourceId: task.createdByAccountId || null,
        payload: { name: task.name, requiredSeconds: task.requiredSeconds },
        occurredAt: now,
        now,
      })]);
      return { ok: true, task: await this.getTask(task.profileId, task.id), errors: [] };
    },

    async getTask(profileId: string, taskId: string) {
      const row = await env.DB.prepare(
        `SELECT * FROM tasks_v1 WHERE profile_id = ? AND id = ?`
      ).bind(profileId, taskId).first<any>();
      return taskRowToRecord(row);
    },

    async listTasks(profileId: string, includeHistory = false) {
      const statusClause = includeHistory ? '' : `AND lifecycle_status IN ('open', 'paused')`;
      const result = await env.DB.prepare(
        `SELECT * FROM tasks_v1
         WHERE profile_id = ? ${statusClause}
         ORDER BY planned_start_at ASC, normalized_name ASC, id ASC
         LIMIT 500`
      ).bind(profileId).all<any>();
      return (result.results || []).map(taskRowToRecord).filter(Boolean);
    },

    async updateTaskCoreFields(profileId: string, taskId: string, patch: Partial<TaskCreateInput> & { expectedRevision: number }, now = Date.now(), actorAccountId: string | null = null) {
      if (!Number.isSafeInteger(patch.expectedRevision) || patch.expectedRevision <= 0) return { ok: false, code: 'EXPECTED_REVISION_REQUIRED' };
      const current = await this.getTask(profileId, taskId);
      if (!current) return { ok: false, code: 'TASK_NOT_FOUND' };
      if (!canEditTaskCoreFields(current, now)) return { ok: false, code: 'TASK_CORE_FIELDS_FROZEN' };
      const validation = validateTaskCreateInput({
        id: taskId,
        profileId,
        name: patch.name ?? current.name,
        plannedStartAt: patch.plannedStartAt ?? current.plannedStartAt,
        displayTimezone: patch.displayTimezone ?? current.displayTimezone,
        requiredSeconds: patch.requiredSeconds ?? current.requiredSeconds,
        resourceSpec: (patch.resourceSpec as Record<string, unknown>) ?? current.resourceSpec ?? {},
        createdByAccountId: current.createdByAccountId,
        now,
      });
      if (!validation.ok || !validation.normalized) return validation;
      const task = validation.normalized;
      const update = env.DB.prepare(
        `UPDATE tasks_v1
         SET name = ?, normalized_name = ?, planned_start_at = ?, display_timezone = ?,
             required_seconds = ?, resource_spec_json = ?, revision = revision + 1, updated_at = ?
         WHERE profile_id = ? AND id = ? AND revision = ?
           AND lifecycle_status = 'open' AND completed_seconds = 0 AND planned_start_at > ?`
      ).bind(
        task.name,
        task.normalizedName,
        task.plannedStartAt,
        task.displayTimezone || null,
        task.requiredSeconds,
        JSON.stringify(task.resourceSpec),
        now,
        profileId,
        taskId,
        patch.expectedRevision,
        now,
      );
      const result = await env.DB.batch([update, eventStatement(env.DB, {
        id: `${taskId}:updated:${patch.expectedRevision + 1}`, taskId, profileId,
        eventType: 'updated', taskRevision: patch.expectedRevision + 1,
        sourceType: 'parent', sourceId: actorAccountId,
        payload: { expectedRevision: patch.expectedRevision }, now,
      }, true)]);
      const changed = Number(result[0].meta?.changes || 0) > 0;
      if (!changed) return { ok: false, code: 'REVISION_CONFLICT_OR_FROZEN' };
      return { ok: true, task: await this.getTask(profileId, taskId), errors: [] };
    },

    async applyLifecycleAction(input: TaskLifecycleActionInput) {
      const result = await applyTaskLifecycle(env.DB, input);
      if (!result.ok) return result;
      return { ...result, task: await this.getTask(input.profileId, input.taskId) };
    },

    async recordDeviceState(input: { profileId: string; deviceId: string; taskVersion?: number; activeSummary?: unknown; now?: number }) {
      const now = input.now ?? Date.now();
      const version = input.taskVersion ?? 0;
      if (!Number.isSafeInteger(version) || version < 0 || !Number.isSafeInteger(now) || now <= 0) return false;
      const raw = input.activeSummary && typeof input.activeSummary === 'object' ? input.activeSummary as Record<string, unknown> : {};
      const activeTaskIds = Array.isArray(raw.activeTaskIds) ? [...new Set(raw.activeTaskIds.filter(
        (id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 80).slice(0, 100))] : [];
      const nextTaskAt = typeof raw.nextTaskAt === 'number' && Number.isSafeInteger(raw.nextTaskAt) && raw.nextTaskAt > 0 ? raw.nextTaskAt : null;
      const summary = JSON.stringify({ activeTaskIds, activeTaskCount: activeTaskIds.length, nextTaskAt });
      const result = await env.DB.prepare(
        `INSERT INTO task_device_state_v1
         (device_id, profile_id, capable, task_version, active_summary_json, reported_at, updated_at)
         SELECT ?, ?, 1, ?, ?, ?, ? WHERE EXISTS
           (SELECT 1 FROM devices WHERE id = ? AND profile_id = ? AND COALESCE(status, 'bound') = 'bound')
         ON CONFLICT(device_id) DO UPDATE SET profile_id = excluded.profile_id, capable = 1,
           task_version = excluded.task_version, active_summary_json = excluded.active_summary_json,
           reported_at = excluded.reported_at, updated_at = excluded.updated_at`
      ).bind(input.deviceId, input.profileId, version, summary, now, now, input.deviceId, input.profileId).run();
      return Number(result.meta.changes) > 0;
    },

    async ingestProgressSegments(profileId: string, deviceId: string, values: unknown, now = Date.now()) {
      return ingestTaskProgress(env.DB, profileId, deviceId, values, now);
    },
  };
}

import type { Env } from '../db/middleware';
import {
  normalizeTaskName,
  normalizeTaskResourceSpec,
  normalizeTaskLifecycleStatus,
  validateTaskRequiredSeconds,
  canEditTaskCoreFields,
} from '../../../extension/core/task-management.js';

export type TaskLifecycleStatus = 'open' | 'paused' | 'completed' | 'cancelled';

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
  const errors: Array<{ field: string; code: string }> = [];
  if (!input.id) errors.push({ field: 'id', code: 'REQUIRED' });
  if (!input.profileId) errors.push({ field: 'profileId', code: 'REQUIRED' });
  if (!String(input.name || '').trim()) errors.push({ field: 'name', code: 'REQUIRED' });
  const plannedStartAt = Number(input.plannedStartAt);
  if (!Number.isFinite(plannedStartAt) || plannedStartAt <= 0) errors.push({ field: 'plannedStartAt', code: 'INVALID_PLANNED_START' });
  const required = validateTaskRequiredSeconds(input.requiredSeconds);
  if (!required.ok) errors.push({ field: 'requiredSeconds', code: required.code || 'INVALID_REQUIRED_SECONDS' });
  const resource = normalizeTaskResourceSpec(input.resourceSpec || {});
  for (const error of resource.errors || []) errors.push({ field: error.field || 'resourceSpec', code: error.code || 'INVALID_RESOURCE' });
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

export function createTaskRepository(env: Env) {
  return {
    async createTask(input: TaskCreateInput) {
      const validation = validateTaskCreateInput(input);
      if (!validation.ok || !validation.normalized) return validation;
      const task = validation.normalized;
      const now = Number(input.now || Date.now());
      await env.DB.prepare(
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
      ).run();
      await this.appendTaskEvent({
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
      });
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

    async appendTaskEvent(input: TaskEventInput) {
      const now = Number(input.now || Date.now());
      const occurredAt = Number(input.occurredAt || now);
      await env.DB.prepare(
        `INSERT OR IGNORE INTO task_events_v1
         (id, task_id, profile_id, event_type, task_revision, source_type, source_id,
          payload_json, occurred_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        input.id,
        input.taskId,
        input.profileId,
        input.eventType,
        input.taskRevision,
        input.sourceType,
        input.sourceId || null,
        input.payload ? JSON.stringify(input.payload) : null,
        occurredAt,
        now,
      ).run();
    },

    async updateTaskCoreFields(profileId: string, taskId: string, patch: Partial<TaskCreateInput> & { expectedRevision: number }, now = Date.now()) {
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
      const result = await env.DB.prepare(
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
      ).run();
      const changed = Number(result.meta?.changes || 0) > 0;
      if (!changed) return { ok: false, code: 'REVISION_CONFLICT_OR_FROZEN' };
      return { ok: true, task: await this.getTask(profileId, taskId), errors: [] };
    },

    async updateLifecycle(profileId: string, taskId: string, lifecycleStatus: TaskLifecycleStatus, expectedRevision: number, now = Date.now()) {
      const status = normalizeTaskLifecycleStatus(lifecycleStatus) as TaskLifecycleStatus;
      const completionSource = status === 'completed' ? 'parent' : null;
      const completedAt = status === 'completed' ? now : null;
      const cancelledAt = status === 'cancelled' ? now : null;
      const allowedCurrent = status === 'open' ? "'paused'" : "'open', 'paused'";
      const result = await env.DB.prepare(
        `UPDATE tasks_v1
         SET lifecycle_status = ?, revision = revision + 1, completion_source = COALESCE(?, completion_source),
             completed_at = COALESCE(?, completed_at), cancelled_at = COALESCE(?, cancelled_at), updated_at = ?
         WHERE profile_id = ? AND id = ? AND revision = ? AND lifecycle_status IN (${allowedCurrent})`
      ).bind(status, completionSource, completedAt, cancelledAt, now, profileId, taskId, expectedRevision).run();
      const changed = Number(result.meta?.changes || 0) > 0;
      return { ok: changed, code: changed ? null : 'REVISION_CONFLICT_OR_TERMINAL' };
    },

    async updateProgressProjection(profileId: string, taskId: string, completedSeconds: number, revision: number, now = Date.now()) {
      const seconds = Math.max(0, Math.floor(Number(completedSeconds) || 0));
      await env.DB.prepare(
        `UPDATE tasks_v1
         SET completed_seconds = MIN(required_seconds, ?),
             lifecycle_status = CASE WHEN ? >= required_seconds THEN 'completed' ELSE lifecycle_status END,
             completion_source = CASE WHEN ? >= required_seconds THEN COALESCE(completion_source, 'usage') ELSE completion_source END,
             completed_at = CASE WHEN ? >= required_seconds THEN COALESCE(completed_at, ?) ELSE completed_at END,
             updated_at = ?
         WHERE profile_id = ? AND id = ? AND revision = ? AND lifecycle_status = 'open'`
      ).bind(seconds, seconds, seconds, seconds, now, now, profileId, taskId, revision).run();
    },
  };
}
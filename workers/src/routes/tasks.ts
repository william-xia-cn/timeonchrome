import { json, Env, verifyAccountToken } from '../db/middleware';
import { deviceUnboundResponse, verifyDeviceTokenFromRequest } from './deviceIdentity';
import { createTaskRepository, TaskLifecycleStatus } from '../tasks/taskRepository';
import { TASK_MANAGEMENT_V1_CAPABILITY } from '../../../extension/core/task-management.js';

const TASK_CAPABILITY_ONLINE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type CapabilityRow = {
  id: string;
  device_name?: string | null;
  last_seen?: number | null;
  task_management_v1_capable?: number | null;
  task_capability_reported_at?: number | null;
  task_sync_version?: number | null;
};

function isMissingCapabilityColumn(error: any): boolean {
  const message = String(error?.message || error || '');
  return /no such column/i.test(message) && /task_(management_v1_capable|capabilities_json|capability_reported_at|sync_version|active_summary_json)/i.test(message);
}

async function verifyProfileOwner(request: Request, env: Env, profileId: string): Promise<string | Response> {
  const accountId = await verifyAccountToken(request, env.JWT_SECRET);
  if (!accountId) return json({ error: 'Unauthorized' }, 401);
  const owner = await env.DB.prepare(
    `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
  ).bind(profileId, accountId).first<{ id: string }>();
  if (!owner) return json({ error: 'Profile not found' }, 404);
  return accountId;
}

async function readCapabilitySummary(env: Env, profileId: string, now = Date.now()) {
  let rows: CapabilityRow[] = [];
  try {
    const result = await env.DB.prepare(
      `SELECT id, device_name, last_seen, task_management_v1_capable, task_capability_reported_at, task_sync_version
       FROM devices
       WHERE profile_id = ? AND COALESCE(status, 'bound') = 'bound'
       ORDER BY COALESCE(last_seen, 0) DESC`
    ).bind(profileId).all<CapabilityRow>();
    rows = result.results || [];
  } catch (error: any) {
    if (!isMissingCapabilityColumn(error)) throw error;
    const result = await env.DB.prepare(
      `SELECT id, device_name, last_seen
       FROM devices
       WHERE profile_id = ? AND COALESCE(status, 'bound') = 'bound'
       ORDER BY COALESCE(last_seen, 0) DESC`
    ).bind(profileId).all<CapabilityRow>();
    rows = (result.results || []).map((row) => ({ ...row, task_management_v1_capable: 0 }));
  }

  const onlineCutoff = now - TASK_CAPABILITY_ONLINE_WINDOW_MS;
  const devices = rows.map((row) => {
    const lastSeen = Number(row.last_seen || 0);
    const online = lastSeen > 0 && lastSeen >= onlineCutoff;
    const capable = Number(row.task_management_v1_capable || 0) === 1;
    return {
      id: row.id,
      name: row.device_name || 'Chrome Extension',
      lastSeen,
      online,
      taskManagementV1: capable,
      reportedAt: row.task_capability_reported_at || null,
      taskSyncVersion: Number(row.task_sync_version || 0),
    };
  });
  const onlineDevices = devices.filter((device) => device.online);
  const unsupportedOnlineDevices = onlineDevices.filter((device) => !device.taskManagementV1);
  return {
    capability: TASK_MANAGEMENT_V1_CAPABILITY,
    onlineWindowMs: TASK_CAPABILITY_ONLINE_WINDOW_MS,
    totalBoundDevices: devices.length,
    onlineDeviceCount: onlineDevices.length,
    canCreateTasks: onlineDevices.length > 0 && unsupportedOnlineDevices.length === 0,
    unsupportedOnlineDevices,
    devices,
  };
}

function actionToLifecycleStatus(action: unknown): TaskLifecycleStatus | null {
  switch (String(action || '').trim().toLowerCase()) {
    case 'pause':
      return 'paused';
    case 'resume':
      return 'open';
    case 'complete':
      return 'completed';
    case 'cancel':
      return 'cancelled';
    default:
      return null;
  }
}

function statusForError(code: string | null | undefined): number {
  if (code === 'TASK_NOT_FOUND') return 404;
  if (code === 'TASK_CORE_FIELDS_FROZEN') return 409;
  if (code === 'REVISION_CONFLICT_OR_FROZEN' || code === 'REVISION_CONFLICT_OR_TERMINAL') return 409;
  return 400;
}

async function findTaskEvent(env: Env, eventId: string) {
  return env.DB.prepare(
    `SELECT id FROM task_events_v1 WHERE id = ?`
  ).bind(eventId).first<{ id: string }>();
}

export const tasksRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const repo = createTaskRepository(env);

    const deviceTasksMatch = path === '/device/tasks/v1';
    if (request.method === 'GET' && deviceTasksMatch) {
      const deviceIdentity = await verifyDeviceTokenFromRequest(request, env, { updateLastSeen: true });
      if (!deviceIdentity) return json({ error: 'Invalid device token' }, 401);
      if (deviceIdentity.unbound) return deviceUnboundResponse(deviceIdentity.deviceId);
      const tasks = await repo.listTasks(deviceIdentity.profileId, false);
      return json({
        success: true,
        profile_id: deviceIdentity.profileId,
        device_id: deviceIdentity.deviceId,
        serverTime: Date.now(),
        capability: TASK_MANAGEMENT_V1_CAPABILITY,
        tasks,
      });
    }

    const listMatch = path.match(/^\/profiles\/([^/]+)\/tasks\/v1$/);
    const taskMatch = path.match(/^\/profiles\/([^/]+)\/tasks\/([^/]+)\/v1$/);
    const actionMatch = path.match(/^\/profiles\/([^/]+)\/tasks\/([^/]+)\/actions\/v1$/);
    const profileId = listMatch?.[1] || taskMatch?.[1] || actionMatch?.[1] || null;
    if (!profileId) return json({ error: 'Not found' }, 404);

    const owner = await verifyProfileOwner(request, env, profileId);
    if (owner instanceof Response) return owner;
    const accountId = owner;

    if (request.method === 'GET' && listMatch) {
      const includeHistory = url.searchParams.get('includeHistory') === '1' || url.searchParams.get('includeHistory') === 'true';
      const [tasks, capabilitySummary] = await Promise.all([
        repo.listTasks(profileId, includeHistory),
        readCapabilitySummary(env, profileId),
      ]);
      return json({ success: true, profile_id: profileId, tasks, capabilitySummary });
    }

    if (request.method === 'POST' && listMatch) {
      const capabilitySummary = await readCapabilitySummary(env, profileId);
      if (!capabilitySummary.canCreateTasks) {
        return json({
          error: 'Task Management V1 capability is not ready for all online devices',
          code: 'TASK_CAPABILITY_REQUIRED',
          capabilitySummary,
        }, 409);
      }
      const body = await request.json<any>().catch(() => ({}));
      const result: any = await repo.createTask({
        id: crypto.randomUUID(),
        profileId,
        name: body.name,
        plannedStartAt: body.plannedStartAt,
        displayTimezone: body.displayTimezone || null,
        requiredSeconds: body.requiredSeconds,
        resourceSpec: body.resourceSpec || {},
        createdByAccountId: accountId,
        now: Date.now(),
      });
      if (!result.ok) return json({ error: 'Invalid task', code: 'INVALID_TASK', errors: result.errors || [] }, 400);
      return json({ success: true, task: result.task, capabilitySummary }, 201);
    }

    if (request.method === 'PATCH' && taskMatch) {
      const taskId = taskMatch[2];
      const body = await request.json<any>().catch(() => ({}));
      const expectedRevision = Number(body.expectedRevision);
      if (!Number.isInteger(expectedRevision) || expectedRevision <= 0) {
        return json({ error: 'expectedRevision required', code: 'EXPECTED_REVISION_REQUIRED' }, 400);
      }
      const result: any = await repo.updateTaskCoreFields(profileId, taskId, {
        name: body.name,
        plannedStartAt: body.plannedStartAt,
        displayTimezone: body.displayTimezone,
        requiredSeconds: body.requiredSeconds,
        resourceSpec: body.resourceSpec,
        expectedRevision,
      }, Date.now());
      if (!result.ok) return json({ error: result.code || 'Task update failed', code: result.code || 'TASK_UPDATE_FAILED', errors: result.errors || [] }, statusForError(result.code));
      await repo.appendTaskEvent({
        id: `${taskId}:updated:${expectedRevision + 1}`,
        taskId,
        profileId,
        eventType: 'updated',
        taskRevision: expectedRevision + 1,
        sourceType: 'parent',
        sourceId: accountId,
        payload: { expectedRevision },
      });
      return json({ success: true, task: result.task });
    }

    if (request.method === 'POST' && actionMatch) {
      const taskId = actionMatch[2];
      const body = await request.json<any>().catch(() => ({}));
      const expectedRevision = Number(body.expectedRevision);
      const action = String(body.action || '').trim().toLowerCase();
      const status = actionToLifecycleStatus(action);
      if (!status) return json({ error: 'Invalid task action', code: 'INVALID_TASK_ACTION' }, 400);
      if (!Number.isInteger(expectedRevision) || expectedRevision <= 0) {
        return json({ error: 'expectedRevision required', code: 'EXPECTED_REVISION_REQUIRED' }, 400);
      }
      const actionId = String(body.actionId || body.idempotencyKey || '').trim().slice(0, 128);
      if (!actionId) return json({ error: 'actionId required', code: 'ACTION_ID_REQUIRED' }, 400);
      const eventId = `${taskId}:action:${actionId}`;
      const prior = await findTaskEvent(env, eventId);
      if (prior) return json({ success: true, idempotent: true, task: await repo.getTask(profileId, taskId) });

      const result = await repo.updateLifecycle(profileId, taskId, status, expectedRevision, Date.now());
      if (!result.ok) return json({ error: result.code || 'Task action failed', code: result.code || 'TASK_ACTION_FAILED' }, statusForError(result.code));
      await repo.appendTaskEvent({
        id: eventId,
        taskId,
        profileId,
        eventType: action,
        taskRevision: expectedRevision + 1,
        sourceType: 'parent',
        sourceId: accountId,
        payload: { expectedRevision, note: String(body.note || '').slice(0, 500) || null },
      });
      return json({ success: true, task: await repo.getTask(profileId, taskId) });
    }

    return json({ error: 'Method not allowed' }, 405);
  }
};
import { json, Env, verifyAccountToken } from '../../db/middleware';
import { deviceUnboundResponse, verifyDeviceTokenFromRequest } from '../../routes/deviceIdentity';
import { createTaskRepository } from './repository';
import { TASK_CAPABILITY, type TaskLifecycleStatus } from './domain';

const TASK_CAPABILITY_ONLINE_WINDOW_MS = 30 * 60 * 1000;

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
  const result = await env.DB.prepare(
    `SELECT d.id, d.device_name, d.last_seen, s.capable, s.reported_at, s.task_version
     FROM devices d LEFT JOIN task_device_state_v1 s ON s.device_id = d.id
     WHERE d.profile_id = ? AND COALESCE(d.status, 'bound') = 'bound'
     ORDER BY COALESCE(d.last_seen, 0) DESC`
  ).bind(profileId).all<any>();
  const onlineCutoff = now - TASK_CAPABILITY_ONLINE_WINDOW_MS;
  const devices = (result.results || []).map((row) => ({
    id: row.id, name: row.device_name || 'Chrome Extension', lastSeen: Number(row.last_seen || 0),
    online: Number(row.last_seen || 0) >= onlineCutoff, taskManagementV1: Number(row.capable || 0) === 1,
    reportedAt: row.reported_at || null, taskSyncVersion: Number(row.task_version || 0),
  }));
  const onlineDevices = devices.filter((device) => device.online);
  const unsupportedOnlineDevices = onlineDevices.filter((device) => !device.taskManagementV1);
  return { capability: TASK_CAPABILITY, onlineWindowMs: TASK_CAPABILITY_ONLINE_WINDOW_MS, totalBoundDevices: devices.length, onlineDeviceCount: onlineDevices.length, canCreateTasks: onlineDevices.length > 0 && unsupportedOnlineDevices.length === 0, unsupportedOnlineDevices, devices };
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

function eventTypeForAction(action: string): string {
  return ({ pause: 'paused', resume: 'resumed', complete: 'completed', cancel: 'cancelled' } as Record<string, string>)[action] || action;
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

export const taskModuleRouter = {
  matches(path: string): boolean {
    return path.startsWith('/device/task-runtime/v1/') || /^\/profiles\/[^/]+\/task-runtime\/v1\/tasks(?:\/|$)/.test(path);
  },
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const repo = createTaskRepository(env);

    const deviceTasksMatch = path === '/device/task-runtime/v1/tasks';
    const deviceProgressMatch = path === '/device/task-runtime/v1/progress';
    const deviceHeartbeatMatch = path === '/device/task-runtime/v1/heartbeat';
    if (request.method === 'GET' && deviceTasksMatch) {
      const deviceIdentity = await verifyDeviceTokenFromRequest(request, env, { updateLastSeen: true });
      if (!deviceIdentity) return json({ error: 'Invalid device token' }, 401);
      if (deviceIdentity.unbound) return deviceUnboundResponse(deviceIdentity.deviceId);
      await repo.recordDeviceState({ profileId: deviceIdentity.profileId, deviceId: deviceIdentity.deviceId });
      const tasks = await repo.listTasks(deviceIdentity.profileId, false);
      return json({
        success: true,
        profile_id: deviceIdentity.profileId,
        device_id: deviceIdentity.deviceId,
        serverTime: Date.now(),
        capability: TASK_CAPABILITY,
        tasks,
      });
    }

    if (request.method === 'POST' && (deviceProgressMatch || deviceHeartbeatMatch)) {
      const deviceIdentity = await verifyDeviceTokenFromRequest(request, env, { updateLastSeen: false });
      if (!deviceIdentity) return json({ error: 'Invalid device token' }, 401);
      if (deviceIdentity.unbound) return deviceUnboundResponse(deviceIdentity.deviceId);
      const body = await request.json<any>().catch(() => ({}));
      if (deviceHeartbeatMatch) {
        await repo.recordDeviceState({ profileId: deviceIdentity.profileId, deviceId: deviceIdentity.deviceId, taskVersion: body.taskVersion, activeSummary: body.activeSummary });
        return json({ success: true, capability: TASK_CAPABILITY, serverTime: Date.now() });
      }
      const result = await repo.ingestProgressSegments(deviceIdentity.profileId, deviceIdentity.deviceId, body.segments || []);
      return json({ success: true, ...result });
    }

    const listMatch = path.match(/^\/profiles\/([^/]+)\/task-runtime\/v1\/tasks$/);
    const taskMatch = path.match(/^\/profiles\/([^/]+)\/task-runtime\/v1\/tasks\/([^/]+)$/);
    const actionMatch = path.match(/^\/profiles\/([^/]+)\/task-runtime\/v1\/tasks\/([^/]+)\/actions$/);
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
        eventType: eventTypeForAction(action),
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
import { json, Env, verifyAccountToken } from '../../db/middleware';
import { deviceUnboundResponse, verifyDeviceTokenFromRequest } from '../../routes/deviceIdentity';
import { createTaskRepository } from './repository';
import { TASK_CAPABILITY } from './domain';
import { validateTaskResourcePolicy } from './resource-policy';

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
     FROM devices d LEFT JOIN task_device_state_v1 s ON s.device_id = d.id AND s.profile_id = d.profile_id
     WHERE d.profile_id = ? AND COALESCE(d.status, 'bound') = 'bound'
     ORDER BY COALESCE(d.last_seen, 0) DESC`
  ).bind(profileId).all<{ id: string; device_name: string | null; last_seen: number | null;
    capable: number | null; reported_at: number | null; task_version: number | null }>();
  const onlineCutoff = now - TASK_CAPABILITY_ONLINE_WINDOW_MS;
  const devices = (result.results || []).map((row) => ({
    id: row.id, name: row.device_name || 'Chrome Extension', lastSeen: Number(row.last_seen || 0),
    online: Number(row.last_seen || 0) >= onlineCutoff,
    taskManagementV1: Number(row.capable || 0) === 1 && Number(row.reported_at || 0) >= onlineCutoff,
    reportedAt: row.reported_at || null, taskSyncVersion: Number(row.task_version || 0),
  }));
  const onlineDevices = devices.filter((device) => device.online);
  const unsupportedOnlineDevices = onlineDevices.filter((device) => !device.taskManagementV1);
  return { capability: TASK_CAPABILITY, onlineWindowMs: TASK_CAPABILITY_ONLINE_WINDOW_MS, totalBoundDevices: devices.length, onlineDeviceCount: onlineDevices.length, canCreateTasks: onlineDevices.length > 0 && unsupportedOnlineDevices.length === 0, unsupportedOnlineDevices, devices };
}
function statusForError(code: string | null | undefined): number {
  if (code === 'TASK_NOT_FOUND') return 404;
  if (code === 'TASK_CORE_FIELDS_FROZEN') return 409;
  if (code === 'ACTION_ID_CONFLICT') return 409;
  if (code === 'REVISION_CONFLICT_OR_FROZEN' || code === 'REVISION_CONFLICT_OR_TERMINAL') return 409;
  return 400;
}

async function readBody(request: Request): Promise<Record<string, unknown> | Response> {
  const limit = 256 * 1024;
  if (Number(request.headers.get('Content-Length')) > limit) return json({ code: 'TASK_BODY_TOO_LARGE' }, 413);
  if (!request.body) return json({ code: 'INVALID_TASK_BODY' }, 400);
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = '', bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) { await reader.cancel(); return json({ code: 'TASK_BODY_TOO_LARGE' }, 413); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    const body: unknown = JSON.parse(text + decoder.decode());
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ code: 'INVALID_TASK_BODY' }, 400);
    return body as Record<string, unknown>;
  } catch { return json({ code: 'INVALID_TASK_BODY' }, 400); }
  finally { reader.releaseLock(); }
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
      if (!deviceIdentity?.deviceId) return json({ error: 'Invalid device token' }, 401);
      if (deviceIdentity.unbound) return deviceUnboundResponse(deviceIdentity.deviceId);
      if (!await repo.recordDeviceState({ profileId: deviceIdentity.profileId, deviceId: deviceIdentity.deviceId })) return deviceUnboundResponse(deviceIdentity.deviceId);
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
      if (!deviceIdentity?.deviceId) return json({ error: 'Invalid device token' }, 401);
      if (deviceIdentity.unbound) return deviceUnboundResponse(deviceIdentity.deviceId);
      const body = await readBody(request);
      if (body instanceof Response) return body;
      if (deviceHeartbeatMatch) {
        if (body.taskVersion !== undefined && (typeof body.taskVersion !== 'number' || !Number.isSafeInteger(body.taskVersion) || body.taskVersion < 0)) return json({ code: 'INVALID_TASK_VERSION' }, 400);
        const recorded = await repo.recordDeviceState({ profileId: deviceIdentity.profileId, deviceId: deviceIdentity.deviceId, taskVersion: body.taskVersion as number | undefined, activeSummary: body.activeSummary });
        if (!recorded) return deviceUnboundResponse(deviceIdentity.deviceId);
        return json({ success: true, capability: TASK_CAPABILITY, serverTime: Date.now() });
      }
      if (!Array.isArray(body.segments)) return json({ code: 'INVALID_TASK_SEGMENTS' }, 400);
      const result = await repo.ingestProgressSegments(deviceIdentity.profileId, deviceIdentity.deviceId, body.segments);
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
      const body = await readBody(request);
      if (body instanceof Response) return body;
      if (typeof body.name !== 'string' || typeof body.plannedStartAt !== 'number' || typeof body.requiredSeconds !== 'number') return json({ code: 'INVALID_TASK' }, 400);
      const resourceSpec = body.resourceSpec && typeof body.resourceSpec === 'object' ? body.resourceSpec as Record<string, unknown> : {};
      const policyError = await validateTaskResourcePolicy(env, profileId, resourceSpec);
      if (policyError) return policyError;
      const result = await repo.createTask({
        id: crypto.randomUUID(),
        profileId,
        name: body.name,
        plannedStartAt: body.plannedStartAt,
        displayTimezone: typeof body.displayTimezone === 'string' ? body.displayTimezone : null,
        requiredSeconds: body.requiredSeconds,
        resourceSpec,
        createdByAccountId: accountId,
        now: Date.now(),
      });
      if (!result.ok) return json({ error: 'Invalid task', code: 'INVALID_TASK', errors: result.errors || [] }, 400);
      return json({ success: true, task: 'task' in result ? result.task : null, capabilitySummary }, 201);
    }

    if (request.method === 'PATCH' && taskMatch) {
      const taskId = taskMatch[2];
      const body = await readBody(request);
      if (body instanceof Response) return body;
      const expectedRevision = body.expectedRevision;
      for (const [key, type] of [['name', 'string'], ['plannedStartAt', 'number'], ['requiredSeconds', 'number'], ['displayTimezone', 'string']]) {
        if (body[key] !== undefined && typeof body[key] !== type) return json({ code: 'INVALID_TASK', field: key }, 400);
      }
      if (body.resourceSpec !== undefined && (!body.resourceSpec || typeof body.resourceSpec !== 'object' || Array.isArray(body.resourceSpec))) return json({ code: 'INVALID_TASK', field: 'resourceSpec' }, 400);
      if (typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) || expectedRevision <= 0) {
        return json({ error: 'expectedRevision required', code: 'EXPECTED_REVISION_REQUIRED' }, 400);
      }
      const currentTask = await repo.getTask(profileId, taskId);
      if (!currentTask) return json({ code: 'TASK_NOT_FOUND' }, 404);
      const policyError = await validateTaskResourcePolicy(env, profileId,
        body.resourceSpec === undefined ? currentTask.resourceSpec : body.resourceSpec as Record<string, unknown>);
      if (policyError) return policyError;
      const result = await repo.updateTaskCoreFields(profileId, taskId, {
        name: typeof body.name === 'string' ? body.name : undefined,
        plannedStartAt: typeof body.plannedStartAt === 'number' ? body.plannedStartAt : undefined,
        displayTimezone: typeof body.displayTimezone === 'string' ? body.displayTimezone : undefined,
        requiredSeconds: typeof body.requiredSeconds === 'number' ? body.requiredSeconds : undefined,
        resourceSpec: body.resourceSpec && typeof body.resourceSpec === 'object' ? body.resourceSpec as Record<string, unknown> : undefined,
        expectedRevision,
      }, Date.now(), accountId);
      if (!result.ok) {
        const code = 'code' in result ? result.code : 'TASK_UPDATE_FAILED';
        return json({ error: code, code, errors: 'errors' in result ? result.errors : [] }, statusForError(code));
      }
      return json({ success: true, task: 'task' in result ? result.task : null });
    }

    if (request.method === 'POST' && actionMatch) {
      const taskId = actionMatch[2];
      const body = await readBody(request);
      if (body instanceof Response) return body;
      const result = await repo.applyLifecycleAction({
        profileId, taskId, actorAccountId: accountId, action: body.action,
        actionId: body.actionId ?? body.idempotencyKey, expectedRevision: body.expectedRevision, note: body.note,
      });
      if (!result.ok) return json({ error: result.code || 'Task action failed', code: result.code || 'TASK_ACTION_FAILED' }, statusForError(result.code));
      return json({ success: true, idempotent: 'idempotent' in result && result.idempotent, task: 'task' in result ? result.task : null });
    }

    return json({ error: 'Method not allowed' }, 405);
  }
};

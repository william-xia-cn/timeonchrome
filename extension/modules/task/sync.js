// Task-owned cache, pull and alarm helpers.

import { taskDeviceRequest } from './transport.js';
import {
  TASK_MANAGEMENT_V1_CAPABILITY,
  getEnforcingTasks,
  getNextTaskAlarmTime,
  normalizeTaskRecord,
} from './domain.js';

export const TASK_CACHE_KEY = 'task_management_v1_cache';
export const TASK_PULL_ALARM = 'taskManagementPull';
export const TASK_START_ALARM = 'taskManagementStart';
export const TASK_PULL_PERIOD_MINUTES = 1;
export const TASK_CACHE_SCHEMA_VERSION = 1;

function getStorageArea() {
  return globalThis.chrome?.storage?.local || null;
}

function getAlarmArea() {
  return globalThis.chrome?.alarms || null;
}

function readStorage(keys) {
  const storage = getStorageArea();
  if (!storage) return Promise.resolve({});
  return storage.get(keys);
}

function writeStorage(values) {
  const storage = getStorageArea();
  if (!storage) return Promise.resolve();
  return storage.set(values);
}

function clearAlarm(alarmName, alarmApi = getAlarmArea()) {
  if (!alarmApi?.clear) return Promise.resolve(false);
  return alarmApi.clear(alarmName).catch(() => false);
}

export function normalizeTaskCachePayload(payload = {}, nowMs = Date.now()) {
  const tasks = (Array.isArray(payload.tasks) ? payload.tasks : []).map((task) => normalizeTaskRecord(task, nowMs));
  const taskVersion = Number(payload.taskVersion ?? payload.task_version ?? payload.version ?? 0) || Math.max(0, ...tasks.map((task) => task.revision || 0));
  return {
    schemaVersion: TASK_CACHE_SCHEMA_VERSION,
    capability: TASK_MANAGEMENT_V1_CAPABILITY,
    pulledAt: nowMs,
    serverTime: Number(payload.serverTime ?? payload.server_time ?? nowMs) || nowMs,
    taskVersion,
    tasks,
    error: null,
  };
}

export async function getTaskCache() {
  const values = await readStorage(TASK_CACHE_KEY);
  return values?.[TASK_CACHE_KEY] || null;
}

export async function saveTaskCache(cache) {
  await writeStorage({ [TASK_CACHE_KEY]: cache });
  return cache;
}

export async function saveTaskCacheError(error, nowMs = Date.now()) {
  const existing = await getTaskCache();
  const cache = {
    ...(existing || {
      schemaVersion: TASK_CACHE_SCHEMA_VERSION,
      capability: TASK_MANAGEMENT_V1_CAPABILITY,
      taskVersion: 0,
      tasks: [],
    }),
    lastPullAttemptAt: nowMs,
    lastAttemptAt: nowMs,
    error: error?.message || String(error || 'task_pull_failed'),
  };
  await saveTaskCache(cache);
  return cache;
}

export async function pullTaskCache({ reason = 'manual', nowMs = Date.now() } = {}) {
  const existing = await getTaskCache();
  try {
    const payload = await taskDeviceRequest('GET', '/device/task-runtime/v1/tasks');
    const cache = normalizeTaskCachePayload(payload || {}, nowMs);
    cache.lastHeartbeatAt = existing?.lastHeartbeatAt || null;
    cache.lastHeartbeatAttemptAt = existing?.lastHeartbeatAttemptAt || null;
    cache.heartbeatReason = existing?.heartbeatReason || null;
    cache.heartbeatError = existing?.heartbeatError || null;
    cache.reason = reason;
    cache.lastPullAt = nowMs;
    cache.lastPullAttemptAt = nowMs;
    cache.pullError = null;
    await saveTaskCache(cache);
    await scheduleNextTaskAlarm(cache.tasks, nowMs);
    return { ok: true, cache };
  } catch (error) {
    const cache = await saveTaskCacheError(error, nowMs);
    return { ok: false, error: cache.error, cache };
  }
}

export async function sendTaskHeartbeat({ reason = 'manual', nowMs = Date.now() } = {}) {
  const existing = await getTaskCache();
  const base = existing || {
    schemaVersion: TASK_CACHE_SCHEMA_VERSION,
    capability: TASK_MANAGEMENT_V1_CAPABILITY,
    taskVersion: 0,
    tasks: [],
  };
  const heartbeat = buildTaskHeartbeatPayload(base, nowMs);
  try {
    await taskDeviceRequest('POST', '/device/task-runtime/v1/heartbeat', {
      taskVersion: heartbeat.taskVersion,
      activeSummary: heartbeat.taskActiveSummary,
      capabilities: heartbeat.capabilities,
      reason,
    });
    const cache = {
      ...base,
      capability: TASK_MANAGEMENT_V1_CAPABILITY,
      lastHeartbeatAttemptAt: nowMs,
      lastHeartbeatAt: nowMs,
      heartbeatReason: reason,
      heartbeatError: null,
    };
    await saveTaskCache(cache);
    return { ok: true, cache };
  } catch (error) {
    const cache = {
      ...base,
      capability: TASK_MANAGEMENT_V1_CAPABILITY,
      lastHeartbeatAttemptAt: nowMs,
      heartbeatReason: reason,
      heartbeatError: error?.message || String(error || 'task_heartbeat_failed'),
    };
    await saveTaskCache(cache);
    return { ok: false, error: cache.heartbeatError, cache };
  }
}

export function setupTaskAlarms(alarmApi = getAlarmArea()) {
  if (!alarmApi?.create) return;
  alarmApi.create(TASK_PULL_ALARM, { periodInMinutes: TASK_PULL_PERIOD_MINUTES });
}

export async function scheduleNextTaskAlarm(tasksOrCache = null, nowMs = Date.now(), alarmApi = getAlarmArea()) {
  if (!alarmApi?.create) return { scheduled: false, reason: 'alarms_unavailable' };
  const tasks = Array.isArray(tasksOrCache) ? tasksOrCache : (tasksOrCache?.tasks || []);
  const nextWhen = getNextTaskAlarmTime(tasks, nowMs);
  await clearAlarm(TASK_START_ALARM, alarmApi);
  if (!nextWhen) return { scheduled: false, reason: 'no_future_task' };
  alarmApi.create(TASK_START_ALARM, { when: nextWhen });
  return { scheduled: true, when: nextWhen };
}

export function buildTaskHeartbeatPayload(cache = null, nowMs = Date.now()) {
  const tasks = Array.isArray(cache?.tasks) ? cache.tasks : [];
  const activeTasks = getEnforcingTasks(tasks, nowMs);
  const nextTaskAt = getNextTaskAlarmTime(tasks, nowMs);
  return {
    capabilities: { [TASK_MANAGEMENT_V1_CAPABILITY]: true },
    taskVersion: Number(cache?.taskVersion ?? 0) || 0,
    taskActiveSummary: {
      activeTaskIds: activeTasks.map((task) => task.id),
      activeTaskCount: activeTasks.length,
      nextTaskAt,
    },
  };
}
function compactTaskForReadModel(task = {}) {
  const requiredSeconds = Math.max(0, Math.floor(Number(task.requiredSeconds || 0) || 0));
  const completedSeconds = Math.max(0, Math.floor(Number(task.completedSeconds || 0) || 0));
  return {
    id: String(task.id || ''),
    name: String(task.name || '未命名任务'),
    lifecycleStatus: task.lifecycleStatus || 'open',
    runtimeStatus: task.runtimeStatus || null,
    plannedStartAt: Number(task.plannedStartAt || 0) || null,
    requiredSeconds,
    completedSeconds,
    remainingSeconds: Math.max(0, requiredSeconds - completedSeconds),
    revision: Number(task.revision || 0) || 0,
    resourceSpec: task.resourceSpec || {},
    debugOnly: task.debugOnly === true,
  };
}

export function buildTaskReadModel(cache = null, nowMs = Date.now()) {
  const tasks = Array.isArray(cache?.tasks) ? cache.tasks.map((task) => normalizeTaskRecord(task, nowMs)) : [];
  const enforcingTasks = getEnforcingTasks(tasks, nowMs).map(compactTaskForReadModel);
  const progressTask = enforcingTasks
    .slice()
    .sort((a, b) => (a.plannedStartAt || 0) - (b.plannedStartAt || 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))[0] || null;
  const nextTaskAt = getNextTaskAlarmTime(tasks, nowMs);
  const nextTask = nextTaskAt
    ? tasks
      .filter((task) => task.lifecycleStatus === 'open' && Number(task.plannedStartAt || 0) === nextTaskAt)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')) || String(a.id || '').localeCompare(String(b.id || '')))[0]
    : null;
  return {
    ok: true,
    capability: TASK_MANAGEMENT_V1_CAPABILITY,
    taskVersion: Number(cache?.taskVersion || 0) || 0,
    cacheReason: cache?.reason || null,
    pulledAt: Number(cache?.pulledAt || 0) || null,
    lastPullAt: Number(cache?.lastPullAt || cache?.pulledAt || 0) || null,
    lastPullAttemptAt: Number(cache?.lastPullAttemptAt || 0) || null,
    lastHeartbeatAt: Number(cache?.lastHeartbeatAt || 0) || null,
    lastHeartbeatAttemptAt: Number(cache?.lastHeartbeatAttemptAt || 0) || null,
    heartbeatReason: cache?.heartbeatReason || null,
    heartbeatError: cache?.heartbeatError || null,
    capabilityReported: Number(cache?.lastHeartbeatAt || 0) > 0,
    error: cache?.error || cache?.pullError || null,
    activeCount: enforcingTasks.length,
    enforcingTasks,
    progressTask,
    nextTask: nextTask ? compactTaskForReadModel(nextTask) : null,
  };
}

export async function getTaskReadModel(nowMs = Date.now()) {
  return buildTaskReadModel(await getTaskCache(), nowMs);
}

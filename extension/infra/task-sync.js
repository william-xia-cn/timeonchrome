// task-sync.js - Task Management V1 extension cache, pull, alarm and heartbeat helpers.

import { cloudRequest } from './cloud-sync.js';
import {
  TASK_MANAGEMENT_V1_CAPABILITY,
  getEnforcingTasks,
  getNextTaskAlarmTime,
  getTaskPolicyContext,
  normalizeTaskRecord,
} from '../core/task-management.js';

export const TASK_CACHE_KEY = 'task_management_v1_cache';
export const TASK_PULL_ALARM = 'taskManagementPull';
export const TASK_START_ALARM = 'taskManagementStart';
export const TASK_COMPLETION_ALARM = 'taskManagementCompletion';
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
    lastAttemptAt: nowMs,
    error: error?.message || String(error || 'task_pull_failed'),
  };
  await saveTaskCache(cache);
  return cache;
}

export async function pullTaskCache({ reason = 'manual', nowMs = Date.now() } = {}) {
  try {
    const payload = await cloudRequest('GET', '/device/tasks/v1', null, 2);
    const cache = normalizeTaskCachePayload(payload || {}, nowMs);
    cache.reason = reason;
    await saveTaskCache(cache);
    await scheduleNextTaskAlarm(cache.tasks, nowMs);
    return { ok: true, cache };
  } catch (error) {
    const cache = await saveTaskCacheError(error, nowMs);
    return { ok: false, error: cache.error, cache };
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
function maxRevisionForTaskIds(tasks = [], ids = []) {
  const wanted = new Set((ids || []).map(String));
  return Math.max(0, ...(tasks || [])
    .filter((task) => wanted.has(String(task.id)))
    .map((task) => Number(task.revision || 0) || 0));
}

export function taskSnapshotFieldsFromContext(context = {}, tasks = []) {
  const matchedTaskIds = Array.isArray(context.matchedTaskIds)
    ? context.matchedTaskIds.map(String).filter(Boolean).sort((a, b) => a.localeCompare(b))
    : [];
  const progressTaskId = context.progressTaskId ? String(context.progressTaskId) : null;
  const taskRevision = progressTaskId
    ? maxRevisionForTaskIds(tasks, [progressTaskId])
    : maxRevisionForTaskIds(tasks, matchedTaskIds);
  return {
    matchedTaskIdsAtTime: matchedTaskIds,
    progressTaskIdAtTime: progressTaskId,
    taskRevisionAtTime: taskRevision || null,
  };
}

export async function resolveTaskSnapshotForPage(page = {}, nowMs = Date.now()) {
  const cache = await getTaskCache();
  const tasks = Array.isArray(cache?.tasks) ? cache.tasks : [];
  const context = getTaskPolicyContext(tasks, page, nowMs);
  return {
    ...taskSnapshotFieldsFromContext(context, tasks),
    taskPolicyContext: context,
  };
}

export async function scheduleTaskCompletionAlarmForSnapshot(snapshot = {}, sessionStartMs = Date.now(), alarmApi = getAlarmArea()) {
  if (!alarmApi?.create) return { scheduled: false, reason: 'alarms_unavailable' };
  await clearAlarm(TASK_COMPLETION_ALARM, alarmApi);
  const progressTaskId = snapshot?.progressTaskIdAtTime;
  if (!progressTaskId) return { scheduled: false, reason: 'no_progress_task' };
  const cache = await getTaskCache();
  const task = (cache?.tasks || []).find((item) => String(item.id) === String(progressTaskId));
  const remainingSeconds = Number(task?.remainingSeconds ?? ((Number(task?.requiredSeconds || 0) || 0) - (Number(task?.completedSeconds || 0) || 0)));
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) return { scheduled: false, reason: 'no_remaining_seconds' };
  const when = Number(sessionStartMs || Date.now()) + (remainingSeconds * 1000);
  alarmApi.create(TASK_COMPLETION_ALARM, { when });
  return { scheduled: true, when, taskId: String(progressTaskId) };
}

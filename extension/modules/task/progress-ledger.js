// Task-owned activity ledger. It never reads or writes the core usage/session ledgers.

import { getTaskPolicyContext } from './domain.js';
import { getTaskCache, saveTaskCache } from './sync.js';
import { taskDeviceRequest } from './transport.js';

export const TASK_PROGRESS_SEGMENTS_KEY = 'task_progress_segments_v1';
export const TASK_PROGRESS_STATE_KEY = 'task_progress_state_v1';
export const TASK_PROGRESS_DIAGNOSTICS_KEY = 'task_progress_diagnostics_v1';
export const MAX_PENDING_TASK_PROGRESS_SEGMENTS = 4096;
export const TASK_PROGRESS_UPLOAD_BATCH_SIZE = 500;
const MAX_CHECKPOINT_MS = 90 * 1000;
let ledgerQueue = Promise.resolve();

function runLedgerOperation(operation) {
  const result = ledgerQueue.then(operation, operation);
  ledgerQueue = result.catch(() => {});
  return result;
}

function segmentId(taskId, revision, startedAt, endedAt) {
  return [taskId, revision, startedAt, endedAt].join(':');
}

async function readState() {
  return globalThis.chrome?.storage?.local?.get?.([
    TASK_PROGRESS_STATE_KEY,
    TASK_PROGRESS_SEGMENTS_KEY,
    TASK_PROGRESS_DIAGNOSTICS_KEY,
  ]) || {};
}

function compactPendingSegments(rawSegments = {}) {
  const source = Object.values(rawSegments && typeof rawSegments === 'object' ? rawSegments : {});
  const pending = source
    .filter((segment) => segment && !segment.uploadedAt && segment.id && segment.taskId)
    .sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0) || String(a.id).localeCompare(String(b.id)));
  const overflow = Math.max(0, pending.length - MAX_PENDING_TASK_PROGRESS_SEGMENTS);
  const dropped = overflow ? pending.slice(0, overflow) : [];
  const kept = overflow ? pending.slice(overflow) : pending;
  const droppedSecondsByTask = {};
  for (const segment of dropped) {
    droppedSecondsByTask[segment.taskId] = Math.max(0, Number(droppedSecondsByTask[segment.taskId] || 0)) + Math.max(0, Number(segment.seconds || 0));
  }
  return {
    segments: Object.fromEntries(kept.map((segment) => [segment.id, segment])),
    removedCount: source.length - kept.length,
    droppedCount: dropped.length,
    droppedSeconds: dropped.reduce((sum, segment) => sum + Math.max(0, Number(segment.seconds || 0)), 0),
    droppedSecondsByTask,
  };
}

async function subtractDroppedProgressFromCache(droppedSecondsByTask = {}) {
  if (!Object.keys(droppedSecondsByTask).length) return;
  const cache = await getTaskCache();
  if (!Array.isArray(cache?.tasks)) return;
  cache.tasks = cache.tasks.map((task) => ({
    ...task,
    completedSeconds: Math.max(0, Number(task.completedSeconds || 0) - Math.max(0, Number(droppedSecondsByTask[task.id] || 0))),
  }));
  await saveTaskCache(cache);
}

async function persistCompactedSegments(values = {}) {
  const compacted = compactPendingSegments(values[TASK_PROGRESS_SEGMENTS_KEY] || {});
  const updates = { [TASK_PROGRESS_SEGMENTS_KEY]: compacted.segments };
  if (compacted.droppedCount > 0) {
    const previous = values[TASK_PROGRESS_DIAGNOSTICS_KEY] || {};
    updates[TASK_PROGRESS_DIAGNOSTICS_KEY] = {
      droppedSegmentCount: Math.max(0, Number(previous.droppedSegmentCount || 0)) + compacted.droppedCount,
      droppedSeconds: Math.max(0, Number(previous.droppedSeconds || 0)) + compacted.droppedSeconds,
      lastDropAt: Date.now(),
      reason: 'pending_capacity_exceeded',
    };
  }
  if (compacted.removedCount > 0 || compacted.droppedCount > 0) {
    await globalThis.chrome.storage.local.set(updates);
    await subtractDroppedProgressFromCache(compacted.droppedSecondsByTask);
  }
  return compacted.segments;
}

export function pruneTaskProgressLedger() {
  return runLedgerOperation(async () => persistCompactedSegments(await readState()));
}

async function appendSegment(state, endedAt) {
  if (!state?.taskId || !Number.isFinite(state.startedAt) || endedAt <= state.startedAt) return 0;
  const boundedStart = Math.max(state.startedAt, endedAt - MAX_CHECKPOINT_MS);
  const seconds = Math.max(0, Math.floor((endedAt - boundedStart) / 1000));
  if (!seconds) return 0;
  const values = await readState();
  const segments = values[TASK_PROGRESS_SEGMENTS_KEY] || {};
  const id = segmentId(state.taskId, state.revision, boundedStart, endedAt);
  segments[id] = { id, taskId: state.taskId, taskRevision: state.revision, startedAt: boundedStart, endedAt, seconds, createdAt: Date.now() };
  values[TASK_PROGRESS_SEGMENTS_KEY] = segments;
  const compacted = compactPendingSegments(segments);
  const updates = { [TASK_PROGRESS_SEGMENTS_KEY]: compacted.segments };
  if (compacted.droppedCount > 0) {
    const previous = values[TASK_PROGRESS_DIAGNOSTICS_KEY] || {};
    updates[TASK_PROGRESS_DIAGNOSTICS_KEY] = {
      droppedSegmentCount: Math.max(0, Number(previous.droppedSegmentCount || 0)) + compacted.droppedCount,
      droppedSeconds: Math.max(0, Number(previous.droppedSeconds || 0)) + compacted.droppedSeconds,
      lastDropAt: Date.now(),
      reason: 'pending_capacity_exceeded',
    };
  }
  await globalThis.chrome.storage.local.set(updates);
  const cache = await getTaskCache();
  if (cache?.tasks) {
    cache.tasks = cache.tasks.map((task) => {
      const increment = task.id === state.taskId ? seconds : 0;
      const dropped = Math.max(0, Number(compacted.droppedSecondsByTask[task.id] || 0));
      return {
        ...task,
        completedSeconds: Math.max(0, Math.min(Number(task.requiredSeconds || 0), Number(task.completedSeconds || 0) + increment - dropped)),
      };
    });
    await saveTaskCache(cache);
  }
  return seconds;
}

export function checkpointTaskProgress({ url = '', foreground = false, idleState = 'active', nowMs = Date.now() } = {}) {
  return runLedgerOperation(async () => {
    const values = await readState();
    await appendSegment(values[TASK_PROGRESS_STATE_KEY] || null, nowMs);
    const cache = await getTaskCache();
    const policy = getTaskPolicyContext(Array.isArray(cache?.tasks) ? cache.tasks : [], { url }, nowMs);
    const task = (cache?.tasks || []).find((item) => item.id === policy.progressTaskId);
    const next = foreground === true && idleState === 'active' && policy.allowed === true && task
      ? { taskId: task.id, revision: Number(task.revision || 0), startedAt: nowMs, url }
      : null;
    if (next) await globalThis.chrome.storage.local.set({ [TASK_PROGRESS_STATE_KEY]: next });
    else await globalThis.chrome.storage.local.remove(TASK_PROGRESS_STATE_KEY);
    return { policy, active: Boolean(next) };
  });
}

export function flushTaskProgress(nowMs = Date.now()) {
  return runLedgerOperation(async () => {
    const values = await readState();
    await appendSegment(values[TASK_PROGRESS_STATE_KEY] || null, nowMs);
    await globalThis.chrome?.storage?.local?.remove?.(TASK_PROGRESS_STATE_KEY);
  });
}

export function uploadPendingTaskProgress() {
  return runLedgerOperation(async () => {
    const segments = await persistCompactedSegments(await readState());
    const pending = Object.values(segments)
      .sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0) || String(a.id).localeCompare(String(b.id)))
      .slice(0, TASK_PROGRESS_UPLOAD_BATCH_SIZE);
    if (!pending.length) return { ok: true, uploaded: 0 };
    const result = await taskDeviceRequest('POST', '/device/task-runtime/v1/progress', { segments: pending });
    const accepted = new Set(result.acceptedIds || pending.map((segment) => segment.id));
    for (const id of accepted) delete segments[id];
    await globalThis.chrome.storage.local.set({ [TASK_PROGRESS_SEGMENTS_KEY]: segments });
    return { ok: true, uploaded: accepted.size, remaining: Object.keys(segments).length };
  });
}
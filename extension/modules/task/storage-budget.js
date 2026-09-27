// Task-owned storage guard. It never invokes or changes the core web-ledger budget.

export const TASK_STORAGE_MAX_BYTES = 1024 * 1024;
export const TASK_STORAGE_GLOBAL_WRITE_CEILING_BYTES = 6 * 1024 * 1024;
export const TASK_STORAGE_GLOBAL_RESERVE_BYTES = 64 * 1024;
export const TASK_STORAGE_KEYS = Object.freeze([
  'task_management_v1_cache',
  'task_progress_segments_v1',
  'task_progress_state_v1',
  'task_progress_diagnostics_v1',
]);

const TASK_STORAGE_KEY_SET = new Set(TASK_STORAGE_KEYS);

export function taskStorageJsonBytes(value) {
  const json = JSON.stringify(value ?? null);
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(json).length;
  return unescape(encodeURIComponent(json)).length;
}

function storageArea() {
  return globalThis.chrome?.storage?.local || null;
}

async function bytesInUse(area, keys = null) {
  if (typeof area?.getBytesInUse !== 'function') return null;
  try {
    const value = await area.getBytesInUse(keys);
    return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : null;
  } catch {
    return null;
  }
}

async function readTaskValues(area) {
  if (!area?.get) return {};
  return await area.get(TASK_STORAGE_KEYS) || {};
}

function assertTaskKeys(values = {}) {
  for (const key of Object.keys(values)) {
    if (!TASK_STORAGE_KEY_SET.has(key)) throw new Error(`TASK_STORAGE_KEY_FORBIDDEN:${key}`);
  }
}

export async function getTaskStorageWriteBudget(key, area = storageArea()) {
  if (!TASK_STORAGE_KEY_SET.has(key)) throw new Error(`TASK_STORAGE_KEY_FORBIDDEN:${key}`);
  if (!area) return { maxValueBytes: 0, totalBytes: 0, taskBytes: 0 };
  const values = await readTaskValues(area);
  const otherValues = Object.fromEntries(Object.entries(values).filter(([entryKey]) => entryKey !== key));
  const otherTaskBytes = taskStorageJsonBytes(otherValues);
  const currentTargetBytes = await bytesInUse(area, [key])
    ?? taskStorageJsonBytes({ [key]: values[key] });
  const totalBytes = await bytesInUse(area, null)
    ?? taskStorageJsonBytes(values);
  const nonTargetBytes = Math.max(0, totalBytes - currentTargetBytes);
  const taskAvailable = Math.max(0, TASK_STORAGE_MAX_BYTES - otherTaskBytes);
  const globalAvailable = Math.max(0,
    TASK_STORAGE_GLOBAL_WRITE_CEILING_BYTES
      - TASK_STORAGE_GLOBAL_RESERVE_BYTES
      - nonTargetBytes);
  return {
    maxValueBytes: Math.max(0, Math.min(taskAvailable, globalAvailable)),
    totalBytes,
    taskBytes: taskStorageJsonBytes(values),
  };
}

export async function setTaskStorage(values = {}, area = storageArea()) {
  assertTaskKeys(values);
  if (!area?.set) throw new Error('TASK_STORAGE_UNAVAILABLE');
  const current = await readTaskValues(area);
  const next = { ...current, ...values };
  const currentTaskBytes = await bytesInUse(area, TASK_STORAGE_KEYS)
    ?? taskStorageJsonBytes(current);
  const nextTaskBytes = taskStorageJsonBytes(next);
  if (nextTaskBytes > TASK_STORAGE_MAX_BYTES) {
    throw new Error('TASK_STORAGE_BUDGET_EXCEEDED');
  }
  const totalBytes = await bytesInUse(area, null) ?? currentTaskBytes;
  const projectedTotal = Math.max(0, totalBytes - currentTaskBytes + nextTaskBytes);
  if (projectedTotal + TASK_STORAGE_GLOBAL_RESERVE_BYTES > TASK_STORAGE_GLOBAL_WRITE_CEILING_BYTES
      && projectedTotal > totalBytes) {
    throw new Error('TASK_STORAGE_GLOBAL_CEILING');
  }
  await area.set(values);
  return { ok: true, taskBytes: nextTaskBytes, projectedTotal };
}

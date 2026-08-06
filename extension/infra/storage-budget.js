// infra/storage-budget.js — prioritized admission control for chrome.storage.local mutations.

export const STORAGE_PRESSURE_BYTES = 7 * 1024 * 1024;
export const STORAGE_TARGET_BYTES = Math.floor(6.5 * 1024 * 1024);
export const STORAGE_HARD_LIMIT_BYTES = 8 * 1024 * 1024;
export const STORAGE_EMERGENCY_RESERVE_BYTES = 64 * 1024;

const PRIORITY_RANK = {
  diagnostic: 10,
  derived: 20,
  sync: 30,
  media: 40,
  critical: 50,
  ledger_ack: 60,
  ledger: 70,
  foreground: 80,
};

let pressureHandler = null;
let pendingTasks = [];
let draining = false;
let taskSequence = 0;
let activeMaintenanceToken = null;

function encodedBytes(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch (_) {
    return Number.POSITIVE_INFINITY;
  }
}

function replacementBytes(items = {}) {
  return Object.entries(items || {}).reduce((sum, [key, value]) => (
    sum + encodedBytes(key) + encodedBytes(value) + 32
  ), 0);
}

async function bytesInUse(keys = null) {
  if (typeof chrome.storage.local.getBytesInUse === 'function') {
    return Number(await chrome.storage.local.getBytesInUse(keys)) || 0;
  }
  const data = await chrome.storage.local.get(keys);
  return encodedBytes(data);
}

async function projectedBytes(items) {
  const keys = Object.keys(items || {});
  const [total, replaced] = await Promise.all([
    bytesInUse(null),
    keys.length > 0 ? bytesInUse(keys) : 0,
  ]);
  return {
    total,
    projected: Math.max(0, total - replaced + replacementBytes(items)),
  };
}

function normalizedPriority(priority) {
  return Object.prototype.hasOwnProperty.call(PRIORITY_RANK, priority) ? priority : 'derived';
}

function enqueueStorageTask(task, options = {}) {
  const priority = normalizedPriority(options.priority);
  return new Promise((resolve, reject) => {
    pendingTasks.push({ task, priority, sequence: taskSequence++, resolve, reject });
    pendingTasks.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || a.sequence - b.sequence);
    queueMicrotask(drainStorageTasks);
  });
}

async function drainStorageTasks() {
  if (draining) return;
  draining = true;
  try {
    while (pendingTasks.length > 0) {
      const entry = pendingTasks.shift();
      try {
        entry.resolve(await entry.task());
      } catch (error) {
        entry.reject(error);
      }
    }
  } finally {
    draining = false;
    if (pendingTasks.length > 0) queueMicrotask(drainStorageTasks);
  }
}

async function requestMaintenance(options) {
  if (typeof pressureHandler !== 'function' || activeMaintenanceToken) return null;
  const token = Symbol('storage-maintenance');
  activeMaintenanceToken = token;
  try {
    return await pressureHandler({ ...options, alreadyExclusive: true, storageBypassToken: token });
  } finally {
    activeMaintenanceToken = null;
  }
}

// Maintenance may re-enter storage helpers only with the token created by the
// coordinator. Unrelated callers cannot observe or reuse this bypass.
export async function withStorageBudgetBypass(task, storageBypassToken = null) {
  if (storageBypassToken && storageBypassToken === activeMaintenanceToken) {
    return task(storageBypassToken);
  }
  return enqueueStorageTask(async () => {
    const token = Symbol('storage-maintenance');
    activeMaintenanceToken = token;
    try {
      return await task(token);
    } finally {
      activeMaintenanceToken = null;
    }
  }, { priority: 'critical' });
}

export function registerStoragePressureHandler(handler) {
  pressureHandler = typeof handler === 'function' ? handler : null;
}

async function commitBudgetedWrite(items, options = {}) {
  if (!items || typeof items !== 'object' || Array.isArray(items)) {
    throw new TypeError('storage write must be an object');
  }
  if (options.storageBypassToken && options.storageBypassToken === activeMaintenanceToken) {
    await chrome.storage.local.set(items);
    return { ok: true, bypassed: true };
  }

  const priority = normalizedPriority(options.priority);
  let usage = await projectedBytes(items);
  if (usage.projected + STORAGE_EMERGENCY_RESERVE_BYTES >= STORAGE_PRESSURE_BYTES) {
    await requestMaintenance({
      reason: options.source || 'storage_prewrite_pressure',
      pressure: true,
      emergency: usage.projected + STORAGE_EMERGENCY_RESERVE_BYTES >= STORAGE_HARD_LIMIT_BYTES,
      requiredBytes: Math.max(0, usage.projected - usage.total),
    });
    usage = await projectedBytes(items);
  }

  if (priority === 'diagnostic' && usage.total >= STORAGE_PRESSURE_BYTES) {
    return { ok: false, skipped: 'storage_pressure' };
  }

  if (usage.projected + STORAGE_EMERGENCY_RESERVE_BYTES > STORAGE_HARD_LIMIT_BYTES) {
    await requestMaintenance({
      reason: options.source || 'storage_prewrite_hard_limit',
      pressure: true,
      emergency: true,
      requiredBytes: Math.max(0, usage.projected - usage.total),
    });
    usage = await projectedBytes(items);
  }

  if (usage.projected + STORAGE_EMERGENCY_RESERVE_BYTES > STORAGE_HARD_LIMIT_BYTES) {
    const error = new Error('storage_hard_limit');
    error.code = 'storage_hard_limit';
    error.currentBytes = usage.total;
    error.projectedBytes = usage.projected;
    throw error;
  }

  await chrome.storage.local.set(items);
  const afterBytes = await bytesInUse(null);
  if (afterBytes > STORAGE_HARD_LIMIT_BYTES) {
    await requestMaintenance({ reason: 'storage_postwrite_hard_limit', pressure: true, emergency: true });
    const repairedBytes = await bytesInUse(null);
    if (repairedBytes > STORAGE_HARD_LIMIT_BYTES) {
      const error = new Error('storage_hard_limit_unresolved');
      error.code = 'storage_hard_limit_unresolved';
      error.currentBytes = repairedBytes;
      throw error;
    }
  }
  return { ok: true, afterBytes };
}

export function runStorageMutation(task, options = {}) {
  if (typeof task !== 'function') return Promise.reject(new TypeError('storage mutation must be a function'));
  const priority = normalizedPriority(options.priority);
  const execute = () => task({
    get: (keys = null) => chrome.storage.local.get(keys),
    getBytesInUse: (keys = null) => bytesInUse(keys),
    set: (items, nestedOptions = {}) => commitBudgetedWrite(items, {
      ...options,
      ...nestedOptions,
      priority: normalizedPriority(nestedOptions.priority || priority),
    }),
    remove: (keys) => chrome.storage.local.remove(keys),
  });
  if (options.storageBypassToken && options.storageBypassToken === activeMaintenanceToken) return execute();
  return enqueueStorageTask(execute, { ...options, priority });
}

export function budgetedLocalSet(items, callbackOrOptions = null, maybeOptions = null) {
  const callback = typeof callbackOrOptions === 'function' ? callbackOrOptions : null;
  const options = callback ? (maybeOptions || {}) : (callbackOrOptions || {});
  const result = options.storageBypassToken && options.storageBypassToken === activeMaintenanceToken
    ? commitBudgetedWrite(items, options)
    : enqueueStorageTask(() => commitBudgetedWrite(items, options), options);
  if (callback) {
    result.then(() => callback(null), (error) => callback(error));
  }
  return result;
}

export async function getStorageBudgetStatus() {
  const totalBytes = await bytesInUse(null);
  return {
    totalBytes,
    pressure: totalBytes >= STORAGE_PRESSURE_BYTES,
    hardLimitReached: totalBytes >= STORAGE_HARD_LIMIT_BYTES,
    pressureBytes: STORAGE_PRESSURE_BYTES,
    targetBytes: STORAGE_TARGET_BYTES,
    hardLimitBytes: STORAGE_HARD_LIMIT_BYTES,
    reserveBytes: STORAGE_EMERGENCY_RESERVE_BYTES,
    pendingMutations: pendingTasks.length,
  };
}
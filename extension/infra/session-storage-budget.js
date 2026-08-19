// infra/session-storage-budget.js - bounded admission control for chrome.storage.session.

export const SESSION_STORAGE_PRESSURE_BYTES = 4 * 1024 * 1024;
export const SESSION_STORAGE_TARGET_BYTES = 2 * 1024 * 1024;
export const SESSION_STORAGE_HARD_LIMIT_BYTES = 6 * 1024 * 1024;

export const SESSION_STORAGE_DISPOSABLE_KEYS = [
  '__timingTrace',
  'debug_focus_ledger_v1',
  'mode_effect_trace_v1',
  'client_logs_session_v1',
];

export const SESSION_STORAGE_PROTECTED_KEYS = ['session_v1'];

let mutationQueue = Promise.resolve();

function encodedBytes(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch (_) {
    return Number.POSITIVE_INFINITY;
  }
}

function sessionArea() {
  return globalThis.chrome?.storage?.session || null;
}

async function bytesInUse(keys = null) {
  const area = sessionArea();
  if (!area) return 0;
  if (typeof area.getBytesInUse === 'function') {
    return Number(await area.getBytesInUse(keys)) || 0;
  }
  return encodedBytes(await area.get(keys));
}

async function projectedBytes(items) {
  const keys = Object.keys(items || {});
  const [total, replaced] = await Promise.all([
    bytesInUse(null),
    keys.length > 0 ? bytesInUse(keys) : 0,
  ]);
  return {
    total,
    projected: Math.max(0, total - replaced + encodedBytes(items)),
  };
}

function enqueue(task) {
  const result = mutationQueue.then(task, task);
  mutationQueue = result.catch(() => {});
  return result;
}

async function rawMaintenance({ targetBytes = SESSION_STORAGE_TARGET_BYTES, emergency = false } = {}) {
  const area = sessionArea();
  if (!area) return { ok: false, skipped: 'session_storage_unavailable', removedKeys: [] };

  const removedKeys = [];
  let totalBytes = await bytesInUse(null);
  for (const key of SESSION_STORAGE_DISPOSABLE_KEYS) {
    if (!emergency && totalBytes <= targetBytes) break;
    const keyBytes = await bytesInUse(key);
    if (keyBytes <= 0) continue;
    await area.remove(key);
    removedKeys.push(key);
    totalBytes = await bytesInUse(null);
  }
  return {
    ok: totalBytes <= SESSION_STORAGE_HARD_LIMIT_BYTES,
    totalBytes,
    removedKeys,
  };
}

export function runSessionStorageMaintenance(options = {}) {
  return enqueue(() => rawMaintenance(options));
}

async function commitSessionWrite(items, options = {}) {
  const area = sessionArea();
  if (!area?.set) return { ok: false, skipped: 'session_storage_unavailable' };
  if (!items || typeof items !== 'object' || Array.isArray(items)) {
    throw new TypeError('session storage write must be an object');
  }

  const priority = options.priority === 'business' ? 'business' : 'diagnostic';
  let usage = await projectedBytes(items);
  if (usage.projected >= SESSION_STORAGE_PRESSURE_BYTES) {
    await rawMaintenance({ targetBytes: SESSION_STORAGE_TARGET_BYTES });
    usage = await projectedBytes(items);
  }

  if (usage.projected > SESSION_STORAGE_HARD_LIMIT_BYTES) {
    await rawMaintenance({ targetBytes: SESSION_STORAGE_TARGET_BYTES, emergency: true });
    usage = await projectedBytes(items);
  }

  if (usage.projected > SESSION_STORAGE_HARD_LIMIT_BYTES) {
    return {
      ok: false,
      skipped: priority === 'business' ? 'session_storage_hard_limit' : 'session_diagnostic_dropped',
      totalBytes: usage.total,
      projectedBytes: usage.projected,
    };
  }

  try {
    await area.set(items);
  } catch (error) {
    await rawMaintenance({ targetBytes: SESSION_STORAGE_TARGET_BYTES, emergency: true });
    try {
      await area.set(items);
    } catch (retryError) {
      return {
        ok: false,
        skipped: priority === 'business' ? 'session_storage_write_failed' : 'session_diagnostic_dropped',
        error: retryError?.message || error?.message || String(retryError || error),
      };
    }
  }

  const afterBytes = await bytesInUse(null);
  if (afterBytes > SESSION_STORAGE_HARD_LIMIT_BYTES) {
    await rawMaintenance({ targetBytes: SESSION_STORAGE_TARGET_BYTES, emergency: true });
  }
  return { ok: true, afterBytes: await bytesInUse(null) };
}

export function budgetedSessionSet(items, options = {}) {
  return enqueue(() => commitSessionWrite(items, options));
}

export async function getSessionStorageBudgetStatus() {
  const totalBytes = await bytesInUse(null);
  return {
    totalBytes,
    pressure: totalBytes >= SESSION_STORAGE_PRESSURE_BYTES,
    hardLimitReached: totalBytes >= SESSION_STORAGE_HARD_LIMIT_BYTES,
    pressureBytes: SESSION_STORAGE_PRESSURE_BYTES,
    targetBytes: SESSION_STORAGE_TARGET_BYTES,
    hardLimitBytes: SESSION_STORAGE_HARD_LIMIT_BYTES,
  };
}

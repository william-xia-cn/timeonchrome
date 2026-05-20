// core/mode-boundary-intents.js — durable queue for mode boundary timing signals

export const MODE_BOUNDARY_INTENTS_KEY = 'mode_boundary_intents_v1';

const VALID_MODES = new Set(['study', 'composite', 'rest', 'paused', 'unknown']);
let modeBoundaryQueue = Promise.resolve();

function runModeBoundarySerialized(task) {
  modeBoundaryQueue = modeBoundaryQueue.then(task, task);
  return modeBoundaryQueue;
}

function normalizeMode(mode) {
  if (mode === 'whitelist') return 'study';
  if (mode === 'blacklist') return 'rest';
  return VALID_MODES.has(mode) ? mode : 'unknown';
}

function normalizeString(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function makeIntentId(input) {
  const boundary = Number(input.boundaryAtMs);
  const created = Number(input.createdAtMs);
  const entropy = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return [
    'modeBoundary',
    Number.isFinite(boundary) ? Math.floor(boundary) : Date.now(),
    normalizeMode(input.fromMode),
    normalizeMode(input.toMode),
    normalizeString(input.reason, 'mode_boundary'),
    normalizeString(input.source, 'unknown'),
    Number.isFinite(created) ? Math.floor(created) : Date.now(),
    entropy,
  ].join(':');
}

function normalizeIntent(input = {}) {
  const boundaryAtMs = Number(input.boundaryAtMs ?? input.effectiveAtMs ?? input.atMs);
  const createdAtMs = Number(input.createdAtMs);
  const intent = {
    id: normalizeString(input.id, null),
    type: 'mode_boundary',
    boundaryAtMs: Number.isFinite(boundaryAtMs) ? boundaryAtMs : Date.now(),
    fromMode: normalizeMode(input.fromMode),
    toMode: normalizeMode(input.toMode),
    reason: normalizeString(input.reason, 'mode_boundary'),
    source: normalizeString(input.source, 'unknown'),
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
  };
  if (!intent.id) intent.id = makeIntentId(intent);
  return intent;
}

async function readIntents() {
  const data = await chrome.storage.local.get(MODE_BOUNDARY_INTENTS_KEY);
  return data?.[MODE_BOUNDARY_INTENTS_KEY] || {};
}

async function writeIntents(intents) {
  await chrome.storage.local.set({ [MODE_BOUNDARY_INTENTS_KEY]: intents || {} });
}

export async function enqueueModeBoundaryIntent(input = {}) {
  return runModeBoundarySerialized(async () => {
    const intent = normalizeIntent(input);
    if (intent.fromMode === intent.toMode) {
      return { ok: true, queued: false, skipped: 'same_mode', intent };
    }
    const intents = await readIntents();
    if (intents[intent.id]) {
      return { ok: true, queued: false, duplicate: true, intent };
    }
    intents[intent.id] = intent;
    await writeIntents(intents);
    return { ok: true, queued: true, intent };
  });
}

export async function getModeBoundaryIntents() {
  return readIntents();
}

export async function drainModeBoundaryIntents(processIntent, options = {}) {
  return runModeBoundarySerialized(async () => {
    if (typeof processIntent !== 'function') {
      return { ok: false, processed: 0, error: 'missing_processor' };
    }

    const intents = await readIntents();
    const ordered = Object.values(intents || {})
      .filter((intent) => intent?.id)
      .sort((a, b) => {
        const byBoundary = Number(a.boundaryAtMs || 0) - Number(b.boundaryAtMs || 0);
        if (byBoundary !== 0) return byBoundary;
        return Number(a.createdAtMs || 0) - Number(b.createdAtMs || 0);
      });

    if (ordered.length === 0) {
      return { ok: true, processed: 0, remaining: 0, reason: 'empty' };
    }

    const remaining = { ...intents };
    let processed = 0;
    const failures = [];

    for (const intent of ordered) {
      try {
        const result = await processIntent(intent);
        if (result?.ok === false) {
          throw new Error(result.error || result.reason || 'mode_boundary_processor_failed');
        }
        delete remaining[intent.id];
        processed++;
      } catch (err) {
        failures.push({
          id: intent.id,
          error: err?.message || String(err),
        });
        remaining[intent.id] = {
          ...intent,
          lastAttemptAtMs: Date.now(),
          lastError: err?.message || String(err),
        };
        break;
      }
    }

    await writeIntents(remaining);
    if (failures.length > 0 && options.throwOnFailure) {
      throw new Error(failures[0].error);
    }
    return {
      ok: failures.length === 0,
      processed,
      remaining: Object.keys(remaining).length,
      failures,
    };
  });
}

export function __resetModeBoundaryQueueForTest() {
  modeBoundaryQueue = Promise.resolve();
}

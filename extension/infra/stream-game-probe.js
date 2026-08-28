// Bounded, session-only diagnostics for cg.163.com stream-game evidence.

import { budgetedSessionSet } from './session-storage-budget.js';

export const STREAM_GAME_PROBE_KEY = 'stream_game_probe_v1';
export const STREAM_GAME_PROBE_MAX_SAMPLES = 60;

const BOOLEAN_FIELDS = [
  'documentVisible',
  'fullscreen',
  'pointerLocked',
  'recentInput',
  'audioContextActive',
];

const COUNT_FIELDS = [
  'videoElementCount',
  'playingVideoCount',
  'visibleVideoCount',
  'hiddenPlayingVideoCount',
  'mediaStreamVideoCount',
  'liveVideoTrackCount',
  'advancingVideoCount',
  'hiddenAdvancingVideoCount',
  'audioElementCount',
  'playingAudioCount',
  'audibleAudioCount',
  'canvasCount',
  'visibleCanvasCount',
  'largeCanvasCount',
  'connectedGamepadCount',
];

let writeQueue = Promise.resolve();

function sessionArea() {
  return globalThis.chrome?.storage?.session || null;
}

function isCgRunTab(sender) {
  try {
    const url = new URL(String(sender?.tab?.url || ''));
    return url.protocol === 'https:'
      && url.hostname.toLowerCase() === 'cg.163.com'
      && url.pathname === '/run.html';
  } catch (_) {
    return false;
  }
}

function sanitizeCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1000, Math.trunc(numeric)));
}

export function sanitizeStreamGameProbeSample(sample, sender, receivedAt = Date.now()) {
  if (!isCgRunTab(sender) || !sample || typeof sample !== 'object' || Array.isArray(sample)) {
    return null;
  }

  const sanitized = {
    receivedAt: Number.isFinite(Number(receivedAt)) ? Math.trunc(Number(receivedAt)) : Date.now(),
    tabId: Number.isInteger(sender?.tab?.id) ? sender.tab.id : null,
    windowId: Number.isInteger(sender?.tab?.windowId) ? sender.tab.windowId : null,
    frameId: Number.isInteger(sender?.frameId) ? sender.frameId : null,
    topFrame: sender?.frameId === 0,
  };

  for (const field of BOOLEAN_FIELDS) sanitized[field] = sample[field] === true;
  for (const field of COUNT_FIELDS) sanitized[field] = sanitizeCount(sample[field]);
  return sanitized;
}

async function appendSample(sample) {
  const area = sessionArea();
  if (!area?.get) return { ok: false, skipped: 'session_storage_unavailable' };

  const stored = await area.get(STREAM_GAME_PROBE_KEY);
  const existing = Array.isArray(stored?.[STREAM_GAME_PROBE_KEY])
    ? stored[STREAM_GAME_PROBE_KEY]
    : [];
  const samples = [...existing, sample].slice(-STREAM_GAME_PROBE_MAX_SAMPLES);
  const result = await budgetedSessionSet(
    { [STREAM_GAME_PROBE_KEY]: samples },
    { priority: 'diagnostic', source: 'stream_game_probe' }
  );
  return { ...result, count: result?.ok === true ? samples.length : existing.length };
}

export function recordStreamGameProbe(sample, sender) {
  const sanitized = sanitizeStreamGameProbeSample(sample, sender);
  if (!sanitized) return Promise.resolve({ ok: false, skipped: 'not_cg_stream_game' });

  const result = writeQueue.then(() => appendSample(sanitized), () => appendSample(sanitized));
  writeQueue = result.catch(() => {});
  return result;
}

// core/checkpoint-scheduler.js — split foreground and media checkpoint execution

import { runPeriodicCheckpoint } from '../runtime/session.js';
import { runMediaCheckpoint } from './media-timing.js';

export async function runForegroundCheckpoint(now = Date.now(), options = {}) {
  return runPeriodicCheckpoint(now, options);
}

export async function runTimingCheckpoints(options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  if (typeof options.isMonitoringEnabled === 'function' && !options.isMonitoringEnabled()) {
    return { ok: true, skipped: 'monitoring_disabled' };
  }

  const emitTrace = typeof options.emitTrace === 'function' ? options.emitTrace : async () => {};
  const warn = typeof options.warn === 'function' ? options.warn : () => {};
  const result = { ok: true, foreground: null, media: null };

  try {
    result.foreground = await runForegroundCheckpoint(now, {
      confirmForegroundPage: options.confirmForegroundPage,
      resolveUnknownDomainForSettlement: options.resolveUnknownDomainForSettlement,
    });
    await emitTrace('foreground_checkpoint_result', {
      source: 'checkpoint',
      reason: result.foreground?.reason || 'periodic_checkpoint',
      domain: result.foreground?.domain || null,
      payload: result.foreground,
    });
  } catch (err) {
    result.ok = false;
    result.foreground = { ok: false, error: err?.message || String(err) };
    warn('[Checkpoint] foreground checkpoint failed:', err?.message || err);
  }

  try {
    result.media = await runMediaCheckpoint(now);
    await emitTrace('media_checkpoint_result', {
      source: 'checkpoint',
      reason: result.media?.reason || 'periodic_checkpoint',
      domain: null,
      payload: result.media,
    });
  } catch (err) {
    result.ok = false;
    result.media = { ok: false, error: err?.message || String(err) };
    warn('[Checkpoint] media checkpoint failed:', err?.message || err);
  }

  return result;
}

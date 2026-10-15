import { logClientEvent } from './client-logs.js';

// Whitelisted values only: never pass a decision, policy, URL or prompt wholesale.
const CODES = new Set(['decision', 'prompt', 'periodic']);
const TEXT = ['auditId', 'phase', 'source', 'eventType', 'access', 'reason', 'kind', 'quotaBucket'];
const NUMBERS = ['tabId', 'deadlineAt', 'forcedUsageSeconds', 'baselineSeconds'];
const FLAGS = ['ok', 'blocked', 'confirmationPending', 'reminderSent', 'visible', 'foreground'];
const code = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,120}$/.test(value) ? value : null;

export function createAccessDiagnostics({ write = logClientEvent, now = Date.now } = {}) {
  const buckets = new Map();
  return (kind, input = {}) => {
    try {
      if (!CODES.has(kind)) return;
      const details = {};
      for (const key of TEXT) if (code(input[key])) details[key] = code(input[key]);
      for (const key of NUMBERS) if (Number.isFinite(input[key])) details[key] = input[key];
      for (const key of FLAGS) if (typeof input[key] === 'boolean') details[key] = input[key];
      if (Array.isArray(input.reasons)) details.reasons = input.reasons.map(code).filter(Boolean).slice(0, 12);
      const failed = input.ok === false;
      // Summarize unchanged periodic outcomes without delaying changed outcomes or prompt events.
      if (kind === 'periodic' || kind === 'decision' && input.source === 'forced_use_periodic_review') {
        const fingerprint = JSON.stringify({ ...details, auditId: undefined, forcedUsageSeconds: undefined });
        const key = `${kind}:${details.tabId ?? 'global'}`;
        const previous = buckets.get(key);
        if (previous?.fingerprint === fingerprint && now() - previous.at < 300_000) {
          previous.count++;
          return;
        }
        details.suppressedCount = previous?.count || 0;
        buckets.delete(key);
        buckets.set(key, { fingerprint, at: now(), count: 0 });
        if (buckets.size > 64) buckets.delete(buckets.keys().next().value);
      }
      Promise.resolve(write({ level: failed ? 'warning' : 'info', category: 'access',
        eventCode: `access_management_${kind}`, module: 'access-management',
        message: `access_management_${kind}`, details })).catch(() => {});
    } catch (_) { /* Diagnostics must not affect access enforcement. */ }
  };
}

export const recordAccessDiagnostic = createAccessDiagnostics();

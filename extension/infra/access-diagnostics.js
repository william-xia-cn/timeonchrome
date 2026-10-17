import { logClientEvent, noteClientLogLoss } from './client-logs.js';

// Whitelisted values only: never pass a decision, policy, URL or prompt wholesale.
const CODES = new Set(['decision', 'prompt', 'periodic', 'accounting']);
const TEXT = ['auditId', 'evaluationId', 'phase', 'source', 'eventType', 'access', 'reason', 'kind', 'quotaBucket'];
const NUMBERS = ['tabId', 'deadlineAt', 'forcedUsageSeconds', 'baselineSeconds', 'configVersion', 'grantCount', 'schemaVersion'];
const FLAGS = ['ok', 'blocked', 'confirmationPending', 'reminderSent', 'visible', 'foreground', 'complete', 'irrecoverable',
  'progressPresent', 'identityMatches', 'dateMatches', 'ruleMatches', 'policyMatches', 'reasonsMatch', 'progressValid'];
const CAUSES = new Set(['accounting_unavailable', 'evidence_unavailable', 'quota_read_unavailable', 'auxiliary_read_failed',
  'shared_day_missing', 'shared_projection_unavailable', 'confirmation_read_failed', 'prompt_read_failed', 'prompt_write_failed',
  'forced_use_evidence_unavailable', 'reminder_progress_unavailable', 'reminder_usage_regressed',
  'quota_facts_unavailable', 'quota_usage_invalid', 'quota_bucket_unavailable', 'domain_usage_invalid',
  'forced_use_grant_failed', 'forced_use_grant_close_failed', 'forced_use_grant_evidence_failed',
  'forced_use_identity_unavailable', 'prompt_operation_failed', 'forced_use_confirmation_stale',
  'intervals_unavailable', 'grant_evidence_invalid', 'grant_journal_missing', 'grant_journal_invalid',
  'grant_journal_unavailable', 'derived_reconcile_failed', 'derived_unavailable']);
const code = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,120}$/.test(value) ? value : null;

export function createAccessDiagnostics({ write = logClientEvent, now = Date.now } = {}) {
  const buckets = new Map();
  const incidents = new Map();
  const instanceId = globalThis.crypto?.randomUUID?.() || `instance-${Math.random().toString(36).slice(2)}`;
  const loss = () => { if (typeof noteClientLogLoss === 'function') noteClientLogLoss(); };
  return (kind, input = {}) => {
    try {
      if (!CODES.has(kind)) return;
      const details = {};
      details.instanceId = instanceId;
      for (const key of TEXT) if (code(input[key])) details[key] = code(input[key]);
      for (const key of NUMBERS) if (Number.isFinite(input[key])) details[key] = input[key];
      for (const key of FLAGS) if (typeof input[key] === 'boolean') details[key] = input[key];
      if (Array.isArray(input.reasons)) details.reasons = input.reasons.map(code).filter(Boolean).slice(0, 12);
      if (input.quotaRead && ['ok', 'unknown', 'not_executed', 'cached'].includes(input.quotaRead)) details.quotaRead = input.quotaRead;
      if (input.causeCode) details.causeCode = CAUSES.has(input.causeCode) ? input.causeCode : 'evidence_unavailable';
      if (kind === 'accounting') {
        const key = `${details.tabId ?? 'global'}:${details.phase}:${details.causeCode}`;
        const previous = incidents.get(key);
        if (previous && now() - previous.at < 300_000) { previous.count++; return; }
        details.suppressedCount = previous?.count || 0;
        incidents.delete(key); incidents.set(key, { at: now(), count: 0, tabId: details.tabId, details });
        if (incidents.size > 8) { incidents.delete(incidents.keys().next().value); loss(); }
      } else if (kind === 'decision' && input.ok === true && input.access === 'allow' && input.recoveryEligible === true) {
        for (const [key, incident] of incidents) if (incident.tabId === input.tabId) {
          incidents.delete(key);
          Promise.resolve(write({ level: 'info', category: 'access', eventCode: 'access_accounting_recovered',
            module: 'access-management', message: 'access_accounting_recovered', details: { instanceId,
              auditId: details.auditId, evaluationId: details.evaluationId,
              phase: incident.details.phase, causeCode: incident.details.causeCode,
              firstAt: incident.at, recoveredAt: now(), suppressedCount: incident.count } })).catch(loss);
        }
      }
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
        message: `access_management_${kind}`, details })).catch(loss);
    } catch (_) { /* Diagnostics must not affect access enforcement. */ }
  };
}

export const recordAccessDiagnostic = createAccessDiagnostics();

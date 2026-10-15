import { confirmForcedUseAdmission } from '../core/forced-use-admission.js';
import { isAutonomyConfirmationText } from '../core/autonomy-confirmation.js';

export const FORCED_USE_PROMPT_KEY = 'forced_use_prompt_state_v1';
export const FORCED_USE_PROMPT_DEADLINE_ALARM = 'forcedUsePromptDeadline';
const TIMEOUT_MS = 60_000;

export async function readForcedUsePromptProgress() {
  const state = (await chrome.storage.session.get(FORCED_USE_PROMPT_KEY))[FORCED_USE_PROMPT_KEY];
  return state?.progress || null;
}

export function createForcedUsePromptRuntime({ api, storage, recheck, onAccepted, block,
  persistGrant = async () => ({ ok: true }), closeGrants = async () => ({ ok: true }),
  diagnostic = () => {}, now = Date.now }) {
  const report = (prompt, phase, extra = {}) => {
    try {
      Promise.resolve(diagnostic('prompt', { auditId: prompt?.auditId, phase,
        tabId: prompt?.tabId, reasons: prompt?.admission?.reasons,
        kind: prompt?.admission?.kind, quotaBucket: prompt?.admission?.quotaBucket,
        forcedUsageSeconds: prompt?.admission?.progress?.forcedUsageSeconds,
        baselineSeconds: prompt?.admission?.progress?.baselineSeconds,
        deadlineAt: prompt?.deadlineAt, ok: true, ...extra })).catch(() => {});
    } catch (_) { /* Logging is never a prerequisite for confirmation. */ }
  };
  const reject = (prompt, error) => {
    report(prompt, 'failed', { ok: false, reason: error });
    return { ok: false, error };
  };
  let queue = Promise.resolve();
  const serialized = task => {
    const run = async () => {
      try { return await task(); }
      catch (error) {
        report(null, 'failed', { ok: false, reason: 'prompt_operation_failed' });
        throw error;
      }
    };
    queue = queue.then(run, run);
    return queue;
  };
  const read = async () => (await storage.get(FORCED_USE_PROMPT_KEY))[FORCED_USE_PROMPT_KEY]
    || { version: 1, prompt: null, progress: null };
  const write = async state => {
    await storage.set({ [FORCED_USE_PROMPT_KEY]: state });
    return state;
  };
  const message = (tabId, payload) => api.tabs.sendMessage(tabId, payload, { frameId: 0 }).catch(() => null);

  async function dismiss(prompt, resumeMedia = false) {
    await api.alarms.clear(FORCED_USE_PROMPT_DEADLINE_ALARM).catch(() => false);
    await message(prompt.tabId, resumeMedia
      ? { type: 'RESUME_REST_USAGE_MEDIA', token: prompt.token }
      : { type: 'DISMISS_REST_USAGE_REMINDER', token: prompt.token });
  }

  async function end(state, reason) {
    const prompt = state.prompt;
    if (!prompt) return { ok: true, skipped: 'no_prompt' };
    const result = await block(prompt, reason);
    if (result?.ok === false) return reject(prompt, 'forced_use_block_failed');
    const endedAt = now();
    if ((await closeGrants(prompt.host, endedAt))?.ok !== true) {
      return reject(prompt, 'forced_use_grant_close_failed');
    }
    const ruleKey = prompt.admission.ruleKey;
    const progress = state.progress?.grants && typeof state.progress.grants === 'object'
      ? { ...state.progress, grants: Object.fromEntries(Object.entries(state.progress.grants)
        .filter(([key]) => key !== ruleKey)) }
      : state.progress;
    const grants = Array.isArray(state.grants) ? state.grants.map(row =>
      row.domain === prompt.host && row.endMs == null ? { ...row, endMs: endedAt } : row) : state.grants;
    await write({ ...state, prompt: null, progress, grants });
    await dismiss(prompt);
    report(prompt, 'ended', { reason, blocked: true });
    return { ok: true, action: 'end', reason };
  }

  const request = input => serialized(async () => {
    const state = await read();
    if (!Number.isInteger(input?.tabId) || input.tabId < 0
      || !input?.admission?.ok || input.admission.action !== 'confirm'
      || typeof input.host !== 'string' || !input.host) {
      return reject(null, 'forced_use_request_invalid');
    }
    if (state.prompt) {
      if (state.prompt.deadlineAt && now() >= state.prompt.deadlineAt) {
        const expired = await end(state, 'confirmation_timeout');
        if (!expired.ok) return expired;
      } else if (state.prompt.tabId === input.tabId
        && state.prompt.admission.policySignature === input.admission.policySignature
        && state.prompt.admission.ruleKey === input.admission.ruleKey) {
        return { ok: true, pending: true, deadlineAt: state.prompt.deadlineAt };
      } else return reject(input, 'forced_use_prompt_busy');
    }
    const token = globalThis.crypto?.randomUUID?.()
      || `forced-${now()}-${Math.random().toString(16).slice(2)}`;
    const prompt = { token, auditId: input.auditId || `access-${now()}-${Math.random().toString(36).slice(2, 8)}`,
      tabId: input.tabId, host: input.host,
      admission: input.admission, deadlineAt: null };
    report(prompt, 'requested');
    await write({ ...state, prompt });
    const shown = await message(prompt.tabId, { type: 'SHOW_REST_USAGE_REMINDER', token,
      confirmationKind: 'forced_use', forcedUseReasons: input.admission.reasons,
      forcedUsePresentation: input.admission.presentation });
    if (shown?.ok !== true || shown.visible !== true || shown.confirmationVersion !== 1) {
      await write({ ...state, prompt: null });
      await dismiss(prompt);
      return reject(prompt, 'forced_use_delivery_failed');
    }
    const active = { ...prompt, deadlineAt: now() + TIMEOUT_MS };
    await write({ ...state, prompt: active });
    const activated = await message(prompt.tabId, { type: 'ACTIVATE_REST_USAGE_REMINDER',
      token, deadlineAt: active.deadlineAt, timeoutAction: 'end' });
    if (activated?.ok !== true || activated.visible !== true || activated.confirmationVersion !== 1) {
      await write({ ...state, prompt: null });
      await dismiss(prompt);
      return reject(active, 'forced_use_activation_failed');
    }
    await api.alarms.create(FORCED_USE_PROMPT_DEADLINE_ALARM, { when: active.deadlineAt });
    report(active, 'visible', { visible: true });
    return { ok: true, prompted: true, deadlineAt: active.deadlineAt };
  });

  const handleAction = (action, sender) => serialized(async () => {
    const state = await read(), prompt = state.prompt;
    if (!prompt || action?.token !== prompt.token) return reject(prompt, 'stale_prompt');
    if (sender?.tab?.id !== prompt.tabId || sender.frameId !== 0) {
      return reject(prompt, 'invalid_prompt_sender');
    }
    if (prompt.deadlineAt === null) return reject(prompt, 'prompt_not_visible');
    if (now() >= prompt.deadlineAt) return end(state, 'confirmation_timeout');
    if (action.action === 'end') return end(state, 'user_end');
    if (action.action !== 'continue' || !isAutonomyConfirmationText(action.confirmationText)) {
      return reject(prompt, 'confirmation_text_required');
    }
    const latest = await recheck(prompt);
    if (latest?.action === 'block') return end(state, 'hard_limit');
    const accepted = confirmForcedUseAdmission(prompt.admission, latest, state.progress);
    if (!accepted.ok) return end(state, 'confirmation_stale');
    const recorded = await onAccepted(prompt, accepted.state);
    if (recorded?.ok !== true) return reject(prompt, 'forced_use_grant_failed');
    let scope;
    try { scope = JSON.parse(prompt.admission.identityKey); } catch { scope = null; }
    if (!Array.isArray(scope) || !scope[0] || !scope[1]) {
      return reject(prompt, 'forced_use_identity_unavailable');
    }
    const grant = { profileId: scope[0], deviceId: scope[1], date: prompt.admission.dateKey,
      ruleId: prompt.admission.ruleKey, domain: prompt.host,
      causes: prompt.admission.reasons, startMs: now(), endMs: null, durableEvidence: true };
    if ((await closeGrants(grant.domain, grant.startMs))?.ok !== true
      || (await persistGrant(grant))?.ok !== true) {
      return reject(prompt, 'forced_use_grant_evidence_failed');
    }
    const grants = (Array.isArray(state.grants) ? state.grants : [])
      .filter(row => row.date === grant.date && row.profileId === grant.profileId
        && row.deviceId === grant.deviceId)
      .map(row => row.domain === grant.domain && row.endMs == null
        ? { ...row, endMs: grant.startMs } : row).slice(-63);
    await write({ ...state, progress: accepted.state, grants: [...grants, grant], prompt: null });
    await dismiss(prompt, true);
    report(prompt, 'continued', {
      baselineSeconds: accepted.state?.lastAcknowledgedUsageSeconds,
    });
    return { ok: true, action: 'continue' };
  });

  const ensureGrantForHost = (admission, host) => serialized(async () => {
    if (admission?.action !== 'allow' || !Array.isArray(admission.reasons)
      || !admission.reasons.length || !host) return { ok: false, error: 'grant_request_invalid' };
    const state = await read();
    const progress = state.progress;
    const grantedReasons = progress?.grants?.[admission.ruleKey];
    if (progress?.identityKey !== admission.identityKey || progress?.dateKey !== admission.dateKey
      || !Array.isArray(grantedReasons)
      || admission.reasons.some(reason => !grantedReasons.includes(reason))) {
      return { ok: false, error: 'grant_not_confirmed' };
    }
    let scope;
    try { scope = JSON.parse(admission.identityKey); } catch { scope = null; }
    if (!Array.isArray(scope) || !scope[0] || !scope[1]) return { ok: false, error: 'grant_identity_unavailable' };
    const existing = (Array.isArray(state.grants) ? state.grants : []).find(row =>
      row.profileId === scope[0] && row.deviceId === scope[1] && row.date === admission.dateKey
      && row.ruleId === admission.ruleKey && row.domain === host && row.endMs == null
      && admission.reasons.every(reason => row.causes?.includes(reason)));
    if (existing) {
      if ((await persistGrant(existing))?.ok !== true) {
        return { ok: false, error: 'forced_use_grant_evidence_failed' };
      }
      return { ok: true, existing: true };
    }
    const startedAt = now();
    const grant = { profileId: scope[0], deviceId: scope[1], date: admission.dateKey,
      ruleId: admission.ruleKey, domain: host, causes: admission.reasons,
      startMs: startedAt, endMs: null, durableEvidence: true };
    if ((await closeGrants(host, startedAt))?.ok !== true
      || (await persistGrant(grant))?.ok !== true) {
      return { ok: false, error: 'forced_use_grant_evidence_failed' };
    }
    const grants = (Array.isArray(state.grants) ? state.grants : [])
      .filter(row => row.date === admission.dateKey && row.profileId === scope[0]
        && row.deviceId === scope[1])
      .map(row => row.domain === host && row.endMs == null
        ? { ...row, endMs: startedAt } : row).slice(-63);
    await write({ ...state, grants: [...grants, grant] });
    return { ok: true, created: true };
  });

  const retireGrantsForHost = host => serialized(async () => {
    if (!host) return { ok: false, error: 'grant_host_missing' };
    const state = await read();
    if (!Array.isArray(state.grants) || !state.grants.some(row => row.domain === host && row.endMs == null)) {
      return { ok: true, retired: 0 };
    }
    const endedAt = now();
    if ((await closeGrants(host, endedAt))?.ok !== true) {
      return { ok: false, error: 'forced_use_grant_close_failed' };
    }
    let retired = 0;
    const grants = state.grants.map(row => {
      if (row.domain !== host || row.endMs != null) return row;
      retired++;
      return { ...row, endMs: endedAt };
    });
    await write({ ...state, grants });
    return { ok: true, retired };
  });

  const checkDeadline = () => serialized(async () => {
    const state = await read();
    if (!state.prompt?.deadlineAt || now() < state.prompt.deadlineAt) return { ok: true, pending: !!state.prompt };
    return end(state, 'confirmation_timeout');
  });

  const recover = () => serialized(async () => {
    const state = await read(), prompt = state.prompt;
    if (!prompt) return { ok: true, skipped: 'no_prompt' };
    if (prompt.deadlineAt === null) return end(state, 'delivery_interrupted');
    if (now() >= prompt.deadlineAt) return end(state, 'confirmation_timeout');
    const shown = await message(prompt.tabId, { type: 'SHOW_REST_USAGE_REMINDER',
      token: prompt.token, confirmationKind: 'forced_use',
      forcedUseReasons: prompt.admission.reasons,
      forcedUsePresentation: prompt.admission.presentation });
    if (shown?.ok !== true || shown.visible !== true || shown.confirmationVersion !== 1) {
      return end(state, 'delivery_lost');
    }
    const activated = await message(prompt.tabId, { type: 'ACTIVATE_REST_USAGE_REMINDER',
      token: prompt.token, deadlineAt: prompt.deadlineAt, timeoutAction: 'end' });
    if (activated?.ok !== true || activated.visible !== true || activated.confirmationVersion !== 1) {
      return end(state, 'delivery_lost');
    }
    await api.alarms.create(FORCED_USE_PROMPT_DEADLINE_ALARM, { when: prompt.deadlineAt });
    report(prompt, 'restored', { visible: true });
    return { ok: true, restored: true };
  });

  return { request, handleAction, ensureGrantForHost, retireGrantsForHost, checkDeadline, recover };
}

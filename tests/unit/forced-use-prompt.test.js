'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const moduleExports = {};
const source = fs.readFileSync(path.resolve(__dirname, '../../extension/product/forced-use-prompt.js'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: moduleExports, require: name => ({
  '../core/forced-use-admission.js': { confirmForcedUseAdmission: (shown, latest) => shown === latest
    ? { ok: true, state: { identityKey: shown.identityKey, dateKey: shown.dateKey,
      grants: { [shown.ruleKey]: shown.reasons }, acknowledged: true } }
    : { ok: false, reason: 'forced_use_confirmation_stale' } },
  '../core/autonomy-confirmation.js': { isAutonomyConfirmationText: text => text === '强行使用' },
})[name], crypto: { randomUUID: () => 'test-token' } });

function fixture({ deliveryFails = false, hardAtConfirm = false, grantFails = false,
  evidenceFails = false } = {}) {
  const values = {}, messages = [], blocks = [], grants = [], alarms = [], evidence = [], closures = [];
  let clock = 1000;
  let closeFails = false;
  const admission = { ok: true, action: 'confirm', reasons: ['dailyComposite'],
    identityKey: JSON.stringify(['profile-a', 'device-a']), dateKey: '2026-10-15',
    ruleKey: 'wiki-rule' };
  const api = { tabs: { sendMessage: async (tabId, payload) => {
    messages.push([tabId, payload]);
    if (payload.type === 'SHOW_REST_USAGE_REMINDER' && deliveryFails) return null;
    if (['SHOW_REST_USAGE_REMINDER', 'ACTIVATE_REST_USAGE_REMINDER'].includes(payload.type)) {
      return { ok: true, visible: true, confirmationVersion: 1 };
    }
    return { ok: true };
  } }, alarms: { create: async (name, value) => alarms.push([name, value]), clear: async () => true } };
  const storage = { get: async key => ({ [key]: values[key] }), set: async next => Object.assign(values, next) };
  const runtime = moduleExports.createForcedUsePromptRuntime({ api, storage, now: () => clock,
    recheck: async prompt => hardAtConfirm ? { action: 'block' } : prompt.admission,
    onAccepted: async (prompt, state) => { grants.push([prompt, state]); return { ok: !grantFails }; },
    persistGrant: async grant => { evidence.push(grant); return { ok: !evidenceFails }; },
    closeGrants: async (host, endedAt) => { closures.push([host, endedAt]); return { ok: !closeFails }; },
    block: async (prompt, reason) => { blocks.push([prompt, reason]); return { ok: true }; } });
  return { runtime, admission, values, messages, blocks, grants, alarms, evidence, closures,
    setClock: value => { clock = value; }, setCloseFailure: value => { closeFails = value; } };
}

(async () => {
  const f = fixture();
  assert.equal((await f.runtime.request({ tabId: 7, host: 'wiki.example', admission: f.admission })).ok, true);
  assert.deepEqual(f.messages.slice(0, 2).map(([, payload]) => payload.type),
    ['SHOW_REST_USAGE_REMINDER', 'ACTIVATE_REST_USAGE_REMINDER']);
  assert.equal(f.alarms.length, 1);
  assert.equal(f.alarms[0][1].when, 61000);
  assert.equal((await f.runtime.request({ tabId: 7, host: 'wiki.example', admission: f.admission })).pending, true);
  assert.equal(f.messages.filter(([, payload]) => payload.type === 'SHOW_REST_USAGE_REMINDER').length, 1);
  assert.equal((await f.runtime.request({ tabId: 8, host: 'wiki.example', admission: f.admission })).error,
    'forced_use_prompt_busy');
  assert.equal((await f.runtime.handleAction({ token: 'wrong', action: 'continue' },
    { tab: { id: 7 }, frameId: 0 })).error, 'stale_prompt');
  assert.equal((await f.runtime.handleAction({ token: 'test-token', action: 'continue', confirmationText: '强行使用' },
    { tab: { id: 8 }, frameId: 0 })).error, 'invalid_prompt_sender');
  assert.equal((await f.runtime.handleAction({ token: 'test-token', action: 'continue', confirmationText: '复制文本' },
    { tab: { id: 7 }, frameId: 0 })).error, 'confirmation_text_required');
  assert.equal((await f.runtime.handleAction({ token: 'test-token', action: 'continue', confirmationText: '强行使用' },
    { tab: { id: 7 }, frameId: 0 })).action, 'continue');
  assert.equal(f.grants.length, 1);
  assert.equal(f.evidence.length, 1);
  assert.equal(f.values[moduleExports.FORCED_USE_PROMPT_KEY].prompt, null);
  assert.equal(f.values[moduleExports.FORCED_USE_PROMPT_KEY].grants[0].domain, 'wiki.example');
  assert.equal(f.values[moduleExports.FORCED_USE_PROMPT_KEY].grants[0].profileId, 'profile-a');
  const allowed = { ...f.admission, action: 'allow' };
  assert.equal((await f.runtime.ensureGrantForHost(allowed, 'wiki.example')).existing, true);
  assert.equal((await f.runtime.ensureGrantForHost(allowed, 'other.wiki.example')).created, true);
  assert.equal(f.values[moduleExports.FORCED_USE_PROMPT_KEY].grants.length, 2);
  assert.equal(f.messages.at(-1)[1].type, 'RESUME_REST_USAGE_MEDIA');
  f.setClock(2000);
  assert.equal((await f.runtime.retireGrantsForHost('wiki.example')).retired, 1);
  assert.equal(f.values[moduleExports.FORCED_USE_PROMPT_KEY].grants[0].endMs, 2000);
  assert.equal(f.values[moduleExports.FORCED_USE_PROMPT_KEY].grants[1].endMs, null);
  assert.equal((await f.runtime.retireGrantsForHost('wiki.example')).retired, 0);

  const failedDelivery = fixture({ deliveryFails: true });
  assert.equal((await failedDelivery.runtime.request({ tabId: 7, host: 'wiki.example',
    admission: failedDelivery.admission })).error, 'forced_use_delivery_failed');
  assert.equal(failedDelivery.values[moduleExports.FORCED_USE_PROMPT_KEY].prompt, null);
  assert.equal(failedDelivery.alarms.length, 0);

  const hard = fixture({ hardAtConfirm: true });
  await hard.runtime.request({ tabId: 7, host: 'wiki.example', admission: hard.admission });
  assert.equal((await hard.runtime.handleAction({ token: 'test-token', action: 'continue', confirmationText: '强行使用' },
    { tab: { id: 7 }, frameId: 0 })).reason, 'hard_limit');
  assert.equal(hard.grants.length, 0);
  assert.equal(hard.blocks.length, 1);

  const rejectedGrant = fixture({ grantFails: true });
  await rejectedGrant.runtime.request({ tabId: 7, host: 'wiki.example', admission: rejectedGrant.admission });
  assert.equal((await rejectedGrant.runtime.handleAction({ token: 'test-token', action: 'continue', confirmationText: '强行使用' },
    { tab: { id: 7 }, frameId: 0 })).error, 'forced_use_grant_failed');
  assert.notEqual(rejectedGrant.values[moduleExports.FORCED_USE_PROMPT_KEY].prompt, null);

  const rejectedEvidence = fixture({ evidenceFails: true });
  await rejectedEvidence.runtime.request({ tabId: 7, host: 'wiki.example', admission: rejectedEvidence.admission });
  assert.equal((await rejectedEvidence.runtime.handleAction({ token: 'test-token', action: 'continue',
    confirmationText: '强行使用' }, { tab: { id: 7 }, frameId: 0 })).error,
  'forced_use_grant_evidence_failed');
  assert.notEqual(rejectedEvidence.values[moduleExports.FORCED_USE_PROMPT_KEY].prompt, null);
  assert.equal(rejectedEvidence.messages.some(([, payload]) => payload.type === 'RESUME_REST_USAGE_MEDIA'), false);

  const rejectedClose = fixture();
  await rejectedClose.runtime.request({ tabId: 7, host: 'wiki.example', admission: rejectedClose.admission });
  await rejectedClose.runtime.handleAction({ token: 'test-token', action: 'continue',
    confirmationText: '强行使用' }, { tab: { id: 7 }, frameId: 0 });
  rejectedClose.setCloseFailure(true);
  assert.equal((await rejectedClose.runtime.retireGrantsForHost('wiki.example')).error,
    'forced_use_grant_close_failed');
  assert.equal(rejectedClose.values[moduleExports.FORCED_USE_PROMPT_KEY].grants[0].endMs, null);

  const timedOut = fixture();
  await timedOut.runtime.request({ tabId: 7, host: 'wiki.example', admission: timedOut.admission });
  timedOut.values[moduleExports.FORCED_USE_PROMPT_KEY].progress = { grants: {
    'wiki-rule': ['dailyComposite'], 'other-rule': ['dailyRest'] } };
  timedOut.values[moduleExports.FORCED_USE_PROMPT_KEY].grants = [{ domain: 'wiki.example', endMs: null }];
  timedOut.setClock(61000);
  assert.equal((await timedOut.runtime.checkDeadline()).reason, 'confirmation_timeout');
  assert.equal(timedOut.blocks.length, 1);
  assert.equal(timedOut.values[moduleExports.FORCED_USE_PROMPT_KEY].prompt, null);
  assert.equal(timedOut.values[moduleExports.FORCED_USE_PROMPT_KEY].progress.grants['wiki-rule'], undefined);
  assert.deepEqual(timedOut.values[moduleExports.FORCED_USE_PROMPT_KEY].progress.grants['other-rule'], ['dailyRest']);
  assert.equal(timedOut.values[moduleExports.FORCED_USE_PROMPT_KEY].grants[0].endMs, 61000);
  const recovery = fixture();
  await recovery.runtime.request({ tabId: 7, host: 'wiki.example', admission: recovery.admission });
  assert.equal((await recovery.runtime.recover()).restored, true);
  assert.equal(recovery.alarms.length, 2);
  recovery.values[moduleExports.FORCED_USE_PROMPT_KEY].prompt.deadlineAt = null;
  assert.equal((await recovery.runtime.recover()).reason, 'delivery_interrupted');
  assert.equal(recovery.blocks.length, 1);
  console.log('forced-use-prompt: passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

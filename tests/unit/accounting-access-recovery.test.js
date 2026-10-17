'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const helper = fs.readFileSync(path.join(__dirname, 'mode-service.test.js'), 'utf8').split('(async function main()')[0];
const load = vm.runInNewContext(helper + '\nloadModeService;', { require, __dirname, console, process, URL });
const clone = value => structuredClone(value);

(async () => {
  const config = { enabled: true, mode: 'study', timeQuota: { accountingVersion: 2 },
    restrictedEntertainmentList: ['fixture.test'], compositeList: ['wiki.test'], studyList: ['study.test'] };
  const usage = { ok: true, studySeconds: 0, compositeSeconds: 0, restSeconds: 0,
    totalSeconds: 0, weekRestSeconds: 0, domainSeconds: {} };
  const result = overrides => ({ ok: true, accountingVersion: 2, config: clone(config),
    newState: {}, lockedDomains: [], usage: clone(usage), ...overrides });
  const event = { type: 'ACCESS_OBSERVED', url: 'https://fixture.test/', tabId: 5,
    foreground: true, auditId: 'synthetic-audit', nowMs: Date.parse('2026-10-17T12:00:00+08:00') };
  for (const [stage, overrides] of [
    ['quota_read', { evaluateQuotaState: async () => result({ accountingUnavailable: true, usage: { ok: false } }) }],
    ['shared_day_missing', { evaluateQuotaState: async () => result({ sharedRuntime: true,
      sharedModel: { policy: { schemaVersion: 1 }, preparation: { projection: { days: [], week: {} } } } }) }],
    ['shared_admission', { evaluateQuotaState: async () => result({ sharedRuntime: true,
      sharedModel: { policy: { schemaVersion: 1 }, preparation: { projection: {
        days: [{ date: '2026-10-17' }], week: {}, complete: false } } } }),
      sharedAccessAdmissionV1: () => ({ decision: 'deny', reasonCode: 'MISSING_SYNTHETIC_EVIDENCE' }) }],
    ['forced_admission', { readForcedUsePolicy: () => ({ enabled: true }),
      ensureForcedUseContributions: async () => ({ ok: false, reason: 'grant_journal_missing' }),
      prepareForcedUseAdmission: () => ({ ok: false, action: 'block', reasons: ['forced_use_evidence_unavailable'] }) }],
    ['composite_remaining', { readForcedUsePolicy: () => ({ enabled: true }),
      prepareForcedUseAdmission: () => ({ ok: true, action: 'allow', reasons: [] }) }],
  ]) {
    const svc = load({ getConfig: async () => clone(config), evaluateQuotaState: async () => result({}),
      resolveManagedTargetAttribution: () => null, ...overrides });
    const decision = await svc.handleModeEvent({ ...event,
      ...(stage === 'composite_remaining' ? { url: 'https://wiki.test/' } : {}) });
    assert.equal(decision.access, 'allow', stage);
    assert.equal(decision.reminder, null, stage);
    assert.equal(decision.modeChange, null, stage);
    assert.equal(decision.accountingEvidence.stage, stage);
    assert.equal(decision.auditId, event.auditId);
    assert.equal(typeof decision.evaluationId, 'string');
  }
  const unavailable = load({ getConfig: async () => clone(config),
    evaluateQuotaState: async () => result({ accountingUnavailable: true, usage: { ok: false } }),
    hasTimeWindowsDaily: () => true, getModeWindowStatus: () => ({ allowed: false }) });
  assert.equal((await unavailable.handleModeEvent(event)).reminder.reason, 'rest_schedule_locked',
    'an independently closed window remains enforced before reading unavailable quota');
  const unsafe = load({ getConfig: async () => ({ ...clone(config), unsafeList: ['fixture.test'] }),
    evaluateQuotaState: async () => { throw Error('blacklist must precede quota reads'); } });
  assert.equal((await unsafe.handleModeEvent(event)).reminder.reason, 'unsafe');
  const locked = { onlineLocked: true, studyLocked: true, restLocked: true, undeterminedLocked: true,
    dailyRestLocked: true, weeklyRestLocked: true };
  const study = load({ getConfig: async () => ({ ...clone(config), mode: 'locked' }),
    getSession: async () => ({ currentMode: 'locked' }), evaluateQuotaState: async () => result({
      newState: locked, lockedDomains: ['study.test'] }) });
  const learning = await study.handleModeEvent({ ...event, url: 'https://study.test/' });
  assert.equal(learning.access, 'allow');
  assert.equal(learning.modeChange.toMode, 'study');
  assert.equal(learning.classification, 'study');
  const concurrent = load({ getConfig: async () => clone(config), evaluateQuotaState: async () => result({}) });
  const [a, b] = await Promise.all([concurrent.handleModeEvent(event), concurrent.handleModeEvent({ ...event, auditId: 'synthetic-other' })]);
  assert.notEqual(a.evaluationId, b.evaluationId);
  assert.notEqual(a.quotaEvidence, b.quotaEvidence);
  assert.equal(a.auditId, 'synthetic-audit');
  assert.equal(b.auditId, 'synthetic-other');
  // Use the production background callback and prompt runtime together with the real access decision.
  const background = fs.readFileSync(path.join(__dirname, '../../extension/background.js'), 'utf8');
  const actionCallback = background.split('    forcedUsePrompt.handleAction(msg, sender).then((result) => {')[1]
    .split('    }).catch(() => sendResponse')[0];
  const scheduled = [], responses = [];
  const onAction = vm.runInNewContext('(result => {' + actionCallback + '})', {
    sender: { tab: { id: 5 } }, sendResponse: result => responses.push(result),
    setTimeout: task => scheduled.push(task), reevaluateTabById: async () => {},
  });
  onAction({ ok: true, action: 'continue', accountingUnavailable: true });
  assert.equal(responses.length, 1);
  assert.equal(scheduled.length, 0, 'fault release must not immediately reopen the failed confirmation');
  onAction({ ok: true, action: 'continue' });
  assert.equal(scheduled.length, 1, 'healthy continuation retains its normal recheck');
  const recheckSource = background.split('  recheck: async prompt => {')[1].split('\n  onAccepted:')[0]
    .trim().replace(/},$/, '}');
  const promptExports = {};
  const ts = require('typescript');
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,
    '../../extension/product/forced-use-prompt.js'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: promptExports, crypto: { randomUUID: () => 'joint-token' },
    require: name => name.includes('autonomy-confirmation')
      ? { isAutonomyConfirmationText: value => value === '强行使用' }
      : { confirmForcedUseAdmission: () => { throw Error('fault must bypass confirmation admission'); } } });
  for (const independent of [false, true]) for (const phase of ['continue', 'timeout', 'recover']) {
    const svc = load({ getConfig: async () => ({ ...clone(config), ...(independent ? { unsafeList: ['fixture.test'] } : {}) }),
      evaluateQuotaState: async () => result({ accountingUnavailable: true, usage: { ok: false } }) });
    const identityKey = JSON.stringify(['synthetic-profile', 'synthetic-device']);
    const recheck = vm.runInNewContext('(async prompt => {' + recheckSource + ')', {
      readScheduleConfirmationScope: async () => identityKey,
      chrome: { tabs: { get: async () => ({ id: 5, active: true, url: event.url }) } }, URL,
      handleModeEvent: input => svc.handleModeEvent({ ...input, nowMs: event.nowMs }),
      getSyncState: () => ({ monitoringEnabled: true }),
    });
    const values = {}, messages = [], blocks = [];
    let clock = 1000;
    const runtime = promptExports.createForcedUsePromptRuntime({
      storage: { get: async key => ({ [key]: values[key] }), set: async next => Object.assign(values, next) },
      api: { tabs: { sendMessage: async (_, payload) => {
        messages.push(payload.type); return { ok: true, visible: true, confirmationVersion: 1 };
      } }, alarms: { clear: async () => true, create: async () => {} } },
      now: () => clock, recheck, onAccepted: async () => { throw Error('unexpected acceptance'); },
      block: async (_, reason) => { blocks.push(reason); return { ok: true }; },
    });
    await runtime.request({ tabId: 5, host: 'fixture.test', admission: {
      ok: true, action: 'confirm', identityKey, reasons: ['dailyRest'], ruleKey: 'synthetic-rule',
    } });
    let action;
    if (phase === 'timeout') { clock = 61000; action = await runtime.checkDeadline(); }
    else if (phase === 'recover') action = await runtime.recover();
    else action = await runtime.handleAction({ token: 'joint-token', action: 'continue', confirmationText: '强行使用' },
      { tab: { id: 5 }, frameId: 0 });
    assert.equal(blocks.length, independent ? 1 : 0, phase);
    assert.equal(action.accountingUnavailable === true, !independent, phase);
    assert.equal(messages.includes('RESUME_REST_USAGE_MEDIA'), !independent, phase);
    assert.equal(values[promptExports.FORCED_USE_PROMPT_KEY].prompt, null);
  }
  console.log('accounting-access-recovery: five admission failures, independent window/blacklist, study exemption and concurrent evidence PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });

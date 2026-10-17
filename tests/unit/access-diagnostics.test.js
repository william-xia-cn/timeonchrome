'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../../extension/infra/access-diagnostics.js'), 'utf8');
const { createAccessDiagnostics } = new Function('logClientEvent', source.replace(/^import .*;$/gm, '')
  .replace(/export /g, '') + '\nreturn { createAccessDiagnostics };')(() => {});
const rows = [];
let clock = 1000;
const log = createAccessDiagnostics({ write: row => rows.push(row), now: () => clock });
log('decision', { auditId: 'access-test', access: 'allow', tabId: 2, forcedUsageSeconds: 1500,
  baselineSeconds: 0, url: 'https://private.example/secret', token: 'private',
  confirmationText: 'private', policySignature: 'private', reasons: ['dailyRest', 'https://private.example'] });
assert.equal(rows[0].details.forcedUsageSeconds, 1500);
assert.equal(rows[0].details.baselineSeconds, 0);
assert(!JSON.stringify(rows).includes('private'));
assert.deepEqual(rows[0].details.reasons, ['dailyRest']);
log('periodic', { reason: 'no_focused_window', auditId: 'access-1', ok: true });
log('periodic', { reason: 'no_focused_window', auditId: 'access-2', ok: true });
assert.equal(rows.length, 2);
clock += 300000;
log('periodic', { reason: 'no_focused_window', auditId: 'access-3', ok: true });
assert.equal(rows.at(-1).details.suppressedCount, 1);
log('periodic', { reason: 'review_failed', ok: false });
assert.equal(rows.at(-1).level, 'warning');
const fail = createAccessDiagnostics({ write: () => { throw new Error('storage failed'); } });
assert.doesNotThrow(() => fail('prompt', { phase: 'visible' }));
const reject = createAccessDiagnostics({ write: async () => { throw new Error('storage failed'); } });
reject('prompt', { phase: 'visible' });
const incidents = [], accounting = createAccessDiagnostics({ write: row => incidents.push(row), now: () => clock });
const failure = { auditId: 'failure-audit', evaluationId: 'evaluation-a', tabId: 8,
  phase: 'forced_admission', causeCode: 'quota_usage_invalid', ok: false, blocked: false, access: 'allow', quotaRead: 'ok' };
accounting('accounting', failure);
accounting('accounting', { ...failure, evaluationId: 'evaluation-b' });
assert.equal(incidents.length, 1, 'unchanged failures are coalesced');
accounting('decision', { tabId: 8, ok: true, access: 'allow' });
assert.equal(incidents.length, 2, 'unverified allow is logged but does not claim recovery');
assert(!incidents.some(row => row.eventCode === 'access_accounting_recovered'));
accounting('decision', { tabId: 8, ok: true, access: 'allow', recoveryEligible: true });
assert.equal(incidents.filter(row => row.eventCode === 'access_accounting_recovered').length, 1);
assert.equal(incidents.find(row => row.eventCode === 'access_accounting_recovered').details.suppressedCount, 1);
accounting('accounting', { ...failure, causeCode: 'https://private.example/token=private' });
assert.equal(incidents.at(-1).details.causeCode, 'evidence_unavailable');
assert(!JSON.stringify(incidents).includes('private'));
const bg = fs.readFileSync(path.resolve(__dirname, '../../extension/background.js'), 'utf8');
for (const reason of ['monitoring_disabled', 'no_focused_window', 'no_active_tab', 'window_query_failed',
  'tab_query_failed', 'review_failed', 'review_completed', 'legacy_policy', 'shared_runtime_owner',
  'reminder_page_skipped', 'tab_read_failed', 'quota_check_failed', 'deadline_check_failed']) assert(bg.includes(`'${reason}'`));
console.log('access-diagnostics: sanitization, correlation, bounded periodic summaries and failure isolation passed');

// Execute the production alarm branch with isolated browser dependencies, not a rewritten policy.
const vm = require('node:vm');
const alarmBody = bg.split("} else if (alarm.name === 'quota_check') {")[1]
  .split('} else if (alarm.name === FORCED_USE_PROMPT_DEADLINE_ALARM)')[0];
async function periodicCase(options = {}) {
  const events = [], reviews = [];
  const run = vm.runInNewContext(`(async () => { ${alarmBody} })`, {
    Date, Math,
    recordAccessDiagnostic: (kind, detail) => events.push({ kind, ...detail }),
    isMonitoringEnabled: () => options.monitoring !== false,
    handleMessage: async () => { if (options.quotaFails) throw new Error('test'); return {}; },
    scheduleModeBoundaryDrain: () => {}, evaluateRestUsageReminder: async () => {}, recordFallbackLog: () => {},
    isSharedAccessRuntimeEnabled: () => options.shared === true,
    isSharedAccessRuntimeV2Enabled: () => false,
    readForcedUsePolicy: () => ({ enabled: options.enabled !== false }), getConfig: async () => ({}),
    chrome: { runtime: { id: 'test' }, windows: { WINDOW_ID_NONE: -1, getLastFocused: async () => {
      if (options.windowFails) throw new Error('test'); return { id: 1, focused: options.focused !== false };
    } }, tabs: { query: async () => {
      if (options.tabFails) throw new Error('test'); return options.noTab ? [] : [{ id: 7 }];
    } } },
    reevaluateTabById: async (id, context) => {
      reviews.push({ id, context });
      if (options.reviewFails) throw new Error('test');
    },
  });
  try { await run(); } catch (error) { if (!options.quotaFails) throw error; }
  return { events, reviews };
}
(async () => {
  for (const [options, reason] of [
    [{ monitoring: false }, 'monitoring_disabled'], [{ focused: false }, 'no_focused_window'],
    [{ noTab: true }, 'no_active_tab'], [{ windowFails: true }, 'window_query_failed'],
    [{ tabFails: true }, 'tab_query_failed'], [{ reviewFails: true }, 'review_failed'],
    [{ enabled: false }, 'legacy_policy'], [{ shared: true }, 'shared_runtime_owner'],
    [{ quotaFails: true }, 'quota_check_failed'],
  ]) {
    const result = await periodicCase(options);
    assert(result.events.some(event => event.reason === reason), reason);
    if (!options.reviewFails) assert.equal(result.reviews.length, 0, reason);
  }
  const result = await periodicCase();
  assert.equal(result.reviews.length, 1);
  assert.match(result.reviews[0].context.auditId, /^access-/);
  console.log('access-diagnostics: actual quota alarm branch executed, including skip and failure paths');
})().catch(error => { console.error(error); process.exitCode = 1; });

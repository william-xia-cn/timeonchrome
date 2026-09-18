'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const assert = require('assert');

const filename = path.join(__dirname, '..', '..', 'workers', 'src', 'services', 'usageAccountingCorrections.ts');
const source = fs.readFileSync(filename, 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(js, { module: moduleRef, exports: moduleRef.exports, require: () => ({}), console, crypto }, { filename });
const {
  compactUsageAccountingCorrectionDeltas,
  applyCorrectionsToCompactDeviceAccounts,
  applyCorrectionsToV1StatsRows,
  summarizeCompactDeviceAccounts,
  getBeijingWeekForTimestamp,
  isEligibleRestrictedReattributionSegment,
  applyRestrictedReattributionForRequest,
} = moduleRef.exports;

const correction = {
  id: 'correction-1', segmentId: 'segment-1', deviceId: 'device-1', date: '2026-09-14', domain: 'cg.163.com',
  startMs: Date.parse('2026-09-14T13:00:00Z'), endMs: Date.parse('2026-09-14T13:03:00Z'), durationSeconds: 180,
  channel: 'active', originalMode: 'study', originalTargetClassification: 'study', originalQuotaBucket: 'study',
  effectiveMode: 'rest', effectiveTargetClassification: 'restricted', effectiveQuotaBucket: 'rest', managedTargetId: null,
  createdAt: 1,
};

const deltas = compactUsageAccountingCorrectionDeltas([correction, { ...correction, id: 'correction-2', segmentId: 'segment-2' }]);
assert.strictEqual(deltas.length, 1);
assert.strictEqual(deltas[0].durationSeconds, 360);
assert.strictEqual(deltas[0].segmentCount, 2);

const accounts = [{
  deviceId: 'device-1', date: '2026-09-14',
  total: { totalSeconds: 180, byChannelMode: [{ channel: 'active', mode: 'study', durationSeconds: 180 }], byQuotaBucket: [{ quotaBucket: 'study', durationSeconds: 180 }] },
  quotaProjection: { activeSeconds: 180, byQuotaBucket: [{ quotaBucket: 'study', durationSeconds: 180 }], byDomain: [{ domain: 'cg.163.com', durationSeconds: 180 }] },
}];
const adjusted = applyCorrectionsToCompactDeviceAccounts(accounts, [correction]);
assert.strictEqual(adjusted[0].total.totalSeconds, 180, 'correction must conserve total seconds');
assert.deepStrictEqual(JSON.parse(JSON.stringify(adjusted[0].total.byChannelMode)), [{ channel: 'active', mode: 'rest', durationSeconds: 180 }]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(adjusted[0].quotaProjection.byQuotaBucket)), [{ quotaBucket: 'rest', durationSeconds: 180 }]);

const pendingAccounts = [{
  deviceId: 'device-1', date: '2026-09-18',
  total: {
    totalSeconds: 300,
    byChannelMode: [
      { channel: 'active', mode: 'composite', durationSeconds: 120 },
      { channel: 'active', mode: 'rest', durationSeconds: 180 },
    ],
    byQuotaBucket: [
      { quotaBucket: 'composite', durationSeconds: 120 },
      { quotaBucket: 'rest', durationSeconds: 180 },
    ],
  },
  quotaProjection: {
    activeSeconds: 300,
    byQuotaBucket: [
      { quotaBucket: 'composite', durationSeconds: 120 },
      { quotaBucket: 'rest', durationSeconds: 180 },
    ],
    byDomain: [{ domain: 'example.com', durationSeconds: 300 }],
  },
}];
const pendingCorrections = [
  {
    ...correction,
    id: 'pending-correction-1', segmentId: 'segment-a', date: '2026-09-18', domain: 'example.com',
    durationSeconds: 120, originalMode: 'composite', originalTargetClassification: 'pending_composite',
    originalQuotaBucket: 'composite', effectiveMode: 'rest', effectiveTargetClassification: 'restricted', effectiveQuotaBucket: 'rest',
  },
  {
    ...correction,
    id: 'pending-correction-2', segmentId: 'segment-b', date: '2026-09-18', domain: 'example.com',
    durationSeconds: 180, originalMode: 'rest', originalTargetClassification: 'pending_composite',
    originalQuotaBucket: 'rest', effectiveMode: 'rest', effectiveTargetClassification: 'restricted', effectiveQuotaBucket: 'rest',
  },
];
const pendingAdjusted = applyCorrectionsToCompactDeviceAccounts(pendingAccounts, pendingCorrections);
assert.strictEqual(pendingAdjusted[0].total.totalSeconds, 300, 'pending reattribution must conserve total seconds');
assert.deepStrictEqual(JSON.parse(JSON.stringify(pendingAdjusted[0].total.byChannelMode)), [
  { channel: 'active', mode: 'rest', durationSeconds: 300 },
]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(pendingAdjusted[0].quotaProjection.byQuotaBucket)), [
  { quotaBucket: 'rest', durationSeconds: 300 },
], 'already-rest segments must not be counted twice');
const totals = summarizeCompactDeviceAccounts([...adjusted, {
  deviceId: 'device-2', date: '2026-09-14',
  total: { totalSeconds: 60, byChannelMode: [{ channel: 'active', mode: 'study', durationSeconds: 60 }], byQuotaBucket: [{ quotaBucket: 'study', durationSeconds: 60 }] },
}]);
assert.strictEqual(totals.totalSeconds, 240, 'profile total must conserve and sum all devices');
assert.deepStrictEqual(JSON.parse(JSON.stringify(totals.byQuotaBucket)), [
  { quotaBucket: 'rest', durationSeconds: 180 },
  { quotaBucket: 'study', durationSeconds: 60 },
]);

const daily = applyCorrectionsToV1StatsRows([{
  device_id: 'device-1', date: '2026-09-14', domain: 'cg.163.com', channel: 'active', mode: 'study', duration_seconds: 180,
}], [correction], 'daily_domain');
assert.strictEqual(daily.reduce((sum, row) => sum + row.duration_seconds, 0), 180);
assert.strictEqual(daily[0].mode, 'rest');

const target = applyCorrectionsToV1StatsRows([{
  device_id: 'device-1', date: '2026-09-14', target_key: 'fallback:domain:cg.163.com', fallback_domain: 'cg.163.com',
  channel: 'active', mode: 'study', quota_bucket: 'study', target_classification_at_time: 'study', duration_seconds: 180,
}], [correction], 'daily_target');
assert.strictEqual(target.reduce((sum, row) => sum + row.duration_seconds, 0), 180);
assert.strictEqual(target[0].mode, 'rest');
assert.strictEqual(target[0].quota_bucket, 'rest');
assert.strictEqual(target[0].target_classification_at_time, 'restricted');

const classificationOnly = applyCorrectionsToV1StatsRows([{
  device_id: 'device-1', date: '2026-09-14', target_key: 'fallback:domain:cg.163.com', fallback_domain: 'cg.163.com',
  channel: 'active', mode: 'rest', quota_bucket: 'rest', target_classification_at_time: 'study', duration_seconds: 180,
}], [{ ...correction, originalMode: 'rest', originalQuotaBucket: 'rest', effectiveMode: 'rest', effectiveQuotaBucket: 'rest' }], 'daily_target');
assert.strictEqual(classificationOnly[0].duration_seconds, 180);
assert.strictEqual(classificationOnly[0].target_classification_at_time, 'restricted');

assert.deepStrictEqual(
  JSON.parse(JSON.stringify(getBeijingWeekForTimestamp(Date.parse('2026-09-18T03:00:00Z')))),
  { weekStart: '2026-09-14', weekEnd: '2026-09-20' },
);
assert.strictEqual(isEligibleRestrictedReattributionSegment({
  channel: 'active', target_rule_id: 'request-1', date: '2026-09-18',
  target_classification_at_time: 'pending_composite', duration_seconds: 30,
}, 'request-1', '2026-09-14', '2026-09-20'), true);
assert.strictEqual(isEligibleRestrictedReattributionSegment({
  channel: 'backgroundMedia', target_rule_id: 'request-1', date: '2026-09-18',
  target_classification_at_time: 'pending_composite', duration_seconds: 30,
}, 'request-1', '2026-09-14', '2026-09-20'), false, 'media must not be reattributed');
assert.strictEqual(isEligibleRestrictedReattributionSegment({
  channel: 'active', target_rule_id: 'another-request', date: '2026-09-18',
  target_classification_at_time: 'pending_composite', duration_seconds: 30,
}, 'request-1', '2026-09-14', '2026-09-20'), false, 'another request must not be matched by domain');

function statement(sql) {
  return {
    sql,
    args: [],
    bind(...args) { this.args = args; return this; },
    async first() { return fakeDb.first(this); },
    async all() { return fakeDb.all(this); },
  };
}

let corrected = false;
let correctionBatch = null;
const fakeDb = {
  prepare(sql) { return statement(sql); },
  async first(stmt) {
    if (stmt.sql.includes('FROM site_classification_requests_v1 r')) {
      return { id: 'request-1', profile_id: 'profile-1', decision: 'reject', decided_at: Date.parse('2026-09-18T03:00:00Z'), account_id: 'account-1' };
    }
    if (stmt.sql.includes('SELECT s.device_id, s.date, s.domain')) {
      return corrected ? null : { device_id: 'device-1', date: '2026-09-18', domain: 'example.com' };
    }
    throw new Error(`unexpected first SQL: ${stmt.sql}`);
  },
  async all(stmt) {
    if (stmt.sql.includes('SELECT s.id, s.profile_id')) {
      return { results: [
        { id: 'segment-a', profile_id: 'profile-1', device_id: 'device-1', date: '2026-09-18', domain: 'example.com', start_ms: 1, end_ms: 121001, duration_seconds: 120, channel: 'active', mode: 'composite', target_classification_at_time: 'pending_composite', quota_bucket_at_time: 'composite', target_rule_id: 'request-1' },
        { id: 'segment-b', profile_id: 'profile-1', device_id: 'device-1', date: '2026-09-18', domain: 'example.com', start_ms: 122001, end_ms: 302001, duration_seconds: 180, channel: 'active', mode: 'rest', target_classification_at_time: 'pending_composite', quota_bucket_at_time: 'rest', target_rule_id: 'request-1' },
      ] };
    }
    throw new Error(`unexpected all SQL: ${stmt.sql}`);
  },
  async batch(statements) {
    correctionBatch = statements;
    corrected = true;
    return statements.map(() => ({ success: true }));
  },
};

(async () => {
  const summary = await applyRestrictedReattributionForRequest({ DB: fakeDb }, 'profile-1', 'request-1');
  assert.strictEqual(summary.applicable, true);
  assert.strictEqual(summary.complete, true);
  assert.strictEqual(summary.segmentCount, 2);
  assert.strictEqual(summary.durationSeconds, 300);
  assert.strictEqual(summary.batchCount, 1);
  assert.strictEqual(correctionBatch.length, 3, 'one header plus two immutable segment corrections');
  assert(correctionBatch[1].sql.includes('s.target_rule_id') === false, 'insert statement must not copy request linkage into correction schema');
  assert(correctionBatch[1].sql.includes("'rest', 'restricted', 'rest'"));
  const repeated = await applyRestrictedReattributionForRequest({ DB: fakeDb }, 'profile-1', 'request-1');
  assert.strictEqual(repeated.complete, true);
  assert.strictEqual(repeated.segmentCount, 0, 'a repeated run must not create duplicate corrections');
  assert.strictEqual(repeated.durationSeconds, 0);
  assert.strictEqual(repeated.batchCount, 0);
  console.log('[Usage Accounting Corrections] passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

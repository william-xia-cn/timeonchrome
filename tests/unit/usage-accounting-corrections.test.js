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
vm.runInNewContext(js, { module: moduleRef, exports: moduleRef.exports, require: () => ({}), console }, { filename });
const { compactUsageAccountingCorrectionDeltas, applyCorrectionsToCompactDeviceAccounts, applyCorrectionsToV1StatsRows, summarizeCompactDeviceAccounts } = moduleRef.exports;

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

console.log('[Usage Accounting Corrections] passed');

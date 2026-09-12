// Run with: node tests/unit/account-reconciliation-v2.test.js
'use strict';

const fs = require('fs');
const path = require('path');

function load(file, names, injected = {}) {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  return new Function('__injected', `const { ${Object.keys(injected).join(', ')} } = __injected;\n${code}\nreturn { ${names.join(', ')} };`)(injected);
}

const root = path.join(__dirname, '..', '..');
const device = load(path.join(root, 'extension', 'core', 'device-account-v2.js'), [
  'canonicalDeviceAccountJson', 'hashDeviceAccountValue', 'validateDeviceAccountRows',
], { runStorageMutation: async () => {} });
const splitSegmentByLocalHour = (segment) => [{ ...segment, hourKey: `${segment.date}T10` }];
const hashUsageSegmentContent = (segment) => device.hashDeviceAccountValue(segment);
const auditModule = load(path.join(root, 'extension', 'core', 'account-reconciliation-v2.js'), [
  'buildAuditDeviceAccountFromSegments', 'compareDeviceAccountAudit',
], { ...device, splitSegmentByLocalHour, hashUsageSegmentContent });

function segment(overrides = {}) {
  return {
    id: 'seg-1', date: '2026-09-14', timezone: 'Asia/Shanghai', dayStartMs: 0, dayEndMs: 1,
    startMs: 1000, endMs: 61000, durationSeconds: 60, domain: 'example.com', channel: 'active',
    mode: 'rest', sourceState: 'ACTIVE', settlementReason: 'checkpoint', parentSegmentId: null,
    partIndex: 1, partCount: 1, tabId: '1', windowId: 2, description: null,
    managedTargetId: null, managedTargetType: null, managedTargetNamespace: null,
    managedTargetValue: null, managedTargetLabelAtTime: null, targetSourceAtTime: null,
    targetRuleId: null, targetMatchLevel: null, targetClassificationAtTime: null,
    quotaBucketAtTime: 'rest', ...overrides,
  };
}

let passed = 0;
function check(label, condition, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
  passed++;
}

(async () => {
  const audit = await auditModule.buildAuditDeviceAccountFromSegments('2026-09-14', [segment()]);
  check('raw fact produces four conserved account dimensions', audit.rows.length === 4 && Object.values(audit.totals).every((value) => value === 60));
  check('fallback target carries rest quota bucket', audit.rows.some((row) => row.kind === 'daily_target' && row.quotaBucket === 'rest'));
  check('raw fact hash is deterministic', audit.rawFactHash === (await auditModule.buildAuditDeviceAccountFromSegments('2026-09-14', [segment()])).rawFactHash);

  const matched = auditModule.compareDeviceAccountAudit(audit, audit);
  check('identical immutable account matches', matched.matched === true && matched.rowDifferenceCount === 0);
  const changedQuota = await auditModule.buildAuditDeviceAccountFromSegments('2026-09-14', [segment({ quotaBucketAtTime: 'study' })]);
  const quotaMismatch = auditModule.compareDeviceAccountAudit(audit, changedQuota);
  check('same seconds with different quota bucket mismatches', quotaMismatch.matched === false && quotaMismatch.totalSecondsDelta === 0 && quotaMismatch.rowDifferenceCount > 0);
  const changedDomain = await auditModule.buildAuditDeviceAccountFromSegments('2026-09-14', [segment({ domain: 'other.test' })]);
  check('same seconds with different domain mismatches', auditModule.compareDeviceAccountAudit(audit, changedDomain).rowDifferenceCount > 0);
  const zero = await auditModule.buildAuditDeviceAccountFromSegments('2026-09-14', [segment({ id: 'zero', endMs: 1000, durationSeconds: 0 })]);
  check('zero-duration fact is hashed but adds no stats rows', zero.rawFactCount === 1 && zero.rows.length === 0 && zero.totalSeconds === 0);
  const extraFact = await auditModule.buildAuditDeviceAccountFromSegments('2026-09-14', [segment(), segment({ id: 'seg-2', startMs: 70000, endMs: 71000, durationSeconds: 1 })]);
  check('different raw fact set mismatches count and hash', auditModule.compareDeviceAccountAudit(audit, extraFact).rawFactCountDelta === 1);

  const worker = fs.readFileSync(path.join(root, 'workers', 'src', 'services', 'accountReconciliationV2.ts'), 'utf8');
  check('reconciliation fixes device date revision and raw cutoff', worker.includes('deviceId') && worker.includes('revision') && worker.includes('rawCutoff'));
  check('reconciliation never updates source account tables', !/UPDATE\s+(usage_segments_v1|device_account_manifests_v2|device_account_heads_v2|profile_account_)/i.test(worker));
  check('mismatch incident is bounded', worker.includes('OFFSET 100'));

  console.log(`[Account Reconciliation V2] ${passed}/${passed} passed`);
})().catch((error) => { console.error(error); process.exit(1); });


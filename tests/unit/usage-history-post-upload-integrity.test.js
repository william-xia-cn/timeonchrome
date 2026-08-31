// Run with: node tests/unit/usage-history-post-upload-integrity.test.js

'use strict';

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'cloud-sync.js'), 'utf8');

function extractFunctionSource(code, name) {
  const marker = `async function ${name}(`;
  const start = code.indexOf(marker);
  if (start < 0) throw new Error(`${name} not found`);
  const braceStart = code.indexOf('{', code.indexOf(')', start));
  let depth = 0;
  for (let index = braceStart; index < code.length; index++) {
    if (code[index] === '{') depth++;
    if (code[index] === '}') {
      depth--;
      if (depth === 0) return code.slice(start, index + 1);
    }
  }
  throw new Error(`${name} parse failed`);
}

function check(label, condition, details = '') {
  if (!condition) throw new Error(`${label}${details ? `: ${details}` : ''}`);
}

function addDays(dateKey, delta) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

async function runScenario(convergesAfterUpload) {
  const writes = [];
  const integrityReads = [];
  const pkg = {
    date: '2026-08-30', segmentIds: ['seg-1'], hourKeys: ['2026-08-30T10'],
    summary: {
      usageSegments: { count: 1, seconds: 60 }, dailyStats: { count: 1, seconds: 60 },
      targetStats: { count: 1, seconds: 60 }, hourlyStats: { count: 1, seconds: 60 },
      hourlyTargetStats: { count: 1, seconds: 60 },
    },
  };
  const injected = {
    statsFoundationV1SyncEnabled: true,
    syncState: { deviceToken: 'token', monitoringEnabled: 1 },
    getDateKey: () => '2026-08-31',
    addDaysToDateKey: addDays,
    compareDateKeys: (a, b) => a === b ? 0 : (a < b ? -1 : 1),
    getUsageHistoryWatermark: async () => '2026-08-29',
    makeUsageDateSyncResult: () => ({ uploaded: 0, failed: 0, skipped: false, dryRun: false, pendingCount: 0, errors: [], dates: [] }),
    CLOUD_CONFIG: {
      MAX_HISTORY_USAGE_DATES_PER_SYNC: 7,
      KEYS: {
        USAGE_STATS_HISTORY_SYNCED_THROUGH_DATE: 'waterline',
        USAGE_STATS_HISTORY_LAST_UPLOAD_AT: 'last_upload',
        USAGE_STATS_HISTORY_LAST_ERROR: 'last_error',
      },
    },
    buildUsageDateUploadPackage: async () => pkg,
    getRemoteUsageDateIntegrity: async () => {
      integrityReads.push(Date.now());
      return { complete: integrityReads.length > 1 && convergesAfterUpload };
    },
    isCloudIntegrityCompleteForPackage: (integrity) => integrity.complete === true,
    markUsageDatePackageUploaded: async () => {},
    uploadUsageDatePackageParts: async () => ({ uploaded: 5, failed: 0, errors: [] }),
    mergeUsageDatePartResults: (target, child) => {
      target.uploaded += child.uploaded;
      target.failed += child.failed;
      target.errors.push(...child.errors);
    },
    cloudStorageSet: async (value) => writes.push(value),
    logCloudFailureIncidentBestEffort: () => {},
  };
  const names = Object.keys(injected);
  const fn = new Function('__injected',
    `const { ${names.join(', ')} } = __injected;\n${extractFunctionSource(source, 'uploadHistoricalUsageStatsByWatermarkV1')}\nreturn uploadHistoricalUsageStatsByWatermarkV1;`)(injected);
  const result = await fn({ enabled: true });
  return { result, writes, integrityReads };
}

(async () => {
  const incomplete = await runScenario(false);
  check('history performs pre and post upload integrity reads', incomplete.integrityReads.length === 2, String(incomplete.integrityReads.length));
  check('incomplete post-upload state blocks waterline', !incomplete.writes.some((item) => item.waterline === '2026-08-30'), JSON.stringify(incomplete.writes));
  check('incomplete post-upload state remains failed', incomplete.result.failed === 1 && incomplete.result.errors.some((item) => item.includes('not converged')), JSON.stringify(incomplete.result));

  const complete = await runScenario(true);
  check('converged history advances waterline', complete.writes.some((item) => item.waterline === '2026-08-30'), JSON.stringify(complete.writes));
  check('converged history has no failure', complete.result.failed === 0, JSON.stringify(complete.result));

  console.log('[Usage History Post-upload Integrity] 5/5 passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

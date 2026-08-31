// Run with: node tests/unit/cloud-usage-batching.test.js

'use strict';

const fs = require('fs');
const path = require('path');

function extractFunctionSource(code, name) {
  const marker = `function ${name}(`;
  const asyncMarker = `async function ${name}(`;
  const start = code.indexOf(asyncMarker) >= 0 ? code.indexOf(asyncMarker) : code.indexOf(marker);
  if (start < 0) throw new Error(`${name} not found`);
  const signatureEnd = code.indexOf(') {', start);
  const braceStart = signatureEnd + 2;
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

function loadUploadFunction(injected) {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'cloud-sync.js'), 'utf8');
  const source = [
    extractFunctionSource(code, 'makeUploadPartResult'),
    extractFunctionSource(code, 'makeUsageDateSyncResult'),
    extractFunctionSource(code, 'uploadUsageDatePackageParts'),
  ].join('\n');
  const names = Object.keys(injected);
  const factory = new Function('__injected',
    `const { ${names.join(', ')} } = __injected;\n${source}\nreturn uploadUsageDatePackageParts;`);
  return factory(injected);
}

function makePackage(count) {
  const segmentIds = Array.from({ length: count }, (_, index) => `seg-${String(index).padStart(5, '0')}`);
  return {
    date: '2026-08-06',
    segmentIds,
    pendingSegmentIds: segmentIds,
    hourKeys: [],
    hourlyPayloads: [],
    hourlyTargetPayloads: [],
    errors: [],
    summary: {
      usageSegments: { count, seconds: count },
      dailyStats: { count: 0, seconds: 0 },
      targetStats: { count: 0, seconds: 0 },
      hourlyStats: { count: 0, seconds: 0 },
      hourlyTargetStats: { count: 0, seconds: 0 },
    },
  };
}

function check(label, condition, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
}

async function runScenario(failRequestNumber = 0) {
  const requests = [];
  const uploaded = [];
  const failed = [];
  const upload = loadUploadFunction({
    MAX_USAGE_SEGMENTS_PER_BATCH: 200,
    buildUsageSegmentsUploadPayload: async (ids) => ({ segments: ids.map((id) => ({ id })) }),
    cloudRequest: async (_method, _path, body) => {
      requests.push(body.segments.map((segment) => segment.id));
      if (failRequestNumber && requests.length === failRequestNumber) {
        throw new Error('<html><body>503 Service Unavailable</body></html>'.repeat(500));
      }
    },
    markUsageSegmentsUploaded: async (ids) => uploaded.push([...ids]),
    markUsageSegmentUploadFailed: async (ids, error) => failed.push({ ids: [...ids], error }),
    normalizeUploadErrorCode: (error) => /503|service unavailable/i.test(String(error?.message || error)) ? 'http_503' : 'unknown_error',
    markDailyStatsUploaded: async () => {},
    markDailyStatsUploadFailed: async () => {},
    markHourlyStatsUploaded: async () => {},
    markHourlyStatsUploadFailed: async () => {},
    markTargetStatsUploaded: async () => {},
    markTargetStatsUploadFailed: async () => {},
    markHourlyTargetStatsUploaded: async () => {},
    markHourlyTargetStatsUploadFailed: async () => {},
    buildHourlyStatsUploadPayload: async () => null,
    buildHourlyTargetStatsUploadPayload: async () => null,
    cloudRequestUnused: async () => {},
    markUsageDateMaterializationError: async () => {},
    addUploadError: () => {},
    logClientEventBestEffort: () => {},
    logCloudFailureIncidentBestEffort: () => {},
    CLOUD_CONFIG: { KEYS: { V1_LAST_SEGMENT_UPLOAD_AT: 'last_segment_upload' } },
    cloudStorageSet: async () => {},
    chrome: { storage: { local: { set: async () => {} } } },
  });
  const result = await upload(makePackage(1029), { enabled: true });
  return { requests, uploaded, failed, result };
}

(async () => {
  const success = await runScenario();
  check('1029 segments use six requests', success.requests.length === 6, JSON.stringify(success.requests.map((batch) => batch.length)));
  check('every request is at most 200', success.requests.every((batch) => batch.length <= 200));
  check('batch sizes are stable', JSON.stringify(success.requests.map((batch) => batch.length)) === JSON.stringify([200, 200, 200, 200, 200, 29]));
  check('each successful batch is marked immediately', success.uploaded.length === 6 && success.uploaded.flat().length === 1029);
  check('success reports all uploaded', success.result.uploaded === 1029 && success.result.failed === 0, JSON.stringify(success.result));

  const partial = await runScenario(2);
  check('first failed batch stops later requests', partial.requests.length === 2, String(partial.requests.length));
  check('only first successful batch is cleared', partial.uploaded.length === 1 && partial.uploaded[0].length === 200);
  check('only failed batch receives failure metadata', partial.failed.length === 1 && partial.failed[0].ids.length === 200);
  check('failure metadata uses short code', partial.failed[0].error === 'http_503', partial.failed[0].error);
  check('remaining count includes failed and unsent segments', partial.result.segments.pendingCount === 829, JSON.stringify(partial.result.segments));

  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'cloud-sync.js'), 'utf8');
  check('usage sync persists cross-run backoff', source.includes("USAGE_UPLOAD_BACKOFF: 'cloud_usage_upload_backoff_v1'") && source.includes('USAGE_UPLOAD_BACKOFF_STEPS_MS'));
  check('history repair uses shared batched path', source.includes('fullSegmentRepair: true') && source.includes('MAX_USAGE_SEGMENTS_PER_BATCH'));
  console.log('[Cloud Usage Batching] 12/12 passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

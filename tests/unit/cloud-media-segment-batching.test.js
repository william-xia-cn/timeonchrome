// Run with: node tests/unit/cloud-media-segment-batching.test.js

'use strict';

const fs = require('fs');
const path = require('path');

const cloudSyncPath = path.join(__dirname, '..', '..', 'extension', 'infra', 'cloud-sync.js');
const source = fs.readFileSync(cloudSyncPath, 'utf8');

function extractFunctionSource(code, name) {
  const markers = [`export async function ${name}(`, `async function ${name}(`, `function ${name}(`];
  const start = markers.map((marker) => code.indexOf(marker)).find((index) => index >= 0);
  if (start === undefined) throw new Error(`${name} not found`);
  const braceStart = code.indexOf('{', code.indexOf(')', start));
  let depth = 0;
  for (let index = braceStart; index < code.length; index++) {
    if (code[index] === '{') depth++;
    if (code[index] === '}') {
      depth--;
      if (depth === 0) return code.slice(start, index + 1).replace('export ', '');
    }
  }
  throw new Error(`${name} parse failed`);
}

function loadUpload(injected) {
  const functions = [
    'createSegmentBatchId',
    'parseSegmentUploadAck',
    'applySegmentUploadAck',
    'uploadMediaSegmentsV1',
  ].map((name) => extractFunctionSource(source, name)).join('\n');
  const names = Object.keys(injected);
  return new Function('__injected',
    `const { ${names.join(', ')} } = __injected;\n${functions}\nreturn uploadMediaSegmentsV1;`)(injected);
}

function check(label, condition, details = '') {
  if (!condition) throw new Error(`${label}${details ? `: ${details}` : ''}`);
}

async function runScenario({ count = 250, failRequest = 0 } = {}) {
  const segments = Array.from({ length: count }, (_, index) => ({ id: `media-${index}` }));
  const requests = [];
  const uploaded = [];
  const failed = [];
  const backoff = [];
  const upload = loadUpload({
    syncState: { deviceToken: 'token', monitoringEnabled: 1 },
    statsFoundationV1SyncEnabled: true,
    MAX_MEDIA_SEGMENTS_PER_BATCH: 100,
    MAX_MEDIA_SEGMENT_BATCHES_PER_SYNC: 4,
    CLOUD_CONFIG: { KEYS: { V1_LAST_MEDIA_SEGMENT_UPLOAD_AT: 'last_media_upload' } },
    getPendingMediaSegments: async () => ({ pendingCount: segments.length, segments }),
    getMediaUploadBackoff: async () => ({ attempt: 0, nextRetryAt: 0, lastError: null }),
    clearMediaUploadBackoff: async () => {},
    recordMediaUploadBackoff: async (error) => backoff.push(error),
    buildMediaSegmentsUploadPayload: async (ids) => ({ schemaVersion: 1, segments: ids.map((id) => ({ id })) }),
    cloudRequest: async (_method, _path, body, retries) => {
      requests.push({ ids: body.segments.map((item) => item.id), retries, batchId: body.batchId });
      if (failRequest && requests.length === failRequest) throw new Error('request timeout');
      return { success: true, count: body.segments.length, acceptedIds: body.segments.map((item) => item.id), rejected: [] };
    },
    markMediaSegmentsUploaded: async (ids) => uploaded.push([...ids]),
    markMediaSegmentUploadFailed: async (ids, error) => failed.push({ ids: [...ids], error }),
    normalizeUploadErrorCode: (error) => /timeout/i.test(String(error?.message || error)) ? 'request_timeout' : String(error || 'unknown_error').toLowerCase(),
    cloudStorageSet: async () => {},
    logCloudFailureIncidentBestEffort: () => {},
  });
  const result = await upload({ enabled: true });
  return { requests, uploaded, failed, backoff, result };
}

(async () => {
  const success = await runScenario();
  check('media backlog drains in bounded batches', JSON.stringify(success.requests.map((item) => item.ids.length)) === JSON.stringify([100, 100, 50]), JSON.stringify(success.requests));
  check('segment POST uses one request attempt', success.requests.every((item) => item.retries === 1));
  check('successful media batches ACK immediately', success.uploaded.flat().length === 250 && success.result.pendingCount === 0, JSON.stringify(success.result));
  check('batch id is present', success.requests.every((item) => typeof item.batchId === 'string' && item.batchId.startsWith('media:')));

  const partial = await runScenario({ failRequest: 2 });
  check('first media failure stops later batches', partial.requests.length === 2, String(partial.requests.length));
  check('only confirmed media ids are cleared', partial.uploaded.length === 1 && partial.uploaded[0].length === 100, JSON.stringify(partial.uploaded));
  check('failed media batch keeps short error metadata', partial.failed.length === 1 && partial.failed[0].error === 'request_timeout', JSON.stringify(partial.failed));
  check('media failure enters cross-sync backoff', partial.backoff[0] === 'request_timeout', JSON.stringify(partial.backoff));
  check('media retry error is function-local in strict ESM execution', extractFunctionSource(source, 'uploadMediaSegmentsV1').includes('let retryError = null'));
  check('media materialization waits for segment confirmation', source.includes('mediaSegmentsConfirmed') && source.includes("reason: 'media_segments_pending'"));

  console.log('[Cloud Media Segment Batching] 10/10 passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

// Run with: node tests/unit/cloud-client-log-ack.test.js

'use strict';

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'cloud-sync.js'), 'utf8');

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

function check(label, condition, details = '') {
  if (!condition) throw new Error(`${label}${details ? `: ${details}` : ''}`);
}

(async () => {
  const functions = [
    'parseSegmentUploadAck',
    'applySegmentUploadAck',
    'uploadClientLogsV1',
  ].map((name) => extractFunctionSource(source, name)).join('\n');
  const uploaded = [];
  const failed = [];
  const requests = [];
  const logs = Array.from({ length: 3 }, (_, index) => ({ id: `log-${index}`, eventCode: 'test' }));
  const injected = {
    syncState: { deviceToken: 'token' },
    getPendingClientLogsForUpload: async ({ limit }) => ({ logs, pendingCount: logs.length, limit }),
    sanitizeClientLogForUpload: (log) => log,
    cloudRequest: async (_method, _path, payload, retries) => {
      requests.push({ payload, retries });
      return {
        success: true,
        acceptedIds: ['log-0', 'log-1'],
        rejected: [{ id: 'log-2', code: 'INVALID_LOG' }],
      };
    },
    markClientLogsUploaded: async (ids) => uploaded.push(...ids),
    markClientLogUploadFailed: async (ids, error) => failed.push({ ids: [...ids], error }),
    normalizeUploadErrorCode: (value) => String(value || 'unknown_error').toLowerCase(),
    cloudStorageSet: async () => {},
    CLOUD_CONFIG: { KEYS: { V1_LAST_CLIENT_LOG_UPLOAD_AT: 'last_client_log_upload' } },
    logCloudFailureIncidentBestEffort: () => {},
  };
  const names = Object.keys(injected);
  const upload = new Function('__injected',
    `const { ${names.join(', ')} } = __injected;\n${functions}\nreturn uploadClientLogsV1;`)(injected);
  const result = await upload({ enabled: true });

  check('client logs request is limited to one attempt', requests.length === 1 && requests[0].retries === 1, JSON.stringify(requests));
  check('only accepted client logs are deleted locally', JSON.stringify(uploaded) === JSON.stringify(['log-0', 'log-1']), JSON.stringify(uploaded));
  check('rejected client log remains with short failure metadata', failed.length === 1 && failed[0].ids[0] === 'log-2' && failed[0].error === 'invalid_log', JSON.stringify(failed));
  check('client log result reports partial ACK accurately', result.uploaded === 2 && result.failed === 1 && result.pendingCount === 1, JSON.stringify(result));
  check('client log fetch limit is 100', source.includes('getPendingClientLogsForUpload({ limit: 100 })'));

  console.log('[Cloud Client Log ACK] 5/5 passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

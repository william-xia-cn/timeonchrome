// Run with: node tests/unit/device-account-v2-sync.test.js

'use strict';

const fs = require('fs');
const path = require('path');

function extractFunctionSource(code, name) {
  const start = code.indexOf(`async function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  const signatureEnd = code.indexOf(') {', start);
  const braceStart = signatureEnd + 2;
  let depth = 0;
  for (let index = braceStart; index < code.length; index++) {
    if (code[index] === '{') depth++;
    if (code[index] === '}' && --depth === 0) return code.slice(start, index + 1);
  }
  throw new Error(`${name} parse failed`);
}

function loadUpload(injected) {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'cloud-sync.js'), 'utf8');
  const fn = extractFunctionSource(source, 'uploadDeviceAccountV2Shadow');
  const names = Object.keys(injected);
  return new Function('__injected', `const { ${names.join(', ')} } = __injected;\n${fn}\nreturn uploadDeviceAccountV2Shadow;`)(injected);
}

function prepared({ skipped = false } = {}) {
  return {
    skipped,
    manifest: {
      schemaVersion: 2,
      date: '2026-09-12',
      revision: 3,
      manifestHash: 'a'.repeat(64),
      complete: true,
    },
    chunks: [
      { chunkIndex: 0, rowCount: 2, chunkHash: 'b'.repeat(64), rows: [{ row: 1 }, { row: 2 }] },
      { chunkIndex: 1, rowCount: 1, chunkHash: 'c'.repeat(64), rows: [{ row: 3 }] },
    ],
  };
}

let passed = 0;
function check(label, condition, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
  passed++;
}

(async () => {
  const requests = [];
  const state = [];
  const upload = loadUpload({
    prepareDeviceAccountV2Upload: async () => prepared(),
    cloudRequest: async (method, route, body) => {
      requests.push({ method, route, body });
      if (route === '/device/accounts/v2/manifests') return { manifestId: 'manifest-3', revision: 3, status: 'staging' };
      if (route.endsWith('/commit')) return { revision: 3, status: 'committed', committedAt: 12345 };
      return { success: true };
    },
    markDeviceAccountV2Manifest: async (...args) => state.push(['manifest', ...args]),
    markDeviceAccountV2Committed: async (...args) => state.push(['committed', ...args]),
    markDeviceAccountV2Published: async (...args) => state.push(['published', ...args]),
    markDeviceAccountV2Reconciliation: async (...args) => state.push(['reconciliation', ...args]),
    markDeviceAccountV2Failed: async (...args) => state.push(['failed', ...args]),
    normalizeUploadErrorCode: (error) => String(error?.message || error),
    logCloudFailureIncidentBestEffort: () => {},
  });
  const result = await upload({ date: '2026-09-12' }, { enabled: true });
  check('manifest, chunks, and commit are sequentially sent', requests.map((item) => `${item.method} ${item.route}`).join('|') === [
    'POST /device/accounts/v2/manifests',
    'PUT /device/accounts/v2/manifests/manifest-3/chunks/0',
    'PUT /device/accounts/v2/manifests/manifest-3/chunks/1',
    'POST /device/accounts/v2/manifests/manifest-3/commit',
  ].join('|'), JSON.stringify(requests));
  check('matching commit marks compact state committed', result.uploaded === 1 && state.at(-1)?.[0] === 'committed');

  const failedState = [];
  const failedUpload = loadUpload({
    prepareDeviceAccountV2Upload: async () => prepared(),
    cloudRequest: async (method, route) => {
      if (route === '/device/accounts/v2/manifests') return { manifestId: 'manifest-3', revision: 3 };
      if (route.endsWith('/commit')) throw new Error('http_503');
      return { success: true };
    },
    markDeviceAccountV2Manifest: async () => {},
    markDeviceAccountV2Committed: async () => {},
    markDeviceAccountV2Published: async () => {},
    markDeviceAccountV2Reconciliation: async () => {},
    markDeviceAccountV2Failed: async (...args) => failedState.push(args),
    normalizeUploadErrorCode: (error) => String(error?.message || error),
    logCloudFailureIncidentBestEffort: () => {},
  });
  const failed = await failedUpload({ date: '2026-09-12' }, { enabled: true });
  check('shadow failure is returned without throwing into V1', failed.failed === 1 && failed.error === 'http_503');
  check('shadow failure preserves pending state', failedState.length === 1 && failedState[0].at(-1) === 'http_503');

  const skippedRequests = [];
  const skippedUpload = loadUpload({
    prepareDeviceAccountV2Upload: async () => prepared({ skipped: true }),
    cloudRequest: async (...args) => skippedRequests.push(args),
    markDeviceAccountV2Manifest: async () => {},
    markDeviceAccountV2Committed: async () => {},
    markDeviceAccountV2Published: async () => {},
    markDeviceAccountV2Reconciliation: async () => {},
    markDeviceAccountV2Failed: async () => {},
    normalizeUploadErrorCode: () => 'unknown_error',
    logCloudFailureIncidentBestEffort: () => {},
  });
  const skipped = await skippedUpload({ date: '2026-09-12' }, { enabled: true });
  check('published identical snapshot does not upload again', skipped.skipped === true && skippedRequests.length === 0);

  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'cloud-sync.js'), 'utf8');
  check('date package records shadow result separately', source.includes('result.deviceAccountV2 = await uploadDeviceAccountV2Shadow'));
  check('pending shadow retries are independently scanned', source.includes('getPendingDeviceAccountV2Dates()') && source.includes('deviceAccountV2Pending'));
  check('shadow failure is not merged into V1 errors', !source.includes('result.errors.push(...result.deviceAccountV2'));

  console.log(`[Device Account V2 Sync] ${passed}/${passed} passed`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

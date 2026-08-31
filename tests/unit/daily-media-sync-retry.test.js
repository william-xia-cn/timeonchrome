// Run with: node tests/unit/daily-media-sync-retry.test.js

'use strict';

const fs = require('fs');
const path = require('path');

function extractFunctionSource(code, name) {
  const marker = `export async function ${name}(`;
  const start = code.indexOf(marker);
  if (start < 0) throw new Error(`${name} not found`);
  const braceStart = code.indexOf('{', code.indexOf(') ', start));
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

function loadUploadDailyMediaStatsV1(injected) {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'cloud-sync.js'), 'utf8');
  const source = extractFunctionSource(code, 'uploadDailyMediaStatsV1');
  const names = Object.keys(injected);
  const factory = new Function('__injected',
    `const { ${names.join(', ')} } = __injected;\n${source}\nreturn uploadDailyMediaStatsV1;`);
  return factory(injected);
}

function check(label, condition, details = '') {
  if (!condition) throw new Error(`${label}${details ? `: ${details}` : ''}`);
}

function makeHarness({ retryCount = 3, lastAttemptAt = Date.now(), requestError = null } = {}) {
  const date = '2026-08-14';
  const requests = [];
  const uploaded = [];
  const failed = [];
  const logs = [];
  const pending = {
    pendingCount: 1,
    stats: { [date]: { date, domains: { 'video.example.com': { totalSeconds: 60 } } } },
    retryCounts: { [date]: retryCount },
    lastErrors: { [date]: 'http_503' },
    lastAttemptAt: lastAttemptAt ? { [date]: lastAttemptAt } : {},
  };
  const upload = loadUploadDailyMediaStatsV1({
    syncState: { deviceToken: 'device-token', monitoringEnabled: 1 },
    statsFoundationV1SyncEnabled: true,
    CLOUD_CONFIG: { MAX_RETRY_ATTEMPTS: 3, KEYS: { V1_LAST_MEDIA_STATS_UPLOAD_AT: 'last_media_stats_upload' } },
    reconcileDailyMediaStatsOutbox: async () => ({ removed: 0 }),
    getPendingDailyMediaStats: async () => pending,
    isSyncRetryCandidate: ({ retryCount: count, lastAttemptAt: at, force, now, maxAttempts }) => {
      if (force || Number(count || 0) < maxAttempts) return true;
      if (!Number(at || 0)) return true;
      return now - Number(at) >= 6 * 60 * 60 * 1000;
    },
    buildDailyMediaStatsUploadPayload: async () => ({
      schemaVersion: 1,
      date,
      domains: [{ domain: 'video.example.com', byMode: { rest: { foregroundVideoSeconds: 60 } } }],
    }),
    cloudRequest: async (_method, _path, payload) => {
      requests.push(payload);
      if (requestError) throw new Error(requestError);
    },
    markDailyMediaStatsUploaded: async (dates) => uploaded.push(...dates),
    markDailyMediaStatsUploadFailed: async (dates, error) => failed.push({ dates, error }),
    cloudStorageSet: async () => {},
    logClientEventBestEffort: (entry) => logs.push(entry),
    logCloudFailureIncidentBestEffort: (entry) => logs.push(entry),
  });
  return { date, upload, requests, uploaded, failed, logs };
}

(async () => {
  const recent = makeHarness({ lastAttemptAt: Date.now() - 60_000 });
  const deferred = await recent.upload({ enabled: true });
  check('recent exhausted daily media stat is deferred', deferred.skipped === true && deferred.failed === 0, JSON.stringify(deferred));
  check('deferred daily media stat remains pending', deferred.pendingCount === 1 && deferred.deferredExhaustedCount === 1, JSON.stringify(deferred));
  check('deferred daily media stat does not request or log', recent.requests.length === 0 && recent.logs.length === 0);

  const legacy = makeHarness({ lastAttemptAt: 0 });
  const recovered = await legacy.upload({ enabled: true });
  check('legacy exhausted daily media stat gets automatic recovery try', legacy.requests.length === 1 && recovered.uploaded === 1, JSON.stringify(recovered));
  check('successful recovery clears daily media outbox item', legacy.uploaded.includes(legacy.date));

  const cooled = makeHarness({ lastAttemptAt: Date.now() - 7 * 60 * 60 * 1000, requestError: 'HTTP 503' });
  const failed = await cooled.upload({ enabled: true });
  check('cooled daily media stat retries once', cooled.requests.length === 1 && failed.failed === 1, JSON.stringify(failed));
  check('failed recovery records one failure and one bounded log', cooled.failed.length === 1 && cooled.logs.length === 1, JSON.stringify({ failed: cooled.failed, logs: cooled.logs }));

  console.log('[Daily Media Sync Retry] 8/8 passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

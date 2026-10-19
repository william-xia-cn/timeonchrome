'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const source = fs.readFileSync(path.join(__dirname, '../../extension/infra/cloud-sync.js'), 'utf8').replaceAll('\r\n', '\n');
function extract(name) {
  const implementation = { uploadDeviceAccountV2Shadow: 'uploadDeviceAccountV2ForBinding',
    syncUsageStatsByDateWatermarkV1: 'syncUsageStatsForBinding', syncStatsFoundationV1: 'syncStatsFoundationForBinding' }[name];
  if (implementation) return extract(implementation).replace('function ' + implementation + '(', 'function ' + name + '(');
  const match = source.match(new RegExp('(?:export )?(?:async )?function ' + name + '\\('));
  assert(match, name);
  return source.slice(match.index, source.indexOf('\n}', match.index) + 2).replace(/^export /, '');
}
function load(name, deps, helpers = []) {
  return new Function('d', 'const {' + Object.keys(deps).join(',') + '}=d;\n'
    + [...helpers, name].map(extract).join('\n') + '\nreturn ' + name + ';')(deps);
}
function requestFixture(options = {}) {
  const state = { attempts: 0, successes: 0, failures: 0, activeTimers: new Set() };
  const deps = {
    syncState: { deviceToken: 'isolated-token' }, CLOUD_CONFIG: { REQUEST_TIMEOUT_MS: 150 },
    markCloudConnectionAttempt: async () => { state.attempts++; },
    markCloudConnectionSuccess: async () => { state.successes++; },
    markCloudConnectionFailure: async () => { state.failures++; },
    createCloudRequestId: () => 'isolated-request', getCloudClientVersion: () => null,
    getCloudApiBase: () => options.base || 'http://127.0.0.1',
    isDeviceUnboundPayload: () => false, clearCloudBindingState: async () => {},
    makeDeviceUnboundError: () => Error('DEVICE_UNBOUND'),
    AbortController, DOMException,
    console: { error: () => {} },
    setTimeout: (callback, ms) => {
      const id = setTimeout(() => { state.activeTimers.delete(id); callback(); }, ms);
      state.activeTimers.add(id); return id;
    },
    clearTimeout: id => { state.activeTimers.delete(id); clearTimeout(id); },
    fetch: options.fetch || fetch,
  };
  return { request: load('cloudRequest', deps), state };
}

async function timerAndLateBodyCases() {
  const headersStall = requestFixture({ fetch: () => new Promise(() => {}) });
  await assert.rejects(headersStall.request('POST', '/headers', {}, 1), /timeout/);
  assert.equal(headersStall.state.activeTimers.size, 0);
  let finishBody;
  const f = requestFixture({ fetch: async () => ({ ok: true, status: 200,
    headers: { get: () => 'application/json' }, json: () => new Promise(resolve => { finishBody = resolve; }) }) });
  await assert.rejects(f.request('POST', '/late', {}, 1), /timeout/);
  assert.equal(f.state.activeTimers.size, 0);
  assert.equal(f.state.successes, 0);
  finishBody({ success: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.state.successes, 0, 'late body cannot resume the timed-out request');

  const controller = new AbortController();
  const cancelled = requestFixture({ fetch: async () => ({ ok: true, headers: { get: () => 'application/json' },
    json: () => { controller.abort(); return new Promise(() => {}); } }) });
  await assert.rejects(cancelled.request('POST', '/cancel', {}, 3, controller.signal), /cancelled/);
  assert.equal(cancelled.state.failures, 0, 'optional cancellation is not a cloud failure');
  assert.equal(cancelled.state.activeTimers.size, 0);
  let calls = 0;
  const retries = requestFixture({ fetch: async () => {
    calls++; return { ok: true, headers: { get: () => 'application/json' }, json: () => new Promise(() => {}) };
  } });
  await assert.rejects(retries.request('POST', '/retry', {}, 2), /timeout/);
  assert.equal(calls, 2, 'configured retry count is retained');
  assert.equal(retries.state.activeTimers.size, 0);
  console.log('A: stalled/late JSON, explicit cancellation, bounded retry and timer cleanup PASS');
}

async function realHttpCases() {
  const accepted = new Map(); let commitCalls = 0;
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/ok') return res.end('{"success":true}');
    if (req.url === '/bad') { res.statusCode = 400; return res.end('{"error":"invalid","code":"INVALID"}'); }
    if (req.url === '/stall-ok' || req.url === '/stall-error') {
      res.writeHead(req.url === '/stall-ok' ? 200 : 503); res.flushHeaders(); res.write('{'); return;
    }
    if (req.url === '/device/accounts/v2/manifests') {
      const manifest = JSON.parse(body); accepted.set(manifest.manifestHash, manifest);
      return res.end(JSON.stringify({ manifestId: 'isolated-manifest', revision: manifest.revision }));
    }
    if (req.url.endsWith('/commit')) {
      commitCalls++;
      const receipt = { status: 'committed', revision: 3, committedAt: 100, publishedRevision: 3, publishedAt: 110 };
      if (commitCalls === 1) { res.writeHead(200); res.flushHeaders(); res.write('{'); return; }
      return res.end(JSON.stringify(receipt));
    }
    res.end('{"success":true}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const f = requestFixture({ base: `http://127.0.0.1:${server.address().port}` });
    assert.equal((await f.request('GET', '/ok', null, 1)).success, true);
    await assert.rejects(f.request('GET', '/bad', null, 3), error => error.status === 400 && error.nonRetryable === true);
    for (const route of ['/stall-ok', '/stall-error']) await assert.rejects(f.request('GET', route, null, 1), /timeout/);
    assert.equal(f.state.activeTimers.size, 0);
    const state = { published: false, failed: 0, committed: 0, pending: true };
    const manifest = { schemaVersion: 2, date: '2026-10-17', revision: 3, manifestHash: 'a'.repeat(64), complete: true };
    const upload = load('uploadDeviceAccountV2Shadow', {
      prepareDeviceAccountV2Upload: async () => ({ skipped: false, manifest, chunks: [] }),
      cloudRequest: f.request,
      markDeviceAccountV2Manifest: async () => {},
      markDeviceAccountV2Committed: async () => { state.committed++; },
      markDeviceAccountV2Published: async () => { state.published = true; state.pending = false; },
      markDeviceAccountV2Reconciliation: async () => {},
      markDeviceAccountV2Failed: async () => { state.failed++; },
      normalizeUploadErrorCode: error => /timeout/.test(error.message) ? 'request_timeout' : error.message,
      logCloudFailureIncidentBestEffort: () => {},
    });
    const first = await upload({ date: manifest.date }, { enabled: true });
    assert.equal(first.failed, 1);
    assert.equal(state.pending, true);
    assert.equal(state.published, false);
    assert.equal(state.committed, 0, 'no commit/publish confirmation without a complete receipt');
    const second = await upload({ date: manifest.date }, { enabled: true });
    assert.equal(second.published, true);
    assert.equal(state.pending, false);
    assert.equal(accepted.size, 1, 'loopback server deduplicates the unchanged manifest/hash');
    assert.equal(commitCalls, 2);
    console.log('A isolated loopback HTTP: real fetch/body timeout; accepted-with-lost-receipt retains pending; same revision retry publishes PASS');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

function syncFixture(parts = {}) {
  const state = { cleared: 0, backedOff: [] };
  const empty = () => ({ uploaded: 0, failed: 0, skipped: true, results: [] });
  const deps = {
    getUsageUploadBackoff: async () => ({}),
    uploadUsageSegmentsV1: async () => ({ uploaded: 0, failed: 0, pendingCount: 0, errors: [], dryRun: false }),
    uploadTodayUsageStatsSnapshotV1: async () => load('makeUsageDateSyncResult', {}, ['makeUploadPartResult'])(),
    uploadHistoricalUsageStatsByWatermarkV1: async () => load('makeUsageDateSyncResult', {}, ['makeUploadPartResult'])(),
    retryPendingDeviceAccountsV2Shadow: async () => empty(),
    uploadCurrentWeekDeviceAccountsV2: async () => empty(),
    retryPendingDeviceAccountReconciliationsV2Shadow: async () => ({ matched: 0, pending: 0, skipped: true }),
    syncProfileAccountV2ShadowSnapshot: async () => ({ skipped: true, error: null }),
    isRetryableUsageErrorCode: code => code === 'http_503',
    recordUsageUploadBackoff: async code => { state.backedOff.push(code); return { lastError: code }; },
    clearUsageUploadBackoff: async () => { state.cleared++; },
    normalizeUploadErrorCode: error => String(error?.message || error),
    ...parts,
  };
  return { state, sync: load('syncUsageStatsByDateWatermarkV1', deps,
    ['makeUploadPartResult', 'makeUsageDateSyncResult', 'mergeUsageDatePartResults', 'syncUsageUploadsByDateWatermarkV1']) };
}

async function stageCases() {
  const scenarios = [
    ['deviceAccountV2Pending', 'retryPendingDeviceAccountsV2Shadow', { failed: 1, results: [{ failed: 1, error: 'http_503' }] }],
    ['deviceAccountV2CurrentWeek', 'uploadCurrentWeekDeviceAccountsV2', { failed: 1, results: [{ failed: 1, error: 'request_timeout' }] }],
    ['deviceAccountV2Reconciliation', 'retryPendingDeviceAccountReconciliationsV2Shadow', { failed: 1, pending: 1, errors: ['http_503'] }],
    ['profileAccountV2Shadow', 'syncProfileAccountV2ShadowSnapshot', { fetched: true, stored: false, error: 'snapshot_hash_invalid' }],
  ];
  for (const [stage, task, part] of scenarios) {
    const f = syncFixture({ [task]: async () => part });
    const result = await f.sync({ enabled: true });
    assert.equal(result.failed, 1, stage);
    assert(result.errors.some(error => error.startsWith(stage + ':')), stage);
    assert.equal(result[stage], part);
    assert.equal(f.state.cleared, 1, 'V1 success keeps its existing backoff handling');
    assert.equal(f.state.backedOff.length, 0, 'V2 errors must not create V1 backoff');
  }
  const all = syncFixture(Object.fromEntries(scenarios.map(([, task, part]) => [task, async () => part])));
  assert.equal((await all.sync({ enabled: true })).failed, 4);
  const success = syncFixture();
  assert.deepEqual((await success.sync({ enabled: true })).errors, []);
  const thrown = syncFixture({ uploadCurrentWeekDeviceAccountsV2: async () => { throw Error('local_read_failed'); } });
  assert((await thrown.sync({ enabled: true })).errors.includes('deviceAccountV2CurrentWeek:local_read_failed'));
  const make = () => load('makeUsageDateSyncResult', {}, ['makeUploadPartResult'])();
  const v1 = syncFixture({ uploadTodayUsageStatsSnapshotV1: async () => ({ ...make(), failed: 1, errors: ['http_503'] }) });
  const v1Result = await v1.sync({ enabled: true });
  assert.equal(v1Result.failed, 1);
  assert.deepEqual(v1.state.backedOff, ['http_503']);
  assert.equal(v1.state.cleared, 0);
  const nested = syncFixture({ uploadTodayUsageStatsSnapshotV1: async () => ({ ...make(),
    deviceAccountV2: { failed: 1, error: 'http_503', published: false } }) });
  assert((await nested.sync({ enabled: true })).errors.includes('deviceAccountV2DateUploads:http_503'));
  const received = syncFixture({ uploadCurrentWeekDeviceAccountsV2: async () => ({ attempted: 1, failed: 0,
    results: [{ uploaded: 1, published: false, publishStatus: 'received_not_published' }] }) });
  const receipt = await received.sync({ enabled: true });
  assert.equal(receipt.failed, 0);
  assert.equal(receipt.deviceAccountV2CurrentWeek.results[0].publishStatus, 'received_not_published');
  const publicationFailure = syncFixture({ uploadCurrentWeekDeviceAccountsV2: async () => ({ attempted: 1, failed: 0,
    results: [{ uploaded: 1, published: false, publishError: 'build_failed' }] }) });
  assert((await publicationFailure.sync({ enabled: true })).errors.includes('deviceAccountV2CurrentWeek:publish:build_failed'));
  const writes = [], messages = [];
  const foundation = load('syncStatsFoundationV1', {
    syncUsageStatsByDateWatermarkV1: all.sync,
    uploadMediaSegmentsV1: async () => ({ failed: 0, errors: [], pendingCount: 0, dryRun: false }),
    uploadDailyMediaStatsV1: async () => ({ failed: 0, errors: [], dryRun: false }),
    uploadHourlyMediaStatsV1: async () => ({ failed: 0, errors: [], dryRun: false }),
    cloudStorageSet: async value => writes.push(value),
    CLOUD_CONFIG: { KEYS: { V1_LAST_SYNC_AT: 'lastSync', V1_LAST_SYNC_ERROR: 'lastError' } },
    console: { log: value => messages.push(value) },
  });
  const foundationResult = await foundation({ enabled: true });
  assert.equal(foundationResult.hadFailure, true);
  assert.equal(foundationResult.errors.length, 4);
  assert.equal(writes.length, 0, 'V2 failure cannot write an all-success marker');
  assert.equal(messages.length, 0, 'V2 failure cannot emit the all-success log');
  for (const networkFailure of [false, true]) {
    const marks = [];
    const reconcile = load('retryPendingDeviceAccountReconciliationsV2Shadow', {
      syncState: { deviceToken: 'isolated', monitoringEnabled: 1 },
      getPendingDeviceAccountV2Reconciliations: async () => [{ date: '2026-10-17', revision: 3, manifestHash: 'a'.repeat(64) }],
      cloudRequest: async () => { if (networkFailure) throw Error('http_503'); return { status: 'pending_raw' }; },
      markDeviceAccountV2Reconciliation: async (...args) => marks.push(args),
      normalizeUploadErrorCode: error => error.message,
    });
    const result = await reconcile({ enabled: true });
    assert.equal(result.pending, 1);
    assert.equal(result.failed, networkFailure ? 1 : 0, 'audit pending is not a transport error');
    assert.equal(marks.length, networkFailure ? 0 : 1);
  }
  console.log('B: per-stage failure, mixed V1/V2, all-success, throws, date attempts, received-not-published and V1 backoff isolation PASS');
}

(async () => {
  await timerAndLateBodyCases();
  await realHttpCases();
  await stageCases();
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const read = file => fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
const load = (file, names, deps = {}) => new Function(...Object.keys(deps), read(file)
  .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '') + `\nreturn {${names}}`)(...Object.values(deps));
const area = () => ({ data: {}, async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, structuredClone(this.data[k])])); }, async set(items) { Object.assign(this.data, structuredClone(items)); } });
global.chrome = { storage: { local: area(), session: area() }, runtime: { getManifest: () => ({ version: 'test' }) } };
const local = chrome.storage.local, session = chrome.storage.session;
const logs = load('extension/infra/client-logs.js', 'shouldUploadClientLog,logClientEvent,getClientLogs,getClientLogLossCounters,sanitizeClientLogForUpload');
const failure = load('extension/infra/cloud-failure-incident.js', 'safeUploadFailureEvidence,advanceCloudFailureIncident,resolveCloudFailureIncidents');
const audit = load('extension/core/quota-audit.js', 'summarizeAuditDays,validAuditDate');
(async () => {
  const now = Date.now();
  const policy = { policyVersion: 2, uploadEnabled: true, uploadMinLevel: 'warning', localMinLevel: 'warning', infoExpiresAt: now + 1000 };
  const info = { id: 'event', level: 'info', category: 'cloud', eventCode: 'generic_info' };
  assert(logs.shouldUploadClientLog(info, policy, now));
  assert(!logs.shouldUploadClientLog(info, policy, now + 1001));
  assert(logs.shouldUploadClientLog({ ...info, level: 'warning' }, policy, now + 1001));
  assert(logs.shouldUploadClientLog({ ...info, eventCode: 'sync_health_summary' }, { ...policy, uploadMinLevel: 'error', sampleRate: 0, uploadCategories: ['media'] }, now + 1001));
  assert(!logs.shouldUploadClientLog(info, { ...policy, uploadEnabled: false }, now));
  assert(!logs.shouldUploadClientLog({ ...info, eventCode: 'sync_health_summary' }, { ...policy, uploadEnabled: false }, now));
  assert(!logs.shouldUploadClientLog(info, { uploadEnabled: true, uploadMinLevel: 'info', expiresAt: now - 1 }, now));
  local.data.guardian_config = { clientLoggingPolicyV1: policy };
  await logs.logClientEvent({ ...info, eventCode: 'sync_health_summary', details: { queues: [{ kind: 'usage', pending: 694, dates: '2026-09-10' }] } });
  const stored = local.data.client_logs_v1[0];
  assert.equal(stored.level, 'info');
  assert.equal(stored.uploadStatus, 'pending');
  assert.equal(stored.details.queues[0].pending, 694);
  await logs.logClientEvent({ ...info, level: 'warning', details: { field: 'x'.repeat(600) } });
  const losses = await logs.getClientLogLossCounters();
  assert(losses.truncated > 0);
  assert.equal((await logs.getClientLogLossCounters()).truncated, losses.truncated);
  const originalSet = local.set;
  local.set = async () => { throw Error('quota'); };
  await logs.logClientEvent({ ...info, level: 'error' });
  local.set = originalSet;
  assert((await logs.getClientLogLossCounters()).writeFailed > 0);
  const evidence = failure.safeUploadFailureEvidence({ requestId: 'request-1', batchId: 'batch-1', endpoint: '/device/usage-segments/v1',
    body: { segments: [{ id: 'segment-1', date: '2026-09-10', domain: 'private.example' }] }, status: 400,
    response: { code: 'SEGMENT_BATCH_REJECTED', error: '<html>' + 'private'.repeat(10000), rejected: [{ id: 'segment-1', code: 'INVALID_SEGMENT', message: 'segment.endMs must be > startMs' }] } });
  assert.equal(evidence.rejected[0].reason, 'non_positive_range');
  assert.equal(evidence.rejected[0].fields, 'startMs,endMs');
  assert(!JSON.stringify(evidence).includes('private'));
  let transition = failure.advanceCloudFailureIncident(null, { scope: 'usage', error: { status: 400 }, evidence }, now);
  for (let i = 1; i < 100; i++) transition = failure.advanceCloudFailureIncident(transition.state, { scope: 'usage', error: { status: 400 }, evidence: { ...evidence, requestId: 'later-request' } }, now + i);
  assert(!transition.shouldLog);
  assert.equal(transition.record.firstEvidence.requestId, 'request-1');
  assert(JSON.stringify(transition.state).length < 4096);
  assert.equal(failure.resolveCloudFailureIncidents(transition.state).summary.fingerprints.length, 1);
  const cloudSource = read('extension/infra/cloud-sync.js');
  const cloudAst = ts.createSourceFile('cloud-sync.js', cloudSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const requestSource = cloudAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'cloudRequest').getText(cloudAst);
  let responsePayload = { success: true, acceptedIds: [] }, responseStatus = 200, requestCount = 0;
  const requestDeps = {
    syncState: { deviceToken: 'test-only', currentRequestId: 'request-test' },
    CLOUD_CONFIG: { REQUEST_TIMEOUT_MS: 1000 }, createCloudRequestId: () => 'batch-test',
    markCloudConnectionAttempt: async () => {}, markCloudConnectionSuccess: async () => {}, markCloudConnectionFailure: async () => {},
    getCloudClientVersion: () => 'test', getCloudApiBase: () => 'https://invalid.example', isDeviceUnboundPayload: () => false,
    parseSegmentUploadAck: () => ({ rejected: [], missingIds: ['segment-1'] }),
    safeUploadFailureEvidence: () => { throw Error('diagnostic unavailable'); },
    logCloudFailureIncidentBestEffort: () => { throw Error('must not reach'); },
    console: { error() {} },
    fetch: async () => { requestCount++; return { ok: responseStatus === 200, status: responseStatus,
      headers: { get: () => 'application/json' }, json: async () => responsePayload, text: async () => JSON.stringify(responsePayload) }; },
  };
  const request = new Function(...Object.keys(requestDeps), requestSource + '\nreturn cloudRequest;')(...Object.values(requestDeps));
  assert.deepEqual(await request('POST', '/device/usage-segments/v1', { segments: [{ id: 'segment-1' }] }, 1), responsePayload);
  responseStatus = 400; responsePayload = { code: 'SEGMENT_BATCH_REJECTED', error: 'Invalid segment' };
  await assert.rejects(request('POST', '/device/usage-segments/v1', { segments: [{ id: 'segment-1' }] }, 1), error =>
    error.status === 400 && error.code === 'SEGMENT_BATCH_REJECTED' && error.requestId === 'request-test');
  assert.equal(requestCount, 2, 'diagnostic failures must not cause extra upload attempts');
  const emitted = [];
  const diagnostics = load('extension/infra/diagnostic-evidence.js', 'buildSyncHealth,recordSyncHealth,rememberQuotaEvaluation,recordQuotaDenial', {
    ...audit, getQuotaCalendarContext: () => ({ date: '2026-09-10', weekStart: '2026-09-07' }),
    getEffectiveQuotaForDate: () => ({ todayEffectiveQuota: { restMinutes: 240, weeklyRestMinutes: 840, compositeMinutes: 120 } }),
    logClientEvent: async event => { emitted.push(event); return { ok: true, logId: 'test' }; },
    getClientLogLossCounters: logs.getClientLogLossCounters, noteClientLogLoss: () => {},
    budgetedSessionSet: async items => { await session.set(items); return { ok: true }; },
  });
  assert.equal(diagnostics.buildSyncHealth(null).queues[0].pending, null);
  assert.equal(diagnostics.buildSyncHealth({ usage_segments_v1: { broken: null } }).queues[0].pending, null);
  assert.equal(audit.summarizeAuditDays({ '2026-09-10': { targets: { legacy: { activeSeconds: 100 } } } }, '2026-09-10', '2026-09-10')[0].rest, null);
  assert.equal(diagnostics.buildSyncHealth({ segment_sync_outbox_v1: { dirtySegmentIds: ['s'] }, usage_segments_v1: { s: { date: '2026-09-10' } } }).queues[0].oldestDate, '2026-09-10');
  local.data.daily_usage_stats_v1 = { '2026-09-10': { targets: { secret: { activeByQuotaBucket: { rest: 100 } } } } };
  diagnostics.rememberQuotaEvaluation({ usage: { restSeconds: 5006, weekRestSeconds: 50699, domains: ['private.example'] }, localState: { restLocked: true }, newState: { restLocked: true }, calendar: { date: '2026-09-10', weekStart: '2026-09-07' }, cloudFact: { usage: { weekRestSeconds: 31690 }, computedAt: now } });
  await diagnostics.recordQuotaDenial({ auditId: 'access-1', reason: 'weekly_rest_locked', config: { version: 1, quotaState: { restLocked: true } } });
  const denial = emitted.at(-1);
  assert.equal(denial.details.auditId, 'access-1');
  assert.equal(denial.details.localUsage.weekRestSeconds - denial.details.cloudUsage.weekRestSeconds, 19009);
  assert(!JSON.stringify(denial).includes('private.example'));
  assert.equal(logs.sanitizeClientLogForUpload({ ...denial, id: 'denial', timestamp: now }).details.days[3].rest, 100);
  assert.equal((await diagnostics.recordSyncHealth()).state, 'backlog');
  local.data.client_logs_v1 = []; session.data.client_logs_session_v1 = [];
  assert.equal((await diagnostics.recordSyncHealth()).state, 'confirmed');
  local.get = async () => { throw Error('read unavailable'); };
  assert.equal((await diagnostics.recordSyncHealth()).state, 'unknown');
  assert.equal(emitted.at(-1).details.queues[0].pending, null);
  console.log('PASS layered TTL, original level, loss counters, first rejection evidence, bounded incidents, quota decisions and unknown reads');
})().catch(e => { console.error(e); process.exitCode = 1; });

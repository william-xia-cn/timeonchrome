'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');

const filename = path.join(__dirname, '..', '..', 'workers', 'src', 'services', 'usageAccountingCorrections.ts');
const source = fs.readFileSync(filename, 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleRef = { exports: {} };
const domainModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../../extension/core/domain-semantics.js'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: domainModule, exports: domainModule.exports, URL });
vm.runInNewContext(js, { module: moduleRef, exports: moduleRef.exports,
  require: name => name.includes('domain-semantics') ? domainModule.exports : {}, console, crypto }, { filename });
const {
  compactUsageAccountingCorrectionDeltas,
  applyCorrectionsToCompactDeviceAccounts,
  applyCorrectionsToV1StatsRows,
  summarizeCompactDeviceAccounts,
  getBeijingWeekForTimestamp,
  isEligibleRestrictedReattributionSegment,
  applyRestrictedReattributionForRequest,
  listDeviceCorrectionEvidencePage,
} = moduleRef.exports;

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

const pendingAccounts = [{
  deviceId: 'device-1', date: '2026-09-18',
  total: {
    totalSeconds: 300,
    byChannelMode: [
      { channel: 'active', mode: 'composite', durationSeconds: 120 },
      { channel: 'active', mode: 'rest', durationSeconds: 180 },
    ],
    byQuotaBucket: [
      { quotaBucket: 'composite', durationSeconds: 120 },
      { quotaBucket: 'rest', durationSeconds: 180 },
    ],
  },
  quotaProjection: {
    activeSeconds: 300,
    byQuotaBucket: [
      { quotaBucket: 'composite', durationSeconds: 120 },
      { quotaBucket: 'rest', durationSeconds: 180 },
    ],
    byDomain: [{ domain: 'example.com', durationSeconds: 300 }],
  },
}];
const pendingCorrections = [
  {
    ...correction,
    id: 'pending-correction-1', segmentId: 'segment-a', date: '2026-09-18', domain: 'example.com',
    durationSeconds: 120, originalMode: 'composite', originalTargetClassification: 'pending_composite',
    originalQuotaBucket: 'composite', effectiveMode: 'rest', effectiveTargetClassification: 'restricted', effectiveQuotaBucket: 'rest',
  },
  {
    ...correction,
    id: 'pending-correction-2', segmentId: 'segment-b', date: '2026-09-18', domain: 'example.com',
    durationSeconds: 180, originalMode: 'rest', originalTargetClassification: 'pending_composite',
    originalQuotaBucket: 'rest', effectiveMode: 'rest', effectiveTargetClassification: 'restricted', effectiveQuotaBucket: 'rest',
  },
];
const pendingAdjusted = applyCorrectionsToCompactDeviceAccounts(pendingAccounts, pendingCorrections);
assert.strictEqual(pendingAdjusted[0].total.totalSeconds, 300, 'pending reattribution must conserve total seconds');
assert.deepStrictEqual(JSON.parse(JSON.stringify(pendingAdjusted[0].total.byChannelMode)), [
  { channel: 'active', mode: 'rest', durationSeconds: 300 },
]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(pendingAdjusted[0].quotaProjection.byQuotaBucket)), [
  { quotaBucket: 'rest', durationSeconds: 300 },
], 'already-rest segments must not be counted twice');
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

assert.deepStrictEqual(
  JSON.parse(JSON.stringify(getBeijingWeekForTimestamp(Date.parse('2026-09-18T03:00:00Z')))),
  { weekStart: '2026-09-14', weekEnd: '2026-09-20' },
);
const scope = { profileId: 'profile-1', targetType: 'host', targetValue: 'example.com',
  weekStart: '2026-09-14', weekEnd: '2026-09-20', startMs: Date.parse('2026-09-14T00:00:00+08:00'),
  decidedAt: Date.parse('2026-09-18T03:00:00Z') };
const pending = { profile_id: 'profile-1', domain: 'example.com', channel: 'active',
  target_rule_id: 'unrelated-request', date: '2026-09-18', start_ms: scope.decidedAt - 30000,
  end_ms: scope.decidedAt, target_classification_at_time: 'pending_composite', duration_seconds: 30 };
assert.strictEqual(isEligibleRestrictedReattributionSegment(pending, scope), true, 'request IDs do not decide eligibility');
assert.strictEqual(isEligibleRestrictedReattributionSegment({ ...pending, target_rule_id: null }, scope), true);
for (const domain of ['www.example.com', 'm.example.com', 'video.example.com']) {
  assert.strictEqual(isEligibleRestrictedReattributionSegment({ ...pending, domain }, scope), true, domain);
}
for (const change of [{ profile_id: 'another-child' }, { date: '2026-09-13' },
  { domain: 'notexample.com' }, { domain: 'example.com.evil.org' }, { channel: 'media' },
  { target_classification_at_time: 'study' }, { start_ms: scope.startMs - 1 },
  { end_ms: scope.decidedAt + 1 }, { duration_seconds: -1 }]) {
  assert.strictEqual(isEligibleRestrictedReattributionSegment({ ...pending, ...change }, scope), false, JSON.stringify(change));
}
assert.strictEqual(isEligibleRestrictedReattributionSegment(pending, { ...scope, targetType: 'url' }), false);

function statement(sql) {
  return {
    sql,
    args: [],
    bind(...args) { this.args = args; return this; },
    async first() { return fakeDb.first(this); },
    async all() { return fakeDb.all(this); },
  };
}

let corrected = false;
let correctionBatch = null;
const fakeDb = {
  prepare(sql) { return statement(sql); },
  async first(stmt) {
    if (stmt.sql.includes('FROM site_classification_requests_v1 r')) {
      return { id: 'request-1', profile_id: 'profile-1', target_type: 'host', target_value: 'example.com',
        decision: 'reject', decided_at: scope.decidedAt, account_id: 'account-1' };
    }
    throw new Error(`unexpected first SQL: ${stmt.sql}`);
  },
  async all(stmt) {
    if (stmt.sql.includes('SELECT DISTINCT s.device_id')) {
      return { results: corrected ? [] : [{ device_id: 'device-1', date: '2026-09-18', domain: 'example.com' }] };
    }
    if (stmt.sql.includes('COUNT(*) AS segment_count')) return { results: [] };
    if (stmt.sql.includes('SELECT s.id, s.profile_id')) {
      return { results: [
        { ...pending, id: 'segment-a', device_id: 'device-1', start_ms: scope.decidedAt - 300000, end_ms: scope.decidedAt - 180000, duration_seconds: 120, mode: 'composite', quota_bucket_at_time: 'composite' },
        { ...pending, id: 'segment-b', device_id: 'device-1', start_ms: scope.decidedAt - 180000, duration_seconds: 180, mode: 'rest', quota_bucket_at_time: 'rest', target_rule_id: 'another-id' },
      ] };
    }
    throw new Error(`unexpected all SQL: ${stmt.sql}`);
  },
  async batch(statements) {
    correctionBatch = statements;
    corrected = true;
    return statements.map(() => ({ success: true }));
  },
};

async function verifySqliteReattribution() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE profiles(id TEXT PRIMARY KEY,account_id TEXT);
    CREATE TABLE site_classification_requests_v1(id TEXT PRIMARY KEY,profile_id TEXT,decision TEXT,
      decided_at INTEGER,decision_target_type TEXT,requested_target_type TEXT,
      decision_normalized_value TEXT,requested_normalized_value TEXT);
    CREATE TABLE usage_segments_v1(id TEXT PRIMARY KEY,profile_id TEXT,device_id TEXT,date TEXT,
      domain TEXT,start_ms INTEGER,end_ms INTEGER,duration_seconds INTEGER,channel TEXT,mode TEXT,
      target_rule_id TEXT,target_classification_at_time TEXT,quota_bucket_at_time TEXT);
    CREATE TABLE profile_account_read_snapshots_v2(id TEXT PRIMARY KEY);
    INSERT INTO profiles VALUES('profile-1','account-1'),('another-child','account-2');`);
  db.exec(fs.readFileSync(path.join(__dirname, '../../workers/migrations/029_usage_accounting_corrections_v1.sql'), 'utf8'));
  let failNextBatch = false;
  const adapter = {
    prepare(sql) {
      return { sql, args: [], bind(...args) { this.args = args; return this; },
        async first() { return db.prepare(sql).get(...this.args) || null; },
        async all() { return { results: db.prepare(sql).all(...this.args) }; } };
    },
    async batch(queries) {
      db.exec('BEGIN');
      try {
        for (const [index, query] of queries.entries()) {
          db.prepare(query.sql).run(...query.args);
          if (failNextBatch && index === 1) { failNextBatch = false; throw Error('injected transaction failure'); }
        }
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
  const now = Date.parse('2026-10-28T22:44:01+08:00');
  db.prepare('INSERT INTO site_classification_requests_v1 VALUES(?,?,?,?,?,?,?,?)')
    .run('decision-1', 'profile-1', 'reject', now, 'host', 'host', 'playdaily.org', 'playdaily.org');
  const add = (id, seconds, changes = {}) => {
    const row = { id, profile_id: 'profile-1', device_id: 'device-1', date: '2026-10-28',
      domain: 'playdaily.org', start_ms: now - 10000000, end_ms: now - 10000000 + seconds * 1000,
      duration_seconds: seconds, channel: 'active', mode: 'composite', target_rule_id: 'email-threshold',
      target_classification_at_time: 'pending_composite', quota_bucket_at_time: 'composite', ...changes };
    db.prepare('INSERT INTO usage_segments_v1 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(row));
  };
  for (let i = 0; i < 26; i++) add('known-' + i, i === 25 ? 88 : 76);
  add('zero-1', 0, { mode: 'rest', quota_bucket_at_time: 'rest' });
  add('zero-2', 0, { mode: 'rest', quota_bucket_at_time: 'rest' });
  const run = (options) => applyRestrictedReattributionForRequest({ DB: adapter }, 'profile-1', 'decision-1', options);
  assert.strictEqual((await run()).durationSeconds, 1988);
  for (let i = 0; i < 16; i++) add('old-' + i, 138, { target_rule_id: i === 15 ? null : 'old-local-id',
    device_id: i % 2 ? 'device-2' : 'device-1' });
  const untouched = [
    ['another-child', { profile_id: 'another-child' }], ['another-site', { domain: 'other.org' }],
    ['fake-suffix', { domain: 'playdaily.org.evil.org' }], ['prefixed-host', { domain: 'notplaydaily.org' }],
    ['old-week', { date: '2026-10-25', start_ms: Date.parse('2026-10-25T12:00:00+08:00'), end_ms: Date.parse('2026-10-25T12:00:10+08:00') }],
    ['classified', { target_classification_at_time: 'study' }], ['media', { channel: 'backgroundMedia' }],
    ['after-decision', { start_ms: now + 1000, end_ms: now + 11000 }],
  ];
  for (const [id, changes] of untouched) add(id, 10, changes);
  const rawBefore = JSON.stringify(db.prepare('SELECT * FROM usage_segments_v1 ORDER BY id').all());
  failNextBatch = true;
  await assert.rejects(run(), /injected transaction failure/);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM usage_segment_corrections_v1').get().n, 28,
    'failed batch must preserve existing corrections and roll back the entire new batch');
  const repaired = await run();
  assert.strictEqual(repaired.segmentCount, 16);
  assert.strictEqual(repaired.durationSeconds, 2208);
  assert.strictEqual(repaired.complete, true);
  assert.strictEqual(db.prepare('SELECT SUM(duration_seconds) seconds FROM usage_segment_corrections_v1').get().seconds, 4196);
  for (const [id] of untouched) assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM usage_segment_corrections_v1 WHERE segment_id=?').get(id).n, 0, id);
  assert.strictEqual(JSON.stringify(db.prepare('SELECT * FROM usage_segments_v1 ORDER BY id').all()), rawBefore);
  assert.strictEqual((await run()).segmentCount, 0, 'retries do not add seconds');
  const allCorrections = db.prepare('SELECT * FROM usage_segment_corrections_v1').all().map(row => ({
    id: row.id, segmentId: row.segment_id, deviceId: row.device_id, date: row.date, domain: row.domain,
    startMs: row.start_ms, endMs: row.end_ms, durationSeconds: row.duration_seconds, channel: row.channel,
    originalMode: row.original_mode, originalQuotaBucket: row.original_quota_bucket,
    originalTargetClassification: row.original_target_classification, effectiveMode: row.effective_mode,
    effectiveQuotaBucket: row.effective_quota_bucket, effectiveTargetClassification: row.effective_target_classification,
  }));
  const sourceRows = [...new Set(allCorrections.filter(c => c.durationSeconds > 0).map(c => c.deviceId))].map(device => ({
    device_id: device, date: '2026-10-28', hour_key: '2026-10-28T19', target_key: 'fallback:domain:playdaily.org', domain: 'playdaily.org',
    fallback_domain: 'playdaily.org', mode: 'composite', quota_bucket: 'composite', channel: 'active',
    target_classification_at_time: 'pending_composite',
    duration_seconds: allCorrections.filter(c => c.deviceId === device).reduce((n, c) => n + c.durationSeconds, 0),
  }));
  for (const kind of ['daily_target', 'daily_domain', 'hourly_target', 'hourly_domain']) {
    const projected = applyCorrectionsToV1StatsRows(sourceRows, allCorrections, kind);
    assert.strictEqual(projected.reduce((n, r) => n + r.duration_seconds, 0), 4196);
    assert(projected.every(r => r.mode === 'rest'));
    if (kind.endsWith('target')) assert(projected.every(r => r.target_classification_at_time === 'restricted'));
  }
  const effectiveTargets = applyCorrectionsToV1StatsRows(sourceRows, allCorrections, 'daily_target');
  const breakdown = {};
  for (const row of effectiveTargets) {
    breakdown[row.target_classification_at_time] ||= {};
    breakdown[row.target_classification_at_time][row.quota_bucket] =
      (breakdown[row.target_classification_at_time][row.quota_bucket] || 0) + row.duration_seconds;
  }
  const page = fs.readFileSync(path.join(__dirname, '../../pages/index.html'), 'utf8');
  const pageStart = page.indexOf('function unknownUsageIdentifier(');
  const pageEnd = page.indexOf('function renderCloudUsageView(', pageStart);
  const ui = vm.createContext({});
  vm.runInContext(page.slice(pageStart, pageEnd), ui);
  const shown = ui.usageExplanationSummary({ label: 'playdaily.org', displayUsageBreakdown: { range: breakdown } }, false);
  assert.strictEqual(shown.text, '受限娱乐'); assert.strictEqual(shown.borrowedSeconds, 0);
  const deviceAccounts = sourceRows.map(row => ({ deviceId: row.device_id, date: row.date,
    total: { totalSeconds: row.duration_seconds,
      byChannelMode: [{ channel: 'active', mode: 'composite', durationSeconds: row.duration_seconds }],
      byQuotaBucket: [{ quotaBucket: 'composite', durationSeconds: row.duration_seconds }] },
    quotaProjection: { activeSeconds: row.duration_seconds,
      byQuotaBucket: [{ quotaBucket: 'composite', durationSeconds: row.duration_seconds }],
      byDomain: [{ domain: 'playdaily.org', durationSeconds: row.duration_seconds }] } }));
  const effectiveAccounts = applyCorrectionsToCompactDeviceAccounts(deviceAccounts, allCorrections);
  const total = summarizeCompactDeviceAccounts(effectiveAccounts);
  assert.strictEqual(total.totalSeconds, 4196);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(total.byQuotaBucket)), [{ quotaBucket: 'rest', durationSeconds: 4196 }]);
  add('late-borrowed', 17, { target_rule_id: 'yet-another-id', mode: 'rest', quota_bucket_at_time: 'rest' });
  assert.strictEqual((await run()).durationSeconds, 17, 'late already-Rest fact changes classification once');
  assert.strictEqual((await run()).durationSeconds, 0);
  for (let i = 0; i < 100; i++) add('batch-' + i, 1);
  const partial = await run({ maxBatches: 1 });
  assert.strictEqual(partial.segmentCount, 99); assert.strictEqual(partial.complete, false);
  assert.strictEqual((await run()).segmentCount, 1);
  add('boundary', 10, { start_ms: now - 5000, end_ms: now + 5000 });
  const boundary = await run();
  assert.strictEqual(boundary.complete, false);
  assert.strictEqual(boundary.reason, 'decision_boundary_requires_review');
  assert.strictEqual(boundary.reviewSegmentCount, 1);
  db.prepare("UPDATE site_classification_requests_v1 SET decision_target_type='url',decision_normalized_value='https://playdaily.org/specific'").run();
  const url = await run();
  assert.strictEqual(url.complete, false); assert.strictEqual(url.reason, 'unsupported_target_scope');
  const studyDecisionAt = Date.parse('2026-11-21T21:28:53+08:00');
  db.prepare("UPDATE site_classification_requests_v1 SET decision='study',decided_at=?,decision_target_type='host',decision_normalized_value='ankiuser.net'")
    .run(studyDecisionAt);
  for (const [date, bucket, amount] of [
    ['2026-11-19', 'composite', 1909], ['2026-11-19', 'rest', 1], ['2026-11-19', 'study', 1],
    ['2026-11-20', 'composite', 153], ['2026-11-20', 'study', 1],
    ['2026-11-21', 'composite', 4795], ['2026-11-21', 'study', 5],
  ]) {
    const start = Date.parse(date + 'T10:00:00+08:00');
    add('anki-' + date + '-' + bucket, amount, { date, domain: 'ankiuser.net', start_ms: start,
      end_ms: start + amount * 1000, mode: bucket, quota_bucket_at_time: bucket, target_rule_id: 'different-local-id' });
  }
  const beforeStudy = JSON.stringify(db.prepare('SELECT * FROM usage_segments_v1 ORDER BY id').all());
  const study = await run();
  assert.strictEqual(study.complete, true); assert.strictEqual(study.durationSeconds, 6865);
  assert.strictEqual(study.segmentCount, 7);
  const studyCorrections = db.prepare("SELECT * FROM usage_segment_corrections_v1 WHERE domain='ankiuser.net'").all();
  assert(studyCorrections.every(row => row.effective_mode === 'study' && row.effective_target_classification === 'study' && row.effective_quota_bucket === 'study'));
  assert.strictEqual(studyCorrections.filter(row => row.original_quota_bucket === 'composite').reduce((n, row) => n + row.duration_seconds, 0), 6857);
  assert.strictEqual(studyCorrections.filter(row => row.original_quota_bucket === 'rest').reduce((n, row) => n + row.duration_seconds, 0), 1);
  assert.strictEqual(studyCorrections.filter(row => row.original_quota_bucket === 'study').reduce((n, row) => n + row.duration_seconds, 0), 7);
  assert.strictEqual((await run()).segmentCount, 0);
  assert.strictEqual(JSON.stringify(db.prepare('SELECT * FROM usage_segments_v1 ORDER BY id').all()), beforeStudy);
  const mappedStudy = studyCorrections.map(row => ({ id: row.id, segmentId: row.segment_id, deviceId: row.device_id,
    date: row.date, domain: row.domain, startMs: row.start_ms, endMs: row.end_ms, durationSeconds: row.duration_seconds,
    channel: row.channel, originalMode: row.original_mode, originalQuotaBucket: row.original_quota_bucket,
    originalTargetClassification: row.original_target_classification, effectiveMode: row.effective_mode,
    effectiveQuotaBucket: row.effective_quota_bucket, effectiveTargetClassification: row.effective_target_classification }));
  const studyRows = studyCorrections.map(row => ({ device_id: row.device_id, date: row.date,
    hour_key: row.date + 'T10', target_key: 'fallback:domain:ankiuser.net', domain: row.domain,
    channel: row.channel, mode: row.original_mode, quota_bucket: row.original_quota_bucket,
    target_classification_at_time: row.original_target_classification, duration_seconds: row.duration_seconds }));
  // Build real per-hour inputs for the 4,795-second slice crossing 11:00.
  const hourRows = studyRows.flatMap(row => row.duration_seconds <= 3600 ? [row] : [
    { ...row, duration_seconds: 3600 }, { ...row, hour_key: row.date + 'T11', duration_seconds: row.duration_seconds - 3600 }]);
  for (const kind of ['daily_target', 'daily_domain', 'hourly_target', 'hourly_domain']) {
    const projected = applyCorrectionsToV1StatsRows(kind.startsWith('hourly') ? hourRows : studyRows, mappedStudy, kind);
    assert.strictEqual(projected.reduce((n, row) => n + row.duration_seconds, 0), 6865, kind);
    assert(projected.every(row => row.mode === 'study'), kind);
    if (kind.endsWith('target')) assert(projected.every(row => row.target_classification_at_time === 'study'), kind);
    assert.strictEqual(projected.filter(row => row.date === '2026-11-21').reduce((n, row) => n + row.duration_seconds, 0), 4800);
  }
  db.close();
}

(async () => {
  await verifySqliteReattribution();
  const summary = await applyRestrictedReattributionForRequest({ DB: fakeDb }, 'profile-1', 'request-1');
  assert.strictEqual(summary.applicable, true);
  assert.strictEqual(summary.complete, true);
  assert.strictEqual(summary.segmentCount, 2);
  assert.strictEqual(summary.durationSeconds, 300);
  assert.strictEqual(summary.batchCount, 1);
  assert.strictEqual(correctionBatch.length, 3, 'one header plus two immutable segment corrections');
  assert(correctionBatch[1].sql.includes('s.target_rule_id') === false, 'insert statement must not copy request linkage into correction schema');
  assert.deepStrictEqual(correctionBatch[1].args.slice(14, 17), ['rest', 'restricted', 'rest']);
  const repeated = await applyRestrictedReattributionForRequest({ DB: fakeDb }, 'profile-1', 'request-1');
  assert.strictEqual(repeated.complete, true);
  assert.strictEqual(repeated.segmentCount, 0, 'a repeated run must not create duplicate corrections');
  assert.strictEqual(repeated.durationSeconds, 0);
  assert.strictEqual(repeated.batchCount, 0);
  const evidenceQueries = [];
  const evidenceDb = {
    prepare(sql) {
      const query = { sql, args: [] };
      evidenceQueries.push(query);
      return {
        bind(...args) { query.args = args; return this; },
        async first() { return { total: 2, latest: 1234 }; },
        async all() { return { results: [{
          segment_id: 'segment-a', date: '2026-09-18', start_ms: 1, end_ms: 121001,
          duration_seconds: 120, channel: 'active', original_mode: 'composite',
          original_quota_bucket: 'composite', effective_mode: 'rest',
          effective_quota_bucket: 'rest', domain: 'must-not-leak.example',
        }] }; },
      };
    },
  };
  const evidence = await listDeviceCorrectionEvidencePage({ DB: evidenceDb }, 'profile-1', 'device-1',
    '2026-09-14', '2026-09-20', 1500, 0, 1);
  assert.strictEqual(evidence.total, 2);
  assert.strictEqual(evidence.nextOffset, 1);
  assert.strictEqual(evidence.revision, '2026-09-14:2026-09-20:2:1234');
  assert.strictEqual(evidence.items[0].effectiveQuotaBucket, 'rest');
  assert.strictEqual(JSON.stringify(evidence).includes('must-not-leak'), false);
  assert(evidenceQueries.every((query) => query.sql.includes('profile_id = ?')
    && query.sql.includes('device_id = ?') && query.sql.includes('created_at <= ?')));
  assert(evidenceQueries.every((query) => query.args[0] === 'profile-1' && query.args[1] === 'device-1'));
  console.log('[Usage Accounting Corrections] passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

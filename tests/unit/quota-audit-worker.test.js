const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const read = file => fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
const protocol = new Function(read('extension/core/quota-audit.js').replace(/export /g, '') + '\nreturn { buildQuotaAuditSnapshot, compareQuotaAudit, projectAuditSegment, verifyQuotaAuditPackets };')();
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(read('workers/migrations/010_client_logs_v1.sql'));
sqlite.exec('CREATE TABLE profiles (id TEXT, account_id TEXT); CREATE TABLE devices (id TEXT, profile_id TEXT);');
sqlite.exec("INSERT INTO profiles VALUES ('profile-test', 'account-test'); INSERT INTO devices VALUES ('device-test', 'profile-test');");
sqlite.exec('CREATE TABLE usage_segments_v1 (id TEXT, profile_id TEXT, device_id TEXT, date TEXT, start_ms INTEGER, end_ms INTEGER, duration_seconds INTEGER, channel TEXT, mode TEXT, target_classification_at_time TEXT, quota_bucket_at_time TEXT, uploaded_at INTEGER);');
sqlite.exec('CREATE TABLE device_access_audit_v1 (id TEXT, profile_id TEXT, device_id TEXT, timestamp INTEGER, status INTEGER);');
const env = { DB: { prepare(sql) { return { bind(...args) { return {
  first: async () => sqlite.prepare(sql).get(...args), all: async () => ({ results: sqlite.prepare(sql).all(...args) }), run: async () => sqlite.prepare(sql).run(...args),
}; } }; }, batch: async statements => { for (const statement of statements) await statement.run(); } } };
function loadTs(file, extras = '') {
  const js = ts.transpileModule(read(file) + extras, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', js)(exports, id => {
    if (id.includes('quota-audit')) return protocol;
    if (id.includes('middleware')) return { json: (data, status = 200) => new Response(JSON.stringify(data), { status }), verifyAccountToken: async req => req.headers.get('Authorization') === 'Bearer parent-test' ? 'account-test' : null };
    if (id.includes('deviceIdentity')) return { verifyDeviceToken: async () => ({ deviceId: 'device-test', profileId: 'profile-test' }) };
    if (id.includes('domain-semantics')) return { normalizeHostname: x => x };
    throw Error(id);
  });
  return exports;
}
(async () => {
  const router = loadTs('workers/src/routes/clientLogs.ts').clientLogsRouter;
  const now = Date.now(), date = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
  const request = { requestId: 'audit-test', deviceId: 'device-test', fromDate: date, toDate: date, expiresAt: now + 86400000 };
  const packets = await protocol.buildQuotaAuditSnapshot({ usage_segments_v1: { s: { id: 's', date, startMs: now - 19009000, endMs: now, durationSeconds: 19009, channel: 'active', mode: 'rest', quotaBucketAtTime: 'rest' } }, daily_usage_stats_v1: { [date]: { targets: { private: { activeByQuotaBucket: { rest: 19009 } } } } } }, request, now, 'snapshot-test');
  const upload = async list => router.handle(new Request('https://test.invalid/device/client-logs/v1', { method: 'POST', headers: { Authorization: 'Bearer device-test' }, body: JSON.stringify({ logs: list.map((p, i) => ({ id: `packet-${p.kind}-${i}`, timestamp: now, category: 'cloud', level: 'info', eventCode: 'quota_audit_packet', details: p })) }) }), env);
  const query = (suffix = '', auth = 'Bearer parent-test') => router.handle(new Request(`https://test.invalid/profiles/profile-test/quota-audit/v1?requestId=audit-test&deviceId=device-test${suffix}`, { headers: { Authorization: auth } }), env);
  await upload(packets.filter(p => p.kind !== 'chunk'));
  assert.equal((await (await query()).json()).complete, false);
  await upload(packets.filter(p => p.kind === 'chunk'));
  const result = await (await query()).json();
  assert.equal(result.complete, true, JSON.stringify(result));
  assert.equal(result.days[0].aggregateDelta, 0);
  assert.equal(result.days[0].localRawRest, 19009);
  assert.equal((await query('', '')).status, 401);
  const badProfile = await router.handle(new Request('https://test.invalid/profiles/other/quota-audit/v1?requestId=audit-test&deviceId=device-test', { headers: { Authorization: 'Bearer parent-test' } }), env);
  assert.equal(badProfile.status, 404);
  const cleanup = loadTs('workers/src/routes/deviceAccessAudit.ts', '\nexport { cleanupDeviceAccessAudit };').cleanupDeviceAccessAudit;
  const insert = sqlite.prepare('INSERT INTO device_access_audit_v1 VALUES (?, ?, ?, ?, ?)');
  insert.run('failure', 'profile-test', 'device-test', now - 86400000, 400);
  insert.run('expired-failure', 'profile-test', 'device-test', now - 15 * 86400000, 500);
  for (let i = 0; i < 1200; i++) insert.run(`success-${i}`, 'profile-test', 'device-test', now + i, 200);
  await cleanup(env, 'profile-test', 'device-test', now);
  assert(sqlite.prepare("SELECT id FROM device_access_audit_v1 WHERE id = 'failure'").get());
  assert(!sqlite.prepare("SELECT id FROM device_access_audit_v1 WHERE id = 'expired-failure'").get());
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM device_access_audit_v1 WHERE status < 400').get().n, 1000);
  sqlite.close();
  console.log('PASS Worker authenticated snapshot/log round trip + checksum, missing batch and independent 14-day failure retention');
})().catch(e => { console.error(e); process.exitCode = 1; });

// device-access-audit.test.js
// Run with: node tests/unit/device-access-audit.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let passed = 0;
let failed = 0;

function expectTrue(desc, cond) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
}

function extractSingleQuotedConstant(source, name) {
  const match = source.match(new RegExp(`export const ${name} =\\s*\\n?\\s*'([^']+)'`));
  if (!match) throw new Error(`Missing SQL constant: ${name}`);
  return match[1];
}

function extractTemplateConstant(source, name) {
  const match = source.match(new RegExp('export const ' + name + ' = `([\\s\\S]*?)`;'));
  if (!match) throw new Error(`Missing SQL constant: ${name}`);
  return match[1];
}

function run() {
  const migration = read('workers/migrations/017_device_access_audit_v1.sql');
  const retentionMigration = read('workers/migrations/025_device_access_audit_retention_indexes.sql');
  const index = read('workers/src/index.ts');
  const audit = read('workers/src/routes/deviceAccessAudit.ts');

  expectTrue('migration creates device access audit table', migration.includes('CREATE TABLE IF NOT EXISTS device_access_audit_v1'));
  expectTrue('audit table stores metadata only', migration.includes('token_hash_prefix') && migration.includes('client_version') && migration.includes('request_id') && migration.includes('payload_count') && !migration.includes('device_token TEXT') && !migration.includes('payload TEXT'));
  expectTrue('audit table has profile/device time indexes', migration.includes('idx_device_access_audit_profile_ts') && migration.includes('idx_device_access_audit_device_ts'));
  expectTrue('worker imports device access audit helpers', index.includes('recordDeviceAccessAudit') && index.includes('handleDeviceAccessAuditQuery'));
  expectTrue('worker exposes account query endpoint', index.includes('device-access-audit') && index.includes('handleDeviceAccessAuditQuery(request, env)'));
  expectTrue('worker audits all device routes centrally', index.includes("path.startsWith('/device/') ? request.clone() : null") && index.includes('ctx.waitUntil(') && index.includes('recordDeviceAccessAudit(auditRequest as unknown as Request, env, response.clone(), auditStartedAt)'));
  expectTrue('audit records 500 responses from route exceptions', index.includes('Internal Error:') && index.lastIndexOf('recordDeviceAccessAudit') > index.indexOf('response = new Response'));
  expectTrue('audit resolves auth without storing token', audit.includes('tokenHashPrefix') && audit.includes("crypto.subtle.digest('SHA-256'") && !audit.includes('device_token, timestamp'));
  expectTrue('audit tolerates legacy devices schema without status column', audit.includes('legacy_ok') && audit.includes('no such column') && audit.includes('SELECT id, profile_id FROM devices WHERE device_token = ?'));
  expectTrue('audit captures request kind and payload count only', audit.includes('requestKindForEndpoint') && audit.includes('payloadCount') && audit.includes('(body as any).segments') && !audit.includes('JSON.stringify(body)'));
  expectTrue('audit classifies identity and recovery device requests', audit.includes("endpoint === '/device/identity-link'") && audit.includes("return 'identity_link'") && audit.includes("endpoint.includes('/device/recover')") && audit.includes("return 'device_recovery'"));
  expectTrue('audit query requires account token and profile ownership', audit.includes('verifyAccountToken') && audit.includes('WHERE id = ? AND account_id = ?'));
  expectTrue('retention migration adds expiry and per-device indexes', retentionMigration.includes('idx_device_access_audit_timestamp') && retentionMigration.includes('idx_device_access_audit_profile_device_ts'));
  expectTrue('worker schedules retention only on daily cron', index.includes("event.cron === '0 12 * * *'") && index.includes('cleanupDeviceAccessAuditRetention(env, event.scheduledTime)'));

  const recordStart = audit.indexOf('export async function recordDeviceAccessAudit');
  const queryStart = audit.indexOf('export async function handleDeviceAccessAuditQuery');
  const recordBody = audit.slice(recordStart, queryStart);
  expectTrue('request audit path does not run retention cleanup', !recordBody.includes('cleanupDeviceAccessAuditRetention'));
  expectTrue('retention uses one D1 batch without swallowed errors', audit.includes('export async function cleanupDeviceAccessAuditRetention') && audit.includes('await env.DB.batch([') && !audit.includes('.run().catch(() => {})'));

  const db = new DatabaseSync(':memory:');
  db.exec(migration);
  db.exec(retentionMigration);

  const now = 2_000_000_000_000;
  const retentionMs = 14 * 24 * 60 * 60 * 1000;
  const insert = db.prepare(`INSERT INTO device_access_audit_v1 (
    id, profile_id, device_id, timestamp, method, endpoint, request_kind,
    status, auth_result, created_at
  ) VALUES (?, ?, ?, ?, 'POST', '/device/heartbeat', 'heartbeat', 200, 'ok', ?)`);

  db.exec('BEGIN');
  insert.run('expired', 'profile-a', 'device-a', now - retentionMs - 1, now - retentionMs - 1);
  for (let i = 0; i < 1005; i++) insert.run(`a-${i}`, 'profile-a', 'device-a', now - i, now - i);
  for (let i = 0; i < 1002; i++) insert.run(`b-${i}`, 'profile-a', 'device-b', now - i, now - i);
  insert.run('anonymous-recent', null, null, now, now);
  db.exec('COMMIT');

  const deleteExpiredSql = extractSingleQuotedConstant(audit, 'DELETE_EXPIRED_DEVICE_ACCESS_AUDIT_SQL');
  const trimSql = extractTemplateConstant(audit, 'TRIM_DEVICE_ACCESS_AUDIT_SQL');
  db.prepare(deleteExpiredSql).run(now - retentionMs);
  db.prepare(trimSql).run(1000);

  expectTrue('retention deletes expired rows', db.prepare("SELECT COUNT(*) AS count FROM device_access_audit_v1 WHERE id = 'expired'").get().count === 0);
  expectTrue('retention keeps exactly 1000 newest rows per device', db.prepare("SELECT COUNT(*) AS count FROM device_access_audit_v1 WHERE device_id = 'device-a'").get().count === 1000 && db.prepare("SELECT COUNT(*) AS count FROM device_access_audit_v1 WHERE device_id = 'device-b'").get().count === 1000);
  expectTrue('retention preserves recent anonymous diagnostics', db.prepare("SELECT COUNT(*) AS count FROM device_access_audit_v1 WHERE id = 'anonymous-recent'").get().count === 1);

  const expiryPlan = db.prepare(`EXPLAIN QUERY PLAN ${deleteExpiredSql}`).all(now - retentionMs);
  expectTrue('expiry delete query uses timestamp-only index', expiryPlan.some((row) => String(row.detail).includes('idx_device_access_audit_timestamp')));
  const trimPlan = db.prepare(`EXPLAIN QUERY PLAN ${trimSql}`).all(1000);
  expectTrue('per-device trim query uses composite retention index', trimPlan.some((row) => String(row.detail).includes('idx_device_access_audit_profile_device_ts')));
  db.close();

  console.log(`\n[Device Access Audit] ${passed}/${passed + failed} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed) process.exit(1);
}

run();

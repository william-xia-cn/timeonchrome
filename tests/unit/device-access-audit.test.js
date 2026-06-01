// device-access-audit.test.js
// Run with: node tests/unit/device-access-audit.test.js

'use strict';

const fs = require('fs');
const path = require('path');

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

function run() {
  const migration = read('workers/migrations/017_device_access_audit_v1.sql');
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
  expectTrue('audit query requires account token and profile ownership', audit.includes('verifyAccountToken') && audit.includes('WHERE id = ? AND account_id = ?'));
  expectTrue('audit retention limits rows', audit.includes('14 * 24 * 60 * 60 * 1000') && audit.includes('LIMIT 1000'));

  console.log(`\n[Device Access Audit] ${passed}/${passed + failed} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed) process.exit(1);
}

run();

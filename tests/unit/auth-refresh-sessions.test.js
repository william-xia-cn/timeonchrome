const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const authSource = fs.readFileSync(path.join(ROOT, 'workers', 'src', 'routes', 'auth.ts'), 'utf8');
const middlewareSource = fs.readFileSync(path.join(ROOT, 'workers', 'src', 'db', 'middleware.ts'), 'utf8');
const migrationSource = fs.readFileSync(path.join(ROOT, 'workers', 'migrations', '014_account_refresh_sessions.sql'), 'utf8');
const adminSource = fs.readFileSync(path.join(ROOT, 'extension', 'admin', 'admin.js'), 'utf8');
const bindSource = fs.readFileSync(path.join(ROOT, 'extension', 'bind.js'), 'utf8');
const routerSource = fs.readFileSync(path.join(ROOT, 'extension', 'message-router.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractBlock(source, marker) {
  const start = source.indexOf(marker);
  assert(start >= 0, `Missing marker ${marker}`);
  const next = source.indexOf("case '", start + marker.length);
  return source.slice(start, next > start ? next : source.length);
}

assert(migrationSource.includes('CREATE TABLE IF NOT EXISTS account_sessions'), 'migration should create account_sessions');
assert(migrationSource.includes('refresh_token_hash TEXT UNIQUE NOT NULL'), 'migration should store refresh token hash');
assert(authSource.includes("path === '/auth/refresh'"), 'Worker should expose /auth/refresh');
assert(authSource.includes("path === '/auth/logout'"), 'Worker should expose /auth/logout');
assert(authSource.includes('refreshToken: await createRefreshSession'), 'login/register should return refreshToken');
assert(authSource.includes('UPDATE account_sessions SET revoked_at = ? WHERE account_id = ?'), 'change-password should revoke refresh sessions');
assert(!authSource.includes('DELETE FROM devices') && !authSource.includes('UPDATE devices SET device_token'), 'change-password should not invalidate devices');
assert(middlewareSource.includes('payload?.exp') && middlewareSource.includes('Date.now()'), 'account token verification should reject expired new tokens');

assert(adminSource.includes('ACCOUNT_REFRESH_TOKEN') && adminSource.includes('cloud_account_email'), 'Admin should define refresh token and account email keys');
assert(adminSource.includes('migrateLegacyCredentials') && adminSource.includes('[CLOUD_KEYS.CREDENTIALS]: null'), 'Admin should migrate and clear legacy credentials');
assert(bindSource.includes('account_refresh_token') && bindSource.includes('cloud_credentials: null'), 'Bind page should save refresh token and clear cloud_credentials');

const logoutBlock = extractBlock(routerSource, "case 'CLOUD_LOGOUT':");
assert(logoutBlock.includes('/auth/logout'), 'CLOUD_LOGOUT should revoke refresh session server-side when available');
assert(logoutBlock.includes('ACCOUNT_REFRESH_TOKEN') && logoutBlock.includes('ACCOUNT_TOKEN'), 'CLOUD_LOGOUT should clear account session fields');
assert(!logoutBlock.includes('DEVICE_TOKEN]: null'), 'CLOUD_LOGOUT should not clear cloud_device_token');

console.log('[Auth Refresh Sessions] all checks passed');

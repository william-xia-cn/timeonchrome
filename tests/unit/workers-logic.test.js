// Unit tests for Workers pure logic (middleware.ts functions)
// Inlines JWT, hashPassword, json helper, parseAuth, generateDeviceToken
// Requires Node.js 18+ (Web Crypto API built-in)
// Run with: node tests/unit/workers-logic.test.js

'use strict';

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, extra = '') {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(label + (extra ? ` | ${extra}` : ''));
    console.error(`  FAIL: ${label}${extra ? ' | ' + extra : ''}`);
  }
}

function section(name) {
  console.log(`\n[${name}]`);
}

// ── Inlined from workers/src/db/middleware.ts ─────────────────────────────────

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function generateToken(payload, secret) {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body   = b64url(Buffer.from(JSON.stringify(payload)));
  const data   = `${header}.${body}`;
  const key    = await hmacKey(secret);
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(sigBuf)}`;
}

async function verifyToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, sig] = parts;
    const data = `${header}.${body}`;
    const key  = await hmacKey(secret);

    const sigBytes = Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
    if (!valid) return null;

    return JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  } catch {
    return null;
  }
}

async function verifyAccountToken(authHeader, secret) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const payload = await verifyToken(authHeader.slice(7), secret);
  return payload?.account_id ?? null;
}

// Inlined from workers/src/routes/auth.ts
async function hashPassword(password) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

// Inlined from workers/src/db/middleware.ts
function jsonHelper(data, status = 200) {
  const body    = JSON.stringify(data);
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };
  return { status, body, headers };
}

function parseAuth(authHeader) {
  if (!authHeader) return null;
  const [type, token] = authHeader.split(' ');
  if (type === 'Bearer') return { type: 'bearer', token };
  return null;
}

// Inlined from workers/src/routes/device.ts
function generateDeviceToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {

const SECRET = 'test-jwt-secret-32bytes-minimum!!';

// ── Section 1: JWT generate + verify ─────────────────────────────────────────
section('JWT: generateToken + verifyToken');

{
  const token = await generateToken({ account_id: 'acc-123', email: 'a@b.com' }, SECRET);
  check('token is a string', typeof token === 'string', token);
  check('token has 3 parts (header.payload.sig)', token.split('.').length === 3);

  const payload = await verifyToken(token, SECRET);
  check('verifyToken returns payload', payload !== null, JSON.stringify(payload));
  check('payload.account_id matches', payload?.account_id === 'acc-123');
  check('payload.email matches', payload?.email === 'a@b.com');
}

{
  // Wrong secret → null
  const token = await generateToken({ account_id: 'acc-123' }, SECRET);
  const result = await verifyToken(token, 'wrong-secret');
  check('wrong secret → null', result === null);
}

{
  // Tampered payload → null
  const token = await generateToken({ account_id: 'acc-123' }, SECRET);
  const parts = token.split('.');
  // Replace payload with different content
  const fakeBody = b64url(Buffer.from(JSON.stringify({ account_id: 'attacker' })));
  const tampered = `${parts[0]}.${fakeBody}.${parts[2]}`;
  const result = await verifyToken(tampered, SECRET);
  check('tampered payload → null (signature mismatch)', result === null);
}

{
  // Malformed token (not 3 parts)
  check('empty string → null', await verifyToken('', SECRET) === null);
  check('one-part token → null', await verifyToken('abc', SECRET) === null);
  check('two-part token → null', await verifyToken('abc.def', SECRET) === null);
}

// ── Section 2: verifyAccountToken ─────────────────────────────────────────────
section('JWT: verifyAccountToken');

{
  const token  = await generateToken({ account_id: 'acc-456', email: 'x@y.com' }, SECRET);
  const result = await verifyAccountToken(`Bearer ${token}`, SECRET);
  check('valid Bearer token → account_id', result === 'acc-456');
}

{
  check('no header → null', await verifyAccountToken(null, SECRET) === null);
  check('empty header → null', await verifyAccountToken('', SECRET) === null);
  check('non-Bearer prefix → null', await verifyAccountToken('Token abc.def.ghi', SECRET) === null);
}

{
  // Token without account_id field
  const token  = await generateToken({ email: 'x@y.com' }, SECRET);
  const result = await verifyAccountToken(`Bearer ${token}`, SECRET);
  check('token missing account_id → null', result === null);
}

// ── Section 3: hashPassword ───────────────────────────────────────────────────
section('hashPassword');

{
  const h1 = await hashPassword('myPassword123');
  const h2 = await hashPassword('myPassword123');
  check('same input → same hash (idempotent)', h1 === h2);
  check('hash is 64 hex chars (SHA-256)', /^[0-9a-f]{64}$/.test(h1), h1.length);
}

{
  const h1 = await hashPassword('password1');
  const h2 = await hashPassword('password2');
  check('different inputs → different hashes', h1 !== h2);
}

{
  // Empty string has a defined SHA-256
  const h = await hashPassword('');
  check('empty string → 64 hex chars', /^[0-9a-f]{64}$/.test(h));
}

// ── Section 4: generateDeviceToken ───────────────────────────────────────────
section('generateDeviceToken');

{
  const t = generateDeviceToken();
  check('device token is 64 hex chars', /^[0-9a-f]{64}$/.test(t), `len=${t.length}`);
}

{
  const t1 = generateDeviceToken();
  const t2 = generateDeviceToken();
  check('two tokens are different (random)', t1 !== t2);
}

// ── Section 5: json() helper ──────────────────────────────────────────────────
section('json() helper');

{
  const r = jsonHelper({ ok: true });
  check('default status is 200', r.status === 200);
  check('Content-Type is application/json', r.headers['Content-Type'] === 'application/json');
  check('CORS header present', r.headers['Access-Control-Allow-Origin'] === '*');
  check('body is valid JSON', JSON.parse(r.body)?.ok === true);
}

{
  const r = jsonHelper({ error: 'Not found' }, 404);
  check('custom status 404', r.status === 404);
  check('error message preserved', JSON.parse(r.body)?.error === 'Not found');
}

// ── Section 6: parseAuth() ────────────────────────────────────────────────────
section('parseAuth()');

{
  const r = parseAuth('Bearer mytoken123');
  check('Bearer token parsed', r?.type === 'bearer');
  check('token value extracted', r?.token === 'mytoken123');
}

{
  check('null header → null', parseAuth(null) === null);
  check('undefined header → null', parseAuth(undefined) === null);
  check('non-Bearer scheme → null', parseAuth('Basic dXNlcjpwYXNz') === null);
}

// ── Section 7: SQL injection defense (static analysis) ───────────────────────
section('SQL: parameterized queries (static analysis)');

{
  const fs   = require('fs');
  const path = require('path');
  const routesDir = path.resolve(__dirname, '../../workers/src/routes');
  const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.ts'));

  let violations = [];

  for (const file of files) {
    const src = fs.readFileSync(path.join(routesDir, file), 'utf8');
    // Look for DB.prepare() calls — check none have template literals with variables
    // Pattern: DB.prepare(`...${...}...`) is dangerous
    const dangerPattern = /env\.DB\.prepare\(`[^`]*\$\{/g;
    const matches = src.match(dangerPattern);
    if (matches) {
      violations.push(`${file}: ${matches.length} template-literal SQL(s)`);
    }
  }

  check(
    'no template-literal SQL in route files (all use .bind())',
    violations.length === 0,
    violations.join('; ') || 'clean'
  );
  check('all 8 route files scanned', files.length >= 7, `found ${files.length} files`);
}

// ── Section 8: timeWindows derived online windows ────────────────────────────
section('timeWindows: computeOnlineWindowsForDay');

function computeOnlineWindowsForDay(dayWindows) {
  const normalize = (windows) => (!Array.isArray(windows) || windows.length === 0 ? null : windows);
  const studyWindows = normalize(dayWindows.studyWindows);
  const compositeWindows = normalize(dayWindows.compositeWindows);
  const restWindows = normalize(dayWindows.restWindows);
  if (studyWindows === null || compositeWindows === null || restWindows === null) {
    return null;
  }
  const merged = [...studyWindows, ...compositeWindows, ...restWindows].sort((a, b) => a.start.localeCompare(b.start));
  const result = [];
  for (const w of merged) {
    if (result.length === 0 || w.start > result[result.length - 1].end) {
      result.push({ start: w.start, end: w.end });
    } else {
      result[result.length - 1].end = w.end > result[result.length - 1].end ? w.end : result[result.length - 1].end;
    }
  }
  return result;
}

{
  // study null + rest array => online unrestricted
  const r = computeOnlineWindowsForDay({ studyWindows: null, compositeWindows: [{ start: '08:00', end: '12:00' }], restWindows: [{ start: '15:30', end: '24:00' }] });
  check('study null + rest array => online null', r === null);
}

{
  // study array + rest null => online unrestricted
  const r = computeOnlineWindowsForDay({ studyWindows: [{ start: '08:00', end: '12:00' }], compositeWindows: [{ start: '12:00', end: '14:00' }], restWindows: null });
  check('study array + rest null => online null', r === null);
}

{
  // study array + rest array => merged union
  const r = computeOnlineWindowsForDay({
    studyWindows: [{ start: '08:00', end: '12:00' }],
    compositeWindows: [{ start: '12:00', end: '13:00' }],
    restWindows: [{ start: '14:00', end: '18:00' }],
  });
  check('study + composite + rest non-overlap => two windows', r.length === 2);
  check('first window is 08:00-13:00', r[0].start === '08:00' && r[0].end === '13:00');
  check('second window is 14:00-18:00', r[1].start === '14:00' && r[1].end === '18:00');
}

{
  // study/rest overlap => merged
  const r = computeOnlineWindowsForDay({
    studyWindows: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
    compositeWindows: [{ start: '10:00', end: '15:00' }],
    restWindows: [{ start: '12:00', end: '14:00' }],
  });
  check('study/rest overlap merged => single 08:00-18:00', r.length === 1);
  check('merged window correct', r[0].start === '08:00' && r[0].end === '18:00');
}

{
  // both null => online null
  const r = computeOnlineWindowsForDay({ studyWindows: null, compositeWindows: null, restWindows: null });
  check('both null => online null', r === null);
}

{
  // empty arrays => unrestricted
  const r = computeOnlineWindowsForDay({ studyWindows: [], compositeWindows: [], restWindows: [] });
  check('empty arrays => online null', r === null);
}

// ── Section 9: mergeWithDefaults and new-profile effective lists ─────────────
section('mergeWithDefaults: new profile effective list initialization');

function mergeWithDefaults(customList, defaultList) {
  const defaultSet = new Set(defaultList.map(d => d.toLowerCase()));
  const custom = customList.filter(d => !defaultSet.has(d.toLowerCase()));
  return [...defaultList, ...custom];
}

const siteAccessDefaults = require('../../workers/config/site-access-defaults.json');

{
  // compositeList effective = defaultCompositeSites + defaultUserCompositeSites + customCompositeList
  const customCompositeList = siteAccessDefaults.defaultUserCompositeSites || [];
  const effectiveComposite = mergeWithDefaults(customCompositeList, siteAccessDefaults.defaultCompositeSites);
  check('new profile compositeList count = 9 system + 5 user-default = 14', effectiveComposite.length === 14, `actual=${effectiveComposite.length}`);

  // 3 vendor/support domains in system defaults
  const vendors = ['microsoft.com', 'apple.com', 'adobe.com'];
  const allVendorsPresent = vendors.every(v => effectiveComposite.includes(v));
  check('new profile compositeList includes all 3 vendor/support domains', allVendorsPresent);

  // 5 user-default sites should be present
  const userDefaults = ['youtube.com', 'wikipedia.org', 'wikimedia.org', 'stackexchange.com', 'reddit.com'];
  const allUserDefaultsPresent = userDefaults.every(u => effectiveComposite.includes(u));
  check('new profile compositeList includes all 5 user-default sites', allUserDefaultsPresent);

  // Removed sites should NOT be present
  const removedSites = ['baidu.com', 'duckduckgo.com', 'search.brave.com', 'baike.baidu.com'];
  const noneRemovedPresent = removedSites.every(s => !effectiveComposite.includes(s));
  check('removed sites (baidu/duckduckgo/brave/baike) NOT in system composite defaults', noneRemovedPresent);
}

{
  // Runtime system defaults now include defaultUserCompositeSites even for existing profiles.
  const customCompositeList = ['wikipedia.org', 'wikimedia.org', 'stackexchange.com', 'reddit.com'];
  const compositeSystemDefaults = mergeWithDefaults(siteAccessDefaults.defaultUserCompositeSites || [], siteAccessDefaults.defaultCompositeSites);
  const effectiveComposite = mergeWithDefaults(customCompositeList, compositeSystemDefaults);
  check('youtube.com remains in effective list as system defaultUserCompositeSites', effectiveComposite.includes('youtube.com'));
  check('remaining user-default sites still present', effectiveComposite.includes('wikipedia.org'));
}

{
  // customCompositeList = [] → effective should equal composite system defaults
  const compositeSystemDefaults = mergeWithDefaults(siteAccessDefaults.defaultUserCompositeSites || [], siteAccessDefaults.defaultCompositeSites);
  const effectiveComposite = mergeWithDefaults([], compositeSystemDefaults);
  check('mergeWithDefaults([], composite system defaults) equals system defaults', effectiveComposite.length === compositeSystemDefaults.length);
  check('empty custom still includes youtube.com from defaultUserCompositeSites', effectiveComposite.includes('youtube.com'));
}

{
  // customCompositeList with duplicates → deduped
  const effectiveComposite = mergeWithDefaults(['google.com', 'new-site.com'], mergeWithDefaults(siteAccessDefaults.defaultUserCompositeSites || [], siteAccessDefaults.defaultCompositeSites));
  check('duplicate google.com is deduped', !effectiveComposite.some((d, i, arr) => arr.indexOf(d) !== i));
  check('new-site.com is appended', effectiveComposite.includes('new-site.com'));
}

{
  // studyList effective = defaultStudySites + customStudyList
  const customStudy = ['keystoneacademy.cn', 'powerschool.keystoneacademy.cn', 'managebac.cn', 'reach.cloud', 'schoolsbuddy.cn', 'afficienta.com'];
  const effectiveStudy = mergeWithDefaults(customStudy, siteAccessDefaults.defaultStudySites);
  check('new profile studyList count = 149 + 6 custom = 155', effectiveStudy.length === 155, `actual=${effectiveStudy.length}`);
}

// ── Summary ───────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n[Workers Logic] ${passed}/${total} passed${failed > 0 ? ` — ${failed} FAILED` : ''}`);
if (failures.length > 0) {
  console.log('Failed:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

})();

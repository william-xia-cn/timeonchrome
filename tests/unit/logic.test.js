// Unit tests for pure functions extracted from background.js
// Run with: node tests/unit/logic.test.js

'use strict';

// ── Inline pure functions from background.js ──────────────────────────────────

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function matchDomain(domain, pattern) {
  const d = domain.replace(/^www\./, '');
  const p = pattern.replace(/^www\./, '');
  return d === p || d.endsWith('.' + p);
}

function sortObjectKeys(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  return Object.keys(obj).sort().reduce((acc, key) => {
    acc[key] = sortObjectKeys(obj[key]);
    return acc;
  }, {});
}

function encryptCredentials(email, password) {
  const data = Buffer.from(`${email}:${password}`).toString('base64');
  return data;
}

function decryptCredentials(encrypted) {
  try {
    const decoded = Buffer.from(encrypted, 'base64').toString('utf8');
    const [email, ...rest] = decoded.split(':');
    const password = rest.join(':');
    return { email, password };
  } catch (e) {
    return null;
  }
}

function isWithinSchedule(schedule) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const dayConfig = schedule.days[dayOfWeek];

  if (!dayConfig || !dayConfig.enabled) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = dayConfig.start.split(':').map(Number);
  const [endH, endM] = dayConfig.end.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

// getTodayEffectiveRestLimit depends on today's date — use a test-time version
function getTodayEffectiveRestLimit(config, todayOverride) {
  const baseLimit = config.dailyRestQuota ?? 120;
  const borrow    = config.quotaBorrow;
  if (!borrow || borrow.repaid) return baseLimit;

  const today = todayOverride || formatDate(new Date());
  if (today === borrow.borrowedFrom) {
    return baseLimit + borrow.amount;
  }

  const repayD = new Date(borrow.borrowedFrom + 'T00:00:00');
  repayD.setDate(repayD.getDate() + 1);
  const repayStr = formatDate(repayD);
  if (today === repayStr) {
    return Math.max(0, baseLimit - borrow.amount);
  }

  return baseLimit;
}

// ── Test runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function expect(description, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push({ description, expected, actual });
    console.error(`  ✗ ${description}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

function expectTrue(description, value) {
  if (value === true) {
    passed++;
  } else {
    failed++;
    failures.push({ description, expected: true, actual: value });
    console.error(`  ✗ ${description} (got ${JSON.stringify(value)})`);
  }
}

function expectFalse(description, value) {
  if (value === false) {
    passed++;
  } else {
    failed++;
    failures.push({ description, expected: false, actual: value });
    console.error(`  ✗ ${description} (got ${JSON.stringify(value)})`);
  }
}

function section(name) {
  console.log(`\n[${name}]`);
}

// ── extractDomain ─────────────────────────────────────────────────────────────

section('extractDomain');

expect('https URL', extractDomain('https://www.example.com/path?q=1'), 'example.com');
expect('http URL', extractDomain('http://sub.domain.co/'), 'sub.domain.co');
expect('www stripped', extractDomain('https://www.google.com'), 'google.com');
// Note: extractDomain is a pure URL parser; special-URL filtering is done by
// isSpecialUrl() in background.js before extractDomain is called.
// Node.js URL parses chrome:// / chrome-extension:// without throwing.
expect('chrome:// returns hostname', extractDomain('chrome://settings'), 'settings');
expect('chrome-extension:// returns ext-id', extractDomain('chrome-extension://abc/popup.html'), 'abc');
expect('about:blank returns empty string', extractDomain('about:blank'), '');
expect('invalid string → null', extractDomain('not a url'), null);
expect('empty string → null', extractDomain(''), null);

// ── matchDomain ───────────────────────────────────────────────────────────────

section('matchDomain');

expectTrue('exact match', matchDomain('example.com', 'example.com'));
expectTrue('subdomain match', matchDomain('sub.example.com', 'example.com'));
expectTrue('www stripped from domain', matchDomain('www.example.com', 'example.com'));
expectTrue('www stripped from pattern', matchDomain('example.com', 'www.example.com'));
expectTrue('deep subdomain', matchDomain('a.b.example.com', 'example.com'));
expectFalse('different domain', matchDomain('evil.com', 'example.com'));
expectFalse('partial suffix does not match', matchDomain('notexample.com', 'example.com'));
expectFalse('reversed order', matchDomain('example.com', 'sub.example.com'));

// ── formatDate ────────────────────────────────────────────────────────────────

section('formatDate');

expect('2026-04-14', formatDate(new Date(2026, 3, 14)), '2026-04-14');
expect('padding month and day', formatDate(new Date(2026, 0, 5)), '2026-01-05');
expect('December 31', formatDate(new Date(2025, 11, 31)), '2025-12-31');

// Key check: local time, NOT UTC (the whole point of formatDate)
{
  const d = new Date(2026, 3, 14, 0, 30, 0); // local midnight + 30 min
  expect('local midnight stays same day', formatDate(d), '2026-04-14');
}

// ── sortObjectKeys ────────────────────────────────────────────────────────────

section('sortObjectKeys');

{
  const input  = { b: 2, a: 1, c: 3 };
  const result = sortObjectKeys(input);
  expect('keys sorted alphabetically', Object.keys(result), ['a', 'b', 'c']);
  expect('values preserved', result, { a: 1, b: 2, c: 3 });
}

{
  const input  = { z: { y: 2, x: 1 }, a: 0 };
  const result = sortObjectKeys(input);
  expect('nested object keys sorted', Object.keys(result.z), ['x', 'y']);
}

expect('null passthrough', sortObjectKeys(null), null);
expect('string passthrough', sortObjectKeys('hello'), 'hello');
expect('number passthrough', sortObjectKeys(42), 42);
expect('array passthrough', sortObjectKeys([3, 1, 2]), [3, 1, 2]);

{
  const input  = { b: [{ z: 1, a: 2 }], a: 0 };
  const result = sortObjectKeys(input);
  expect('objects inside arrays sorted', Object.keys(result.b[0]), ['a', 'z']);
}

// ── encryptCredentials / decryptCredentials ───────────────────────────────────

section('encryptCredentials');

{
  const enc = encryptCredentials('test@example.com', 'password123');
  expectTrue('returns non-empty string', typeof enc === 'string' && enc.length > 0);
  const dec = decryptCredentials(enc);
  expect('roundtrip email', dec && dec.email, 'test@example.com');
  expect('roundtrip password', dec && dec.password, 'password123');
}

{
  const enc1 = encryptCredentials('user@test.com', 'abc');
  const enc2 = encryptCredentials('user@test.com', 'abc');
  expect('same input → same output (deterministic)', enc1, enc2);
}

{
  const enc1 = encryptCredentials('a@test.com', 'pass');
  const enc2 = encryptCredentials('b@test.com', 'pass');
  expectTrue('different emails → different output', enc1 !== enc2);
}

// ── isWithinSchedule ──────────────────────────────────────────────────────────

section('isWithinSchedule');

{
  // Build schedule where all days disabled
  const allDisabled = {
    enabled: true,
    days: {
      0: { enabled: false, start: '08:00', end: '21:00' },
      1: { enabled: false, start: '08:00', end: '21:00' },
      2: { enabled: false, start: '08:00', end: '21:00' },
      3: { enabled: false, start: '08:00', end: '21:00' },
      4: { enabled: false, start: '08:00', end: '21:00' },
      5: { enabled: false, start: '08:00', end: '21:00' },
      6: { enabled: false, start: '08:00', end: '21:00' },
    }
  };
  expectFalse('all days disabled → false', isWithinSchedule(allDisabled));
}

{
  // Build schedule where today is enabled with "always open" hours
  const now = new Date();
  const dayOfWeek = now.getDay();
  const alwaysOpen = { days: {} };
  for (let d = 0; d < 7; d++) {
    alwaysOpen.days[d] = { enabled: false, start: '00:00', end: '23:59' };
  }
  alwaysOpen.days[dayOfWeek] = { enabled: true, start: '00:00', end: '23:59' };
  expectTrue('today enabled with 00:00-23:59 → true', isWithinSchedule(alwaysOpen));
}

{
  // Build schedule where today is enabled but with impossible window
  const now = new Date();
  const dayOfWeek = now.getDay();
  const closedHours = { days: {} };
  for (let d = 0; d < 7; d++) {
    closedHours.days[d] = { enabled: false, start: '00:00', end: '00:01' };
  }
  closedHours.days[dayOfWeek] = { enabled: true, start: '00:00', end: '00:01' };
  // This may pass if it's exactly midnight:00, but practically always false
  const result = isWithinSchedule(closedHours);
  const currentMin = now.getHours() * 60 + now.getMinutes();
  const expectedResult = currentMin >= 0 && currentMin < 1;
  expect('narrow window result matches expectation', result, expectedResult);
}

// ── getTodayEffectiveRestLimit ─────────────────────────────────────────────────

section('getTodayEffectiveRestLimit');

{
  const config = { dailyRestQuota: 120 };
  expect('no borrow → base limit', getTodayEffectiveRestLimit(config, '2026-04-14'), 120);
}

{
  const config = { dailyRestQuota: 120, quotaBorrow: null };
  expect('null borrow → base limit', getTodayEffectiveRestLimit(config, '2026-04-14'), 120);
}

{
  const config = {
    dailyRestQuota: 120,
    quotaBorrow: { borrowedFrom: '2026-04-14', amount: 30, repaid: false }
  };
  expect('borrow day → quota + amount', getTodayEffectiveRestLimit(config, '2026-04-14'), 150);
}

{
  const config = {
    dailyRestQuota: 120,
    quotaBorrow: { borrowedFrom: '2026-04-14', amount: 30, repaid: false }
  };
  expect('repay day (borrowedFrom +1) → quota - amount', getTodayEffectiveRestLimit(config, '2026-04-15'), 90);
}

{
  const config = {
    dailyRestQuota: 120,
    quotaBorrow: { borrowedFrom: '2026-04-14', amount: 30, repaid: false }
  };
  expect('unrelated day → base limit', getTodayEffectiveRestLimit(config, '2026-04-16'), 120);
}

{
  const config = {
    dailyRestQuota: 120,
    quotaBorrow: { borrowedFrom: '2026-04-14', amount: 30, repaid: true }
  };
  expect('already repaid → base limit', getTodayEffectiveRestLimit(config, '2026-04-14'), 120);
}

{
  // Quota < borrow amount: clamp to 0
  const config = {
    dailyRestQuota: 20,
    quotaBorrow: { borrowedFrom: '2026-04-14', amount: 60, repaid: false }
  };
  expect('repay day clamped to 0', getTodayEffectiveRestLimit(config, '2026-04-15'), 0);
}

// ── Summary ───────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n[Unit] ${passed}/${total} passed${failed > 0 ? ` — ${failed} FAILED` : ''}`);

if (failed > 0) {
  process.exit(1);
}

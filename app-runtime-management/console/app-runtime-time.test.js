const assert = require('node:assert/strict');
const test = require('node:test');
const { beijingHourLabel, beijingRange } = require('./app-runtime-time.js');

test('day range starts at Beijing midnight without double-applying UTC+8', () => {
  const range = beijingRange('day', 0, Date.parse('2026-09-01T12:00:00Z'));
  assert.equal(new Date(range.from).toISOString(), '2026-08-31T16:00:00.000Z');
  assert.equal(new Date(range.to).toISOString(), '2026-09-01T16:00:00.000Z');
});

test('previous day uses the adjacent Beijing calendar day', () => {
  const range = beijingRange('day', -1, Date.parse('2026-09-01T12:00:00Z'));
  assert.equal(new Date(range.from).toISOString(), '2026-08-30T16:00:00.000Z');
  assert.equal(range.to - range.from, 24 * 60 * 60 * 1000);
});

test('week range starts Monday at Beijing midnight', () => {
  const range = beijingRange('week', 0, Date.parse('2026-09-01T12:00:00Z'));
  assert.equal(new Date(range.from).toISOString(), '2026-08-30T16:00:00.000Z');
  assert.equal(new Date(range.to).toISOString(), '2026-09-06T16:00:00.000Z');
});

test('Beijing midnight selects the new day exactly at the boundary', () => {
  const before = beijingRange('day', 0, Date.parse('2026-08-31T15:59:59.999Z'));
  const after = beijingRange('day', 0, Date.parse('2026-08-31T16:00:00.000Z'));
  assert.equal(new Date(before.from).toISOString(), '2026-08-30T16:00:00.000Z');
  assert.equal(new Date(after.from).toISOString(), '2026-08-31T16:00:00.000Z');
});

test('invalid periods and fractional offsets fail closed', () => {
  assert.throws(() => beijingRange('month'), RangeError);
  assert.throws(() => beijingRange('day', 0.5), TypeError);
});

test('hour labels come from each bucket timestamp in Beijing time', () => {
  assert.equal(beijingHourLabel(Date.parse('2026-09-01T09:00:00Z')), '17时');
  assert.equal(beijingHourLabel(Date.parse('2026-09-01T16:00:00Z')), '0时');
});

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const source = fs.readFileSync(path.join(__dirname, '../../extension/core/downtime.js'), 'utf8');
const { evaluateWebsiteDowntime: evaluate, readDowntimeConfig } = new Function(
  `${source.replace(/export (function|const) /g, '$1 ')}\nreturn { evaluateWebsiteDowntime, readDowntimeConfig };`)();
const time = value => Date.parse(value);
const policy = (daily, allowed = []) => ({ enabled: true, windowsByWeekday: daily, allowedWebsiteTypes: allowed });
const window = (start, end) => ({ start, end });
let passed = 0;
function test(name, body) {
  try { body(); passed++; }
  catch (error) { console.error(`FAIL: ${name}`); throw error; }
}

const monday = policy({ monday: [window('08:00', '12:00')] }, ['study']);

test('missing and disabled policy preserve existing access', () => {
  for (const value of [undefined, null, { enabled: false }]) {
    const result = evaluate(value, 'restricted', time('2026-10-12T02:00:00Z'));
    assert.equal(result.ok, true);
    assert.equal(result.active, false);
    assert.equal(result.blocked, false);
  }
});

test('Beijing start is inclusive and end exclusive down to milliseconds', () => {
  assert.equal(evaluate(monday, 'restricted', time('2026-10-11T23:59:59.999Z')).active, false);
  const start = evaluate(monday, 'restricted', time('2026-10-12T00:00:00Z'));
  assert.equal(start.blocked, true);
  assert.equal(start.activeUntilMs, time('2026-10-12T04:00:00Z'));
  assert.equal(evaluate(monday, 'restricted', time('2026-10-12T03:59:59.999Z')).active, true);
  assert.equal(evaluate(monday, 'restricted', time('2026-10-12T04:00:00Z')).active, false);
});

test('only explicit management types pass this gate', () => {
  const everyType = policy(monday.windowsByWeekday, ['study', 'composite', 'restricted', 'other']);
  for (const type of ['study', 'composite', 'restricted', 'other']) {
    const result = evaluate(everyType, type, time('2026-10-12T02:00:00Z'));
    assert.equal(result.exceptionApplied, true);
    assert.equal(result.blocked, false);
    assert.equal(result.reason, 'type_exception');
    assert.equal(Object.hasOwn(result, 'access'), false);
  }
  for (const type of [undefined, null, '', 'pending_composite', 'unclassified', 'unknown', 'blocked', 'unsafe', 'rest']) {
    const result = evaluate(everyType, type, time('2026-10-12T02:00:00Z'));
    assert.equal(result.blocked, true);
    assert.equal(result.exceptionApplied, false);
  }
});

test('exceptions do not change the continuous schedule boundary', () => {
  const result = evaluate(monday, 'study', time('2026-10-12T02:00:00Z'));
  assert.equal(result.active, true);
  assert.equal(result.nextChangeAtMs, time('2026-10-12T04:00:00Z'));
});

test('Monday night carries to Tuesday without applying Tuesday daytime', () => {
  const value = policy({ monday: [window('22:00', '07:00')] });
  assert.equal(evaluate(value, 'study', time('2026-10-12T13:59:59Z')).active, false);
  assert.equal(evaluate(value, 'study', time('2026-10-12T14:00:00Z')).blocked, true);
  const midnight = evaluate(value, 'study', time('2026-10-12T16:00:00Z'));
  assert.equal(midnight.activeUntilMs, time('2026-10-12T23:00:00Z'));
  assert.equal(evaluate(value, 'study', time('2026-10-12T22:59:59Z')).blocked, true);
  assert.equal(evaluate(value, 'study', time('2026-10-12T23:00:00Z')).active, false);
  assert.equal(evaluate(value, 'study', time('2026-10-13T15:00:00Z')).active, false);
});

test('Sunday spillover and Monday windows merge across the week boundary', () => {
  const value = policy({ sunday: [window('23:00', '02:00')], monday: [window('01:00', '03:00')] });
  const sunday = evaluate(value, 'study', time('2026-10-11T15:30:00Z'));
  const mondayResult = evaluate(value, 'study', time('2026-10-11T16:30:00Z'));
  assert.equal(sunday.activeUntilMs, time('2026-10-11T19:00:00Z'));
  assert.equal(mondayResult.activeUntilMs, sunday.activeUntilMs);
  assert.equal(mondayResult.blocked, true);
  assert.equal(evaluate(value, 'study', time('2026-10-11T19:00:00Z')).active, false);
});

test('24:00 ends at Beijing midnight and does not spill into the next day', () => {
  const value = policy({ monday: [window('20:00', '24:00')] });
  assert.equal(evaluate(value, 'study', time('2026-10-12T15:59:59Z')).blocked, true);
  assert.equal(evaluate(value, 'study', time('2026-10-12T16:00:00Z')).active, false);
});

test('adjacent, overlapping and unordered windows expose only the final end', () => {
  const value = policy({ monday: [window('11:00', '13:00'), window('08:00', '10:00'),
    window('09:00', '11:00'), window('13:00', '14:00')] });
  assert.equal(evaluate(value, 'study', time('2026-10-12T00:00:00Z')).activeUntilMs, time('2026-10-12T06:00:00Z'));
  assert.equal(evaluate(value, 'study', time('2026-10-12T03:00:00Z')).activeUntilMs, time('2026-10-12T06:00:00Z'));
});

test('a gap is not merged and has an actual next start', () => {
  const value = policy({ monday: [window('08:00', '10:00'), window('11:00', '12:00')] });
  const result = evaluate(value, 'study', time('2026-10-12T02:30:00Z'));
  assert.equal(result.active, false);
  assert.equal(result.nextChangeAtMs, time('2026-10-12T03:00:00Z'));
});

test('next week is searched when this week has no remaining start', () => {
  assert.equal(evaluate(monday, 'study', time('2026-10-12T04:00:00Z')).nextChangeAtMs, time('2026-10-19T00:00:00Z'));
});

test('empty schedules are inactive and full-week schedules have no fake end', () => {
  const empty = evaluate(policy({ monday: [] }), 'study', time('2026-10-12T00:00:00Z'));
  assert.equal(empty.active, false);
  assert.equal(empty.nextChangeAtMs, null);
  const daily = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    .map(day => [day, [window('00:00', '24:00')]]));
  const result = evaluate(policy(daily), 'study', time('2026-10-15T02:00:00Z'));
  assert.equal(result.blocked, true);
  assert.equal(result.activeUntilMs, null);
  assert.equal(result.nextChangeAtMs, null);
});

test('policy changes and time jumps recalculate instead of preserving a lock', () => {
  const current = time('2026-10-12T02:00:00Z');
  assert.equal(evaluate(monday, 'restricted', current).blocked, true);
  assert.equal(evaluate({ ...monday, allowedWebsiteTypes: ['restricted'] }, 'restricted', current).blocked, false);
  assert.equal(evaluate({ ...monday, enabled: false }, 'restricted', current).blocked, false);
  assert.equal(evaluate(monday, 'restricted', time('2026-10-12T06:00:00Z')).blocked, false);
});

test('malformed enabled policies return unknown rather than a false access decision', () => {
  const invalid = [false, [], {}, { enabled: 'true' }, policy({ monday: null }), policy({ monday: {} }),
    policy({ unknown: [] }), policy({ monday: [window('24:00', '07:00')] }),
    policy({ monday: [window('08:00', '08:00')] }), policy({ monday: [window('8:00', '09:00')] }),
    policy({ monday: [window('08:00', '24:01')] }), policy({ monday: [window('08:60', '09:00')] }),
    policy({ monday: [{ start: '08:00', end: '09:00', hidden: true }] }),
    policy({}, ['study', 'study']), policy({}, ['unclassified']), policy({}, ['https://example.invalid']),
    { enabled: true, windowsByWeekday: {}, allowedWebsiteTypes: null },
    policy({ monday: Array.from({ length: 33 }, () => window('08:00', '09:00')) })];
  for (const value of invalid) {
    const result = evaluate(value, 'study', time('2026-10-12T02:00:00Z'));
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_policy');
    assert.equal(result.blocked, null);
    assert.equal(result.active, null);
  }
});

test('invalid timestamps do not consult the current wall clock', () => {
  for (const value of [NaN, Infinity, '2026-10-12', null, new Date(NaN), 9e15]) {
    const result = evaluate(monday, 'study', value);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_time');
    assert.equal(result.blocked, null);
  }
});

test('caller-owned policy and schedules remain unchanged', () => {
  const value = policy({ monday: [window('12:00', '14:00'), window('08:00', '12:00')] }, ['study']);
  const before = JSON.stringify(value);
  for (const entries of Object.values(value.windowsByWeekday)) {
    entries.forEach(Object.freeze); Object.freeze(entries);
  }
  Object.freeze(value.windowsByWeekday); Object.freeze(value.allowedWebsiteTypes); Object.freeze(value);
  evaluate(value, 'study', new Date('2026-10-12T02:00:00Z'));
  assert.equal(JSON.stringify(value), before);
});

test('Beijing evaluation is independent of the computer timezone', () => {
  const script = `${source.replace(/export (function|const) /g, '$1 ')}\n` +
    `console.log(JSON.stringify(evaluateWebsiteDowntime(${JSON.stringify(monday)}, 'restricted', ${time('2026-10-12T00:00:00Z')})));`;
  const results = ['UTC', 'America/Los_Angeles', 'Asia/Shanghai'].map(TZ => {
    const child = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', env: { ...process.env, TZ } });
    assert.equal(child.status, 0, child.stderr);
    return child.stdout.trim();
  });
  assert.equal(results[0], results[1]);
  assert.equal(results[1], results[2]);
  assert.equal(JSON.parse(results[0]).blocked, true);
});

test('old profiles display disabled without writing defaults into the input', () => {
  const view = readDowntimeConfig(undefined);
  assert.equal(view.ok, true);
  assert.equal(view.configured, false);
  assert.equal(view.config.enabled, false);
  assert.equal(Object.keys(view.config.windowsByWeekday).length, 7);
  assert.deepEqual(view.config.allowedApplicationTypes, []);
});

test('full profile configuration preserves website and application exceptions independently', () => {
  const raw = { schemaVersion: 1, ...monday, allowedApplicationTypes: ['restrictedEntertainment', 'study'] };
  const before = JSON.stringify(raw);
  const view = readDowntimeConfig(raw);
  assert.equal(view.ok, true);
  assert.deepEqual(view.config.allowedApplicationTypes, ['study', 'restrictedEntertainment']);
  assert.deepEqual(view.config.allowedWebsiteTypes, ['study']);
  assert.equal(evaluate(view.config, 'restricted', time('2026-10-12T02:00:00Z')).blocked, true);
  view.config.windowsByWeekday.monday[0].end = '11:00';
  assert.equal(JSON.stringify(raw), before);
});

test('invalid synced configuration is displayed as unknown even if it says disabled', () => {
  const raw = { schemaVersion: 1, ...monday, allowedApplicationTypes: [] };
  for (const value of [null, { ...raw, enabled: false, allowedApplicationTypes: ['unknown'] },
    { ...raw, schemaVersion: 2 }, { ...raw, allowedWebsiteTypes: ['pending_composite'] },
    { ...raw, allowedApplicationTypes: ['rest'] }, { ...raw, token: 'unwanted' }]) {
    assert.equal(readDowntimeConfig(value).ok, false);
    assert.equal(readDowntimeConfig(value).config, null);
  }
});

console.log(`downtime: ${passed}/${passed} tests passed`);

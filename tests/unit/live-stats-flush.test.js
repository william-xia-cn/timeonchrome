// P0 live stats flush + bound identity attribution tests
// Run with: node tests/unit/live-stats-flush.test.js

'use strict';

const fs = require('fs');
const path = require('path');

class MockStorage {
  constructor() { this.data = {}; }
  reset() { this.data = {}; }
  async get(keys) {
    const result = {};
    if (keys === null) return { ...this.data };
    if (Array.isArray(keys)) { keys.forEach(k => { result[k] = this.data[k]; }); return result; }
    if (typeof keys === 'string') { result[keys] = this.data[keys]; return result; }
    if (typeof keys === 'object') { Object.keys(keys).forEach(k => { result[k] = this.data[k] ?? keys[k]; }); return result; }
    return result;
  }
  async set(obj) { Object.assign(this.data, obj); }
  async remove(keys) { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete this.data[k]); }
}

const mockLocal = new MockStorage();
const mockSession = new MockStorage();
global.chrome = { storage: { local: mockLocal, session: mockSession } };

function loadProdModule(relPath, exportNames, injected = {}) {
  const abs = path.join(__dirname, '..', '..', relPath);
  let code = fs.readFileSync(abs, 'utf-8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');
  const injectedKeys = Object.keys(injected);
  const prelude = injectedKeys.length ? `const { ${injectedKeys.join(', ')} } = __injected;\n` : '';
  const factory = new Function('__injected', `${prelude}${code}\nreturn { ${exportNames.join(', ')} };`);
  return factory(injected);
}

const usage = loadProdModule('core/usage-segments.js', [
  'isCountedState',
  'settleUsageDuration',
  'getAllUsageSegments',
  'getDailyUsageStats',
]);

const events = [];
const traces = [];
const sessionApi = loadProdModule('runtime/session.js', [
  'saveSession',
  'getSession',
  'settleCurrentSessionSegment',
  'flushOpenSessionToStats',
  'runPeriodicCheckpoint',
  'resolveSettlementIdentity',
], {
  appendEvent: async (event) => { events.push(event); },
  EVENT_TYPE: { START: 'START', END: 'END' },
  emitTrace: async (name, payload) => { traces.push({ name, payload }); },
  getReliableCloseTime: (session, now) => ({ closeTime: now, stale: false }),
  isCountedState: usage.isCountedState,
  settleUsageDuration: usage.settleUsageDuration,
});

let passed = 0, failed = 0;
function chk(label, actual, expected) {
  const pass = actual === expected;
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  pass ? passed++ : failed++;
}
function chkT(label, value) {
  const pass = !!value;
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${label}: expected truthy, got ${JSON.stringify(value)}`);
  pass ? passed++ : failed++;
}
function sec(name) { console.log(`\n[${name}]`); }

const realNow = Date.now;
const NOW = new Date('2026-05-07T12:00:00+08:00').getTime();
let mockNow = NOW;
Date.now = () => mockNow;

(async () => {
try {

sec('LF1: bound config settlement writes profileId/deviceId');
mockLocal.reset(); mockSession.reset(); events.length = 0; traces.length = 0;
await chrome.storage.local.set({
  cloud_profile_id: 'profile-real-1',
  cloud_device_id: 'device-id-real-1',
  cloud_device_token: 'device-token-real-1',
  guardian_session: { currentMode: 'rest' },
});
const identity = await sessionApi.resolveSettlementIdentity({ state: 'ACTIVE', domain: 'bound.example.com' }, 'unit');
chk('profile source value', identity.profileId, 'profile-real-1');
chk('device source value', identity.deviceId, 'device-id-real-1');
await sessionApi.settleCurrentSessionSegment({
  state: 'ACTIVE',
  domain: 'bound.example.com',
  startTime: NOW - 60000,
  lastHeartbeat: NOW - 1000,
}, NOW, 'ui_flush');
let all = await usage.getAllUsageSegments();
let seg = Object.values(all)[0];
chk('segment profileId', seg.profileId, 'profile-real-1');
chk('segment deviceId', seg.deviceId, 'device-id-real-1');
chk('segment channel active', seg.channel, 'active');

sec('LF2: FLUSH_TIME creates segment + daily aggregate and reopens session');
mockLocal.reset(); mockSession.reset(); events.length = 0; traces.length = 0;
await chrome.storage.local.set({
  cloud_profile_id: 'profile-real-2',
  cloud_device_id: 'device-id-real-2',
  cloud_device_token: 'device-token-real-2',
  guardian_session: { currentMode: 'rest' },
});
await sessionApi.saveSession({
  state: 'ACTIVE',
  domain: 'live.example.com',
  startTime: NOW - 90000,
  lastHeartbeat: NOW - 1000,
});
const flush = await sessionApi.flushOpenSessionToStats('ui_flush');
chk('flush ok', flush.ok, true);
chk('flush segment count', flush.flushedSegments, 1);
chk('flush seconds', flush.flushedSeconds, 90);
all = await usage.getAllUsageSegments();
seg = Object.values(all)[0];
chk('flush segment domain', seg.domain, 'live.example.com');
chk('flush segment profile', seg.profileId, 'profile-real-2');
chk('flush segment device', seg.deviceId, 'device-id-real-2');
const day = await usage.getDailyUsageStats(seg.date);
chk('daily aggregate active=90', day.domains['live.example.com'].activeSeconds, 90);
const reopened = await sessionApi.getSession();
chk('reopened state', reopened.state, 'ACTIVE');
chk('reopened domain', reopened.domain, 'live.example.com');
chk('reopened startTime now', reopened.startTime, NOW);

sec('LF3: repeated flush at same time does not duplicate count');
const flush2 = await sessionApi.flushOpenSessionToStats('ui_flush');
chk('second flush skipped', flush2.flushed, false);
all = await usage.getAllUsageSegments();
chk('still one segment', Object.keys(all).length, 1);
const day2 = await usage.getDailyUsageStats(seg.date);
chk('daily aggregate still 90', day2.domains['live.example.com'].activeSeconds, 90);

sec('LF3b: ui_flush guard skips repeated flush within 30 seconds');
mockNow = NOW + 10000;
const guardedFlush = await sessionApi.flushOpenSessionToStats('ui_flush');
chk('guarded flush skipped', guardedFlush.flushed, false);
chk('guarded reason', guardedFlush.reason, 'ui_flush_guard_interval');
all = await usage.getAllUsageSegments();
chk('guard keeps one segment within 30s', Object.keys(all).length, 1);

sec('LF3c: ui_flush guard allows flush after 30 seconds');
mockNow = NOW + 31000;
const resumedFlush = await sessionApi.flushOpenSessionToStats('ui_flush');
chk('flush resumes after 30s', resumedFlush.flushed, true);
chk('flush resumes segment count', resumedFlush.flushedSegments, 1);
all = await usage.getAllUsageSegments();
chk('segments count becomes two after 30s', Object.keys(all).length, 2);

sec('LF3d: periodic checkpoint triggers after 3 minutes and reopens session');
mockLocal.reset(); mockSession.reset(); events.length = 0; traces.length = 0;
mockNow = NOW;
await chrome.storage.local.set({
  cloud_profile_id: 'profile-checkpoint-1',
  cloud_device_id: 'device-checkpoint-1',
  guardian_session: { currentMode: 'rest' },
});
await sessionApi.saveSession({
  state: 'ACTIVE',
  domain: 'checkpoint.example.com',
  startTime: NOW - 181000,
  lastHeartbeat: NOW - 1000,
});
const checkpoint1 = await sessionApi.runPeriodicCheckpoint(mockNow);
chk('periodic checkpoint ok', checkpoint1.ok, true);
chk('periodic checkpointed true', checkpoint1.checkpointed, true);
chk('periodic checkpoint reason', checkpoint1.reason, 'periodic_checkpoint');
all = await usage.getAllUsageSegments();
chk('periodic checkpoint creates one segment', Object.keys(all).length, 1);
seg = Object.values(all)[0];
const checkpointDay = await usage.getDailyUsageStats(seg.date);
chk('periodic checkpoint updates daily aggregate', checkpointDay.domains['checkpoint.example.com'].activeSeconds > 0, true);
const checkpointReopened = await sessionApi.getSession();
chk('periodic checkpoint reopened same state', checkpointReopened.state, 'ACTIVE');
chk('periodic checkpoint reopened same domain', checkpointReopened.domain, 'checkpoint.example.com');
chk('periodic checkpoint reopened startTime at now', checkpointReopened.startTime, mockNow);

sec('LF3e: periodic checkpoint skips when interval < 3 minutes');
mockNow = NOW + 120000;
const checkpointSkip = await sessionApi.runPeriodicCheckpoint(mockNow);
chk('checkpoint skip ok', checkpointSkip.ok, true);
chk('checkpoint skip reason', checkpointSkip.reason, 'interval_not_reached');
all = await usage.getAllUsageSegments();
chk('skip keeps segment count unchanged', Object.keys(all).length, 1);

sec('LF3f: ui_flush guard does not block periodic checkpoint');
mockNow = NOW;
mockLocal.reset(); mockSession.reset(); events.length = 0; traces.length = 0;
await chrome.storage.local.set({
  cloud_profile_id: 'profile-checkpoint-2',
  cloud_device_id: 'device-checkpoint-2',
  guardian_session: { currentMode: 'rest' },
});
await sessionApi.saveSession({
  state: 'ACTIVE',
  domain: 'guard-bypass.example.com',
  startTime: NOW - 190000,
  lastHeartbeat: NOW - 1000,
});
await sessionApi.flushOpenSessionToStats('ui_flush');
await sessionApi.saveSession({
  state: 'ACTIVE',
  domain: 'guard-bypass.example.com',
  startTime: NOW - 181000,
  lastHeartbeat: NOW - 1000,
});
mockNow = NOW + 10000;
const checkpointBypass = await sessionApi.runPeriodicCheckpoint(mockNow);
chk('periodic bypass ok', checkpointBypass.ok, true);
chk('periodic bypass checkpointed', checkpointBypass.checkpointed, true);
all = await usage.getAllUsageSegments();
chk('periodic bypass adds second segment despite ui guard window', Object.keys(all).length, 2);

sec('LF3g: repeated periodic alarm does not double-count immediately');
mockNow = NOW + 20000;
const checkpointRepeat = await sessionApi.runPeriodicCheckpoint(mockNow);
chk('repeat checkpoint skip reason', checkpointRepeat.reason, 'interval_not_reached');
all = await usage.getAllUsageSegments();
chk('repeat checkpoint keeps segment count', Object.keys(all).length, 2);

sec('LF4: token-only bound profile does not leak raw token into deviceId');
mockLocal.reset(); mockSession.reset(); events.length = 0; traces.length = 0;
let warnCount = 0;
const originalWarn = console.warn;
console.warn = () => { warnCount += 1; };
await chrome.storage.local.set({
  cloud_profile_id: 'profile-token-only',
  cloud_device_token: 'raw-device-token-must-not-leak',
  guardian_session: { currentMode: 'rest' },
});
await sessionApi.settleCurrentSessionSegment({
  state: 'ACTIVE',
  domain: 'token-only.example.com',
  startTime: NOW - 30000,
  lastHeartbeat: NOW - 1000,
}, NOW, 'ui_flush');
console.warn = originalWarn;
all = await usage.getAllUsageSegments();
seg = Object.values(all)[0];
chk('token-only profile kept', seg.profileId, 'profile-token-only');
chk('token-only device null', seg.deviceId, null);
chk('raw token not used', seg.deviceId === 'raw-device-token-must-not-leak', false);
chkT('token-only warning emitted', warnCount > 0);
chkT('token-only trace emitted', traces.some(t => t.name === 'settlement_identity_fallback'));

sec('LF5: unbound fallback is explicit and non-crashing');
mockLocal.reset(); mockSession.reset(); events.length = 0; traces.length = 0;
warnCount = 0;
console.warn = () => { warnCount += 1; };
await sessionApi.settleCurrentSessionSegment({
  state: 'ACTIVE',
  domain: 'unbound.example.com',
  startTime: NOW - 30000,
  lastHeartbeat: NOW - 1000,
}, NOW, 'ui_flush');
console.warn = originalWarn;
all = await usage.getAllUsageSegments();
seg = Object.values(all)[0];
chk('unbound profile null', seg.profileId, null);
chk('unbound device null', seg.deviceId, null);
chkT('unbound warning emitted', warnCount > 0);

sec('LF6: non-counted open session is a flush no-op');
mockLocal.reset(); mockSession.reset(); events.length = 0; traces.length = 0;
await sessionApi.saveSession({
  state: 'PASSIVE',
  domain: 'passive.example.com',
  startTime: NOW - 60000,
  lastHeartbeat: NOW - 1000,
});
const passiveFlush = await sessionApi.flushOpenSessionToStats('ui_flush');
chk('passive flush skipped', passiveFlush.flushed, false);
chk('passive reason', passiveFlush.reason, 'non_counted_state');
all = await usage.getAllUsageSegments();
chk('passive creates no segment', Object.keys(all).length, 0);
chk('passive creates no events', events.length, 0);

} finally {
  Date.now = realNow;
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
})();

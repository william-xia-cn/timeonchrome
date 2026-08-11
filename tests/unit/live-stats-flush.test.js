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
  const abs = path.join(__dirname, '..', '..', 'extension', relPath);
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
  tabId: 321,
  windowId: 654,
}, NOW, 'periodic_checkpoint');
let all = await usage.getAllUsageSegments();
let seg = Object.values(all)[0];
chk('segment profileId', seg.profileId, 'profile-real-1');
chk('segment deviceId', seg.deviceId, 'device-id-real-1');
chk('segment tabId', seg.tabId, 321);
chk('segment windowId', seg.windowId, 654);
chk('segment channel active', seg.channel, 'active');
chk('segment description end periodic', seg.description.end.reason, 'periodic_checkpoint');
chk('segment description end source timer', seg.description.end.source, 'timer');

sec('LF2: FLUSH_TIME does not settle unconfirmed foreground_page session');
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
chk('flush skipped until checkpoint', flush.flushed, false);
chk('flush reason checkpoint required', flush.reason, 'foreground_checkpoint_required');
all = await usage.getAllUsageSegments();
chk('flush creates no foreground segment', Object.keys(all).length, 0);
const reopened = await sessionApi.getSession();
chk('session still active', reopened.state, 'ACTIVE');
chk('session domain unchanged', reopened.domain, 'live.example.com');
chk('session startTime unchanged', reopened.startTime, NOW - 90000);

sec('LF2b: popup_open settles foreground session and reopens it');
mockLocal.reset(); mockSession.reset(); events.length = 0; traces.length = 0;
mockNow = NOW;
await chrome.storage.local.set({
  cloud_profile_id: 'profile-popup-1',
  cloud_device_id: 'device-popup-1',
  cloud_device_token: 'device-popup-1-token',
  guardian_session: { currentMode: 'rest' },
});
await sessionApi.saveSession({
  state: 'ACTIVE',
  domain: 'popup.example.com',
  startTime: NOW - 45000,
  lastHeartbeat: NOW - 1000,
  startReason: 'tabActivated',
  startOperationSource: 'chrome_event',
  startAtMs: NOW - 45000,
});
const popupFlush = await sessionApi.flushOpenSessionToStats('popup_open', { allowForeground: true });
chk('popup_open flush ok', popupFlush.ok, true);
chk('popup_open flush settles foreground', popupFlush.flushed, true);
chk('popup_open reason', popupFlush.reason, 'popup_open');
all = await usage.getAllUsageSegments();
chk('popup_open creates one segment', Object.keys(all).length, 1);
seg = Object.values(all)[0];
chk('popup_open segment reason', seg.settlementReason, 'popup_open');
chk('popup_open description end reason', seg.description.end.reason, 'popup_open');
chk('popup_open description end source', seg.description.end.source, 'ui_action');
const popupReopened = await sessionApi.getSession();
chk('popup_open reopened same state', popupReopened.state, 'ACTIVE');
chk('popup_open reopened same domain', popupReopened.domain, 'popup.example.com');
chk('popup_open reopened start reason', popupReopened.startReason, 'popup_open_reopen');
chk('popup_open reopened source', popupReopened.startOperationSource, 'ui_action');

sec('LF3: repeated flush at same time does not duplicate count');
mockLocal.reset(); mockSession.reset(); events.length = 0; traces.length = 0;
mockNow = NOW;
await chrome.storage.local.set({
  cloud_profile_id: 'profile-real-3',
  cloud_device_id: 'device-id-real-3',
  cloud_device_token: 'device-token-real-3',
  guardian_session: { currentMode: 'rest' },
});
await sessionApi.saveSession({
  state: 'ACTIVE',
  domain: 'live.example.com',
  startTime: NOW - 90000,
  lastHeartbeat: NOW - 1000,
});
const flush2 = await sessionApi.flushOpenSessionToStats('ui_flush');
chk('second flush skipped', flush2.flushed, false);
all = await usage.getAllUsageSegments();
chk('still no foreground segment before checkpoint', Object.keys(all).length, 0);

sec('LF3b: ui_flush guard skips repeated flush within 30 seconds');
mockNow = NOW + 10000;
const guardedFlush = await sessionApi.flushOpenSessionToStats('ui_flush');
chk('guarded flush skipped', guardedFlush.flushed, false);
chk('guarded reason', guardedFlush.reason, 'foreground_checkpoint_required');
all = await usage.getAllUsageSegments();
chk('guard keeps zero foreground segments within 30s', Object.keys(all).length, 0);

sec('LF3c: ui_flush guard allows flush after 30 seconds');
mockNow = NOW + 31000;
const resumedFlush = await sessionApi.flushOpenSessionToStats('ui_flush');
chk('flush still waits for checkpoint after 30s', resumedFlush.flushed, false);
chk('flush still reports checkpoint required', resumedFlush.reason, 'foreground_checkpoint_required');
all = await usage.getAllUsageSegments();
chk('segments count remains zero before checkpoint', Object.keys(all).length, 0);

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
chk('checkpoint description start fallback', seg.description.start.reason, 'unknown_start');
chk('checkpoint description end', seg.description.end.reason, 'periodic_checkpoint');
const checkpointDay = await usage.getDailyUsageStats(seg.date);
chk('periodic checkpoint updates daily aggregate', checkpointDay.domains['checkpoint.example.com'].activeSeconds > 0, true);
const checkpointReopened = await sessionApi.getSession();
chk('periodic checkpoint reopened same state', checkpointReopened.state, 'ACTIVE');
chk('periodic checkpoint reopened same domain', checkpointReopened.domain, 'checkpoint.example.com');
chk('periodic checkpoint reopened startTime at checkpoint boundary', checkpointReopened.startTime, NOW - 1000);
chk('periodic checkpoint reopened start reason', checkpointReopened.startReason, 'periodic_checkpoint_reopen');

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
chk('periodic bypass adds first foreground segment despite prior ui flush', Object.keys(all).length, 1);

sec('LF3g: repeated periodic alarm does not double-count immediately');
mockNow = NOW + 20000;
const checkpointRepeat = await sessionApi.runPeriodicCheckpoint(mockNow);
chk('repeat checkpoint skip reason', checkpointRepeat.reason, 'interval_not_reached');
all = await usage.getAllUsageSegments();
chk('repeat checkpoint keeps segment count', Object.keys(all).length, 1);

sec('LF3h: checkpoint confirmation failure writes estimated close');
mockLocal.reset(); mockSession.reset(); events.length = 0; traces.length = 0;
mockNow = NOW;
await chrome.storage.local.set({
  cloud_profile_id: 'profile-checkpoint-est-close',
  cloud_device_id: 'device-checkpoint-est-close',
  guardian_session: { currentMode: 'rest' },
});
await sessionApi.saveSession({
  state: 'ACTIVE',
  domain: 'estimated-close.example.com',
  startTime: NOW - 181000,
  lastHeartbeat: NOW - 1000,
});
const estimatedClose = await sessionApi.runPeriodicCheckpoint(mockNow, {
  confirmForegroundPage: async () => ({ ok: false, reason: 'idle_not_active', idleState: 'idle' }),
});
chk('estimated close ok', estimatedClose.ok, true);
chk('estimated close repaired', estimatedClose.repaired, true);
chk('estimated close reason', estimatedClose.reason, 'checkpoint_estimated_close');
all = await usage.getAllUsageSegments();
chk('estimated close creates one segment', Object.keys(all).length, 1);
seg = Object.values(all)[0];
chk('estimated close settlement reason', seg.settlementReason, 'checkpoint_estimated_close');
chk('estimated close caps at half checkpoint', seg.endMs - seg.startMs, 90000);
chk('estimated close description end', seg.description.end.reason, 'checkpoint_estimated_half_interval_close');
const estimatedClosedSession = await sessionApi.getSession();
chk('estimated close clears session', estimatedClosedSession.state, null);

sec('LF3i: checkpoint opens estimated session when active sample exists but session is closed');
mockLocal.reset(); mockSession.reset(); events.length = 0; traces.length = 0;
mockNow = NOW;
const estimatedOpen = await sessionApi.runPeriodicCheckpoint(mockNow, {
  confirmForegroundPage: async () => ({ ok: true, observedState: 'ACTIVE', observedDomain: 'estimated-open.example.com', idleState: 'active' }),
  routeForegroundAccess: async () => ({ ok: true, blocked: false }),
});
chk('estimated open ok', estimatedOpen.ok, true);
chk('estimated open repaired', estimatedOpen.repaired, true);
chk('estimated open reason', estimatedOpen.reason, 'checkpoint_estimated_open');
all = await usage.getAllUsageSegments();
chk('estimated open creates no immediate segment', Object.keys(all).length, 0);
const estimatedOpenSession = await sessionApi.getSession();
chk('estimated open session state', estimatedOpenSession.state, 'ACTIVE');
chk('estimated open session domain', estimatedOpenSession.domain, 'estimated-open.example.com');
chk('estimated open starts half checkpoint before now', estimatedOpenSession.startTime, NOW - 90000);
chk('estimated open start reason', estimatedOpenSession.startReason, 'checkpoint_estimated_open');

sec('LF3j: checkpoint mismatch estimates close old session and opens sampled active session');
mockLocal.reset(); mockSession.reset(); events.length = 0; traces.length = 0;
mockNow = NOW;
await chrome.storage.local.set({
  cloud_profile_id: 'profile-checkpoint-est-switch',
  cloud_device_id: 'device-checkpoint-est-switch',
  guardian_session: { currentMode: 'rest' },
});
await sessionApi.saveSession({
  state: 'ACTIVE',
  domain: 'old-sampled.example.com',
  startTime: NOW - 181000,
  lastHeartbeat: NOW - 1000,
});
const estimatedSwitch = await sessionApi.runPeriodicCheckpoint(mockNow, {
  confirmForegroundPage: async () => ({ ok: false, reason: 'observed_mismatch', observedState: 'ACTIVE', observedDomain: 'new-sampled.example.com', idleState: 'active' }),
  routeForegroundAccess: async () => ({ ok: true, blocked: false }),
});
chk('estimated switch repaired', estimatedSwitch.repaired, true);
chk('estimated switch opened', estimatedSwitch.opened, true);
all = await usage.getAllUsageSegments();
chk('estimated switch creates one old segment', Object.keys(all).length, 1);
seg = Object.values(all)[0];
chk('estimated switch old domain', seg.domain, 'old-sampled.example.com');
chk('estimated switch old duration half checkpoint', seg.endMs - seg.startMs, 90000);
const estimatedSwitchSession = await sessionApi.getSession();
chk('estimated switch new session domain', estimatedSwitchSession.domain, 'new-sampled.example.com');
chk('estimated switch new session start', estimatedSwitchSession.startTime, NOW - 90000);
chk('estimated switch new session reason', estimatedSwitchSession.startReason, 'checkpoint_estimated_open');

sec('LF3k: checkpoint repair uses post-route mode instead of cached Study mode');
mockLocal.reset(); mockSession.reset(); events.length = 0; traces.length = 0;
mockNow = NOW;
await chrome.storage.local.set({ guardian_session: { currentMode: 'study' } });
const restrictedRepair = await sessionApi.runPeriodicCheckpoint(mockNow, {
  confirmForegroundPage: async () => ({
    ok: true,
    observedState: 'ACTIVE',
    observedDomain: 'restricted.example.com',
    observedUrl: 'https://restricted.example.com/play',
    idleState: 'active',
  }),
  routeForegroundAccess: async () => {
    await chrome.storage.local.set({ guardian_session: { currentMode: 'rest' } });
    return { ok: true, blocked: false, modeChange: { changed: true, toMode: 'rest' } };
  },
});
chk('restricted repair opened after route', restrictedRepair.opened, true);
const restrictedRepairSession = await sessionApi.getSession();
chk('restricted repair quota uses post-route Rest mode', restrictedRepairSession.quotaBucketAtTime, 'rest');

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
}, NOW, 'periodic_checkpoint');
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
}, NOW, 'periodic_checkpoint');
console.warn = originalWarn;
all = await usage.getAllUsageSegments();
seg = Object.values(all)[0];
chk('unbound profile null', seg.profileId, null);
chk('unbound device null', seg.deviceId, null);
chkT('unbound warning emitted', warnCount > 0);

sec('LF5b: monitoring_off description is local only metadata');
mockLocal.reset(); mockSession.reset(); events.length = 0; traces.length = 0;
await sessionApi.settleCurrentSessionSegment({
  state: 'ACTIVE',
  domain: 'monitoring-off.example.com',
  startTime: NOW - 30000,
  lastHeartbeat: NOW - 1000,
}, NOW, 'monitoring_off');
all = await usage.getAllUsageSegments();
seg = Object.values(all)[0];
chk('monitoring_off description end', seg.description.end.reason, 'monitoring_off');
chk('monitoring_off description source', seg.description.end.source, 'chrome_event');

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

'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function event() {
  const listeners = [];
  return { addListener: fn => listeners.push(fn), emit: (...args) => listeners.forEach(fn => fn(...args)) };
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

(async () => {
  const { createMacGuardianHealthClient, MAC_GUARDIAN_ALARM, MAC_GUARDIAN_HOST } = await import(
    pathToFileURL(path.join(__dirname, '../../extension/infra/mac-guardian-health.js')).href);
  function fixture({ os = 'mac', enabled = true, profile = '33333333-3333-4333-8333-333333333333' } = {}) {
    let clock = 100_000, behavior = 'ok', status = 'active';
    const ports = [], messages = [], records = [], timeouts = new Map(), intervals = new Map(), created = [];
    let id = 0;
    const runtime = { id: 'jdcancbiocacabbjdkngadmjpjmkdnih', getManifest: () => ({ version: '1.7.44' }),
      getPlatformInfo: async () => ({ os }), getURL: p => `chrome-extension://jdcancbiocacabbjdkngadmjpjmkdnih/${p}`,
      onStartup: event(), onInstalled: event(), onMessage: event(),
      connectNative(host) {
        assert.equal(host, MAC_GUARDIAN_HOST);
        if (behavior === 'missing') throw Error('raw secret error');
        const port = { onMessage: event(), onDisconnect: event(), disconnect() { this.onDisconnect.emit(); },
          postMessage(p) {
            messages.push(p);
            if (behavior === 'ok') queueMicrotask(() => this.onMessage.emit({ ok: true, receivedAt: 1787160000 }));
            if (behavior === 'invalid') queueMicrotask(() => this.onMessage.emit({ ok: false, token: 'secret' }));
          } };
        ports.push(port);
        return port;
      } };
    const alarms = { onAlarm: event(), get: async () => null, create: async (...a) => created.push(a) };
    const client = createMacGuardianHealthClient({ runtime, alarms, enabled: async () => enabled,
      readContext: async () => ({ profile, monitoringStatus: status, policyHash: null,
        token: 'must-not-leak', url: 'https://private.invalid', email: 'private@example.invalid' }),
      saveStatus: async s => records.push(s), now: () => clock,
      timers: { setTimeout(fn, ms) { assert.equal(ms, 3000); timeouts.set(++id, fn); return id; },
        clearTimeout: i => timeouts.delete(i), setInterval(fn, ms) { assert.equal(ms, 60000); intervals.set(++id, fn); return id; },
        clearInterval: i => intervals.delete(i) } });
    return { client, runtime, alarms, ports, messages, records, created, intervals,
      advance: () => { clock += 60000; }, behavior: value => { behavior = value; }, status: value => { status = value; },
      timeout: () => [...timeouts.values()].forEach(fn => fn()) };
  }
  for (const os of ['win', 'linux', 'unknown']) {
    const f = fixture({ os }); await flush(); await f.client.request({ force: true });
    assert.equal(f.ports.length, 0); assert.equal(f.created.length, 0); assert.equal(f.records.length, 0);
  }
  const disabled = fixture({ enabled: false }); await flush(); assert.equal(disabled.ports.length, 0);
  const f = fixture(); await flush();
  assert.equal(f.messages.length, 1); assert.equal(f.created[0][0], MAC_GUARDIAN_ALARM);
  assert.deepEqual(Object.keys(f.messages[0]).sort(), ['extensionId', 'monitoringStatus', 'policyHash', 'profile', 'type', 'version']);
  assert.equal(f.messages[0].monitoringStatus, 'active'); assert.equal(f.records.at(-1).lastErrorCode, null);
  assert(!JSON.stringify(f.messages).includes('private')); assert(!JSON.stringify(f.records).includes('secret'));
  f.alarms.onAlarm.emit({ name: MAC_GUARDIAN_ALARM }); await flush(); assert.equal(f.messages.length, 1);
  f.advance(); f.alarms.onAlarm.emit({ name: MAC_GUARDIAN_ALARM });
  [...f.intervals.values()].forEach(fn => fn()); await flush(); assert.equal(f.messages.length, 2);
  f.runtime.onMessage.emit({ type: 'TIMEONCHROME_LOCAL_HEALTH_PROBE' }, { id: f.runtime.id, url: 'https://bad.invalid' });
  await flush(); assert.equal(f.messages.length, 2);
  f.runtime.onMessage.emit({ type: 'TIMEONCHROME_LOCAL_HEALTH_PROBE' }, { id: f.runtime.id, url: f.runtime.getURL('health-probe.html') });
  await flush(); assert.equal(f.messages.at(-1).type, 'probe');
  const old = f.ports[0]; old.disconnect(); f.behavior('hang'); f.advance();
  const hanging = f.client.request({ force: true }); await flush();
  assert.equal(f.ports.length, 2);
  old.onDisconnect.emit(); old.onMessage.emit({ ok: false });
  f.ports[1].onMessage.emit({ ok: true, receivedAt: 1787160000 });
  assert.equal((await hanging).ok, true);
  f.advance(); const timeout = f.client.request({ force: true }); await flush(); f.timeout();
  assert.equal((await timeout).errorCode, 'guardian_response_timeout');
  assert.equal(f.intervals.size, 0);
  f.behavior('missing'); f.advance();
  assert.equal((await f.client.request({ force: true })).errorCode, 'guardian_host_unavailable');
  assert(!JSON.stringify(f.records).includes('raw secret'));
  f.behavior('invalid'); f.advance();
  assert.equal((await f.client.request({ force: true })).errorCode, 'guardian_invalid_response');
  f.behavior('ok'); f.advance(); assert.equal((await f.client.request({ force: true })).ok, true);
  assert.equal(f.records.at(-1).consecutiveFailures, 0);
  f.behavior('hang'); f.advance();
  const queued = f.client.request({ force: true }); await flush();
  const before = f.messages.length;
  await f.client.request({ force: true, trigger: 'bootstrap_result' });
  await f.client.request({ type: 'probe' });
  await f.client.request({ type: 'probe' });
  assert.equal(f.messages.length, before, 'only one request can be in flight');
  f.behavior('ok'); f.ports.at(-1).onMessage.emit({ ok: true, receivedAt: 1787160000 });
  await queued; await flush();
  assert.equal(f.messages[before].type, 'probe', 'queued probe has priority');
  assert.equal(f.messages[before + 1].type, 'heartbeat');
  assert.equal(f.messages.length, before + 2, 'duplicate probe must not grow the queue');
  for (const status of ['booting', 'degraded', 'disabled_by_policy', 'privacy_consent_required', 'active']) {
    f.status(status); f.advance(); await f.client.request({ force: true });
    assert.equal(f.messages.at(-1).monitoringStatus, status, 'transport must preserve actual local status');
  }
  const other = fixture({ profile: '44444444-4444-4444-8444-444444444444' }); await flush();
  assert.notEqual(other.messages[0].profile, f.messages[0].profile);
  console.log('[Mac Guardian health] passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

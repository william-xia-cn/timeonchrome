'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../..');
const core = fs.readFileSync(path.join(root, 'extension/core/downtime.js'), 'utf8');
const source = fs.readFileSync(path.join(root, 'extension/product/downtime-enforcement.js'), 'utf8');
const { createDowntimeEnforcement, DOWNTIME_CHECK_ALARM, DOWNTIME_BOUNDARY_ALARM } = new Function(
  core.replace(/export (function|const) /g, '$1 ') + '\n' + source.replace(/^import .*;$/gm, '').replace(/export (function|const) /g, '$1 ')
  + '\nreturn { createDowntimeEnforcement, DOWNTIME_CHECK_ALARM, DOWNTIME_BOUNDARY_ALARM };')();

(async () => {
  let currentTime = Date.parse('2026-10-12T13:59:00Z');
  const policy = { schemaVersion: 1, enabled: true, windowsByWeekday: { monday: [{ start: '22:00', end: '07:00' }] },
    allowedWebsiteTypes: ['study'], allowedApplicationTypes: [] };
  let cfg = { enabled: true, downtimeConfig: policy };
  let enabled = true;
  const tabs = [ { id: 1, windowId: 9, url: 'https://rest.test' },
    { id: 2, windowId: 9, url: 'https://study.test' }, { id: 3, windowId: 9, url: 'chrome://settings' } ];
  const alarms = [], effects = [], listeners = {}, errors = [];
  let queryHook = () => {};
  let getHook = tab => tab;
  let queries = 0;
  const api = { alarms: { clear: async () => {}, create: async (name, opts) => alarms.push({ name, ...opts }),
    onAlarm: { addListener: cb => { listeners.alarm = cb; } } },
    storage: { onChanged: { addListener: cb => { listeners.storage = cb; } } },
    tabs: { query: async () => { queries++; queryHook(); return tabs; }, get: async id => getHook(tabs.find(t => t.id === id)) } };
  const runner = createDowntimeEnforcement({ api, getConfig: async () => cfg, getRecords: async () => [],
    classify: (_, __, input) => ({ classification: input.url.includes('study.test') ? 'study' : 'restricted' }),
    recheck: async (id, opts) => effects.push({ id, opts }), allowed: async () => enabled,
    configKey: 'guardian_config', now: () => currentTime, onError: code => errors.push(code) });
  runner.register();
  assert.equal(typeof listeners.alarm, 'function');
  assert.equal(typeof listeners.storage, 'function');
  await runner.start();
  assert.equal(effects.length, 0);
  assert(alarms.some(a => a.name === DOWNTIME_CHECK_ALARM && a.periodInMinutes === 1));
  assert(alarms.some(a => a.name === DOWNTIME_BOUNDARY_ALARM && a.when === Date.parse('2026-10-12T14:00:00Z')));
  currentTime += 60_000;
  await listeners.alarm({ name: DOWNTIME_BOUNDARY_ALARM });
  assert.equal(effects.length, 1);
  assert.equal(effects[0].id, 1);
  assert.equal(effects[0].opts.downtimeOnly, true);
  assert.equal(effects[0].opts.expectedUrl, 'https://rest.test');
  assert(alarms.some(a => a.when === Date.parse('2026-10-12T23:00:00Z')));
  effects.length = 0;
  getHook = tab => ({ ...tab, url: 'https://study.test' });
  await runner.refresh();
  assert.equal(effects.length, 0, 'navigation race must not block new page');
  getHook = tab => tab;
  queryHook = () => { cfg = { enabled: true, downtimeConfig: { ...policy, enabled: false } }; };
  await runner.refresh();
  assert.equal(effects.length, 0, 'disabled policy cannot use stale scan');
  queryHook = () => {};
  cfg = { enabled: true, downtimeConfig: policy };
  enabled = false;
  await runner.refresh();
  assert.equal(effects.length, 0, 'activation/monitoring disabled');
  enabled = true;
  await listeners.storage({ guardian_config: {} }, 'local');
  assert.equal(effects.length, 1);
  effects.length = 0;
  currentTime = Date.parse('2026-10-12T23:00:00Z');
  await runner.refresh();
  assert.equal(effects.length, 0, 'end boundary not blocked');
  currentTime = Date.parse('2026-10-12T14:00:00Z');
  const before = queries;
  const p = runner.refresh();
  assert.equal(runner.refresh(), p, 'one bounded in-flight loop');
  await p;
  assert(queries - before <= 2);
  cfg = { enabled: true, downtimeConfig: null };
  effects.length = 0;
  await runner.refresh();
  assert.equal(effects.length, 0, 'invalid config not interpreted as active');
  cfg = { enabled: true, downtimeConfig: policy };
  api.tabs.query = async () => { throw new Error('private data must not be logged'); };
  await runner.refresh();
  assert.deepEqual(errors, ['downtime_check_failed']);
  const background = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');
  assert(background.includes('downtimeEnforcement.register();'));
  assert(background.includes('downtimeEnforcement.start().catch'));
  assert(background.includes('options.expectedUrl'));
  console.log('Downtime enforcement: boundaries/lifecycle/config/race/exceptions/serialization/error passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

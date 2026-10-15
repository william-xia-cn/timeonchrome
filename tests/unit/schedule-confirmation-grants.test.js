'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../../extension/product/schedule-confirmation.js'), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/export (async function|function|const) /g, '$1 ');
const data = {}, identity = { cloud_profile_id: 'test-profile', cloud_device_id: 'test-device' };
const api = { storage: { session: { get: async key => ({ [key]: data[key] }) }, local: { get: async () => ({ ...identity }) } } };
const writes = [];
const moduleApi = new Function('chrome', 'budgetedSessionSet', source + '\nreturn { hasScheduleConfirmation, grantScheduleConfirmation, revokeScheduleConfirmation };')(
  api, async (items, options) => { Object.assign(data, items); writes.push(options); });
(async () => {
  const context = { tabId: 7, key: 'test-object-and-gap' };
  assert.equal(await moduleApi.hasScheduleConfirmation(context), false);
  await moduleApi.grantScheduleConfirmation(context);
  assert.equal(await moduleApi.hasScheduleConfirmation(context), true);
  assert.equal(await moduleApi.hasScheduleConfirmation({ ...context, tabId: 8 }), false);
  assert.equal(await moduleApi.hasScheduleConfirmation({ ...context, key: 'another-object-or-gap' }), false);
  identity.cloud_profile_id = 'another-test-profile';
  assert.equal(await moduleApi.hasScheduleConfirmation(context), false);
  identity.cloud_profile_id = 'test-profile';
  await moduleApi.revokeScheduleConfirmation(7);
  assert.equal(await moduleApi.hasScheduleConfirmation(context), false);
  for (let tabId = 0; tabId < 96; tabId++) await moduleApi.grantScheduleConfirmation({ tabId, key: 'bounded-test' });
  assert.equal(Object.keys(data.schedule_confirmation_grants_v1).length, 64);
  assert(writes.every(options => options.priority === 'critical' && options.source === 'schedule_confirmation'));
  console.log('Schedule grants: tab/object/gap/identity/revoke/budget/bounded PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });

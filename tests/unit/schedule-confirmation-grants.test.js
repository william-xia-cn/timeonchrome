'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../../extension/product/schedule-confirmation.js'), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/export (async function|function|const) /g, '$1 ');
const data = {}, identity = { cloud_profile_id: 'test-profile', cloud_device_id: 'test-device' };
const tabs = new Map();
const api = {
  storage: { session: { get: async key => ({ [key]: data[key] }) }, local: { get: async () => ({ ...identity }) } },
  runtime: { getURL: path => `chrome-extension://test-id/${path}` },
  tabs: {
    get: async id => tabs.get(id) || null,
    update: async (id, changes) => { tabs.set(id, { ...tabs.get(id), ...changes }); return tabs.get(id); },
  },
};
const writes = [];
const moduleApi = new Function('chrome', 'budgetedSessionSet', source + '\nreturn { hasScheduleConfirmation, readScheduleConfirmationGrant, grantScheduleConfirmation, revokeScheduleConfirmation, registerScheduleConfirmationWaiter, clearScheduleConfirmationWaiters, resumeScheduleConfirmationWaiter, releaseScheduleConfirmationWaiters };')(
  api, async (items, options) => { Object.assign(data, items); writes.push(options); });
(async () => {
  const context = { tabId: 7, host: 'example.test', mode: 'rest', key: 'test-object-and-gap' };
  assert.equal(await moduleApi.hasScheduleConfirmation(context), false);
  await moduleApi.grantScheduleConfirmation({ ...context, managedTargetId: 'managed-one' });
  assert.equal(await moduleApi.hasScheduleConfirmation(context), true);
  assert.equal((await moduleApi.readScheduleConfirmationGrant(context)).managedTargetId, 'managed-one');
  assert.equal(await moduleApi.hasScheduleConfirmation({ ...context, tabId: 8 }), true);
  assert.equal(await moduleApi.hasScheduleConfirmation({ ...context, key: 'another-object-or-gap' }), false);
  identity.cloud_profile_id = 'another-test-profile';
  assert.equal(await moduleApi.hasScheduleConfirmation(context), false);
  assert.equal(await moduleApi.readScheduleConfirmationGrant(context), null);
  identity.cloud_profile_id = 'test-profile';
  await moduleApi.revokeScheduleConfirmation(context);
  assert.equal(await moduleApi.hasScheduleConfirmation(context), false);
  for (let tabId = 0; tabId < 96; tabId++) await moduleApi.grantScheduleConfirmation({ tabId, key: `bounded-${tabId}` });
  assert.equal(Object.keys(data.schedule_confirmation_grants_v1).length, 64);

  const waiting = { ...context, tabId: 8 };
  const targetUrl = 'https://example.test/watch';
  assert.equal(await moduleApi.registerScheduleConfirmationWaiter(waiting, targetUrl), true);
  assert.equal(await moduleApi.registerScheduleConfirmationWaiter(waiting, 'https://other.test/'), false);
  tabs.set(8, { url: `chrome-extension://test-id/reminder.html?reason=rest_schedule_locked&sourceTabId=8&targetUrl=${encodeURIComponent(targetUrl)}&confirmationFailure=pending_elsewhere` });
  await moduleApi.releaseScheduleConfirmationWaiters(context);
  assert.equal(tabs.get(8).url, targetUrl);
  assert.equal(Object.keys(data.schedule_confirmation_waiters_v1).length, 0);

  tabs.set(8, { url: `chrome-extension://test-id/reminder.html?reason=rest_schedule_locked&sourceTabId=8&targetUrl=${encodeURIComponent(targetUrl)}&confirmationFailure=pending_elsewhere` });
  assert.equal(await moduleApi.resumeScheduleConfirmationWaiter(context, 8, targetUrl), true);
  assert.equal(tabs.get(8).url, targetUrl);
  assert.equal(await moduleApi.resumeScheduleConfirmationWaiter(context, 8, targetUrl), false);

  await moduleApi.registerScheduleConfirmationWaiter(waiting, targetUrl);
  tabs.set(8, { url: 'https://other.test/' });
  await moduleApi.releaseScheduleConfirmationWaiters(context);
  assert.equal(tabs.get(8).url, 'https://other.test/');
  await moduleApi.registerScheduleConfirmationWaiter(waiting, targetUrl);
  await moduleApi.clearScheduleConfirmationWaiters(context);
  assert.equal(Object.keys(data.schedule_confirmation_waiters_v1).length, 0);
  assert(writes.every(options => options.priority === 'critical' && options.source === 'schedule_confirmation'));
  console.log('Schedule grants: cross-tab/rule-gap/identity/revoke/waiters/budget/bounded PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });

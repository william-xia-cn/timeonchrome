import assert from 'node:assert/strict';
import { projectSharedQuotaDay, projectLegacySharedAccessPolicy, SHARED_ACCESS_SCHEMA_VERSION } from './dist/shared-access.js';

const date = '2026-10-02';
const allDay = [{ start: '00:00', end: '24:00' }];
const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const policy = {
  schemaVersion: SHARED_ACCESS_SCHEMA_VERSION, revision: 'policy-1', effectiveAtMs: 1, stage: 'shadow',
  dailyMinutes: Object.fromEntries(days.map(day => [day, { study: 60, composite: 30, rest: 60 }])),
  weeklyRestMinutes: 240,
  timeWindows: Object.fromEntries(days.map(day => [day, { study: allDay, composite: allDay, rest: allDay }])),
  autonomy: { restrictedEntryConfirmationRequired: true, dailyFirstReminderMinutes: 5,
    weeklyFirstReminderMinutes: 10, repeatReminderMinutes: 5, softReminderTimeoutAction: 'continue', visibleResponseDeadlineSeconds: 60 },
};
const projected = projectLegacySharedAccessPolicy({timeQuota:{daily:{friday:{studyMinutes:0,compositeMinutes:30,restMinutes:60}},
  weekly:{restMinutes:240}},timeWindows:{daily:{friday:{studyWindows:null,compositeWindows:[{start:'12:00',end:'13:00'}],restWindows:null}}},
  restConfig:{firstReminderMinutes:5,repeatReminderMinutes:10,weeklyFirstReminderMinutes:60},
  autonomyConfig:{restrictedEntryConfirmationRequired:false,softReminderTimeoutAction:'continue'}}, 9, 100);
assert.equal(projected.stage, 'legacy', 'projection cannot activate shared enforcement');
assert.equal(projected.revision, 'profile-config:9');
assert.equal(projected.dailyMinutes.friday.study, 0, 'explicit zero is not rewritten as unlimited');
assert.deepEqual(projected.timeWindows.friday.composite, [{start:'12:00',end:'13:00'}]);
assert.equal(projected.timeWindows.friday.study, null);
assert.equal(projected.autonomy.softReminderTimeoutAction, 'continue');
assert.equal(projectLegacySharedAccessPolicy({timeQuota:{weekly:{restMinutes:null}},weeklyRestQuota:120}, 1, 1).weeklyRestMinutes,
  null, 'explicit unlimited weekly Rest cannot revive a legacy limit');
const web = { schemaVersion: 1, source: 'web', sourceKey: 'browser-1', date, revision: 'web-1',
  statisticsRevision: 'web-stat-1', correctionRevision: 'web-correction-1', policyRevision: 'policy-1',
  settledAtMs: 1, complete: true, reasonCodes: [], bucketsMs: { study: 600000, composite: 600000, rest: 0 } };
const app = { schemaVersion: 1, source: 'application', sourceKey: 'machine-user-1', date, revision: 'app-1',
  statisticsRevision: 'app-stat-1', correctionRevision: 'app-correction-1', productAssociationVersion: 'products-1',
  policyRevision: 'policy-1', settledAtMs: 1, complete: true, reasonCodes: [],
  bucketsMs: { study: 0, composite: 0, rest: 0 },
  applicationClassesMs: { study: 600000, composite: 1200000, restrictedEntertainment: 0, unclassified: 600000, other: 300000 },
  chromeExcludedMs: 600000 };
const result = projectSharedQuotaDay(policy, date, [web, app]);
assert.equal(result.complete, true);
assert.deepEqual(result.usedMs, { study: 1200000, composite: 1800000, rest: 600000 });
assert.equal(result.borrowedRestMs, 600000);
assert.deepEqual(result.remainingMs, { study: 2400000, composite: 0, rest: 3000000 });
assert.deepEqual(projectSharedQuotaDay(policy, date, [app, web]), result, 'arrival order cannot alter quota');
assert.equal(projectSharedQuotaDay(policy, date, [web, app, app]).complete, false, 'duplicate scope is not added');
assert.deepEqual(projectSharedQuotaDay(policy, date, [web, app, app]).usedMs, result.usedMs);
assert.equal(projectSharedQuotaDay(policy, date, [web, { ...app, policyRevision: 'old' }]).complete, false);
assert.equal(projectSharedQuotaDay(policy, date, [web]).complete, false, 'missing application coverage is not zero');
assert.equal(projectSharedQuotaDay(policy, date, [app]).complete, false, 'missing web coverage is not zero');
assert.equal(projectSharedQuotaDay(policy, date, [web, { ...app, chromeExcludedMs: undefined }]).complete, false);
console.log('shared access contract: PASS');

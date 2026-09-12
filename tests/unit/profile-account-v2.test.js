// Run with: node tests/unit/profile-account-v2.test.js
'use strict';

const fs = require('fs');
const path = require('path');

function loadModule(file, names, injected = {}) {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  const injectedNames = Object.keys(injected);
  return new Function('__injected', `const { ${injectedNames.join(', ')} } = __injected;\n${code}\nreturn { ${names.join(', ')} };`)(injected);
}

const root = path.join(__dirname, '..', '..');
const device = loadModule(path.join(root, 'extension', 'core', 'device-account-v2.js'), [
  'canonicalDeviceAccountJson', 'hashDeviceAccountValue', 'validateDeviceAccountRows',
], { runStorageMutation: async () => { throw new Error('unused'); } });
const profile = loadModule(path.join(root, 'extension', 'core', 'profile-account-v2.js'), [
  'aggregateDeviceAccountRows', 'buildDeviceVersionVector', 'buildProfileDayAccount',
  'getBeijingWeekPeriod', 'summarizeWeekFromProfileDays', 'buildProfileWeekAccount',
], device);

function rows(date, domain, mode, quotaBucket, seconds, hour = '10') {
  const common = { channel: 'active', mode, durationSeconds: seconds, segmentsCount: 1, firstSeenAt: 10, lastSeenAt: 20 };
  return [
    { ...common, kind: 'daily_domain', periodKey: date, domain },
    { ...common, kind: 'hourly_domain', periodKey: `${date}T${hour}`, domain },
    { ...common, kind: 'daily_target', periodKey: date, targetKey: `fallback:domain:${domain}`, quotaBucket },
    { ...common, kind: 'hourly_target', periodKey: `${date}T${hour}`, targetKey: `fallback:domain:${domain}`, quotaBucket },
  ].sort((a, b) => device.canonicalDeviceAccountJson(a).localeCompare(device.canonicalDeviceAccountJson(b)));
}

function account(deviceId, date, accountRows, revision = 1, complete = true) {
  return {
    deviceId, date, rows: accountRows, manifestId: `${deviceId}-${revision}`, revision,
    statsHash: deviceId.padEnd(64, 'a').slice(0, 64), rawFactHash: deviceId.padEnd(64, 'b').slice(0, 64),
    rawFactCount: 1, complete, lossCount: complete ? 0 : 1,
    generatedAt: 1000 + revision, committedAt: 2000 + revision,
  };
}

let passed = 0;
function check(label, condition, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
  passed++;
}

(async () => {
  const date = '2026-09-14';
  const first = account('device-a', date, rows(date, 'a.test', 'study', 'study', 60));
  const second = account('device-b', date, rows(date, 'b.test', 'rest', 'rest', 90));
  const aggregate = profile.aggregateDeviceAccountRows([second, first], date);
  check('device time is summed without overlap deduction', aggregate.totalSeconds === 150);
  check('all four dimensions conserve the same total', Object.values(aggregate.totals).every((value) => value === 150));
  check('aggregate rows remain canonical', device.validateDeviceAccountRows(aggregate.rows, date).ok);

  const vector = profile.buildDeviceVersionVector([second, first]);
  check('version vector is device ordered', vector.map((entry) => entry.deviceId).join(',') === 'device-a,device-b');
  check('version vector retains exact revisions', vector[0].revision === 1 && vector[1].manifestId === 'device-b-1');

  const day = await profile.buildProfileDayAccount({ profileId: 'profile', date, generation: 3, manifests: [second, first] });
  check('day account stores exact device vector', day.deviceVersionVector.length === 2 && day.totalSeconds === 150);
  check('day total hash is deterministic', day.totalHash === (await profile.buildProfileDayAccount({ profileId: 'profile', date, generation: 3, manifests: [first, second] })).totalHash);
  const incomplete = await profile.buildProfileDayAccount({
    profileId: 'profile', date, generation: 4, manifests: [first, account('device-b', date, second.rows, 2, false)],
  });
  check('incomplete device propagates to profile day', incomplete.complete === false && incomplete.incompleteDevices[0] === 'device-b');

  const period = profile.getBeijingWeekPeriod(date);
  check('Monday begins its own Beijing week', period.weekStart === '2026-09-14' && period.weekEnd === '2026-09-20');
  const nextDate = '2026-09-15';
  const nextDay = await profile.buildProfileDayAccount({
    profileId: 'profile', date: nextDate, generation: 1,
    manifests: [account('device-a', nextDate, rows(nextDate, 'a.test', 'rest', 'rest', 30))],
  });
  const week = await profile.buildProfileWeekAccount({ profileId: 'profile', weekStart: '2026-09-14', generation: 2, dayAccounts: [day, nextDay] });
  check('week sums only dates inside requested week', week.profileTotal.totalSeconds === 180);
  check('week is derived from day version vector', week.dayVersionVector.length === 2);
  check('week keeps per-date device versions', week.deviceVersionVector.some((entry) => entry.date === nextDate));
  check('week quota buckets sum exactly', week.profileTotal.byQuotaBucket.reduce((sum, entry) => sum + entry.durationSeconds, 0) === 180);
  check('week total hash is present', /^[a-f0-9]{64}$/.test(week.totalHash));

  const sameBucketA = account('device-a', date, rows(date, 'same.test', 'rest', 'rest', 10));
  const sameBucketB = account('device-b', date, rows(date, 'same.test', 'rest', 'rest', 20));
  const noDedupe = profile.aggregateDeviceAccountRows([sameBucketA, sameBucketB], date);
  check('same domain on two devices is added rather than deduplicated', noDedupe.totalSeconds === 30);

  console.log(`[Profile Account V2] ${passed}/${passed} passed`);
})().catch((error) => { console.error(error); process.exit(1); });

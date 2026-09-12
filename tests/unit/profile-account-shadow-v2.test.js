// Run with: node tests/unit/profile-account-shadow-v2.test.js
'use strict';

const fs = require('fs');
const path = require('path');

function load(file, names, injected = {}) {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  return new Function('__injected', `const { ${Object.keys(injected).join(', ')} } = __injected;\n${code}\nreturn { ${names.join(', ')} };`)(injected);
}

const root = path.join(__dirname, '..', '..');
const device = load(path.join(root, 'extension', 'core', 'device-account-v2.js'), [
  'hashDeviceAccountValue',
], { runStorageMutation: async () => {} });
const state = {};
const runStorageMutation = async (task) => task({
  get: async (key) => ({ [key]: state[key] }),
  set: async (items) => Object.assign(state, items),
});
const shadow = load(path.join(root, 'extension', 'core', 'profile-account-shadow-v2.js'), [
  'PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY', 'validateProfileAccountSnapshotPages', 'storeProfileAccountShadowSnapshot',
], { ...device, runStorageMutation });

async function pages() {
  const accounts = [
    { deviceId: 'a', date: '2026-09-14', total: { totalSeconds: 60, byChannelMode: [{ channel: 'active', mode: 'rest', durationSeconds: 60 }], byQuotaBucket: [{ quotaBucket: 'rest', durationSeconds: 60 }] } },
    { deviceId: 'b', date: '2026-09-14', total: { totalSeconds: 40, byChannelMode: [{ channel: 'active', mode: 'study', durationSeconds: 40 }], byQuotaBucket: [{ quotaBucket: 'study', durationSeconds: 40 }] } },
  ];
  const payloads = [{ page: 0, deviceAccounts: [accounts[0]] }, { page: 1, deviceAccounts: [accounts[1]] }];
  const pageHashes = await Promise.all(payloads.map((payload) => device.hashDeviceAccountValue(payload)));
  const metadata = {
    schemaVersion: 2,
    period: { weekStart: '2026-09-14', weekEnd: '2026-09-20' },
    sourceGeneration: 3,
    asOf: 1000,
    dayVersionVector: [],
    deviceVersionVector: [],
    profileTotal: {
      totalSeconds: 100,
      byChannelMode: [
        { channel: 'active', mode: 'rest', durationSeconds: 60 },
        { channel: 'active', mode: 'study', durationSeconds: 40 },
      ],
      byQuotaBucket: [
        { quotaBucket: 'rest', durationSeconds: 60 },
        { quotaBucket: 'study', durationSeconds: 40 },
      ],
    },
    completeness: { complete: true, staleDevices: [], incompleteDevices: [] },
    totalHash: 'a'.repeat(64),
    pageCount: 2,
    pageHashes,
  };
  const snapshotHash = await device.hashDeviceAccountValue(metadata);
  return payloads.map((payload, index) => ({
    snapshotId: 'snapshot-1', snapshotHash, createdAt: 1, expiresAt: 9999999999999,
    ...metadata, page: index, deviceAccounts: payload.deviceAccounts, pageHash: pageHashes[index],
  }));
}

let passed = 0;
function check(label, condition) { if (!condition) throw new Error(label); passed++; }
async function rejects(label, task, code) {
  try { await task(); } catch (error) { check(label, error.message === code); return; }
  throw new Error(`${label}: did not reject`);
}

(async () => {
  const validPages = await pages();
  const snapshot = await shadow.validateProfileAccountSnapshotPages(validPages);
  check('all pages assemble into one verified snapshot', snapshot.deviceAccounts.length === 2 && snapshot.profileTotal.totalSeconds === 100);
  check('snapshot remains shadow-only schema', snapshot.schemaVersion === 2 && snapshot.snapshotId === 'snapshot-1');
  await rejects('missing page is rejected', () => shadow.validateProfileAccountSnapshotPages([validPages[0]]), 'PROFILE_ACCOUNT_SNAPSHOT_INCOMPLETE');
  const damaged = structuredClone(validPages); damaged[1].deviceAccounts[0].total.totalSeconds = 41;
  await rejects('damaged page hash is rejected', () => shadow.validateProfileAccountSnapshotPages(damaged), 'PROFILE_ACCOUNT_SNAPSHOT_PAGE_HASH_MISMATCH');
  const wrongTotal = structuredClone(validPages); wrongTotal[0].profileTotal.totalSeconds = 99; wrongTotal[1].profileTotal.totalSeconds = 99;
  await rejects('metadata mutation is rejected', () => shadow.validateProfileAccountSnapshotPages(wrongTotal), 'PROFILE_ACCOUNT_SNAPSHOT_HASH_MISMATCH');

  await shadow.storeProfileAccountShadowSnapshot(snapshot);
  check('verified snapshot is stored under isolated key', state[shadow.PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY].current.snapshotId === 'snapshot-1');
  const next = { ...snapshot, snapshotId: 'snapshot-2', snapshotHash: 'b'.repeat(64), asOf: 2000 };
  await shadow.storeProfileAccountShadowSnapshot(next);
  check('replacement keeps only compact previous summary', !('deviceAccounts' in state[shadow.PROFILE_ACCOUNT_V2_SHADOW_CACHE_KEY].previous));

  console.log(`[Profile Account Shadow V2] ${passed}/${passed} passed`);
})().catch((error) => { console.error(error); process.exit(1); });


// Run with: node tests/unit/device-account-v2.test.js

'use strict';

const fs = require('fs');
const path = require('path');

function loadModule(injected) {
  let code = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'device-account-v2.js'), 'utf8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  const names = [
    'DEVICE_ACCOUNT_V2_STATE_KEY', 'DEVICE_ACCOUNT_V2_MAX_CHUNK_ROWS',
    'canonicalDeviceAccountJson', 'hashDeviceAccountValue', 'buildDeviceAccountRows',
    'validateDeviceAccountRows', 'buildDeviceAccountSnapshot', 'splitDeviceAccountRows',
    'prepareDeviceAccountV2Upload', 'markDeviceAccountV2Manifest',
    'markDeviceAccountV2Committed', 'markDeviceAccountV2Published',
    'markDeviceAccountV2Failed', 'getPendingDeviceAccountV2Dates',
  ];
  return new Function('__injected', `const { runStorageMutation } = __injected;\n${code}\nreturn { ${names.join(', ')} };`)(injected);
}

function makeStorage() {
  const values = {};
  global.chrome = {
    storage: {
      local: {
        async get(keys) {
          if (keys == null) return { ...values };
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.filter((key) => Object.prototype.hasOwnProperty.call(values, key)).map((key) => [key, values[key]]));
        },
      },
    },
  };
  return {
    values,
    async runStorageMutation(task) {
      return task({
        get: global.chrome.storage.local.get,
        async set(items) { Object.assign(values, items); },
        async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete values[key]; },
      });
    },
  };
}

function makeSnapshot(total = 120) {
  const half = total / 2;
  const domainEntry = (seconds) => ({
    domain: 'example.com',
    rows: [{ channel: 'active', mode: 'rest', durationSeconds: seconds, segmentsCount: 1 }],
    firstSeenAt: 1000,
    lastSeenAt: 2000,
  });
  const targetEntry = (seconds) => ({
    targetKey: 'fallback:domain:example.com',
    fallbackDomain: 'example.com',
    isFallback: true,
    rows: [{ channel: 'active', mode: 'rest', quotaBucket: 'rest', durationSeconds: seconds, segmentsCount: 1 }],
    firstSeenAt: 1000,
    lastSeenAt: 2000,
  });
  return {
    date: '2026-09-12',
    capturedAt: 10000 + total,
    segmentPayloads: [
      { id: 'seg-a', contentHash: 'a'.repeat(64) },
      { id: 'seg-b', contentHash: 'b'.repeat(64) },
    ],
    compactedFactCount: 0,
    dailyPayload: { domains: [domainEntry(total)] },
    targetPayload: { targets: [targetEntry(total)] },
    hourlyPayloads: [
      { hourKey: '2026-09-12T10', domains: [domainEntry(half)] },
      { hourKey: '2026-09-12T11', domains: [domainEntry(half)] },
    ],
    hourlyTargetPayloads: [
      { hourKey: '2026-09-12T10', targets: [targetEntry(half)] },
      { hourKey: '2026-09-12T11', targets: [targetEntry(half)] },
    ],
  };
}

let passed = 0;
function check(label, condition, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
  passed++;
}

(async () => {
  const storage = makeStorage();
  const api = loadModule({ runStorageMutation: storage.runStorageMutation });
  const snapshot = makeSnapshot();
  const account = await api.buildDeviceAccountSnapshot(snapshot);
  check('four account dimensions are flattened', account.rowCount === 6, account.rowCount);
  check('daily and hourly domain totals are conserved', account.totals.daily_domain === 120 && account.totals.hourly_domain === 120);
  check('daily and hourly target totals are conserved', account.totals.daily_target === 120 && account.totals.hourly_target === 120);
  check('raw fact summary is retained', account.rawFactCount === 2 && /^[a-f0-9]{64}$/.test(account.rawFactHash));
  check('stats hash is deterministic', account.statsHash === (await api.buildDeviceAccountSnapshot(makeSnapshot())).statsHash);
  const compactedSnapshot = makeSnapshot();
  compactedSnapshot.compactedFactCount = 2;
  const incompleteAccount = await api.buildDeviceAccountSnapshot(compactedSnapshot);
  check('known compacted fact loss marks account incomplete', incompleteAccount.complete === false && incompleteAccount.lossCount === 2);

  const brokenRows = account.rows.filter((row) => row.kind !== 'hourly_target');
  check('non-conserved account is rejected', api.validateDeviceAccountRows(brokenRows, snapshot.date).code === 'DEVICE_ACCOUNT_NOT_CONSERVED');
  check('unexpected fields are rejected', api.validateDeviceAccountRows(
    account.rows.map((row, index) => index === 0 ? { ...row, title: 'must-not-persist' } : row), snapshot.date
  ).code === 'DEVICE_ACCOUNT_UNEXPECTED_FIELD');
  const duplicateBucket = [...account.rows, { ...account.rows[0], durationSeconds: account.rows[0].durationSeconds + 1 }]
    .sort((left, right) => api.canonicalDeviceAccountJson(left).localeCompare(api.canonicalDeviceAccountJson(right)));
  check('duplicate semantic buckets are rejected', api.validateDeviceAccountRows(duplicateBucket, snapshot.date).code === 'DEVICE_ACCOUNT_DUPLICATE_ROW');
  check('non-canonical row order is rejected', api.validateDeviceAccountRows([...account.rows].reverse(), snapshot.date).code === 'DEVICE_ACCOUNT_ROWS_NOT_SORTED');
  const manyRows = Array.from({ length: 401 }, (_, index) => ({ index }));
  const chunks = await api.splitDeviceAccountRows(manyRows);
  check('chunks never exceed 200 rows', chunks.length === 3 && chunks.every((chunk) => chunk.rows.length <= 200));
  check('each chunk has a deterministic hash', chunks.every((chunk) => /^[a-f0-9]{64}$/.test(chunk.chunkHash)));

  const first = await api.prepareDeviceAccountV2Upload(snapshot);
  check('first snapshot allocates revision one', first.manifest.revision === 1 && first.state.status === 'pending');
  const same = await api.prepareDeviceAccountV2Upload(makeSnapshot());
  check('same snapshot reuses revision', same.manifest.revision === 1 && same.manifest.manifestHash === first.manifest.manifestHash);
  check('manifest chunk count matches prepared chunks', same.manifest.chunkCount === same.chunks.length);
  check('manifest state accepts matching manifest id', await api.markDeviceAccountV2Manifest(snapshot.date, 1, first.manifest.manifestHash, 'manifest-1'));
  check('matching revision can commit', await api.markDeviceAccountV2Committed(snapshot.date, 1, first.manifest.manifestHash, 20000));
  check('matching revision can publish', await api.markDeviceAccountV2Published(snapshot.date, 1, first.manifest.manifestHash, 21000));
  const committed = await api.prepareDeviceAccountV2Upload(makeSnapshot());
  check('published identical snapshot is skipped', committed.skipped === true && committed.manifest.revision === 1);

  const changed = await api.prepareDeviceAccountV2Upload(makeSnapshot(122));
  check('changed account advances revision', changed.manifest.revision === 2 && changed.state.status === 'pending');
  check('old commit cannot overwrite new pending state', await api.markDeviceAccountV2Committed(snapshot.date, 1, first.manifest.manifestHash, 30000) === false);
  check('new revision remains pending', (await api.getPendingDeviceAccountV2Dates(0))[0] === snapshot.date);
  check('failure stores a short retryable state', await api.markDeviceAccountV2Failed(snapshot.date, 2, changed.manifest.manifestHash, 'http_503'));

  const prunedRaw = makeSnapshot(122);
  prunedRaw.segmentPayloads = [];
  const retry = await api.prepareDeviceAccountV2Upload(prunedRaw);
  check('retry reuses captured raw summary after local uploaded facts are pruned', retry.manifest.revision === 2 && retry.manifest.rawFactCount === 2);
  check('canonical JSON ignores object key order', api.canonicalDeviceAccountJson({ b: 2, a: 1 }) === api.canonicalDeviceAccountJson({ a: 1, b: 2 }));

  console.log(`[Device Account V2] ${passed}/${passed} passed`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

// Run with: node tests/unit/device-account-v2-worker.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function loadSharedModule() {
  let code = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'device-account-v2.js'), 'utf8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  return new Function('runStorageMutation', `${code}\nreturn {
    DEVICE_ACCOUNT_V2_MAX_CHUNK_ROWS, canonicalDeviceAccountJson, hashDeviceAccountValue,
    validateDeviceAccountRows
  };`)(async () => { throw new Error('storage not available in Worker test'); });
}

function makeDb() {
  const manifests = new Map();
  const chunks = new Map();
  const events = [];
  const capabilities = [];
  let failBatch = false;
  function statement(kind, args = []) {
    return {
      kind,
      args,
      bind(...next) { return statement(kind, next); },
      async first() {
        if (kind === 'manifest_exact') {
          return [...manifests.values()].find((row) => row.profile_id === args[0] && row.device_id === args[1] && row.date === args[2] && row.revision === args[3]) || null;
        }
        if (kind === 'manifest_latest_revision') {
          const revisions = [...manifests.values()].filter((row) => row.profile_id === args[0] && row.device_id === args[1] && row.date === args[2]).map((row) => row.revision);
          return { revision: revisions.length ? Math.max(...revisions) : null };
        }
        if (kind === 'manifest_by_id') {
          const row = manifests.get(args[0]);
          return row && row.profile_id === args[1] && row.device_id === args[2] ? { ...row } : null;
        }
        if (kind === 'chunk_hash') return chunks.get(`${args[0]}:${args[1]}`) || null;
        if (kind === 'status_latest') {
          return [...manifests.values()]
            .filter((row) => row.profile_id === args[0] && row.device_id === args[1] && row.date === args[2])
            .sort((a, b) => b.revision - a.revision)[0] || null;
        }
        if (kind === 'status_exact') {
          return [...manifests.values()].find((row) => row.profile_id === args[0] && row.device_id === args[1] && row.date === args[2] && row.revision === args[3]) || null;
        }
        throw new Error(`unexpected first: ${kind}`);
      },
      async all() {
        if (kind !== 'chunks_all') throw new Error(`unexpected all: ${kind}`);
        return {
          results: [...chunks.entries()]
            .filter(([key]) => key.startsWith(`${args[0]}:`))
            .map(([, row]) => ({ ...row }))
            .sort((a, b) => a.chunk_index - b.chunk_index),
        };
      },
      async run() {
        if (kind === 'capability_upsert') {
          capabilities.push({ capabilityVersion: args[2], extensionVersion: args[3] });
        } else if (kind === 'manifest_insert') {
          manifests.set(args[0], {
            id: args[0], profile_id: args[1], device_id: args[2], date: args[3], revision: args[4],
            generated_at: args[5], row_count: args[6], chunk_count: args[7], raw_fact_count: args[8],
            raw_fact_hash: args[9], stats_hash: args[10], complete: args[11], loss_count: args[12],
            manifest_hash: args[13], status: 'staging', created_at: args[14], updated_at: args[15], committed_at: null,
          });
        } else if (kind === 'chunk_insert') {
          chunks.set(`${args[0]}:${args[1]}`, {
            manifest_id: args[0], chunk_index: args[1], row_count: args[2], chunk_hash: args[3], payload_json: args[4], created_at: args[5],
          });
        } else if (kind === 'manifest_commit') {
          const row = manifests.get(args[2]);
          if (row && row.profile_id === args[3] && row.device_id === args[4] && row.status === 'staging') {
            row.status = 'committed'; row.committed_at = args[0]; row.updated_at = args[1];
          }
        } else if (kind === 'event_insert') {
          events.push({ id: args[0], manifestId: args[1], date: args[4], revision: args[5], createdAt: args[6] });
        } else if (kind !== 'event_prune') {
          throw new Error(`unexpected run: ${kind}`);
        }
        return { success: true };
      },
    };
  }
  return {
    manifests,
    chunks,
    events,
    capabilities,
    setFailBatch(value) { failBatch = value; },
    prepare(sql) {
      if (sql.includes('INSERT INTO device_account_capabilities_v2')) return statement('capability_upsert');
      if (sql.includes('WHERE profile_id = ? AND device_id = ? AND date = ? AND revision = ?') && sql.includes('manifest_hash, status')) return statement('manifest_exact');
      if (sql.includes('MAX(revision)')) return statement('manifest_latest_revision');
      if (sql.includes('INSERT INTO device_account_manifests_v2')) return statement('manifest_insert');
      if (sql.includes("SET status = 'committed'")) return statement('manifest_commit');
      if (sql.includes('WHERE id = ? AND profile_id = ? AND device_id = ?')) return statement('manifest_by_id');
      if (sql.includes('SELECT chunk_hash FROM device_account_chunks_v2')) return statement('chunk_hash');
      if (sql.includes('INSERT INTO device_account_chunks_v2')) return statement('chunk_insert');
      if (sql.includes('FROM device_account_chunks_v2 WHERE manifest_id')) return statement('chunks_all');
      if (sql.includes('INSERT INTO device_account_sync_events_v2')) return statement('event_insert');
      if (sql.includes('DELETE FROM device_account_sync_events_v2')) return statement('event_prune');
      if (sql.includes('ORDER BY revision DESC LIMIT 1')) return statement('status_latest');
      if (sql.includes('AND revision = ?')) return statement('status_exact');
      throw new Error(`unexpected SQL: ${sql.replace(/\s+/g, ' ').slice(0, 130)}`);
    },
    async batch(statements) {
      if (failBatch) throw new Error('simulated transaction failure');
      const manifestSnapshot = new Map([...manifests].map(([key, value]) => [key, { ...value }]));
      const eventLength = events.length;
      try {
        for (const item of statements) await item.run();
      } catch (error) {
        manifests.clear(); for (const [key, value] of manifestSnapshot) manifests.set(key, value);
        events.length = eventLength;
        throw error;
      }
      return statements.map(() => ({ success: true }));
    },
  };
}

async function loadRouter(shared) {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'deviceAccountsV2.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const routeModule = { exports: {} };
  const routeRequire = (id) => {
    if (id === '../db/middleware') return {
      json: (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
    };
    if (id === './deviceIdentity') return {
      verifyDeviceTokenFromRequest: async () => ({ profileId: 'profile-test', deviceId: 'device-test', unbound: false }),
      deviceUnboundResponse: () => new Response('{}', { status: 403 }),
    };
    if (id === '../../../extension/core/device-account-v2.js') return shared;
    if (id === '../services/profileAccountsV2') return {
      getDeviceAccountPublishedRevision: async () => null,
      publishCommittedDeviceAccountV2: async () => ({ published: false, publishedRevision: null }),
    };
    if (id === '../services/accountReconciliationV2') return {
      reconcileDeviceAccountV2: async () => ({ status: 'pending_raw', checkedAt: Date.now() }),
    };
    if (id === './profileAccountsV2') return {
      handleDeviceProfileAccountSnapshotV2: async () => new Response('{}', { status: 200 }),
    };
    throw new Error(`unexpected require: ${id}`);
  };
  new Function('require', 'module', 'exports', compiled)(routeRequire, routeModule, routeModule.exports);
  return routeModule.exports.deviceAccountsV2Router;
}

function makeRows(total = 60) {
  const base = { channel: 'active', mode: 'rest', durationSeconds: total, segmentsCount: 1, firstSeenAt: 1, lastSeenAt: 2 };
  return [
    { ...base, kind: 'daily_domain', periodKey: '2026-09-12', domain: 'example.com' },
    { ...base, kind: 'hourly_domain', periodKey: '2026-09-12T10', domain: 'example.com' },
    { ...base, kind: 'daily_target', periodKey: '2026-09-12', targetKey: 'fallback:domain:example.com', quotaBucket: 'rest' },
    { ...base, kind: 'hourly_target', periodKey: '2026-09-12T10', targetKey: 'fallback:domain:example.com', quotaBucket: 'rest' },
  ];
}

function sortRows(shared, rows) {
  return [...rows].sort((left, right) => shared.canonicalDeviceAccountJson(left).localeCompare(shared.canonicalDeviceAccountJson(right)));
}

async function makeManifest(shared, rows, revision = 1, date = '2026-09-12') {
  const base = {
    schemaVersion: 2, date, revision, generatedAt: 10000 + revision, rowCount: rows.length,
    chunkCount: Math.ceil(rows.length / 200), rawFactCount: 1, rawFactHash: 'a'.repeat(64),
    statsHash: await shared.hashDeviceAccountValue(rows), complete: true, lossCount: 0,
  };
  return { ...base, manifestHash: await shared.hashDeviceAccountValue(base) };
}

async function call(router, db, method, route, body = undefined) {
  const response = await router.handle(new Request(`https://worker.test${route}`, {
    method,
    headers: { authorization: 'Bearer test', 'content-type': 'application/json', 'X-TimeOnChrome-Version': '1.7.31' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), { DB: db });
  return { response, body: await response.json() };
}

let passed = 0;
function check(label, condition, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
  passed++;
}

(async () => {
  const shared = loadSharedModule();
  const router = await loadRouter(shared);
  const db = makeDb();
  const rows = sortRows(shared, makeRows());
  const manifest = await makeManifest(shared, rows);
  const created = await call(router, db, 'POST', '/device/accounts/v2/manifests', manifest);
  check('manifest is staged', created.response.status === 200 && created.body.status === 'staging', JSON.stringify(created.body));
  check('1.7.31 request records V2 device capability', db.capabilities.some((item) => item.capabilityVersion === 2 && item.extensionVersion === '1.7.31'));
  const manifestId = created.body.manifestId;
  const duplicate = await call(router, db, 'POST', '/device/accounts/v2/manifests', manifest);
  check('same revision and hash is idempotent', duplicate.body.idempotent === true && duplicate.body.manifestId === manifestId);

  const conflictBase = { ...manifest, statsHash: 'b'.repeat(64) };
  delete conflictBase.manifestHash;
  conflictBase.manifestHash = await shared.hashDeviceAccountValue({ ...conflictBase });
  const conflict = await call(router, db, 'POST', '/device/accounts/v2/manifests', conflictBase);
  check('same revision with different manifest conflicts', conflict.response.status === 409 && conflict.body.code === 'DEVICE_ACCOUNT_REVISION_CONFLICT', JSON.stringify(conflict.body));

  const missing = await call(router, db, 'POST', `/device/accounts/v2/manifests/${manifestId}/commit`, {});
  check('missing chunks cannot commit', missing.response.status === 409 && missing.body.code === 'DEVICE_ACCOUNT_INCOMPLETE_CHUNKS');
  const chunkHash = await shared.hashDeviceAccountValue(rows);
  const uploaded = await call(router, db, 'PUT', `/device/accounts/v2/manifests/${manifestId}/chunks/0`, { rowCount: rows.length, chunkHash, rows });
  check('valid chunk is accepted', uploaded.response.status === 200 && uploaded.body.idempotent === false);
  const duplicateChunk = await call(router, db, 'PUT', `/device/accounts/v2/manifests/${manifestId}/chunks/0`, { rowCount: rows.length, chunkHash, rows });
  check('same chunk is idempotent', duplicateChunk.body.idempotent === true);
  const changedChunkRows = sortRows(shared, rows.map((row, index) => index === 0 ? { ...row, durationSeconds: row.durationSeconds + 1 } : row));
  const changedChunkHash = await shared.hashDeviceAccountValue(changedChunkRows);
  const chunkConflict = await call(router, db, 'PUT', `/device/accounts/v2/manifests/${manifestId}/chunks/0`, { rowCount: changedChunkRows.length, chunkHash: changedChunkHash, rows: changedChunkRows });
  check('same chunk index with different content conflicts', chunkConflict.response.status === 409 && chunkConflict.body.code === 'DEVICE_ACCOUNT_CHUNK_CONFLICT');
  const committed = await call(router, db, 'POST', `/device/accounts/v2/manifests/${manifestId}/commit`, {});
  check('complete conserved account commits', committed.response.status === 200 && committed.body.status === 'committed', JSON.stringify(committed.body));
  check('commit writes one bounded event', db.events.length === 1);
  const recommit = await call(router, db, 'POST', `/device/accounts/v2/manifests/${manifestId}/commit`, {});
  check('committed account retry is idempotent', recommit.body.idempotent === true);
  const status = await call(router, db, 'GET', '/device/accounts/v2/status?date=2026-09-12&revision=1');
  check('status exposes committed hash without payload', status.body.status === 'committed' && status.body.statsHash === manifest.statsHash && !('rows' in status.body));

  const newerRows = sortRows(shared, makeRows(61));
  const newer = await makeManifest(shared, newerRows, 2, '2026-09-13');
  const newerCreated = await call(router, db, 'POST', '/device/accounts/v2/manifests', newer);
  check('newer revision can stage', newerCreated.body.status === 'staging');
  const stale = await makeManifest(shared, rows, 1, '2026-09-13');
  const staleResult = await call(router, db, 'POST', '/device/accounts/v2/manifests', stale);
  check('older revision cannot stage after newer revision', staleResult.response.status === 409 && staleResult.body.code === 'DEVICE_ACCOUNT_STALE_REVISION');

  const multiRows = [];
  for (let index = 0; index < 51; index++) {
    const base = { channel: 'active', mode: 'rest', durationSeconds: 1, segmentsCount: 1, firstSeenAt: index + 1, lastSeenAt: index + 2 };
    multiRows.push(
      { ...base, kind: 'daily_domain', periodKey: '2026-09-16', domain: `d${index}.example` },
      { ...base, kind: 'hourly_domain', periodKey: '2026-09-16T10', domain: `d${index}.example` },
      { ...base, kind: 'daily_target', periodKey: '2026-09-16', targetKey: `target-${index}`, quotaBucket: 'rest' },
      { ...base, kind: 'hourly_target', periodKey: '2026-09-16T10', targetKey: `target-${index}`, quotaBucket: 'rest' },
    );
  }
  const sortedMultiRows = sortRows(shared, multiRows);
  const multiManifest = await makeManifest(shared, sortedMultiRows, 1, '2026-09-16');
  const multiCreated = await call(router, db, 'POST', '/device/accounts/v2/manifests', multiManifest);
  const multiChunks = [sortedMultiRows.slice(0, 200), sortedMultiRows.slice(200)];
  for (const index of [1, 0]) {
    const rowsForChunk = multiChunks[index];
    const hash = await shared.hashDeviceAccountValue(rowsForChunk);
    const response = await call(router, db, 'PUT', `/device/accounts/v2/manifests/${multiCreated.body.manifestId}/chunks/${index}`, { rowCount: rowsForChunk.length, chunkHash: hash, rows: rowsForChunk });
    check(`out-of-order chunk ${index} is accepted`, response.response.status === 200);
  }
  const multiCommitted = await call(router, db, 'POST', `/device/accounts/v2/manifests/${multiCreated.body.manifestId}/commit`, {});
  check('out-of-order arrival commits only after all chunks exist', multiCommitted.response.status === 200 && multiCommitted.body.totalSeconds === 51, JSON.stringify(multiCommitted.body));

  const zeroManifest = await makeManifest(shared, [], 1, '2026-09-17');
  const zeroCreated = await call(router, db, 'POST', '/device/accounts/v2/manifests', zeroManifest);
  const zeroCommitted = await call(router, db, 'POST', `/device/accounts/v2/manifests/${zeroCreated.body.manifestId}/commit`, {});
  check('zero-row diagnostic account commits without synthetic stats rows', zeroCommitted.response.status === 200 && zeroCommitted.body.totalSeconds === 0);

  const badRows = rows.filter((row) => row.kind !== 'hourly_target');
  const datedBadRows = sortRows(shared, badRows.map((row) => ({ ...row, periodKey: row.periodKey.replace('2026-09-12', '2026-09-14') })));
  const datedBadManifest = await makeManifest(shared, datedBadRows, 1, '2026-09-14');
  const datedBadCreated = await call(router, db, 'POST', '/device/accounts/v2/manifests', datedBadManifest);
  const datedBadHash = await shared.hashDeviceAccountValue(datedBadRows);
  await call(router, db, 'PUT', `/device/accounts/v2/manifests/${datedBadCreated.body.manifestId}/chunks/0`, { rowCount: datedBadRows.length, chunkHash: datedBadHash, rows: datedBadRows });
  const notConserved = await call(router, db, 'POST', `/device/accounts/v2/manifests/${datedBadCreated.body.manifestId}/commit`, {});
  check('non-conserved account cannot commit', notConserved.response.status === 409 && notConserved.body.code === 'DEVICE_ACCOUNT_NOT_CONSERVED', JSON.stringify(notConserved.body));

  const txRows = sortRows(shared, makeRows().map((row) => ({ ...row, periodKey: row.periodKey.replace('2026-09-12', '2026-09-15') })));
  const txManifest = await makeManifest(shared, txRows, 1, '2026-09-15');
  const txCreated = await call(router, db, 'POST', '/device/accounts/v2/manifests', txManifest);
  const txHash = await shared.hashDeviceAccountValue(txRows);
  await call(router, db, 'PUT', `/device/accounts/v2/manifests/${txCreated.body.manifestId}/chunks/0`, { rowCount: txRows.length, chunkHash: txHash, rows: txRows });
  db.setFailBatch(true);
  const txFailed = await call(router, db, 'POST', `/device/accounts/v2/manifests/${txCreated.body.manifestId}/commit`, {});
  check('transaction failure is reported', txFailed.response.status === 500 && txFailed.body.code === 'DEVICE_ACCOUNT_V2_FAILED');
  check('transaction failure leaves manifest staging', db.manifests.get(txCreated.body.manifestId).status === 'staging');

  const migration = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'migrations', '023_device_accounts_v2.sql'), 'utf8');
  check('migration creates only isolated V2 tables', migration.includes('device_account_manifests_v2') && migration.includes('device_account_chunks_v2') && !/\b(?:ALTER|DROP)\s+TABLE\b/i.test(migration));
  const workerIndex = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'index.ts'), 'utf8');
  check('Worker index routes the isolated V2 namespace', workerIndex.includes("path.startsWith('/device/accounts/v2/')") && workerIndex.includes('deviceAccountsV2Router'));
  const existingStats = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'stats.ts'), 'utf8');
  check('V1 stats route does not read or write V2 device accounts', !existingStats.includes('device_account_manifests_v2'));
  const existingQuota = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'device.ts'), 'utf8');
  check('current quota route does not consume V2 device accounts', !existingQuota.includes('device_account_manifests_v2'));

  console.log(`[Device Account V2 Worker] ${passed}/${passed} passed`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

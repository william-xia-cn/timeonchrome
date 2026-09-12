// Run with: node tests/unit/profile-account-v2-publication.test.js
'use strict';

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function loadJs(file, names, injected = {}) {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  return new Function('__injected', `const { ${Object.keys(injected).join(', ')} } = __injected;\n${code}\nreturn { ${names.join(', ')} };`)(injected);
}

const root = path.join(__dirname, '..', '..');
const device = loadJs(path.join(root, 'extension', 'core', 'device-account-v2.js'), [
  'canonicalDeviceAccountJson', 'hashDeviceAccountValue', 'splitDeviceAccountRows', 'validateDeviceAccountRows',
], { runStorageMutation: async () => {} });
const profile = loadJs(path.join(root, 'extension', 'core', 'profile-account-v2.js'), [
  'buildProfileDayAccount', 'buildProfileWeekAccount', 'getBeijingWeekPeriod',
], device);

function loadService() {
  const source = fs.readFileSync(path.join(root, 'workers', 'src', 'services', 'profileAccountsV2.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const requireFn = (id) => {
    if (id === '../../../extension/core/device-account-v2.js') return device;
    if (id === '../../../extension/core/profile-account-v2.js') return profile;
    if (id === '../db/middleware') return {};
    throw new Error(`unexpected require ${id}`);
  };
  new Function('require', 'module', 'exports', compiled)(requireFn, module, module.exports);
  return module.exports;
}

function makeRows(date, domain, seconds) {
  const common = { channel: 'active', mode: 'rest', durationSeconds: seconds, segmentsCount: 1, firstSeenAt: 1, lastSeenAt: 2 };
  return [
    { ...common, kind: 'daily_domain', periodKey: date, domain },
    { ...common, kind: 'hourly_domain', periodKey: `${date}T10`, domain },
    { ...common, kind: 'daily_target', periodKey: date, targetKey: `fallback:domain:${domain}`, quotaBucket: 'rest' },
    { ...common, kind: 'hourly_target', periodKey: `${date}T10`, targetKey: `fallback:domain:${domain}`, quotaBucket: 'rest' },
  ].sort((a, b) => device.canonicalDeviceAccountJson(a).localeCompare(device.canonicalDeviceAccountJson(b)));
}

async function manifest(deviceId, date, revision, domain, seconds) {
  const rows = makeRows(date, domain, seconds);
  return {
    id: `${deviceId}-${revision}`, profile_id: 'profile', device_id: deviceId, date, revision,
    generated_at: 1000 + revision, row_count: rows.length, chunk_count: 1, raw_fact_count: 1,
    raw_fact_hash: await device.hashDeviceAccountValue([{ id: `${deviceId}-seg`, contentHash: 'a'.repeat(64) }]),
    stats_hash: await device.hashDeviceAccountValue(rows), complete: 1, loss_count: 0,
    status: 'committed', committed_at: 2000 + revision, rows,
  };
}

function makeDb(manifests) {
  const state = {
    manifests: new Map(manifests.map((row) => [row.id, row])), deviceHeads: new Map(),
    dayGenerations: new Map(), dayChunks: new Map(), dayHeads: new Map(), weekGenerations: new Map(), weekHeads: new Map(),
    failBatch: false,
  };
  function stmt(kind, args = []) {
    return {
      bind(...next) { return stmt(kind, next); },
      async first() {
        if (kind === 'manifest') return state.manifests.get(args[0]) || null;
        if (kind === 'publishedHead') return state.deviceHeads.get(`${args[0]}|${args[1]}|${args[2]}`) || null;
        if (kind === 'dayHeadGeneration') return state.dayHeads.get(`${args[0]}|${args[1]}`) || null;
        if (kind === 'weekHeadGeneration') return state.weekHeads.get(`${args[0]}|${args[1]}`) || null;
        if (kind === 'dayGeneration') return state.dayGenerations.get(args[0]) || null;
        if (kind === 'weekGeneration') return state.weekGenerations.get(args[0]) || null;
        throw new Error(`unexpected first ${kind}`);
      },
      async all() {
        if (kind === 'chunks') {
          const row = state.manifests.get(args[0]);
          return { results: row ? [{ chunk_index: 0, row_count: row.rows.length, chunk_hash: row.stats_hash, payload_json: device.canonicalDeviceAccountJson(row.rows) }] : [] };
        }
        if (kind === 'dayChunks') return { results: state.dayChunks.get(args[0]) || [] };
        if (kind === 'deviceHeadsDate') return { results: [...state.deviceHeads.values()].filter((row) => row.profile_id === args[0] && row.date === args[1]) };
        if (kind === 'dayHeadsWeek') return { results: [...state.dayHeads.values()].filter((row) => row.profile_id === args[0] && row.date >= args[1] && row.date <= args[2]) };
        if (kind === 'manifestIdsWeek') return { results: [...state.deviceHeads.values()].filter((row) => row.profile_id === args[0] && row.date >= args[1] && row.date <= args[2]).map((row) => ({ manifest_id: row.manifest_id })) };
        throw new Error(`unexpected all ${kind}`);
      },
      async run() {
        if (kind === 'insertDay') state.dayGenerations.set(args[0], { id: args[0], profile_id: args[1], date: args[2], week_start: args[3], generation: args[4], as_of: args[5], device_version_vector_json: args[7], row_count: args[8], chunk_count: args[9], rows_hash: args[10], total_seconds: args[11], total_hash: args[12], complete: args[13], incomplete_devices_json: args[14], created_at: args[15] });
        else if (kind === 'insertDayChunk') {
          const rows = state.dayChunks.get(args[0]) || [];
          rows.push({ chunk_index: args[1], row_count: args[2], chunk_hash: args[3], payload_json: args[4] });
          state.dayChunks.set(args[0], rows);
        }
        else if (kind === 'insertWeek') state.weekGenerations.set(args[0], { id: args[0], profile_id: args[1], week_start: args[2], week_end: args[3], generation: args[4], as_of: args[5], day_version_vector_json: args[6], device_version_vector_json: args[7], profile_total_json: args[8], total_hash: args[9], complete: args[10], incomplete_devices_json: args[11], created_at: args[12] });
        else if (kind === 'upsertDeviceHead') state.deviceHeads.set(`${args[0]}|${args[1]}|${args[2]}`, { profile_id: args[0], device_id: args[1], date: args[2], manifest_id: args[3], revision: args[4], published_at: args[11] });
        else if (kind === 'upsertDayHead') state.dayHeads.set(`${args[0]}|${args[1]}`, { profile_id: args[0], date: args[1], generation_id: args[2], generation: args[3] });
        else if (kind === 'upsertWeekHead') state.weekHeads.set(`${args[0]}|${args[1]}`, { profile_id: args[0], week_start: args[1], generation_id: args[2], generation: args[3] });
        return { success: true };
      },
    };
  }
  const db = {
    state,
    prepare(sql) {
      if (sql.includes('FROM device_account_manifests_v2 WHERE id')) return stmt('manifest');
      if (sql.includes('FROM device_account_chunks_v2')) return stmt('chunks');
      if (sql.includes('SELECT revision, manifest_id, published_at')) return stmt('publishedHead');
      if (sql.includes('SELECT device_id, manifest_id, revision')) return stmt('deviceHeadsDate');
      if (sql.includes('SELECT generation FROM profile_account_day_heads_v2')) return stmt('dayHeadGeneration');
      if (sql.includes('SELECT generation FROM profile_account_week_heads_v2')) return stmt('weekHeadGeneration');
      if (sql.includes('SELECT date, generation_id FROM profile_account_day_heads_v2')) return stmt('dayHeadsWeek');
      if (sql.includes('FROM profile_account_day_generations_v2 WHERE id')) return stmt('dayGeneration');
      if (sql.includes('FROM profile_account_day_chunks_v2')) return stmt('dayChunks');
      if (sql.includes('FROM profile_account_week_generations_v2 WHERE id')) return stmt('weekGeneration');
      if (sql.includes('SELECT manifest_id FROM device_account_heads_v2')) return stmt('manifestIdsWeek');
      if (sql.includes('INSERT INTO profile_account_day_generations_v2')) return stmt('insertDay');
      if (sql.includes('INSERT INTO profile_account_day_chunks_v2')) return stmt('insertDayChunk');
      if (sql.includes('INSERT INTO profile_account_week_generations_v2')) return stmt('insertWeek');
      if (sql.includes('INSERT INTO device_account_heads_v2')) return stmt('upsertDeviceHead');
      if (sql.includes('INSERT INTO profile_account_day_heads_v2')) return stmt('upsertDayHead');
      if (sql.includes('INSERT INTO profile_account_week_heads_v2')) return stmt('upsertWeekHead');
      if (sql.includes('profile_account_publication_events_v2')) return stmt('event');
      throw new Error(`unexpected SQL ${sql.replace(/\s+/g, ' ').slice(0, 120)}`);
    },
    async batch(statements) {
      if (state.failBatch) throw new Error('transaction failed');
      for (const statement of statements) await statement.run();
      return statements.map(() => ({ success: true }));
    },
  };
  return db;
}

let passed = 0;
function check(label, condition, detail = '') { if (!condition) throw new Error(`${label}: ${detail}`); passed++; }

(async () => {
  const service = loadService();
  const first = await manifest('device-a', '2026-09-14', 1, 'a.test', 60);
  const second = await manifest('device-b', '2026-09-14', 1, 'b.test', 90);
  const db = makeDb([first, second]);
  const firstPublished = await service.publishCommittedDeviceAccountV2({ DB: db }, first.id, 'profile', 'device-a');
  check('first device publishes day and week generation one', firstPublished.dayGeneration === 1 && firstPublished.weekGeneration === 1);
  const secondPublished = await service.publishCommittedDeviceAccountV2({ DB: db }, second.id, 'profile', 'device-b');
  check('second device advances both generations', secondPublished.dayGeneration === 2 && secondPublished.weekGeneration === 2);
  const dayHead = db.state.dayHeads.get('profile|2026-09-14');
  const day = db.state.dayGenerations.get(dayHead.generation_id);
  check('published day total is sum of both devices', Number(day.total_seconds) === 150, JSON.stringify(day));
  check('published day rows are stored in bounded chunks', db.state.dayChunks.get(dayHead.generation_id).every((chunk) => chunk.row_count <= 200));
  const weekHead = db.state.weekHeads.get('profile|2026-09-14');
  const week = db.state.weekGenerations.get(weekHead.generation_id);
  check('published week total derives from day total', JSON.parse(week.profile_total_json).totalSeconds === 150);
  check('device head vector retains both devices', db.state.deviceHeads.size === 2);

  const beforeDayHead = { ...dayHead };
  const third = await manifest('device-c', '2026-09-14', 1, 'c.test', 30);
  db.state.manifests.set(third.id, third);
  db.state.failBatch = true;
  let failed = false;
  try { await service.publishCommittedDeviceAccountV2({ DB: db }, third.id, 'profile', 'device-c'); } catch (_) { failed = true; }
  check('transaction failure is surfaced', failed);
  check('transaction failure leaves previous day head readable', JSON.stringify(db.state.dayHeads.get('profile|2026-09-14')) === JSON.stringify(beforeDayHead));
  check('transaction failure does not publish candidate device head', !db.state.deviceHeads.has('profile|device-c|2026-09-14'));

  console.log(`[Profile Account V2 Publication] ${passed}/${passed} passed`);
})().catch((error) => { console.error(error); process.exit(1); });

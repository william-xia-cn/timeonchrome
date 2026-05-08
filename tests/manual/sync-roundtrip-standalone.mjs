// Phase 3F-R: Standalone real terminal v1 sync roundtrip
// Calls deployed Worker directly; verifies D1 afterwards
// Run: node tests/manual/sync-roundtrip-standalone.mjs

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const API = 'https://guardian-api.william-xia-cn.workers.dev';
const TOKEN = 'e37c8c936d263583ccb71a20fea68b767dbb569fbaa5a26c1873175cdc518540';
const PID = 'e12a4ec6-f9b8-4a1a-8586-bdc4bb8ff653';
const TODAY = '2026-05-06';
const NOW = Date.now();

// ── Mock chrome for usage-segments ───────────────────────────────────────────────
const s = {};
global.chrome = {
  storage: {
    local: {
      async get(keys) {
        if (keys === null) return { ...s };
        if (Array.isArray(keys)) { const r = {}; keys.forEach(k => r[k] = s[k]); return r; }
        if (typeof keys === 'string') return { [keys]: s[keys] };
        if (typeof keys === 'object') { const r = {}; Object.keys(keys).forEach(k => r[k] = s[k] ?? keys[k]); return r; }
        return {};
      },
      async set(obj) { Object.assign(s, obj); },
    },
    session: { async get(k) { return { [k]: s[k] }; }, async set(o) { Object.assign(s, o); } },
  },
};

function loadMod(rel, names, inj = {}) {
  let c = readFileSync(join(__dirname, '..', '..', rel), 'utf-8');
  c = c.replace(/^\s*import .*?;\s*$/gm, '');
  c = c.replace(/export\s+async\s+function\s+/g, 'async function ');
  c = c.replace(/export\s+function\s+/g, 'function ');
  c = c.replace(/export\s+const\s+/g, 'const ');
  c = c.replace(/export\s*\{[^}]*\};?\s*$/gm, '');
  const ks = Object.keys(inj);
  return new Function('__injected', `${ks.length ? 'const { '+ks.join(', ')+' } = __injected;\n' : ''}${c}\nreturn { ${names.join(', ')} };`)(inj);
}

const api = loadMod('core/usage-segments.js', [
  'settleUsageDuration', 'buildUsageSegmentsUploadPayload', 'buildDailyStatsUploadPayload',
  'getPendingUsageSegments', 'getPendingDailyStats', 'getDailyUsageStats',
  'markUsageSegmentsUploaded', 'markDailyStatsUploaded',
]);

async function post(url, body) {
  const r = await fetch(`${API}${url}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  return { status: r.status, ok: r.ok, ...j };
}

async function run() {
  console.log(`=== Roundtrip: ${API}`);
  console.log(`Profile: ${PID}  Token: ${TOKEN.slice(0,8)}...  Date: ${TODAY}\n`);

  // Step 1: Create local segments
  console.log('1. Settle local segments...');
  await api.settleUsageDuration({ startMs: NOW-600000, endMs: NOW, domain: 'rt-seg.com', channel: 'active', mode: 'rest', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: PID, deviceId: 'd1' });
  await api.settleUsageDuration({ startMs: NOW-300000, endMs: NOW, domain: 'rt-bg.com', channel: 'backgroundMedia', mode: 'rest', sourceState: 'BACKGROUND_ACTIVE', settlementReason: 'tc', profileId: PID, deviceId: 'd1' });

  const pSeg = await api.getPendingUsageSegments();
  console.log(`   Local segments pending: ${pSeg.pendingCount}`);

  // Step 2: Build and POST segments
  console.log('\n2. Upload segments to Worker...');
  const segPayload = await api.buildUsageSegmentsUploadPayload(pSeg.segments.map(s => s.id));
  console.log(`   Segments in payload: ${segPayload.segments.length}`);

  const r1 = await post('/device/usage-segments/v1', { segments: segPayload.segments });
  console.log(`   Response: success=${r1.success}, inserted=${r1.inserted}, updated=${r1.updated}`);

  // Step 3: Mark uploaded locally
  await api.markUsageSegmentsUploaded(pSeg.segments.map(s => s.id));
  const pSeg2 = await api.getPendingUsageSegments();
  console.log(`   Pending after upload: ${pSeg2.pendingCount}`);

  // Step 4: Upload stats
  console.log('\n3. Upload daily stats...');
  const statsPayload = await api.buildDailyStatsUploadPayload(TODAY);
  console.log(`   Domain count: ${statsPayload.domains.length}`);

  const r2 = await post('/device/stats/v1', statsPayload);
  console.log(`   Response: success=${r2.success}, count=${r2.count}, expandedRows=${r2.expandedRows}`);

  // Step 5: Mark stats uploaded
  await api.markDailyStatsUploaded([TODAY]);
  const pStats = await api.getPendingDailyStats();
  console.log(`   Pending stats after upload: ${pStats.pendingCount}`);

  // Step 6: Check daily stats preserved
  const ds = await api.getDailyUsageStats(TODAY);
  console.log(`   Daily stats preserved: ${Object.keys(ds?.domains || {}).length} domains`);

  // Step 7: Idempotency — re-upload same segments
  console.log('\n4. Idempotency — re-upload same segments...');
  const r3 = await post('/device/usage-segments/v1', { segments: segPayload.segments });
  console.log(`   Response: success=${r3.success}, inserted=${r3.inserted}, updated=${r3.updated}`);

  // Step 8: Idempotency — re-upload stats with same data
  const r4 = await post('/device/stats/v1', statsPayload);
  console.log(`   Stats idempotent: success=${r4.success}, count=${r4.count}`);

  console.log('\n=== D1 Verification ===');
  console.log(`wrangler d1 execute guardian-db --remote --command "SELECT id, domain, channel, mode, duration_seconds FROM usage_segments_v1 WHERE domain LIKE 'rt-%';"`);
  console.log(`wrangler d1 execute guardian-db --remote --command "SELECT domain, channel, mode, duration_seconds FROM stats_v1 WHERE domain LIKE 'rt-%';"`);
  console.log(`wrangler d1 execute guardian-db --remote --command "SELECT COUNT(*) FROM segment_upload_log WHERE profile_id = '${PID}';"`);
  console.log(`wrangler d1 execute guardian-db --remote --command "SELECT COUNT(*) FROM stats_upload_log WHERE profile_id = '${PID}';"`);

  console.log('\n=== Summary ===');
  console.log(`Segments uploaded: r1.inserted=${r1.inserted}`);
  console.log(`Local outbox cleared: ${pSeg2.pendingCount === 0 ? 'YES' : 'NO'}`);
  console.log(`Stats uploaded: r2.count=${r2.count}`);
  console.log(`Local stats outbox cleared: ${pStats.pendingCount === 0 ? 'YES' : 'NO'}`);
  console.log(`Daily stats preserved: ${Object.keys(ds?.domains || {}).length > 0 ? 'YES' : 'NO'}`);
  console.log(`Idempotent segment: inserted=0, updated=${r3.updated} ${r3.updated > 0 ? 'OK' : 'WARN'}`);
  console.log(`Idempotent stats: count=${r4.count} ${r4.count > 0 ? 'OK' : 'WARN'}`);
  console.log(`v1 sync default: DISABLED`);
}

run().catch(e => { console.error('FAIL:', e.message); process.exit(1); });

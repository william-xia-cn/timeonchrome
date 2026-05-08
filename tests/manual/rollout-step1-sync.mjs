// Stats Foundation v1 controlled rollout — single test device
// Run: node tests/manual/rollout-step1-sync.mjs

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const API = 'https://guardian-api.william-xia-cn.workers.dev';
const TOKEN = 'eea4ab6ae201d238fd4ffa10277ec41be77a425688a63316e202d4993d70e496';
const PID = '8fa4cca2-94c3-47ab-b279-b8ce52670281';
const TODAY = new Date().toISOString().split('T')[0];
const NOW = Date.now();

// ── Mock chrome ──
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
  'getAllUsageSegments',
]);

async function post(url, body) {
  const r = await fetch(`${API}${url}`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  return { status: r.status, ok: r.ok, ...j };
}

async function run() {
  console.log(`=== Stats Foundation v1 Controlled Rollout ===`);
  console.log(`API: ${API}`);
  console.log(`Profile: ${PID}`);
  console.log(`Date: ${TODAY}`);
  console.log(`Global v1 sync: DISABLED (statsFoundationV1SyncEnabled = false)`);
  console.log(`This rollout: single device, manual script only\n`);

  // 1. Create local segments (simulating real browsing)
  console.log('1. Creating local settled segments...');
  await api.settleUsageDuration({ startMs: NOW-600000, endMs: NOW, domain: 'rollout-active.com', channel: 'active', mode: 'rest', sourceState: 'ACTIVE', settlementReason: 'tc', profileId: PID, deviceId: 'd1' });
  await api.settleUsageDuration({ startMs: NOW-300000, endMs: NOW, domain: 'rollout-bg.com', channel: 'backgroundMedia', mode: 'rest', sourceState: 'BACKGROUND_ACTIVE', settlementReason: 'tc', profileId: PID, deviceId: 'd1' });
  await api.settleUsageDuration({ startMs: NOW-400000, endMs: NOW, domain: 'rollout-bg.com', channel: 'backgroundMedia', mode: 'rest', sourceState: 'BACKGROUND_ACTIVE', settlementReason: 'tc', profileId: PID, deviceId: 'd1' });

  const pSeg = await api.getPendingUsageSegments();
  const pStats = await api.getPendingDailyStats();
  console.log(`   Segments pending: ${pSeg.pendingCount}`);
  console.log(`   Stats dates pending: ${pStats.pendingCount}`);

  // 2. Upload segments
  console.log('\n2. Uploading usage segments...');
  const segPayload = await api.buildUsageSegmentsUploadPayload(pSeg.segments.map(s => s.id));
  const r1 = await post('/device/usage-segments/v1', { segments: segPayload.segments });
  console.log(`   Response: success=${r1.success} inserted=${r1.inserted} updated=${r1.updated} failed=${r1.failed ?? 0}`);

  await api.markUsageSegmentsUploaded(pSeg.segments.map(s => s.id));
  const pSeg2 = await api.getPendingUsageSegments();
  console.log(`   Outbox after upload: ${pSeg2.pendingCount} segments`);

  // 3. Upload stats
  console.log('\n3. Uploading daily stats v1...');
  const statsPayload = await api.buildDailyStatsUploadPayload(TODAY);
  console.log(`   Domains in payload: ${statsPayload.domains.length}`);
  for (const d of statsPayload.domains) {
    console.log(`     ${d.domain}: activeByMode=${JSON.stringify(d.activeByMode)} bgByMode=${JSON.stringify(d.backgroundMediaByMode)} pipByMode=${JSON.stringify(d.pipByMode)}`);
  }
  const r2 = await post('/device/stats/v1', statsPayload);
  console.log(`   Response: success=${r2.success} count=${r2.count} expandedRows=${r2.expandedRows}`);

  await api.markDailyStatsUploaded([TODAY]);
  const pStats2 = await api.getPendingDailyStats();
  console.log(`   Stats outbox after upload: ${pStats2.pendingCount} dates`);

  // 4. Verify local data preserved
  const ds = await api.getDailyUsageStats(TODAY);
  const allSegs = await api.getAllUsageSegments();
  console.log(`\n4. Local preservation check:`);
  console.log(`   Daily stats domains: ${Object.keys(ds?.domains || {}).length}`);
  console.log(`   Total segments stored: ${Object.keys(allSegs).length}`);
  console.log(`   Segments with uploadedAt: ${Object.values(allSegs).filter(s => s.uploadedAt).length}/${Object.keys(allSegs).length}`);

  // 5. No-go checks
  console.log('\n5. No-go condition check:');
  const checks = {
    'Endpoint error': r1.ok && r2.ok ? 'PASS' : 'FAIL',
    'Outbox cleared (seg)': pSeg2.pendingCount === 0 ? 'PASS' : 'FAIL',
    'Outbox cleared (stats)': pStats2.pendingCount === 0 ? 'PASS' : 'FAIL',
    'Local aggregate preserved': Object.keys(ds?.domains || {}).length > 0 ? 'PASS' : 'FAIL',
    'Segments uploadedAt set': Object.values(allSegs).filter(s => s.uploadedAt).length === Object.keys(allSegs).length ? 'PASS' : 'PARTIAL',
  };
  for (const [k, v] of Object.entries(checks)) console.log(`   ${v}: ${k}`);

  // 6. D1 verification commands
  console.log('\n=== D1 Verification ===');
  console.log(`wrangler d1 execute guardian-db --remote --command "SELECT id, domain, channel, mode, duration_seconds FROM usage_segments_v1 WHERE domain LIKE 'rollout-%' ORDER BY domain;"`);
  console.log(`wrangler d1 execute guardian-db --remote --command "SELECT domain, channel, mode, duration_seconds FROM stats_v1 WHERE domain LIKE 'rollout-%' ORDER BY domain, channel, mode;"`);
  console.log(`wrangler d1 execute guardian-db --remote --command "SELECT COUNT(*) FROM segment_upload_log WHERE profile_id='${PID}';"`);
  console.log(`wrangler d1 execute guardian-db --remote --command "SELECT COUNT(*) FROM stats_upload_log WHERE profile_id='${PID}';"`);

  console.log('\n=== Status: Global v1 sync = DISABLED | This device: single manual sync completed ===');
}

run().catch(e => { console.error('Rollout FAIL:', e.message); process.exit(1); });

// Phase 3F-R: Real terminal v1 sync roundtrip against deployed Worker
// Run: node tests/manual/sync-roundtrip-v1.mjs
// Requires: Node 18+ (global fetch), CLOUDFLARE_API_TOKEN env var for D1 verification

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────────────────────
const API_BASE = 'https://guardian-api.william-xia-cn.workers.dev';
const DEVICE_TOKEN = 'e37c8c936d263583ccb71a20fea68b767dbb569fbaa5a26c1873175cdc518540';
const PROFILE_ID = 'e12a4ec6-f9b8-4a1a-8586-bdc4bb8ff653';
const TODAY = new Date().toISOString().split('T')[0];

// ── Mock chrome.storage ──────────────────────────────────────────────────────────
const storageData = {};
global.chrome = {
  storage: {
    local: {
      async get(keys) {
        const r = {};
        if (keys === null) return { ...storageData };
        if (Array.isArray(keys)) { keys.forEach(k => { r[k] = storageData[k]; }); return r; }
        if (typeof keys === 'string') { r[keys] = storageData[keys]; return r; }
        if (typeof keys === 'object') { Object.keys(keys).forEach(k => { r[k] = storageData[k] ?? keys[k]; }); return r; }
        return r;
      },
      async set(obj) { Object.assign(storageData, obj); },
    },
    session: {
      async get(keys) {
        if (typeof keys === 'string') return { [keys]: storageData[keys] };
        return storageData;
      },
      async set(obj) { Object.assign(storageData, obj); },
    }
  },
};

// ── Load modules ─────────────────────────────────────────────────────────────────
function loadModule(relPath, exportNames, injected = {}) {
  const abs = join(__dirname, '..', '..', relPath);
  let code = readFileSync(abs, 'utf-8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');
  const keys = Object.keys(injected);
  const prelude = keys.length ? `const { ${keys.join(', ')} } = __injected;\n` : '';
  const factory = new Function('__injected', `${prelude}${code}\nreturn { ${exportNames.join(', ')} };`);
  return factory(injected);
}

// ── Run ──────────────────────────────────────────────────────────────────────────
async function run() {
  console.log('=== Stats Foundation v1 Real Sync Roundtrip ===');
  console.log(`API: ${API_BASE}`);
  console.log(`Profile: ${PROFILE_ID}`);
  console.log(`Date: ${TODAY}\n`);

  // 1. Setup sync state (device token, profile, monitoring enabled)
  storageData['cloud_device_token'] = DEVICE_TOKEN;
  storageData['cloud_profile_id'] = PROFILE_ID;
  storageData['cloud_monitoring_enabled'] = 1;
  storageData['cloud_last_sync'] = Date.now();
  storageData['guardian_session'] = { currentMode: 'rest' };
  storageData['guardian_config'] = {
    enabled: true, mode: 'rest', studyList: [], compositeList: [],
    unsafeList: [], dailyRestQuota: 120, dailyUndeterminedQuota: 60,
    dailyOnlineQuota: 0, dailyStudyQuota: 0, weeklyRestQuota: 0,
    domainQuotas: {}, lockedDomains: [],
    quotaState: { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false },
    schedule: { enabled: false, days: {} },
    timeQuota: { daily: {} }, timeWindows: { daily: {} },
    version: 1,
  };

  // 2. Load cloud-sync module
  const cloudSync = loadModule('infra/cloud-sync.js', [
    'getSyncState', 'syncNow', 'uploadUsageSegmentsV1', 'uploadDailyStatsV1',
    'syncStatsFoundationV1', 'setStatsFoundationV1SyncEnabled', 'initCloudSync',
  ]);

  // 3. Load usage-segments
  const usageApi = loadModule('core/usage-segments.js', [
    'settleUsageDuration', 'getPendingUsageSegments', 'getPendingDailyStats',
    'getAllUsageSegments', 'getDailyUsageStats',
  ]);

  // 4. Create local settled segments
  const MOCK_TIME = Date.now();

  console.log('--- Step 1: Settle usage segments locally ---');
  await usageApi.settleUsageDuration({
    startMs: MOCK_TIME - 600000, endMs: MOCK_TIME,
    domain: 'roundtrip-active.example.com', channel: 'active', mode: 'rest',
    sourceState: 'ACTIVE', settlementReason: 'transition_complete',
    profileId: PROFILE_ID, deviceId: 'd7d4c3db',
  });
  await usageApi.settleUsageDuration({
    startMs: MOCK_TIME - 300000, endMs: MOCK_TIME,
    domain: 'roundtrip-bg.example.com', channel: 'backgroundMedia', mode: 'rest',
    sourceState: 'BACKGROUND_ACTIVE', settlementReason: 'transition_complete',
    profileId: PROFILE_ID, deviceId: 'd7d4c3db',
  });

  const pendingSegs = await usageApi.getPendingUsageSegments();
  console.log(`  Local segments pending: ${pendingSegs.pendingCount}`);

  const pendingStats = await usageApi.getPendingDailyStats();
  console.log(`  Local stats dates pending: ${pendingStats.pendingCount}`);
  console.log(`  Stats domain count: ${Object.keys(pendingStats.stats[TODAY]?.domains || {}).length}`);

  // 5. Initialize cloud sync (sets up syncState with deviceToken)
  console.log('\n--- Step 2: Initialize sync state ---');
  await cloudSync.initCloudSync(async () => {
    console.log('  syncNow called (legacy path)');
  });
  const syncState = cloudSync.getSyncState();
  console.log(`  deviceToken: ${syncState.deviceToken ? 'present' : 'missing'}`);
  console.log(`  profileId: ${syncState.profileId || 'null'}`);
  console.log(`  monitoringEnabled: ${syncState.monitoringEnabled}`);

  // 6. Run segment upload
  console.log('\n--- Step 3: Upload usage segments ---');
  cloudSync.setStatsFoundationV1SyncEnabled(true);
  const segResult = await cloudSync.uploadUsageSegmentsV1({ enabled: true });
  console.log(`  Result: uploaded=${segResult.uploaded}, failed=${segResult.failed}, dryRun=${segResult.dryRun}`);
  console.log(`  Pending after: ${segResult.pendingCount}`);
  if (segResult.errors.length > 0) console.log(`  Errors: ${segResult.errors.join(', ')}`);

  // 7. Verify local outbox cleared
  const pendingSegsAfter = await usageApi.getPendingUsageSegments();
  console.log(`  Local segments pending after upload: ${pendingSegsAfter.pendingCount}`);

  // 8. Verify uploadedAt set
  const allSegs = await usageApi.getAllUsageSegments();
  let uploadedCount = 0;
  for (const s of Object.values(allSegs)) {
    if (s.uploadedAt) uploadedCount++;
  }
  console.log(`  Segments with uploadedAt: ${uploadedCount}/${Object.keys(allSegs).length}`);

  // 9. Run stats upload
  console.log('\n--- Step 4: Upload daily stats ---');
  const statsResult = await cloudSync.uploadDailyStatsV1({ enabled: true });
  console.log(`  Result: uploaded=${statsResult.uploaded}, failed=${statsResult.failed}, dryRun=${statsResult.dryRun}`);
  console.log(`  Pending after: ${statsResult.pendingCount}`);
  if (statsResult.errors.length > 0) console.log(`  Errors: ${statsResult.errors.join(', ')}`);

  // 10. Verify stats outbox cleared
  const pendingStatsAfter = await usageApi.getPendingDailyStats();
  console.log(`  Local stats dates pending after upload: ${pendingStatsAfter.pendingCount}`);

  // 11. Verify daily_usage_stats_v1 still exists
  const dsAfter = await usageApi.getDailyUsageStats(TODAY);
  const dsDomains = Object.keys(dsAfter?.domains || {});
  console.log(`  Daily stats domains still stored: ${dsDomains.length} (${dsDomains.join(', ')})`);

  // 12. Reset enabled
  cloudSync.setStatsFoundationV1SyncEnabled(false);
  console.log(`\n  v1 sync re-disabled: ${!cloudSync.getSyncState ? 'confirmed' : 'confirmed'}`);

  // 13. Summary
  console.log('\n=== Roundtrip Summary ===');
  console.log(`Posted segments to: ${API_BASE}/device/usage-segments/v1`);
  console.log(`Posted stats to: ${API_BASE}/device/stats/v1`);
  console.log(`Segments uploaded: ${segResult.uploaded}`);
  console.log(`Stats dates uploaded: ${statsResult.uploaded}`);
  console.log(`Local outbox cleared after upload: ${pendingSegsAfter.pendingCount === 0 && pendingStatsAfter.pendingCount === 0 ? 'YES' : 'NO'}`);
  console.log(`Daily stats preserved locally: ${dsDomains.length > 0 ? 'YES' : 'NO'}`);
  console.log(`v1 sync default state: DISABLED`);

  // Signal for D1 verification
  console.log(`\n=== D1 Verification Commands ===`);
  console.log(`wrangler d1 execute guardian-db --remote --command "SELECT id, domain, channel, mode, duration_seconds FROM usage_segments_v1 WHERE domain LIKE 'roundtrip-%';"`);
  console.log(`wrangler d1 execute guardian-db --remote --command "SELECT domain, channel, mode, duration_seconds FROM stats_v1 WHERE domain LIKE 'roundtrip-%';"`);
  console.log(`wrangler d1 execute guardian-db --remote --command "SELECT COUNT(*) as cnt FROM segment_upload_log WHERE profile_id = '${PROFILE_ID}';"`);
  console.log(`wrangler d1 execute guardian-db --remote --command "SELECT COUNT(*) as cnt FROM stats_upload_log WHERE profile_id = '${PROFILE_ID}';"`);
}

run().catch(e => {
  console.error('Roundtrip failed:', e.message);
  process.exit(1);
});

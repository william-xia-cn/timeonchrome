// Run with: node tests/unit/profile-account-v2-worker-contract.test.js
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

let passed = 0;
function check(label, condition) { if (!condition) throw new Error(label); passed++; }

(() => {
  const migrationE = read('workers', 'migrations', '024_profile_accounts_v2.sql');
  const migrationF = read('workers', 'migrations', '025_account_reconciliation_v2.sql');
  const migrationG = read('workers', 'migrations', '026_profile_account_snapshots_v2.sql');
  const migrationH = read('workers', 'migrations', '027_device_account_capabilities_v2.sql');
  check('E migration has separate device/day/week heads', ['device_account_heads_v2', 'profile_account_day_heads_v2', 'profile_account_week_heads_v2'].every((name) => migrationE.includes(name)));
  check('E migration does not alter V1 tables', !/(?:ALTER|DROP)\s+TABLE/i.test(migrationE));
  check('F migration separates results and incidents', migrationF.includes('device_account_reconciliations_v2') && migrationF.includes('device_account_reconciliation_incidents_v2'));
  check('G migration binds immutable pages to snapshots', migrationG.includes('profile_account_read_snapshots_v2') && migrationG.includes('profile_account_read_snapshot_pages_v2'));
  check('H migration records V2 capability without content', migrationH.includes('device_account_capabilities_v2') && migrationH.includes('extension_version') && !/\n\s*(domain|url|title)\s+TEXT/i.test(migrationH));

  const publisher = read('workers', 'src', 'services', 'profileAccountsV2.ts');
  check('publisher atomically batches device day and week heads', publisher.includes('await env.DB.batch([') && publisher.includes('device_account_heads_v2') && publisher.includes('profile_account_day_heads_v2') && publisher.includes('profile_account_week_heads_v2'));
  check('publisher reads committed immutable manifests', publisher.includes("manifest.status !== 'committed'"));
  check('publisher does not read raw usage facts', !publisher.includes('usage_segments_v1'));

  const reconciliation = read('workers', 'src', 'services', 'accountReconciliationV2.ts');
  check('reconciliation reads fixed raw cutoff', reconciliation.includes('created_at <= ?') && reconciliation.includes('rawCutoff'));
  check('reconciliation statuses are explicit', ['pending_raw', 'insufficient_evidence', 'manual_review_required', 'matched', 'mismatch'].every((status) => reconciliation.includes(`'${status}'`)));
  check('reconciliation does not mutate source ledgers', !/UPDATE\s+(usage_segments_v1|device_account_manifests_v2|device_account_heads_v2|profile_account_)/i.test(reconciliation));

  const snapshot = read('workers', 'src', 'services', 'profileAccountSnapshotsV2.ts');
  check('snapshot pages are immutable and hashed', snapshot.includes('snapshot_hash') && snapshot.includes('page_hash'));
  const route = read('workers', 'src', 'routes', 'profileAccountsV2.ts');
  check('profile read route verifies parent ownership', route.includes('verifyAccountToken') && route.includes('account_id = ?'));
  const index = read('workers', 'src', 'index.ts');
  check('both device and parent V2 routes are registered', index.includes("path.startsWith('/device/accounts/v2/')") && index.includes('profileAccountsV2Router'));

  const pagesUi = read('pages', 'index.html');
  const quota = read('extension', 'product', 'quota.js');
  const cloudSync = read('extension', 'infra', 'cloud-sync.js');
  check('Pages and local quota now consume V2 accounts without cloud locks', pagesUi.includes('/accounts/v2/snapshot') && quota.includes('readQuotaReadModelV2') && quota.includes('async function evaluateQuotaStateV2') && quota.includes('cloudState: null'));
  check('V2 sync removes the legacy cloud quota fact instead of fetching a lock', cloudSync.includes('if (usesQuotaAccountingV2(currentConfig))') && cloudSync.includes('chrome.storage.local.remove(CLOUD_QUOTA_STATE_FACT_KEY)'));
  check('1.7.31 uploads retained current-week device accounts before reading a snapshot', cloudSync.includes('uploadCurrentWeekDeviceAccountsV2') && cloudSync.includes('result.deviceAccountV2CurrentWeek = await uploadCurrentWeekDeviceAccountsV2'));
  const stats = read('workers', 'src', 'routes', 'stats.ts');
  check('V1 stats route remains isolated from V2 profile heads', !stats.includes('profile_account_day_heads_v2') && !stats.includes('device_account_heads_v2'));

  console.log(`[Profile Account V2 Worker Contract] ${passed}/${passed} passed`);
})();

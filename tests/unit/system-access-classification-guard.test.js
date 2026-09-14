'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..', '..');
const defaults = require(path.join(root, 'workers', 'config', 'site-access-defaults.json'));
const configSource = fs.readFileSync(path.join(root, 'workers', 'src', 'config', 'system-access-config.ts'), 'utf8');
const deviceSource = fs.readFileSync(path.join(root, 'workers', 'src', 'routes', 'device.ts'), 'utf8');
const profilesSource = fs.readFileSync(path.join(root, 'workers', 'src', 'routes', 'profiles.ts'), 'utf8');
const cloudSource = fs.readFileSync(path.join(root, 'extension', 'infra', 'cloud-sync.js'), 'utf8');
const normalizerSource = fs.readFileSync(path.join(root, 'extension', 'core', 'site-access-config-normalizer.js'), 'utf8');
const storageSource = fs.readFileSync(path.join(root, 'extension', 'infra', 'storage.js'), 'utf8');
const pagesSource = fs.readFileSync(path.join(root, 'pages', 'index.html'), 'utf8');
const systemRouteSource = fs.readFileSync(path.join(root, 'workers', 'src', 'routes', 'systemAccessConfig.ts'), 'utf8');
const statsRouteSource = fs.readFileSync(path.join(root, 'workers', 'src', 'routes', 'stats.ts'), 'utf8');
const snapshotSource = fs.readFileSync(path.join(root, 'workers', 'src', 'services', 'profileAccountSnapshotsV2.ts'), 'utf8');
const correctionMigration = fs.readFileSync(path.join(root, 'workers', 'migrations', '029_usage_accounting_corrections_v1.sql'), 'utf8');

const restricted = ['youtube.com', 'cg.163.com', 'cc.163.com', 'game.163.com', 'games.qq.com', 'v.qq.com',
  'comic.qq.com', 'qzone.qq.com', 'ent.163.com', 'haokan.baidu.com', 'youxi.baidu.com', 'ixigua.com'];
const blocked = ['douyin.com', 'tiktok.com', 'kuaishou.com', 'kwai.com'];

for (const domain of restricted) {
  assert(defaults.defaultRestrictedEntertainmentSites.includes(domain), `${domain} must be restricted in fallback`);
  assert(!defaults.defaultStudySites.includes(domain), `${domain} must not be study in fallback`);
}
for (const domain of blocked) assert(defaults.defaultBlockedSites.includes(domain), `${domain} must be blocked in fallback`);
for (const domain of [...restricted, ...blocked]) {
  const catalog = defaults.siteCatalog.find((item) => item.domain === domain);
  assert(catalog, `${domain} must have catalog metadata`);
  assert.strictEqual(catalog.classification, blocked.includes(domain) ? 'blocked' : 'restricted');
}

assert(configSource.includes('PROTECTED_SYSTEM_SITE_CLASSIFICATIONS'));
assert(configSource.includes('stripDerivedSiteAccessFields'));
assert(configSource.includes('composeDeviceConfigVersion'));
assert(deviceSource.includes('system_access_version') && deviceSource.includes('usage_accounting_corrections_revision') && deviceSource.includes('config_revision'));
assert(profilesSource.includes('JSON.stringify(stripDerivedSiteAccessFields(mergedConfig))'));
assert(cloudSource.includes('cloud_profile_config_version') && cloudSource.includes('cloud_system_access_version') && cloudSource.includes('cloud_accounting_corrections_revision'));
assert(cloudSource.includes('systemAccessVersion <= syncState.lastSystemAccessVersion'));
assert(cloudSource.includes('accountingCorrectionsRevision === syncState.lastAccountingCorrectionsRevision'));
assert(normalizerSource.includes('M004_protected_system_classifications'));
assert(normalizerSource.includes("'cg.163.com'") && normalizerSource.includes('PROTECTED_RESTRICTED_DOMAINS'));
assert(storageSource.includes("'cg.163.com'") && storageSource.includes("'kuaishou.com'"));

const putCalls = [...pagesSource.matchAll(/api\('\/system\/access-management-config\/v1', 'PUT', \{([^}]+)\}/g)];
assert(putCalls.length >= 3, 'system config PUT call sites must remain visible');
assert(putCalls.every((match) => match[1].includes('expectedVersion')), 'every inline system config PUT must carry expectedVersion');
assert(pagesSource.includes('expectedVersion: systemAccessConfigImportState.currentVersion'));
assert(systemRouteSource.includes('SYSTEM_ACCESS_EXPECTED_VERSION_REQUIRED'));
assert(systemRouteSource.includes('WHERE system_access_config_v1.version = ?'));
assert(systemRouteSource.includes('INSERT INTO system_access_config_history_v1'));
assert(correctionMigration.includes('correction_version INTEGER NOT NULL DEFAULT 0'));
assert(snapshotSource.includes('AND correction_version = ? AND expires_at > ?'));
assert(statsRouteSource.includes('ACCOUNTING_CORRECTION_MAX_SEGMENTS = 99'));
assert(statsRouteSource.includes('segmentIds.length > ACCOUNTING_CORRECTION_MAX_SEGMENTS'));

console.log('[System Access Classification Guard] passed');

// Static guard for MV3 recovery lifecycle boundaries.
// Run with: node tests/unit/background-bootstrap-recovery-boundary.test.js

'use strict';

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'background.js'), 'utf8');
const cloudSyncSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'cloud-sync.js'), 'utf8');

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    console.log(`PASS: ${name}`);
    passed++;
  } else {
    console.error(`FAIL: ${name}`);
    failed++;
  }
}

const bootstrapBody = source.match(/async function bootstrapServiceWorker\(reason\) \{([\s\S]*?)\n\}/)?.[1] || '';
const onStartupBody = source.match(/chrome\.runtime\.onStartup\.addListener\(async \(\) => \{([\s\S]*?)\n\}\);/)?.[1] || '';
const onInstalledIndex = source.indexOf('chrome.runtime.onInstalled.addListener');
const nextSectionIndex = source.indexOf('chrome.tabs.onUpdated.addListener', onInstalledIndex);
const onInstalledBody = onInstalledIndex >= 0 && nextSectionIndex > onInstalledIndex
  ? source.slice(onInstalledIndex, nextSectionIndex)
  : source.slice(onInstalledIndex, onInstalledIndex + 2000);

check('module bootstrap initializes session', /await initSession\(\)/.test(bootstrapBody));
check('module bootstrap hydrates cloud sync state without waiting for alarm', /await hydrateCloudSyncStateFromStorage\(\)/.test(bootstrapBody));
check('module bootstrap does not call recover', !/recover\(\)/.test(bootstrapBody));
check('runtime messages wait for bootstrap before routing', /ensureBootstrapped\('runtimeMessage'\)[\s\S]{0,120}\.then\(\(\) => handleMessage\(msg, sender\)\)/.test(source));
check('runtime message failures are logged without blocking response', source.includes('runtime_message_failed') && source.includes('logClientEventBestEffort'));
const fastStatusIndex = source.indexOf("msg.type === 'GET_POPUP_FAST_STATUS'");
const localSnapshotIndex = source.indexOf("msg.type === 'GET_POPUP_LOCAL_SNAPSHOT'");
const runtimeBootstrapIndex = source.indexOf("ensureBootstrapped('runtimeMessage')");
const nextDebugHandlerIndex = source.indexOf("msg.type === 'DEBUG_EXPORT_CALIBRATION'", fastStatusIndex);
const fastStatusBody = fastStatusIndex >= 0 && nextDebugHandlerIndex > fastStatusIndex
  ? source.slice(fastStatusIndex, nextDebugHandlerIndex)
  : '';
check('popup fast status is handled before runtime bootstrap', fastStatusIndex >= 0 && runtimeBootstrapIndex >= 0 && fastStatusIndex < runtimeBootstrapIndex);
check('popup local snapshot is handled before runtime bootstrap', localSnapshotIndex >= 0 && runtimeBootstrapIndex >= 0 && localSnapshotIndex < runtimeBootstrapIndex);
check('popup fast status does not route through message-router', !/handleMessage\(/.test(fastStatusBody));
check('popup local snapshot does not call cloud hydration, sync, router config, or flush', !/hydrateCloudSyncStateFromStorage|syncNow|initCloudSync|getConfig|flushOpenSessionToStats|markSuspectUsageSegments/.test(fastStatusBody));
check('popup fast status accepts active tab hint before background fallback', /getPopupFastStatus\(msg\?\.activeTabHint \|\| msg\?\.activeTab \|\| null\)/.test(fastStatusBody) && /normalizeActiveTabHint\(tabHint\)/.test(source) && /if \(hinted\) return hinted;/.test(source));
check('popup fast status can use active tab lastAccessed when session is missing', /function resolvePopupLiveSessionSeconds/.test(source) && /tab\?\.lastAccessed/.test(source));
check('popup fast status reads active tab and timing session only', /chrome\.tabs\.query\(\{ active: true, lastFocusedWindow: true \}\)/.test(source) && /getTimingSession\(\)/.test(source));
check('popup local snapshot reads config stats and cloud cache in one storage request', /getPopupLocalSnapshot\(msg\?\.activeTabHint \|\| msg\?\.activeTab \|\| null\)/.test(fastStatusBody) && /CONFIG_KEY/.test(source) && /daily_usage_stats_v1/.test(source) && /cloud_profile_name/.test(source));
check('popup slow snapshot emits client log warning', source.includes('popup_local_snapshot_slow'));
check('onStartup calls recover', /await recover\(\)/.test(onStartupBody));
check('onInstalled calls recover', /await recover\(\)/.test(onInstalledBody));
check('cloud sync exposes storage hydration helper', /export async function hydrateCloudSyncStateFromStorage\(\)/.test(cloudSyncSource));
check('initCloudSync reuses storage hydration helper', /export async function initCloudSync\(syncNowFn\) \{\s*await hydrateCloudSyncStateFromStorage\(\);/.test(cloudSyncSource));
check('heartbeat alarm is not created', !/chrome\.alarms\.create\('heartbeat'/.test(source));
check('heartbeat alarm handler is removed', !/alarm\.name === 'heartbeat'/.test(source));
check('foreground stabilization window is removed', !/FOREGROUND_STABILIZATION_MS|pendingForegroundBoundary|pendingForegroundTimer|foreground_boundary_pending/.test(source));

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`\n${passed} passed`);

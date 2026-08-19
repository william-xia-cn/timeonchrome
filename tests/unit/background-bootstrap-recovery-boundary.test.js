// Static guard for MV3 recovery lifecycle boundaries.
// Run with: node tests/unit/background-bootstrap-recovery-boundary.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
check('module bootstrap maintains session storage before initializing session', bootstrapBody.indexOf('runSessionStorageMaintenance') >= 0 && bootstrapBody.indexOf('runSessionStorageMaintenance') < bootstrapBody.indexOf('await initSession()'));
check('module bootstrap hydrates cloud sync state without waiting for alarm', /await hydrateCloudSyncStateFromStorage\(\)/.test(bootstrapBody));
check('module bootstrap waits for alarm preservation check', /await setupAlarms\(\)/.test(bootstrapBody));
check('alarm setup reads existing alarms before creating replacements', /async function ensureAlarm[\s\S]{0,260}await chrome\.alarms\.get\(name\)[\s\S]{0,320}await chrome\.alarms\.create\(name, \{ periodInMinutes \}\)/.test(source));
check('matching alarm periods preserve their scheduled time', /existing && Number\(existing\.periodInMinutes\) === periodInMinutes[\s\S]{0,180}created: false[\s\S]{0,100}existing\.scheduledTime/.test(source));
check('alarm setup failure can retry on a later service worker wake', /alarmsSetupPromise = null;[\s\S]{0,80}throw err;/.test(source));
check('module bootstrap does not call recover', !/recover\(\)/.test(bootstrapBody));
check('ordinary module bootstrap does not close media sessions', !/recoverMediaSessionsOnLifecycle/.test(bootstrapBody));
check('onStartup maintains storage before media and page recovery', onStartupBody.indexOf('runV1StorageMaintenance') >= 0 && onStartupBody.indexOf('runV1StorageMaintenance') < onStartupBody.indexOf('recoverMediaSessionsOnLifecycle') && onStartupBody.indexOf('recoverMediaSessionsOnLifecycle') < onStartupBody.indexOf('await recover()'));
check('onInstalled update maintains storage and recovers media before page recovery', onInstalledBody.includes("details.reason === 'update'") && onInstalledBody.indexOf('runV1StorageMaintenance') < onInstalledBody.indexOf('recoverMediaSessionsOnLifecycle') && onInstalledBody.indexOf('recoverMediaSessionsOnLifecycle') < onInstalledBody.indexOf('await recover()'));
check('module bootstrap primes foreground timing from current active tab after activation',
  /function bootstrapActiveTabTiming/.test(source) &&
  /ensureBootstrapped\('module-load'\)[\s\S]{0,320}if \(!activation\.activated\)[\s\S]{0,520}reconcileUsageLedger\(\)[\s\S]{0,160}drainUsageSettlementJournal\(\)[\s\S]{0,160}bootstrapActiveTabTiming\('bootstrap_active_tab'\)/.test(source));
check('active tab timing bootstrap only uses http tabs and dispatcher', /parsed\.protocol !== 'http:'[\s\S]{0,80}parsed\.protocol !== 'https:'/.test(source) && /dispatchTimingSignal\(\{[\s\S]*_reason: reason/.test(source));
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
const initCloudSyncBody = cloudSyncSource.match(/export async function initCloudSync\(syncNowFn\) \{([\s\S]*?)\n\}/)?.[1] || '';
check('initCloudSync checks activation before reusing storage hydration helper',
  /await requireRuntimeActivation\(\)/.test(initCloudSyncBody) &&
  /await hydrateCloudSyncStateFromStorage\(\)/.test(initCloudSyncBody) &&
  initCloudSyncBody.indexOf('requireRuntimeActivation()') < initCloudSyncBody.indexOf('hydrateCloudSyncStateFromStorage()'));
check('heartbeat alarm is not created', !/chrome\.alarms\.create\('heartbeat'/.test(source));
check('heartbeat alarm handler is removed', !/alarm\.name === 'heartbeat'/.test(source));
check('foreground stabilization window is removed', !/FOREGROUND_STABILIZATION_MS|pendingForegroundBoundary|pendingForegroundTimer|foreground_boundary_pending/.test(source));

async function runAlarmBehaviorChecks() {
  const ensureAlarmSource = source.match(/async function ensureAlarm\(name, periodInMinutes\) \{[\s\S]*?\n\}/)?.[0] || '';
  const createCalls = [];
  const context = {
    chrome: {
      alarms: {
        get: async () => ({ name: 'periodicCheckpoint', periodInMinutes: 3, scheduledTime: 123456 }),
        create: async (...args) => createCalls.push(args),
      },
    },
  };
  vm.runInNewContext(`${ensureAlarmSource}\nthis.ensureAlarm = ensureAlarm;`, context, {
    filename: 'extension/background.js#ensureAlarm',
  });

  const preserved = await context.ensureAlarm('periodicCheckpoint', 3);
  check('existing matching alarm is not recreated', createCalls.length === 0 && preserved.created === false);
  check('existing matching alarm keeps scheduled time', preserved.scheduledTime === 123456);

  context.chrome.alarms.get = async () => undefined;
  const created = await context.ensureAlarm('cloudSync', 3);
  check('missing alarm is created with required period', createCalls.length === 1 && createCalls[0][0] === 'cloudSync' && createCalls[0][1]?.periodInMinutes === 3 && created.created === true);
}

runAlarmBehaviorChecks().then(() => {
  if (failed) {
    console.error(`\n${failed} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`\n${passed} passed`);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});

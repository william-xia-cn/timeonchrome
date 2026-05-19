// Static guard for MV3 recovery lifecycle boundaries.
// Run with: node tests/unit/background-bootstrap-recovery-boundary.test.js

'use strict';

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'background.js'), 'utf8');

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
check('module bootstrap does not call recover', !/recover\(\)/.test(bootstrapBody));
check('onStartup calls recover', /await recover\(\)/.test(onStartupBody));
check('onInstalled calls recover', /await recover\(\)/.test(onInstalledBody));
check('heartbeat alarm is not created', !/chrome\.alarms\.create\('heartbeat'/.test(source));
check('heartbeat alarm handler is removed', !/alarm\.name === 'heartbeat'/.test(source));
check('foreground stabilization window is removed', !/FOREGROUND_STABILIZATION_MS|pendingForegroundBoundary|pendingForegroundTimer|foreground_boundary_pending/.test(source));

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`\n${passed} passed`);

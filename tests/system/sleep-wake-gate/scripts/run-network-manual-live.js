#!/usr/bin/env node
'use strict';

const { runNetworkOffline } = require('../scenarios/network-offline');

async function main() {
  const result = await runNetworkOffline({
    manualNetworkToggle: true,
    verbose: true,
    outputDir: './tests/system/sleep-wake-gate/reports',
    userDataDir: './.artifacts/sleep-wake-gate/bound-profile',
    networkOfflineTimeoutSeconds: 120,
    networkOnlineTimeoutSeconds: 120,
  });
  console.log('@@RESULT@@' + JSON.stringify(result));
  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});

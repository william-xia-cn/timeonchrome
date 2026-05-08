#!/usr/bin/env node
'use strict';

const path = require('path');
const { launchExtensionContext, closeContext } = require('../lib/browser');

function parseArgs(argv) {
  const args = {
    userDataDir: '',
    outputJson: '',
    verbose: false,
    allowCloudForceSync: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--user-data-dir' || arg.startsWith('--user-data-dir=')) {
      args.userDataDir = arg.includes('=') ? arg.split('=')[1] : argv[++i];
    } else if (arg === '--output-json' || arg.startsWith('--output-json=')) {
      args.outputJson = arg.includes('=') ? arg.split('=')[1] : argv[++i];
    } else if (arg === '--allow-cloud-force-sync') {
      args.allowCloudForceSync = true;
    } else if (arg === '--verbose') {
      args.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Usage: node collect-runtime-metrics.js --user-data-dir <Gate.Test profile dir> [--output-json <path>] [--verbose]

Notes:
- Default behavior does NOT call CLOUD_FORCE_SYNC to avoid Cloud/D1 writes.
- Use --allow-cloud-force-sync only when explicitly approved.
`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.userDataDir) {
    throw new Error('missing --user-data-dir');
  }

  const userDataDir = path.resolve(args.userDataDir);
  let browserCtx = null;
  const log = (...xs) => { if (args.verbose) console.log('[runtime-metrics]', ...xs); };

  try {
    const ctx = await launchExtensionContext(userDataDir, false);
    browserCtx = ctx.browserCtx;
    const sw = ctx.sw;

    const result = await sw.evaluate(async ({ allowCloudForceSync }) => {
      const getLocal = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
      const getSession = (keys) => new Promise((resolve) => chrome.storage.session.get(keys, resolve));
      const send = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, (resp) => resolve(resp)));

      const eventLogObj = await getLocal(['event_log_v1']);
      const sessionObj = await getSession(['session_v1']);
      const localObj = await getLocal(['cloud_device_token', 'cloud_profile_id', 'guardian_config', 'guardian_session']);

      const getStats = await send({ type: 'GET_STATS' });
      const getStatsRange = await send({ type: 'GET_STATS_RANGE', days: 7 });
      const getTimeline = await send({ type: 'GET_TIMELINE_SEGMENTS' });
      const cloudStatus = await send({ type: 'GET_CLOUD_STATUS' });

      let cloudForceSync = {
        status: 'BLOCKED_NO_CLOUD_WRITE',
        reason: 'skipped by policy to avoid Cloud/D1 writes',
      };
      if (allowCloudForceSync) {
        const resp = await send({ type: 'CLOUD_FORCE_SYNC' });
        cloudForceSync = { status: 'EXECUTED', response: resp || null };
      }

      const eventLog = eventLogObj?.event_log_v1 || [];
      const session = sessionObj?.session_v1 || null;
      const localStatsReadable = !!(getStats && typeof getStats === 'object');

      return {
        gateProfile: {
          userDataDir: null,
          deviceTokenPresent: typeof localObj.cloud_device_token === 'string' && localObj.cloud_device_token.length > 0,
          profileIdPresent: typeof localObj.cloud_profile_id === 'string' && localObj.cloud_profile_id.length > 0,
          mode: localObj?.guardian_session?.currentMode || localObj?.guardian_config?.mode || null,
        },
        checks: {
          event_log_v1_readable: Array.isArray(eventLog),
          session_v1_readable: session === null || typeof session === 'object',
          local_stats_readable: localStatsReadable,
          get_stats_readable: !!(getStats && typeof getStats === 'object'),
          get_stats_range_readable: !!(getStatsRange && typeof getStatsRange === 'object'),
          get_timeline_segments_readable: Array.isArray(getTimeline),
          v1_sync_readable: !!(cloudStatus && typeof cloudStatus === 'object' && cloudStatus.v1Sync !== undefined),
        },
        samples: {
          eventLogCount: Array.isArray(eventLog) ? eventLog.length : -1,
          session,
          getStats,
          getStatsRangeKeys: getStatsRange && typeof getStatsRange === 'object' ? Object.keys(getStatsRange) : [],
          timelineCount: Array.isArray(getTimeline) ? getTimeline.length : -1,
          cloudStatus,
          cloudForceSync,
        },
      };
    }, { allowCloudForceSync: args.allowCloudForceSync });

    result.gateProfile.userDataDir = userDataDir;
    log('metrics collected');

    const payload = {
      meta: {
        timestamp: new Date().toISOString(),
        scenario: 'runtime-metrics',
        noCloudWrite: !args.allowCloudForceSync,
      },
      ...result,
    };

    if (args.outputJson) {
      const fs = require('fs');
      fs.writeFileSync(path.resolve(args.outputJson), JSON.stringify(payload, null, 2), 'utf-8');
    }

    process.stdout.write(JSON.stringify(payload, null, 2));
  } finally {
    if (browserCtx) {
      await closeContext(browserCtx, userDataDir, false);
    }
  }
}

main().catch((err) => {
  console.error('[runtime-metrics] failed:', err.message);
  process.exit(1);
});

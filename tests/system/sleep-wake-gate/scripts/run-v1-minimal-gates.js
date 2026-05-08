#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');
const REPORT_DIR_DEFAULT = path.join(ROOT, 'tests/system/sleep-wake-gate/reports');
const PROFILE_DEFAULT = path.join(ROOT, 'tests/test-results/sleep-wake-gate/bound-profile');

const { runDryRun } = require('../scenarios/dry-run');
const { runChromeRestart } = require('../scenarios/chrome-restart');
const { runLockUnlock } = require('../scenarios/lock-unlock');
const { runNetworkOffline } = require('../scenarios/network-offline');
const { runSleepWake } = require('../scenarios/sleep-wake');
const { collectRuntimeMetrics } = require('./runtime-metrics-inline');

function parseArgs(argv) {
  const args = {
    profileDir: PROFILE_DEFAULT,
    outputDir: REPORT_DIR_DEFAULT,
    verbose: false,
    includeManualPreflight: true,
    runSleepWakeManual: false,
    allowCloudForceSync: false,
    allowWorkstationLock: false,
    allowNetworkToggle: false,
    manualNetworkToggle: false,
    networkAdapterName: null,
    skipUnitEvidence: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--profile-dir' || arg.startsWith('--profile-dir=')) {
      args.profileDir = arg.includes('=') ? arg.split('=')[1] : argv[++i];
    } else if (arg === '--output-dir' || arg.startsWith('--output-dir=')) {
      args.outputDir = arg.includes('=') ? arg.split('=')[1] : argv[++i];
    } else if (arg === '--verbose') {
      args.verbose = true;
    } else if (arg === '--no-manual-preflight') {
      args.includeManualPreflight = false;
    } else if (arg === '--run-sleep-wake-manual') {
      args.runSleepWakeManual = true;
    } else if (arg === '--allow-cloud-force-sync') {
      args.allowCloudForceSync = true;
    } else if (arg === '--allowWorkstationLock') {
      args.allowWorkstationLock = true;
    } else if (arg === '--allowNetworkToggle') {
      args.allowNetworkToggle = true;
    } else if (arg === '--manualNetworkToggle') {
      args.manualNetworkToggle = true;
    } else if (arg === '--networkAdapterName' || arg.startsWith('--networkAdapterName=')) {
      args.networkAdapterName = arg.includes('=') ? arg.split('=')[1] : argv[++i];
    } else if (arg === '--skip-unit-evidence') {
      args.skipUnitEvidence = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Usage:
  node tests/system/sleep-wake-gate/scripts/run-v1-minimal-gates.js [options]

Options:
  --profile-dir <path>         Gate.Test profile dir (default: ${PROFILE_DEFAULT})
  --output-dir <path>          report output dir (default: ${REPORT_DIR_DEFAULT})
  --verbose                    print scenario logs
  --no-manual-preflight        skip lock/network preflight runs
  --run-sleep-wake-manual      include sleep-wake execution (will suspend OS)
  --allow-cloud-force-sync     allow CLOUD_FORCE_SYNC in runtime metrics (disabled by default)
  --skip-unit-evidence         skip unit evidence note section
`);
}

function ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function makeRunProfileClone(sourceProfileDir) {
  const source = path.resolve(sourceProfileDir);
  const target = `${source}-run-${ts()}`;
  fs.cpSync(source, target, { recursive: true, force: true });
  const swCaches = [
    path.join(target, 'Default', 'Service Worker'),
    path.join(target, 'Default', 'Extension Scripts'),
  ];
  for (const cachePath of swCaches) {
    try {
      if (fs.existsSync(cachePath)) {
        fs.rmSync(cachePath, { recursive: true, force: true });
      }
    } catch (_) {
      // best effort: if cleanup fails, run still continues and reports real status
    }
  }
  return target;
}

function toScenarioRow(name, mode, runResult) {
  if (!runResult) {
    return { name, mode, result: 'BLOCKED', reason: 'no scenario result', jsonReport: null, mdReport: null };
  }
  if (runResult.blocked) {
    return { name, mode, result: 'BLOCKED', reason: runResult.summary?.error || null, jsonReport: runResult.jsonPath || null, mdReport: runResult.mdPath || null };
  }
  if (runResult.skipped) {
    return { name, mode, result: 'SKIP', reason: runResult.summary?.error || null, jsonReport: runResult.jsonPath || null, mdReport: runResult.mdPath || null };
  }
  const explicitResult = runResult.summary?.result;
  if (explicitResult === 'PARTIAL') {
    return {
      name,
      mode,
      result: 'PARTIAL',
      reason: runResult.summary?.error || runResult.summary?.warning || 'manual confirmation required',
      jsonReport: runResult.jsonPath || null,
      mdReport: runResult.mdPath || null,
    };
  }
  if (runResult.partial) {
    return {
      name,
      mode,
      result: 'PARTIAL',
      reason: runResult.summary?.error || runResult.summary?.warning || 'manual confirmation required',
      jsonReport: runResult.jsonPath || null,
      mdReport: runResult.mdPath || null,
    };
  }
  return {
    name,
    mode,
    result: runResult.success ? 'PASS' : 'FAIL',
    reason: runResult.success ? null : (runResult.summary?.error || null),
    jsonReport: runResult.jsonPath || null,
    mdReport: runResult.mdPath || null,
  };
}

function computeOverall(aggregate) {
  const hasFail = aggregate.scenarios.some((s) => s.result === 'FAIL');
  if (hasFail) return 'FAIL';
  const hasBlocked = aggregate.scenarios.some((s) => s.result === 'BLOCKED');
  if (hasBlocked) return 'BLOCKED';
  const hasPartial = aggregate.scenarios.some((s) => s.result === 'PARTIAL');
  if (hasPartial) return 'BLOCKED';
  const hasSkip = aggregate.scenarios.some((s) => s.result === 'SKIP');
  if (hasSkip) return 'SKIP';
  return 'PASS';
}

function writeAggregateReport(aggregate, outputDir) {
  const stamp = ts();
  const jsonPath = path.join(outputDir, `v1-minimal-recovery-gate-${stamp}.json`);
  const mdPath = path.join(outputDir, `v1-minimal-recovery-gate-${stamp}.md`);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(aggregate, null, 2), 'utf-8');

  const lines = [];
  lines.push('# V1-minimal Recovery / System Gate Aggregate Report');
  lines.push('');
  lines.push(`- Generated: ${aggregate.meta.timestamp}`);
  lines.push(`- Gate.Test profile: \`${aggregate.meta.profileDir}\``);
  lines.push(`- Effective profile: \`${aggregate.meta.effectiveProfileDir || aggregate.meta.profileDir}\``);
  lines.push(`- Gate.Test profile status: **${aggregate.meta.profileStatus}**`);
  lines.push(`- Execution environment status: **${aggregate.meta.environmentStatus}**`);
  lines.push(`- No Cloud/D1 Write: ${aggregate.meta.noCloudD1Write}`);
  lines.push(`- Overall: **${aggregate.overall}**`);
  lines.push('');
  if (aggregate.unitEvidence) {
    lines.push('## Unit Evidence');
    lines.push('');
    for (const [k, v] of Object.entries(aggregate.unitEvidence)) {
      lines.push(`- ${k}: ${v}`);
    }
    lines.push('');
  }
  lines.push('## Scenario Results');
  lines.push('');
  lines.push('| Scenario | Mode | Result | JSON | MD |');
  lines.push('|---|---|---|---|---|');
  for (const row of aggregate.scenarios) {
    lines.push(`| ${row.name} | ${row.mode} | ${row.result} | ${row.jsonReport || 'N/A'} | ${row.mdReport || 'N/A'} |`);
  }
  lines.push('');
  lines.push('## Runtime Metrics');
  lines.push('');
  if (aggregate.runtimeMetrics?.runtimeIdentity) {
    lines.push(`- runtime.id: ${aggregate.runtimeMetrics.runtimeIdentity.runtimeId}`);
    lines.push(`- manifest.name: ${aggregate.runtimeMetrics.runtimeIdentity.manifestName}`);
    lines.push(`- manifest.version: ${aggregate.runtimeMetrics.runtimeIdentity.manifestVersion}`);
    lines.push(`- manifest.manifest_version: ${aggregate.runtimeMetrics.runtimeIdentity.manifestManifestVersion}`);
    lines.push(`- runtime.baseUrl: ${aggregate.runtimeMetrics.runtimeIdentity.runtimeBaseUrl}`);
  }
  if (aggregate.runtimeMetrics?.extensionLoad) {
    lines.push(`- extension root: ${aggregate.runtimeMetrics.extensionLoad.extensionRoot}`);
  }
  if (aggregate.runtimeMetrics?.activeServiceWorker) {
    lines.push(`- active SW diagnostics: ${JSON.stringify(aggregate.runtimeMetrics.activeServiceWorker)}`);
  }
  if (aggregate.runtimeMetrics?.sourceChecks) {
    lines.push(`- sourceChecks: ${JSON.stringify(aggregate.runtimeMetrics.sourceChecks)}`);
  }
  if (aggregate.runtimeMetrics?.localSourceChecks) {
    lines.push(`- localSourceChecks: ${JSON.stringify(aggregate.runtimeMetrics.localSourceChecks)}`);
  }
  if (aggregate.runtimeMetrics?.routeProbes) {
    lines.push(`- routeProbes: ${JSON.stringify(aggregate.runtimeMetrics.routeProbes)}`);
  }
  if (aggregate.runtimeMetrics?.swReloadActivation) {
    lines.push(`- swReloadActivation: ${JSON.stringify(aggregate.runtimeMetrics.swReloadActivation)}`);
  }
  if (aggregate.runtimeMetrics?.routePreflight) {
    lines.push(`- routePreflight: ${JSON.stringify(aggregate.runtimeMetrics.routePreflight)}`);
  }
  if (aggregate.runtimeMetrics?.cdpTargets) {
    lines.push(`- cdpTargets: ${JSON.stringify(aggregate.runtimeMetrics.cdpTargets)}`);
  }
  const c = aggregate.runtimeMetrics?.checks || {};
  lines.push(`- event_log_v1 readable: ${c.event_log_v1_readable}`);
  lines.push(`- session_v1 readable: ${c.session_v1_readable}`);
  lines.push(`- local stats readable: ${c.local_stats_readable}`);
  lines.push(`- GET_STATS readable: ${c.get_stats_readable}`);
  lines.push(`- GET_STATS_RANGE readable: ${c.get_stats_range_readable}`);
  lines.push(`- GET_TIMELINE_SEGMENTS readable: ${c.get_timeline_segments_readable}`);
  lines.push(`- v1Sync readable: ${c.v1_sync_readable}`);
  lines.push(`- CLOUD_FORCE_SYNC: ${aggregate.runtimeMetrics?.samples?.cloudForceSync?.status || 'N/A'}`);
  lines.push(`- timeline diagnostics: ${aggregate.runtimeMetrics?.diagnostics?.timelineSegmentsStatus || 'N/A'}`);
  lines.push(`- v1Sync diagnostics: ${aggregate.runtimeMetrics?.diagnostics?.v1SyncStatus || 'N/A'}`);
  lines.push(`- dispatch status: ${aggregate.runtimeMetrics?.diagnostics?.dispatchStatus || 'N/A'}`);
  if (aggregate.runtimeMetrics?.samples?.timelineRawSummary) {
    lines.push(`- GET_TIMELINE_SEGMENTS raw summary: ${JSON.stringify(aggregate.runtimeMetrics.samples.timelineRawSummary)}`);
  }
  if (aggregate.runtimeMetrics?.samples?.cloudStatusSummary) {
    lines.push(`- GET_CLOUD_STATUS raw summary: ${JSON.stringify(aggregate.runtimeMetrics.samples.cloudStatusSummary)}`);
  }
  lines.push('');
  lines.push('## Operator Prompts');
  lines.push('');
  for (const p of aggregate.operatorPrompts) lines.push(`- ${p}`);
  lines.push('');
  fs.writeFileSync(mdPath, lines.join('\n'), 'utf-8');
  return { jsonPath, mdPath };
}

async function main() {
  const args = parseArgs(process.argv);
  const profileDir = path.resolve(args.profileDir);
  let effectiveProfileDir = profileDir;
  const outputDir = path.resolve(args.outputDir);
  const scenarios = [];
  const profileExists = fs.existsSync(profileDir);
  let environmentStatus = 'READY_OR_UNKNOWN';

  const operatorPrompts = [
    'Windows lock/unlock: run with --allowWorkstationLock only when operator is ready to unlock manually.',
    'Sleep/Wake: run sleep-wake only at the end on a physical machine; operator must wake system manually.',
    'Network offline/online: use manual network toggle flow and restore connectivity on prompt.',
  ];

  fs.mkdirSync(outputDir, { recursive: true });

  if (!profileExists) {
    scenarios.push({
      name: 'gate-test-profile-preflight',
      mode: 'fully',
      result: 'BLOCKED',
      reason: `Gate.Test profile not found: ${profileDir}`,
      jsonReport: null,
      mdReport: null,
    });
  } else {
    try {
      effectiveProfileDir = makeRunProfileClone(profileDir);
    } catch (e) {
      effectiveProfileDir = profileDir;
      operatorPrompts.push(`Profile clone failed, fallback to source profile: ${e.message}`);
    }
    try {
      const dry = await runDryRun({ verbose: args.verbose, outputDir, userDataDir: effectiveProfileDir });
      scenarios.push(toScenarioRow('dry-run', 'fully', dry));
    } catch (e) {
      environmentStatus = 'BLOCKED_SPAWN_EPERM';
      scenarios.push({ name: 'dry-run', mode: 'fully', result: 'BLOCKED', reason: e.message, jsonReport: null, mdReport: null });
    }

    try {
      const restart = await runChromeRestart({
        preActiveSeconds: 60,
        closedSeconds: 120,
        postRestartSeconds: 30,
        verbose: args.verbose,
        outputDir,
        userDataDir: effectiveProfileDir,
      });
      scenarios.push(toScenarioRow('chrome-close-reopen', 'fully', restart));
    } catch (e) {
      environmentStatus = 'BLOCKED_SPAWN_EPERM';
      scenarios.push({ name: 'chrome-close-reopen', mode: 'fully', result: 'BLOCKED', reason: e.message, jsonReport: null, mdReport: null });
    }

    try {
      const runtimeMetrics = await collectRuntimeMetrics({
        userDataDir: effectiveProfileDir,
        allowCloudForceSync: args.allowCloudForceSync,
      });
      fs.writeFileSync(path.join(outputDir, `runtime-metrics-${ts()}.json`), JSON.stringify(runtimeMetrics, null, 2), 'utf-8');
      if (!runtimeMetrics.checks.get_stats_readable) {
        environmentStatus = environmentStatus === 'BLOCKED_SPAWN_EPERM' ? environmentStatus : 'READY_OR_UNKNOWN';
      }
      var metrics = runtimeMetrics; // eslint-disable-line no-var
    } catch (e) {
      environmentStatus = 'BLOCKED_SPAWN_EPERM';
      var metrics = { blocked: true, reason: e.message, checks: {}, samples: {} }; // eslint-disable-line no-var
    }

    if (args.includeManualPreflight) {
      try {
        const net = await runNetworkOffline({
          verbose: args.verbose,
          outputDir,
          userDataDir: effectiveProfileDir,
          allowNetworkToggle: args.allowNetworkToggle,
          manualNetworkToggle: args.manualNetworkToggle,
          networkAdapterName: args.networkAdapterName,
        });
        scenarios.push(toScenarioRow('network-offline-online', 'partially', net));
      } catch (e) {
        scenarios.push({ name: 'network-offline-online', mode: 'partially', result: 'BLOCKED', reason: e.message, jsonReport: null, mdReport: null });
      }

      try {
        const lock = await runLockUnlock({
          verbose: args.verbose,
          outputDir,
          userDataDir: effectiveProfileDir,
          allowWorkstationLock: args.allowWorkstationLock,
        });
        scenarios.push(toScenarioRow('windows-lock-unlock', 'partially', lock));
      } catch (e) {
        scenarios.push({ name: 'windows-lock-unlock', mode: 'partially', result: 'BLOCKED', reason: e.message, jsonReport: null, mdReport: null });
      }
    }

    if (args.runSleepWakeManual) {
      try {
        const sleepWake = await runSleepWake({
          verbose: args.verbose,
          outputDir,
          userDataDir: effectiveProfileDir,
          allowSystemSleep: true,
        });
        scenarios.push(toScenarioRow('sleep-wake', 'partially', sleepWake));
      } catch (e) {
        scenarios.push({ name: 'sleep-wake', mode: 'partially', result: 'BLOCKED', reason: e.message, jsonReport: null, mdReport: null });
      }
    } else {
      scenarios.push({
        name: 'sleep-wake',
        mode: 'partially',
        result: 'SKIP',
        reason: 'manual sleep/wake not requested in this run',
        jsonReport: null,
        mdReport: null,
      });
    }
  }

  const aggregate = {
    meta: {
      timestamp: new Date().toISOString(),
      profileDir,
      effectiveProfileDir,
      profileStatus: profileExists ? 'PRESENT' : 'MISSING',
      environmentStatus,
      outputDir,
      noCloudD1Write: !args.allowCloudForceSync,
      executionMode: 'INLINE_NO_SPAWN',
    },
    unitEvidence: args.skipUnitEvidence ? null : {
      'tests/unit/recovery.test.js': 'Run directly via node command; see terminal evidence',
      'tests/unit/recovery-idempotent.test.js': 'Run directly via node command; see terminal evidence',
      'tests/unit/recovery-accuracy.test.js': 'Run directly via node command; see terminal evidence',
    },
    scenarios,
    runtimeMetrics: metrics || { blocked: true, reason: 'runtime metrics unavailable', checks: {}, samples: {} },
    operatorPrompts,
    overall: 'BLOCKED',
  };

  aggregate.overall = computeOverall(aggregate);
  const written = writeAggregateReport(aggregate, outputDir);

  process.stdout.write(`${JSON.stringify({
    overall: aggregate.overall,
    aggregateJson: written.jsonPath,
    aggregateMd: written.mdPath,
  }, null, 2)}\n`);
}

main().catch((err) => {
  console.error('[run-v1-minimal-gates] fatal:', err.message);
  process.exit(1);
});

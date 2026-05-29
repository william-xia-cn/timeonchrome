// checkpoint-scheduler-independence.test.js
// Run with: node tests/unit/checkpoint-scheduler-independence.test.js

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function check(desc, condition, details = '') {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  x ${desc}${details ? `: ${details}` : ''}`);
  }
}

function loadScheduler(stubs = {}) {
  const abs = path.join(__dirname, '..', '..', 'extension', 'core', 'checkpoint-scheduler.js');
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import[\s\S]*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  const keys = Object.keys(stubs);
  const prelude = keys.length ? `const { ${keys.join(', ')} } = __injected;\n` : '';
  const factory = new Function('__injected', `${prelude}${code}\nreturn { runTimingCheckpoints };`);
  return factory(stubs);
}

function installHealthStorage() {
  const data = {};
  global.chrome = {
    storage: {
      local: {
        async get(key) {
          if (Array.isArray(key)) return Object.fromEntries(key.map((k) => [k, data[k]]));
          return { [key]: data[key] };
        },
        async set(obj) {
          Object.assign(data, obj);
        },
      },
      session: {
        async get(key) {
          if (Array.isArray(key)) return Object.fromEntries(key.map((k) => [k, data[k]]));
          return { [key]: data[key] };
        },
      },
    },
  };
  return data;
}

async function run() {
  {
    const storage = installHealthStorage();
    const calls = [];
    const traces = [];
    const { runTimingCheckpoints } = loadScheduler({
      createTimingAuditId: () => 'checkpoint-audit-1',
      runPeriodicCheckpoint: async () => {
        calls.push('foreground');
        throw new Error('foreground failed');
      },
      runMediaCheckpoint: async () => {
        calls.push('media');
        return { ok: true, reason: 'periodic_checkpoint', flushedSegments: 1 };
      },
    });
    const result = await runTimingCheckpoints({
      isMonitoringEnabled: () => true,
      emitTrace: async (event, payload) => traces.push({ event, payload }),
      warn: () => {},
    });
    check('media checkpoint still runs when foreground checkpoint fails', calls.join(',') === 'foreground,media', calls.join(','));
    check('result records foreground error and media success', result.ok === false && result.foreground.ok === false && result.media.ok === true, JSON.stringify(result));
    check('media checkpoint trace is still emitted', traces.some((trace) => trace.event === 'media_checkpoint_result'));
    check('checkpoint inbound audit is emitted', traces.some((trace) => trace.event === 'timing_inbound_received' && trace.payload?.payload?.auditId === 'checkpoint-audit-1'));
    check('checkpoint result traces carry audit id', traces.some((trace) => trace.event === 'media_checkpoint_result' && trace.payload?.payload?.auditId === 'checkpoint-audit-1'));
    check('checkpoint health records foreground failure', storage.timing_checkpoint_health_v1?.foreground?.status === 'error', JSON.stringify(storage.timing_checkpoint_health_v1));
    check('checkpoint health records counters', storage.timing_checkpoint_health_v1?.counters?.before && storage.timing_checkpoint_health_v1?.counters?.after, JSON.stringify(storage.timing_checkpoint_health_v1));
  }

  {
    installHealthStorage();
    const calls = [];
    const traces = [];
    const { runTimingCheckpoints } = loadScheduler({
      createTimingAuditId: () => 'checkpoint-audit-2',
      runPeriodicCheckpoint: async () => {
        calls.push('foreground');
        return { ok: true, reason: 'periodic_checkpoint', domain: 'a.example' };
      },
      runMediaCheckpoint: async () => {
        calls.push('media');
        throw new Error('media failed');
      },
    });
    const result = await runTimingCheckpoints({
      isMonitoringEnabled: () => true,
      emitTrace: async (event, payload) => traces.push({ event, payload }),
      warn: () => {},
    });
    check('foreground checkpoint result is kept when media checkpoint fails', result.ok === false && result.foreground.ok === true && result.media.ok === false, JSON.stringify(result));
    check('foreground checkpoint trace is emitted before media failure', traces.some((trace) => trace.event === 'foreground_checkpoint_result'));
    check('checkpoint routed audit is emitted', traces.some((trace) => trace.event === 'timing_inbound_routed' && trace.payload?.payload?.route === 'foreground+media'));
  }

  {
    const storage = installHealthStorage();
    const { runTimingCheckpoints } = loadScheduler({
      createTimingAuditId: () => 'checkpoint-audit-3',
      runPeriodicCheckpoint: async () => { throw new Error('should not run'); },
      runMediaCheckpoint: async () => { throw new Error('should not run'); },
    });
    const traces = [];
    const result = await runTimingCheckpoints({
      isMonitoringEnabled: () => false,
      emitTrace: async (event, payload) => traces.push({ event, payload }),
    });
    check('scheduler respects monitoring disabled guard', result.skipped === 'monitoring_disabled');
    check('monitoring disabled checkpoint emits inbound skipped audit', traces.some((trace) => trace.event === 'timing_inbound_skipped' && trace.payload?.payload?.skippedReason === 'monitoring_disabled'));
    check('monitoring disabled writes info health', storage.timing_checkpoint_health_v1?.foreground?.status === 'info', JSON.stringify(storage.timing_checkpoint_health_v1));
  }

  {
    const storage = installHealthStorage();
    storage.usage_segments_v1 = {};
    const fallbackLogs = [];
    const { runTimingCheckpoints } = loadScheduler({
      createTimingAuditId: () => 'checkpoint-audit-gap',
      logFallbackEventBestEffort: (entry) => fallbackLogs.push(entry),
      runPeriodicCheckpoint: async () => ({
        ok: true,
        reason: 'checkpoint_estimated_open_failed',
        failureReason: 'session_save_failed',
        domain: 'youtube.com',
        checkpointed: false,
        sessionOpened: false,
      }),
      runMediaCheckpoint: async () => ({ ok: true, reason: 'interval_not_reached' }),
    });
    await runTimingCheckpoints({
      isMonitoringEnabled: () => true,
      emitTrace: async () => {},
      warn: () => {},
    });
    check('ledger gap is suspected after observed foreground without ledger', storage.timing_checkpoint_health_v1?.ledgerGap?.status === 'suspected', JSON.stringify(storage.timing_checkpoint_health_v1));
    check('ledger gap warning is logged', fallbackLogs.some((log) => log.eventCode === 'ledger_gap_suspected' && log.category === 'ledger_gap'), JSON.stringify(fallbackLogs));
    await runTimingCheckpoints({
      isMonitoringEnabled: () => true,
      emitTrace: async () => {},
      warn: () => {},
    });
    check('ledger gap is confirmed after consecutive observed foreground without ledger', storage.timing_checkpoint_health_v1?.ledgerGap?.status === 'confirmed', JSON.stringify(storage.timing_checkpoint_health_v1));
    check('ledger gap error is logged', fallbackLogs.some((log) => log.eventCode === 'ledger_gap_confirmed' && log.level === 'error'), JSON.stringify(fallbackLogs));
  }

  {
    const storage = installHealthStorage();
    const fallbackLogs = [];
    const { runTimingCheckpoints } = loadScheduler({
      createTimingAuditId: () => 'checkpoint-audit-benign',
      logFallbackEventBestEffort: (entry) => fallbackLogs.push(entry),
      runPeriodicCheckpoint: async () => ({
        ok: true,
        reason: 'no_active_tab',
      }),
      runMediaCheckpoint: async () => ({ ok: true, reason: 'no_media_sessions' }),
    });
    await runTimingCheckpoints({
      isMonitoringEnabled: () => true,
      emitTrace: async () => {},
      warn: () => {},
    });
    check('benign checkpoint skip is health info', storage.timing_checkpoint_health_v1?.foreground?.status === 'info', JSON.stringify(storage.timing_checkpoint_health_v1));
    check('benign checkpoint skip does not write warning/error logs', fallbackLogs.length === 0, JSON.stringify(fallbackLogs));
  }

  const total = passed + failed;
  console.log(`\n[Checkpoint Scheduler Independence] ${passed}/${total} passed${failed ? ' FAILED' : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

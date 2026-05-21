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
  const keys = Object.keys(stubs);
  const prelude = keys.length ? `const { ${keys.join(', ')} } = __injected;\n` : '';
  const factory = new Function('__injected', `${prelude}${code}\nreturn { runTimingCheckpoints };`);
  return factory(stubs);
}

async function run() {
  {
    const calls = [];
    const traces = [];
    const { runTimingCheckpoints } = loadScheduler({
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
  }

  {
    const calls = [];
    const traces = [];
    const { runTimingCheckpoints } = loadScheduler({
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
  }

  {
    const { runTimingCheckpoints } = loadScheduler({
      runPeriodicCheckpoint: async () => { throw new Error('should not run'); },
      runMediaCheckpoint: async () => { throw new Error('should not run'); },
    });
    const result = await runTimingCheckpoints({ isMonitoringEnabled: () => false });
    check('scheduler respects monitoring disabled guard', result.skipped === 'monitoring_disabled');
  }

  const total = passed + failed;
  console.log(`\n[Checkpoint Scheduler Independence] ${passed}/${total} passed${failed ? ' FAILED' : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

// timing-trace-budget.test.js
// Run with: node tests/unit/timing-trace-budget.test.js

'use strict';

const fs = require('fs');
const path = require('path');

const data = {};
global.chrome = {
  storage: {
    session: {
      async get(key) { return { [key]: data[key] }; },
      async set(items) { Object.assign(data, items); },
    },
    local: {
      async get(key) { return { [key]: data[key] }; },
      async set(items) { Object.assign(data, items); },
    },
  },
};

function loadTrace() {
  const file = path.join(__dirname, '..', '..', 'extension', 'core', 'timing-trace.js');
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  return new Function(`${code}\nreturn { emitTrace, getTrace, inboundAuditFields };`)();
}

function check(label, condition, details = '') {
  if (!condition) throw new Error(`${label}${details ? `: ${details}` : ''}`);
}

async function run() {
  const traceApi = loadTrace();
  for (let index = 0; index < 260; index++) {
    await traceApi.emitTrace('unit_trace', {
      url: `https://example.com/private/${index}`,
      domain: 'example.com',
      sessionBefore: { state: 'ACTIVE', domain: 'example.com', huge: 's'.repeat(4096) },
      statsBefore: { rows: 'x'.repeat(8192) },
      payload: { index, title: 'private title', detail: 'p'.repeat(4096) },
    });
  }
  const trace = await traceApi.getTrace();
  const bytes = new TextEncoder().encode(JSON.stringify(trace)).length;
  check('trace is capped by entry count', trace.length <= 200, String(trace.length));
  check('trace is capped by byte size', bytes <= 512 * 1024, String(bytes));
  check('trace does not retain full URL', trace.every((entry) => entry.url == null));
  check('trace drops large stats snapshots', trace.every((entry) => entry.statsBefore == null && entry.statsAfter == null));
  check('trace redacts text-bearing payload fields', trace.every((entry) => entry.payload?.title === '[redacted]'));
  check('inbound audit fields do not retain URL', traceApi.inboundAuditFields({ url: 'https://example.com/private' }).url == null);
  console.log('[Timing Trace Budget] 6/6 passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

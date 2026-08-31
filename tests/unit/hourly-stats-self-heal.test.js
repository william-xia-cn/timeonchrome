// Run with: node tests/unit/hourly-stats-self-heal.test.js

'use strict';

const fs = require('fs');
const path = require('path');

function extractFunctionSource(code, name) {
  const marker = `function ${name}(`;
  const asyncMarker = `async function ${name}(`;
  const start = code.indexOf(asyncMarker) >= 0 ? code.indexOf(asyncMarker) : code.indexOf(marker);
  if (start < 0) throw new Error(`${name} not found`);
  const braceStart = code.indexOf('{', code.indexOf(')', start));
  let depth = 0;
  for (let index = braceStart; index < code.length; index++) {
    if (code[index] === '{') depth++;
    if (code[index] === '}') {
      depth--;
      if (depth === 0) return code.slice(start, index + 1);
    }
  }
  throw new Error(`${name} parse failed`);
}

function loadPrepare(injected) {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'cloud-sync.js'), 'utf8');
  const source = [
    extractFunctionSource(code, 'sumObjectSeconds'),
    extractFunctionSource(code, 'sumStatsDomainsSeconds'),
    extractFunctionSource(code, 'sumTargetPayloadSeconds'),
    extractFunctionSource(code, 'prepareHourlyUsagePayloads'),
  ].join('\n');
  const names = Object.keys(injected);
  return new Function('__injected', `const { ${names.join(', ')} } = __injected;\n${source}\nreturn prepareHourlyUsagePayloads;`)(injected);
}

function loadNoOpClear(injected) {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'cloud-sync.js'), 'utf8');
  const source = extractFunctionSource(code, 'clearNoOpHourlyStats');
  const names = Object.keys(injected);
  return new Function('__injected', `const { ${names.join(', ')} } = __injected;\n${source}\nreturn clearNoOpHourlyStats;`)(injected);
}

function check(label, condition, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
}

(async () => {
  let rebuilt = 0;
  let generation = 0;
  const prepareRecovered = loadPrepare({
    buildHourlyStatsUploadPayload: async (hourKey) => generation === 0
      ? { hourKey, domains: [] }
      : { hourKey, domains: [{ domain: 'example.com', rows: [{ durationSeconds: 180 }] }] },
    buildHourlyTargetStatsUploadPayload: async (hourKey) => generation === 0
      ? { hourKey, targets: [] }
      : { hourKey, targets: [{ targetKey: 'fallback:domain:example.com', rows: [{ durationSeconds: 180 }] }] },
    rebuildHourlyUsageStats: async () => { rebuilt++; generation++; },
  });
  const recovered = await prepareRecovered('2026-08-31T15');
  check('corrupt empty materialization rebuilds once', rebuilt === 1, String(rebuilt));
  check('positive rebuilt hour is uploadable', recovered.noOp === false);
  check('rebuilt domain payload is returned', recovered.statsPayload.domains.length === 1);
  check('rebuilt target payload is returned', recovered.targetPayload.targets.length === 1);

  rebuilt = 0;
  const prepareNoOp = loadPrepare({
    buildHourlyStatsUploadPayload: async (hourKey) => ({ hourKey, domains: [] }),
    buildHourlyTargetStatsUploadPayload: async (hourKey) => ({ hourKey, targets: [] }),
    rebuildHourlyUsageStats: async (_hourKey, options) => {
      rebuilt++;
      check('empty rebuild requests forceWriteEmpty', options?.forceWriteEmpty === true);
    },
  });
  const noOp = await prepareNoOp('2026-08-30T04');
  check('zero-only hour rebuilds once', rebuilt === 1, String(rebuilt));
  check('zero-only rebuilt hour becomes no-op', noOp.noOp === true);

  const hourlyAck = [];
  const targetAck = [];
  const clearNoOp = loadNoOpClear({
    prepareHourlyUsagePayloads: async () => ({ noOp: true }),
    markHourlyStatsUploaded: async (keys) => hourlyAck.push(...keys),
    markHourlyTargetStatsUploaded: async (keys) => targetAck.push(...keys),
  });
  const cleared = await clearNoOp(['2026-08-30T04']);
  check('retry-exhausted no-op clears both outboxes', cleared.length === 1 && hourlyAck.length === 1 && targetAck.length === 1);

  const cloudSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'cloud-sync.js'), 'utf8');
  const hourlyUpload = extractFunctionSource(cloudSource, 'uploadHourlyStatsV1');
  check('no-op healing runs before exhausted rejection', hourlyUpload.indexOf('clearNoOpHourlyStats') < hourlyUpload.indexOf('batchHourKeys.length === 0 && exhaustedHourKeys.length > 0'));

  console.log('[Hourly Stats Self-Heal] 9/9 passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

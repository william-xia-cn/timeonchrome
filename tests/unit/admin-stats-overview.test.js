// admin-stats-overview.test.js
// Run with: node tests/unit/admin-stats-overview.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function expectEqual(desc, actual, expected) {
  if (actual === expected) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc} (actual=${String(actual)}, expected=${String(expected)})`);
  }
}

function extractFunctionSource(code, functionName) {
  const marker = `function ${functionName}(`;
  const start = code.indexOf(marker);
  if (start < 0) throw new Error(`function ${functionName} not found`);
  const braceStart = code.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return code.slice(start, i + 1);
      }
    }
  }
  throw new Error(`function ${functionName} parse failed`);
}

function loadComputeOverview() {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'admin', 'admin.js'), 'utf8');
  const fns = [
    extractFunctionSource(code, 'matchDomain'),
    extractFunctionSource(code, 'classifyDomain'),
    extractFunctionSource(code, 'computeOverview')
  ];
  const context = { URL, console, config: { studyList: [], compositeList: [] } };
  vm.runInNewContext(
    fns.join('\n') + '\nthis.__fn = computeOverview;',
    context,
    { filename: 'admin.js' }
  );
  return { fn: context.__fn, ctx: context };
}

function run() {
  const { fn: computeOverview, ctx } = loadComputeOverview();

  // Helper to call with vm context as `this`
  function call(data) {
    return computeOverview.call(ctx, data);
  }

  // Case 1: audioSeconds=30, pipSeconds=20 => background media = 50
  const r1 = call({ audioSeconds: 30, pipSeconds: 20, domainStats: {} });
  expectEqual('audio=30 + pip=20 => background media 50s', r1.audio, 50);

  // Case 2: audioSeconds=0, pipSeconds=15 => background media = 15
  const r2 = call({ audioSeconds: 0, pipSeconds: 15, domainStats: {} });
  expectEqual('audio=0 + pip=15 => background media 15s', r2.audio, 15);

  // Case 3: audioSeconds=10, pipSeconds missing => background media = 10
  const r3 = call({ audioSeconds: 10, domainStats: {} });
  expectEqual('audio=10 + pip=missing => background media 10s', r3.audio, 10);

  // Case 4: both missing => background media = 0
  const r4 = call({ domainStats: {} });
  expectEqual('audio=missing + pip=missing => background media 0s', r4.audio, 0);

  const total = passed + failed;
  console.log(`\n[Admin Stats Overview] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

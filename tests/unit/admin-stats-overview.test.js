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

function expectTrue(desc, value) {
  if (value) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
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
    extractFunctionSource(code, 'isStatsMetaKey'),
    extractFunctionSource(code, 'readCompositeSeconds'),
    extractFunctionSource(code, 'computeOverview'),
    extractFunctionSource(code, 'renderOverviewList')
  ];
  const elements = {};
  const context = {
    URL,
    console,
    config: { studyList: [], compositeList: [] },
    formatSeconds: (seconds) => `${seconds}s`,
    document: {
      getElementById: (id) => {
        if (!elements[id]) elements[id] = {
          innerHTML: '',
          disabled: false,
          textContent: '',
          addEventListener: () => {},
        };
        return elements[id];
      },
    },
  };
  vm.runInNewContext(
    fns.join('\n') + '\nthis.__fn = computeOverview; this.__render = renderOverviewList;',
    context,
    { filename: 'admin.js' }
  );
  return { fn: context.__fn, render: context.__render, ctx: context, elements, code };
}

function run() {
  const { fn: computeOverview, render, ctx, elements, code } = loadComputeOverview();

  // Helper to call with vm context as `this`
  function call(data) {
    return computeOverview.call(ctx, data);
  }

  // Case 1: PiP is domain-related; background media overview uses backgroundMedia only.
  const r1 = call({ audioSeconds: 30, pipSeconds: 20, domainStats: {} });
  expectEqual('audio=30 + pip=20 => background media 30s', r1.audio, 30);
  expectEqual('audio=30 + pip=20 => PiP 20s', r1.pip, 20);

  // Case 2: PiP alone should not inflate the background media overview.
  const r2 = call({ audioSeconds: 0, pipSeconds: 15, domainStats: {} });
  expectEqual('audio=0 + pip=15 => background media 0s', r2.audio, 0);
  expectEqual('audio=0 + pip=15 => PiP 15s', r2.pip, 15);

  // Case 3: audioSeconds=10, pipSeconds missing => background media = 10
  const r3 = call({ audioSeconds: 10, domainStats: {} });
  expectEqual('audio=10 + pip=missing => background media 10s', r3.audio, 10);

  // Case 4: both missing => background media = 0
  const r4 = call({ domainStats: {} });
  expectEqual('audio=missing + pip=missing => background media 0s', r4.audio, 0);
  expectEqual('audio=missing + pip=missing => PiP 0s', r4.pip, 0);

  ctx.config = { studyList: ['study.example'], compositeList: ['video.example'] };
  const r5 = call({ domainStats: { 'study.example': 100, 'video.example': 200, 'other.example': 300 } });
  expectEqual('domain fallback: compositeList maps to composite seconds', r5.composite, 200);
  expectEqual('domain fallback: composite seconds are not counted as rest', r5.rest, 300);

  const r6 = call({ compositeSeconds: 240, domainStats: { 'other.example': 300 } });
  expectEqual('explicit compositeSeconds has priority', r6.composite, 240);
  expectEqual('explicit compositeSeconds excluded from rest', r6.rest, 60);

  const r7 = call({ undeterminedSeconds: 180, domainStats: { 'other.example': 300 } });
  expectEqual('legacy undeterminedSeconds is read as composite', r7.composite, 180);
  expectEqual('legacy undeterminedSeconds excluded from rest', r7.rest, 120);

  render.call(ctx, 'overview-test', { online: 100, study: 20, rest: 30, audio: 40, pip: 50, composite: 10 });
  const overviewHtml = elements['overview-test'].innerHTML;
  expectTrue('renderOverviewList includes background media row', overviewHtml.includes('后台媒体'));
  expectTrue('renderOverviewList includes PiP row', overviewHtml.includes('PiP'));

  expectTrue('admin stats calls suspect summary message', code.includes("GET_SUSPECT_SEGMENT_SUMMARY"));
  expectTrue('admin stats exposes suspect maintenance action', code.includes('标记并重建本地统计'));
  expectTrue('admin stats explains active over 3h reason', code.includes('active 超过 3 小时'));
  expectTrue('admin stats has clean suspect state text', code.includes('未发现'));

  const total = passed + failed;
  console.log(`\n[Admin Stats Overview] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

// popup-match-domain-v12-alignment.test.js
// Run with: node tests/unit/popup-match-domain-v12-alignment.test.js

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

function loadPopupMatchDomain() {
  const code = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'popup', 'popup.js'), 'utf8');
  const fnSource = extractFunctionSource(code, 'matchDomain');
  const context = { URL, this: null };
  context.this = context;
  vm.runInNewContext(`${fnSource}\nthis.__fn = matchDomain;`, context, { filename: 'popup.js' });
  return context.__fn;
}

function run() {
  const matchDomain = loadPopupMatchDomain();

  expectEqual('a.example.com vs example.com = false', matchDomain('a.example.com', 'example.com'), false);
  expectEqual('a.example.com vs *.example.com = true', matchDomain('a.example.com', '*.example.com'), true);
  expectEqual('example.com vs *.example.com = false', matchDomain('example.com', '*.example.com'), false);
  expectEqual('www.example.com vs example.com = true', matchDomain('www.example.com', 'example.com'), true);
  expectEqual('example.com vs www.example.com = true', matchDomain('example.com', 'www.example.com'), true);
  expectEqual('m.example.com vs example.com = true', matchDomain('m.example.com', 'example.com'), true);
  expectEqual('example.com vs m.example.com = true', matchDomain('example.com', 'm.example.com'), true);

  const total = passed + failed;
  console.log(`\n[Popup MatchDomain v1.2 Alignment] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

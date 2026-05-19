// Checkpoint media query slimming guards
// Run with: node tests/unit/checkpoint-media-query-slimming.test.js

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function expectTrue(desc, cond) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  x ${desc}`);
  }
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) return '';
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

function run() {
  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', '..', 'background.js'), 'utf8');
  const foregroundSource = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'foreground-timing.js'), 'utf8');
  const mediaSource = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'media-timing.js'), 'utf8');
  const confirmBody = functionBody(foregroundSource, 'confirmForegroundPageCheckpoint');

  expectTrue('background no longer imports getMediaFacts', !/getMediaFacts/.test(backgroundSource));
  expectTrue('checkpoint no longer uses all-window foreground media scan', !/queryForegroundMediaFacts/.test(confirmBody));
  expectTrue('background no longer calls windows.getAll for checkpoint media scan', !/windows\.getAll/.test(backgroundSource));
  expectTrue('periodic checkpoint no longer refreshes all media facts first', !/periodic_checkpoint_media_refresh|refreshStoredMediaFacts/.test(backgroundSource + mediaSource));
  expectTrue('targeted media helper remains tabId based', /queryKnownForegroundMediaFacts/.test(foregroundSource) && /queryTabMediaFact\(tabId/.test(mediaSource));

  const total = passed + failed;
  console.log(`\n[Checkpoint Media Query Slimming] ${passed}/${total} passed${failed ? ' FAILED' : ''}`);
  if (failed > 0) process.exit(1);
}

run();

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
  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'background.js'), 'utf8');
  const foregroundSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'foreground-timing.js'), 'utf8');
  const mediaSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'media-timing.js'), 'utf8');
  const confirmBody = functionBody(foregroundSource, 'confirmForegroundPageCheckpoint');
  const enrichBody = functionBody(foregroundSource, 'enrichContextWithForegroundMedia');

  expectTrue('background no longer imports getMediaFacts', !/getMediaFacts/.test(backgroundSource));
  expectTrue('checkpoint no longer uses all-window foreground media scan', !/queryForegroundMediaFacts/.test(confirmBody));
  expectTrue('background no longer calls windows.getAll for checkpoint media scan', !/windows\.getAll/.test(backgroundSource));
  expectTrue('periodic checkpoint no longer refreshes all media facts first', !/periodic_checkpoint_media_refresh|refreshStoredMediaFacts/.test(backgroundSource + mediaSource));
  expectTrue('foreground checkpoint legacy media compensation uses unified open-session helper', /queryForegroundMediaForOpenSession\(session,\s*'checkpoint_session_media_query'\)/.test(confirmBody) && /foreground_media_compensated|mediaCompensation/.test(confirmBody));
  expectTrue('foreground checkpoint media compensation does not query observed active tab media', !/checkpoint_active_tab_media_query|tabId:\s*tab\?\.id/.test(confirmBody));
  expectTrue('foreground checkpoint no longer builds media candidate arrays', !/queryKnownForegroundMediaFacts|\[\s*\{\s*tabId/.test(confirmBody));
  expectTrue('event enrichment uses open session helper instead of previous context candidates', /getTimingSession\(\)/.test(enrichBody) && /queryForegroundMediaForOpenSession\(\s*openSession/.test(enrichBody) && !/foreground_media_previous_context_query|previousContext\?\.mediaSourceTabId|queryKnownForegroundMediaFacts/.test(enrichBody));
  expectTrue('media helper has explicit foreground open-session entrypoint', /queryForegroundMediaForOpenSession/.test(mediaSource) && /queryTabMediaFact\(sessionTabId/.test(mediaSource));

  const total = passed + failed;
  console.log(`\n[Checkpoint Media Query Slimming] ${passed}/${total} passed${failed ? ' FAILED' : ''}`);
  if (failed > 0) process.exit(1);
}

run();

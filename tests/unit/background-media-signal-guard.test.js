// Static guard: media facts must not enter foreground usage settlement.
// Run with: node tests/unit/background-media-signal-guard.test.js

'use strict';

const fs = require('fs');
const path = require('path');

const backgroundSource = fs.readFileSync(path.join(__dirname, '..', '..', 'background.js'), 'utf8');
const dispatcherSource = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'timing-dispatcher.js'), 'utf8');
const mediaSource = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'media-timing.js'), 'utf8');
const foregroundSource = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'foreground-timing.js'), 'utf8');

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    console.log(`PASS: ${name}`);
    passed++;
  } else {
    console.error(`FAIL: ${name}`);
    failed++;
  }
}

const guardIndex = mediaSource.indexOf('function isMediaOnlyTimingSignal');
const skipIndex = foregroundSource.indexOf('if (options.isMediaOnlySignal === true)');
const stateIndex = foregroundSource.indexOf('const state = resolveState(currentContext)');
const transitionBeginIndex = foregroundSource.indexOf("await emitTrace('transition_begin'");

check('media-only timing guard exists', guardIndex >= 0);
check('guard explicitly treats tabAudible as media-only', /reason === 'tabAudible'/.test(mediaSource));
check('guard explicitly treats mediaState as media-only', /reason === 'mediaState'/.test(mediaSource));
check('guard treats mediaFactSource as media-only', /rawEvent\?\.mediaFactSource/.test(mediaSource));
check('media-only skip happens before resolveState', skipIndex >= 0 && skipIndex < stateIndex);
check('media-only skip happens before transition_begin', skipIndex >= 0 && skipIndex < transitionBeginIndex);
check('media-only skip uses diagnostic trace', /media_signal_foreground_unchanged/.test(foregroundSource));
check('dispatcher fans out media observation before foreground processing', dispatcherSource.lastIndexOf('observeMediaFromSignal') < dispatcherSource.lastIndexOf('processForegroundSignal'));
check('background delegates normalized signals to dispatcher', /initSignal\(\(rawEvent\) => dispatchTimingSignal/.test(backgroundSource));

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`\n${passed} passed`);

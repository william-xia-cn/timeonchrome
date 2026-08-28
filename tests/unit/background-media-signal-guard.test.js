// Static guard: media facts must not enter foreground usage settlement.
// Run with: node tests/unit/background-media-signal-guard.test.js

'use strict';

const fs = require('fs');
const path = require('path');

const backgroundSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'background.js'), 'utf8');
const dispatcherSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'timing-dispatcher.js'), 'utf8');
const mediaSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'media-timing.js'), 'utf8');
const foregroundSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'foreground-timing.js'), 'utf8');

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
const dispatcherMediaSkipIndex = dispatcherSource.indexOf("reason: 'media_signal_foreground_unchanged'");
const dispatcherForegroundIndex = dispatcherSource.indexOf('processForegroundSignal(auditedEvent');

check('media-only timing guard exists', guardIndex >= 0);
check('guard explicitly treats tabAudible as media-only', /reason === 'tabAudible'/.test(mediaSource));
check('guard explicitly treats mediaState as media-only', /reason === 'mediaState'/.test(mediaSource));
check('guard treats mediaFactSource as media-only', /rawEvent\?\.mediaFactSource/.test(mediaSource));
check('media-only skip happens in dispatcher before foreground processing', dispatcherMediaSkipIndex >= 0 && dispatcherMediaSkipIndex < dispatcherForegroundIndex);
check('media-only skip uses diagnostic result', /media_signal_foreground_unchanged/.test(dispatcherSource));
check('only content mediaState may enter bounded webpage continuation', /rawEvent\?\._reason === 'mediaState'[\s\S]{0,180}processForegroundMediaContinuationSignal/.test(dispatcherSource));
check('bounded media continuation requires an existing active webpage session', /session\?\.state !== 'ACTIVE'[\s\S]{0,180}no_matching_active_web_session/.test(foregroundSource));
check('foreground module keeps only unified legacy media query helper, not media ledger mutators', /queryForegroundMediaForOpenSession/.test(foregroundSource) && !/applyMediaFacts|closeMediaForTab|media_segments_v1/.test(foregroundSource));
check('dispatcher observes media before optional foreground processing', dispatcherSource.lastIndexOf('observeMediaFromSignal') < dispatcherSource.lastIndexOf('processForegroundSignal'));
check('background delegates normalized signals to dispatcher',
  /initSignal\(\(rawEvent\) => \{[\s\S]{0,160}dispatchTimingSignal\(rawEvent/.test(backgroundSource));

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`\n${passed} passed`);

// timing-decoupling-structure.test.js
// Run with: node tests/unit/timing-decoupling-structure.test.js

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function check(desc, condition) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  x ${desc}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
}

const background = read('background.js');
const dispatcher = read('core/timing-dispatcher.js');
const foreground = read('core/foreground-timing.js');
const media = read('core/media-timing.js');
const scheduler = read('core/checkpoint-scheduler.js');

check('background delegates timing signal processing to dispatcher', background.includes('dispatchTimingSignal') && !background.includes('async function processTimingSignal'));
check('background does not directly import media ledger mutators', !/applyMediaFacts|runMediaPeriodicCheckpoint|getMediaFact/.test(background));
check('background does not contain foreground context state machine internals', !/buildContext|resolveState|appliedForegroundBoundary|pendingForegroundGapDiagnostic/.test(background));
check('dispatcher imports both independent consumers', dispatcher.includes('processForegroundSignal') && dispatcher.includes('observeMediaFromSignal'));
check('dispatcher classifies media-only signals', dispatcher.includes('classifyTimingSignal') && dispatcher.includes('mediaOnly'));
check('foreground module does not import media ledger mutators', !/applyMediaFacts|closeMediaForTab|media_segments_v1/.test(foreground));
check('foreground module owns foreground session transitions', /transitionStateAt/.test(foreground) && /resolveState/.test(foreground));
check('media module does not touch foreground usage ledger', !/transitionStateAt|usage_segments_v1/.test(media));
check('media module owns media ledger mutators', /applyMediaFacts/.test(media) && /closeMediaForTab/.test(media));
check('checkpoint scheduler has independent foreground and media try blocks', /foreground checkpoint failed/.test(scheduler) && /media checkpoint failed/.test(scheduler));

const total = passed + failed;
console.log(`\n[Timing Decoupling Structure] ${passed}/${total} passed${failed ? ' FAILED' : ''}`);
if (failed > 0) process.exit(1);

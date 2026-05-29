// timing-inbound-audit.test.js
// Run with: node tests/unit/timing-inbound-audit.test.js

'use strict';

const fs = require('fs');
const path = require('path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
}

function check(name, condition, details = '') {
  if (!condition) throw new Error(`${name}${details ? `: ${details}` : ''}`);
}

const signal = read('extension/core/signal.js');
const dispatcher = read('extension/core/timing-dispatcher.js');
const scheduler = read('extension/core/checkpoint-scheduler.js');
const session = read('extension/runtime/session.js');
const recovery = read('extension/runtime/recovery.js');
const foreground = read('extension/core/foreground-timing.js');
const media = read('extension/core/media-timing.js');

check('raw chrome signal listener layer does not write inbound audit', !/timing_inbound_(received|routed|skipped)/.test(signal));
check('dispatcher owns normalized signal inbound audit', /timing_inbound_received/.test(dispatcher) && /timing_inbound_skipped/.test(dispatcher));
check('checkpoint scheduler owns timer inbound audit', /timing_inbound_received/.test(scheduler) && /timing_inbound_routed/.test(scheduler));
check('flush action path owns action inbound audit', /action_flush/.test(session) && /timing_inbound_received/.test(session));
check('recovery lifecycle path owns recovery inbound audit', /lifecycle_recovery/.test(recovery) && /timing_inbound_received/.test(recovery));
check('foreground consumer does not duplicate inbound received audit', !/timing_inbound_received/.test(foreground));
check('media consumer does not duplicate inbound received audit', !/timing_inbound_received/.test(media));

console.log('[Timing Inbound Audit] 7/7 passed');

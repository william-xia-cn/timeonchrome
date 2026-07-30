// classification-effective-boundary.test.js
// Run with: node tests/unit/classification-effective-boundary.test.js

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

const helper = read('extension/core/classification-effective-boundary.js');
const session = read('extension/runtime/session.js');
const cloudSync = read('extension/infra/cloud-sync.js');
const background = read('extension/background.js');
const messageRouter = read('extension/message-router.js');

check('helper exports classification sync effects runner', helper.includes('export async function runClassificationSyncEffects'));
check('helper applies dedicated classification boundary', helper.includes("transitionStateAt('ACTIVE'") && helper.includes('classification_effective_boundary'));
check('helper compares current session target snapshot before splitting', helper.includes('sessionTargetDiffers') && helper.includes('targetClassificationAtTime'));
check('helper logs approved request without effective rule', helper.includes('site_classification_approved_rule_missing') && helper.includes('approved_request_without_effective_rule'));
check('session allows classification boundary settlement', session.includes("reason === 'classification_effective_boundary'"));
check('session records classification boundary as config action', session.includes("if (value === 'classification_effective_boundary') return 'config_action';"));
check('cloud sync supports post-classification callback', cloudSync.includes('afterClassificationSync') && cloudSync.includes('classificationSyncEffects'));
check('background wires cloud sync to classification effects', background.includes('syncNowWithRuntimeEffects') && background.includes('runPostClassificationSyncEffects'));
check('background triggers sync after automatic site classification records', background.includes('siteClassificationRequestSyncNeeded') && background.includes('site_request_auto_observed_sync'));
check('message router re-evaluates after config/cloud classification changes', messageRouter.includes('runRouterClassificationSyncEffects') && messageRouter.includes('cloud_force_sync'));

const total = passed + failed;
console.log(`\n[Classification Effective Boundary] ${passed}/${total} passed${failed ? ' FAILED' : ''}`);
if (failed > 0) process.exit(1);

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
  return fs.readFileSync(path.join(__dirname, '..', '..', 'extension', rel), 'utf8');
}

const background = read('background.js');
const dispatcher = read('core/timing-dispatcher.js');
const foreground = read('core/foreground-timing.js');
const media = read('core/media-timing.js');
const scheduler = read('core/checkpoint-scheduler.js');
const managedStats = read('stats/managed-statistics.js');
const messageRouter = read('message-router.js');
const quota = read('product/quota.js');
const cloudSync = read('infra/cloud-sync.js');

check('background delegates timing signal processing to dispatcher', background.includes('dispatchTimingSignal') && !background.includes('async function processTimingSignal'));
check('background does not directly import media ledger mutators', !/applyMediaFacts|runMediaPeriodicCheckpoint|getMediaFact/.test(background));
check('background does not contain foreground context state machine internals', !/buildContext|resolveState|appliedForegroundBoundary|pendingForegroundGapDiagnostic/.test(background));
check('dispatcher imports both independent consumers', dispatcher.includes('processForegroundSignal') && dispatcher.includes('observeMediaFromSignal'));
check('dispatcher classifies media-only signals', dispatcher.includes('classifyTimingSignal') && dispatcher.includes('mediaOnly'));
check('dispatcher isolates media consumer failure from foreground timing', dispatcher.includes('media_timing_consumer_failed') && dispatcher.lastIndexOf('observeMediaFromSignal') < dispatcher.lastIndexOf('processForegroundSignal'));
check('foreground module does not import media ledger mutators', !/applyMediaFacts|closeMediaForTab|media_segments_v1/.test(foreground));
check('foreground module owns foreground session transitions', /transitionStateAt/.test(foreground) && /resolveState/.test(foreground));
check('media module does not touch foreground usage ledger', !/transitionStateAt|usage_segments_v1/.test(media));
check('media module owns media ledger mutators', /applyMediaFacts/.test(media) && /closeMediaForTab/.test(media));
check('checkpoint scheduler has independent foreground and media try blocks', /foreground checkpoint failed/.test(scheduler) && /media checkpoint failed/.test(scheduler));
check('checkpoint scheduler names confirmed media evidence ledger gaps', scheduler.includes('media_evidence_without_ledger'));
check('managed statistics module owns read model semantics', /getTodayUsageView/.test(managedStats) && /getQuotaUsageView/.test(managedStats) && /getSettlementAnalysisView/.test(managedStats));
check('managed statistics does not import ledger mutators or product actions', !/transitionStateAt|flushOpenSessionToStats|applyMediaFacts|closeMediaForTab|redirect|notify|checkAllTabsQuota/.test(managedStats));
check('message router delegates stats views to managed statistics', /from '\.\/stats\/managed-statistics\.js'/.test(messageRouter) && /getTodayUsageView|getUsageRangeView|getSettlementAnalysisView/.test(messageRouter));
check('message router no longer owns usage summary helpers', !/function\s+withUsageSummary|function\s+readCompositeSeconds|function\s+getSettlementAnalysisRange/.test(messageRouter));
check('quota consumes managed quota usage view', /getQuotaUsageView/.test(quota) && !/getTodayStats|getStatsRange|getTodayUndeterminedStats/.test(quota));
check('background registers local quota_check alarm as message entry', /\['quota_check', 1\]/.test(background) && /REQUIRED_ALARMS[\s\S]*ensureAlarm/.test(background) && /EVALUATE_QUOTA_STATE/.test(background));
check('background quota_check does not call legacy all-tab quota redirect', !/checkAllTabsQuota|redirectAllTabs|redirectQuotaViolatingTabs/.test(background));
check('background has no legacy auto-study scanner', !/checkAutoStudy|autoStudyConfig|auto_study_legacy/.test(background));
check('background has no ordinary one-second access-control reeval scanner', !/restCompositeGateTickTimer|periodicReevaluateActiveTab|active_tab_reeval/.test(background));
check('quota module has no tab redirect helpers', !/checkAllTabsQuota|redirectAllTabs|redirectQuotaViolatingTabs|redirectLockedTabs/.test(quota));
check('background computes foreground facts for navigation route checks', /webNavigation\.onCommitted[\s\S]*isForegroundTab\(tab\)[\s\S]*source: 'webNavigationCommitted'/.test(background));
check('background handles SPA history navigation route checks', /webNavigation\.onHistoryStateUpdated[\s\S]*source: 'webNavigationHistoryStateUpdated'/.test(background));
check('background re-evaluates active tab when URL fact arrives', /tabs\.onUpdated[\s\S]*hasUrlFact[\s\S]*reevaluateTabById\(tabId,[\s\S]*tabUpdatedUrl/.test(background));
check('cloud quota pull saves facts without redirect callbacks', /pullCloudQuotaState\(getConfigFn, saveConfigFn\)/.test(cloudSync) && !/redirectAllTabsFn|redirectQuotaViolatingTabsFn|chrome\.notifications\.create/.test(cloudSync));

const total = passed + failed;
console.log(`\n[Timing Decoupling Structure] ${passed}/${total} passed${failed ? ' FAILED' : ''}`);
if (failed > 0) process.exit(1);

// site-classification-record-semantics.test.js
// Run with: node tests/unit/site-classification-record-semantics.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function expectEqual(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else {
    failed++;
    console.error(`  x ${desc}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

function expectTrue(desc, condition) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  x ${desc}`);
  }
}

function stripModuleSyntax(source) {
  return source
    .replace(/^\s*import[\s\S]*?;\s*$/gm, '')
    .replace(/export\s+async\s+function\s+/g, 'async function ')
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s+const\s+/g, 'const ')
    .replace(/export\s*\{[^}]*\};?\s*$/gm, '');
}

function createHarness() {
  const root = path.join(__dirname, '..', '..');
  const domainSource = stripModuleSyntax(
    fs.readFileSync(path.join(root, 'extension', 'core', 'domain-semantics.js'), 'utf8')
  );
  const classificationSource = stripModuleSyntax(
    fs.readFileSync(path.join(root, 'extension', 'core', 'site-classification.js'), 'utf8')
  );
  const storageSource = fs.readFileSync(
    path.join(root, 'extension', 'infra', 'storage.js'),
    'utf8'
  );
  const sectionStart = storageSource.indexOf('// ── Site classification requests');
  const sectionEnd = storageSource.indexOf('export async function hasPendingSiteClassificationPermission');
  if (sectionStart < 0 || sectionEnd < 0) {
    throw new Error('Unable to locate site classification storage section');
  }
  const classificationStorageSource = stripModuleSyntax(
    storageSource.slice(sectionStart, sectionEnd)
  );

  const state = {};
  let uuidCounter = 0;
  let config = {
    studyList: [],
    compositeList: [],
    restrictedEntertainmentList: [],
    unsafeList: [],
    siteClassificationRulesV1: [],
  };
  const local = {
    async get(keys) {
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, state[key]]));
      }
      if (typeof keys === 'string') return { [keys]: state[keys] };
      return { ...state };
    },
    async set(values) {
      Object.assign(state, values);
    },
  };
  const context = {
    URL,
    console,
    Math,
    Date,
    Set,
    Map,
    crypto: {
      randomUUID() {
        uuidCounter += 1;
        return `uuid-${uuidCounter}`;
      },
    },
    chrome: { storage: { local } },
    getConfig: async () => config,
  };
  vm.createContext(context);
  vm.runInContext(`
${domainSource}
${classificationSource}
const SITE_CLASSIFICATION_REQUESTS_KEY = 'site_classification_requests_v1';
const protectedStorageSet = (items) => chrome.storage.local.set(items);
${classificationStorageSource}
this.__records = {
  recordUnclassifiedSiteAccess,
  submitSiteClassificationRequest,
  getSiteClassificationRequestRecords,
  buildSiteClassificationRequestsUploadPayload,
};
`, context, { filename: 'site-classification-record-semantics.vm.js' });

  return {
    api: context.__records,
    state,
    setConfig(next) {
      config = next;
    },
  };
}

async function run() {
  const harness = createHarness();
  const { api, state } = harness;

  const baseline = await api.recordUnclassifiedSiteAccess('unknown.example', {
    observedEventSource: 'tabActivated',
    observedAt: 1000,
    sourceTabId: 7,
    url: 'https://unknown.example/start',
    domain: 'unknown.example',
  });
  expectTrue('first non-navigation recovery creates a baseline record', baseline.ok && baseline.added);
  expectEqual('baseline record type', baseline.request.recordSource, 'auto_unclassified_access');
  expectEqual('baseline observation count', baseline.request.observationCount, 1);
  const originalId = baseline.request.id;

  const nonNavigation = await api.recordUnclassifiedSiteAccess('unknown.example', {
    observedEventSource: 'heartbeat',
    observedAt: 2000,
    sourceTabId: 7,
    url: 'https://unknown.example/start',
    domain: 'unknown.example',
  });
  expectEqual('heartbeat does not increment top-level navigation count', nonNavigation.request.observationCount, 1);
  expectEqual('heartbeat updates the recent observation time', nonNavigation.request.lastObservedAt, 2000);

  const committed = await api.recordUnclassifiedSiteAccess('unknown.example', {
    observedEventSource: 'webNavigationCommitted',
    observedAt: 3000,
    sourceTabId: 7,
    url: 'https://unknown.example/page-1',
    domain: 'unknown.example',
  });
  expectEqual('committed top-level navigation increments count', committed.request.observationCount, 2);

  const duplicateCommitted = await api.recordUnclassifiedSiteAccess('unknown.example', {
    observedEventSource: 'webNavigationCommitted',
    observedAt: 3500,
    sourceTabId: 7,
    url: 'https://unknown.example/page-1',
    domain: 'unknown.example',
  });
  expectEqual('same navigation event within one second is idempotent', duplicateCommitted.request.observationCount, 2);

  const historyNavigation = await api.recordUnclassifiedSiteAccess('unknown.example', {
    observedEventSource: 'webNavigationHistoryStateUpdated',
    observedAt: 5000,
    sourceTabId: 7,
    url: 'https://unknown.example/page-2',
    domain: 'unknown.example',
  });
  expectEqual('history-state top-level navigation increments count', historyNavigation.request.observationCount, 3);

  const promoted = await api.submitSiteClassificationRequest('unknown.example', {
    observedAt: 6000,
    sourceTabId: 7,
    url: 'https://unknown.example/page-2',
    domain: 'unknown.example',
  });
  expectTrue('manual request promotes the existing access record', promoted.ok && promoted.promoted);
  expectEqual('promotion preserves the record id', promoted.request.id, originalId);
  expectEqual('promotion changes the record type', promoted.request.recordSource, 'manual_learning_request');
  expectEqual('promotion requests study classification', promoted.request.requestedClassification, 'study');
  expectEqual('promotion preserves observation count', promoted.request.observationCount, 3);
  expectEqual('promotion records manual request time', promoted.request.manualRequestedAt, 6000);

  const repeatedManual = await api.submitSiteClassificationRequest('unknown.example', {
    observedAt: 7000,
  });
  expectTrue('repeated manual request is reported as already present', repeatedManual.ok && repeatedManual.alreadyPresent);

  state.site_classification_requests_v1 = state.site_classification_requests_v1.map((record) =>
    record.id === originalId ? { ...record, observationCount: 10 } : record
  );
  const afterPromotionObservation = await api.recordUnclassifiedSiteAccess('unknown.example', {
    observedEventSource: 'webNavigationCommitted',
    observedAt: 8000,
    sourceTabId: 7,
    url: 'https://unknown.example/page-3',
    domain: 'unknown.example',
  });
  expectEqual('automatic observation preserves a learning request and increments the cloud aggregate', {
    recordSource: afterPromotionObservation.request.recordSource,
    requestedClassification: afterPromotionObservation.request.requestedClassification,
    observationCount: afterPromotionObservation.request.observationCount,
  }, {
    recordSource: 'manual_learning_request',
    requestedClassification: 'study',
    observationCount: 11,
  });

  const recordsBeforeReturn = await api.getSiteClassificationRequestRecords({ includeAll: true });
  state.site_classification_requests_v1 = recordsBeforeReturn.map((record) =>
    record.id === originalId ? { ...record, status: 'returned' } : record
  );
  const recreated = await api.recordUnclassifiedSiteAccess('unknown.example', {
    observedEventSource: 'webNavigationCommitted',
    observedAt: 9000,
    sourceTabId: 7,
    url: 'https://unknown.example/after-return',
    domain: 'unknown.example',
  });
  expectTrue('returned cycle allows a new access record', recreated.ok && recreated.added);
  expectTrue('new cycle receives a different id', recreated.request.id !== originalId);

  const payload = await api.buildSiteClassificationRequestsUploadPayload([recreated.request.id]);
  expectEqual('upload payload uses schema v2', payload.schemaVersion, 2);
  expectEqual('upload payload carries source observation summary', {
    recordSource: payload.requests[0].recordSource,
    requestedClassification: payload.requests[0].requestedClassification,
    sourceObservationCount: payload.requests[0].sourceObservationCount,
  }, {
    recordSource: 'auto_unclassified_access',
    requestedClassification: null,
    sourceObservationCount: 1,
  });

  harness.setConfig({
    studyList: [],
    compositeList: [],
    restrictedEntertainmentList: ['games.example.com'],
    unsafeList: [],
    siteClassificationRulesV1: [],
  });
  const blockedLearningRequest = await api.submitSiteClassificationRequest('learn.games.example.com', {
    observedAt: 10000,
    sourceTabId: 9,
    url: 'https://learn.games.example.com/course',
    domain: 'learn.games.example.com',
  });
  expectTrue('restricted parent blocks manual learning request for child domain',
    blockedLearningRequest.ok === false && blockedLearningRequest.code === 'CLASSIFICATION_SCOPE_BLOCKED');

  harness.setConfig({
    studyList: [],
    compositeList: ['google.com'],
    restrictedEntertainmentList: [],
    unsafeList: [],
    siteClassificationRulesV1: [],
  });
  const allowedLearningRequest = await api.submitSiteClassificationRequest('docs.google.com', {
    observedAt: 11000,
    sourceTabId: 10,
    url: 'https://docs.google.com/document',
    domain: 'docs.google.com',
  });
  expectTrue('composite parent still allows manual learning request for child domain',
    allowedLearningRequest.ok === true && allowedLearningRequest.request.requestedClassification === 'study');
  const total = passed + failed;
  console.log(`\n[Site Classification Record Semantics] ${passed}/${total} passed${failed ? ` - ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

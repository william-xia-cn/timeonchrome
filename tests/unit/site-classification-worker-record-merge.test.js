// site-classification-worker-record-merge.test.js
// Run with: node tests/unit/site-classification-worker-record-merge.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

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

function loadWorkerMergeHelpers() {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'siteClassificationRequests.ts'),
    'utf8'
  );
  const start = source.indexOf('type SiteClassificationUploadItem');
  const end = source.indexOf('const CLASSIFIED_SITE_LIST_FIELDS');
  if (start < 0 || end < 0) throw new Error('Unable to locate Worker merge helpers');

  const compiled = ts.transpileModule(
    `${source.slice(start, end)}
this.__helpers = { mergeRequestMetadata, mergeObservationSummary };`,
    {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  const context = { console };
  vm.createContext(context);
  vm.runInContext(compiled, context, { filename: 'site-classification-worker-record-merge.vm.js' });
  return context.__helpers;
}

function createD1Adapter(database) {
  return {
    prepare(sql) {
      const statement = database.prepare(sql);
      return {
        bind(...values) {
          return {
            async run() {
              return statement.run(...values);
            },
            async first() {
              return statement.get(...values) || null;
            },
          };
        },
      };
    },
  };
}

async function run() {
  const workerSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'siteClassificationRequests.ts'),
    'utf8'
  );
  expectTrue('profile ensure endpoint exists for stats-only unclassified rows', workerSource.includes('/site-classification-requests\\/v1\\/ensure') && workerSource.includes('ensureProfileUnclassifiedSiteRequest'));
  expectTrue('ensure endpoint creates automatic unclassified access records', workerSource.includes("'auto_unclassified_access'") && workerSource.includes('recordSource: auto_unclassified_access') === false);

  const helpers = loadWorkerMergeHelpers();
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE site_classification_requests_v1 (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      record_source TEXT,
      requested_classification TEXT,
      manual_requested_at INTEGER,
      first_observed_at INTEGER,
      last_observed_at INTEGER,
      observation_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE site_classification_observation_counters_v1 (
      request_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      device_id TEXT,
      observation_source_id TEXT NOT NULL,
      observation_count INTEGER NOT NULL DEFAULT 0,
      first_observed_at INTEGER,
      last_observed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (request_id, observation_source_id)
    );
    INSERT INTO site_classification_requests_v1
      (id, profile_id, record_source, observation_count, updated_at)
    VALUES ('request-1', 'profile-1', 'auto_unclassified_access', 0, 1);
  `);
  const env = { DB: createD1Adapter(database) };

  await helpers.mergeObservationSummary(env, 'request-1', 'profile-1', 'device-1', {
    observationSourceId: 'source-a',
    sourceObservationCount: 2,
    sourceFirstObservedAt: 100,
    sourceLastObservedAt: 200,
  }, 1000);
  await helpers.mergeObservationSummary(env, 'request-1', 'profile-1', 'device-1', {
    observationSourceId: 'source-a',
    sourceObservationCount: 2,
    sourceFirstObservedAt: 100,
    sourceLastObservedAt: 200,
  }, 1100);
  let row = database.prepare(
    'SELECT first_observed_at, last_observed_at, observation_count FROM site_classification_requests_v1 WHERE id = ?'
  ).get('request-1');
  expectEqual('retrying the same cumulative source does not double count', row, {
    first_observed_at: 100,
    last_observed_at: 200,
    observation_count: 2,
  });

  await helpers.mergeObservationSummary(env, 'request-1', 'profile-1', 'device-2', {
    observationSourceId: 'source-b',
    sourceObservationCount: 3,
    sourceFirstObservedAt: 150,
    sourceLastObservedAt: 400,
  }, 1200);
  row = database.prepare(
    'SELECT first_observed_at, last_observed_at, observation_count FROM site_classification_requests_v1 WHERE id = ?'
  ).get('request-1');
  expectEqual('different observation sources aggregate by cumulative totals', row, {
    first_observed_at: 100,
    last_observed_at: 400,
    observation_count: 5,
  });

  await helpers.mergeRequestMetadata(env, 'request-1', {
    recordSource: 'manual_learning_request',
    requestedClassification: 'study',
    manualRequestedAt: 1300,
  }, 'manual_learning_request', 'study', 1400);
  row = database.prepare(
    'SELECT record_source, requested_classification, manual_requested_at FROM site_classification_requests_v1 WHERE id = ?'
  ).get('request-1');
  expectEqual('manual upload upgrades an automatic record in place', row, {
    record_source: 'manual_learning_request',
    requested_classification: 'study',
    manual_requested_at: 1300,
  });

  await helpers.mergeRequestMetadata(env, 'request-1', {
    recordSource: 'auto_unclassified_access',
    requestedClassification: null,
  }, 'auto_unclassified_access', null, 1500);
  row = database.prepare(
    'SELECT record_source, requested_classification, manual_requested_at FROM site_classification_requests_v1 WHERE id = ?'
  ).get('request-1');
  expectEqual('later automatic observations cannot downgrade manual intent', row, {
    record_source: 'manual_learning_request',
    requested_classification: 'study',
    manual_requested_at: 1300,
  });

  const total = passed + failed;
  console.log(`\n[Site Classification Worker Record Merge] ${passed}/${total} passed${failed ? ` - ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

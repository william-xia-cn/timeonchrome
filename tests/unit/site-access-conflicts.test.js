// site-access-conflicts.test.js
// Run with: node tests/unit/site-access-conflicts.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function check(desc, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${desc}`);
  } else {
    failed++;
    console.error(`  ✗ ${desc}${detail ? ` (${detail})` : ''}`);
  }
}

function loadSiteClassificationModule() {
  const domainSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'domain-semantics.js'), 'utf8')
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s+const\s+/g, 'const ');
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'site-classification.js'), 'utf8')
    .replace(/^\s*import .*?;\s*$/gm, '')
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s+const\s+/g, 'const ');
  const context = { URL, console, this: null };
  context.this = context;
  vm.runInNewContext(`${domainSource}\n${source}\nthis.__m = { validateSiteAccessConfig, resolveSiteAccessClassification, validateSiteClassificationAction };`, context, { filename: 'site-classification.js' });
  return context.__m;
}

function loadLocalDefaultConfig() {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'storage.js'), 'utf8');
  const start = source.indexOf('export const DEFAULT_CONFIG = ');
  const end = source.indexOf('const DEFAULT_SESSION', start);
  const snippet = source.slice(start, end).replace('export const DEFAULT_CONFIG =', 'this.DEFAULT_CONFIG =');
  const context = { STORAGE_VERSION: '1.3', this: null };
  context.this = context;
  vm.runInNewContext(snippet, context, { filename: 'storage-default-config.js' });
  return context.DEFAULT_CONFIG;
}

function run() {
  const mod = loadSiteClassificationModule();
  const localDefault = loadLocalDefaultConfig();
  const workerDefaults = require('../../workers/config/site-access-defaults.json');
  const workerDefaultConfig = {
    defaultStudySites: workerDefaults.defaultStudySites,
    defaultCompositeSites: workerDefaults.defaultCompositeSites,
    defaultRestrictedEntertainmentSites: workerDefaults.defaultRestrictedEntertainmentSites,
    defaultBlockedSites: workerDefaults.defaultBlockedSites,
    studyList: workerDefaults.defaultStudySites,
    compositeList: [
      ...workerDefaults.defaultCompositeSites,
      ...(workerDefaults.defaultUserCompositeSites || []),
    ],
  };

  const localValidation = mod.validateSiteAccessConfig(localDefault);
  check('local DEFAULT_CONFIG has no exact cross-class duplicates', localValidation.ok, JSON.stringify(localValidation.conflicts));

  const workerValidation = mod.validateSiteAccessConfig(workerDefaultConfig);
  check('worker default site access config has no exact cross-class duplicates', workerValidation.ok, JSON.stringify(workerValidation.conflicts));

  check('YouTube root default resolves as restricted entertainment',
    mod.resolveSiteAccessClassification({ restrictedEntertainmentList: ['youtube.com'] }, [], 'https://www.youtube.com/watch?v=abc123').classification === 'restricted');

  check('YouTube special video can request study below restricted root',
    mod.validateSiteClassificationAction({ restrictedEntertainmentList: ['youtube.com'] }, 'https://www.youtube.com/watch?v=abc123', 'study').ok);
  check('google.com remains composite while docs.google.com is study',
    mod.resolveSiteAccessClassification(localDefault, [], 'https://docs.google.com/document').classification === 'study' &&
    mod.resolveSiteAccessClassification(localDefault, [], 'https://google.com/search').classification === 'composite');

  check('parent/child cross-classification is accepted',
    mod.validateSiteAccessConfig({
      studyList: ['study.example.com'],
      compositeList: ['example.com'],
    }).ok);

  check('exact www/bare duplicate cross-classification is rejected',
    !mod.validateSiteAccessConfig({
      studyList: ['www.example.com'],
      compositeList: ['example.com'],
    }).ok);

  check('restricted parent blocks study child classification action',
    !mod.validateSiteClassificationAction({
      restrictedEntertainmentList: ['games.example.com'],
    }, 'learn.games.example.com', 'study').ok &&
    mod.validateSiteClassificationAction({
      restrictedEntertainmentList: ['games.example.com'],
    }, 'learn.games.example.com', 'study').code === 'CLASSIFICATION_SCOPE_BLOCKED');

  check('restricted parent blocks composite child classification action',
    !mod.validateSiteClassificationAction({
      restrictedEntertainmentList: ['games.example.com'],
    }, 'watch.games.example.com', 'composite').ok &&
    mod.validateSiteClassificationAction({
      restrictedEntertainmentList: ['games.example.com'],
    }, 'watch.games.example.com', 'composite').code === 'CLASSIFICATION_SCOPE_BLOCKED');

  check('blocked parent blocks restricted child classification action',
    !mod.validateSiteClassificationAction({
      unsafeList: ['example.com'],
    }, 'games.example.com', 'restricted').ok &&
    mod.validateSiteClassificationAction({
      unsafeList: ['example.com'],
    }, 'games.example.com', 'restricted').code === 'CLASSIFICATION_SCOPE_BLOCKED');

  check('composite parent still allows study child classification action',
    mod.validateSiteClassificationAction({
      compositeList: ['google.com'],
    }, 'docs.google.com', 'study').ok);

  check('restricted parent still allows blocked child classification action',
    mod.validateSiteClassificationAction({
      restrictedEntertainmentList: ['example.com'],
    }, 'bad.example.com', 'blocked').ok);
  const total = passed + failed;
  console.log(`\n[Site Access Conflicts] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();

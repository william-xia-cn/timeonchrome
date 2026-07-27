// storage-composite-migration.test.js — extended with effective config + newtab tests
// Run with: node tests/unit/storage-composite-migration.test.js

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function expect(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

function expectTrue(desc, cond) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
  }
}

function section(name) {
  console.log(`\n[${name}]`);
}

// Load storage.js functions
function loadStorage() {
  const abs = path.join(__dirname, '..', '..', 'extension', 'infra', 'storage.js');
  let code = fs.readFileSync(abs, 'utf8');

  // Extract studyList from DEFAULT_CONFIG - domains can be on same line separated by commas
  const studyListMatch = code.match(/studyList:\s*\[([\s\S]*?)\],\s*(?:\/\/[^\n]*\n\s*)*compositeList/);
  const studyList = studyListMatch ? studyListMatch[1]
    .split(',')
    .map(s => s.trim().replace(/^'|'$/g, '').trim())
    .filter(s => s.length > 0 && !s.startsWith('//')) : [];

  code = code.replace(/^\s*import[\s\S]*?;\s*/gm, '');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');

  const context = {
    URL,
    console,
    chrome: { storage: { local: { get: async () => ({}), set: async () => {} }, session: null } },
    crypto: { subtle: { digest: async () => new Uint8Array(32) } },
    TextEncoder,
    computeAllDomains: () => ({ domains: {}, audioSeconds: 0, backgroundMediaByDomain: {}, pipSeconds: 0, pipByDomain: {} }),
    computeAllDomainsWithAudio: () => ({ domains: {}, audioSeconds: 0, backgroundMediaByDomain: {}, pipSeconds: 0, pipByDomain: {} }),
    matchDomainV12: (d, p) => {
      const domain = String(d || '').replace(/^www\./, '');
      const pattern = String(p || '').replace(/^www\./, '');
      return domain === pattern || domain.endsWith(`.${pattern}`);
    },
    normalizeHostname: (h) => String(h || '').replace(/^www\./, '').toLowerCase(),
    domainForUrl: (url) => {
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return String(parsed.hostname || '').replace(/^www\./, '').toLowerCase();
        if (parsed.protocol === 'chrome-extension:') return 'extension-page.chrome-local';
        if (parsed.protocol === 'chrome:') {
          if (parsed.hostname === 'extensions') return 'chrome-extensions.chrome-local';
          if (parsed.hostname === 'settings') return 'chrome-settings.chrome-local';
          return 'chrome-page.chrome-local';
        }
        if (parsed.protocol === 'edge:') return 'edge-page.chrome-local';
        if (parsed.protocol === 'file:') return 'local-file.chrome-local';
        if (parsed.protocol === 'about:') return 'about-page.chrome-local';
        if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') return 'embedded-page.chrome-local';
        return 'unknown-page.chrome-local';
      } catch (_) {
        return null;
      }
    },
    emitTrace: () => {},
    DEFAULT_CONFIG: { studyList },
  };

  const vm = require('vm');
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'storage.js' });
  return context;
}

// Load cloud-sync.js normalizeCloudRulesConfig
function loadCloudSync() {
  const abs = path.join(__dirname, '..', '..', 'extension', 'infra', 'cloud-sync.js');
  let code = fs.readFileSync(abs, 'utf8');

  // Extract studyList from storage.js DEFAULT_CONFIG
  const storagePath = path.join(__dirname, '..', '..', 'extension', 'infra', 'storage.js');
  let storageCode = fs.readFileSync(storagePath, 'utf8');
  const studyListMatch = storageCode.match(/studyList:\s*\[([\s\S]*?)\],\s*(?:\/\/[^\n]*\n\s*)*compositeList/);
  const studyList = studyListMatch ? studyListMatch[1]
    .split(',')
    .map(s => s.trim().replace(/^'|'$/g, '').trim())
    .filter(s => s.length > 0 && !s.startsWith('//')) : [];

  const DEFAULT_CONFIG = { studyList };

  // Inject DEFAULT_CONFIG into cloud-sync context
  code = code.replace(/^\s*import[\s\S]*?;\s*/gm, '');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');

  const vm = require('vm');
  const context = {
    console,
    DEFAULT_CONFIG,
    getStatsRange: async () => ({}),
    chrome: { storage: { local: { get: async () => ({}), set: async () => {} } } },
    fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }),
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'cloud-sync.js' });
  return context;
}

async function run() {
  const storage = loadStorage();
  const cloudSync = loadCloudSync();

  // ── A. isSpecialUrl: Chrome newtab provider ──
  section('A. isSpecialUrl: Chrome newtab provider');
  expectTrue('chrome://newtab/ is special', storage.isSpecialUrl('chrome://newtab/'));
  expectTrue('about:blank is special', storage.isSpecialUrl('about:blank'));
  expectTrue('chrome-extension://... is special', storage.isSpecialUrl('chrome-extension://abc/'));
  expectTrue('https://www.google.com/_/chrome/newtab is special', storage.isSpecialUrl('https://www.google.com/_/chrome/newtab'));
  expectTrue('https://www.google.com/_/chrome/newtab?foo=1 is special', storage.isSpecialUrl('https://www.google.com/_/chrome/newtab?foo=1'));
  expectTrue('https://www.google.com/search?q=test is NOT special', !storage.isSpecialUrl('https://www.google.com/search?q=test'));
  expectTrue('https://www.google.com/maps is NOT special', !storage.isSpecialUrl('https://www.google.com/maps'));
  expectTrue('https://google.com/_/chrome/newtab is NOT special (wrong hostname)', !storage.isSpecialUrl('https://google.com/_/chrome/newtab'));

  // ── B. extractDomain: newtab provider returns domain ──
  section('B. extractDomain behavior');
  expectTrue('extractDomain(chrome://newtab/) returns chrome pseudo domain', storage.extractDomain('chrome://newtab/') === 'chrome-page.chrome-local');
  expectTrue('extractDomain(about:blank) returns about pseudo domain', storage.extractDomain('about:blank') === 'about-page.chrome-local');
  expectTrue('extractDomain(https://www.google.com/_/chrome/newtab) returns google.com (normalized)', storage.extractDomain('https://www.google.com/_/chrome/newtab') === 'google.com');
  expectTrue('extractDomain(https://www.google.com/search?q=test) returns google.com (normalized)', storage.extractDomain('https://www.google.com/search?q=test') === 'google.com');

  // ── C. DEFAULT_CONFIG includes khanacademy.org ──
  section('C. DEFAULT_CONFIG includes khanacademy.org');
  expectTrue('DEFAULT_CONFIG.studyList includes khanacademy.org', storage.DEFAULT_CONFIG.studyList.includes('khanacademy.org'));

  // ── D. normalizeCloudRulesConfig: empty studyList preserves defaults ──
  section('D. normalizeCloudRulesConfig: empty studyList preserves defaults');
  const emptyStudyConfig = cloudSync.normalizeCloudRulesConfig({
    studyList: [],
    mode: 'study',
  });
  expectTrue('empty studyList still has khanacademy.org', emptyStudyConfig.studyList.includes('khanacademy.org'));
  expectTrue('empty studyList keeps google.com out of study parent defaults', !emptyStudyConfig.studyList.includes('google.com'));
  expectTrue('empty studyList still has docs.google.com', emptyStudyConfig.studyList.includes('docs.google.com'));
  expectTrue('empty studyList still has coursera.org', emptyStudyConfig.studyList.includes('coursera.org'));

  // ── E. normalizeCloudRulesConfig: sparse studyList preserves defaults ──
  section('E. normalizeCloudRulesConfig: sparse studyList preserves defaults');
  const sparseStudyConfig = cloudSync.normalizeCloudRulesConfig({
    studyList: ['my-custom-site.com'],
    mode: 'study',
  });
  expectTrue('sparse studyList has khanacademy.org', sparseStudyConfig.studyList.includes('khanacademy.org'));
  expectTrue('sparse studyList has my-custom-site.com', sparseStudyConfig.studyList.includes('my-custom-site.com'));

  // ── F. normalizeCloudRulesConfig: defaultStudySites merges correctly ──
  section('F. normalizeCloudRulesConfig: defaultStudySites merges correctly');
  const withDefaultsConfig = cloudSync.normalizeCloudRulesConfig({
    studyList: ['user-site.com'],
    defaultStudySites: ['default-site.com'],
    customStudyList: ['custom-site.com'],
  });
  expectTrue('has DEFAULT_CONFIG defaults', withDefaultsConfig.studyList.includes('khanacademy.org'));
  expectTrue('has defaultStudySites', withDefaultsConfig.studyList.includes('default-site.com'));
  expectTrue('has studyList from cloud', withDefaultsConfig.studyList.includes('user-site.com'));
  expectTrue('has customStudyList', withDefaultsConfig.studyList.includes('custom-site.com'));

  // ── G. normalizeCloudRulesConfig: defaultUserCompositeSites merges into compositeList ──
  section('G. normalizeCloudRulesConfig: defaultUserCompositeSites merges into compositeList');
  const withUserCompositeDefaults = cloudSync.normalizeCloudRulesConfig({
    compositeList: ['music.youtube.com'],
    defaultCompositeSites: ['google.com'],
    defaultUserCompositeSites: ['youtube.com'],
    customCompositeList: ['reddit.com'],
  });
  expectTrue('has defaultCompositeSites in compositeList', withUserCompositeDefaults.compositeList.includes('google.com'));
  expectTrue('has defaultUserCompositeSites in compositeList', withUserCompositeDefaults.compositeList.includes('youtube.com'));
  expectTrue('preserves cloud compositeList in compositeList', withUserCompositeDefaults.compositeList.includes('music.youtube.com'));
  expectTrue('has customCompositeList in compositeList', withUserCompositeDefaults.compositeList.includes('reddit.com'));
  // ── H. normalizeCloudRulesConfig: no studyList key at all ──
  section('H. normalizeCloudRulesConfig: no studyList key');
  const noStudyListConfig = cloudSync.normalizeCloudRulesConfig({
    mode: 'study',
  });
  expectTrue('no studyList key still has khanacademy.org', noStudyListConfig.studyList.includes('khanacademy.org'));

  // ── I. matchDomain: khanacademy.org classification ──
  section('I. matchDomain: khanacademy.org classification');
  expectTrue('khanacademy.org matches khanacademy.org', storage.matchDomain('khanacademy.org', 'khanacademy.org'));
  expectTrue('www.khanacademy.org matches khanacademy.org', storage.matchDomain('www.khanacademy.org', 'khanacademy.org'));

  // ── J. Effective study list always contains defaults ──
  section('J. Effective study list always contains defaults');
  const defaultList = storage.DEFAULT_CONFIG.studyList;
  expectTrue('DEFAULT_CONFIG.studyList has > 10 entries', defaultList.length > 10);
  expectTrue('khanacademy.org in defaults', defaultList.includes('khanacademy.org'));
  expectTrue('github.com in defaults', defaultList.includes('github.com'));
  expectTrue('stackoverflow.com in defaults', defaultList.includes('stackoverflow.com'));

  // ── Summary ──
  const total = passed + failed;
  console.log(`\n[Storage + Cloud Config Merge] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

// managed-targets.test.js
// Run with: node tests/unit/managed-targets.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function expect(desc, condition) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  x ${desc}`);
  }
}

function expectEqual(desc, actual, expected) {
  if (actual === expected) passed++;
  else {
    failed++;
    console.error(`  x ${desc} (actual=${String(actual)}, expected=${String(expected)})`);
  }
}

function loadModule() {
  const root = path.join(__dirname, '..', '..');
  const stripImports = (source) => source
    .replace(/import\s+\{[\s\S]*?\}\s+from\s+['"].*?['"];\s*/g, '')
    .replace(/^\s*import .*?;\s*$/gm, '');
  const domainSource = fs.readFileSync(path.join(root, 'extension', 'core', 'domain-semantics.js'), 'utf8')
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s+const\s+/g, 'const ');
  const normalizerSource = stripImports(fs.readFileSync(path.join(root, 'extension', 'core', 'site-access-config-normalizer.js'), 'utf8'))
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s+const\s+/g, 'const ');
  const siteSource = stripImports(fs.readFileSync(path.join(root, 'extension', 'core', 'site-classification.js'), 'utf8'))
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s+const\s+/g, 'const ');
  const managedSource = stripImports(fs.readFileSync(path.join(root, 'extension', 'core', 'managed-targets.js'), 'utf8'))
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s+const\s+/g, 'const ');
  const context = { URL, console, this: null };
  context.this = context;
  vm.runInNewContext(`${domainSource}\n${normalizerSource}\n${siteSource}\n${managedSource}\nthis.__m = {
    normalizeRuntimeSiteAccessConfig,
    deriveManagedTargetId,
    resolveManagedTargetAttribution,
    validateManagedTargetsConfig,
    collectManagedTargets,
    parseManagedTargetContext,
    managedTargetSnapshotFields,
  };`, context, { filename: 'managed-targets.js' });
  return context.__m;
}

async function run() {
  const mod = loadModule();

  const idA = mod.deriveManagedTargetId('youtube', 'playlist', 'PL123');
  const idB = mod.deriveManagedTargetId('youtube', 'playlist', 'PL123');
  const idC = mod.deriveManagedTargetId('youtube', 'video', 'PL123');
  expectEqual('target id is stable', idA, idB);
  expect('target id includes target type namespace', idA !== idC);

  const config = {
    managedTargetsV1: [
      { targetType: 'domain', normalizedValue: 'youtube.com', namespace: 'generic', classification: 'composite', targetLabel: 'YouTube' },
      { targetType: 'platform_entry', namespace: 'youtube', normalizedValue: 'search', classification: 'restricted', targetLabel: 'YouTube Search' },
      { targetType: 'video', namespace: 'youtube', normalizedValue: 'VID123', classification: 'composite', targetLabel: 'A Video' },
      { targetType: 'playlist', namespace: 'youtube', normalizedValue: 'PLSTUDY', classification: 'study', targetLabel: 'Math Playlist' },
      { targetType: 'subdomain', normalizedValue: 'learn.example.com', classification: 'study', targetLabel: 'Learn Example' },
      { targetType: 'domain', normalizedValue: 'example.com', classification: 'composite', targetLabel: 'Example' },
    ],
  };

  const playlist = mod.resolveManagedTargetAttribution(config, [], 'https://www.youtube.com/watch?v=VID123&list=PLSTUDY');
  expectEqual('playlist target wins over video context', playlist.managedTargetType, 'playlist');
  expectEqual('playlist target classification', playlist.targetClassificationAtTime, 'study');
  expectEqual('playlist target label snapshot', playlist.managedTargetLabelAtTime, 'Math Playlist');

  const video = mod.resolveManagedTargetAttribution(config, [], 'https://www.youtube.com/watch?v=VID123');
  expectEqual('standalone video target wins without playlist context', video.managedTargetType, 'video');
  expectEqual('standalone video classification', video.targetClassificationAtTime, 'composite');

  const normalizedStaleConfig = mod.normalizeRuntimeSiteAccessConfig({
    compositeList: ['youtube.com'],
    defaultUserCompositeSites: ['youtube.com'],
  }).config;
  const staleRoot = mod.resolveManagedTargetAttribution(normalizedStaleConfig, [], 'https://www.youtube.com/');
  expectEqual('stale YouTube root composite config attributes as restricted', staleRoot.targetClassificationAtTime, 'restricted');

  const staleWatch = mod.resolveManagedTargetAttribution(normalizedStaleConfig, [], 'https://www.youtube.com/watch?v=UNAPPROVED');
  expectEqual('unapproved YouTube watch with stale composite config attributes as restricted', staleWatch.targetClassificationAtTime, 'restricted');

  const music = mod.resolveManagedTargetAttribution({
    compositeList: ['music.youtube.com'],
  }, [], 'https://music.youtube.com/watch?v=SONG');
  expectEqual('music.youtube.com can still attribute as composite', music.targetClassificationAtTime, 'composite');

  const search = mod.resolveManagedTargetAttribution(config, [], 'https://www.youtube.com/results?search_query=algebra');
  expectEqual('platform entry beats domain', search.managedTargetType, 'platform_entry');
  expectEqual('platform entry classification', search.targetClassificationAtTime, 'restricted');

  const subdomain = mod.resolveManagedTargetAttribution(config, [], 'https://learn.example.com/unit/1');
  expectEqual('subdomain beats parent domain', subdomain.managedTargetType, 'subdomain');
  expectEqual('subdomain classification', subdomain.targetClassificationAtTime, 'study');

  const parent = mod.resolveManagedTargetAttribution(config, [], 'https://other.example.com/unit/1');
  expectEqual('unmatched child falls back to parent domain target', parent.managedTargetType, 'domain');
  expectEqual('parent domain classification', parent.targetClassificationAtTime, 'composite');

  const legacy = mod.resolveManagedTargetAttribution({
    siteClassificationRulesV1: [{
      targetType: 'url',
      targetValue: 'https://docs.example.com/lesson?id=1',
      decision: 'study',
    }],
  }, [], 'https://docs.example.com/lesson?id=1#section');
  expectEqual('legacy exact URL rule adapts to managed target', legacy.managedTargetType, 'url');
  expectEqual('legacy URL classification', legacy.targetClassificationAtTime, 'study');

  const legacyPlaylist = mod.resolveManagedTargetAttribution({
    siteClassificationRulesV1: [{
      targetType: 'url',
      targetValue: 'https://www.youtube.com/watch?v=4CTQpUJRcSM&list=PLPsx331rqafXopGlbWJw-9SFh3E7ZGe1M&index=3&t=2s',
      decision: 'study',
    }],
  }, [], 'https://www.youtube.com/watch?v=OTHER_VIDEO&list=PLPsx331rqafXopGlbWJw-9SFh3E7ZGe1M&index=9');
  expectEqual('legacy YouTube playlist URL rule attributes same canonical playlist URL', legacyPlaylist.managedTargetType, 'url');
  expectEqual('legacy YouTube playlist URL canonical target value', legacyPlaylist.managedTargetValue, 'https://www.youtube.com/playlist?list=PLPsx331rqafXopGlbWJw-9SFh3E7ZGe1M');
  expectEqual('legacy YouTube playlist URL classification', legacyPlaylist.targetClassificationAtTime, 'study');

  const pending = mod.resolveManagedTargetAttribution({}, [{
    requestedTargetType: 'host',
    requestedNormalizedValue: 'pending.example.com',
    status: 'pending',
  }], 'https://pending.example.com/x');
  expectEqual('pending request becomes managed target attribution', pending.targetClassificationAtTime, 'pending_composite');
  expectEqual('pending request source is retained', pending.targetSourceAtTime, 'pending');

  const approvedRequestOnly = mod.resolveManagedTargetAttribution({}, [{
    requestedTargetType: 'host',
    requestedNormalizedValue: 'approved.example.com',
    status: 'approved_study',
  }], 'https://approved.example.com/x');
  expect('approved request record alone is not a managed target', approvedRequestOnly.fallback === true && !approvedRequestOnly.managedTargetId);

  const fallback = mod.resolveManagedTargetAttribution({}, [], 'https://private.example.com/deep/path?secret=1');
  expect('unmanaged URL returns fallback attribution', fallback.fallback === true && !fallback.managedTargetId);
  expectEqual('unmanaged fallback keeps only domain', fallback.domain, 'private.example.com');
  expect('unmanaged fallback does not persist full URL', !JSON.stringify(fallback).includes('/deep/path'));

  const conflict = mod.validateManagedTargetsConfig({
    managedTargetsV1: [
      { targetType: 'domain', normalizedValue: 'www.example.com', classification: 'study' },
      { targetType: 'domain', normalizedValue: 'example.com', classification: 'composite' },
    ],
  });
  expect('same exact target cross classification is rejected', !conflict.ok && conflict.conflicts.length === 1);

  const parentChild = mod.validateManagedTargetsConfig({
    managedTargetsV1: [
      { targetType: 'domain', normalizedValue: 'example.com', classification: 'composite' },
      { targetType: 'subdomain', normalizedValue: 'learn.example.com', classification: 'study' },
    ],
  });
  expect('more specific target may override parent target', parentChild.ok);

  const snapshot = mod.managedTargetSnapshotFields(playlist, 'study');
  expectEqual('snapshot carries managed target id', snapshot.managedTargetId, playlist.managedTargetId);
  expectEqual('snapshot keeps quota bucket separate from classification', snapshot.quotaBucketAtTime, 'study');

  const total = passed + failed;
  console.log(`\n[Managed Targets] ${passed}/${total} passed${failed ? ' FAILED' : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

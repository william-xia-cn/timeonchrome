// site-classification-rules.test.js
// Run with: node tests/unit/site-classification-rules.test.js

'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');

let passed = 0;
let failed = 0;

function expectTrue(desc, cond) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
  }
}

function expectEqual(desc, actual, expected) {
  if (actual === expected) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc} (actual=${String(actual)}, expected=${String(expected)})`);
  }
}

function loadModule() {
  const domainSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'domain-semantics.js'), 'utf8')
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s+const\s+/g, 'const ');
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'site-classification.js'), 'utf8')
    .replace(/^\s*import .*?;\s*$/gm, '')
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s+const\s+/g, 'const ');
  const context = { URL, console, this: null };
  context.this = context;
  vm.runInNewContext(`${domainSource}\n${source}\nthis.__m = { normalizeSiteClassificationTarget, siteTargetMatchesUrl, siteTargetScopesOverlap, getSiteClassificationForUrl, resolveSiteAccessClassification, validateSiteAccessConfig };`, context, { filename: 'site-classification.js' });
  return context.__m;
}

async function run() {
  const mod = loadModule();

  const host = mod.normalizeSiteClassificationTarget('Study.Example.com');
  expectTrue('host input should normalize', host.ok);
  expectEqual('host target type', host.targetType, 'host');
  expectEqual('host normalized lower-case', host.normalizedValue, 'study.example.com');

  const url = mod.normalizeSiteClassificationTarget('https://Example.com/path?a=1#hash');
  expectTrue('url input should normalize', url.ok);
  expectEqual('url target type', url.targetType, 'url');
  expectEqual('url strips hash and preserves query', url.normalizedValue, 'https://example.com/path?a=1');

  const youtubePlaylist = mod.normalizeSiteClassificationTarget('https://www.youtube.com/watch?v=4CTQpUJRcSM&list=PLPsx331rqafXopGlbWJw-9SFh3E7ZGe1M&index=3&t=2s');
  expectTrue('YouTube playlist URL should normalize', youtubePlaylist.ok);
  expectEqual('YouTube playlist URL canonical target', youtubePlaylist.normalizedValue, 'https://www.youtube.com/playlist?list=PLPsx331rqafXopGlbWJw-9SFh3E7ZGe1M');
  expectEqual('YouTube playlist canonical host', youtubePlaylist.host, 'www.youtube.com');
  const youtubeVideo = mod.normalizeSiteClassificationTarget('https://www.youtube.com/watch?v=4CTQpUJRcSM&t=2s');
  expectEqual('YouTube standalone video URL canonical target', youtubeVideo.normalizedValue, 'https://www.youtube.com/watch?v=4CTQpUJRcSM');
  const youtuBeVideo = mod.normalizeSiteClassificationTarget('https://youtu.be/4CTQpUJRcSM?t=2');
  expectEqual('youtu.be standalone video URL canonical target', youtuBeVideo.normalizedValue, 'https://www.youtube.com/watch?v=4CTQpUJRcSM');

  const invalid = mod.normalizeSiteClassificationTarget('example.com/path');
  expectTrue('path target without protocol should be rejected', !invalid.ok);

  expectTrue('host rule matches child subdomain',
    mod.siteTargetMatchesUrl({ targetType: 'host', normalizedValue: 'example.com' }, 'https://study.example.com/a'));
  expectTrue('url rule matches exact normalized url',
    mod.siteTargetMatchesUrl({ targetType: 'url', normalizedValue: 'https://example.com/path?a=1' }, 'https://example.com/path?a=1#x'));
  expectTrue('url rule does not match prefix path',
    !mod.siteTargetMatchesUrl({ targetType: 'url', normalizedValue: 'https://example.com/path?a=1' }, 'https://example.com/path?a=1&b=2'));
  expectTrue('canonical YouTube playlist URL rule matches same playlist with changing video/time params',
    mod.siteTargetMatchesUrl(
      { targetType: 'url', normalizedValue: 'https://www.youtube.com/playlist?list=PLPsx331rqafXopGlbWJw-9SFh3E7ZGe1M' },
      'https://www.youtube.com/watch?v=OTHER_VIDEO&list=PLPsx331rqafXopGlbWJw-9SFh3E7ZGe1M&index=9'
    ));
  expectTrue('canonical YouTube playlist URL rule does not match another playlist',
    !mod.siteTargetMatchesUrl(
      { targetType: 'url', normalizedValue: 'https://www.youtube.com/playlist?list=PLPsx331rqafXopGlbWJw-9SFh3E7ZGe1M' },
      'https://www.youtube.com/watch?v=4CTQpUJRcSM&list=OTHER_LIST'
    ));
  expectTrue('canonical YouTube standalone video URL rule matches same video with different time param',
    mod.siteTargetMatchesUrl(
      { targetType: 'url', normalizedValue: 'https://www.youtube.com/watch?v=4CTQpUJRcSM' },
      'https://www.youtube.com/watch?v=4CTQpUJRcSM&t=30s'
    ));
  expectTrue('canonical YouTube standalone video URL rule does not override playlist context',
    !mod.siteTargetMatchesUrl(
      { targetType: 'url', normalizedValue: 'https://www.youtube.com/watch?v=4CTQpUJRcSM' },
      'https://www.youtube.com/watch?v=4CTQpUJRcSM&list=PLPsx331rqafXopGlbWJw-9SFh3E7ZGe1M'
    ));
  expectTrue('host request overlaps parent classified host',
    mod.siteTargetScopesOverlap(
      { ok: true, targetType: 'host', normalizedValue: 'study.example.com', host: 'study.example.com' },
      { targetType: 'host', normalizedValue: 'example.com' }
    ));
  expectTrue('root host request overlaps classified child host',
    mod.siteTargetScopesOverlap(
      { ok: true, targetType: 'host', normalizedValue: 'example.com', host: 'example.com' },
      { targetType: 'host', normalizedValue: 'study.example.com' }
    ));
  expectTrue('host request overlaps exact url inside that host',
    mod.siteTargetScopesOverlap(
      { ok: true, targetType: 'host', normalizedValue: 'example.com', host: 'example.com' },
      { targetType: 'url', normalizedValue: 'https://study.example.com/path?a=1' }
    ));
  expectTrue('sibling host does not overlap exact url on another child',
    !mod.siteTargetScopesOverlap(
      { ok: true, targetType: 'host', normalizedValue: 'other.example.com', host: 'other.example.com' },
      { targetType: 'url', normalizedValue: 'https://study.example.com/path?a=1' }
    ));

  const pending = [{
    requestedTargetType: 'host',
    requestedNormalizedValue: 'unknown.example.com',
    status: 'pending',
  }];
  expectEqual('pending request grants composite classification',
    mod.getSiteClassificationForUrl({}, pending, 'https://unknown.example.com/x').classification,
    'pending_composite');

  const approvedConfig = {
    siteClassificationRulesV1: [{
      targetType: 'url',
      targetValue: 'https://example.com/lesson?id=1',
      decision: 'study',
    }],
  };
  expectEqual('approved exact url classifies as study',
    mod.getSiteClassificationForUrl(approvedConfig, [], 'https://example.com/lesson?id=1#hash').classification,
    'study');

  const rejected = [{
    requestedTargetType: 'host',
    requestedNormalizedValue: 'example.com',
    decisionTargetType: 'host',
    decisionNormalizedValue: 'blocked.example.com',
    status: 'rejected',
  }];
  expectEqual('rejected decision range blocks matching child request',
    mod.getSiteClassificationForUrl({}, rejected, 'https://blocked.example.com/a').classification,
    'rejected');
  expectEqual('rejected decision range does not block outside scope',
    mod.getSiteClassificationForUrl({}, rejected, 'https://other.example.com/a').classification,
    null);

  expectEqual('child host classification overrides parent host',
    mod.resolveSiteAccessClassification({
      compositeList: ['example.com'],
      studyList: ['study.example.com'],
    }, [], 'https://study.example.com/a').classification,
    'study');
  expectEqual('unlisted child inherits parent host classification',
    mod.resolveSiteAccessClassification({
      compositeList: ['example.com'],
      studyList: ['study.example.com'],
    }, [], 'https://other.example.com/a').classification,
    'composite');
  expectEqual('exact URL rule overrides host classification',
    mod.resolveSiteAccessClassification({
      compositeList: ['example.com'],
      siteClassificationRulesV1: [{
        targetType: 'url',
        targetValue: 'https://example.com/lesson?id=1',
        decision: 'study',
      }],
    }, [], 'https://example.com/lesson?id=1#hash').classification,
    'study');
  expectEqual('YouTube playlist URL rule overrides parent restricted classification for same playlist',
    mod.resolveSiteAccessClassification({
      restrictedEntertainmentList: ['youtube.com'],
      siteClassificationRulesV1: [{
        targetType: 'url',
        targetValue: 'https://www.youtube.com/watch?v=4CTQpUJRcSM&list=PLPsx331rqafXopGlbWJw-9SFh3E7ZGe1M&index=3&t=2s',
        decision: 'study',
      }],
    }, [], 'https://www.youtube.com/watch?v=OTHER_VIDEO&list=PLPsx331rqafXopGlbWJw-9SFh3E7ZGe1M&index=9').classification,
    'study');
  expectEqual('pending YouTube playlist URL request grants composite for same playlist',
    mod.resolveSiteAccessClassification({}, [{
      requestedTargetType: 'url',
      requestedNormalizedValue: 'https://www.youtube.com/watch?v=4CTQpUJRcSM&list=PLPsx331rqafXopGlbWJw-9SFh3E7ZGe1M&index=3&t=2s',
      status: 'pending',
    }], 'https://www.youtube.com/watch?v=OTHER_VIDEO&list=PLPsx331rqafXopGlbWJw-9SFh3E7ZGe1M&index=9').classification,
    'pending_composite');
  const exactConflict = mod.validateSiteAccessConfig({
    studyList: ['www.example.com'],
    compositeList: ['example.com'],
  });
  expectTrue('exact host duplicate across classifications is invalid', !exactConflict.ok && exactConflict.conflicts.length === 1);
  const parentChild = mod.validateSiteAccessConfig({
    studyList: ['study.example.com'],
    compositeList: ['example.com'],
  });
  expectTrue('parent/child cross classification overlap is valid', parentChild.ok);

  const total = passed + failed;
  console.log(`\n[Site Classification Rules] ${passed}/${total} passed${failed ? ` - ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

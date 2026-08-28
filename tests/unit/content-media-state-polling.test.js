// tests/unit/content-media-state-polling.test.js
// Static guard for content.js media-state polling privacy/throttle boundaries.

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', 'extension');
const contentJs = fs.readFileSync(path.join(repoRoot, 'content.js'), 'utf8');
const manifest = fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8');

function expect(name, condition, details = '') {
  if (!condition) {
    console.error(`FAIL ${name}${details ? `: ${details}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS ${name}`);
}

function sectionBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) return '';
  return source.slice(start, end);
}

const mediaBlock = sectionBetween(
  contentJs,
  '媒体状态检测',
  '流游戏诊断探针'
);

expect('media block found', mediaBlock.length > 0);

expect(
  'manifest does not request scripting; mode notices use static content_scripts',
  !/"scripting"/.test(manifest)
);

expect(
  'manifest does not request management',
  !/"management"/.test(manifest)
);

expect(
  'MEDIA_STATE payload is state-only plus source label and minimal media evidence',
  /type:\s*'MEDIA_STATE'/.test(mediaBlock)
    && /playing,/.test(mediaBlock)
    && /isPiP,/.test(mediaBlock)
    && /mediaKind:\s*kind/.test(mediaBlock)
    && /audible:\s*snapshot\?\.audible === true/.test(mediaBlock)
    && /visibleMediaCount:\s*Number\(snapshot\?\.visibleMediaCount\) \|\| 0/.test(mediaBlock)
    && /documentVisible:\s*document\.visibilityState === 'visible'/.test(mediaBlock)
    && /source,/.test(mediaBlock)
);

expect(
  'content supports read-only media checkpoint snapshot',
  /msg\.type === 'GET_MEDIA_SNAPSHOT'/.test(contentJs)
    && /source:\s*'content_media_snapshot'/.test(contentJs)
);

const mediaSnapshotBranch = sectionBetween(
  contentJs,
  "msg.type === 'GET_MEDIA_SNAPSHOT'",
  "msg.type === 'EXIT_PIP'"
);

expect(
  'media checkpoint snapshot carries document visibility',
  /documentVisible:\s*document\.visibilityState === 'visible'/.test(mediaSnapshotBranch)
);

expect(
  'media checkpoint snapshot does not expose page URL/domain/title',
  mediaSnapshotBranch.length > 0
    && !/location\.href|document\.URL|document\.title|domain|url|title/.test(mediaSnapshotBranch)
);

for (const forbidden of [
  'location.href',
  'document.URL',
  'document.title',
  'textContent',
  'innerText',
  'innerHTML',
  'outerHTML',
  '.value',
  'clientX',
  'clientY',
  'screenX',
  'screenY',
  'keyCode',
  '.key',
  'screenshot',
]) {
  expect(`media block does not collect ${forbidden}`, !mediaBlock.includes(forbidden));
}

expect(
  'media poll interval is explicit',
  /MEDIA_POLL_INTERVAL_MS\s*=\s*1000/.test(mediaBlock)
);

expect(
  'media reaffirm interval is throttled to 30 seconds',
  /MEDIA_REAFFIRM_INTERVAL_MS\s*=\s*30000/.test(mediaBlock)
);

expect(
  'media polling uses a single sampling loop',
  (mediaBlock.match(/setInterval\(/g) || []).length === 1
    && /setInterval\(pollMediaState,\s*MEDIA_POLL_INTERVAL_MS\)/.test(mediaBlock)
    && !/setInterval\(\(\)\s*=>\s*updateMediaState/.test(mediaBlock)
    && !/5000/.test(mediaBlock)
);

expect(
  'forced reaffirm is guarded by active media or PiP',
  /else if \(force && \(newState \|\| newPiP\)\)/.test(mediaBlock)
);

expect(
  'unchanged media reaffirm checks active state and throttle',
  /!\(mediaPlaying \|\| pipActive\)/.test(mediaBlock)
    && /Date\.now\(\) - lastMediaStateSentAt >= MEDIA_REAFFIRM_INTERVAL_MS/.test(mediaBlock)
);

expect(
  'media polling inspects only audio/video elements',
  /querySelectorAll\('video, audio'\)/.test(mediaBlock)
);

expect(
  'media discovery registers and prunes open shadow roots',
  /mediaRoots\s*=\s*new Set\(\[document\]\)/.test(mediaBlock)
    && /el\.shadowRoot/.test(mediaBlock)
    && /registerMediaRoot\(el\.shadowRoot\)/.test(mediaBlock)
    && /root\?\.host\?\.isConnected/.test(mediaBlock)
    && /SHADOW_ROOT_DISCOVERY_INTERVAL_MS\s*=\s*30000/.test(mediaBlock)
);

expect(
  'video evidence is visibility and viewport filtered',
  /function isVisibleVideoElement/.test(mediaBlock)
    && /getBoundingClientRect/.test(mediaBlock)
    && /document\.visibilityState !== 'visible'/.test(mediaBlock)
    && /rect\.right > 0 && rect\.bottom > 0/.test(mediaBlock)
);

expect(
  'audible media evidence is separate from playing',
  /function isAudibleMediaElement/.test(mediaBlock)
    && /el\.muted !== true/.test(mediaBlock)
    && /Number\(el\.volume\) > 0/.test(mediaBlock)
);

const streamGameProbeBlock = sectionBetween(
  contentJs,
  '流游戏诊断探针',
  'YouTube 频道规则'
);

expect('stream-game probe block found', streamGameProbeBlock.length > 0);

expect(
  'stream-game probe is restricted to cg run page and samples every 10 seconds',
  /location\.hostname\.toLowerCase\(\) === 'cg\.163\.com'/.test(streamGameProbeBlock)
    && /location\.pathname === '\/run\.html'/.test(streamGameProbeBlock)
    && /STREAM_GAME_PROBE_INTERVAL_MS\s*=\s*10000/.test(streamGameProbeBlock)
);

expect(
  'stream-game probe records bounded evidence categories',
  /type:\s*'STREAM_GAME_PROBE'/.test(streamGameProbeBlock)
    && /advancingVideoCount/.test(streamGameProbeBlock)
    && /liveVideoTrackCount/.test(streamGameProbeBlock)
    && /largeCanvasCount/.test(streamGameProbeBlock)
    && /recentInput/.test(streamGameProbeBlock)
    && /pointerLocked/.test(streamGameProbeBlock)
);

for (const forbidden of [
  'location.href',
  'document.URL',
  'document.title',
  'textContent',
  'innerText',
  'innerHTML',
  'getContext(',
  'toDataURL(',
  'readPixels(',
  'clientX',
  'clientY',
  'keyCode',
  '.key',
]) {
  expect(`stream-game probe does not collect ${forbidden}`, !streamGameProbeBlock.includes(forbidden));
}

expect(
  'stream-game probe does not emit media state or foreground signals',
  !/type:\s*'MEDIA_STATE'|ACCESS_OBSERVED|dispatchTimingSignal/.test(streamGameProbeBlock)
);

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('[Content Media State Polling] privacy/throttle guards passed');

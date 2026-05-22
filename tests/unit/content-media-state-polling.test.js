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
  '标题变化追踪'
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
  'MEDIA_STATE payload is state-only plus source label',
  /chrome\.runtime\.sendMessage\(\{\s*type:\s*'MEDIA_STATE',\s*playing,\s*isPiP,\s*mediaKind:\s*kind,\s*source\s*\}\)/.test(mediaBlock)
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

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('[Content Media State Polling] privacy/throttle guards passed');

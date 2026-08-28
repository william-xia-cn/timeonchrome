// stream-game-probe.test.js
// Run with: node tests/unit/stream-game-probe.test.js

'use strict';

const fs = require('fs');
const path = require('path');

const extensionRoot = path.join(__dirname, '..', '..', 'extension');
const moduleSource = fs.readFileSync(path.join(extensionRoot, 'infra', 'stream-game-probe.js'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8');
const budgetSource = fs.readFileSync(path.join(extensionRoot, 'infra', 'session-storage-budget.js'), 'utf8');

let passed = 0;

function check(name, condition, details = '') {
  if (!condition) throw new Error(`${name}${details ? `: ${details}` : ''}`);
  passed += 1;
  console.log(`PASS ${name}`);
}

function loadProbe(session) {
  let source = moduleSource
    .replace(/import\s+\{\s*budgetedSessionSet\s*\}\s+from\s+'\.\/session-storage-budget\.js';/, 'const budgetedSessionSet = __budgetedSessionSet;')
    .replace(/export\s+async\s+function\s+/g, 'async function ')
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s+const\s+/g, 'const ');
  source += '\nreturn { sanitizeStreamGameProbeSample, recordStreamGameProbe, STREAM_GAME_PROBE_KEY, STREAM_GAME_PROBE_MAX_SAMPLES };';
  const budgetedSessionSet = async (items) => {
    Object.assign(session, items);
    return { ok: true };
  };
  const chrome = {
    storage: {
      session: {
        async get(key) { return { [key]: session[key] }; },
      },
    },
  };
  global.chrome = chrome;
  return new Function('__budgetedSessionSet', 'chrome', source)(budgetedSessionSet, chrome);
}

async function run() {
  const session = {};
  const probe = loadProbe(session);
  const sender = {
    frameId: 7,
    tab: { id: 91, windowId: 12, url: 'https://cg.163.com/run.html?game=private-value' },
  };
  const sample = {
    documentVisible: true,
    fullscreen: false,
    pointerLocked: true,
    recentInput: true,
    audioContextActive: false,
    videoElementCount: 2.9,
    playingVideoCount: 1,
    visibleVideoCount: 1,
    canvasCount: 5000,
    title: 'must-not-persist',
    url: 'https://private.example/path',
    text: 'private game content',
    key: 'SecretKey',
  };

  const sanitized = probe.sanitizeStreamGameProbeSample(sample, sender, 1787961600123);
  check('cg run page is accepted', sanitized?.tabId === 91 && sanitized?.frameId === 7);
  check('numeric evidence is integer-bounded', sanitized.videoElementCount === 2 && sanitized.canvasCount === 1000);
  check('boolean evidence is normalized', sanitized.documentVisible === true && sanitized.pointerLocked === true);
  check(
    'payload does not retain page or input content',
    !['title', 'url', 'text', 'key'].some((field) => Object.prototype.hasOwnProperty.call(sanitized, field))
      && !JSON.stringify(sanitized).includes('private-value')
      && !JSON.stringify(sanitized).includes('SecretKey')
  );
  check('subframe marker comes from sender metadata', sanitized.topFrame === false);

  check(
    'non-target host is rejected',
    probe.sanitizeStreamGameProbeSample(sample, { ...sender, tab: { ...sender.tab, url: 'https://example.com/run.html' } }) === null
  );
  check(
    'non-target path is rejected',
    probe.sanitizeStreamGameProbeSample(sample, { ...sender, tab: { ...sender.tab, url: 'https://cg.163.com/' } }) === null
  );
  check(
    'non-https target is rejected',
    probe.sanitizeStreamGameProbeSample(sample, { ...sender, tab: { ...sender.tab, url: 'http://cg.163.com/run.html' } }) === null
  );

  for (let i = 0; i < 65; i += 1) {
    await probe.recordStreamGameProbe({ ...sample, videoElementCount: i }, sender);
  }
  check('session probe keeps no more than 60 samples', session[probe.STREAM_GAME_PROBE_KEY]?.length === 60);
  check('bounded probe retains newest samples', session[probe.STREAM_GAME_PROBE_KEY]?.at(-1)?.videoElementCount === 64);

  const branchStart = backgroundSource.indexOf("msg.type === 'STREAM_GAME_PROBE'");
  const branchEnd = backgroundSource.indexOf("msg.type === 'MEDIA_STATE'", branchStart);
  const backgroundBranch = backgroundSource.slice(branchStart, branchEnd);
  check('background has a dedicated probe branch', branchStart >= 0 && branchEnd > branchStart && /recordStreamGameProbe/.test(backgroundBranch));
  check('probe branch does not dispatch timing', !/dispatchTimingSignal|handleModeEvent|MEDIA_STATE/.test(backgroundBranch));
  check('probe module never references ledgers, quota, cloud, or timing dispatcher', !/usage_segments|media_segments|getQuota|cloud-sync|dispatchTimingSignal/.test(moduleSource));
  check('probe key is disposable under session pressure', budgetSource.includes("'stream_game_probe_v1'"));

  console.log(`[Stream Game Probe] ${passed}/${passed} passed`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

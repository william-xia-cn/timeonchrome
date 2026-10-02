const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('pages/index.html', 'utf8');
const start = html.indexOf('// D-114 read-only management projection.');
const end = html.indexOf('\nfunction renderQuotaPage()', start);
assert.ok(start > 0 && end > start);
const code = html.slice(start, end);
function harness() {
  const nodes = new Map(), requests = [], timers = [];
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, {textContent: '', innerHTML: '', disabled: false,
      replaceChildren() { this.innerHTML = ''; }, classList: {contains: () => context.visible}});
    return nodes.get(id);
  };
  const context = {currentProfileId: 'child', remoteConfigVersion: 34, remoteConfig: {sharedAccess: {stage: 'shadow'}},
    date: '2026-10-03', visible: true, cloudRulesManagementActiveTab: 'quota',
    shanghaiWeekDateRange: () => ({to: context.date}), document: {getElementById: get},
    setTimeout: callback => {timers.push(callback); return timers.length;}, clearTimeout: () => {},
    api: url => new Promise((resolve, reject) => requests.push({url, resolve, reject}))};
  vm.createContext(context); vm.runInContext(code, context);
  return {context, get, requests, timers};
}
const snapshot = overrides => ({schemaVersion: 1, profileId: 'child', policyRevision: 'profile-config:34', revision: 'r',
  date: '2026-10-03', stage: 'shadow', complete: true, usableForEnforcement: false,
  day: {complete: true, usedMs: {study: 1200000, composite: 1500, rest: 0}, remainingMs: {study: 60000, composite: null, rest: 600000}},
  week: {complete: true, restUsedMs: 600000, restRemainingMs: 1200000, reasonCodes: []},
  web: {complete: true, availableScopeCount: 1, expectedScopeCount: 1},
  application: {complete: true, availableScopeCount: 2, expectedScopeCount: 2},
  settledAtMs: Date.parse('2026-10-03T00:00:00+08:00'), reasonCodes: [],
  sources: [{sourceKey: 'PRIVATE-ID'}], ...overrides});
const content = h => [...harnessIds.map(id => h.get(id).textContent), h.get('shared-access-summary-values').innerHTML].join(' ');
const harnessIds = ['shared-access-summary-status', 'shared-access-summary-coverage', 'shared-access-summary-reasons'];
(async () => {
  const h = harness(), pending = h.context.refreshSharedAccessManagementState();
  assert.match(h.requests[0].url, /^\/profiles\/child\/shared-access-state\/v1\?date=2026-10-03$/);
  h.requests[0].resolve(snapshot()); await pending;
  assert.match(content(h), /20分0秒/); assert.match(content(h), /500毫秒/);
  assert.match(content(h), /无限制/); assert.match(content(h), /尚未启用共享限制/);
  assert.doesNotMatch(content(h), /PRIVATE-ID/);
  assert.equal(h.get('shared-access-summary-refresh').disabled, false);
  const shared = harness(), sharedRead = shared.context.refreshSharedAccessManagementState();
  shared.requests[0].resolve(snapshot({stage: 'shared', usableForEnforcement: false})); await sharedRead;
  assert.match(content(shared), /已配置共享阶段/); assert.doesNotMatch(content(shared), /尚未启用共享限制/);
  const missing = h.context.refreshSharedAccessManagementState();
  h.requests[1].resolve(snapshot({complete: false, week: {complete: false, restUsedMs: 0, restRemainingMs: 0,
    reasonCodes: ['WEB_COVERAGE_MISSING', '<script>private</script>']}, reasonCodes: ['APPLICATION_COVERAGE_MISSING']}));
  await missing;
  assert.match(content(h), /来源不完整/); assert.match(content(h), /APPLICATION_COVERAGE_MISSING/);
  assert.doesNotMatch(h.get('shared-access-summary-values').innerHTML, /0分0秒|无限制/);
  assert.doesNotMatch(content(h), /<script>|private/);
  const failed = h.context.refreshSharedAccessManagementState(); h.requests[2].reject(Error('SECRET-ERROR')); await failed;
  assert.match(content(h), /SHARED_ACCESS_STATE_UNAVAILABLE/); assert.doesNotMatch(content(h), /SECRET/);
  assert.equal(h.get('shared-access-summary-values').innerHTML, '');
  // Same-child refresh must not allow an older response or finally to overwrite the new read.
  const race = harness(), old = race.context.refreshSharedAccessManagementState(), latest = race.context.refreshSharedAccessManagementState();
  race.requests[1].resolve(snapshot()); await latest;
  race.requests[0].resolve(snapshot({complete: false})); await old;
  assert.match(content(race), /今日来源完整/);
  for (const mutate of [c => c.currentProfileId = 'another', c => c.remoteConfigVersion++,
    c => c.remoteConfig.sharedAccess.stage = 'shared', c => c.date = '2026-10-04',
    c => c.cloudRulesManagementActiveTab = 'schedule', c => c.visible = false]) {
    const isolated = harness(), read = isolated.context.refreshSharedAccessManagementState();
    mutate(isolated.context); isolated.requests[0].resolve(snapshot()); await read;
    assert.equal(isolated.get('shared-access-summary-values').innerHTML, '');
    assert.doesNotMatch(content(isolated), /今日来源完整/);
  }
  const mismatch = harness(), mismatched = mismatch.context.refreshSharedAccessManagementState();
  mismatch.requests[0].resolve(snapshot({policyRevision: 'profile-config:33'})); await mismatched;
  assert.match(content(mismatch), /SHARED_ACCESS_VERSION_MISMATCH/);
  const timeout = harness(), timed = timeout.context.refreshSharedAccessManagementState(); timeout.timers[0](); await timed;
  assert.match(content(timeout), /SHARED_ACCESS_READ_TIMEOUT/);
  timeout.requests[0].resolve(snapshot()); await Promise.resolve();
  assert.equal(timeout.get('shared-access-summary-values').innerHTML, '');
  const hidden = harness(); hidden.context.visible = false; await hidden.context.refreshSharedAccessManagementState();
  assert.equal(hidden.requests.length, 0);
  const zero = harness(), zeroRead = zero.context.refreshSharedAccessManagementState();
  zero.requests[0].resolve(snapshot({day: {complete: true, usedMs: {study: 0, composite: 0, rest: 0}, remainingMs: {study: 0, composite: 0, rest: 0}}}));
  await zeroRead; assert.match(zero.get('shared-access-summary-values').innerHTML, /0分0秒/);
  assert.ok(html.includes('void refreshSharedAccessManagementState();'));
  for (const inline of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    if (!inline[1].includes('import ')) new vm.Script(inline[1]);
  }
  console.log('PASS shared access management view: real read, precision, coverage, stage, isolation, timeout, privacy and script syntax');
})();

// Generate an isolated static rendering from the real CSS, markup and renderer, not family data.
if (process.argv.includes('--visual-fixture')) {
  const os = require('node:os'), path = require('node:path');
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'd114-shared-access-view-'));
  const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const markupStart = html.indexOf('<div class="card" id="shared-access-summary"');
  const markupEnd = html.indexOf('\n        <div class="card">', markupStart);
  const renderer = code.slice(code.indexOf('function sharedAccessSummaryDuration'), code.indexOf('async function refreshSharedAccessManagementState'));
  const fixture = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${style}body{display:block;padding:20px;background:#f4faf8}main{max-width:1180px;margin:auto}</style><main><h1>D-114 共享配额 · 隔离 mock 验证</h1>${html.slice(markupStart, markupEnd)}</main><script>${renderer}\nrenderSharedAccessManagementState(${JSON.stringify(snapshot())});</script></html>`;
  const file = path.join(fixtureRoot, 'index.html'); fs.writeFileSync(file, fixture);
  console.log('VISUAL_FIXTURE=' + file);
}

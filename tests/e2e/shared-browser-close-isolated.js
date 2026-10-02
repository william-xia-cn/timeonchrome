'use strict';
// Real Chromium/extension APIs; only an ephemeral Profile and localhost pages.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { chromium } = require('@playwright/test');
const root = path.resolve(__dirname, '../..');
async function run() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'toc-close-isolated-'));
  const bundle = path.join(temp, 'extension');
  fs.cpSync(path.join(root, 'extension'), bundle, { recursive: true });
  fs.writeFileSync(path.join(bundle, 'deployment-profile.json'), JSON.stringify({ mode: 'isolated-test' }));
  fs.writeFileSync(path.join(bundle, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'TimeOnChrome isolated close evaluation',
    version: '0.0.1', permissions: ['debugger', 'tabs', 'storage', 'idle', 'webNavigation', 'alarms', 'notifications'],
    host_permissions: ['http://127.0.0.1/*'], background: { service_worker: 'isolation-worker.js', type: 'module' } }));
  fs.writeFileSync(path.join(bundle, 'isolation-worker.js'), `
    import {createSharedBrowserCloser} from './product/shared-browser-closer.js';
    import {isSharedAccessRuntimeEnabled} from './product/shared-access-runtime.js';
    import {pollSharedAccessIntegration} from './product/shared-access-integration.js';
    import {createSharedBrowserExecutor} from './product/shared-browser-executor.js';
    import {initSignal} from './core/signal.js';
    import {dispatchTimingSignal} from './core/timing-dispatcher.js';
    import {initSession,transitionState,getSession,setCachedEffectiveMode} from './runtime/session.js';
    let watched=null, chain=Promise.resolve(), events=[], failures=[];
    initSignal(event=>{
      events.push(event._reason); chain=chain.then(()=>dispatchTimingSignal(event)).catch(e=>failures.push(e.message));
    });
    // This evaluation isolates close settlement, not OS idle precision; avoid host idle expiring its ACTIVE fixture.
    chrome.idle.setDetectionInterval(86400);
    globalThis.testStart=async id=>{
      await chain; watched=id; events=[]; failures=[]; await chrome.storage.local.clear(); await chrome.storage.session.clear();
      await chrome.storage.local.set({guardian_config:{enabled:true,mode:'rest',restrictedEntertainmentList:['127.0.0.1'],
        studyList:[],compositeList:[],unsafeList:[],timeQuota:{accountingVersion:2}},monitoringEnabled:1});
      await initSession();setCachedEffectiveMode('rest');const tab=await chrome.tabs.get(id);
      await transitionState('ACTIVE','127.0.0.1',{tabId:id,windowId:tab.windowId,targetClassificationAtTime:'restricted',quotaBucketAtTime:'rest'});
      return {id:tab.id,windowId:tab.windowId,url:tab.url};
    };
    globalThis.testClose=async(target,effect)=>createSharedBrowserCloser({timeoutMs:8000,
      readCapability:async()=>({available:await chrome.permissions.contains({permissions:['debugger']})})}).close(target,effect,async()=>true);
    globalThis.testDefaultOff=async()=>({enabled:isSharedAccessRuntimeEnabled(),
      poll:await pollSharedAccessIntegration(),executor:await createSharedBrowserExecutor().execute(null,null)});
    globalThis.testSnapshot=async()=>{await chain;const data=await chrome.storage.local.get(['usage_segments_v1','daily_usage_stats_v1','hourly_usage_stats_v1']);
      return {data,session:await getSession(),events,failures};};
  `);
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>Isolated close</title><button id="ready">Ready</button>'
      + (request.url === '/protected' ? '<script>addEventListener("beforeunload",e=>{e.preventDefault();e.returnValue=""})</script>' : ''));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let context;
  try {
    context = await chromium.launchPersistentContext(path.join(temp, 'profile'), { headless: false,
      args: [`--disable-extensions-except=${bundle}`, `--load-extension=${bundle}`, '--no-first-run'], timeout: 30000 });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const defaults = await worker.evaluate(() => testDefaultOff());
    assert.equal(defaults.enabled, false); assert.equal(defaults.poll.skipped, true); assert.equal(defaults.executor.skipped, true);
    const control = context.pages()[0] || await context.newPage();
    await control.goto('about:blank');
    const origin = `http://127.0.0.1:${server.address().port}`;
    const results = [];
    for (const [name, route, effect, expected] of [
      ['normal', '/plain', 'request-normal-close', 'completed'],
      ['cancel', '/protected', 'request-normal-close', 'canceled'],
      ['force', '/protected', 'force-close', 'completed'],
    ]) {
      const page = await context.newPage(); await page.goto(origin + route); await page.locator('#ready').click();
      if (name === 'cancel') page.on('dialog', dialog => { void dialog.dismiss(); });
      const tabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(t => t.url === url).id, origin + route);
      await new Promise(resolve => setTimeout(resolve, 300));
      const target = await worker.evaluate(id => testStart(id), tabId);
      await new Promise(resolve => setTimeout(resolve, 2200));
      const result = await worker.evaluate(({ target, effect }) => testClose(target, effect), { target, effect });
      assert.equal(result.outcome, expected, name + ': actual target outcome');
      await new Promise(resolve => setTimeout(resolve, 500));
      const snapshot = await worker.evaluate(() => testSnapshot());
      console.log(JSON.stringify({ name, outcome: result.outcome, sessionState: snapshot.session.state,
        events: snapshot.events, segments: Object.values(snapshot.data.usage_segments_v1 || {}).map(s => ({tabId:s.tabId,durationSeconds:s.durationSeconds,reason:s.settlementReason})) }));
      assert.deepEqual(snapshot.failures, [], name + ': natural accounting errors');
      const segments = Object.values(snapshot.data.usage_segments_v1 || {}).filter(s => s.tabId === tabId);
      const rawSeconds = segments.reduce((n, s) => n + s.durationSeconds, 0);
      const sumStats = values => Object.values(values || {}).reduce((n, row) => n + Object.values(row.domains || {}).reduce((m, d) => m + (d.activeSeconds || 0), 0), 0);
      const dailySeconds = sumStats(snapshot.data.daily_usage_stats_v1), hourlySeconds = sumStats(snapshot.data.hourly_usage_stats_v1);
      if (expected === 'canceled') {
        assert.equal(page.isClosed(), false); assert.equal(snapshot.session.state, 'ACTIVE'); assert.equal(segments.length, 0);
        // Cleanup is outside the measured cancellation assertion.
        page.removeAllListeners('dialog'); await page.close();
      } else {
        assert.equal(page.isClosed(), true); assert.equal(segments.length, 1, name + ': only one natural settlement');
        assert.ok(segments[0].durationSeconds >= 2); assert.notEqual(snapshot.session.tabId, tabId);
        assert.equal(dailySeconds, rawSeconds); assert.equal(hourlySeconds, rawSeconds);
      }
      assert.equal(control.isClosed(), false, name + ': unrelated page survives');
      results.push({ name, outcome: result.outcome, segmentCount: segments.length, naturalEvents: snapshot.events,
        rawSeconds, dailySeconds, hourlySeconds, failures: snapshot.failures, unrelatedPageSurvives: !control.isClosed() });
    }
    const files = ['tests/e2e/shared-browser-close-isolated.js', 'extension/product/shared-browser-closer.js',
      'extension/core/signal.js', 'extension/core/timing-dispatcher.js', 'extension/runtime/session.js'];
    const hashes = Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
    const evidence = { browser: await context.browser()?.version(), isolated: true,
      nativeAuthorization: 'FIXTURE_NOT_VERIFIED', idleBoundary: 'ISOLATED_FIXTURE_NOT_VERIFIED',
      familyDataTouched: false, defaultOff: defaults, hashes, results };
    fs.writeFileSync(path.join(temp, 'close-ledger-evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
  } finally {
    await context?.close(); await new Promise(resolve => server.close(resolve));
    // Evidence/Profile remain in temp, never touching a loaded candidate or family Profile.
    console.log('Isolated evidence directory: ' + temp);
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });

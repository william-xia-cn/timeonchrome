// Isolated Chromium DOM + actual extension adapters + packaged Service transitions.
// No extension install, family profile, production endpoint or real ledger mutation.
'use strict';
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const pkg = process.argv[2];
if (!pkg) throw Error('Pass the verified extracted 1.24.0 package directory');
assert.equal(JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8')).version, '1.24.0');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const content = read('extension/content.js');
const between = (start, end) => {
  const from = content.indexOf(start);
  const to = content.indexOf(end, from + start.length);
  assert(from >= 0 && to > from);
  return content.slice(from, to);
};
const branch = between("    if (['SHOW_SHARED_REMINDER'", "    if (msg.type === 'SHOW_WARNING')");
const presentation = between('  function restReminderStyles()', '  function bindRestReminderSlider(');
const localModules = ['extension/core/shared-reminder-lifecycle.js', 'extension/infra/shared-reminder-lifecycle.js',
  'extension/product/shared-reminder-content-bridge.js'].map(file => read(file)
  .replace(/^import .+;\r?\n/gm, '').replace(/export /g, '')).join('\n');
const serviceSource = fs.readFileSync(path.join(pkg, 'dist/shared-reminder-lifecycle.js'), 'utf8');

async function run() {
  const browser = await chromium.launch({ executablePath: process.env.TOC_CONTENT_CHROME, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    await page.route('http://127.0.0.1:19424/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><meta charset="utf-8"><title>隔离提醒验证</title><style>video{max-width:100%;height:auto}</style><main><h1>测试媒体页面</h1><video width="640" height="360"></video></main>' }));
    await page.goto('http://127.0.0.1:19424/test');
    await page.evaluate(async ({ branch, presentation, localModules, serviceSource }) => {
      window.events = [];
      window.storageWrites = 0;
      window.mediaChanges = 0;
      window.nativeRequests = [];
      window.tabUrl = location.href;
      window.browserEvents = {};
      const event = name => ({ addListener(fn) { (window.browserEvents[name] ||= []).push(fn); } });
      HTMLMediaElement.prototype.pause = () => { window.mediaChanges++; };
      HTMLMediaElement.prototype.play = () => { window.mediaChanges++; return Promise.resolve(); };
      const listeners = [];
      window.chrome = { storage: { local: { set() { window.storageWrites++; throw Error('ledger write forbidden'); } } },
        runtime: { id: 'test-extension', lastError: null,
          onMessage: { addListener(fn) { listeners.push(fn); } },
          sendMessage(message, response) {
            window.events.push(message);
            const sender = { id: 'test-extension', frameId: 0, url: window.tabUrl, tab: { id: 1, windowId: 2 } };
            listeners.forEach(fn => fn(message, sender, response));
          } },
        tabs: { async get() { return { id: 1, windowId: 2, active: true, url: window.tabUrl }; },
          onUpdated: event('updated'), onRemoved: event('removed'), onReplaced: event('replaced'), onActivated: event('activated'),
          async sendMessage(id, message) {
            if (window.holdShow && message.type === 'SHOW_SHARED_REMINDER') {
              window.showEntered = true; await window.holdShow;
            }
            return window.deliver(message);
          } },
        windows: { async get() { return { id: 2, focused: true, state: 'normal' }; },
          onFocusChanged: event('focus'), onBoundsChanged: event('bounds') } };
      // Evaluate unchanged production presentation functions and the actual Content message branch.
      new Function(`let sharedReminderView = null; let restReminderDialog = null;
        const revokedSharedPresentations = new Set();
        const canRenderTopFrameUi = true; ${presentation}
        window.deliver = msg => new Promise(resolve => {
          const _sender = {id: chrome.runtime.id}; const sendResponse = resolve; ${branch}
        });`)();
      const service = await import('data:text/javascript;base64,' + btoa(serviceSource));
      window.serviceState = { schemaVersion: 1, roundId: 'round-1', reminderId: 'reminder-1', deliveryId: 'delivery-1',
        policyRevision: 'policy-1', stateRevision: 'state-1', date: '2026-10-02', kinds: ['daily', 'weekly'],
        presenter: 'browser', stage: 'shadow', issuedAtMs: 1000, offerExpiresAtMs: 300000,
        visibleAtMs: null, responseDeadlineSeconds: 60, timeoutAction: 'end', status: 'offered', resolution: null };
      const context = { scopeCurrent: true, presenterCurrent: true, currentPolicyRevision: 'policy-1',
        currentStateRevision: 'state-1', executionEnabled: false, nowMs: 2500, monotonicNowMs: 2400,
        bootId: 'boot-1', visibleBootId: null, visibleMonotonicMs: null };
      window.requestSharedReminderLifecycle = async (method, value) => {
        window.nativeRequests.push({ method, value });
        try {
          if (window.rejectNext && method === 'resolveSharedReminder') { window.rejectNext = false; return { ok: false, errorCode: 'shared_reminder_busy' }; }
          if (method !== 'getSharedReminderState') {
            const result = method === 'acknowledgeSharedReminderDelivery'
              ? service.acknowledgeSharedReminderDelivery({ ...context, state: window.serviceState }, value)
              : service.resolveSharedReminder({ ...context, state: window.serviceState }, value);
            window.serviceState = result.state;
            context.visibleBootId = result.visibleBootId;
            context.visibleMonotonicMs = result.visibleMonotonicMs;
            window.effects = [...(window.effects || []), result.effect];
          }
          const response = { ok: true, state: window.serviceState };
          if (window.holdAck && method === 'acknowledgeSharedReminderDelivery') {
            window.ackEntered = true; await window.holdAck;
          }
          if (window.holdChoice && method === 'resolveSharedReminder') {
            window.choiceEntered = true; await window.holdChoice;
          }
          return response;
        } catch (error) { return { ok: false, errorCode: error.message }; }
      };
      new Function(`const requestSharedReminderLifecycle = window.requestSharedReminderLifecycle;
        const getSharedBrowserActivityLease = () => 'fixture-lease';
        ${localModules}
        initSharedReminderContentBridge();
        window.configureBridge = configureSharedReminderContentBridge;
        window.pollBridge = pollSharedReminderForTab;`)();
    }, { branch, presentation, localModules, serviceSource });
    const disabled = await page.evaluate(() => window.pollBridge(1, '2026-10-02'));
    assert.equal(disabled.skipped, true);
    assert.equal(await page.locator('#__toc_shared_reminder__').count(), 0);
    await page.evaluate(() => window.configureBridge({ enabled: true }));
    const result = await page.evaluate(() => window.pollBridge(1, '2026-10-02'));
    assert.equal(result.state.visibleAtMs, 2500);
    assert.equal(await page.locator('#__toc_shared_reminder__').count(), 1);
    assert.equal(await page.getByRole('heading', { name: '今日与本周休息提醒' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: '滑动继续休息' }).isEnabled(), true);
    const output = path.join(root, 'output/playwright/d114');
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'shared-content-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'shared-content-mobile.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    // Actual drag, not a mocked continue button.
    const thumb = await page.getByRole('button', { name: '滑动继续休息' }).boundingBox();
    const slider = await page.locator('#shared-slider').boundingBox();
    await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
    await page.mouse.down();
    await page.mouse.move(slider.x + slider.width - 8, thumb.y + thumb.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction(() => window.serviceState.resolution === 'continue');
    assert.equal(await page.locator('#__toc_shared_reminder__').count(), 0);
    // New Service-issued delivery, failed button request and a successful explicit retry.
    await page.evaluate(() => {
      window.serviceState = { ...window.serviceState, roundId: 'round-2', reminderId: 'reminder-2', deliveryId: 'delivery-2',
        status: 'offered', resolution: null, visibleAtMs: null };
    });
    await page.evaluate(() => window.pollBridge(1, '2026-10-02'));
    await page.evaluate(() => { window.rejectNext = true; });
    await page.getByRole('button', { name: '结束休息', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '操作未完成，请重试' }).waitFor();
    assert.equal(await page.locator('#__toc_shared_reminder__').count(), 1);
    await page.getByRole('button', { name: '结束休息', exact: true }).click();
    await page.waitForFunction(() => window.serviceState.resolution === 'end_rest');
    await page.waitForFunction(() => !document.getElementById('__toc_shared_reminder__'));
    const nextRound = async number => page.evaluate(number => {
      window.serviceState = { ...window.serviceState, roundId: `round-${number}`, reminderId: `reminder-${number}`,
        deliveryId: `delivery-${number}`, status: 'offered', resolution: null, visibleAtMs: null };
    }, number);
    // Real Escape event only revokes the presentation; it is not a Service choice.
    await nextRound(3);
    await page.evaluate(() => window.pollBridge(1, '2026-10-02'));
    const beforeEscape = await page.evaluate(() => window.nativeRequests.filter(row => row.method === 'resolveSharedReminder').length);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('__toc_shared_reminder__'));
    assert.equal(await page.evaluate(() => window.nativeRequests.filter(row => row.method === 'resolveSharedReminder').length), beforeEscape);
    const races = [];
    for (const phase of ['Show', 'Ack', 'Choice']) {
      await nextRound(4 + races.length);
      if (phase === 'Choice') await page.evaluate(() => window.pollBridge(1, '2026-10-02'));
      await page.evaluate(phase => {
        window[`hold${phase}`] = new Promise(resolve => { window.releaseHeld = resolve; });
        window[`${phase.toLowerCase()}Entered`] = false;
        if (phase !== 'Choice') window.pendingPoll = window.pollBridge(1, '2026-10-02');
      }, phase);
      if (phase === 'Choice') await page.getByRole('button', { name: '结束休息', exact: true }).click();
      await page.waitForFunction(phase => window[`${phase.toLowerCase()}Entered`], phase);
      // Same-URL document reload event must invalidate even though tabs.get URL is unchanged.
      await page.evaluate(() => window.browserEvents.updated.forEach(fn => fn(1, { status: 'loading' })));
      await page.waitForFunction(() => !document.getElementById('__toc_shared_reminder__'));
      await page.evaluate(phase => { window[`hold${phase}`] = null; window.releaseHeld(); }, phase);
      if (phase !== 'Choice') assert.equal((await page.evaluate(() => window.pendingPoll)).ok, false);
      await page.waitForTimeout(80);
      assert.equal(await page.locator('#__toc_shared_reminder__').count(), 0);
      races.push(`late_${phase.toLowerCase()}_did_not_restore_ui`);
    }
    const evidence = await page.evaluate(() => ({ events: window.events, requests: window.nativeRequests,
      effects: window.effects, storageWrites: window.storageWrites, mediaChanges: window.mediaChanges, url: location.href }));
    assert.equal(evidence.storageWrites, 0);
    assert.equal(evidence.mediaChanges, 0);
    assert(evidence.effects.every(effect => effect === 'none'));
    assert(evidence.requests.filter(row => row.method === 'acknowledgeSharedReminderDelivery')
      .every(row => !Object.hasOwn(row.value, 'visibleAtMs')));
    assert(evidence.events.every(row => row.type === 'SHARED_REMINDER_DISMISSED'
      || (row.type === 'SHARED_REMINDER_ACTION' && ['continue', 'end_rest'].includes(row.payload.action))));
    assert.equal(evidence.url, 'http://127.0.0.1:19424/test');
    fs.writeFileSync(path.join(output, 'shared-content-evidence.json'), JSON.stringify({
      evidenceKind: 'real_chromium_dom_mock_chrome_and_native', chromeVersion: browser.version(), races,
      sourceHashes: Object.fromEntries(['extension/content.js', 'extension/infra/shared-reminder-lifecycle.js',
        'extension/product/shared-reminder-content-bridge.js'].map(file => [file, createHash('sha256').update(read(file)).digest('hex')])),
      serviceVersion: '1.24.0', serviceSourceHash: createHash('sha256').update(serviceSource).digest('hex'), ...evidence }, null, 2));
    console.log('[Isolated Chromium Content] default-off, visible ACK, drag continue, end retry, Escape, late SHOW/ACK/choice passed; no ledger/media/closing effects');
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });

const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { isolatedExtension } = require('./helpers/isolated-extension');

// Real SW/Content and bridge; only Native responses/execution are isolated fixtures.
const harness = `
import { configureSharedReminderContentBridge as configureTypedShared, pollSharedReminderForTab as pollTypedShared } from './product/shared-reminder-content-bridge.js';
let typedSharedState = null, typedSharedCalls = [], typedSharedEffects = [];
globalThis.typedSharedStart = async () => {
  const id = crypto.randomUUID();
  typedSharedState = { schemaVersion: 1, roundId: id, reminderId: id, deliveryId: id,
    policyRevision: 'policy-fixture', stateRevision: 'revision-fixture', date: '2026-10-15', kinds: ['daily', 'weekly'],
    presenter: 'browser', stage: 'shared', issuedAtMs: Date.now(), offerExpiresAtMs: Date.now() + 300000,
    visibleAtMs: null, responseDeadlineSeconds: 60, timeoutAction: 'end', status: 'offered', resolution: null };
  configureTypedShared({ enabled: true, readLease: () => 'lease-fixture', readContinuity: () => false,
    readExecution: async () => ({ ok: true, executionRevision: 'revision-fixture', policy: { revision: 'policy-fixture' } }),
    request: async (method, payload) => {
      typedSharedCalls.push({ method, payload });
      if (method === 'acknowledgeSharedReminderDelivery') typedSharedState = { ...typedSharedState,
        status: payload.delivery === 'visible' ? 'visible' : 'delivery_failed', visibleAtMs: Date.now() };
      if (method === 'resolveSharedReminder') typedSharedState = { ...typedSharedState, status: 'resolved', resolution: payload.action };
      return { ok: true, state: typedSharedState };
    }, executor: { execute: async state => { typedSharedEffects.push(state.resolution); return { ok: true, effectsEnabled: false }; } } });
};
globalThis.typedSharedPoll = id => pollTypedShared(id, '2026-10-15');
globalThis.typedSharedRead = () => ({ state: typedSharedState, calls: typedSharedCalls, effects: typedSharedEffects });
globalThis.typedSharedExpire = () => { typedSharedState = { ...typedSharedState, status: 'resolved', resolution: 'timeout_end' }; };
`;

test('shared browser reminder uses typed confirmation through real SW and Content', async () => {
  const server = http.createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><body><h1>Isolated shared reminder</h1></body></html>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let fixture;
  try {
    console.log('Shared typed: launching isolated extension');
    fixture = await isolatedExtension('shared-typed', harness);
    console.log('Shared typed: extension initialized');
    const { context, worker, probe, directory } = fixture;
    await context.route('https://**/*', route => route.abort());
    await probe.evaluate(async () => {
      const { DEFAULT_CONFIG, saveConfig } = await import('./infra/storage.js');
      await saveConfig({ ...DEFAULT_CONFIG, mode: 'study', isInitialized: true, studyList: ['127.0.0.1'],
        restConfig: { firstReminderMinutes: null, weeklyFirstReminderMinutes: null } });
    });
    const page = await context.newPage();
    const url = `http://127.0.0.1:${server.address().port}/`;
    await page.goto(url);
    console.log('Shared typed: test page loaded');
    await expect.poll(async () => {
      await page.bringToFront();
      return worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        return (await chrome.windows.get(tab.windowId)).focused;
      });
    }).toBe(true);
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
    await worker.evaluate(() => typedSharedStart());
    console.log('Shared typed: presenting', await worker.evaluate(id => typedSharedPoll(id), tabId));
    const input = page.getByRole('textbox', { name: '手动输入强行使用' });
    const confirm = page.getByRole('button', { name: '确认继续', exact: true });
    await expect(input).toBeEnabled();
    await expect(confirm).toBeDisabled();
    await expect(page.getByRole('button', { name: '滑动继续休息' })).toHaveCount(0);
    await input.fill('适合使用 '); await expect(confirm).toBeDisabled();
    expect(await input.evaluate(node => ['paste', 'drop'].every(type => !node.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(input).toBeVisible();
    await page.screenshot({ path: path.join(directory, 'desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: path.join(directory, 'mobile.png') });
    await input.fill('强行使用'); await confirm.click();
    await expect(page.locator('#__toc_shared_reminder__')).toHaveCount(0);
    const first = await worker.evaluate(() => typedSharedRead());
    expect(first.state.resolution).toBe('continue');
    expect(first.calls.filter(row => row.method === 'resolveSharedReminder')).toHaveLength(1);
    expect(first.calls.every(row => !Object.hasOwn(row.payload, 'confirmationText'))).toBe(true);
    await worker.evaluate(() => typedSharedStart()); await worker.evaluate(id => typedSharedPoll(id), tabId);
    await page.getByRole('button', { name: '结束休息', exact: true }).click();
    await expect(page.locator('#__toc_shared_reminder__')).toHaveCount(0);
    expect((await worker.evaluate(() => typedSharedRead())).state.resolution).toBe('end_rest');
    await worker.evaluate(() => typedSharedStart()); await worker.evaluate(id => typedSharedPoll(id), tabId);
    await expect(input).toBeVisible();
    await worker.evaluate(() => typedSharedExpire()); await worker.evaluate(id => typedSharedPoll(id), tabId);
    await expect(page.locator('#__toc_shared_reminder__')).toHaveCount(0);
    const last = await worker.evaluate(() => typedSharedRead());
    expect(last.effects.at(-1)).toBe('timeout_end');
    expect(last.calls.filter(row => row.method === 'resolveSharedReminder')).toHaveLength(2);
    expect(page.url()).toBe(url);
    expect(fixture.errors).toEqual([]);
    fs.writeFileSync(path.join(directory, 'evidence.json'), JSON.stringify({ realUnpacked: true, mockedNative: true,
      realNativeTimingNotVerified: true, noLedgerFixtureWrites: true, cases: ['merged_typed', 'wrong_text', 'paste_drop', 'escape', 'continue', 'end', 'service_timeout_result'] }, null, 2));
    console.log('Shared typed evidence: ' + directory);
  } finally {
    if (fixture) await fixture.context.close();
    await new Promise(resolve => server.close(resolve));
  }
});

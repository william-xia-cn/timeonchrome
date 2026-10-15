const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { isolatedExtension } = require('./helpers/isolated-extension');

test('manual mode message waits for website confirmation and preserves hard gates', async () => {
  const server = http.createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><body><h1>Isolated manual mode test</h1></body></html>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let fixture;
  try {
    fixture = await isolatedExtension('manual-advisory', `
      globalThis.manualPrepare = async () => {
        const config = await getConfig();
        const windows = new Date().getHours() === 0 ? [{start:'01:00',end:'02:00'}] : [{start:'00:00',end:'01:00'}];
        for (const day of Object.values(config.timeWindows.daily)) day.restWindows = windows;
        await saveConfig(config);
        await dispatchModeEvent({type:'REQUEST_MODE_CHANGE',requestedMode:'study',source:'isolated_setup'}, {recheck:false});
      };
      globalThis.manualRead = async () => ({ mode:(await chrome.storage.local.get('guardian_session')).guardian_session?.currentMode,
        trace:(await chrome.storage.session.get('mode_effect_trace_v1')).mode_effect_trace_v1 || [] });
      globalThis.manualBlacklist = async () => { const config=await getConfig(); config.customBlockedSites=['127.0.0.1']; await saveConfig(config);
        if (!(await getConfig()).unsafeList.includes('127.0.0.1')) throw Error('Blacklist fixture was not applied'); };
      globalThis.manualUnblock = async id => { const config=await getConfig(); config.customBlockedSites=[]; await saveConfig(config); await revokeScheduleConfirmation(id); };
    `);
    const { context, worker, probe, directory } = fixture;
    await context.route('https://**/*', route => route.abort());
    await probe.evaluate(async () => {
      const { DEFAULT_CONFIG, saveConfig } = await import('./infra/storage.js');
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      await saveConfig({ ...DEFAULT_CONFIG, mode:'study', isInitialized:true,
        studyList:[], compositeList:[], restrictedEntertainmentList:['127.0.0.1'], unsafeList:[],
        timeQuota:{accountingVersion:2,weekly:{restMinutes:null},daily:Object.fromEntries(days.map(day=>[day,
          {studyMinutes:null,restMinutes:null,compositeMinutes:null,onlineMinutes:null}]))},
        timeWindows:{daily:Object.fromEntries(days.map(day=>[day,{studyWindows:null,compositeWindows:null,restWindows:null}]))},
        autonomyConfig:{timeWindowAdvisoryEnabled:true,restrictedEntryConfirmationRequired:false},
        restConfig:{firstReminderMinutes:null,weeklyFirstReminderMinutes:null} });
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await expect.poll(async () => {
      await page.bringToFront();
      return worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({active:true,lastFocusedWindow:true});
        return (await chrome.windows.get(tab.windowId)).focused;
      });
    }).toBe(true);
    await expect.poll(async () => (await worker.evaluate(() => manualRead())).mode).toBe('rest');
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0].id);
    await worker.evaluate(() => manualPrepare());
    const read = () => worker.evaluate(() => manualRead());
    const changes = state => state.trace.filter(row => row.result?.modeChange?.changed === true).length;
    const baseline = await read();
    expect(baseline.mode).toBe('study');
    // Same extension runtime request used by Popup; no direct mode/ledger writes.
    const request = () => probe.evaluate(id => chrome.runtime.sendMessage({type:'REQUEST_MODE_CHANGE',toMode:'rest',source:'popup',noticeTabId:id}), tabId);
    const pending = await request();
    expect(pending.blocked).toBe(true);
    expect(pending.modeDecision.access).toBe('confirmation');
    await expect(page.getByRole('heading',{name:'当前不是合适的使用时间段'})).toBeVisible();
    expect((await read()).mode).toBe('study');
    expect(changes(await read())).toBe(changes(baseline));
    await page.screenshot({path:path.join(directory,'desktop.png')});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(directory,'mobile.png')});
    await page.getByRole('textbox',{name:'手动输入适合使用'}).fill('适合使用');
    await page.getByRole('button',{name:'确认继续',exact:true}).click();
    await expect(page.locator('#__toc_rest_usage_reminder__')).toHaveCount(0);
    await expect.poll(async () => (await read()).mode).toBe('rest');
    expect(changes(await read())).toBe(changes(baseline)+1);
    const same = await request();
    expect(same.blocked).toBe(false);
    expect(changes(await read())).toBe(changes(baseline)+1);
    await worker.evaluate(() => manualBlacklist());
    const blocked = await request();
    expect(blocked.blocked).toBe(true);
    expect(blocked.reminder.reason).toBe('unsafe');
    await expect.poll(() => page.url()).toContain('reminder.html');
    expect(changes(await read())).toBe(changes(baseline)+1);
    await worker.evaluate(id => manualUnblock(id), tabId);
    await probe.evaluate(id => chrome.runtime.sendMessage({type:'REQUEST_MODE_CHANGE',toMode:'rest',source:'reminder',noticeTabId:id}), tabId);
    await expect(page.getByRole('heading',{name:'当前不是合适的使用时间段'})).toBeVisible();
    expect(page.url()).toContain('http://127.0.0.1:');
    await page.getByRole('textbox',{name:'手动输入适合使用'}).fill('适合使用');
    await page.getByRole('button',{name:'确认继续',exact:true}).click();
    await expect(page.locator('#__toc_rest_usage_reminder__')).toHaveCount(0);
    expect(changes(await read())).toBe(changes(baseline)+1);
    expect(fixture.errors).toEqual([]);
    expect(await worker.evaluate(() => chrome.runtime.getManifest().version)).toBe('1.7.47');
    fs.writeFileSync(path.join(directory,'evidence.json'),JSON.stringify({realUnpacked:true,entry:'popup_runtime_message',
      noLedgerFixtureWrites:true,timingAccuracyNotClaimed:true,cases:['no_commit_before_confirmation','one_confirmed_mode_change','same_mode_idempotent','blacklist_priority','reminder_return_then_confirmation']}));
    console.log('Manual advisory evidence: '+directory);
  } finally {
    if (fixture) await fixture.context.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

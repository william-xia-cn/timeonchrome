const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { isolatedExtension } = require('./helpers/isolated-extension');

function tone() {
  const rate = 8000, result = Buffer.alloc(44 + rate * 2);
  result.write('RIFF'); result.writeUInt32LE(36 + rate * 2, 4); result.write('WAVEfmt ', 8);
  result.writeUInt32LE(16, 16); result.writeUInt16LE(1, 20); result.writeUInt16LE(1, 22);
  result.writeUInt32LE(rate, 24); result.writeUInt32LE(rate * 2, 28);
  result.writeUInt16LE(2, 32); result.writeUInt16LE(16, 34); result.write('data', 36);
  result.writeUInt32LE(rate * 2, 40);
  for (let i = 0; i < rate; i++) result.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / rate) * 20), 44 + i * 2);
  return result;
}

function inject(extension, file, marker, body) {
  const target = path.join(extension, file), source = fs.readFileSync(target, 'utf8');
  if (source.split(marker).length !== 2) throw Error(`Ambiguous injection: ${file}`);
  fs.writeFileSync(target, source.replace(marker, marker + '\n' + body));
}

const harness = `
globalThis.accountingAcceptance = {
  fault: null, hits: [], usage: 120, events: [], rounds: [],
  recheck: id => reevaluateTabById(id),
  deadline: () => forcedUsePrompt.checkDeadline(),
};
`;

test('D-115 real SW/Content/media: accounting failures release prompts, independent gates survive', async () => {
  test.setTimeout(240000);
  const audio = tone();
  const server = http.createServer((request, response) => {
    if (request.url.startsWith('/tone.wav')) { response.setHeader('Content-Type', 'audio/wav'); response.end(audio); }
    else {
      response.setHeader('Content-Type', 'text/html');
      response.end('<html lang="zh"><meta charset="utf-8"><body><h1>隔离故障验收媒体页</h1>'
        + '<button id="operate" onclick="this.dataset.clicked=\'yes\'">页面操作</button>'
        + '<audio id="playing" loop controls src="/tone.wav"></audio>'
        + '<audio id="paused" loop controls src="/tone.wav"></audio></body></html>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  let fixture;
  const results = [];
  try {
    fixture = await isolatedExtension('accounting-recovery', harness, { prepare: extension => {
      inject(extension, 'product/forced-use-prompt.js', '  const report = (prompt, phase, extra = {}) => {', `
        const a = globalThis.accountingAcceptance;
        if (a) {
          if (prompt?.token && !a.rounds.includes(prompt.token)) a.rounds.push(prompt.token);
          a.events.push({ phase, round: prompt?.token ? a.rounds.indexOf(prompt.token) + 1 : null,
            reason: extra.reason || null, causeCode: extra.causeCode || null });
        }`);
      inject(extension, 'background.js', '    forcedUsePrompt.handleAction(msg, sender).then((result) => {', `
        globalThis.accountingAcceptance?.events.push({ phase: 'action_response', ok: result?.ok,
          action: result?.action, error: result?.error, accountingUnavailable: result?.accountingUnavailable });`);
      // Inject only in the disposable copy: real quota evaluation consumes fixed amounts or a failed read.
      inject(extension, 'product/quota.js',
        'export async function getQuotaUsageForConfig(config = {}, date = getQuotaCalendarContext().date) {', `
        const acceptance = globalThis.accountingAcceptance;
        if (acceptance) {
          if (acceptance.fault === 'quota') { acceptance.hits.push('quota'); throw Error('isolated quota read failure'); }
          const rest = acceptance.usage;
          return { ok: true, studySeconds: 0, compositeSeconds: 0, restSeconds: rest,
            totalSeconds: rest, weekRestSeconds: rest, domainSeconds: { '127.0.0.1': rest },
            studyMinutes: 0, compositeMinutes: 0, undeterminedMinutes: 0,
            restMinutes: rest / 60, totalMinutes: rest / 60, weekRestMinutes: rest / 60 };
        }`);
      inject(extension, 'infra/forced-use-contribution-store.js',
        'export async function persistForcedUseGrantEvidence(grant, now = Date.now()) {', `
        if (globalThis.accountingAcceptance?.fault === 'grant') {
          globalThis.accountingAcceptance.hits.push('grant'); throw Error('isolated grant persistence failure');
        }`);
    } });
    const { context, worker, probe } = fixture;
    await context.route('https://**/*', route => route.abort());
    const page = await context.newPage();
    const overlay = page.locator('#__toc_rest_usage_reminder__');
    const reset = async ({ gate = null, fault = null, usage = 120 } = {}) => {
      await page.goto('about:blank');
      await worker.evaluate(({ fault, usage }) => {
        accountingAcceptance.fault = fault; accountingAcceptance.usage = usage; accountingAcceptance.hits = [];
      }, { fault, usage });
      await probe.evaluate(async gate => {
        const { DEFAULT_CONFIG, saveConfig } = await import('./infra/storage.js');
        const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
        const hour = (Number(new Intl.DateTimeFormat('en-US', { hour: '2-digit', hourCycle: 'h23',
          timeZone: 'Asia/Shanghai' }).format(new Date())) + 2) % 24;
        const closed = [{ start: String(hour).padStart(2, '0') + ':00', end: String(hour + 1).padStart(2, '0') + ':00' }];
        await chrome.storage.session.remove('forced_use_prompt_state_v1');
        await chrome.storage.local.set({ cloud_profile_id: 'isolated-profile', cloud_device_id: 'isolated-device' });
        await saveConfig({ ...DEFAULT_CONFIG, enabled: true, mode: 'rest', isInitialized: true,
          studyList: [], compositeList: [], restrictedEntertainmentList: ['127.0.0.1'],
          customBlockedSites: gate === 'blacklist' ? ['127.0.0.1'] : [], unsafeList: gate === 'blacklist' ? ['127.0.0.1'] : [],
          domainQuotas: {},
          timeQuota: { accountingVersion: 2, weekly: { restMinutes: null }, daily: Object.fromEntries(days.map(day =>
            [day, { studyMinutes: null, compositeMinutes: null, restMinutes: 1, onlineMinutes: null }])) },
          timeWindows: { daily: Object.fromEntries(days.map(day => [day, {
            studyWindows: null, compositeWindows: null, restWindows: gate === 'window' ? closed : null }])) },
          downtimeConfig: { schemaVersion: 1, enabled: gate === 'downtime',
            windowsByWeekday: Object.fromEntries(days.map(day => [day, [{ start: '00:00', end: '24:00' }]])),
            allowedWebsiteTypes: [], allowedApplicationTypes: [] },
          restConfig: { firstReminderMinutes: null, weeklyFirstReminderMinutes: null },
          autonomyConfig: { timeWindowAdvisoryEnabled: false, quotaOverrunConfirmationRequired: true,
            restrictedEntryConfirmationRequired: false },
          forcedUsePolicyV1: { schemaVersion: 1, enabled: true, reminderIntervalMinutes: 30,
            quotaOverrunMinutes: { dailyStudy: null, dailyComposite: null, dailyRest: null,
              dailyOnline: null, weeklyRest: null, domain: null }, advisoryWindowDailyMaxMinutes: null } });
      }, gate);
      await page.goto(url);
      await page.bringToFront();
      return worker.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
    };
    const fault = value => worker.evaluate(value => { accountingAcceptance.fault = value; }, value);
    const show = async () => {
      const id = await reset({ usage: 0 });
      await page.locator('#playing').evaluate(audio => audio.play());
      await expect.poll(() => page.locator('#playing').evaluate(audio => audio.currentTime)).toBeGreaterThan(0);
      await worker.evaluate(() => { accountingAcceptance.usage = 120; });
      await worker.evaluate(id => accountingAcceptance.recheck(id), id);
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20000 });
      await expect.poll(() => page.locator('#playing').evaluate(audio => audio.paused)).toBe(true);
      return id;
    };
    const confirm = async () => {
      await page.getByRole('textbox', { name: '手动输入强行使用' }).fill('强行使用');
      await page.getByRole('button', { name: '确认继续', exact: true }).click();
    };
    const released = async name => {
      await expect(overlay).toHaveCount(0, { timeout: 10000 });
      expect(page.url()).toBe(url);
      await expect.poll(() => page.locator('#playing').evaluate(audio => audio.paused)).toBe(false);
      await expect.poll(() => page.locator('#playing').evaluate(audio => audio.currentTime)).toBeGreaterThan(0);
      const resumedAt = await page.locator('#playing').evaluate(audio => audio.currentTime);
      await expect.poll(() => page.locator('#playing').evaluate(audio => audio.currentTime)).not.toBe(resumedAt);
      expect(await page.locator('#paused').evaluate(audio => audio.paused)).toBe(true);
      await worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        return accountingAcceptance.recheck(tab.id);
      });
      await expect(overlay).toHaveCount(0);
      await page.locator('#operate').click();
      await expect(page.locator('#operate')).toHaveAttribute('data-clicked', 'yes');
      const hits = await worker.evaluate(() => [...accountingAcceptance.hits]);
      results.push({ name, overlayClosed: true, playingResumed: true, pausedPreserved: true, pageOperable: true, faultHits: hits.length });
      console.log('Verified browser scenario: ' + name);
      await page.screenshot({ path: test.info().outputPath(name + '.png') });
    };

    // An already failing reader must not produce an entry prompt or pause playback.
    let id = await reset({ fault: 'quota' });
    await page.locator('#playing').evaluate(audio => audio.play());
    await worker.evaluate(id => accountingAcceptance.recheck(id), id);
    await released('before-entry-quota-failure');
    expect(await worker.evaluate(() => accountingAcceptance.hits.length)).toBeGreaterThan(0);

    for (const value of ['quota', 'grant']) {
      await show();
      await page.screenshot({ path: test.info().outputPath(value + '-prompt.png') });
      await fault(value);
      await confirm();
      await released('confirm-' + value + '-failure');
      expect(await worker.evaluate(value => accountingAcceptance.hits.includes(value), value)).toBe(true);
    }

    await show();
    await fault('quota');
    const started = Date.now();
    await expect(overlay).toHaveCount(0, { timeout: 70000 });
    expect(Date.now() - started).toBeGreaterThan(55000);
    await released('real-timeout-quota-failure');
    await worker.evaluate(() => accountingAcceptance.deadline());
    expect(page.url()).toBe(url);

    await show();
    await confirm();
    await released('healthy-confirm');
    await show();
    const normalStarted = Date.now();
    await expect(page).toHaveURL(/reminder\.html.*reason=forced_use_confirmation_blocked/, { timeout: 70000 });
    expect(Date.now() - normalStarted).toBeGreaterThan(55000);
    results.push({ name: 'healthy-real-timeout', blocked: true });

    for (const [gate, reason] of [['blacklist', 'unsafe'], ['downtime', 'downtime'], ['window', 'rest_schedule_locked']]) {
      await reset({ gate, fault: 'quota' });
      await expect(page).toHaveURL(new RegExp('reminder\\.html.*reason=' + reason), { timeout: 20000 });
      await expect(overlay).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath(gate + '-blocked.png') });
      results.push({ name: gate + '-with-quota-failure', blocked: true, reason });
    }
    fs.writeFileSync(test.info().outputPath('acceptance-results.json'), JSON.stringify(results, null, 2));
    console.log('D-115 real browser acceptance: ' + JSON.stringify(results));
  } catch (error) {
    if (fixture) {
      const diagnostic = await fixture.worker.evaluate(async () => {
        const a = accountingAcceptance;
        const state = (await chrome.storage.session.get('forced_use_prompt_state_v1')).forced_use_prompt_state_v1;
        return { events: a.events, fault: a.fault, hits: a.hits, promptPresent: !!state?.prompt,
          progressPresent: !!state?.progress, grantCount: state?.grants?.length || 0 };
      }).catch(() => ({ diagnosticUnavailable: true }));
      fs.writeFileSync(test.info().outputPath('failure-diagnostic.json'), JSON.stringify(diagnostic, null, 2));
      console.log('Isolated diagnostic: ' + JSON.stringify(diagnostic));
      const page = fixture.context.pages().find(p => p.url().startsWith(url));
      if (page) await page.screenshot({ path: test.info().outputPath('failure.png') });
    }
    throw error;
  } finally {
    fs.writeFileSync(test.info().outputPath('partial-results.json'), JSON.stringify(results, null, 2));
    if (fixture) await fixture.context.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

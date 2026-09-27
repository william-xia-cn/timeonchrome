const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createHash, webcrypto } = require('node:crypto');
const { isolatedExtension } = require('./helpers/isolated-extension');

test('real Wikipedia navigation and title/SPA observations do not fabricate ledger facts', async () => {
  test.setTimeout(90000);
  const fixture = await isolatedExtension('composite-wikipedia', `
globalThis.compositeAcceptanceContext = async () => {
  const [session, activation, tabs] = await Promise.all([
    getTimingSession(), resolveActivationState(), chrome.tabs.query({active:true,lastFocusedWindow:true})
  ]);
  const tab=tabs[0], win=tab?.windowId == null ? null : await chrome.windows.get(tab.windowId);
  return { session, activation: { activated:activation.activated, reason:activation.reason, mode:activation.activationMode },
    monitoringEnabled:getSyncState().monitoringEnabled, activeTab:tab?.id, activeWindow:tab?.windowId,
    focused:win?.focused, minimized:win?.state==='minimized' };
};
`);
  try {
    const { context, worker, probe, directory } = fixture;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return !['http:', 'https:'].includes(url.protocol) || /(^|\.)(wikipedia|wikimedia)\.org$/.test(url.hostname)
        ? route.continue() : route.abort();
    });
    const read = async () => {
      const snapshot = await worker.evaluate(async () => ({
        ...await chrome.storage.local.get(['composite_page_observations_v1', 'usage_segments_v1']),
        context: await compositeAcceptanceContext(),
      }));
      fs.writeFileSync(path.join(directory, 'latest-context.json'), JSON.stringify(snapshot.context, null, 2));
      return snapshot;
    };
    if (process.env.COMPOSITE_ACCEPTANCE_FALLBACK_ONLY === '1') {
      const fallback = await probe.evaluate(async () => {
        const { DEFAULT_CONFIG, saveConfig, getConfig } = await import('./infra/storage.js');
        await saveConfig({ ...DEFAULT_CONFIG, isInitialized: true,
          compositeList: [], customCompositeList: [], defaultCompositeSites: [], defaultUserCompositeSites: [],
          managedTargetsV1: [], siteClassificationRulesV1: [], compositeReviewConfig: { enabled: true } });
        await chrome.storage.local.set({ cloud_device_id: 'isolated-wiki-device', cloud_profile_id: 'isolated-wiki-profile' });
        const { resolveManagedTargetAttribution } = await import('./core/managed-targets.js');
        return resolveManagedTargetAttribution(await getConfig(), [], 'https://en.wikipedia.org/wiki/Physics');
      });
      expect(fallback.targetClassificationAtTime === 'pending_composite' || fallback.targetClassificationAtTime == null).toBe(true);
      const page = await context.newPage();
      await page.goto('https://en.wikipedia.org/wiki/Physics', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#firstHeading')).toContainText('Physics');
      const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
      await probe.evaluate(async id => {
        const { observeCompositeTab } = await import('./infra/composite-page-observer.js');
        await observeCompositeTab(id);
      }, tabId);
      expect((await read()).composite_page_observations_v1?.rows || []).toHaveLength(0);
      fs.writeFileSync(path.join(directory, 'fallback-evidence.json'), JSON.stringify({
        type: 'real_site_and_unpacked_fallback_only', fallback, observationCount: 0,
        realAccountingAccuracyNotClaimed: true }, null, 2));
      console.log(`Wikipedia fallback evidence: ${directory}`);
      return;
    }
    await probe.evaluate(async () => {
      const { DEFAULT_CONFIG, saveConfig } = await import('./infra/storage.js');
      await saveConfig({ ...DEFAULT_CONFIG, mode: 'composite', compositeList: ['wikipedia.org'],
        compositeReviewConfig: { enabled: false }, isInitialized: true });
      await chrome.storage.local.set({ cloud_device_id: 'isolated-wiki-device', cloud_profile_id: 'isolated-wiki-profile' });
    });
    const page = await context.newPage();
    await page.goto('https://en.wikipedia.org/wiki/Physics', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#firstHeading')).toContainText('Physics');
    expect((await read()).composite_page_observations_v1).toBeUndefined();
    await probe.evaluate(async () => {
      const { getConfig, saveConfig } = await import('./infra/storage.js');
      const config = await getConfig(); config.compositeReviewConfig.enabled = true; await saveConfig(config);
    });
    await page.bringToFront(); await page.mouse.click(15, 15);
    await expect.poll(async () => {
      const { context: current } = await read();
      return current.activation.activated && current.monitoringEnabled !== 0 && current.focused && !current.minimized
        && current.session?.state === 'ACTIVE' && current.session?.domain?.endsWith('wikipedia.org')
        && current.session.tabId === current.activeTab && current.session.windowId === current.activeWindow;
    }, { timeout: 15000 }).toBe(true);
    await expect.poll(async () => (await read()).composite_page_observations_v1?.rows.length || 0).toBeGreaterThan(0);
    await page.waitForTimeout(3000);
    await page.goto('https://en.wikipedia.org/wiki/Mathematics?observation=public-fixture#probe', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#firstHeading')).toContainText('Mathematics');
    await page.evaluate(() => {
      document.title = 'Isolated Mathematics review';
      history.pushState({}, '', '/wiki/Mathematics?observation=second-fixture#second');
    });
    await expect.poll(async () => (await read()).composite_page_observations_v1?.rows.some(
      row => row.page.title === 'Isolated Mathematics review') || false).toBe(true);
    await page.screenshot({ path: path.join(directory, 'wikipedia-real.png') });
    await page.waitForTimeout(3000);
    await page.goto('about:blank');
    await expect.poll(async () => Object.values((await read()).usage_segments_v1 || {}).filter(
      row => row.domain?.endsWith('wikipedia.org') && row.channel === 'active' && row.durationSeconds > 0).length,
    { timeout: 15000 }).toBeGreaterThan(0);
    const observed = await read();
    const rows = observed.composite_page_observations_v1.rows;
    fs.writeFileSync(path.join(directory, 'observed-before-checks.json'), JSON.stringify(observed, null, 2));
    expect(rows.some(row => row.page.path === '/wiki/Physics')).toBe(true);
    expect(rows.some(row => row.page.path === '/wiki/Mathematics')).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('public-fixture');
    expect(JSON.stringify(rows)).not.toContain('second-fixture');
    const segments = Object.values(observed.usage_segments_v1 || {}).filter(row => row.domain?.endsWith('wikipedia.org'));
    expect(segments.length).toBeGreaterThan(0);
    await probe.evaluate(async () => {
      const { getConfig, saveConfig } = await import('./infra/storage.js');
      const config = await getConfig(); config.compositeReviewConfig.enabled = false; await saveConfig(config);
    });
    await expect.poll(async () => (await read()).composite_page_observations_v1 || null).toBe(null);
    const final = await read();
    for (const segment of segments) expect(final.usage_segments_v1[segment.id]).toEqual(segment);
    let attribution = { status: 'pending_canonical_cloud_analysis_export' };
    if (process.env.COMPOSITE_ANALYSIS_TEST_SOURCE) {
      const source = fs.readFileSync(process.env.COMPOSITE_ANALYSIS_TEST_SOURCE, 'utf8');
      const sharedSource = fs.readFileSync('contracts/composite-page-evidence/v1.js', 'utf8');
      const load = (text, imports = {}) => {
        const module = { exports: {} };
        vm.runInNewContext(ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
          { module, exports: module.exports, require: key => { if (!(key in imports)) throw new Error(key); return imports[key]; },
            crypto: webcrypto, URL, Date, TextEncoder });
        return module.exports;
      };
      const api = load(source, { '../../../contracts/composite-page-evidence/v1.js': load(sharedSource) });
      // Device identity is the isolated transport binding, not a rewritten original fact.
      const result = api.attributeCompositePages(segments.map(s => ({ ...s, deviceId: 'isolated-wiki-device' })), rows);
      expect(result.pages.reduce((sum, item) => sum + item.seconds, 0) + result.unassignedSeconds).toBe(result.totalSeconds);
      expect(result.totalSeconds).toBe(segments.filter(s => s.channel === 'active').reduce((sum, s) => sum + s.durationSeconds, 0));
      attribution = { status: 'matched_with_canonical_cloud_test_export', sourceHash: createHash('sha256').update(source).digest('hex'), result };
    }
    await probe.evaluate(async () => {
      const { getConfig, saveConfig } = await import('./infra/storage.js');
      const config = await getConfig();
      config.compositeList = []; config.customCompositeList = [];
      config.defaultCompositeSites = []; config.defaultUserCompositeSites = [];
      config.managedTargetsV1 = []; config.siteClassificationRulesV1 = [];
      config.compositeReviewConfig.enabled = true; await saveConfig(config);
    });
    const fallback = await probe.evaluate(async () => {
      const { getConfig } = await import('./infra/storage.js');
      const { resolveManagedTargetAttribution } = await import('./core/managed-targets.js');
      return resolveManagedTargetAttribution(await getConfig(), [], 'https://en.wikipedia.org/wiki/Physics');
    });
    expect(fallback.targetClassificationAtTime === 'pending_composite' || fallback.targetClassificationAtTime == null).toBe(true);
    await page.goto('https://en.wikipedia.org/wiki/Physics', { waitUntil: 'domcontentloaded' });
    await probe.evaluate(async tabId => {
      const { observeCompositeTab } = await import('./infra/composite-page-observer.js');
      await observeCompositeTab(tabId);
    }, rows[0].tabId);
    expect((await read()).composite_page_observations_v1?.rows || []).toHaveLength(0);
    fs.writeFileSync(path.join(directory, 'evidence.json'), JSON.stringify({ type: 'real_site_and_unpacked',
      rows, segments, attributionConservation: attribution,
      syntheticTitleAndSpa: true, realAccountingAccuracyNotClaimed: true }, null, 2));
    console.log(`Wikipedia real evidence: ${directory}`);
  } finally { await fixture.context.close(); }
});

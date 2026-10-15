const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

async function isolatedExtension(name, harness = '') {
  const testRoot = process.env.TOC_ISOLATED_TEST_ROOT || path.resolve('.tmp');
  fs.mkdirSync(testRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(testRoot, `${name}-`));
  const extension = path.join(directory, 'extension');
  fs.cpSync(path.resolve('extension'), extension, { recursive: true });
  // Harness exists only in an ignored disposable copy, never in the loaded candidate.
  if (harness) fs.appendFileSync(path.join(extension, 'background.js'), '\n' + harness);
  const context = await chromium.launchPersistentContext(path.join(directory, 'profile'), {
    channel: 'chromium', headless: false, timezoneId: 'Asia/Shanghai',
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
      '--autoplay-policy=no-user-gesture-required'],
  });
  const errors = [];
  context.on('weberror', error => errors.push(error.error().message));
  try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const probe = await context.newPage();
  await probe.goto(worker.url().replace('background.js', 'privacy-consent.html'));
  await probe.evaluate(async () => {
    const { acceptPrivacyConsent } = await import('./core/privacy-consent.js');
    await acceptPrivacyConsent('isolated_unpacked_acceptance');
    await chrome.runtime.sendMessage({ type: 'PRIVACY_CONSENT_ACCEPTED', source: 'isolated_unpacked_acceptance' });
  });
  return { context, worker, probe, directory, errors };
  } catch (error) {
    // Diagnose only this disposable extension; never attach to the user's Chrome.
    try {
      const page = await context.newPage();
      await page.goto('chrome://extensions');
      const diagnostics = await page.evaluate(() => {
        const manager = document.querySelector('extensions-manager');
        const list = manager?.shadowRoot?.querySelector('extensions-item-list');
        return [...(list?.shadowRoot?.querySelectorAll('extensions-item') || [])].map(item => ({
          name: item.data?.name, state: item.data?.state,
          runtimeErrors: item.data?.runtimeErrors, manifestErrors: item.data?.manifestErrors,
        }));
      });
      fs.writeFileSync(path.join(directory, 'startup-errors.json'), JSON.stringify({ errors, diagnostics }, null, 2));
    } catch (_) { /* Startup diagnostics must not mask the original failure. */ }
    await context.close();
    throw error;
  }
}

module.exports = { isolatedExtension };

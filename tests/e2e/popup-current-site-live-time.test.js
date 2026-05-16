// Popup current-site live time E2E.
// Run with: npx playwright test tests/e2e/popup-current-site-live-time.test.js --reporter=line

const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const EXT = path.resolve(__dirname, '../..');

async function createContext() {
  const udd = fs.mkdtempSync(path.resolve(__dirname, '../../test-e2e-profile-popup-live-'));
  const ctx = await chromium.launchPersistentContext(udd, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  await sw.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      guardian_config: {
        enabled: true,
        mode: 'study',
        studyList: ['desmos.com'],
        compositeList: [],
        restrictedEntertainmentList: [],
        entertainmentList: [],
      },
      guardian_session: { currentMode: 'study' },
      cloud_profile_id: 'e2e-profile-popup-live',
      cloud_device_id: 'e2e-device-popup-live',
      cloud_device_token: 'e2e-device-token-popup-live',
    });
  });
  return { ctx, sw, udd };
}

async function cleanup(ctx, udd) {
  if (ctx) await ctx.close();
  if (udd && fs.existsSync(udd)) fs.rmSync(udd, { recursive: true, force: true });
}

async function openPopup(ctx, sw) {
  const popupUrl = await sw.evaluate(() => chrome.runtime.getURL('popup/popup.html'));
  const popup = await ctx.newPage();
  await popup.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await popup.waitForFunction(() => typeof window.renderRuntimeStatus === 'function', { timeout: 5000 });
  return popup;
}

async function renderRuntime(popup, status, stats = { 'www.desmos.com': 180 }) {
  await popup.evaluate((context) => {
    // popupStatsContext is declared with let in popup.js, so update it in the
    // page script realm instead of assigning a same-named window property.
    eval(`popupStatsContext = ${JSON.stringify(context)}`);
  }, {
    config: { studyList: ['desmos.com'] },
    stats,
  });
  return await popup.evaluate((status) => {
    window.renderRuntimeStatus(status);
    const compact = document.getElementById('runtime-compact');
    return {
      text: compact ? compact.textContent.replace(/\s+/g, ' ').trim() : '',
      html: compact ? compact.innerHTML : '',
    };
  }, status);
}

test('popup current site shows durable plus live session seconds', async () => {
  const { ctx, sw, udd } = await createContext();
  try {
    const popup = await openPopup(ctx, sw);
    const rendered = await renderRuntime(popup, {
      currentDomain: 'desmos.com',
      currentSessionDurationSeconds: 75,
    });

    expect(rendered.text).toContain('desmos.com');
    expect(rendered.text).toContain('学习网站');
    expect(rendered.text).toContain('今日 4分15秒');
    await popup.close();
  } finally {
    await cleanup(ctx, udd);
  }
});

test('popup current site does not add live seconds for another domain', async () => {
  const { ctx, sw, udd } = await createContext();
  try {
    const popup = await openPopup(ctx, sw);
    const rendered = await renderRuntime(popup, {
      currentDomain: 'desmos.com',
      currentSessionDurationSeconds: 75,
    }, { 'www.desmos.com': 180, 'khanacademy.org': 75 });
    expect(rendered.text).toContain('今日 4分15秒');

    const mismatched = await renderRuntime(popup, {
      currentDomain: 'khanacademy.org',
      currentSessionDurationSeconds: 75,
    }, { 'www.desmos.com': 180 });
    expect(mismatched.text).toContain('khanacademy.org');
    expect(mismatched.text).toContain('今日 1分15秒');
    expect(mismatched.text).not.toContain('今日 4分15秒');
    await popup.close();
  } finally {
    await cleanup(ctx, udd);
  }
});

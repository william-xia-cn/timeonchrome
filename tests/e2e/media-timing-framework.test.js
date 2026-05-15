const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '../..');

async function createContext() {
  const udd = fs.mkdtempSync(path.resolve(__dirname, '../../test-e2e-profile-media-'));
  const ctx = await chromium.launchPersistentContext(udd, {
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`, '--no-sandbox'],
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  await sw.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
    await chrome.storage.local.set({
      guardian_config: {
        mode: 'rest',
        enabled: true,
        profileId: 'e2e-media-profile',
        deviceId: 'e2e-media-device',
      },
      guardian_session: {
        currentMode: 'rest',
        profileId: 'e2e-media-profile',
        deviceId: 'e2e-media-device',
      },
      cloud_profile_id: 'e2e-media-profile',
      cloud_device_id: 'e2e-media-device',
      event_log_v1: [],
      usage_segments_v1: {},
      usage_segments_index_v1: {},
      daily_usage_stats_v1: {},
      media_session_v1: { framework: 'none', domain: null, startTime: null },
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return { ctx, sw, udd };
}

async function sendControlledMedia(sw, cfg) {
  return sw.evaluate(async ({ cfg }) => {
    return globalThis.debugApplyControlledTimingSignal({
      tabId: 1002,
      windowId: 1,
      domain: null,
      isFocused: true,
      isIdle: false,
      isAudible: true,
      isPiP: cfg.pip,
      mediaKind: cfg.mediaKind,
      mediaSourceTabId: 1001,
      mediaSourceDomain: cfg.domain,
      _reason: `e2e_${cfg.framework}_start`,
    });
  }, { cfg });
}

async function settleControlledMedia(sw, cfg) {
  await sendControlledMedia(sw, cfg);
  await new Promise((resolve) => setTimeout(resolve, 5500));
  const opened = await sw.evaluate(() => chrome.storage.local.get('media_session_v1'));
  expect(opened.media_session_v1?.framework).toBe(cfg.framework);
  expect(opened.media_session_v1?.domain).toBe(cfg.domain);

  const now = Date.now();
  await sw.evaluate(async ({ now }) => {
    const data = await chrome.storage.local.get('media_session_v1');
    await chrome.storage.local.set({
      media_session_v1: {
        ...data.media_session_v1,
        startTime: now - 181000,
        lastHeartbeat: now,
      },
    });
  }, { now });

  const checkpoint = await sw.evaluate((checkpointNow) => globalThis.debugRunMediaPeriodicCheckpoint(checkpointNow), now);
  expect(checkpoint.ok).toBeTruthy();
  expect(checkpoint.checkpointed).toBeTruthy();
  expect(checkpoint.framework).toBe(cfg.framework);
  return checkpoint;
}

async function readSegments(sw) {
  return sw.evaluate(() => chrome.storage.local.get(['usage_segments_v1', 'daily_usage_stats_v1', 'media_session_v1']));
}

const scenarios = [
  {
    name: 'background audio',
    framework: 'background_audio',
    channel: 'backgroundMedia',
    sourceState: 'BACKGROUND_ACTIVE',
    mediaKind: 'audio',
    pip: false,
    domain: 'media-audio.example.test',
  },
  {
    name: 'background video',
    framework: 'background_video',
    channel: 'backgroundMedia',
    sourceState: 'BACKGROUND_ACTIVE',
    mediaKind: 'video',
    pip: false,
    domain: 'media-video.example.test',
  },
  {
    name: 'pip video',
    framework: 'pip_video',
    channel: 'pip',
    sourceState: 'PIP_ACTIVE',
    mediaKind: 'video',
    pip: true,
    domain: 'media-pip.example.test',
  },
];

for (const cfg of scenarios) {
  test(`media timing writes ${cfg.name} checkpoint segment`, async () => {
    const { ctx, sw, udd } = await createContext();
    try {
      await settleControlledMedia(sw, cfg);
      const snapshot = await readSegments(sw);
      const segments = Object.values(snapshot.usage_segments_v1 || {});
      const matching = segments.filter((segment) => segment.domain === cfg.domain);
      expect(matching).toHaveLength(1);
      expect(matching[0].framework).toBe(cfg.framework);
      expect(matching[0].channel).toBe(cfg.channel);
      expect(matching[0].sourceState).toBe(cfg.sourceState);
      expect(matching[0].settlementReason).toBe('periodic_checkpoint');
      expect(matching[0].durationSeconds).toBe(180);

      const today = matching[0].date;
      const dailyDomain = snapshot.daily_usage_stats_v1?.[today]?.domains?.[cfg.domain];
      expect(dailyDomain).toBeTruthy();
      if (cfg.channel === 'pip') {
        expect(dailyDomain.pipSeconds).toBeGreaterThanOrEqual(180);
        expect(dailyDomain.activeSeconds || 0).toBe(0);
      } else {
        expect(dailyDomain.backgroundMediaSeconds).toBeGreaterThanOrEqual(180);
        expect(dailyDomain.activeSeconds || 0).toBe(0);
      }
    } finally {
      await ctx.close();
      fs.rmSync(udd, { recursive: true, force: true });
    }
  });
}

test('media timing does not pollute foreground active stats and popup/admin messages respond', async () => {
  const { ctx, sw, udd } = await createContext();
  try {
    await settleControlledMedia(sw, scenarios[0]);

    const segments = await sw.evaluate(async () => {
      const data = await chrome.storage.local.get('usage_segments_v1');
      return Object.values(data.usage_segments_v1 || {});
    });
    const mediaDomainSegments = segments.filter((segment) => segment.domain === scenarios[0].domain);
    expect(mediaDomainSegments.length).toBeGreaterThan(0);
    expect(mediaDomainSegments.every((segment) => segment.channel !== 'active')).toBeTruthy();
    expect(mediaDomainSegments.every((segment) => segment.sourceState !== 'ACTIVE')).toBeTruthy();

    const extensionId = new URL(sw.url()).hostname;
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const stats = await Promise.race([
      page.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_STATS' })),
      new Promise((_, reject) => setTimeout(() => reject(new Error('GET_STATS timeout')), 3000)),
    ]);
    expect(stats).toBeTruthy();

    const flush = await Promise.race([
      page.evaluate(() => chrome.runtime.sendMessage({ type: 'FLUSH_TIME' })),
      new Promise((_, reject) => setTimeout(() => reject(new Error('FLUSH_TIME timeout')), 3000)),
    ]);
    expect(flush).toBeTruthy();
  } finally {
    await ctx.close();
    fs.rmSync(udd, { recursive: true, force: true });
  }
});

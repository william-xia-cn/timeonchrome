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
      media_facts_v1: {},
      media_sessions_v2: {},
      media_segments_v1: {},
      daily_media_stats_v1: {},
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
  await new Promise((resolve) => setTimeout(resolve, 500));
  const opened = await sw.evaluate(() => chrome.storage.local.get('media_session_v1'));
  expect(opened.media_session_v1?.framework).toBe(cfg.framework);
  expect(opened.media_session_v1?.domain).toBe(cfg.domain);

  const now = Date.now();
  await sw.evaluate(async ({ now }) => {
    const data = await chrome.storage.local.get(['media_session_v1', 'media_sessions_v2']);
    const sessions = data.media_sessions_v2 || {};
    for (const key of Object.keys(sessions)) {
      sessions[key] = {
        ...sessions[key],
        startTime: now - 181000,
        startAtMs: now - 181000,
        lastObservedAt: now,
      };
    }
    await chrome.storage.local.set({
      media_sessions_v2: sessions,
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
  return checkpoint;
}

async function readSegments(sw) {
  return sw.evaluate(() => chrome.storage.local.get(['media_segments_v1', 'daily_media_stats_v1', 'media_session_v1', 'usage_segments_v1']));
}

const scenarios = [
  {
    name: 'background audio',
    framework: 'background_audio',
    mediaClass: 'backgroundAudio',
    mediaKind: 'audio',
    pip: false,
    domain: 'media-audio.example.test',
  },
  {
    name: 'background video',
    framework: 'background_video',
    mediaClass: 'backgroundVideo',
    mediaKind: 'video',
    pip: false,
    domain: 'media-video.example.test',
  },
  {
    name: 'pip video',
    framework: 'pip_video',
    mediaClass: 'pip',
    mediaKind: 'video',
    pip: true,
    domain: 'media-pip.example.test',
  },
];

for (const cfg of scenarios) {
  test(`media timing writes ${cfg.name} local checkpoint segment`, async () => {
    const { ctx, sw, udd } = await createContext();
    try {
      await settleControlledMedia(sw, cfg);
      const snapshot = await readSegments(sw);
      const segments = Object.values(snapshot.media_segments_v1 || {});
      const matching = segments.filter((segment) => segment.domain === cfg.domain);
      expect(matching).toHaveLength(1);
      expect(matching[0].mediaClass).toBe(cfg.mediaClass);
      expect(matching[0].settlementReason).toBe('periodic_checkpoint');
      expect(matching[0].durationSeconds).toBe(180);

      const today = matching[0].date;
      const dailyDomain = snapshot.daily_media_stats_v1?.[today]?.domains?.[cfg.domain];
      expect(dailyDomain).toBeTruthy();
      if (cfg.mediaClass === 'pip') {
        expect(dailyDomain.pipSeconds).toBeGreaterThanOrEqual(180);
      } else {
        expect(dailyDomain[`${cfg.mediaClass}Seconds`]).toBeGreaterThanOrEqual(180);
      }
      expect(Object.values(snapshot.usage_segments_v1 || {}).filter((segment) => segment.domain === cfg.domain)).toHaveLength(0);
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

    const mediaSegments = await sw.evaluate(async () => {
      const data = await chrome.storage.local.get(['usage_segments_v1', 'media_segments_v1']);
      return {
        usage: Object.values(data.usage_segments_v1 || {}),
        media: Object.values(data.media_segments_v1 || {}),
      };
    });
    const mediaDomainSegments = mediaSegments.media.filter((segment) => segment.domain === scenarios[0].domain);
    expect(mediaDomainSegments.length).toBeGreaterThan(0);
    expect(mediaDomainSegments.every((segment) => segment.mediaClass === scenarios[0].mediaClass)).toBeTruthy();
    expect(mediaSegments.usage.filter((segment) => segment.domain === scenarios[0].domain)).toHaveLength(0);

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

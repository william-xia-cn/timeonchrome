'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { launchExtensionContext, closeContext } = require('../lib/browser');

async function collectRuntimeMetrics({ userDataDir, allowCloudForceSync = false }) {
  if (!userDataDir) throw new Error('missing userDataDir');
  const profileDir = path.resolve(userDataDir);
  let browserCtx = null;
  try {
    const ctx = await launchExtensionContext(profileDir, false);
    browserCtx = ctx.browserCtx;
    const sw = ctx.sw;
    const extensionId = ctx.extensionId;
    const extensionRoot = ctx.extensionPath || null;
    const swListAtStart = browserCtx.serviceWorkers().map((w) => w.url());
    const swUrl = sw?.url?.() || null;
    const swExtId = swUrl ? (new URL(swUrl).hostname || null) : null;
    const runStartedAt = Date.now();
    const metricsPage = await browserCtx.newPage();
    await metricsPage.goto(`chrome-extension://${extensionId}/admin/admin.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const payload = await sw.evaluate(async ({ allowCloudForceSync }) => {
      const getLocal = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
      const getSession = (keys) => new Promise((resolve) => chrome.storage.session.get(keys, resolve));

      const eventLogObj = await getLocal(['event_log_v1']);
      const sessionObj = await getSession(['session_v1']);
      const localObj = await getLocal(['cloud_device_token', 'cloud_device_id', 'cloud_profile_id', 'guardian_config', 'guardian_session']);
      return { eventLogObj, sessionObj, localObj };
    }, { allowCloudForceSync });

    const messageResults = await metricsPage.evaluate(async ({ allowCloudForceSync }) => {
      const send = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, (resp) => resolve(resp)));
      const manifest = chrome.runtime.getManifest();
      const runtimeIdentity = {
        runtimeId: chrome.runtime.id,
        manifestName: manifest?.name || null,
        manifestVersion: manifest?.version || null,
        manifestManifestVersion: manifest?.manifest_version || null,
        runtimeBaseUrl: chrome.runtime.getURL(''),
      };

      const files = ['background.js', 'message-router.js', 'infra/cloud-sync.js'];
      const sourceChecks = {};
      for (const file of files) {
        try {
          const text = await fetch(chrome.runtime.getURL(file)).then((r) => r.text());
          const sha256 = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then((buf) =>
            Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
          );
          sourceChecks[file] = {
            length: text.length,
            sha256,
            hasGetTimelineSegments: text.includes('GET_TIMELINE_SEGMENTS'),
            hasGetCloudStatus: text.includes('GET_CLOUD_STATUS'),
            hasV1Sync: text.includes('v1Sync'),
            hasStatsFoundationV1SyncEnabled: text.includes('statsFoundationV1SyncEnabled'),
          };
        } catch (err) {
          sourceChecks[file] = { error: String(err?.message || err) };
        }
      }

      const probes = [
        { label: 'GET_CONFIG', msg: { type: 'GET_CONFIG' } },
        { label: 'GET_STATS', msg: { type: 'GET_STATS' } },
        { label: 'GET_STATS_RANGE', msg: { type: 'GET_STATS_RANGE', days: 7 } },
        { label: 'GET_TIMELINE_SEGMENTS', msg: { type: 'GET_TIMELINE_SEGMENTS' } },
        { label: 'GET_CLOUD_STATUS', msg: { type: 'GET_CLOUD_STATUS' } },
        { label: 'GET_RUNTIME_MODE_STATUS', msg: { type: 'GET_RUNTIME_MODE_STATUS' } },
        { label: 'DEBUG_GET_TODAY_STATS', msg: { type: 'DEBUG_GET_TODAY_STATS' } },
      ];
      const probeResults = {};
      for (const probe of probes) {
        try {
          const resp = await send(probe.msg);
          probeResults[probe.label] = {
            jsType: typeof resp,
            isArray: Array.isArray(resp),
            keys: resp && typeof resp === 'object' ? Object.keys(resp) : null,
            error: resp?.error ?? null,
            value: resp ?? null,
          };
        } catch (err) {
          probeResults[probe.label] = {
            jsType: 'throw',
            isArray: false,
            keys: null,
            error: String(err?.message || err),
            value: null,
          };
        }
      }

      const getStats = probeResults.GET_STATS?.value ?? null;
      const getStatsRange = probeResults.GET_STATS_RANGE?.value ?? null;
      const getTimeline = probeResults.GET_TIMELINE_SEGMENTS?.value ?? null;
      const cloudStatus = probeResults.GET_CLOUD_STATUS?.value ?? null;

      let cloudForceSync = {
        status: 'SKIP_BY_POLICY',
        reason: 'skipped by policy to avoid Cloud/D1 writes',
      };
      if (allowCloudForceSync) {
        const resp = await send({ type: 'CLOUD_FORCE_SYNC' });
        cloudForceSync = { status: 'EXECUTED', response: resp || null };
      }
      return { runtimeIdentity, sourceChecks, probeResults, getStats, getStatsRange, getTimeline, cloudStatus, cloudForceSync };
    }, { allowCloudForceSync });

    const swRuntimeBasics = await sw.evaluate(async () => {
      return {
        runtimeId: chrome.runtime.id,
        manifest: chrome.runtime.getManifest(),
        swNow: Date.now(),
      };
    }).catch((err) => ({ error: String(err?.message || err) }));

    const cdp = await browserCtx.newCDPSession(metricsPage);
    const targetInfo = await cdp.send('Target.getTargets').catch(() => ({ targetInfos: [] }));
    const cdpTargets = Array.isArray(targetInfo?.targetInfos)
      ? targetInfo.targetInfos.map((t) => {
        let extensionId = null;
        try {
          extensionId = t?.url && String(t.url).startsWith('chrome-extension://') ? new URL(t.url).hostname : null;
        } catch (_) {}
        return {
          type: t?.type || null,
          url: t?.url || null,
          extensionId,
          title: t?.title || null,
        };
      })
      : [];

    const eventLog = payload.eventLogObj?.event_log_v1 || [];
    const session = payload.sessionObj?.session_v1 || null;
    const getStats = messageResults.getStats;
    const getStatsRange = messageResults.getStatsRange;
    const getTimeline = messageResults.getTimeline;
    const cloudStatus = messageResults.cloudStatus;
    const cloudForceSync = messageResults.cloudForceSync;

    const timelineSummary = {
      jsType: typeof getTimeline,
      isArray: Array.isArray(getTimeline),
      keys: getTimeline && typeof getTimeline === 'object' ? Object.keys(getTimeline) : null,
      hasSegmentsArray: Array.isArray(getTimeline?.segments),
      error: getTimeline?.error ?? null,
    };
    const timelineSegments = Array.isArray(getTimeline)
      ? getTimeline
      : (Array.isArray(getTimeline?.segments) ? getTimeline.segments : null);
    const cloudStatusSummary = {
      jsType: typeof cloudStatus,
      isObject: !!cloudStatus && typeof cloudStatus === 'object',
      keys: cloudStatus && typeof cloudStatus === 'object' ? Object.keys(cloudStatus) : null,
      hasV1SyncField: !!cloudStatus && Object.prototype.hasOwnProperty.call(cloudStatus, 'v1Sync'),
      error: cloudStatus?.error ?? null,
    };
    const localSourceChecks = {};
    for (const rel of ['message-router.js', path.join('infra', 'cloud-sync.js'), 'background.js']) {
      const abs = path.join(process.cwd(), rel);
      try {
        const txt = fs.readFileSync(abs, 'utf-8');
        localSourceChecks[rel.replace(/\\/g, '/')] = {
          length: txt.length,
          sha256: crypto.createHash('sha256').update(txt).digest('hex'),
        };
      } catch (err) {
        localSourceChecks[rel.replace(/\\/g, '/')] = { error: String(err?.message || err) };
      }
    }

    const timeOnChromeServiceWorkerTargets = cdpTargets.filter((t) =>
      t.type === 'service_worker' && t.extensionId === messageResults.runtimeIdentity?.runtimeId
    );
    const swReloadActivation = {
      extensionRoot,
      launchStartedAt: ctx.launchStartedAt || null,
      swObservedAt: ctx.swObservedAt || null,
      runStartedAt,
      activeServiceWorkerTargetUrl: swUrl,
      activeServiceWorkerExtensionId: swExtId,
      criteria: {
        singleTimeOnChromeServiceWorkerTarget: timeOnChromeServiceWorkerTargets.length === 1,
        targetBelongsToRuntimeId: swExtId === messageResults.runtimeIdentity?.runtimeId,
        swObservedAfterLaunchStart: Number(ctx.swObservedAt || 0) >= Number(ctx.launchStartedAt || 0),
        swRuntimeIdMatches: swRuntimeBasics?.runtimeId === messageResults.runtimeIdentity?.runtimeId,
        swRuntimeEvalReadable: !swRuntimeBasics?.error,
      },
    };
    swReloadActivation.allPassed = Object.values(swReloadActivation.criteria).every(Boolean);

    const preflight = {
      GET_CONFIG: messageResults.probeResults?.GET_CONFIG || null,
      GET_STATS: messageResults.probeResults?.GET_STATS || null,
      GET_TIMELINE_SEGMENTS: messageResults.probeResults?.GET_TIMELINE_SEGMENTS || null,
      GET_RUNTIME_MODE_STATUS: messageResults.probeResults?.GET_RUNTIME_MODE_STATUS || null,
      GET_CLOUD_STATUS: messageResults.probeResults?.GET_CLOUD_STATUS || null,
    };
    const hasUnknownTimeline = String(preflight.GET_TIMELINE_SEGMENTS?.error || '') === 'Unknown message type';
    const hasUnknownRuntimeMode = String(preflight.GET_RUNTIME_MODE_STATUS?.error || '') === 'Unknown message type';
    const hasMissingV1Sync = !cloudStatusSummary.hasV1SyncField;

    let dispatchStatus = 'PASS';
    if (!swReloadActivation.allPassed && (hasUnknownTimeline || hasUnknownRuntimeMode || hasMissingV1Sync)) {
      dispatchStatus = 'BLOCKED_STALE_SW_INSTANCE';
    } else if (swReloadActivation.allPassed && (hasUnknownTimeline || hasUnknownRuntimeMode)) {
      dispatchStatus = 'FAIL_MESSAGE_DISPATCH';
    } else if (swReloadActivation.allPassed && hasMissingV1Sync) {
      dispatchStatus = 'FAIL_CLOUD_STATUS_SHAPE';
    }

    const finalPayload = {
      meta: {
        timestamp: new Date().toISOString(),
        scenario: 'runtime-metrics',
        noCloudWrite: !allowCloudForceSync,
      },
      gateProfile: {
        userDataDir: null,
        sourceProfileDir: path.resolve('tests/test-results/sleep-wake-gate/bound-profile'),
        deviceTokenPresent: typeof payload.localObj.cloud_device_token === 'string' && payload.localObj.cloud_device_token.length > 0,
        cloudDeviceTokenMasked: typeof payload.localObj.cloud_device_token === 'string' && payload.localObj.cloud_device_token.length > 8
          ? `${payload.localObj.cloud_device_token.slice(0, 4)}***${payload.localObj.cloud_device_token.slice(-4)}`
          : null,
        cloudDeviceIdPresent: typeof payload.localObj.cloud_device_id === 'string' && payload.localObj.cloud_device_id.length > 0,
        profileIdPresent: typeof payload.localObj.cloud_profile_id === 'string' && payload.localObj.cloud_profile_id.length > 0,
        mode: payload.localObj?.guardian_session?.currentMode || payload.localObj?.guardian_config?.mode || null,
      },
      extensionLoad: {
        extensionRoot,
        runtimeId: messageResults.runtimeIdentity?.runtimeId || null,
        manifestName: messageResults.runtimeIdentity?.manifestName || null,
        manifestVersion: messageResults.runtimeIdentity?.manifestVersion || null,
        manifestManifestVersion: messageResults.runtimeIdentity?.manifestManifestVersion || null,
      },
      runtimeIdentity: messageResults.runtimeIdentity || null,
      activeServiceWorker: {
        runStartedAt,
        activeServiceWorkerTargetUrl: swUrl,
        activeServiceWorkerExtensionId: swExtId,
        activeServiceWorkerScriptUrl: swUrl,
        belongsToCurrentRuntimeId: swExtId === messageResults.runtimeIdentity?.runtimeId,
        serviceWorkersAtStart: swListAtStart,
        serviceWorkersAtStartCount: swListAtStart.length,
      },
      sourceChecks: messageResults.sourceChecks || {},
      localSourceChecks,
      swRuntimeBasics,
      cdpTargets,
      swReloadActivation,
      routePreflight: preflight,
      dispatchStatus,
      routeProbes: messageResults.probeResults || {},
      checks: {
        event_log_v1_readable: Array.isArray(eventLog),
        session_v1_readable: session === null || typeof session === 'object',
        local_stats_readable: !!(getStats && typeof getStats === 'object'),
        get_stats_readable: !!(getStats && typeof getStats === 'object'),
        get_stats_range_readable: !!(getStatsRange && typeof getStatsRange === 'object'),
        get_timeline_segments_readable: !!timelineSegments,
        v1_sync_readable: !!(cloudStatus && typeof cloudStatus === 'object' && Object.prototype.hasOwnProperty.call(cloudStatus, 'v1Sync')),
      },
      diagnostics: {
        timelineSegmentsStatus: timelineSegments
          ? 'ARRAY_OK'
          : (timelineSummary.error ? `ERROR_${timelineSummary.error}` : 'NON_ARRAY_RESPONSE'),
        v1SyncStatus: cloudStatusSummary.hasV1SyncField
          ? 'FIELD_PRESENT'
          : (cloudStatusSummary.error ? `ERROR_${cloudStatusSummary.error}` : 'FIELD_MISSING'),
        dispatchStatus,
      },
      samples: {
        eventLogCount: Array.isArray(eventLog) ? eventLog.length : -1,
        session,
        getStats,
        getStatsRangeKeys: getStatsRange && typeof getStatsRange === 'object' ? Object.keys(getStatsRange) : [],
        timelineCount: timelineSegments ? timelineSegments.length : -1,
        timelineRawSummary: timelineSummary,
        cloudStatus,
        cloudStatusSummary,
        cloudForceSync,
      },
    };

    await metricsPage.close();
    const swListAtEnd = browserCtx.serviceWorkers().map((w) => w.url());
    finalPayload.activeServiceWorker.serviceWorkersAtEnd = swListAtEnd;
    finalPayload.activeServiceWorker.serviceWorkersAtEndCount = swListAtEnd.length;
    finalPayload.activeServiceWorker.wasReactivatedDuringRun = swListAtEnd.some((u) => u !== swUrl);
    finalPayload.activeServiceWorker.timeOnChromeTargets = swListAtEnd
      .filter((u) => String(u).startsWith('chrome-extension://'))
      .map((u) => {
        const id = new URL(u).hostname;
        return { type: 'service_worker', url: u, extensionId: id, title: null };
      });

    finalPayload.gateProfile.userDataDir = profileDir;
    return finalPayload;
  } finally {
    if (browserCtx) await closeContext(browserCtx, profileDir, false);
  }
}

module.exports = { collectRuntimeMetrics };

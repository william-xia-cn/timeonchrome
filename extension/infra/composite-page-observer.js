import { runStorageMutation } from './storage-budget.js';
import { resolveManagedTargetAttribution } from '../core/managed-targets.js';
import {
  compositeSiteIdentity, sanitizeCompositePage, hashPageEvidence,
  PAGE_EVIDENCE_TTL_MS, PAGE_EVIDENCE_MAX_BYTES,
} from '../core/generated/composite-page-evidence-v1.js';

export const COMPOSITE_PAGE_KEY = 'composite_page_observations_v1';
const ALARM = 'compositePageObservation';
const emptyState = () => ({ rows: [], dropped: 0, droppedBefore: 0, coverageStart: Date.now(), frozen: {} });
const byteSize = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

export function trimCompositeObservations(state, now) {
  const value = { ...emptyState(), ...state, rows: [...(state?.rows || [])], frozen: { ...(state?.frozen || {}) } };
  for (const [key, batch] of Object.entries(value.frozen)) if (batch.cutoff < now - PAGE_EVIDENCE_TTL_MS) delete value.frozen[key];
  while (value.rows.length && (value.rows[0].lastObservedAt < now - PAGE_EVIDENCE_TTL_MS || byteSize(value.rows) > PAGE_EVIDENCE_MAX_BYTES / 2 || byteSize(value) > PAGE_EVIDENCE_MAX_BYTES)) {
    const row = value.rows.shift(); value.dropped = Math.min(1000000, value.dropped + 1);
    value.droppedBefore = Math.max(value.droppedBefore, row.lastObservedAt);
  }
  if (byteSize(value) > PAGE_EVIDENCE_MAX_BYTES) { value.frozen = {}; value.droppedBefore = now; }
  return value;
}

async function mutate(task) {
  return runStorageMutation(async (storage) => {
    const data = await storage.get([COMPOSITE_PAGE_KEY, 'guardian_config', 'cloud_device_id', 'cloud_profile_id']);
    if (data.guardian_config?.compositeReviewConfig?.enabled !== true) {
      await storage.remove(COMPOSITE_PAGE_KEY); return { skipped: true };
    }
    const state = trimCompositeObservations(data[COMPOSITE_PAGE_KEY], Date.now());
    const result = await task(state, data);
    await storage.set({ [COMPOSITE_PAGE_KEY]: trimCompositeObservations(state, Date.now()) }, { priority: 'diagnostic' });
    return result;
  }, { priority: 'diagnostic' });
}

export async function observeCompositeTab(tabId, { title, documentId = null, expectedUrl = null, navigation = false, removed = false } = {}) {
  const at = Date.now();
  let tab = null;
  if (!removed) { try { tab = await chrome.tabs.get(tabId); } catch { return { skipped: true }; } }
  if (expectedUrl && tab?.url !== expectedUrl) return { skipped: true };
  return mutate((state, data) => {
    if (!data.cloud_device_id || !data.cloud_profile_id) return { skipped: true };
    const open = state.rows.findLast((r) => r.tabId === tabId && r.endMs == null);
    if (open && open.lastObservedAt > at) return { skipped: true };
    const target = tab?.url ? resolveManagedTargetAttribution(data.guardian_config, [], tab.url) : null;
    const site = target?.targetClassificationAtTime === 'composite' ? compositeSiteIdentity(target.managedTargetValue) : null;
    const page = !tab?.incognito && site ? sanitizeCompositePage(tab.url, title ?? tab.title) : null;
    if (open && (navigation || removed || !page || open.page.host !== page.host || open.page.path !== page.path || open.page.title !== page.title || open.windowId !== tab.windowId || at - open.lastObservedAt > 90000)) {
      open.endMs = Math.min(at, open.lastObservedAt + 90000);
    }
    if (!page) return { skipped: true };
    if (open && open.endMs == null) {
      open.lastObservedAt = at; open.page.title = page.title; return { observed: true };
    }
    state.rows.push({ id: crypto.randomUUID(), profileId: data.cloud_profile_id, deviceId: data.cloud_device_id,
      tabId, windowId: tab.windowId, documentId, site, page, startMs: at, lastObservedAt: at, endMs: null });
    return { observed: true };
  }).catch(() => ({ skipped: true }));
}

async function sampleTabs() {
  const data = await chrome.storage.local.get('guardian_config');
  if (data.guardian_config?.compositeReviewConfig?.enabled !== true) {
    await runStorageMutation((storage) => storage.remove(COMPOSITE_PAGE_KEY), { priority: 'diagnostic' }); return;
  }
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) await observeCompositeTab(tab.id);
}

export function initCompositePageObserver() {
  const safeSample = () => { void sampleTabs().catch(() => {}); };
  chrome.webNavigation.onCommitted.addListener((event) => {
    if (event.frameId === 0) void observeCompositeTab(event.tabId, { navigation: true, documentId: event.documentId, expectedUrl: event.url });
  });
  chrome.webNavigation.onHistoryStateUpdated?.addListener((event) => {
    if (event.frameId === 0) void observeCompositeTab(event.tabId, { navigation: true, documentId: event.documentId, expectedUrl: event.url });
  });
  chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (change.title || change.url) void observeCompositeTab(tabId, { title: change.title, navigation: !!change.url, expectedUrl: change.url });
  });
  chrome.tabs.onRemoved.addListener((tabId) => { void observeCompositeTab(tabId, { removed: true }); });
  chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === ALARM) safeSample(); });
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg.type === 'TITLE_CHANGE' && sender.frameId === 0 && sender.tab?.id != null && !sender.tab.incognito) {
      void observeCompositeTab(sender.tab.id, { title: msg.title, documentId: sender.documentId, expectedUrl: sender.url });
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    const enabledChanged = changes.guardian_config &&
      changes.guardian_config.oldValue?.compositeReviewConfig?.enabled !== changes.guardian_config.newValue?.compositeReviewConfig?.enabled;
    if (area === 'local' && (enabledChanged || changes.cloud_profile_id || changes.cloud_device_id)) {
      void runStorageMutation((storage) => storage.remove(COMPOSITE_PAGE_KEY), { priority: 'diagnostic' }).then(safeSample).catch(() => {});
    }
  });
  // A restarted worker cannot prove that old tab IDs still identify the same document.
  void mutate((state) => { for (const row of state.rows) if (row.endMs == null) row.endMs = row.lastObservedAt; })
    .then(safeSample).catch(() => {});
  void Promise.resolve(chrome.alarms.create(ALARM, { periodInMinutes: 1 })).catch(() => {});
}

export async function syncCompositePageEvidence(request) {
  const authorization = await request('GET', '/device/composite-reviews/v1');
  for (const item of authorization.requests || []) {
    let frozen;
    await mutate(async (state, data) => {
      if (data.cloud_profile_id !== item.profileId || data.cloud_device_id !== item.deviceId) return;
      frozen = state.frozen[item.id];
      if (!frozen || frozen.cutoff !== item.cutoff) {
        const rows = state.rows.filter((r) => r.site === item.site && r.startMs < item.cutoff && (r.endMs ?? r.lastObservedAt + 90000) > item.dayStart)
          .map((r) => ({ ...r, startMs: Math.max(r.startMs, item.dayStart), lastObservedAt: Math.min(r.lastObservedAt, item.cutoff), endMs: Math.min(r.endMs ?? r.lastObservedAt + 90000, item.cutoff) }));
        let complete = state.droppedBefore < item.dayStart && state.coverageStart <= item.dayStart;
        while (rows.length && byteSize(rows) > PAGE_EVIDENCE_MAX_BYTES / 2 - 4096) { rows.shift(); complete = false; }
        frozen = { cutoff: item.cutoff, rows, complete, hash: await hashPageEvidence(rows) };
        // Keep only one full frozen payload, bounded by the same diagnostic budget.
        state.frozen = { [item.id]: frozen };
      }
    });
    if (!frozen) continue;
    const chunks = Math.max(1, Math.ceil(frozen.rows.length / 200));
    for (let index = 0; index < chunks; index++) {
      const response = await request('POST', '/device/composite-reviews/v1', {
        requestId: item.id, cutoff: item.cutoff, count: frozen.rows.length, chunks, index,
        hash: frozen.hash, complete: frozen.complete, rows: frozen.rows.slice(index * 200, (index + 1) * 200),
      });
      if (response.index !== index || response.hash !== frozen.hash) throw new Error('COMPOSITE_EVIDENCE_ACK_MISMATCH');
    }
  }
}

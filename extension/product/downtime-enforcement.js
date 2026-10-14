import { readDowntimeConfig, evaluateWebsiteDowntime } from '../core/downtime.js';

export const DOWNTIME_CHECK_ALARM = 'downtime_check';
export const DOWNTIME_BOUNDARY_ALARM = 'downtime_boundary';

export function createDowntimeEnforcement({ api, getConfig, getRecords, classify, recheck,
  allowed, configKey, recordsKey, specialTargets = () => [], now = () => Date.now(), onError = () => {} }) {
  let pending = null;
  let requested = false;
  let lastErrorAt = null;

  function blocked(config, records, tab) {
    if (!config?.enabled || !/^https?:\/\//i.test(tab?.url || '')) return false;
    const policy = readDowntimeConfig(config.downtimeConfig);
    if (!policy.ok) return false;
    const classification = classify(config, records, { url: tab.url, specialSiteTargets: specialTargets(tab.id, tab.url) }).classification;
    const type = classification === 'rejected' ? 'restricted' : classification;
    return evaluateWebsiteDowntime(policy.config, type, now()).blocked === true;
  }

  async function check() {
    const config = await getConfig();
    const policy = readDowntimeConfig(config?.downtimeConfig);
    const status = policy.ok ? evaluateWebsiteDowntime(policy.config, null, now()) : null;
    await api.alarms.clear(DOWNTIME_BOUNDARY_ALARM);
    if (config?.enabled && status?.nextChangeAtMs > now()) {
      await api.alarms.create(DOWNTIME_BOUNDARY_ALARM, { when: status.nextChangeAtMs });
    }
    if (!status?.active || !config?.enabled || !await allowed()) return;
    const records = await getRecords();
    const tabs = await api.tabs.query({});
    for (const tab of tabs) {
      if (!blocked(config, records, tab)) continue;
      // A tab may navigate and a parent may disable the policy during the scan.
      const current = await api.tabs.get(tab.id).catch(() => null);
      if (!current || current.url !== tab.url || current.windowId !== tab.windowId) continue;
      const latest = await getConfig();
      const latestRecords = await getRecords();
      if (!await allowed() || !blocked(latest, latestRecords, current)) continue;
      await recheck(current.id, { source: 'downtime_recheck', expectedUrl: current.url,
        expectedWindowId: current.windowId, downtimeOnly: true });
    }
  }

  function refresh() {
    requested = true;
    if (!pending) {
      pending = (async () => {
        do {
          requested = false;
          try { await check(); } catch {
            if (lastErrorAt === null || now() - lastErrorAt >= 30 * 60_000) {
              lastErrorAt = now();
              onError('downtime_check_failed');
            }
          }
        } while (requested);
      })().finally(() => { pending = null; });
    }
    return pending;
  }

  function register() {
    api.alarms.onAlarm.addListener(alarm => {
      if ([DOWNTIME_CHECK_ALARM, DOWNTIME_BOUNDARY_ALARM].includes(alarm.name)) return refresh();
    });
    api.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes[configKey] || (recordsKey && changes[recordsKey]))) return refresh();
    });
  }

  async function start() {
    await api.alarms.create(DOWNTIME_CHECK_ALARM, { periodInMinutes: 1 });
    return refresh();
  }
  return { register, start, refresh };
}
